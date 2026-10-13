"""
"Acha produto": pesquisas salvas no Facebook Marketplace e a lista do que foi encontrado.

Fica só neste PC, em %APPDATA%\\ERP AutoPost\\acha-produto.json:
  pesquisas: termo, cidade (com o código que o Facebook usa para ela), raio, preço mínimo/máximo, palavras que
             tiram o anúncio da lista e se está ativa;
  itens:     um por anúncio do Facebook (pelo número do anúncio), com o estado que a pessoa dá: novo, visto,
             favorito ou descartado. O preço novo menor que o anterior marca "baixou"; o anúncio que não aparece
             mais em nenhuma busca marca "sumiu";
  auto:      busca automática a cada N horas enquanto o AutoPost estiver aberto.
"""
import copy
import json
import re
import threading
import time
import unicodedata
import uuid
from datetime import datetime, timedelta

from config import PASTA

ARQUIVO = PASTA / "acha-produto.json"
ESTADOS = ("novo", "visto", "favorito", "descartado")
PADRAO = {"pesquisas": [], "itens": {}, "auto": {"ligado": True, "horas": 3, "ultima_rodada": None}}
ESPERA_ENTRE_PESQUISAS = (40, 120)   # segundos, sorteado: buscar em ritmo de pessoa
RAIOS_KM = (1, 2, 5, 10, 20, 40, 60, 80, 100, 250, 500)   # os do Facebook

_trava = threading.RLock()


def normalizar(texto) -> str:
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto).strip().lower()


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def carregar() -> dict:
    with _trava:
        try:
            dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            dados = {}
        base = copy.deepcopy(PADRAO)
        base["pesquisas"] = dados.get("pesquisas") or []
        base["itens"] = dados.get("itens") or {}
        base["auto"].update(dados.get("auto") or {})
        return base


def salvar(dados: dict):
    with _trava:
        PASTA.mkdir(parents=True, exist_ok=True)
        temporario = ARQUIVO.with_suffix(".tmp")
        temporario.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
        temporario.replace(ARQUIVO)


def _numero(valor):
    if valor in (None, ""):
        return None
    try:
        return max(0, int(float(str(valor).replace(".", "").replace(",", "."))))
    except ValueError:
        raise ValueError(f"Valor inválido: {valor}")


def montar_pesquisa(dados: dict, antiga: dict | None = None) -> dict:
    """Confere e normaliza o que veio da tela."""
    termo = re.sub(r"\s+", " ", str(dados.get("termo") or "")).strip()
    if len(termo) < 2:
        raise ValueError("Digite o que procurar (ex.: ps4).")
    cidade = re.sub(r"\s+", " ", str(dados.get("cidade") or "")).strip()
    raio = int(dados.get("raio_km") or 10)
    raio = min(RAIOS_KM, key=lambda r: abs(r - raio))
    preco_min, preco_max = _numero(dados.get("preco_min")), _numero(dados.get("preco_max"))
    if preco_min is not None and preco_max is not None and preco_min > preco_max:
        raise ValueError("O preço mínimo está maior que o máximo.")
    excluir = [p.strip() for p in re.split(r"[,;\n]", str(dados.get("excluir") or "")) if p.strip()]
    p = dict(antiga or {"id": uuid.uuid4().hex[:10], "criada_em": agora(), "ultima_busca": None,
                        "ultimo_resultado": None, "cidade_id": None, "cidade_rotulo": None})
    if normalizar(cidade) != normalizar((antiga or {}).get("cidade")):
        p["cidade_id"] = p["cidade_rotulo"] = None   # cidade nova: o código dela é descoberto na próxima busca
    p.update({"termo": termo, "cidade": cidade, "raio_km": raio, "preco_min": preco_min, "preco_max": preco_max,
              "excluir": excluir, "ativa": bool(dados.get("ativa", True)),
              "ignorar_gratis": bool(dados.get("ignorar_gratis", True))})
    return p


def reaproveitar_cidade(dados: dict, pesquisa: dict):
    """Mesma cidade de outra pesquisa: usa o código já descoberto (menos cliques na caixa de localização do Facebook).
    E, se esta já tem o código, passa para as outras da mesma cidade que ainda não têm."""
    nome = normalizar(pesquisa.get("cidade"))
    if not nome:
        return
    for outra in dados["pesquisas"]:
        if outra is pesquisa or normalizar(outra.get("cidade")) != nome:
            continue
        if outra.get("cidade_id") and not pesquisa.get("cidade_id"):
            pesquisa["cidade_id"], pesquisa["cidade_rotulo"] = outra["cidade_id"], outra.get("cidade_rotulo")
        elif pesquisa.get("cidade_id") and not outra.get("cidade_id"):
            outra["cidade_id"], outra["cidade_rotulo"] = pesquisa["cidade_id"], pesquisa.get("cidade_rotulo")


