"""IA do AutoPost: campos de seleção dos sites e ajuda quando o robô trava numa tela. Antes de perguntar à DeepSeek,
o ERP procura a resposta na memória (tabela autopost_memoria); só usa o que já deu certo uma vez.

- POST /campos: o app manda os campos da página com as opções; o ERP junta o produto (título, descrição, categoria,
  preço e até 2 fotos) e devolve uma opção por campo (da memória ou da IA).
- POST /ajuda: o robô patinou; manda a etapa em que acha que está, o resumo da tela e o print. A IA diz em que etapa
  a tela realmente está e devolve ações simples (clicar num botão da tela, preencher, selecionar, esperar ou desistir).
  Nada que custe dinheiro ou apague algo passa.
- POST /memoria/{id}/resultado: o app conta se a resposta deu certo (conta acertos e falhas).

A chave da IA fica só no servidor.
"""
import base64
import hashlib
import json
import mimetypes
import os
import re
import unicodedata
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB
from routers.ia import deepseek_requisicao

router = APIRouter()

PASTA_FRONTEND = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend"))
MAX_FOTOS = 2
MAX_BYTES_FOTO = 4 * 1024 * 1024
MAX_ACOES = 5

INSTRUCOES = """Você preenche os campos de seleção de um anúncio de produto num site de classificados.
Recebe o produto (título, descrição, categoria, preço e fotos) e os campos da página, cada um com id, nome e opções.
Responda só com JSON, sem texto fora dele:
{"escolhas": {"<id do campo>": "<texto exato de uma das opções desse campo>" ou null}}
Regras:
- Use somente o texto exato de uma das opções do campo; nunca invente opção.
- Tire as informações do título, da descrição e das fotos (ex.: "RX550 2gb" -> Marca AMD, Modelo Radeon RX, VRAM 2 GB).
- Se a marca ou o fabricante certo não está entre as opções, use "Outros" quando existir.
- Condição: o produto é usado, a não ser que o título ou a descrição digam novo/lacrado. Sem sinal de desgaste ou
  defeito, escolha a opção de usado em melhor estado (ex.: "Usado - Excelente").
- Preencha todos os campos que tenham uma opção coerente. Campo obrigatório nunca fica null.
- Só deixe null um campo opcional quando nenhuma opção fizer sentido para o produto."""

INSTRUCOES_AJUDA = """Você ajuda um robô que publica anúncios de produtos num site de classificados (OLX ou Facebook
Marketplace). O robô travou: a tela não mudou depois do que ele tentou, ou o que ele procurava não apareceu.
Você recebe o produto, a etapa em que o robô ACHA que está, o que ele já tentou, o resumo da tela atual (títulos,
botões, campos com o valor atual e as opções, mensagens de erro e o texto) e o print da tela.

1. Primeiro descubra em que etapa a tela REALMENTE está, pelo print e pelos textos. Ela pode ser diferente da que o
   robô acha. Ex.: o robô acha que está na descrição, mas a tela ainda é a das características, com campos
   obrigatórios vazios e a mensagem "Campo obrigatório".
2. Veja o que falta nessa tela para avançar e devolva as ações, na ordem.

Responda só com JSON, sem texto fora dele:
{"etapa_atual": "<etapa que a tela mostra>", "explicacao": "<o que falta e o que fazer, em 1 ou 2 frases>",
 "acoes": [...]}
Ações (no máximo 5):
- {"tipo": "clicar", "texto": "<texto exato de um item da lista botoes>"}
- {"tipo": "preencher", "campo": "<id ou rótulo de um campo de texto>", "valor": "..."}: para dados do produto use
  {titulo}, {descricao} ou {preco} no lugar do texto (ex.: "valor": "{descricao}")
- {"tipo": "selecionar", "campo": "<id ou rótulo de um campo com opções>", "opcao": "<texto exato de uma opção>"}
- {"tipo": "esperar", "segundos": 1 a 15}: a página está carregando
- {"tipo": "desistir", "motivo": "..."}: só uma pessoa resolve (código por SMS, documento, captcha, pagamento)
Regras:
- Nunca escolha nada que custe dinheiro (destaque pago, impulsionar, planos, pagar, oferecer frete grátis por conta do
  vendedor) nem que apague, exclua ou saia da conta. Prefira a opção grátis ("Anunciar sem destacar", "Não, obrigado").
- Use só botões e campos que estão no resumo da tela, com o texto exato.
- Campo obrigatório vazio vem antes de avançar: preencha ou selecione, depois clique em Continuar/Avançar.
- O objetivo é publicar o anúncio: avançar pelas telas até "Finalizar anúncio" ou "Publicar"."""

