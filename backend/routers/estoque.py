from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class MovimentacaoEstoqueBase(BaseModel):
    produto_id: int
    tipo: str  # 'entrada', 'saida', 'ajuste'
    quantidade: int
    motivo: Optional[str] = None
    documento_referencia: Optional[str] = None

class MovimentacaoEstoqueCreate(MovimentacaoEstoqueBase):
    pass

class MovimentacaoEstoque(MovimentacaoEstoqueBase):
    id: int
    data_movimentacao: str
    usuario_id: int

# Rotas
@router.get("/movimentacoes", response_model=List[MovimentacaoEstoque])
async def listar_movimentacoes(
    produto_id: Optional[int] = None,
    tipo: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as movimentações de estoque cadastradas no sistema.
    Pode filtrar por produto e tipo de movimentação.
    """
    query = "SELECT * FROM movimentacao_estoque WHERE 1=1"
    params = []
    
    if produto_id is not None:
        query += " AND produto_id = %s"
        params.append(produto_id)
    
    if tipo is not None:
        query += " AND tipo = %s"
        params.append(tipo)
    
    query += " ORDER BY data_movimentacao DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        movimentacoes = cursor.fetchall()
    
    return movimentacoes

@router.get("/produtos", response_model=List[dict])
async def listar_produtos_estoque(
    abaixo_minimo: Optional[bool] = None,
    categoria_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os produtos com informações de estoque.
    Pode filtrar por produtos abaixo do estoque mínimo e categoria.
    """
    query = """
        SELECT p.*, c.nome as categoria_nome
        FROM produtos p
        LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
        WHERE 1=1
    """
    params = []
    
    if abaixo_minimo is not None and abaixo_minimo:
        query += " AND p.estoque_atual < p.estoque_minimo"
    
    if categoria_id is not None:
        query += " AND p.categoria_id = %s"
        params.append(categoria_id)
    
    query += " ORDER BY p.nome"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        produtos = cursor.fetchall()
    
    return produtos

@router.post("/movimentacoes", response_model=MovimentacaoEstoque, status_code=status.HTTP_201_CREATED)
async def criar_movimentacao_estoque(
    movimentacao: MovimentacaoEstoqueCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria uma nova movimentação de estoque no sistema.
    Atualiza automaticamente o estoque atual do produto.
    """
    # Verifica se o tipo de movimentação é válido
    if movimentacao.tipo not in ["entrada", "saida", "ajuste"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de movimentação inválido. Deve ser 'entrada', 'saida' ou 'ajuste'"
        )
    
    # Verifica se a quantidade é válida
    if movimentacao.quantidade <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A quantidade deve ser maior que zero"
        )
    
    # Verifica se o produto existe e obtém seu estoque atual
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, estoque_atual FROM produtos WHERE id = %s",
            (movimentacao.produto_id,)
        )
        produto = cursor.fetchone()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Produto não encontrado"
            )
        
        # Verifica se há estoque suficiente para saída
        if movimentacao.tipo == "saida" and produto["estoque_atual"] < movimentacao.quantidade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para o produto {produto['nome']}. Disponível: {produto['estoque_atual']}"
            )
    
    # Calcula o novo estoque
    estoque_atual = produto["estoque_atual"]
    if movimentacao.tipo == "entrada":
        novo_estoque = estoque_atual + movimentacao.quantidade
    elif movimentacao.tipo == "saida":
        novo_estoque = estoque_atual - movimentacao.quantidade
    else:  # ajuste
        novo_estoque = movimentacao.quantidade
    
    # Cria a movimentação e atualiza o estoque
    with get_db_cursor(commit=True) as cursor:
        # Insere a movimentação
        cursor.execute(
            """
            INSERT INTO movimentacao_estoque (
                produto_id, tipo, quantidade, motivo,
                documento_referencia, usuario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                movimentacao.produto_id, movimentacao.tipo,
                movimentacao.quantidade, movimentacao.motivo,
                movimentacao.documento_referencia, current_user.id
            )
        )
        
        # Obtém o ID da movimentação criada
        cursor.execute("SELECT LAST_INSERT_ID()")
        movimentacao_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Atualiza o estoque do produto
        cursor.execute(
            "UPDATE produtos SET estoque_atual = %s WHERE id = %s",
            (novo_estoque, movimentacao.produto_id)
        )
        
        # Obtém os dados da movimentação criada
        cursor.execute(
            "SELECT * FROM movimentacao_estoque WHERE id = %s",
            (movimentacao_id,)
        )
        nova_movimentacao = cursor.fetchone()
    
    return nova_movimentacao

@router.get("/movimentacoes/{movimentacao_id}", response_model=MovimentacaoEstoque)
async def obter_movimentacao_estoque(
    movimentacao_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de uma movimentação de estoque específica.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM movimentacao_estoque WHERE id = %s",
            (movimentacao_id,)
        )
        movimentacao = cursor.fetchone()
    
    if not movimentacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movimentação de estoque não encontrada"
        )
    
    return movimentacao

@router.post("/receber-pedido/{pedido_id}", status_code=status.HTTP_200_OK)
async def receber_pedido_compra(
    pedido_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Recebe um pedido de compra, atualizando o estoque dos produtos.
    Altera o status do pedido para 'recebido'.
    """
    # Verifica se o pedido existe e pode ser recebido
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status, codigo FROM pedidos_compra WHERE id = %s",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de compra não encontrado"
            )
        
        if pedido["status"] not in ["pendente", "aprovado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível receber um pedido com status '{pedido['status']}'"
            )
        
        # Obtém os itens do pedido
        cursor.execute(
            """
            SELECT i.*, p.nome as produto_nome
            FROM itens_pedido_compra i
            JOIN produtos p ON i.produto_id = p.id
            WHERE i.pedido_id = %s
            """,
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        if not itens:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O pedido não possui itens"
            )
    
    # Recebe o pedido e atualiza o estoque
    with get_db_cursor(commit=True) as cursor:
        # Atualiza o status do pedido
        cursor.execute(
            "UPDATE pedidos_compra SET status = 'recebido' WHERE id = %s",
            (pedido_id,)
        )
        
        # Processa cada item do pedido
        for item in itens:
            # Obtém o estoque atual do produto
            cursor.execute(
                "SELECT estoque_atual FROM produtos WHERE id = %s",
                (item["produto_id"],)
            )
            produto = cursor.fetchone()
            novo_estoque = produto["estoque_atual"] + item["quantidade"]
            
            # Atualiza o estoque do produto
            cursor.execute(
                "UPDATE produtos SET estoque_atual = %s WHERE id = %s",
                (novo_estoque, item["produto_id"])
            )
            
            # Registra a movimentação de estoque
            cursor.execute(
                """
                INSERT INTO movimentacao_estoque (
                    produto_id, tipo, quantidade, motivo,
                    documento_referencia, usuario_id
                )
                VALUES (%s, 'entrada', %s, 'Recebimento de pedido de compra',
                        %s, %s)
                """,
                (
                    item["produto_id"], item["quantidade"],
                    pedido["codigo"], current_user.id
                )
            )
    
    return {"message": "Pedido recebido com sucesso"}

@router.get("/produto/{produto_id}/historico", response_model=List[MovimentacaoEstoque])
async def historico_produto(
    produto_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém o histórico de movimentações de estoque de um produto específico.
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
        
        # Obtém as movimentações do produto
        cursor.execute(
            """
            SELECT * FROM movimentacao_estoque
            WHERE produto_id = %s
            ORDER BY data_movimentacao DESC
            """,
            (produto_id,)
        )
        movimentacoes = cursor.fetchall()
    
    return movimentacoes
