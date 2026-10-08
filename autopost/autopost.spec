# PyInstaller: gera dist\ERP AutoPost.exe (um arquivo só, sem janela de console). Use o build.bat.
a = Analysis(
    ["app.py"],
    pathex=["."],
    datas=[("ui", "ui")],
    hiddenimports=["plataformas.facebook", "plataformas.olx"],
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
    console=False,
    upx=False,
)
