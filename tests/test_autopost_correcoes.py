"""Correção dos travamentos do AutoPost com IA (/api/autopost/correcoes) e as funções do construtor do servidor.
A IA e o GitHub são simulados: nada sai para a internet."""
import importlib.util
import json
from pathlib import Path

import pytest

from conftest import sql

CODIGO = {
    "autopost/plataformas/olx.py": "def continuar(pagina):\n    pagina.clicar('Próximo')\n    return True\n",
    "autopost/plataformas/base.py": "class Plataforma:\n    pass\n",
    "autopost/navegador.py": "class Navegador:\n    pass\n",
    "autopost/tarefas.py": "def postar():\n    pass\n",
}


def _proposta(buscar="    pagina.clicar('Próximo')\n", substituir="    pagina.clicar('Continuar')\n", solucao="Clica em Continuar"):
    return json.dumps({"diagnostico": "O botão mudou", "causa": "texto antigo", "solucao": solucao,
                       "alteracoes": [{"arquivo": "autopost/plataformas/olx.py", "buscar": buscar,
                                       "substituir": substituir, "motivo": "a OLX trocou o texto do botão"}]})


@pytest.fixture
def ia(monkeypatch):
    """IA e GitHub de mentira: devolve as respostas da fila e guarda as mensagens recebidas."""
    import routers.autopost_correcoes as correcoes
    estado = {"respostas": [], "pedidos": []}

    async def codigo(plataforma):
        return "abc123", dict(CODIGO)

    async def chamar(mensagens):
        estado["pedidos"].append(mensagens)
        return estado["respostas"].pop(0)

    monkeypatch.setattr(correcoes, "_buscar_codigo", codigo)
    monkeypatch.setattr(correcoes, "_chamar_ia", chamar)
    return estado


