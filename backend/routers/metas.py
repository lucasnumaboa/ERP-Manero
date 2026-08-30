from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db_cursor
from auth import get_current_user

router = APIRouter()

# ==================== MODELOS PYDANTIC ====================

# Modelos para Metas de Vendedores
class MetaVendedorBase(BaseModel):
    vendedor_id: int
    mes: int
    ano: int
    meta_valor: float = 0
    meta_quantidade: int = 0
    ativo: bool = True

class MetaVendedorCreate(MetaVendedorBase):
    pass

class MetaVendedorUpdate(BaseModel):
    meta_valor: Optional[float] = None
    meta_quantidade: Optional[int] = None
    ativo: Optional[bool] = None

class MetaVendedor(MetaVendedorBase):
    id: int
    vendedor_nome: Optional[str] = None
    valor_vendido: Optional[float] = 0
    quantidade_vendida: Optional[int] = 0
    percentual_valor: Optional[float] = 0
    percentual_quantidade: Optional[float] = 0
    data_cadastro: Optional[datetime] = None
    data_atualizacao: Optional[datetime] = None

    class Config:
        from_attributes = True

# Modelos para Faixas de Premiação
class FaixaPremiacaoBase(BaseModel):
    nome: str
    tipo_meta: str = 'valor'  # valor, quantidade, percentual
    valor_minimo: float
    valor_maximo: Optional[float] = None
    bonus_percentual: float = 0
    bonus_fixo: float = 0
    descricao: Optional[str] = None
    ativo: bool = True
    ordem: int = 0

class FaixaPremiacaoCreate(FaixaPremiacaoBase):
    pass

class FaixaPremiacaoUpdate(BaseModel):
    nome: Optional[str] = None
    tipo_meta: Optional[str] = None
    valor_minimo: Optional[float] = None
    valor_maximo: Optional[float] = None
    bonus_percentual: Optional[float] = None
    bonus_fixo: Optional[float] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None
    ordem: Optional[int] = None

class FaixaPremiacao(FaixaPremiacaoBase):
    id: int
    data_cadastro: Optional[datetime] = None

    class Config:
        from_attributes = True

# Modelos para Premiações Realizadas
class PremiacaoRealizadaBase(BaseModel):
    vendedor_id: int
    faixa_premiacao_id: int
    mes: int
    ano: int
    valor_vendido: float
    quantidade_vendida: int
    valor_bonus: float
    status: str = 'pendente'
    observacoes: Optional[str] = None

class PremiacaoRealizadaCreate(PremiacaoRealizadaBase):
    pass

class PremiacaoRealizadaUpdate(BaseModel):
    status: Optional[str] = None
    data_pagamento: Optional[date] = None
    observacoes: Optional[str] = None

class PremiacaoRealizada(PremiacaoRealizadaBase):
    id: int
    vendedor_nome: Optional[str] = None
    faixa_nome: Optional[str] = None
    data_pagamento: Optional[date] = None
    data_cadastro: Optional[datetime] = None

    class Config:
        from_attributes = True

# Modelo para Dashboard de Metas
class VendedorMeta(BaseModel):
    vendedor_id: int
    vendedor_nome: str
    meta_valor: float
    meta_quantidade: int
    valor_vendido: float
    quantidade_vendida: int
    percentual_valor: float
    percentual_quantidade: float
    faixa_atingida: Optional[str] = None
    bonus_estimado: float = 0

# ==================== ENDPOINTS DE METAS ====================

