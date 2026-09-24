"""Geração de texto por IA pelo backend (a chave do provedor não vai para o navegador)."""
import routers.ia as ia
from conftest import sql


def test_vendedor_busca_dados_fixos_da_descricao(cliente_api, vendedor):
    r = cliente_api.get("/api/ia/dados-descricao", headers=vendedor["headers"])
    assert r.status_code == 200 and r.json()["dados_fixos"]


def test_sem_chave_configurada_o_erro_e_claro(cliente_api, vendedor):
    sql("UPDATE configuracoes SET valor='openrouter' WHERE chave='ia_provider'")
    sql("UPDATE configuracoes SET valor='' WHERE chave='apikey_openrouter'")
    r = cliente_api.post("/api/ia/gerar", json={"prompt": "oi"}, headers=vendedor["headers"])
    assert r.status_code == 400 and "API Key" in r.json()["detail"]


def test_vendedor_gera_descricao_pelo_servidor(cliente_api, vendedor, monkeypatch):
    recebido = {}

    async def falso(prompt, max_tokens, temperatura):
        recebido.update(prompt=prompt, max_tokens=max_tokens)
        return "Descrição gerada"

    monkeypatch.setattr(ia, "gerar_texto", falso)
    r = cliente_api.post("/api/ia/gerar", json={"prompt": "Descreva o produto X", "max_tokens": 1500}, headers=vendedor["headers"])
    assert r.status_code == 200 and r.json() == {"texto": "Descrição gerada"}
    assert recebido == {"prompt": "Descreva o produto X", "max_tokens": 1500}


def test_quem_nao_edita_produto_nem_ve_relatorio_nao_usa_a_ia(cliente_api):
    from conftest import _criar_usuario
    grupo = sql("INSERT INTO grupo_usuario (nome, clientes_visualizar) VALUES ('TESTE Sem IA', 1)")
    usuario = _criar_usuario(cliente_api, "Teste Sem IA", "usuario", grupo)
    assert cliente_api.post("/api/ia/gerar", json={"prompt": "oi"}, headers=usuario["headers"]).status_code == 403


def test_falha_do_provedor_volta_com_a_mensagem_dele(cliente_api, vendedor, monkeypatch):
    class Resposta:
        status_code = 404
        text = '{"error":{"message":"This model is unavailable for free"}}'
        def json(self):
            return {"error": {"message": "This model is unavailable for free"}}

    class Cliente:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return Resposta()

    sql("UPDATE configuracoes SET valor='sk-teste' WHERE chave='apikey_openrouter'")
    monkeypatch.setattr(ia.httpx, "AsyncClient", Cliente)
    r = cliente_api.post("/api/ia/gerar", json={"prompt": "oi"}, headers=vendedor["headers"])
    assert r.status_code == 424  # não pode ser 502/503: a Cloudflare esconde a mensagem
    assert "unavailable for free" in r.json()["detail"]


def test_chave_de_api_sai_mascarada_e_mascara_nao_sobrescreve(cliente_api, admin):
    real = "sk-or-v1-" + "a" * 40 + "wxyz"
    sql("UPDATE configuracoes SET valor=%s WHERE chave='apikey_openrouter'", (real,))
    configs = cliente_api.get("/api/configuracoes/configuracoes/", headers=admin["headers"]).json()
    exibida = next(c["valor"] for c in configs if c["chave"] == "apikey_openrouter")
    assert exibida != real and exibida.startswith("sk-or-v1-a") and exibida.endswith("wxyz")
    assert next(c["valor"] for c in configs if c["chave"] == "ia_think_tokens") is not None  # número não é mascarado

    cliente_api.put("/api/configuracoes/configuracoes/apikey_openrouter", json={"valor": exibida}, headers=admin["headers"])
    assert sql("SELECT valor FROM configuracoes WHERE chave='apikey_openrouter'")[0]["valor"] == real

    nova = "sk-or-v1-" + "b" * 44
    cliente_api.put("/api/configuracoes/configuracoes/apikey_openrouter", json={"valor": nova}, headers=admin["headers"])
    assert sql("SELECT valor FROM configuracoes WHERE chave='apikey_openrouter'")[0]["valor"] == nova
