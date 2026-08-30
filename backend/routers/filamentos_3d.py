from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from datetime import datetime

router = APIRouter()

# ============================================
# Modelos Pydantic - Filamentos
# ============================================

class FilamentoBase(BaseModel):
    material: str
    cor: str
    cor_hex: Optional[str] = '#cccccc'
    peso_gramas: float = 1000
    descricao: Optional[str] = None

class FilamentoCreate(FilamentoBase):
    pass

class FilamentoUpdate(BaseModel):
    material: Optional[str] = None
    cor: Optional[str] = None
    cor_hex: Optional[str] = None
    peso_gramas: Optional[float] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None

class Filamento(FilamentoBase):
    id: int
    estoque_gramas: float
    preco_referencia: float
    ativo: bool
    cor_hex: Optional[str] = '#cccccc'
    usuario_id: Optional[int] = None
    data_cadastro: datetime
    data_atualizacao: datetime

# ============================================
# Modelos Pydantic - Compras
# ============================================

class CompraFilamentoCreate(BaseModel):
    filamento_id: int
    fornecedor_id: Optional[int] = None
    quantidade: int = 1
    valor_unitario: float = 0
    observacoes: Optional[str] = None

class CompraFilamento(BaseModel):
    id: int
    filamento_id: int
    fornecedor_id: Optional[int] = None
    quantidade: int
    valor_unitario: float
    valor_total: float
    observacoes: Optional[str] = None
    usuario_id: Optional[int] = None
    data_compra: datetime
    filamento_material: Optional[str] = None
    filamento_cor: Optional[str] = None
    fornecedor_nome: Optional[str] = None

# ============================================
# Modelos Pydantic - Custo Hora
# ============================================

class CustoHoraUpdate(BaseModel):
    valor_hora: float
    descricao: Optional[str] = None

class CustoHora(BaseModel):
    id: int
    valor_hora: float
    descricao: Optional[str] = None
    data_atualizacao: datetime

# ============================================
# Modelos Pydantic - Calculadora
# ============================================

class ItemCalculo(BaseModel):
    filamento_id: int
    gramas_utilizadas: float

class CalculoRequest(BaseModel):
    itens: List[ItemCalculo]
    horas: float = 0
    taxa_percentual: float = 0
    taxa_valor: float = 0

class CalculoResponse(BaseModel):
    custo_filamentos: float
    custo_horas: float
    subtotal: float
    taxa_percentual_valor: float
    taxa_valor: float
    custo_total: float
    valor_sugerido: float
    detalhes: list

class EfetivarRequest(BaseModel):
    itens: List[ItemCalculo]

# ============================================
# ENDPOINTS - Filamentos
# ============================================

@router.get("/filamentos", response_model=List[Filamento])
async def listar_filamentos(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todos os filamentos cadastrados."""
    query = "SELECT * FROM filamentos_3d WHERE 1=1"
    params = []

    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)

    query += " ORDER BY material, cor"

    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        filamentos = cursor.fetchall()

    return filamentos


@router.get("/filamentos/{filamento_id}", response_model=Filamento)
async def obter_filamento(
    filamento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém um filamento específico."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM filamentos_3d WHERE id = %s", (filamento_id,))
        filamento = cursor.fetchone()

    if not filamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filamento não encontrado"
        )

    return filamento


@router.post("/filamentos", response_model=Filamento, status_code=status.HTTP_201_CREATED)
async def criar_filamento(
    filamento: FilamentoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria um novo filamento."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO filamentos_3d (material, cor, cor_hex, peso_gramas, descricao, usuario_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (filamento.material, filamento.cor, filamento.cor_hex, filamento.peso_gramas,
             filamento.descricao, current_user.id)
        )

        cursor.execute("SELECT LAST_INSERT_ID()")
        filamento_id = cursor.fetchone()["LAST_INSERT_ID()"]

        cursor.execute("SELECT * FROM filamentos_3d WHERE id = %s", (filamento_id,))
        novo_filamento = cursor.fetchone()

    return novo_filamento


@router.put("/filamentos/{filamento_id}", response_model=Filamento)
async def atualizar_filamento(
    filamento_id: int,
    filamento: FilamentoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza um filamento."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM filamentos_3d WHERE id = %s", (filamento_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Filamento não encontrado"
            )

    update_data = {}
    if filamento.material is not None:
        update_data["material"] = filamento.material
    if filamento.cor is not None:
        update_data["cor"] = filamento.cor
    if filamento.peso_gramas is not None:
        update_data["peso_gramas"] = filamento.peso_gramas
    if filamento.descricao is not None:
        update_data["descricao"] = filamento.descricao
    if filamento.ativo is not None:
        update_data["ativo"] = filamento.ativo

    if update_data:
        with get_db_cursor(commit=True) as cursor:
            set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
            values = list(update_data.values())
            values.append(filamento_id)

            cursor.execute(f"UPDATE filamentos_3d SET {set_clause} WHERE id = %s", values)

            cursor.execute("SELECT * FROM filamentos_3d WHERE id = %s", (filamento_id,))
            filamento_atualizado = cursor.fetchone()

        return filamento_atualizado

    # If no update data, just return the existing filament
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM filamentos_3d WHERE id = %s", (filamento_id,))
        return cursor.fetchone()


@router.delete("/filamentos/{filamento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_filamento(
    filamento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui um filamento."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM filamentos_3d WHERE id = %s", (filamento_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Filamento não encontrado"
            )

    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM filamentos_3d WHERE id = %s", (filamento_id,))

    return None


# ============================================
# ENDPOINTS - Compras de Filamento
# ============================================

@router.get("/compras")
async def listar_compras(
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as compras de filamento."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT c.*, f.material as filamento_material, f.cor as filamento_cor,
                   p.nome as fornecedor_nome
            FROM compras_filamento_3d c
            LEFT JOIN filamentos_3d f ON c.filamento_id = f.id
            LEFT JOIN parceiros p ON c.fornecedor_id = p.id
            ORDER BY c.data_compra DESC
        """)
        compras = cursor.fetchall()

    return compras


