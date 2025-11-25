from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ContaReceberBase(BaseModel):
    cliente_id: Optional[int] = None
    descricao: str
    valor: float
    data_vencimento: date
    pedido_venda_id: Optional[int] = None
    documento_referencia: Optional[str] = None
    observacoes: Optional[str] = None

class ContaReceberCreate(ContaReceberBase):
    pass

class ContaReceberUpdate(BaseModel):
    cliente_id: Optional[int] = None
    descricao: Optional[str] = None
    valor: Optional[float] = None
    data_vencimento: Optional[date] = None
    data_recebimento: Optional[date] = None
    documento_referencia: Optional[str] = None
    status: Optional[str] = None
    observacoes: Optional[str] = None

class ContaReceber(ContaReceberBase):
    id: int
    codigo: str
    data_emissao: datetime
    data_recebimento: Optional[date] = None
    status: str
    usuario_id: int
    cliente_nome: Optional[str] = None

# Rotas
@router.get("/", response_model=List[ContaReceber])
async def listar_contas_receber(
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
    vencimento_inicio: Optional[date] = None,
    vencimento_fim: Optional[date] = None,
    descricao_contem: Optional[str] = None,
    documento_referencia: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as contas a receber cadastradas no sistema.
    Pode filtrar por status, cliente, período de vencimento, descrição e documento_referencia (código do pedido).
    """
    query = (
        "SELECT cr.*, "
        "p.nome AS cliente_nome "
        "FROM contas_receber cr "
        "LEFT JOIN parceiros p ON cr.cliente_id = p.id "
        "WHERE 1=1"
    )
    params = []
    
    if status is not None:
        query += " AND cr.status = %s"
        params.append(status)
    
    if cliente_id is not None:
        query += " AND cr.cliente_id = %s"
        params.append(cliente_id)
    
    if vencimento_inicio is not None:
        query += " AND cr.data_vencimento >= %s"
        params.append(vencimento_inicio)
    
    if vencimento_fim is not None:
        query += " AND cr.data_vencimento <= %s"
        params.append(vencimento_fim)
    
    if descricao_contem is not None:
        query += " AND cr.descricao LIKE %s"
        params.append(f"%{descricao_contem}%")
    
    if documento_referencia is not None:
        query += " AND cr.documento_referencia = %s"
        params.append(documento_referencia)
    
    query += " ORDER BY cr.data_vencimento ASC"
    
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
    Se o pedido de venda tiver uma condição de pagamento, cria múltiplas parcelas.
    """
    from datetime import timedelta
    
    # Verifica se o cliente existe (se fornecido)
    if conta.cliente_id:
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
    
    # Verifica se o pedido de venda existe (se fornecido) e busca a condição de pagamento
    numero_parcelas = 1
    prazo_dias = 30
    
    if conta.pedido_venda_id:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id, condicao_pagamento_id FROM pedidos_venda WHERE id = %s",
                (conta.pedido_venda_id,)
            )
            pedido = cursor.fetchone()
            
            if not pedido:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Pedido de venda não encontrado"
                )
            
            # Se o pedido tem condição de pagamento, busca os dados
            if pedido["condicao_pagamento_id"]:
                cursor.execute(
                    "SELECT numero_parcelas, prazo_dias FROM condicoes_pagamento WHERE id = %s",
                    (pedido["condicao_pagamento_id"],)
                )
                condicao = cursor.fetchone()
                if condicao:
                    numero_parcelas = condicao["numero_parcelas"]
                    prazo_dias = condicao["prazo_dias"]
    
    # Calcula dias por parcela
    dias_por_parcela = prazo_dias // numero_parcelas if numero_parcelas > 0 else prazo_dias
    
    # Cria uma conta a receber para cada parcela
    primeira_conta = None
    with get_db_cursor(commit=True) as cursor:
        for parcela_num in range(1, numero_parcelas + 1):
            # Gera o código da conta (formato: CR + ano + sequencial)
            cursor.execute("SELECT YEAR(NOW()) as ano")
            ano = cursor.fetchone()["ano"]
            
            cursor.execute(
                "SELECT COUNT(*) + 1 as seq FROM contas_receber WHERE YEAR(data_emissao) = %s",
                (ano,)
            )
            seq = cursor.fetchone()["seq"]
            
            codigo = f"CR{ano}{seq:04d}"
            
            # Calcula data de vencimento para esta parcela
            data_vencimento = conta.data_vencimento + timedelta(days=dias_por_parcela * (parcela_num - 1))
            
            # Calcula o valor da parcela (divide o total pelo número de parcelas)
            valor_parcela = conta.valor / numero_parcelas
            
            # Monta a descrição com o número da parcela (se houver múltiplas)
            if numero_parcelas > 1:
                descricao = f"{conta.descricao} - Parcela {parcela_num}/{numero_parcelas}"
            else:
                descricao = conta.descricao
            
            # Insere a conta a receber
            cursor.execute(
                """
                INSERT INTO contas_receber (
                    codigo, cliente_id, descricao, valor, data_vencimento,
                    pedido_venda_id, documento_referencia, status, observacoes, usuario_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pendente', %s, %s)
                """,
                (
                    codigo, conta.cliente_id, descricao, valor_parcela,
                    data_vencimento, conta.pedido_venda_id, conta.documento_referencia,
                    conta.observacoes, current_user.id
                )
            )
            
            # Armazena a primeira conta criada para retornar
            if parcela_num == 1:
                cursor.execute("SELECT LAST_INSERT_ID()")
                conta_id = cursor.fetchone()["LAST_INSERT_ID()"]
                
                cursor.execute(
                    "SELECT * FROM contas_receber WHERE id = %s",
                    (conta_id,)
                )
                primeira_conta = cursor.fetchone()
    
    return primeira_conta

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
        if conta_atual["status"] == "recebido" and current_user.nivel_acesso != "admin":
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
