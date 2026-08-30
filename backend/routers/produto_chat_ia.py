"""
Chat com IA sobre um produto específico.

Qualquer usuário pode escolher um produto e tirar dúvidas com a IA sobre ele.
A IA responde só com base nos dados do produto (nome, preço, estoque, categoria,
depósito etc.) e no campo "Instruções e dúvidas" preenchido no cadastro do produto —
não inventa informação que não esteja ali.

Reaproveita a mesma infraestrutura de chamada de IA do chat.py (multi-provider:
OpenRouter, Ollama, LM Studio), só troca o prompt de sistema e o histórico, que
aqui é por produto + usuário, não só por usuário.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from routers.chat import chamar_ia_chat, obter_configuracoes_ia

router = APIRouter()


class MensagemProdutoChat(BaseModel):
    conteudo: str


def _formatar_moeda(valor) -> str:
    try:
        return f"R$ {float(valor):.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return "-"


def _montar_prompt_sistema(produto: dict) -> str:
    linhas = [
        "Você é um assistente que ajuda vendedores a tirar dúvidas sobre UM produto específico do catálogo.",
        "Responda apenas com base nos dados do produto listados abaixo. Se a pergunta pedir uma informação",
        "que não está nesses dados, diga claramente que não tem essa informação cadastrada — não invente nada.",
        "Seja direto e objetivo, como se estivesse respondendo um vendedor no meio de um atendimento.",
        "",
        "=== DADOS DO PRODUTO ===",
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


@router.get("/{produto_id}/mensagens")
async def get_mensagens(produto_id: int, current_user: UserInDB = Depends(get_current_user)):
    """Retorna o histórico de conversa do usuário atual sobre este produto."""
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT id, role, conteudo, data_envio
            FROM chat_produto_mensagens
            WHERE produto_id = %s AND usuario_id = %s
            ORDER BY data_envio ASC
            """,
            (produto_id, current_user.id)
        )
        mensagens = cursor.fetchall()

    return [
        {
            "id": m["id"],
            "role": m["role"],
            "conteudo": m["conteudo"],
            "data_envio": m["data_envio"].isoformat() if m["data_envio"] else None
        }
        for m in mensagens
    ]


@router.post("/{produto_id}/enviar")
async def enviar_mensagem(
    produto_id: int,
    msg: MensagemProdutoChat,
    current_user: UserInDB = Depends(get_current_user)
):
    """Envia uma pergunta sobre o produto e obtém a resposta da IA."""
    produto = _buscar_produto(produto_id)
    if not produto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")

    if not msg.conteudo or not msg.conteudo.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mensagem vazia")

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO chat_produto_mensagens (produto_id, usuario_id, role, conteudo)
            VALUES (%s, %s, 'user', %s)
            """,
            (produto_id, current_user.id, msg.conteudo)
        )

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT role, conteudo FROM chat_produto_mensagens
            WHERE produto_id = %s AND usuario_id = %s
            ORDER BY data_envio ASC
            LIMIT 20
            """,
            (produto_id, current_user.id)
        )
        historico = cursor.fetchall()

    ia_config = obter_configuracoes_ia()
    messages = [{"role": "system", "content": _montar_prompt_sistema(produto)}]
    for h in historico:
        messages.append({"role": h["role"], "content": h["conteudo"]})

    resposta_ia = await chamar_ia_chat(messages, ia_config)

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO chat_produto_mensagens (produto_id, usuario_id, role, conteudo)
            VALUES (%s, %s, 'assistant', %s)
            """,
            (produto_id, current_user.id, resposta_ia)
        )
        cursor.execute("SELECT LAST_INSERT_ID() as id")
        msg_id = cursor.fetchone()["id"]

    return {
        "id": msg_id,
        "role": "assistant",
        "conteudo": resposta_ia,
        "data_envio": datetime.now().isoformat()
    }


@router.delete("/{produto_id}/mensagens")
async def limpar_mensagens(produto_id: int, current_user: UserInDB = Depends(get_current_user)):
    """Limpa o histórico de conversa do usuário atual sobre este produto."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM chat_produto_mensagens WHERE produto_id = %s AND usuario_id = %s",
            (produto_id, current_user.id)
        )
    return {"message": "Histórico limpo com sucesso"}
