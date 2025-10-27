from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
import datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ParceiroBase(BaseModel):
    tipo: str  # 'cliente', 'fornecedor', 'ambos'
    nome: str
    documento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    ativo: bool = True

class ParceiroCreate(ParceiroBase):
    pass

class ParceiroUpdate(BaseModel):
    tipo: Optional[str] = None
    nome: Optional[str] = None
    documento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    ativo: Optional[bool] = None

class Parceiro(ParceiroBase):
    id: int
    data_cadastro: str

# Rotas
@router.get("/", response_model=List[Parceiro], tags=["Parceiros", "Fornecedores"])
async def listar_parceiros(
    tipo: Optional[str] = None,
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os parceiros (clientes e/ou fornecedores) cadastrados no sistema.
    
    ## Uso para Fornecedores
    Para listar apenas fornecedores, use o parâmetro `tipo=fornecedor` ou `tipo=fornecedor,ambos`
    
    ## Parâmetros
    - **tipo**: Filtro por tipo de parceiro ('cliente', 'fornecedor', 'ambos')
    - **ativo**: Filtro por status (true=ativo, false=inativo)
    
    ## Exemplo
    ```
    GET /api/parceiros?tipo=fornecedor,ambos
    ```
    """
    query = "SELECT * FROM parceiros WHERE 1=1"
    params = []
    
    if tipo is not None:
        # Verifica se o parâmetro tipo contém múltiplos valores separados por vírgula
        if ',' in tipo:
            tipos = tipo.split(',')
            placeholders = ', '.join(['%s'] * len(tipos))
            query += f" AND tipo IN ({placeholders})"
            params.extend(tipos)
        else:
            query += " AND tipo = %s"
            params.append(tipo)
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        parceiros = cursor.fetchall()
    
    # Converter data_cadastro para string em cada parceiro
    for parceiro in parceiros:
        if isinstance(parceiro['data_cadastro'], datetime.datetime):
            parceiro['data_cadastro'] = parceiro['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return parceiros

@router.get("/{parceiro_id}", response_model=Parceiro, tags=["Parceiros", "Fornecedores"])
async def obter_parceiro(
    parceiro_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um parceiro específico pelo ID.
    
    ## Uso para Fornecedores
    Esta rota é usada para obter detalhes de um fornecedor específico.
    
    ## Parâmetros
    - **parceiro_id**: ID do fornecedor a ser consultado
    
    ## Exemplo
    ```
    GET /api/parceiros/42
    ```
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
        parceiro = cursor.fetchone()
    
    if not parceiro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    # Converter data_cadastro para string
    if isinstance(parceiro['data_cadastro'], datetime.datetime):
        parceiro['data_cadastro'] = parceiro['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return parceiro

@router.post("/", response_model=Parceiro, status_code=status.HTTP_201_CREATED, tags=["Parceiros", "Fornecedores"])
async def criar_parceiro(
    parceiro: ParceiroCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo parceiro (cliente ou fornecedor) no sistema.
    
    ## Uso para Fornecedores
    Para criar um novo fornecedor, defina o campo `tipo` como 'fornecedor' ou 'ambos'.
    
    ## Exemplo de Corpo da Requisição
    ```json
    {
      "tipo": "fornecedor",
      "nome": "Fornecedor LTDA",
      "documento": "12.345.678/0001-90",
      "email": "contato@fornecedor.com",
      "telefone": "(11) 1234-5678",
      "endereco": "Rua Exemplo, 123",
      "cidade": "São Paulo",
      "estado": "SP",
      "cep": "01234-567",
      "ativo": true
    }
    ```
    """
    # Verifica se o tipo é válido
    if parceiro.tipo not in ['cliente', 'fornecedor', 'ambos']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo inválido. Deve ser 'cliente', 'fornecedor' ou 'ambos'"
        )
    
    # Verifica se já existe um parceiro com o mesmo documento (se fornecido)
    if parceiro.documento:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM parceiros WHERE documento = %s",
                (parceiro.documento,)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe um parceiro com este documento"
                )
    
    # Cria o parceiro
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO parceiros (
                tipo, nome, documento, email, telefone,
                endereco, cidade, estado, cep, ativo
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                parceiro.tipo, parceiro.nome, parceiro.documento,
                parceiro.email, parceiro.telefone, parceiro.endereco,
                parceiro.cidade, parceiro.estado, parceiro.cep, parceiro.ativo
            )
        )
        
        # Obtém o ID do parceiro criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        parceiro_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados do parceiro criado
        cursor.execute(
            "SELECT * FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
        novo_parceiro = cursor.fetchone()
        
        # Converter data_cadastro para string
        if isinstance(novo_parceiro['data_cadastro'], datetime.datetime):
            novo_parceiro['data_cadastro'] = novo_parceiro['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return novo_parceiro

@router.put("/{parceiro_id}", response_model=Parceiro, tags=["Parceiros", "Fornecedores"])
async def atualizar_parceiro(
    parceiro_id: int,
    parceiro_update: ParceiroUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um parceiro existente.
    
    ## Uso para Fornecedores
    Esta rota é usada para atualizar informações de um fornecedor existente.
    
    ## Parâmetros
    - **parceiro_id**: ID do fornecedor a ser atualizado
    
    ## Exemplo de Corpo da Requisição
    ```json
    {
      "nome": "Fornecedor LTDA Atualizado",
      "email": "novo@fornecedor.com",
      "telefone": "(11) 9876-5432",
      "ativo": false
    }
    ```
    
    Note que você pode enviar apenas os campos que deseja atualizar.
    """
    # Verifica se o parceiro existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parceiro não encontrado"
            )
        
        # Verifica se o tipo é válido (se fornecido)
        if parceiro_update.tipo and parceiro_update.tipo not in ['cliente', 'fornecedor', 'ambos']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tipo inválido. Deve ser 'cliente', 'fornecedor' ou 'ambos'"
            )
        
        # Verifica se o documento já está em uso por outro parceiro (se fornecido)
        if parceiro_update.documento:
            cursor.execute(
                "SELECT id FROM parceiros WHERE documento = %s AND id != %s",
                (parceiro_update.documento, parceiro_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Documento já está em uso por outro parceiro"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if parceiro_update.tipo is not None:
        update_data["tipo"] = parceiro_update.tipo
    if parceiro_update.nome is not None:
        update_data["nome"] = parceiro_update.nome
    if parceiro_update.documento is not None:
        update_data["documento"] = parceiro_update.documento
    if parceiro_update.email is not None:
        update_data["email"] = parceiro_update.email
    if parceiro_update.telefone is not None:
        update_data["telefone"] = parceiro_update.telefone
    if parceiro_update.endereco is not None:
        update_data["endereco"] = parceiro_update.endereco
    if parceiro_update.cidade is not None:
        update_data["cidade"] = parceiro_update.cidade
    if parceiro_update.estado is not None:
        update_data["estado"] = parceiro_update.estado
    if parceiro_update.cep is not None:
        update_data["cep"] = parceiro_update.cep
    if parceiro_update.ativo is not None:
        update_data["ativo"] = parceiro_update.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o parceiro
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(parceiro_id)
        
        cursor.execute(
            f"UPDATE parceiros SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
        parceiro_atualizado = cursor.fetchone()
        
        # Converter data_cadastro para string
        if isinstance(parceiro_atualizado['data_cadastro'], datetime.datetime):
            parceiro_atualizado['data_cadastro'] = parceiro_atualizado['data_cadastro'].strftime('%Y-%m-%d %H:%M:%S')
    
    return parceiro_atualizado

@router.delete("/{parceiro_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Parceiros", "Fornecedores"])
async def excluir_parceiro(
    parceiro_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um parceiro do sistema.
    
    ## Uso para Fornecedores
    Esta rota é usada para excluir um fornecedor do sistema.
    
    ## Parâmetros
    - **parceiro_id**: ID do fornecedor a ser excluído
    
    ## Exemplo
    ```
    DELETE /api/parceiros/42
    ```
    
    Retorna status 204 (No Content) em caso de sucesso.
    """
    # Verifica se o parceiro existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parceiro não encontrado"
            )
        
        # Verifica se existem pedidos de compra vinculados ao parceiro
        cursor.execute(
            "SELECT COUNT(*) as total FROM pedidos_compra WHERE fornecedor_id = %s",
            (parceiro_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o parceiro pois existem pedidos de compra vinculados a ele"
            )
        
        # Verifica se existem pedidos de venda vinculados ao parceiro
        cursor.execute(
            "SELECT COUNT(*) as total FROM pedidos_venda WHERE cliente_id = %s",
            (parceiro_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o parceiro pois existem pedidos de venda vinculados a ele"
            )
        
        # Verifica se existem contas a pagar vinculadas ao parceiro
        cursor.execute(
            "SELECT COUNT(*) as total FROM contas_pagar WHERE fornecedor_id = %s",
            (parceiro_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o parceiro pois existem contas a pagar vinculadas a ele"
            )
        
        # Verifica se existem contas a receber vinculadas ao parceiro
        cursor.execute(
            "SELECT COUNT(*) as total FROM contas_receber WHERE cliente_id = %s",
            (parceiro_id,)
        )
        result = cursor.fetchone()
        if result["total"] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível excluir o parceiro pois existem contas a receber vinculadas a ele"
            )
    
    # Exclui o parceiro
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM parceiros WHERE id = %s",
            (parceiro_id,)
        )
    
    return None
