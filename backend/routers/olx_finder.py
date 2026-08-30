from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# ============================================
# Modelos Pydantic
# ============================================

# Categorias
class OlxCategoriaBase(BaseModel):
    nome: str
    parent_id: Optional[int] = None

class OlxCategoria(OlxCategoriaBase):
    id: int

# Flags
class OlxFlagBase(BaseModel):
    nome: str
    incluir: bool = True
    palavras_chave: str

class OlxFlagCreate(OlxFlagBase):
    pass

class OlxFlagUpdate(BaseModel):
    nome: Optional[str] = None
    incluir: Optional[bool] = None
    palavras_chave: Optional[str] = None

class OlxFlag(OlxFlagBase):
    id: int
    usuario_id: int
    created_at: Optional[str] = None

# Pesquisas
class OlxPesquisaBase(BaseModel):
    nome_produto: str
    preco_maximo: float
    instrucoes: Optional[str] = None
    categoria_id: Optional[int] = None
    subcategoria_id: Optional[int] = None
    flags: Optional[str] = None
    ativo: bool = True

class OlxPesquisaCreate(OlxPesquisaBase):
    pass

class OlxPesquisaUpdate(BaseModel):
    nome_produto: Optional[str] = None
    preco_maximo: Optional[float] = None
    instrucoes: Optional[str] = None
    categoria_id: Optional[int] = None
    subcategoria_id: Optional[int] = None
    flags: Optional[str] = None
    ativo: Optional[bool] = None

class OlxPesquisa(OlxPesquisaBase):
    id: int
    usuario_id: int
    created_at: Optional[str] = None

# Produtos
class OlxProdutoBase(BaseModel):
    link: str
    titulo: str
    imagem: Optional[str] = None
    preco: Optional[float] = None
    descricao: Optional[str] = None
    visivel: bool = False

class OlxProduto(OlxProdutoBase):
    id: int
    usuario_id: int
    pesquisa_id: Optional[int] = None
    avaliado: bool = False
    enviado: int = 0
    created_at: Optional[str] = None

# Bulk visibility
class BulkVisibilityRequest(BaseModel):
    product_ids: List[int]
    action: str  # 'show' or 'hide'


# ============================================
# Rotas de Categorias
# ============================================

@router.get("/categorias", response_model=List[dict])
async def listar_categorias(
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as categorias OLX (apenas principais)."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, nome, parent_id, created_at 
            FROM olx_categorias 
            WHERE parent_id IS NULL 
            ORDER BY nome
        """)
        categorias = cursor.fetchall()
    return categorias


@router.get("/categorias/{categoria_id}/subcategorias", response_model=List[dict])
async def listar_subcategorias(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista subcategorias de uma categoria específica."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, nome, parent_id, created_at 
            FROM olx_categorias 
            WHERE parent_id = %s 
            ORDER BY nome
        """, (categoria_id,))
        subcategorias = cursor.fetchall()
    return subcategorias


# ============================================
# Rotas de Flags
# ============================================

@router.get("/flags", response_model=List[dict])
async def listar_flags(
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as flags do usuário atual."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, nome, incluir, palavras_chave, usuario_id, created_at 
            FROM olx_flags 
            WHERE usuario_id = %s 
            ORDER BY nome
        """, (current_user.id,))
        flags = cursor.fetchall()
    return flags


@router.post("/flags", response_model=dict, status_code=status.HTTP_201_CREATED)
async def criar_flag(
    flag: OlxFlagCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria uma nova flag para o usuário atual."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO olx_flags (nome, incluir, palavras_chave, usuario_id)
            VALUES (%s, %s, %s, %s)
        """, (flag.nome, flag.incluir, flag.palavras_chave, current_user.id))
        
        cursor.execute("SELECT LAST_INSERT_ID()")
        flag_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        cursor.execute("SELECT * FROM olx_flags WHERE id = %s", (flag_id,))
        nova_flag = cursor.fetchone()
    
    return nova_flag


