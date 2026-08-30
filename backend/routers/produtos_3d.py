from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from datetime import datetime
import os
import uuid
import shutil
import zipfile
import io
import asyncio
import tempfile
import threading

router = APIRouter()

# Diretório de uploads para produtos 3D
UPLOAD_DIR = "../frontend/uploads/produtos_3d"

# ============================================
# Modelos Pydantic - Categorias 3D
# ============================================

class Categoria3DBase(BaseModel):
    nome: str
    descricao: Optional[str] = None

class Categoria3DCreate(Categoria3DBase):
    pass

class Categoria3DUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None

class Categoria3D(Categoria3DBase):
    id: int
    ativo: bool
    usuario_id: Optional[int] = None
    data_cadastro: datetime

# ============================================
# Modelos Pydantic - Subcategorias 3D
# ============================================

class Subcategoria3DBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    categoria_id: int

class Subcategoria3DCreate(Subcategoria3DBase):
    pass

class Subcategoria3DUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None

class Subcategoria3D(Subcategoria3DBase):
    id: int
    ativo: bool
    usuario_id: Optional[int] = None
    data_cadastro: datetime
    categoria_nome: Optional[str] = None

# ============================================
# Modelos Pydantic - Produtos 3D
# ============================================

# Modelo para categoria vinculada ao produto
class CategoriaVinculada(BaseModel):
    id: int
    nome: str

