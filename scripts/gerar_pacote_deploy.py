"""
Gera a pasta deploy/ com tudo para instalar uma cópia do ERP (com o banco da produção) no Docker de outro PC:
código (versão atual do git), banco exportado agora, fotos/vídeos, .env pronto e o instalador (INSTALAR.bat).

Uso (no PC da produção, pasta C:\\ERP):  python scripts/gerar_pacote_deploy.py [--sem-fotos]

Rodar de novo atualiza o pacote: banco novo, código novo e só as fotos que mudaram. O deploy/erp/.env de uma
geração anterior é mantido (as senhas do banco da cópia já instalada continuam valendo).
A pasta deploy/ fica fora do git: tem senhas, a chave da IA e os dados dos clientes.
"""
import argparse
import io
import os
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
DEPLOY = RAIZ / "deploy"
MODELOS = RAIZ / "scripts" / "deploy"
MYSQLDUMP = os.getenv("MYSQLDUMP_PATH", r"C:\Program Files\MySQL\MySQL Server 9.4\bin\mysqldump.exe")

sys.path.insert(0, str(RAIZ / "scripts"))
from backup_banco import espelhar_uploads  # noqa: E402  (mesma cópia incremental do backup das fotos)


def passo(texto):
    print(f"\n==> {texto}")


def exportar_banco(pasta: Path) -> Path:
    load_dotenv(RAIZ / "backend" / ".env")
    pasta.mkdir(parents=True, exist_ok=True)
    for antigo in pasta.glob("erp_maneiro_*.sql"):
        antigo.unlink()   # fica só o mais novo (o instalador importa o .sql mais recente da pasta)
    destino = pasta / f"erp_maneiro_{datetime.now():%Y%m%d_%H%M}.sql"
    env = {**os.environ, "MYSQL_PWD": os.getenv("DB_PASSWORD", "")}
    comando = [MYSQLDUMP, f"--host={os.getenv('DB_HOST', 'localhost')}", f"--port={os.getenv('DB_PORT', '3306')}",
               f"--user={os.getenv('DB_USER', 'root')}", "--single-transaction", "--routines", "--triggers", "--events",
               "--default-character-set=utf8mb4", "--set-gtid-purged=OFF", "--no-tablespaces", "--hex-blob",
               f"--result-file={destino}", os.getenv("DB_NAME", "erp_maneiro")]
    r = subprocess.run(comando, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"mysqldump falhou: {r.stderr.strip()}")
    return destino


def extrair_codigo(destino: Path):
    """Código da versão atual do git (o que está commitado), sem .git, uploads, backups etc."""
    env_anterior = (destino / ".env").read_text(encoding="utf-8") if (destino / ".env").exists() else None
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    tar = subprocess.run(["git", "archive", "--format=tar", "HEAD"], cwd=RAIZ, capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(tar)) as arquivo:
        arquivo.extractall(destino)
    return env_anterior


def criar_env(destino: Path, env_anterior):
    if env_anterior:
        (destino / ".env").write_text(env_anterior, encoding="utf-8")
        return "mantido da geração anterior"
    modelo = (destino / ".env.docker").read_text(encoding="utf-8")
    valores = {
        "DB_PASSWORD": secrets.token_hex(16),
        "MYSQL_ROOT_PASSWORD": secrets.token_hex(16),
        "SECRET_KEY": secrets.token_hex(32),
        "DB_PORT_EXTERNAL": "3307",   # 3306 costuma estar ocupada por um MySQL instalado no PC
    }
    for chave, valor in valores.items():
        modelo, n = re.subn(rf"^{chave}=.*$", f"{chave}={valor}", modelo, flags=re.M)
        if not n:
            modelo += f"\n{chave}={valor}\n"
    (destino / ".env").write_text(modelo, encoding="utf-8")
    return "criado com senhas novas"


def apontar_tela_para_api_local(destino: Path):
    config = destino / "frontend" / "js" / "config.js"
    texto = config.read_text(encoding="utf-8")
    novo, n = re.subn(r"(const ERP_API_URL_PADRAO = )'[^']*'", r"\1'http://localhost:8000'", texto)
    if not n:
        raise SystemExit("Não achei ERP_API_URL_PADRAO no config.js")
    config.write_text(novo, encoding="utf-8", newline="")
    # a versão (?v=) dos arquivos nos HTML acompanha o config.js alterado
    subprocess.run([sys.executable, str(destino / "versionar_frontend.py")], cwd=destino, check=True, capture_output=True)


def copiar_instalador():
    for arquivo in MODELOS.iterdir():
        dados = arquivo.read_bytes().replace(b"\r\n", b"\n")
        if arquivo.suffix == ".bat":
            dados = dados.replace(b"\n", b"\r\n")                   # cmd do Windows
        elif arquivo.suffix == ".ps1":
            dados = b"\xef\xbb\xbf" + dados.replace(b"\n", b"\r\n")  # BOM: o PowerShell 5.1 lê acentos certo
        (DEPLOY / arquivo.name).write_bytes(dados)


def tamanho(pasta: Path) -> str:
    total = sum(f.stat().st_size for f in pasta.rglob("*") if f.is_file())
    return f"{total / 1024 / 1024:.0f} MB" if total < 1024 ** 3 else f"{total / 1024 ** 3:.1f} GB"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sem-fotos", action="store_true", help="não copia frontend/uploads (~1,2 GB)")
    args = parser.parse_args()

    pendentes = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=RAIZ,
                               capture_output=True, text=True).stdout.strip()
    if pendentes:
        print("Aviso: há alterações não commitadas; o pacote leva a versão commitada (git HEAD).")

    passo("Código (versão atual do git)")
    env_anterior = extrair_codigo(DEPLOY / "erp")
    print("   .env:", criar_env(DEPLOY / "erp", env_anterior))
    apontar_tela_para_api_local(DEPLOY / "erp")

    passo("Banco (exportando agora)")
    sql = exportar_banco(DEPLOY / "banco")
    print(f"   {sql.name} ({sql.stat().st_size / 1024 / 1024:.1f} MB)")

    if not args.sem_fotos:
        passo("Fotos e vídeos (só o que é novo ou mudou)")
        copiados, total = espelhar_uploads(DEPLOY / "uploads")
        print(f"   {copiados} de {total} arquivo(s) copiado(s)")

    passo("Instalador")
    copiar_instalador()

    print(f"\nPronto: {DEPLOY}  ({tamanho(DEPLOY)})")
    print("Copie a pasta deploy para o outro PC e dê dois cliques em INSTALAR.bat (veja LEIA-ME.md).")


if __name__ == "__main__":
    main()
