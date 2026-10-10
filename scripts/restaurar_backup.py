"""
Restaura os bancos de um backup (pasta banco/ com os .sql.gz do scripts/backup_banco.py) no MySQL deste PC.

Uso, no PC novo, depois de instalar o MySQL e copiar o projeto para C:\\ERP:
    python scripts\\restaurar_backup.py "F:\\ERP Maneiro\\banco"

- Lê usuário, senha e nome do banco do backend\\.env (os mesmos da produção).
- Pede a senha do root do MySQL uma vez para criar os bancos e o usuário do ERP (--sem-root pula isso, se o
  usuário já existir e puder criar bancos).
- Importa o .sql.gz mais novo de cada banco (DB_NAME e BACKUP_BANCOS_EXTRAS). Banco que já tem tabelas não é
  mexido, a não ser com --substituir.
"""
import argparse
import getpass
import glob
import gzip
import os
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
load_dotenv(RAIZ / "backend" / ".env")


def achar_mysql() -> str:
    candidatos = [str(Path(os.getenv("MYSQLDUMP_PATH", "")).with_name("mysql.exe"))] if os.getenv("MYSQLDUMP_PATH") else []
    candidatos += sorted(glob.glob(r"C:\Program Files\MySQL\MySQL Server *\bin\mysql.exe"), reverse=True)
    candidatos.append(shutil.which("mysql") or "")
    for c in candidatos:
        if c and Path(c).is_file():
            return c
    sys.exit("Não achei o mysql.exe. Instale o MySQL Server ou defina MYSQLDUMP_PATH no backend\\.env.")


def mysql(cliente, usuario, senha, sql=None, banco=None, entrada=None):
    comando = [cliente, f"--host={os.getenv('DB_HOST', 'localhost')}", f"--port={os.getenv('DB_PORT', '3306')}",
               f"--user={usuario}", "--default-character-set=utf8mb4", "--batch", "--skip-column-names"]
    if banco:
        comando.append(banco)
    env = {**os.environ, "MYSQL_PWD": senha}   # senha fora da linha de comando
    if entrada is not None:
        proc = subprocess.Popen(comando, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        with gzip.open(entrada, "rb") as dump:
            shutil.copyfileobj(dump, proc.stdin)
        proc.stdin.close()
        erro = proc.stderr.read().decode("utf-8", "replace")
        proc.wait()
        if proc.returncode:
            raise RuntimeError(erro.strip())
        return ""
    r = subprocess.run(comando, input=sql, capture_output=True, text=True, encoding="utf-8", env=env)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return r.stdout


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pasta", nargs="?", default=str(RAIZ.parent / "banco"),
                   help="pasta com os .sql.gz (padrão: ..\\banco, ao lado da cópia do projeto)")
    p.add_argument("--sem-root", action="store_true", help="não pede o root (o usuário do ERP já existe)")
    p.add_argument("--substituir", action="store_true", help="apaga e importa de novo bancos que já têm tabelas")
    args = p.parse_args()

    pasta = Path(args.pasta)
    usuario, senha = os.getenv("DB_USER", "root"), os.getenv("DB_PASSWORD", "")
    bancos = [os.getenv("DB_NAME", "erp_maneiro")] + [b.strip() for b in os.getenv("BACKUP_BANCOS_EXTRAS", "").split(",") if b.strip()]
    cliente = achar_mysql()

    arquivos = {}
    for banco in bancos:
        achados = sorted(pasta.glob(f"{banco}_*.sql.gz"))
        if not achados:
            print(f"- {banco}: nenhum backup em {pasta}, pulando.")
            continue
        arquivos[banco] = achados[-1]
    if not arquivos:
        sys.exit("Nada para restaurar.")

    if not args.sem_root:
        senha_root = getpass.getpass("Senha do root do MySQL: ")
        comandos = [f"CREATE USER IF NOT EXISTS '{usuario}'@'localhost' IDENTIFIED BY '{senha.replace(chr(39), chr(39) * 2)}';"]
        for banco in arquivos:
            comandos += [f"CREATE DATABASE IF NOT EXISTS `{banco}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
                         f"GRANT ALL PRIVILEGES ON `{banco}`.* TO '{usuario}'@'localhost';"]
        mysql(cliente, "root", senha_root, "\n".join(comandos + ["FLUSH PRIVILEGES;"]))
        print(f"Usuário '{usuario}' e bancos prontos.")

    for banco, arquivo in arquivos.items():
        mysql(cliente, usuario, senha, f"CREATE DATABASE IF NOT EXISTS `{banco}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        tabelas = int(mysql(cliente, usuario, senha,
                            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='{banco}';").strip() or 0)
        if tabelas and not args.substituir:
            print(f"- {banco}: já tem {tabelas} tabela(s), não mexi (use --substituir para trocar pelo backup).")
            continue
        if tabelas:
            mysql(cliente, usuario, senha, f"DROP DATABASE `{banco}`; CREATE DATABASE `{banco}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        print(f"- {banco}: importando {arquivo.name}...")
        mysql(cliente, usuario, senha, banco=banco, entrada=arquivo)
        tabelas = mysql(cliente, usuario, senha, f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='{banco}';").strip()
        print(f"  pronto: {tabelas} tabela(s).")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        sys.exit(f"ERRO do MySQL: {e}")
