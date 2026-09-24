"""
Chat com IA sobre os produtos (widget flutuante em todas as telas).

Duas formas de conversar:
- conversa geral (/geral/...): o usuário pergunta direto ("tem placa rx580 disponível?") e a IA consulta o banco
  com as ferramentas de ferramentas_ia.py (buscar produtos, detalhes, categorias) para responder;
- conversa sobre um produto escolhido (/{produto_id}/...): os dados do produto já vão no contexto, e as mesmas
  ferramentas continuam disponíveis (ex.: "tem outra parecida com estoque?").

A IA só responde com o que está cadastrado — não inventa. O histórico é por usuário (e por produto, quando há um);
a conversa geral fica com produto_id NULL. As chamadas de ferramenta não são gravadas, só a pergunta e a resposta.
"""

from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from ferramentas_ia import FERRAMENTAS, ExecutorFerramentas
from models import UserInDB
from routers.ia import ERRO_PROVEDOR, conversar_com_ferramentas

router = APIRouter()

HISTORICO_NO_CONTEXTO = 20


class MensagemProdutoChat(BaseModel):
    conteudo: str = Field(..., max_length=4000)


def _formatar_moeda(valor) -> str:
    try:
        return f"R$ {float(valor):.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return "-"


REGRAS = [
    "Você é o assistente de produtos do ERP Maneiro. Quem pergunta é um vendedor, muitas vezes no meio de um",
    "atendimento, então responda curto, direto e em português do Brasil.",
    "Use as ferramentas para consultar o banco sempre que a pergunta envolver produtos, estoque, preço ou",
    "categorias — nunca responda de memória nem invente produto, preço ou quantidade.",
    "Estoque: estoque_atual > 0 significa disponível; 0 significa cadastrado mas sem estoque no momento.",
    "Ao citar produtos, mostre o código, o nome, o preço de venda e a quantidade em estoque de cada um.",
    "Se a ferramenta não achar nada, tente outra busca mais curta antes de dizer que não tem.",
    "Se a informação não estiver cadastrada, diga que não tem essa informação no sistema.",
    "Você só consulta: não ofereça avisar quando chegar, reservar, vender nem alterar cadastro.",
]


def _montar_prompt_sistema(produto: Optional[dict]) -> str:
    linhas = list(REGRAS)
    if not produto:
        return "\n".join(linhas)
    linhas += [
        "",
        "A conversa é sobre o produto abaixo (o vendedor escolheu ele). Para outros produtos, use as ferramentas.",
        "=== PRODUTO ESCOLHIDO ===",
        f"id: {produto.get('id')}",
        f"Código: {produto.get('codigo') or '-'}",
        f"Nome: {produto.get('nome') or '-'}",
        f"Categoria: {produto.get('categoria_nome') or '-'}",
        f"Tipo: {produto.get('tipo_produto') or '-'}",
        f"Preço de venda: {_formatar_moeda(produto.get('preco_venda'))}",
        f"Comissão: {_formatar_moeda(produto.get('comissao'))}",
        f"Estoque atual: {produto.get('estoque_atual')}",
        f"Estoque mínimo: {produto.get('estoque_minimo')}",
        f"Depósito: {produto.get('deposito_nome') or '-'}",
        f"Ativo: {'Sim' if produto.get('ativo') else 'Não'}",
        f"Faturável: {'Sim' if produto.get('faturavel') else 'Não'}",
        "",
        "Descrição cadastrada:",
        produto.get("descricao") or "(sem descrição cadastrada)",
        "",
        "Instruções e dúvidas cadastradas para este produto (fonte principal para dúvidas específicas):",
        produto.get("instrucoes_duvidas") or "(nada cadastrado ainda neste campo)",
    ]
    return "\n".join(linhas)


def _buscar_produto(produto_id: int) -> Optional[dict]:
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT p.*, c.nome AS categoria_nome, d.nome AS deposito_nome
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            LEFT JOIN depositos d ON p.deposito_id = d.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        return cursor.fetchone()


def _filtro_conversa(produto_id: Optional[int]):
    return ("produto_id IS NULL", ()) if produto_id is None else ("produto_id = %s", (produto_id,))


def _listar_mensagens(produto_id: Optional[int], usuario_id: int):
    filtro, params = _filtro_conversa(produto_id)
    with get_db_cursor() as cursor:
        cursor.execute(
            f"SELECT id, role, conteudo, data_envio FROM chat_produto_mensagens "
            f"WHERE {filtro} AND usuario_id = %s ORDER BY data_envio ASC, id ASC",
            (*params, usuario_id)
        )
        mensagens = cursor.fetchall()
    return [
        {"id": m["id"], "role": m["role"], "conteudo": m["conteudo"],
         "data_envio": m["data_envio"].isoformat() if m["data_envio"] else None}
        for m in mensagens
    ]


