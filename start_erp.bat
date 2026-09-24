@echo off
chcp 65001 >nul
echo =======================================
echo Iniciando o Sistema ERP Maneiro
echo =======================================
echo.
echo Este script iniciara o backend e o frontend em janelas separadas.
echo.
echo * Backend: http://localhost:8000
echo * Frontend: http://localhost:3000
echo * API Docs: http://localhost:8000/docs
echo.

:: Cria a pasta de logs se nao existir
set "ROOT_DIR=%~dp0"
set "LOG_DIR=%ROOT_DIR%log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: Gera a data atual no formato YYYY-MM-DD
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "dt=%%I"
set "DATA_ATUAL=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%"

echo Atualizando configuracao da API...
python "%ROOT_DIR%change_api_link.py"
echo.

echo Logs serao salvos em: %LOG_DIR%
echo   - Backend:    backend_%DATA_ATUAL%.log
echo   - Frontend:   frontend_%DATA_ATUAL%.log
echo   - OLX Finder: olx_finder_%DATA_ATUAL%.log
echo.

:: Inicia o backend em uma nova janela com log
set "ERP_LOG_FILE=%LOG_DIR%\backend_%DATA_ATUAL%.log"
start "ERP Maneiro - Backend" cmd /c "cd /d %ROOT_DIR% && call start_backend.bat >> %ERP_LOG_FILE% 2>&1"

:: Aguarda 5 segundos para o backend iniciar
echo Aguardando o backend iniciar...
timeout /t 5 /nobreak > nul

:: Inicia o frontend em uma nova janela com log
set "ERP_LOG_FILE=%LOG_DIR%\frontend_%DATA_ATUAL%.log"
start "ERP Maneiro - Frontend" cmd /c "cd /d %ROOT_DIR% && call start_frontend.bat >> %ERP_LOG_FILE% 2>&1"

:: Inicia o OLX Finder em uma nova janela com log
set "ERP_LOG_FILE=%LOG_DIR%\olx_finder_%DATA_ATUAL%.log"
start "ERP Maneiro - OLX Finder" cmd /c "cd /d %ROOT_DIR% && call start_olx_finder.bat >> %ERP_LOG_FILE% 2>&1"

:: Abre o navegador com a aplicacao
echo Abrindo o navegador...
timeout /t 2 /nobreak > nul
start http://localhost:3000

echo.
echo Sistema ERP Maneiro iniciado com sucesso!
echo Para encerrar, feche as janelas de comando ou pressione Ctrl+C em cada uma delas.
echo.
