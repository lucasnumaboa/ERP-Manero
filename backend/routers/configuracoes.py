from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional
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

router = APIRouter(
    tags=["configuracoes"]
)

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