async def _responder(produto_id: Optional[int], conteudo: str, usuario_id: int):
    produto = None
    if produto_id is not None:
        produto = _buscar_produto(produto_id)
        if not produto:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")
    if not conteudo or not conteudo.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mensagem vazia")

    filtro, params = _filtro_conversa(produto_id)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO chat_produto_mensagens (produto_id, usuario_id, role, conteudo) VALUES (%s, %s, 'user', %s)",
            (produto_id, usuario_id, conteudo.strip())
        )
    with get_db_cursor() as cursor:
        # as ÚLTIMAS mensagens (antes ia ASC LIMIT 20: numa conversa longa, a pergunta nova nem chegava na IA)
        cursor.execute(
            f"SELECT role, conteudo FROM (SELECT id, role, conteudo, data_envio FROM chat_produto_mensagens "
            f"WHERE {filtro} AND usuario_id = %s ORDER BY data_envio DESC, id DESC LIMIT %s) ultimas "
            f"ORDER BY data_envio ASC, id ASC",
            (*params, usuario_id, HISTORICO_NO_CONTEXTO)
        )
        historico = cursor.fetchall()

    mensagens = [{"role": "system", "content": _montar_prompt_sistema(produto)}]
    mensagens += [{"role": h["role"], "content": h["conteudo"]} for h in historico]
    executor = ExecutorFerramentas()
    try:
        resposta = await conversar_com_ferramentas(mensagens, FERRAMENTAS, executor.executar)
    except httpx.HTTPError as e:
        raise HTTPException(ERRO_PROVEDOR, f"Não foi possível falar com o provedor de IA: {e}")
    if not resposta:
        resposta = "Não consegui montar uma resposta agora. Tente perguntar de outro jeito."

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO chat_produto_mensagens (produto_id, usuario_id, role, conteudo) VALUES (%s, %s, 'assistant', %s)",
            (produto_id, usuario_id, resposta)
        )
        msg_id = cursor.lastrowid

    return {
        "id": msg_id,
        "role": "assistant",
        "conteudo": resposta,
        "data_envio": datetime.now().isoformat(),
        # produtos que as ferramentas trouxeram: a tela mostra como atalhos para focar a conversa neles
        "produtos": list(executor.produtos_citados.values())[:8],
    }


def _limpar(produto_id: Optional[int], usuario_id: int):
    filtro, params = _filtro_conversa(produto_id)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(f"DELETE FROM chat_produto_mensagens WHERE {filtro} AND usuario_id = %s", (*params, usuario_id))
    return {"message": "Histórico limpo com sucesso"}


# ---- conversa geral (antes das rotas /{produto_id}, senão "geral" seria lido como id) ----

@router.get("/geral/mensagens")
async def get_mensagens_geral(current_user: UserInDB = Depends(get_current_user)):
    return _listar_mensagens(None, current_user.id)


@router.post("/geral/enviar")
async def enviar_mensagem_geral(msg: MensagemProdutoChat, current_user: UserInDB = Depends(get_current_user)):
    """Pergunta livre: a IA consulta os produtos no banco para responder."""
    return await _responder(None, msg.conteudo, current_user.id)


@router.delete("/geral/mensagens")
async def limpar_mensagens_geral(current_user: UserInDB = Depends(get_current_user)):
    return _limpar(None, current_user.id)


# ---- conversa sobre um produto escolhido ----

@router.get("/{produto_id}/mensagens")
async def get_mensagens(produto_id: int, current_user: UserInDB = Depends(get_current_user)):
    """Retorna o histórico de conversa do usuário atual sobre este produto."""
    return _listar_mensagens(produto_id, current_user.id)


@router.post("/{produto_id}/enviar")
async def enviar_mensagem(produto_id: int, msg: MensagemProdutoChat, current_user: UserInDB = Depends(get_current_user)):
    """Envia uma pergunta sobre o produto e obtém a resposta da IA."""
    return await _responder(produto_id, msg.conteudo, current_user.id)


@router.delete("/{produto_id}/mensagens")
async def limpar_mensagens(produto_id: int, current_user: UserInDB = Depends(get_current_user)):
    """Limpa o histórico de conversa do usuário atual sobre este produto."""
    return _limpar(produto_id, current_user.id)
