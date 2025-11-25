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
    quantidade: int
    preco_custo: float
    preco_venda: float
    valor_venda_total: float
    custo_total: float
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
        cursor.execute("""
            SELECT 
                COUNT(*) as total_pedidos,
                COALESCE(SUM(valor_total), 0) as faturamento_total
            FROM pedidos_venda
            WHERE DATE(data_pedido) >= %s AND DATE(data_pedido) <= %s
                AND status NOT IN ('cancelada', 'cancelado')
        """, (data_inicio, data_fim))
        
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
        cursor.execute("""
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
        """, (data_inicio, data_fim))
        
        lucro_result = cursor.fetchone()
        lucro_total = float(lucro_result["lucro_total"])
        
        # Margem de lucro
        margem_lucro = (lucro_total / faturamento_total * 100) if faturamento_total > 0 else 0
        
        # ===== PRODUTOS VENDIDOS =====
        
        cursor.execute("""
            SELECT 
                p.codigo,
                p.nome,
                SUM(ipv.quantidade) as quantidade,
                p.preco_custo,
                AVG(ipv.preco_unitario) as preco_venda,
                SUM(ipv.quantidade * ipv.preco_unitario) as valor_venda_total,
                SUM(ipv.quantidade * p.preco_custo) as custo_total,
                SUM(pv.comissao_total * (ipv.quantidade * ipv.preco_unitario) / pv.valor_total) as comissao_proporcional
            FROM itens_pedido_venda ipv
            JOIN produtos p ON ipv.produto_id = p.id
            JOIN pedidos_venda pv ON ipv.pedido_id = pv.id
            WHERE DATE(pv.data_pedido) >= %s AND DATE(pv.data_pedido) <= %s
                AND pv.status NOT IN ('cancelada', 'cancelado')
            GROUP BY p.id, p.codigo, p.nome, p.preco_custo
            ORDER BY quantidade DESC
        """, (data_inicio, data_fim))
        
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
                quantidade=int(produto["quantidade"]),
                preco_custo=float(produto["preco_custo"]),
                preco_venda=float(produto["preco_venda"]),
                valor_venda_total=valor_venda_total,
                custo_total=custo_total,
                lucro_total=lucro,
                margem_lucro=round(margem, 2)
            ))
        
        # ===== COMISSÕES DOS VENDEDORES =====
        
        cursor.execute("""
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
            GROUP BY pv.vendedor_id, v.nome
            ORDER BY valor_total_vendas DESC
        """, (data_inicio, data_fim))
        
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
