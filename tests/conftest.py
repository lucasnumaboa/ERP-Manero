"""
Base da suíte: cria um banco SEPARADO (erp_maneiro_teste) a partir do init_db.py e sobe o backend
apontando para ele. O banco de produção nunca é tocado pelos testes.

Rodar:  python -m pytest -q tests
"""
import os
import secrets
import subprocess
import sys
from pathlib import Path

import mysql.connector
import pytest

RAIZ = Path(__file__).resolve().parent.parent
BACKEND = RAIZ / "backend"
BANCO_TESTE = "erp_maneiro_teste"

# O backend lê DB_NAME ao ser importado; o load_dotenv não sobrescreve variáveis já definidas.
os.environ["DB_NAME"] = BANCO_TESTE
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")
if not os.getenv("SECRET_KEY"):
    os.environ["SECRET_KEY"] = secrets.token_hex(32)

CONEXAO = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "port": int(os.getenv("DB_PORT", "3306")),
}

# Permissões do grupo "Vendedores" usado em produção
PERMISSOES_VENDEDOR = [
    "dashboard_visualizar", "produtos_visualizar", "produtos_editar", "clientes_visualizar",
    "vendas_visualizar", "vendedores_visualizar", "compras_visualizar", "compras_editar",
    "estoque_visualizar", "estoque_editar", "metas_visualizar",
]


def _sql(comando, banco=None):
    conn = mysql.connector.connect(**CONEXAO, database=banco, autocommit=True)
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(comando[0], comando[1]) if isinstance(comando, tuple) else cur.execute(comando)
        return cur.fetchall() if cur.with_rows else cur.lastrowid
    finally:
        conn.close()


def sql(comando, params=()):
    """Executa no banco de teste e devolve as linhas (SELECT) ou o último id (INSERT)."""
    return _sql((comando, params), BANCO_TESTE)


@pytest.fixture(scope="session", autouse=True)
def banco_de_teste():
    _sql(f"DROP DATABASE IF EXISTS {BANCO_TESTE}")
    env = {**os.environ, "DB_NAME": BANCO_TESTE, "PYTHONIOENCODING": "utf-8"}
    resultado = subprocess.run([sys.executable, "init_db.py"], cwd=RAIZ, env=env, capture_output=True, text=True, encoding="utf-8")
    assert resultado.returncode == 0, f"init_db.py falhou ao criar o banco do zero:\n{resultado.stdout[-2000:]}\n{resultado.stderr[-2000:]}"
    yield
    _sql(f"DROP DATABASE IF EXISTS {BANCO_TESTE}")


@pytest.fixture(scope="session")
def cliente_api(banco_de_teste):
    os.chdir(BACKEND)  # as rotas de upload usam caminhos relativos a backend/
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)  # sem "with": não dispara as threads de background do startup


def _criar_usuario(cliente_api, nome, nivel, grupo_id):
    from auth import get_password_hash
    senha = secrets.token_urlsafe(12)
    email = f"{nome.lower().replace(' ', '.')}@teste.local"
    sql("INSERT INTO usuarios (nome, email, senha, nivel_acesso, grupo_id, connected) VALUES (%s,%s,%s,%s,%s,1)",
        (nome, email, get_password_hash(senha), nivel, grupo_id))
    resposta = cliente_api.post("/token", data={"username": email, "password": senha})
    assert resposta.status_code == 200, resposta.text
    usuario_id = sql("SELECT id FROM usuarios WHERE email=%s", (email,))[0]["id"]
    return {"id": usuario_id, "email": email, "headers": {"Authorization": f"Bearer {resposta.json()['access_token']}"}}


@pytest.fixture(scope="session")
def grupo_vendedores():
    colunas = ", ".join(PERMISSOES_VENDEDOR)
    return sql(f"INSERT INTO grupo_usuario (nome, {colunas}) VALUES ('TESTE Vendedores', {', '.join(['1'] * len(PERMISSOES_VENDEDOR))})")


@pytest.fixture(scope="session")
def admin(cliente_api):
    grupo_admin = sql("SELECT id FROM grupo_usuario WHERE nome='Administrador'")[0]["id"]
    return _criar_usuario(cliente_api, "Teste Admin", "admin", grupo_admin)


@pytest.fixture(scope="session")
def vendedor(cliente_api, grupo_vendedores):
    return _criar_usuario(cliente_api, "Teste Vendedor", "usuario", grupo_vendedores)


@pytest.fixture(scope="session")
def dados_base():
    """Categoria, cliente e plataforma de venda para montar pedidos."""
    categoria = sql("SELECT id FROM categorias_produtos LIMIT 1")[0]["id"]
    cliente = sql("INSERT INTO parceiros (tipo, nome) VALUES ('cliente', 'Cliente de Teste')")
    plataforma = sql("INSERT INTO plataformas_venda (nome) VALUES ('Plataforma de Teste')")
    return {"categoria_id": categoria, "cliente_id": cliente, "plataforma_id": plataforma}


@pytest.fixture
def novo_produto(cliente_api, admin, dados_base):
    """Cria um produto (dono: admin) com estoque; aceita campos extras como taxa de armazenagem."""
    contador = {"n": 0}

    def criar(estoque=5, custo=100, venda=200, dono=None, **extra):
        contador["n"] += 1
        dono = dono or admin
        dados = {"codigo": f"T{secrets.token_hex(4)}", "nome": f"Produto de teste {contador['n']}", "preco_custo": str(custo),
                 "preco_venda": str(venda), "categoria_id": str(dados_base["categoria_id"]), **{k: str(v) for k, v in extra.items()}}
        r = cliente_api.post("/api/produtos/", data=dados, headers=dono["headers"])
        assert r.status_code == 201, r.text
        produto = r.json()
        if estoque:
            r = cliente_api.post("/api/estoque/movimentacoes", json={"produto_id": produto["id"], "tipo": "entrada", "quantidade": estoque, "motivo": "teste"}, headers=dono["headers"])
            assert r.status_code == 201, r.text
        return produto

    return criar


def pedido(dados_base, itens):
    return {"cliente_id": dados_base["cliente_id"], "plataforma_id": dados_base["plataforma_id"], "forma_pagamento": "pix", "itens": itens}
