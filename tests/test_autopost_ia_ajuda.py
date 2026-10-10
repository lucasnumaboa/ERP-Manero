"""Ajuda da IA quando o robô do AutoPost trava numa tela (/api/autopost/ia/ajuda), a memória das respostas e o lado do
app (autopost/plataformas/base.py). A IA e o navegador são simulados."""
import importlib
import json
import sys
from pathlib import Path

import pytest

from conftest import sql

RAIZ = Path(__file__).resolve().parent.parent

# a tela das características com campos obrigatórios vazios, mas o robô acha que já está na descrição
TELA = {
    "url": "https://www2.olx.com.br/desapega",
    "titulos": ["Agora informe algumas características do seu produto"],
    "botoes": ["Página inicial", "Trocar categoria", "Voltar", "Continuar", "Destaque Ouro", "Pagar com Pix"],
    "campos": [
        {"id": "info_components_type", "rotulo": "Tipo", "tipo": "lista", "valor": "", "obrigatorio": True,
         "opcoes": ["Coolers e Ventoinhas", "Placas de Rede", "Outros"]},
        {"id": "info_components_condition", "rotulo": "Condição", "tipo": "lista", "valor": "", "obrigatorio": True,
         "opcoes": ["Novo", "Usado - Excelente", "Usado - Bom"]},
    ],
    "erros": ["Campo obrigatório"],
    "texto": "Agora informe algumas características do seu produto Tipo Selecione Campo obrigatório ...",
}


@pytest.fixture
def ia(monkeypatch):
    import routers.autopost_ia as modulo
    estado = {"respostas": [], "pedidos": []}

    async def perguntar(mensagens):
        estado["pedidos"].append(mensagens)
        return json.dumps(estado["respostas"].pop(0))

    monkeypatch.setattr(modulo, "_perguntar", perguntar)
    sql("DELETE FROM autopost_memoria")
    yield estado
    sql("DELETE FROM autopost_memoria")


def _pedido(**extra):
    return {"plataforma": "olx", "produto_id": 7, "titulo": "Placa de rede", "preco": "80",
            "etapa_esperada": "procurando textarea descrição", "tentativas": ["procurou textarea por 20s"],
            "tela": TELA, "imagem_base64": "iVBORw0KGgo=", **extra}


def test_ajuda_diz_onde_esta_valida_as_acoes_e_guarda_so_o_que_deu_certo(cliente_api, vendedor, ia):
    resposta_ia = {"etapa_atual": "características (campos obrigatórios vazios)",
                   "explicacao": "Ainda não é a descrição: faltam Tipo e Condição.",
                   "acoes": [{"tipo": "selecionar", "campo": "Tipo", "opcao": "placas de rede"},
                             {"tipo": "selecionar", "campo": "info_components_condition", "opcao": "Usado - Excelente"},
                             {"tipo": "clicar", "texto": "continuar"}]}
    ia["respostas"] = [resposta_ia, resposta_ia]
    assert cliente_api.post("/api/autopost/ia/ajuda", json=_pedido()).status_code == 401
    r = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido())
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["origem"] == "ia" and corpo["etapa_atual"].startswith("características") and corpo["recusadas"] == []
    assert corpo["acoes"] == [{"tipo": "selecionar", "campo": "info_components_type", "opcao": "Placas de Rede"},
                              {"tipo": "selecionar", "campo": "info_components_condition", "opcao": "Usado - Excelente"},
                              {"tipo": "clicar", "texto": "Continuar"}]
    # a IA recebe onde o robô acha que está, a tela de verdade e o print
    sistema, usuario = ia["pedidos"][0]
    assert "REALMENTE" in sistema["content"]
    dados = json.loads(usuario["content"][0]["text"].split("\n", 1)[1])
    assert dados["etapa_em_que_o_robo_acha_que_esta"] == "procurando textarea descrição"
    assert dados["tela"]["titulos"] == TELA["titulos"] and dados["o_que_o_robo_ja_tentou"]
    assert usuario["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")

    # ainda não deu certo nenhuma vez: pergunta de novo; depois de dar certo, vem da memória sem chamar a IA
    segunda = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido()).json()
    assert segunda["origem"] == "ia" and len(ia["pedidos"]) == 2
    assert cliente_api.post(f"/api/autopost/ia/memoria/{segunda['memoria_id']}/resultado", headers=vendedor["headers"],
                            json={"deu_certo": True}).status_code == 200
    terceira = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido()).json()
    assert terceira["origem"] == "memória" and terceira["acoes"] == corpo["acoes"] and len(ia["pedidos"]) == 2
    # escolhas de lista dependem do produto: outro produto não usa esta resposta
    ia["respostas"] = [resposta_ia]
    outro = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido(produto_id=8)).json()
    assert outro["origem"] == "ia" and len(ia["pedidos"]) == 3
    # falhou mais vezes do que acertou: volta a perguntar
    for _ in range(2):
        cliente_api.post(f"/api/autopost/ia/memoria/{segunda['memoria_id']}/resultado", headers=vendedor["headers"],
                         json={"deu_certo": False})
    ia["respostas"] = [resposta_ia]
    assert cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido()).json()["origem"] == "ia"


