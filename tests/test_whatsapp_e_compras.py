"""Avisos por WhatsApp pedidos pela tela (/api/whatsapp/enviar) e a coluna criado_tit_ap das compras.

Achados em 18/10/2026: a entrada de produtos não avisou os vendedores (o navegador chamava o webhook do n8n direto, e o
n8n saiu do ar); e o PUT que marca a conta a pagar da compra dava 500 (coluna inexistente), então cada novo salvar da
compra criava outra conta a pagar.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from conftest import BANCO_TESTE, RAIZ, sql

VENDEDOR_TEL = "5511900001111"


@pytest.fixture
def webhook_falso():
    """Webhook local que guarda o que recebe e responde 200 (como o n8n e o middleware do Evolution)."""
    recebidos = []

    class Tratador(BaseHTTPRequestHandler):
        def do_POST(self):
            recebidos.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"queued"}')

        def log_message(self, *args):
            pass

    servidor = HTTPServer(("127.0.0.1", 0), Tratador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    antes = {r["chave"]: r["valor"] for r in sql("SELECT chave, valor FROM configuracoes WHERE chave IN ('webhook_url', 'webhook_ativo')")}
    vendedor_id = sql("INSERT INTO vendedores (nome, telefone, ativo) VALUES ('Vendedor WhatsApp', %s, 1)", (VENDEDOR_TEL,))
    try:
        yield {"url": f"http://127.0.0.1:{servidor.server_port}/webhook", "recebidos": recebidos}
    finally:
        servidor.shutdown()
        sql("DELETE FROM vendedores WHERE id = %s", (vendedor_id,))
        for chave, valor in antes.items():
            sql("UPDATE configuracoes SET valor = %s WHERE chave = %s", (valor, chave))


def _config(url, ativo):
    sql("UPDATE configuracoes SET valor = %s WHERE chave = 'webhook_url'", (url,))
    sql("UPDATE configuracoes SET valor = %s WHERE chave = 'webhook_ativo'", ("true" if ativo else "false",))


def test_tela_manda_pelo_servidor_so_para_vendedor_e_so_ligado(cliente_api, vendedor, webhook_falso):
    rota, corpo = "/api/whatsapp/enviar", {"telefone": VENDEDOR_TEL, "mensagem": "📦 *ENTROU* 1 unidade(s)"}

    _config(webhook_falso["url"], ativo=False)
    r = cliente_api.post(rota, json=corpo, headers=vendedor["headers"])
    assert r.status_code == 200 and r.json()["enviado"] is False and webhook_falso["recebidos"] == []

    _config(webhook_falso["url"], ativo=True)
    r = cliente_api.post(rota, json=corpo, headers=vendedor["headers"])
    assert r.status_code == 200 and r.json()["enviado"] is True, r.text
    assert webhook_falso["recebidos"][0]["telefone"] == VENDEDOR_TEL
    assert webhook_falso["recebidos"][0]["mensagem"] == corpo["mensagem"]

    # o mesmo número escrito de outro jeito também é do vendedor
    r = cliente_api.post(rota, json={**corpo, "telefone": "(11) 90000-1111"}, headers=vendedor["headers"])
    assert r.status_code == 200 and r.json()["enviado"] is True

    # número que não é de vendedor ativo: o servidor não vira um disparador de mensagens
    r = cliente_api.post(rota, json={**corpo, "telefone": "5511955554444"}, headers=vendedor["headers"])
    assert r.status_code == 403
    assert cliente_api.post(rota, json=corpo).status_code == 401
    assert len(webhook_falso["recebidos"]) == 2


def test_telas_nao_chamam_mais_o_webhook_direto():
    for arquivo in ("webhook-estoque.js", "gerar-relatorio-ia.js", "configuracoes.js"):
        js = (RAIZ / "frontend" / "js" / arquivo).read_text(encoding="utf-8")
        assert "/api/whatsapp/enviar" in js, arquivo
        assert "fetch(webhookUrl" not in js, arquivo


def _compra(cliente_api, admin, novo_produto):
    fornecedor = sql("INSERT INTO parceiros (tipo, nome) VALUES ('fornecedor', 'Fornecedor WhatsApp')")
    produto = novo_produto(estoque=0)
    r = cliente_api.post("/api/compras/", json={"fornecedor_id": fornecedor, "data_previsao": "2026-10-30",
                                                "itens": [{"produto_id": produto["id"], "quantidade": 2, "preco_unitario": 10}]},
                         headers=admin["headers"])
    assert r.status_code == 201, r.text
    return r.json()


def test_marca_conta_a_pagar_criada_antes_e_depois_de_receber(cliente_api, admin, novo_produto):
    compra = _compra(cliente_api, admin, novo_produto)
    assert compra["criado_tit_ap"] in (False, 0)
    # o fluxo da tela (compras.js): cria a conta, marca a compra e recebe
    r = cliente_api.put(f"/api/compras/{compra['id']}", json={"criado_tit_ap": True}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert cliente_api.post(f"/api/estoque/receber-pedido/{compra['id']}", headers=admin["headers"]).status_code == 200
    r = cliente_api.get(f"/api/compras/{compra['id']}", headers=admin["headers"])
    assert r.json()["status"] == "recebido" and r.json()["criado_tit_ap"] in (True, 1)
    # compra já recebida: marcar de novo continua aceito (só esse campo pode mudar)
    assert cliente_api.put(f"/api/compras/{compra['id']}", json={"criado_tit_ap": True}, headers=admin["headers"]).status_code == 200


def test_init_db_marca_as_compras_que_ja_tinham_conta(cliente_api, admin, novo_produto):
    com_conta = _compra(cliente_api, admin, novo_produto)
    sem_conta = _compra(cliente_api, admin, novo_produto)
    r = cliente_api.post("/api/contas-pagar/", json={"descricao": f"Compra do fornecedor - Ref. Compra #{com_conta['id']}",
                                                     "fornecedor_id": com_conta["fornecedor_id"], "valor": 20,
                                                     "data_vencimento": "2026-10-30", "forma_pagamento": "dinheiro"},
                         headers=admin["headers"])
    assert r.status_code == 201, r.text
    # banco como o de produção antes da correção: sem a coluna
    sql("ALTER TABLE pedidos_compra DROP COLUMN criado_tit_ap")
    env = {**os.environ, "DB_NAME": BANCO_TESTE, "PYTHONIOENCODING": "utf-8"}
    rodada = subprocess.run([sys.executable, "init_db.py"], cwd=RAIZ, env=env, capture_output=True, text=True, encoding="utf-8")
    assert rodada.returncode == 0, rodada.stdout[-1500:] + rodada.stderr[-1500:]
    assert "Coluna criado_tit_ap criada" in rodada.stdout
    marcadas = {r["id"]: r["criado_tit_ap"] for r in sql("SELECT id, criado_tit_ap FROM pedidos_compra WHERE id IN (%s, %s)",
                                                        (com_conta["id"], sem_conta["id"]))}
    assert marcadas == {com_conta["id"]: 1, sem_conta["id"]: 0}