# o que a IA nunca pode clicar: custa dinheiro, apaga ou sai da conta
PROIBIDO = re.compile(r"destaque\s+(prata|ouro|diamante)|impulsion|turbin|comprar|compre\b|pagar|pague\b|pagamento|"
                      r"assin|\bplano|contrat|excluir|apagar|remover|deletar|\bsair\b|desconect|logout|denunc|bloque|"
                      r"cart[aã]o|\bpix\b|boleto|quero oferecer|oferecer frete", re.I)
PLACEHOLDER = re.compile(r"\s*(\{(titulo|descricao|preco)\}\s*)+")


class Campo(BaseModel):
    id: str = Field(..., min_length=1, max_length=200)
    rotulo: str = Field("", max_length=200)
    obrigatorio: bool = False
    opcoes: list[str] = Field(..., min_length=1, max_length=300)


class PedidoCampos(BaseModel):
    plataforma: str = Field(..., max_length=20)
    produto_id: Optional[int] = None
    titulo: str = Field("", max_length=300)
    descricao: str = Field("", max_length=6000)
    categoria_site: str = Field("", max_length=300)    # ex.: "Informática > Placas de Vídeo"
    campos: list[Campo] = Field(..., min_length=1, max_length=40)
    refazer: bool = False    # o robô patinou com as escolhas da memória: pergunta tudo à IA de novo


class CampoTela(BaseModel):
    id: str = Field("", max_length=200)
    rotulo: str = Field("", max_length=300)
    tipo: str = Field("", max_length=20)          # texto | area | numero | lista | caixa
    valor: str = Field("", max_length=2000)
    obrigatorio: bool = False
    opcoes: list[str] = Field(default_factory=list, max_length=300)


class Tela(BaseModel):
    url: str = Field("", max_length=2000)
    titulos: list[str] = Field(default_factory=list, max_length=30)
    botoes: list[str] = Field(default_factory=list, max_length=120)
    campos: list[CampoTela] = Field(default_factory=list, max_length=60)
    erros: list[str] = Field(default_factory=list, max_length=30)
    texto: str = Field("", max_length=8000)


class PedidoAjuda(BaseModel):
    plataforma: str = Field(..., max_length=20)
    produto_id: Optional[int] = None
    titulo: str = Field("", max_length=300)
    preco: str = Field("", max_length=30)
    etapa_esperada: str = Field(..., min_length=1, max_length=300)   # onde o robô acha que está / o que tentava
    tentativas: list[str] = Field(default_factory=list, max_length=12)
    tela: Tela
    imagem_base64: Optional[str] = Field(None, max_length=6_000_000)
    sem_memoria: bool = False


class Resultado(BaseModel):
    deu_certo: bool


def normalizar(texto) -> str:
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto).strip().lower()


def _chave(*partes) -> str:
    return hashlib.sha256("|".join(str(p) for p in partes).encode("utf-8")).hexdigest()


# ---------- memória ----------

def _memoria_ler(plataforma, tipo, chaves) -> dict:
    chaves = [c for c in chaves if c]
    if not chaves:
        return {}
    marcadores = ", ".join(["%s"] * len(chaves))
    with get_db_cursor() as cursor:
        cursor.execute(f"SELECT id, chave, resposta, acertos, falhas FROM autopost_memoria "
                       f"WHERE plataforma = %s AND tipo = %s AND chave IN ({marcadores})", (plataforma, tipo, *chaves))
        return {r["chave"]: r for r in cursor.fetchall()}


def _memoria_vale(registro) -> bool:
    return bool(registro) and registro["acertos"] >= 1 and registro["acertos"] > registro["falhas"]


def _memoria_salvar(plataforma, tipo, chave, produto_id, descricao, resposta) -> int:
    """Resposta nova da IA: entra (ou substitui a antiga) com contadores zerados; só vale depois de dar certo."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO autopost_memoria (plataforma, tipo, chave, produto_id, descricao, resposta)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), produto_id = VALUES(produto_id),
                descricao = VALUES(descricao), resposta = VALUES(resposta), acertos = 0, falhas = 0,
                data_criacao = CURRENT_TIMESTAMP
        """, (plataforma, tipo, chave, produto_id, (descricao or "")[:500], resposta))
        return cursor.lastrowid


