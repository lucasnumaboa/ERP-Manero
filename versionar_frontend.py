#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Carimba a versão de cada CSS/JS do frontend nos HTML: css/x.css -> css/x.css?v=<impressão digital do conteúdo>.

Por quê: a Cloudflare manda o navegador guardar CSS/JS por 4 horas (troca o max-age do servidor), então
depois de uma atualização o celular podia misturar arquivo novo com arquivo velho. O HTML não fica guardado;
com a versão no endereço, qualquer arquivo alterado é baixado de novo na hora e os que não mudaram continuam
vindo do cache.

Roda sozinho no fim do change_api_link.py (start_erp.bat e vigia). Depois de editar CSS/JS com o ERP no ar:
    python versionar_frontend.py
"""
import hashlib
import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent / "frontend"
# endereços locais de .css/.js (relativos à página, ex.: js/x.js, ../js/x.js, app.css); links externos ficam de fora
_CAMINHO = r"((?!https?:|//)[\w./-]+?\.(?:css|js))"
REF_HTML = re.compile(r'((?:src|href)=")' + _CAMINHO + r'(?:\?v=[0-9a-f]+)?(")')
# scripts carregados por outro script (não aparecem no HTML): arquivo -> pasta da página que o usa
REF_JS = re.compile(r"""(['"])""" + _CAMINHO + r"""(?:\?v=[0-9a-f]+)?(['"])""")
CARREGAM_OUTROS = {"js/sidebar-template.js": FRONTEND}


def paginas():
    """Telas do ERP (raiz do frontend) e do app do Assistente (assistente/)."""
    return sorted(FRONTEND.glob("*.html")) + sorted(FRONTEND.glob("assistente/*.html"))


def impressao(arquivo: Path) -> str:
    # quebra de linha não conta (CRLF x LF muda conforme o checkout do git, o conteúdo é o mesmo)
    return hashlib.md5(arquivo.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:10]


def carimbar(texto: str, regex, base: Path = FRONTEND) -> str:
    def trocar(m):
        alvo = (base / m.group(2)).resolve()
        if not alvo.is_file() or FRONTEND not in alvo.parents:
            return m.group(0)
        return f"{m.group(1)}{m.group(2)}?v={impressao(alvo)}{m.group(3)}"
    return regex.sub(trocar, texto)


def _ler(arquivo: Path) -> str:
    with open(arquivo, encoding="utf-8", newline="") as f:
        return f.read()


def gravar_se_mudou(arquivo: Path, novo: str, antigo: str) -> bool:
    if novo == antigo:
        return False
    with open(arquivo, "w", encoding="utf-8", newline="") as f:
        f.write(novo)
    return True


def versionar() -> int:
    alterados = 0
    # primeiro os scripts que carregam outros (a impressão deles muda junto)
    for relativo, base in CARREGAM_OUTROS.items():
        arquivo = FRONTEND / relativo
        antigo = _ler(arquivo)
        alterados += gravar_se_mudou(arquivo, carimbar(antigo, REF_JS, base), antigo)
    for pagina in paginas():
        antigo = _ler(pagina)
        alterados += gravar_se_mudou(pagina, carimbar(antigo, REF_HTML, pagina.parent), antigo)
    return alterados


if __name__ == "__main__":
    print(f"Versões de CSS/JS atualizadas em {versionar()} arquivo(s).")
