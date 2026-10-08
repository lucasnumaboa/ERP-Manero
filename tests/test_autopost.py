"""
ERP AutoPost (autopost/): cliente do ERP contra a API real (banco de teste), fila de postagem, remoção de vendidos,
pedido de login e botão Parar — com sites de mentira, sem abrir o Chrome nem publicar nada.
"""
import importlib
import io
import os
import secrets
import sys
import tempfile
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from conftest import sql

AUTOPOST = Path(__file__).resolve().parent.parent / "autopost"
MODULOS = ("config", "erp", "navegador", "plataformas", "plataformas.base", "tarefas", "api")


@pytest.fixture(scope="module")
def ap():
    """Importa os módulos do AutoPost isolados: o backend também tem um config.py."""
    pytest.importorskip("PIL")
    guardados = {m: sys.modules.pop(m) for m in MODULOS if m in sys.modules}
    appdata = os.environ.get("APPDATA")
    os.environ["APPDATA"] = tempfile.mkdtemp(prefix="autopost_teste_")   # não toca a config real do PC
    sys.path.insert(0, str(AUTOPOST))
    try:
        mods = {m.split(".")[-1]: importlib.import_module(m) for m in MODULOS}
    finally:
        sys.path.remove(str(AUTOPOST))
        for m in MODULOS:
            sys.modules.pop(m, None)
        sys.modules.update(guardados)
        if appdata is not None:
            os.environ["APPDATA"] = appdata
    return SimpleNamespace(**mods)


def _png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return buf.getvalue()


# ---------- cliente do ERP contra a API ----------
def test_cliente_erp_contra_a_api(ap, cliente_api, grupo_vendedores, novo_produto):
    from auth import get_password_hash
    senha = secrets.token_urlsafe(12)
    email = f"autopost.{secrets.token_hex(3)}@teste.local"
    sql("INSERT INTO usuarios (nome, email, senha, nivel_acesso, grupo_id, connected) VALUES ('AutoPost', %s, %s, 'usuario', %s, 1)",
        (email, get_password_hash(senha), grupo_vendedores))
    produto = novo_produto(estoque=1, nome="Produto AutoPost TesteAP")
    sql("DELETE FROM anuncios")

    erp = ap.erp.ErpCliente("http://testserver", sessao=cliente_api)
    with pytest.raises(ap.erp.ErroErp):
        erp.entrar(email, "senha errada")
    assert erp.entrar(email, senha)["email"] == email
    assert any(p["id"] == produto["id"] for p in erp.produtos())

    erp.salvar_escolha(produto["id"], "olx", True)
    assert sql("SELECT post_olx, post_facebook FROM produtos WHERE id=%s", (produto["id"],))[0] == {"post_olx": 1, "post_facebook": 0}

    anuncio = erp.registrar_anuncio(produto["id"], "olx", "Produto AutoPost TesteAP", 150.0, None)
    assert erp.ativos_por_produto() == {str(produto["id"]): ["olx"]}
    assert erp.para_remover() == []
    sql("UPDATE produtos SET estoque_atual = 0 WHERE id=%s", (produto["id"],))
    assert [a["id"] for a in erp.para_remover()] == [anuncio["id"]]
    erp.marcar_removido(anuncio["id"], "teste")
    assert erp.para_remover() == [] and erp.ativos_por_produto() == {}

    # sessão expirada no meio do uso: entra de novo sozinho e repete o pedido
    erp.token = "token-vencido"
    assert erp.anuncios("removido")[0]["observacao"] == "teste"


# ---------- executor com sites e ERP de mentira ----------
class ErpFalso:
    def __init__(self):
        self.registrados, self.removidos = [], []

    def baixar(self, caminho):
        if "quebrada" in caminho:
            return b"isto nao e imagem"
        return _png()

    def registrar_anuncio(self, produto_id, plataforma, titulo, preco=None, link=None, observacao=None):
        self.registrados.append((produto_id, plataforma, titulo, preco))

    def marcar_removido(self, anuncio_id, observacao=None):
        self.removidos.append((anuncio_id, observacao))


