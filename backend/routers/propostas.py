from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ItemPropostaBase(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float
    desconto: float = 0

class ItemPropostaCreate(ItemPropostaBase):
    pass

class ItemProposta(ItemPropostaBase):
    id: int
    subtotal: float
    proposta_id: int

class PropostaBase(BaseModel):
    cliente_id: int
    vendedor_id: int
    validade: date
    condicoes_pagamento: str
    prazo_entrega: str
    observacoes: Optional[str] = None

class PropostaCreate(PropostaBase):
    itens: List[ItemPropostaCreate]

class PropostaUpdate(BaseModel):
    cliente_id: Optional[int] = None
    vendedor_id: Optional[int] = None
    validade: Optional[date] = None
    status: Optional[str] = None
    condicoes_pagamento: Optional[str] = None
    prazo_entrega: Optional[str] = None
    observacoes: Optional[str] = None

class Proposta(PropostaBase):
    id: int
    codigo: str
    data_proposta: str
    status: str
    valor_total: float
    usuario_id: int

class PropostaDetalhada(Proposta):
    itens: List[ItemProposta]

# Rotas
@router.get("/", response_model=List[Proposta])
async def listar_propostas(
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as propostas comerciais cadastradas no sistema.
    Pode filtrar por status, cliente e vendedor.
    """
    query = "SELECT * FROM propostas_comerciais WHERE 1=1"
    params = []
    
    if status is not None:
        query += " AND status = %s"
        params.append(status)
    
    if cliente_id is not None:
        query += " AND cliente_id = %s"
        params.append(cliente_id)
    
    if vendedor_id is not None:
        query += " AND vendedor_id = %s"
        params.append(vendedor_id)
    
    query += " ORDER BY data_proposta DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        propostas = cursor.fetchall()
    
    return propostas

@router.get("/{proposta_id}", response_model=PropostaDetalhada)
async def obter_proposta(
    proposta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma proposta comercial específica, incluindo seus itens.
    """
    with get_db_cursor() as cursor:
        # Obtém os dados da proposta
        cursor.execute(
            "SELECT * FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        proposta = cursor.fetchone()
        
        if not proposta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposta comercial não encontrada"
            )
        
        # Obtém os itens da proposta
        cursor.execute(
            "SELECT * FROM itens_proposta WHERE proposta_id = %s",
            (proposta_id,)
        )
        itens = cursor.fetchall()
        
        # Monta o objeto de resposta
        proposta_detalhada = dict(proposta)
        proposta_detalhada["itens"] = itens
    
    return proposta_detalhada

@router.post("/", response_model=PropostaDetalhada, status_code=status.HTTP_201_CREATED)
async def criar_proposta(
    proposta: PropostaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova proposta comercial no sistema, incluindo seus itens.
    """
    # Verifica se o cliente existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, tipo FROM parceiros WHERE id = %s",
            (proposta.cliente_id,)
        )
        cliente = cursor.fetchone()
        
        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cliente não encontrado"
            )
        
        if cliente["tipo"] not in ["cliente", "ambos"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O parceiro selecionado não é um cliente"
            )
        
        # Verifica se o vendedor existe
        cursor.execute(
            "SELECT id FROM vendedores WHERE id = %s",
            (proposta.vendedor_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendedor não encontrado"
            )
        
        # Verifica se existem itens na proposta
        if not proposta.itens or len(proposta.itens) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A proposta deve conter pelo menos um item"
            )
        
        # Verifica se os produtos existem
        produto_ids = [item.produto_id for item in proposta.itens]
        placeholders = ", ".join(["%s"] * len(produto_ids))
        cursor.execute(
            f"SELECT id, nome, preco_venda FROM produtos WHERE id IN ({placeholders})",
            produto_ids
        )
        produtos = {produto["id"]: produto for produto in cursor.fetchall()}
        
        for item in proposta.itens:
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
    
    # Cria a proposta e seus itens
    with get_db_cursor(commit=True) as cursor:
        # Gera o código da proposta (formato: PC + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM propostas_comerciais WHERE YEAR(data_proposta) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"PC{ano}{seq:04d}"
        
        # Calcula o valor total da proposta
        valor_total = sum((item.preco_unitario - item.desconto) * item.quantidade for item in proposta.itens)
        
        # Insere a proposta
        cursor.execute(
            """
            INSERT INTO propostas_comerciais (
                codigo, cliente_id, vendedor_id, validade, status,
                condicoes_pagamento, prazo_entrega, valor_total,
                observacoes, usuario_id
            )
            VALUES (%s, %s, %s, %s, 'aberta', %s, %s, %s, %s, %s)
            """,
            (
                codigo, proposta.cliente_id, proposta.vendedor_id, proposta.validade,
                proposta.condicoes_pagamento, proposta.prazo_entrega, valor_total,
                proposta.observacoes, current_user.id
            )
        )
        
        # Obtém o ID da proposta criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        proposta_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Insere os itens da proposta
        for item in proposta.itens:
            subtotal = (item.preco_unitario - item.desconto) * item.quantidade
            
            cursor.execute(
                """
                INSERT INTO itens_proposta (
                    proposta_id, produto_id, quantidade, preco_unitario,
                    desconto, subtotal
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    proposta_id, item.produto_id, item.quantidade,
                    item.preco_unitario, item.desconto, subtotal
                )
            )
        
        # Obtém os dados da proposta criada
        cursor.execute(
            "SELECT * FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        nova_proposta = cursor.fetchone()
        
        # Obtém os itens da proposta criada
        cursor.execute(
            "SELECT * FROM itens_proposta WHERE proposta_id = %s",
            (proposta_id,)
        )
        itens = cursor.fetchall()
        
        # Monta o objeto de resposta
        proposta_detalhada = dict(nova_proposta)
        proposta_detalhada["itens"] = itens
    
    return proposta_detalhada

@router.put("/{proposta_id}", response_model=Proposta)
async def atualizar_proposta(
    proposta_id: int,
    proposta: PropostaUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma proposta comercial existente.
    Não permite alterar os itens da proposta.
    """
    # Verifica se a proposta existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        proposta_atual = cursor.fetchone()
        
        if not proposta_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposta comercial não encontrada"
            )
        
        # Verifica se a proposta pode ser alterada
        if proposta_atual["status"] in ["aprovada", "rejeitada", "expirada"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível alterar uma proposta com status '{proposta_atual['status']}'"
            )
        
        # Verifica se o cliente existe (se fornecido)
        if proposta.cliente_id:
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (proposta.cliente_id,)
            )
            cliente = cursor.fetchone()
            
            if not cliente:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cliente não encontrado"
                )
            
            if cliente["tipo"] not in ["cliente", "ambos"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="O parceiro selecionado não é um cliente"
                )
        
        # Verifica se o vendedor existe (se fornecido)
        if proposta.vendedor_id:
            cursor.execute(
                "SELECT id FROM vendedores WHERE id = %s",
                (proposta.vendedor_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vendedor não encontrado"
                )
        
        # Verifica se o status é válido (se fornecido)
        if proposta.status and proposta.status not in ["aberta", "enviada", "aprovada", "rejeitada", "expirada"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'aberta', 'enviada', 'aprovada', 'rejeitada' ou 'expirada'"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if proposta.cliente_id is not None:
        update_data["cliente_id"] = proposta.cliente_id
    if proposta.vendedor_id is not None:
        update_data["vendedor_id"] = proposta.vendedor_id
    if proposta.validade is not None:
        update_data["validade"] = proposta.validade
    if proposta.status is not None:
        update_data["status"] = proposta.status
    if proposta.condicoes_pagamento is not None:
        update_data["condicoes_pagamento"] = proposta.condicoes_pagamento
    if proposta.prazo_entrega is not None:
        update_data["prazo_entrega"] = proposta.prazo_entrega
    if proposta.observacoes is not None:
        update_data["observacoes"] = proposta.observacoes
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza a proposta
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(proposta_id)
        
        cursor.execute(
            f"UPDATE propostas_comerciais SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        proposta_atualizada = cursor.fetchone()
    
    return proposta_atualizada

@router.delete("/{proposta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_proposta(
    proposta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma proposta comercial do sistema.
    Só permite excluir propostas com status 'aberta'.
    """
    # Verifica se a proposta existe e pode ser excluída
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        proposta = cursor.fetchone()
        
        if not proposta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposta comercial não encontrada"
            )
        
        if proposta["status"] != "aberta":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível excluir propostas com status 'aberta'"
            )
    
    # Exclui a proposta
    with get_db_cursor(commit=True) as cursor:
        # Exclui os itens da proposta
        cursor.execute(
            "DELETE FROM itens_proposta WHERE proposta_id = %s",
            (proposta_id,)
        )
        
        # Exclui a proposta
        cursor.execute(
            "DELETE FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
    
    return None

@router.post("/{proposta_id}/converter-pedido", status_code=status.HTTP_201_CREATED)
async def converter_proposta_em_pedido(
    proposta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Converte uma proposta comercial aprovada em um pedido de venda.
    """
    # Verifica se a proposta existe e pode ser convertida
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM propostas_comerciais WHERE id = %s",
            (proposta_id,)
        )
        proposta = cursor.fetchone()
        
        if not proposta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposta comercial não encontrada"
            )
        
        if proposta["status"] != "aprovada":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível converter propostas com status 'aprovada'"
            )
        
        # Obtém os itens da proposta
        cursor.execute(
            "SELECT * FROM itens_proposta WHERE proposta_id = %s",
            (proposta_id,)
        )
        itens_proposta = cursor.fetchall()
        
        if not itens_proposta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A proposta não possui itens"
            )
        
        # Verifica se há estoque suficiente para todos os produtos
        for item in itens_proposta:
            cursor.execute(
                "SELECT id, nome, estoque_atual FROM produtos WHERE id = %s",
                (item["produto_id"],)
            )
            produto = cursor.fetchone()
            
            if produto["estoque_atual"] < item["quantidade"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Estoque insuficiente para o produto {produto['nome']}. Disponível: {produto['estoque_atual']}"
                )
    
    # Converte a proposta em pedido
    with get_db_cursor(commit=True) as cursor:
        # Gera o código do pedido (formato: PV + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM pedidos_venda WHERE YEAR(data_pedido) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"PV{ano}{seq:04d}"
        
        # Insere o pedido
        cursor.execute(
            """
            INSERT INTO pedidos_venda (
                codigo, cliente_id, vendedor_id, status,
                valor_produtos, valor_frete, valor_desconto, valor_total,
                forma_pagamento, observacoes, usuario_id
            )
            VALUES (%s, %s, %s, 'pendente', %s, 0, 0, %s, 'dinheiro', %s, %s)
            """,
            (
                codigo, proposta["cliente_id"], proposta["vendedor_id"],
                proposta["valor_total"], proposta["valor_total"],
                f"Pedido gerado a partir da proposta {proposta['codigo']}", current_user.id
            )
        )
        
        # Obtém o ID do pedido criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        pedido_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Insere os itens do pedido
        for item in itens_proposta:
            cursor.execute(
                """
                INSERT INTO itens_pedido_venda (
                    pedido_id, produto_id, quantidade, preco_unitario,
                    desconto, subtotal
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    pedido_id, item["produto_id"], item["quantidade"],
                    item["preco_unitario"], item["desconto"], item["subtotal"]
                )
            )
            
            # Atualiza o estoque do produto
            cursor.execute(
                "UPDATE produtos SET estoque_atual = estoque_atual - %s WHERE id = %s",
                (item["quantidade"], item["produto_id"])
            )
            
            # Registra a movimentação de estoque
            cursor.execute(
                """
                INSERT INTO movimentacao_estoque (
                    produto_id, tipo, quantidade, motivo,
                    documento_referencia, usuario_id
                )
                VALUES (%s, 'saida', %s, 'Pedido de venda (convertido de proposta)', %s, %s)
                """,
                (
                    item["produto_id"], item["quantidade"], codigo, current_user.id
                )
            )
        
        # Atualiza o status da proposta
        cursor.execute(
            "UPDATE propostas_comerciais SET status = 'convertida' WHERE id = %s",
            (proposta_id,)
        )
        
        # Obtém os dados do pedido criado
        cursor.execute(
            "SELECT * FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        novo_pedido = cursor.fetchone()
    
    return {
        "message": "Proposta convertida em pedido com sucesso",
        "pedido": novo_pedido
    }
