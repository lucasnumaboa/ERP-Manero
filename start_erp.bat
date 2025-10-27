@echo off
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
echo Pressione qualquer tecla para continuar...
echo pause > nul

:: Inicia o backend em uma nova janela
start cmd /k "title ERP Maneiro - Backend && cd %~dp0 && call start_backend.bat"

:: Aguarda 5 segundos para o backend iniciar
echo Aguardando o backend iniciar...
timeout /t 5 /nobreak > nul

:: Inicia o frontend em uma nova janela
start cmd /k "title ERP Maneiro - Frontend && cd %~dp0 && call start_frontend.bat"

:: Abre o navegador com a aplicação
echo Abrindo o navegador...
timeout /t 2 /nobreak > nul
start http://localhost:3000

echo.
echo Sistema ERP Maneiro iniciado com sucesso!
echo Para encerrar, feche as janelas de comando ou pressione Ctrl+C em cada uma delas.
echo.