@router.post("/compras", status_code=status.HTTP_201_CREATED)
async def registrar_compra(
    compra: CompraFilamentoCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Registra uma compra de filamento e atualiza o estoque."""
    # Verifica se o filamento existe
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM filamentos_3d WHERE id = %s", (compra.filamento_id,))
        filamento = cursor.fetchone()
        if not filamento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Filamento não encontrado"
            )

        # Verifica fornecedor se informado
        if compra.fornecedor_id:
            cursor.execute("SELECT id FROM parceiros WHERE id = %s", (compra.fornecedor_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Fornecedor não encontrado"
                )

    valor_total = compra.valor_unitario * compra.quantidade
    gramas_adicionadas = filamento["peso_gramas"] * compra.quantidade

    with get_db_cursor(commit=True) as cursor:
        # Registra a compra
        cursor.execute(
            """
            INSERT INTO compras_filamento_3d
                (filamento_id, fornecedor_id, quantidade, valor_unitario, valor_total, observacoes, usuario_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (compra.filamento_id, compra.fornecedor_id, compra.quantidade,
             compra.valor_unitario, valor_total, compra.observacoes, current_user.id)
        )

        # Atualiza o estoque do filamento (adiciona gramas)
        cursor.execute(
            """
            UPDATE filamentos_3d
            SET estoque_gramas = estoque_gramas + %s,
                preco_referencia = %s
            WHERE id = %s
            """,
            (gramas_adicionadas, compra.valor_unitario, compra.filamento_id)
        )

        # Retorna a compra criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        compra_id = cursor.fetchone()["LAST_INSERT_ID()"]

        cursor.execute("""
            SELECT c.*, f.material as filamento_material, f.cor as filamento_cor,
                   p.nome as fornecedor_nome
            FROM compras_filamento_3d c
            LEFT JOIN filamentos_3d f ON c.filamento_id = f.id
            LEFT JOIN parceiros p ON c.fornecedor_id = p.id
            WHERE c.id = %s
        """, (compra_id,))
        nova_compra = cursor.fetchone()

    return nova_compra


@router.delete("/compras/{compra_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_compra(
    compra_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui uma compra de filamento."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM compras_filamento_3d WHERE id = %s", (compra_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Compra não encontrada"
            )

    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM compras_filamento_3d WHERE id = %s", (compra_id,))

    return None


# ============================================
# ENDPOINTS - Custo Hora
# ============================================

@router.get("/custo-hora")
async def obter_custo_hora(
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém o custo por hora atual."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM custo_hora_3d ORDER BY id DESC LIMIT 1")
        custo = cursor.fetchone()

    if not custo:
        return {"id": 0, "valor_hora": 0, "descricao": "Nenhum custo hora configurado", "data_atualizacao": None}

    return custo


@router.put("/custo-hora")
async def atualizar_custo_hora(
    dados: CustoHoraUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza ou cria o custo por hora."""
    with get_db_cursor(commit=True) as cursor:
        # Verifica se já existe registro
        cursor.execute("SELECT id FROM custo_hora_3d LIMIT 1")
        existente = cursor.fetchone()

        if existente:
            cursor.execute(
                """
                UPDATE custo_hora_3d
                SET valor_hora = %s, descricao = %s, usuario_id = %s
                WHERE id = %s
                """,
                (dados.valor_hora, dados.descricao, current_user.id, existente["id"])
            )
        else:
            cursor.execute(
                """
                INSERT INTO custo_hora_3d (valor_hora, descricao, usuario_id)
                VALUES (%s, %s, %s)
                """,
                (dados.valor_hora, dados.descricao, current_user.id)
            )

        cursor.execute("SELECT * FROM custo_hora_3d ORDER BY id DESC LIMIT 1")
        custo = cursor.fetchone()

    return custo


# ============================================
# ENDPOINTS - Estoque
# ============================================

@router.get("/estoque")
async def listar_estoque(
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista o estoque disponível de todos os filamentos ativos."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, material, cor, peso_gramas, estoque_gramas, preco_referencia,
                   descricao, ativo
            FROM filamentos_3d
            WHERE ativo = TRUE
            ORDER BY material, cor
        """)
        estoque = cursor.fetchall()

    return estoque


class EstoqueUpdate(BaseModel):
    estoque_gramas: float


@router.put("/estoque/{filamento_id}")
async def atualizar_estoque(
    filamento_id: int,
    dados: EstoqueUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza o estoque de um filamento diretamente."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, material, cor FROM filamentos_3d WHERE id = %s", (filamento_id,))
        filamento = cursor.fetchone()
        if not filamento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Filamento não encontrado"
            )

    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE filamentos_3d SET estoque_gramas = %s WHERE id = %s",
            (dados.estoque_gramas, filamento_id)
        )
        cursor.execute(
            "SELECT id, material, cor, peso_gramas, estoque_gramas, preco_referencia, descricao, ativo FROM filamentos_3d WHERE id = %s",
            (filamento_id,)
        )
        return cursor.fetchone()


