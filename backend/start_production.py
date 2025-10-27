#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script para iniciar o backend do ERP-MANEIRO em ambiente de produção
Este script configura o ambiente e inicia o servidor FastAPI
"""

import os
import sys
import uvicorn
import logging
from contextlib import contextmanager

# Configura o logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api_server.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("erp-api")

# Adiciona o diretório atual ao path para permitir importações relativas
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

@contextmanager
def change_dir(path):
    """Muda temporariamente o diretório de trabalho"""
    old_dir = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old_dir)

def get_api_config_from_db():
    """Obtém as configurações da API do banco de dados"""
    try:
        # Importa as configurações do banco de dados
        from database import get_db_cursor
        
        # Configurações padrão
        config = {
            'port': 8000,
            'environment': 'production',
            'reload': False
        }
        
        # Obtém as configurações do banco de dados
        with get_db_cursor() as cursor:
            # Verifica se a tabela de configurações existe
            cursor.execute("""
                SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_schema = DATABASE() AND table_name = 'configuracoes'
            """)
            if cursor.fetchone()['count'] == 0:
                logger.warning("Tabela de configurações não encontrada. Usando valores padrão.")
                return config
            
            # Obtém a porta da API
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'api_port'")
            result = cursor.fetchone()
            if result and result['valor']:
                try:
                    config['port'] = int(result['valor'])
                except ValueError:
                    logger.warning(f"Valor de porta inválido: {result['valor']}. Usando porta padrão 8000.")
            
            # Obtém o ambiente
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'environment'")
            result = cursor.fetchone()
            if result and result['valor']:
                config['environment'] = result['valor']
                config['reload'] = result['valor'] != 'production'
        
        return config
    except Exception as e:
        logger.error(f"Erro ao obter configurações do banco de dados: {e}")
        return {
            'port': 8000,
            'environment': 'production',
            'reload': False
        }

def start_server():
    """Inicia o servidor FastAPI"""
    # Obtém o diretório do backend
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Muda para o diretório do backend para garantir que as importações relativas funcionem
    with change_dir(backend_dir):
        try:
            # Obtém as configurações da API
            config = get_api_config_from_db()
            
            # Log das configurações
            logger.info(f"Iniciando servidor em modo {config['environment']}")
            logger.info(f"Porta: {config['port']}")
            logger.info(f"Reload automático: {'Ativado' if config['reload'] else 'Desativado'}")
            
            # Inicia o servidor
            uvicorn.run(
                "main:app", 
                host="0.0.0.0", 
                port=config['port'], 
                reload=config['reload'],
                log_level="info"
            )
        except Exception as e:
            logger.error(f"Erro ao iniciar o servidor: {e}")
            sys.exit(1)

if __name__ == "__main__":
    start_server()