class Produto3DBase(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    categoria_id: int  # Categoria principal (mantida para compatibilidade)
    subcategoria_id: Optional[int] = None

class Produto3DCreate(Produto3DBase):
    categoria_ids: Optional[List[int]] = None  # Lista de IDs de categorias adicionais

class Produto3DUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    categoria_id: Optional[int] = None
    categoria_ids: Optional[List[int]] = None  # Lista de IDs de categorias
    subcategoria_id: Optional[int] = None
    ativo: Optional[bool] = None

class ArquivoProduto3D(BaseModel):
    id: int
    produto_id: int
    tipo: str
    nome_arquivo: str
    caminho: str
    tamanho: Optional[int] = None
    ordem: int
    data_upload: datetime

class Produto3D(Produto3DBase):
    id: int
    ativo: bool
    usuario_id: Optional[int] = None
    data_cadastro: datetime
    data_atualizacao: datetime
    categoria_nome: Optional[str] = None
    subcategoria_nome: Optional[str] = None
    usuario_nome: Optional[str] = None
    arquivos: Optional[List[ArquivoProduto3D]] = None
    categorias: Optional[List[CategoriaVinculada]] = None  # Lista de todas as categorias vinculadas

# ============================================
# Funções Auxiliares
# ============================================

def buscar_categorias_produto(cursor, produto_id: int) -> List[dict]:
    """Busca todas as categorias vinculadas a um produto 3D."""
    cursor.execute("""
        SELECT c.id, c.nome 
        FROM produtos_3d_categorias pc
        JOIN categorias_3d c ON pc.categoria_id = c.id
        WHERE pc.produto_id = %s
        ORDER BY c.nome
    """, (produto_id,))
    return cursor.fetchall()

def sincronizar_categorias_produto(cursor, produto_id: int, categoria_ids: List[int]):
    """Sincroniza as categorias vinculadas a um produto 3D."""
    # Remove categorias antigas
    cursor.execute("DELETE FROM produtos_3d_categorias WHERE produto_id = %s", (produto_id,))
    
    # Adiciona novas categorias
    for cat_id in categoria_ids:
        cursor.execute("""
            INSERT INTO produtos_3d_categorias (produto_id, categoria_id)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE categoria_id = categoria_id
        """, (produto_id, cat_id))

# ============================================
# ENDPOINTS - Categorias 3D
# ============================================


@router.get("/categorias", response_model=List[Categoria3D])
async def listar_categorias_3d(
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as categorias de produtos 3D."""
    query = "SELECT * FROM categorias_3d WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND ativo = %s"
        params.append(ativo)
    
    query += " ORDER BY nome"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        categorias = cursor.fetchall()
    
    return categorias

@router.get("/categorias/{categoria_id}", response_model=Categoria3D)
async def obter_categoria_3d(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém uma categoria específica."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM categorias_3d WHERE id = %s", (categoria_id,))
        categoria = cursor.fetchone()
    
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoria não encontrada"
        )
    
    return categoria

@router.post("/categorias", response_model=Categoria3D, status_code=status.HTTP_201_CREATED)
async def criar_categoria_3d(
    categoria: Categoria3DCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria uma nova categoria de produtos 3D. Apenas admins podem criar."""
    # Verifica se é admin
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem criar categorias"
        )
    
    # Verifica se já existe
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM categorias_3d WHERE nome = %s", (categoria.nome,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe uma categoria com este nome"
            )
    
    # Cria a categoria
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO categorias_3d (nome, descricao, usuario_id)
            VALUES (%s, %s, %s)
            """,
            (categoria.nome, categoria.descricao, current_user.id)
        )
        
        cursor.execute("SELECT LAST_INSERT_ID()")
        categoria_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        cursor.execute("SELECT * FROM categorias_3d WHERE id = %s", (categoria_id,))
        nova_categoria = cursor.fetchone()
    
    return nova_categoria

@router.put("/categorias/{categoria_id}", response_model=Categoria3D)
async def atualizar_categoria_3d(
    categoria_id: int,
    categoria: Categoria3DUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza uma categoria. Apenas admins podem atualizar."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem atualizar categorias"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM categorias_3d WHERE id = %s", (categoria_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria não encontrada"
            )
        
        if categoria.nome:
            cursor.execute(
                "SELECT id FROM categorias_3d WHERE nome = %s AND id != %s",
                (categoria.nome, categoria_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe outra categoria com este nome"
                )
    
    update_data = {}
    if categoria.nome is not None:
        update_data["nome"] = categoria.nome
    if categoria.descricao is not None:
        update_data["descricao"] = categoria.descricao
    if categoria.ativo is not None:
        update_data["ativo"] = categoria.ativo
    
    if update_data:
        with get_db_cursor(commit=True) as cursor:
            set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
            values = list(update_data.values())
            values.append(categoria_id)
            
            cursor.execute(f"UPDATE categorias_3d SET {set_clause} WHERE id = %s", values)
            
            cursor.execute("SELECT * FROM categorias_3d WHERE id = %s", (categoria_id,))
            categoria_atualizada = cursor.fetchone()
    
    return categoria_atualizada

@router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_categoria_3d(
    categoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui uma categoria. Apenas admins podem excluir."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem excluir categorias"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM categorias_3d WHERE id = %s", (categoria_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria não encontrada"
            )
        
        # Verifica se tem produtos vinculados
        cursor.execute("SELECT COUNT(*) as count FROM produtos_3d WHERE categoria_id = %s", (categoria_id,))
        count = cursor.fetchone()["count"]
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível excluir. Existem {count} produtos vinculados a esta categoria"
            )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM categorias_3d WHERE id = %s", (categoria_id,))
    
    return None

# ============================================
# ENDPOINTS - Subcategorias 3D
# ============================================

@router.get("/subcategorias", response_model=List[Subcategoria3D])
async def listar_subcategorias_3d(
    categoria_id: Optional[int] = None,
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todas as subcategorias de produtos 3D."""
    query = """
        SELECT s.*, c.nome as categoria_nome
        FROM subcategorias_3d s
        LEFT JOIN categorias_3d c ON s.categoria_id = c.id
        WHERE 1=1
    """
    params = []
    
    if categoria_id is not None:
        query += " AND s.categoria_id = %s"
        params.append(categoria_id)
    
    if ativo is not None:
        query += " AND s.ativo = %s"
        params.append(ativo)
    
    query += " ORDER BY c.nome, s.nome"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        subcategorias = cursor.fetchall()
    
    return subcategorias

