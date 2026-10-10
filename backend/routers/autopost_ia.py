"""IA nos campos de seleção dos sites (ex.: OLX › Placas de Vídeo: Marca, Fabricante, Modelo, VRAM, Condição).

O AutoPost manda os campos da página com as opções de cada um; o ERP junta o que sabe do produto (título, descrição,
categoria, preço e até 2 fotos) e a DeepSeek devolve uma opção por campo. A chave da IA fica só no servidor.
"""
import base64
import json
import mimetypes
import os
import re
import unicodedata
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB
from routers.ia import deepseek_requisicao

router = APIRouter()

PASTA_FRONTEND = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend"))
MAX_FOTOS = 2
MAX_BYTES_FOTO = 4 * 1024 * 1024

INSTRUCOES = """Você preenche os campos de seleção de um anúncio de produto num site de classificados.
Recebe o produto (título, descrição, categoria, preço e fotos) e os campos da página, cada um com id, nome e opções.
Responda só com JSON, sem texto fora dele:
{"escolhas": {"<id do campo>": "<texto exato de uma das opções desse campo>" ou null}}
Regras:
- Use somente o texto exato de uma das opções do campo; nunca invente opção.
- Tire as informações do título, da descrição e das fotos (ex.: "RX550 2gb" -> Marca AMD, Modelo Radeon RX, VRAM 2 GB).
- Se a marca ou o fabricante certo não está entre as opções, use "Outros" quando existir.
- Condição: o produto é usado, a não ser que o título ou a descrição digam novo/lacrado. Sem sinal de desgaste ou
  defeito, escolha a opção de usado em melhor estado (ex.: "Usado - Excelente").
- Preencha todos os campos que tenham uma opção coerente. Campo obrigatório nunca fica null.
- Só deixe null um campo opcional quando nenhuma opção fizer sentido para o produto."""


class Campo(BaseModel):
    id: str = Field(..., min_length=1, max_length=200)
    rotulo: str = Field("", max_length=200)
    obrigatorio: bool = False
    opcoes: list[str] = Field(..., min_length=1, max_length=300)


class PedidoCampos(BaseModel):
    plataforma: str = Field(..., max_length=20)
    produto_id: Optional[int] = None
    titulo: str = Field("", max_length=300)
    descricao: str = Field("", max_length=6000)
    categoria_site: str = Field("", max_length=300)    # ex.: "Informática > Placas de Vídeo"
    campos: list[Campo] = Field(..., min_length=1, max_length=40)


def normalizar(texto) -> str:
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto).strip().lower()


def _produto(produto_id):
    if not produto_id:
        return {}
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT p.nome, p.descricao, p.preco_venda, p.caminho_imagem, c.nome AS categoria
            FROM produtos p LEFT JOIN categorias_produtos c ON c.id = p.categoria_id
            WHERE p.id = %s
        """, (produto_id,))
        return cursor.fetchone() or {}


def _fotos(caminhos) -> list:
    """Até MAX_FOTOS fotos do produto como data URL (só arquivos de imagem dentro de frontend/uploads)."""
    fotos = []
    uploads = os.path.join(PASTA_FRONTEND, "uploads") + os.sep
    for caminho in [c.strip() for c in (caminhos or "").split(",") if c.strip()]:
        arquivo = os.path.realpath(os.path.join(PASTA_FRONTEND, caminho.lstrip("/")))
        tipo = mimetypes.guess_type(arquivo)[0] or ""
        if not arquivo.startswith(uploads) or not tipo.startswith("image/") or not os.path.isfile(arquivo):
            continue
        if os.path.getsize(arquivo) > MAX_BYTES_FOTO:
            continue
        with open(arquivo, "rb") as f:
            fotos.append(f"data:{tipo};base64,{base64.b64encode(f.read()).decode()}")
        if len(fotos) >= MAX_FOTOS:
            break
    return fotos


def montar_mensagens(pedido: PedidoCampos, produto: dict, fotos: list) -> list:
    dados = {
        "site": pedido.plataforma,
        "categoria_no_site": pedido.categoria_site,
        "produto": {
            "titulo": pedido.titulo or produto.get("nome") or "",
            "descricao": (pedido.descricao or produto.get("descricao") or "")[:4000],
            "categoria_no_erp": produto.get("categoria") or "",
            "preco": float(produto["preco_venda"]) if produto.get("preco_venda") is not None else None,
        },
        "campos": [c.model_dump() for c in pedido.campos],
    }
    texto = "Produto e campos (JSON):\n" + json.dumps(dados, ensure_ascii=False)
    if fotos:
        texto += f"\n\nSeguem {len(fotos)} foto(s) do produto."
    conteudo = [{"type": "text", "text": texto}] + [{"type": "image_url", "image_url": {"url": f}} for f in fotos]
    return [{"role": "system", "content": INSTRUCOES}, {"role": "user", "content": conteudo}]


async def _perguntar(mensagens: list) -> str:
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('apikey_deepseek', 'model_deepseek')")
        cfg = {c["chave"]: c["valor"] for c in cursor.fetchall()}
    # escolha simples: sem o modo pensando, que só deixaria a resposta mais lenta
    url, cabecalhos, base = deepseek_requisicao({**cfg, "ia_think": "off"})
    corpo = {**base, "messages": mensagens, "stream": False, "max_tokens": 1500,
             "response_format": {"type": "json_object"}}
    async with httpx.AsyncClient(timeout=60.0) as cliente:
        r = await cliente.post(url, headers=cabecalhos, content=json.dumps(corpo, ensure_ascii=False).encode("utf-8"))
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"a DeepSeek respondeu {r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"].get("content") or ""


def validar_escolhas(resposta: str, campos: list) -> dict:
    """Só vale o texto exato de uma opção do campo (comparado sem acento e sem maiúsculas). Campo obrigatório sem
    resposta válida fica com "Outros" quando existe; o resto fica None."""
    try:
        texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", (resposta or "").strip())
        bruto = json.loads(texto).get("escolhas") or {}
    except (ValueError, AttributeError):
        bruto = {}
    escolhas = {}
    for campo in campos:
        por_texto = {normalizar(o): o for o in campo.opcoes}
        valor = por_texto.get(normalizar(bruto.get(campo.id))) if isinstance(bruto, dict) else None
        if valor is None and campo.obrigatorio:
            valor = por_texto.get("outros")
        escolhas[campo.id] = valor
    return escolhas


@router.post("/campos")
async def escolher_campos(pedido: PedidoCampos, current_user: UserInDB = Depends(get_current_user)):
    produto = _produto(pedido.produto_id)
    fotos = _fotos(produto.get("caminho_imagem"))
    resposta = await _perguntar(montar_mensagens(pedido, produto, fotos))
    return {"escolhas": validar_escolhas(resposta, pedido.campos), "fotos": len(fotos)}