@router.put("/flags/{flag_id}", response_model=dict)
async def atualizar_flag(
    flag_id: int,
    flag: OlxFlagUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza uma flag existente."""
    # Verifica se a flag existe e pertence ao usuário
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM olx_flags WHERE id = %s AND usuario_id = %s",
            (flag_id, current_user.id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Flag não encontrada"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if flag.nome is not None:
        update_data["nome"] = flag.nome
    if flag.incluir is not None:
        update_data["incluir"] = flag.incluir
    if flag.palavras_chave is not None:
        update_data["palavras_chave"] = flag.palavras_chave
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(flag_id)
        
        cursor.execute(f"UPDATE olx_flags SET {set_clause} WHERE id = %s", values)
        
        cursor.execute("SELECT * FROM olx_flags WHERE id = %s", (flag_id,))
        flag_atualizada = cursor.fetchone()
    
    return flag_atualizada


@router.delete("/flags/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_flag(
    flag_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui uma flag do usuário atual."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM olx_flags WHERE id = %s AND usuario_id = %s",
            (flag_id, current_user.id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Flag não encontrada"
            )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM olx_flags WHERE id = %s", (flag_id,))
    
    return None


# ============================================
# Rotas de Pesquisas
# ============================================

@router.get("/pesquisas", response_model=List[dict])
async def listar_pesquisas(
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as pesquisas do usuário atual."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT 
                p.id, p.nome_produto, p.preco_maximo, p.instrucoes,
                p.categoria_id, p.subcategoria_id, p.flags, p.ativo,
                p.usuario_id, p.created_at,
                c1.nome as categoria_nome,
                c2.nome as subcategoria_nome,
                (SELECT COUNT(*) FROM olx_produtos op WHERE op.pesquisa_id = p.id) as produtos_count
            FROM olx_pesquisas p
            LEFT JOIN olx_categorias c1 ON p.categoria_id = c1.id
            LEFT JOIN olx_categorias c2 ON p.subcategoria_id = c2.id
            WHERE p.usuario_id = %s
            ORDER BY p.created_at DESC
        """, (current_user.id,))
        pesquisas = cursor.fetchall()
    return pesquisas


