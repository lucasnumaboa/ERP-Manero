def proximo_codigo(cursor, tabela: str, prefixo: str) -> str:
    """
    Próximo código sequencial do ano (ex.: PV20260370) a partir do maior número já usado.
    Deve rodar na mesma transação do INSERT: o FOR UPDATE faz uma segunda gravação simultânea
    esperar a primeira terminar, e a exclusão de registros não faz números se repetirem.
    """
    cursor.execute("SELECT YEAR(NOW()) AS ano")
    base = f"{prefixo}{cursor.fetchone()['ano']}"
    cursor.execute(
        f"SELECT MAX(CAST(SUBSTRING(codigo, %s) AS UNSIGNED)) AS maior FROM {tabela} WHERE codigo LIKE %s FOR UPDATE",
        (len(base) + 1, base + "%"),
    )
    maior = cursor.fetchone()["maior"] or 0
    return f"{base}{maior + 1:04d}"
