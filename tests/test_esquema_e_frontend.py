"""init_db.py em dia com o banco de produção e regras que não podem voltar no frontend."""
import re
import shutil
import subprocess
from pathlib import Path

import mysql.connector
import pytest

from conftest import BANCO_TESTE, CONEXAO

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
PAGINAS = sorted(FRONTEND.glob("*.html"))
SCRIPTS = sorted((FRONTEND / "js").glob("*.js"))

# Diferenças conhecidas e aceitas entre produção e uma instalação nova
LEGADO_SO_EM_PRODUCAO = {("produtos", "usuario_dono")}          # coluna antiga, sem uso e vazia
SO_EM_INSTALACAO_NOVA = {("contas_bancarias", "pix"), ("contas_bancarias", "nome_destinatario")}


def _colunas(banco):
    conn = mysql.connector.connect(**CONEXAO)
    try:
        cur = conn.cursor()
        cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=%s", (banco,))
        return {(t, c) for t, c in cur.fetchall()}
    finally:
        conn.close()


def test_instalacao_nova_tem_tudo_que_a_producao_tem():
    producao = _colunas("erp_maneiro")
    if not producao:
        pytest.skip("banco de produção não acessível nesta máquina")
    nova = _colunas(BANCO_TESTE)
    faltando = sorted(producao - nova - LEGADO_SO_EM_PRODUCAO)
    sobrando = sorted(nova - producao - SO_EM_INSTALACAO_NOVA)
    assert not faltando, f"init_db.py não cria (tabela, coluna): {faltando}"
    assert not sobrando, f"init_db.py cria algo que produção não tem (falta migração?): {sobrando}"


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js não instalado")
def test_todos_os_scripts_tem_sintaxe_valida():
    erros = []
    for js in SCRIPTS:
        r = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
        if r.returncode:
            erros.append(f"{js.name}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else 'erro'}")
    assert not erros, "\n".join(erros)


def test_endereco_da_api_so_no_config_js():
    fora = [p.name for p in SCRIPTS + PAGINAS if p.name != "config.js" and "erp-api-call.autoservto.com.br" in p.read_text(encoding="utf-8")]
    assert not fora, f"URL da API fixa fora de js/config.js: {fora}"


def test_paginas_carregam_scripts_centrais():
    problemas = []
    for p in PAGINAS:
        html = p.read_text(encoding="utf-8")
        if not html.strip() or p.name == "offline.html":  # offline.html é mostrada sem internet: não carrega nada do servidor
            continue
        for obrigatorio in ("js/config.js", "js/avisos.js"):
            if obrigatorio not in html:
                problemas.append(f"{p.name} sem {obrigatorio}")
        if 'class="sidebar-nav"' in html and "js/sidebar-template.js" not in html:
            problemas.append(f"{p.name} tem menu mas não carrega sidebar-template.js")
    assert not problemas, "\n".join(problemas)


def test_menu_nao_vem_fixo_no_html():
    # O menu completo no HTML aparecia por um instante para quem não tinha permissão.
    com_menu_fixo = []
    for p in PAGINAS:
        m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', p.read_text(encoding="utf-8"), re.S)
        if m and len(re.findall(r"<a href=", m.group(1))) > 1:
            com_menu_fixo.append(p.name)
    assert not com_menu_fixo, f"menu fixo no HTML: {com_menu_fixo}"


def test_sem_confirm_nativo_nem_botao_de_menu_duplicado():
    problemas = []
    for js in SCRIPTS:
        codigo = js.read_text(encoding="utf-8")
        if re.search(r"(?<![\w.$])confirm\(", codigo):
            problemas.append(f"{js.name}: confirm() nativo (use confirmarAcao)")
        if js.name != "sidebar-template.js" and "getElementById('toggleSidebar')" in codigo:
            problemas.append(f"{js.name}: liga o botão do menu de novo (já é feito no sidebar-template.js)")
    assert not problemas, "\n".join(problemas)


def test_sem_css_repetido_na_mesma_pagina():
    repetidos = []
    for p in PAGINAS:
        links = re.findall(r'href="(css/[^"]+)"', p.read_text(encoding="utf-8"))
        if len(links) != len(set(links)):
            repetidos.append(p.name)
    assert not repetidos, f"CSS carregado mais de uma vez: {repetidos}"


