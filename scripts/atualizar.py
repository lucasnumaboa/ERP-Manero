"""
Atualiza o ERP com a versão do GitHub (botão "Atualizar" em Configurações).

Dois jeitos de instalação, o mesmo código:
- Local (Windows, C:\\ERP é um clone do git): o backend roda este arquivo num processo à parte
  (`python scripts/atualizar.py`). Ele faz backup do banco, traz o código novo, instala dependências novas,
  roda o init_db.py (cria tabelas e colunas novas) e reinicia o backend. A tela não precisa reiniciar: o
  servidor de arquivos já entrega os arquivos novos.
- Docker: o serviço `atualizador` (pasta atualizador/) usa as funções daqui para trazer o código e depois
  remonta as imagens do backend e da tela.

O código vem por git: `fetch` da branch e `reset --hard` para ela. Antes disso, na instalação local:
- commit deste PC que não está no GitHub ou arquivo alterado à mão cancela a atualização (não se perde nada);
- o endereço da API em frontend/js/config.js e o ?v= dos HTML são do próprio PC (change_api_link.py e
  versionar_frontend.py): são guardados e aplicados de novo.

Andamento e resultado ficam em log/atualizacao.json (a tela lê de lá, inclusive depois do reinício).
"""
import ctypes
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REPO_PADRAO = "https://github.com/lucasnumaboa/ERP-Manero.git"
BRANCH_PADRAO = "main"
CONFIG_JS = "frontend/js/config.js"
VERSAO_JSON = "backend/versao.json"   # versão instalada quando não há .git (imagem Docker); fora do git
# configurações deste computador que a atualização nunca troca (o .env da raiz é o do Docker na cópia em contêiner)
PROTEGIDOS = [".env", "backend/.env", ".env.local", "last_api_url.json"]
URL_API = re.compile(r"(const ERP_API_URL_PADRAO = )'([^']*)'")
SEM_JANELA = 0x08000000 if os.name == "nt" else 0


class Cancelada(Exception):
    """Atualização recusada antes de mexer em qualquer arquivo."""


def arquivo_estado(raiz: Path) -> Path:
    return Path(raiz) / "log" / "atualizacao.json"


