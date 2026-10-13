"""
ERP AutoPost: publica os produtos do ERP no Facebook Marketplace e na OLX, num app só.

Rodar em desenvolvimento:  python app.py          (AUTOPOST_DEBUG=1 abre as ferramentas de desenvolvedor)
Gerar o .exe:              build.bat
"""
import ctypes
import os
import sys
import threading
import time
from pathlib import Path

import webview

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
sys.path.insert(0, str(BASE))

from api import Api  # noqa: E402
from bandeja import TITULO_JANELA, Bandeja, garantir_instancia_unica  # noqa: E402


def main():
    if not garantir_instancia_unica():
        return   # já estava aberto (talvez só na bandeja): a janela dele veio para a frente
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
        TITULO_JANELA, url=str(BASE / "ui" / "index.html"), js_api=api, maximized=maximizada,
        width=largura, height=altura, min_size=(min(1040, largura), min(640, altura)), background_color="#0b1626",
    )
    api._janela = janela
    estado = {"sair": False, "avisou_bandeja": False}

    def abrir():
        janela.show()
        janela.restore()
        ctypes.windll.user32.SetForegroundWindow(ctypes.windll.user32.FindWindowW(None, TITULO_JANELA))

    def fechar():
        estado["sair"] = True
        janela.destroy()

    def ao_fechar_janela():
        """O X da janela só esconde: o AutoPost continua na bandeja (buscando produtos, postando)."""
        if estado["sair"]:
            api.ao_fechar()
            return True
        threading.Thread(target=lambda: (time.sleep(0.05), janela.hide()), daemon=True).start()
        if not estado["avisou_bandeja"]:
            estado["avisou_bandeja"] = True
            bandeja.avisar("O AutoPost continua aberto", "Ele fica aqui na bandeja e segue buscando produtos. "
                           "Para fechar de vez: botão direito no ícone › Fechar o AutoPost.")
        return False

    bandeja = Bandeja(BASE / "ui" / "icone.png", abrir, fechar)
    api._avisar = bandeja.avisar
    api._fechar_app = fechar
    janela.events.closing += ao_fechar_janela
    bandeja.iniciar()
    try:
        webview.start(debug=os.getenv("AUTOPOST_DEBUG") == "1", icon=str(BASE / "ui" / "icone.ico"))
    finally:
        bandeja.parar()


if __name__ == "__main__":
    main()