class NavegadorFalso:
    def __init__(self):
        self.paginas = []

    def go_to_page(self, url):
        self.paginas.append(url)

    def fechar(self):
        pass


def fabrica(registro, logado=None, falha=(), achados=(), lento=0):
    logado = logado if logado is not None else {"facebook": [True], "olx": [True]}

    class Site:
        def __init__(self, nome, navegador, log, parar, opcoes):
            self.nome, self.rotulo, self.url_login, self.log, self.parar = nome, nome.upper(), f"login:{nome}", log, parar

        def esta_logado(self):
            fila = logado[self.nome]
            return fila.pop(0) if len(fila) > 1 else fila[0]

        def publicar(self, item):
            registro.append((self.nome, item))
            time.sleep(lento)
            if item["titulo"] in falha:
                raise RuntimeError("o site recusou")
            return None

        def excluir(self, titulo):
            registro.append((self.nome, "excluir", titulo))
            return titulo in achados

    return Site


def _esperar_fim(executor, limite=10):
    fim = time.monotonic() + limite
    while executor.ocupado() and time.monotonic() < fim:
        time.sleep(0.05)
    assert not executor.ocupado(), "a tarefa não terminou"


def _produto(pid, nome, imagens="uploads/produtos/a.jpg", **extra):
    return {"id": pid, "nome": nome, "preco_venda": 199.9, "descricao": "desc", "caminho_imagem": imagens,
            "categoria_nome": "Placas de vídeo", **extra}


CFG = {"delay_min": 0, "delay_max": 0, "precos": {"2": 150}, "facebook": {"categorias": {"Placas de vídeo": "Videogames"},
                                                                        "categoria_padrao": "Eletrônicos e informática"}}


def test_posta_fila_por_site_e_registra_no_erp(ap):
    erp, publicados = ErpFalso(), []
    ex = ap.tarefas.Executor(erp, NavegadorFalso(), fabrica(publicados, falha={"Falha"}))
    ex.postar([
        {"produto": _produto(1, "Placa A"), "plataformas": ["olx", "facebook"]},
        {"produto": _produto(2, "Placa B"), "plataformas": ["olx"]},
        {"produto": _produto(3, "Sem foto", imagens=""), "plataformas": ["facebook"]},
        {"produto": _produto(4, "Foto quebrada", imagens="uploads/quebrada.jpg"), "plataformas": ["facebook"]},
        {"produto": _produto(5, "Falha"), "plataformas": ["facebook"]},
    ], CFG)
    _esperar_fim(ex)

    # Facebook primeiro (login uma vez por site), depois OLX
    assert [(s, i["titulo"]) for s, i in publicados] == [("facebook", "Placa A"), ("facebook", "Falha"),
                                                         ("olx", "Placa A"), ("olx", "Placa B")]
    item = publicados[0][1]
    assert item["preco"] == "199" and item["categoria_facebook"] == "Videogames" and len(item["imagens"]) == 1
    assert publicados[3][1]["preco"] == "150"   # preço próprio do anúncio
    assert erp.registrados == [(1, "facebook", "Placa A", 199.0), (1, "olx", "Placa A", 199.0), (2, "olx", "Placa B", 150.0)]
    assert ex.estado["total"] == 6 and ex.estado["feitos"] == 6 and ex.estado["ok"] == 3 and ex.estado["falhas"] == 3
    fim = [e for e in ex.eventos() if e["tipo"] == "fim"][0]
    assert fim["ok"] == 3 and not fim["parado"]
    assert not ap.tarefas.PASTA_IMAGENS.exists()   # fotos temporárias apagadas no fim


def test_pede_login_e_continua(ap):
    erp, publicados, nav = ErpFalso(), [], NavegadorFalso()
    ex = ap.tarefas.Executor(erp, nav, fabrica(publicados, logado={"facebook": [False, True], "olx": [True]}))
    ex.postar([{"produto": _produto(1, "Placa A"), "plataformas": ["facebook"]}], CFG)
    fim = time.monotonic() + 5
    while not any(e["tipo"] == "precisa_login" for e in ex.eventos()) and time.monotonic() < fim:
        time.sleep(0.05)
    assert ex.estado["aguardando_login"] == "facebook" and nav.paginas == ["login:facebook"]
    assert publicados == []
    ex.continuar()
    _esperar_fim(ex)
    assert [i["titulo"] for _, i in publicados] == ["Placa A"] and ex.estado["ok"] == 1


