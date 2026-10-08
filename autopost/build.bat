@echo off
rem Gera dist\ERP AutoPost.exe. Usa um ambiente Python separado (.venv) para nao mexer no Python do ERP.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Criando o ambiente Python do AutoPost...
    python -m venv .venv || goto erro
)

echo Instalando as dependencias...
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt pyinstaller || goto erro

echo Gerando o executavel...
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean autopost.spec || goto erro

echo.
echo Pronto: %~dp0dist\ERP AutoPost.exe
exit /b 0

:erro
echo.
echo ERRO ao gerar o executavel. Veja as mensagens acima.
exit /b 1
