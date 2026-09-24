"""Login, permissões dos grupos na API e regras de dono do produto."""
from jose import jwt

from conftest import sql


def test_token_assinado_com_a_chave_antiga_e_recusado(cliente_api, admin):
    forjado = jwt.encode({"sub": admin["email"]}, "chave_secreta_temporaria", algorithm="HS256")
    assert cliente_api.get("/api/usuarios/me", headers={"Authorization": f"Bearer {forjado}"}).status_code == 401
    assert cliente_api.get("/api/usuarios/me", headers=admin["headers"]).status_code == 200


def test_backend_recusa_subir_sem_chave_segura():
    import importlib
    import os
    import pytest
    import config
    original = os.environ["SECRET_KEY"]
    try:
        for ruim in ("chave_secreta_temporaria", "curta"):
            os.environ["SECRET_KEY"] = ruim
            with pytest.raises(RuntimeError):
                importlib.reload(config)
    finally:
        os.environ["SECRET_KEY"] = original
        importlib.reload(config)


def test_vendedor_nao_se_coloca_em_outro_grupo(cliente_api, vendedor, admin):
    grupo_admin = sql("SELECT id FROM grupo_usuario WHERE nome='Administrador'")[0]["id"]
    grupo_atual = sql("SELECT grupo_id FROM usuarios WHERE id=%s", (vendedor["id"],))[0]["grupo_id"]
    url = f"/api/usuarios/{vendedor['id']}"
    assert cliente_api.put(url, json={"grupo_id": grupo_admin}, headers=vendedor["headers"]).status_code == 403
    assert cliente_api.put(url, json={"grupo_id": grupo_atual, "nome": "Teste Vendedor"}, headers=vendedor["headers"]).status_code == 200
    assert sql("SELECT grupo_id FROM usuarios WHERE id=%s", (vendedor["id"],))[0]["grupo_id"] == grupo_atual


def test_permissoes_do_grupo_valem_na_api(cliente_api, vendedor):
    h = vendedor["headers"]
    assert cliente_api.get("/api/produtos/", headers=h).status_code == 200            # lista compartilhada
    assert cliente_api.get("/api/vendas/", headers=h).status_code == 200              # tem vendas_visualizar
    assert cliente_api.post("/api/vendas/", json={}, headers=h).status_code == 403    # sem vendas_editar
    assert cliente_api.post("/api/contas-receber/", json={}, headers=h).status_code == 403
    assert cliente_api.post("/api/depositos/", json={"nome": "X"}, headers=h).status_code == 403
    assert cliente_api.get("/api/controle-financeiro/lancamentos", headers=h).status_code == 403
    assert cliente_api.post("/api/vendas/", json={}).status_code == 401


def test_admin_passa_em_tudo(cliente_api, admin):
    for rota in ("/api/vendas/", "/api/contas-pagar/", "/api/dashboard/", "/api/controle-financeiro/lancamentos"):
        assert cliente_api.get(rota, headers=admin["headers"]).status_code == 200, rota


def test_so_o_dono_movimenta_estoque_e_troca_deposito(cliente_api, vendedor, novo_produto):
    produto = novo_produto()  # dono: admin
    r = cliente_api.post("/api/estoque/movimentacoes", json={"produto_id": produto["id"], "tipo": "entrada", "quantidade": 1}, headers=vendedor["headers"])
    assert r.status_code == 403
    outro = sql("INSERT INTO depositos (nome) VALUES ('Depósito B de teste')")
    assert cliente_api.put(f"/api/produtos/{produto['id']}", json={"deposito_id": outro}, headers=vendedor["headers"]).status_code == 403


