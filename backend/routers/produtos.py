from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from datetime import datetime
from PIL import Image
import os
import uuid
import shutil

router = APIRouter()

THUMBNAIL_MAX_SIZE = (300, 300)

def _obter_deposito_padrao_id(cursor) -> Optional[int]:
    """Retorna o id do depósito marcado como padrão, se existir."""
    cursor.execute("SELECT id FROM depositos WHERE padrao = TRUE LIMIT 1")
    resultado = cursor.fetchone()
    return resultado["id"] if resultado else None

def _caminho_thumb(caminho_relativo: str) -> str:
    """
    Deriva o caminho relativo da miniatura a partir do caminho da imagem original.
    Ex: "uploads/produtos/abc.jpg" -> "uploads/produtos/thumbs/abc.jpg" (sempre .jpg).
    """
    pasta, nome_arquivo = os.path.split(caminho_relativo)
    nome_base = os.path.splitext(nome_arquivo)[0] + ".jpg"
    return f"{pasta}/thumbs/{nome_base}"

def _gerar_thumbnail(file_path_absoluto: str, caminho_relativo_original: str):
    """
    Gera uma miniatura (máx. 300x300) da imagem recém-salva em uploads/produtos/thumbs/.
    Miniatura é um ganho de performance, não um requisito funcional: qualquer falha aqui
    é ignorada silenciosamente para não interromper o upload da imagem original.
    """
    try:
        caminho_thumb_relativo = _caminho_thumb(caminho_relativo_original)
        thumb_path_absoluto = os.path.join("../frontend", *caminho_thumb_relativo.split("/"))
        os.makedirs(os.path.dirname(thumb_path_absoluto), exist_ok=True)

        with Image.open(file_path_absoluto) as img:
            img = img.convert("RGB")
            img.thumbnail(THUMBNAIL_MAX_SIZE)
            img.save(thumb_path_absoluto, "JPEG", quality=80)
    except Exception:
        pass

def _remover_arquivos_upload(caminhos_relativos: str, remover_thumb: bool = False):
    """
    Remove do disco arquivos de upload antigos (imagens/vídeo) que foram substituídos.
    Recebe uma string com um ou mais caminhos relativos (ex: "uploads/produtos/x.jpg,uploads/produtos/y.jpg"),
    no mesmo formato salvo em caminho_imagem/caminho_video. Ignora erros (arquivo já removido, etc.)
    para não interromper a resposta da API por causa de uma limpeza de arquivo.
    """
    if not caminhos_relativos:
        return

    for caminho in caminhos_relativos.split(","):
        caminho = caminho.strip()
        if not caminho:
            continue

        file_path = os.path.join("../frontend", *caminho.split("/"))
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass

        if remover_thumb:
            thumb_path = os.path.join("../frontend", *_caminho_thumb(caminho).split("/"))
            try:
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
            except OSError:
                pass

# Modelos Pydantic
class ProdutoBase(BaseModel):
    codigo: str
    nome: str
    descricao: Optional[str] = None
    preco_custo: float
    preco_venda: float
    estoque_minimo: int = 5
    categoria_id: int
    tipo_produto: str = "comprado"  # 'comprado' ou 'fabricado'
    comissao: Optional[float] = 0.0
    faturavel: bool = True
    post_olx: bool = False
    post_facebook: bool = False
    ativo: bool = True

class ProdutoCreate(ProdutoBase):
    pass

class ProdutoUpdate(BaseModel):
    codigo: Optional[str] = None
    nome: Optional[str] = None
    descricao: Optional[str] = None
    preco_custo: Optional[float] = None
    preco_venda: Optional[float] = None
    estoque_minimo: Optional[int] = None
    categoria_id: Optional[int] = None
    tipo_produto: Optional[str] = None
    comissao: Optional[float] = None
    faturavel: Optional[bool] = None
    post_olx: Optional[bool] = None
    post_facebook: Optional[bool] = None
    ativo: Optional[bool] = None
    deposito_id: Optional[int] = None
    instrucoes_duvidas: Optional[str] = None

class Produto(ProdutoBase):
    id: int
    estoque_atual: int
    data_cadastro: datetime
    categoria_nome: Optional[str] = None
    caminho_imagem: Optional[str] = None
    caminho_video: Optional[str] = None
    faturavel: Optional[bool] = True
    post_olx: Optional[bool] = False
    post_facebook: Optional[bool] = False
    usuario_id: Optional[int] = None
    deposito_id: Optional[int] = None
    deposito_nome: Optional[str] = None
    instrucoes_duvidas: Optional[str] = None

