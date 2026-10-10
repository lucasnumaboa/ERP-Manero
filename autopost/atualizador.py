"""Atualização do próprio AutoPost: confere no ERP se a página Softwares tem outro exe, baixa, troca o arquivo
e abre a versão nova. Só vale para o .exe (rodando pelo Python não há arquivo para trocar)."""
import hashlib
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import quote

import requests

NOME_EXE = "ERP AutoPost.exe"


def numeros(versao):
    """"1.2.0" -> (1, 2, 0); vazio ou fora do padrão -> None."""
    try:
        return tuple(int(p) for p in str(versao).strip().split("."))
    except (TypeError, ValueError):
        return None


def executavel():
    """O .exe em uso, ou None rodando pelo Python."""
    return Path(sys.executable).resolve() if getattr(sys, "frozen", False) else None


def sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def verificar(api_url, versao_atual, exe=None, sessao=None):
    """Dados da versão publicada no ERP se o arquivo for outro e não for de versão anterior a esta; senão None."""
    exe = exe or executavel()
    if not exe:
        return None
    # t= e no-cache: um cache no caminho (o Cloudflare guarda o que termina em .exe) não pode responder com versão velha
    r = (sessao or requests).get(f"{api_url.rstrip('/')}/api/softwares/atualizacao/{quote(NOME_EXE)}",
                                 params={"t": int(time.time())}, headers={"Cache-Control": "no-cache"}, timeout=15)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    info = r.json()
    if info.get("sha256") == sha256(exe):
        return None
    nova, atual = numeros(info.get("versao_app")), numeros(versao_atual)
    if nova and atual and nova <= atual:
        return None   # publicado é esta versão ou anterior (este exe pode ser um teste mais novo)
    return info


def limpar_sobras(exe=None):
    """Apaga o exe velho da atualização anterior e download que ficou pela metade.
    O exe velho pode levar uns segundos para fechar depois de abrir este: tenta por até 1 minuto."""
    exe = exe or executavel()
    if not exe:
        return
    sobras = [p for p in (exe.with_name(exe.name + ".antigo"), exe.with_name(exe.name + ".novo")) if p.exists()]

    def apagar():
        for _ in range(30):
            for p in list(sobras):
                try:
                    p.unlink(missing_ok=True)
                    sobras.remove(p)
                except OSError:
                    pass
            if not sobras:
                return
            time.sleep(2)

    if sobras:
        threading.Thread(target=apagar, daemon=True).start()


class Atualizador:
    """Baixa o exe novo ao lado do atual, confere o hash e troca os arquivos; quem chama abre o novo e fecha a janela."""

    def __init__(self, api_url, exe=None, sessao=None):
        self.api_url = api_url.rstrip("/")
        self.exe = exe or executavel()
        self.sessao = sessao or requests.Session()
        self.novo = self.exe.with_name(self.exe.name + ".novo")
        self.antigo = self.exe.with_name(self.exe.name + ".antigo")
        self.estado = {"etapa": "parado", "baixado": 0, "total": 0, "erro": ""}
        self._thread = None

    def iniciar(self, info):
        if self._thread and self._thread.is_alive():
            return
        self.estado = {"etapa": "baixando", "baixado": 0, "total": int(info.get("tamanho") or 0), "erro": ""}
        self._thread = threading.Thread(target=self._rodar, args=(info,), daemon=True)
        self._thread.start()

    def _rodar(self, info):
        try:
            self.baixar(info)
            self.trocar()
            self.estado["etapa"] = "pronto"
        except PermissionError:
            self._desfazer()
            self.estado.update(etapa="erro", erro=f"Sem permissão para trocar o arquivo na pasta {self.exe.parent}. "
                                                  "Baixe a versão nova pela página Softwares do ERP.")
        except Exception as e:
            self._desfazer()
            self.estado.update(etapa="erro", erro=str(e) or type(e).__name__)

    def _desfazer(self):
        try:
            self.novo.unlink(missing_ok=True)
        except OSError:
            pass

    def baixar(self, info):
        url = info["url"] if info["url"].startswith("http") else f"{self.api_url}{info['url']}"
        h = hashlib.sha256()
        with self.sessao.get(url, stream=True, timeout=60) as r:
            if r.status_code != 200:
                raise RuntimeError(f"O ERP não entregou o arquivo (HTTP {r.status_code}).")
            with open(self.novo, "wb") as f:
                for bloco in r.iter_content(256 * 1024):
                    f.write(bloco)
                    h.update(bloco)
                    self.estado["baixado"] += len(bloco)
        if h.hexdigest() != info["sha256"]:
            raise RuntimeError("O arquivo baixado veio diferente do publicado. Tente de novo.")

    def trocar(self):
        """O Windows deixa renomear (não apagar) um exe em uso: o atual vira .antigo e o novo fica com o nome dele."""
        try:
            self.antigo.unlink(missing_ok=True)
        except OSError:
            pass
        os.replace(self.exe, self.antigo)
        try:
            os.replace(self.novo, self.exe)
        except OSError:
            os.replace(self.antigo, self.exe)
            raise

    def abrir_novo(self):
        # sem isto o exe novo usaria a pasta temporária deste, que é apagada quando este fecha
        env = dict(os.environ, PYINSTALLER_RESET_ENVIRONMENT="1")
        subprocess.Popen([str(self.exe)], cwd=str(self.exe.parent), env=env, close_fds=True,
                         creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
