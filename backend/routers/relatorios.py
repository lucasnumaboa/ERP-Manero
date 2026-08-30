from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB

router = APIRouter()

# Modelos Pydantic
class ProdutoVendido(BaseModel):
    codigo: str
    nome: str
    categoria_id: Optional[int] = None
    categoria_nome: Optional[str] = None
    plataforma_nome: Optional[str] = None
    quantidade: int
    preco_custo: float
    preco_venda: float
    valor_venda_total: float
    custo_total: float
    comissao_proporcional: float
    lucro_total: float
    margem_lucro: float

class ComissaoVendedor(BaseModel):
    vendedor: str
    total_vendas: int
    valor_total_vendas: float
    comissao_total: float

class ProdutoComprado(BaseModel):
    codigo: str
    nome: str
    fornecedor: str
    tipo_produto: Optional[str] = None
    quantidade: int
    preco_compra: float
    valor_total_compra: float

class ControleLancamentoResumo(BaseModel):
    id: int
    data: str
    tipo: str
    categoria_nome: Optional[str] = None
    descricao: str
    valor: float

class ResumoRelatorio(BaseModel):
    total_pedidos_venda: int
    faturamento_total: float
    total_pedidos_compra: int
    valor_total_compras: float
    lucro_total: float
    lucro_total_ajustado: float
    ajuste_controle: float
    margem_lucro: float

class RelatorioCompleto(BaseModel):
    periodo: dict
    resumo: ResumoRelatorio
    produtos_vendidos: List[ProdutoVendido]
    comissoes_vendedores: List[ComissaoVendedor]
    produtos_comprados: List[ProdutoComprado]
    lancamentos_controle: List[ControleLancamentoResumo]

