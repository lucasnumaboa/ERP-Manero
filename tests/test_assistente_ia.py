"""Assistente de produtos (widget de chat): ferramentas no banco, laço de function calling e conversa geral."""
import asyncio
import json

import pytest

from conftest import sql


# ---------- ferramentas (backend/ferramentas_ia.py) ----------

def test_buscar_produtos_acha_com_e_sem_espaco_e_informa_estoque(novo_produto):
    from ferramentas_ia import ExecutorFerramentas
    com = novo_produto(estoque=3, nome="Placa de video RX 580 8gb TesteIA")
    sem = novo_produto(estoque=0, nome="Placa de video RX580 4gb TesteIA")
    ex = ExecutorFerramentas()

    r = ex.executar("buscar_produtos", {"termo": "rx580 testeia"})
    ids = [p["id"] for p in r["produtos"]]
    assert com["id"] in ids and sem["id"] in ids
    assert ids.index(com["id"]) < ids.index(sem["id"])          # com estoque primeiro
    assert r["com_estoque"] >= 1 and "preco_custo" not in r["produtos"][0]

    r = ex.executar("buscar_produtos", {"termo": "rx 580 testeia", "somente_com_estoque": True})
    assert [p["id"] for p in r["produtos"]] == [com["id"]]
    assert set(ex.produtos_citados) >= {com["id"], sem["id"]}


def test_detalhes_categorias_e_argumentos_estranhos(novo_produto):
    from ferramentas_ia import ExecutorFerramentas
    p = novo_produto(estoque=2, nome="Produto Detalhe TesteIA")
    sql("UPDATE produtos SET instrucoes_duvidas='Garantia de 90 dias' WHERE id=%s", (p["id"],))
    ex = ExecutorFerramentas()
    d = ex.executar("detalhes_produto", {"produto_id": p["id"], "palavras": "x"})   # argumento inventado é ignorado
    assert d["instrucoes_e_duvidas"] == "Garantia de 90 dias" and d["estoque_atual"] == 2
    assert ex.executar("detalhes_produto", {"produto_id": 999999999}) == {"erro": "produto não encontrado"}
    assert "categorias" in ex.executar("listar_categorias", {})
    assert "erro" in ex.executar("apagar_tudo", {})
    assert "erro" in ex.executar("buscar_produtos", {"termo": " "})


# ---------- laço de function calling (routers/ia.py) ----------

class _Resposta:
    def __init__(self, dados):
        self.status_code, self._dados, self.text = 200, dados, json.dumps(dados)

    def json(self):
        return self._dados


def test_laco_executa_ferramenta_e_devolve_resultado_ao_modelo(monkeypatch):
    from routers import ia
    enviados = []
    roteiro = [
        {"choices": [{"message": {"content": None, "tool_calls": [
            {"id": "c1", "type": "function", "function": {"name": "buscar_produtos", "arguments": '{"termo": "rx580"}'}}]}}]},
        {"choices": [{"message": {"content": "Não tem RX580 em estoque."}}]},
    ]

    class Cliente:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, content=None):
            enviados.append(json.loads(content))
            return _Resposta(roteiro[len(enviados) - 1])

    monkeypatch.setattr(ia.httpx, "AsyncClient", Cliente)
    monkeypatch.setattr(ia, "_configuracoes", lambda chaves: {"ia_provider": "openrouter", "apikey_openrouter": "x", "model_openrouter": "m"})
    chamadas = []
    texto = asyncio.run(ia.conversar_com_ferramentas(
        [{"role": "user", "content": "tem rx580?"}], [{"type": "function", "function": {"name": "buscar_produtos"}}],
        lambda nome, args: chamadas.append((nome, args)) or {"encontrados": 0}))

    assert texto == "Não tem RX580 em estoque."
    assert chamadas == [("buscar_produtos", {"termo": "rx580"})]
    segunda = enviados[1]["messages"]
    assert segunda[-2]["tool_calls"][0]["id"] == "c1"
    assert segunda[-1] == {"role": "tool", "content": '{"encontrados": 0}', "tool_call_id": "c1"}


