from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from database import get_db_cursor
from auth import get_current_user
import os
import socket
import json

# Modelos Pydantic para as requisições
class ConfigUpdate(BaseModel):
    valor: str
    descricao: Optional[str] = None

class ConfigBatchUpdate(BaseModel):
    configuracoes: Dict[str, str]
    
# Modelos para grupos de usuários
class GrupoUsuarioBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    dashboard_visualizar: bool = False
    dashboard_editar: bool = False
    produtos_visualizar: bool = False
    produtos_editar: bool = False
    clientes_visualizar: bool = False
    clientes_editar: bool = False
    vendas_visualizar: bool = False
    vendas_editar: bool = False
    vendedores_visualizar: bool = False
    vendedores_editar: bool = False
    compras_visualizar: bool = False
    compras_editar: bool = False
    fornecedores_visualizar: bool = False
    fornecedores_editar: bool = False
    estoque_visualizar: bool = False
    estoque_editar: bool = False
    configuracoes_visualizar: bool = False
    configuracoes_editar: bool = False
    financeiro_visualizar: bool = False
    financeiro_editar: bool = False

class GrupoUsuarioCreate(GrupoUsuarioBase):
    pass

class GrupoUsuarioUpdate(GrupoUsuarioBase):
    pass

class GrupoUsuarioResponse(GrupoUsuarioBase):
    id: int
    em_uso: bool

router = APIRouter(
    tags=["configuracoes"]
)

# Endpoints para grupos de usuários
@router.post("/grupo_usuario")
async def create_grupo_usuario(
    grupo: GrupoUsuarioCreate,
    current_user = Depends(get_current_user)
):
    """
    Cria um novo grupo de usuários.
    Requer autenticação de administrador.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem criar grupos de usuários."
        )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """INSERT INTO grupo_usuario 
               (nome, descricao, dashboard_visualizar, dashboard_editar, produtos_visualizar, produtos_editar, 
                clientes_visualizar, clientes_editar, vendas_visualizar, vendas_editar, vendedores_visualizar, 
                vendedores_editar, compras_visualizar, compras_editar, fornecedores_visualizar, fornecedores_editar, 
                estoque_visualizar, estoque_editar, configuracoes_visualizar, configuracoes_editar, 
                financeiro_visualizar, financeiro_editar)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (grupo.nome, grupo.descricao, grupo.dashboard_visualizar, grupo.dashboard_editar, 
             grupo.produtos_visualizar, grupo.produtos_editar, grupo.clientes_visualizar, grupo.clientes_editar, 
             grupo.vendas_visualizar, grupo.vendas_editar, grupo.vendedores_visualizar, grupo.vendedores_editar, 
             grupo.compras_visualizar, grupo.compras_editar, grupo.fornecedores_visualizar, grupo.fornecedores_editar, 
             grupo.estoque_visualizar, grupo.estoque_editar, grupo.configuracoes_visualizar, grupo.configuracoes_editar, 
             grupo.financeiro_visualizar, grupo.financeiro_editar)
        )
        
        # Obter o ID inserido usando LAST_INSERT_ID()
        cursor.execute("SELECT LAST_INSERT_ID() as id")
        grupo_id = cursor.fetchone()["id"]
        
        return {"id": grupo_id, **grupo.dict(), "em_uso": False}

@router.get("/grupo_usuario")
async def get_grupos_usuarios(current_user = Depends(get_current_user)):
    """
    Obtém todos os grupos de usuários.
    Requer autenticação.
    """
    with get_db_cursor() as cursor:
        # Consulta para obter todos os grupos
        cursor.execute("SELECT * FROM grupo_usuario ORDER BY nome")
        grupos = cursor.fetchall()
        
        # Para cada grupo, verificar se está em uso
        for grupo in grupos:
            cursor.execute("SELECT COUNT(*) as total FROM usuarios WHERE grupo_id = %s", (grupo["id"],))
            em_uso = cursor.fetchone()["total"] > 0
            grupo["em_uso"] = em_uso
            
        return grupos

