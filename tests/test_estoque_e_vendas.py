"""Baixa de estoque, códigos de pedido e taxa de armazenagem."""
import threading
import time

import mysql.connector
import pytest

from conftest import BANCO_TESTE, CONEXAO, pedido, sql


def test_venda_sem_saldo_e_recusada_e_nada_e_gravado(cliente_api, admin, dados_base, novo_produto):
    produto = novo_produto(estoque=1)
    item = {"produto_id": produto["id"], "quantidade": 1, "preco_unitario": 200}
    assert cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"]).status_code == 201
    antes = sql("SELECT COUNT(*) AS n FROM pedidos_venda")[0]["n"]
    r = cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"])
    assert r.status_code == 400 and "Estoque insuficiente" in r.text
    assert sql("SELECT COUNT(*) AS n FROM pedidos_venda")[0]["n"] == antes
    assert sql("SELECT estoque_atual FROM produtos WHERE id=%s", (produto["id"],))[0]["estoque_atual"] == 0


def test_baixa_simultanea_espera_e_nao_vende_duas_vezes(novo_produto):
    from estoque_util import baixar_estoque
    from fastapi import HTTPException
    produto = novo_produto(estoque=1)
    conexoes = [mysql.connector.connect(**CONEXAO, database=BANCO_TESTE) for _ in range(2)]
    cursores = [c.cursor(dictionary=True, buffered=True) for c in conexoes]
    resultado = {}

    baixar_estoque(cursores[0], produto["id"], 1)  # venda A segura a linha

    def venda_b():
        inicio = time.time()
        try:
            baixar_estoque(cursores[1], produto["id"], 1)
            resultado["b"] = "aprovada"
        except HTTPException:
            resultado["b"] = "recusada"
        resultado["espera"] = time.time() - inicio

    t = threading.Thread(target=venda_b)
    t.start()
    time.sleep(1)
    conexoes[0].commit()  # venda A confirmada: B precisa ver o saldo zerado
    t.join()
    conexoes[1].rollback()
    for c in conexoes:
        c.close()
    assert resultado["b"] == "recusada"
    assert resultado["espera"] >= 0.8
    assert sql("SELECT estoque_atual FROM produtos WHERE id=%s", (produto["id"],))[0]["estoque_atual"] == 0


def test_codigo_do_pedido_nao_repete_depois_de_excluir(cliente_api, admin, dados_base, novo_produto):
    produto = novo_produto(estoque=10)
    item = {"produto_id": produto["id"], "quantidade": 1, "preco_unitario": 200}
    criados = [cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"]).json() for _ in range(3)]
    assert cliente_api.delete(f"/api/vendas/{criados[0]['id']}", headers=admin["headers"]).status_code == 204
    novo = cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"])
    assert novo.status_code == 201, novo.text  # com COUNT(*)+1 este repetia o código do 3º pedido
    codigos = [r["codigo"] for r in sql("SELECT codigo FROM pedidos_venda")]
    assert len(codigos) == len(set(codigos))


def test_banco_recusa_codigo_repetido():
    existente = sql("SELECT codigo, cliente_id, plataforma_id, usuario_id FROM pedidos_venda LIMIT 1")[0]
    with pytest.raises(mysql.connector.IntegrityError):
        sql("INSERT INTO pedidos_venda (codigo, cliente_id, plataforma_id, usuario_id, valor_produtos, valor_total) VALUES (%s,%s,%s,%s,0,0)",
            (existente["codigo"], existente["cliente_id"], existente["plataforma_id"], existente["usuario_id"]))


@pytest.mark.parametrize("tipo, valor, custo_esperado", [("percentual", 10, 120), ("valor", 15, 115)])
def test_taxa_de_armazenagem_entra_no_custo_da_venda(cliente_api, admin, dados_base, novo_produto, tipo, valor, custo_esperado):
    produto = novo_produto(estoque=5, custo=100, venda=200, taxa_armazenagem_tipo=tipo, taxa_armazenagem_valor=valor)
    itens = [{"produto_id": produto["id"], "quantidade": 2, "preco_unitario": 200, "aplicar_taxa_armazenagem": True}]
    r = cliente_api.post("/api/vendas/", json=pedido(dados_base, itens), headers=admin["headers"])
    assert r.status_code == 201, r.text
    venda = sql("SELECT id, custo_produto FROM pedidos_venda WHERE codigo=%s", (r.json()["codigo"],))[0]
    assert float(venda["custo_produto"]) == custo_esperado * 2
    assert float(sql("SELECT custo_item FROM itens_pedido_venda WHERE pedido_id=%s", (venda["id"],))[0]["custo_item"]) == custo_esperado


def test_sem_marcar_a_taxa_o_custo_e_so_o_do_produto(cliente_api, admin, dados_base, novo_produto):
    produto = novo_produto(estoque=5, custo=100, venda=200, taxa_armazenagem_tipo="percentual", taxa_armazenagem_valor=10)
    itens = [{"produto_id": produto["id"], "quantidade": 2, "preco_unitario": 200}]
    r = cliente_api.post("/api/vendas/", json=pedido(dados_base, itens), headers=admin["headers"])
    assert float(sql("SELECT custo_produto FROM pedidos_venda WHERE codigo=%s", (r.json()["codigo"],))[0]["custo_produto"]) == 200


def test_exclusao_de_venda_apaga_titulos_pendentes_e_bloqueia_recebidos(cliente_api, admin, dados_base, novo_produto):
    produto = novo_produto(estoque=5)
    item = {"produto_id": produto["id"], "quantidade": 1, "preco_unitario": 200}
    livre = cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"]).json()
    recebida = cliente_api.post("/api/vendas/", json=pedido(dados_base, [item]), headers=admin["headers"]).json()
    assert sql("SELECT COUNT(*) AS n FROM contas_receber WHERE pedido_venda_id=%s", (livre["id"],))[0]["n"] >= 1

    assert cliente_api.delete(f"/api/vendas/{livre['id']}", headers=admin["headers"]).status_code == 204
    assert sql("SELECT COUNT(*) AS n FROM contas_receber WHERE pedido_venda_id=%s", (livre["id"],))[0]["n"] == 0
    assert sql("SELECT estoque_atual FROM produtos WHERE id=%s", (produto["id"],))[0]["estoque_atual"] == 4  # devolveu 1

    sql("UPDATE contas_receber SET status='recebido' WHERE pedido_venda_id=%s", (recebida["id"],))
    r = cliente_api.delete(f"/api/vendas/{recebida['id']}", headers=admin["headers"])
    assert r.status_code == 400 and "recebido" in r.text
    assert sql("SELECT COUNT(*) AS n FROM pedidos_venda WHERE id=%s", (recebida["id"],))[0]["n"] == 1
