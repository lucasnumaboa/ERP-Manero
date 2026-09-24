"""
Script para verificar e criar flags OLX padrão para todos os usuários existentes.
Executa uma vez para garantir que todos os usuários tenham as flags "Defeito" e "Retirada peças".
"""

import os
import mysql.connector
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env
load_dotenv()

# Obtém as configurações do banco de dados
db_config = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT'),
    'database': os.getenv('DB_NAME')
}

# Flags padrão que devem existir para cada usuário
DEFAULT_FLAGS = [
    ('Defeito', False, 'com defeito, não funciona, tela preta, queimado, com problema, danificado, sem funcionar'),
    ('Retirada peças', False, 'retirada de peça, para retirada de peças, somente peças, aproveitamento de peças, para sucata, sucata, quebrado'),
]

def criar_flags_usuarios():
    """
    Verifica todos os usuários e cria as flags OLX padrão se não existirem.
    """
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Buscar todos os usuários
        cursor.execute("SELECT id, nome FROM usuarios")
        usuarios = cursor.fetchall()
        
        print(f"Encontrados {len(usuarios)} usuários no banco de dados.\n")
        
        total_criados = 0
        total_ignorados = 0
        
        for usuario in usuarios:
            usuario_id = usuario['id']
            usuario_nome = usuario['nome']
            
            print(f"Verificando usuário: {usuario_nome} (ID: {usuario_id})")
            
            for nome_flag, incluir, palavras in DEFAULT_FLAGS:
                # Verificar se a flag já existe para este usuário
                cursor.execute("""
                    SELECT id FROM olx_flags 
                    WHERE usuario_id = %s AND nome = %s
                """, (usuario_id, nome_flag))
                
                flag_existente = cursor.fetchone()
                
                if flag_existente:
                    print(f"  ✓ Flag '{nome_flag}' já existe. Ignorando.")
                    total_ignorados += 1
                else:
                    # Criar a flag
                    cursor.execute("""
                        INSERT INTO olx_flags (nome, incluir, palavras_chave, usuario_id)
                        VALUES (%s, %s, %s, %s)
                    """, (nome_flag, incluir, palavras, usuario_id))
                    print(f"  + Flag '{nome_flag}' criada!")
                    total_criados += 1
            
            print()
        
        conn.commit()
        
        print("=" * 50)
        print(f"Processo concluído!")
        print(f"  - Flags criadas: {total_criados}")
        print(f"  - Flags já existentes (ignoradas): {total_ignorados}")
        print("=" * 50)
        
    except mysql.connector.Error as err:
        print(f"Erro ao processar: {err}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    criar_flags_usuarios()