def test_parar_interrompe_entre_anuncios(ap):
    erp, publicados = ErpFalso(), []
    ex = ap.tarefas.Executor(erp, NavegadorFalso(), fabrica(publicados))
    ex.postar([{"produto": _produto(i, f"Placa {i}"), "plataformas": ["olx"]} for i in range(1, 6)],
              {**CFG, "delay_min": 30, "delay_max": 30})
    fim = time.monotonic() + 5
    while not publicados and time.monotonic() < fim:
        time.sleep(0.05)
    ex.parar()
    _esperar_fim(ex, limite=3)   # sai da espera de 30s na hora
    assert len(publicados) == 1
    assert [e for e in ex.eventos() if e["tipo"] == "fim"][0]["parado"]


def test_remove_anuncios_e_marca_no_erp(ap):
    erp, registro = ErpFalso(), []
    ex = ap.tarefas.Executor(erp, NavegadorFalso(), fabrica(registro, achados={"Placa A"}))
    ex._esperar = lambda s: None   # sem a pausa de 5 a 12s entre exclusões
    ex.remover([{"id": 10, "plataforma": "olx", "titulo": "Placa A", "produto_nome": "Placa A"},
                {"id": 11, "plataforma": "facebook", "titulo": "Sumiu", "produto_nome": "Sumiu"}], CFG)
    _esperar_fim(ex)
    assert sorted(erp.removidos) == [(10, "excluído pelo AutoPost"), (11, "não estava mais no site")]


# ---------- configuração local e tela ----------
def test_senha_lembrada_fica_criptografada(ap):
    protegida = ap.config.proteger("minha senha ç")
    assert "minha senha" not in protegida
    assert ap.config.revelar(protegida) == "minha senha ç"
    assert ap.config.revelar("lixo") == ""


def test_carregar_aplica_escolhas_locais_e_esconde_sem_estoque(ap):
    api = ap.api.Api()
    api.cfg.update({"escolhas_locais": {"1": {"olx": False}}, "precos": {"1": 99.0}})

    class Erp:
        base_url = "http://erp"
        def produtos(self):
            return [{"id": 1, "nome": "Tem", "estoque_atual": 2, "post_facebook": 1, "post_olx": 1, "faturavel": 1,
                     "categoria_nome": "B"},
                    {"id": 2, "nome": "Acabou", "estoque_atual": 0, "post_facebook": 1, "post_olx": 1, "faturavel": 1},
                    {"id": 3, "nome": "Não faturável", "estoque_atual": 5, "post_facebook": 1, "post_olx": 0, "faturavel": 0}]
        def ativos_por_produto(self):
            return {"1": ["facebook"]}
        def para_remover(self):
            return [{"id": 9}]

    api.erp = Erp()
    r = api.carregar()
    assert [p["id"] for p in r["produtos"]] == [1]
    p = r["produtos"][0]
    assert p["facebook"] is True and p["olx"] is False and p["preco_anuncio"] == 99.0
    assert r["categorias"] == ["B"] and r["no_ar"] == {"1": ["facebook"]} and r["para_remover"] == 1


def test_tela_chama_so_metodos_que_existem(ap):
    import re
    js = (AUTOPOST / "ui" / "app.js").read_text(encoding="utf-8")
    chamados = set(re.findall(r"chamar\('(\w+)'", js))
    assert chamados and all(callable(getattr(ap.api.Api, nome, None)) for nome in chamados), chamados
    html = (AUTOPOST / "ui" / "index.html").read_text(encoding="utf-8")
    ids = set(re.findall(r'id="([\w-]+)"', html))
    usados = set(re.findall(r"\$\('#([\w-]+)", js))
    assert usados <= ids, usados - ids
