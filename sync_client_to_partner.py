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

def sync_client_to_partner(client_id):
    conn = get_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verificar se o cliente existe
        cursor.execute("SELECT * FROM clientes WHERE id = %s", (client_id,))
        cliente = cursor.fetchone()
        
        if not cliente:
            print(f"Cliente com ID {client_id} não encontrado.")
            return False
        
        # Verificar se já existe um parceiro com o mesmo CPF/CNPJ
        if cliente['cpf_cnpj']:
            cursor.execute("SELECT * FROM parceiros WHERE documento = %s", (cliente['cpf_cnpj'],))
            parceiro_existente = cursor.fetchone()
            
            if parceiro_existente:
                print(f"Já existe um parceiro com o documento {cliente['cpf_cnpj']}.")
                return False
        
        # Criar parceiro baseado no cliente
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
        
        print(f"Cliente ID {client_id} sincronizado com sucesso como Parceiro ID {parceiro_id}.")
        return parceiro_id
    
    except Error as e:
        print(f"Erro ao sincronizar cliente para parceiro: {e}")
        return False
    
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    client_id = int(input("Digite o ID do cliente que deseja sincronizar: "))
    partner_id = sync_client_to_partner(client_id)
    
    if partner_id:
        print(f"Use o ID {partner_id} do parceiro para criar vendas.")
    else:
        print("Falha ao sincronizar cliente para parceiro.")