def test_laco_para_de_oferecer_ferramenta_na_ultima_rodada(monkeypatch):
    from routers import ia
    enviados = []
    pede_sempre = {"choices": [{"message": {"content": "", "tool_calls": [
        {"id": "c", "type": "function", "function": {"name": "listar_categorias", "arguments": "{}"}}]}}]}

    class Cliente:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, content=None):
            corpo = json.loads(content)
            enviados.append(corpo)
            return _Resposta(pede_sempre if "tools" in corpo else {"choices": [{"message": {"content": "fim"}}]})

    monkeypatch.setattr(ia.httpx, "AsyncClient", Cliente)
    monkeypatch.setattr(ia, "_configuracoes", lambda chaves: {"ia_provider": "lmstudio"})
    assert asyncio.run(ia.conversar_com_ferramentas([{"role": "user", "content": "?"}], [], lambda n, a: {})) == "fim"
    assert len(enviados) == ia.MAX_RODADAS_FERRAMENTAS + 1 and "tools" not in enviados[-1]


# ---------- rotas do chat (conversa geral e por produto) ----------

@pytest.fixture
def ia_de_mentira(monkeypatch):
    import routers.produto_chat_ia as chat
    recebidas = []

    async def falsa(mensagens, ferramentas, executar, max_tokens=2000, **kwargs):
        recebidas.append(mensagens)
        executar("buscar_produtos", {"termo": "testeia"})
        return f"resposta {len(recebidas)}"

    monkeypatch.setattr(chat, "conversar_com_ferramentas", falsa)
    return recebidas


