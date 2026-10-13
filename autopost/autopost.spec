# PyInstaller: gera dist\ERP AutoPost.exe (um arquivo só, sem janela de console). Use o build.bat.
import re
from PyInstaller.utils.win32.versioninfo import (FixedFileInfo, StringFileInfo, StringStruct, StringTable,
                                                 VarFileInfo, VarStruct, VSVersionInfo)

# Nome e versão no exe (Propriedades › Detalhes); o Windows mostra a descrição no cabeçalho das notificações.
_versao = re.search(r'VERSAO = "([\d.]+)"', open("api.py", encoding="utf-8").read()).group(1)
_numeros = tuple(int(n) for n in (_versao.split(".") + ["0", "0", "0"])[:4])
INFO_VERSAO = VSVersionInfo(
    ffi=FixedFileInfo(filevers=_numeros, prodvers=_numeros),
    kids=[StringFileInfo([StringTable("041604B0", [
        StringStruct("CompanyName", "ERP Maneiro"), StringStruct("FileDescription", "ERP AutoPost"),
        StringStruct("FileVersion", _versao), StringStruct("ProductName", "ERP AutoPost"),
        StringStruct("ProductVersion", _versao), StringStruct("OriginalFilename", "ERP AutoPost.exe")])]),
        VarFileInfo([VarStruct("Translation", [0x0416, 1200])])],
)
a = Analysis(
    ["app.py"],
    pathex=["."],
    datas=[("ui", "ui")],
    hiddenimports=["plataformas.facebook", "plataformas.olx", "pystray._win32"],   # o pystray escolhe o backend em tempo de execução
    excludes=["tkinter", "pytest", "matplotlib", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ERP AutoPost",
    icon="ui/icone.ico",
    version=INFO_VERSAO,
    console=False,
    upx=False,
)
