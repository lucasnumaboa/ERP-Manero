@echo off
echo =======================================
echo Configurando o Banco de Dados do ERP Maneiro
echo =======================================
echo.

echo Verificando se o Python está instalado...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python não encontrado. Por favor, instale o Python 3.x e tente novamente.
    pause
    exit /b 1
)

echo Verificando se as bibliotecas necessárias estão instaladas...
pip install mysql-connector-python python-dotenv

echo.
echo Criando o banco de dados e tabelas...
python database\setup_database.py

echo.
echo Configuração do banco de dados concluída!
echo.
pause
