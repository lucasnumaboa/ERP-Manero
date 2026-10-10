"""Atualização do AutoPost: versão publicada na página Softwares (/api/softwares/atualizacao) e o atualizador do app
(autopost/atualizador.py), com o ERP simulado."""
import hashlib
import importlib.util
import sys
import time
import types
from pathlib import Path
from urllib.parse import quote

import pytest

from conftest import sql

NOME = "Teste Atualizacao.exe"


@pytest.fixture
def publicado():
    import routers.softwares as softwares
    caminho = Path(softwares.SOFTWARES_DIR) / NOME
    caminho.write_bytes(b"exe 1.2.0")
    sql("DELETE FROM softwares WHERE nome_arquivo = %s", (NOME,))
    software_id = sql("INSERT INTO softwares (nome_arquivo, descricao, versao, versao_app, tamanho) VALUES (%s, '', 3, '1.2.0', 9)", (NOME,))
    sql("INSERT INTO softwares_historico (software_id, versao, alteracoes) VALUES (%s, 2, 'antiga'), (%s, 3, 'Correção da OLX')",
        (software_id, software_id))
    yield caminho, software_id
    caminho.unlink(missing_ok=True)
    sql("DELETE FROM softwares WHERE nome_arquivo = %s", (NOME,))


def test_versao_publicada_sem_login_e_envio_manual_zera_a_versao(cliente_api, admin, publicado):
    caminho, software_id = publicado
    rota = f"/api/softwares/atualizacao/{quote(NOME)}"
    r = cliente_api.get(rota)
    assert r.status_code == 200, r.text
    info = r.json()
    sha = hashlib.sha256(b"exe 1.2.0").hexdigest()
    assert (info["versao_app"], info["versao"], info["alteracoes"], info["tamanho"]) == ("1.2.0", 3, "Correção da OLX", 9)
    assert info["sha256"] == sha and info["url"] == f"/softwares/Teste%20Atualizacao.exe?v={sha[:12]}"

    caminho.write_bytes(b"exe 1.2.1 com mais bytes")         # o hash acompanha o arquivo
    assert cliente_api.get(rota).json()["sha256"] == hashlib.sha256(b"exe 1.2.1 com mais bytes").hexdigest()

    r = cliente_api.post(f"/api/softwares/atualizar/{software_id}", headers=admin["headers"],
                         files={"arquivo": (NOME, b"enviado pela tela")}, data={"alteracoes": "enviado à mão"})
    assert r.status_code == 200, r.text
    info = cliente_api.get(rota).json()
    assert (info["versao_app"], info["versao"], info["alteracoes"]) == (None, 4, "enviado à mão")
    assert cliente_api.get("/api/softwares/atualizacao/Nao%20existe.exe").status_code == 404


# ---------- atualizador do app ----------

@pytest.fixture(scope="module")
def atualizador():
    if "requests" not in sys.modules:
        try:
            import requests  # noqa: F401
        except ImportError:   # a imagem do backend não tem requests; os testes passam uma sessão de mentira
            sys.modules["requests"] = types.ModuleType("requests")
    caminho = Path(__file__).resolve().parent.parent / "autopost" / "atualizador.py"
    spec = importlib.util.spec_from_file_location("atualizador_autopost", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class Resposta:
    def __init__(self, status=200, dados=None, conteudo=b""):
        self.status_code, self.dados, self.conteudo = status, dados, conteudo

    def json(self):
        return self.dados

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def iter_content(self, tamanho):
        for i in range(0, len(self.conteudo), tamanho):
            yield self.conteudo[i:i + tamanho]

    def __enter__(self):
        return self

    def __exit__(self, *erro):
        return False


class Erp:
    """Simula o ERP: a versão publicada e o arquivo."""

    def __init__(self, versao_app, conteudo):
        self.conteudo = conteudo
        self.info = {"versao_app": versao_app, "tamanho": len(conteudo), "alteracoes": "novidades",
                     "sha256": hashlib.sha256(conteudo).hexdigest(), "url": "/softwares/ERP%20AutoPost.exe?v=abc"}
        self.pedidos = []

    def get(self, url, **kwargs):
        self.pedidos.append(url)
        if "/api/softwares/atualizacao/" in url:
            return Resposta(dados=dict(self.info))
        return Resposta(conteudo=self.conteudo)


def test_so_oferece_quando_o_arquivo_e_outro_e_nao_e_mais_antigo(atualizador, tmp_path):
    exe = tmp_path / "ERP AutoPost.exe"
    exe.write_bytes(b"exe 1.1.0")
    assert atualizador.numeros("1.10.2") == (1, 10, 2) and atualizador.numeros(None) is None
    erp = Erp("1.2.0", b"exe 1.2.0")
    assert atualizador.verificar("https://erp/", "1.1.0", exe=exe, sessao=erp)["versao_app"] == "1.2.0"
    assert erp.pedidos == ["https://erp/api/softwares/atualizacao/ERP%20AutoPost.exe"]
    assert atualizador.verificar("https://erp", "1.2.0", exe=exe, sessao=erp) is None    # mesma versão
    assert atualizador.verificar("https://erp", "1.3.0", exe=exe, sessao=erp) is None    # este é mais novo
    assert atualizador.verificar("https://erp", "1.1.0", exe=exe, sessao=Erp("1.2.0", b"exe 1.1.0")) is None   # mesmo arquivo
    assert atualizador.verificar("https://erp", "1.1.0", exe=exe, sessao=Erp(None, b"enviado a mao")) is not None
    assert atualizador.verificar("https://erp", "1.1.0", sessao=erp) is None              # rodando pelo Python


def test_baixa_confere_e_troca_o_exe(atualizador, tmp_path):
    exe = tmp_path / "ERP AutoPost.exe"
    exe.write_bytes(b"exe 1.1.0")
    erp = Erp("1.2.0", b"exe 1.2.0 " * 100000)
    a = atualizador.Atualizador("https://erp", exe=exe, sessao=erp)
    a.iniciar(dict(erp.info))
    a._thread.join(10)
    assert a.estado["etapa"] == "pronto", a.estado
    assert a.estado["baixado"] == len(erp.conteudo) and erp.pedidos == ["https://erp/softwares/ERP%20AutoPost.exe?v=abc"]
    assert exe.read_bytes() == erp.conteudo and a.antigo.read_bytes() == b"exe 1.1.0" and not a.novo.exists()

    atualizador.limpar_sobras(exe)
    for _ in range(50):
        if not a.antigo.exists():
            break
        time.sleep(0.1)
    assert not a.antigo.exists()


def test_arquivo_diferente_do_publicado_nao_troca(atualizador, tmp_path):
    exe = tmp_path / "ERP AutoPost.exe"
    exe.write_bytes(b"exe 1.1.0")
    erp = Erp("1.2.0", b"exe 1.2.0")
    info = {**erp.info, "sha256": "0" * 64}
    a = atualizador.Atualizador("https://erp", exe=exe, sessao=erp)
    a.iniciar(info)
    a._thread.join(10)
    assert a.estado["etapa"] == "erro" and "diferente do publicado" in a.estado["erro"]
    assert exe.read_bytes() == b"exe 1.1.0" and not a.novo.exists() and not a.antigo.exists()
