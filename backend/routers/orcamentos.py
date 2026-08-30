from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# ============================================================
# Modelos Pydantic
# ============================================================

class OrcamentoConfigUpdate(BaseModel):
    preco_por_km: float

class PeriodoBase(BaseModel):
    nome: str
    data_inicio: date
    data_fim: date
    hora_inicio: str = "00:00:00"
    hora_fim: str = "23:59:59"
    valor_adicional: float = 0
    ativo: bool = True

class PeriodoCreate(PeriodoBase):
    pass

class PeriodoUpdate(BaseModel):
    nome: Optional[str] = None
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    hora_inicio: Optional[str] = None
    hora_fim: Optional[str] = None
    valor_adicional: Optional[float] = None
    ativo: Optional[bool] = None

class ConfigProdutoBase(BaseModel):
    nome: str
    valor: float = 0
    ativo: bool = True

class ConfigProdutoCreate(ConfigProdutoBase):
    pass

class ConfigProdutoUpdate(BaseModel):
    nome: Optional[str] = None
    valor: Optional[float] = None
    ativo: Optional[bool] = None

class CampoBase(BaseModel):
    rotulo: str
    tipo: str = "texto"  # texto, numero, opcoes
    opcoes: Optional[str] = None
    obrigatorio: bool = False
    ordem: int = 0
    ativo: bool = True

class CampoCreate(CampoBase):
    pass

class CampoUpdate(BaseModel):
    rotulo: Optional[str] = None
    tipo: Optional[str] = None
    opcoes: Optional[str] = None
    obrigatorio: Optional[bool] = None
    ordem: Optional[int] = None
    ativo: Optional[bool] = None

class DescontoBase(BaseModel):
    quantidade_minima: int
    percentual_desconto: float
    descricao: Optional[str] = None
    ativo: bool = True

class DescontoCreate(DescontoBase):
    pass

class DescontoUpdate(BaseModel):
    quantidade_minima: Optional[int] = None
    percentual_desconto: Optional[float] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None

class OrcamentoItemCreate(BaseModel):
    produto_id: Optional[int] = None
    config_produto_id: Optional[int] = None
    nome_produto: str
    quantidade: int = 1
    preco_unitario: float

class OrcamentoCreate(BaseModel):
    vendedor_id: Optional[int] = None
    tipo_entrega: str = "retira"  # retira, entrega
    km_entrega: float = 0
    itens: List[OrcamentoItemCreate]
    campos_livres: Optional[Dict[str, Any]] = None
    observacoes: Optional[str] = None

# ============================================================
# Configuração Geral
# ============================================================

@router.get("/config")
async def get_config(current_user: UserInDB = Depends(get_current_user)):
    """Retorna a configuração geral do módulo de orçamentos (preço/km)."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config WHERE id = 1")
        config = cursor.fetchone()
        if not config:
            cursor.execute("INSERT INTO orcamento_config (id, preco_por_km) VALUES (1, 0)")
            config = {"id": 1, "preco_por_km": 0}
    return config


@router.put("/config")
async def update_config(
    data: OrcamentoConfigUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza a configuração geral (somente admin)."""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar configurações")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO orcamento_config (id, preco_por_km) VALUES (1, %s) ON DUPLICATE KEY UPDATE preco_por_km = %s",
            (data.preco_por_km, data.preco_por_km)
        )
        cursor.execute("SELECT * FROM orcamento_config WHERE id = 1")
        return cursor.fetchone()


# ============================================================
# Períodos
# ============================================================

@router.get("/config/periodos")
async def listar_periodos(current_user: UserInDB = Depends(get_current_user)):
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config_periodos ORDER BY data_inicio DESC")
        return cursor.fetchall()


