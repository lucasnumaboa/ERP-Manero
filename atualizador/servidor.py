"""
Atualizador do ERP no Docker (serviço `atualizador` do docker-compose.yml).

O backend não consegue remontar a própria imagem; este serviço consegue, porque enxerga a pasta do projeto
(/projeto) e o Docker do computador (/var/run/docker.sock). Ele só fala com o backend, pela rede interna
(sem porta para fora), e só atende quem manda a SECRET_KEY do .env.

POST /iniciar: backup do banco -> código do GitHub em /projeto -> monta backend e tela -> sobe os dois de novo.
O banco e as fotos ficam nos volumes do Docker e não são tocados.
"""
import gzip
import json
import os
import subprocess
import threading
import time
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import atualizar

PROJETO = Path(os.getenv("PROJETO_DIR", "/projeto"))
TOKEN = os.environ.get("ATUALIZADOR_TOKEN", "")
BACKEND = os.getenv("CONTAINER_BACKEND", "erp-maneiro-backend")
BANCO = os.getenv("CONTAINER_BANCO", "erp-maneiro-db")
URL_BACKEND = os.getenv("URL_BACKEND", "http://backend:8000/docs")
_trava = threading.Lock()


def docker(*args, **kw):
    return subprocess.run(["docker", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)


def projeto_compose() -> str:
    """Nome do projeto do compose em uso: com outro nome o Docker criaria volumes novos (banco vazio)."""
    r = docker("inspect", "-f", '{{index .Config.Labels "com.docker.compose.project"}}', BACKEND)
    nome = r.stdout.strip()
    if r.returncode or not nome:
        raise atualizar.Cancelada(f"não achei o container {BACKEND} ({r.stderr.strip()})")
    return nome


def backup_banco(log) -> Path:
    pasta = PROJETO / "backup"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"antes_atualizar_{datetime.now():%Y%m%d_%H%M%S}.sql.gz"
    comando = ["docker", "exec", BANCO, "sh", "-c",
               'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers '
               '--no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"']
    with subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as proc, gzip.open(destino, "wb") as saida:
        for bloco in iter(lambda: proc.stdout.read(1 << 20), b""):
            saida.write(bloco)
        erro = proc.stderr.read().decode("utf-8", "replace")
    if proc.returncode:
        destino.unlink(missing_ok=True)
        raise atualizar.Cancelada(f"o backup do banco falhou: {erro.strip()[-400:]}")
    log(f"Backup do banco: backup/{destino.name} ({destino.stat().st_size // 1024} KB)")
    return destino


def backend_no_ar(segundos=240) -> bool:
    fim = time.monotonic() + segundos
    while time.monotonic() < fim:
        try:
            with urllib.request.urlopen(URL_BACKEND, timeout=5) as r:
                if r.status == 200:
                    return True
        except OSError:
            pass
        time.sleep(3)
    return False


def rodar():
    andamento = atualizar.Andamento(PROJETO)
    try:
        nome = projeto_compose()
        backup_banco(andamento.log)
        r = atualizar.atualizar_codigo(PROJETO, checar_alteracoes=False, log=andamento.log)
        andamento.estado.update({"de": r["de"], "para": r["para"]})
        if not r["mudou"]:
            andamento.terminar(True, "O sistema já está na versão mais nova.")
            return
        compose = ["compose", "-p", nome, "--project-directory", str(PROJETO), "-f", str(PROJETO / "docker-compose.yml")]
        andamento.log("Montando as imagens novas do backend e da tela (pode levar alguns minutos)...")
        montagem = docker(*compose, "build", "backend", "frontend")
        if montagem.returncode:
            raise RuntimeError(f"docker compose build falhou: {(montagem.stderr or montagem.stdout)[-1500:]}")
        andamento.log("Subindo o backend e a tela com a versão nova...")
        subida = docker(*compose, "up", "-d", "--no-deps", "backend", "frontend")
        if subida.returncode:
            raise RuntimeError(f"docker compose up falhou: {(subida.stderr or subida.stdout)[-1500:]}")
        andamento.log("Esperando o backend responder (ele atualiza as tabelas do banco ao subir)...")
        if not backend_no_ar():
            raise RuntimeError("o backend não respondeu em 4 minutos. Veja: docker compose logs backend")
        andamento.terminar(True, f"Atualizado para {r['para']['curto']} ({r['para']['mensagem']}).")
    except atualizar.Cancelada as e:
        andamento.terminar(False, f"Atualização cancelada: {e}")
    except Exception as e:
        andamento.terminar(False, f"Falha na atualização: {e}")
    finally:
        _trava.release()


class Atendente(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _responder(self, codigo, dados):
        corpo = json.dumps(dados, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _autorizado(self):
        if TOKEN and self.headers.get("X-Token") == TOKEN:
            return True
        self._responder(403, {"detail": "não autorizado"})
        return False

    def do_GET(self):
        if not self._autorizado():
            return
        if self.path == "/verificar":
            try:
                self._responder(200, atualizar.verificar(PROJETO, checar_alteracoes=False))
            except Exception as e:
                self._responder(502, {"detail": f"não consegui consultar o GitHub: {e}"})
        elif self.path == "/andamento":
            self._responder(200, atualizar.ler_estado(PROJETO))
        else:
            self._responder(404, {"detail": "não existe"})

    def do_POST(self):
        if not self._autorizado():
            return
        if self.path != "/iniciar":
            return self._responder(404, {"detail": "não existe"})
        if not _trava.acquire(blocking=False):
            return self._responder(409, {"detail": "Já tem uma atualização em andamento."})
        threading.Thread(target=rodar, daemon=True).start()
        self._responder(202, {"ok": True})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("ATUALIZADOR_TOKEN vazio: defina SECRET_KEY no .env")
    print("Atualizador do ERP ouvindo na porta 9000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 9000), Atendente).serve_forever()
