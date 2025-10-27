from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ContaReceberBase(BaseModel):
    cliente_id: int
    descricao: str
    valor: float
    data_vencimento: date
    pedido_venda_id: Optional[int] = None
    forma_pagamento: str = "dinheiro"
    observacoes: Optional[str] = None

class ContaReceberCreate(ContaReceberBase):
    pass

class ContaReceberUpdate(BaseModel):
    cliente_id: Optional[int] = None
    descricao: Optional[str] = None
    valor: Optional[float] = None
    data_vencimento: Optional[date] = None
    data_recebimento: Optional[date] = None
    status: Optional[str] = None
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None

class ContaReceber(ContaReceberBase):
    id: int
    codigo: str
    data_emissao: str
    data_recebimento: Optional[date] = None
    status: str
    usuario_id: int

# Rotas
@router.get("/", response_model=List[ContaReceber])
async def listar_contas_receber(
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
    vencimento_inicio: Optional[date] = None,
    vencimento_fim: Optional[date] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as contas a receber cadastradas no sistema.
    Pode filtrar por status, cliente e período de vencimento.
    """
    query = "SELECT * FROM contas_receber WHERE 1=1"
    params = []
    
    if status is not None:
        query += " AND status = %s"
        params.append(status)
    
    if cliente_id is not None:
        query += " AND cliente_id = %s"
        params.append(cliente_id)
    
    if vencimento_inicio is not None:
        query += " AND data_vencimento >= %s"
        params.append(vencimento_inicio)
    
    if vencimento_fim is not None:
        query += " AND data_vencimento <= %s"
        params.append(vencimento_fim)
    
    query += " ORDER BY data_vencimento"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        contas = cursor.fetchall()
    
    return contas

@router.get("/{conta_id}", response_model=ContaReceber)
async def obter_conta_receber(
    conta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma conta a receber específica.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
        conta = cursor.fetchone()
    
    if not conta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conta a receber não encontrada"
        )
    
    return conta

@router.post("/", response_model=ContaReceber, status_code=status.HTTP_201_CREATED)
async def criar_conta_receber(
    conta: ContaReceberCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova conta a receber no sistema.
    """
    # Verifica se o cliente existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, tipo FROM parceiros WHERE id = %s",
            (conta.cliente_id,)
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
        
        # Verifica se o pedido de venda existe (se fornecido)
        if conta.pedido_venda_id:
            cursor.execute(
                "SELECT id FROM pedidos_venda WHERE id = %s",
                (conta.pedido_venda_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Pedido de venda não encontrado"
                )
        
        # Verifica se a forma de pagamento é válida
        formas_pagamento = ["dinheiro", "cartao", "boleto", "pix", "transferencia", "cheque"]
        if conta.forma_pagamento not in formas_pagamento:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Forma de pagamento inválida. Deve ser uma das seguintes: {', '.join(formas_pagamento)}"
            )
    
    # Cria a conta a receber
    with get_db_cursor(commit=True) as cursor:
        # Gera o código da conta (formato: CR + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM contas_receber WHERE YEAR(data_emissao) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"CR{ano}{seq:04d}"
        
        # Insere a conta a receber
        cursor.execute(
            """
            INSERT INTO contas_receber (
                codigo, cliente_id, descricao, valor, data_vencimento,
                pedido_venda_id, status, forma_pagamento, observacoes, usuario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'pendente', %s, %s, %s)
            """,
            (
                codigo, conta.cliente_id, conta.descricao, conta.valor,
                conta.data_vencimento, conta.pedido_venda_id,
                conta.forma_pagamento, conta.observacoes, current_user.id
            )
        )
        
        # Obtém o ID da conta criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        conta_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados da conta criada
        cursor.execute(
            "SELECT * FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
        nova_conta = cursor.fetchone()
    
    return nova_conta

@router.put("/{conta_id}", response_model=ContaReceber)
async def atualizar_conta_receber(
    conta_id: int,
    conta: ContaReceberUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma conta a receber existente.
    """
    # Verifica se a conta existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
        conta_atual = cursor.fetchone()
        
        if not conta_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conta a receber não encontrada"
            )
        
        # Verifica se a conta pode ser alterada
        if conta_atual["status"] == "recebido" and not current_user.admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível alterar uma conta já recebida (apenas administradores podem)"
            )
        
        # Verifica se o cliente existe (se fornecido)
        if conta.cliente_id:
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (conta.cliente_id,)
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
        
        # Verifica se o status é válido (se fornecido)
        if conta.status and conta.status not in ["pendente", "recebido", "cancelado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'pendente', 'recebido' ou 'cancelado'"
            )
        
        # Verifica se a forma de pagamento é válida (se fornecida)
        if conta.forma_pagamento:
            formas_pagamento = ["dinheiro", "cartao", "boleto", "pix", "transferencia", "cheque"]
            if conta.forma_pagamento not in formas_pagamento:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Forma de pagamento inválida. Deve ser uma das seguintes: {', '.join(formas_pagamento)}"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if conta.cliente_id is not None:
        update_data["cliente_id"] = conta.cliente_id
    if conta.descricao is not None:
        update_data["descricao"] = conta.descricao
    if conta.valor is not None:
        update_data["valor"] = conta.valor
    if conta.data_vencimento is not None:
        update_data["data_vencimento"] = conta.data_vencimento
    if conta.data_recebimento is not None:
        update_data["data_recebimento"] = conta.data_recebimento
    if conta.status is not None:
        update_data["status"] = conta.status
    if conta.forma_pagamento is not None:
        update_data["forma_pagamento"] = conta.forma_pagamento
    if conta.observacoes is not None:
        update_data["observacoes"] = conta.observacoes
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Se o status for alterado para "recebido" e não foi fornecida data de recebimento, usa a data atual
    if update_data.get("status") == "recebido" and "data_recebimento" not in update_data:
        update_data["data_recebimento"] = date.today()
    
    # Atualiza a conta
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(conta_id)
        
        cursor.execute(
            f"UPDATE contas_receber SET {set_clause} WHERE id = %s",
            values
        )
        
        # Se o status foi alterado para "recebido", registra o movimento de caixa
        if update_data.get("status") == "recebido" and conta_atual["status"] != "recebido":
            # Obtém os dados atualizados da conta
            cursor.execute(
                "SELECT * FROM contas_receber WHERE id = %s",
                (conta_id,)
            )
            conta_atualizada = cursor.fetchone()
            
            # Registra o movimento de caixa
            cursor.execute(
                """
                INSERT INTO movimentos_caixa (
                    tipo, valor, data_movimento, descricao,
                    documento_referencia, usuario_id
                )
                VALUES ('entrada', %s, %s, %s, %s, %s)
                """,
                (
                    conta_atualizada["valor"], conta_atualizada["data_recebimento"],
                    f"Recebimento de conta: {conta_atualizada['descricao']}",
                    conta_atualizada["codigo"], current_user.id
                )
            )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
        conta_atualizada = cursor.fetchone()
    
    return conta_atualizada

@router.delete("/{conta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_conta_receber(
    conta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma conta a receber do sistema.
    Só permite excluir contas com status 'pendente'.
    """
    # Verifica se a conta existe e pode ser excluída
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
        conta = cursor.fetchone()
        
        if not conta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conta a receber não encontrada"
            )
        
        if conta["status"] != "pendente":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível excluir contas com status 'pendente'"
            )
    
    # Exclui a conta
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM contas_receber WHERE id = %s",
            (conta_id,)
        )
    
    return None
