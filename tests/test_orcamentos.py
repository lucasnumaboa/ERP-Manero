"""Módulo de Orçamentos: cálculo completo e permissões."""
from datetime import date

from conftest import sql


def test_orcamento_completo(cliente_api, admin, vendedor, novo_produto):
    base, h_adm, h_vend = "/api/orcamentos", admin["headers"], vendedor["headers"]
    assert cliente_api.put(f"{base}/config", json={"preco_por_km": 2.5}, headers=h_adm).status_code == 200
    assert cliente_api.put(f"{base}/config", json={"preco_por_km": 99}, headers=h_vend).status_code == 403
    hoje = date.today().isoformat()
    periodo = {"nome": "Período", "data_inicio": hoje, "data_fim": hoje, "hora_inicio": "00:00:00", "hora_fim": "23:59:59", "valor_adicional": 10}
    assert cliente_api.post(f"{base}/config/periodos", json=periodo, headers=h_adm).status_code == 201
    estilo = cliente_api.post(f"{base}/config/produtos-config", json={"nome": "Pintura", "valor": 15}, headers=h_adm).json()
    assert cliente_api.post(f"{base}/config/descontos", json={"quantidade_minima": 3, "percentual_desconto": 10}, headers=h_adm).status_code == 201

    regras = cliente_api.get(f"{base}/regras", headers=h_vend).json()
    assert regras["periodos"][0]["hora_inicio"] == "00:00:00"  # horário volta como texto

    produto = novo_produto(estoque=5, venda=450)
    itens = [{"produto_id": produto["id"], "nome_produto": produto["nome"], "quantidade": 1, "preco_unitario": 450},
             {"config_produto_id": estilo["id"], "nome_produto": "Pintura", "quantidade": 2, "preco_unitario": 15}]
    r = cliente_api.post(f"{base}/", json={"tipo_entrega": "entrega", "km_entrega": 10, "itens": itens,
                                           "campos_livres": {"Cor": "Azul"}}, headers=h_vend)
    assert r.status_code == 201, r.text
    orc = r.json()
    # 480 de produtos - 10% (3 unidades) + 10 do período + 25 de entrega (10 km x 2,50)
    assert float(orc["valor_total"]) == 467.0
    assert orc["codigo"].startswith(f"ORC{date.today().year}") and orc["status"] == "aberto"

    lista = cliente_api.get(f"{base}/", headers=h_vend).json()
    assert any(o["id"] == orc["id"] and int(o["total_itens"]) == 3 for o in lista)
    assert cliente_api.delete(f"{base}/{orc['id']}", headers=h_vend).status_code == 403
    assert cliente_api.delete(f"{base}/{orc['id']}", headers=h_adm).status_code == 204
    assert sql("SELECT COUNT(*) AS n FROM orcamento_itens WHERE orcamento_id=%s", (orc["id"],))[0]["n"] == 0
