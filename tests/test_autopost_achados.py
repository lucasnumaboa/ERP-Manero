"""AutoPost "Acha produto" (autopost/achados.py): pesquisas, junção dos resultados da busca e filtros.
O Facebook não é chamado: os resultados são montados aqui."""
import importlib
import sys
import types
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent


@pytest.fixture
def achados(tmp_path, monkeypatch):
    # config.py do app usa a DPAPI do Windows: aqui só precisa da pasta
    monkeypatch.setitem(sys.modules, "config", types.SimpleNamespace(PASTA=tmp_path))
    sys.path.insert(0, str(RAIZ / "autopost"))
    try:
        sys.modules.pop("achados", None)
        yield importlib.import_module("achados")
    finally:
        sys.path.remove(str(RAIZ / "autopost"))
        sys.modules.pop("achados", None)


def _lido(id_, titulo, preco, cidade="Salto, SP", antigo=None):
    return {"id": id_, "titulo": titulo, "preco": preco, "preco_antigo": antigo, "cidade": cidade,
            "imagem": "", "link": f"https://www.facebook.com/marketplace/item/{id_}/"}


def test_montar_pesquisa_valida_e_normaliza(achados):
    p = achados.montar_pesquisa({"termo": "  ps4 ", "cidade": "Salto", "raio_km": 12, "preco_max": "1.200",
                                 "excluir": "ps3, compro;troco"})
    assert p["termo"] == "ps4" and p["raio_km"] == 10 and p["preco_max"] == 1200 and p["preco_min"] is None
    assert p["excluir"] == ["ps3", "compro", "troco"] and p["ativa"] is True and p["cidade_id"] is None
    assert p["ignorar_gratis"] is True
    with pytest.raises(ValueError):
        achados.montar_pesquisa({"termo": "x"})
    with pytest.raises(ValueError):
        achados.montar_pesquisa({"termo": "ps4", "preco_min": 900, "preco_max": 100})
    # mudar a cidade apaga o código guardado; manter a mesma (com outra grafia) não
    p["cidade_id"] = "114974601846892"
    assert achados.montar_pesquisa({"termo": "ps4", "cidade": "salto"}, p)["cidade_id"] == "114974601846892"
    assert achados.montar_pesquisa({"termo": "ps4", "cidade": "Itu"}, p)["cidade_id"] is None


def test_novo_baixou_sumiu_e_filtros(achados):
    dados = achados.carregar()
    p = achados.montar_pesquisa({"termo": "ps4", "cidade": "Salto", "preco_max": 1200, "excluir": "compro"})
    dados["pesquisas"].append(p)
    r = achados.aplicar_resultado(dados, p, [_lido("1", "PS4 slim", 1000), _lido("2", "PS4 fat", 1100),
                                             _lido("3", "COMPRO PS4", 500), _lido("4", "PS4 pro", 1500),
                                             _lido("6", "PS4 troco", 0)])
    assert r["novos"] == 2 and r["filtrados"] == 3 and set(dados["itens"]) == {"1", "2"}
    q = achados.montar_pesquisa({"termo": "ps4", "ignorar_gratis": False})
    assert achados.passa_no_filtro(_lido("6", "PS4 troco", 0), q)
    assert dados["itens"]["1"]["estado"] == "novo" and p["ultimo_resultado"]["lidos"] == 5
    dados["itens"]["1"]["estado"] = "visto"
    dados["itens"]["2"]["estado"] = "favorito"
    # 2ª busca: o 1 baixou o preço, o 2 não veio (sumiu), o 5 é novo
    r = achados.aplicar_resultado(dados, p, [_lido("1", "PS4 slim", 900, antigo=1000), _lido("5", "PS4", 800)])
    assert r == {"novos": 1, "atualizados": 1, "baixaram": 1, "filtrados": 0, "sumiram": 1}
    um = dados["itens"]["1"]
    assert um["preco"] == 900 and um["preco_baixou"] and um["estado"] == "novo"   # baixou: volta a chamar atenção
    assert um["historico"][-1]["de"] == 1000 and um["historico"][-1]["para"] == 900
    assert dados["itens"]["2"]["sumiu"] and dados["itens"]["2"]["estado"] == "favorito"
    # voltou a aparecer: deixa de ser "sumiu"
    achados.aplicar_resultado(dados, p, [_lido("2", "PS4 fat", 1100)])
    assert not dados["itens"]["2"]["sumiu"]
    # salvar e carregar de volta
    achados.salvar(dados)
    assert set(achados.carregar()["itens"]) == {"1", "2", "5"}


def test_remover_pesquisa_mantem_favoritos_e_itens_de_outra(achados):
    dados = achados.carregar()
    a = achados.montar_pesquisa({"termo": "ps4"})
    b = achados.montar_pesquisa({"termo": "playstation"})
    dados["pesquisas"] += [a, b]
    achados.aplicar_resultado(dados, a, [_lido("1", "PS4", 1000), _lido("2", "PS4", 900), _lido("3", "PS4", 800)])
    achados.aplicar_resultado(dados, b, [_lido("3", "Playstation 4", 800)])
    dados["itens"]["2"]["estado"] = "favorito"
    achados.remover_pesquisa(dados, a["id"])
    assert [p["id"] for p in dados["pesquisas"]] == [b["id"]]
    assert set(dados["itens"]) == {"2", "3"}   # 1 saiu; 2 é favorito; 3 também é da outra pesquisa
    assert dados["itens"]["3"]["pesquisas"] == [b["id"]]


def test_proxima_rodada(achados):
    dados = achados.carregar()
    assert achados.proxima_rodada(dados) is None                 # sem pesquisa ativa
    dados["pesquisas"].append(achados.montar_pesquisa({"termo": "ps4"}))
    assert achados.proxima_rodada(dados) is not None              # nunca rodou: agora
    dados["auto"].update({"ultima_rodada": "2026-10-13T10:00:00", "horas": 3})
    assert achados.proxima_rodada(dados).isoformat() == "2026-10-13T13:00:00"
    dados["auto"]["ligado"] = False
    assert achados.proxima_rodada(dados) is None


def test_reaproveitar_cidade(achados):
    dados = achados.carregar()
    a = achados.montar_pesquisa({"termo": "ps4", "cidade": "Salto"})
    a.update({"cidade_id": "114974601846892", "cidade_rotulo": "Salto · No raio de 10 km"})
    b = achados.montar_pesquisa({"termo": "xbox", "cidade": "salto"})
    c = achados.montar_pesquisa({"termo": "switch", "cidade": "Itu"})
    dados["pesquisas"] += [a, b, c]
    achados.reaproveitar_cidade(dados, b)
    achados.reaproveitar_cidade(dados, c)
    assert b["cidade_id"] == "114974601846892" and c["cidade_id"] is None
