"""
Backup do ERP: banco(s) com mysqldump (.sql.gz) e fotos/vídeos (frontend/uploads).

Uso: python scripts/backup_banco.py
Variáveis opcionais (em backend/.env):
  BACKUP_COPIA_DIR      pasta (outro disco ou pasta sincronizada com a nuvem) que recebe uma cópia COMPLETA:
                          banco/    dumps .sql.gz de cada dia
                          uploads/  fotos e vídeos (espelho que nunca apaga)
                          config/   os arquivos .env (senhas e chaves, que não vão para o git)
                          projeto/  cópia do C:\\ERP inteiro, sem ambientes Python e caches
                        Com isso a pasta sozinha basta para levar o ERP para outro computador.
  BACKUP_BANCOS_EXTRAS  outros bancos do mesmo MySQL, separados por vírgula (ex.: product_search_db)
  BACKUP_RETENCAO_DIAS  quantos dias de dumps manter (padrão 30)

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
PASTA_UPLOADS = RAIZ / "frontend" / "uploads"
ARQUIVOS_CONFIG = ["backend/.env", ".env", ".env.docker", "last_api_url.json"]
# fora da cópia do projeto: recriáveis (ambientes Python, caches, build) ou já copiados à parte (fotos)
PROJETO_SEM_PASTAS = [".venv", "venv", "__pycache__", ".pytest_cache", "node_modules",
                      str(RAIZ / "autopost" / "build"), str(RAIZ / "backup" / "uploads")]

(RAIZ / "log").mkdir(exist_ok=True)
logging.basicConfig(
    filename=RAIZ / "log" / "backup.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)


def bancos() -> list[str]:
    extras = [b.strip() for b in os.getenv("BACKUP_BANCOS_EXTRAS", "").split(",") if b.strip()]
    return [os.getenv("DB_NAME", "erp_maneiro"), *extras]


def fazer_backup(banco: str) -> Path:
    PASTA_BACKUP.mkdir(parents=True, exist_ok=True)
    destino = PASTA_BACKUP / f"{banco}_{datetime.now():%Y%m%d_%H%M%S}.sql.gz"
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
        banco,
    ]

    with subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env) as proc:
        with gzip.open(temporario, "wb") as saida:
            shutil.copyfileobj(proc.stdout, saida)
        erro = proc.stderr.read().decode("utf-8", "replace")
    if proc.returncode != 0:
        temporario.unlink(missing_ok=True)
        raise RuntimeError(f"mysqldump de {banco} falhou (código {proc.returncode}): {erro.strip()}")

    temporario.rename(destino)
    return destino


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


def backup_uploads(copia: Path | None):
    destinos = [RAIZ / "backup" / "uploads"] + ([copia / "uploads"] if copia else [])
    for destino in destinos:
        copiados, total = espelhar_uploads(destino)
        logging.info("Fotos/vídeos: %d novo(s) ou alterado(s) de %d copiado(s) para %s", copiados, total, destino)
        print(f"Fotos/vídeos: {copiados} de {total} arquivo(s) copiado(s) para {destino}")


def copiar_config(copia: Path):
    shutil.copy2(RAIZ / "docs" / "levar-para-outro-pc.md", copia / "LEIA-ME.md")
    pasta = copia / "config"
    pasta.mkdir(parents=True, exist_ok=True)
    for relativo in ARQUIVOS_CONFIG:
        origem = RAIZ / relativo
        if origem.is_file():
            alvo = pasta / relativo.replace("/", "__")   # backend/.env -> backend__.env
            shutil.copy2(origem, alvo)
    logging.info("Configurações (.env) copiadas para %s", pasta)


def espelhar_projeto(copia: Path):
    """Cópia do projeto inteiro (robocopy /MIR: igual ao C:\\ERP de hoje, só o que mudou é copiado)."""
    destino = copia / "projeto"
    comando = ["robocopy", str(RAIZ), str(destino), "/MIR", "/XJ", "/R:1", "/W:1", "/NFL", "/NDL", "/NP",
               "/XD", *PROJETO_SEM_PASTAS]
    resultado = subprocess.run(comando, capture_output=True, text=True, encoding="cp850", errors="replace")
    # robocopy: 0 a 7 = deu certo (com ou sem cópias); 8 ou mais = algum arquivo falhou
    if resultado.returncode >= 8:
        resumo = "\n".join(resultado.stdout.strip().splitlines()[-12:])
        logging.warning("Cópia do projeto com falhas (robocopy %d):\n%s", resultado.returncode, resumo)
        print(f"AVISO: cópia do projeto com falhas (robocopy {resultado.returncode}), veja log/backup.log",
              file=sys.stderr)
    else:
        logging.info("Projeto copiado para %s", destino)
        print(f"Projeto copiado para {destino}")


def limpar_antigos(pasta: Path):
    limite = datetime.now() - timedelta(days=RETENCAO_DIAS)
    for arquivo in pasta.glob("*.sql.gz"):
        if datetime.fromtimestamp(arquivo.stat().st_mtime) < limite:
            arquivo.unlink()
            logging.info("Backup antigo removido: %s", arquivo.name)


if __name__ == "__main__":
    try:
        copia = Path(os.environ["BACKUP_COPIA_DIR"]) if os.getenv("BACKUP_COPIA_DIR") else None
        for banco in bancos():
            arquivo = fazer_backup(banco)
            tamanho_kb = arquivo.stat().st_size / 1024
            logging.info("Backup criado: %s (%.0f KB)", arquivo.name, tamanho_kb)
            print(f"Backup criado: {arquivo} ({tamanho_kb:.0f} KB)")
            if copia:
                (copia / "banco").mkdir(parents=True, exist_ok=True)
                shutil.copy2(arquivo, copia / "banco" / arquivo.name)
        limpar_antigos(PASTA_BACKUP)
        backup_uploads(copia)
        if copia:
            limpar_antigos(copia / "banco")
            copiar_config(copia)
            espelhar_projeto(copia)
            logging.info("Cópia completa atualizada em %s", copia)
    except Exception as e:
        logging.error("Falha no backup: %s", e)
        print(f"Falha no backup: {e}", file=sys.stderr)
        sys.exit(1)
