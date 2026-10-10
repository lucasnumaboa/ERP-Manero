"""
Correção dos travamentos do ERP AutoPost com IA (Configurações › AutoPost: travamentos › Ver detalhes, só admin).

O admin pede a análise de um travamento. A IA (DeepSeek, direto) lê o que o robô tentava fazer, o passo a passo, a
página e o código do AutoPost (do GitHub, no commit atual da branch principal) e propõe trechos para trocar. O admin
aprova ou rejeita dizendo o que quer; cada pedido é uma "rodada" guardada em autopost_correcoes, e as rejeições
voltam para a IA na rodada seguinte.

Aprovada, a rodada fica para o construtor do servidor Windows (scripts/construtor_autopost.py), que aplica no
código, sobe a versão, gera o .exe, faz o commit no GitHub e publica na página Softwares, escrevendo o andamento aqui.
"""
import json
import os
import re
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from database import get_db_cursor
from models import UserInDB
from routers.autopost_diagnosticos import somente_admin
from routers.ia import deepseek_requisicao

router = APIRouter()

REPO = os.getenv("AUTOPOST_REPO", "lucasnumaboa/ERP-Manero")
BRANCH = os.getenv("AUTOPOST_BRANCH", "main")
ARQUIVOS_COMUNS = ("autopost/plataformas/base.py", "autopost/navegador.py", "autopost/tarefas.py")
ARQUIVO_DO_SITE = {"olx": "autopost/plataformas/olx.py", "facebook": "autopost/plataformas/facebook.py"}
LIMITE_LOG, LIMITE_PAGINA, LIMITE_HTML = 12_000, 30_000, 40_000
TENTATIVAS_DE_AJUSTE = 2          # proposta com trecho que não existe no código: a IA refaz até 2 vezes
EM_ANDAMENTO = ("analisando", "aprovada", "aplicando", "gerando")

INSTRUCOES = """Você é um programador Python sênior que mantém o ERP AutoPost, um app que publica anúncios no Facebook
Marketplace e na OLX controlando o Chrome com Selenium (undetected-chromedriver). O app travou e mandou um diagnóstico:
o que tentava fazer, o passo a passo (log), a estrutura visível da página (JSON) e um trecho do HTML.

Descubra por que o robô travou e proponha a MENOR correção no código que resolva, sem mudar o que não tem relação.
Responda SOMENTE com um objeto JSON, sem texto fora dele, neste formato:
{
  "diagnostico": "o que aconteceu, em português simples, para o dono do sistema",
  "causa": "o motivo no código (função/trecho) e o que a página mostrava",
  "solucao": "o que a correção faz, em uma ou duas frases",
  "alteracoes": [
    {"arquivo": "autopost/plataformas/olx.py", "buscar": "trecho EXATO que existe hoje no arquivo",
     "substituir": "trecho novo", "motivo": "por que mudar este trecho"}
  ]
}
Regras das alterações:
- "arquivo" tem que ser um dos arquivos enviados.
- "buscar" é copiado do código enviado caractere por caractere (mesma indentação) e precisa aparecer UMA ÚNICA vez no
  arquivo: inclua linhas vizinhas se precisar para ficar único. Não use "..." nem resuma.
- "substituir" é o trecho completo que entra no lugar, com a indentação certa e Python válido.
- Não mexa na versão do app (o servidor sobe a versão sozinho).
Escreva os textos em português."""


class PedidoAnalise(BaseModel):
    instrucao: Optional[str] = Field(None, max_length=4000, description="o que a IA deve considerar nesta análise")


class Rejeicao(BaseModel):
    instrucao: str = Field(..., min_length=3, max_length=4000, description="o que a IA deve fazer diferente")


def _rodada(r: dict) -> dict:
    for campo in ("analise", "alteracoes"):
        if r.get(campo):
            try:
                r[campo] = json.loads(r[campo])
            except ValueError:
                pass
    for campo in ("data_criacao", "data_atualizacao"):
        if r.get(campo):
            r[campo] = r[campo].isoformat()
    return r


