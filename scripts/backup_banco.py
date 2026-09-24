"""
Backup do banco do ERP com mysqldump, compactado em .sql.gz.

Uso: python scripts/backup_banco.py
Variáveis opcionais (em backend/.env):
  BACKUP_COPIA_DIR  pasta extra para uma cópia (ex.: uma pasta sincronizada com Google Drive/OneDrive)
  BACKUP_RETENCAO_DIAS  quantos dias manter (padrão 30)
"""
import gzip
import logging
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
load_dotenv(RAIZ / "backend" / ".env")

MYSQLDUMP = os.getenv("MYSQLDUMP_PATH", r"C:\Program Files\MySQL\MySQL Server 9.4\bin\mysqldump.exe")
PASTA_BACKUP = RAIZ / "backup" / "automatico"
RETENCAO_DIAS = int(os.getenv("BACKUP_RETENCAO_DIAS", "30"))
PREFIXO = "erp_maneiro_"

(RAIZ / "log").mkdir(exist_ok=True)
logging.basicConfig(
    filename=RAIZ / "log" / "backup.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)


def fazer_backup() -> Path:
    PASTA_BACKUP.mkdir(parents=True, exist_ok=True)
    destino = PASTA_BACKUP / f"{PREFIXO}{datetime.now():%Y%m%d_%H%M%S}.sql.gz"
    temporario = destino.with_suffix(".tmp")

    env = os.environ.copy()
    env["MYSQL_PWD"] = os.getenv("DB_PASSWORD", "")  # evita a senha na linha de comando
    comando = [
        MYSQLDUMP,
        f"--host={os.getenv('DB_HOST', 'localhost')}",
        f"--port={os.getenv('DB_PORT', '3306')}",
        f"--user={os.getenv('DB_USER', 'root')}",
        "--single-transaction", "--routines", "--triggers", "--events",
        "--default-character-set=utf8mb4",
        os.getenv("DB_NAME", "erp_maneiro"),
    ]

    with subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env) as proc:
        with gzip.open(temporario, "wb") as saida:
            shutil.copyfileobj(proc.stdout, saida)
        erro = proc.stderr.read().decode("utf-8", "replace")
    if proc.returncode != 0:
        temporario.unlink(missing_ok=True)
        raise RuntimeError(f"mysqldump falhou (código {proc.returncode}): {erro.strip()}")

    temporario.rename(destino)
    return destino


def copiar_para_fora(arquivo: Path):
    pasta = os.getenv("BACKUP_COPIA_DIR")
    if not pasta:
        return
    Path(pasta).mkdir(parents=True, exist_ok=True)
    shutil.copy2(arquivo, Path(pasta) / arquivo.name)
    logging.info("Cópia enviada para %s", pasta)
    limpar_antigos(Path(pasta))


def limpar_antigos(pasta: Path):
    limite = datetime.now() - timedelta(days=RETENCAO_DIAS)
    for arquivo in pasta.glob(f"{PREFIXO}*.sql.gz"):
        if datetime.fromtimestamp(arquivo.stat().st_mtime) < limite:
            arquivo.unlink()
            logging.info("Backup antigo removido: %s", arquivo.name)


if __name__ == "__main__":
    try:
        arquivo = fazer_backup()
        tamanho_kb = arquivo.stat().st_size / 1024
        logging.info("Backup criado: %s (%.0f KB)", arquivo.name, tamanho_kb)
        print(f"Backup criado: {arquivo} ({tamanho_kb:.0f} KB)")
        copiar_para_fora(arquivo)
        limpar_antigos(PASTA_BACKUP)
    except Exception as e:
        logging.error("Falha no backup: %s", e)
        print(f"Falha no backup: {e}", file=sys.stderr)
        sys.exit(1)