@router.get("/subcategorias/{subcategoria_id}", response_model=Subcategoria3D)
async def obter_subcategoria_3d(
    subcategoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém uma subcategoria específica."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT s.*, c.nome as categoria_nome
            FROM subcategorias_3d s
            LEFT JOIN categorias_3d c ON s.categoria_id = c.id
            WHERE s.id = %s
        """, (subcategoria_id,))
        subcategoria = cursor.fetchone()
    
    if not subcategoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subcategoria não encontrada"
        )
    
    return subcategoria

@router.post("/subcategorias", response_model=Subcategoria3D, status_code=status.HTTP_201_CREATED)
async def criar_subcategoria_3d(
    subcategoria: Subcategoria3DCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria uma nova subcategoria de produtos 3D. Apenas admins podem criar."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem criar subcategorias"
        )
    
    # Verifica se a categoria existe
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM categorias_3d WHERE id = %s AND ativo = TRUE", (subcategoria.categoria_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria não encontrada ou inativa"
            )
        
        # Verifica se já existe subcategoria com mesmo nome na mesma categoria
        cursor.execute(
            "SELECT id FROM subcategorias_3d WHERE nome = %s AND categoria_id = %s",
            (subcategoria.nome, subcategoria.categoria_id)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe uma subcategoria com este nome nesta categoria"
            )
    
    # Cria a subcategoria
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO subcategorias_3d (nome, descricao, categoria_id, usuario_id)
            VALUES (%s, %s, %s, %s)
            """,
            (subcategoria.nome, subcategoria.descricao, subcategoria.categoria_id, current_user.id)
        )
        
        cursor.execute("SELECT LAST_INSERT_ID()")
        subcategoria_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        cursor.execute("""
            SELECT s.*, c.nome as categoria_nome
            FROM subcategorias_3d s
            LEFT JOIN categorias_3d c ON s.categoria_id = c.id
            WHERE s.id = %s
        """, (subcategoria_id,))
        nova_subcategoria = cursor.fetchone()
    
    return nova_subcategoria

@router.put("/subcategorias/{subcategoria_id}", response_model=Subcategoria3D)
async def atualizar_subcategoria_3d(
    subcategoria_id: int,
    subcategoria: Subcategoria3DUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza uma subcategoria. Apenas admins podem atualizar."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem atualizar subcategorias"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM subcategorias_3d WHERE id = %s", (subcategoria_id,))
        subcategoria_existente = cursor.fetchone()
        if not subcategoria_existente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subcategoria não encontrada"
            )
        
        if subcategoria.nome:
            cursor.execute(
                "SELECT id FROM subcategorias_3d WHERE nome = %s AND categoria_id = %s AND id != %s",
                (subcategoria.nome, subcategoria_existente["categoria_id"], subcategoria_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe outra subcategoria com este nome nesta categoria"
                )
    
    update_data = {}
    if subcategoria.nome is not None:
        update_data["nome"] = subcategoria.nome
    if subcategoria.descricao is not None:
        update_data["descricao"] = subcategoria.descricao
    if subcategoria.ativo is not None:
        update_data["ativo"] = subcategoria.ativo
    
    if update_data:
        with get_db_cursor(commit=True) as cursor:
            set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
            values = list(update_data.values())
            values.append(subcategoria_id)
            
            cursor.execute(f"UPDATE subcategorias_3d SET {set_clause} WHERE id = %s", values)
            
            cursor.execute("""
                SELECT s.*, c.nome as categoria_nome
                FROM subcategorias_3d s
                LEFT JOIN categorias_3d c ON s.categoria_id = c.id
                WHERE s.id = %s
            """, (subcategoria_id,))
            subcategoria_atualizada = cursor.fetchone()
    
    return subcategoria_atualizada

@router.delete("/subcategorias/{subcategoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_subcategoria_3d(
    subcategoria_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui uma subcategoria. Apenas admins podem excluir."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem excluir subcategorias"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM subcategorias_3d WHERE id = %s", (subcategoria_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subcategoria não encontrada"
            )
        
        # Verifica se tem produtos vinculados
        cursor.execute("SELECT COUNT(*) as count FROM produtos_3d WHERE subcategoria_id = %s", (subcategoria_id,))
        count = cursor.fetchone()["count"]
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível excluir. Existem {count} produtos vinculados a esta subcategoria"
            )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM subcategorias_3d WHERE id = %s", (subcategoria_id,))
    
    return None

# ============================================
# ENDPOINTS - Produtos 3D
# ============================================

