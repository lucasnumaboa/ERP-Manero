@echo off
echo ===================================
echo Iniciando o Backend do ERP Maneiro
echo ===================================

cd backend

:: Usa o Python instalado no sistema. As dependencias ficam em requirements.txt (raiz do projeto);
:: so instala se faltar alguma, para nao baixar nada a cada inicializacao.
python -c "import fastapi, uvicorn, mysql.connector, jose, passlib, dotenv, multipart, PIL, httpx" >nul 2>&1
if %errorlevel% neq 0 (
    echo Instalando dependencias...
    python -m pip install -r ..equirements.txt
)

:: Inicia o servidor usando o script start.py
echo Iniciando o servidor FastAPI...
python start.py