@pytest.fixture
def travamento(cliente_api, vendedor):
    sql("DELETE FROM autopost_correcoes")
    sql("DELETE FROM autopost_diagnosticos")
    r = cliente_api.post("/api/autopost/diagnosticos/", headers=vendedor["headers"], json={
        "plataforma": "olx", "acao": "Página sem mudança por 10s (Continuar após descrição)", "erro": "repetiu 6 vezes",
        "log": "[10:00] clicou Próximo\n[10:00] página igual", "versao_app": "1.1.0"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_analisa_rejeita_refaz_e_aprova(cliente_api, admin, vendedor, travamento, ia):
    ia["respostas"] = [_proposta(), _proposta(substituir="    pagina.clicar_por_texto('Continuar')\n", solucao="Usa o texto")]
    rota = f"/api/autopost/correcoes/{travamento}"

    assert cliente_api.get(rota, headers=vendedor["headers"]).status_code == 403
    r = cliente_api.post(f"{rota}/analisar", headers=admin["headers"], json={})
    assert r.status_code == 202 and r.json()["status"] == "analisando"
    rodadas = cliente_api.get(rota, headers=admin["headers"]).json()["rodadas"]
    assert [x["status"] for x in rodadas] == ["proposta"]
    primeira = rodadas[0]
    assert primeira["analise"]["solucao"] == "Clica em Continuar" and primeira["commit_base"] == "abc123"
    assert primeira["alteracoes"][0]["arquivo"] == "autopost/plataformas/olx.py"
    contexto = ia["pedidos"][0][1]["content"]
    assert "Continuar após descrição" in contexto and "def continuar(pagina)" in contexto

    r = cliente_api.post(f"/api/autopost/correcoes/rodadas/{primeira['id']}/rejeitar", headers=admin["headers"],
                         json={"instrucao": "use o texto do botão, não a posição"})
    assert r.status_code == 202
    rodadas = cliente_api.get(rota, headers=admin["headers"]).json()["rodadas"]
    assert [x["status"] for x in rodadas] == ["rejeitada", "proposta"]
    assert rodadas[1]["instrucao"] == "use o texto do botão, não a posição"
    # a IA recebeu a proposta recusada e o pedido do admin
    papeis = [m["role"] for m in ia["pedidos"][1]]
    assert papeis[-2:] == ["assistant", "user"] and "use o texto do botão" in ia["pedidos"][1][-1]["content"]

    segunda = rodadas[1]
    assert cliente_api.post(f"/api/autopost/correcoes/rodadas/{primeira['id']}/aprovar", headers=admin["headers"]).status_code == 409
    r = cliente_api.post(f"/api/autopost/correcoes/rodadas/{segunda['id']}/aprovar", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "aprovada" and "Aprovada por" in r.json()["log_texto"]
    # com uma publicação em andamento, não começa outra análise
    assert cliente_api.post(f"{rota}/analisar", headers=admin["headers"], json={}).status_code == 409


def test_trecho_que_nao_existe_a_ia_refaz_e_se_nao_acertar_vira_erro(cliente_api, admin, travamento, ia):
    errada = _proposta(buscar="pagina.clicar('Avançar')")
    ia["respostas"] = [errada, errada, errada]
    rota = f"/api/autopost/correcoes/{travamento}"
    cliente_api.post(f"{rota}/analisar", headers=admin["headers"], json={"instrucao": "o botão é Continuar"})
    rodada = cliente_api.get(rota, headers=admin["headers"]).json()["rodadas"][0]
    assert rodada["status"] == "erro" and "aparece 0 vez" in rodada["erro"]
    assert len(ia["pedidos"]) == 3                                   # 1 análise + 2 pedidos de ajuste
    assert "o botão é Continuar" in ia["pedidos"][0][1]["content"]   # a orientação inicial foi junto
    assert "não pode ser aplicada" in ia["pedidos"][-1][-1]["content"]


def test_validar_alteracoes():
    import routers.autopost_correcoes as correcoes
    ok = json.loads(_proposta())["alteracoes"]
    assert correcoes.validar_alteracoes(ok, CODIGO) == []
    assert correcoes.validar_alteracoes([], CODIGO) == ["nenhuma alteração proposta"]
    fora = [{**ok[0], "arquivo": "backend/main.py"}]
    assert "não é um dos arquivos enviados" in correcoes.validar_alteracoes(fora, CODIGO)[0]
    repetido = {"autopost/plataformas/olx.py": "x = 1\nx = 1\n"}
    assert "aparece 2 vez" in correcoes.validar_alteracoes(
        [{"arquivo": "autopost/plataformas/olx.py", "buscar": "x = 1", "substituir": "x = 2"}], repetido)[0]


# ---------- construtor (scripts/construtor_autopost.py) ----------

@pytest.fixture(scope="module")
def construtor():
    caminho = Path(__file__).resolve().parent.parent / "scripts" / "construtor_autopost.py"
    spec = importlib.util.spec_from_file_location("construtor_autopost", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_aplica_mantendo_crlf_e_recusa_trecho_ambiguo_ou_fora_do_autopost(construtor, tmp_path):
    pasta = tmp_path / "autopost" / "plataformas"
    pasta.mkdir(parents=True)
    arquivo = pasta / "olx.py"
    arquivo.write_bytes(b"def continuar(pagina):\r\n    pagina.clicar('Pr\xc3\xb3ximo')\r\n    return True\r\n")
    alterados = construtor.aplicar_alteracoes(tmp_path, json.loads(_proposta())["alteracoes"])
    assert alterados == ["autopost/plataformas/olx.py"]
    assert arquivo.read_bytes() == b"def continuar(pagina):\r\n    pagina.clicar('Continuar')\r\n    return True\r\n"

    with pytest.raises(construtor.Falha, match="aparece 0 vez"):   # já trocado: o código mudou desde a análise
        construtor.aplicar_alteracoes(tmp_path, json.loads(_proposta())["alteracoes"])
    with pytest.raises(construtor.Falha, match="dentro de autopost"):
        construtor.aplicar_alteracoes(tmp_path, [{"arquivo": "../backend/main.py", "buscar": "a", "substituir": "b"}])


def test_sobe_a_versao(construtor, tmp_path):
    arquivo = tmp_path / "api.py"
    arquivo.write_bytes(b'import json\r\n\r\nVERSAO = "1.1.9"\r\n')
    assert construtor.subir_versao(arquivo) == ("1.1.9", "1.1.10")
    assert arquivo.read_bytes() == b'import json\r\n\r\nVERSAO = "1.1.10"\r\n'
    arquivo.write_text("sem versao", encoding="utf-8")
    with pytest.raises(construtor.Falha):
        construtor.subir_versao(arquivo)