# ---------- produto e IA ----------

def _produto(produto_id):
    if not produto_id:
        return {}
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT p.nome, p.descricao, p.preco_venda, p.caminho_imagem, c.nome AS categoria
            FROM produtos p LEFT JOIN categorias_produtos c ON c.id = p.categoria_id
            WHERE p.id = %s
        """, (produto_id,))
        return cursor.fetchone() or {}


def _fotos(caminhos) -> list:
    """Até MAX_FOTOS fotos do produto como data URL (só arquivos de imagem dentro de frontend/uploads)."""
    fotos = []
    uploads = os.path.join(PASTA_FRONTEND, "uploads") + os.sep
    for caminho in [c.strip() for c in (caminhos or "").split(",") if c.strip()]:
        arquivo = os.path.realpath(os.path.join(PASTA_FRONTEND, caminho.lstrip("/")))
        tipo = mimetypes.guess_type(arquivo)[0] or ""
        if not arquivo.startswith(uploads) or not tipo.startswith("image/") or not os.path.isfile(arquivo):
            continue
        if os.path.getsize(arquivo) > MAX_BYTES_FOTO:
            continue
        with open(arquivo, "rb") as f:
            fotos.append(f"data:{tipo};base64,{base64.b64encode(f.read()).decode()}")
        if len(fotos) >= MAX_FOTOS:
            break
    return fotos


def montar_mensagens(pedido: PedidoCampos, produto: dict, fotos: list) -> list:
    dados = {
        "site": pedido.plataforma,
        "categoria_no_site": pedido.categoria_site,
        "produto": {
            "titulo": pedido.titulo or produto.get("nome") or "",
            "descricao": (pedido.descricao or produto.get("descricao") or "")[:4000],
            "categoria_no_erp": produto.get("categoria") or "",
            "preco": float(produto["preco_venda"]) if produto.get("preco_venda") is not None else None,
        },
        "campos": [c.model_dump(exclude={"refazer"}) for c in pedido.campos],
    }
    texto = "Produto e campos (JSON):\n" + json.dumps(dados, ensure_ascii=False)
    if fotos:
        texto += f"\n\nSeguem {len(fotos)} foto(s) do produto."
    conteudo = [{"type": "text", "text": texto}] + [{"type": "image_url", "image_url": {"url": f}} for f in fotos]
    return [{"role": "system", "content": INSTRUCOES}, {"role": "user", "content": conteudo}]


async def _perguntar(mensagens: list) -> str:
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('apikey_deepseek', 'model_deepseek')")
        cfg = {c["chave"]: c["valor"] for c in cursor.fetchall()}
    # respostas curtas e diretas: sem o modo pensando, que só deixaria mais lento e caro
    url, cabecalhos, base = deepseek_requisicao({**cfg, "ia_think": "off"})
    corpo = {**base, "messages": mensagens, "stream": False, "max_tokens": 1500,
             "response_format": {"type": "json_object"}}
    async with httpx.AsyncClient(timeout=60.0) as cliente:
        r = await cliente.post(url, headers=cabecalhos, content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"a DeepSeek respondeu {r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"].get("content") or ""


def _ler_json(resposta: str) -> dict:
    try:
        dados = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", (resposta or "").strip()))
        return dados if isinstance(dados, dict) else {}
    except ValueError:
        return {}


# ---------- campos de seleção ----------

def validar_escolhas(resposta: str, campos: list) -> dict:
    """Só vale o texto exato de uma opção do campo (comparado sem acento e sem maiúsculas). Campo obrigatório sem
    resposta válida fica com "Outros" quando existe; o resto fica None."""
    bruto = _ler_json(resposta).get("escolhas")
    bruto = bruto if isinstance(bruto, dict) else {}
    escolhas = {}
    for campo in campos:
        por_texto = {normalizar(o): o for o in campo.opcoes}
        valor = por_texto.get(normalizar(bruto.get(campo.id)))
        if valor is None and campo.obrigatorio:
            valor = por_texto.get("outros")
        escolhas[campo.id] = valor
    return escolhas


def chave_campo(produto_id, campo: Campo) -> Optional[str]:
    if not produto_id:
        return None
    return _chave("campo", produto_id, campo.id, json.dumps(sorted(campo.opcoes), ensure_ascii=False))


@router.post("/campos")
async def escolher_campos(pedido: PedidoCampos, current_user: UserInDB = Depends(get_current_user)):
    chaves = {c.id: chave_campo(pedido.produto_id, c) for c in pedido.campos}
    lembradas = {} if pedido.refazer else _memoria_ler(pedido.plataforma, "campo", list(chaves.values()))
    escolhas, origens, memorias, faltam = {}, {}, {}, []
    for campo in pedido.campos:
        registro = lembradas.get(chaves[campo.id])
        if _memoria_vale(registro) and registro["resposta"] in campo.opcoes:
            escolhas[campo.id], origens[campo.id], memorias[campo.id] = registro["resposta"], "memória", registro["id"]
        else:
            faltam.append(campo)
    fotos = []
    if faltam:   # só os campos sem resposta guardada vão para a IA
        produto = _produto(pedido.produto_id)
        fotos = _fotos(produto.get("caminho_imagem"))
        validas = validar_escolhas(
            await _perguntar(montar_mensagens(pedido.model_copy(update={"campos": faltam}), produto, fotos)), faltam)
        for campo in faltam:
            valor = validas.get(campo.id)
            escolhas[campo.id], origens[campo.id] = valor, ("ia" if valor else None)
            if valor and chaves[campo.id]:
                memorias[campo.id] = _memoria_salvar(pedido.plataforma, "campo", chaves[campo.id], pedido.produto_id,
                                                     campo.rotulo or campo.id, valor)
    return {"escolhas": escolhas, "origens": origens, "memorias": memorias, "fotos": len(fotos),
            "perguntou_ia": bool(faltam)}


# ---------- ajuda quando o robô trava numa tela ----------

def assinatura_tela(pedido: PedidoAjuda) -> str:
    """A "cara" da tela, sem o que muda de anúncio para anúncio: etapa, títulos, botões, campos (vazio ou não) e erros."""
    tela = pedido.tela
    return _chave(
        "tela", pedido.plataforma, re.sub(r"\d+", "#", normalizar(pedido.etapa_esperada)),
        "|".join(sorted({normalizar(t) for t in tela.titulos})),
        "|".join(sorted({normalizar(b) for b in tela.botoes})),
        "|".join(sorted(f"{normalizar(c.rotulo or c.id)}:{'ok' if c.valor else 'vazio'}" for c in tela.campos)),
        "|".join(sorted({normalizar(e) for e in tela.erros})),
    )


def validar_acoes(bruto, tela: Tela) -> tuple:
    """Ações que o robô pode fazer nesta tela; o resto volta com o motivo."""
    botoes = {normalizar(b): b for b in tela.botoes}
    campos = {}
    for c in tela.campos:
        for nome in (c.id, c.rotulo):
            if nome:
                campos.setdefault(normalizar(nome), c)
    validas, recusadas = [], []
    for acao in (bruto if isinstance(bruto, list) else [])[:MAX_ACOES]:
        acao = acao if isinstance(acao, dict) else {}
        tipo = acao.get("tipo")
        if tipo == "clicar":
            botao = botoes.get(normalizar(acao.get("texto")))
            if not botao:
                recusadas.append(f"o botão '{acao.get('texto')}' não está na tela")
            elif PROIBIDO.search(botao):
                recusadas.append(f"'{botao}' pode custar dinheiro, apagar algo ou sair da conta")
            else:
                validas.append({"tipo": "clicar", "texto": botao})
        elif tipo == "preencher":
            campo = campos.get(normalizar(acao.get("campo")))
            if not campo or campo.tipo not in ("texto", "area", "numero"):
                recusadas.append(f"o campo de texto '{acao.get('campo')}' não está na tela")
            else:
                validas.append({"tipo": "preencher", "campo": campo.id or campo.rotulo,
                                "valor": str(acao.get("valor") or "")[:6000]})
        elif tipo == "selecionar":
            campo = campos.get(normalizar(acao.get("campo")))
            opcao = {normalizar(o): o for o in (campo.opcoes if campo else [])}.get(normalizar(acao.get("opcao")))
            if not opcao:
                recusadas.append(f"a opção '{acao.get('opcao')}' do campo '{acao.get('campo')}' não está na tela")
            else:
                validas.append({"tipo": "selecionar", "campo": campo.id or campo.rotulo, "opcao": opcao})
        elif tipo == "esperar":
            try:
                segundos = int(acao.get("segundos") or 5)
            except (TypeError, ValueError):
                segundos = 5
            validas.append({"tipo": "esperar", "segundos": max(1, min(15, segundos))})
        elif tipo == "desistir":
            validas.append({"tipo": "desistir", "motivo": str(acao.get("motivo") or "")[:300]})
            break
        else:
            recusadas.append(f"ação desconhecida: {tipo}")
    return validas, recusadas


def acoes_genericas(acoes) -> bool:
    """Valem para qualquer produto: cliques, esperas e preenchimentos só com {titulo}/{descricao}/{preco}."""
    return all(a["tipo"] in ("clicar", "esperar", "desistir")
               or (a["tipo"] == "preencher" and PLACEHOLDER.fullmatch(a["valor"] or "")) for a in acoes)


def mensagens_ajuda(pedido: PedidoAjuda, produto: dict, recusadas=None) -> list:
    dados = {
        "site": pedido.plataforma,
        "produto": {"titulo": pedido.titulo or produto.get("nome") or "", "preco": pedido.preco,
                    "descricao": (produto.get("descricao") or "")[:1500]},
        "etapa_em_que_o_robo_acha_que_esta": pedido.etapa_esperada,
        "o_que_o_robo_ja_tentou": pedido.tentativas,
        "tela": pedido.tela.model_dump(),
    }
    texto = "Situação (JSON):\n" + json.dumps(dados, ensure_ascii=False)
    if recusadas:
        texto += ("\n\nSua resposta anterior não pode ser usada: " + "; ".join(recusadas) +
                  ". Responda de novo só com botões, campos e opções que existem no resumo da tela.")
    conteudo = [{"type": "text", "text": texto}]
    if pedido.imagem_base64:
        conteudo.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{pedido.imagem_base64}"}})
    return [{"role": "system", "content": INSTRUCOES_AJUDA}, {"role": "user", "content": conteudo}]


@router.post("/ajuda")
async def ajudar(pedido: PedidoAjuda, current_user: UserInDB = Depends(get_current_user)):
    assinatura = assinatura_tela(pedido)
    chave_produto = _chave(assinatura, pedido.produto_id) if pedido.produto_id else None
    if not pedido.sem_memoria:
        lembradas = _memoria_ler(pedido.plataforma, "tela", [chave_produto, assinatura])
        for chave in (chave_produto, assinatura):
            registro = lembradas.get(chave)
            if _memoria_vale(registro):
                guardado = _ler_json(registro["resposta"])
                acoes, recusadas = validar_acoes(guardado.get("acoes"), pedido.tela)
                if acoes and not recusadas:
                    return {"origem": "memória", "memoria_id": registro["id"], "acoes": acoes,
                            "etapa_atual": guardado.get("etapa_atual", ""), "explicacao": guardado.get("explicacao", ""),
                            "recusadas": []}

    produto = _produto(pedido.produto_id)
    dados, recusadas = {}, []
    for _ in range(2):   # se a IA citar botão ou opção que não existe (ou proibido), pede de novo uma vez
        dados = _ler_json(await _perguntar(mensagens_ajuda(pedido, produto, recusadas)))
        acoes, recusadas = validar_acoes(dados.get("acoes"), pedido.tela)
        if acoes:
            break
    memoria_id = None
    if acoes:
        guardar = {"etapa_atual": str(dados.get("etapa_atual") or "")[:300],
                   "explicacao": str(dados.get("explicacao") or "")[:600], "acoes": acoes}
        generica = acoes_genericas(acoes)
        memoria_id = _memoria_salvar(pedido.plataforma, "tela", assinatura if generica else chave_produto or assinatura,
                                     None if generica else pedido.produto_id,
                                     f"{pedido.etapa_esperada} | {guardar['etapa_atual']}",
                                     json.dumps(guardar, ensure_ascii=False))
    return {"origem": "ia", "memoria_id": memoria_id, "acoes": acoes, "recusadas": recusadas,
            "etapa_atual": str(dados.get("etapa_atual") or ""), "explicacao": str(dados.get("explicacao") or "")}


@router.post("/memoria/{memoria_id}/resultado")
async def resultado(memoria_id: int, res: Resultado, current_user: UserInDB = Depends(get_current_user)):
    coluna = "acertos" if res.deu_certo else "falhas"
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(f"UPDATE autopost_memoria SET {coluna} = {coluna} + 1, data_uso = CURRENT_TIMESTAMP WHERE id = %s",
                       (memoria_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resposta guardada não encontrada")
    return {"ok": True}