def ler_estado(raiz: Path) -> dict:
    try:
        return json.loads(arquivo_estado(raiz).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


class Andamento:
    """Guarda o passo a passo em log/atualizacao.json a cada linha."""

    def __init__(self, raiz: Path, pid=None):
        self.arquivo = arquivo_estado(raiz)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        self.estado = {"rodando": True, "pid": pid or os.getpid(), "inicio": _agora(), "fim": None,
                       "ok": None, "mensagem": "", "de": None, "para": None, "linhas": []}
        self._gravar()

    def log(self, texto):
        self.estado["linhas"].append(f"[{datetime.now():%H:%M:%S}] {texto}")
        self._gravar()
        print(texto, flush=True)

    def terminar(self, ok, mensagem, **extra):
        self.estado.update({"rodando": False, "fim": _agora(), "ok": ok, "mensagem": mensagem, **extra})
        self.log(mensagem)

    def _gravar(self):
        temporario = self.arquivo.with_suffix(".tmp")
        temporario.write_text(json.dumps(self.estado, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(temporario, self.arquivo)


def _agora():
    return datetime.now().isoformat(timespec="seconds")


# ---------- git ----------
def git(raiz, *args, verificar=True) -> str:
    r = subprocess.run(["git", "-c", "safe.directory=*", "-c", "core.autocrlf=false", *args], cwd=raiz,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=SEM_JANELA)
    if verificar and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {(r.stderr or r.stdout).strip()}")
    return r.stdout.strip()


def tem_repo(raiz) -> bool:
    return (Path(raiz) / ".git").exists()


def url_do_repo(raiz) -> str:
    if os.getenv("ERP_REPO_URL"):
        return os.environ["ERP_REPO_URL"]
    if tem_repo(raiz):
        url = git(raiz, "remote", "get-url", "origin", verificar=False)
        if url:
            return url
    return REPO_PADRAO


def preparar_repo(raiz, url):
    """Pasta sem .git (cópia do pacote Docker): vira um repositório apontando para o GitHub."""
    if not tem_repo(raiz):
        git(raiz, "init", "-q", "-b", os.getenv("ERP_BRANCH", BRANCH_PADRAO))
        git(raiz, "config", "core.fileMode", "false")
    if git(raiz, "remote", verificar=False).split().count("origin"):
        git(raiz, "remote", "set-url", "origin", url)
    else:
        git(raiz, "remote", "add", "origin", url)


def buscar(raiz, branch) -> str:
    """Traz a branch do GitHub e devolve o commit dela."""
    # primeira vez (pasta do pacote Docker): só o último commit, ~20 MB; o histórico antigo tem arquivos grandes.
    # Depois disso o fetch traz só o que mudou.
    rasa = [] if git(raiz, "rev-parse", "--verify", "-q", "HEAD", verificar=False) else ["--depth", "1"]
    git(raiz, "fetch", "-q", *rasa, "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}")
    return git(raiz, "rev-parse", f"origin/{branch}")


def commit_existe(raiz, sha) -> bool:
    return git(raiz, "cat-file", "-t", sha, verificar=False) == "commit"


def info_commit(raiz, ref) -> dict:
    sha, data, msg = git(raiz, "log", "-1", "--format=%H%x1f%cI%x1f%s", ref).split("\x1f")
    return {"commit": sha, "curto": sha[:7], "data": data, "mensagem": msg}


def versao_instalada(raiz) -> dict | None:
    if tem_repo(raiz) and git(raiz, "rev-parse", "--verify", "-q", "HEAD", verificar=False):
        return info_commit(raiz, "HEAD")
    try:
        return json.loads((Path(raiz) / VERSAO_JSON).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def gravar_versao(raiz, info):
    arquivo = Path(raiz) / VERSAO_JSON
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")


def guardar_configuracoes(raiz) -> dict:
    """Configurações deste computador (senhas, chaves, endereço da API). Ficam fora do git e o reset não mexe
    nelas; mesmo assim são guardadas e devolvidas, caso alguém um dia envie uma delas ao GitHub por engano."""
    return {c: (Path(raiz) / c).read_bytes() for c in PROTEGIDOS if (Path(raiz) / c).is_file()}


def devolver_configuracoes(raiz, guardadas: dict) -> list[str]:
    devolvidas = []
    for caminho, conteudo in guardadas.items():
        arquivo = Path(raiz) / caminho
        if not arquivo.is_file() or arquivo.read_bytes() != conteudo:
            arquivo.parent.mkdir(parents=True, exist_ok=True)
            arquivo.write_bytes(conteudo)
            devolvidas.append(caminho)
    return devolvidas


def _regeneravel(caminho: str) -> bool:
    """Arquivos que o próprio PC reescreve (endereço da API e ?v= dos HTML)."""
    return caminho == CONFIG_JS or (caminho.startswith("frontend/") and caminho.endswith(".html"))


def impedimentos(raiz, branch) -> list[str]:
    """O que impede atualizar sem perder algo deste PC (só na instalação local)."""
    motivos = []
    if not git(raiz, "rev-parse", "--verify", "-q", "HEAD", verificar=False):
        return motivos
    a_frente = int(git(raiz, "rev-list", "--count", f"origin/{branch}..HEAD") or 0)
    if a_frente:
        motivos.append(f"Este computador tem {a_frente} commit(s) que não estão no GitHub. Envie (git push) antes de atualizar.")
    alterados = git(raiz, "diff", "--name-only", "-z", "HEAD").split("\0")   # inclui o que está no stage
    manuais = [c for c in alterados if c and not _regeneravel(c)]
    if manuais:
        motivos.append("Arquivos alterados neste computador e não enviados ao GitHub: " + ", ".join(manuais[:8])
                       + (f" e mais {len(manuais) - 8}" if len(manuais) > 8 else ""))
    return motivos


def verificar(raiz=RAIZ, branch=None, checar_alteracoes=True) -> dict:
    """Versão instalada, a do GitHub e o que muda entre elas."""
    raiz, branch = Path(raiz), branch or os.getenv("ERP_BRANCH", BRANCH_PADRAO)
    preparar_repo(raiz, url_do_repo(raiz))
    remoto = buscar(raiz, branch)
    instalada = versao_instalada(raiz)
    disponivel = info_commit(raiz, remoto)
    atualizado = bool(instalada) and instalada["commit"] == remoto
    conhecida = bool(instalada) and commit_existe(raiz, instalada["commit"])
    if atualizado:
        faixa = None
    elif conhecida:
        faixa = [f"{instalada['commit']}..{remoto}"]
    else:   # versão instalada desconhecida (ou fora do histórico baixado): mostra as últimas mudanças
        faixa = ["-15", remoto]
    novidades = [dict(zip(("curto", "data", "mensagem"), linha.split("\x1f")))
                 for linha in (git(raiz, "log", "--format=%h%x1f%cI%x1f%s", *faixa).splitlines() if faixa else [])
                 if linha]
    motivos = impedimentos(raiz, branch) if checar_alteracoes and not atualizado else []
    return {"instalada": instalada, "disponivel": disponivel, "atualizado": atualizado,
            "novidades": novidades, "historico_conhecido": conhecida, "impedimentos": motivos,
            "repositorio": url_do_repo(raiz), "branch": branch}


def ler_url_api(raiz) -> str | None:
    try:
        achado = URL_API.search((Path(raiz) / CONFIG_JS).read_text(encoding="utf-8"))
        return achado.group(2) if achado else None
    except OSError:
        return None


def gravar_url_api(raiz, url) -> bool:
    arquivo = Path(raiz) / CONFIG_JS
    texto = arquivo.read_text(encoding="utf-8")
    novo = URL_API.sub(lambda m: f"{m.group(1)}'{url}'", texto, count=1)
    if novo != texto:
        arquivo.write_text(novo, encoding="utf-8", newline="")
        return True
    return False


def atualizar_codigo(raiz, branch=None, checar_alteracoes=True, log=print) -> dict:
    """Traz o código do GitHub para `raiz`. Devolve de/para e se o requirements.txt mudou."""
    raiz, branch = Path(raiz), branch or os.getenv("ERP_BRANCH", BRANCH_PADRAO)
    url = url_do_repo(raiz)
    log(f"Buscando a versão mais nova em {url} ({branch})...")
    preparar_repo(raiz, url)
    remoto = buscar(raiz, branch)
    de, para = versao_instalada(raiz), info_commit(raiz, remoto)
    if de and de["commit"] == remoto:
        return {"de": de, "para": para, "mudou": False, "requirements_mudou": False}
    if checar_alteracoes:
        motivos = impedimentos(raiz, branch)
        if motivos:
            raise Cancelada(" ".join(motivos))

    url_api = ler_url_api(raiz)
    requisitos = raiz / "requirements.txt"
    antes = requisitos.read_bytes() if requisitos.exists() else b""
    guardadas = guardar_configuracoes(raiz)
    log(f"Trocando o código: {de['curto'] if de else 'versão desconhecida'} -> {para['curto']} ({para['mensagem']})")
    try:
        git(raiz, "reset", "-q", "--hard", remoto)   # nunca "git clean": arquivos fora do git (fotos, logs) ficam
    finally:
        devolvidas = devolver_configuracoes(raiz, guardadas)
    if devolvidas:
        log(f"Configurações deste computador devolvidas: {', '.join(devolvidas)}")
    log(f"Configurações mantidas: {', '.join(guardadas) or 'nenhuma encontrada'}")
    if url_api and gravar_url_api(raiz, url_api):
        log(f"Endereço da API deste computador mantido: {url_api}")
    if (raiz / "versionar_frontend.py").exists():
        subprocess.run([sys.executable, str(raiz / "versionar_frontend.py")], cwd=raiz, check=True,
                       capture_output=True, creationflags=SEM_JANELA)
    gravar_versao(raiz, para)
    return {"de": de, "para": para, "mudou": True,
            "requirements_mudou": antes != (requisitos.read_bytes() if requisitos.exists() else b"")}


# ---------- instalação local (Windows) ----------
def processo_vivo(pid) -> bool:
    if not pid:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x1000, False, int(pid))   # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False
    try:
        codigo = ctypes.c_ulong()
        return bool(k32.GetExitCodeProcess(h, ctypes.byref(codigo))) and codigo.value == 259   # STILL_ACTIVE
    finally:
        k32.CloseHandle(h)


def em_andamento(raiz=RAIZ) -> bool:
    estado = ler_estado(raiz)
    if not estado.get("rodando"):
        return False
    if estado.get("pid"):
        return processo_vivo(estado["pid"])
    try:   # recém-pedida: o processo ainda não gravou o próprio número
        return (datetime.now() - datetime.fromisoformat(estado["inicio"])).total_seconds() < 60
    except (KeyError, ValueError):
        return False


def pid_na_porta(porta) -> int | None:
    saida = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True,
                           creationflags=SEM_JANELA).stdout
    for linha in saida.splitlines():
        partes = linha.split()
        if len(partes) >= 5 and partes[1].endswith(f":{porta}") and partes[3].upper() in ("LISTENING", "ESCUTANDO"):
            return int(partes[4])
    return None


def porta_respondendo(porta, segundos=1.0) -> bool:
    import socket
    try:
        with socket.create_connection(("127.0.0.1", porta), timeout=segundos):
            return True
    except OSError:
        return False


def reiniciar_backend(log, porta=8000, espera=90):
    pid = pid_na_porta(porta)
    if pid:
        log(f"Reiniciando o backend (processo {pid})...")
        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, creationflags=SEM_JANELA)
        fim = time.monotonic() + 15
        while porta_respondendo(porta) and time.monotonic() < fim:
            time.sleep(0.5)
    sys.path.insert(0, str(RAIZ))
    import vigia_erp   # sobe do mesmo jeito que o vigia (mesmo .bat, mesmo log, fora do job da tarefa)
    vigia_erp.subir("backend")
    fim = time.monotonic() + espera
    while time.monotonic() < fim:
        if porta_respondendo(porta):
            return True
        time.sleep(1)
    return False


def rodar_local(raiz=RAIZ):
    andamento = Andamento(raiz)
    try:
        sys.path.insert(0, str(Path(raiz) / "scripts"))
        from backup_banco import fazer_backup
        andamento.log("Backup do banco antes de atualizar...")
        from dotenv import load_dotenv
        load_dotenv(Path(raiz) / "backend" / ".env")
        copia = fazer_backup(os.getenv("DB_NAME", "erp_maneiro"))
        andamento.log(f"Backup: {copia}")

        r = atualizar_codigo(raiz, log=andamento.log)
        andamento.estado.update({"de": r["de"], "para": r["para"]})
        if not r["mudou"]:
            andamento.terminar(True, "O sistema já está na versão mais nova.")
            return
        if r["requirements_mudou"]:
            andamento.log("Instalando dependências novas (requirements.txt)...")
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], cwd=raiz,
                           check=True, capture_output=True, creationflags=SEM_JANELA)
        andamento.log("Atualizando o banco (tabelas e colunas novas)...")
        r_init = subprocess.run([sys.executable, "init_db.py"], cwd=raiz, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", creationflags=SEM_JANELA,
                                env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        if r_init.returncode != 0:
            raise RuntimeError(f"init_db.py falhou: {(r_init.stderr or r_init.stdout)[-800:]}")
        if not reiniciar_backend(andamento.log):
            raise RuntimeError("O backend não voltou em 90 segundos. Veja log/backend_<data>.log.")
        andamento.terminar(True, f"Atualizado para {r['para']['curto']} ({r['para']['mensagem']}).")
    except Cancelada as e:
        andamento.terminar(False, f"Atualização cancelada: {e}")
    except Exception as e:
        andamento.terminar(False, f"Falha na atualização: {e}")
        if not porta_respondendo(8000):   # nunca deixar o ERP fora do ar por causa da atualização
            try:
                reiniciar_backend(andamento.log)
            except Exception:
                pass


if __name__ == "__main__":
    rodar_local()
