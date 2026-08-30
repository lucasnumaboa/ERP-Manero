from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class DepositoBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    padrao: bool = False
    ativo: bool = True

class DepositoCreate(DepositoBase):
    pass

class DepositoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    padrao: Optional[bool] = None
    ativo: Optional[bool] = None

class Deposito(DepositoBase):
    id: int

# Rotas
@router.get("/", response_model=List[dict])
async def listar_depositos(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os depósitos cadastrados no sistema.
    Pode filtrar por status (ativo/inativo).
    Inclui a contagem de produtos vinculados a cada depósito.
    """
    query = """
    SELECT d.*, COUNT(p.id) as produtos_count
    FROM depositos d
    LEFT JOIN produtos p ON d.id = p.deposito_id
    WHERE 1=1
    """
    params = []

    if ativo is not None:
        query += " AND d.ativo = %s"
        params.append(ativo)

    query += " GROUP BY d.id ORDER BY d.padrao DESC, d.nome"

    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        depositos = cursor.fetchall()

    return depositos

@router.get("/{deposito_id}", response_model=Deposito)
async def obter_deposito(
    deposito_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um depósito específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM depositos WHERE id = %s", (deposito_id,))
        deposito = cursor.fetchone()

    if not deposito:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Depósito não encontrado"
        )

    return deposito

@router.post("/", response_model=Deposito, status_code=status.HTTP_201_CREATED)
async def criar_deposito(
    deposito: DepositoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo depósito no sistema.
    Se marcado como padrão, remove o padrão do depósito anterior (garante um único depósito padrão).
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM depositos WHERE nome = %s", (deposito.nome,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe um depósito com este nome"
            )

    with get_db_cursor(commit=True) as cursor:
        if deposito.padrao:
            cursor.execute("UPDATE depositos SET padrao = FALSE WHERE padrao = TRUE")

        cursor.execute(
            """
            INSERT INTO depositos (nome, descricao, padrao, ativo)
            VALUES (%s, %s, %s, %s)
            """,
            (deposito.nome, deposito.descricao, deposito.padrao, deposito.ativo)
        )

        cursor.execute("SELECT LAST_INSERT_ID()")
        deposito_id = cursor.fetchone()["LAST_INSERT_ID()"]

        cursor.execute("SELECT * FROM depositos WHERE id = %s", (deposito_id,))
        novo_deposito = cursor.fetchone()

    return novo_deposito

@router.put("/{deposito_id}", response_model=Deposito)
async def atualizar_deposito(
    deposito_id: int,
    deposito: DepositoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um depósito existente.
    Se marcado como padrão, remove o padrão do depósito anterior.
    Não permite remover o padrão do depósito atual sem antes marcar outro como padrão.
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM depositos WHERE id = %s", (deposito_id,))
        deposito_existente = cursor.fetchone()
        if not deposito_existente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Depósito não encontrado"
            )

        if deposito.nome:
            cursor.execute(
                "SELECT id FROM depositos WHERE nome = %s AND id != %s",
                (deposito.nome, deposito_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Nome já está em uso por outro depósito"
                )

        if deposito.padrao is False and deposito_existente["padrao"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível remover o depósito padrão diretamente. Marque outro depósito como padrão primeiro."
            )

    update_data = {}
    if deposito.nome is not None:
        update_data["nome"] = deposito.nome
    if deposito.descricao is not None:
        update_data["descricao"] = deposito.descricao
    if deposito.padrao is not None:
        update_data["padrao"] = deposito.padrao
    if deposito.ativo is not None:
        update_data["ativo"] = deposito.ativo

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )

    with get_db_cursor(commit=True) as cursor:
        if update_data.get("padrao") is True:
            cursor.execute("UPDATE depositos SET padrao = FALSE WHERE padrao = TRUE AND id != %s", (deposito_id,))

        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(deposito_id)

        cursor.execute(
            f"UPDATE depositos SET {set_clause} WHERE id = %s",
            values
        )

        cursor.execute("SELECT * FROM depositos WHERE id = %s", (deposito_id,))
        deposito_atualizado = cursor.fetchone()

    return deposito_atualizado

@router.delete("/{deposito_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_deposito(
    deposito_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um depósito do sistema.
    Não permite excluir o depósito padrão nem depósitos com produtos vinculados.
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM depositos WHERE id = %s", (deposito_id,))
        deposito = cursor.fetchone()

        if not deposito:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Depósito não encontrado"
            )

        if deposito["padrao"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o depósito padrão"
            )

        cursor.execute("SELECT COUNT(*) as total FROM produtos WHERE deposito_id = %s", (deposito_id,))
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o depósito pois existem produtos vinculados a ele"
            )

    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM depositos WHERE id = %s", (deposito_id,))

    return None