@router.get("/", response_model=List[Produto3D])
async def listar_produtos_3d(
    categoria_id: Optional[int] = None,
    subcategoria_id: Optional[int] = None,
    ativo: Optional[bool] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Lista todos os produtos 3D com filtros opcionais."""
    # Se categoria_id foi informado, buscar produtos que pertencem a essa categoria
    # via tabela de relacionamento N:N
    if categoria_id is not None:
        query = """
            SELECT DISTINCT p.*, c.nome as categoria_nome, s.nome as subcategoria_nome, u.nome as usuario_nome
            FROM produtos_3d p
            LEFT JOIN categorias_3d c ON p.categoria_id = c.id
            LEFT JOIN subcategorias_3d s ON p.subcategoria_id = s.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN produtos_3d_categorias pc ON p.id = pc.produto_id
            WHERE (p.categoria_id = %s OR pc.categoria_id = %s)
        """
        params = [categoria_id, categoria_id]
    else:
        query = """
            SELECT p.*, c.nome as categoria_nome, s.nome as subcategoria_nome, u.nome as usuario_nome
            FROM produtos_3d p
            LEFT JOIN categorias_3d c ON p.categoria_id = c.id
            LEFT JOIN subcategorias_3d s ON p.subcategoria_id = s.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE 1=1
        """
        params = []
    
    if subcategoria_id is not None:
        query += " AND p.subcategoria_id = %s"
        params.append(subcategoria_id)
    
    if ativo is not None:
        query += " AND p.ativo = %s"
        params.append(ativo)
    
    query += " ORDER BY p.data_cadastro DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()
        
        # Busca arquivos e categorias para cada produto
        for produto in produtos:
            cursor.execute(
                "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s ORDER BY tipo, ordem",
                (produto["id"],)
            )
            produto["arquivos"] = cursor.fetchall()
            
            # Busca todas as categorias vinculadas
            produto["categorias"] = buscar_categorias_produto(cursor, produto["id"])
    
    return produtos

@router.get("/{produto_id}", response_model=Produto3D)
async def obter_produto_3d(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém os detalhes de um produto 3D específico."""
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT p.*, c.nome as categoria_nome, s.nome as subcategoria_nome, u.nome as usuario_nome
            FROM produtos_3d p
            LEFT JOIN categorias_3d c ON p.categoria_id = c.id
            LEFT JOIN subcategorias_3d s ON p.subcategoria_id = s.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
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
        
        # Busca arquivos do produto
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s ORDER BY tipo, ordem",
            (produto_id,)
        )
        produto["arquivos"] = cursor.fetchall()
        
        # Busca todas as categorias vinculadas
        produto["categorias"] = buscar_categorias_produto(cursor, produto_id)
    
    return produto