def _buscar_rodada(rodada_id: int) -> dict:
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM autopost_correcoes WHERE id = %s", (rodada_id,))
        r = cursor.fetchone()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rodada de correção não encontrada")
    return r


def _atualizar(rodada_id: int, **campos):
    colunas = ", ".join(f"{c} = %s" for c in campos)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(f"UPDATE autopost_correcoes SET {colunas} WHERE id = %s", (*campos.values(), rodada_id))


def _nova_rodada(diagnostico_id: int, instrucao: Optional[str], usuario_id: int) -> int:
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM autopost_diagnosticos WHERE id = %s", (diagnostico_id,))
        if not cursor.fetchone():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Travamento não encontrado")
        cursor.execute("SELECT status FROM autopost_correcoes WHERE diagnostico_id = %s ORDER BY rodada DESC LIMIT 1",
                       (diagnostico_id,))
        ultima = cursor.fetchone()
        if ultima and ultima["status"] in EM_ANDAMENTO:
            raise HTTPException(status.HTTP_409_CONFLICT, "Já tem uma análise ou publicação em andamento para este travamento.")
        cursor.execute("SELECT COALESCE(MAX(rodada), 0) + 1 AS n FROM autopost_correcoes WHERE diagnostico_id = %s",
                       (diagnostico_id,))
        numero = cursor.fetchone()["n"]
        cursor.execute("INSERT INTO autopost_correcoes (diagnostico_id, rodada, status, instrucao, usuario_id) "
                       "VALUES (%s, %s, 'analisando', %s, %s)", (diagnostico_id, numero, instrucao or None, usuario_id))
        return cursor.lastrowid


# ---------- código do AutoPost (GitHub) ----------

async def _buscar_codigo(plataforma: str) -> tuple[str, dict]:
    """Commit atual da branch e os arquivos que a IA recebe. Lê pelo commit (não pela branch) porque o endereço da
    branch passa pelo cache do GitHub e podia trazer o código de antes da última correção."""
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "erp-maneiro"}) as cliente:
        r = await cliente.get(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}")
        commit = r.json().get("sha") if r.status_code == 200 else None
        ref = commit or BRANCH
        arquivos = {}
        for caminho in (ARQUIVO_DO_SITE.get(plataforma, ARQUIVO_DO_SITE["olx"]), *ARQUIVOS_COMUNS):
            r = await cliente.get(f"https://raw.githubusercontent.com/{REPO}/{ref}/{caminho}")
            if r.status_code != 200:
                raise RuntimeError(f"não consegui ler {caminho} no GitHub ({r.status_code})")
            arquivos[caminho] = r.text.replace("\r\n", "\n")
    return commit, arquivos


# ---------- IA ----------

async def _chamar_ia(mensagens: list) -> str:
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('apikey_deepseek', 'model_deepseek', 'ia_think')")
        cfg = {c["chave"]: c["valor"] for c in cursor.fetchall()}
    url, cabecalhos, base = deepseek_requisicao(cfg)
    corpo = {**base, "messages": mensagens, "stream": False, "max_tokens": 16000, "response_format": {"type": "json_object"}}
    async with httpx.AsyncClient(timeout=300.0) as cliente:
        r = await cliente.post(url, headers=cabecalhos, content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
    if r.status_code != 200:
        raise RuntimeError(f"a DeepSeek respondeu {r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"].get("content") or ""


def _ler_json(texto: str) -> dict:
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto)
    dados = json.loads(texto)
    if not isinstance(dados, dict):
        raise ValueError("a resposta não é um objeto JSON")
    return dados


