import os
import mysql.connector
from dotenv import load_dotenv
from passlib.context import CryptContext

# Configuração do contexto de senha para bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Carrega as variáveis do arquivo .env
load_dotenv()

def hash_password(password):
    """Cria um hash bcrypt para a senha fornecida"""
    return pwd_context.hash(password)

def update_passwords():
    print("Atualizando senhas no banco de dados...")
    
    # Obtém as configurações do banco de dados
    db_config = {
        'host': os.getenv('DB_HOST'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'database': os.getenv('DB_NAME'),
        'port': os.getenv('DB_PORT')
    }
    
    try:
        # Conecta ao banco de dados
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Busca todos os usuários
        cursor.execute("SELECT id, senha FROM usuarios")
        users = cursor.fetchall()
        
        # Atualiza as senhas para o formato bcrypt
        for user in users:
            # Verifica se a senha já está no formato bcrypt
            if not user['senha'].startswith('$2b$'):
                # Cria um hash bcrypt para a senha atual
                hashed_password = hash_password(user['senha'])
                
                # Atualiza a senha no banco de dados
                cursor.execute(
                    "UPDATE usuarios SET senha = %s WHERE id = %s",
                    (hashed_password, user['id'])
                )
                print(f"Senha atualizada para o usuário ID {user['id']}")
        
        # Commit das alterações
        conn.commit()
        print("Todas as senhas foram atualizadas com sucesso!")
        
        # Cria um usuário admin se não existir
        cursor.execute("SELECT COUNT(*) as count FROM usuarios WHERE email = 'admin@erpmaneiro.com'")
        result = cursor.fetchone()
        
        if result['count'] == 0:
            # Cria um usuário admin
            admin_password = hash_password("admin123")
            cursor.execute(
                "INSERT INTO usuarios (nome, email, senha, nivel_acesso) VALUES (%s, %s, %s, %s)",
                ("Administrador", "admin@erpmaneiro.com", admin_password, "admin")
            )
            conn.commit()
            print("Usuário administrador criado com sucesso!")
            print("Email: admin@erpmaneiro.com")
            print("Senha: admin123")
        
    except mysql.connector.Error as err:
        print(f"Erro: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()
            print("Conexão com o MySQL fechada.")

if __name__ == "__main__":
    update_passwords()