@router.post("/", status_code=status.HTTP_201_CREATED)
async def criar_produto_3d(
    titulo: str = Form(...),
    descricao: str = Form(None),
    categoria_id: int = Form(...),
    categoria_ids: str = Form(None),  # Lista de IDs separados por vírgula
    subcategoria_id: int = Form(None),
    imagens: List[UploadFile] = File(None),
    videos: List[UploadFile] = File(None),
    stl_files: List[UploadFile] = File(None),
    gif_files: List[UploadFile] = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """Cria um novo produto 3D com upload de arquivos e múltiplas categorias."""
    # Verifica se a categoria existe
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM categorias_3d WHERE id = %s AND ativo = TRUE", (categoria_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria não encontrada ou inativa"
            )
        
        # Verifica se a subcategoria existe e pertence à categoria (se informada)
        if subcategoria_id:
            cursor.execute(
                "SELECT id FROM subcategorias_3d WHERE id = %s AND categoria_id = %s AND ativo = TRUE",
                (subcategoria_id, categoria_id)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Subcategoria não encontrada, inativa ou não pertence à categoria selecionada"
                )
    
    # Valida quantidade de arquivos
    if imagens and len(imagens) > 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo de 3 imagens permitidas"
        )
    
    if videos and len(videos) > 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo de 3 vídeos permitidos"
        )
    
    if gif_files and len(gif_files) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo de 1 GIF permitido"
        )
    
    # Cria diretórios se não existirem
    os.makedirs(os.path.join(UPLOAD_DIR, "imagens"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "videos"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "stl"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "gifs"), exist_ok=True)
    
    # Cria o produto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO produtos_3d (titulo, descricao, categoria_id, subcategoria_id, usuario_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (titulo, descricao, categoria_id, subcategoria_id, current_user.id)
        )
        
        cursor.execute("SELECT LAST_INSERT_ID()")
        produto_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Processa imagens
        if imagens:
            ordem = 0
            for img in imagens:
                if img.filename and img.size > 0:
                    arquivo_info = await salvar_arquivo(img, "imagens", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'imagem', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], ordem)
                    )
                    ordem += 1
        
        # Processa vídeos
        if videos:
            ordem = 0
            for video in videos:
                if video.filename and video.size > 0:
                    arquivo_info = await salvar_arquivo(video, "videos", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'video', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], ordem)
                    )
                    ordem += 1
        
        # Processa arquivos STL
        if stl_files:
            ordem = 0
            for stl in stl_files:
                if stl.filename and stl.size > 0:
                    arquivo_info = await salvar_arquivo(stl, "stl", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'stl', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], ordem)
                    )
                    ordem += 1
        
        # Processa GIFs (máximo 1)
        if gif_files:
            for gif in gif_files[:1]:  # Apenas o primeiro GIF
                if gif.filename and gif.size > 0:
                    arquivo_info = await salvar_arquivo(gif, "gifs", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'gif', %s, %s, %s, 0)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"])
                    )
        
        # Sincroniza categorias
        # Converte categoria_ids de string para lista de inteiros
        lista_categorias = [categoria_id]  # Sempre inclui a categoria principal
        if categoria_ids:
            try:
                ids_adicionais = [int(x.strip()) for x in categoria_ids.split(',') if x.strip()]
                lista_categorias.extend(ids_adicionais)
            except ValueError:
                pass
        # Remove duplicatas mantendo ordem
        lista_categorias = list(dict.fromkeys(lista_categorias))
        sincronizar_categorias_produto(cursor, produto_id, lista_categorias)
        
        # Retorna o produto criado
        cursor.execute(
            """
            SELECT p.*, c.nome as categoria_nome, s.nome as subcategoria_nome, u.nome as usuario_nome
            FROM produtos_3d p
            LEFT JOIN categorias_3d c ON p.categoria_id = c.id
            LEFT JOIN subcategorias_3d s ON p.subcategoria_id = s.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        novo_produto = cursor.fetchone()
        
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s ORDER BY tipo, ordem",
            (produto_id,)
        )
        novo_produto["arquivos"] = cursor.fetchall()
        
        # Busca categorias vinculadas
        novo_produto["categorias"] = buscar_categorias_produto(cursor, produto_id)
    
    return novo_produto

@router.put("/{produto_id}")
async def atualizar_produto_3d(
    produto_id: int,
    titulo: str = Form(None),
    descricao: str = Form(None),
    categoria_id: int = Form(None),
    categoria_ids: str = Form(None),  # Lista de IDs separados por vírgula
    subcategoria_id: int = Form(None),
    ativo: bool = Form(None),
    novas_imagens: List[UploadFile] = File(None),
    novos_videos: List[UploadFile] = File(None),
    novos_stl_files: List[UploadFile] = File(None),
    gif_files: List[UploadFile] = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza um produto 3D existente."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM produtos_3d WHERE id = %s", (produto_id,))
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        if categoria_id:
            cursor.execute("SELECT id FROM categorias_3d WHERE id = %s AND ativo = TRUE", (categoria_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Categoria não encontrada ou inativa"
                )
        
        # Verifica subcategoria se informada
        if subcategoria_id:
            cat_id = categoria_id if categoria_id else produto["categoria_id"]
            cursor.execute(
                "SELECT id FROM subcategorias_3d WHERE id = %s AND categoria_id = %s AND ativo = TRUE",
                (subcategoria_id, cat_id)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Subcategoria não encontrada, inativa ou não pertence à categoria"
                )
    
    # Prepara dados para atualização
    update_data = {}
    if titulo is not None:
        update_data["titulo"] = titulo
    if descricao is not None:
        update_data["descricao"] = descricao
    if categoria_id is not None:
        update_data["categoria_id"] = categoria_id
    if subcategoria_id is not None:
        update_data["subcategoria_id"] = subcategoria_id
    if ativo is not None:
        update_data["ativo"] = ativo
    
    with get_db_cursor(commit=True) as cursor:
        if update_data:
            set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
            values = list(update_data.values())
            values.append(produto_id)
            cursor.execute(f"UPDATE produtos_3d SET {set_clause} WHERE id = %s", values)
        
        # Processa novas imagens
        if novas_imagens:
            # Conta imagens existentes
            cursor.execute(
                "SELECT COUNT(*) as count FROM arquivos_produto_3d WHERE produto_id = %s AND tipo = 'imagem'",
                (produto_id,)
            )
            count_imagens = cursor.fetchone()["count"]
            
            for img in novas_imagens:
                if img.filename and img.size > 0:
                    if count_imagens >= 3:
                        break
                    arquivo_info = await salvar_arquivo(img, "imagens", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'imagem', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], count_imagens)
                    )
                    count_imagens += 1
        
        # Processa novos vídeos
        if novos_videos:
            cursor.execute(
                "SELECT COUNT(*) as count FROM arquivos_produto_3d WHERE produto_id = %s AND tipo = 'video'",
                (produto_id,)
            )
            count_videos = cursor.fetchone()["count"]
            
            for video in novos_videos:
                if video.filename and video.size > 0:
                    if count_videos >= 3:
                        break
                    arquivo_info = await salvar_arquivo(video, "videos", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'video', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], count_videos)
                    )
                    count_videos += 1
        
        # Processa novos STL
        if novos_stl_files:
            cursor.execute(
                "SELECT COUNT(*) as count FROM arquivos_produto_3d WHERE produto_id = %s AND tipo = 'stl'",
                (produto_id,)
            )
            count_stl = cursor.fetchone()["count"]
            
            for stl in novos_stl_files:
                if stl.filename and stl.size > 0:
                    arquivo_info = await salvar_arquivo(stl, "stl", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'stl', %s, %s, %s, %s)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"], count_stl)
                    )
                    count_stl += 1
        
        # Processa GIFs (máximo 1 - substitui o existente se houver novo)
        if gif_files:
            # Verifica se já existe GIF
            cursor.execute(
                "SELECT COUNT(*) as count FROM arquivos_produto_3d WHERE produto_id = %s AND tipo = 'gif'",
                (produto_id,)
            )
            count_gif = cursor.fetchone()["count"]
            
            # Cria diretório se não existir
            os.makedirs(os.path.join(UPLOAD_DIR, "gifs"), exist_ok=True)
            
            for gif in gif_files[:1]:  # Apenas o primeiro GIF
                if gif.filename and gif.size > 0:
                    if count_gif >= 1:
                        # Já existe GIF, não adiciona outro
                        break
                    arquivo_info = await salvar_arquivo(gif, "gifs", produto_id)
                    cursor.execute(
                        """
                        INSERT INTO arquivos_produto_3d (produto_id, tipo, nome_arquivo, caminho, tamanho, ordem)
                        VALUES (%s, 'gif', %s, %s, %s, 0)
                        """,
                        (produto_id, arquivo_info["nome"], arquivo_info["caminho"], arquivo_info["tamanho"])
                    )
                    count_gif += 1
        # Sincroniza categorias se informadas
        if categoria_ids is not None:
            # Converte categoria_ids de string para lista de inteiros
            lista_categorias = []
            if categoria_id:
                lista_categorias.append(categoria_id)
            elif update_data.get("categoria_id"):
                lista_categorias.append(update_data["categoria_id"])
            else:
                # Usa a categoria principal atual do produto
                cursor.execute("SELECT categoria_id FROM produtos_3d WHERE id = %s", (produto_id,))
                prod_atual = cursor.fetchone()
                if prod_atual and prod_atual["categoria_id"]:
                    lista_categorias.append(prod_atual["categoria_id"])
            
            if categoria_ids:
                try:
                    ids_adicionais = [int(x.strip()) for x in categoria_ids.split(',') if x.strip()]
                    lista_categorias.extend(ids_adicionais)
                except ValueError:
                    pass
            # Remove duplicatas mantendo ordem
            lista_categorias = list(dict.fromkeys(lista_categorias))
            if lista_categorias:
                sincronizar_categorias_produto(cursor, produto_id, lista_categorias)
        
        # Retorna produto atualizado
        cursor.execute(
            """
            SELECT p.*, c.nome as categoria_nome, s.nome as subcategoria_nome, u.nome as usuario_nome
            FROM produtos_3d p
            LEFT JOIN categorias_3d c ON p.categoria_id = c.id
            LEFT JOIN subcategorias_3d s ON p.subcategoria_id = s.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = %s
            """,
            (produto_id,)
        )
        produto_atualizado = cursor.fetchone()
        
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s ORDER BY tipo, ordem",
            (produto_id,)
        )
        produto_atualizado["arquivos"] = cursor.fetchall()
        
        # Busca categorias vinculadas
        produto_atualizado["categorias"] = buscar_categorias_produto(cursor, produto_id)
    
    return produto_atualizado

@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_produto_3d(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui um produto 3D e seus arquivos."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM produtos_3d WHERE id = %s", (produto_id,))
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        # Busca arquivos para deletar do disco
        cursor.execute("SELECT caminho FROM arquivos_produto_3d WHERE produto_id = %s", (produto_id,))
        arquivos = cursor.fetchall()
    
    # Deleta arquivos do disco
    for arquivo in arquivos:
        file_path = os.path.join("../frontend", arquivo["caminho"])
        if os.path.exists(file_path):
            os.remove(file_path)
    
    # Deleta do banco (CASCADE vai deletar arquivos_produto_3d)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM produtos_3d WHERE id = %s", (produto_id,))
    
    return None

@router.delete("/{produto_id}/arquivo/{arquivo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_arquivo_produto_3d(
    produto_id: int,
    arquivo_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Exclui um arquivo específico de um produto 3D."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE id = %s AND produto_id = %s",
            (arquivo_id, produto_id)
        )
        arquivo = cursor.fetchone()
        
        if not arquivo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Arquivo não encontrado"
            )
    
    # Deleta arquivo do disco
    file_path = os.path.join("../frontend", arquivo["caminho"])
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Deleta do banco
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM arquivos_produto_3d WHERE id = %s", (arquivo_id,))
    
    return None

# Diretório para ZIPs temporários
TEMP_ZIP_DIR = "../frontend/uploads/produtos_3d/temp_zips"
os.makedirs(TEMP_ZIP_DIR, exist_ok=True)

# Dicionário para rastrear status de downloads em andamento
download_tasks = {}

def criar_zip_em_background(task_id: str, produto_id: int, titulo: str, arquivos: list):
    """Cria o ZIP em uma thread separada para não bloquear o servidor."""
    try:
        download_tasks[task_id] = {"status": "processing", "progress": 0}
        
        # Cria arquivo ZIP no disco
        nome_arquivo = titulo.replace(" ", "_").replace("/", "_")[:50]
        zip_path = os.path.join(TEMP_ZIP_DIR, f"{task_id}_{nome_arquivo}_3D.zip")
        
        total_arquivos = len(arquivos)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zip_file:  # ZIP_STORED é mais rápido
            for i, arquivo in enumerate(arquivos):
                file_path = os.path.join("../frontend", arquivo["caminho"])
                if os.path.exists(file_path):
                    tipo_pasta = arquivo["tipo"] + "s"
                    arcname = f"{tipo_pasta}/{arquivo['nome_arquivo']}"
                    zip_file.write(file_path, arcname)
                
                download_tasks[task_id]["progress"] = int((i + 1) / total_arquivos * 100)
        
        download_tasks[task_id] = {
            "status": "ready",
            "progress": 100,
            "zip_path": zip_path,
            "filename": f"{nome_arquivo}_3D.zip"
        }
    except Exception as e:
        download_tasks[task_id] = {"status": "error", "error": str(e)}

@router.post("/{produto_id}/download/iniciar")
async def iniciar_download_produto_3d(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Inicia o processo de criação do ZIP em background. Retorna um task_id para acompanhar."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT titulo FROM produtos_3d WHERE id = %s", (produto_id,))
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s",
            (produto_id,)
        )
        arquivos = cursor.fetchall()
    
    if not arquivos:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum arquivo encontrado para este produto"
        )
    
    # Cria task ID único
    task_id = str(uuid.uuid4())
    
    # Inicia thread para criar ZIP
    thread = threading.Thread(
        target=criar_zip_em_background,
        args=(task_id, produto_id, produto["titulo"], arquivos)
    )
    thread.start()
    
    return {"task_id": task_id, "status": "started"}

@router.get("/download/status/{task_id}")
async def status_download_produto_3d(
    task_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Verifica o status de um download em andamento."""
    if task_id not in download_tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task não encontrada"
        )
    
    return download_tasks[task_id]

