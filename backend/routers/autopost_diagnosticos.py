"""
Travamentos do ERP AutoPost para ajustar (Configurações › AutoPost: travamentos, só admin).

Quando o app fica repetindo o mesmo passo (mais de 5 vezes) ou um anúncio falha, ele manda para cá o que tentava
fazer, o passo a passo, a página em JSON (botões, campos e textos visíveis), o HTML e a imagem da tela. Fica numa
fila "pendente" até alguém ajustar o robô e marcar como resolvido.
"""
import base64
import binascii
import json
import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB

router = APIRouter()

PASTA_IMAGENS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "uploads", "diagnosticos")
LIMITE_HTML = 3 * 1024 * 1024
LIMITE_JSON = 2 * 1024 * 1024
LIMITE_IMAGEM = 6 * 1024 * 1024
STATUS = ("pendente", "resolvido")


class NovoDiagnostico(BaseModel):
    plataforma: str = Field(..., max_length=20)
    acao: str = Field(..., max_length=500, description="o que o robô estava tentando fazer")
    erro: Optional[str] = None
    produto_id: Optional[int] = None
    titulo: Optional[str] = Field(None, max_length=255)
    log: Optional[str] = None
    url: Optional[str] = Field(None, max_length=1000)
    pagina: Optional[Any] = None          # JSON da página (estrutura visível)
    html: Optional[str] = None
    imagem_base64: Optional[str] = None   # PNG da tela
    versao_app: Optional[str] = Field(None, max_length=20)


class Revisao(BaseModel):
    status: str = "resolvido"
    observacao: Optional[str] = Field(None, max_length=500)


def somente_admin(current_user: UserInDB = Depends(get_current_user)):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Apenas administradores veem os travamentos do AutoPost.")
    return current_user


def _salvar_imagem(dados_base64: str) -> Optional[str]:
    try:
        dados = base64.b64decode(dados_base64.split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem inválida (base64)")
    if len(dados) > LIMITE_IMAGEM:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Imagem grande demais")
    if not dados.startswith(b"\x89PNG"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A imagem precisa ser PNG")
    os.makedirs(PASTA_IMAGENS, exist_ok=True)
    nome = f"{uuid.uuid4().hex}.png"
    with open(os.path.join(PASTA_IMAGENS, nome), "wb") as arquivo:
        arquivo.write(dados)
    return f"uploads/diagnosticos/{nome}"


@router.post("/", status_code=status.HTTP_201_CREATED)
async def registrar(diag: NovoDiagnostico, current_user: UserInDB = Depends(get_current_user)):
    """O app AutoPost manda um travamento (qualquer usuário logado no app)."""
    pagina = json.dumps(diag.pagina, ensure_ascii=False) if diag.pagina is not None else None
    if pagina and len(pagina) > LIMITE_JSON:
        pagina = pagina[:LIMITE_JSON]
    html = diag.html[:LIMITE_HTML] if diag.html else None
    imagem = _salvar_imagem(diag.imagem_base64) if diag.imagem_base64 else None
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO autopost_diagnosticos (plataforma, produto_id, titulo, acao, erro, log_texto, url, "
            "pagina_json, html, imagem, versao_app, usuario_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (diag.plataforma, diag.produto_id, diag.titulo, diag.acao, diag.erro, diag.log, diag.url, pagina, html,
             imagem, diag.versao_app, current_user.id),
        )
        return {"id": cursor.lastrowid, "imagem": imagem}


_CAMPOS_LISTA = """d.id, d.plataforma, d.produto_id, d.titulo, d.acao, d.erro, d.url, d.imagem, d.status, d.observacao,
                   d.versao_app, d.data_criacao, d.data_resolucao, u.nome AS usuario_nome"""


def _formatar(d: dict) -> dict:
    for campo in ("data_criacao", "data_resolucao"):
        if d.get(campo):
            d[campo] = d[campo].isoformat()
    if d.get("pagina_json"):
        try:
            d["pagina"] = json.loads(d.pop("pagina_json"))
        except ValueError:
            d["pagina"] = d.pop("pagina_json")
    return d


@router.get("/")
async def listar(status_: Optional[str] = Query("pendente", alias="status"), limite: int = Query(100, ge=1, le=500),
                 _=Depends(somente_admin)):
    condicao, params = ("WHERE d.status = %s", [status_]) if status_ else ("", [])
    with get_db_cursor() as cursor:
        cursor.execute(f"SELECT {_CAMPOS_LISTA} FROM autopost_diagnosticos d LEFT JOIN usuarios u ON u.id = d.usuario_id "
                       f"{condicao} ORDER BY d.id DESC LIMIT %s", (*params, limite))
        itens = [_formatar(d) for d in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) AS n FROM autopost_diagnosticos WHERE status = 'pendente'")
        return {"itens": itens, "pendentes": cursor.fetchone()["n"]}


@router.get("/{diagnostico_id}")
async def detalhe(diagnostico_id: int, _=Depends(somente_admin)):
    """Tudo do travamento: passo a passo, JSON da página e HTML."""
    with get_db_cursor() as cursor:
        cursor.execute(f"SELECT {_CAMPOS_LISTA}, d.log_texto, d.pagina_json, d.html FROM autopost_diagnosticos d "
                       "LEFT JOIN usuarios u ON u.id = d.usuario_id WHERE d.id = %s", (diagnostico_id,))
        d = cursor.fetchone()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Travamento não encontrado")
    return _formatar(d)


@router.put("/{diagnostico_id}")
async def revisar(diagnostico_id: int, revisao: Revisao, _=Depends(somente_admin)):
    if revisao.status not in STATUS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Status deve ser: {', '.join(STATUS)}")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE autopost_diagnosticos SET status = %s, observacao = COALESCE(%s, observacao), "
            "data_resolucao = IF(%s = 'resolvido', NOW(), NULL) WHERE id = %s",
            (revisao.status, revisao.observacao, revisao.status, diagnostico_id))
        if cursor.rowcount == 0:
            cursor.execute("SELECT id FROM autopost_diagnosticos WHERE id = %s", (diagnostico_id,))
            if not cursor.fetchone():
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Travamento não encontrado")
    return {"ok": True}
