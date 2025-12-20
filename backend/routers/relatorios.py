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
    quantidade: int
    preco_compra: float
    valor_total_compra: float

class ResumoRelatorio(BaseModel):
    total_pedidos_venda: int
    faturamento_total: float
    total_pedidos_compra: int
    valor_total_compras: float
    lucro_total: float
    margem_lucro: float

class RelatorioCompleto(BaseModel):
    periodo: dict
    resumo: ResumoRelatorio
    produtos_vendidos: List[ProdutoVendido]
    comissoes_vendedores: List[ComissaoVendedor]
    produtos_comprados: List[ProdutoComprado]

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
                AND status NOT IN ('cancelada', 'cancelado')
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
                AND status NOT IN ('cancelada', 'cancelado')
        """, (data_inicio, data_fim))
        
        compras_result = cursor.fetchone()
        total_pedidos_compra = compras_result["total_pedidos"]
        valor_total_compras = float(compras_result["valor_total"])
        
        # Lucro total (vendas - custo dos produtos - comissões dos vendedores)
        query_lucro = """
            SELECT COALESCE(SUM(
                COALESCE(pv.valor_total, 0) - 
                COALESCE((
                    SELECT COALESCE(SUM(p.preco_custo * ipv.quantidade), 0)
                    FROM itens_pedido_venda ipv
                    JOIN produtos p ON ipv.produto_id = p.id
                    WHERE ipv.pedido_id = pv.id
                ), 0) -
                COALESCE(pv.comissao_total, 0)
            ), 0) as lucro_total
            FROM pedidos_venda pv
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND pv.status NOT IN ('cancelada', 'cancelado')
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
        
        # Margem de lucro
        margem_lucro = (lucro_total / faturamento_total * 100) if faturamento_total > 0 else 0
        
        # ===== PRODUTOS VENDIDOS =====
        
        query_produtos = """
            SELECT 
                p.codigo,
                p.nome,
                plat.nome as plataforma_nome,
                SUM(ipv.quantidade) as quantidade,
                p.preco_custo,
                AVG(ipv.preco_unitario) as preco_venda,
                SUM(ipv.quantidade * ipv.preco_unitario) as valor_venda_total,
                SUM(ipv.quantidade * p.preco_custo) as custo_total,
                SUM(CASE WHEN pv.valor_total > 0 THEN pv.comissao_total * (ipv.quantidade * ipv.preco_unitario) / pv.valor_total ELSE 0 END) as comissao_proporcional
            FROM itens_pedido_venda ipv
            JOIN produtos p ON ipv.produto_id = p.id
            JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
            LEFT JOIN plataformas_venda plat ON pv.plataforma_id = plat.id
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND pv.status NOT IN ('cancelada', 'cancelado')
        """
        params_produtos = [data_inicio, data_fim]
        
        if plataforma_id:
            query_produtos += " AND pv.plataforma_id = %s"
            params_produtos.append(plataforma_id)
        
        if vendedor_id:
            query_produtos += " AND pv.vendedor_id = %s"
            params_produtos.append(vendedor_id)
        
        query_produtos += " GROUP BY p.id, p.codigo, p.nome, p.preco_custo, plat.nome ORDER BY quantidade DESC"
        
        cursor.execute(query_produtos, params_produtos)
        
        produtos_vendidos_raw = cursor.fetchall()
        produtos_vendidos = []
        
        for produto in produtos_vendidos_raw:
            valor_venda_total = float(produto["valor_venda_total"])
            custo_total = float(produto["custo_total"])
            comissao_proporcional = float(produto["comissao_proporcional"] or 0)
            lucro = valor_venda_total - custo_total - comissao_proporcional
            margem = (lucro / valor_venda_total * 100) if valor_venda_total > 0 else 0
            
            produtos_vendidos.append(ProdutoVendido(
                codigo=produto["codigo"],
                nome=produto["nome"],
                plataforma_nome=produto["plataforma_nome"],
                quantidade=int(produto["quantidade"]),
                preco_custo=float(produto["preco_custo"]),
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
                AND pv.status NOT IN ('cancelada', 'cancelado')
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
                SUM(ipc.quantidade) as quantidade,
                AVG(ipc.preco_unitario) as preco_compra,
                SUM(ipc.quantidade * ipc.preco_unitario) as valor_total_compra
            FROM itens_pedido_compra ipc
            JOIN produtos p ON ipc.produto_id = p.id
            JOIN pedidos_compra pc ON ipc.pedido_id = pc.id
            LEFT JOIN parceiros f ON pc.fornecedor_id = f.id
            WHERE DATE(pc.data_pedido) >= %s AND DATE(pc.data_pedido) <= %s
                AND pc.status NOT IN ('cancelada', 'cancelado')
            GROUP BY p.id, p.codigo, p.nome, pc.fornecedor_id, f.nome
            ORDER BY quantidade DESC
        """, (data_inicio, data_fim))
        
        produtos_comprados_raw = cursor.fetchall()
        produtos_comprados = []
        
        for produto in produtos_comprados_raw:
            produtos_comprados.append(ProdutoComprado(
                codigo=produto["codigo"],
                nome=produto["nome"],
                fornecedor=produto["fornecedor"] or "Sem fornecedor",
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
            margem_lucro=round(margem_lucro, 2)
        ),
        produtos_vendidos=produtos_vendidos,
        comissoes_vendedores=comissoes_vendedores,
        produtos_comprados=produtos_comprados
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
            WHERE pv.status NOT IN ('cancelada', 'cancelado')
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
            WHERE pv.status NOT IN ('cancelada', 'cancelado')
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
            WHERE pv.status NOT IN ('cancelada', 'cancelado')
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
