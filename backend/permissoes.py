"""
Permissões de grupo aplicadas na API (antes só existiam nas telas).

Cada módulo define quais permissões do grupo do usuário liberam leitura (GET) e escrita
(POST/PUT/PATCH/DELETE). Basta o usuário ter UMA das permissões listadas. Admin sempre passa.
None = não exige nada além do login que a própria rota já pede (listas usadas por várias telas).
As listas espelham quais telas usam cada API, para não quebrar fluxos existentes
(ex.: a tela de Vendas também cadastra cliente, a de Compras também lança contas a pagar).
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security.utils import get_authorization_scheme_param

from auth import get_current_user
from database import get_db_cursor

SOMENTE_ADMIN = ["__somente_admin__"]

MODULOS = {
    "produtos": {"leitura": None, "escrita": ["produtos_editar", "compras_editar", "estoque_editar"]},
    "categorias": {"leitura": None, "escrita": ["produtos_editar"]},
    "depositos": {"leitura": None, "escrita": ["depositos_editar"]},
    "clientes": {"leitura": None, "escrita": ["clientes_editar", "vendas_editar"]},
    "parceiros": {"leitura": None, "escrita": ["clientes_editar", "fornecedores_editar", "compras_editar"]},
    "vendedores": {"leitura": None, "escrita": ["vendedores_editar"]},
    "vendas": {
        "leitura": ["vendas_visualizar", "dashboard_visualizar", "financeiro_visualizar"],
        "escrita": ["vendas_editar"],
    },
    "compras": {
        "leitura": ["compras_visualizar", "financeiro_visualizar", "estoque_visualizar", "produtos_visualizar"],
        "escrita": ["compras_editar", "produtos_editar"],
    },
    "estoque": {"leitura": None, "escrita": ["estoque_editar", "compras_editar", "produtos_editar"]},
    "contas_pagar": {
        "leitura": ["financeiro_visualizar", "dashboard_visualizar", "vendas_visualizar", "compras_visualizar"],
        "escrita": ["financeiro_editar", "compras_editar", "vendas_editar"],
    },
    "contas_receber": {
        "leitura": ["financeiro_visualizar", "dashboard_visualizar", "vendas_visualizar"],
        "escrita": ["financeiro_editar", "vendas_editar"],
    },
    "caixa": {"leitura": ["financeiro_visualizar"], "escrita": ["financeiro_editar"]},
    "controle_financeiro": {"leitura": ["financeiro_visualizar"], "escrita": ["financeiro_editar"]},
    "condicoes_pagamento": {"leitura": None, "escrita": ["financeiro_editar"]},
    "dashboard": {"leitura": ["dashboard_visualizar"], "escrita": ["dashboard_editar"]},
    "relatorios": {"leitura": ["dashboard_visualizar"], "escrita": ["dashboard_visualizar"]},
    "metas": {"leitura": ["metas_visualizar", "dashboard_visualizar"], "escrita": ["metas_editar"]},
    "plataformas_venda": {"leitura": None, "escrita": ["configuracoes_editar"]},
    "olx": {"leitura": None, "escrita": ["produtos_editar"]},
    "propostas": {"leitura": None, "escrita": ["vendas_editar"]},
    "postagens": {"leitura": None, "escrita": ["vendas_editar"]},
    # Orçamento é feito pelos próprios vendedores (o backend já limita cada um aos seus).
    "orcamentos": {"leitura": ["vendas_visualizar"], "escrita": ["vendas_visualizar"]},
    "filamentos_3d": {"leitura": None, "escrita": SOMENTE_ADMIN},
}

METODOS_LEITURA = {"GET", "HEAD", "OPTIONS"}


def usuario_tem_permissao(usuario_id: int, chaves: list) -> bool:
    """True se o grupo do usuário tiver ao menos uma das permissões (colunas de grupo_usuario)."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT g.* FROM usuarios u JOIN grupo_usuario g ON g.id = u.grupo_id WHERE u.id = %s",
            (usuario_id,),
        )
        grupo = cursor.fetchone()
    if not grupo:
        return False
    return any(bool(grupo.get(chave)) for chave in chaves)


def permissao_modulo(nome: str):
    """Dependência para `include_router(..., dependencies=permissao_modulo("vendas"))`."""
    regra = MODULOS[nome]

    async def verificar(request: Request):
        chaves = regra["leitura"] if request.method in METODOS_LEITURA else regra["escrita"]
        if not chaves:
            return

        esquema, token = get_authorization_scheme_param(request.headers.get("Authorization"))
        if esquema.lower() != "bearer" or not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Não autenticado",
                headers={"WWW-Authenticate": "Bearer"},
            )
        usuario = await get_current_user(token)
        if usuario.nivel_acesso == "admin":
            return
        if not usuario_tem_permissao(usuario.id, chaves):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Seu grupo de usuário não tem permissão para esta ação",
            )

    return [Depends(verificar)]
