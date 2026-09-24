"""
Geração de texto por IA feita no servidor, para as telas (descrição de produto, cadastro em massa,
relatórios) não precisarem da chave do provedor no navegador.
"""
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB

router = APIRouter()

# 424 em vez de 502/503: a Cloudflare troca respostas 502/503 da origem pela página de erro dela (sem CORS),
# e a tela só veria "Failed to fetch" em vez da mensagem do provedor.
ERRO_PROVEDOR = status.HTTP_424_FAILED_DEPENDENCY

DADOS_FIXOS_PADRAO = "- 30 dias de garantia\n- Entrego em Salto SP\n- Somente venda"
CHAVES_IA = (
    "ia_provider", "apikey_openrouter", "model_openrouter",
    "ollama_model", "ollama_url", "ollama_apikey",
    "lmstudio_model", "lmstudio_url", "lmstudio_apikey",
    "ia_think", "ia_think_tokens",
)


class PedidoIA(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=100_000)
    max_tokens: int = Field(4000, ge=100, le=16_000)
    temperatura: float = Field(0.7, ge=0, le=1.5)


def _configuracoes(chaves):
    marcadores = ", ".join(["%s"] * len(chaves))
    with get_db_cursor() as cursor:
        cursor.execute(f"SELECT chave, valor FROM configuracoes WHERE chave IN ({marcadores})", tuple(chaves))
        return {c["chave"]: c["valor"] for c in cursor.fetchall()}


def _falha(provedor, resposta):
    print(f"[IA] Erro {provedor}: {resposta.status_code} - {resposta.text[:500]}")
    try:
        detalhe = resposta.json().get("error", {}).get("message") or resposta.text[:200]
    except (ValueError, AttributeError):
        detalhe = resposta.text[:200]
    raise HTTPException(ERRO_PROVEDOR, f"Erro no provedor de IA ({provedor} {resposta.status_code}): {detalhe}")


