from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class CondicaoPagamentoBase(BaseModel):
    codigo: str
    nome: str
    prazo_dias: int
    numero_parcelas: int
    ativo: bool = True

class CondicaoPagamentoCreate(CondicaoPagamentoBase):
    pass

class CondicaoPagamentoUpdate(BaseModel):
    codigo: Optional[str] = None
    nome: Optional[str] = None
    prazo_dias: Optional[int] = None
    numero_parcelas: Optional[int] = None
    ativo: Optional[bool] = None

class CondicaoPagamento(CondicaoPagamentoBase):
    id: int
    data_cadastro: datetime

# Rotas
@router.get("/", response_model=List[CondicaoPagamento])
async def listar_condicoes_pagamento(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as condições de pagamento cadastradas no sistema.
    Pode filtrar por status ativo/inativo.
    """
    query = "SELECT * FROM condicoes_pagamento WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    query += " ORDER BY codigo ASC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        condicoes = cursor.fetchall()
    
    return condicoes

@router.get("/{condicao_id}", response_model=CondicaoPagamento)
async def obter_condicao_pagamento(
    condicao_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma condição de pagamento específica.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
        condicao = cursor.fetchone()
        
        if not condicao:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Condição de pagamento não encontrada"
            )
    
    return condicao

@router.post("/", response_model=CondicaoPagamento, status_code=status.HTTP_201_CREATED)
async def criar_condicao_pagamento(
    condicao: CondicaoPagamentoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova condição de pagamento no sistema.
    """
    # Verifica se o código já existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM condicoes_pagamento WHERE codigo = %s",
            (condicao.codigo,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe uma condição de pagamento com este código"
            )
        
        # Valida os dados
        if condicao.prazo_dias < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O prazo em dias não pode ser negativo"
            )
        
        if condicao.numero_parcelas <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O número de parcelas deve ser maior que zero"
            )
    
    # Insere a condição de pagamento
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO condicoes_pagamento (codigo, nome, prazo_dias, numero_parcelas, ativo)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (condicao.codigo, condicao.nome, condicao.prazo_dias, condicao.numero_parcelas, condicao.ativo)
        )
        
        # Obtém o ID da condição criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        condicao_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados da condição criada
        cursor.execute(
            "SELECT * FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
        nova_condicao = cursor.fetchone()
    
    return nova_condicao

@router.put("/{condicao_id}", response_model=CondicaoPagamento)
async def atualizar_condicao_pagamento(
    condicao_id: int,
    condicao: CondicaoPagamentoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma condição de pagamento existente.
    """
    # Verifica se a condição existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
        condicao_atual = cursor.fetchone()
        
        if not condicao_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Condição de pagamento não encontrada"
            )
        
        # Verifica se o código já existe (se foi alterado)
        if condicao.codigo and condicao.codigo != condicao_atual["codigo"]:
            cursor.execute(
                "SELECT id FROM condicoes_pagamento WHERE codigo = %s",
                (condicao.codigo,)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe uma condição de pagamento com este código"
                )
        
        # Valida os dados
        if condicao.prazo_dias is not None and condicao.prazo_dias < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O prazo em dias não pode ser negativo"
            )
        
        if condicao.numero_parcelas is not None and condicao.numero_parcelas <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O número de parcelas deve ser maior que zero"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if condicao.codigo is not None:
        update_data["codigo"] = condicao.codigo
    if condicao.nome is not None:
        update_data["nome"] = condicao.nome
    if condicao.prazo_dias is not None:
        update_data["prazo_dias"] = condicao.prazo_dias
    if condicao.numero_parcelas is not None:
        update_data["numero_parcelas"] = condicao.numero_parcelas
    if condicao.ativo is not None:
        update_data["ativo"] = condicao.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza a condição de pagamento
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(condicao_id)
        
        cursor.execute(
            f"UPDATE condicoes_pagamento SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
        condicao_atualizada = cursor.fetchone()
    
    return condicao_atualizada

@router.delete("/{condicao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_condicao_pagamento(
    condicao_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma condição de pagamento do sistema.
    Só permite excluir se não estiver sendo usada em pedidos.
    """
    # Verifica se a condição existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Condição de pagamento não encontrada"
            )
        
        # Verifica se a condição está sendo usada em pedidos
        cursor.execute(
            "SELECT COUNT(*) as count FROM pedidos_venda WHERE condicao_pagamento_id = %s",
            (condicao_id,)
        )
        count = cursor.fetchone()["count"]
        
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível excluir esta condição de pagamento pois está sendo usada em {count} pedido(s)"
            )
    
    # Exclui a condição de pagamento
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM condicoes_pagamento WHERE id = %s",
            (condicao_id,)
        )
    
    return None
