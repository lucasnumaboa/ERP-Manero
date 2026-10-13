"""
Ícone do AutoPost na bandeja do Windows (perto do relógio).

Fechar a janela só esconde o app: ele continua aqui (buscando produtos e postando). Clique no ícone para abrir;
botão direito › "Fechar o AutoPost" para sair de verdade. Os avisos ("Opa, apareceram produtos novos!") saem
daqui, como notificação do Windows.

Também garante uma instância só: abrir o .exe de novo com o AutoPost na bandeja só traz a janela que já existe
(duas cópias brigariam pelo mesmo Chrome).
"""
import ctypes
import sys
import threading
import time
from pathlib import Path

NOME_MUTEX = "Local\\ERP-AutoPost-instancia"
TITULO_JANELA = "ERP AutoPost"
ARG_DEPOIS_DE_ATUALIZAR = "--depois-de-atualizar"
_ERRO_JA_EXISTE = 183
_mutex = None


def garantir_instancia_unica() -> bool:
    """True se esta é a única instância. Senão traz a janela da outra para a frente e devolve False.
    Logo depois de uma atualização a versão velha ainda está fechando: espera ela sair (até 30 s)."""
    global _mutex
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    esperar_ate = time.monotonic() + (30 if ARG_DEPOIS_DE_ATUALIZAR in sys.argv else 0)
    while True:
        _mutex = kernel32.CreateMutexW(None, False, NOME_MUTEX)
        if ctypes.GetLastError() != _ERRO_JA_EXISTE:
            return True
        kernel32.CloseHandle(ctypes.c_void_p(_mutex))
        _mutex = None
        if time.monotonic() >= esperar_ate:
            break
        time.sleep(0.5)
    mostrar_janela_existente()
    return False


def mostrar_janela_existente():
    user32 = ctypes.windll.user32
    hwnd = user32.FindWindowW(None, TITULO_JANELA)
    if hwnd:
        user32.ShowWindow(hwnd, 5)    # SW_SHOW (estava escondida na bandeja)
        user32.ShowWindow(hwnd, 9)    # SW_RESTORE (estava minimizada)
        user32.SetForegroundWindow(hwnd)


class Bandeja:
    def __init__(self, icone: Path, abrir, fechar):
        import pystray
        from PIL import Image

        self._icone = pystray.Icon(
            "ERP AutoPost", Image.open(icone), "ERP AutoPost",
            menu=pystray.Menu(
                pystray.MenuItem("Abrir o AutoPost", lambda: abrir(), default=True),   # clique no ícone
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Fechar o AutoPost", lambda: fechar()),
            ))
        self._trava = threading.Lock()

    def iniciar(self):
        self._icone.run_detached()

    def avisar(self, titulo: str, texto: str):
        """Notificação do Windows saindo do ícone da bandeja."""
        with self._trava:
            try:
                self._icone.notify(texto, titulo)
            except Exception:
                pass

    def parar(self):
        try:
            self._icone.stop()
        except Exception:
            pass
