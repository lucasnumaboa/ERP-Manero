"""
Botão "Atualizar" (Configurações): scripts/atualizar.py com um "GitHub" de mentira (repositório git local) e a
rota /api/atualizacao. Nada aqui reinicia o backend nem mexe no C:\\ERP.
"""
import importlib.util
import json
import os
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent


def _carregar():
    spec = importlib.util.spec_from_file_location("atualizar_teste", RAIZ / "scripts" / "atualizar.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


atualizar = _carregar()


def git(pasta, *args):
    r = subprocess.run(["git", "-c", "user.name=Teste", "-c", "user.email=teste@teste.local", "-c", "core.autocrlf=false",
                        *args], cwd=pasta, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def escrever(pasta, caminho, texto):
    arquivo = Path(pasta) / caminho
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(texto, encoding="utf-8", newline="")


def commit(pasta, mensagem, **arquivos):
    for caminho, texto in arquivos.items():
        escrever(pasta, caminho.replace("__", "/"), texto)
    git(pasta, "add", "-A")
    git(pasta, "commit", "-q", "-m", mensagem)
    git(pasta, "push", "-q", "origin", "HEAD:main")


@pytest.fixture
def cenario(tmp_path, monkeypatch):
    """GitHub de mentira (repositório vazio), um PC do desenvolvedor que envia e um PC instalado (clone)."""
    monkeypatch.delenv("ERP_REPO_URL", raising=False)
    monkeypatch.delenv("ERP_BRANCH", raising=False)
    github = tmp_path / "github.git"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(github))
    dev = tmp_path / "dev"
    git(tmp_path, "clone", "-q", str(github), str(dev))
    commit(dev, "primeira versão", **{
        "frontend__js__config.js": "const ERP_API_URL_PADRAO = 'https://erp-api.exemplo';\n",
        "frontend__index.html": '<script src="js/config.js"></script>\n',
        "requirements.txt": "fastapi\n",
        "app.txt": "v1\n",
    })
    pc = tmp_path / "pc"
    git(tmp_path, "clone", "-q", str(github), str(pc))
    return {"github": github, "dev": dev, "pc": pc, "tmp": tmp_path}


def test_verifica_e_atualiza_mantendo_o_endereco_da_api(cenario):
    pc, dev = cenario["pc"], cenario["dev"]
    # o PC reescreveu o endereço da API e o ?v= do HTML (change_api_link / versionar_frontend): não impede
    escrever(pc, "frontend/js/config.js", "const ERP_API_URL_PADRAO = 'https://api.do-pc';\n")
    escrever(pc, "frontend/index.html", '<script src="js/config.js?v=abc"></script>\n')
    commit(dev, "tabela nova", **{"app.txt": "v2\n", "requirements.txt": "fastapi\nhttpx\n"})

    v = atualizar.verificar(pc)
    assert not v["atualizado"] and v["impedimentos"] == [] and v["historico_conhecido"]
    assert [n["mensagem"] for n in v["novidades"]] == ["tabela nova"]
    assert v["disponivel"]["mensagem"] == "tabela nova" and v["instalada"]["mensagem"] == "primeira versão"

    r = atualizar.atualizar_codigo(pc, log=lambda *_: None)
    assert r["mudou"] and r["requirements_mudou"]
    assert (pc / "app.txt").read_text() == "v2\n"
    assert "https://api.do-pc" in (pc / "frontend/js/config.js").read_text()
    assert git(pc, "rev-parse", "HEAD") == git(dev, "rev-parse", "HEAD")
    assert json.loads((pc / "backend/versao.json").read_text(encoding="utf-8"))["mensagem"] == "tabela nova"

    assert atualizar.verificar(pc)["atualizado"]
    assert not atualizar.atualizar_codigo(pc, log=lambda *_: None)["mudou"]


def test_configuracoes_do_computador_nunca_sao_trocadas(cenario):
    """Mesmo se um .env for parar no GitHub por engano, o deste computador continua o mesmo."""
    pc, dev = cenario["pc"], cenario["dev"]
    escrever(pc, "backend/.env", "DB_PASSWORD=senha-do-pc\nSECRET_KEY=chave-do-pc\n")
    escrever(pc, "last_api_url.json", '{"url": "https://api.do-pc"}')
    escrever(pc, "frontend/uploads/produtos/foto.jpg", "foto")
    commit(dev, "enviou .env por engano", **{"backend__.env": "DB_PASSWORD=de-outro-pc\n", "app.txt": "v2\n"})

    atualizar.atualizar_codigo(pc, log=lambda *_: None)
    assert (pc / "app.txt").read_text() == "v2\n"
    assert (pc / "backend/.env").read_text() == "DB_PASSWORD=senha-do-pc\nSECRET_KEY=chave-do-pc\n"
    assert (pc / "last_api_url.json").read_text() == '{"url": "https://api.do-pc"}'
    assert (pc / "frontend/uploads/produtos/foto.jpg").read_text() == "foto"   # fora do git: fica


def test_nao_atualiza_com_commit_local_ou_arquivo_alterado(cenario):
    pc, dev = cenario["pc"], cenario["dev"]
    commit(dev, "versão nova", **{"app.txt": "v2\n"})

    escrever(pc, "app.txt", "mexido a mao\n")
    v = atualizar.verificar(pc)
    assert len(v["impedimentos"]) == 1 and "app.txt" in v["impedimentos"][0]
    with pytest.raises(atualizar.Cancelada):
        atualizar.atualizar_codigo(pc, log=lambda *_: None)
    assert (pc / "app.txt").read_text() == "mexido a mao\n"   # nada foi perdido

    git(pc, "add", "-A")
    git(pc, "-c", "user.name=PC", "-c", "user.email=pc@teste.local", "commit", "-q", "-m", "commit so do PC")
    v = atualizar.verificar(pc)
    assert any("1 commit(s)" in m for m in v["impedimentos"])
    with pytest.raises(atualizar.Cancelada):
        atualizar.atualizar_codigo(pc, log=lambda *_: None)
    assert git(pc, "log", "-1", "--format=%s") == "commit so do PC"


def test_pasta_sem_git_do_pacote_docker(cenario, monkeypatch):
    """O pacote Docker é uma cópia sem .git, com a tela apontando para http://localhost:8000."""
    dev, tmp = cenario["dev"], cenario["tmp"]
    copia = tmp / "docker"
    copia.mkdir()
    subprocess.run(f'git archive HEAD | tar -x -C "{copia.as_posix()}"', cwd=dev, shell=True, check=True)
    escrever(copia, "frontend/js/config.js", "const ERP_API_URL_PADRAO = 'http://localhost:8000';\n")
    escrever(copia, ".env", "SECRET_KEY=nao-pode-sumir\n")
    commit(dev, "versão nova", **{"app.txt": "v2\n"})
    monkeypatch.setenv("ERP_REPO_URL", str(cenario["github"]))

    v = atualizar.verificar(copia, checar_alteracoes=False)
    assert v["instalada"] is None and not v["atualizado"] and v["novidades"]
    r = atualizar.atualizar_codigo(copia, checar_alteracoes=False, log=lambda *_: None)
    assert r["mudou"] and r["de"] is None
    assert (copia / "app.txt").read_text() == "v2\n"
    assert "http://localhost:8000" in (copia / "frontend/js/config.js").read_text()
    assert (copia / ".env").read_text() == "SECRET_KEY=nao-pode-sumir\n"
    assert atualizar.verificar(copia, checar_alteracoes=False)["atualizado"]


def test_andamento_e_processo_em_execucao(tmp_path):
    andamento = atualizar.Andamento(tmp_path)
    andamento.log("passo 1")
    assert atualizar.em_andamento(tmp_path)   # este processo está vivo
    andamento.terminar(True, "pronto")
    estado = atualizar.ler_estado(tmp_path)
    assert not estado["rodando"] and estado["ok"] and estado["linhas"][-1].endswith("pronto")
    assert not atualizar.em_andamento(tmp_path)
    assert not atualizar.processo_vivo(999999)


# ---------- rota /api/atualizacao ----------
@pytest.fixture
def rota(cliente_api, tmp_path, monkeypatch):
    import routers.atualizacao as atualizacao
    monkeypatch.delenv("ERP_MODO", raising=False)
    monkeypatch.setattr(atualizacao, "RAIZ", tmp_path)
    (tmp_path / "log").mkdir()
    return atualizacao


def test_so_admin(cliente_api, vendedor, rota):
    for metodo, caminho in (("get", "/api/atualizacao/"), ("post", "/api/atualizacao/iniciar"), ("get", "/api/atualizacao/andamento")):
        assert getattr(cliente_api, metodo)(caminho, headers=vendedor["headers"]).status_code == 403


def test_local_verifica_inicia_e_acompanha(cliente_api, admin, rota, monkeypatch):
    chamados = []
    monkeypatch.setattr(rota, "_modulo_local", lambda: atualizar)
    monkeypatch.setattr(atualizar, "verificar", lambda raiz: {"atualizado": False, "novidades": [{"mensagem": "x"}]})
    monkeypatch.setattr(rota.subprocess, "Popen", lambda comando, **kw: chamados.append(comando))

    r = cliente_api.get("/api/atualizacao/", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["modo"] == "local" and r.json()["novidades"]

    assert cliente_api.post("/api/atualizacao/iniciar", headers=admin["headers"]).status_code == 202
    assert len(chamados) == 1 and chamados[0][-1].endswith("atualizar.py")
    assert cliente_api.post("/api/atualizacao/iniciar", headers=admin["headers"]).status_code == 409   # já rodando
    estado = cliente_api.get("/api/atualizacao/andamento", headers=admin["headers"]).json()
    assert estado["rodando"] and estado["linhas"]

    # processo que morreu sem gravar o fim não fica "rodando" para sempre
    (rota.RAIZ / "log" / "atualizacao.json").write_text(json.dumps({"rodando": True, "pid": 999999, "inicio": "2026-01-01T00:00:00"}))
    estado = cliente_api.get("/api/atualizacao/andamento", headers=admin["headers"]).json()
    assert not estado["rodando"] and estado["ok"] is False


def test_docker_repassa_para_o_atualizador(cliente_api, admin, rota, monkeypatch):
    pedidos = []

    async def falso(metodo, caminho):
        pedidos.append((metodo, caminho))
        return {"rodando": False} if caminho == "/andamento" else {"ok": True, "atualizado": True}

    monkeypatch.setenv("ERP_MODO", "docker")
    monkeypatch.setattr(rota, "_atualizador", falso)
    assert cliente_api.get("/api/atualizacao/", headers=admin["headers"]).json()["modo"] == "docker"
    assert cliente_api.post("/api/atualizacao/iniciar", headers=admin["headers"]).status_code == 202
    cliente_api.get("/api/atualizacao/andamento", headers=admin["headers"])
    assert pedidos == [("GET", "/verificar"), ("POST", "/iniciar"), ("GET", "/andamento")]


def test_atualizador_fora_do_ar_avisa(cliente_api, admin, rota, monkeypatch):
    monkeypatch.setenv("ERP_MODO", "docker")
    monkeypatch.setenv("ATUALIZADOR_URL", "http://127.0.0.1:9")
    r = cliente_api.get("/api/atualizacao/", headers=admin["headers"])
    assert r.status_code == 502 and "atualizador" in r.json()["detail"]
