import os
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env
load_dotenv()

# Configurações do banco de dados
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "erp_maneiro")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# Configurações de segurança
SECRET_KEY = os.getenv("SECRET_KEY")
# A chave antiga foi publicada no GitHub; com ela qualquer um forja tokens válidos.
if not SECRET_KEY or SECRET_KEY == "chave_secreta_temporaria" or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY ausente ou insegura no backend/.env. "
        "Gere uma com: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configurações da aplicação
APP_NAME = "ERP Maneiro"
APP_VERSION = "1.0.0"
APP_DESCRIPTION = "Sistema ERP completo para gestão empresarial"
