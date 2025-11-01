from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class RelatorioBase(BaseModel):
    periodo_inicio: date
    periodo_fim: date

class RelatorioVendas(RelatorioBase):
    total_vendas: float
    quantidade_pedidos: int
    ticket_medio: float
    vendas_por_vendedor: Dict[str, float]
    vendas_por_cliente: Dict[str, float]
    vendas_por_produto: Dict[str, float]

class RelatorioCompras(RelatorioBase):
    total_compras: float
    quantidade_pedidos: int
    compras_por_fornecedor: Dict[str, float]
    compras_por_produto: Dict[str, float]

class RelatorioFinanceiro(RelatorioBase):
    total_contas_pagar: float
    total_contas_receber: float
    total_pago: float
    total_recebido: float
    saldo_periodo: float
    fluxo_caixa_diario: Dict[str, Dict[str, float]]

class RelatorioEstoque(RelatorioBase):
    total_produtos: int
    valor_total_estoque: float
    produtos_abaixo_minimo: List[Dict[str, Any]]
    movimentacoes_periodo: Dict[str, int]

class RelatorioGeral(RelatorioBase):
    leads: int
    estoque_valorizacao: float
    lucro: float
    faturamento_bruto: float
    faturamento_liquido: float

@router.get("/geral", response_model=RelatorioGeral)
async def relatorio_geral(
    data_inicio: date = Query(..., description="Data inicial do período"),
    data_fim: date = Query(..., description="Data final do período"),
    cliente_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório geral para o período especificado.
    Inclui leads, estoque, lucro e faturamento.
    """
    with get_db_cursor() as cursor:
        # Leads de clientes (propostas comerciais abertas)
        query_leads = """
        SELECT COUNT(*) as leads
        FROM propostas_comerciais
        WHERE data_proposta BETWEEN %s AND %s
        AND status = 'aberta'
        """
        params = [data_inicio, data_fim]
        if cliente_id:
            query_leads += " AND cliente_id = %s"
            params.append(cliente_id)
        cursor.execute(query_leads, params)
        leads = cursor.fetchone()["leads"] or 0

        # Valorização de estoque
        cursor.execute(
            "SELECT COALESCE(SUM(estoque_atual * preco_custo), 0) as valor_estoque FROM produtos"
        )
        estoque_valor = float(cursor.fetchone()["valor_estoque"] or 0)

        # Faturamento bruto e líquido
        cursor.execute(
            """
            SELECT
                COALESCE(SUM(valor_total + valor_desconto), 0) as faturamento_bruto,
                COALESCE(SUM(valor_total), 0) as faturamento_liquido
            FROM pedidos_venda
            WHERE data_pedido BETWEEN %s AND %s
            AND status != 'cancelado'
            """,
            (data_inicio, data_fim)
        )
        fat = cursor.fetchone()
        faturamento_bruto = float(fat["faturamento_bruto"] or 0)
        faturamento_liquido = float(fat["faturamento_liquido"] or 0)

        # Lucro
        cursor.execute(
            """
            SELECT COALESCE(SUM((p.preco_venda - p.preco_custo) * ip.quantidade), 0) as lucro
            FROM itens_pedido_venda ip
            JOIN produtos p ON ip.produto_id = p.id
            JOIN pedidos_venda pv ON ip.pedido_id = pv.id
            WHERE pv.data_pedido BETWEEN %s AND %s
            AND pv.status = 'finalizada'
            """,
            (data_inicio, data_fim)
        )
        lucro = float(cursor.fetchone()["lucro"] or 0)

    return {
        "periodo_inicio": data_inicio,
        "periodo_fim": data_fim,
        "leads": leads,
        "estoque_valorizacao": estoque_valor,
        "lucro": lucro,
        "faturamento_bruto": faturamento_bruto,
        "faturamento_liquido": faturamento_liquido
    }

# Rotas
@router.get("/vendas", response_model=RelatorioVendas)
async def relatorio_vendas(
    data_inicio: date = Query(..., description="Data inicial do período"),
    data_fim: date = Query(..., description="Data final do período"),
    vendedor_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório de vendas para o período especificado.
    Pode ser filtrado por vendedor e/ou cliente.
    """
    with get_db_cursor() as cursor:
        # Construir a consulta base
        query_base = """
        FROM pedidos_venda pv
        JOIN itens_pedido_venda pvi ON pv.id = pvi.pedido_id
        JOIN produtos p ON pvi.produto_id = p.id
        JOIN parceiros c ON pv.cliente_id = c.id
        LEFT JOIN vendedores v ON pv.vendedor_id = v.id
        
        WHERE pv.data_pedido BETWEEN %s AND %s
        AND pv.status != 'cancelado'
        """
        
        params = [data_inicio, data_fim]
        
        if vendedor_id:
            query_base += " AND pv.vendedor_id = %s"
            params.append(vendedor_id)
        
        if cliente_id:
            query_base += " AND pv.cliente_id = %s"
            params.append(cliente_id)
        
        # Total de vendas e quantidade de pedidos
        cursor.execute(
            f"""
            SELECT 
                COUNT(DISTINCT pv.id) as quantidade_pedidos,
                SUM(pvi.quantidade * pvi.preco_unitario) as total_vendas
            {query_base}
            """,
            params
        )
        result = cursor.fetchone()
        
        total_vendas = float(result["total_vendas"] or 0)
        quantidade_pedidos = result["quantidade_pedidos"] or 0
        ticket_medio = total_vendas / quantidade_pedidos if quantidade_pedidos > 0 else 0
        
        # Vendas por vendedor
        cursor.execute(
            f"""
            SELECT 
                v.nome as vendedor,
                SUM(pvi.quantidade * pvi.preco_unitario) as total
            {query_base}
            GROUP BY v.id, v.nome
            ORDER BY total DESC
            """,
            params
        )
        vendas_por_vendedor = {(row["vendedor"] or "Sem Vendedor"): float(row["total"] or 0) for row in cursor.fetchall()}
        
        # Vendas por cliente
        cursor.execute(
            f"""
            SELECT 
                c.nome as cliente,
                SUM(pvi.quantidade * pvi.preco_unitario) as total
            {query_base}
            GROUP BY c.id, c.nome
            ORDER BY total DESC
            LIMIT 10
            """,
            params
        )
        vendas_por_cliente = {row["cliente"]: float(row["total"]) for row in cursor.fetchall()}
        
        # Vendas por produto
        cursor.execute(
            f"""
            SELECT 
                p.nome as produto,
                SUM(pvi.quantidade * pvi.preco_unitario) as total
            {query_base}
            GROUP BY p.id, p.nome
            ORDER BY total DESC
            LIMIT 10
            """,
            params
        )
        vendas_por_produto = {row["produto"]: float(row["total"]) for row in cursor.fetchall()}
    
    return {
        "periodo_inicio": data_inicio,
        "periodo_fim": data_fim,
        "total_vendas": total_vendas,
        "quantidade_pedidos": quantidade_pedidos,
        "ticket_medio": ticket_medio,
        "vendas_por_vendedor": vendas_por_vendedor,
        "vendas_por_cliente": vendas_por_cliente,
        "vendas_por_produto": vendas_por_produto
    }

@router.get("/compras", response_model=RelatorioCompras)
async def relatorio_compras(
    data_inicio: date = Query(..., description="Data inicial do período"),
    data_fim: date = Query(..., description="Data final do período"),
    fornecedor_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório de compras para o período especificado.
    Pode ser filtrado por fornecedor.
    """
    with get_db_cursor() as cursor:
        # Construir a consulta base
        query_base = """
        FROM pedidos_compra pc
        JOIN pedidos_compra_itens pci ON pc.id = pci.pedido_id
        JOIN produtos p ON pci.produto_id = p.id
        JOIN parceiros f ON pc.fornecedor_id = f.id
        WHERE pc.data_pedido BETWEEN %s AND %s
        AND pc.status != 'cancelado'
        """
        
        params = [data_inicio, data_fim]
        
        if fornecedor_id:
            query_base += " AND pc.fornecedor_id = %s"
            params.append(fornecedor_id)
        
        # Total de compras e quantidade de pedidos
        cursor.execute(
            f"""
            SELECT 
                COUNT(DISTINCT pc.id) as quantidade_pedidos,
                SUM(pci.quantidade * pci.valor_unitario) as total_compras
            {query_base}
            """,
            params
        )
        result = cursor.fetchone()
        
        total_compras = float(result["total_compras"] or 0)
        quantidade_pedidos = result["quantidade_pedidos"] or 0
        
        # Compras por fornecedor
        cursor.execute(
            f"""
            SELECT 
                f.nome as fornecedor,
                SUM(pci.quantidade * pci.valor_unitario) as total
            {query_base}
            GROUP BY f.id, f.nome
            ORDER BY total DESC
            """,
            params
        )
        compras_por_fornecedor = {row["fornecedor"]: float(row["total"]) for row in cursor.fetchall()}
        
        # Compras por produto
        cursor.execute(
            f"""
            SELECT 
                p.nome as produto,
                SUM(pci.quantidade * pci.valor_unitario) as total
            {query_base}
            GROUP BY p.id, p.nome
            ORDER BY total DESC
            LIMIT 10
            """,
            params
        )
        compras_por_produto = {row["produto"]: float(row["total"]) for row in cursor.fetchall()}
    
    return {
        "periodo_inicio": data_inicio,
        "periodo_fim": data_fim,
        "total_compras": total_compras,
        "quantidade_pedidos": quantidade_pedidos,
        "compras_por_fornecedor": compras_por_fornecedor,
        "compras_por_produto": compras_por_produto
    }

@router.get("/financeiro", response_model=RelatorioFinanceiro)
async def relatorio_financeiro(
    data_inicio: date = Query(..., description="Data inicial do período"),
    data_fim: date = Query(..., description="Data final do período"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório financeiro para o período especificado,
    incluindo contas a pagar, contas a receber e fluxo de caixa.
    """
    with get_db_cursor() as cursor:
        # Total de contas a pagar no período
        cursor.execute(
            """
            SELECT 
                SUM(valor) as total_contas_pagar,
                SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END) as total_pago
            FROM contas_pagar
            WHERE data_vencimento BETWEEN %s AND %s
            """,
            (data_inicio, data_fim)
        )
        result_pagar = cursor.fetchone()
        total_contas_pagar = float(result_pagar["total_contas_pagar"] or 0)
        total_pago = float(result_pagar["total_pago"] or 0)
        
        # Total de contas a receber no período
        cursor.execute(
            """
            SELECT 
                SUM(valor) as total_contas_receber,
                SUM(CASE WHEN status = 'recebido' THEN valor ELSE 0 END) as total_recebido
            FROM contas_receber
            WHERE data_vencimento BETWEEN %s AND %s
            """,
            (data_inicio, data_fim)
        )
        result_receber = cursor.fetchone()
        total_contas_receber = float(result_receber["total_contas_receber"] or 0)
        total_recebido = float(result_receber["total_recebido"] or 0)
        
        # Saldo do período
        saldo_periodo = total_recebido - total_pago
        
        # Fluxo de caixa diário
        fluxo_caixa_diario = {}
        
        # Gerar lista de datas no período
        delta = data_fim - data_inicio
        for i in range(delta.days + 1):
            data_atual = data_inicio + timedelta(days=i)
            data_str = data_atual.strftime("%Y-%m-%d")
            fluxo_caixa_diario[data_str] = {"entradas": 0, "saidas": 0, "saldo": 0}
        
        # Obter movimentos de caixa no período
        cursor.execute(
            """
            SELECT 
                DATE_FORMAT(data_movimento, '%Y-%m-%d') as data,
                tipo,
                SUM(valor) as total
            FROM movimentos_caixa
            WHERE data_movimento BETWEEN %s AND %s
            GROUP BY data, tipo
            ORDER BY data
            """,
            (data_inicio, data_fim)
        )
        
        for row in cursor.fetchall():
            data = row["data"]
            if data in fluxo_caixa_diario:
                if row["tipo"] == "entrada":
                    fluxo_caixa_diario[data]["entradas"] = float(row["total"])
                else:
                    fluxo_caixa_diario[data]["saidas"] = float(row["total"])
                
                fluxo_caixa_diario[data]["saldo"] = (
                    fluxo_caixa_diario[data]["entradas"] - fluxo_caixa_diario[data]["saidas"]
                )
    
    return {
        "periodo_inicio": data_inicio,
        "periodo_fim": data_fim,
        "total_contas_pagar": total_contas_pagar,
        "total_contas_receber": total_contas_receber,
        "total_pago": total_pago,
        "total_recebido": total_recebido,
        "saldo_periodo": saldo_periodo,
        "fluxo_caixa_diario": fluxo_caixa_diario
    }

@router.get("/estoque", response_model=RelatorioEstoque)
async def relatorio_estoque(
    data_inicio: date = Query(..., description="Data inicial do período"),
    data_fim: date = Query(..., description="Data final do período"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Gera um relatório de estoque para o período especificado,
    incluindo valor total em estoque, produtos abaixo do mínimo
    e movimentações no período.
    """
    with get_db_cursor() as cursor:
        # Total de produtos e valor em estoque
        cursor.execute(
            """
            SELECT 
                COUNT(*) as total_produtos,
                SUM(p.preco_custo * COALESCE(e.quantidade, 0)) as valor_total_estoque
            FROM produtos p
            LEFT JOIN (
                SELECT produto_id, SUM(quantidade) as quantidade
                FROM estoque_movimentos
                GROUP BY produto_id
            ) e ON p.id = e.produto_id
            WHERE p.ativo = 1
            """
        )
        result = cursor.fetchone()
        total_produtos = result["total_produtos"]
        valor_total_estoque = float(result["valor_total_estoque"] or 0)
        
        # Produtos abaixo do estoque mínimo
        cursor.execute(
            """
            SELECT 
                p.id,
                p.codigo,
                p.nome,
                p.estoque_minimo,
                COALESCE(e.quantidade, 0) as quantidade_atual,
                p.preco_custo,
                p.preco_custo * COALESCE(e.quantidade, 0) as valor_em_estoque
            FROM produtos p
            LEFT JOIN (
                SELECT produto_id, SUM(quantidade) as quantidade
                FROM estoque_movimentos
                GROUP BY produto_id
            ) e ON p.id = e.produto_id
            WHERE p.ativo = 1
            AND COALESCE(e.quantidade, 0) < p.estoque_minimo
            ORDER BY (COALESCE(e.quantidade, 0) / p.estoque_minimo) ASC
            LIMIT 20
            """
        )
        produtos_abaixo_minimo = []
        for row in cursor.fetchall():
            produtos_abaixo_minimo.append({
                "id": row["id"],
                "codigo": row["codigo"],
                "nome": row["nome"],
                "estoque_minimo": row["estoque_minimo"],
                "quantidade_atual": row["quantidade_atual"],
                "preco_custo": float(row["preco_custo"]),
                "valor_em_estoque": float(row["valor_em_estoque"])
            })
        
        # Movimentações no período
        cursor.execute(
            """
            SELECT 
                tipo,
                COUNT(*) as quantidade
            FROM estoque_movimentos
            WHERE data_movimento BETWEEN %s AND %s
            GROUP BY tipo
            """,
            (data_inicio, data_fim)
        )
        movimentacoes_periodo = {row["tipo"]: row["quantidade"] for row in cursor.fetchall()}
    
    return {
        "periodo_inicio": data_inicio,
        "periodo_fim": data_fim,
        "total_produtos": total_produtos,
        "valor_total_estoque": valor_total_estoque,
        "produtos_abaixo_minimo": produtos_abaixo_minimo,
        "movimentacoes_periodo": movimentacoes_periodo
    }

@router.get("/dashboard", response_model=Dict[str, Any])
async def dashboard(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna dados consolidados para o dashboard principal do sistema.
    Inclui informações de vendas, compras, financeiro e estoque.
    """
    # Define o período para os últimos 30 dias
    data_fim = date.today()
    data_inicio = data_fim - timedelta(days=30)
    
    with get_db_cursor() as cursor:
        # Vendas do período
        cursor.execute(
            """
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(valor_total) as valor_total
            FROM pedidos_venda
            WHERE data_pedido BETWEEN %s AND %s
            AND status != 'cancelado'
            """,
            (data_inicio, data_fim)
        )
        vendas = cursor.fetchone()
        
        # Compras do período
        cursor.execute(
            """
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(valor_total) as valor_total
            FROM pedidos_compra
            WHERE data_pedido BETWEEN %s AND %s
            AND status != 'cancelado'
            """,
            (data_inicio, data_fim)
        )
        compras = cursor.fetchone()
        
        # Contas a pagar vencidas
        cursor.execute(
            """
            SELECT 
                COUNT(*) as quantidade,
                SUM(valor) as valor_total
            FROM contas_pagar
            WHERE data_vencimento < CURDATE()
            AND status = 'pendente'
            """
        )
        contas_pagar_vencidas = cursor.fetchone()
        
        # Contas a receber vencidas
        cursor.execute(
            """
            SELECT 
                COUNT(*) as quantidade,
                SUM(valor) as valor_total
            FROM contas_receber
            WHERE data_vencimento < CURDATE()
            AND status = 'pendente'
            """
        )
        contas_receber_vencidas = cursor.fetchone()
        
        # Saldo atual de caixa
        cursor.execute(
            """
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) as saldo_atual
            FROM movimentos_caixa
            """
        )
        saldo_caixa = cursor.fetchone()
        
        # Produtos com estoque crítico
        cursor.execute(
            """
            SELECT COUNT(*) as quantidade
            FROM produtos p
            LEFT JOIN (
                SELECT produto_id, SUM(quantidade) as quantidade
                FROM estoque_movimentos
                GROUP BY produto_id
            ) e ON p.id = e.produto_id
            WHERE p.ativo = 1
            AND COALESCE(e.quantidade, 0) < p.estoque_minimo
            """
        )
        produtos_criticos = cursor.fetchone()
        
        # Vendas por dia nos últimos 15 dias
        cursor.execute(
            """
            SELECT 
                DATE_FORMAT(data_pedido, '%Y-%m-%d') as data,
                COUNT(*) as quantidade,
                SUM(valor_total) as valor_total
            FROM pedidos_venda
            WHERE data_pedido BETWEEN %s AND %s
            AND status != 'cancelado'
            GROUP BY data
            ORDER BY data
            """,
            (data_fim - timedelta(days=15), data_fim)
        )
        vendas_por_dia = {}
        for i in range(15):
            data = (data_fim - timedelta(days=14-i)).strftime("%Y-%m-%d")
            vendas_por_dia[data] = {"quantidade": 0, "valor_total": 0}
            
        for row in cursor.fetchall():
            vendas_por_dia[row["data"]] = {
                "quantidade": row["quantidade"],
                "valor_total": float(row["valor_total"] or 0)
            }
    
    return {
        "periodo": {
            "inicio": data_inicio,
            "fim": data_fim
        },
        "vendas": {
            "total_pedidos": vendas["total_pedidos"],
            "valor_total": float(vendas["valor_total"] or 0)
        },
        "compras": {
            "total_pedidos": compras["total_pedidos"],
            "valor_total": float(compras["valor_total"] or 0)
        },
        "financeiro": {
            "contas_pagar_vencidas": {
                "quantidade": contas_pagar_vencidas["quantidade"],
                "valor_total": float(contas_pagar_vencidas["valor_total"] or 0)
            },
            "contas_receber_vencidas": {
                "quantidade": contas_receber_vencidas["quantidade"],
                "valor_total": float(contas_receber_vencidas["valor_total"] or 0)
            },
            "saldo_caixa": float(saldo_caixa["saldo_atual"])
        },
        "estoque": {
            "produtos_criticos": produtos_criticos["quantidade"]
        },
        "vendas_por_dia": vendas_por_dia
    }
