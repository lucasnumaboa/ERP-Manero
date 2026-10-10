"""
Construtor do ERP AutoPost: roda no computador Windows do servidor (o .exe só é gerado em Windows) e atende as
correções aprovadas em Configurações › AutoPost: travamentos (tabela autopost_correcoes).

Para cada rodada aprovada:
  1. traz o código do GitHub (a pasta do projeto não pode ter alteração local);
  2. aplica as alterações da IA (cada trecho tem que existir uma única vez) e sobe a versão em autopost/api.py;
  3. confere a sintaxe e gera o .exe com o autopost/build.bat;
  4. faz o commit e envia ao GitHub com o token do arquivo indicado (só depois do .exe sair, para não subir código
     que nem compila);
  5. publica o .exe na página Softwares (versão nova + histórico), guarda o anterior e marca o travamento como resolvido.
Se algo falhar, a rodada fica "falhou" com o motivo e o código local volta ao do GitHub.

Uso (tarefa do Windows, em laço):
  python scripts/construtor_autopost.py --repo C:/srv/apps/erp-manero --softwares C:/srv/data/erp-manero/Softwares
         --guardar C:/srv/pacotes/erp-maneiro/softwares-antigos --token-arquivo C:/srv/secrets/github-erp-token.txt
O banco vem do .env do projeto (DB_USER, DB_PASSWORD, DB_NAME e DB_PORT_EXTERNAL, ex.: 127.0.0.1:3306).
Precisa de: Python 3.10+, git e mysql-connector-python.
"""
import argparse
import base64
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import time
import traceback
import urllib.request
from datetime import datetime
from pathlib import Path

import mysql.connector

ARQUIVO_VERSAO = "autopost/api.py"
NOME_EXE = "ERP AutoPost.exe"


class Falha(Exception):
    """Erro esperado (o motivo vai para a tela como está)."""


# ---------- funções puras (testadas em tests/test_autopost_correcoes.py) ----------

def aplicar_alteracoes(raiz: Path, alteracoes: list) -> list:
    """Troca cada trecho "buscar" por "substituir". O trecho tem que existir uma única vez; o arquivo mantém a
    quebra de linha que já tinha (o git do Windows costuma deixar CRLF). Devolve os arquivos alterados."""
    alterados = []
    for i, a in enumerate(alteracoes, 1):
        caminho = str(a.get("arquivo") or "").replace("\\", "/")
        if not caminho.startswith("autopost/") or ".." in caminho.split("/"):
            raise Falha(f"alteração {i}: só arquivos dentro de autopost/ podem ser alterados ({caminho!r})")
        arquivo = raiz / caminho
        if not arquivo.is_file():
            raise Falha(f"alteração {i}: o arquivo {caminho} não existe")
        bruto = arquivo.read_bytes().decode("utf-8")
        crlf = "\r\n" in bruto
        texto = bruto.replace("\r\n", "\n")
        buscar = str(a.get("buscar") or "").replace("\r\n", "\n")
        substituir = str(a.get("substituir") or "").replace("\r\n", "\n")
        vezes = texto.count(buscar) if buscar else 0
        if vezes != 1:
            raise Falha(f"alteração {i}: o trecho a trocar aparece {vezes} vez(es) em {caminho} "
                        "(o código mudou desde a análise; peça uma análise nova)")
        texto = texto.replace(buscar, substituir, 1)
        arquivo.write_bytes((texto.replace("\n", "\r\n") if crlf else texto).encode("utf-8"))
        if caminho not in alterados:
            alterados.append(caminho)
    return alterados


