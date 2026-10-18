"""Venda simplificada (balcão): escaneia os produtos pelo EAN-13, digita o nome do cliente e conclui.

Faz uma venda de verdade, pelas mesmas funções da tela Vendas, com os padrões combinados com o dono (18/10/2026):
- cliente pelo nome: usa o cliente com esse nome (sem diferenciar maiúsculas/acentos) ou cria o cadastro;
- plataforma "Loja Física" (dá para trocar), forma de pagamento PIX (dá para trocar), sem condição de pagamento;
- vendedor = o ligado ao usuário logado, com a comissão de cada produto (comissão do produto x quantidade);
- concluir = a venda sai Finalizada, o contas a receber como recebido e a comissão como paga (igual ao
  "Finalizar" da tela Vendas com as opções padrão).
"""
import re
import unicodedata
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import UserInDB, get_current_user
from database import get_db_cursor
from routers import contas_pagar, contas_receber, pedidos_venda

router = APIRouter()

PLATAFORMA_PADRAO = "Loja Física"
FORMAS = ["pix", "dinheiro", "cartao_debito", "cartao_credito", "transferencia", "boleto"]


class ItemSimplificado(BaseModel):
    produto_id: int
    quantidade: int = Field(..., ge=1, le=9999)
    preco_unitario: float = Field(..., ge=0)


class VendaSimplificada(BaseModel):
    cliente_nome: str = Field(..., min_length=2, max_length=100)
    itens: List[ItemSimplificado] = Field(..., min_length=1)
    forma_pagamento: str = "pix"
    plataforma_id: Optional[int] = None
    observacoes: Optional[str] = Field(None, max_length=500)


def _normalizar(texto) -> str:
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto).strip().lower()


def _plataforma_padrao(cursor):
    cursor.execute("SELECT id, nome FROM plataformas_venda WHERE ativo = TRUE ORDER BY id")
    plataformas = cursor.fetchall()
    padrao = next((p for p in plataformas if _normalizar(p["nome"]) == _normalizar(PLATAFORMA_PADRAO)), None)
    return plataformas, (padrao or (plataformas[0] if plataformas else None))


def _vendedor_do_usuario(cursor, usuario_id):
    cursor.execute("SELECT id, nome FROM vendedores WHERE usuario_id = %s ORDER BY id LIMIT 1", (usuario_id,))
    return cursor.fetchone()


def _cliente_pelo_nome(nome: str):
    """id do parceiro (cliente) com esse nome; se não existir, cria o cadastro (clientes + parceiros, como a tela
    Clientes faz). Devolve (parceiro_id, criado)."""
    nome = re.sub(r"\s+", " ", nome).strip()
    alvo = _normalizar(nome)
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, nome FROM parceiros WHERE tipo IN ('cliente', 'ambos') AND ativo = TRUE ORDER BY id DESC")
        for parceiro in cursor.fetchall():
            if _normalizar(parceiro["nome"]) == alvo:
                return parceiro["id"], False
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("INSERT INTO clientes (nome, tipo, ativo) VALUES (%s, 'pessoa_fisica', TRUE)", (nome,))
        cursor.execute("INSERT INTO parceiros (tipo, nome, ativo) VALUES ('cliente', %s, TRUE)", (nome,))
        cursor.execute("SELECT LAST_INSERT_ID() AS id")
        return cursor.fetchone()["id"], True


@router.get("/padroes")
async def padroes(current_user: UserInDB = Depends(get_current_user)):
    """O que a tela precisa para abrir: plataformas (com a padrão), formas de pagamento e o vendedor do usuário."""
    with get_db_cursor() as cursor:
        plataformas, padrao = _plataforma_padrao(cursor)
        vendedor = _vendedor_do_usuario(cursor, current_user.id)
    return {"plataformas": plataformas, "plataforma_padrao": padrao["id"] if padrao else None,
            "formas_pagamento": FORMAS, "forma_padrao": "pix", "vendedor": vendedor}


