@echo off
rem Troca o banco da copia pelo .sql mais novo da pasta banco\ (o que foi feito na copia e perdido)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" -SoBanco
pause
