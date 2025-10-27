from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class MovimentoCaixaBase(BaseModel):
    tipo: str  # 'entrada' ou 'saida'
    valor: float
    descricao: str
    data_movimento: Optional[date] = None
    documento_referencia: Optional[str] = None
    observacoes: Optional[str] = None

class MovimentoCaixaCreate(MovimentoCaixaBase):
    pass

class MovimentoCaixa(MovimentoCaixaBase):
    id: int
    data_registro: str
    usuario_id: int

class SaldoCaixa(BaseModel):
    saldo_atual: float
    entradas_periodo: float
    saidas_periodo: float
    saldo_periodo: float

# Rotas
@router.get("/movimentos", response_model=List[MovimentoCaixa])
async def listar_movimentos_caixa(
    tipo: Optional[str] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os movimentos de caixa cadastrados no sistema.
    Pode filtrar por tipo e período.
    """
    query = "SELECT * FROM movimentos_caixa WHERE 1=1"
    params = []
    
    if tipo is not None:
        query += " AND tipo = %s"
        params.append(tipo)
    
    if data_inicio is not None:
        query += " AND data_movimento >= %s"
        params.append(data_inicio)
    
    if data_fim is not None:
        query += " AND data_movimento <= %s"
        params.append(data_fim)
    
    query += " ORDER BY data_movimento DESC, data_registro DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        movimentos = cursor.fetchall()
    
    return movimentos

@router.get("/saldo", response_model=SaldoCaixa)
async def obter_saldo_caixa(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém o saldo atual do caixa e os totais de entradas e saídas no período especificado.
    Se não for especificado um período, considera o mês atual.
    """
    # Se não for especificado um período, usa o mês atual
    if data_inicio is None:
        hoje = datetime.now()
        data_inicio = date(hoje.year, hoje.month, 1)
    
    if data_fim is None:
        data_fim = date.today()
    
    with get_db_cursor() as cursor:
        # Calcula o saldo atual (todas as entradas menos todas as saídas)
        cursor.execute(
            """
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) as total_entradas,
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) as total_saidas
            FROM movimentos_caixa
            """
        )
        result = cursor.fetchone()
        saldo_atual = result["total_entradas"] - result["total_saidas"]
        
        # Calcula as entradas e saídas no período
        cursor.execute(
            """
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) as entradas_periodo,
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) as saidas_periodo
            FROM movimentos_caixa
            WHERE data_movimento BETWEEN %s AND %s
            """,
            (data_inicio, data_fim)
        )
        result_periodo = cursor.fetchone()
        entradas_periodo = result_periodo["entradas_periodo"]
        saidas_periodo = result_periodo["saidas_periodo"]
        saldo_periodo = entradas_periodo - saidas_periodo
    
    return {
        "saldo_atual": saldo_atual,
        "entradas_periodo": entradas_periodo,
        "saidas_periodo": saidas_periodo,
        "saldo_periodo": saldo_periodo
    }

@router.post("/movimentos", response_model=MovimentoCaixa, status_code=status.HTTP_201_CREATED)
async def criar_movimento_caixa(
    movimento: MovimentoCaixaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo movimento de caixa no sistema.
    """
    # Verifica se o tipo é válido
    if movimento.tipo not in ["entrada", "saida"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo inválido. Deve ser 'entrada' ou 'saida'"
        )
    
    # Verifica se o valor é válido
    if movimento.valor <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O valor deve ser maior que zero"
        )
    
    # Se não for fornecida uma data, usa a data atual
    data_movimento = movimento.data_movimento or date.today()
    
    # Cria o movimento de caixa
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO movimentos_caixa (
                tipo, valor, descricao, data_movimento,
                documento_referencia, observacoes, usuario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                movimento.tipo, movimento.valor, movimento.descricao,
                data_movimento, movimento.documento_referencia,
                movimento.observacoes, current_user.id
            )
        )
        
        # Obtém o ID do movimento criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        movimento_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados do movimento criado
        cursor.execute(
            "SELECT * FROM movimentos_caixa WHERE id = %s",
            (movimento_id,)
        )
        novo_movimento = cursor.fetchone()
    
    return novo_movimento

@router.get("/movimentos/{movimento_id}", response_model=MovimentoCaixa)
async def obter_movimento_caixa(
    movimento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um movimento de caixa específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM movimentos_caixa WHERE id = %s",
            (movimento_id,)
        )
        movimento = cursor.fetchone()
    
    if not movimento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movimento de caixa não encontrado"
        )
    
    return movimento

@router.delete("/movimentos/{movimento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_movimento_caixa(
    movimento_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um movimento de caixa do sistema.
    Apenas administradores podem excluir movimentos.
    """
    # Verifica se o usuário é administrador
    if not current_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem excluir movimentos de caixa"
        )
    
    # Verifica se o movimento existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM movimentos_caixa WHERE id = %s",
            (movimento_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Movimento de caixa não encontrado"
            )
    
    # Exclui o movimento
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM movimentos_caixa WHERE id = %s",
            (movimento_id,)
        )
    
    return None

@router.get("/relatorio", response_model=List[dict])
async def relatorio_caixa(
    data_inicio: date,
    data_fim: date,
    agrupar_por: str = "dia",
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório de movimentos de caixa agrupados por dia, semana ou mês.
    """
    # Verifica se o tipo de agrupamento é válido
    if agrupar_por not in ["dia", "semana", "mes"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de agrupamento inválido. Deve ser 'dia', 'semana' ou 'mes'"
        )
    
    # Define o formato de agrupamento com base no tipo
    if agrupar_por == "dia":
        group_format = "%Y-%m-%d"
        group_sql = "DATE(data_movimento)"
    elif agrupar_por == "semana":
        group_format = "%Y-%u"
        group_sql = "CONCAT(YEAR(data_movimento), '-', WEEK(data_movimento))"
    else:  # mes
        group_format = "%Y-%m"
        group_sql = "DATE_FORMAT(data_movimento, '%Y-%m')"
    
    with get_db_cursor() as cursor:
        cursor.execute(
            f"""
            SELECT 
                {group_sql} as periodo,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) as total_entradas,
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) as total_saidas,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) as saldo_periodo
            FROM movimentos_caixa
            WHERE data_movimento BETWEEN %s AND %s
            GROUP BY periodo
            ORDER BY MIN(data_movimento)
            """,
            (data_inicio, data_fim)
        )
        relatorio = cursor.fetchall()
    
    return relatorio
