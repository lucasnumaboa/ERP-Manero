"""Fila de travamentos do AutoPost (/api/autopost/diagnosticos): o app manda, o admin vê e marca como resolvido."""
import base64
import io
import os

from conftest import sql


def _png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "blue").save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def test_app_manda_e_admin_ve_e_resolve(cliente_api, admin, vendedor):
    sql("DELETE FROM autopost_diagnosticos")
    r = cliente_api.post("/api/autopost/diagnosticos/", headers=vendedor["headers"], json={
        "plataforma": "olx", "acao": "Ainda aguardando elemento (categoria Produtos)", "erro": "repetiu 6 vezes",
        "titulo": "Placa RX 580", "log": "[10:00:00] passo 1\n[10:00:10] passo 2", "url": "https://www2.olx.com.br/desapega",
        "pagina": {"botoes": [{"tag": "button", "texto": "Começar meu anúncio"}]}, "html": "<html>olx</html>",
        "imagem_base64": _png(), "versao_app": "1.1.0"})
    assert r.status_code == 201, r.text
    novo = r.json()
    assert novo["imagem"].startswith("uploads/diagnosticos/")
    arquivo = os.path.join(os.getcwd(), "..", "frontend", novo["imagem"])
    assert os.path.exists(arquivo)

    assert cliente_api.get("/api/autopost/diagnosticos/", headers=vendedor["headers"]).status_code == 403
    lista = cliente_api.get("/api/autopost/diagnosticos/", headers=admin["headers"]).json()
    assert lista["pendentes"] == 1 and lista["itens"][0]["acao"].startswith("Ainda aguardando")
    assert "html" not in lista["itens"][0]   # a lista é leve; o pesado vem no detalhe

    d = cliente_api.get(f"/api/autopost/diagnosticos/{novo['id']}", headers=admin["headers"]).json()
    assert d["html"] == "<html>olx</html>" and d["pagina"]["botoes"][0]["texto"] == "Começar meu anúncio"
    assert "passo 2" in d["log_texto"] and d["usuario_nome"] == "Teste Vendedor"

    r = cliente_api.put(f"/api/autopost/diagnosticos/{novo['id']}", headers=admin["headers"],
                        json={"status": "resolvido", "observacao": "botão novo da OLX"})
    assert r.status_code == 200
    assert cliente_api.get("/api/autopost/diagnosticos/", headers=admin["headers"]).json()["pendentes"] == 0
    todos = cliente_api.get("/api/autopost/diagnosticos/?status=", headers=admin["headers"]).json()["itens"]
    assert todos[0]["status"] == "resolvido" and todos[0]["data_resolucao"]
    os.remove(arquivo)


def test_recusa_imagem_que_nao_e_png(cliente_api, vendedor):
    r = cliente_api.post("/api/autopost/diagnosticos/", headers=vendedor["headers"], json={
        "plataforma": "olx", "acao": "x", "imagem_base64": base64.b64encode(b"<script>").decode()})
    assert r.status_code == 400