def test_resposta_generica_serve_para_outro_produto(cliente_api, vendedor, ia):
    tela = {**TELA, "campos": [{"id": "description", "rotulo": "Descrição", "tipo": "area", "valor": ""}]}
    ia["respostas"] = [{"etapa_atual": "descrição", "explicacao": "falta a descrição",
                        "acoes": [{"tipo": "preencher", "campo": "Descrição", "valor": "{descricao}"},
                                  {"tipo": "clicar", "texto": "Continuar"}]}]
    primeira = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido(tela=tela)).json()
    cliente_api.post(f"/api/autopost/ia/memoria/{primeira['memoria_id']}/resultado", headers=vendedor["headers"],
                     json={"deu_certo": True})
    outro = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"],
                             json=_pedido(tela=tela, produto_id=99)).json()
    assert outro["origem"] == "memória" and outro["acoes"][0]["valor"] == "{descricao}" and len(ia["pedidos"]) == 1
    # sem_memoria: pergunta à IA mesmo havendo resposta guardada
    ia["respostas"] = [{"etapa_atual": "descrição", "acoes": [{"tipo": "clicar", "texto": "Continuar"}]}]
    r = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido(tela=tela, sem_memoria=True))
    assert r.json()["origem"] == "ia" and len(ia["pedidos"]) == 2


def test_botao_que_custa_dinheiro_ou_nao_existe_e_recusado_e_a_ia_tenta_de_novo(cliente_api, vendedor, ia):
    ia["respostas"] = [
        {"etapa_atual": "destaque", "acoes": [{"tipo": "clicar", "texto": "Destaque Ouro"},
                                              {"tipo": "clicar", "texto": "Publicar agora"}]},
        {"etapa_atual": "características", "acoes": [{"tipo": "clicar", "texto": "Pagar com Pix"},
                                                     {"tipo": "esperar", "segundos": 99}]},
    ]
    r = cliente_api.post("/api/autopost/ia/ajuda", headers=vendedor["headers"], json=_pedido()).json()
    assert len(ia["pedidos"]) == 2
    assert "não pode ser usada" in ia["pedidos"][1][1]["content"][0]["text"]
    assert r["acoes"] == [{"tipo": "esperar", "segundos": 15}]
    assert any("Pagar com Pix" in m and "dinheiro" in m for m in r["recusadas"])


