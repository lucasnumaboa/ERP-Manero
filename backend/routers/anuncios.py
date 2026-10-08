"""
Anúncios publicados pelo ERP AutoPost (app em autopost/) no Facebook Marketplace e na OLX.

O app registra aqui cada anúncio que publica. Com isso o ERP sabe onde cada produto está anunciado (evita
anunciar duas vezes) e quais anúncios precisam sair do ar porque o produto vendeu (estoque zerado) ou foi
desativado — o app busca essa lista em /para-remover, exclui no site e marca como removido.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB

router = APIRouter()

PLATAFORMAS = ("facebook", "olx")


class NovoAnuncio(BaseModel):
    produto_id: int
    plataforma: str = Field(..., description="facebook ou olx")
    titulo: str = Field(..., min_length=1, max_length=255)
    preco: Optional[float] = None
    link: Optional[str] = Field(None, max_length=500)
    observacao: Optional[str] = Field(None, max_length=500)


class Remocao(BaseModel):
    observacao: Optional[str] = Field(None, max_length=500)


_SELECT = """
    SELECT a.id, a.produto_id, a.plataforma, a.titulo, a.preco, a.link, a.status, a.observacao,
           a.data_publicacao, a.data_remocao, a.usuario_id, u.nome AS usuario_nome,
           p.codigo AS produto_codigo, p.nome AS produto_nome, p.estoque_atual, p.ativo AS produto_ativo
    FROM anuncios a
    JOIN produtos p ON p.id = a.produto_id
    LEFT JOIN usuarios u ON u.id = a.usuario_id
"""


def _formatar(a: dict) -> dict:
    for campo in ("data_publicacao", "data_remocao"):
        if a.get(campo):
            a[campo] = a[campo].isoformat()
    if a.get("preco") is not None:
        a["preco"] = float(a["preco"])
    a["produto_ativo"] = bool(a.get("produto_ativo"))
    return a


@router.get("/")
async def listar_anuncios(
    status_: Optional[str] = Query(None, alias="status", description="ativo, removido"),
    produto_id: Optional[int] = None,
    plataforma: Optional[str] = None,
    limite: int = Query(500, ge=1, le=5000),
    current_user: UserInDB = Depends(get_current_user),
):
    condicoes, params = [], []
    if status_:
        condicoes.append("a.status = %s")
        params.append(status_)
    if produto_id:
        condicoes.append("a.produto_id = %s")
        params.append(produto_id)
    if plataforma:
        condicoes.append("a.plataforma = %s")
        params.append(plataforma)
    where = f"WHERE {' AND '.join(condicoes)}" if condicoes else ""
    with get_db_cursor() as cursor:
        cursor.execute(f"{_SELECT} {where} ORDER BY a.data_publicacao DESC, a.id DESC LIMIT %s", (*params, limite))
        return [_formatar(a) for a in cursor.fetchall()]


@router.get("/para-remover")
async def anuncios_para_remover(current_user: UserInDB = Depends(get_current_user)):
    """Anúncios no ar de produtos que não podem mais ser vendidos: sem estoque ou desativados."""
    with get_db_cursor() as cursor:
        cursor.execute(f"{_SELECT} WHERE a.status = 'ativo' AND (p.estoque_atual <= 0 OR p.ativo = 0) "
                       "ORDER BY a.data_publicacao")
        return [_formatar(a) for a in cursor.fetchall()]


@router.get("/ativos-por-produto")
async def ativos_por_produto(current_user: UserInDB = Depends(get_current_user)):
    """{produto_id: ["facebook", "olx"]} só com anúncios no ar — para mostrar onde cada produto está anunciado."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT produto_id, plataforma FROM anuncios WHERE status = 'ativo'")
        resultado = {}
        for linha in cursor.fetchall():
            plataformas = resultado.setdefault(str(linha["produto_id"]), [])
            if linha["plataforma"] not in plataformas:
                plataformas.append(linha["plataforma"])
        return resultado


@router.post("/", status_code=status.HTTP_201_CREATED)
async def registrar_anuncio(anuncio: NovoAnuncio, current_user: UserInDB = Depends(get_current_user)):
    if anuncio.plataforma not in PLATAFORMAS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Plataforma deve ser uma de: {', '.join(PLATAFORMAS)}")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM produtos WHERE id = %s", (anuncio.produto_id,))
        if not cursor.fetchone():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")
        cursor.execute(
            "INSERT INTO anuncios (produto_id, plataforma, titulo, preco, link, observacao, usuario_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (anuncio.produto_id, anuncio.plataforma, anuncio.titulo.strip(), anuncio.preco, anuncio.link,
             anuncio.observacao, current_user.id),
        )
        novo_id = cursor.lastrowid
    with get_db_cursor() as cursor:
        cursor.execute(f"{_SELECT} WHERE a.id = %s", (novo_id,))
        return _formatar(cursor.fetchone())


@router.put("/{anuncio_id}/removido")
async def marcar_removido(anuncio_id: int, remocao: Remocao = Remocao(),
                          current_user: UserInDB = Depends(get_current_user)):
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE anuncios SET status = 'removido', data_remocao = NOW(), "
            "observacao = COALESCE(%s, observacao) WHERE id = %s",
            (remocao.observacao, anuncio_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Anúncio não encontrado")
    with get_db_cursor() as cursor:
        cursor.execute(f"{_SELECT} WHERE a.id = %s", (anuncio_id,))
        return _formatar(cursor.fetchone())
