from fastapi import HTTPException, status


def baixar_estoque(cursor, produto_id: int, quantidade):
    """
    Debita o estoque só se houver saldo no momento da gravação (atômico no banco).
    Sem saldo, levanta 400 e a transação do chamador é desfeita (get_db_cursor faz rollback).
    """
    cursor.execute(
        "UPDATE produtos SET estoque_atual = estoque_atual - %s WHERE id = %s AND estoque_atual >= %s",
        (quantidade, produto_id, quantidade),
    )
    if cursor.rowcount == 1:
        return
    cursor.execute("SELECT nome, estoque_atual FROM produtos WHERE id = %s", (produto_id,))
    produto = cursor.fetchone()
    if not produto:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto com ID {produto_id} não encontrado")
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Estoque insuficiente para o produto {produto['nome']}. Disponível: {produto['estoque_atual']}",
    )


def somar_estoque(cursor, produto_id: int, quantidade):
    cursor.execute(
        "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
        (quantidade, produto_id),
    )
