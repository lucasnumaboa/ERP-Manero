# -*- mode: python ; coding: utf-8 -*-

import os
import sys

block_cipher = None

# Get the path to helpers module
helpers_path = os.path.join(os.getcwd(), 'helpers')

a = Analysis(
    ['gui.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('icon.png', '.'),
        ('helpers', 'helpers'),  # Include entire helpers folder
        ('ChromeSetup.exe', '.'),  # Chrome installer
    ],
    hiddenimports=[
        'helpers',
        'helpers.scraper',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ERP AutoPost Facebook',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.png',
)
