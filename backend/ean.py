"""EAN-13 dos produtos: obrigatório, único e com dígito verificador certo.

Quem não tem código de barras de fábrica recebe um interno: prefixo 200 (a faixa 200–299 da GS1 é de uso interno
da loja, nunca colide com código de fabricante) + número de 9 dígitos + dígito verificador. A sugestão de produto
novo é o próximo número livre dessa faixa; a pessoa pode trocar pelo código da embalagem.
"""
import re

from fastapi import HTTPException, status

PREFIXO_INTERNO = "200"


def digito_verificador(doze: str) -> str:
    soma = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(doze))
    return str((10 - soma % 10) % 10)


def valido(codigo: str) -> bool:
    return bool(re.fullmatch(r"\d{13}", codigo or "")) and digito_verificador(codigo[:12]) == codigo[12]


def interno(numero: int) -> str:
    doze = f"{PREFIXO_INTERNO}{int(numero):09d}"
    return doze + digito_verificador(doze)


def proximo_interno(cursor) -> str:
    """Próximo EAN interno livre (maior número já usado na faixa 200 + 1)."""
    cursor.execute("SELECT MAX(CAST(SUBSTRING(ean13, 4, 9) AS UNSIGNED)) AS n FROM produtos "
                   "WHERE ean13 LIKE %s AND CHAR_LENGTH(ean13) = 13", (PREFIXO_INTERNO + "%",))
    linha = cursor.fetchone() or {}
    numero = int(linha.get("n") or 0) + 1
    while True:   # se alguém digitou à mão um interno mais à frente, pula
        candidato = interno(numero)
        cursor.execute("SELECT id FROM produtos WHERE ean13 = %s", (candidato,))
        if not cursor.fetchone():
            return candidato
        numero += 1


def validar(cursor, codigo, produto_id=None) -> str:
    """Confere formato, dígito e se outro produto já usa. Devolve o EAN limpo (só dígitos)."""
    codigo = re.sub(r"\D", "", str(codigo or ""))
    if len(codigo) != 13:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="O EAN-13 precisa ter 13 números.")
    if not valido(codigo):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"EAN-13 inválido: o último número (dígito verificador) devia ser "
                                   f"{digito_verificador(codigo[:12])}.")
    if produto_id is None:
        cursor.execute("SELECT id, nome FROM produtos WHERE ean13 = %s", (codigo,))
    else:
        cursor.execute("SELECT id, nome FROM produtos WHERE ean13 = %s AND id != %s", (codigo, produto_id))
    outro = cursor.fetchone()
    if outro:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Este EAN-13 já está no produto \"{outro['nome']}\".")
    return codigo