def validar_alteracoes(alteracoes, arquivos: dict) -> list:
    """Cada alteração precisa apontar para um arquivo enviado e um trecho que exista uma única vez nele."""
    if not isinstance(alteracoes, list) or not alteracoes:
        return ["nenhuma alteração proposta"]
    problemas = []
    for i, a in enumerate(alteracoes, 1):
        if not isinstance(a, dict):
            problemas.append(f"alteração {i}: formato inválido")
            continue
        arquivo, buscar, substituir = a.get("arquivo"), a.get("buscar"), a.get("substituir")
        if arquivo not in arquivos:
            problemas.append(f"alteração {i}: o arquivo {arquivo!r} não é um dos arquivos enviados")
        elif not isinstance(buscar, str) or not buscar.strip():
            problemas.append(f"alteração {i}: 'buscar' vazio")
        elif not isinstance(substituir, str):
            problemas.append(f"alteração {i}: 'substituir' ausente")
        elif buscar == substituir:
            problemas.append(f"alteração {i}: 'buscar' e 'substituir' são iguais")
        else:
            vezes = arquivos[arquivo].count(buscar)
            if vezes != 1:
                problemas.append(f"alteração {i}: o trecho 'buscar' aparece {vezes} vez(es) em {arquivo}; "
                                 "precisa aparecer exatamente 1 (copie do código, com linhas vizinhas se precisar)")
    return problemas


def _contexto(diag: dict, arquivos: dict) -> str:
    pagina = diag.get("pagina_json") or ""
    partes = [
        f"## Travamento #{diag['id']} ({diag['plataforma']}, app {diag.get('versao_app') or '?'})",
        f"Ação: {diag['acao']}",
        f"Erro: {diag.get('erro') or '(nenhum)'}",
        f"Produto: {diag.get('titulo') or '(nenhum)'}",
        f"Página: {diag.get('url') or '(sem endereço)'}",
        "### Passo a passo (fim do log)", (diag.get("log_texto") or "(sem log)")[-LIMITE_LOG:],
        "### Estrutura visível da página (JSON)", pagina[:LIMITE_PAGINA] or "(sem JSON)",
        "### HTML da página (trecho)", (diag.get("html") or "(sem HTML)")[:LIMITE_HTML],
        "## Código atual do AutoPost",
    ]
    for caminho, conteudo in arquivos.items():
        partes += [f"### {caminho}", "```python", conteudo, "```"]
    return "\n".join(partes)


async def analisar_rodada(rodada_id: int):
    """Roda em segundo plano: monta o contexto, chama a IA, confere as alterações e grava a proposta."""
    try:
        rodada = _buscar_rodada(rodada_id)
        with get_db_cursor() as cursor:
            cursor.execute("SELECT * FROM autopost_diagnosticos WHERE id = %s", (rodada["diagnostico_id"],))
            diag = cursor.fetchone()
            cursor.execute("SELECT rodada, instrucao, analise, alteracoes FROM autopost_correcoes "
                           "WHERE diagnostico_id = %s AND rodada <= %s ORDER BY rodada",
                           (rodada["diagnostico_id"], rodada["rodada"]))
            historico = cursor.fetchall()
        commit, arquivos = await _buscar_codigo(diag["plataforma"])

        mensagens = [{"role": "system", "content": INSTRUCOES},
                     {"role": "user", "content": _contexto(diag, arquivos) + "\n\nAnalise e responda em JSON."}]
        houve_proposta = False
        for anterior in historico:   # propostas recusadas e o que o admin pediu em cada uma
            if anterior["rodada"] == 1 and anterior["instrucao"]:
                mensagens[1]["content"] += f"\n\nO administrador pediu: {anterior['instrucao']}"
            elif anterior["instrucao"]:
                inicio = "O administrador rejeitou a proposta acima e pediu: " if houve_proposta else "O administrador pediu: "
                mensagens.append({"role": "user", "content": f"{inicio}{anterior['instrucao']}\n"
                                  "Refaça a análise considerando isso e responda em JSON."})
                houve_proposta = False
            if anterior["rodada"] < rodada["rodada"] and anterior["analise"] and anterior["alteracoes"]:
                proposta = {**json.loads(anterior["analise"]), "alteracoes": json.loads(anterior["alteracoes"])}
                mensagens.append({"role": "assistant", "content": json.dumps(proposta, ensure_ascii=False)})
                houve_proposta = True

        proposta, problemas = None, []
        for _ in range(TENTATIVAS_DE_AJUSTE + 1):
            resposta = await _chamar_ia(mensagens)
            try:
                proposta = _ler_json(resposta)
                problemas = validar_alteracoes(proposta.get("alteracoes"), arquivos)
            except ValueError as e:
                proposta, problemas = None, [f"a resposta não é um JSON válido ({e})"]
            if not problemas:
                break
            mensagens += [{"role": "assistant", "content": resposta},
                          {"role": "user", "content": "A proposta tem problemas e não pode ser aplicada:\n- " +
                           "\n- ".join(problemas) + "\nCorrija e responda o JSON completo de novo."}]
        if problemas:
            _atualizar(rodada_id, status="erro", erro="A IA não chegou a uma alteração aplicável: " + "; ".join(problemas)[:2000])
            return
        analise = {c: str(proposta.get(c) or "") for c in ("diagnostico", "causa", "solucao")}
        _atualizar(rodada_id, status="proposta", commit_base=commit, analise=json.dumps(analise, ensure_ascii=False),
                   alteracoes=json.dumps(proposta["alteracoes"], ensure_ascii=False))
    except Exception as e:   # o erro vai para a tela; nada fica preso em "analisando"
        print(f"[AutoPost correção] rodada {rodada_id}: {e!r}")
        _atualizar(rodada_id, status="erro", erro=f"Não foi possível analisar: {e}"[:2000])