@router.get("/download/arquivo/{task_id}")
async def baixar_arquivo_zip(
    task_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Faz download do arquivo ZIP pronto."""
    if task_id not in download_tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task não encontrada"
        )
    
    task = download_tasks[task_id]
    
    if task["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo ainda não está pronto"
        )
    
    zip_path = task["zip_path"]
    filename = task["filename"]
    
    if not os.path.exists(zip_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo ZIP não encontrado"
        )
    
    # Remove da lista de tasks após um tempo
    async def cleanup():
        await asyncio.sleep(60)  # Mantém por 1 minuto após download
        if task_id in download_tasks:
            try:
                os.remove(zip_path)
            except:
                pass
            del download_tasks[task_id]
    
    asyncio.create_task(cleanup())
    
    return FileResponse(
        path=zip_path,
        filename=filename,
        media_type="application/zip"
    )

@router.get("/{produto_id}/download")
async def download_produto_3d(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Download direto para arquivos pequenos (fallback)."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT titulo FROM produtos_3d WHERE id = %s", (produto_id,))
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto não encontrado"
            )
        
        cursor.execute(
            "SELECT * FROM arquivos_produto_3d WHERE produto_id = %s",
            (produto_id,)
        )
        arquivos = cursor.fetchall()
    
    if not arquivos:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum arquivo encontrado para este produto"
        )
    
    # Para poucos arquivos pequenos, usa método direto
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_STORED) as zip_file:
        for arquivo in arquivos:
            file_path = os.path.join("../frontend", arquivo["caminho"])
            if os.path.exists(file_path):
                tipo_pasta = arquivo["tipo"] + "s"
                arcname = f"{tipo_pasta}/{arquivo['nome_arquivo']}"
                zip_file.write(file_path, arcname)
    
    zip_buffer.seek(0)
    nome_arquivo = produto["titulo"].replace(" ", "_").replace("/", "_")[:50]
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{nome_arquivo}_3D.zip"'
        }
    )

@router.get("/arquivo/{arquivo_id}")
async def obter_arquivo_produto_3d(
    arquivo_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Obtém um arquivo específico de um produto 3D."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM arquivos_produto_3d WHERE id = %s", (arquivo_id,))
        arquivo = cursor.fetchone()
    
    if not arquivo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo não encontrado"
        )
    
    file_path = os.path.join("../frontend", arquivo["caminho"])
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo não encontrado no servidor"
        )
    
    # Determina o media type
    media_types = {
        "imagem": "image/jpeg",
        "video": "video/mp4",
        "stl": "application/octet-stream"
    }
    
    return FileResponse(
        path=file_path,
        filename=arquivo["nome_arquivo"],
        media_type=media_types.get(arquivo["tipo"], "application/octet-stream")
    )

# ============================================
# Funções Auxiliares
# ============================================

async def salvar_arquivo(arquivo: UploadFile, tipo: str, produto_id: int) -> dict:
    """Salva um arquivo no disco usando streaming para suportar arquivos grandes."""
    import shutil
    
    # Gera nome único
    extensao = os.path.splitext(arquivo.filename)[1].lower()
    nome_unico = f"{produto_id}_{uuid.uuid4()}{extensao}"
    
    # Define caminho
    caminho_relativo = f"uploads/produtos_3d/{tipo}/{nome_unico}"
    caminho_completo = os.path.join("../frontend", caminho_relativo)
    
    # Garante que o diretório existe
    os.makedirs(os.path.dirname(caminho_completo), exist_ok=True)
    
    # Salva arquivo em chunks usando shutil.copyfileobj
    # Isso evita carregar o arquivo inteiro na memória
    tamanho = 0
    with open(caminho_completo, "wb") as buffer:
        # Usa copyfileobj com buffer de 1MB para arquivos grandes
        shutil.copyfileobj(arquivo.file, buffer, length=1024 * 1024)
    
    # Obtém o tamanho do arquivo salvo
    tamanho = os.path.getsize(caminho_completo)
    
    return {
        "nome": arquivo.filename,
        "caminho": caminho_relativo,
        "tamanho": tamanho
    }
