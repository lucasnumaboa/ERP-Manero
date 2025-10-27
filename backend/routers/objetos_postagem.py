from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ObjetoPostagemBase(BaseModel):
    pedido_id: int
    codigo_rastreio: Optional[str] = None
    transportadora: str
    status: str = "postado"
    observacoes: Optional[str] = None

class ObjetoPostagemCreate(ObjetoPostagemBase):
    pass

class ObjetoPostagemUpdate(BaseModel):
    codigo_rastreio: Optional[str] = None
    transportadora: Optional[str] = None
    status: Optional[str] = None
    observacoes: Optional[str] = None

class ObjetoPostagem(ObjetoPostagemBase):
    id: int
    data_postagem: str

# Rotas
@router.get("/", response_model=List[ObjetoPostagem])
async def listar_objetos_postagem(
    pedido_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os objetos de postagem cadastrados no sistema.
    Pode filtrar por pedido e status.
    """
    query = "SELECT * FROM objetos_postagem WHERE 1=1"
    params = []
    
    if pedido_id is not None:
        query += " AND pedido_id = %s"
        params.append(pedido_id)
    
    if status is not None:
        query += " AND status = %s"
        params.append(status)
    
    query += " ORDER BY data_postagem DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        objetos = cursor.fetchall()
    
    return objetos

@router.get("/{objeto_id}", response_model=ObjetoPostagem)
async def obter_objeto_postagem(
    objeto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um objeto de postagem específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
        objeto = cursor.fetchone()
    
    if not objeto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Objeto de postagem não encontrado"
        )
    
    return objeto

@router.post("/", response_model=ObjetoPostagem, status_code=status.HTTP_201_CREATED)
async def criar_objeto_postagem(
    objeto: ObjetoPostagemCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo objeto de postagem no sistema.
    """
    # Verifica se o pedido existe e pode ter um objeto de postagem
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status FROM pedidos_venda WHERE id = %s",
            (objeto.pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pedido não encontrado"
            )
        
        if pedido["status"] not in ["aprovado", "faturado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível criar um objeto de postagem para um pedido com status '{pedido['status']}'"
            )
        
        # Verifica se o status é válido
        if objeto.status not in ["postado", "em_transito", "entregue", "devolvido"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'postado', 'em_transito', 'entregue' ou 'devolvido'"
            )
    
    # Cria o objeto de postagem
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO objetos_postagem (
                pedido_id, codigo_rastreio, transportadora, status, observacoes
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                objeto.pedido_id, objeto.codigo_rastreio,
                objeto.transportadora, objeto.status, objeto.observacoes
            )
        )
        
        # Obtém o ID do objeto criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        objeto_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Se o status for "entregue", atualiza o status do pedido
        if objeto.status == "entregue":
            cursor.execute(
                "UPDATE pedidos_venda SET status = 'Finalizada' WHERE id = %s",
                (objeto.pedido_id,)
            )
        
        # Obtém os dados do objeto criado
        cursor.execute(
            "SELECT * FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
        novo_objeto = cursor.fetchone()
    
    return novo_objeto

@router.put("/{objeto_id}", response_model=ObjetoPostagem)
async def atualizar_objeto_postagem(
    objeto_id: int,
    objeto: ObjetoPostagemUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um objeto de postagem existente.
    """
    # Verifica se o objeto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
        objeto_atual = cursor.fetchone()
        
        if not objeto_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Objeto de postagem não encontrado"
            )
        
        # Verifica se o status é válido (se fornecido)
        if objeto.status and objeto.status not in ["postado", "em_transito", "entregue", "devolvido"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status inválido. Deve ser 'postado', 'em_transito', 'entregue' ou 'devolvido'"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if objeto.codigo_rastreio is not None:
        update_data["codigo_rastreio"] = objeto.codigo_rastreio
    if objeto.transportadora is not None:
        update_data["transportadora"] = objeto.transportadora
    if objeto.status is not None:
        update_data["status"] = objeto.status
    if objeto.observacoes is not None:
        update_data["observacoes"] = objeto.observacoes
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o objeto
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(objeto_id)
        
        cursor.execute(
            f"UPDATE objetos_postagem SET {set_clause} WHERE id = %s",
            values
        )
        
        # Se o status for alterado para "entregue", atualiza o status do pedido
        if objeto.status == "entregue":
            cursor.execute(
                "UPDATE pedidos_venda SET status = 'Finalizada' WHERE id = %s",
                (objeto_atual["pedido_id"],)
            )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
        objeto_atualizado = cursor.fetchone()
    
    return objeto_atualizado

@router.delete("/{objeto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_objeto_postagem(
    objeto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um objeto de postagem do sistema.
    """
    # Verifica se o objeto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Objeto de postagem não encontrado"
            )
    
    # Exclui o objeto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM objetos_postagem WHERE id = %s",
            (objeto_id,)
        )
    
    return None
