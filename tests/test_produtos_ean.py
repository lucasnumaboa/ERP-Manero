"""EAN-13 dos produtos: obrigatório, único, com dígito verificador; interno (200…) quando não vem; usado na etiqueta."""
import os
import subprocess
import sys

from conftest import BANCO_TESTE, RAIZ, sql


def test_regras_do_ean():
    import ean
    assert ean.digito_verificador("789123456789") == "5" and ean.valido("7891234567895")
    assert not ean.valido("7891234567890") and not ean.valido("123") and not ean.valido("78912345678ab")
    assert ean.interno(1) == "2000000000015" and ean.valido(ean.interno(987654321))


def test_sem_ean_vem_o_interno_e_a_sugestao_e_o_proximo(cliente_api, admin, novo_produto):
    import ean
    p = novo_produto(estoque=0)
    assert p["ean13"].startswith("200") and ean.valido(p["ean13"])
    r = cliente_api.get("/api/produtos/ean/sugestao", headers=admin["headers"])
    assert r.status_code == 200, r.text
    sugestao = r.json()["ean13"]
    assert ean.valido(sugestao) and int(sugestao[3:12]) == int(p["ean13"][3:12]) + 1
    assert cliente_api.get(f"/api/produtos/{p['id']}", headers=admin["headers"]).json()["ean13"] == p["ean13"]


def test_ean_informado_conferido_e_unico(cliente_api, admin, novo_produto):
    p = novo_produto(estoque=0, ean13="7891234567895")
    assert p["ean13"] == "7891234567895"
    r = cliente_api.post("/api/produtos/", headers=admin["headers"], data={
        "codigo": "TEAN-DUP", "nome": "Outro", "preco_custo": "1", "preco_venda": "2",
        "categoria_id": str(sql("SELECT id FROM categorias_produtos LIMIT 1")[0]["id"]), "ean13": "7891234567895"})
    assert r.status_code == 400 and "já está no produto" in r.json()["detail"]
    r = cliente_api.post("/api/produtos/", headers=admin["headers"], data={
        "codigo": "TEAN-DV", "nome": "Outro", "preco_custo": "1", "preco_venda": "2",
        "categoria_id": str(sql("SELECT id FROM categorias_produtos LIMIT 1")[0]["id"]), "ean13": "7891234567890"})
    assert r.status_code == 400 and "devia ser 5" in r.json()["detail"]
    # o código de barras lido na etiqueta acha o produto
    r = cliente_api.get("/api/produtos/codigo/7891234567895", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["id"] == p["id"]


def test_editar_ean(cliente_api, admin, novo_produto):
    p = novo_produto(estoque=0)
    url = f"/api/produtos/{p['id']}"
    r = cliente_api.put(url, json={"ean13": ""}, headers=admin["headers"])
    assert r.status_code == 400 and "13 números" in r.json()["detail"]
    r = cliente_api.put(url, json={"ean13": "789 1234 56789 3"}, headers=admin["headers"])   # dígito errado
    assert r.status_code == 400
    r = cliente_api.put(url, json={"ean13": "9780306406157"}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["ean13"] == "9780306406157"


def test_init_db_gera_ean_de_quem_nao_tem(novo_produto):
    import ean
    p = novo_produto(estoque=0)
    sql("UPDATE produtos SET ean13 = NULL WHERE id = %s", (p["id"],))
    env = {**os.environ, "DB_NAME": BANCO_TESTE, "PYTHONIOENCODING": "utf-8"}
    r = subprocess.run([sys.executable, "init_db.py"], cwd=RAIZ, env=env, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-1500:]
    assert sql("SELECT ean13 FROM produtos WHERE id = %s", (p["id"],))[0]["ean13"] == ean.interno(p["id"])
