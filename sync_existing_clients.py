import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Configurações do banco de dados
db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'erp_maneiro')
}

def get_connection():
    try:
        conn = mysql.connector.connect(**db_config)
        return conn
    except Error as e:
        print(f"Erro ao conectar ao MySQL: {e}")
        return None

def sync_all_clients_to_partners():
    conn = get_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Obter todos os clientes
        cursor.execute("SELECT * FROM clientes")
        clientes = cursor.fetchall()
        
        print(f"Encontrados {len(clientes)} clientes para sincronizar.")
        
        sincronizados = 0
        ja_existentes = 0
        erros = 0
        
        for cliente in clientes:
            # Verificar se já existe um parceiro com o mesmo CPF/CNPJ
            if cliente['cpf_cnpj']:
                cursor.execute("SELECT id FROM parceiros WHERE documento = %s", (cliente['cpf_cnpj'],))
                parceiro_existente = cursor.fetchone()
                
                if parceiro_existente:
                    print(f"Cliente {cliente['id']} - {cliente['nome']} já possui um parceiro correspondente (ID: {parceiro_existente['id']}).")
                    ja_existentes += 1
                    continue
            
            # Criar parceiro baseado no cliente
            try:
                cursor.execute("""
                    INSERT INTO parceiros (
                        tipo, nome, documento, email, telefone,
                        endereco, cidade, estado, cep, ativo
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    'cliente',
                    cliente['nome'],
                    cliente['cpf_cnpj'],
                    cliente['email'],
                    cliente['telefone'],
                    cliente['endereco'],
                    cliente['cidade'],
                    cliente['estado'],
                    cliente['cep'],
                    cliente['ativo']
                ))
                
                conn.commit()
                
                # Obter o ID do parceiro criado
                cursor.execute("SELECT LAST_INSERT_ID()")
                parceiro_id = cursor.fetchone()['LAST_INSERT_ID()']
                
                print(f"Cliente ID {cliente['id']} - {cliente['nome']} sincronizado como Parceiro ID {parceiro_id}.")
                sincronizados += 1
                
            except Error as e:
                print(f"Erro ao sincronizar cliente ID {cliente['id']} - {cliente['nome']}: {e}")
                erros += 1
        
        print("\nResumo da sincronização:")
        print(f"Total de clientes: {len(clientes)}")
        print(f"Já sincronizados anteriormente: {ja_existentes}")
        print(f"Sincronizados agora: {sincronizados}")
        print(f"Erros: {erros}")
        
        return True
    
    except Error as e:
        print(f"Erro ao sincronizar clientes para parceiros: {e}")
        return False
    
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    print("Iniciando sincronização de clientes para parceiros...")
    if sync_all_clients_to_partners():
        print("Sincronização concluída com sucesso!")
    else:
        print("Falha na sincronização.")