def test_nome_com_html_e_guardado_como_texto(cliente_api, novo_produto, admin):
    produto = novo_produto(estoque=0)
    malicioso = '<img src=x onerror="alert(1)">'
    r = cliente_api.put(f"/api/produtos/{produto['id']}", json={"nome": malicioso}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["nome"] == malicioso  # a proteção é no frontend (escapeHtml)


def test_token_se_renova_para_quem_esta_ativo(cliente_api, admin):
    from jose import jwt as _jwt
    antigo = admin["headers"]["Authorization"].split()[1]
    r = cliente_api.post("/token/renovar", headers=admin["headers"])
    assert r.status_code == 200
    novo = r.json()["access_token"]
    exp = lambda t: _jwt.get_unverified_claims(t)["exp"]
    assert exp(novo) >= exp(antigo)
    assert cliente_api.get("/api/usuarios/me", headers={"Authorization": f"Bearer {novo}"}).status_code == 200


def test_quem_foi_desconectado_por_inatividade_nao_renova(cliente_api, grupo_vendedores):
    from conftest import _criar_usuario
    usuario = _criar_usuario(cliente_api, "Teste Inativo", "usuario", grupo_vendedores)
    sql("UPDATE usuarios SET connected=0 WHERE id=%s", (usuario["id"],))  # o que o timeout_manager faz
    assert cliente_api.post("/token/renovar", headers=usuario["headers"]).status_code == 401


def test_login_bloqueia_depois_de_5_senhas_erradas(cliente_api, grupo_vendedores):
    import limite_login
    from conftest import _criar_usuario
    limite_login.limpar()
    try:
        usuario = _criar_usuario(cliente_api, "Teste Forca Bruta", "usuario", grupo_vendedores)
        errada = {"username": usuario["email"], "password": "senha-errada"}
        for _ in range(5):
            assert cliente_api.post("/token", data=errada).status_code == 401
        r = cliente_api.post("/token", data=errada)
        assert r.status_code == 429 and "minuto" in r.json()["detail"] and int(r.headers["retry-after"]) > 0
        # bloqueado vale até para a senha certa; outro e-mail do mesmo IP continua entrando
        assert cliente_api.post("/token", data={"username": usuario["email"], "password": "x"}).status_code == 429
        outro = _criar_usuario(cliente_api, "Teste Outro Email", "usuario", grupo_vendedores)
        assert cliente_api.post("/token/renovar", headers=outro["headers"]).status_code == 200
    finally:
        limite_login.limpar()


def test_login_certo_zera_as_falhas(cliente_api, grupo_vendedores):
    import limite_login
    from conftest import _criar_usuario
    limite_login.limpar()
    try:
        usuario = _criar_usuario(cliente_api, "Teste Erra Pouco", "usuario", grupo_vendedores)
        for _ in range(4):
            cliente_api.post("/token", data={"username": usuario["email"], "password": "errada"})
        limite_login.registrar_sucesso("testclient", usuario["email"])
        for _ in range(4):
            assert cliente_api.post("/token", data={"username": usuario["email"], "password": "errada"}).status_code == 401
    finally:
        limite_login.limpar()


def test_saude_do_sistema_e_alerta_so_para_admin(cliente_api, admin, vendedor):
    assert cliente_api.get("/api/configuracoes/saude-sistema", headers=vendedor["headers"]).status_code == 403
    assert cliente_api.post("/api/configuracoes/testar-alerta", headers=vendedor["headers"]).status_code == 403
    disco = cliente_api.get("/api/configuracoes/saude-sistema", headers=admin["headers"]).json()["disco"]
    assert 0 < disco["usado_pct"] <= 100 and disco["alerta"] == (disco["usado_pct"] >= disco["limite_pct"])
    sql("DELETE FROM configuracoes WHERE chave='alerta_telefones'")
    r = cliente_api.post("/api/configuracoes/testar-alerta", headers=admin["headers"])
    assert r.status_code == 400 and "telefone" in r.json()["detail"]


def test_vendas_recentes_da_home(cliente_api, vendedor, admin):
    r = cliente_api.get("/api/vendas/recentes?limite=3", headers=vendedor["headers"])  # vendedor tem vendas_visualizar
    assert r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) <= 3
    for venda in r.json():
        assert {"codigo", "cliente_nome", "valor_total", "status", "produtos_vendidos", "quantidade_total"} <= venda.keys()
    assert cliente_api.get("/api/vendas/recentes").status_code == 401