@router.post("/config/periodos", status_code=201)
async def criar_periodo(
    data: PeriodoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """INSERT INTO orcamento_config_periodos
               (nome, data_inicio, data_fim, hora_inicio, hora_fim, valor_adicional, ativo, usuario_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (data.nome, data.data_inicio, data.data_fim, data.hora_inicio,
             data.hora_fim, data.valor_adicional, data.ativo, current_user.id)
        )
        cursor.execute("SELECT LAST_INSERT_ID()")
        new_id = cursor.fetchone()["LAST_INSERT_ID()"]
        cursor.execute("SELECT * FROM orcamento_config_periodos WHERE id = %s", (new_id,))
        return cursor.fetchone()


@router.put("/config/periodos/{periodo_id}")
async def atualizar_periodo(
    periodo_id: int,
    data: PeriodoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{k} = %s" for k in update])
        cursor.execute(
            f"UPDATE orcamento_config_periodos SET {set_clause} WHERE id = %s",
            list(update.values()) + [periodo_id]
        )
        cursor.execute("SELECT * FROM orcamento_config_periodos WHERE id = %s", (periodo_id,))
        return cursor.fetchone()


@router.delete("/config/periodos/{periodo_id}", status_code=204)
async def excluir_periodo(
    periodo_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM orcamento_config_periodos WHERE id = %s", (periodo_id,))


# ============================================================
# Produtos/Estilos de Configuração
# ============================================================

@router.get("/config/produtos-config")
async def listar_config_produtos(current_user: UserInDB = Depends(get_current_user)):
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config_produtos ORDER BY nome")
        return cursor.fetchall()


@router.post("/config/produtos-config", status_code=201)
async def criar_config_produto(
    data: ConfigProdutoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO orcamento_config_produtos (nome, valor, ativo, usuario_id) VALUES (%s, %s, %s, %s)",
            (data.nome, data.valor, data.ativo, current_user.id)
        )
        cursor.execute("SELECT LAST_INSERT_ID()")
        new_id = cursor.fetchone()["LAST_INSERT_ID()"]
        cursor.execute("SELECT * FROM orcamento_config_produtos WHERE id = %s", (new_id,))
        return cursor.fetchone()


@router.put("/config/produtos-config/{item_id}")
async def atualizar_config_produto(
    item_id: int,
    data: ConfigProdutoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{k} = %s" for k in update])
        cursor.execute(
            f"UPDATE orcamento_config_produtos SET {set_clause} WHERE id = %s",
            list(update.values()) + [item_id]
        )
        cursor.execute("SELECT * FROM orcamento_config_produtos WHERE id = %s", (item_id,))
        return cursor.fetchone()


@router.delete("/config/produtos-config/{item_id}", status_code=204)
async def excluir_config_produto(
    item_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM orcamento_config_produtos WHERE id = %s", (item_id,))


# ============================================================
# Campos Livres
# ============================================================

@router.get("/config/campos")
async def listar_campos(current_user: UserInDB = Depends(get_current_user)):
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config_campos ORDER BY ordem, id")
        return cursor.fetchall()


@router.post("/config/campos", status_code=201)
async def criar_campo(
    data: CampoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """INSERT INTO orcamento_config_campos
               (rotulo, tipo, opcoes, obrigatorio, ordem, ativo, usuario_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (data.rotulo, data.tipo, data.opcoes, data.obrigatorio,
             data.ordem, data.ativo, current_user.id)
        )
        cursor.execute("SELECT LAST_INSERT_ID()")
        new_id = cursor.fetchone()["LAST_INSERT_ID()"]
        cursor.execute("SELECT * FROM orcamento_config_campos WHERE id = %s", (new_id,))
        return cursor.fetchone()


@router.put("/config/campos/{campo_id}")
async def atualizar_campo(
    campo_id: int,
    data: CampoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{k} = %s" for k in update])
        cursor.execute(
            f"UPDATE orcamento_config_campos SET {set_clause} WHERE id = %s",
            list(update.values()) + [campo_id]
        )
        cursor.execute("SELECT * FROM orcamento_config_campos WHERE id = %s", (campo_id,))
        return cursor.fetchone()


@router.delete("/config/campos/{campo_id}", status_code=204)
async def excluir_campo(
    campo_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM orcamento_config_campos WHERE id = %s", (campo_id,))


# ============================================================
# Descontos por Quantidade
# ============================================================

@router.get("/config/descontos")
async def listar_descontos(current_user: UserInDB = Depends(get_current_user)):
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config_descontos ORDER BY quantidade_minima")
        return cursor.fetchall()


@router.post("/config/descontos", status_code=201)
async def criar_desconto(
    data: DescontoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """INSERT INTO orcamento_config_descontos
               (quantidade_minima, percentual_desconto, descricao, ativo, usuario_id)
               VALUES (%s, %s, %s, %s, %s)""",
            (data.quantidade_minima, data.percentual_desconto, data.descricao,
             data.ativo, current_user.id)
        )
        cursor.execute("SELECT LAST_INSERT_ID()")
        new_id = cursor.fetchone()["LAST_INSERT_ID()"]
        cursor.execute("SELECT * FROM orcamento_config_descontos WHERE id = %s", (new_id,))
        return cursor.fetchone()


@router.put("/config/descontos/{desconto_id}")
async def atualizar_desconto(
    desconto_id: int,
    data: DescontoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{k} = %s" for k in update])
        cursor.execute(
            f"UPDATE orcamento_config_descontos SET {set_clause} WHERE id = %s",
            list(update.values()) + [desconto_id]
        )
        cursor.execute("SELECT * FROM orcamento_config_descontos WHERE id = %s", (desconto_id,))
        return cursor.fetchone()


@router.delete("/config/descontos/{desconto_id}", status_code=204)
async def excluir_desconto(
    desconto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM orcamento_config_descontos WHERE id = %s", (desconto_id,))


# ============================================================
# Regras (endpoint público para uso no cálculo do frontend)
# ============================================================

@router.get("/regras")
async def get_regras(current_user: UserInDB = Depends(get_current_user)):
    """Retorna todas as regras ativas para cálculo no frontend."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM orcamento_config WHERE id = 1")
        config = cursor.fetchone() or {"preco_por_km": 0}

        cursor.execute("SELECT * FROM orcamento_config_periodos WHERE ativo = 1 ORDER BY data_inicio")
        periodos = cursor.fetchall()

        cursor.execute("SELECT * FROM orcamento_config_produtos WHERE ativo = 1 ORDER BY nome")
        produtos_config = cursor.fetchall()

        cursor.execute("SELECT * FROM orcamento_config_campos WHERE ativo = 1 ORDER BY ordem, id")
        campos = cursor.fetchall()

        cursor.execute("SELECT * FROM orcamento_config_descontos WHERE ativo = 1 ORDER BY quantidade_minima")
        descontos = cursor.fetchall()

    return {
        "preco_por_km": float(config["preco_por_km"]) if config else 0,
        "periodos": periodos,
        "produtos_config": produtos_config,
        "campos": campos,
        "descontos": descontos
    }


@router.get("/produtos-disponiveis")
async def get_produtos_disponiveis(current_user: UserInDB = Depends(get_current_user)):
    """Retorna produtos com estoque disponível e flag ativo para seleção no orçamento."""
    with get_db_cursor() as cursor:
        cursor.execute(
            """SELECT id, codigo, nome, preco_venda, estoque_atual, caminho_imagem
               FROM produtos
               WHERE ativo = 1 AND estoque_atual > 0
               ORDER BY nome"""
        )
        return cursor.fetchall()


# ============================================================
# Orçamentos
# ============================================================

@router.get("/")
async def listar_orcamentos(current_user: UserInDB = Depends(get_current_user)):
    """Lista todos os orçamentos. Admin vê todos, vendedor vê apenas os seus."""
    with get_db_cursor() as cursor:
        if current_user.nivel_acesso == "admin":
            cursor.execute(
                """SELECT o.*, v.nome as vendedor_nome
                   FROM orcamentos o
                   LEFT JOIN vendedores v ON o.vendedor_id = v.id
                   ORDER BY o.criado_em DESC"""
            )
        else:
            # Tenta encontrar o vendedor vinculado a este usuário
            cursor.execute(
                "SELECT id FROM vendedores WHERE usuario_id = %s", (current_user.id,)
            )
            vendedor = cursor.fetchone()
            vendedor_id = vendedor["id"] if vendedor else -1
            cursor.execute(
                """SELECT o.*, v.nome as vendedor_nome
                   FROM orcamentos o
                   LEFT JOIN vendedores v ON o.vendedor_id = v.id
                   WHERE o.vendedor_id = %s OR o.usuario_id = %s
                   ORDER BY o.criado_em DESC""",
                (vendedor_id, current_user.id)
            )
        return cursor.fetchall()


@router.get("/{orcamento_id}")
async def get_orcamento(orcamento_id: int, current_user: UserInDB = Depends(get_current_user)):
    """Retorna o detalhe de um orçamento com seus itens."""
    with get_db_cursor() as cursor:
        cursor.execute(
            """SELECT o.*, v.nome as vendedor_nome
               FROM orcamentos o
               LEFT JOIN vendedores v ON o.vendedor_id = v.id
               WHERE o.id = %s""",
            (orcamento_id,)
        )
        orcamento = cursor.fetchone()
        if not orcamento:
            raise HTTPException(status_code=404, detail="Orçamento não encontrado")

        cursor.execute(
            "SELECT * FROM orcamento_itens WHERE orcamento_id = %s",
            (orcamento_id,)
        )
        itens = cursor.fetchall()

        result = dict(orcamento)
        result["itens"] = itens
        return result


@router.post("/", status_code=201)
async def criar_orcamento(
    data: OrcamentoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria um novo orçamento com cálculo automático."""
    if not data.itens:
        raise HTTPException(status_code=400, detail="O orçamento deve ter pelo menos um item")

    now = datetime.now()

    with get_db_cursor() as cursor:
        # Busca configuração
        cursor.execute("SELECT * FROM orcamento_config WHERE id = 1")
        config = cursor.fetchone() or {"preco_por_km": 0}
        preco_por_km = float(config["preco_por_km"]) if config else 0

        # Busca períodos ativos
        cursor.execute(
            """SELECT * FROM orcamento_config_periodos
               WHERE ativo = 1 AND data_inicio <= %s AND data_fim >= %s""",
            (now.date(), now.date())
        )
        periodos = cursor.fetchall()

        # Verifica se hora atual está dentro de algum período
        periodo_ativo = None
        for p in periodos:
            hora_inicio = p["hora_inicio"] if isinstance(p["hora_inicio"], str) else str(p["hora_inicio"])
            hora_fim = p["hora_fim"] if isinstance(p["hora_fim"], str) else str(p["hora_fim"])
            hora_atual = now.strftime("%H:%M:%S")
            if hora_inicio <= hora_atual <= hora_fim:
                periodo_ativo = p
                break

        # Busca descontos ativos
        cursor.execute(
            "SELECT * FROM orcamento_config_descontos WHERE ativo = 1 ORDER BY quantidade_minima DESC"
        )
        descontos = cursor.fetchall()

    # Cálculo
    valor_produtos = sum(item.preco_unitario * item.quantidade for item in data.itens)
    total_quantidade = sum(item.quantidade for item in data.itens)

    # Adicional de período
    valor_adicional_periodo = 0
    periodo_id = None
    if periodo_ativo:
        valor_adicional_periodo = float(periodo_ativo["valor_adicional"])
        periodo_id = periodo_ativo["id"]

    # Custo de entrega
    valor_km = 0
    if data.tipo_entrega == "entrega":
        valor_km = round(data.km_entrega * preco_por_km, 2)

    # Desconto por quantidade
    desconto_percentual = 0
    for desconto in descontos:
        if total_quantidade >= desconto["quantidade_minima"]:
            desconto_percentual = float(desconto["percentual_desconto"])
            break

    desconto_aplicado = round(valor_produtos * desconto_percentual / 100, 2)
    valor_total = round(valor_produtos - desconto_aplicado + valor_adicional_periodo + valor_km, 2)

    # Monta o detalhamento do cálculo
    linhas_calculo = [f"Subtotal dos produtos: R$ {valor_produtos:.2f}"]
    if desconto_aplicado > 0:
        linhas_calculo.append(
            f"Desconto por quantidade ({int(total_quantidade)} itens, {desconto_percentual}%): - R$ {desconto_aplicado:.2f}"
        )
    if valor_adicional_periodo > 0:
        linhas_calculo.append(
            f"Adicional de período '{periodo_ativo['nome']}': + R$ {valor_adicional_periodo:.2f}"
        )
    if valor_km > 0:
        linhas_calculo.append(
            f"Entrega ({data.km_entrega} km × R$ {preco_por_km:.2f}/km): + R$ {valor_km:.2f}"
        )
    linhas_calculo.append(f"TOTAL: R$ {valor_total:.2f}")
    calculo_detalhado = "\n".join(linhas_calculo)

    import json
    campos_livres_json = json.dumps(data.campos_livres) if data.campos_livres else None

    with get_db_cursor(commit=True) as cursor:
        # Gera código único
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        cursor.execute("SELECT COUNT(*) + 1 as seq FROM orcamentos WHERE YEAR(criado_em) = %s", (ano,))
        seq = cursor.fetchone()["seq"]
        codigo = f"ORC{ano}{seq:04d}"

        cursor.execute(
            """INSERT INTO orcamentos
               (codigo, vendedor_id, tipo_entrega, km_entrega, periodo_id,
                valor_adicional_periodo, preco_por_km_usado, valor_km,
                valor_produtos, desconto_percentual, desconto_aplicado,
                campos_livres, valor_total, calculo_detalhado, observacoes, usuario_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (codigo, data.vendedor_id, data.tipo_entrega, data.km_entrega, periodo_id,
             valor_adicional_periodo, preco_por_km, valor_km,
             valor_produtos, desconto_percentual, desconto_aplicado,
             campos_livres_json, valor_total, calculo_detalhado, data.observacoes, current_user.id)
        )
        cursor.execute("SELECT LAST_INSERT_ID()")
        orcamento_id = cursor.fetchone()["LAST_INSERT_ID()"]

        # Insere itens
        for item in data.itens:
            subtotal = round(item.preco_unitario * item.quantidade, 2)
            cursor.execute(
                """INSERT INTO orcamento_itens
                   (orcamento_id, produto_id, config_produto_id, nome_produto,
                    quantidade, preco_unitario, subtotal)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (orcamento_id, item.produto_id, item.config_produto_id,
                 item.nome_produto, item.quantidade, item.preco_unitario, subtotal)
            )

        cursor.execute("SELECT * FROM orcamentos WHERE id = %s", (orcamento_id,))
        novo = dict(cursor.fetchone())

        cursor.execute("SELECT * FROM orcamento_itens WHERE orcamento_id = %s", (orcamento_id,))
        novo["itens"] = cursor.fetchall()
        novo["calculo_detalhado"] = calculo_detalhado

    return novo


@router.delete("/{orcamento_id}", status_code=204)
async def excluir_orcamento(
    orcamento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui um orçamento (somente admin)."""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores")
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM orcamento_itens WHERE orcamento_id = %s", (orcamento_id,))
        cursor.execute("DELETE FROM orcamentos WHERE id = %s", (orcamento_id,))
