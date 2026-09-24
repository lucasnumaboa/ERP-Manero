@echo off
echo ====================================
echo Iniciando o Frontend do ERP Maneiro
echo ====================================

cd frontend

:: Verifica se o http-server está instalado globalmente
where http-server >nul 2>&1
if %errorlevel% neq 0 (
    echo Instalando http-server...
    call npm install -g http-server
)

:: Inicia o servidor HTTP na porta 3000
echo Iniciando o servidor HTTP na porta 3000...
:: -c0: o navegador confere cada arquivo e só baixa de novo o que mudou (resposta 304)
call npx http-server -p 3000 -c0

echo Frontend encerrado.
