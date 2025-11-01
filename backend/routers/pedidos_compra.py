from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ItemPedidoCompraBase(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float

class ItemPedidoCompraCreate(ItemPedidoCompraBase):
    pass

class ItemPedidoCompra(ItemPedidoCompraBase):
    id: int
    subtotal: float
    pedido_id: int

class PedidoCompraBase(BaseModel):
    fornecedor_id: int
    data_previsao: Optional[date] = None
    observacoes: Optional[str] = None

class PedidoCompraCreate(PedidoCompraBase):
    itens: List[ItemPedidoCompraCreate]

class PedidoCompraUpdate(BaseModel):
    fornecedor_id: Optional[int] = None
    data_previsao: Optional[date] = None
    status: Optional[str] = None
    observacoes: Optional[str] = None

class PedidoCompra(PedidoCompraBase):
    id: int
    codigo: str
    data_pedido: str
    status: str
    valor_total: float
    usuario_id: int

class PedidoCompraDetalhado(PedidoCompra):
    itens: List[ItemPedidoCompra]

# Rotas
@router.get("/", response_model=List[PedidoCompra])
async def listar_pedidos_compra(
    status: Optional[str] = None,
    fornecedor_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os pedidos de compra cadastrados no sistema.
    Pode filtrar por status e fornecedor.
    """
    query = "SELECT * FROM pedidos_compra WHERE 1=1"
    params = []
    
    if status is not None:
        query += " AND status = %s"
        params.append(status)
    
    if fornecedor_id is not None:
        query += " AND fornecedor_id = %s"
        params.append(fornecedor_id)
    
    query += " ORDER BY data_pedido DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        pedidos = cursor.fetchall()
    
    # Converte o campo data_pedido de datetime para string em todos os pedidos
    for pedido in pedidos:
        if "data_pedido" in pedido and pedido["data_pedido"]:
            pedido["data_pedido"] = pedido["data_pedido"].isoformat()
    
    return pedidos

@router.get("/{pedido_id}", response_model=PedidoCompraDetalhado)
async def obter_pedido_compra(
    pedido_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um pedido de compra específico, incluindo seus itens.
    """
    with get_db_cursor() as cursor:
        # Obtém os dados do pedido
        cursor.execute(
            "SELECT * FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de compra não encontrado"
            )
        
        # Obtém os itens do pedido
        cursor.execute(
            "SELECT * FROM itens_pedido_compra WHERE pedido_id = %s",
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        # Monta o objeto de resposta
        pedido_detalhado = dict(pedido)
        
        # Converte o campo data_pedido de datetime para string
        if "data_pedido" in pedido_detalhado and pedido_detalhado["data_pedido"]:
            pedido_detalhado["data_pedido"] = pedido_detalhado["data_pedido"].isoformat()
            
        pedido_detalhado["itens"] = itens
    
    return pedido_detalhado

@router.post("/", response_model=PedidoCompraDetalhado, status_code=status.HTTP_201_CREATED)
async def criar_pedido_compra(
    pedido: PedidoCompraCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo pedido de compra no sistema, incluindo seus itens.
    """
    # Verifica se o fornecedor existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, tipo FROM parceiros WHERE id = %s",
            (pedido.fornecedor_id,)
        )
        fornecedor = cursor.fetchone()
        
        if not fornecedor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Fornecedor não encontrado"
            )
        
        if fornecedor["tipo"] not in ["fornecedor", "ambos"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O parceiro selecionado não é um fornecedor"
            )
        
        # Verifica se existem itens no pedido
        if not pedido.itens or len(pedido.itens) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O pedido deve conter pelo menos um item"
            )
        
        # Verifica se os produtos existem
        produto_ids = [item.produto_id for item in pedido.itens]
        placeholders = ", ".join(["%s"] * len(produto_ids))
        cursor.execute(
            f"SELECT id, nome, preco_custo FROM produtos WHERE id IN ({placeholders})",
            produto_ids
        )
        produtos = {produto["id"]: produto for produto in cursor.fetchall()}
        
        for item in pedido.itens:
            if item.produto_id not in produtos:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Produto com ID {item.produto_id} não encontrado"
                )
            
            if item.quantidade <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A quantidade do produto {produtos[item.produto_id]['nome']} deve ser maior que zero"
                )
    
    # Cria o pedido e seus itens
    with get_db_cursor(commit=True) as cursor:
        # Gera o código do pedido (formato: PC + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM pedidos_compra WHERE YEAR(data_pedido) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"PC{ano}{seq:04d}"
        
        # Calcula o valor total do pedido
        valor_total = sum(item.quantidade * item.preco_unitario for item in pedido.itens)
        
        # Insere o pedido
        cursor.execute(
            """
            INSERT INTO pedidos_compra (
                codigo, fornecedor_id, data_previsao, status,
                valor_total, observacoes, usuario_id
            )
            VALUES (%s, %s, %s, 'pendente', %s, %s, %s)
            """,
            (
                codigo, pedido.fornecedor_id, pedido.data_previsao,
                valor_total, pedido.observacoes, current_user.id
            )
        )
        
        # Obtém o ID do pedido criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        pedido_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Insere os itens do pedido
        for item in pedido.itens:
            subtotal = item.quantidade * item.preco_unitario
            
            cursor.execute(
                """
                INSERT INTO itens_pedido_compra (
                    pedido_id, produto_id, quantidade, preco_unitario, subtotal
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    pedido_id, item.produto_id, item.quantidade,
                    item.preco_unitario, subtotal
                )
            )
        
        # Obtém os dados do pedido criado
        cursor.execute(
            "SELECT * FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        novo_pedido = cursor.fetchone()
        
        # Obtém os itens do pedido criado
        cursor.execute(
            "SELECT * FROM itens_pedido_compra WHERE pedido_id = %s",
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        # Monta o objeto de resposta
        pedido_detalhado = dict(novo_pedido)
        
        # Converte o campo data_pedido de datetime para string
        if "data_pedido" in pedido_detalhado and pedido_detalhado["data_pedido"]:
            pedido_detalhado["data_pedido"] = pedido_detalhado["data_pedido"].isoformat()
            
        pedido_detalhado["itens"] = itens
    
    return pedido_detalhado

@router.put("/{pedido_id}", response_model=PedidoCompra)
async def atualizar_pedido_compra(
    pedido_id: int,
    pedido: PedidoCompraUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um pedido de compra existente.
    Não permite alterar os itens do pedido.
    """
    # Verifica se o pedido existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        pedido_atual = cursor.fetchone()
        
        if not pedido_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de compra não encontrado"
            )
        
        # Verifica se o pedido pode ser alterado
        if pedido_atual["status"] in ["recebido", "cancelado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível alterar um pedido com status '{pedido_atual['status']}'"
            )
        
        # Verifica se o fornecedor existe (se fornecido)
        if pedido.fornecedor_id:
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (pedido.fornecedor_id,)
            )
            fornecedor = cursor.fetchone()
            
            if not fornecedor:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Fornecedor não encontrado"
                )
            
            if fornecedor["tipo"] not in ["fornecedor", "ambos"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="O parceiro selecionado não é um fornecedor"
                )
        
        # Verifica se o status é válido (se fornecido)
        if pedido.status and pedido.status not in ["pendente", "aprovado", "recebido", "cancelado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'pendente', 'aprovado', 'recebido' ou 'cancelado'"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if pedido.fornecedor_id is not None:
        update_data["fornecedor_id"] = pedido.fornecedor_id
    if pedido.data_previsao is not None:
        update_data["data_previsao"] = pedido.data_previsao
    if pedido.status is not None:
        update_data["status"] = pedido.status
    if pedido.observacoes is not None:
        update_data["observacoes"] = pedido.observacoes
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o pedido
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(pedido_id)
        
        cursor.execute(
            f"UPDATE pedidos_compra SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        pedido_atualizado = cursor.fetchone()
        
        # Converte o campo data_pedido de datetime para string
        if "data_pedido" in pedido_atualizado and pedido_atualizado["data_pedido"]:
            pedido_atualizado["data_pedido"] = pedido_atualizado["data_pedido"].isoformat()
    
    return pedido_atualizado

@router.delete("/{pedido_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_pedido_compra(
    pedido_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um pedido de compra do sistema.
    Só permite excluir pedidos com status 'pendente'.
    """
    # Verifica se o pedido existe e pode ser excluído
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de compra não encontrado"
            )
        
        if pedido["status"] != "pendente":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível excluir pedidos com status 'pendente'"
            )
    
    # Exclui o pedido e seus itens
    with get_db_cursor(commit=True) as cursor:
        # Exclui os itens do pedido
        cursor.execute(
            "DELETE FROM itens_pedido_compra WHERE pedido_id = %s",
            (pedido_id,)
        )
        
        # Exclui o pedido
        cursor.execute(
            "DELETE FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
    
    return None
