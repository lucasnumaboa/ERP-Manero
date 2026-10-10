"""O que o robô manda à IA quando trava (o resumo da tela de verdade) e como ele acha o botão ou o campo que a IA
mandou usar. Vale para OLX e Facebook: só usa o que está visível na página."""

_COMUM = r"""
const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const limpar = (t) => (t || '').replace(/\s+/g, ' ').trim();
const SEL_CLICAVEIS = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="radio"], ' +
  '[role="checkbox"], [role="menuitem"], [role="option"], [role="combobox"], input[type="submit"], ' +
  'input[type="button"], label';
const textoDe = (e) => limpar(e.textContent || e.value || e.getAttribute('aria-label') || '');
const rotuloDe = (el) => {
  if (el.id) { try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return limpar(l.textContent); } catch (e) {} }
  const raiz = el.closest('.olx-core-form-root') || el.closest('label') || el.parentElement;
  const lab = raiz && raiz.querySelector('label');
  if (lab && lab !== el && !lab.contains(el)) return limpar(lab.textContent);
  return limpar(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '');
};
const SEL_CAMPOS = 'input, textarea, select, [role="combobox"]';
const PULAR = ['hidden', 'submit', 'button', 'file', 'radio', 'checkbox', 'image', 'reset'];
"""

# Resumo da tela: títulos, botões/links visíveis, campos (valor atual e opções), mensagens de erro e o texto
JS_TELA = _COMUM + r"""
const titulos = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].filter(vis)
  .map(e => limpar(e.textContent)).filter(Boolean).slice(0, 20);
const botoes = [...new Set([...document.querySelectorAll(SEL_CLICAVEIS)].filter(vis).map(textoDe)
  .filter(t => t && t.length <= 80))].slice(0, 100);
const campos = [];
document.querySelectorAll(SEL_CAMPOS).forEach((el) => {
  if (!vis(el)) return;
  const tipoInput = (el.type || '').toLowerCase();
  if (el.tagName === 'INPUT' && PULAR.includes(tipoInput)) return;
  let tipo = 'texto', valor = '', opcoes = [];
  if (el.tagName === 'TEXTAREA') { tipo = 'area'; valor = el.value; }
  else if (el.tagName === 'SELECT') {
    tipo = 'lista'; opcoes = [...el.options].map(o => limpar(o.textContent)).filter(Boolean);
    valor = el.selectedIndex > 0 ? limpar(el.options[el.selectedIndex].textContent) : '';
  } else if (el.getAttribute('role') === 'combobox' && el.tagName !== 'INPUT') {
    tipo = 'lista';
    const bloco = el.closest('.olx-core-singleselect') || el.parentElement;
    opcoes = [...(bloco ? bloco.querySelectorAll('[role="option"]') : [])].map(o => limpar(o.textContent)).filter(Boolean);
    valor = el.querySelector('[class*="placeholder"]') ? '' : limpar(el.textContent);
  } else { tipo = tipoInput === 'number' ? 'numero' : 'texto'; valor = el.value; }
  const raiz = el.closest('.olx-core-form-root') || el.parentElement;
  campos.push({id: el.id || el.name || '', rotulo: rotuloDe(el), tipo: tipo, valor: limpar(valor).slice(0, 300),
    opcoes: opcoes.slice(0, 150), obrigatorio: !!el.required || el.getAttribute('aria-required') === 'true' ||
    /obrigat/i.test(raiz ? raiz.textContent : '')});
});
const erros = [...new Set([...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [class*="error"], ' +
  '[class*="Error"], [class*="helper-text"], [class*="feedback"]')].filter(vis).map(e => limpar(e.textContent))
  .filter(t => t && t.length <= 200 && t.toLowerCase() !== 'selecione'))].slice(0, 20);
return {url: location.href, titulos: titulos, botoes: botoes, campos: campos.slice(0, 50), erros: erros,
        texto: limpar(document.body ? document.body.innerText : '').slice(0, 6000)};
"""

# Botão/link/opção visível com esse texto (igual; senão igual sem maiúsculas). O menor elemento ganha.
JS_ACHAR_CLICAVEL = _COMUM + r"""
const alvo = limpar(arguments[0]);
const lista = [...document.querySelectorAll(SEL_CLICAVEIS)].filter(vis);
const achados = lista.filter(e => textoDe(e) === alvo);
const parecidos = achados.length ? achados : lista.filter(e => textoDe(e).toLowerCase() === alvo.toLowerCase());
parecidos.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                         b.getBoundingClientRect().width * b.getBoundingClientRect().height);
return parecidos[0] || null;
"""

# Campo visível pelo id/nome ou pelo rótulo
JS_ACHAR_CAMPO = _COMUM + r"""
const alvo = limpar(arguments[0]).toLowerCase();
const lista = [...document.querySelectorAll(SEL_CAMPOS)].filter(vis);
return lista.find(e => (e.id || '').toLowerCase() === alvo || (e.name || '').toLowerCase() === alvo) ||
       lista.find(e => rotuloDe(e).toLowerCase() === alvo) || null;
"""

# Opção visível de uma lista aberta (aberta, a lista costuma ir para uma camada fora do campo)
JS_OPCAO_VISIVEL = _COMUM + r"""
const alvo = limpar(arguments[0]);
return [...document.querySelectorAll('[role="option"]')].filter(vis).find(o => limpar(o.textContent) === alvo) || null;
"""


def com_dados_do_produto(valor: str, item: dict) -> str:
    """A IA escreve {titulo}, {descricao} e {preco} no lugar dos dados do produto (assim a resposta serve para outros)."""
    return (valor or "").replace("{titulo}", str(item.get("titulo") or "")) \
        .replace("{descricao}", str(item.get("descricao") or "")).replace("{preco}", str(item.get("preco") or ""))


def descrever(acao: dict) -> str:
    tipo = acao.get("tipo")
    if tipo == "clicar":
        return f"clicar em '{acao.get('texto')}'"
    if tipo == "preencher":
        return f"preencher '{acao.get('campo')}' com '{str(acao.get('valor'))[:40]}'"
    if tipo == "selecionar":
        return f"escolher '{acao.get('opcao')}' em '{acao.get('campo')}'"
    if tipo == "esperar":
        return f"esperar {acao.get('segundos')}s"
    return f"desistir ({acao.get('motivo')})"
