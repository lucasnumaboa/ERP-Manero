import os
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env
load_dotenv()

# Configurações do banco de dados
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "erp_maneiro")

# Configurações de segurança
SECRET_KEY = os.getenv("SECRET_KEY", "chave_secreta_temporaria")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configurações da aplicação
APP_NAME = "ERP Maneiro"
APP_VERSION = "1.0.0"
APP_DESCRIPTION = "Sistema ERP completo para gestão empresarial"
