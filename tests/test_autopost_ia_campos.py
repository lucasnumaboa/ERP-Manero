"""IA nos campos de seleção dos sites (/api/autopost/ia/campos) e a escolha de reserva do AutoPost (sem IA).
A DeepSeek é simulada: nada sai para a internet."""
import importlib
import json
import sys
from pathlib import Path

import pytest

from conftest import sql

RAIZ = Path(__file__).resolve().parent.parent

CAMPOS = [
    {"id": "info_graphic_card_manufacturer", "rotulo": "Marca", "obrigatorio": True, "opcoes": ["AMD", "Intel", "Nvidia"]},
    {"id": "info_graphic_card_brand", "rotulo": "Fabricante", "obrigatorio": True,
     "opcoes": ["ASUS", "Gigabyte", "MSI", "Outros"]},
    {"id": "info_graphic_card_model", "rotulo": "Modelo", "obrigatorio": False, "opcoes": ["GeForce GTX", "Radeon RX", "Outros"]},
    {"id": "info_graphic_card_vram", "rotulo": "Memória de Vídeo - VRAM", "obrigatorio": False, "opcoes": ["Até 1GB", "2 GB", "4 GB"]},
    {"id": "info_graphic_card_condition", "rotulo": "Condição", "obrigatorio": True,
     "opcoes": ["Novo", "Usado - Excelente", "Usado - Bom"]},
]


@pytest.fixture
def produto_com_foto():
    import routers.autopost_ia as ia_campos
    pasta = Path(ia_campos.PASTA_FRONTEND) / "uploads" / "produtos"
    pasta.mkdir(parents=True, exist_ok=True)
    foto = pasta / "teste_ia_campos.png"
    foto.write_bytes(b"\x89PNG\r\n\x1a\nfoto de teste")
    produto_id = sql("INSERT INTO produtos (codigo, nome, descricao, preco_custo, preco_venda, caminho_imagem) VALUES "
                     "('TESTE-IA-CAMPOS', 'Placa de vídeo RX550 2gb Low profile', 'Funcionando perfeitamente', 100, 250, %s)",
                     ("../../backend/main.py, uploads/produtos/teste_ia_campos.png, uploads/produtos/nao_existe.png",))
    yield produto_id
    foto.unlink(missing_ok=True)
    sql("DELETE FROM produtos WHERE id = %s", (produto_id,))


def test_escolhas_da_ia_valem_so_com_opcao_do_campo(cliente_api, vendedor, produto_com_foto, monkeypatch):
    import routers.autopost_ia as ia_campos
    pedidos = []

    async def perguntar(mensagens):
        pedidos.append(mensagens)
        return json.dumps({"escolhas": {
            "info_graphic_card_manufacturer": "amd",                 # sem maiúscula: vale a opção "AMD"
            "info_graphic_card_brand": "PowerColor",                 # não é opção: obrigatório vira "Outros"
            "info_graphic_card_model": "Radeon RX",
            "info_graphic_card_vram": "2gb",                         # não é opção exata: opcional fica None
            "info_graphic_card_condition": "usado - EXCELENTE",
        }})

    monkeypatch.setattr(ia_campos, "_perguntar", perguntar)
    pedido = {"plataforma": "olx", "produto_id": produto_com_foto, "titulo": "Placa de vídeo RX550 2gb Low profile",
              "categoria_site": "Informática > Placas de Vídeo", "campos": CAMPOS}
    assert cliente_api.post("/api/autopost/ia/campos", json=pedido).status_code == 401
    r = cliente_api.post("/api/autopost/ia/campos", headers=vendedor["headers"], json=pedido)
    assert r.status_code == 200, r.text
    assert r.json() == {"fotos": 1, "escolhas": {
        "info_graphic_card_manufacturer": "AMD", "info_graphic_card_brand": "Outros",
        "info_graphic_card_model": "Radeon RX", "info_graphic_card_vram": None,
        "info_graphic_card_condition": "Usado - Excelente"}}

    sistema, usuario = pedidos[0]
    assert sistema["role"] == "system" and "texto exato" in sistema["content"]
    texto = usuario["content"][0]["text"]
    assert "RX550" in texto and "Funcionando perfeitamente" in texto and "Placas de Vídeo" in texto and "Radeon RX" in texto
    imagens = [p for p in usuario["content"] if p["type"] == "image_url"]
    # só a foto que existe dentro de uploads; o caminho que sai da pasta é ignorado
    assert len(imagens) == 1 and imagens[0]["image_url"]["url"].startswith("data:image/png;base64,")


def test_resposta_que_nao_e_json_deixa_so_os_obrigatorios_com_outros():
    import routers.autopost_ia as ia_campos
    campos = [ia_campos.Campo(**c) for c in CAMPOS]
    assert ia_campos.validar_escolhas("não sei", campos) == {
        "info_graphic_card_manufacturer": None, "info_graphic_card_brand": "Outros", "info_graphic_card_model": None,
        "info_graphic_card_vram": None, "info_graphic_card_condition": None}


def test_sem_chave_da_deepseek_o_erro_e_claro(cliente_api, vendedor):
    sql("UPDATE configuracoes SET valor = '' WHERE chave = 'apikey_deepseek'")
    r = cliente_api.post("/api/autopost/ia/campos", headers=vendedor["headers"],
                         json={"plataforma": "olx", "titulo": "x", "campos": CAMPOS[:1]})
    assert r.status_code == 400 and "API Key da DeepSeek" in r.json()["detail"]


# ---------- escolha de reserva do app (autopost/plataformas/olx.py), sem a IA ----------

@pytest.fixture(scope="module")
def olx():
    sys.path.insert(0, str(RAIZ / "autopost"))
    try:
        yield importlib.import_module("plataformas.olx")
    finally:
        sys.path.remove(str(RAIZ / "autopost"))


def test_escolha_reserva_pelo_titulo(olx):
    titulo = "Placa de vídeo RX550 2gb Low profile"
    assert olx.escolha_reserva(CAMPOS[3], titulo) == "2 GB"
    assert olx.escolha_reserva(CAMPOS[4], titulo) == "Usado - Excelente"
    assert olx.escolha_reserva(CAMPOS[1], titulo) == "Outros"
    assert olx.escolha_reserva(CAMPOS[0], titulo) is None      # AMD não aparece no título: sem a IA, fica em branco
