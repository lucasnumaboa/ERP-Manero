"""Config. API e Calendário: só administrador grava (a tela mostra o botão só para ele)."""
from pathlib import Path

from conftest import RAIZ, sql

ROTA = "/api/configuracoes/configuracoes/link_api"


def test_admin_grava_o_link_da_api_e_vendedor_nao(cliente_api, admin, vendedor):
    antes = sql("SELECT valor FROM configuracoes WHERE chave = 'link_api'")
    try:
        r = cliente_api.put(ROTA, json={"valor": "https://api-teste.exemplo"}, headers=admin["headers"])
        assert r.status_code == 200, r.text
        assert sql("SELECT valor FROM configuracoes WHERE chave = 'link_api'")[0]["valor"] == "https://api-teste.exemplo"
        assert cliente_api.get("/api/configuracoes/link_api").json()["valor"] == "https://api-teste.exemplo"
        r = cliente_api.put(ROTA, json={"valor": "https://outra.exemplo"}, headers=vendedor["headers"])
        assert r.status_code == 403
    finally:
        if antes:
            sql("UPDATE configuracoes SET valor = %s WHERE chave = 'link_api'", (antes[0]["valor"],))


def test_rota_antiga_do_config_api_nao_existe_e_a_tela_usa_a_nova(cliente_api, admin):
    # a tela chamava PUT /api/configuracoes/link_api, que só aceita GET (405): nunca gravou nada
    assert cliente_api.put("/api/configuracoes/link_api?valor=x", headers=admin["headers"]).status_code == 405
    pagina = (Path(RAIZ) / "frontend" / "config_api.html").read_text(encoding="utf-8")
    assert "/api/configuracoes/configuracoes/link_api" in pagina and "has-edit-permission" in pagina


def test_calendario_so_admin_cria(cliente_api, vendedor):
    r = cliente_api.post("/api/calendario/", json={"data": "2026-12-25", "descricao": "Natal", "notifica": True},
                         headers=vendedor["headers"])
    assert r.status_code == 403
    permissoes = (Path(RAIZ) / "frontend" / "js" / "permissions.js").read_text(encoding="utf-8")
    assert "'calendario.html': {" in permissoes and "edit: 'somente_admin'" in permissoes