@router.get("/pesquisas/{pesquisa_id}", response_model=dict)
async def obter_pesquisa(
    pesquisa_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém uma pesquisa específica."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT 
                p.*, 
                c1.nome as categoria_nome,
                c2.nome as subcategoria_nome
            FROM olx_pesquisas p
            LEFT JOIN olx_categorias c1 ON p.categoria_id = c1.id
            LEFT JOIN olx_categorias c2 ON p.subcategoria_id = c2.id
            WHERE p.id = %s AND p.usuario_id = %s
        """, (pesquisa_id, current_user.id))
        pesquisa = cursor.fetchone()
    
    if not pesquisa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pesquisa não encontrada"
        )
    
    return pesquisa


@router.post("/pesquisas", response_model=dict, status_code=status.HTTP_201_CREATED)
async def criar_pesquisa(
    pesquisa: OlxPesquisaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria uma nova pesquisa para o usuário atual."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO olx_pesquisas 
            (nome_produto, preco_maximo, instrucoes, usuario_id, categoria_id, subcategoria_id, flags, ativo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            pesquisa.nome_produto, pesquisa.preco_maximo, pesquisa.instrucoes,
            current_user.id, pesquisa.categoria_id, pesquisa.subcategoria_id,
            pesquisa.flags, pesquisa.ativo
        ))
        
        cursor.execute("SELECT LAST_INSERT_ID()")
        pesquisa_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        cursor.execute("SELECT * FROM olx_pesquisas WHERE id = %s", (pesquisa_id,))
        nova_pesquisa = cursor.fetchone()
    
    return nova_pesquisa


@router.put("/pesquisas/{pesquisa_id}", response_model=dict)
async def atualizar_pesquisa(
    pesquisa_id: int,
    pesquisa: OlxPesquisaUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza uma pesquisa existente."""
    # Verifica se a pesquisa existe e pertence ao usuário
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM olx_pesquisas WHERE id = %s AND usuario_id = %s",
            (pesquisa_id, current_user.id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pesquisa não encontrada"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if pesquisa.nome_produto is not None:
        update_data["nome_produto"] = pesquisa.nome_produto
    if pesquisa.preco_maximo is not None:
        update_data["preco_maximo"] = pesquisa.preco_maximo
    if pesquisa.instrucoes is not None:
        update_data["instrucoes"] = pesquisa.instrucoes
    if pesquisa.categoria_id is not None:
        update_data["categoria_id"] = pesquisa.categoria_id
    if pesquisa.subcategoria_id is not None:
        update_data["subcategoria_id"] = pesquisa.subcategoria_id
    if pesquisa.flags is not None:
        update_data["flags"] = pesquisa.flags
    if pesquisa.ativo is not None:
        update_data["ativo"] = pesquisa.ativo
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(pesquisa_id)
        
        cursor.execute(f"UPDATE olx_pesquisas SET {set_clause} WHERE id = %s", values)
        
        cursor.execute("SELECT * FROM olx_pesquisas WHERE id = %s", (pesquisa_id,))
        pesquisa_atualizada = cursor.fetchone()
    
    return pesquisa_atualizada


@router.delete("/pesquisas/{pesquisa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_pesquisa(
    pesquisa_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui uma pesquisa do usuário atual."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM olx_pesquisas WHERE id = %s AND usuario_id = %s",
            (pesquisa_id, current_user.id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pesquisa não encontrada"
            )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM olx_pesquisas WHERE id = %s", (pesquisa_id,))
    
    return None


# ============================================
# Rotas de Produtos
# ============================================

@router.get("/produtos", response_model=List[dict])
async def listar_produtos(
    pesquisa_id: Optional[int] = Query(None),
    visivel: Optional[bool] = Query(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista produtos encontrados do usuário atual."""
    query = """
        SELECT 
            op.id, op.usuario_id, op.pesquisa_id, op.link, op.titulo,
            op.imagem, op.data_publicacao, op.preco, op.descricao,
            op.visivel, op.avaliado, op.enviado, op.created_at,
            p.nome_produto as pesquisa_nome, p.preco_maximo as pesquisa_preco
        FROM olx_produtos op
        LEFT JOIN olx_pesquisas p ON op.pesquisa_id = p.id
        WHERE op.usuario_id = %s
    """
    params = [current_user.id]
    
    if pesquisa_id is not None:
        query += " AND op.pesquisa_id = %s"
        params.append(pesquisa_id)
    
    if visivel is not None:
        query += " AND op.visivel = %s"
        params.append(visivel)
    
    query += " ORDER BY op.created_at DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()
    
    return produtos


@router.post("/produtos/{produto_id}/toggle", response_model=dict)
async def toggle_visibilidade_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Alterna a visibilidade de um produto."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, visivel FROM olx_produtos WHERE id = %s AND usuario_id = %s",
            (produto_id, current_user.id)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
    
    novo_visivel = not produto["visivel"]
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE olx_produtos SET visivel = %s WHERE id = %s",
            (novo_visivel, produto_id)
        )
    
    return {
        "success": True,
        "visible": novo_visivel,
        "message": f"Produto {'exibido' if novo_visivel else 'ocultado'} com sucesso"
    }


@router.post("/produtos/bulk-visibility", response_model=dict)
async def atualizar_visibilidade_em_lote(
    request: BulkVisibilityRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza a visibilidade de múltiplos produtos."""
    if not request.product_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum produto selecionado"
        )
    
    if request.action not in ['show', 'hide']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ação inválida. Use 'show' ou 'hide'"
        )
    
    novo_visivel = request.action == 'show'
    
    with get_db_cursor(commit=True) as cursor:
        placeholders = ', '.join(['%s'] * len(request.product_ids))
        cursor.execute(f"""
            UPDATE olx_produtos 
            SET visivel = %s 
            WHERE id IN ({placeholders}) AND usuario_id = %s
        """, [novo_visivel] + request.product_ids + [current_user.id])
    
    return {
        "success": True,
        "visible": novo_visivel,
        "product_ids": request.product_ids,
        "message": f"{len(request.product_ids)} produtos {'exibidos' if novo_visivel else 'ocultados'}"
    }


@router.delete("/produtos/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui um produto do usuário atual."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM olx_produtos WHERE id = %s AND usuario_id = %s",
            (produto_id, current_user.id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM olx_produtos WHERE id = %s", (produto_id,))
    
    return None


# ============================================
# Rotas de Avaliação de Produtos
# ============================================

def contains_search_term(titulo: str, search_term: str) -> bool:
    """Verifica se o título contém o termo de busca (case-insensitive)."""
    if not search_term:
        return True
    return search_term.strip().lower() in titulo.strip().lower()


def check_flags(titulo: str, descricao: str, flags_data: list, flag_type: str) -> bool:
    """
    Verifica se o produto corresponde às flags.
    flag_type: 'exclude' (incluir=0) ou 'include' (incluir=1)
    Retorna True se encontrou correspondência.
    """
    texto_completo = f"{titulo} {descricao or ''}".lower()
    
    for flag in flags_data:
        if flag_type == 'exclude' and not flag['incluir']:
            # Flag de exclusão
            palavras = flag['palavras_chave'].split(',')
            for palavra in palavras:
                palavra = palavra.strip().lower()
                if palavra and palavra in texto_completo:
                    return True
        elif flag_type == 'include' and flag['incluir']:
            # Flag de inclusão
            palavras = flag['palavras_chave'].split(',')
            for palavra in palavras:
                palavra = palavra.strip().lower()
                if palavra and palavra in texto_completo:
                    return True
    return False


@router.post("/produtos/avaliar", response_model=dict)
async def avaliar_produtos(
    pesquisa_id: Optional[int] = Query(None, description="ID da pesquisa para avaliar. Se não informado, avalia todas."),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Avalia produtos não avaliados do usuário.
    
    Lógica de avaliação:
    1. Verifica se o título contém o termo de busca da pesquisa
    2. Aplica flags de exclusão (oculta se contiver palavras-chave)
    3. Aplica flags de inclusão (mantém visível se contiver palavras-chave)
    4. Marca como avaliado
    """
    # Buscar produtos não avaliados
    query = """
        SELECT 
            op.id, op.titulo, op.descricao, op.pesquisa_id,
            p.nome_produto as search_term, p.flags as pesquisa_flags
        FROM olx_produtos op
        LEFT JOIN olx_pesquisas p ON op.pesquisa_id = p.id
        WHERE op.usuario_id = %s AND op.avaliado = 0
    """
    params = [current_user.id]
    
    if pesquisa_id is not None:
        query += " AND op.pesquisa_id = %s"
        params.append(pesquisa_id)
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()
    
    if not produtos:
        return {
            "success": True,
            "message": "Nenhum produto para avaliar",
            "total_avaliados": 0,
            "visiveis": 0,
            "ocultos": 0
        }
    
    # Buscar flags do usuário
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, incluir, palavras_chave FROM olx_flags WHERE usuario_id = %s",
            (current_user.id,)
        )
        todas_flags = cursor.fetchall()
    
    visiveis = 0
    ocultos = 0
    
    for produto in produtos:
        produto_id = produto['id']
        titulo = produto['titulo'] or ''
        descricao = produto['descricao'] or ''
        search_term = produto['search_term'] or ''
        pesquisa_flags_str = produto['pesquisa_flags'] or ''
        
        # Filtrar apenas as flags associadas a esta pesquisa
        if pesquisa_flags_str:
            flag_ids = [int(f.strip()) for f in pesquisa_flags_str.split(',') if f.strip().isdigit()]
            flags_da_pesquisa = [f for f in todas_flags if f['id'] in flag_ids]
        else:
            flags_da_pesquisa = todas_flags  # Usa todas as flags se não especificado
        
        # Determinar visibilidade
        deve_ser_visivel = True
        
        # 1. Verificar se contém o termo de busca
        if not contains_search_term(titulo, search_term):
            deve_ser_visivel = False
        
        # 2. Verificar flags de exclusão (se contiver, oculta)
        if deve_ser_visivel and check_flags(titulo, descricao, flags_da_pesquisa, 'exclude'):
            deve_ser_visivel = False
        
        # 3. Atualizar produto
        with get_db_cursor(commit=True) as cursor:
            cursor.execute(
                "UPDATE olx_produtos SET visivel = %s, avaliado = 1 WHERE id = %s",
                (deve_ser_visivel, produto_id)
            )
        
        if deve_ser_visivel:
            visiveis += 1
        else:
            ocultos += 1
    
    return {
        "success": True,
        "message": f"Avaliação concluída: {visiveis} visíveis, {ocultos} ocultos",
        "total_avaliados": len(produtos),
        "visiveis": visiveis,
        "ocultos": ocultos
    }


@router.post("/produtos/reavaliar", response_model=dict)
async def reavaliar_todos_produtos(
    pesquisa_id: Optional[int] = Query(None, description="ID da pesquisa para reavaliar. Se não informado, reavalia todas."),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Reseta a avaliação dos produtos e os reavalia.
    Útil quando as flags são alteradas.
    """
    # Primeiro, resetar o campo avaliado
    reset_query = "UPDATE olx_produtos SET avaliado = 0 WHERE usuario_id = %s"
    params = [current_user.id]
    
    if pesquisa_id is not None:
        reset_query += " AND pesquisa_id = %s"
        params.append(pesquisa_id)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(reset_query, params)
        produtos_resetados = cursor.rowcount
    
    # Agora, chamar a avaliação
    result = await avaliar_produtos(pesquisa_id, current_user)
    
    return {
        "success": True,
        "message": f"Reavaliação concluída: {result['visiveis']} visíveis, {result['ocultos']} ocultos",
        "produtos_resetados": produtos_resetados,
        "total_avaliados": result['total_avaliados'],
        "visiveis": result['visiveis'],
        "ocultos": result['ocultos']
    }


@router.get("/produtos/pendentes", response_model=dict)
async def contar_produtos_pendentes(
    current_user: UserInDB = Depends(get_current_user)
):
    """Retorna a contagem de produtos pendentes de avaliação."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) as total FROM olx_produtos WHERE usuario_id = %s AND avaliado = 0",
            (current_user.id,)
        )
        result = cursor.fetchone()
    
    return {
        "pendentes": result['total'] if result else 0
    }
