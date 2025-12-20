from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
import datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class PlataformaVendaBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    url: Optional[str] = None
    taxa_percentual: float = 0
    ativo: bool = True

class PlataformaVendaCreate(PlataformaVendaBase):
    pass

class PlataformaVendaUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    url: Optional[str] = None
    taxa_percentual: Optional[float] = None
    ativo: Optional[bool] = None

class PlataformaVenda(PlataformaVendaBase):
    id: int
    data_cadastro: str

# Rotas
@router.get("/", response_model=List[PlataformaVenda])
async def listar_plataformas_venda(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as plataformas de venda cadastradas no sistema.
    
    ## Parâmetros
    - **ativo**: Filtro por status (true=ativo, false=inativo)
    """
    query = "SELECT * FROM plataformas_venda WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    query += " ORDER BY nome ASC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        plataformas = cursor.fetchall()
    
    # Converter data_cadastro para string
    for plataforma in plataformas:
        if isinstance(plataforma['data_cadastro'], datetime.datetime):
            plataforma['data_cadastro'] = plataforma['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return plataformas

@router.get("/{plataforma_id}", response_model=PlataformaVenda)
async def obter_plataforma_venda(
    plataforma_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma plataforma de venda específica pelo ID.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
        plataforma = cursor.fetchone()
        
        if not plataforma:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plataforma de venda não encontrada"
            )
        
        # Converter data_cadastro para string
        if isinstance(plataforma['data_cadastro'], datetime.datetime):
            plataforma['data_cadastro'] = plataforma['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return plataforma

@router.post("/", response_model=PlataformaVenda, status_code=status.HTTP_201_CREATED)
async def criar_plataforma_venda(
    plataforma: PlataformaVendaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova plataforma de venda no sistema.
    """
    with get_db_cursor(commit=True) as cursor:
        # Verifica se já existe uma plataforma com o mesmo nome
        cursor.execute(
            "SELECT id FROM plataformas_venda WHERE nome = %s",
            (plataforma.nome,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe uma plataforma de venda com este nome"
            )
        
        # Insere a nova plataforma
        cursor.execute(
            """
            INSERT INTO plataformas_venda (nome, descricao, url, taxa_percentual, ativo)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (plataforma.nome, plataforma.descricao, plataforma.url, 
             plataforma.taxa_percentual, plataforma.ativo)
        )
        
        # Obtém o ID da plataforma criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        plataforma_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados da plataforma criada
        cursor.execute(
            "SELECT * FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
        nova_plataforma = cursor.fetchone()
        
        # Converter data_cadastro para string
        if isinstance(nova_plataforma['data_cadastro'], datetime.datetime):
            nova_plataforma['data_cadastro'] = nova_plataforma['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return nova_plataforma

@router.put("/{plataforma_id}", response_model=PlataformaVenda)
async def atualizar_plataforma_venda(
    plataforma_id: int,
    plataforma: PlataformaVendaUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de uma plataforma de venda existente.
    """
    # Verifica se a plataforma existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
        plataforma_atual = cursor.fetchone()
        
        if not plataforma_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plataforma de venda não encontrada"
            )
        
        # Verifica se o nome já está em uso por outra plataforma
        if plataforma.nome:
            cursor.execute(
                "SELECT id FROM plataformas_venda WHERE nome = %s AND id != %s",
                (plataforma.nome, plataforma_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe outra plataforma de venda com este nome"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if plataforma.nome is not None:
        update_data["nome"] = plataforma.nome
    if plataforma.descricao is not None:
        update_data["descricao"] = plataforma.descricao
    if plataforma.url is not None:
        update_data["url"] = plataforma.url
    if plataforma.taxa_percentual is not None:
        update_data["taxa_percentual"] = plataforma.taxa_percentual
    if plataforma.ativo is not None:
        update_data["ativo"] = plataforma.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza a plataforma
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(plataforma_id)
        
        cursor.execute(
            f"UPDATE plataformas_venda SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
        plataforma_atualizada = cursor.fetchone()
        
        # Converter data_cadastro para string
        if isinstance(plataforma_atualizada['data_cadastro'], datetime.datetime):
            plataforma_atualizada['data_cadastro'] = plataforma_atualizada['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return plataforma_atualizada

@router.delete("/{plataforma_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_plataforma_venda(
    plataforma_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui uma plataforma de venda do sistema.
    Não permite excluir se houver pedidos de venda vinculados.
    """
    with get_db_cursor(commit=True) as cursor:
        # Verifica se a plataforma existe
        cursor.execute(
            "SELECT * FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plataforma de venda não encontrada"
            )
        
        # Verifica se há pedidos de venda vinculados
        cursor.execute(
            "SELECT COUNT(*) as total FROM pedidos_venda WHERE plataforma_id = %s",
            (plataforma_id,)
        )
        result = cursor.fetchone()
        if result and result['total'] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível excluir. Existem {result['total']} pedido(s) de venda vinculado(s) a esta plataforma."
            )
        
        # Exclui a plataforma
        cursor.execute(
            "DELETE FROM plataformas_venda WHERE id = %s",
            (plataforma_id,)
        )
    
    return None