@router.get("/", response_model=List[MetaVendedor])
async def listar_metas(
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    ativo: Optional[bool] = True,
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as metas de vendedores com filtros opcionais"""
    with get_db_cursor() as cursor:
        query = """
            SELECT 
                m.id, m.vendedor_id, m.mes, m.ano, 
                m.meta_valor, m.meta_quantidade, m.ativo,
                m.data_cadastro, m.data_atualizacao,
                v.nome as vendedor_nome
            FROM metas_vendedores m
            LEFT JOIN vendedores v ON m.vendedor_id = v.id
            WHERE 1=1
        """
        params = []
        
        if mes is not None:
            query += " AND m.mes = %s"
            params.append(mes)
        if ano is not None:
            query += " AND m.ano = %s"
            params.append(ano)
        if vendedor_id is not None:
            query += " AND m.vendedor_id = %s"
            params.append(vendedor_id)
        if ativo is not None:
            query += " AND m.ativo = %s"
            params.append(ativo)
        
        query += " ORDER BY m.ano DESC, m.mes DESC, v.nome"
        
        cursor.execute(query, params)
        metas = cursor.fetchall()
        
        # Para cada meta, calcular o valor vendido no período
        for meta in metas:
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(pv.valor_total), 0) as valor_vendido,
                    COALESCE(COUNT(pv.id), 0) as quantidade_vendida
                FROM pedidos_venda pv
                WHERE pv.vendedor_id = %s
                AND MONTH(pv.data_pedido) = %s
                AND YEAR(pv.data_pedido) = %s
                AND pv.status NOT IN ('Cancelada', 'Devolvido')
            """, (meta['vendedor_id'], meta['mes'], meta['ano']))
            vendas = cursor.fetchone()
            
            meta['valor_vendido'] = float(vendas['valor_vendido']) if vendas else 0
            meta['quantidade_vendida'] = int(vendas['quantidade_vendida']) if vendas else 0
            
            # Calcular percentuais
            if meta['meta_valor'] > 0:
                meta['percentual_valor'] = round((meta['valor_vendido'] / float(meta['meta_valor'])) * 100, 2)
            else:
                meta['percentual_valor'] = 0
                
            if meta['meta_quantidade'] > 0:
                meta['percentual_quantidade'] = round((meta['quantidade_vendida'] / meta['meta_quantidade']) * 100, 2)
            else:
                meta['percentual_quantidade'] = 0
        
        return metas

