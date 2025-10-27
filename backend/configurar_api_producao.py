#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script para configurar a API do ERP-MANEIRO em ambiente de produção
Este script permite configurar a URL da API e outras configurações relacionadas
diretamente no banco de dados, sem depender de arquivos .bat
"""

import os
import sys
import argparse
import mysql.connector
from urllib.parse import urlparse

# Adiciona o diretório atual ao path para permitir importações relativas
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
except ImportError:
    print("Erro ao importar configurações. Verifique se você está executando este script do diretório correto.")
    sys.exit(1)

def validar_url(url):
    """Valida se a URL fornecida é válida"""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

def obter_conexao():
    """Obtém uma conexão com o banco de dados"""
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        return conn
    except mysql.connector.Error as err:
        print(f"Erro ao conectar ao banco de dados: {err}")
        sys.exit(1)

def verificar_tabela_configuracoes(conn):
    """Verifica se a tabela de configurações existe e a cria se necessário"""
    cursor = conn.cursor()
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS configuracoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave VARCHAR(100) NOT NULL UNIQUE,
            valor TEXT,
            descricao TEXT,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        """)
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Erro ao criar tabela de configurações: {err}")
        sys.exit(1)
    finally:
        cursor.close()

def configurar_api(api_url, porta, ambiente, origens_permitidas):
    """Configura a API no banco de dados"""
    conn = obter_conexao()
    verificar_tabela_configuracoes(conn)
    
    cursor = conn.cursor()
    try:
        # Configuração da URL da API
        cursor.execute("""
        INSERT INTO configuracoes (chave, valor, descricao) 
        VALUES ('link_api', %s, 'URL base da API para acesso externo') 
        ON DUPLICATE KEY UPDATE 
            valor = %s,
            descricao = 'URL base da API para acesso externo'
        """, (api_url, api_url))
        
        # Configuração da porta da API
        cursor.execute("""
        INSERT INTO configuracoes (chave, valor, descricao) 
        VALUES ('api_port', %s, 'Porta em que a API está rodando') 
        ON DUPLICATE KEY UPDATE 
            valor = %s,
            descricao = 'Porta em que a API está rodando'
        """, (porta, porta))
        
        # Configuração do ambiente
        cursor.execute("""
        INSERT INTO configuracoes (chave, valor, descricao) 
        VALUES ('environment', %s, 'Ambiente de execução (development/production)') 
        ON DUPLICATE KEY UPDATE 
            valor = %s,
            descricao = 'Ambiente de execução (development/production)'
        """, (ambiente, ambiente))
        
        # Configuração de domínios permitidos para CORS
        cursor.execute("""
        INSERT INTO configuracoes (chave, valor, descricao) 
        VALUES ('allowed_origins', %s, 'Domínios permitidos para CORS (separados por vírgula)') 
        ON DUPLICATE KEY UPDATE 
            valor = %s,
            descricao = 'Domínios permitidos para CORS (separados por vírgula)'
        """, (origens_permitidas, origens_permitidas))
        
        conn.commit()
        print("Configurações da API atualizadas com sucesso!")
        
        # Exibe as configurações atuais
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('link_api', 'api_port', 'environment', 'allowed_origins')")
        print("\nConfigurações atuais:")
        for (chave, valor) in cursor:
            print(f"{chave}: {valor}")
            
    except mysql.connector.Error as err:
        print(f"Erro ao configurar API: {err}")
        conn.rollback()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description='Configurar API do ERP-MANEIRO para produção')
    parser.add_argument('--url', required=True, help='URL base da API (ex: http://meudominio.com:8000)')
    parser.add_argument('--porta', default='8000', help='Porta da API (padrão: 8000)')
    parser.add_argument('--ambiente', default='production', choices=['development', 'production'], 
                        help='Ambiente de execução (padrão: production)')
    parser.add_argument('--origens', default='*', 
                        help='Domínios permitidos para CORS, separados por vírgula (ex: http://meudominio.com,https://meudominio.com)')
    
    args = parser.parse_args()
    
    # Validar URL
    if not validar_url(args.url):
        print("Erro: URL inválida. Forneça uma URL válida (ex: http://meudominio.com:8000)")
        sys.exit(1)
    
    # Configurar API
    configurar_api(args.url, args.porta, args.ambiente, args.origens)
    
    print("\nPróximos passos:")
    print("1. Certifique-se de que o servidor está acessível na URL configurada")
    print("2. Atualize o localStorage do frontend com a nova URL da API")
    print("   - Adicione localStorage.setItem('api_base_url', 'http://seudominio.com:8000') no frontend")
    print("3. Reinicie o backend para aplicar as alterações")
    print("\nExemplo de comando para iniciar o backend em produção:")
    print(f"cd {os.path.dirname(os.path.abspath(__file__))} && python main.py")

if __name__ == "__main__":
    main()
