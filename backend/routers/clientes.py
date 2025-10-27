from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from datetime import datetime

router = APIRouter()

# Modelos Pydantic
class ClienteBase(BaseModel):
    nome: str
    tipo: str  # PF ou PJ
    cpf_cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    ativo: bool = True

class ClienteCreate(ClienteBase):
    pass

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    ativo: Optional[bool] = None

class Cliente(ClienteBase):
    id: int
    data_cadastro: datetime

# Rotas
@router.get("/", response_model=List[Cliente])
async def listar_clientes(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os clientes cadastrados no sistema.
    Pode filtrar por status (ativo/inativo).
    """
    query = "SELECT * FROM clientes WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        clientes = cursor.fetchall()
    
    return clientes

@router.get("/{cliente_id}", response_model=Cliente)
async def obter_cliente(
    cliente_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um cliente específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        cliente = cursor.fetchone()
    
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado"
        )
    
    return cliente

@router.post("/", response_model=Cliente, status_code=status.HTTP_201_CREATED)
async def criar_cliente(
    cliente: ClienteCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo cliente no sistema e sincroniza com a tabela de parceiros.
    """
    # Verifica se o CPF/CNPJ já está em uso
    if cliente.cpf_cnpj:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM clientes WHERE cpf_cnpj = %s",
                (cliente.cpf_cnpj,)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CPF/CNPJ já está em uso"
                )
            
            # Verifica se já existe um parceiro com o mesmo CPF/CNPJ
            cursor.execute(
                "SELECT id FROM parceiros WHERE documento = %s",
                (cliente.cpf_cnpj,)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe um parceiro com este CPF/CNPJ"
                )
    
    # Cria o cliente
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO clientes (
                nome, tipo, cpf_cnpj, email, telefone,
                endereco, cidade, estado, cep, ativo
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                cliente.nome, cliente.tipo, cliente.cpf_cnpj,
                cliente.email, cliente.telefone, cliente.endereco,
                cliente.cidade, cliente.estado, cliente.cep, cliente.ativo
            )
        )
        
        # Obtém o ID do cliente criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        cliente_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Sincroniza com a tabela de parceiros
        cursor.execute(
            """
            INSERT INTO parceiros (
                tipo, nome, documento, email, telefone,
                endereco, cidade, estado, cep, ativo
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                'cliente', cliente.nome, cliente.cpf_cnpj,
                cliente.email, cliente.telefone, cliente.endereco,
                cliente.cidade, cliente.estado, cliente.cep, cliente.ativo
            )
        )
        
        # Obtém os dados do cliente criado
        cursor.execute(
            "SELECT * FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        novo_cliente = cursor.fetchone()
    
    return novo_cliente

@router.put("/{cliente_id}", response_model=Cliente)
async def atualizar_cliente(
    cliente_id: int,
    cliente: ClienteUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um cliente existente e sincroniza com a tabela de parceiros.
    """
    # Verifica se o cliente existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        cliente_atual = cursor.fetchone()
        
        if not cliente_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente não encontrado"
            )
        
        # Verifica se o CPF/CNPJ já está em uso por outro cliente
        if cliente.cpf_cnpj and cliente.cpf_cnpj != cliente_atual['cpf_cnpj']:
            cursor.execute(
                "SELECT id FROM clientes WHERE cpf_cnpj = %s AND id != %s",
                (cliente.cpf_cnpj, cliente_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CPF/CNPJ já está em uso por outro cliente"
                )
            
            # Verifica se o CPF/CNPJ já está em uso por outro parceiro
            cursor.execute(
                "SELECT id FROM parceiros WHERE documento = %s AND documento != %s",
                (cliente.cpf_cnpj, cliente_atual['cpf_cnpj'])
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CPF/CNPJ já está em uso por outro parceiro"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if cliente.nome is not None:
        update_data["nome"] = cliente.nome
    if cliente.tipo is not None:
        update_data["tipo"] = cliente.tipo
    if cliente.cpf_cnpj is not None:
        update_data["cpf_cnpj"] = cliente.cpf_cnpj
    if cliente.email is not None:
        update_data["email"] = cliente.email
    if cliente.telefone is not None:
        update_data["telefone"] = cliente.telefone
    if cliente.endereco is not None:
        update_data["endereco"] = cliente.endereco
    if cliente.cidade is not None:
        update_data["cidade"] = cliente.cidade
    if cliente.estado is not None:
        update_data["estado"] = cliente.estado
    if cliente.cep is not None:
        update_data["cep"] = cliente.cep
    if cliente.ativo is not None:
        update_data["ativo"] = cliente.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o cliente
    with get_db_cursor(commit=True) as cursor:
        # Atualiza na tabela clientes
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(cliente_id)
        
        cursor.execute(
            f"UPDATE clientes SET {set_clause} WHERE id = %s",
            values
        )
        
        # Verifica se existe um parceiro correspondente
        cursor.execute(
            "SELECT id FROM parceiros WHERE documento = %s",
            (cliente_atual['cpf_cnpj'],)
        )
        parceiro = cursor.fetchone()
        
        # Prepara os dados para atualização do parceiro
        parceiro_update = {}
        if "nome" in update_data:
            parceiro_update["nome"] = update_data["nome"]
        if "cpf_cnpj" in update_data:
            parceiro_update["documento"] = update_data["cpf_cnpj"]
        if "email" in update_data:
            parceiro_update["email"] = update_data["email"]
        if "telefone" in update_data:
            parceiro_update["telefone"] = update_data["telefone"]
        if "endereco" in update_data:
            parceiro_update["endereco"] = update_data["endereco"]
        if "cidade" in update_data:
            parceiro_update["cidade"] = update_data["cidade"]
        if "estado" in update_data:
            parceiro_update["estado"] = update_data["estado"]
        if "cep" in update_data:
            parceiro_update["cep"] = update_data["cep"]
        if "ativo" in update_data:
            parceiro_update["ativo"] = update_data["ativo"]
        
        if parceiro and parceiro_update:
            # Atualiza o parceiro existente
            parceiro_set_clause = ", ".join([f"{key} = %s" for key in parceiro_update.keys()])
            parceiro_values = list(parceiro_update.values())
            parceiro_values.append(parceiro['id'])
            
            cursor.execute(
                f"UPDATE parceiros SET {parceiro_set_clause} WHERE id = %s",
                parceiro_values
            )
        elif not parceiro and cliente_atual['cpf_cnpj']:
            # Cria um novo parceiro se não existir
            # Obtém os dados atualizados do cliente
            cursor.execute(
                "SELECT * FROM clientes WHERE id = %s",
                (cliente_id,)
            )
            cliente_atualizado_dados = cursor.fetchone()
            
            cursor.execute(
                """
                INSERT INTO parceiros (
                    tipo, nome, documento, email, telefone,
                    endereco, cidade, estado, cep, ativo
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    'cliente', cliente_atualizado_dados['nome'], cliente_atualizado_dados['cpf_cnpj'],
                    cliente_atualizado_dados['email'], cliente_atualizado_dados['telefone'], 
                    cliente_atualizado_dados['endereco'], cliente_atualizado_dados['cidade'], 
                    cliente_atualizado_dados['estado'], cliente_atualizado_dados['cep'], 
                    cliente_atualizado_dados['ativo']
                )
            )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        cliente_atualizado = cursor.fetchone()
    
    return cliente_atualizado

@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_cliente(
    cliente_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um cliente do sistema e remove ou desativa o parceiro correspondente.
    """
    # Verifica se o cliente existe e obtém seus dados
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        cliente = cursor.fetchone()
        
        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente não encontrado"
            )
        
        # Verifica se existe um parceiro correspondente
        if cliente['cpf_cnpj']:
            cursor.execute(
                "SELECT id FROM parceiros WHERE documento = %s AND tipo IN ('cliente', 'ambos')",
                (cliente['cpf_cnpj'],)
            )
            parceiro = cursor.fetchone()
    
    # Exclui o cliente e atualiza o parceiro
    with get_db_cursor(commit=True) as cursor:
        # Exclui o cliente
        cursor.execute(
            "DELETE FROM clientes WHERE id = %s",
            (cliente_id,)
        )
        
        # Se encontrou um parceiro correspondente, desativa-o ou exclui
        if parceiro:
            # Verifica se o parceiro está sendo usado em vendas
            cursor.execute(
                "SELECT COUNT(*) as count FROM pedidos_venda WHERE cliente_id = %s",
                (parceiro['id'],)
            )
            vendas_count = cursor.fetchone()['count']
            
            if vendas_count > 0:
                # Se o parceiro tem vendas associadas, apenas desativa
                cursor.execute(
                    "UPDATE parceiros SET ativo = FALSE WHERE id = %s",
                    (parceiro['id'],)
                )
                print(f"Parceiro ID {parceiro['id']} desativado por ter vendas associadas.")
            else:
                # Se não tem vendas, exclui o parceiro
                cursor.execute(
                    "DELETE FROM parceiros WHERE id = %s",
                    (parceiro['id'],)
                )
                print(f"Parceiro ID {parceiro['id']} excluído junto com o cliente.")
    
    return None
