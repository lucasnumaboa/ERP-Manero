from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
from datetime import datetime
import os
import uuid
import shutil

router = APIRouter()

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
    ativo: Optional[bool] = None

class Produto(ProdutoBase):
    id: int
    estoque_atual: int
    data_cadastro: datetime
    categoria_nome: Optional[str] = None
    caminho_imagem: Optional[str] = None

# Rotas
@router.get("/", response_model=List[Produto])
async def listar_produtos(
    ativo: Optional[bool] = None,
    categoria_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os produtos cadastrados no sistema.
    Pode filtrar por status (ativo/inativo) e categoria.
    """
    query = "SELECT p.*, c.nome AS categoria_nome FROM produtos p LEFT JOIN categorias_produtos c ON p.categoria_id = c.id WHERE 1=1"
    params = []
    
    if ativo is not None:
        query += " AND p.ativo = %s"
        params.append(ativo)
    
    if categoria_id is not None:
        query += " AND p.categoria_id = %s"
        params.append(categoria_id)
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()
    
    return produtos

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
            "SELECT * FROM produtos WHERE id = %s",
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
    preco_custo: float = Form(...),
    preco_venda: float = Form(...),
    estoque_minimo: int = Form(5),
    categoria_id: int = Form(...),
    tipo_produto: str = Form("comprado"),
    comissao: float = Form(0.0),
    ativo: bool = Form(True),
    imagens: List[UploadFile] = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo produto no sistema com upload de imagens.
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
    
    # Valida tipo_produto
    if tipo_produto not in ["comprado", "fabricado"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de produto deve ser 'comprado' ou 'fabricado'"
        )
    
    # Processa upload de imagens
    caminhos_imagens = []
    if imagens and len(imagens) > 0:
        # Limita a 3 imagens
        if len(imagens) > 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 3 imagens permitidas"
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
                
                caminhos_imagens.append(f"uploads/produtos/{unique_filename}")
    
    # Junta os caminhos das imagens em uma string separada por vírgulas
    caminho_imagem = ",".join(caminhos_imagens) if caminhos_imagens else None
    
    # Cria o produto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO produtos (
                codigo, nome, descricao, preco_custo, preco_venda,
                estoque_atual, estoque_minimo, categoria_id, tipo_produto,
                comissao, caminho_imagem, ativo
            )
            VALUES (%s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                codigo, nome, descricao, preco_custo, preco_venda,
                estoque_minimo, categoria_id, tipo_produto, comissao,
                caminho_imagem, ativo
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
    if produto.ativo is not None:
        update_data["ativo"] = produto.ativo
    
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
            "SELECT * FROM produtos WHERE id = %s",
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
    preco_custo: float = Form(...),
    preco_venda: float = Form(...),
    estoque_minimo: int = Form(5),
    categoria_id: int = Form(...),
    tipo_produto: str = Form("comprado"),
    comissao: float = Form(0.0),
    ativo: bool = Form(True),
    imagens: List[UploadFile] = File(None),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza um produto existente com upload de novas imagens.
    """
    # Verifica se o produto existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, caminho_imagem FROM produtos WHERE id = %s",
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
    
    # Valida tipo_produto
    if tipo_produto not in ["comprado", "fabricado"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de produto deve ser 'comprado' ou 'fabricado'"
        )
    
    # Processa upload de imagens
    caminhos_imagens = []
    if imagens and len(imagens) > 0:
        # Limita a 3 imagens
        if len(imagens) > 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 3 imagens permitidas"
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
                
                caminhos_imagens.append(f"uploads/produtos/{unique_filename}")
    
    # Junta os caminhos das imagens em uma string separada por vírgulas
    caminho_imagem = ",".join(caminhos_imagens) if caminhos_imagens else produto_existente.get("caminho_imagem")
    
    # Atualiza o produto
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE produtos SET 
                codigo = %s, 
                nome = %s, 
                descricao = %s, 
                preco_custo = %s, 
                preco_venda = %s,
                estoque_minimo = %s, 
                categoria_id = %s, 
                tipo_produto = %s,
                comissao = %s, 
                caminho_imagem = %s, 
                ativo = %s
            WHERE id = %s
            """,
            (
                codigo, nome, descricao, preco_custo, preco_venda,
                estoque_minimo, categoria_id, tipo_produto, comissao,
                caminho_imagem, ativo, produto_id
            )
        )
        
        cursor.execute(
            "SELECT * FROM produtos WHERE id = %s",
            (produto_id,)
        )
        produto_atualizado = cursor.fetchone()
    
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