# Rotas
@router.get("/completo", response_model=RelatorioCompleto)
async def relatorio_completo(
    data_inicio: date,
    data_fim: date,
    plataforma_id: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna um relatório completo com:
    - Resumo geral (vendas, compras, lucro)
    - Produtos vendidos no período
    - Comissões dos vendedores
    - Produtos comprados no período
    
    Parâmetros:
    - data_inicio: Data inicial do período (YYYY-MM-DD)
    - data_fim: Data final do período (YYYY-MM-DD)
    """
    
    with get_db_cursor() as cursor:
        # ===== RESUMO GERAL =====
        
        # Total de pedidos de venda e faturamento
        query_vendas = """
            SELECT 
                COUNT(*) as total_pedidos,
                COALESCE(SUM(valor_total), 0) as faturamento_total
            FROM pedidos_venda
            WHERE DATE(data_pedido) >= %s AND DATE(data_pedido) <= %s
                AND LOWER(status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND status IS NOT NULL
        """
        params_vendas = [data_inicio, data_fim]
        
        if plataforma_id:
            query_vendas += " AND plataforma_id = %s"
            params_vendas.append(plataforma_id)
        
        if vendedor_id:
            query_vendas += " AND vendedor_id = %s"
            params_vendas.append(vendedor_id)
        
        cursor.execute(query_vendas, params_vendas)
        
        vendas_result = cursor.fetchone()
        total_pedidos_venda = vendas_result["total_pedidos"]
        faturamento_total = float(vendas_result["faturamento_total"])
        
        # Total de pedidos de compra e valor total
        cursor.execute("""
            SELECT 
                COUNT(*) as total_pedidos,
                COALESCE(SUM(valor_total), 0) as valor_total
            FROM pedidos_compra
            WHERE DATE(data_pedido) >= %s AND DATE(data_pedido) <= %s
                AND LOWER(status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND status IS NOT NULL
        """, (data_inicio, data_fim))
        
        compras_result = cursor.fetchone()
        total_pedidos_compra = compras_result["total_pedidos"]
        valor_total_compras = float(compras_result["valor_total"])
        
        # Lucro total (vendas - custo dos produtos - comissões dos vendedores)
        query_lucro = """
            SELECT COALESCE(SUM(
                COALESCE(pv.valor_total, 0) - 
                COALESCE((
                    SELECT COALESCE(SUM(COALESCE(ipv.custo_item, p.preco_custo) * ipv.quantidade), 0)
                    FROM itens_pedido_venda ipv
                    JOIN produtos p ON ipv.produto_id = p.id
                    WHERE ipv.pedido_id = pv.id
                ), 0) -
                COALESCE(pv.comissao_total, 0)
            ), 0) as lucro_total
            FROM pedidos_venda pv
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND LOWER(pv.status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND pv.status IS NOT NULL
        """
        params_lucro = [data_inicio, data_fim]
        
        if plataforma_id:
            query_lucro += " AND pv.plataforma_id = %s"
            params_lucro.append(plataforma_id)
        
        if vendedor_id:
            query_lucro += " AND pv.vendedor_id = %s"
            params_lucro.append(vendedor_id)
        
        cursor.execute(query_lucro, params_lucro)
        
        lucro_result = cursor.fetchone()
        lucro_total = float(lucro_result["lucro_total"])
        
        # ===== LANÇAMENTOS DE CONTROLE FINANCEIRO =====
        
        cursor.execute("""
            SELECT
                cl.id,
                cl.data,
                cl.tipo,
                cc.nome AS categoria_nome,
                cl.descricao,
                cl.valor
            FROM controle_lancamentos cl
            LEFT JOIN controle_categorias cc ON cl.categoria_id = cc.id
            WHERE cl.data >= %s AND cl.data <= %s
            ORDER BY cl.data ASC
        """, (data_inicio, data_fim))
        
        lancamentos_raw = cursor.fetchall()
        lancamentos_controle = []
        ajuste_controle = 0.0
        
        for lanc in lancamentos_raw:
            valor_lanc = float(lanc["valor"])
            if lanc["tipo"] == "lucro":
                ajuste_controle += valor_lanc
            else:
                ajuste_controle -= valor_lanc
            lancamentos_controle.append(ControleLancamentoResumo(
                id=lanc["id"],
                data=lanc["data"].isoformat() if lanc["data"] else "",
                tipo=lanc["tipo"],
                categoria_nome=lanc["categoria_nome"],
                descricao=lanc["descricao"],
                valor=valor_lanc
            ))
        
        lucro_total_ajustado = lucro_total + ajuste_controle
        
        # Margem de lucro (sobre o lucro já ajustado)
        margem_lucro = (lucro_total_ajustado / faturamento_total * 100) if faturamento_total > 0 else 0
        
        # ===== PRODUTOS VENDIDOS =====
        
        query_produtos = """
            SELECT 
                p.codigo,
                p.nome,
                p.categoria_id,
                cat.nome as categoria_nome,
                plat.nome as plataforma_nome,
                SUM(ipv.quantidade) as quantidade,
                SUM(ipv.quantidade * COALESCE(ipv.custo_item, p.preco_custo)) / SUM(ipv.quantidade) as preco_custo_medio,
                AVG(ipv.preco_unitario) as preco_venda,
                SUM(ipv.quantidade * ipv.preco_unitario) as valor_venda_total,
                SUM(ipv.quantidade * COALESCE(ipv.custo_item, p.preco_custo)) as custo_total,
                SUM(CASE WHEN pv.valor_total > 0 THEN pv.comissao_total * (ipv.quantidade * ipv.preco_unitario) / pv.valor_total ELSE 0 END) as comissao_proporcional
            FROM itens_pedido_venda ipv
            JOIN produtos p ON ipv.produto_id = p.id
            JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
            LEFT JOIN plataformas_venda plat ON pv.plataforma_id = plat.id
            LEFT JOIN categorias_produtos cat ON p.categoria_id = cat.id
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND LOWER(pv.status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND pv.status IS NOT NULL
        """
        params_produtos = [data_inicio, data_fim]
        
        if plataforma_id:
            query_produtos += " AND pv.plataforma_id = %s"
            params_produtos.append(plataforma_id)
        
        if vendedor_id:
            query_produtos += " AND pv.vendedor_id = %s"
            params_produtos.append(vendedor_id)
        
        query_produtos += " GROUP BY p.id, p.codigo, p.nome, p.categoria_id, cat.nome, plat.nome ORDER BY quantidade DESC"
        
        cursor.execute(query_produtos, params_produtos)
        
        produtos_vendidos_raw = cursor.fetchall()
        produtos_vendidos = []
        
        for produto in produtos_vendidos_raw:
            valor_venda_total = float(produto["valor_venda_total"])
            custo_total = float(produto["custo_total"])
            comissao_proporcional = float(produto["comissao_proporcional"] or 0)
            
            # Cálculo CORRETO: Lucro = Venda - Custo - Comissão
            lucro = valor_venda_total - custo_total - comissao_proporcional
            
            # Margem = (Lucro / Venda) * 100
            margem = (lucro / valor_venda_total * 100) if valor_venda_total > 0 else 0
            
            produtos_vendidos.append(ProdutoVendido(
                codigo=produto["codigo"],
                nome=produto["nome"],
                categoria_id=produto["categoria_id"],
                categoria_nome=produto["categoria_nome"],
                plataforma_nome=produto["plataforma_nome"],
                quantidade=int(produto["quantidade"]),
                preco_custo=float(produto["preco_custo_medio"]),
                preco_venda=float(produto["preco_venda"]),
                valor_venda_total=valor_venda_total,
                custo_total=custo_total,
                comissao_proporcional=comissao_proporcional,
                lucro_total=lucro,
                margem_lucro=round(margem, 2)
            ))
        
        # ===== COMISSÕES DOS VENDEDORES =====
        
        query_comissoes = """
            SELECT 
                v.nome as vendedor,
                COUNT(pv.id) as total_vendas,
                SUM(pv.valor_total) as valor_total_vendas,
                SUM(pv.comissao_total) as comissao_total
            FROM pedidos_venda pv
            LEFT JOIN vendedores v ON pv.vendedor_id = v.id
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND LOWER(pv.status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND pv.status IS NOT NULL
                AND pv.vendedor_id IS NOT NULL
        """
        params_comissoes = [data_inicio, data_fim]
        
        if plataforma_id:
            query_comissoes += " AND pv.plataforma_id = %s"
            params_comissoes.append(plataforma_id)
        
        if vendedor_id:
            query_comissoes += " AND pv.vendedor_id = %s"
            params_comissoes.append(vendedor_id)
        
        query_comissoes += " GROUP BY pv.vendedor_id, v.nome ORDER BY valor_total_vendas DESC"
        
        cursor.execute(query_comissoes, params_comissoes)
        
        comissoes_raw = cursor.fetchall()
        comissoes_vendedores = []
        
        for comissao in comissoes_raw:
            comissoes_vendedores.append(ComissaoVendedor(
                vendedor=comissao["vendedor"] or "Sem vendedor",
                total_vendas=int(comissao["total_vendas"]),
                valor_total_vendas=float(comissao["valor_total_vendas"]),
                comissao_total=float(comissao["comissao_total"] or 0)
            ))
        
        # ===== PRODUTOS COMPRADOS =====
        
        cursor.execute("""
            SELECT 
                p.codigo,
                p.nome,
                f.nome as fornecedor,
                p.tipo_produto,
                SUM(ipc.quantidade) as quantidade,
                AVG(ipc.preco_unitario) as preco_compra,
                SUM(ipc.quantidade * ipc.preco_unitario) as valor_total_compra
            FROM itens_pedido_compra ipc
            JOIN produtos p ON ipc.produto_id = p.id
            JOIN pedidos_compra pc ON ipc.pedido_id = pc.id
            LEFT JOIN parceiros f ON pc.fornecedor_id = f.id
            WHERE DATE(pc.data_pedido) >= %s AND DATE(pc.data_pedido) <= %s
                AND LOWER(pc.status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND pc.status IS NOT NULL
            GROUP BY p.id, p.codigo, p.nome, p.tipo_produto, pc.fornecedor_id, f.nome
            ORDER BY quantidade DESC
        """, (data_inicio, data_fim))
        
        produtos_comprados_raw = cursor.fetchall()
        produtos_comprados = []
        
        for produto in produtos_comprados_raw:
            produtos_comprados.append(ProdutoComprado(
                codigo=produto["codigo"],
                nome=produto["nome"],
                fornecedor=produto["fornecedor"] or "Sem fornecedor",
                tipo_produto=produto["tipo_produto"],
                quantidade=int(produto["quantidade"]),
                preco_compra=float(produto["preco_compra"]),
                valor_total_compra=float(produto["valor_total_compra"])
            ))
    
    return RelatorioCompleto(
        periodo={
            "data_inicio": data_inicio.isoformat(),
            "data_fim": data_fim.isoformat()
        },
        resumo=ResumoRelatorio(
            total_pedidos_venda=total_pedidos_venda,
            faturamento_total=faturamento_total,
            total_pedidos_compra=total_pedidos_compra,
            valor_total_compras=valor_total_compras,
            lucro_total=lucro_total,
            lucro_total_ajustado=round(lucro_total_ajustado, 2),
            ajuste_controle=round(ajuste_controle, 2),
            margem_lucro=round(margem_lucro, 2)
        ),
        produtos_vendidos=produtos_vendidos,
        comissoes_vendedores=comissoes_vendedores,
        produtos_comprados=produtos_comprados,
        lancamentos_controle=lancamentos_controle
    )


# ===== RELATÓRIO DE VENDAS POR REGIÃO =====

class VendaPorEstado(BaseModel):
    estado: str
    sigla: str
    total_vendas: int
    valor_total: float
    quantidade_produtos: int

class ProdutoPorEstado(BaseModel):
    codigo: str
    nome: str
    quantidade: int
    valor_total: float

class DetalheEstado(BaseModel):
    estado: str
    sigla: str
    total_vendas: int
    valor_total: float
    produtos: List[ProdutoPorEstado]

class RelatorioVendasRegiao(BaseModel):
    periodo: dict
    vendas_por_estado: List[VendaPorEstado]
    total_geral: float
    estados_com_venda: int

@router.get("/vendas-por-regiao")
async def relatorio_vendas_por_regiao(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    plataforma_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna um relatório de vendas agrupadas por estado/região.
    Inclui total de vendas, valor e quantidade de produtos por estado.
    """
    
    # Mapeamento de siglas para nomes completos dos estados
    estados_brasil = {
        'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas',
        'BA': 'Bahia', 'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo',
        'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul',
        'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
        'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte',
        'RS': 'Rio Grande do Sul', 'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina',
        'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
    }
    
    with get_db_cursor() as cursor:
        # Query para vendas por estado
        query = """
            SELECT 
                UPPER(TRIM(p.estado)) as estado,
                COUNT(DISTINCT pv.id) as total_vendas,
                COALESCE(SUM(pv.valor_total), 0) as valor_total,
                COALESCE(SUM(ipv.quantidade), 0) as quantidade_produtos
            FROM pedidos_venda pv
            JOIN parceiros p ON pv.cliente_id = p.id
            LEFT JOIN itens_pedido_venda ipv ON pv.id = ipv.pedido_id
            WHERE pv.status NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND p.estado IS NOT NULL 
                AND TRIM(p.estado) != ''
        """
        params = []
        
        if data_inicio:
            query += " AND DATE(pv.data_pedido) >= %s"
            params.append(data_inicio)
        
        if data_fim:
            query += " AND DATE(pv.data_pedido) <= %s"
            params.append(data_fim)
        
        if plataforma_id:
            query += " AND pv.plataforma_id = %s"
            params.append(plataforma_id)
        
        query += " GROUP BY UPPER(TRIM(p.estado)) ORDER BY valor_total DESC"
        
        cursor.execute(query, params)
        vendas_raw = cursor.fetchall()
        
        vendas_por_estado = []
        total_geral = 0
        
        for venda in vendas_raw:
            sigla = venda["estado"]
            if sigla and len(sigla) == 2:
                nome_estado = estados_brasil.get(sigla.upper(), sigla)
                valor = float(venda["valor_total"])
                total_geral += valor
                
                vendas_por_estado.append({
                    "estado": nome_estado,
                    "sigla": sigla.upper(),
                    "total_vendas": int(venda["total_vendas"]),
                    "valor_total": valor,
                    "quantidade_produtos": int(venda["quantidade_produtos"])
                })
    
    return {
        "periodo": {
            "data_inicio": data_inicio.isoformat() if data_inicio else None,
            "data_fim": data_fim.isoformat() if data_fim else None
        },
        "vendas_por_estado": vendas_por_estado,
        "total_geral": total_geral,
        "estados_com_venda": len(vendas_por_estado)
    }


# ===== RELATÓRIO DE ESTOQUE =====

class ProdutoEstoque(BaseModel):
    id: int
    codigo: str
    nome: str
    categoria_nome: Optional[str] = None
    estoque_atual: int
    preco_custo: float
    custo_total: float
    preco_venda: float
    valor_venda_total: float
    preco_medio_venda: Optional[float] = None
    qtd_vendida: int
    comissao_percentual: float
    valorizacao_simulada: float
    valorizacao_real: Optional[float] = None
    margem_simulada: float
    margem_real: Optional[float] = None
    giro_estoque: Optional[float] = None

class ResumoEstoque(BaseModel):
    total_produtos: int
    total_itens: int
    custo_total_estoque: float
    valor_venda_total_estoque: float
    valorizacao_simulada_total: float
    valorizacao_real_total: float
    margem_media_simulada: float
    margem_media_real: float

class RelatorioEstoque(BaseModel):
    resumo: ResumoEstoque
    produtos: List[ProdutoEstoque]

@router.get("/estoque", response_model=RelatorioEstoque)
async def relatorio_estoque(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna um relatório completo de estoque com:
    - Produtos faturáveis com estoque > 0
    - Custo unitário e total
    - Valor de venda e valor médio vendido
    - Valorização simulada (venda - comissão - custo)
    - Valorização real (média vendida - comissão - custo)
    - Giro de estoque
    """
    
    with get_db_cursor() as cursor:
        # Busca produtos faturáveis com estoque > 0
        cursor.execute("""
            SELECT 
                p.id,
                p.codigo,
                p.nome,
                c.nome as categoria_nome,
                p.estoque_atual,
                p.preco_custo,
                p.preco_venda,
                COALESCE(p.comissao, 0) as comissao_percentual
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            WHERE p.faturavel = TRUE 
                AND p.estoque_atual > 0
                AND p.ativo = TRUE
            ORDER BY p.estoque_atual DESC, p.nome ASC
        """)
        
        produtos_raw = cursor.fetchall()
        produtos = []
        
        total_custo = 0
        total_valor_venda = 0
        total_valorizacao_simulada = 0
        total_valorizacao_real = 0
        total_itens = 0
        soma_margem_simulada = 0
        soma_margem_real = 0
        produtos_com_venda = 0
        
        # Primeira passagem: calcular margem média real dos produtos com vendas
        margem_real_total = 0
        produtos_com_venda_temp = 0
        
        for prod in produtos_raw:
            produto_id = prod["id"]
            preco_custo = float(prod["preco_custo"])
            comissao_pct = float(prod["comissao_percentual"] or 0)
            
            # Busca histórico de vendas para calcular preço médio
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(ipv.quantidade), 0) as qtd_vendida,
                    COALESCE(AVG(ipv.preco_unitario), 0) as preco_medio
                FROM itens_pedido_venda ipv
                JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
                WHERE ipv.produto_id = %s
                    AND pv.status NOT IN ('cancelada', 'cancelado', 'devolvido')
            """, (produto_id,))
            
            vendas_result = cursor.fetchone()
            qtd_vendida = int(vendas_result["qtd_vendida"]) if vendas_result["qtd_vendida"] else 0
            preco_medio_venda = float(vendas_result["preco_medio"]) if vendas_result["preco_medio"] and qtd_vendida > 0 else None
            
            if preco_medio_venda and preco_medio_venda > 0:
                # Comissão é valor em reais (não percentual)
                comissao_valor_real = comissao_pct  # Já é o valor em reais
                valorizacao_unitaria_real = preco_medio_venda - comissao_valor_real - preco_custo
                margem_real_temp = (valorizacao_unitaria_real / preco_medio_venda * 100) if preco_medio_venda > 0 else 0
                margem_real_total += margem_real_temp
                produtos_com_venda_temp += 1
        
        # Calcula margem média real para usar em produtos sem vendas
        margem_media_real_calculada = (margem_real_total / produtos_com_venda_temp) if produtos_com_venda_temp > 0 else 0
        
        # Segunda passagem: processar todos os produtos
        for prod in produtos_raw:
            produto_id = prod["id"]
            estoque = int(prod["estoque_atual"])
            preco_custo = float(prod["preco_custo"])
            preco_venda = float(prod["preco_venda"])
            comissao_pct = float(prod["comissao_percentual"] or 0)
            
            # Calcula custo total
            custo_total = estoque * preco_custo
            
            # Calcula valor de venda total (potencial)
            valor_venda_total = estoque * preco_venda
            
            # Busca histórico de vendas para calcular preço médio
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(ipv.quantidade), 0) as qtd_vendida,
                    COALESCE(AVG(ipv.preco_unitario), 0) as preco_medio
                FROM itens_pedido_venda ipv
                JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
                WHERE ipv.produto_id = %s
                    AND pv.status NOT IN ('cancelada', 'cancelado', 'devolvido')
            """, (produto_id,))
            
            vendas_result = cursor.fetchone()
            qtd_vendida = int(vendas_result["qtd_vendida"]) if vendas_result["qtd_vendida"] else 0
            preco_medio_venda = float(vendas_result["preco_medio"]) if vendas_result["preco_medio"] and qtd_vendida > 0 else None
            
            # Comissão é valor em reais (não percentual)
            comissao_valor_simulada = comissao_pct  # Já é o valor em reais
            
            # Valorização simulada (por unidade): preço venda - comissão - custo
            valorizacao_unitaria_simulada = preco_venda - comissao_valor_simulada - preco_custo
            valorizacao_simulada = valorizacao_unitaria_simulada * estoque
            
            # Margem simulada (%)
            margem_simulada = (valorizacao_unitaria_simulada / preco_venda * 100) if preco_venda > 0 else 0
            
            # Valorização real (se teve vendas) ou estimada (se não teve)
            valorizacao_real = None
            margem_real = None
            if preco_medio_venda and preco_medio_venda > 0:
                # Produto com vendas: usa preço médio real
                # Comissão é valor em reais (não percentual)
                comissao_valor_real = comissao_pct  # Já é o valor em reais
                valorizacao_unitaria_real = preco_medio_venda - comissao_valor_real - preco_custo
                valorizacao_real = valorizacao_unitaria_real * estoque
                margem_real = (valorizacao_unitaria_real / preco_medio_venda * 100) if preco_medio_venda > 0 else 0
                soma_margem_real += margem_real
                produtos_com_venda += 1
                total_valorizacao_real += valorizacao_real
            else:
                # Produto sem vendas: estima usando preço_custo * margem_média_real
                # Fórmula: valorização_estimada = preço_custo * (margem_média_real / 100) * estoque
                if margem_media_real_calculada > 0:
                    valorizacao_unitaria_estimada = preco_custo * (margem_media_real_calculada / 100)
                    valorizacao_real = valorizacao_unitaria_estimada * estoque
                    margem_real = margem_media_real_calculada
                    total_valorizacao_real += valorizacao_real
            
            # Giro de estoque (qtd vendida / estoque atual)
            giro_estoque = (qtd_vendida / estoque) if estoque > 0 else None
            
            # Acumula totais
            total_custo += custo_total
            total_valor_venda += valor_venda_total
            total_valorizacao_simulada += valorizacao_simulada
            total_itens += estoque
            soma_margem_simulada += margem_simulada
            
            produtos.append(ProdutoEstoque(
                id=produto_id,
                codigo=prod["codigo"],
                nome=prod["nome"],
                categoria_nome=prod["categoria_nome"],
                estoque_atual=estoque,
                preco_custo=round(preco_custo, 2),
                custo_total=round(custo_total, 2),
                preco_venda=round(preco_venda, 2),
                valor_venda_total=round(valor_venda_total, 2),
                preco_medio_venda=round(preco_medio_venda, 2) if preco_medio_venda else None,
                qtd_vendida=qtd_vendida,
                comissao_percentual=round(comissao_pct, 2),
                valorizacao_simulada=round(valorizacao_simulada, 2),
                valorizacao_real=round(valorizacao_real, 2) if valorizacao_real is not None else None,
                margem_simulada=round(margem_simulada, 2),
                margem_real=round(margem_real, 2) if margem_real is not None else None,
                giro_estoque=round(giro_estoque, 2) if giro_estoque is not None else None
            ))
        
        # Calcula médias
        total_produtos = len(produtos)
        margem_media_simulada = (soma_margem_simulada / total_produtos) if total_produtos > 0 else 0
        margem_media_real = (soma_margem_real / produtos_com_venda) if produtos_com_venda > 0 else 0
    
    return RelatorioEstoque(
        resumo=ResumoEstoque(
            total_produtos=total_produtos,
            total_itens=total_itens,
            custo_total_estoque=round(total_custo, 2),
            valor_venda_total_estoque=round(total_valor_venda, 2),
            valorizacao_simulada_total=round(total_valorizacao_simulada, 2),
            valorizacao_real_total=round(total_valorizacao_real, 2),
            margem_media_simulada=round(margem_media_simulada, 2),
            margem_media_real=round(margem_media_real, 2)
        ),
        produtos=produtos
    )


@router.get("/vendas-por-regiao/{sigla_estado}")
async def detalhe_vendas_estado(
    sigla_estado: str,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    plataforma_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna os produtos mais vendidos em um estado específico.
    """
    
    estados_brasil = {
        'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas',
        'BA': 'Bahia', 'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo',
        'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul',
        'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
        'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte',
        'RS': 'Rio Grande do Sul', 'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina',
        'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
    }
    
    sigla = sigla_estado.upper()
    nome_estado = estados_brasil.get(sigla, sigla)
    
    with get_db_cursor() as cursor:
        # Query para produtos vendidos no estado
        query = """
            SELECT 
                prod.codigo,
                prod.nome,
                SUM(ipv.quantidade) as quantidade,
                SUM(ipv.quantidade * ipv.preco_unitario) as valor_total
            FROM pedidos_venda pv
            JOIN parceiros p ON pv.cliente_id = p.id
            JOIN itens_pedido_venda ipv ON pv.id = ipv.pedido_id
            JOIN produtos prod ON ipv.produto_id = prod.id
            WHERE pv.status NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND UPPER(TRIM(p.estado)) = %s
        """
        params = [sigla]
        
        if data_inicio:
            query += " AND DATE(pv.data_pedido) >= %s"
            params.append(data_inicio)
        
        if data_fim:
            query += " AND DATE(pv.data_pedido) <= %s"
            params.append(data_fim)
        
        if plataforma_id:
            query += " AND pv.plataforma_id = %s"
            params.append(plataforma_id)
        
        query += " GROUP BY prod.id, prod.codigo, prod.nome ORDER BY quantidade DESC LIMIT 20"
        
        cursor.execute(query, params)
        produtos_raw = cursor.fetchall()
        
        # Resumo do estado
        query_resumo = """
            SELECT 
                COUNT(DISTINCT pv.id) as total_vendas,
                COALESCE(SUM(pv.valor_total), 0) as valor_total
            FROM pedidos_venda pv
            JOIN parceiros p ON pv.cliente_id = p.id
            WHERE pv.status NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND UPPER(TRIM(p.estado)) = %s
        """
        params_resumo = [sigla]
        
        if data_inicio:
            query_resumo += " AND DATE(pv.data_pedido) >= %s"
            params_resumo.append(data_inicio)
        
        if data_fim:
            query_resumo += " AND DATE(pv.data_pedido) <= %s"
            params_resumo.append(data_fim)
        
        if plataforma_id:
            query_resumo += " AND pv.plataforma_id = %s"
            params_resumo.append(plataforma_id)
        
        cursor.execute(query_resumo, params_resumo)
        resumo = cursor.fetchone()
        
        produtos = []
        for prod in produtos_raw:
            produtos.append({
                "codigo": prod["codigo"],
                "nome": prod["nome"],
                "quantidade": int(prod["quantidade"]),
                "valor_total": float(prod["valor_total"])
            })
    
    return {
        "estado": nome_estado,
        "sigla": sigla,
        "total_vendas": int(resumo["total_vendas"]) if resumo else 0,
        "valor_total": float(resumo["valor_total"]) if resumo else 0,
        "produtos": produtos
    }


# ===== RELATÓRIO DE PRODUTOS MENSAIS =====

class ProdutoMensal(BaseModel):
    id: int
    codigo: str
    nome: str
    categoria_id: Optional[int] = None
    categoria_nome: Optional[str] = None
    quantidade_mensal: List[int]  # [jan, fev, mar, ..., dez] - 12 elementos
    faturamento_mensal: List[float]  # [jan, fev, mar, ..., dez] - 12 elementos
    lucro_mensal: List[float]  # [jan, fev, mar, ..., dez] - 12 elementos
    quantidade_total: int
    faturamento_total: float
    lucro_total: float

class RelatorioProdutosMensais(BaseModel):
    periodo: dict
    produtos: List[ProdutoMensal]

@router.get("/produtos-mensais", response_model=RelatorioProdutosMensais)
async def relatorio_produtos_mensais(
    data_inicio: date,
    data_fim: date,
    categoria_id: Optional[int] = None,
    nome_produto: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna um relatório de produtos com dados mensais:
    - Quantidade vendida por mês (Jan a Dez)
    - Faturamento por mês (Jan a Dez)
    - Lucro por mês (Jan a Dez)
    
    Os dados são agrupados apenas pelo mês, ignorando o ano.
    Ordenado por nome do produto.
    
    Parâmetros:
    - data_inicio: Data inicial do período
    - data_fim: Data final do período
    - categoria_id: (opcional) Filtrar por categoria/grupo
    - nome_produto: (opcional) Filtrar por nome do produto (contém)
    """
    
    with get_db_cursor() as cursor:
        # Query para buscar vendas agrupadas por produto e mês
        query = """
            SELECT 
                p.id as produto_id,
                p.codigo,
                p.nome,
                p.categoria_id,
                c.nome as categoria_nome,
                MONTH(pv.data_pedido) as mes,
                SUM(ipv.quantidade) as quantidade,
                SUM(ipv.quantidade * ipv.preco_unitario) as faturamento,
                SUM(ipv.quantidade * COALESCE(ipv.custo_item, p.preco_custo)) as custo_total,
                SUM(CASE 
                    WHEN pv.valor_total > 0 
                    THEN pv.comissao_total * (ipv.quantidade * ipv.preco_unitario) / pv.valor_total 
                    ELSE 0 
                END) as comissao_proporcional
            FROM itens_pedido_venda ipv
            JOIN produtos p ON ipv.produto_id = p.id
            JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND LOWER(pv.status) NOT IN ('cancelada', 'cancelado', 'devolvido')
                AND pv.status IS NOT NULL
        """
        params = [data_inicio, data_fim]
        
        if categoria_id:
            query += " AND p.categoria_id = %s"
            params.append(categoria_id)
        
        if nome_produto:
            query += " AND LOWER(p.nome) LIKE %s"
            params.append(f"%{nome_produto.lower()}%")
        
        query += " GROUP BY p.id, p.codigo, p.nome, p.categoria_id, c.nome, MONTH(pv.data_pedido)"
        query += " ORDER BY p.nome ASC, mes ASC"
        
        cursor.execute(query, params)
        vendas_raw = cursor.fetchall()
        
        # Organiza dados por produto
        produtos_dict = {}
        
        for row in vendas_raw:
            produto_id = row["produto_id"]
            mes = int(row["mes"])  # 1 a 12
            
            if produto_id not in produtos_dict:
                produtos_dict[produto_id] = {
                    "id": produto_id,
                    "codigo": row["codigo"],
                    "nome": row["nome"],
                    "categoria_id": row["categoria_id"],
                    "categoria_nome": row["categoria_nome"],
                    "quantidade_mensal": [0] * 12,  # Índice 0 = Jan, 11 = Dez
                    "faturamento_mensal": [0.0] * 12,
                    "lucro_mensal": [0.0] * 12,
                    "quantidade_total": 0,
                    "faturamento_total": 0.0,
                    "lucro_total": 0.0
                }
            
            # Índice do mês (0-based)
            idx = mes - 1
            
            quantidade = int(row["quantidade"])
            faturamento = float(row["faturamento"])
            custo = float(row["custo_total"])
            comissao = float(row["comissao_proporcional"] or 0)
            lucro = faturamento - custo - comissao
            
            produtos_dict[produto_id]["quantidade_mensal"][idx] += quantidade
            produtos_dict[produto_id]["faturamento_mensal"][idx] += faturamento
            produtos_dict[produto_id]["lucro_mensal"][idx] += lucro
            
            produtos_dict[produto_id]["quantidade_total"] += quantidade
            produtos_dict[produto_id]["faturamento_total"] += faturamento
            produtos_dict[produto_id]["lucro_total"] += lucro
        
        # Converte para lista ordenada por nome
        produtos = []
        for prod_data in sorted(produtos_dict.values(), key=lambda x: x["nome"]):
            produtos.append(ProdutoMensal(
                id=prod_data["id"],
                codigo=prod_data["codigo"],
                nome=prod_data["nome"],
                categoria_id=prod_data["categoria_id"],
                categoria_nome=prod_data["categoria_nome"],
                quantidade_mensal=prod_data["quantidade_mensal"],
                faturamento_mensal=[round(v, 2) for v in prod_data["faturamento_mensal"]],
                lucro_mensal=[round(v, 2) for v in prod_data["lucro_mensal"]],
                quantidade_total=prod_data["quantidade_total"],
                faturamento_total=round(prod_data["faturamento_total"], 2),
                lucro_total=round(prod_data["lucro_total"], 2)
            ))
    
    return RelatorioProdutosMensais(
        periodo={
            "data_inicio": data_inicio.isoformat(),
            "data_fim": data_fim.isoformat()
        },
        produtos=produtos
    )
