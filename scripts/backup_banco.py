"""
Backup do banco do ERP com mysqldump, compactado em .sql.gz, e cópia das fotos/vídeos (frontend/uploads).

Uso: python scripts/backup_banco.py
Variáveis opcionais (em backend/.env):
  BACKUP_COPIA_DIR  pasta extra para uma cópia (ex.: uma pasta sincronizada com Google Drive/OneDrive)
  BACKUP_RETENCAO_DIAS  quantos dias manter (padrão 30)

Fotos e vídeos vão para backup/uploads (e BACKUP_COPIA_DIR/uploads) como espelho: só copia o que é novo
ou mudou, e nunca apaga de lá o que foi apagado do ERP, para dar para recuperar.
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
PASTA_UPLOADS = RAIZ / "frontend" / "uploads"

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


def espelhar_uploads(destino: Path) -> tuple[int, int]:
    """Copia para `destino` o que é novo ou mudou em frontend/uploads. Devolve (copiados, total)."""
    copiados = total = 0
    for origem in PASTA_UPLOADS.rglob("*"):
        if not origem.is_file():
            continue
        total += 1
        alvo = destino / origem.relative_to(PASTA_UPLOADS)
        info = origem.stat()
        if alvo.exists():
            atual = alvo.stat()
            if atual.st_size == info.st_size and int(atual.st_mtime) == int(info.st_mtime):
                continue
        alvo.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origem, alvo)
        copiados += 1
    return copiados, total


def backup_uploads():
    destinos = [RAIZ / "backup" / "uploads"]
    if os.getenv("BACKUP_COPIA_DIR"):
        destinos.append(Path(os.getenv("BACKUP_COPIA_DIR")) / "uploads")
    for destino in destinos:
        copiados, total = espelhar_uploads(destino)
        logging.info("Fotos/vídeos: %d novo(s) ou alterado(s) de %d copiado(s) para %s", copiados, total, destino)
        print(f"Fotos/vídeos: {copiados} de {total} arquivo(s) copiado(s) para {destino}")


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
        backup_uploads()
    except Exception as e:
        logging.error("Falha no backup: %s", e)
        print(f"Falha no backup: {e}", file=sys.stderr)
        sys.exit(1)