async def gerar_texto(prompt: str, max_tokens: int = 4000, temperatura: float = 0.7) -> str:
    cfg = _configuracoes(CHAVES_IA)
    provedor = cfg.get("ia_provider") or "openrouter"
    pensar = (cfg.get("ia_think") or "on").lower()          # on | off | low | medium | high (ou yes/no)
    tokens_pensar = int(cfg.get("ia_think_tokens") or 0)
    mensagens = [{"role": "user", "content": prompt}]

    async with httpx.AsyncClient(timeout=180.0) as cliente:
        if provedor == "openrouter":
            chave = cfg.get("apikey_openrouter")
            if not chave:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "API Key do OpenRouter não configurada. Peça ao administrador para configurar.")
            corpo = {"model": cfg.get("model_openrouter") or "openai/gpt-4o-mini", "messages": mensagens,
                     "stream": False, "temperature": temperatura, "max_tokens": max_tokens}
            if pensar in ("off", "no"):
                corpo["reasoning"] = {"effort": "low"}
            elif pensar in ("low", "medium", "high"):
                corpo["reasoning"] = {"effort": pensar, **({"max_tokens": tokens_pensar} if tokens_pensar > 0 else {})}
            elif tokens_pensar > 0:
                corpo["reasoning"] = {"max_tokens": tokens_pensar}
            r = await cliente.post("https://openrouter.ai/api/v1/chat/completions",
                                   headers={"Authorization": f"Bearer {chave}", "Content-Type": "application/json; charset=utf-8",
                                            "X-Title": "ERP Maneiro"},
                                   content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
            if r.status_code != 200:
                _falha("OpenRouter", r)
            return (r.json()["choices"][0]["message"].get("content") or "").strip()

        if provedor == "ollama":
            corpo = {"model": cfg.get("ollama_model") or "llama3", "messages": mensagens, "stream": False}
            if pensar in ("off", "no"):
                corpo["think"] = False
            cabecalhos = {"Content-Type": "application/json; charset=utf-8"}
            if cfg.get("ollama_apikey"):
                cabecalhos["Authorization"] = f"Bearer {cfg['ollama_apikey']}"
            r = await cliente.post(f"{cfg.get('ollama_url') or 'http://localhost:11434'}/api/chat", headers=cabecalhos,
                                   content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
            if r.status_code != 200:
                _falha("Ollama", r)
            return (r.json().get("message", {}).get("content") or "").strip()

        if provedor == "lmstudio":
            corpo = {"model": cfg.get("lmstudio_model") or "default", "messages": mensagens, "stream": False,
                     "temperature": temperatura, "max_tokens": max_tokens}
            if pensar not in ("on", "yes"):
                corpo["reasoning"] = "off" if pensar == "no" else pensar
            if tokens_pensar > 0:
                corpo["reasoning_budget"] = tokens_pensar
            cabecalhos = {"Content-Type": "application/json; charset=utf-8"}
            if cfg.get("lmstudio_apikey"):
                cabecalhos["Authorization"] = f"Bearer {cfg['lmstudio_apikey']}"
            r = await cliente.post(f"{cfg.get('lmstudio_url') or 'http://localhost:1234'}/v1/chat/completions", headers=cabecalhos,
                                   content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
            if r.status_code != 200:
                _falha("LM Studio", r)
            return (r.json()["choices"][0]["message"].get("content") or "").strip()

    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provedor de IA desconhecido: {provedor}")


MAX_RODADAS_FERRAMENTAS = 6


async def conversar_com_ferramentas(mensagens: list, ferramentas: list, executar, max_tokens: int = 2000) -> str:
    """
    Conversa em que o modelo pode chamar ferramentas (function calling, o mesmo conceito das ferramentas MCP):
    ele pede, por exemplo, buscar_produtos({"termo": "rx580"}), o servidor executa `executar(nome, argumentos)`
    no banco e devolve o resultado, e o modelo segue até ter a resposta. `ferramentas` no formato OpenAI
    ([{"type": "function", "function": {name, description, parameters}}]). Devolve o texto final.
    """
    cfg = _configuracoes(CHAVES_IA)
    provedor = cfg.get("ia_provider") or "openrouter"
    pensar = (cfg.get("ia_think") or "on").lower()
    tokens_pensar = int(cfg.get("ia_think_tokens") or 0)
    mensagens = list(mensagens)

    if provedor == "openrouter":
        chave = cfg.get("apikey_openrouter")
        if not chave:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "API Key do OpenRouter não configurada. Peça ao administrador para configurar.")
        url = "https://openrouter.ai/api/v1/chat/completions"
        cabecalhos = {"Authorization": f"Bearer {chave}", "Content-Type": "application/json; charset=utf-8", "X-Title": "ERP Maneiro"}
        base = {"model": cfg.get("model_openrouter") or "openai/gpt-4o-mini"}
        if pensar in ("off", "no"):
            base["reasoning"] = {"effort": "low"}
        elif pensar in ("low", "medium", "high"):
            base["reasoning"] = {"effort": pensar, **({"max_tokens": tokens_pensar} if tokens_pensar > 0 else {})}
        elif tokens_pensar > 0:
            base["reasoning"] = {"max_tokens": tokens_pensar}
        nome_provedor = "OpenRouter"
    elif provedor == "lmstudio":
        url = f"{cfg.get('lmstudio_url') or 'http://localhost:1234'}/v1/chat/completions"
        cabecalhos = {"Content-Type": "application/json; charset=utf-8"}
        if cfg.get("lmstudio_apikey"):
            cabecalhos["Authorization"] = f"Bearer {cfg['lmstudio_apikey']}"
        base = {"model": cfg.get("lmstudio_model") or "default"}
        nome_provedor = "LM Studio"
    elif provedor == "ollama":
        url = f"{cfg.get('ollama_url') or 'http://localhost:11434'}/api/chat"
        cabecalhos = {"Content-Type": "application/json; charset=utf-8"}
        if cfg.get("ollama_apikey"):
            cabecalhos["Authorization"] = f"Bearer {cfg['ollama_apikey']}"
        base = {"model": cfg.get("ollama_model") or "llama3"}
        if pensar in ("off", "no"):
            base["think"] = False
        nome_provedor = "Ollama"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provedor de IA desconhecido: {provedor}")

    async with httpx.AsyncClient(timeout=180.0) as cliente:
        for rodada in range(MAX_RODADAS_FERRAMENTAS + 1):
            ultima = rodada == MAX_RODADAS_FERRAMENTAS  # na última rodada não oferece ferramenta: tem que responder
            corpo = {**base, "messages": mensagens, "stream": False}
            if not ultima:
                corpo["tools"] = ferramentas
            if provedor != "ollama":
                corpo.update({"temperature": 0.3, "max_tokens": max_tokens})
            r = await cliente.post(url, headers=cabecalhos, content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
            if r.status_code != 200:
                _falha(nome_provedor, r)
            dados = r.json()
            msg = dados.get("message", {}) if provedor == "ollama" else dados["choices"][0]["message"]
            chamadas = msg.get("tool_calls") or []
            if not chamadas:
                return (msg.get("content") or "").strip()

            # devolve ao modelo o próprio pedido (com o raciocínio, se veio) e o resultado de cada ferramenta
            pedido = {"role": "assistant", "content": msg.get("content") or "", "tool_calls": chamadas}
            if msg.get("reasoning_details"):
                pedido["reasoning_details"] = msg["reasoning_details"]
            mensagens.append(pedido)
            for chamada in chamadas:
                funcao = chamada.get("function", {})
                argumentos = funcao.get("arguments") or {}
                if isinstance(argumentos, str):
                    try:
                        argumentos = json.loads(argumentos or "{}")
                    except ValueError:
                        argumentos = {}
                try:
                    resultado = executar(funcao.get("name"), argumentos)
                except Exception as e:  # erro numa ferramenta vira resposta para o modelo, não derruba a conversa
                    print(f"[IA] Erro na ferramenta {funcao.get('name')}: {e!r}")
                    resultado = {"erro": "não foi possível consultar agora"}
                resposta = {"role": "tool", "content": json.dumps(resultado, ensure_ascii=False, default=str)}
                if provedor == "ollama":
                    resposta["tool_name"] = funcao.get("name")
                else:
                    resposta["tool_call_id"] = chamada.get("id")
                mensagens.append(resposta)
    return ""


@router.get("/dados-descricao")
async def dados_fixos_descricao(current_user: UserInDB = Depends(get_current_user)):
    """Texto fixo (garantia, entrega...) que abre toda descrição de produto gerada por IA."""
    valor = _configuracoes(["descricao_produto_dados_fixos"]).get("descricao_produto_dados_fixos")
    return {"dados_fixos": valor or DADOS_FIXOS_PADRAO}


@router.post("/gerar")
async def gerar(pedido: PedidoIA, current_user: UserInDB = Depends(get_current_user)):
    try:
        texto = await gerar_texto(pedido.prompt, pedido.max_tokens, pedido.temperatura)
    except httpx.HTTPError as e:
        raise HTTPException(ERRO_PROVEDOR, f"Não foi possível falar com o provedor de IA: {e}")
    if not texto:
        raise HTTPException(ERRO_PROVEDOR, "A IA não retornou texto. Tente novamente.")
    return {"texto": texto}
