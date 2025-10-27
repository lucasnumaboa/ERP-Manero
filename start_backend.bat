@echo off
echo ===================================
echo Iniciando o Backend do ERP Maneiro
echo ===================================

cd backend
echo Ativando o ambiente virtual...

:: Verifica se o ambiente virtual existe, se não, cria
if not exist venv (
    echo Criando ambiente virtual...
    python -m venv venv
    call venv\Scripts\activate
    echo Instalando dependencias...
    pip install fastapi uvicorn python-jose[cryptography] passlib[bcrypt] python-multipart python-dotenv mysql-connector-python
) else (
    call venv\Scripts\activate
)

:: Inicia o servidor usando o script start.py
echo Iniciando o servidor FastAPI...
python start.py

:: Se o servidor for encerrado, desativa o ambiente virtual
call venv\Scripts\deactivate
