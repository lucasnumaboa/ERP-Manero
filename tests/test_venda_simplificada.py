"""Venda simplificada: escaneia, digita o nome do cliente e conclui (Finalizada, recebida, comissão paga)."""
from conftest import sql

URL = "/api/vendas/simplificada"


def _loja_fisica():
    linha = sql("SELECT id FROM plataformas_venda WHERE nome = 'Loja Física'")
    return linha[0]["id"] if linha else sql("INSERT INTO plataformas_venda (nome) VALUES ('Loja Física')")


def _vendedor_de(usuario):
    linha = sql("SELECT id, nome FROM vendedores WHERE usuario_id = %s", (usuario["id"],))
    if linha:
        return linha[0]
    vid = sql("INSERT INTO vendedores (nome, usuario_id) VALUES ('Vendedor do Admin', %s)", (usuario["id"],))
    return {"id": vid, "nome": "Vendedor do Admin"}


def test_padroes_loja_fisica_pix_e_vendedor_logado(cliente_api, admin):
    loja, vend = _loja_fisica(), _vendedor_de(admin)
    r = cliente_api.get(f"{URL}/padroes", headers=admin["headers"])
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["plataforma_padrao"] == loja and p["forma_padrao"] == "pix" and "pix" in p["formas_pagamento"]
    assert p["vendedor"]["id"] == vend["id"]


def test_venda_completa_cria_cliente_e_conclui(cliente_api, admin, novo_produto):
    loja, vend = _loja_fisica(), _vendedor_de(admin)
    a = novo_produto(estoque=5, venda=200, comissao=10)
    b = novo_produto(estoque=2, venda=50, comissao=3)
    # "a" escaneado duas vezes (vira uma linha com 2) e com o preço mudado pelo vendedor
    r = cliente_api.post(URL, headers=admin["headers"], json={"cliente_nome": "  Mária   Simplificada ", "itens": [
        {"produto_id": a["id"], "quantidade": 1, "preco_unitario": 180},
        {"produto_id": a["id"], "quantidade": 1, "preco_unitario": 180},
        {"produto_id": b["id"], "quantidade": 1, "preco_unitario": 50}]})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["cliente_novo"] and v["valor_total"] == 410 and v["comissao_total"] == 23

    pedido = sql("SELECT * FROM pedidos_venda WHERE id = %s", (v["id"],))[0]
    assert pedido["status"].lower() == "finalizada" and pedido["forma_pagamento"] == "pix"
    assert pedido["plataforma_id"] == loja and pedido["vendedor_id"] == vend["id"] and pedido["cliente_id"] == v["cliente_id"]
    itens = {i["produto_id"]: i for i in sql("SELECT * FROM itens_pedido_venda WHERE pedido_id = %s", (v["id"],))}
    assert itens[a["id"]]["quantidade"] == 2 and float(itens[a["id"]]["preco_unitario"]) == 180
    assert sql("SELECT estoque_atual FROM produtos WHERE id = %s", (a["id"],))[0]["estoque_atual"] == 3

    cr = sql("SELECT status, valor, data_recebimento FROM contas_receber WHERE pedido_venda_id = %s", (v["id"],))
    assert cr and all(c["status"] == "recebido" and c["data_recebimento"] for c in cr)
    assert sum(float(c["valor"]) for c in cr) == 410
    cp = sql("SELECT status, valor FROM contas_pagar WHERE pedido_venda_id = %s", (v["id"],))
    assert len(cp) == 1 and cp[0]["status"] == "pago" and float(cp[0]["valor"]) == 23

    # cadastro criado como a tela Clientes faz (clientes + parceiros)
    assert sql("SELECT nome, tipo FROM parceiros WHERE id = %s", (v["cliente_id"],))[0] == {"nome": "Mária Simplificada", "tipo": "cliente"}
    assert sql("SELECT COUNT(*) AS n FROM clientes WHERE nome = 'Mária Simplificada'")[0]["n"] == 1

    # mesmo nome sem acento/maiúsculas: usa o mesmo cliente
    r = cliente_api.post(URL, headers=admin["headers"], json={"cliente_nome": "maria simplificada", "forma_pagamento": "dinheiro",
                                                              "itens": [{"produto_id": b["id"], "quantidade": 1, "preco_unitario": 50}]})
    assert r.status_code == 201, r.text
    assert not r.json()["cliente_novo"] and r.json()["cliente_id"] == v["cliente_id"]
    assert sql("SELECT forma_pagamento FROM pedidos_venda WHERE id = %s", (r.json()["id"],))[0]["forma_pagamento"] == "dinheiro"


def test_sem_estoque_recusa_sem_criar_cliente(cliente_api, admin, novo_produto):
    _loja_fisica()
    p = novo_produto(estoque=1)
    r = cliente_api.post(URL, headers=admin["headers"], json={"cliente_nome": "Cliente Sem Estoque", "itens": [
        {"produto_id": p["id"], "quantidade": 2, "preco_unitario": 10}]})
    assert r.status_code == 400 and "Estoque insuficiente" in r.json()["detail"]
    assert sql("SELECT COUNT(*) AS n FROM parceiros WHERE nome = 'Cliente Sem Estoque'")[0]["n"] == 0
    r = cliente_api.post(URL, headers=admin["headers"], json={"cliente_nome": "Cliente X", "forma_pagamento": "fiado", "itens": [
        {"produto_id": p["id"], "quantidade": 1, "preco_unitario": 10}]})
    assert r.status_code == 400


def test_so_quem_pode_criar_venda(cliente_api, vendedor, novo_produto):
    p = novo_produto(estoque=1)
    assert cliente_api.get(f"{URL}/padroes", headers=vendedor["headers"]).status_code == 200
    r = cliente_api.post(URL, headers=vendedor["headers"], json={"cliente_nome": "Cliente Bloqueado", "itens": [
        {"produto_id": p["id"], "quantidade": 1, "preco_unitario": 10}]})
    assert r.status_code == 403


def test_tela_no_menu_e_nas_permissoes():
    from conftest import RAIZ
    from pathlib import Path
    front = Path(RAIZ) / "frontend"
    assert (front / "venda_simplificada.html").is_file()
    menu = (front / "js" / "sidebar-template.js").read_text(encoding="utf-8")
    assert "menuItem('venda_simplificada.html'" in menu and "'venda_simplificada.html': 'vendas_editar'" in menu
    assert "'venda_simplificada.html': {" in (front / "js" / "permissions.js").read_text(encoding="utf-8")
    # leitura pela câmera do celular
    pagina = (front / "venda_simplificada.html").read_text(encoding="utf-8")
    assert 'id="vsCamera"' in pagina and "js/leitor-camera.js" in pagina
    leitor = (front / "js" / "leitor-camera.js").read_text(encoding="utf-8")
    assert "BarcodeDetector" in leitor and "@zxing/browser@0.1.5" in leitor and "window.abrirLeitorCamera" in leitor