@router.get("/grupo_usuario/{grupo_id}")
async def get_grupo_usuario(grupo_id: int, current_user = Depends(get_current_user)):
    """
    Obtém um grupo de usuários específico.
    Requer autenticação.
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM grupo_usuario WHERE id = %s", (grupo_id,))
        grupo = cursor.fetchone()
        
        if not grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Grupo de usuários com ID {grupo_id} não encontrado."
            )
        
        # Verificar se o grupo está em uso
        cursor.execute("SELECT COUNT(*) as total FROM usuarios WHERE grupo_id = %s", (grupo_id,))
        em_uso = cursor.fetchone()["total"] > 0
        grupo["em_uso"] = em_uso
        
        return grupo

@router.put("/grupo_usuario/{grupo_id}")
async def update_grupo_usuario(
    grupo_id: int,
    grupo: GrupoUsuarioUpdate,
    current_user = Depends(get_current_user)
):
    """
    Atualiza um grupo de usuários específico.
    Requer autenticação de administrador.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem atualizar grupos de usuários."
        )
    
    with get_db_cursor(commit=True) as cursor:
        # Verificar se o grupo existe
        cursor.execute("SELECT id FROM grupo_usuario WHERE id = %s", (grupo_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Grupo de usuários com ID {grupo_id} não encontrado."
            )
        
        # Atualizar o grupo
        cursor.execute(
            """UPDATE grupo_usuario SET 
               nome = %s, descricao = %s, dashboard_visualizar = %s, dashboard_editar = %s, 
               produtos_visualizar = %s, produtos_editar = %s, clientes_visualizar = %s, clientes_editar = %s, 
               vendas_visualizar = %s, vendas_editar = %s, vendedores_visualizar = %s, vendedores_editar = %s, 
               compras_visualizar = %s, compras_editar = %s, fornecedores_visualizar = %s, fornecedores_editar = %s, 
               estoque_visualizar = %s, estoque_editar = %s, configuracoes_visualizar = %s, configuracoes_editar = %s, 
               financeiro_visualizar = %s, financeiro_editar = %s
               WHERE id = %s""",
            (grupo.nome, grupo.descricao, grupo.dashboard_visualizar, grupo.dashboard_editar, 
             grupo.produtos_visualizar, grupo.produtos_editar, grupo.clientes_visualizar, grupo.clientes_editar, 
             grupo.vendas_visualizar, grupo.vendas_editar, grupo.vendedores_visualizar, grupo.vendedores_editar, 
             grupo.compras_visualizar, grupo.compras_editar, grupo.fornecedores_visualizar, grupo.fornecedores_editar, 
             grupo.estoque_visualizar, grupo.estoque_editar, grupo.configuracoes_visualizar, grupo.configuracoes_editar, 
             grupo.financeiro_visualizar, grupo.financeiro_editar, grupo_id)
        )
        
        # Verificar se o grupo está em uso
        cursor.execute("SELECT COUNT(*) as total FROM usuarios WHERE grupo_id = %s", (grupo_id,))
        em_uso = cursor.fetchone()["total"] > 0
        
        return {"id": grupo_id, **grupo.dict(), "em_uso": em_uso}

@router.delete("/grupo_usuario/{grupo_id}")
async def delete_grupo_usuario(
    grupo_id: int,
    current_user = Depends(get_current_user)
):
    """
    Exclui um grupo de usuários específico.
    Requer autenticação de administrador.
    Não permite excluir grupos em uso por usuários.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem excluir grupos de usuários."
        )
    
    with get_db_cursor(commit=True) as cursor:
        # Verificar se o grupo existe
        cursor.execute("SELECT * FROM grupo_usuario WHERE id = %s", (grupo_id,))
        grupo = cursor.fetchone()
        
        if not grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Grupo de usuários com ID {grupo_id} não encontrado."
            )
        
        # Verificar se o grupo está em uso
        cursor.execute("SELECT COUNT(*) as total FROM usuarios WHERE grupo_id = %s", (grupo_id,))
        em_uso = cursor.fetchone()["total"] > 0
        
        if em_uso:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível excluir o grupo pois está sendo utilizado por usuários."
            )
        
        # Excluir o grupo
        cursor.execute("DELETE FROM grupo_usuario WHERE id = %s", (grupo_id,))
        
        return {"message": f"Grupo de usuários '{grupo['nome']}' excluído com sucesso"}

@router.get("/link_api")
async def get_api_url():
    """
    Endpoint público para obter a URL da API.
    Este endpoint não requer autenticação para permitir que o frontend
    sincronize a URL da API antes do login.
    """
    with get_db_cursor() as cursor:
        cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'link_api'")
        result = cursor.fetchone()
        
        if not result:
            return {"valor": "http://localhost:8000"}
        
        return {"valor": result["valor"]}

@router.get("/status")
async def check_api_status():
    """
    Endpoint público para verificar o status da API.
    Retorna informações sobre o servidor e a conexão.
    Não requer autenticação.
    """
    try:
        # Obter o nome do host
        hostname = socket.gethostname()
        # Obter o endereço IP
        ip_address = socket.gethostbyname(hostname)
        
        # Obter a URL da API configurada
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'link_api'")
            result = cursor.fetchone()
            api_url = result["valor"] if result else "http://localhost:8000"
        
        # Retornar informações de status
        return JSONResponse(
            status_code=200,
            content={
                "status": "online",
                "message": "API está funcionando corretamente",
                "server": {
                    "hostname": hostname,
                    "ip": ip_address
                },
                "config": {
                    "api_url": api_url
                }
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Erro ao verificar status: {str(e)}"
            }
        )

@router.get("/configuracoes/")
async def get_all_configs(current_user = Depends(get_current_user)):
    """
    Obtém todas as configurações do sistema.
    Requer autenticação.
    """
    # Verifica se o usuário tem permissão de administrador
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem acessar as configurações."
        )
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor, descricao FROM configuracoes")
        configs = cursor.fetchall()
        
        return configs

@router.put("/{chave}")
async def update_config(
    chave: str, 
    config_data: ConfigUpdate,
    current_user = Depends(get_current_user)
):
    """
    Atualiza uma configuração específica.
    Requer autenticação de administrador.
    Aceita qualquer chave de configuração.
    
    Parâmetros:
    - chave: Nome da configuração (path parameter)
    - config_data: Dados da configuração (request body)
        - valor: Valor da configuração (obrigatório)
        - descricao: Descrição da configuração (opcional)
    """
    # Verifica se o usuário tem permissão de administrador
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem alterar configurações."
        )
        
    # Verifica se o valor foi fornecido
    if not config_data.valor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O campo 'valor' é obrigatório"
        )
    
    with get_db_cursor(commit=True) as cursor:
        # Verifica se a configuração existe
        cursor.execute("SELECT id FROM configuracoes WHERE chave = %s", (chave,))
        existing_config = cursor.fetchone()
        
        if not existing_config:
            # Se não existir, cria uma nova configuração
            cursor.execute(
                "INSERT INTO configuracoes (chave, valor, descricao) VALUES (%s, %s, %s)",
                (chave, config_data.valor, config_data.descricao)
            )
            return {
                "message": f"Configuração '{chave}' criada com sucesso",
                "chave": chave,
                "valor": config_data.valor,
                "descricao": config_data.descricao
            }
        
        # Se existir, atualiza o valor e descrição
        if config_data.descricao is not None:
            cursor.execute(
                "UPDATE configuracoes SET valor = %s, descricao = %s WHERE chave = %s",
                (config_data.valor, config_data.descricao, chave)
            )
        else:
            cursor.execute(
                "UPDATE configuracoes SET valor = %s WHERE chave = %s",
                (config_data.valor, chave)
            )
        
        return {
             "message": f"Configuração '{chave}' atualizada com sucesso",
             "chave": chave,
             "valor": config_data.valor,
             "descricao": config_data.descricao
         }

@router.put("/batch")
async def update_configs_batch(
    batch_data: ConfigBatchUpdate,
    current_user = Depends(get_current_user)
):
    """
    Atualiza múltiplas configurações de uma vez.
    Requer autenticação de administrador.
    
    Parâmetros:
    - batch_data: Dicionário com as configurações a serem atualizadas
        - configuracoes: Dict[str, str] - chave: valor
    """
    # Verifica se o usuário tem permissão de administrador
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem alterar configurações."
        )
    
    if not batch_data.configuracoes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma configuração fornecida para atualização"
        )
    
    updated_configs = []
    created_configs = []
    errors = []
    
    with get_db_cursor(commit=True) as cursor:
        for chave, valor in batch_data.configuracoes.items():
            try:
                # Verifica se a configuração existe
                cursor.execute("SELECT id FROM configuracoes WHERE chave = %s", (chave,))
                existing_config = cursor.fetchone()
                
                if not existing_config:
                    # Se não existir, cria uma nova configuração
                    cursor.execute(
                        "INSERT INTO configuracoes (chave, valor) VALUES (%s, %s)",
                        (chave, valor)
                    )
                    created_configs.append({"chave": chave, "valor": valor})
                else:
                    # Se existir, atualiza o valor
                    cursor.execute(
                        "UPDATE configuracoes SET valor = %s WHERE chave = %s",
                        (valor, chave)
                    )
                    updated_configs.append({"chave": chave, "valor": valor})
                    
            except Exception as e:
                errors.append({"chave": chave, "erro": str(e)})
    
    return {
        "message": "Atualização em lote concluída",
        "atualizadas": updated_configs,
        "criadas": created_configs,
        "erros": errors,
        "total_processadas": len(updated_configs) + len(created_configs),
        "total_erros": len(errors)
    }

@router.post("/")
async def create_config(
    chave: str = Query(..., description="Chave da configuração"),
    config_data: ConfigUpdate = Body(...),
    current_user = Depends(get_current_user)
):
    """
    Cria uma nova configuração.
    Requer autenticação de administrador.
    
    Parâmetros:
    - chave: Nome da configuração (query parameter)
    - config_data: Dados da configuração (request body)
    """
    # Verifica se o usuário tem permissão de administrador
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem criar configurações."
        )
    
    with get_db_cursor(commit=True) as cursor:
        # Verifica se a configuração já existe
        cursor.execute("SELECT id FROM configuracoes WHERE chave = %s", (chave,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Configuração '{chave}' já existe. Use PUT para atualizar."
            )
        
        # Cria a nova configuração
        cursor.execute(
            "INSERT INTO configuracoes (chave, valor, descricao) VALUES (%s, %s, %s)",
            (chave, config_data.valor, config_data.descricao)
        )
        
        return {
            "message": f"Configuração '{chave}' criada com sucesso",
            "chave": chave,
            "valor": config_data.valor,
            "descricao": config_data.descricao
        }

@router.delete("/{chave}")
async def delete_config(
    chave: str,
    current_user = Depends(get_current_user)
):
    """
    Exclui uma configuração específica.
    Requer autenticação de administrador.
    
    Parâmetros:
    - chave: Nome da configuração a ser excluída
    """
    # Verifica se o usuário tem permissão de administrador
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão negada. Apenas administradores podem excluir configurações."
        )
    
    # Configurações críticas que não podem ser excluídas
    protected_keys = ["link_api", "api_port", "environment"]
    if chave in protected_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Configuração '{chave}' é crítica e não pode ser excluída."
        )
    
    with get_db_cursor(commit=True) as cursor:
        # Verifica se a configuração existe
        cursor.execute("SELECT id, valor, descricao FROM configuracoes WHERE chave = %s", (chave,))
        config = cursor.fetchone()
        
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Configuração '{chave}' não encontrada."
            )
        
        # Exclui a configuração
        cursor.execute("DELETE FROM configuracoes WHERE chave = %s", (chave,))
        
        return {
            "message": f"Configuração '{chave}' excluída com sucesso",
            "chave": chave,
            "valor_anterior": config["valor"],
            "descricao_anterior": config["descricao"]
        }