# ============================================
# ENDPOINTS - Calculadora
# ============================================

@router.post("/calcular")
async def calcular_custo(
    dados: CalculoRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Calcula o custo de uma impressão 3D."""
    # Obtém custo hora
    with get_db_cursor() as cursor:
        cursor.execute("SELECT valor_hora FROM custo_hora_3d ORDER BY id DESC LIMIT 1")
        custo_hora_row = cursor.fetchone()
        valor_hora = float(custo_hora_row["valor_hora"]) if custo_hora_row else 0

    custo_filamentos = 0
    detalhes = []

    with get_db_cursor() as cursor:
        for item in dados.itens:
            cursor.execute(
                "SELECT id, material, cor, peso_gramas, estoque_gramas, preco_referencia FROM filamentos_3d WHERE id = %s",
                (item.filamento_id,)
            )
            filamento = cursor.fetchone()

            if not filamento:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Filamento ID {item.filamento_id} não encontrado"
                )

            # Custo por grama = preço_referência / peso_gramas
            preco_por_grama = 0
            if filamento["peso_gramas"] > 0 and filamento["preco_referencia"] > 0:
                preco_por_grama = float(filamento["preco_referencia"]) / float(filamento["peso_gramas"])

            custo_item = preco_por_grama * item.gramas_utilizadas
            custo_filamentos += custo_item

            detalhes.append({
                "filamento_id": filamento["id"],
                "material": filamento["material"],
                "cor": filamento["cor"],
                "gramas_utilizadas": item.gramas_utilizadas,
                "preco_por_grama": round(preco_por_grama, 4),
                "custo_item": round(custo_item, 2),
                "estoque_disponivel": float(filamento["estoque_gramas"])
            })

    # Custo de horas
    custo_horas = valor_hora * dados.horas

    # Subtotal
    subtotal = custo_filamentos + custo_horas

    # Taxas
    taxa_percentual_valor = subtotal * (dados.taxa_percentual / 100)
    taxa_valor = dados.taxa_valor

    # Custo total
    custo_total = subtotal + taxa_percentual_valor + taxa_valor

    # Valor sugerido (50% de margem sobre o custo total)
    valor_sugerido = custo_total * 1.5

    return {
        "custo_filamentos": round(custo_filamentos, 2),
        "custo_horas": round(custo_horas, 2),
        "valor_hora": round(valor_hora, 2),
        "subtotal": round(subtotal, 2),
        "taxa_percentual": dados.taxa_percentual,
        "taxa_percentual_valor": round(taxa_percentual_valor, 2),
        "taxa_valor": round(taxa_valor, 2),
        "custo_total": round(custo_total, 2),
        "valor_sugerido": round(valor_sugerido, 2),
        "detalhes": detalhes
    }


@router.post("/efetivar")
async def efetivar_calculo(
    dados: EfetivarRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Efetiva o cálculo, deduzindo gramas do estoque dos filamentos usados."""
    resultados = []

    with get_db_cursor(commit=True) as cursor:
        for item in dados.itens:
            # Verifica estoque
            cursor.execute(
                "SELECT id, material, cor, estoque_gramas FROM filamentos_3d WHERE id = %s",
                (item.filamento_id,)
            )
            filamento = cursor.fetchone()

            if not filamento:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Filamento ID {item.filamento_id} não encontrado"
                )

            estoque_atual = float(filamento["estoque_gramas"])
            if estoque_atual < item.gramas_utilizadas:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Estoque insuficiente para {filamento['material']} {filamento['cor']}. "
                           f"Disponível: {estoque_atual}g, Necessário: {item.gramas_utilizadas}g"
                )

            # Deduz do estoque
            cursor.execute(
                """
                UPDATE filamentos_3d
                SET estoque_gramas = estoque_gramas - %s
                WHERE id = %s
                """,
                (item.gramas_utilizadas, item.filamento_id)
            )

            resultados.append({
                "filamento_id": filamento["id"],
                "material": filamento["material"],
                "cor": filamento["cor"],
                "gramas_deduzidas": item.gramas_utilizadas,
                "estoque_anterior": estoque_atual,
                "estoque_novo": round(estoque_atual - item.gramas_utilizadas, 2)
            })

    return {
        "sucesso": True,
        "mensagem": "Estoque atualizado com sucesso",
        "resultados": resultados
    }