# Rotas
@router.get("/", response_model=List[Produto])
async def listar_produtos(
    ativo: Optional[bool] = None,
    categoria_id: Optional[int] = None,
    apenas_meus: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os produtos cadastrados no sistema.
    Pode filtrar por status (ativo/inativo), categoria e dono do produto.
    """
    query = """
        SELECT p.*, c.nome AS categoria_nome, d.nome AS deposito_nome
        FROM produtos p
        LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
        LEFT JOIN depositos d ON p.deposito_id = d.id
        WHERE 1=1
    """
    params = []

    if ativo is not None:
        query += " AND p.ativo = %s"
        params.append(ativo)

    if categoria_id is not None:
        query += " AND p.categoria_id = %s"
        params.append(categoria_id)

    # Filtrar apenas produtos do usuário atual
    if apenas_meus:
        query += " AND p.usuario_id = %s"
        params.append(current_user.id)

    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()

    return produtos


# ============================================
# Endpoints de Recálculo de Custo
# ============================================

class AplicarCustoItem(BaseModel):
    produto_id: int
    novo_custo: float

class AplicarCustoRequest(BaseModel):
    itens: List[AplicarCustoItem]


def _calcular_custo_produto(cursor, produto_id: int, estoque_atual: int):
    """
    Calcula o custo recalculado de um produto baseado nas últimas movimentações
    de entrada que compuseram o estoque atual.
    Retorna (custo_recalculado, composicao_list).
    """
    if estoque_atual <= 0:
        return 0.0, []

    # Busca movimentações de entrada do produto, da mais recente para a mais antiga
    cursor.execute(
        """
        SELECT me.id, me.quantidade, me.valor_unitario, me.motivo, 
               me.documento_referencia, me.data_movimentacao
        FROM movimentacao_estoque me
        WHERE me.produto_id = %s AND me.tipo = 'entrada'
        ORDER BY me.data_movimentacao DESC, me.id DESC
        """,
        (produto_id,)
    )
    movimentacoes = cursor.fetchall()

    composicao = []
    quantidade_restante = estoque_atual
    valor_total = 0.0

    for mov in movimentacoes:
        if quantidade_restante <= 0:
            break

        # Determina quanto dessa movimentação compõe o estoque atual
        qtd_usada = min(mov["quantidade"], quantidade_restante)
        valor_unitario = None
        tipo_origem = "movimentacao_manual"
        referencia = mov["motivo"] or ""

        # Se veio de um pedido de compra, busca o preço unitário da compra
        if mov["motivo"] and "Recebimento de pedido de compra" in mov["motivo"] and mov["documento_referencia"]:
            codigo_pedido = mov["documento_referencia"]
            cursor.execute(
                """
                SELECT pc.id, pc.codigo, ipc.preco_unitario
                FROM pedidos_compra pc
                JOIN itens_pedido_compra ipc ON ipc.pedido_id = pc.id
                WHERE pc.codigo = %s AND ipc.produto_id = %s
                LIMIT 1
                """,
                (codigo_pedido, produto_id)
            )
            item_compra = cursor.fetchone()
            if item_compra and item_compra["preco_unitario"]:
                valor_unitario = float(item_compra["preco_unitario"])
                tipo_origem = "compra"
                referencia = f"Pedido #{item_compra['codigo']}"

        # Se não achou via compra, usa valor_unitario da movimentação
        if valor_unitario is None and mov["valor_unitario"]:
            valor_unitario = float(mov["valor_unitario"])

        # Se ainda não tem valor, pula (não contribui para o cálculo)
        if valor_unitario is not None:
            valor_total += qtd_usada * valor_unitario
            composicao.append({
                "movimentacao_id": mov["id"],
                "data": mov["data_movimentacao"].isoformat() if hasattr(mov["data_movimentacao"], 'isoformat') else str(mov["data_movimentacao"]),
                "tipo_origem": tipo_origem,
                "quantidade_total": mov["quantidade"],
                "quantidade_usada": qtd_usada,
                "valor_unitario": valor_unitario,
                "referencia": referencia
            })

        quantidade_restante -= qtd_usada

    # Se ainda resta quantidade sem valor, o custo calculado cobre apenas o que encontrou
    quantidade_coberta = estoque_atual - quantidade_restante
    if quantidade_coberta > 0:
        custo_recalculado = round(valor_total / quantidade_coberta, 2)
    else:
        custo_recalculado = 0.0

    return custo_recalculado, composicao


@router.get("/recalcular-custo")
async def recalcular_custo(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Busca todos os produtos com estoque > 0 e recalcula o custo baseado nas
    últimas compras e movimentações de entrada que compuseram o estoque atual.
    """
    with get_db_cursor() as cursor:
        # Busca todos os produtos ativos com estoque > 0
        cursor.execute(
            """
            SELECT p.id, p.nome, p.codigo, p.estoque_atual, p.preco_custo,
                   c.nome as categoria_nome
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            WHERE p.estoque_atual > 0 AND p.ativo = TRUE
            ORDER BY p.nome
            """
        )
        produtos = cursor.fetchall()

        resultado = []
        for prod in produtos:
            custo_recalculado, _ = _calcular_custo_produto(
                cursor, prod["id"], prod["estoque_atual"]
            )
            resultado.append({
                "produto_id": prod["id"],
                "produto_nome": prod["nome"],
                "produto_codigo": prod["codigo"],
                "categoria_nome": prod["categoria_nome"] or "-",
                "estoque_atual": prod["estoque_atual"],
                "custo_atual": float(prod["preco_custo"]),
                "custo_recalculado": custo_recalculado
            })

    return resultado


@router.post("/aplicar-custo-recalculado")
async def aplicar_custo_recalculado(
    request: AplicarCustoRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Aplica os novos custos recalculados nos produtos.
    """
    if not request.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum item para atualizar"
        )

    atualizados = 0
    with get_db_cursor(commit=True) as cursor:
        for item in request.itens:
            if item.novo_custo < 0:
                continue
            cursor.execute(
                "UPDATE produtos SET preco_custo = %s WHERE id = %s AND ativo = TRUE",
                (item.novo_custo, item.produto_id)
            )
            atualizados += cursor.rowcount

    return {
        "message": f"{atualizados} produto(s) atualizado(s) com sucesso",
        "atualizados": atualizados
    }


@router.get("/{produto_id}/composicao-custo")
async def composicao_custo(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna as movimentações/compras que compuseram o custo recalculado
    de um produto específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, estoque_atual, preco_custo FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()

        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )

        custo_recalculado, composicao = _calcular_custo_produto(
            cursor, produto_id, produto["estoque_atual"]
        )

    return {
        "produto_id": produto_id,
        "produto_nome": produto["nome"],
        "estoque_atual": produto["estoque_atual"],
        "custo_atual": float(produto["preco_custo"]),
        "custo_recalculado": custo_recalculado,
        "composicao": composicao
    }


@router.get("/{produto_id}", response_model=Produto)
async def obter_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um produto específico.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT p.*, c.nome AS categoria_nome, d.nome AS deposito_nome
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            LEFT JOIN depositos d ON p.deposito_id = d.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        produto = cursor.fetchone()

    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )

    return produto

@router.post("/", response_model=Produto, status_code=status.HTTP_201_CREATED)
async def criar_produto(
    codigo: str = Form(...),
    nome: str = Form(...),
    descricao: str = Form(None),
    instrucoes_duvidas: str = Form(None),
    preco_custo: float = Form(...),
    preco_venda: float = Form(...),
    estoque_minimo: int = Form(5),
    categoria_id: int = Form(...),
    tipo_produto: str = Form("comprado"),
    comissao: float = Form(0.0),
    faturavel: bool = Form(True),
    post_olx: bool = Form(False),
    post_facebook: bool = Form(False),
    ativo: bool = Form(True),
    deposito_id: Optional[int] = Form(None),
    imagens: List[UploadFile] = File(None),
    video: UploadFile = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo produto no sistema com upload de imagens e vídeo.
    """
    # Verifica se o código já está em uso
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM produtos WHERE codigo = %s",
            (codigo,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código já está em uso"
            )

        # Verifica se a categoria existe
        cursor.execute(
            "SELECT id FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria não encontrada"
            )

        # Valida ou resolve o depósito
        if deposito_id is not None:
            cursor.execute("SELECT id FROM depositos WHERE id = %s", (deposito_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Depósito não encontrado"
                )
        else:
            deposito_id = _obter_deposito_padrao_id(cursor)

    # Valida tipo_produto
    if tipo_produto not in ["comprado", "fabricado"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de produto deve ser 'comprado' ou 'fabricado'"
        )

    # Processa upload de imagens
    caminhos_imagens = []
    if imagens and len(imagens) > 0:
        # Limita a 5 imagens
        if len(imagens) > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 5 imagens permitidas"
            )

        # Cria diretório se não existir
        upload_dir = "../frontend/uploads/produtos"
        os.makedirs(upload_dir, exist_ok=True)

        for imagem in imagens:
            if imagem.filename:
                # Verifica se é uma imagem
                if not imagem.content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Arquivo {imagem.filename} não é uma imagem válida"
                    )

                # Gera nome único para o arquivo
                file_extension = os.path.splitext(imagem.filename)[1]
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                file_path = os.path.join(upload_dir, unique_filename)

                # Salva o arquivo
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(imagem.file, buffer)

                caminho_relativo_imagem = f"uploads/produtos/{unique_filename}"
                caminhos_imagens.append(caminho_relativo_imagem)
                _gerar_thumbnail(file_path, caminho_relativo_imagem)

    # Junta os caminhos das imagens em uma string separada por vírgulas
    caminho_imagem = ",".join(caminhos_imagens) if caminhos_imagens else None

    # Processa upload de vídeo (opcional, um único arquivo)
    caminho_video = None
    if video and video.filename:
        if not video.content_type or not video.content_type.startswith("video/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Arquivo {video.filename} não é um vídeo válido"
            )

        video_dir = "../frontend/uploads/produtos/videos"
        os.makedirs(video_dir, exist_ok=True)

        file_extension = os.path.splitext(video.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(video_dir, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        caminho_video = f"uploads/produtos/videos/{unique_filename}"

    # Cria o produto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO produtos (
                codigo, nome, descricao, instrucoes_duvidas, preco_custo, preco_venda,
                estoque_atual, estoque_minimo, categoria_id, tipo_produto,
                comissao, caminho_imagem, caminho_video, faturavel, post_olx, post_facebook, ativo,
                usuario_id, deposito_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                codigo, nome, descricao, instrucoes_duvidas, preco_custo, preco_venda,
                estoque_minimo, categoria_id, tipo_produto, comissao,
                caminho_imagem, caminho_video, faturavel, post_olx, post_facebook, ativo,
                current_user.id, deposito_id
            )
        )

        # Obtém o ID do produto criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        produto_id = cursor.fetchone()["LAST_INSERT_ID()"]

        # Obtém os dados do produto criado
        cursor.execute(
            "SELECT * FROM produtos WHERE id = %s",
            (produto_id,)
        )
        novo_produto = cursor.fetchone()

    return novo_produto

@router.put("/{produto_id}", response_model=Produto)
async def atualizar_produto(
    produto_id: int,
    produto: ProdutoUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um produto existente.
    """
    # Verifica se o produto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM produtos WHERE id = %s",
            (produto_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        # Verifica se o código já está em uso por outro produto
        if produto.codigo:
            cursor.execute(
                "SELECT id FROM produtos WHERE codigo = %s AND id != %s",
                (produto.codigo, produto_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Código já está em uso por outro produto"
                )
        
        # Verifica se a categoria existe
        if produto.categoria_id:
            cursor.execute(
                "SELECT id FROM categorias_produtos WHERE id = %s",
                (produto.categoria_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Categoria não encontrada"
                )

        # Verifica se o depósito existe
        if produto.deposito_id is not None:
            cursor.execute(
                "SELECT id FROM depositos WHERE id = %s",
                (produto.deposito_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Depósito não encontrado"
                )

    # Prepara os dados para atualização
    update_data = {}
    if produto.codigo is not None:
        update_data["codigo"] = produto.codigo
    if produto.nome is not None:
        update_data["nome"] = produto.nome
    if produto.descricao is not None:
        update_data["descricao"] = produto.descricao
    if produto.preco_custo is not None:
        update_data["preco_custo"] = produto.preco_custo
    if produto.preco_venda is not None:
        update_data["preco_venda"] = produto.preco_venda
    if produto.estoque_minimo is not None:
        update_data["estoque_minimo"] = produto.estoque_minimo
    if produto.categoria_id is not None:
        update_data["categoria_id"] = produto.categoria_id
    if produto.tipo_produto is not None:
        if produto.tipo_produto not in ["comprado", "fabricado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tipo de produto deve ser 'comprado' ou 'fabricado'"
            )
        update_data["tipo_produto"] = produto.tipo_produto
    if produto.comissao is not None:
        update_data["comissao"] = produto.comissao
    if produto.faturavel is not None:
        update_data["faturavel"] = produto.faturavel
    if produto.post_olx is not None:
        update_data["post_olx"] = produto.post_olx
    if produto.post_facebook is not None:
        update_data["post_facebook"] = produto.post_facebook
    if produto.ativo is not None:
        update_data["ativo"] = produto.ativo
    if produto.deposito_id is not None:
        update_data["deposito_id"] = produto.deposito_id
    if produto.instrucoes_duvidas is not None:
        update_data["instrucoes_duvidas"] = produto.instrucoes_duvidas

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )

    # Atualiza o produto
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(produto_id)

        cursor.execute(
            f"UPDATE produtos SET {set_clause} WHERE id = %s",
            values
        )

        # Obtém os dados atualizados
        cursor.execute(
            """
            SELECT p.*, c.nome AS categoria_nome, d.nome AS deposito_nome
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            LEFT JOIN depositos d ON p.deposito_id = d.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        produto_atualizado = cursor.fetchone()

    return produto_atualizado

@router.post("/{produto_id}/upload", response_model=Produto)
async def upload_imagens_produto(
    produto_id: int,
    codigo: str = Form(...),
    nome: str = Form(...),
    descricao: str = Form(None),
    instrucoes_duvidas: str = Form(None),
    preco_custo: float = Form(...),
    preco_venda: float = Form(...),
    estoque_minimo: int = Form(5),
    categoria_id: int = Form(...),
    tipo_produto: str = Form("comprado"),
    comissao: float = Form(0.0),
    faturavel: bool = Form(True),
    post_olx: bool = Form(False),
    post_facebook: bool = Form(False),
    ativo: bool = Form(True),
    deposito_id: Optional[int] = Form(None),
    imagens: List[UploadFile] = File(None),
    video: UploadFile = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza um produto existente com upload de novas imagens e vídeo.
    """
    # Verifica se o produto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, caminho_imagem, caminho_video, deposito_id FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto_existente = cursor.fetchone()

        if not produto_existente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )

        # Verifica se o código já está em uso por outro produto
        cursor.execute(
            "SELECT id FROM produtos WHERE codigo = %s AND id != %s",
            (codigo, produto_id)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código já está em uso por outro produto"
            )

        # Verifica se a categoria existe
        cursor.execute(
            "SELECT id FROM categorias_produtos WHERE id = %s",
            (categoria_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria não encontrada"
            )

        # Valida ou mantém o depósito
        if deposito_id is not None:
            cursor.execute("SELECT id FROM depositos WHERE id = %s", (deposito_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Depósito não encontrado"
                )
        else:
            deposito_id = produto_existente.get("deposito_id") or _obter_deposito_padrao_id(cursor)

    # Valida tipo_produto
    if tipo_produto not in ["comprado", "fabricado"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de produto deve ser 'comprado' ou 'fabricado'"
        )

    # Processa upload de imagens
    caminhos_imagens = []
    if imagens and len(imagens) > 0:
        # Limita a 5 imagens
        if len(imagens) > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 5 imagens permitidas"
            )

        # Cria diretório se não existir
        upload_dir = "../frontend/uploads/produtos"
        os.makedirs(upload_dir, exist_ok=True)

        for imagem in imagens:
            if imagem.filename:
                # Verifica se é uma imagem
                if not imagem.content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Arquivo {imagem.filename} não é uma imagem válida"
                    )

                # Gera nome único para o arquivo
                file_extension = os.path.splitext(imagem.filename)[1]
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                file_path = os.path.join(upload_dir, unique_filename)

                # Salva o arquivo
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(imagem.file, buffer)

                caminho_relativo_imagem = f"uploads/produtos/{unique_filename}"
                caminhos_imagens.append(caminho_relativo_imagem)
                _gerar_thumbnail(file_path, caminho_relativo_imagem)

    # Junta os caminhos das imagens em uma string separada por vírgulas
    caminho_imagem = ",".join(caminhos_imagens) if caminhos_imagens else produto_existente.get("caminho_imagem")

    # Processa upload de vídeo (mantém o vídeo existente se nenhum novo for enviado)
    caminho_video = produto_existente.get("caminho_video")
    if video and video.filename:
        if not video.content_type or not video.content_type.startswith("video/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Arquivo {video.filename} não é um vídeo válido"
            )

        video_dir = "../frontend/uploads/produtos/videos"
        os.makedirs(video_dir, exist_ok=True)

        file_extension = os.path.splitext(video.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(video_dir, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        caminho_video = f"uploads/produtos/videos/{unique_filename}"

    # Atualiza o produto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE produtos SET
                codigo = %s,
                nome = %s,
                descricao = %s,
                instrucoes_duvidas = %s,
                preco_custo = %s,
                preco_venda = %s,
                estoque_minimo = %s,
                categoria_id = %s,
                tipo_produto = %s,
                comissao = %s,
                caminho_imagem = %s,
                caminho_video = %s,
                faturavel = %s,
                post_olx = %s,
                post_facebook = %s,
                ativo = %s,
                deposito_id = %s
            WHERE id = %s
            """,
            (
                codigo, nome, descricao, instrucoes_duvidas, preco_custo, preco_venda,
                estoque_minimo, categoria_id, tipo_produto, comissao,
                caminho_imagem, caminho_video, faturavel, post_olx, post_facebook, ativo,
                deposito_id, produto_id
            )
        )

        cursor.execute(
            """
            SELECT p.*, c.nome AS categoria_nome, d.nome AS deposito_nome
            FROM produtos p
            LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
            LEFT JOIN depositos d ON p.deposito_id = d.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        produto_atualizado = cursor.fetchone()

    # Remove do disco os arquivos antigos que foram substituídos (evita acumular arquivos órfãos)
    if caminhos_imagens:
        _remover_arquivos_upload(produto_existente.get("caminho_imagem"), remover_thumb=True)
    if video and video.filename and produto_existente.get("caminho_video"):
        _remover_arquivos_upload(produto_existente.get("caminho_video"))

    return produto_atualizado

@router.get("/codigo/{codigo}", response_model=Produto)
async def obter_produto_por_codigo(
    codigo: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um produto pelo seu código.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM produtos WHERE codigo = %s",
            (codigo,)
        )
        produto = cursor.fetchone()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    return produto

@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Desativa um produto do sistema (soft delete).
    """
    # Verifica se o produto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, ativo FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        if not produto["ativo"]:
            # Produto já está inativo
            return None
    
    # Desativa o produto (soft delete) em vez de excluir fisicamente
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE produtos SET ativo = FALSE WHERE id = %s",
            (produto_id,)
        )
    
    return None

@router.get("/imagem/{filename}")
async def download_imagem(
    filename: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Faz download de uma imagem de produto.
    """
    file_path = os.path.join("../frontend", "uploads", "produtos", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Imagem não encontrada"
        )
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/octet-stream'
    )

@router.get("/video/{filename}")
async def download_video(
    filename: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Faz download do vídeo de um produto.
    """
    file_path = os.path.join("../frontend", "uploads", "produtos", "videos", filename)

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vídeo não encontrado"
        )

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/octet-stream'
    )

# ============================================
# Endpoints de Consumo de Produtos (BOM)
# ============================================

class ConsumoItemBase(BaseModel):
    consumo_produto_id: int
    quantidade: float = 1.0

class ConsumoItemCreate(ConsumoItemBase):
    pass

class ConsumoItem(ConsumoItemBase):
    id: int
    produto_id: int
    # Campos do produto componente
    consumo_produto_codigo: Optional[str] = None
    consumo_produto_nome: Optional[str] = None
    consumo_produto_estoque: Optional[int] = None

class FabricarProdutoRequest(BaseModel):
    quantidade: int = 1

@router.get("/{produto_id}/consumo", response_model=List[ConsumoItem])
async def listar_consumo_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os itens de consumo (componentes) de um produto fabricado.
    """
    # Verifica se o produto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, tipo_produto FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        # Lista os itens de consumo
        cursor.execute(
            """
            SELECT 
                pc.id,
                pc.produto_id,
                pc.consumo_produto_id,
                pc.quantidade,
                p.codigo as consumo_produto_codigo,
                p.nome as consumo_produto_nome,
                p.estoque_atual as consumo_produto_estoque
            FROM produtos_consumo pc
            INNER JOIN produtos p ON pc.consumo_produto_id = p.id
            WHERE pc.produto_id = %s
            ORDER BY p.nome
            """,
            (produto_id,)
        )
        itens = cursor.fetchall()
    
    return itens

@router.post("/{produto_id}/consumo", status_code=status.HTTP_201_CREATED)
async def adicionar_consumo_produto(
    produto_id: int,
    item: ConsumoItemCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Adiciona um item de consumo (componente) a um produto fabricado.
    """
    with get_db_cursor() as cursor:
        # Verifica se o produto pai existe e é fabricado
        cursor.execute(
            "SELECT id, tipo_produto, nome FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        if produto["tipo_produto"] != "fabricado":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Apenas produtos com tipo 'fabricado' podem ter itens de consumo"
            )
        
        # Verifica se o produto componente existe
        cursor.execute(
            "SELECT id, nome FROM produtos WHERE id = %s",
            (item.consumo_produto_id,)
        )
        componente = cursor.fetchone()
        
        if not componente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto componente não encontrado"
            )
        
        # Não permite adicionar o próprio produto como componente
        if item.consumo_produto_id == produto_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Um produto não pode ser componente de si mesmo"
            )
        
        # Verifica se a quantidade é válida
        if item.quantidade <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A quantidade deve ser maior que zero"
            )
        
        # Verifica se já existe este componente no produto
        cursor.execute(
            """
            SELECT id FROM produtos_consumo 
            WHERE produto_id = %s AND consumo_produto_id = %s
            """,
            (produto_id, item.consumo_produto_id)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este componente já está cadastrado para este produto"
            )
    
    # Insere o item de consumo
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO produtos_consumo (produto_id, consumo_produto_id, quantidade)
            VALUES (%s, %s, %s)
            """,
            (produto_id, item.consumo_produto_id, item.quantidade)
        )
        
        # Obtém o ID do item criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        item_id = cursor.fetchone()["LAST_INSERT_ID()"]
    
    return {
        "message": "Componente adicionado com sucesso",
        "id": item_id,
        "produto_id": produto_id,
        "consumo_produto_id": item.consumo_produto_id,
        "quantidade": item.quantidade
    }

@router.put("/{produto_id}/consumo/{consumo_id}")
async def atualizar_consumo_produto(
    produto_id: int,
    consumo_id: int,
    item: ConsumoItemCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza a quantidade de um item de consumo.
    """
    with get_db_cursor() as cursor:
        # Verifica se o item de consumo existe
        cursor.execute(
            """
            SELECT id FROM produtos_consumo 
            WHERE id = %s AND produto_id = %s
            """,
            (consumo_id, produto_id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item de consumo não encontrado"
            )
        
        if item.quantidade <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A quantidade deve ser maior que zero"
            )
    
    # Atualiza o item
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE produtos_consumo 
            SET quantidade = %s, consumo_produto_id = %s
            WHERE id = %s
            """,
            (item.quantidade, item.consumo_produto_id, consumo_id)
        )
    
    return {"message": "Componente atualizado com sucesso"}

@router.delete("/{produto_id}/consumo/{consumo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_consumo_produto(
    produto_id: int,
    consumo_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Remove um item de consumo (componente) de um produto fabricado.
    """
    with get_db_cursor() as cursor:
        # Verifica se o item de consumo existe
        cursor.execute(
            """
            SELECT id FROM produtos_consumo 
            WHERE id = %s AND produto_id = %s
            """,
            (consumo_id, produto_id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item de consumo não encontrado"
            )
    
    # Remove o item
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM produtos_consumo WHERE id = %s",
            (consumo_id,)
        )
    
    return None