def subir_versao(arquivo: Path) -> tuple:
    """VERSAO = "1.1.0" -> "1.1.1" em autopost/api.py. Devolve (anterior, nova)."""
    bruto = arquivo.read_bytes().decode("utf-8")
    achado = re.search(r'^VERSAO\s*=\s*"(\d+)\.(\d+)\.(\d+)"', bruto, re.M)
    if not achado:
        raise Falha(f"não achei a linha VERSAO = \"x.y.z\" em {arquivo.name}")
    anterior = ".".join(achado.groups())
    maior, menor, correcao = (int(n) for n in achado.groups())
    nova = f"{maior}.{menor}.{correcao + 1}"
    arquivo.write_bytes((bruto[:achado.start()] + f'VERSAO = "{nova}"' + bruto[achado.end():]).encode("utf-8"))
    return anterior, nova


def ler_env(arquivo: Path) -> dict:
    valores = {}
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            valores[chave.strip()] = valor.strip().strip('"').strip("'")
    return valores


# ---------- construtor ----------

class Construtor:
    def __init__(self, args):
        self.raiz = Path(args.repo).resolve()
        self.softwares = Path(args.softwares)
        self.guardar = Path(args.guardar) if args.guardar else None
        self.token_arquivo = Path(args.token_arquivo)
        self.branch = args.branch
        env = ler_env(self.raiz / ".env")
        porta = env.get("DB_PORT_EXTERNAL", "3306").rsplit(":", 1)[-1]
        self.banco = {"host": args.db_host, "port": int(porta), "user": env.get("DB_USER"),
                      "password": env.get("DB_PASSWORD"), "database": env.get("DB_NAME", "erp_maneiro"),
                      "charset": "utf8mb4", "autocommit": True}
        self.rodada_id = None

    # banco
    def sql(self, comando, params=(), um=False, todos=False):
        conn = mysql.connector.connect(**self.banco)
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(comando, params)
            if um:
                return cur.fetchone()
            if todos:
                return cur.fetchall()
            return cur.rowcount
        finally:
            conn.close()

    def log(self, texto):
        linha = f"[{datetime.now():%H:%M:%S}] {texto}"
        print(linha, flush=True)
        if self.rodada_id:
            self.sql("UPDATE autopost_correcoes SET log_texto = CONCAT(COALESCE(log_texto, ''), %s) WHERE id = %s",
                     (linha + "\n", self.rodada_id))

    def estado(self, status, **campos):
        colunas = ", ".join(["status = %s"] + [f"{c} = %s" for c in campos])
        self.sql(f"UPDATE autopost_correcoes SET {colunas} WHERE id = %s", (status, *campos.values(), self.rodada_id))

    # git
    def git(self, *args, env=None):
        r = subprocess.run(["git", "-c", "safe.directory=*", "-c", "core.autocrlf=true", *args], cwd=self.raiz,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
        if r.returncode:
            raise Falha(f"git {args[0]}: {(r.stderr or r.stdout).strip()[-600:]}")
        return r.stdout.strip()

    def env_com_token(self):
        """O token vai por variável de ambiente (GIT_CONFIG_*), não pela linha de comando nem pelo .git/config."""
        token = self.token_arquivo.read_text(encoding="utf-8").strip()
        if not token:
            raise Falha(f"o arquivo do token do GitHub está vazio ({self.token_arquivo})")
        basico = base64.b64encode(f"x-access-token:{token}".encode()).decode()
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_CONFIG_COUNT="1",
                   GIT_CONFIG_KEY_0="http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0=f"AUTHORIZATION: basic {basico}")
        return env, token

    def autor(self, token):
        """Commit no nome do dono do token (aparece certo no GitHub)."""
        pedido = urllib.request.Request("https://api.github.com/user", headers={
            "Authorization": f"Bearer {token}", "User-Agent": "erp-construtor", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(pedido, timeout=20) as r:
            dados = json.load(r)
        return dados.get("name") or dados["login"], f"{dados['id']}+{dados['login']}@users.noreply.github.com"

    # uma rodada
    def processar(self, rodada):
        diag = self.sql("SELECT * FROM autopost_diagnosticos WHERE id = %s", (rodada["diagnostico_id"],), um=True)
        analise = json.loads(rodada["analise"] or "{}")
        alteracoes = json.loads(rodada["alteracoes"] or "[]")
        enviado = False
        try:
            self.log("Trazendo o código atual do GitHub...")
            self.git("fetch", "origin", self.branch)
            if self.git("status", "--porcelain", "--untracked-files=no"):
                raise Falha("a pasta do ERP no servidor tem alterações locais; resolva antes (nada foi mudado)")
            self.git("merge", "--ff-only", f"origin/{self.branch}")

            self.log(f"Aplicando {len(alteracoes)} alteração(ões) da IA...")
            alterados = aplicar_alteracoes(self.raiz, alteracoes)
            anterior, nova = subir_versao(self.raiz / ARQUIVO_VERSAO)
            if ARQUIVO_VERSAO not in alterados:
                alterados.append(ARQUIVO_VERSAO)
            self.log(f"Versão {anterior} -> {nova}. Arquivos: {', '.join(alterados)}")
            for caminho in alterados:
                if caminho.endswith(".py"):
                    try:
                        py_compile.compile(str(self.raiz / caminho), doraise=True)
                    except py_compile.PyCompileError as e:
                        raise Falha(f"o código novo não compila ({caminho}): {e.msg.strip()[-500:]}")
            self.log("Sintaxe ok.")

            self.estado("gerando", versao=nova)
            self.log("Gerando o .exe (a primeira vez instala o ambiente e demora alguns minutos)...")
            exe = self.raiz / "autopost" / "dist" / NOME_EXE
            inicio = time.time()
            r = subprocess.run(["cmd", "/c", str(self.raiz / "autopost" / "build.bat")], cwd=self.raiz / "autopost",
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode or not exe.is_file() or exe.stat().st_mtime < inicio:
                raise Falha("a geração do .exe falhou: " + (r.stdout + r.stderr).strip()[-800:])
            self.log(f".exe gerado ({exe.stat().st_size / 1024 / 1024:.1f} MB).")

            self.log("Fazendo o commit e enviando ao GitHub...")
            env, token = self.env_com_token()
            nome, email = self.autor(token)
            aprovador = self.sql("SELECT nome FROM usuarios WHERE id = %s", (rodada["usuario_id"],), um=True) or {}
            mensagem = (f"AutoPost {nova}: correção do travamento #{diag['id']} aprovada no ERP\n\n"
                        f"{analise.get('solucao') or ''}\n\n"
                        f"Travamento: {diag['plataforma']} - {diag['acao'][:200]}\n"
                        f"Causa: {(analise.get('causa') or '')[:600]}\n"
                        f"Rodada {rodada['rodada']} da análise com IA (DeepSeek), aprovada por {aprovador.get('nome') or 'admin'}.\n\n"
                        "Co-Authored-By: DeepSeek <noreply@deepseek.com>")
            self.git("add", "--", *alterados)
            self.git("-c", f"user.name={nome}", "-c", f"user.email={email}", "commit", "-q", "-m", mensagem)
            self.git("push", "origin", f"HEAD:{self.branch}", env=env)
            enviado = True
            commit = self.git("rev-parse", "HEAD")
            self.log(f"Commit {commit[:7]} enviado.")

            self.log("Publicando na página Softwares...")
            self.softwares.mkdir(parents=True, exist_ok=True)
            destino = self.softwares / NOME_EXE
            if destino.is_file() and self.guardar:
                self.guardar.mkdir(parents=True, exist_ok=True)
                shutil.copy2(destino, self.guardar / f"ERP AutoPost {anterior}.exe")
            temporario = destino.with_name(destino.name + ".novo")   # quem baixa agora não pega o arquivo pela metade
            shutil.copy2(exe, temporario)
            os.replace(temporario, destino)
            tamanho = destino.stat().st_size
            sw = self.sql("SELECT id, versao FROM softwares WHERE nome_arquivo = %s", (NOME_EXE,), um=True)
            texto = (f"AutoPost {nova}: correção do travamento #{diag['id']} ({diag['plataforma']}). "
                     f"{analise.get('solucao') or ''}").strip()[:1000]
            if sw:
                versao_pagina = sw["versao"] + 1
                self.sql("UPDATE softwares SET versao = %s, versao_app = %s, tamanho = %s, usuario_id = %s, "
                         "data_atualizacao = NOW() WHERE id = %s", (versao_pagina, nova, tamanho, rodada["usuario_id"], sw["id"]))
                self.sql("INSERT INTO softwares_historico (software_id, versao, alteracoes, usuario_id) VALUES (%s, %s, %s, %s)",
                         (sw["id"], versao_pagina, texto, rodada["usuario_id"]))
            else:
                self.sql("INSERT INTO softwares (nome_arquivo, descricao, versao, versao_app, tamanho, usuario_id) "
                         "VALUES (%s, %s, 1, %s, %s, %s)", (NOME_EXE, "AutoPost Facebook e OLX", nova, tamanho, rodada["usuario_id"]))
            self.sql("UPDATE autopost_diagnosticos SET status = 'resolvido', data_resolucao = NOW(), observacao = %s "
                     "WHERE id = %s", (f"Corrigido no AutoPost {nova} (correção com IA, rodada {rodada['rodada']})", diag["id"]))
            self.estado("publicada", versao=nova, commit_sha=commit)
            self.log(f"Pronto: AutoPost {nova} publicado na página Softwares.")
        except Exception as e:
            motivo = str(e) if isinstance(e, Falha) else f"{type(e).__name__}: {e}"
            if not isinstance(e, Falha):
                traceback.print_exc()
            if not enviado:
                try:   # nada foi para o GitHub: o código local volta ao que estava lá
                    self.git("reset", "-q", "--hard", f"origin/{self.branch}")
                except Falha as e2:
                    motivo += f" (e não consegui limpar a pasta: {e2})"
            self.log(f"Falhou: {motivo}")
            self.estado("falhou", erro=motivo[:2000])

    def rodar(self, uma_vez=False, intervalo=10):
        print(f"Construtor do AutoPost: {self.raiz} (banco {self.banco['host']}:{self.banco['port']})", flush=True)
        while True:
            try:
                rodada = self.sql("SELECT * FROM autopost_correcoes WHERE status = 'aprovada' ORDER BY id LIMIT 1", um=True)
                if rodada and self.sql("UPDATE autopost_correcoes SET status = 'aplicando' WHERE id = %s AND status = 'aprovada'",
                                       (rodada["id"],)) == 1:
                    self.rodada_id = rodada["id"]
                    self.log("Construtor do servidor começou.")
                    self.processar(rodada)
                    self.rodada_id = None
            except Exception:   # banco fora do ar etc.: tenta de novo no próximo ciclo
                traceback.print_exc()
                self.rodada_id = None
            if uma_vez:
                return
            time.sleep(intervalo)


def main():
    p = argparse.ArgumentParser(description="Construtor do ERP AutoPost (correções aprovadas no ERP)")
    p.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    p.add_argument("--softwares", default=None, help="pasta servida em /softwares (padrão: <repo>/Softwares)")
    p.add_argument("--guardar", default=None, help="pasta para guardar o .exe anterior")
    p.add_argument("--token-arquivo", required=True, help="arquivo com o token do GitHub (Contents: leitura e escrita)")
    p.add_argument("--branch", default="main")
    p.add_argument("--db-host", default="127.0.0.1")
    p.add_argument("--uma-vez", action="store_true", help="atende no máximo uma rodada e sai")
    args = p.parse_args()
    if not args.softwares:
        args.softwares = str(Path(args.repo) / "Softwares")
    Construtor(args).rodar(uma_vez=args.uma_vez)


if __name__ == "__main__":
    sys.exit(main())