@router.get("/dashboard", response_model=List[VendedorMeta])
async def dashboard_metas(
    mes: int,
    ano: int,
    current_user: dict = Depends(get_current_user)
):
    """Retorna o dashboard de metas com todos os vendedores e seu progresso"""
    with get_db_cursor() as cursor:
        # Buscar todos os vendedores ativos
        cursor.execute("""
            SELECT id, nome FROM vendedores WHERE ativo = TRUE ORDER BY nome
        """)
        vendedores = cursor.fetchall()
        
        # Buscar faixas de premiação ativas
        cursor.execute("""
            SELECT * FROM faixas_premiacao WHERE ativo = TRUE ORDER BY ordem
        """)
        faixas = cursor.fetchall()
        
        resultado = []
        
        for vendedor in vendedores:
            # Buscar meta do vendedor para o período
            cursor.execute("""
                SELECT meta_valor, meta_quantidade
                FROM metas_vendedores
                WHERE vendedor_id = %s AND mes = %s AND ano = %s AND ativo = TRUE
            """, (vendedor['id'], mes, ano))
            meta = cursor.fetchone()
            
            meta_valor = float(meta['meta_valor']) if meta else 0
            meta_quantidade = int(meta['meta_quantidade']) if meta else 0
            
            # Buscar vendas do período
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(valor_total), 0) as valor_vendido,
                    COALESCE(COUNT(id), 0) as quantidade_vendida
                FROM pedidos_venda
                WHERE vendedor_id = %s
                AND MONTH(data_pedido) = %s
                AND YEAR(data_pedido) = %s
                AND status NOT IN ('Cancelada', 'Devolvido')
            """, (vendedor['id'], mes, ano))
            vendas = cursor.fetchone()
            
            valor_vendido = float(vendas['valor_vendido']) if vendas else 0
            quantidade_vendida = int(vendas['quantidade_vendida']) if vendas else 0
            
            # Calcular percentuais
            percentual_valor = round((valor_vendido / meta_valor) * 100, 2) if meta_valor > 0 else 0
            percentual_quantidade = round((quantidade_vendida / meta_quantidade) * 100, 2) if meta_quantidade > 0 else 0
            
            # Determinar faixa atingida e bônus
            faixa_atingida = None
            bonus_estimado = 0
            
            for faixa in faixas:
                valor_comparacao = 0
                if faixa['tipo_meta'] == 'valor':
                    valor_comparacao = valor_vendido
                elif faixa['tipo_meta'] == 'quantidade':
                    valor_comparacao = quantidade_vendida
                elif faixa['tipo_meta'] == 'percentual':
                    valor_comparacao = percentual_valor
                
                valor_min = float(faixa['valor_minimo'])
                valor_max = float(faixa['valor_maximo']) if faixa['valor_maximo'] else float('inf')
                
                if valor_min <= valor_comparacao <= valor_max:
                    faixa_atingida = faixa['nome']
                    bonus_percentual = float(faixa['bonus_percentual'])
                    bonus_fixo = float(faixa['bonus_fixo'])
                    bonus_estimado = (valor_vendido * bonus_percentual / 100) + bonus_fixo
            
            resultado.append({
                'vendedor_id': vendedor['id'],
                'vendedor_nome': vendedor['nome'],
                'meta_valor': meta_valor,
                'meta_quantidade': meta_quantidade,
                'valor_vendido': valor_vendido,
                'quantidade_vendida': quantidade_vendida,
                'percentual_valor': percentual_valor,
                'percentual_quantidade': percentual_quantidade,
                'faixa_atingida': faixa_atingida,
                'bonus_estimado': round(bonus_estimado, 2)
            })
        
        return resultado

@router.get("/{meta_id}", response_model=MetaVendedor)
async def obter_meta(meta_id: int, current_user: dict = Depends(get_current_user)):
    """Obtém uma meta específica por ID"""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT 
                m.id, m.vendedor_id, m.mes, m.ano, 
                m.meta_valor, m.meta_quantidade, m.ativo,
                m.data_cadastro, m.data_atualizacao,
                v.nome as vendedor_nome
            FROM metas_vendedores m
            LEFT JOIN vendedores v ON m.vendedor_id = v.id
            WHERE m.id = %s
        """, (meta_id,))
        meta = cursor.fetchone()
        
        if not meta:
            raise HTTPException(status_code=404, detail="Meta não encontrada")
        
        return meta

