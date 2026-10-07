@echo off
rem Instala a copia do ERP Maneiro no Docker deste PC (detalhes em LEIA-ME.md)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
pause
