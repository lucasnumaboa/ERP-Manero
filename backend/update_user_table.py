#!/usr/bin/env python3
"""
Script para adicionar as colunas last_access e connected na tabela usuarios
"""

from database import get_db_cursor

def update_user_table():
    """Adiciona as colunas last_access e connected se elas não existirem"""
    
    try:
        with get_db_cursor(commit=True) as cursor:
            # Verificar se as colunas existem
            cursor.execute("""
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'usuarios' 
                AND COLUMN_NAME IN ('last_access', 'connected')
            """)
            
            existing_columns = [row['COLUMN_NAME'] for row in cursor.fetchall()]
            print(f"Colunas existentes: {existing_columns}")
            
            # Adicionar coluna last_access se não existir
            if 'last_access' not in existing_columns:
                print("Adicionando coluna last_access...")
                cursor.execute("""
                    ALTER TABLE usuarios 
                    ADD COLUMN last_access TIMESTAMP NULL
                """)
                print("✅ Coluna last_access adicionada com sucesso!")
            else:
                print("✅ Coluna last_access já existe")
            
            # Adicionar coluna connected se não existir
            if 'connected' not in existing_columns:
                print("Adicionando coluna connected...")
                cursor.execute("""
                    ALTER TABLE usuarios 
                    ADD COLUMN connected BOOLEAN DEFAULT FALSE
                """)
                print("✅ Coluna connected adicionada com sucesso!")
            else:
                print("✅ Coluna connected já existe")
            
            # Verificar se a configuração timeout_time existe
            cursor.execute("SELECT COUNT(*) as count FROM configuracoes WHERE chave = 'timeout_time'")
            result = cursor.fetchone()
            
            if result['count'] == 0:
                print("Adicionando configuração timeout_time...")
                cursor.execute("""
                    INSERT INTO configuracoes (chave, valor, descricao) 
                    VALUES ('timeout_time', '15', 'Tempo limite de inatividade em minutos')
                """)
                print("✅ Configuração timeout_time adicionada com sucesso!")
            else:
                print("✅ Configuração timeout_time já existe")
                
            print("\n🎉 Atualização da tabela usuarios concluída com sucesso!")
            
    except Exception as e:
        print(f"❌ Erro ao atualizar tabela usuarios: {e}")
        raise

if __name__ == "__main__":
    update_user_table()