def passa_no_filtro(item: dict, pesquisa: dict) -> bool:
    """O Facebook já filtra preço, mas confere de novo; tira os "Gratuito" (quase sempre troca ou "compro") e os que
    têm palavra proibida no título."""
    preco = item.get("preco")
    if preco == 0 and pesquisa.get("ignorar_gratis", True):
        return False
    if preco is not None:
        if pesquisa.get("preco_min") is not None and preco < pesquisa["preco_min"]:
            return False
        if pesquisa.get("preco_max") is not None and preco > pesquisa["preco_max"]:
            return False
    titulo = normalizar(item.get("titulo"))
    return not any(normalizar(p) and normalizar(p) in titulo for p in pesquisa.get("excluir") or [])


def aplicar_resultado(dados: dict, pesquisa: dict, lidos: list) -> dict:
    """Junta o que a busca achou com a lista. Devolve {novos, atualizados, baixaram, filtrados, sumiram}."""
    resumo = {"novos": 0, "atualizados": 0, "baixaram": 0, "filtrados": 0, "sumiram": 0}
    itens = dados["itens"]
    vistos_agora = set()
    momento = agora()
    for lido in lidos:
        if not passa_no_filtro(lido, pesquisa):
            resumo["filtrados"] += 1
            continue
        chave = str(lido["id"])
        vistos_agora.add(chave)
        atual = itens.get(chave)
        if atual is None:
            itens[chave] = {**lido, "pesquisas": [pesquisa["id"]], "estado": "novo", "achado_em": momento,
                            "visto_em": momento, "preco_baixou": False, "sumiu": False, "historico": []}
            resumo["novos"] += 1
            continue
        if pesquisa["id"] not in atual["pesquisas"]:
            atual["pesquisas"].append(pesquisa["id"])
        preco_antes = atual.get("preco")
        if lido.get("preco") is not None and preco_antes is not None and lido["preco"] < preco_antes:
            atual["preco_baixou"] = True
            atual["historico"] = (atual.get("historico") or [])[-9:] + [{"em": momento, "de": preco_antes, "para": lido["preco"]}]
            if atual.get("estado") == "visto":
                atual["estado"] = "novo"   # baixou o preço: volta a chamar atenção
            resumo["baixaram"] += 1
        for campo in ("titulo", "preco", "preco_antigo", "cidade", "imagem", "link"):
            if lido.get(campo) not in (None, ""):
                atual[campo] = lido[campo]
        atual["visto_em"] = momento
        atual["sumiu"] = False
        resumo["atualizados"] += 1
    # o que era desta pesquisa e não apareceu agora: sumiu (vendido ou tirado do ar)
    for chave, item in itens.items():
        if pesquisa["id"] in item.get("pesquisas", []) and chave not in vistos_agora and not item.get("sumiu"):
            item["sumiu"] = True
            resumo["sumiram"] += 1
    pesquisa["ultima_busca"] = momento
    pesquisa["ultimo_resultado"] = {**resumo, "lidos": len(lidos), "erro": None}
    return resumo


def remover_pesquisa(dados: dict, pesquisa_id: str):
    dados["pesquisas"] = [p for p in dados["pesquisas"] if p["id"] != pesquisa_id]
    for chave in list(dados["itens"]):
        item = dados["itens"][chave]
        item["pesquisas"] = [p for p in item.get("pesquisas", []) if p != pesquisa_id]
        if not item["pesquisas"] and item.get("estado") != "favorito":
            del dados["itens"][chave]


def proxima_rodada(dados: dict):
    auto = dados["auto"]
    if not auto.get("ligado") or not any(p.get("ativa") for p in dados["pesquisas"]):
        return None
    if not auto.get("ultima_rodada"):
        return datetime.now()
    return datetime.fromisoformat(auto["ultima_rodada"]) + timedelta(hours=float(auto.get("horas") or 3))


class Agendador:
    """Roda as pesquisas ativas sozinho a cada N horas enquanto o app está aberto (e o robô está livre)."""

    def __init__(self, obter_executor):
        self._obter_executor = obter_executor
        self._parar = threading.Event()
        self._thread = threading.Thread(target=self._laco, daemon=True)
        self._thread.start()

    def _laco(self):
        time.sleep(90)   # dá tempo do login e da tela abrirem
        while not self._parar.is_set():
            try:
                executor = self._obter_executor()
                quando = proxima_rodada(carregar())
                if executor and quando and datetime.now() >= quando and not executor.ocupado():
                    executor.achar(None, automatico=True)
            except Exception:
                pass
            self._parar.wait(60)

    def parar(self):
        self._parar.set()
