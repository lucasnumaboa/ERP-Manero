"""
Ferramentas que o assistente de IA pode usar para consultar o banco (function calling — o mesmo conceito das
ferramentas MCP). Só leitura, com SQL parametrizado e resultados curtos. Mostram o que qualquer usuário já vê
nas telas de Produtos/Estoque (sem preço de custo).

Uso: executor = ExecutorFerramentas(); texto = await conversar_com_ferramentas(msgs, FERRAMENTAS, executor.executar)
     executor.produtos_citados -> produtos que as ferramentas trouxeram (a tela mostra como atalhos)
"""
import inspect
import re

from database import get_db_cursor

LIMITE_BUSCA = 15
LIMITE_TEXTO = 1500

FERRAMENTAS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_produtos",
            "description": (
                "Procura produtos do catálogo por nome, código ou categoria e diz o estoque atual e o preço de venda. "
                "Use sempre que o usuário perguntar se tem um produto, quanto custa, quantos tem etc. "
                "Tente termos curtos e sem palavras genéricas (ex.: 'rx580', 'placa mae b450', 'ssd 240'); "
                "se não achar nada, tente de novo com menos palavras ou um sinônimo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "termo": {"type": "string", "description": "Palavras do nome/código do produto, ex.: 'rx 580 8gb'"},
                    "categoria": {"type": "string", "description": "Opcional: parte do nome da categoria, ex.: 'placa de vídeo'"},
                    "somente_com_estoque": {"type": "boolean", "description": "true para trazer só o que tem estoque (padrão false)"},
                },
                "required": ["termo"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detalhes_produto",
            "description": (
                "Traz tudo o que está cadastrado de um produto: descrição, instruções e dúvidas frequentes, estoque, "
                "depósito, preço e comissão. Use para responder dúvidas específicas sobre um produto."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "produto_id": {"type": "integer", "description": "id do produto (vem do buscar_produtos)"},
                    "codigo": {"type": "string", "description": "ou o código do produto"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "listar_categorias",
            "description": "Lista as categorias de produto com quantos produtos ativos e quantos com estoque cada uma tem.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

_CAMPOS_LISTA = """
    p.id, p.codigo, p.nome, c.nome AS categoria, p.preco_venda, p.estoque_atual, d.nome AS deposito, p.ativo
"""
_JUNCOES = """
    FROM produtos p
    LEFT JOIN categorias_produtos c ON p.categoria_id = c.id
    LEFT JOIN depositos d ON p.deposito_id = d.id
"""


def _texto(valor, limite=LIMITE_TEXTO):
    valor = (valor or "").strip()
    return valor if len(valor) <= limite else valor[:limite] + "…"


def _numero(valor):
    try:
        return float(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def _produto_resumo(p):
    return {
        "id": p["id"], "codigo": p["codigo"], "nome": p["nome"], "categoria": p.get("categoria"),
        "preco_venda": _numero(p.get("preco_venda")), "estoque_atual": p.get("estoque_atual"),
        "deposito": p.get("deposito"), "ativo": bool(p.get("ativo")),
    }


class ExecutorFerramentas:
    def __init__(self, usuario_id=None, mensagem_id=None, pergunta=None):
        self.produtos_citados = {}   # id -> resumo, na ordem em que apareceram
        # quem perguntou e qual pergunta: cada busca fica registrada para o relatório de demanda
        self.usuario_id, self.mensagem_id, self.pergunta = usuario_id, mensagem_id, pergunta

    def executar(self, nome, argumentos):
        funcao = {
            "buscar_produtos": self.buscar_produtos,
            "detalhes_produto": self.detalhes_produto,
            "listar_categorias": self.listar_categorias,
        }.get(nome)
        if not funcao:
            return {"erro": f"ferramenta desconhecida: {nome}"}
        aceitos = inspect.signature(funcao).parameters
        return funcao(**{k: v for k, v in (argumentos or {}).items() if k in aceitos})

    def _citar(self, produtos):
        for p in produtos:
            self.produtos_citados.setdefault(p["id"], p)

    def buscar_produtos(self, termo="", categoria=None, somente_com_estoque=False):
        palavras = [w for w in re.split(r"\s+", str(termo or "").lower().strip()) if len(w) >= 2][:6]
        if not palavras and not categoria:
            return {"erro": "informe um termo de busca"}
        condicoes, params = ["p.ativo = 1"], []
        for w in palavras:
            # "rx580" acha "RX 580" e vice-versa: compara também sem espaços
            condicoes.append("(REPLACE(LOWER(p.nome), ' ', '') LIKE %s OR LOWER(p.codigo) = %s OR LOWER(c.nome) LIKE %s)")
            params += [f"%{w.replace(' ', '')}%", w, f"%{w}%"]
        if categoria:
            condicoes.append("LOWER(c.nome) LIKE %s")
            params.append(f"%{str(categoria).lower()}%")
        # sempre busca no cadastro todo (com estoque primeiro): mesmo quando a IA pede só o que tem estoque,
        # o relatório de demanda precisa saber se o produto existe no cadastro ou nem isso
        with get_db_cursor() as cursor:
            cursor.execute(
                f"SELECT {_CAMPOS_LISTA} {_JUNCOES} WHERE {' AND '.join(condicoes)} "
                f"ORDER BY (p.estoque_atual > 0) DESC, p.estoque_atual DESC, p.nome LIMIT %s",
                (*params, LIMITE_BUSCA + 1),
            )
            linhas = cursor.fetchall()
        cadastrados = [_produto_resumo(p) for p in linhas]
        com_estoque = [p for p in cadastrados if (p["estoque_atual"] or 0) > 0]
        produtos = (com_estoque if somente_com_estoque else cadastrados)[:LIMITE_BUSCA]
        self._citar(produtos)
        self._registrar_busca(termo, categoria, cadastrados, com_estoque)
        resultado = {
            "encontrados": len(produtos),
            "tem_mais": len(linhas) > LIMITE_BUSCA,
            "com_estoque": len(com_estoque),
            "produtos": produtos,
        }
        if somente_com_estoque:
            resultado["cadastrados_sem_estoque"] = len(cadastrados) - len(com_estoque)
        return resultado

    def _registrar_busca(self, termo, categoria, cadastrados, com_estoque):
        if self.usuario_id is None:
            return
        try:
            with get_db_cursor(commit=True) as cursor:
                cursor.execute(
                    "INSERT INTO chat_buscas (mensagem_id, usuario_id, pergunta, termo, categoria, encontrados, com_estoque, produtos_ids) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (self.mensagem_id, self.usuario_id, (self.pergunta or "")[:500] or None, str(termo or "")[:200],
                     (str(categoria)[:100] if categoria else None), len(cadastrados), len(com_estoque),
                     ",".join(str(p["id"]) for p in cadastrados[:LIMITE_BUSCA])[:500] or None),
                )
        except Exception as e:  # o registro é para relatório: nunca atrapalha a resposta
            print(f"[IA] Não foi possível registrar a busca: {e!r}")

    def detalhes_produto(self, produto_id=None, codigo=None):
        if produto_id is None and not codigo:
            return {"erro": "informe produto_id ou codigo"}
        filtro, valor = ("p.id = %s", int(produto_id)) if produto_id is not None else ("p.codigo = %s", str(codigo))
        with get_db_cursor() as cursor:
            cursor.execute(
                f"SELECT {_CAMPOS_LISTA}, p.descricao, p.instrucoes_duvidas, p.comissao, p.estoque_minimo, "
                f"p.tipo_produto, p.faturavel {_JUNCOES} WHERE {filtro} LIMIT 1",
                (valor,),
            )
            p = cursor.fetchone()
        if not p:
            return {"erro": "produto não encontrado"}
        resumo = _produto_resumo(p)
        self._citar([resumo])
        return {
            **resumo,
            "comissao": _numero(p.get("comissao")),
            "estoque_minimo": p.get("estoque_minimo"),
            "tipo": p.get("tipo_produto"),
            "faturavel": bool(p.get("faturavel")),
            "descricao": _texto(p.get("descricao")) or "(sem descrição cadastrada)",
            "instrucoes_e_duvidas": _texto(p.get("instrucoes_duvidas")) or "(nada cadastrado)",
        }

    def listar_categorias(self):
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT c.nome, COUNT(p.id) AS produtos, COALESCE(SUM(p.estoque_atual > 0), 0) AS com_estoque "
                "FROM categorias_produtos c LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo = 1 "
                "GROUP BY c.id, c.nome ORDER BY c.nome"
            )
            return {"categorias": [{"nome": r["nome"], "produtos": int(r["produtos"]), "com_estoque": int(r["com_estoque"])}
                                   for r in cursor.fetchall()]}
