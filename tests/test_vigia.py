"""Vigia do ERP (vigia_erp.py): religa o que caiu, avisa uma vez, guarda alerta que não saiu e limpa logs."""
import os
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import vigia_erp  # noqa: E402


@pytest.fixture
def vigia(tmp_path, monkeypatch):
    """Vigia com portas, processos, relógio e WhatsApp de mentira."""
    sim = types.SimpleNamespace(no_ar={"backend": True, "frontend": True}, subidos=[], enviados=[],
                                agora=1_000_000.0, webhook_falha=False, disco_pct=50.0)
    monkeypatch.setattr(vigia_erp, "PASTA_LOG", str(tmp_path))
    monkeypatch.setattr(vigia_erp, "ESTADO", str(tmp_path / "estado.json"))
    monkeypatch.setattr(vigia_erp, "porta_respondendo", lambda porta: sim.no_ar["backend" if porta == 8000 else "frontend"])
    monkeypatch.setattr(vigia_erp, "subir", lambda nome: sim.subidos.append(nome))
    monkeypatch.setattr(vigia_erp.subprocess, "run", lambda *a, **k: types.SimpleNamespace(returncode=0, stdout="", stderr=""))
    monkeypatch.setattr(vigia_erp.time, "time", lambda: sim.agora)

    def enviar_alerta(mensagem):
        if sim.webhook_falha:
            raise ConnectionError("webhook fora do ar")
        sim.enviados.append(mensagem)
        return 1

    def uso_disco(_):
        return {"usado_pct": sim.disco_pct, "livre_gb": 10.0, "alerta": sim.disco_pct >= 95}

    monkeypatch.setitem(sys.modules, "alertas", types.SimpleNamespace(enviar_alerta=enviar_alerta, uso_disco=uso_disco))

    def rodada(minutos_depois=5):
        sim.agora += minutos_depois * 60
        sim.enviados.clear()
        sim.subidos.clear()
        vigia_erp.main()
    sim.rodada = rodada
    return sim


def test_tudo_no_ar_nao_faz_nada(vigia):
    vigia.rodada()
    assert vigia.subidos == [] and vigia.enviados == []


def test_pc_reiniciado_religa_os_dois_e_avisa_uma_vez(vigia):
    vigia.no_ar = {"backend": False, "frontend": False}
    vigia.rodada()
    assert vigia.subidos == ["backend", "frontend"]
    assert len(vigia.enviados) == 1 and "backend e frontend" in vigia.enviados[0]

    vigia.no_ar = {"backend": True, "frontend": True}
    vigia.rodada()
    assert vigia.subidos == [] and vigia.enviados == []


def test_nao_voltou_avisa_uma_vez_e_depois_avisa_que_voltou(vigia):
    vigia.no_ar["backend"] = False
    vigia.rodada()
    assert vigia.subidos == ["backend"] and "religado" in vigia.enviados[0]

    vigia.rodada()  # 5 min depois, continua fora
    assert vigia.subidos == ["backend"]
    assert len(vigia.enviados) == 1 and "não voltou" in vigia.enviados[0]

    vigia.rodada()  # continua tentando, sem repetir o aviso
    assert vigia.subidos == ["backend"] and vigia.enviados == []

    vigia.no_ar["backend"] = True
    vigia.rodada()
    assert len(vigia.enviados) == 1 and "voltou a responder" in vigia.enviados[0]


def test_queda_nova_depois_de_voltar_nao_e_confundida_com_nao_voltou(vigia):
    vigia.no_ar["frontend"] = False
    vigia.rodada()
    vigia.no_ar["frontend"] = True
    vigia.rodada()
    vigia.no_ar["frontend"] = False
    vigia.rodada()
    assert len(vigia.enviados) == 1 and "religado" in vigia.enviados[0]


def test_nao_religa_de_novo_enquanto_o_anterior_ainda_esta_subindo(vigia):
    vigia.no_ar["backend"] = False
    vigia.rodada()
    vigia.rodada(minutos_depois=1)
    assert vigia.subidos == []


def test_alerta_que_nao_saiu_e_reenviado(vigia):
    vigia.webhook_falha = True
    vigia.no_ar["backend"] = False
    vigia.rodada()
    assert vigia.enviados == []

    vigia.webhook_falha = False
    vigia.no_ar["backend"] = True
    vigia.rodada()
    assert len(vigia.enviados) == 1 and "religado" in vigia.enviados[0]


def test_disco_cheio_avisa_uma_vez_por_dia(vigia):
    vigia.disco_pct = 96.5
    vigia.rodada()
    assert len(vigia.enviados) == 1 and "96.5%" in vigia.enviados[0]
    vigia.rodada()
    assert vigia.enviados == []


def test_apaga_logs_com_mais_de_30_dias(vigia, tmp_path):
    for nome in ("backend_2020-01-01.log", "frontend_2020-01-02.log", "backup.log"):
        (tmp_path / nome).write_text("x")
    hoje = f"backend_{vigia_erp.hoje()}.log"
    (tmp_path / hoje).write_text("x")
    vigia.rodada()
    restantes = set(os.listdir(tmp_path))
    assert not {"backend_2020-01-01.log", "frontend_2020-01-02.log"} & restantes
    assert {"backup.log", hoje} <= restantes
