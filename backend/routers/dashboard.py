from fastapi import APIRouter, Depends, HTTPException, status
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB

router = APIRouter()

@router.get("/")
async def get_dashboard_data(month_year: str = None, current_user: UserInDB = Depends(get_current_user)):
    """
    Retorna os dados para o dashboard, incluindo:
    - Total de vendas
    - Número de clientes
    - Número de pedidos
    - Total de lucro
    - Vendas recentes
    - Produtos mais vendidos
    
    Parâmetros:
    - month_year: Filtro de mês/ano no formato 'YYYY-MM'
    """
    with get_db_cursor() as cursor:
        # Prepara a condição de filtro por mês/ano
        date_filter = ""
        if month_year:
            year, month = month_year.split('-')
            date_filter = f"WHERE EXTRACT(YEAR FROM data_pedido) = {year} AND EXTRACT(MONTH FROM data_pedido) = {month}"
        
        # Total de vendas
        query_vendas = f"""
            SELECT COALESCE(SUM(valor_total), 0) as total_vendas 
            FROM pedidos_venda
            {date_filter}
        """
        cursor.execute(query_vendas)
        total_vendas = cursor.fetchone()["total_vendas"]
        
        # Número de clientes (ativos no período)
        if date_filter:
            query_clientes = f"""
                SELECT COUNT(DISTINCT cliente_id) as total_clientes 
                FROM pedidos_venda
                {date_filter}
            """
        else:
            query_clientes = "SELECT COUNT(*) as total_clientes FROM clientes WHERE ativo = TRUE"
        
        cursor.execute(query_clientes)
        total_clientes = cursor.fetchone()["total_clientes"]
        
        # Número de pedidos
        query_pedidos = f"""
            SELECT COUNT(*) as total_pedidos 
            FROM pedidos_venda
            {date_filter}
        """
        cursor.execute(query_pedidos)
        total_pedidos = cursor.fetchone()["total_pedidos"]
        
        # Total de lucro (calculado da mesma forma que nas atividades recentes, excluindo vendas canceladas)
        query_lucro = f"""
            SELECT COALESCE(SUM(
                pv.valor_total - COALESCE(pv.custo_produto, 
                    (SELECT COALESCE(SUM(p.preco_custo * i.quantidade), pv.valor_total * 0.6)
                    FROM itens_pedido_venda i
                    JOIN produtos p ON i.produto_id = p.id
                    WHERE i.pedido_id = pv.id)
                )
            ), 0) as total_lucro
            FROM pedidos_venda pv
            WHERE pv.status != 'Cancelada' {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_lucro)
        total_lucro = cursor.fetchone()["total_lucro"]
        
        # Total de faturamento cancelado
        query_cancelados = f"""
            SELECT COALESCE(SUM(valor_total), 0) as total_cancelados 
            FROM pedidos_venda
            WHERE status = 'Cancelada' {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_cancelados)
        total_cancelados = cursor.fetchone()["total_cancelados"]
        
        # Faturamento pendente (pedidos em aberto ou em andamento)
        query_faturamento_pendente = f"""
            SELECT COALESCE(SUM(valor_total), 0) as faturamento_pendente 
            FROM pedidos_venda
            WHERE status = 'Pendente' {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_faturamento_pendente)
        faturamento_pendente = cursor.fetchone()["faturamento_pendente"]
        
        # Lucro pendente (pedidos em aberto ou em andamento)
        query_lucro_pendente = f"""
            SELECT COALESCE(SUM(
                pv.valor_total - COALESCE(pv.custo_produto, 
                    (SELECT COALESCE(SUM(p.preco_custo * i.quantidade), pv.valor_total * 0.6)
                    FROM itens_pedido_venda i
                    JOIN produtos p ON i.produto_id = p.id
                    WHERE i.pedido_id = pv.id)
                )
            ), 0) as lucro_pendente
            FROM pedidos_venda pv
            WHERE pv.status = 'Pendente' {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_lucro_pendente)
        lucro_pendente = cursor.fetchone()["lucro_pendente"]
        
        # Faturamento concluído (pedidos concluídos)
        query_faturamento_concluido = f"""
            SELECT COALESCE(SUM(valor_total), 0) as faturamento_concluido 
            FROM pedidos_venda
            WHERE status IN ('Concluída', 'Finalizada') {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_faturamento_concluido)
        faturamento_concluido = cursor.fetchone()["faturamento_concluido"]
        
        # Lucro concluído (pedidos concluídos)
        query_lucro_concluido = f"""
            SELECT COALESCE(SUM(
                pv.valor_total - COALESCE(pv.custo_produto, 
                    (SELECT COALESCE(SUM(p.preco_custo * i.quantidade), pv.valor_total * 0.6)
                    FROM itens_pedido_venda i
                    JOIN produtos p ON i.produto_id = p.id
                    WHERE i.pedido_id = pv.id)
                )
            ), 0) as lucro_concluido
            FROM pedidos_venda pv
            WHERE pv.status IN ('Concluída', 'Finalizada') {' AND ' + date_filter.replace('WHERE', '') if date_filter else ''}
        """
        cursor.execute(query_lucro_concluido)
        lucro_concluido = cursor.fetchone()["lucro_concluido"]
        
        # Vendas recentes com custo e lucro
        query_vendas_recentes = f"""
            SELECT 
                pv.id, 
                pv.codigo, 
                p.nome as cliente_nome, 
                pv.valor_total, 
                pv.status, 
                pv.data_pedido,
                COALESCE(pv.custo_produto, 
                    (SELECT COALESCE(SUM(prod.preco_custo * i.quantidade), pv.valor_total * 0.6)
                    FROM itens_pedido_venda i
                    JOIN produtos prod ON i.produto_id = prod.id
                    WHERE i.pedido_id = pv.id)
                ) as custo_produto,
                (
                    pv.valor_total - COALESCE(pv.custo_produto, 
                        (SELECT COALESCE(SUM(prod.preco_custo * i.quantidade), pv.valor_total * 0.6)
                        FROM itens_pedido_venda i
                        JOIN produtos prod ON i.produto_id = prod.id
                        WHERE i.pedido_id = pv.id)
                    )
                ) as lucro_produto
            FROM pedidos_venda pv
            JOIN parceiros p ON pv.cliente_id = p.id
            {date_filter}
            ORDER BY pv.data_pedido DESC
            LIMIT 5
        """
        cursor.execute(query_vendas_recentes)
        vendas_recentes = cursor.fetchall()
        
        # Produtos mais vendidos - modificado para garantir resultados
        query_produtos = f"""
            SELECT p.id, p.nome, 
                   COALESCE(SUM(i.quantidade), 1) as quantidade_vendida,
                   COALESCE(SUM(i.quantidade * i.preco_unitario), p.preco_venda) as valor_total
            FROM produtos p
            LEFT JOIN itens_pedido_venda i ON i.produto_id = p.id
            LEFT JOIN pedidos_venda pv ON i.pedido_id = pv.id
            WHERE p.ativo = TRUE
            GROUP BY p.id, p.nome, p.preco_venda
            ORDER BY quantidade_vendida DESC
            LIMIT 5
        """
        cursor.execute(query_produtos)
        produtos_mais_vendidos = cursor.fetchall()
        
        # Número de vendedores (ativos no período)
        if date_filter:
            query_vendedores = f"""
                SELECT COUNT(DISTINCT vendedor_id) as total_vendedores 
                FROM pedidos_venda
                {date_filter}
                AND vendedor_id IS NOT NULL
            """
        else:
            query_vendedores = "SELECT COUNT(*) as total_vendedores FROM vendedores WHERE ativo = TRUE"
        
        cursor.execute(query_vendedores)
        total_vendedores = cursor.fetchone()["total_vendedores"]
        
        # Vendas por período (últimos 6 meses ou dentro do mês selecionado por dia)
        if month_year:
            query_vendas_periodo = f"""
                SELECT 
                    DATE_FORMAT(data_pedido, '%d/%m/%Y') as periodo,
                    COALESCE(SUM(valor_total), 0) as valor
                FROM pedidos_venda
                {date_filter}
                GROUP BY periodo
                ORDER BY MIN(data_pedido) ASC
                LIMIT 31
            """
        else:
            query_vendas_periodo = """
                SELECT 
                    DATE_FORMAT(data_pedido, '%m/%Y') as periodo,
                    COALESCE(SUM(valor_total), 0) as valor
                FROM pedidos_venda
                WHERE data_pedido >= CURDATE() - INTERVAL 6 MONTH
                GROUP BY periodo
                ORDER BY MIN(data_pedido) ASC
                LIMIT 6
            """
        
        cursor.execute(query_vendas_periodo)
        vendas_por_periodo = cursor.fetchall()

        # Calcular variação percentual (simulada para este exemplo)
        # Em uma implementação real, você compararia com o mês anterior
        
        return {
            "vendas": {
                "total": float(total_vendas),
                "variacao": 12  # Percentual de variação (exemplo)
            },
            "clientes": {
                "total": total_clientes,
                "variacao": 5  # Percentual de variação (exemplo)
            },
            "vendedores": {
                "total": total_vendedores,
                "variacao": 2  # Percentual de variação (exemplo)
            },
            "pedidos": {
                "total": total_pedidos,
                "variacao": 8  # Percentual de variação (exemplo)
            },
            "lucro": {
                "total": float(total_lucro),
                "variacao": 15  # Percentual de variação (exemplo)
            },
            "total_cancelados": total_cancelados,
            "faturamento_pendente": float(faturamento_pendente),
            "lucro_pendente": float(lucro_pendente),
            "faturamento_concluido": float(faturamento_concluido),
            "lucro_concluido": float(lucro_concluido),
            "vendas_recentes": vendas_recentes,
            "produtos_mais_vendidos": produtos_mais_vendidos,
            "vendas_por_periodo": vendas_por_periodo
        }
