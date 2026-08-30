from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
from database import get_db_cursor
from auth import get_current_user, UserInDB

router = APIRouter()

# Modelos Pydantic
class ItemPedidoVendaBase(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float
    desconto: float = 0
    comissao_item: float = 0

class ItemPedidoVendaCreate(ItemPedidoVendaBase):
    pass

class ItemPedidoVenda(ItemPedidoVendaBase):
    id: int
    subtotal: float
    pedido_id: int
    produto_nome: Optional[str] = None
    custo_item: Optional[float] = None

class PedidoVendaBase(BaseModel):
    cliente_id: int
    vendedor_id: Optional[int] = None
    condicao_pagamento_id: Optional[int] = None
    plataforma_id: int  # Campo obrigatório - Método de venda (fornecedor/plataforma)
    data_entrega: Optional[date] = None
    valor_frete: float = 0
    valor_desconto: float = 0
    custo_produto: float = 0
    forma_pagamento: str = "dinheiro"
    observacoes: Optional[str] = None
    comissao_total: float = 0

class PedidoVendaCreate(PedidoVendaBase):
    itens: List[ItemPedidoVendaCreate]

class PedidoVendaUpdate(BaseModel):
    cliente_id: Optional[int] = None
    vendedor_id: Optional[int] = None
    condicao_pagamento_id: Optional[int] = None
    plataforma_id: Optional[int] = None
    data_entrega: Optional[date] = None
    status: Optional[str] = None
    valor_frete: Optional[float] = None
    valor_desconto: Optional[float] = None
    custo_produto: Optional[float] = None
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None
    comissao_total: Optional[float] = None
    itens: Optional[List[ItemPedidoVendaCreate]] = None  # Lista de itens para atualização

class PedidoVenda(PedidoVendaBase):
    id: int
    codigo: str
    data_pedido: datetime
    status: str
    valor_produtos: float
    valor_total: float
    custo_produto: float
    usuario_id: int
    cliente_nome: Optional[str] = None
    vendedor_nome: Optional[str] = None
    condicao_pagamento_nome: Optional[str] = None
    plataforma_nome: Optional[str] = None
    total_pedidos_cliente: Optional[int] = None

class PedidoVendaDetalhado(PedidoVenda):
    itens: List[ItemPedidoVenda]

# Rotas
@router.get("/", response_model=List[PedidoVenda])
async def listar_pedidos_venda(
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todos os pedidos de venda cadastrados no sistema.
    Pode filtrar por status, cliente e vendedor.
    """
    query = (
        "SELECT pv.*, p.nome AS cliente_nome, v.nome AS vendedor_nome, cp.nome AS condicao_pagamento_nome, plat.nome AS plataforma_nome, "
        "(SELECT COUNT(*) FROM pedidos_venda pv2 WHERE pv2.cliente_id = pv.cliente_id) as total_pedidos_cliente "
        "FROM pedidos_venda pv "
        "LEFT JOIN parceiros p ON pv.cliente_id = p.id "
        "LEFT JOIN vendedores v ON pv.vendedor_id = v.id "
        "LEFT JOIN condicoes_pagamento cp ON pv.condicao_pagamento_id = cp.id "
        "LEFT JOIN plataformas_venda plat ON pv.plataforma_id = plat.id "
        "WHERE 1=1"
    )
    params = []
    
    if status is not None:
        query += " AND status = %s"
        params.append(status)
    
    if cliente_id is not None:
        query += " AND cliente_id = %s"
        params.append(cliente_id)
    
    if vendedor_id is not None:
        query += " AND vendedor_id = %s"
        params.append(vendedor_id)
    
    query += " ORDER BY data_pedido DESC"
    
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        pedidos = cursor.fetchall()
    
    return pedidos

@router.get("/{pedido_id}", response_model=PedidoVendaDetalhado)
async def obter_pedido_venda(
    pedido_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um pedido de venda específico, incluindo seus itens.
    """
    with get_db_cursor() as cursor:
        # Obtém os dados do pedido
        cursor.execute(
            "SELECT * FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de venda não encontrado"
            )
        
        # Obtém os itens do pedido
        cursor.execute(
            "SELECT i.*, p.nome AS produto_nome FROM itens_pedido_venda i JOIN produtos p ON i.produto_id = p.id WHERE i.pedido_id = %s",
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        # Monta o objeto de resposta
        pedido_detalhado = dict(pedido)
        pedido_detalhado["itens"] = itens
    
    return pedido_detalhado

@router.post("/", response_model=PedidoVendaDetalhado, status_code=status.HTTP_201_CREATED)
async def criar_pedido_venda(
    pedido: PedidoVendaCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo pedido de venda no sistema, incluindo seus itens.
    """
    # Verifica se o cliente existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, tipo FROM parceiros WHERE id = %s",
            (pedido.cliente_id,)
        )
        cliente = cursor.fetchone()
        
        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cliente não encontrado"
            )
            
        if cliente["tipo"] not in ["cliente", "ambos"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O parceiro selecionado não é um cliente"
            )
        
        # Verifica se o vendedor existe (se fornecido)
        if pedido.vendedor_id:
            cursor.execute(
                "SELECT id FROM vendedores WHERE id = %s",
                (pedido.vendedor_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vendedor não encontrado"
                )
        
        # Verifica se existem itens no pedido
        if not pedido.itens or len(pedido.itens) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O pedido deve conter pelo menos um item"
            )
        
        # Verifica se os produtos existem e têm estoque suficiente
        produto_ids = [item.produto_id for item in pedido.itens]
        placeholders = ", ".join(["%s"] * len(produto_ids))
        cursor.execute(
            f"SELECT id, nome, preco_venda, estoque_atual FROM produtos WHERE id IN ({placeholders})",
            produto_ids
        )
        produtos = {produto["id"]: produto for produto in cursor.fetchall()}
        
        for item in pedido.itens:
            if item.produto_id not in produtos:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Produto com ID {item.produto_id} não encontrado"
                )
            
            if item.quantidade <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A quantidade do produto {produtos[item.produto_id]['nome']} deve ser maior que zero"
                )
            
            if produtos[item.produto_id]["estoque_atual"] < item.quantidade:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Estoque insuficiente para o produto {produtos[item.produto_id]['nome']}. Disponível: {produtos[item.produto_id]['estoque_atual']}"
                )
        
        # Verifica se a forma de pagamento é válida
        formas_pagamento = ["dinheiro", "cartao_credito", "cartao_debito", "boleto", "pix", "transferencia"]
        if pedido.forma_pagamento not in formas_pagamento:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Forma de pagamento inválida. Deve ser uma das seguintes: {', '.join(formas_pagamento)}"
            )
    
    # Cria o pedido e seus itens
    with get_db_cursor(commit=True) as cursor:
        # Gera o código do pedido (formato: PV + ano + sequencial)
        cursor.execute("SELECT YEAR(NOW()) as ano")
        ano = cursor.fetchone()["ano"]
        
        cursor.execute(
            "SELECT COUNT(*) + 1 as seq FROM pedidos_venda WHERE YEAR(data_pedido) = %s",
            (ano,)
        )
        seq = cursor.fetchone()["seq"]
        
        codigo = f"PV{ano}{seq:04d}"
        
        # Calcula o valor dos produtos
        valor_produtos = sum((item.preco_unitario - item.desconto) * item.quantidade for item in pedido.itens)
        
        # Calcula o valor total do pedido
        valor_total = valor_produtos + pedido.valor_frete - pedido.valor_desconto
        
        # Tratar vendedor_id=0 como None para evitar erro de foreign key
        if pedido.vendedor_id == 0:
            pedido.vendedor_id = None
            
        # Insere o pedido
        cursor.execute(
            """
            INSERT INTO pedidos_venda (
                codigo, cliente_id, vendedor_id, condicao_pagamento_id, plataforma_id, data_entrega, status,
                valor_produtos, valor_frete, valor_desconto, valor_total,
                custo_produto, forma_pagamento, observacoes, comissao_total, usuario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'pendente', %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                codigo, cliente["id"], pedido.vendedor_id, pedido.condicao_pagamento_id, pedido.plataforma_id, pedido.data_entrega,
                valor_produtos, pedido.valor_frete, pedido.valor_desconto, valor_total,
                pedido.custo_produto, pedido.forma_pagamento, pedido.observacoes, 
                pedido.comissao_total, current_user.id
            )
        )
        
        # Obtém o ID do pedido criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        pedido_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Insere os itens do pedido
        for item in pedido.itens:
            subtotal = (item.preco_unitario - item.desconto) * item.quantidade
            
            # Busca o custo atual do produto para armazenar no histórico
            cursor.execute(
                "SELECT preco_custo FROM produtos WHERE id = %s",
                (item.produto_id,)
            )
            produto_custo = cursor.fetchone()
            custo_item = float(produto_custo["preco_custo"]) if produto_custo else 0
            
            cursor.execute(
                """
                INSERT INTO itens_pedido_venda (
                    pedido_id, produto_id, quantidade, preco_unitario,
                    desconto, subtotal, comissao_item, custo_item
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    pedido_id, item.produto_id, item.quantidade,
                    item.preco_unitario, item.desconto, subtotal, item.comissao_item, custo_item
                )
            )
            
            # Atualiza o estoque do produto
            cursor.execute(
                "UPDATE produtos SET estoque_atual = estoque_atual - %s WHERE id = %s",
                (item.quantidade, item.produto_id)
            )
            
            # Registra a movimentação de estoque
            cursor.execute(
                """
                INSERT INTO movimentacao_estoque (
                    produto_id, tipo, quantidade, motivo,
                    documento_referencia, usuario_id
                )
                VALUES (%s, 'saida', %s, 'Pedido de venda', %s, %s)
                """,
                (
                    item.produto_id, item.quantidade, codigo, current_user.id
                )
            )
        
        # Obtém os dados do pedido criado
        cursor.execute(
            "SELECT * FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        novo_pedido = cursor.fetchone()
        
        # Obtém os itens do pedido criado
        cursor.execute(
            "SELECT * FROM itens_pedido_venda WHERE pedido_id = %s",
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        # Cria automaticamente conta(s) a receber para o cliente
        # Busca a condição de pagamento se fornecida
        numero_parcelas = 1
        prazo_dias = 30
        
        if pedido.condicao_pagamento_id:
            cursor.execute(
                "SELECT numero_parcelas, prazo_dias FROM condicoes_pagamento WHERE id = %s",
                (pedido.condicao_pagamento_id,)
            )
            condicao = cursor.fetchone()
            if condicao:
                numero_parcelas = condicao["numero_parcelas"]
                prazo_dias = condicao["prazo_dias"]
        
        # Calcula dias por parcela
        dias_por_parcela = prazo_dias // numero_parcelas if numero_parcelas > 0 else prazo_dias
        
        # Calcula a data da última parcela (será usada para contas a pagar)
        data_ultima_parcela = date.today() + timedelta(days=dias_por_parcela * numero_parcelas)
        
        # Cria uma conta a receber para cada parcela
        for parcela_num in range(1, numero_parcelas + 1):
            # Gera o código da conta (formato: CR + ano + sequencial)
            cursor.execute("SELECT YEAR(NOW()) as ano")
            ano_cr = cursor.fetchone()["ano"]
            
            cursor.execute(
                "SELECT COUNT(*) + 1 as seq FROM contas_receber WHERE YEAR(data_emissao) = %s",
                (ano_cr,)
            )
            seq_cr = cursor.fetchone()["seq"]
            
            codigo_cr = f"CR{ano_cr}{seq_cr:04d}"
            
            # Calcula data de vencimento para esta parcela
            data_vencimento_cr = date.today() + timedelta(days=dias_por_parcela * parcela_num)
            
            # Calcula o valor da parcela (divide o total pelo número de parcelas)
            valor_parcela = valor_total / numero_parcelas
            
            # Monta a descrição com o número da parcela
            descricao = f"Venda - Pedido {codigo} - Parcela {parcela_num}/{numero_parcelas}"
            
            cursor.execute(
                """
                INSERT INTO contas_receber (
                    codigo, cliente_id, descricao, valor, data_vencimento,
                    pedido_venda_id, documento_referencia, status, usuario_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pendente', %s)
                """,
                (
                    codigo_cr, cliente["id"], descricao,
                    valor_parcela, data_vencimento_cr, pedido_id, codigo,
                    current_user.id
                )
            )
        
        # Se houver vendedor, cria automaticamente uma conta a pagar para o vendedor
        if pedido.vendedor_id:
            # Gera o código da conta (formato: CP + ano + sequencial)
            cursor.execute("SELECT YEAR(NOW()) as ano")
            ano_cp = cursor.fetchone()["ano"]
            
            cursor.execute(
                "SELECT COUNT(*) + 1 as seq FROM contas_pagar WHERE YEAR(data_emissao) = %s",
                (ano_cp,)
            )
            seq_cp = cursor.fetchone()["seq"]
            
            codigo_cp = f"CP{ano_cp}{seq_cp:04d}"
            
            # Usa a data da última parcela como data de vencimento do contas a pagar
            data_vencimento_cp = data_ultima_parcela
            
            cursor.execute(
                """
                INSERT INTO contas_pagar (
                    codigo, vendedor_id, descricao, valor, data_vencimento,
                    pedido_venda_id, documento_referencia, status, forma_pagamento, usuario_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pendente', %s, %s)
                """,
                (
                    codigo_cp, pedido.vendedor_id, f"Comissão - Pedido {codigo}",
                    pedido.comissao_total, data_vencimento_cp, pedido_id, codigo,
                    "transferencia", current_user.id
                )
            )
        
        # Monta o objeto de resposta
        pedido_detalhado = dict(novo_pedido)
        pedido_detalhado["itens"] = itens
    
    return pedido_detalhado

@router.put("/{pedido_id}", response_model=PedidoVenda)
async def atualizar_pedido_venda(
    pedido_id: int,
    pedido: PedidoVendaUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um pedido de venda existente.
    Permite alterar os itens do pedido com movimentação de estoque e envio de webhook.
    """
    import urllib.request
    import json as json_lib
    import threading
    # Verifica se o pedido existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT * FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        pedido_atual = cursor.fetchone()
        
        if not pedido_atual:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de venda não encontrado"
            )
        
        # Verifica se o pedido pode ser alterado
        if pedido_atual["status"] in ["faturado", "entregue", "cancelado"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível alterar um pedido com status '{pedido_atual['status']}'"
            )
        
        # Verifica se o cliente existe (se fornecido)
        if pedido.cliente_id:
            # Primeiro, verifica se o ID fornecido é diretamente um ID de parceiro
            cursor.execute(
                "SELECT id, tipo FROM parceiros WHERE id = %s",
                (pedido.cliente_id,)
            )
            cliente = cursor.fetchone()
            
            # Se não encontrou como parceiro direto, tenta buscar através da tabela de clientes
            if not cliente:
                cursor.execute(
                    "SELECT c.id, c.cpf_cnpj, c.nome FROM clientes c WHERE c.id = %s",
                    (pedido.cliente_id,)
                )
                cliente_info = cursor.fetchone()
                
                if cliente_info and cliente_info['cpf_cnpj']:
                    # Busca o parceiro correspondente ao cliente
                    cursor.execute(
                        "SELECT id, tipo FROM parceiros WHERE documento = %s",
                        (cliente_info['cpf_cnpj'],)
                    )
                    cliente = cursor.fetchone()
                    
                    # Se não encontrou parceiro, cria um novo parceiro para este cliente
                    if not cliente:
                        cursor.execute(
                            """INSERT INTO parceiros (tipo, nome, documento) 
                            VALUES ('cliente', %s, %s) RETURNING id, tipo""",
                            (cliente_info['nome'], cliente_info['cpf_cnpj'])
                        )
                        cliente = cursor.fetchone()
            
            if not cliente:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cliente não encontrado"
                )
            
            if cliente["tipo"] not in ["cliente", "ambos"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="O parceiro selecionado não é um cliente"
                )
        
        # Verifica se o vendedor existe (se fornecido)
        if pedido.vendedor_id:
            cursor.execute(
                "SELECT id FROM vendedores WHERE id = %s",
                (pedido.vendedor_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vendedor não encontrado"
                )
        
        # Verifica se o status é válido (se fornecido) - case insensitive
        valid_statuses = ["pendente", "aprovado", "faturado", "entregue", "cancelado", "finalizada", "cancelada", "devolvido"]
        
        if pedido.status:
            # Normaliza para lowercase para comparação
            status_lower = pedido.status.lower()
            
            if status_lower not in [s.lower() for s in valid_statuses]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Status inválido. Deve ser um dos seguintes: pendente, aprovado, faturado, entregue, cancelado, finalizada, cancelada"
                )
            
            # Normaliza o status para lowercase antes de salvar
            pedido.status = status_lower
        
        # Verifica se a forma de pagamento é válida (se fornecida)
        if pedido.forma_pagamento:
            formas_pagamento = ["dinheiro", "cartao_credito", "cartao_debito", "boleto", "pix", "transferencia"]
            if pedido.forma_pagamento not in formas_pagamento:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Forma de pagamento inválida. Deve ser uma das seguintes: {', '.join(formas_pagamento)}"
                )
    
    # Prepara os dados para atualização
    update_data = {}
    if pedido.cliente_id is not None:
        # Usamos o ID do parceiro, não o ID do cliente
        update_data["cliente_id"] = cliente["id"]
        # Registra o mapeamento para debug
        print(f"Mapeando cliente_id {pedido.cliente_id} para parceiro_id {cliente['id']}")
    if pedido.vendedor_id is not None:
        # Set vendedor_id to NULL if it's 0
        if pedido.vendedor_id == 0:
            update_data["vendedor_id"] = None
        else:
            update_data["vendedor_id"] = pedido.vendedor_id
    if pedido.condicao_pagamento_id is not None:
        update_data["condicao_pagamento_id"] = pedido.condicao_pagamento_id
    if pedido.plataforma_id is not None:
        update_data["plataforma_id"] = pedido.plataforma_id
    if pedido.data_entrega is not None:
        update_data["data_entrega"] = pedido.data_entrega
    if pedido.status is not None:
        update_data["status"] = pedido.status
    if pedido.valor_frete is not None:
        update_data["valor_frete"] = pedido.valor_frete
    if pedido.valor_desconto is not None:
        update_data["valor_desconto"] = pedido.valor_desconto
    if pedido.custo_produto is not None:
        update_data["custo_produto"] = pedido.custo_produto
    if pedido.forma_pagamento is not None:
        update_data["forma_pagamento"] = pedido.forma_pagamento
    if pedido.observacoes is not None:
        update_data["observacoes"] = pedido.observacoes
    if pedido.comissao_total is not None:
        update_data["comissao_total"] = pedido.comissao_total
    
    # Verifica se há itens ou outros dados para atualizar
    if not update_data and not pedido.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Variáveis para controle de alterações de itens (para webhook)
    itens_removidos = []
    itens_adicionados = []
    itens_alterados = []
    houve_alteracao_itens = False
    
    # Atualiza o pedido
    with get_db_cursor(commit=True) as cursor:
        # Se há itens para atualizar, processa a alteração
        if pedido.itens is not None:
            houve_alteracao_itens = True
            
            # Obtém os itens atuais do pedido
            cursor.execute(
                """SELECT ipv.*, p.nome AS produto_nome 
                   FROM itens_pedido_venda ipv 
                   JOIN produtos p ON ipv.produto_id = p.id 
                   WHERE ipv.pedido_id = %s""",
                (pedido_id,)
            )
            itens_atuais = cursor.fetchall()
            
            # Cria dicionário dos itens atuais por produto_id
            itens_atuais_dict = {item["produto_id"]: item for item in itens_atuais}
            
            # Cria dicionário dos novos itens por produto_id
            novos_itens_dict = {item.produto_id: item for item in pedido.itens}
            
            # 1. Identifica itens removidos (estavam antes, não estão mais)
            for produto_id, item_atual in itens_atuais_dict.items():
                if produto_id not in novos_itens_dict:
                    # Item foi removido - devolver ao estoque
                    quantidade = item_atual["quantidade"]
                    
                    # Atualiza o estoque do produto (entrada)
                    cursor.execute(
                        "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
                        (quantidade, produto_id)
                    )
                    
                    # Registra a movimentação de estoque
                    cursor.execute(
                        """INSERT INTO movimentacao_estoque (
                            produto_id, tipo, quantidade, motivo,
                            documento_referencia, usuario_id
                        )
                        VALUES (%s, 'entrada', %s, %s, %s, %s)""",
                        (produto_id, quantidade, f"Item removido do pedido {pedido_atual['codigo']}", 
                         pedido_atual["codigo"], current_user.id)
                    )
                    
                    # Remove o item do pedido
                    cursor.execute(
                        "DELETE FROM itens_pedido_venda WHERE pedido_id = %s AND produto_id = %s",
                        (pedido_id, produto_id)
                    )
                    
                    itens_removidos.append({
                        "produto_id": produto_id,
                        "produto_nome": item_atual["produto_nome"],
                        "quantidade": quantidade
                    })
                    print(f"[EDIÇÃO PEDIDO] Item removido: {item_atual['produto_nome']} x{quantidade}")
            
            # 2. Identifica itens adicionados (não estavam antes, estão agora)
            for produto_id, novo_item in novos_itens_dict.items():
                if produto_id not in itens_atuais_dict:
                    # Item foi adicionado - retirar do estoque
                    quantidade = novo_item.quantidade
                    
                    # Verifica se há estoque suficiente
                    cursor.execute(
                        "SELECT nome, estoque_atual FROM produtos WHERE id = %s",
                        (produto_id,)
                    )
                    produto = cursor.fetchone()
                    
                    if not produto:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Produto com ID {produto_id} não encontrado"
                        )
                    
                    if produto["estoque_atual"] < quantidade:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Estoque insuficiente para o produto {produto['nome']}. Disponível: {produto['estoque_atual']}"
                        )
                    
                    # Atualiza o estoque do produto (saída)
                    cursor.execute(
                        "UPDATE produtos SET estoque_atual = estoque_atual - %s WHERE id = %s",
                        (quantidade, produto_id)
                    )
                    
                    # Registra a movimentação de estoque
                    cursor.execute(
                        """INSERT INTO movimentacao_estoque (
                            produto_id, tipo, quantidade, motivo,
                            documento_referencia, usuario_id
                        )
                        VALUES (%s, 'saida', %s, %s, %s, %s)""",
                        (produto_id, quantidade, f"Item adicionado ao pedido {pedido_atual['codigo']}", 
                         pedido_atual["codigo"], current_user.id)
                    )
                    
                    # Insere o novo item
                    subtotal = (novo_item.preco_unitario - novo_item.desconto) * quantidade
                    
                    # Busca o custo atual do produto para armazenar no histórico
                    cursor.execute(
                        "SELECT preco_custo FROM produtos WHERE id = %s",
                        (produto_id,)
                    )
                    produto_custo = cursor.fetchone()
                    custo_item = float(produto_custo["preco_custo"]) if produto_custo else 0
                    
                    cursor.execute(
                        """INSERT INTO itens_pedido_venda (
                            pedido_id, produto_id, quantidade, preco_unitario,
                            desconto, subtotal, comissao_item, custo_item
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                        (pedido_id, produto_id, quantidade, novo_item.preco_unitario,
                         novo_item.desconto, subtotal, novo_item.comissao_item, custo_item)
                    )
                    
                    itens_adicionados.append({
                        "produto_id": produto_id,
                        "produto_nome": produto["nome"],
                        "quantidade": quantidade
                    })
                    print(f"[EDIÇÃO PEDIDO] Item adicionado: {produto['nome']} x{quantidade}")
            
            # 3. Identifica itens alterados (quantidade mudou)
            for produto_id, novo_item in novos_itens_dict.items():
                if produto_id in itens_atuais_dict:
                    item_atual = itens_atuais_dict[produto_id]
                    quantidade_atual = item_atual["quantidade"]
                    quantidade_nova = novo_item.quantidade
                    
                    if quantidade_atual != quantidade_nova:
                        diferenca = quantidade_nova - quantidade_atual
                        
                        if diferenca > 0:
                            # Aumentou quantidade - verificar estoque e retirar
                            cursor.execute(
                                "SELECT nome, estoque_atual FROM produtos WHERE id = %s",
                                (produto_id,)
                            )
                            produto = cursor.fetchone()
                            
                            if produto["estoque_atual"] < diferenca:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Estoque insuficiente para o produto {produto['nome']}. Disponível: {produto['estoque_atual']}"
                                )
                            
                            # Atualiza o estoque do produto (saída)
                            cursor.execute(
                                "UPDATE produtos SET estoque_atual = estoque_atual - %s WHERE id = %s",
                                (diferenca, produto_id)
                            )
                            
                            # Registra a movimentação de estoque
                            cursor.execute(
                                """INSERT INTO movimentacao_estoque (
                                    produto_id, tipo, quantidade, motivo,
                                    documento_referencia, usuario_id
                                )
                                VALUES (%s, 'saida', %s, %s, %s, %s)""",
                                (produto_id, diferenca, f"Quantidade aumentada no pedido {pedido_atual['codigo']}", 
                                 pedido_atual["codigo"], current_user.id)
                            )
                        else:
                            # Diminuiu quantidade - devolver ao estoque
                            diferenca_abs = abs(diferenca)
                            
                            cursor.execute(
                                "SELECT nome FROM produtos WHERE id = %s",
                                (produto_id,)
                            )
                            produto = cursor.fetchone()
                            
                            # Atualiza o estoque do produto (entrada)
                            cursor.execute(
                                "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
                                (diferenca_abs, produto_id)
                            )
                            
                            # Registra a movimentação de estoque
                            cursor.execute(
                                """INSERT INTO movimentacao_estoque (
                                    produto_id, tipo, quantidade, motivo,
                                    documento_referencia, usuario_id
                                )
                                VALUES (%s, 'entrada', %s, %s, %s, %s)""",
                                (produto_id, diferenca_abs, f"Quantidade reduzida no pedido {pedido_atual['codigo']}", 
                                 pedido_atual["codigo"], current_user.id)
                            )
                        
                        # Atualiza o item do pedido
                        subtotal = (novo_item.preco_unitario - novo_item.desconto) * quantidade_nova
                        cursor.execute(
                            """UPDATE itens_pedido_venda 
                               SET quantidade = %s, preco_unitario = %s, desconto = %s, 
                                   subtotal = %s, comissao_item = %s
                               WHERE pedido_id = %s AND produto_id = %s""",
                            (quantidade_nova, novo_item.preco_unitario, novo_item.desconto,
                             subtotal, novo_item.comissao_item, pedido_id, produto_id)
                        )
                        
                        itens_alterados.append({
                            "produto_id": produto_id,
                            "produto_nome": item_atual["produto_nome"],
                            "quantidade_anterior": quantidade_atual,
                            "quantidade_nova": quantidade_nova
                        })
                        print(f"[EDIÇÃO PEDIDO] Item alterado: {item_atual['produto_nome']} de {quantidade_atual} para {quantidade_nova}")
                    else:
                        # Quantidade igual, mas pode ter alterado preço ou comissão
                        subtotal = (novo_item.preco_unitario - novo_item.desconto) * quantidade_nova
                        cursor.execute(
                            """UPDATE itens_pedido_venda 
                               SET preco_unitario = %s, desconto = %s, 
                                   subtotal = %s, comissao_item = %s
                               WHERE pedido_id = %s AND produto_id = %s""",
                            (novo_item.preco_unitario, novo_item.desconto,
                             subtotal, novo_item.comissao_item, pedido_id, produto_id)
                        )
            
            # Recalcula o valor dos produtos e valor total
            cursor.execute(
                "SELECT SUM(subtotal) as total FROM itens_pedido_venda WHERE pedido_id = %s",
                (pedido_id,)
            )
            resultado = cursor.fetchone()
            valor_produtos = float(resultado["total"]) if resultado["total"] else 0
            
            valor_frete = float(update_data.get("valor_frete", pedido_atual["valor_frete"]))
            valor_desconto = float(update_data.get("valor_desconto", pedido_atual["valor_desconto"]))
            valor_total = valor_produtos + valor_frete - valor_desconto
            
            update_data["valor_produtos"] = valor_produtos
            update_data["valor_total"] = valor_total
        
        # Se o valor do frete ou desconto for alterado (sem itens), recalcula o valor total
        elif "valor_frete" in update_data or "valor_desconto" in update_data:
            valor_frete = update_data.get("valor_frete", pedido_atual["valor_frete"])
            valor_desconto = update_data.get("valor_desconto", pedido_atual["valor_desconto"])
            valor_produtos = float(pedido_atual["valor_produtos"])
            valor_frete = float(valor_frete)
            valor_desconto = float(valor_desconto)
            valor_total = valor_produtos + valor_frete - valor_desconto
            update_data["valor_total"] = valor_total
        
        # Atualiza os dados do pedido
        if update_data:
            set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
            values = list(update_data.values())
            values.append(pedido_id)
            
            cursor.execute(
                f"UPDATE pedidos_venda SET {set_clause} WHERE id = %s",
                values
            )
        
        # Se o status foi alterado para "cancelado", devolve os produtos ao estoque
        if pedido.status == "cancelado" and pedido_atual["status"] != "cancelado":
            # Obtém os itens do pedido
            cursor.execute(
                "SELECT produto_id, quantidade FROM itens_pedido_venda WHERE pedido_id = %s",
                (pedido_id,)
            )
            itens = cursor.fetchall()
            
            # Devolve os produtos ao estoque
            for item in itens:
                # Atualiza o estoque do produto
                cursor.execute(
                    "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
                    (item["quantidade"], item["produto_id"])
                )
                
                # Registra a movimentação de estoque
                cursor.execute(
                    """
                    INSERT INTO movimentacao_estoque (
                        produto_id, tipo, quantidade, motivo,
                        documento_referencia, usuario_id
                    )
                    VALUES (%s, 'entrada', %s, 'Cancelamento de pedido de venda', %s, %s)
                    """,
                    (
                        item["produto_id"], item["quantidade"], pedido_atual["codigo"], current_user.id
                    )
                )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT * FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        pedido_atualizado = cursor.fetchone()
        
        # Busca dados do vendedor para o webhook
        vendedor_telefone = None
        vendedor_nome = None
        if pedido_atualizado.get("vendedor_id"):
            cursor.execute(
                "SELECT nome, telefone FROM vendedores WHERE id = %s",
                (pedido_atualizado["vendedor_id"],)
            )
            vendedor = cursor.fetchone()
            if vendedor:
                vendedor_telefone = vendedor["telefone"]
                vendedor_nome = vendedor["nome"]
        
        # Envia webhook se houve alteração de itens
        if houve_alteracao_itens and (itens_removidos or itens_adicionados or itens_alterados):
            try:
                # Busca configurações de webhook
                cursor.execute(
                    "SELECT valor FROM configuracoes WHERE chave = 'webhook_url'"
                )
                webhook_url_row = cursor.fetchone()
                
                cursor.execute(
                    "SELECT valor FROM configuracoes WHERE chave = 'webhook_ativo'"
                )
                webhook_ativo_row = cursor.fetchone()
                
                webhook_url = webhook_url_row["valor"] if webhook_url_row else None
                webhook_ativo_valor = webhook_ativo_row["valor"] if webhook_ativo_row else None
                webhook_ativo = webhook_ativo_valor == "true" or webhook_ativo_valor == "1" or webhook_ativo_valor == True
                
                print(f"[EDIÇÃO PEDIDO] Webhook URL: {webhook_url}, Ativo: {webhook_ativo}")
                
                if webhook_url and webhook_ativo and vendedor_telefone:
                    # Monta a mensagem
                    mensagem = f"📝 *PEDIDO ALTERADO*\n\n"
                    mensagem += f"📋 *Pedido:* {pedido_atual['codigo']}\n"
                    mensagem += f"👤 *Vendedor:* {vendedor_nome or 'N/A'}\n\n"
                    
                    if itens_removidos:
                        mensagem += f"❌ *Itens Removidos:*\n"
                        for item in itens_removidos:
                            mensagem += f"   • {item['produto_nome']} (Qtd: {item['quantidade']})\n"
                        mensagem += "\n"
                    
                    if itens_adicionados:
                        mensagem += f"✅ *Itens Adicionados:*\n"
                        for item in itens_adicionados:
                            mensagem += f"   • {item['produto_nome']} (Qtd: {item['quantidade']})\n"
                        mensagem += "\n"
                    
                    if itens_alterados:
                        mensagem += f"🔄 *Itens Alterados:*\n"
                        for item in itens_alterados:
                            mensagem += f"   • {item['produto_nome']}: {item['quantidade_anterior']} → {item['quantidade_nova']}\n"
                        mensagem += "\n"
                    
                    mensagem += f"💰 *Novo Valor Total:* R$ {pedido_atualizado['valor_total']:.2f}"
                    
                    payload = {
                        "telefone": vendedor_telefone,
                        "mensagem": mensagem,
                        "tipo": "alteracao_pedido",
                        "pedido_codigo": pedido_atual["codigo"],
                        "itens_removidos": itens_removidos,
                        "itens_adicionados": itens_adicionados,
                        "itens_alterados": itens_alterados,
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    print(f"[EDIÇÃO PEDIDO] Enviando webhook para: {vendedor_telefone}")
                    
                    # Função para enviar webhook em thread separada (não bloqueia)
                    def enviar_webhook_async(url, data):
                        try:
                            req = urllib.request.Request(
                                url,
                                data=data,
                                headers={'Content-Type': 'application/json'},
                                method='POST'
                            )
                            response = urllib.request.urlopen(req, timeout=30)
                            print(f"[EDIÇÃO PEDIDO] Webhook enviado com sucesso! Status: {response.status}")
                        except Exception as e:
                            print(f"[EDIÇÃO PEDIDO] Erro ao enviar webhook (async): {e}")
                    
                    # Envia em thread separada para não bloquear a resposta
                    webhook_data = json_lib.dumps(payload).encode('utf-8')
                    webhook_thread = threading.Thread(
                        target=enviar_webhook_async,
                        args=(webhook_url, webhook_data)
                    )
                    webhook_thread.daemon = True
                    webhook_thread.start()
                    print(f"[EDIÇÃO PEDIDO] Webhook iniciado em thread separada")
                else:
                    print(f"[EDIÇÃO PEDIDO] Webhook não enviado - URL, ativo ou telefone inválido")
                    
            except Exception as e:
                print(f"[EDIÇÃO PEDIDO] Erro ao processar webhook: {e}")
    
    return pedido_atualizado

# Modelo para devolução
class DevolucaoVendaRequest(BaseModel):
    justificativa: str

class DevolucaoVendaResponse(BaseModel):
    sucesso: bool
    mensagem: str
    titulo_devolucao_id: Optional[int] = None
    titulo_devolucao_codigo: Optional[str] = None
    titulo_devolucao_valor: Optional[float] = None

@router.post("/{pedido_id}/devolucao", response_model=DevolucaoVendaResponse)
async def devolver_pedido_venda(
    pedido_id: int,
    devolucao: DevolucaoVendaRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Processa a devolução de um pedido de venda finalizado.
    
    Ações realizadas:
    1. Retorna os produtos ao estoque (com recálculo de preço médio)
    2. Salva a justificativa na descrição do pedido
    3. Cancela os títulos de contas a receber
    4. Se houver título de contas a pagar (comissão):
       - Cancela o título
       - Cria um título de contas a receber (devolução da comissão)
    5. Altera o status do pedido para 'devolvido'
    """
    import urllib.request
    import json as json_lib
    import threading
    
    # Verifica se o pedido existe e está finalizado
    with get_db_cursor() as cursor:
        cursor.execute(
            """SELECT pv.*, v.nome AS vendedor_nome, v.telefone AS vendedor_telefone
               FROM pedidos_venda pv
               LEFT JOIN vendedores v ON pv.vendedor_id = v.id
               WHERE pv.id = %s""",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de venda não encontrado"
            )
        
        # Verifica se o pedido está finalizado
        if pedido["status"].lower() != "finalizada":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Apenas pedidos finalizados podem ser devolvidos. Status atual: {pedido['status']}"
            )
        
        # Obtém os itens do pedido
        cursor.execute(
            """SELECT ipv.*, p.nome AS produto_nome, p.preco_custo AS preco_custo_atual
               FROM itens_pedido_venda ipv
               JOIN produtos p ON ipv.produto_id = p.id
               WHERE ipv.pedido_id = %s""",
            (pedido_id,)
        )
        itens = cursor.fetchall()
        
        if not itens:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pedido não possui itens para devolução"
            )
    
    titulo_devolucao_id = None
    titulo_devolucao_codigo = None
    titulo_devolucao_valor = None
    
    # Processa a devolução
    with get_db_cursor(commit=True) as cursor:
        # 1. Retorna os produtos ao estoque com recálculo de preço médio
        for item in itens:
            # Busca dados atuais do produto
            cursor.execute(
                "SELECT estoque_atual, preco_custo FROM produtos WHERE id = %s",
                (item["produto_id"],)
            )
            produto_atual = cursor.fetchone()
            
            estoque_atual = produto_atual["estoque_atual"] or 0
            preco_custo_atual = produto_atual["preco_custo"] or 0
            quantidade_devolvida = item["quantidade"]
            preco_custo_item = item["preco_custo_atual"]  # Usa o preço de custo atual do produto
            
            # Recalcula o preço médio ponderado
            # Fórmula: (estoque_atual * preco_custo_atual + qtd_devolvida * preco_item) / (estoque_atual + qtd_devolvida)
            novo_estoque = estoque_atual + quantidade_devolvida
            if novo_estoque > 0:
                novo_preco_medio = (
                    (estoque_atual * preco_custo_atual) + 
                    (quantidade_devolvida * preco_custo_item)
                ) / novo_estoque
            else:
                novo_preco_medio = preco_custo_atual
            
            # Atualiza o estoque e preço médio do produto
            cursor.execute(
                """UPDATE produtos 
                   SET estoque_atual = estoque_atual + %s,
                       preco_custo = %s
                   WHERE id = %s""",
                (quantidade_devolvida, novo_preco_medio, item["produto_id"])
            )
            
            # Registra a movimentação de estoque
            cursor.execute(
                """INSERT INTO movimentacao_estoque (
                    produto_id, tipo, quantidade, motivo,
                    documento_referencia, usuario_id
                )
                VALUES (%s, 'entrada', %s, %s, %s, %s)""",
                (
                    item["produto_id"], 
                    quantidade_devolvida, 
                    f"Devolução de venda - {devolucao.justificativa}", 
                    pedido["codigo"], 
                    current_user.id
                )
            )
        
        # 2. Atualiza o pedido com a justificativa e status
        observacoes_atuais = pedido["observacoes"] or ""
        nova_observacao = f"{observacoes_atuais}\n\n[DEVOLUÇÃO - {datetime.now().strftime('%d/%m/%Y %H:%M')}]\nJustificativa: {devolucao.justificativa}"
        
        cursor.execute(
            """UPDATE pedidos_venda 
               SET status = 'Devolvido', observacoes = %s
               WHERE id = %s""",
            (nova_observacao.strip(), pedido_id)
        )
        
        # 3. Cancela os títulos de contas a receber
        cursor.execute(
            """UPDATE contas_receber 
               SET status = 'cancelado'
               WHERE documento_referencia = %s""",
            (pedido["codigo"],)
        )
        
        # 4. Se houver vendedor, processa contas a pagar
        if pedido["vendedor_id"]:
            # Busca as contas a pagar relacionadas
            cursor.execute(
                """SELECT * FROM contas_pagar 
                   WHERE documento_referencia = %s AND vendedor_id = %s""",
                (pedido["codigo"], pedido["vendedor_id"])
            )
            contas_pagar = cursor.fetchall()
            
            valor_comissao_total = 0
            for conta in contas_pagar:
                valor_comissao_total += conta["valor"]
                
                # Cancela o título de contas a pagar
                cursor.execute(
                    """UPDATE contas_pagar 
                       SET status = 'cancelado'
                       WHERE id = %s""",
                    (conta["id"],)
                )
            
            # Se havia comissão, cria título de devolução em contas a receber
            if valor_comissao_total > 0:
                print(f"[DEVOLUÇÃO] Criando título de devolução de comissão. Valor: {valor_comissao_total}")
                
                # Gera o código da conta (formato: CR + ano + sequencial)
                cursor.execute("SELECT YEAR(NOW()) as ano")
                ano_cr = cursor.fetchone()["ano"]
                
                cursor.execute(
                    "SELECT COUNT(*) + 1 as seq FROM contas_receber WHERE YEAR(data_emissao) = %s",
                    (ano_cr,)
                )
                seq_cr = cursor.fetchone()["seq"]
                
                titulo_devolucao_codigo = f"CR{ano_cr}{seq_cr:04d}"
                titulo_devolucao_valor = valor_comissao_total
                
                # Data de vencimento: hoje + 30 dias
                data_vencimento = date.today() + timedelta(days=30)
                
                # Nome do vendedor para a descrição
                vendedor_nome = pedido['vendedor_nome'] or 'N/A'
                
                cursor.execute(
                    """INSERT INTO contas_receber (
                        codigo, cliente_id, descricao, valor, data_vencimento,
                        pedido_venda_id, documento_referencia, status, observacoes, usuario_id
                    )
                    VALUES (%s, NULL, %s, %s, %s, %s, %s, 'pendente', %s, %s)""",
                    (
                        titulo_devolucao_codigo,
                        f"Devolução de comissão - {vendedor_nome} - Pedido {pedido['codigo']}",
                        valor_comissao_total,
                        data_vencimento,
                        pedido_id,
                        f"DEV-{pedido['codigo']}",
                        f"Título gerado automaticamente pela devolução do pedido {pedido['codigo']}. Vendedor: {vendedor_nome}. Justificativa: {devolucao.justificativa}",
                        current_user.id
                    )
                )
                
                cursor.execute("SELECT LAST_INSERT_ID()")
                titulo_devolucao_id = cursor.fetchone()["LAST_INSERT_ID()"]
                print(f"[DEVOLUÇÃO] Título criado com ID: {titulo_devolucao_id}, Código: {titulo_devolucao_codigo}")
        
        # 5. Envia webhook para o vendedor (se houver)
        print(f"[DEVOLUÇÃO] Verificando webhook. Vendedor ID: {pedido['vendedor_id']}, Telefone: {pedido['vendedor_telefone']}")
        
        if pedido["vendedor_id"] and pedido["vendedor_telefone"]:
            try:
                # Busca configurações de webhook
                cursor.execute(
                    "SELECT valor FROM configuracoes WHERE chave = 'webhook_url'"
                )
                webhook_url_row = cursor.fetchone()
                
                cursor.execute(
                    "SELECT valor FROM configuracoes WHERE chave = 'webhook_ativo'"
                )
                webhook_ativo_row = cursor.fetchone()
                
                webhook_url = webhook_url_row["valor"] if webhook_url_row else None
                webhook_ativo_valor = webhook_ativo_row["valor"] if webhook_ativo_row else None
                webhook_ativo = webhook_ativo_valor == "true" or webhook_ativo_valor == "1" or webhook_ativo_valor == True
                
                print(f"[DEVOLUÇÃO] Webhook URL: {webhook_url}, Ativo: {webhook_ativo_valor} -> {webhook_ativo}")
                
                if webhook_url and webhook_ativo:
                    # Monta a mensagem
                    mensagem = f"🔄 *DEVOLUÇÃO DE VENDA*\n\n"
                    mensagem += f"📋 *Pedido:* {pedido['codigo']}\n"
                    mensagem += f"❌ *Status:* Devolvido\n\n"
                    
                    if titulo_devolucao_valor and titulo_devolucao_valor > 0:
                        mensagem += f"💰 *Título de Devolução Gerado*\n"
                        mensagem += f"   Código: {titulo_devolucao_codigo}\n"
                        mensagem += f"   Valor: R$ {titulo_devolucao_valor:.2f}\n\n"
                    
                    mensagem += f"📝 *Justificativa:* {devolucao.justificativa}\n\n"
                    mensagem += f"⚠️ Entre em contato com a administração comercial."
                    
                    payload = {
                        "telefone": pedido["vendedor_telefone"],
                        "mensagem": mensagem,
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    print(f"[DEVOLUÇÃO] Enviando webhook para: {pedido['vendedor_telefone']}")
                    
                    # Função para enviar webhook em thread separada (não bloqueia)
                    def enviar_webhook_async(url, data):
                        try:
                            req = urllib.request.Request(
                                url,
                                data=data,
                                headers={'Content-Type': 'application/json'},
                                method='POST'
                            )
                            response = urllib.request.urlopen(req, timeout=30)
                            print(f"[DEVOLUÇÃO] Webhook enviado com sucesso! Status: {response.status}")
                        except Exception as e:
                            print(f"[DEVOLUÇÃO] Erro ao enviar webhook (async): {e}")
                    
                    # Envia em thread separada para não bloquear a resposta
                    webhook_data = json_lib.dumps(payload).encode('utf-8')
                    webhook_thread = threading.Thread(
                        target=enviar_webhook_async,
                        args=(webhook_url, webhook_data)
                    )
                    webhook_thread.daemon = True
                    webhook_thread.start()
                    print(f"[DEVOLUÇÃO] Webhook iniciado em thread separada")
                else:
                    print(f"[DEVOLUÇÃO] Webhook não enviado - URL ou ativo inválido")
                        
            except Exception as e:
                print(f"[DEVOLUÇÃO] Erro ao processar webhook: {e}")
                # Não falha a operação se o webhook falhar
        else:
            print(f"[DEVOLUÇÃO] Webhook não enviado - Vendedor sem ID ou telefone")
    
    return DevolucaoVendaResponse(
        sucesso=True,
        mensagem=f"Devolução do pedido {pedido['codigo']} processada com sucesso",
        titulo_devolucao_id=titulo_devolucao_id,
        titulo_devolucao_codigo=titulo_devolucao_codigo,
        titulo_devolucao_valor=titulo_devolucao_valor
    )

@router.delete("/{pedido_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_pedido_venda(
    pedido_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um pedido de venda do sistema.
    Só permite excluir pedidos com status 'pendente'.
    """
    # Verifica se o pedido existe e pode ser excluído
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, status, codigo FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
        pedido = cursor.fetchone()
        
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido de venda não encontrado"
            )
        
        if pedido["status"] != "Pendente":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível excluir pedidos com status 'Pendente'"
            )
        
        # Obtém os itens do pedido
        cursor.execute(
            "SELECT produto_id, quantidade FROM itens_pedido_venda WHERE pedido_id = %s",
            (pedido_id,)
        )
        itens = cursor.fetchall()
    
    # Exclui o pedido e devolve os produtos ao estoque
    with get_db_cursor(commit=True) as cursor:
        # Devolve os produtos ao estoque
        for item in itens:
            # Atualiza o estoque do produto
            cursor.execute(
                "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
                (item["quantidade"], item["produto_id"])
            )
            
            # Registra a movimentação de estoque
            cursor.execute(
                """
                INSERT INTO movimentacao_estoque (
                    produto_id, tipo, quantidade, motivo,
                    documento_referencia, usuario_id
                )
                VALUES (%s, 'entrada', %s, 'Exclusão de pedido de venda', %s, %s)
                """,
                (
                    item["produto_id"], item["quantidade"], pedido["codigo"], current_user.id
                )
            )
        
        # Exclui os itens do pedido
        cursor.execute(
            "DELETE FROM itens_pedido_venda WHERE pedido_id = %s",
            (pedido_id,)
        )
        
        # Exclui o pedido
        cursor.execute(
            "DELETE FROM pedidos_venda WHERE id = %s",
            (pedido_id,)
        )
    
    return None
