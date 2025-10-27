import os
import mysql.connector
from dotenv import load_dotenv
import sys

# Adiciona o diretório pai ao path para poder importar os módulos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

def create_database():
    print("Iniciando a criação do banco de dados...")
    
    # Obtém as configurações do banco de dados do arquivo .env
    db_host = os.getenv("DB_HOST", "localhost")
    db_user = os.getenv("DB_USER", "root")
    db_password = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "erp_maneiro")
    db_port = int(os.getenv("DB_PORT", "3306"))
    
    try:
        # Primeiro, conecta ao MySQL sem especificar um banco de dados
        conn = mysql.connector.connect(
            host=db_host,
            user=db_user,
            password=db_password,
            port=db_port
        )
        
        cursor = conn.cursor()
        
        # Cria o banco de dados se não existir
        print(f"Criando banco de dados '{db_name}' se não existir...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        
        # Fecha a conexão inicial
        cursor.close()
        conn.close()
        
        # Conecta ao banco de dados criado
        conn = mysql.connector.connect(
            host=db_host,
            user=db_user,
            password=db_password,
            database=db_name,
            port=db_port
        )
        
        cursor = conn.cursor()
        
        # Lê o arquivo SQL
        sql_file_path = os.path.join(os.path.dirname(__file__), "create_database.sql")
        
        with open(sql_file_path, 'r', encoding='utf-8') as sql_file:
            # Divide o arquivo em comandos SQL individuais
            sql_commands = sql_file.read().split(';')
            
            # Executa cada comando SQL
            for command in sql_commands:
                # Ignora linhas em branco e comentários
                command = command.strip()
                if command and not command.startswith('--'):
                    try:
                        cursor.execute(command)
                        print(f"Executado: {command[:50]}...")
                    except mysql.connector.Error as err:
                        print(f"Erro ao executar comando: {err}")
        
        # Commit das alterações
        conn.commit()
        print("Banco de dados criado com sucesso!")
        
    except mysql.connector.Error as err:
        print(f"Erro: {err}")
        return False
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()
            print("Conexão com o MySQL fechada.")
    
    return True

if __name__ == "__main__":
    create_database()
