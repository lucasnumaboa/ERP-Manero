from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ContaPagarBase(BaseModel):
    fornecedor_id: Optional[int] = None
    vendedor_id: Optional[int] = None
    descricao: str
    valor: float
    data_vencimento: date
    pedido_venda_id: Optional[int] = None
    documento_referencia: Optional[str] = None
    forma_pagamento: str = "dinheiro"
    observacoes: Optional[str] = None

class ContaPagarCreate(ContaPagarBase):
    pass

class ContaPagarUpdate(BaseModel):
    fornecedor_id: Optional[int] = None
    vendedor_id: Optional[int] = None
    descricao: Optional[str] = None
    valor: Optional[float] = None
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    pedido_venda_id: Optional[int] = None
    documento_referencia: Optional[str] = None
    status: Optional[str] = None
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None

class ContaPagar(ContaPagarBase):
    id: int
    codigo: str
    data_emissao: datetime
    data_pagamento: Optional[date] = None
    status: str
    usuario_id: int
    fornecedor_nome: Optional[str] = None
    vendedor_nome: Optional[str] = None

# Rotas
@router.get("/", response_model=List[ContaPagar])
async def listar_contas_pagar(
    status: Optional[str] = None,
    fornecedor_id: Optional[int] = None,
    vencimento_inicio: Optional[date] = None,
    vencimento_fim: Optional[date] = None,
    descricao_contem: Optional[str] = None,
    documento_referencia: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as contas a pagar cadastradas no sistema.
    Pode filtrar por status, fornecedor, período de vencimento, descrição e documento_referencia (código do pedido).
    """
    query = (
        "SELECT cp.*, "
        "f.nome AS fornecedor_nome, "
        "v.nome AS vendedor_nome "
        "FROM contas_pagar cp "
        "LEFT JOIN parceiros f ON cp.fornecedor_id = f.id "
        "LEFT JOIN vendedores v ON cp.vendedor_id = v.id "
        "WHERE 1=1"
    )
    params = []
    
    if status is not None:
        query += " AND cp.status = %s"
        params.append(status)
    
    if fornecedor_id is not None:
        query += " AND cp.fornecedor_id = %s"
        params.append(fornecedor_id)
    
    if vencimento_inicio is not None:
        query += " AND cp.data_vencimento >= %s"
        params.append(vencimento_inicio)
    
    if vencimento_fim is not None:
        query += " AND cp.data_vencimento <= %s"
        params.append(vencimento_fim)
    
    if descricao_contem is not None:
        query += " AND cp.descricao LIKE %s"
        params.append(f"%{descricao_contem}%")
    
    if documento_referencia is not None:
        query += " AND cp.documento_referencia = %s"
        params.append(documento_referencia)
    
    query += " ORDER BY cp.data_vencimento ASC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        contas = cursor.fetchall()
    
    return contas

@router.get("/{conta_id}", response_model=ContaPagar)
async def obter_conta_pagar(
    conta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma conta a pagar específica.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
        conta = cursor.fetchone()
    
    if not conta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conta a pagar não encontrada"
        )
    
    return conta

@router.post("/", response_model=ContaPagar, status_code=status.HTTP_201_CREATED)
async def criar_conta_pagar(
    conta: ContaPagarCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova conta a pagar no sistema.
    """
    # Verifica se o fornecedor existe (se fornecido)
    if conta.fornecedor_id:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (conta.fornecedor_id,)
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
    
    # Verifica se o vendedor existe (se fornecido)
    if conta.vendedor_id:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM vendedores WHERE id = %s",
                (conta.vendedor_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vendedor não encontrado"
                )
    
    # Verifica se a forma de pagamento é válida
    formas_pagamento = ["dinheiro", "cartao", "boleto", "pix", "transferencia", "cheque"]
    if conta.forma_pagamento not in formas_pagamento:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Forma de pagamento inválida. Deve ser uma das seguintes: {', '.join(formas_pagamento)}"
        )
    
    # Cria a conta a pagar
    with get_db_cursor(commit=True) as cursor:
        # Gera o código da conta (formato: CP + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM contas_pagar WHERE YEAR(data_emissao) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"CP{ano}{seq:04d}"
        
        # Insere a conta a pagar
        cursor.execute(
            """
            INSERT INTO contas_pagar (
                codigo, fornecedor_id, vendedor_id, descricao, valor, data_vencimento,
                pedido_venda_id, documento_referencia, status, forma_pagamento, observacoes, usuario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pendente', %s, %s, %s)
            """,
            (
                codigo, conta.fornecedor_id, conta.vendedor_id, conta.descricao, conta.valor,
                conta.data_vencimento, conta.pedido_venda_id, conta.documento_referencia, conta.forma_pagamento, conta.observacoes, current_user.id
            )
        )
        
        # Obtém o ID da conta criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        conta_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados da conta criada
        cursor.execute(
            "SELECT * FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
        nova_conta = cursor.fetchone()
    
    return nova_conta

@router.put("/{conta_id}", response_model=ContaPagar)
async def atualizar_conta_pagar(
    conta_id: int,
    conta: ContaPagarUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma conta a pagar existente.
    """
    # Verifica se a conta existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
        conta_atual = cursor.fetchone()
        
        if not conta_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conta a pagar não encontrada"
            )
        
        # Verifica se a conta pode ser alterada
        if conta_atual["status"] == "pago" and current_user.nivel_acesso != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível alterar uma conta já paga (apenas administradores podem)"
            )
        
        # Verifica se o fornecedor existe (se fornecido)
        if conta.fornecedor_id:
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (conta.fornecedor_id,)
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
        if conta.status and conta.status not in ["pendente", "pago", "cancelado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'pendente', 'pago' ou 'cancelado'"
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
    if conta.descricao is not None:
        update_data["descricao"] = conta.descricao
    if conta.fornecedor_id is not None:
        update_data["fornecedor_id"] = conta.fornecedor_id
    if conta.vendedor_id is not None:
        update_data["vendedor_id"] = conta.vendedor_id
    if conta.valor is not None:
        update_data["valor"] = conta.valor
    if conta.data_vencimento is not None:
        update_data["data_vencimento"] = conta.data_vencimento
    if conta.data_pagamento is not None:
        update_data["data_pagamento"] = conta.data_pagamento
    if conta.documento_referencia is not None:
        update_data["documento_referencia"] = conta.documento_referencia
    if conta.status is not None:
        update_data["status"] = conta.status
    if conta.observacoes is not None:
        update_data["observacoes"] = conta.observacoes
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Se o status for alterado para "pago" e não foi fornecida data de pagamento, usa a data atual
    if update_data.get("status") == "pago" and "data_pagamento" not in update_data:
        update_data["data_pagamento"] = date.today()
    
    # Atualiza a conta
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(conta_id)
        
        cursor.execute(
            f"UPDATE contas_pagar SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
        conta_atualizada = cursor.fetchone()
    
    return conta_atualizada

@router.delete("/{conta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_conta_pagar(
    conta_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma conta a pagar do sistema.
    Só permite excluir contas com status 'pendente'.
    """
    # Verifica se a conta existe e pode ser excluída
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
        conta = cursor.fetchone()
        
        if not conta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conta a pagar não encontrada"
            )
        
        if conta["status"] != "pendente":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível excluir contas com status 'pendente'"
            )
    
    # Exclui a conta
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM contas_pagar WHERE id = %s",
            (conta_id,)
        )
    
    return None