def test_validar_acoes():
    import routers.autopost_ia as modulo
    tela = modulo.Tela(**TELA)
    validas, recusadas = modulo.validar_acoes([
        {"tipo": "preencher", "campo": "Tipo", "valor": "x"},                 # Tipo é lista, não texto
        {"tipo": "selecionar", "campo": "Tipo", "opcao": "Coolers"},          # opção que não existe
        {"tipo": "abrir_site", "url": "http://x"},
        {"tipo": "desistir", "motivo": "pede código por SMS"},
        {"tipo": "clicar", "texto": "Continuar"},                             # depois de desistir não vale
    ], tela)
    assert validas == [{"tipo": "desistir", "motivo": "pede código por SMS"}] and len(recusadas) == 3
    # a OLX escreve "Informações adicionais *"; a IA responde sem o asterisco (caso do teste real)
    descricao = modulo.Tela(**{**TELA, "campos": [{"id": "body", "rotulo": "Informações adicionais *", "tipo": "area"}],
                               "botoes": ["Continuar", "Entregar grátis pela OLX", "Ativar", "Anunciar sem destacar"]})
    validas, recusadas = modulo.validar_acoes([
        {"tipo": "preencher", "campo": "Informações adicionais", "valor": "{descricao}"},
        {"tipo": "clicar", "texto": "Entregar grátis pela OLX"}, {"tipo": "clicar", "texto": "Ativar"},
        {"tipo": "clicar", "texto": "Anunciar sem destacar"}], descricao)
    assert validas == [{"tipo": "preencher", "campo": "body", "valor": "{descricao}"},
                       {"tipo": "clicar", "texto": "Anunciar sem destacar"}] and len(recusadas) == 2
    assert modulo.acoes_genericas([{"tipo": "clicar", "texto": "Continuar"},
                                   {"tipo": "preencher", "campo": "d", "valor": " {titulo} {preco} "}])
    assert not modulo.acoes_genericas([{"tipo": "preencher", "campo": "d", "valor": "Placa {titulo}"}])


# ---------- lado do app: base.Plataforma.ajuda_da_ia ----------

class DriverFalso:
    def __init__(self):
        self.textos = ["tela antes", "tela depois"]
        self.scripts = []

    def execute_script(self, script, *args):
        self.scripts.append(script)
        if "titulos" in script and "botoes" in script:
            return dict(TELA)
        if "innerText" in script:
            return self.textos.pop(0) if len(self.textos) > 1 else self.textos[0]
        return None

    def get_screenshot_as_base64(self):
        return "iVBORw0KGgo="

    def find_elements(self, *args):
        return []


@pytest.fixture(scope="module")
def base():
    sys.path.insert(0, str(RAIZ / "autopost"))
    try:
        yield importlib.import_module("plataformas.base")
    finally:
        sys.path.remove(str(RAIZ / "autopost"))


def test_app_manda_a_tela_faz_as_acoes_e_conta_se_deu_certo(base):
    logs, pedidos, relatos = [], [], []
    plataforma = base.Plataforma(type("Nav", (), {"driver": DriverFalso()})(), logs.append)
    plataforma.nome = "olx"
    plataforma._item_atual = {"produto_id": 7, "titulo": "Placa de rede", "preco": "80", "descricao": "Boa"}
    plataforma.pedir_ajuda = lambda dados: pedidos.append(dados) or {
        "origem": "ia", "memoria_id": 3, "etapa_atual": "características", "explicacao": "faltam campos",
        "acoes": [{"tipo": "esperar", "segundos": 1}, {"tipo": "desistir", "motivo": "captcha"}]}
    plataforma.relatar_memoria = lambda memoria_id, deu_certo: relatos.append((memoria_id, deu_certo))
    assert plataforma.ajuda_da_ia("procurando textarea descrição", tentativa="20s sem achar") is True
    assert pedidos[0]["etapa_esperada"] == "procurando textarea descrição" and pedidos[0]["tela"]["titulos"]
    assert pedidos[0]["produto_id"] == 7 and pedidos[0]["imagem_base64"] and pedidos[0]["tentativas"] == ["20s sem achar"]
    assert relatos == [(3, True)]
    assert any("a tela é 'características'" in l and "esperava 'procurando textarea descrição'" in l for l in logs)
    assert any("só uma pessoa resolve: captcha" in l for l in logs)
    # limite de pedidos por anúncio
    plataforma._ajudas = plataforma.MAX_AJUDAS
    assert plataforma.ajuda_da_ia("outra") is False and len(pedidos) == 1


def test_dados_do_produto_entram_no_lugar_das_marcas(base):
    tela = importlib.import_module("plataformas.tela")
    item = {"titulo": "Placa", "descricao": "Nova", "preco": "80"}
    assert tela.com_dados_do_produto("{titulo} - {descricao} por {preco}", item) == "Placa - Nova por 80"
    assert tela.descrever({"tipo": "selecionar", "campo": "Tipo", "opcao": "Outros"}) == "escolher 'Outros' em 'Tipo'"
