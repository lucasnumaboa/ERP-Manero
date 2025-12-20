@echo off
echo ========================================
echo ERP AutoPost Facebook - Build Script
echo ========================================
echo.

REM Install PyInstaller if not installed
pip install pyinstaller

echo.
echo Cleaning previous build...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul

echo.
echo Building executable...
echo.

REM Build the executable using spec file
pyinstaller autopost.spec

echo.
echo ========================================
echo Build complete!
echo.
echo IMPORTANTE: Copie o chromedriver.exe para a pasta dist\
echo junto com o executavel gerado.
echo.
echo Baixe o ChromeDriver compativel com sua versao do Chrome em:
echo https://googlechromelabs.github.io/chrome-for-testing/
echo ========================================
pause
