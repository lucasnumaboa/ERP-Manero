from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB

router = APIRouter()

# ──────────────────────────────────────────────
# MODELOS PYDANTIC
# ──────────────────────────────────────────────

class ControleCategoriaCreate(BaseModel):
    nome: str
    tipo: str          # 'lucro' ou 'desconto'
    descricao: Optional[str] = None

class ControleCategoria(BaseModel):
    id: int
    nome: str
    tipo: str
    descricao: Optional[str] = None
    ativo: bool
    data_cadastro: Optional[str] = None

class ControleLancamentoCreate(BaseModel):
    categoria_id: Optional[int] = None
    data: date
    tipo: str          # 'lucro' ou 'desconto'
    descricao: str
    valor: float

class ControleLancamento(BaseModel):
    id: int
    categoria_id: Optional[int] = None
    categoria_nome: Optional[str] = None
    data: str
    tipo: str
    descricao: str
    valor: float
    data_cadastro: Optional[str] = None


# ──────────────────────────────────────────────
# ROTAS — CATEGORIAS
# ──────────────────────────────────────────────

@router.get("/categorias", response_model=List[ControleCategoria])
async def listar_categorias(
    tipo: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as categorias de controle financeiro."""
    with get_db_cursor() as cursor:
        query = "SELECT id, nome, tipo, descricao, ativo, data_cadastro FROM controle_categorias WHERE ativo = TRUE"
        params = []
        if tipo:
            query += " AND tipo = %s"
            params.append(tipo)
        query += " ORDER BY nome ASC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [
        ControleCategoria(
            id=r["id"],
            nome=r["nome"],
            tipo=r["tipo"],
            descricao=r["descricao"],
            ativo=bool(r["ativo"]),
            data_cadastro=r["data_cadastro"].isoformat() if r["data_cadastro"] else None
        )
        for r in rows
    ]


@router.post("/categorias", response_model=ControleCategoria, status_code=status.HTTP_201_CREATED)
async def criar_categoria(
    categoria: ControleCategoriaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria uma nova categoria de controle financeiro."""
    if categoria.tipo not in ("lucro", "desconto"):
        raise HTTPException(status_code=400, detail="Tipo deve ser 'lucro' ou 'desconto'")

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO controle_categorias (nome, tipo, descricao, usuario_id)
            VALUES (%s, %s, %s, %s)
            """,
            (categoria.nome, categoria.tipo, categoria.descricao, current_user.id)
        )
        new_id = cursor.lastrowid
        cursor.execute(
            "SELECT id, nome, tipo, descricao, ativo, data_cadastro FROM controle_categorias WHERE id = %s",
            (new_id,)
        )
        row = cursor.fetchone()

    return ControleCategoria(
        id=row["id"],
        nome=row["nome"],
        tipo=row["tipo"],
        descricao=row["descricao"],
        ativo=bool(row["ativo"]),
        data_cadastro=row["data_cadastro"].isoformat() if row["data_cadastro"] else None
    )


@router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_categoria(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Desativa (soft-delete) uma categoria de controle financeiro."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM controle_categorias WHERE id = %s", (categoria_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Categoria não encontrada")
        cursor.execute("UPDATE controle_categorias SET ativo = FALSE WHERE id = %s", (categoria_id,))


# ──────────────────────────────────────────────
# ROTAS — LANÇAMENTOS
# ──────────────────────────────────────────────

@router.get("/lancamentos", response_model=List[ControleLancamento])
async def listar_lancamentos(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    tipo: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista lançamentos de controle financeiro com filtros opcionais de período e tipo."""
    with get_db_cursor() as cursor:
        query = """
            SELECT
                cl.id,
                cl.categoria_id,
                cc.nome AS categoria_nome,
                cl.data,
                cl.tipo,
                cl.descricao,
                cl.valor,
                cl.data_cadastro
            FROM controle_lancamentos cl
            LEFT JOIN controle_categorias cc ON cl.categoria_id = cc.id
            WHERE 1=1
        """
        params = []
        if data_inicio:
            query += " AND cl.data >= %s"
            params.append(data_inicio)
        if data_fim:
            query += " AND cl.data <= %s"
            params.append(data_fim)
        if tipo:
            query += " AND cl.tipo = %s"
            params.append(tipo)
        query += " ORDER BY cl.data DESC, cl.id DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [
        ControleLancamento(
            id=r["id"],
            categoria_id=r["categoria_id"],
            categoria_nome=r["categoria_nome"],
            data=r["data"].isoformat() if r["data"] else "",
            tipo=r["tipo"],
            descricao=r["descricao"],
            valor=float(r["valor"]),
            data_cadastro=r["data_cadastro"].isoformat() if r["data_cadastro"] else None
        )
        for r in rows
    ]


@router.post("/lancamentos", response_model=ControleLancamento, status_code=status.HTTP_201_CREATED)
async def criar_lancamento(
    lancamento: ControleLancamentoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria um novo lançamento de controle financeiro."""
    if lancamento.tipo not in ("lucro", "desconto"):
        raise HTTPException(status_code=400, detail="Tipo deve ser 'lucro' ou 'desconto'")
    if lancamento.valor <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO controle_lancamentos (categoria_id, data, tipo, descricao, valor, usuario_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (lancamento.categoria_id, lancamento.data, lancamento.tipo,
             lancamento.descricao, lancamento.valor, current_user.id)
        )
        new_id = cursor.lastrowid
        cursor.execute(
            """
            SELECT cl.id, cl.categoria_id, cc.nome AS categoria_nome,
                   cl.data, cl.tipo, cl.descricao, cl.valor, cl.data_cadastro
            FROM controle_lancamentos cl
            LEFT JOIN controle_categorias cc ON cl.categoria_id = cc.id
            WHERE cl.id = %s
            """,
            (new_id,)
        )
        row = cursor.fetchone()

    return ControleLancamento(
        id=row["id"],
        categoria_id=row["categoria_id"],
        categoria_nome=row["categoria_nome"],
        data=row["data"].isoformat() if row["data"] else "",
        tipo=row["tipo"],
        descricao=row["descricao"],
        valor=float(row["valor"]),
        data_cadastro=row["data_cadastro"].isoformat() if row["data_cadastro"] else None
    )


@router.delete("/lancamentos/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_lancamento(
    lancamento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Remove um lançamento de controle financeiro."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM controle_lancamentos WHERE id = %s", (lancamento_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Lançamento não encontrado")
        cursor.execute("DELETE FROM controle_lancamentos WHERE id = %s", (lancamento_id,))