@router.post("/", response_model=MetaVendedor)
async def criar_meta(meta: MetaVendedorCreate, current_user: dict = Depends(get_current_user)):
    """Cria uma nova meta para um vendedor"""
    with get_db_cursor(commit=True) as cursor:
        # Verificar se já existe meta para este vendedor/mês/ano
        cursor.execute("""
            SELECT id FROM metas_vendedores
            WHERE vendedor_id = %s AND mes = %s AND ano = %s
        """, (meta.vendedor_id, meta.mes, meta.ano))
        
        if cursor.fetchone():
            raise HTTPException(
                status_code=400, 
                detail="Já existe uma meta para este vendedor neste período"
            )
        
        cursor.execute("""
            INSERT INTO metas_vendedores (vendedor_id, mes, ano, meta_valor, meta_quantidade, ativo)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (meta.vendedor_id, meta.mes, meta.ano, meta.meta_valor, meta.meta_quantidade, meta.ativo))
        
        meta_id = cursor.lastrowid
        
        cursor.execute("""
            SELECT 
                m.id, m.vendedor_id, m.mes, m.ano, 
                m.meta_valor, m.meta_quantidade, m.ativo,
                m.data_cadastro, m.data_atualizacao,
                v.nome as vendedor_nome
            FROM metas_vendedores m
            LEFT JOIN vendedores v ON m.vendedor_id = v.id
            WHERE m.id = %s
        """, (meta_id,))
        
        return cursor.fetchone()

@router.post("/lote")
async def criar_metas_lote(
    mes: int,
    ano: int,
    metas: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Cria ou atualiza metas para múltiplos vendedores de uma vez"""
    with get_db_cursor(commit=True) as cursor:
        criadas = 0
        atualizadas = 0
        
        for meta in metas:
            vendedor_id = meta.get('vendedor_id')
            meta_valor = meta.get('meta_valor', 0)
            meta_quantidade = meta.get('meta_quantidade', 0)
            
            if not vendedor_id:
                continue
            
            # Verificar se já existe
            cursor.execute("""
                SELECT id FROM metas_vendedores
                WHERE vendedor_id = %s AND mes = %s AND ano = %s
            """, (vendedor_id, mes, ano))
            
            existente = cursor.fetchone()
            
            if existente:
                cursor.execute("""
                    UPDATE metas_vendedores
                    SET meta_valor = %s, meta_quantidade = %s, ativo = TRUE
                    WHERE id = %s
                """, (meta_valor, meta_quantidade, existente['id']))
                atualizadas += 1
            else:
                cursor.execute("""
                    INSERT INTO metas_vendedores (vendedor_id, mes, ano, meta_valor, meta_quantidade, ativo)
                    VALUES (%s, %s, %s, %s, %s, TRUE)
                """, (vendedor_id, mes, ano, meta_valor, meta_quantidade))
                criadas += 1
        
        return {"message": f"Metas processadas: {criadas} criadas, {atualizadas} atualizadas"}

@router.put("/{meta_id}", response_model=MetaVendedor)
async def atualizar_meta(
    meta_id: int, 
    meta: MetaVendedorUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Atualiza uma meta existente"""
    with get_db_cursor(commit=True) as cursor:
        # Verificar se existe
        cursor.execute("SELECT id FROM metas_vendedores WHERE id = %s", (meta_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Meta não encontrada")
        
        # Construir query de atualização
        updates = []
        params = []
        
        if meta.meta_valor is not None:
            updates.append("meta_valor = %s")
            params.append(meta.meta_valor)
        if meta.meta_quantidade is not None:
            updates.append("meta_quantidade = %s")
            params.append(meta.meta_quantidade)
        if meta.ativo is not None:
            updates.append("ativo = %s")
            params.append(meta.ativo)
        
        if updates:
            params.append(meta_id)
            cursor.execute(f"""
                UPDATE metas_vendedores SET {', '.join(updates)} WHERE id = %s
            """, params)
        
        cursor.execute("""
            SELECT 
                m.id, m.vendedor_id, m.mes, m.ano, 
                m.meta_valor, m.meta_quantidade, m.ativo,
                m.data_cadastro, m.data_atualizacao,
                v.nome as vendedor_nome
            FROM metas_vendedores m
            LEFT JOIN vendedores v ON m.vendedor_id = v.id
            WHERE m.id = %s
        """, (meta_id,))
        
        return cursor.fetchone()

@router.delete("/{meta_id}")
async def deletar_meta(meta_id: int, current_user: dict = Depends(get_current_user)):
    """Deleta uma meta"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM metas_vendedores WHERE id = %s", (meta_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Meta não encontrada")
        
        cursor.execute("DELETE FROM metas_vendedores WHERE id = %s", (meta_id,))
        
        return {"message": "Meta deletada com sucesso"}

# ==================== ENDPOINTS DE FAIXAS DE PREMIAÇÃO ====================

@router.get("/faixas/", response_model=List[FaixaPremiacao])
async def listar_faixas(
    ativo: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as faixas de premiação"""
    with get_db_cursor() as cursor:
        query = "SELECT * FROM faixas_premiacao WHERE 1=1"
        params = []
        
        if ativo is not None:
            query += " AND ativo = %s"
            params.append(ativo)
        
        query += " ORDER BY ordem, valor_minimo"
        
        cursor.execute(query, params)
        return cursor.fetchall()

@router.get("/faixas/{faixa_id}", response_model=FaixaPremiacao)
async def obter_faixa(faixa_id: int, current_user: dict = Depends(get_current_user)):
    """Obtém uma faixa de premiação específica"""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM faixas_premiacao WHERE id = %s", (faixa_id,))
        faixa = cursor.fetchone()
        
        if not faixa:
            raise HTTPException(status_code=404, detail="Faixa não encontrada")
        
        return faixa

@router.post("/faixas/", response_model=FaixaPremiacao)
async def criar_faixa(faixa: FaixaPremiacaoCreate, current_user: dict = Depends(get_current_user)):
    """Cria uma nova faixa de premiação"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO faixas_premiacao 
            (nome, tipo_meta, valor_minimo, valor_maximo, bonus_percentual, bonus_fixo, descricao, ativo, ordem)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            faixa.nome, faixa.tipo_meta, faixa.valor_minimo, faixa.valor_maximo,
            faixa.bonus_percentual, faixa.bonus_fixo, faixa.descricao, faixa.ativo, faixa.ordem
        ))
        
        faixa_id = cursor.lastrowid
        cursor.execute("SELECT * FROM faixas_premiacao WHERE id = %s", (faixa_id,))
        
        return cursor.fetchone()

@router.put("/faixas/{faixa_id}", response_model=FaixaPremiacao)
async def atualizar_faixa(
    faixa_id: int, 
    faixa: FaixaPremiacaoUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Atualiza uma faixa de premiação"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM faixas_premiacao WHERE id = %s", (faixa_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Faixa não encontrada")
        
        updates = []
        params = []
        
        if faixa.nome is not None:
            updates.append("nome = %s")
            params.append(faixa.nome)
        if faixa.tipo_meta is not None:
            updates.append("tipo_meta = %s")
            params.append(faixa.tipo_meta)
        if faixa.valor_minimo is not None:
            updates.append("valor_minimo = %s")
            params.append(faixa.valor_minimo)
        if faixa.valor_maximo is not None:
            updates.append("valor_maximo = %s")
            params.append(faixa.valor_maximo)
        if faixa.bonus_percentual is not None:
            updates.append("bonus_percentual = %s")
            params.append(faixa.bonus_percentual)
        if faixa.bonus_fixo is not None:
            updates.append("bonus_fixo = %s")
            params.append(faixa.bonus_fixo)
        if faixa.descricao is not None:
            updates.append("descricao = %s")
            params.append(faixa.descricao)
        if faixa.ativo is not None:
            updates.append("ativo = %s")
            params.append(faixa.ativo)
        if faixa.ordem is not None:
            updates.append("ordem = %s")
            params.append(faixa.ordem)
        
        if updates:
            params.append(faixa_id)
            cursor.execute(f"""
                UPDATE faixas_premiacao SET {', '.join(updates)} WHERE id = %s
            """, params)
        
        cursor.execute("SELECT * FROM faixas_premiacao WHERE id = %s", (faixa_id,))
        return cursor.fetchone()

@router.delete("/faixas/{faixa_id}")
async def deletar_faixa(faixa_id: int, current_user: dict = Depends(get_current_user)):
    """Deleta uma faixa de premiação"""
    with get_db_cursor(commit=True) as cursor:
        # Verificar se está em uso
        cursor.execute("""
            SELECT COUNT(*) as count FROM premiacoes_realizadas WHERE faixa_premiacao_id = %s
        """, (faixa_id,))
        if cursor.fetchone()['count'] > 0:
            raise HTTPException(
                status_code=400, 
                detail="Não é possível deletar: faixa está sendo usada em premiações"
            )
        
        cursor.execute("DELETE FROM faixas_premiacao WHERE id = %s", (faixa_id,))
        return {"message": "Faixa deletada com sucesso"}

# ==================== ENDPOINTS DE PREMIAÇÕES REALIZADAS ====================

@router.get("/premiacoes/", response_model=List[PremiacaoRealizada])
async def listar_premiacoes(
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as premiações realizadas"""
    with get_db_cursor() as cursor:
        query = """
            SELECT 
                p.*, 
                v.nome as vendedor_nome,
                f.nome as faixa_nome
            FROM premiacoes_realizadas p
            LEFT JOIN vendedores v ON p.vendedor_id = v.id
            LEFT JOIN faixas_premiacao f ON p.faixa_premiacao_id = f.id
            WHERE 1=1
        """
        params = []
        
        if mes is not None:
            query += " AND p.mes = %s"
            params.append(mes)
        if ano is not None:
            query += " AND p.ano = %s"
            params.append(ano)
        if vendedor_id is not None:
            query += " AND p.vendedor_id = %s"
            params.append(vendedor_id)
        if status is not None:
            query += " AND p.status = %s"
            params.append(status)
        
        query += " ORDER BY p.ano DESC, p.mes DESC, v.nome"
        
        cursor.execute(query, params)
        return cursor.fetchall()

@router.post("/premiacoes/", response_model=PremiacaoRealizada)
async def criar_premiacao(
    premiacao: PremiacaoRealizadaCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Registra uma premiação realizada"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO premiacoes_realizadas 
            (vendedor_id, faixa_premiacao_id, mes, ano, valor_vendido, quantidade_vendida, valor_bonus, status, observacoes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            premiacao.vendedor_id, premiacao.faixa_premiacao_id, premiacao.mes, premiacao.ano,
            premiacao.valor_vendido, premiacao.quantidade_vendida, premiacao.valor_bonus,
            premiacao.status, premiacao.observacoes
        ))
        
        premiacao_id = cursor.lastrowid
        
        cursor.execute("""
            SELECT 
                p.*, 
                v.nome as vendedor_nome,
                f.nome as faixa_nome
            FROM premiacoes_realizadas p
            LEFT JOIN vendedores v ON p.vendedor_id = v.id
            LEFT JOIN faixas_premiacao f ON p.faixa_premiacao_id = f.id
            WHERE p.id = %s
        """, (premiacao_id,))
        
        return cursor.fetchone()

@router.put("/premiacoes/{premiacao_id}", response_model=PremiacaoRealizada)
async def atualizar_premiacao(
    premiacao_id: int, 
    premiacao: PremiacaoRealizadaUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Atualiza uma premiação (status, data de pagamento, etc.)"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM premiacoes_realizadas WHERE id = %s", (premiacao_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Premiação não encontrada")
        
        updates = []
        params = []
        
        if premiacao.status is not None:
            updates.append("status = %s")
            params.append(premiacao.status)
        if premiacao.data_pagamento is not None:
            updates.append("data_pagamento = %s")
            params.append(premiacao.data_pagamento)
        if premiacao.observacoes is not None:
            updates.append("observacoes = %s")
            params.append(premiacao.observacoes)
        
        if updates:
            params.append(premiacao_id)
            cursor.execute(f"""
                UPDATE premiacoes_realizadas SET {', '.join(updates)} WHERE id = %s
            """, params)
        
        cursor.execute("""
            SELECT 
                p.*, 
                v.nome as vendedor_nome,
                f.nome as faixa_nome
            FROM premiacoes_realizadas p
            LEFT JOIN vendedores v ON p.vendedor_id = v.id
            LEFT JOIN faixas_premiacao f ON p.faixa_premiacao_id = f.id
            WHERE p.id = %s
        """, (premiacao_id,))
        
        return cursor.fetchone()

@router.delete("/premiacoes/{premiacao_id}")
async def deletar_premiacao(premiacao_id: int, current_user: dict = Depends(get_current_user)):
    """Deleta uma premiação"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM premiacoes_realizadas WHERE id = %s", (premiacao_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Premiação não encontrada")
        
        cursor.execute("DELETE FROM premiacoes_realizadas WHERE id = %s", (premiacao_id,))
        return {"message": "Premiação deletada com sucesso"}

# ==================== ENDPOINT PARA CALCULAR E REGISTRAR PREMIAÇÕES ====================

@router.post("/calcular-premiacoes")
async def calcular_premiacoes(
    mes: int,
    ano: int,
    registrar: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Calcula as premiações para todos os vendedores no período.
    Se registrar=True, cria os registros de premiação.
    """
    with get_db_cursor(commit=registrar) as cursor:
        # Buscar faixas ativas
        cursor.execute("""
            SELECT * FROM faixas_premiacao WHERE ativo = TRUE ORDER BY ordem
        """)
        faixas = cursor.fetchall()
        
        # Buscar vendedores ativos
        cursor.execute("""
            SELECT id, nome FROM vendedores WHERE ativo = TRUE
        """)
        vendedores = cursor.fetchall()
        
        premiacoes = []
        
        for vendedor in vendedores:
            # Buscar meta do vendedor
            cursor.execute("""
                SELECT meta_valor, meta_quantidade
                FROM metas_vendedores
                WHERE vendedor_id = %s AND mes = %s AND ano = %s AND ativo = TRUE
            """, (vendedor['id'], mes, ano))
            meta = cursor.fetchone()
            
            meta_valor = float(meta['meta_valor']) if meta else 0
            
            # Buscar vendas do período
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(valor_total), 0) as valor_vendido,
                    COALESCE(COUNT(id), 0) as quantidade_vendida
                FROM pedidos_venda
                WHERE vendedor_id = %s
                AND MONTH(data_pedido) = %s
                AND YEAR(data_pedido) = %s
                AND status NOT IN ('Cancelada', 'Devolvido')
            """, (vendedor['id'], mes, ano))
            vendas = cursor.fetchone()
            
            valor_vendido = float(vendas['valor_vendido']) if vendas else 0
            quantidade_vendida = int(vendas['quantidade_vendida']) if vendas else 0
            
            # Calcular percentual da meta
            percentual_meta = (valor_vendido / meta_valor * 100) if meta_valor > 0 else 0
            
            # Encontrar faixa atingida
            faixa_atingida = None
            bonus_total = 0
            
            for faixa in faixas:
                valor_comparacao = 0
                if faixa['tipo_meta'] == 'valor':
                    valor_comparacao = valor_vendido
                elif faixa['tipo_meta'] == 'quantidade':
                    valor_comparacao = quantidade_vendida
                elif faixa['tipo_meta'] == 'percentual':
                    valor_comparacao = percentual_meta
                
                valor_min = float(faixa['valor_minimo'])
                valor_max = float(faixa['valor_maximo']) if faixa['valor_maximo'] else float('inf')
                
                if valor_min <= valor_comparacao <= valor_max:
                    faixa_atingida = faixa
                    bonus_percentual = float(faixa['bonus_percentual'])
                    bonus_fixo = float(faixa['bonus_fixo'])
                    bonus_total = (valor_vendido * bonus_percentual / 100) + bonus_fixo
                    break
            
            if faixa_atingida and bonus_total > 0:
                premiacao_info = {
                    'vendedor_id': vendedor['id'],
                    'vendedor_nome': vendedor['nome'],
                    'faixa_premiacao_id': faixa_atingida['id'],
                    'faixa_nome': faixa_atingida['nome'],
                    'mes': mes,
                    'ano': ano,
                    'valor_vendido': valor_vendido,
                    'quantidade_vendida': quantidade_vendida,
                    'percentual_meta': round(percentual_meta, 2),
                    'valor_bonus': round(bonus_total, 2)
                }
                
                if registrar:
                    # Verificar se já existe premiação para este vendedor/período
                    cursor.execute("""
                        SELECT id FROM premiacoes_realizadas
                        WHERE vendedor_id = %s AND mes = %s AND ano = %s
                    """, (vendedor['id'], mes, ano))
                    
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO premiacoes_realizadas 
                            (vendedor_id, faixa_premiacao_id, mes, ano, valor_vendido, quantidade_vendida, valor_bonus, status)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pendente')
                        """, (
                            vendedor['id'], faixa_atingida['id'], mes, ano,
                            valor_vendido, quantidade_vendida, round(bonus_total, 2)
                        ))
                        premiacao_info['registrada'] = True
                    else:
                        premiacao_info['registrada'] = False
                        premiacao_info['mensagem'] = 'Já existe premiação registrada'
                
                premiacoes.append(premiacao_info)
        
        return {
            'mes': mes,
            'ano': ano,
            'total_premiacoes': len(premiacoes),
            'valor_total_bonus': sum(p['valor_bonus'] for p in premiacoes),
            'premiacoes': premiacoes
        }