def test_conversa_geral_sem_produto(cliente_api, vendedor, novo_produto, ia_de_mentira):
    novo_produto(estoque=1, nome="Item Conversa TesteIA")
    h = vendedor["headers"]
    assert cliente_api.delete("/api/produto-chat/geral/mensagens", headers=h).status_code == 200
    r = cliente_api.post("/api/produto-chat/geral/enviar", json={"conteudo": "tem item testeia?"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["conteudo"] == "resposta 1" and r.json()["produtos"]            # atalhos dos produtos consultados
    assert "PRODUTO ESCOLHIDO" not in ia_de_mentira[0][0]["content"]
    msgs = cliente_api.get("/api/produto-chat/geral/mensagens", headers=h).json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert sql("SELECT COUNT(*) n FROM chat_produto_mensagens WHERE produto_id IS NULL AND usuario_id=%s",
               (vendedor["id"],))[0]["n"] == 2
    assert cliente_api.post("/api/produto-chat/geral/enviar", json={"conteudo": "   "}, headers=h).status_code == 400
    assert cliente_api.post("/api/produto-chat/geral/enviar", json={"conteudo": "x"}).status_code == 401


def test_conversa_do_produto_leva_os_dados_e_so_as_ultimas_mensagens(cliente_api, vendedor, novo_produto, ia_de_mentira):
    p = novo_produto(estoque=4, nome="Produto Contexto TesteIA")
    h = vendedor["headers"]
    for i in range(25):   # conversa longa já existente
        sql("INSERT INTO chat_produto_mensagens (produto_id, usuario_id, role, conteudo) VALUES (%s,%s,%s,%s)",
            (p["id"], vendedor["id"], "user" if i % 2 == 0 else "assistant", f"antiga {i}"))
    r = cliente_api.post(f"/api/produto-chat/{p['id']}/enviar", json={"conteudo": "pergunta nova"}, headers=h)
    assert r.status_code == 200
    enviadas = ia_de_mentira[-1]
    assert "Produto Contexto TesteIA" in enviadas[0]["content"]
    assert enviadas[-1]["content"] == "pergunta nova"          # a pergunta nova chega na IA (antes ficava de fora)
    assert len(enviadas) == 1 + 20
    # a conversa do produto não se mistura com a geral
    assert all(m["conteudo"] != "pergunta nova" for m in cliente_api.get("/api/produto-chat/geral/mensagens", headers=h).json())
    assert cliente_api.post("/api/produto-chat/999999999/enviar", json={"conteudo": "oi"}, headers=h).status_code == 404


# ---------- relatório "pedem e não tem" (chat_buscas + /api/relatorios/demanda) ----------

def test_buscas_do_assistente_viram_relatorio_de_demanda(cliente_api, admin, vendedor, novo_produto):
    from ferramentas_ia import ExecutorFerramentas
    novo_produto(estoque=0, nome="Placa Demanda ZQX580 sem estoque")
    novo_produto(estoque=2, nome="Fonte Demanda ZQW500 com estoque")
    sql("DELETE FROM chat_buscas")

    # pergunta 1: a IA buscou duas vezes (escritas diferentes), nada em estoque -> conta 1 vez
    ex = ExecutorFerramentas(usuario_id=vendedor["id"], mensagem_id=900001, pergunta="tem a placa zqx580?")
    ex.executar("buscar_produtos", {"termo": "zqx580"})
    ex.executar("buscar_produtos", {"termo": "zqx 580", "somente_com_estoque": True})
    # pergunta 2: outra pessoa, mesma coisa com espaço -> soma no mesmo item
    ExecutorFerramentas(usuario_id=admin["id"], mensagem_id=900002, pergunta="ZQX 580 chegou?").executar(
        "buscar_produtos", {"termo": "ZQX 580"})
    # pergunta 3: nem existe no cadastro
    ExecutorFerramentas(usuario_id=vendedor["id"], mensagem_id=900003, pergunta="tem hoverboard?").executar(
        "buscar_produtos", {"termo": "hoverboardzz"})
    # pergunta 4: tinha em estoque -> atendida, não entra na lista
    ExecutorFerramentas(usuario_id=vendedor["id"], mensagem_id=900004, pergunta="tem fonte zqw500?").executar(
        "buscar_produtos", {"termo": "zqw500"})
    # sem usuário (uso interno) não registra nada
    ExecutorFerramentas().executar("buscar_produtos", {"termo": "zqx580"})

    linhas = sql("SELECT termo, encontrados, com_estoque FROM chat_buscas ORDER BY id")
    assert len(linhas) == 5
    assert linhas[1]["encontrados"] == 1 and linhas[1]["com_estoque"] == 0   # busca "só com estoque" ainda sabe que existe

    r = cliente_api.get("/api/relatorios/demanda", headers=admin["headers"])
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["resumo"] == {"perguntas": 4, "atendidas": 1, "sem_estoque": 2, "nao_cadastrado": 1}
    placa, hover = dados["itens"]
    assert placa["vezes"] == 2 and placa["situacao"] == "sem_estoque"
    assert placa["produtos"][0]["nome"] == "Placa Demanda ZQX580 sem estoque"
    assert set(placa["vendedores"]) == {"Teste Vendedor", "Teste Admin"}
    assert placa["exemplos"][0] == "tem a placa zqx580?"
    assert hover["situacao"] == "nao_cadastrado" and hover["produtos"] == []

    # fora do período: vazio
    vazio = cliente_api.get("/api/relatorios/demanda?data_inicio=2020-01-01&data_fim=2020-01-31", headers=admin["headers"]).json()
    assert vazio["resumo"]["perguntas"] == 0 and vazio["itens"] == []
    assert cliente_api.get("/api/relatorios/demanda").status_code == 401


def test_pergunta_no_chat_registra_as_buscas_com_a_pergunta(cliente_api, vendedor, novo_produto, monkeypatch):
    import routers.produto_chat_ia as chat
    novo_produto(estoque=0, nome="Item Registro TesteIA")

    async def falsa(mensagens, ferramentas, executar, max_tokens=2000, **kwargs):
        executar("buscar_produtos", {"termo": "registro testeia"})
        return "ok"

    monkeypatch.setattr(chat, "conversar_com_ferramentas", falsa)
    r = cliente_api.post("/api/produto-chat/geral/enviar", json={"conteudo": "tem item registro?"}, headers=vendedor["headers"])
    assert r.status_code == 200
    busca = sql("SELECT * FROM chat_buscas ORDER BY id DESC LIMIT 1")[0]
    pergunta = sql("SELECT id FROM chat_produto_mensagens WHERE usuario_id=%s AND role='user' ORDER BY id DESC LIMIT 1", (vendedor["id"],))[0]
    assert busca["mensagem_id"] == pergunta["id"] and busca["pergunta"] == "tem item registro?"
    assert busca["usuario_id"] == vendedor["id"] and busca["encontrados"] >= 1


def test_resposta_de_memoria_sobre_estoque_obriga_a_consultar(monkeypatch):
    """A IA disse "não encontrei PS5" sem buscar (e havia PS5 cadastrado): a rodada é refeita exigindo consulta."""
    import re
    from routers import ia
    enviados = []

    def resposta(corpo):
        if corpo.get("tool_choice") == "required":
            return {"choices": [{"message": {"content": "", "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "buscar_produtos", "arguments": '{"termo": "ps5"}'}}]}}]}
        if any(m.get("role") == "tool" for m in corpo["messages"]):
            return {"choices": [{"message": {"content": "Tem PS5 cadastrado, sem estoque."}}]}
        return {"choices": [{"message": {"content": "Não encontrei PS5 no sistema."}}]}

    class Cliente:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, content=None):
            corpo = json.loads(content)
            enviados.append(corpo)
            return _Resposta(resposta(corpo))

    monkeypatch.setattr(ia.httpx, "AsyncClient", Cliente)
    monkeypatch.setattr(ia, "_configuracoes", lambda chaves: {"ia_provider": "openrouter", "apikey_openrouter": "x"})
    regra = re.compile(r"n[ãa]o encontrei", re.I).search
    ferramentas = [{"type": "function", "function": {"name": "buscar_produtos"}}]
    texto = asyncio.run(ia.conversar_com_ferramentas([{"role": "user", "content": "tem ps5?"}], ferramentas,
                                                     lambda n, a: {"encontrados": 1}, precisa_consultar=regra))
    assert texto == "Tem PS5 cadastrado, sem estoque."
    assert [c.get("tool_choice") for c in enviados] == [None, "required", None]

    # conversa sem afirmação sobre estoque ("bom dia") não é forçada a consultar
    enviados.clear()
    monkeypatch.setattr(ia.httpx, "AsyncClient", Cliente)
    resposta = lambda corpo: {"choices": [{"message": {"content": "Bom dia! Como posso ajudar?"}}]}  # noqa: F811
    assert asyncio.run(ia.conversar_com_ferramentas([{"role": "user", "content": "bom dia"}], ferramentas,
                                                    lambda n, a: {}, precisa_consultar=regra)) == "Bom dia! Como posso ajudar?"
    assert len(enviados) == 1


def test_busca_mais_ampla_e_alternativa_nao_prova_que_existe(cliente_api, admin, vendedor, novo_produto):
    """Pediram PS4, a IA tentou "ps4" (nada) e depois "console" (achou outros): PS4 continua "não cadastrado"."""
    from ferramentas_ia import ExecutorFerramentas
    novo_produto(estoque=0, nome="Console Alternativa QQV")
    sql("DELETE FROM chat_buscas")
    ex = ExecutorFerramentas(usuario_id=vendedor["id"], mensagem_id=910001, pergunta="tem ps4 qqv?")
    ex.executar("buscar_produtos", {"termo": "ps4qqv"})
    ex.executar("buscar_produtos", {"termo": "console alternativa qqv"})
    item = cliente_api.get("/api/relatorios/demanda", headers=admin["headers"]).json()["itens"][0]
    assert item["procurado"] == "ps4qqv" and item["situacao"] == "nao_cadastrado"
    assert item["produtos"] == [] and item["alternativas"][0]["nome"] == "Console Alternativa QQV"

    # já uma nova tentativa com o mesmo item escrito de outro jeito conta como cadastrado
    novo_produto(estoque=0, nome="Placa QQK580")
    sql("DELETE FROM chat_buscas")
    ex = ExecutorFerramentas(usuario_id=vendedor["id"], mensagem_id=910002, pergunta="tem qqk580 8gb branca?")
    ex.executar("buscar_produtos", {"termo": "qqk580 8gb branca"})
    ex.executar("buscar_produtos", {"termo": "qqk580"})
    item = cliente_api.get("/api/relatorios/demanda", headers=admin["headers"]).json()["itens"][0]
    assert item["situacao"] == "sem_estoque" and item["produtos"][0]["nome"] == "Placa QQK580"
