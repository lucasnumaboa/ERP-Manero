/* ERP AutoPost — tela. Conversa com o Python por window.pywebview.api (api.py). */
'use strict';

const NOMES = { facebook: 'Facebook', olx: 'OLX' };
const ICONES = {
    caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    enviar: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    recarregar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    lixeira: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const estado = {
    usuario: null,
    apiUrl: '',
    produtos: [],
    categorias: [],
    noAr: {},              // {"12": ["facebook"]}
    paraRemover: 0,
    filtro: 'todos',
    busca: '',
    categoria: '',
    excluidosDaFila: new Set(),   // "12-olx" tirados só desta rodada
    statusItens: {},              // "12-olx" -> publicando | ok | erro | parado
    filaRodando: null,            // fila enviada na postagem em andamento
    eventosLidos: 0,
    rodando: false,
    tarefa: null,
    abaAnuncios: 'remover',
    config: null,
};

// ---------- utilidades ----------
function api() { return window.pywebview.api; }

async function chamar(nome, ...args) {
    const r = await api()[nome](...args);
    if (r && r.erro) throw new Error(r.erro);
    return r;
}

function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function reais(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function data(d) {
    if (!d) return '';
    const dt = new Date(String(d).replace(' ', 'T'));
    return isNaN(dt) ? d : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function aviso(texto, tipo = '') {
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.textContent = texto;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 4000);
}

function desenharIcones(raiz = document) {
    $$('[data-icone]', raiz).forEach(el => {
        if (el.firstChild) return;
        el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[el.dataset.icone] || ''}</svg>`;
    });
}

function urlImagem(caminho, miniatura) {
    if (!caminho) return '';
    let c = caminho.replace(/^\/+/, '');
    if (/^https?:/.test(c)) return c;
    if (miniatura) {
        const partes = c.split('/');
        const arquivo = partes.pop().replace(/\.[^.]+$/, '') + '.jpg';
        c = [...partes, 'thumbs', arquivo].join('/');
    }
    return `${estado.apiUrl}/${c}`;
}

function primeiraImagem(p) {
    return (p.caminho_imagem || '').split(',').map(s => s.trim()).filter(Boolean)[0] || '';
}

function precoAnuncio(p) {
    return p.preco_anuncio ?? p.preco_venda ?? 0;
}

function estaNoAr(p, plataforma) {
    return (estado.noAr[String(p.id)] || []).includes(plataforma);
}

// ---------- fila ----------
function montarFila() {
    const republicar = $('#republicar').checked;
    const fila = [];
    for (const p of estado.produtos) {
        const plataformas = ['facebook', 'olx'].filter(pl =>
            p[pl] && (republicar || !estaNoAr(p, pl)) && !estado.excluidosDaFila.has(`${p.id}-${pl}`));
        if (plataformas.length) fila.push({ produto: p, plataformas });
    }
    return fila;
}

function contarFila(fila) {
    const c = { facebook: 0, olx: 0 };
    fila.forEach(f => f.plataformas.forEach(pl => c[pl]++));
    return c;
}

function atualizarResumoFila() {
    const c = contarFila(montarFila());
    const total = c.facebook + c.olx;
    $('#seloFila').hidden = !total;
    $('#seloFila').textContent = total;
    $('#resumoFila').innerHTML = total
        ? `Na fila: <b>${c.facebook}</b> no Facebook e <b>${c.olx}</b> na OLX`
        : 'Fila vazia: ligue Facebook ou OLX nos produtos que ainda não estão no ar.';
    $('#rodapeFila .botao').disabled = !total;
}

// ---------- produtos ----------
function produtosFiltrados() {
    const busca = estado.busca.trim().toLowerCase();
    return estado.produtos.filter(p => {
        if (estado.categoria && p.categoria_nome !== estado.categoria) return false;
        if (busca && !`${p.nome} ${p.codigo || ''}`.toLowerCase().includes(busca)) return false;
        const noAr = estaNoAr(p, 'facebook') || estaNoAr(p, 'olx');
        const naFila = ['facebook', 'olx'].some(pl => p[pl] && !estaNoAr(p, pl));
        if (estado.filtro === 'fila') return naFila;
        if (estado.filtro === 'no_ar') return noAr;
        if (estado.filtro === 'nenhum') return !p.facebook && !p.olx;
        return true;
    });
}

function htmlSite(p, pl) {
    const ligado = p[pl];
    const noAr = estaNoAr(p, pl);
    const status = estado.statusItens[`${p.id}-${pl}`];
    let txt = '';
    if (status === 'publicando') txt = '<span class="estado na-fila">publicando…</span>';
    else if (noAr) txt = '<span class="estado no-ar">● no ar</span>';
    else if (ligado) txt = '<span class="estado na-fila">na fila</span>';
    else txt = '<span class="estado">desligado</span>';
    const classe = pl === 'facebook' ? 'fb' : 'olx';
    const logo = pl === 'facebook' ? '<i class="logo-fb">f</i>' : '<i class="logo-olx">OLX</i>';
    const titulo = noAr ? `Já está no ar no ${NOMES[pl]}` : (ligado ? `Desligar ${NOMES[pl]}` : `Ligar ${NOMES[pl]}`);
    return `<button class="site ${classe} ${ligado ? 'ligado' : ''} ${status === 'publicando' ? 'publicando' : ''} ${status === 'erro' ? 'erro-item' : ''}"
        data-produto="${p.id}" data-site="${pl}" title="${titulo}">${logo}${NOMES[pl]}${txt}</button>`;
}

function desenharProdutos() {
    const lista = produtosFiltrados();
    $('#contagemProdutos').textContent = `${lista.length} de ${estado.produtos.length} produto(s) com estoque`;
    if (!lista.length) {
        $('#listaProdutos').innerHTML = `<div class="vazio">${estado.produtos.length ? 'Nenhum produto com esse filtro.' : 'Nenhum produto com estoque e faturável no ERP.'}</div>`;
        atualizarResumoFila();
        return;
    }
    $('#listaProdutos').innerHTML = lista.map(p => {
        const img = primeiraImagem(p);
        const qtdFotos = (p.caminho_imagem || '').split(',').filter(s => s.trim()).length;
        const foto = img
            ? `<div class="foto" style="background-image:url('${esc(urlImagem(img, true))}'), url('${esc(urlImagem(img))}')"></div>`
            : '<div class="foto"><span data-icone="imagem"></span></div>';
        const precoProprio = p.preco_anuncio != null;
        return `<div class="produto" data-id="${p.id}">
            ${foto}
            <div class="info">
                <div class="nome" title="${esc(p.nome)}">${esc(p.nome)}</div>
                <div class="meta">
                    <span>${esc(p.codigo || '#' + p.id)}</span>
                    <span>${esc(p.categoria_nome || 'Sem categoria')}</span>
                    <span>Estoque: ${p.estoque_atual}</span>
                    ${qtdFotos ? `<span>${qtdFotos} foto(s)</span>` : '<span class="sem-foto">sem foto: não dá para anunciar</span>'}
                </div>
            </div>
            <button class="preco" data-preco="${p.id}" title="Mudar o preço só nos anúncios">${reais(precoAnuncio(p))}${precoProprio ? '<small>preço do anúncio</small>' : ''}</button>
            <div class="sites">${htmlSite(p, 'facebook')}${htmlSite(p, 'olx')}</div>
        </div>`;
    }).join('');
    desenharIcones($('#listaProdutos'));
    atualizarResumoFila();
}

async function alternarSite(produtoId, plataforma, valor) {
    const p = estado.produtos.find(x => x.id === produtoId);
    if (!p) return;
    const anterior = p[plataforma];
    p[plataforma] = valor;
    desenharProdutos();
    try {
        const r = await chamar('escolher', produtoId, plataforma, valor);
        if (r.no_erp === false && !estado.avisouLocal) {
            estado.avisouLocal = true;
            aviso('Seu usuário não pode editar produtos no ERP: a escolha fica salva só neste computador.', 'aviso');
        }
    } catch (e) {
        p[plataforma] = anterior;
        desenharProdutos();
        aviso(e.message, 'erro');
    }
}

async function emMassa(plataforma, valor) {
    const lista = produtosFiltrados();
    const plataformas = plataforma === 'todos' ? ['facebook', 'olx'] : [plataforma];
    const mudar = [];
    lista.forEach(p => plataformas.forEach(pl => { if (Boolean(p[pl]) !== valor) mudar.push([p, pl]); }));
    if (!mudar.length) return aviso('Nada para mudar nos produtos da lista.');
    if (mudar.length > 5 && !confirm(`Mudar ${mudar.length} escolha(s) nos ${lista.length} produto(s) da lista?`)) return;
    mudar.forEach(([p, pl]) => { p[pl] = valor; });
    desenharProdutos();
    let falhas = 0;
    for (let i = 0; i < mudar.length; i += 6) {
        const lote = mudar.slice(i, i + 6);
        const r = await Promise.all(lote.map(([p, pl]) => chamar('escolher', p.id, pl, valor).catch(() => null)));
        r.forEach((x, j) => { if (!x) { falhas++; lote[j][0][lote[j][1]] = !valor; } });
    }
    desenharProdutos();
    aviso(falhas ? `${mudar.length - falhas} alterado(s), ${falhas} com erro.` : `${mudar.length} alterado(s).`, falhas ? 'aviso' : '');
}

async function carregarDados(silencioso = false) {
    if (!silencioso) $('#listaProdutos').innerHTML = '<div class="vazio">Carregando produtos do ERP…</div>';
    try {
        const r = await chamar('carregar');
        estado.produtos = r.produtos;
        estado.categorias = r.categorias;
        estado.noAr = r.no_ar || {};
        estado.paraRemover = r.para_remover;
        estado.apiUrl = r.api_url;
        const sel = $('#filtroCategoria');
        const atual = sel.value;
        sel.innerHTML = '<option value="">Todas as categorias</option>' +
            r.categorias.map(c => `<option ${c === atual ? 'selected' : ''}>${esc(c)}</option>`).join('');
        atualizarSeloRemover();
        desenharProdutos();
        desenharFila();
    } catch (e) {
        $('#listaProdutos').innerHTML = `<div class="vazio">Não foi possível carregar os produtos: ${esc(e.message)}</div>`;
    }
}

function atualizarSeloRemover() {
    $('#seloRemover').hidden = !estado.paraRemover;
    $('#seloRemover').textContent = estado.paraRemover;
    $('#qtdRemover').textContent = estado.paraRemover;
    $('#qtdRemover').classList.toggle('zero', !estado.paraRemover);
}

// ---------- preço do anúncio ----------
let precoEditando = null;
function abrirPreco(id) {
    const p = estado.produtos.find(x => x.id === id);
    if (!p) return;
    precoEditando = p;
    $('#precoProduto').textContent = p.nome;
    $('#precoErp').textContent = reais(p.preco_venda);
    $('#precoValor').value = Math.trunc(precoAnuncio(p));
    $('#precoVoltar').hidden = p.preco_anuncio == null;
    $('#modalPreco').hidden = false;
    $('#precoValor').select();
}

async function salvarPreco(valor) {
    const p = precoEditando;
    $('#modalPreco').hidden = true;
    try {
        await chamar('definir_preco', p.id, valor);
        p.preco_anuncio = valor === null ? null : Number(valor);
        desenharProdutos();
        desenharFila();
    } catch (e) { aviso(e.message, 'erro'); }
}

// ---------- postar ----------
function desenharFila() {
    const fila = estado.filaRodando || montarFila();
    const porSite = { facebook: [], olx: [] };
    fila.forEach(f => f.plataformas.forEach(pl => porSite[pl].push(f.produto)));
    const total = porSite.facebook.length + porSite.olx.length;
    $('#filaVazia').hidden = !!total;
    $('#filaGrupos').innerHTML = ['facebook', 'olx'].filter(pl => porSite[pl].length).map(pl => {
        const logo = pl === 'facebook' ? '<i class="logo-fb">f</i>' : '<i class="logo-olx">OLX</i>';
        const itens = porSite[pl].map(p => {
            const chave = `${p.id}-${pl}`;
            const st = estado.statusItens[chave] || '';
            const tag = { publicando: 'publicando…', ok: 'publicado ✓', erro: 'erro', parado: 'parado' }[st]
                || reais(precoAnuncio(p));
            const tirar = estado.filaRodando ? '' : `<button class="tirar" data-tirar="${chave}" title="Tirar desta postagem">×</button>`;
            return `<li class="${st}"><span title="${esc(p.nome)}">${esc(p.nome)}</span><span class="tag">${tag}</span>${tirar}</li>`;
        }).join('');
        return `<div class="grupo-fila"><header>${logo}${NOMES[pl]}<small>${porSite[pl].length} anúncio(s)</small></header><ul>${itens}</ul></div>`;
    }).join('');
    $('#botaoPostar').disabled = !total || estado.rodando;
    $('#numTotal').textContent = estado.rodando && estado.tarefa === 'postar' ? $('#numTotal').textContent : total;
    desenharResumoOpcoes();
    atualizarResumoFila();
}

function desenharResumoOpcoes() {
    const c = estado.config;
    if (!c) { $('#opcoesResumo').textContent = ''; return; }
    const grupos = c.facebook.grupos ? 'também nos grupos' : 'só no Marketplace';
    $('#opcoesResumo').innerHTML = `Espera de ${c.delay_min} a ${c.delay_max}s entre anúncios · Facebook ${grupos}` +
        `${c.facebook.contato ? ' · com contato na descrição' : ''} · <a data-ir="config">mudar</a>`;
}

async function comecarPostagem() {
    const fila = montarFila();
    if (!fila.length) return;
    const total = fila.reduce((s, f) => s + f.plataformas.length, 0);
    if (!confirm(`Publicar ${total} anúncio(s) agora? O Chrome vai abrir e fazer tudo sozinho; deixe a janela dele em paz enquanto publica.`)) return;
    try {
        estado.statusItens = {};
        await chamar('postar', fila.map(f => ({ produto_id: f.produto.id, plataformas: f.plataformas })));
        estado.filaRodando = fila;
        $('#log').innerHTML = '';
        $('#numTotal').textContent = total;
        desenharFila();
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
}

function escreverLog(ev) {
    const log = $('#log');
    const noFim = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const linha = document.createElement('div');
    linha.className = ev.nivel || '';
    linha.innerHTML = `<span class="hora">${esc(ev.hora)}</span>${esc(ev.mensagem)}`;
    log.appendChild(linha);
    while (log.children.length > 800) log.firstChild.remove();
    if (noFim) log.scrollTop = log.scrollHeight;
}

// ---------- acompanhamento (busca eventos a cada segundo enquanto roda) ----------
let timerAcompanhar = null;
async function acompanhar() {
    clearTimeout(timerAcompanhar);
    let r;
    try { r = await chamar('acompanhar', estado.eventosLidos); } catch (e) { r = null; }
    if (r) {
        for (const ev of r.eventos) {
            estado.eventosLidos = ev.n + 1;
            tratarEvento(ev);
        }
        aplicarEstado(r.estado);
    }
    timerAcompanhar = setTimeout(acompanhar, estado.rodando ? 800 : 3000);
}

function tratarEvento(ev) {
    if (ev.tipo === 'log') escreverLog(ev);
    else if (ev.tipo === 'item') {
        estado.statusItens[ev.chave] = ev.status;
        if (estado.tarefa === 'postar') { desenharFila(); desenharProdutos(); }
    } else if (ev.tipo === 'precisa_login') {
        const logo = $('#modalLogo');
        logo.className = `logo-grande ${ev.plataforma === 'facebook' ? 'logo-fb' : 'logo-olx'}`;
        logo.textContent = ev.plataforma === 'facebook' ? 'f' : 'OLX';
        $('#modalTitulo').textContent = `Entre no ${ev.rotulo}`;
        $('#modalLogin').hidden = false;
    } else if (ev.tipo === 'fim') {
        $('#modalLogin').hidden = true;
        if (ev.tarefa === 'postar') {
            aviso(ev.parado ? `Postagem parada: ${ev.ok} publicado(s).` : `Postagem concluída: ${ev.ok} publicado(s), ${ev.falhas} com erro.`, ev.falhas ? 'aviso' : '');
            estado.filaRodando = null;
            estado.excluidosDaFila.clear();
        } else if (ev.tarefa === 'remover') {
            aviso(`${ev.ok} anúncio(s) tirado(s) do ar${ev.falhas ? `, ${ev.falhas} com erro` : ''}.`, ev.falhas ? 'aviso' : '');
        }
        if (ev.tarefa !== 'login') {
            carregarDados(true);
            if (!$('#pag-anuncios').hidden) carregarAnuncios();
        }
    }
}

function aplicarEstado(st) {
    const antes = estado.rodando;
    estado.rodando = !!st.rodando;
    estado.tarefa = st.tarefa;
    $('#indicadorRodando').hidden = !estado.rodando || st.tarefa === 'login';
    $('#textoRodando').textContent = st.aguardando_login ? 'Esperando você entrar…'
        : (st.tarefa === 'remover' ? `Tirando do ar ${st.feitos}/${st.total}` : `Postando ${st.feitos}/${st.total}`);
    $('#botaoPostar').hidden = estado.rodando && st.tarefa !== 'login';
    $('#botaoParar').hidden = !estado.rodando || st.tarefa === 'login';
    $('#botaoRemoverVendidos').disabled = estado.rodando;
    if (estado.rodando || antes) {
        const total = st.total || 0;
        $('#numFeitos').textContent = st.feitos || 0;
        $('#numTotal').textContent = total;
        $('#numOk').textContent = st.ok || 0;
        $('#numFalhas').textContent = st.falhas || 0;
        $('#barraProgresso').style.width = total ? `${Math.round(100 * (st.feitos || 0) / total)}%` : '0';
        $('#itemAtual').innerHTML = st.atual
            ? `${st.tarefa === 'remover' ? 'Tirando do ar' : 'Publicando'} no <b>${NOMES[st.atual.plataforma]}</b>: <b>${esc(st.atual.produto)}</b>`
            : (estado.rodando ? 'Aguardando o próximo…' : (st.feitos ? 'Concluído.' : 'Parado.'));
    }
    if (antes && !estado.rodando) desenharFila();
}

// ---------- anúncios ----------
async function carregarAnuncios() {
    const lista = $('#listaAnuncios');
    lista.innerHTML = '<div class="vazio">Carregando…</div>';
    try {
        const aba = estado.abaAnuncios;
        const r = await chamar('anuncios', aba === 'remover' ? 'ativo' : aba);
        estado.paraRemover = r.para_remover.length;
        atualizarSeloRemover();
        const itens = aba === 'remover' ? r.para_remover : r.anuncios;
        $('#botaoRemoverVendidos').hidden = !r.para_remover.length;
        if (!itens.length) {
            lista.innerHTML = `<div class="vazio">${{
                remover: 'Nenhum anúncio de produto vendido. Tudo certo!',
                ativo: 'Nenhum anúncio no ar registrado pelo AutoPost.',
                removido: 'Nenhum anúncio removido ainda.',
            }[aba]}</div>`;
            return;
        }
        lista.innerHTML = itens.map(a => {
            const logo = a.plataforma === 'facebook' ? '<i class="logo-fb">f</i>' : '<i class="logo-olx">OLX</i>';
            const vendido = a.status === 'ativo' && (a.estoque_atual <= 0 || !a.produto_ativo);
            const meta = [
                `${NOMES[a.plataforma] || a.plataforma} · publicado em ${data(a.data_publicacao)}`,
                a.usuario_nome ? `por ${esc(a.usuario_nome)}` : '',
                vendido ? `<span class="vendido">${a.produto_ativo ? 'estoque zerado' : 'produto inativo'}</span>` : `estoque: ${a.estoque_atual ?? '?'}`,
                a.status === 'removido' ? `removido em ${data(a.data_remocao)}${a.observacao ? ` (${esc(a.observacao)})` : ''}` : '',
            ].filter(Boolean).join(' · ');
            let acoes = '';
            if (a.link) acoes += `<button class="icone-botao" data-abrir="${esc(a.link)}" title="Abrir anúncio"><span data-icone="link"></span></button>`;
            if (a.status === 'ativo') {
                acoes += `<button class="botao pequeno perigo" data-remover="${a.id}">Tirar do ar</button>`;
                acoes += `<button class="botao pequeno fantasma" data-marcar="${a.id}" title="Use se você já tirou do ar por conta própria">Já saiu</button>`;
            }
            return `<div class="anuncio">${logo}
                <div style="min-width:0"><div class="titulo" title="${esc(a.titulo)}">${esc(a.titulo)}</div><div class="meta">${meta}</div></div>
                <div class="valor">${a.preco != null ? reais(a.preco) : ''}</div>
                <div class="acoes">${acoes}</div></div>`;
        }).join('');
        desenharIcones(lista);
    } catch (e) {
        lista.innerHTML = `<div class="vazio">Erro: ${esc(e.message)}</div>`;
    }
}

async function tirarDoAr(ids) {
    const qtd = ids ? ids.length : estado.paraRemover;
    if (!confirm(`Tirar ${qtd} anúncio(s) do ar? O Chrome vai abrir, achar cada anúncio pelo título e excluir.`)) return;
    try {
        await chamar('remover_anuncios', ids || null);
        $('#log').innerHTML = '';
        aviso('Tirando do ar… acompanhe em Postar.');
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
}

// ---------- configurações ----------
async function carregarConfig() {
    try {
        const c = await chamar('configuracoes');
        estado.config = c;
        $('#cfgDelayMin').value = c.delay_min;
        $('#cfgDelayMax').value = c.delay_max;
        $('#cfgGrupos').checked = !!c.facebook.grupos;
        $('#cfgContato').value = c.facebook.contato || '';
        const opcoes = (sel, vazio) => (vazio ? '<option value="">(a padrão)</option>' : '') +
            c.categorias_facebook.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
        $('#cfgCategoriaPadrao').innerHTML = opcoes(c.facebook.categoria_padrao, false);
        const mapa = c.facebook.categorias || {};
        $('#cfgMapa').innerHTML = estado.categorias.length
            ? estado.categorias.map(cat => `<span title="${esc(cat)}">${esc(cat)}</span>
                <select data-categoria="${esc(cat)}">${opcoes(mapa[cat] || '', true)}</select>`).join('')
            : '<span class="discreto">Nenhuma categoria nos produtos com estoque.</span>';
        $('#cfgPastaLogs').textContent = c.pasta_logs;
        desenharResumoOpcoes();
    } catch (e) { aviso(e.message, 'erro'); }
}

async function salvarConfig(ev) {
    ev.preventDefault();
    const categorias = {};
    $$('#cfgMapa select').forEach(s => { if (s.value) categorias[s.dataset.categoria] = s.value; });
    try {
        await chamar('salvar_configuracoes', {
            delay_min: Number($('#cfgDelayMin').value), delay_max: Number($('#cfgDelayMax').value),
            facebook: {
                grupos: $('#cfgGrupos').checked, contato: $('#cfgContato').value,
                categoria_padrao: $('#cfgCategoriaPadrao').value, categorias,
            },
        });
        aviso('Configurações salvas.');
        carregarConfig();
    } catch (e) { aviso(e.message, 'erro'); }
}

// ---------- navegação ----------
function irPara(pag) {
    $$('.nav').forEach(b => b.classList.toggle('ativo', b.dataset.pag === pag));
    $$('.pagina').forEach(s => { s.hidden = s.id !== `pag-${pag}`; });
    if (pag === 'postar') desenharFila();
    if (pag === 'anuncios') carregarAnuncios();
    if (pag === 'config') carregarConfig();
}

// ---------- login no ERP ----------
async function entrarNoErp(ev) {
    ev && ev.preventDefault();
    const botao = $('#loginEntrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    $('#loginErro').hidden = true;
    try {
        const r = await chamar('entrar', $('#loginApi').value, $('#loginEmail').value, $('#loginSenha').value, $('#loginLembrar').checked);
        estado.usuario = r.usuario;
        $('#nomeUsuario').textContent = r.usuario.nome || '';
        $('#emailUsuario').textContent = r.usuario.email || '';
        $('#loginSenha').value = '';
        $('#telaLogin').hidden = true;
        $('#app').hidden = false;
        irPara('produtos');
        await carregarDados();
        carregarConfig();
        acompanhar();
    } catch (e) {
        $('#loginErro').textContent = e.message;
        $('#loginErro').hidden = false;
    } finally {
        botao.disabled = false;
        botao.textContent = 'Entrar';
    }
}

async function sair() {
    if (estado.rodando && !confirm('Tem uma tarefa rodando. Parar e sair?')) return;
    await chamar('sair').catch(() => null);
    clearTimeout(timerAcompanhar);
    Object.assign(estado, { produtos: [], noAr: {}, eventosLidos: 0, rodando: false, filaRodando: null, statusItens: {} });
    $('#app').hidden = true;
    $('#telaLogin').hidden = false;
    $('#loginSenha').placeholder = '';
}

// ---------- eventos da tela ----------
function ligarEventos() {
    $('#formLogin').addEventListener('submit', entrarNoErp);
    $('#botaoSair').addEventListener('click', sair);
    $$('.nav').forEach(b => b.addEventListener('click', () => irPara(b.dataset.pag)));
    $('#indicadorRodando').addEventListener('click', () => irPara('postar'));
    document.addEventListener('click', ev => {
        const ir = ev.target.closest('[data-ir]');
        if (ir) { ev.preventDefault(); irPara(ir.dataset.ir); }
    });

    $('#busca').addEventListener('input', e => { estado.busca = e.target.value; desenharProdutos(); });
    $('#filtroCategoria').addEventListener('change', e => { estado.categoria = e.target.value; desenharProdutos(); });
    $('#filtroSituacao').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        $$('#filtroSituacao .chip').forEach(c => c.classList.toggle('ativo', c === chip));
        estado.filtro = chip.dataset.filtro;
        desenharProdutos();
    });
    $('#botaoRecarregar').addEventListener('click', () => carregarDados());
    $$('[data-massa]').forEach(b => b.addEventListener('click', () => emMassa(b.dataset.massa, b.dataset.valor === '1')));
    $('#listaProdutos').addEventListener('click', e => {
        const site = e.target.closest('[data-site]');
        if (site) {
            const p = estado.produtos.find(x => x.id === Number(site.dataset.produto));
            if (p) alternarSite(p.id, site.dataset.site, !p[site.dataset.site]);
            return;
        }
        const preco = e.target.closest('[data-preco]');
        if (preco) abrirPreco(Number(preco.dataset.preco));
    });

    $('#formPreco').addEventListener('submit', e => { e.preventDefault(); salvarPreco($('#precoValor').value); });
    $('#precoVoltar').addEventListener('click', () => salvarPreco(null));
    $('#precoCancelar').addEventListener('click', () => { $('#modalPreco').hidden = true; });

    $('#republicar').addEventListener('change', desenharFila);
    $('#filaGrupos').addEventListener('click', e => {
        const b = e.target.closest('[data-tirar]');
        if (!b) return;
        estado.excluidosDaFila.add(b.dataset.tirar);
        desenharFila();
    });
    $('#botaoPostar').addEventListener('click', comecarPostagem);
    $('#botaoParar').addEventListener('click', () => chamar('parar').then(() => aviso('Parando… termina o passo atual e para.')));
    $('#modalContinuar').addEventListener('click', () => { $('#modalLogin').hidden = true; chamar('continuar'); });
    $('#modalParar').addEventListener('click', () => { $('#modalLogin').hidden = true; chamar('parar'); });

    $('#abasAnuncios').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        $$('#abasAnuncios .chip').forEach(c => c.classList.toggle('ativo', c === chip));
        estado.abaAnuncios = chip.dataset.aba;
        carregarAnuncios();
    });
    $('#botaoRemoverVendidos').addEventListener('click', () => tirarDoAr(null));
    $('#listaAnuncios').addEventListener('click', async e => {
        const abrir = e.target.closest('[data-abrir]');
        if (abrir) return chamar('abrir_link', abrir.dataset.abrir);
        const remover = e.target.closest('[data-remover]');
        if (remover) return tirarDoAr([Number(remover.dataset.remover)]);
        const marcar = e.target.closest('[data-marcar]');
        if (marcar && confirm('Marcar como removido sem abrir o site? (use se você já excluiu o anúncio por conta própria)')) {
            try { await chamar('marcar_removido', Number(marcar.dataset.marcar)); carregarAnuncios(); carregarDados(true); }
            catch (err) { aviso(err.message, 'erro'); }
        }
    });

    $$('[data-login]').forEach(b => b.addEventListener('click', async () => {
        try {
            await chamar('abrir_login', b.dataset.login);
            aviso(`Abrindo o Chrome no ${NOMES[b.dataset.login]}…`);
            acompanhar();
        } catch (e) { aviso(e.message, 'erro'); }
    }));
    $('#linkFecharChrome').addEventListener('click', e => { e.preventDefault(); chamar('fechar_navegador').then(() => aviso('Chrome do AutoPost fechado.')); });

    $('#formConfig').addEventListener('submit', salvarConfig);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { $('#modalPreco').hidden = true; }
    });
}

async function iniciar() {
    desenharIcones();
    ligarEventos();
    const r = await chamar('inicio').catch(e => ({ erro: e.message }));
    if (r.erro) { $('#loginErro').textContent = r.erro; $('#loginErro').hidden = false; return; }
    $('#versao').textContent = `versão ${r.versao}`;
    $('#loginApi').value = r.api_url;
    $('#loginEmail').value = r.email;
    $('#loginLembrar').checked = r.lembrar;
    $('#avisoChrome').hidden = r.chrome_instalado;
    if (r.tem_senha_salva) {
        $('#loginSenha').placeholder = '(senha salva neste computador)';
        entrarNoErp();
    } else {
        (r.email ? $('#loginSenha') : $('#loginEmail')).focus();
    }
}

if (window.pywebview && window.pywebview.api) iniciar();
else window.addEventListener('pywebviewready', iniciar);