@router.post("/{produto_id}/fabricar")
async def fabricar_produto(
    produto_id: int,
    request: FabricarProdutoRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Fabrica um produto, consumindo os componentes do estoque e adicionando
    o produto fabricado ao estoque.
    
    Fluxo:
    1. Valida se todos os componentes têm estoque suficiente
    2. Cria movimentações de saída para cada componente
    3. Cria movimentação de entrada para o produto fabricado
    """
    quantidade_fabricar = request.quantidade
    
    if quantidade_fabricar <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A quantidade deve ser maior que zero"
        )
    
    with get_db_cursor() as cursor:
        # Verifica se o produto existe e é fabricado
        cursor.execute(
            "SELECT id, tipo_produto, nome, codigo, preco_custo FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        if produto["tipo_produto"] != "fabricado":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Apenas produtos com tipo 'fabricado' podem ser fabricados"
            )
        
        # Obtém os componentes do produto
        cursor.execute(
            """
            SELECT 
                pc.id,
                pc.consumo_produto_id,
                pc.quantidade,
                p.codigo,
                p.nome,
                p.estoque_atual,
                p.preco_custo
            FROM produtos_consumo pc
            INNER JOIN produtos p ON pc.consumo_produto_id = p.id
            WHERE pc.produto_id = %s
            """,
            (produto_id,)
        )
        componentes = cursor.fetchall()
        
        if not componentes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este produto não possui componentes cadastrados para fabricação"
            )
        
        # Valida estoque de todos os componentes
        componentes_insuficientes = []
        for comp in componentes:
            quantidade_necessaria = comp["quantidade"] * quantidade_fabricar
            if comp["estoque_atual"] < quantidade_necessaria:
                componentes_insuficientes.append({
                    "codigo": comp["codigo"],
                    "nome": comp["nome"],
                    "estoque_atual": comp["estoque_atual"],
                    "quantidade_necessaria": quantidade_necessaria
                })
        
        if componentes_insuficientes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Estoque insuficiente para alguns componentes",
                    "componentes": componentes_insuficientes
                }
            )
    
    # Executa a fabricação
    with get_db_cursor(commit=True) as cursor:
        # Calcular o custo total dos componentes para uma unidade do produto fabricado
        custo_componentes_unitario = 0
        for comp in componentes:
            # Custo = preço de custo do componente * quantidade necessária por unidade
            custo_componentes_unitario += float(comp["preco_custo"]) * float(comp["quantidade"])
        
        # Custo total da fabricação (custo unitário * quantidade fabricada)
        custo_total_fabricacao = custo_componentes_unitario * quantidade_fabricar
        
        # Obter estoque atual e custo atual do produto fabricado
        cursor.execute(
            "SELECT estoque_atual, preco_custo FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto_atual = cursor.fetchone()
        estoque_atual = float(produto_atual["estoque_atual"] or 0)
        custo_atual = float(produto_atual["preco_custo"] or 0)
        
        # Calcular custo médio ponderado
        # Fórmula: (estoque_atual * custo_atual + quantidade_nova * custo_novo) / (estoque_atual + quantidade_nova)
        if estoque_atual > 0:
            valor_estoque_atual = estoque_atual * custo_atual
            valor_nova_entrada = quantidade_fabricar * custo_componentes_unitario
            novo_custo_medio = (valor_estoque_atual + valor_nova_entrada) / (estoque_atual + quantidade_fabricar)
        else:
            # Se não há estoque, o custo é simplesmente o custo dos componentes
            novo_custo_medio = custo_componentes_unitario
        
        # Arredondar para 2 casas decimais
        novo_custo_medio = round(novo_custo_medio, 2)
        
        # 1. Cria movimentações de saída para cada componente
        for comp in componentes:
            quantidade_consumir = comp["quantidade"] * quantidade_fabricar
            
            # Cria movimentação de saída
            cursor.execute(
                """
                INSERT INTO movimentacao_estoque 
                (produto_id, tipo, quantidade, motivo, documento_referencia, usuario_id, valor_unitario)
                VALUES (%s, 'saida', %s, %s, %s, %s, %s)
                """,
                (
                    comp["consumo_produto_id"],
                    quantidade_consumir,
                    f"Consumo para fabricação de {quantidade_fabricar}x {produto['nome']}"[:100],
                    f"FAB-{produto['codigo']}-{produto_id}",
                    current_user.id,
                    comp["preco_custo"]
                )
            )
            
            # Atualiza estoque do componente
            cursor.execute(
                """
                UPDATE produtos 
                SET estoque_atual = estoque_atual - %s 
                WHERE id = %s
                """,
                (quantidade_consumir, comp["consumo_produto_id"])
            )
        
        # 2. Cria movimentação de entrada para o produto fabricado com o custo calculado
        cursor.execute(
            """
            INSERT INTO movimentacao_estoque 
            (produto_id, tipo, quantidade, motivo, documento_referencia, usuario_id, valor_unitario)
            VALUES (%s, 'entrada', %s, %s, %s, %s, %s)
            """,
            (
                produto_id,
                quantidade_fabricar,
                f"Fabricação de produto (custo componentes: R$ {custo_componentes_unitario:.2f}/un)"[:100],
                f"FAB-{produto['codigo']}-{produto_id}",
                current_user.id,
                custo_componentes_unitario  # Usar o custo calculado dos componentes
            )
        )
        
        # 3. Atualiza estoque e custo médio do produto fabricado
        cursor.execute(
            """
            UPDATE produtos 
            SET estoque_atual = estoque_atual + %s,
                preco_custo = %s
            WHERE id = %s
            """,
            (quantidade_fabricar, novo_custo_medio, produto_id)
        )
        
        # Obtém o estoque atualizado
        cursor.execute(
            "SELECT estoque_atual, preco_custo FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto_atualizado = cursor.fetchone()
        novo_estoque = produto_atualizado["estoque_atual"]
        novo_custo = float(produto_atualizado["preco_custo"])
    
    return {
        "message": f"Produto fabricado com sucesso! {quantidade_fabricar} unidade(s) adicionada(s) ao estoque.",
        "produto_id": produto_id,
        "produto_nome": produto["nome"],
        "quantidade_fabricada": quantidade_fabricar,
        "novo_estoque": novo_estoque,
        "custo_componentes_unitario": custo_componentes_unitario,
        "custo_anterior": custo_atual,
        "novo_custo_medio": novo_custo,
        "componentes_consumidos": len(componentes)
    }

@router.get("/{produto_id}/verificar-estoque-fabricacao")
async def verificar_estoque_fabricacao(
    produto_id: int,
    quantidade: int = 1,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Verifica se há estoque suficiente dos componentes para fabricar
    uma determinada quantidade do produto.
    """
    if quantidade <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A quantidade deve ser maior que zero"
        )
    
    with get_db_cursor() as cursor:
        # Verifica se o produto existe
        cursor.execute(
            "SELECT id, tipo_produto, nome FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        # Obtém os componentes do produto
        cursor.execute(
            """
            SELECT 
                pc.consumo_produto_id,
                pc.quantidade,
                p.codigo,
                p.nome,
                p.estoque_atual
            FROM produtos_consumo pc
            INNER JOIN produtos p ON pc.consumo_produto_id = p.id
            WHERE pc.produto_id = %s
            """,
            (produto_id,)
        )
        componentes = cursor.fetchall()
    
    resultado = []
    pode_fabricar = True
    
    for comp in componentes:
        quantidade_necessaria = comp["quantidade"] * quantidade
        estoque_suficiente = comp["estoque_atual"] >= quantidade_necessaria
        
        if not estoque_suficiente:
            pode_fabricar = False
        
        resultado.append({
            "produto_id": comp["consumo_produto_id"],
            "codigo": comp["codigo"],
            "nome": comp["nome"],
            "quantidade_necessaria": quantidade_necessaria,
            "estoque_atual": comp["estoque_atual"],
            "estoque_suficiente": estoque_suficiente
        })
    
    return {
        "produto_id": produto_id,
        "produto_nome": produto["nome"],
        "quantidade_fabricar": quantidade,
        "pode_fabricar": pode_fabricar,
        "componentes": resultado
    }



