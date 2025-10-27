from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class CategoriaBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    ativo: bool = True

class CategoriaCreate(CategoriaBase):
    pass

class CategoriaUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None

class Categoria(CategoriaBase):
    id: int

# Rotas
@router.get("/", response_model=List[dict])
async def listar_categorias(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as categorias de produtos cadastradas no sistema.
    Pode filtrar por status (ativo/inativo).
    Inclui a contagem de produtos para cada categoria.
    """
    query = """
    SELECT c.*, COUNT(p.id) as produtos_count 
    FROM categorias_produtos c
    LEFT JOIN produtos p ON c.id = p.categoria_id
    WHERE 1=1
    """
    params = []
    
    if ativo is not None:
        query += " AND c.ativo = %s"
        params.append(ativo)
    
    query += " GROUP BY c.id"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        categorias = cursor.fetchall()
    
    return categorias

@router.get("/{categoria_id}", response_model=Categoria)
async def obter_categoria(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma categoria específica.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        categoria = cursor.fetchone()
    
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoria não encontrada"
        )
    
    return categoria

@router.post("/", response_model=Categoria, status_code=status.HTTP_201_CREATED)
async def criar_categoria(
    categoria: CategoriaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova categoria de produtos no sistema.
    """
    # Verifica se já existe uma categoria com o mesmo nome
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM categorias_produtos WHERE nome = %s",
            (categoria.nome,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe uma categoria com este nome"
            )
    
    # Cria a categoria
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO categorias_produtos (nome, descricao, ativo)
            VALUES (%s, %s, %s)
            """,
            (categoria.nome, categoria.descricao, categoria.ativo)
        )
        
        # Obtém o ID da categoria criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        categoria_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados da categoria criada
        cursor.execute(
            "SELECT * FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        nova_categoria = cursor.fetchone()
    
    return nova_categoria

@router.put("/{categoria_id}", response_model=Categoria)
async def atualizar_categoria(
    categoria_id: int,
    categoria: CategoriaUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma categoria existente.
    """
    # Verifica se a categoria existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria não encontrada"
            )
        
        # Verifica se o nome já está em uso por outra categoria
        if categoria.nome:
            cursor.execute(
                "SELECT id FROM categorias_produtos WHERE nome = %s AND id != %s",
                (categoria.nome, categoria_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Nome já está em uso por outra categoria"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if categoria.nome is not None:
        update_data["nome"] = categoria.nome
    if categoria.descricao is not None:
        update_data["descricao"] = categoria.descricao
    if categoria.ativo is not None:
        update_data["ativo"] = categoria.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza a categoria
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(categoria_id)
        
        cursor.execute(
            f"UPDATE categorias_produtos SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        categoria_atualizada = cursor.fetchone()
    
    return categoria_atualizada

@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_categoria(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma categoria do sistema.
    Não permite excluir categorias que possuem produtos vinculados.
    """
    # Verifica se a categoria existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria não encontrada"
            )
        
        # Verifica se existem produtos vinculados à categoria
        cursor.execute(
            "SELECT COUNT(*) as total FROM produtos WHERE categoria_id = %s",
            (categoria_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir a categoria pois existem produtos vinculados a ela"
            )
    
    # Exclui a categoria
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
    
    return None