@router.post("", status_code=status.HTTP_201_CREATED)
async def criar_venda_simplificada(dados: VendaSimplificada, current_user: UserInDB = Depends(get_current_user)):
    if dados.forma_pagamento not in FORMAS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forma de pagamento inválida")
    # mesmo produto escaneado mais de uma vez: uma linha só (a venda normal também usa uma linha por produto)
    juntos = {}
    for item in dados.itens:
        if item.produto_id in juntos:
            juntos[item.produto_id]["quantidade"] += item.quantidade
        else:
            juntos[item.produto_id] = {"quantidade": item.quantidade, "preco_unitario": item.preco_unitario}

    with get_db_cursor() as cursor:
        _, padrao = _plataforma_padrao(cursor)
        plataforma_id = dados.plataforma_id or (padrao["id"] if padrao else None)
        if not plataforma_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhuma plataforma de venda cadastrada")
        vendedor = _vendedor_do_usuario(cursor, current_user.id)
        marcadores = ", ".join(["%s"] * len(juntos))
        cursor.execute(f"SELECT id, nome, comissao, estoque_atual FROM produtos WHERE id IN ({marcadores})",
                       tuple(juntos))
        produtos = {p["id"]: p for p in cursor.fetchall()}
    faltando = [pid for pid in juntos if pid not in produtos]
    if faltando:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto não encontrado: {faltando}")
    # estoque conferido antes de criar o cliente: venda recusada não deixa cadastro novo sobrando
    for pid, item in juntos.items():
        if (produtos[pid]["estoque_atual"] or 0) < item["quantidade"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Estoque insuficiente para {produtos[pid]['nome']}. Disponível: {produtos[pid]['estoque_atual']}")

    itens = []
    for pid, item in juntos.items():
        comissao = float(produtos[pid]["comissao"] or 0) * item["quantidade"] if vendedor else 0
        itens.append(pedidos_venda.ItemPedidoVendaCreate(
            produto_id=pid, quantidade=item["quantidade"], preco_unitario=round(item["preco_unitario"], 2),
            comissao_item=comissao))

    cliente_id, cliente_novo = _cliente_pelo_nome(dados.cliente_nome)
    pedido = await pedidos_venda.criar_pedido_venda(pedidos_venda.PedidoVendaCreate(
        cliente_id=cliente_id, vendedor_id=vendedor["id"] if vendedor else None, plataforma_id=plataforma_id,
        data_entrega=date.today(), forma_pagamento=dados.forma_pagamento,
        observacoes=("Venda simplificada" + (f" - {dados.observacoes}" if dados.observacoes else "")),
        comissao_total=sum(i.comissao_item for i in itens), itens=itens), current_user)

    # concluir: Finalizada + contas a receber recebido + comissão paga (o "Finalizar" padrão da tela Vendas)
    await pedidos_venda.atualizar_pedido_venda(pedido["id"], pedidos_venda.PedidoVendaUpdate(status="finalizada"),
                                               current_user)
    hoje = date.today()
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM contas_receber WHERE pedido_venda_id = %s AND status = 'pendente'", (pedido["id"],))
        receber = [c["id"] for c in cursor.fetchall()]
        cursor.execute("SELECT id FROM contas_pagar WHERE pedido_venda_id = %s AND status = 'pendente'", (pedido["id"],))
        pagar = [c["id"] for c in cursor.fetchall()]
    for conta_id in receber:
        await contas_receber.atualizar_conta_receber(
            conta_id, contas_receber.ContaReceberUpdate(status="recebido", data_recebimento=hoje), current_user)
    for conta_id in pagar:
        await contas_pagar.atualizar_conta_pagar(
            conta_id, contas_pagar.ContaPagarUpdate(status="pago", data_pagamento=hoje), current_user)

    return {"id": pedido["id"], "codigo": pedido["codigo"], "valor_total": float(pedido["valor_total"]),
            "cliente_id": cliente_id, "cliente_novo": cliente_novo,
            "vendedor": vendedor["nome"] if vendedor else None, "comissao_total": sum(i.comissao_item for i in itens),
            "itens": [{"produto_id": i.produto_id, "quantidade": i.quantidade, "preco_unitario": i.preco_unitario}
                      for i in itens]}
