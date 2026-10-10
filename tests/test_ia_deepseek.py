"""Provider DeepSeek (direto): endereço, chave e modo pensando montados sem chamar a internet."""
import pytest
from fastapi import HTTPException

from routers.ia import DEEPSEEK_MODELO_PADRAO, DEEPSEEK_URL, deepseek_requisicao


def test_sem_chave_avisa_para_configurar():
    with pytest.raises(HTTPException) as erro:
        deepseek_requisicao({"apikey_deepseek": ""})
    assert erro.value.status_code == 400
    assert "DeepSeek" in erro.value.detail


def test_endereco_chave_e_modelo_padrao():
    url, cabecalhos, base = deepseek_requisicao({"apikey_deepseek": "sk-teste"})
    assert url == DEEPSEEK_URL == "https://api.deepseek.com/chat/completions"
    assert cabecalhos["Authorization"] == "Bearer sk-teste"
    assert base == {"model": DEEPSEEK_MODELO_PADRAO}   # pensando ligado: padrão da DeepSeek, sem campo extra
    assert DEEPSEEK_MODELO_PADRAO == "deepseek-flash"


@pytest.mark.parametrize("pensar, esperado", [
    ("off", {"thinking": {"type": "disabled"}}),
    ("no", {"thinking": {"type": "disabled"}}),
    ("low", {"reasoning_effort": "low"}),
    ("medium", {"reasoning_effort": "high"}),
    ("high", {"reasoning_effort": "high"}),
    ("on", {}),
])
def test_modo_pensando(pensar, esperado):
    _, _, base = deepseek_requisicao({"apikey_deepseek": "sk-teste", "model_deepseek": "deepseek-v4-pro", "ia_think": pensar})
    assert base == {"model": "deepseek-v4-pro", **esperado}