# ---------- rotas ----------

@router.get("/{diagnostico_id}")
async def rodadas(diagnostico_id: int, _=Depends(somente_admin)):
    """Todas as rodadas de correção de um travamento (a última é a atual)."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT c.*, u.nome AS usuario_nome FROM autopost_correcoes c "
                       "LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE c.diagnostico_id = %s ORDER BY c.rodada",
                       (diagnostico_id,))
        lista = [_rodada(r) for r in cursor.fetchall()]
    return {"rodadas": lista, "repositorio": REPO}


@router.post("/{diagnostico_id}/analisar", status_code=status.HTTP_202_ACCEPTED)
async def analisar(diagnostico_id: int, pedido: PedidoAnalise, tarefas: BackgroundTasks,
                   usuario: UserInDB = Depends(somente_admin)):
    rodada_id = _nova_rodada(diagnostico_id, pedido.instrucao, usuario.id)
    tarefas.add_task(analisar_rodada, rodada_id)
    return _rodada(_buscar_rodada(rodada_id))


@router.post("/rodadas/{rodada_id}/aprovar")
async def aprovar(rodada_id: int, usuario: UserInDB = Depends(somente_admin)):
    """Libera a proposta para o construtor do servidor Windows aplicar, gerar o .exe e publicar.
    Uma rodada que falhou ao publicar (ex.: o GitHub recusou o envio) pode ser liberada de novo, sem nova análise."""
    with get_db_cursor(commit=True) as cursor:
        # log_texto antes de status: o MySQL aplica o SET da esquerda para a direita
        cursor.execute("UPDATE autopost_correcoes SET "
                       "log_texto = CONCAT(IF(status = 'falhou', 'Nova tentativa. ', ''), 'Aprovada por ', %s, "
                       "'. Aguardando o construtor do servidor...\\n'), "
                       "status = 'aprovada', usuario_id = %s, erro = NULL "
                       "WHERE id = %s AND status IN ('proposta', 'falhou')", (usuario.nome, usuario.id, rodada_id))
        if cursor.rowcount == 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Só dá para aprovar uma proposta pronta ou repetir uma que falhou.")
    return _rodada(_buscar_rodada(rodada_id))


@router.post("/rodadas/{rodada_id}/rejeitar", status_code=status.HTTP_202_ACCEPTED)
async def rejeitar(rodada_id: int, rejeicao: Rejeicao, tarefas: BackgroundTasks,
                   usuario: UserInDB = Depends(somente_admin)):
    """Recusa a proposta e já pede outra à IA com o que o admin escreveu."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("UPDATE autopost_correcoes SET status = 'rejeitada' WHERE id = %s AND status = 'proposta'", (rodada_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Só dá para rejeitar uma proposta pronta.")
    nova = _nova_rodada(_buscar_rodada(rodada_id)["diagnostico_id"], rejeicao.instrucao, usuario.id)
    tarefas.add_task(analisar_rodada, nova)
    return _rodada(_buscar_rodada(nova))
