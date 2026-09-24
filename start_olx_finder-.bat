@echo off
echo =======================================
echo Iniciando OLX Finder Service
echo =======================================
echo.
echo Este script iniciara o servico de pesquisa OLX em segundo plano.
echo.

cd /d "%~dp0"

:: Verifica se o ambiente virtual existe
if exist "venv\Scripts\activate.bat" (
    echo Ativando ambiente virtual...
    call venv\Scripts\activate.bat
    goto :install_deps
)

if exist ".venv\Scripts\activate.bat" (
    echo Ativando ambiente virtual .venv...
    call .venv\Scripts\activate.bat
    goto :install_deps
)

echo AVISO: Nenhum ambiente virtual encontrado. Usando Python do sistema.

:install_deps
:: Instala dependencias se necessario
echo Verificando dependencias...
pip install -q -r olx-porta3306\requirements.txt

:start_service
:: Muda para o diretorio do OLX Finder
cd olx-porta3306

:: Inicia o servico
echo.
echo Iniciando o servico OLX Finder...
echo.
python olx_finder_service.py

pause
