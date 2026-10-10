"""
ERP AutoPost: publica os produtos do ERP no Facebook Marketplace e na OLX, num app só.

Rodar em desenvolvimento:  python app.py          (AUTOPOST_DEBUG=1 abre as ferramentas de desenvolvedor)
Gerar o .exe:              build.bat
"""
import ctypes
import os
import sys
from pathlib import Path

import webview

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
sys.path.insert(0, str(BASE))

from api import Api  # noqa: E402


def main():
    api = Api()
    largura, altura, maximizada = 1320, 840, False
    try:   # monitor pequeno ou com zoom do Windows: a tela vem em pixels físicos, a janela usa pixels com zoom
        escala = ctypes.windll.user32.GetDpiForSystem() / 96
        tela = webview.screens[0]
        livre_l, livre_a = tela.width / escala, tela.height / escala
        maximizada = livre_l < largura + 60 or livre_a < altura + 80
        largura, altura = min(largura, int(livre_l * 0.92)), min(altura, int(livre_a * 0.86))
    except Exception:
        pass
    janela = webview.create_window(
        "ERP AutoPost", url=str(BASE / "ui" / "index.html"), js_api=api, maximized=maximizada,
        width=largura, height=altura, min_size=(min(1040, largura), min(640, altura)), background_color="#0b1626",
    )
    api._janela = janela
    janela.events.closing += api.ao_fechar
    webview.start(debug=os.getenv("AUTOPOST_DEBUG") == "1", icon=str(BASE / "ui" / "icone.ico"))


if __name__ == "__main__":
    main()