def test_chave_de_ia_nao_vai_para_telas_de_vendedor():
    # Nenhuma tela fala direto com o provedor de IA; a chamada é feita pelo backend.
    permitidos = {"configuracoes.js"}  # tela de admin onde a chave é cadastrada (recebe só a versão mascarada)
    problemas = [js.name for js in SCRIPTS if js.name not in permitidos
                 and re.search(r"openrouter\.ai|apikey_openrouter", js.read_text(encoding="utf-8"))]
    assert not problemas, f"chave/provedor de IA no navegador: {problemas}"


def test_sem_script_repetido_na_mesma_pagina():
    repetidos = []
    for p in PAGINAS:
        scripts = re.findall(r'<script src="(js/[^"]+)"', p.read_text(encoding="utf-8"))
        if len(scripts) != len(set(scripts)):
            repetidos.append(p.name)
    assert not repetidos, f"script carregado mais de uma vez: {repetidos}"


APP = [p for p in PAGINAS if 'class="sidebar"' in p.read_text(encoding="utf-8")]


def test_sem_console_log_nos_scripts():
    achados = [f"{s.name}:{n}" for s in SCRIPTS
               for n, linha in enumerate(s.read_text(encoding="utf-8").splitlines(), 1)
               if "console.log(" in linha and not linha.strip().startswith("//")]
    assert not achados, f"console.log voltou (use console.error só para erros): {achados}"


def test_telas_funcionam_no_celular_e_como_app():
    for pagina in APP:
        html = pagina.read_text(encoding="utf-8")
        assert re.search(r'href="css/celular\.css(\?v=\w+)?"', html), f"{pagina.name} sem css/celular.css"
        # celular.css precisa ser o último CSS do <head> para valer sobre os estilos da tela
        cabeca = html.split("</head>")[0]
        assert cabeca.rstrip().rsplit("<link", 1)[1].startswith(' rel="stylesheet" href="css/celular.css'), pagina.name
    for pagina in PAGINAS:
        if pagina.name != "offline.html":
            assert 'rel="manifest"' in pagina.read_text(encoding="utf-8"), f"{pagina.name} sem manifest"
    manifesto = (FRONTEND / "manifest.webmanifest").read_text(encoding="utf-8")
    for icone in re.findall(r'"src":\s*"([^"]+)"', manifesto):
        assert (FRONTEND / icone).exists(), icone


def test_relatorios_e_produtos_sem_estilo_no_html():
    for nome in ("relatorios.html", "produtos.html"):
        html = (FRONTEND / nome).read_text(encoding="utf-8")
        assert "<style" not in html, f"{nome} voltou a ter <style>"
        # só estado liga/desliga do JS (display) pode ficar inline
        outros = [s for s in re.findall(r'\sstyle="([^"]*)"', html) if s.replace(" ", "") not in ("display:none;", "display:block;")]
        assert not outros, f"{nome}: style inline {outros[:5]}"


def test_versao_dos_css_js_nos_html_em_dia():
    """A Cloudflare guarda CSS/JS no navegador por 4h: sem a versão certa no endereço, o celular mistura
    arquivo novo com velho. Depois de editar CSS/JS: python versionar_frontend.py"""
    import sys
    sys.path.insert(0, str(FRONTEND.parent))
    from versionar_frontend import REF_HTML, REF_JS, CARREGAM_OUTROS, carimbar
    desatualizados = [p.name for p in PAGINAS if carimbar(p.read_text(encoding="utf-8"), REF_HTML) != p.read_text(encoding="utf-8")]
    desatualizados += [r for r in CARREGAM_OUTROS if carimbar((FRONTEND / r).read_text(encoding="utf-8"), REF_JS) != (FRONTEND / r).read_text(encoding="utf-8")]
    assert not desatualizados, f"rode python versionar_frontend.py (versões velhas em: {desatualizados})"
    sem_versao = [f"{p.name}: {m.group(2)}" for p in PAGINAS for m in re.finditer(r'(?:src|href)="((?:css|js)/[^"?]+)(")', p.read_text(encoding="utf-8"))]
    assert not sem_versao, sem_versao
