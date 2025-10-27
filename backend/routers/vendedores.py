from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class VendedorBase(BaseModel):
    nome: str
    email: Optional[str] = None
    telefone: Optional[str] = None
    comissao_percentual: float = 0
    usuario_id: Optional[int] = None
    ativo: bool = True

class VendedorCreate(VendedorBase):
    pass

class VendedorUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    comissao_percentual: Optional[float] = None
    usuario_id: Optional[int] = None
    ativo: Optional[bool] = None

class Vendedor(VendedorBase):
    id: int
    data_cadastro: str

# Rotas
@router.get("/", response_model=List[Vendedor])
async def listar_vendedores(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os vendedores cadastrados no sistema.
    Pode filtrar por status (ativo/inativo).
    """
    query = "SELECT * FROM vendedores WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        vendedores = cursor.fetchall()
    
    # Converter o campo data_cadastro para string
    for vendedor in vendedores:
        if 'data_cadastro' in vendedor and vendedor['data_cadastro']:
            vendedor['data_cadastro'] = vendedor['data_cadastro'].isoformat()
    
    return vendedores

@router.get("/{vendedor_id}", response_model=Vendedor)
async def obter_vendedor(
    vendedor_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um vendedor específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
        vendedor = cursor.fetchone()
    
    if not vendedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendedor não encontrado"
        )
    
    # Converter o campo data_cadastro para string
    if 'data_cadastro' in vendedor and vendedor['data_cadastro']:
        vendedor['data_cadastro'] = vendedor['data_cadastro'].isoformat()
    
    return vendedor

@router.post("/", response_model=Vendedor, status_code=status.HTTP_201_CREATED)
async def criar_vendedor(
    vendedor: VendedorCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo vendedor no sistema.
    """
    # Verifica se o usuário existe (se fornecido)
    if vendedor.usuario_id:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM usuarios WHERE id = %s",
                (vendedor.usuario_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Usuário não encontrado"
                )
            
            # Verifica se o usuário já está vinculado a outro vendedor
            cursor.execute(
                "SELECT id FROM vendedores WHERE usuario_id = %s",
                (vendedor.usuario_id,)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este usuário já está vinculado a outro vendedor"
                )
    
    # Cria o vendedor
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO vendedores (
                nome, email, telefone, comissao_percentual, usuario_id, ativo
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                vendedor.nome, vendedor.email, vendedor.telefone,
                vendedor.comissao_percentual, vendedor.usuario_id, vendedor.ativo
            )
        )
        
        # Obtém o ID do vendedor criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        vendedor_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados do vendedor criado
        cursor.execute(
            "SELECT * FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
        novo_vendedor = cursor.fetchone()
    
    # Converter o campo data_cadastro para string
    if 'data_cadastro' in novo_vendedor and novo_vendedor['data_cadastro']:
        novo_vendedor['data_cadastro'] = novo_vendedor['data_cadastro'].isoformat()
    
    return novo_vendedor

@router.put("/{vendedor_id}", response_model=Vendedor)
async def atualizar_vendedor(
    vendedor_id: int,
    vendedor: VendedorUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um vendedor existente.
    """
    # Verifica se o vendedor existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendedor não encontrado"
            )
        
        # Verifica se o usuário existe (se fornecido)
        if vendedor.usuario_id:
            cursor.execute(
                "SELECT id FROM usuarios WHERE id = %s",
                (vendedor.usuario_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Usuário não encontrado"
                )
            
            # Verifica se o usuário já está vinculado a outro vendedor
            cursor.execute(
                "SELECT id FROM vendedores WHERE usuario_id = %s AND id != %s",
                (vendedor.usuario_id, vendedor_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este usuário já está vinculado a outro vendedor"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if vendedor.nome is not None:
        update_data["nome"] = vendedor.nome
    if vendedor.email is not None:
        update_data["email"] = vendedor.email
    if vendedor.telefone is not None:
        update_data["telefone"] = vendedor.telefone
    if vendedor.comissao_percentual is not None:
        update_data["comissao_percentual"] = vendedor.comissao_percentual
    if vendedor.usuario_id is not None:
        update_data["usuario_id"] = vendedor.usuario_id
    if vendedor.ativo is not None:
        update_data["ativo"] = vendedor.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o vendedor
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(vendedor_id)
        
        cursor.execute(
            f"UPDATE vendedores SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
        vendedor_atualizado = cursor.fetchone()
    
    # Converter o campo data_cadastro para string
    if 'data_cadastro' in vendedor_atualizado and vendedor_atualizado['data_cadastro']:
        vendedor_atualizado['data_cadastro'] = vendedor_atualizado['data_cadastro'].isoformat()
    
    return vendedor_atualizado

@router.delete("/{vendedor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_vendedor(
    vendedor_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um vendedor do sistema.
    Não permite excluir vendedores que possuem pedidos de venda vinculados.
    """
    # Verifica se o vendedor existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendedor não encontrado"
            )
        
        # Verifica se existem pedidos de venda vinculados ao vendedor
        cursor.execute(
            "SELECT COUNT(*) as total FROM pedidos_venda WHERE vendedor_id = %s",
            (vendedor_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o vendedor pois existem pedidos de venda vinculados a ele"
            )
        
        # Verifica se existem propostas comerciais vinculadas ao vendedor
        cursor.execute(
            "SELECT COUNT(*) as total FROM propostas_comerciais WHERE vendedor_id = %s",
            (vendedor_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o vendedor pois existem propostas comerciais vinculadas a ele"
            )
    
    # Exclui o vendedor
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM vendedores WHERE id = %s",
            (vendedor_id,)
        )
    
    return None
