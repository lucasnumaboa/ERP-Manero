"""Anúncios do ERP AutoPost: registro, lista do que está no ar e o que precisa sair (produto vendido)."""
from conftest import sql


def test_registra_lista_e_marca_removido(cliente_api, vendedor, novo_produto):
    produto = novo_produto(estoque=2, nome="Produto Anuncio TesteAP")
    h = vendedor["headers"]
    sql("DELETE FROM anuncios")

    r = cliente_api.post("/api/anuncios/", json={"produto_id": produto["id"], "plataforma": "facebook",
                                                  "titulo": "Produto Anuncio TesteAP", "preco": 199.9}, headers=h)
    assert r.status_code == 201, r.text
    fb = r.json()
    assert fb["status"] == "ativo" and fb["produto_nome"] == "Produto Anuncio TesteAP" and fb["usuario_id"] == vendedor["id"]
    cliente_api.post("/api/anuncios/", json={"produto_id": produto["id"], "plataforma": "olx",
                                             "titulo": "Produto Anuncio TesteAP"}, headers=h)

    assert cliente_api.get("/api/anuncios/ativos-por-produto", headers=h).json() == {str(produto["id"]): ["facebook", "olx"]}
    assert len(cliente_api.get("/api/anuncios/?status=ativo", headers=h).json()) == 2
    assert [a["plataforma"] for a in cliente_api.get("/api/anuncios/?plataforma=olx", headers=h).json()] == ["olx"]

    r = cliente_api.put(f"/api/anuncios/{fb['id']}/removido", json={"observacao": "vendido"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "removido" and r.json()["data_remocao"]
    assert cliente_api.get("/api/anuncios/ativos-por-produto", headers=h).json() == {str(produto["id"]): ["olx"]}


def test_para_remover_traz_so_produto_sem_estoque_ou_desativado(cliente_api, vendedor, novo_produto):
    com_estoque = novo_produto(estoque=3, nome="Ainda Tem TesteAP")
    vendido = novo_produto(estoque=1, nome="Vendeu TesteAP")
    desativado = novo_produto(estoque=5, nome="Desativado TesteAP")
    sql("DELETE FROM anuncios")
    h = vendedor["headers"]
    for p in (com_estoque, vendido, desativado):
        cliente_api.post("/api/anuncios/", json={"produto_id": p["id"], "plataforma": "olx", "titulo": "x"}, headers=h)
    sql("UPDATE produtos SET estoque_atual = 0 WHERE id = %s", (vendido["id"],))
    sql("UPDATE produtos SET ativo = 0 WHERE id = %s", (desativado["id"],))

    ids = {a["produto_id"] for a in cliente_api.get("/api/anuncios/para-remover", headers=h).json()}
    assert ids == {vendido["id"], desativado["id"]}


def test_validacoes(cliente_api, vendedor):
    h = vendedor["headers"]
    assert cliente_api.post("/api/anuncios/", json={"produto_id": 1, "plataforma": "mercadolivre", "titulo": "x"},
                            headers=h).status_code == 400
    assert cliente_api.post("/api/anuncios/", json={"produto_id": 999999999, "plataforma": "olx", "titulo": "x"},
                            headers=h).status_code == 404
    assert cliente_api.put("/api/anuncios/999999999/removido", json={}, headers=h).status_code == 404
    assert cliente_api.get("/api/anuncios/").status_code == 401
