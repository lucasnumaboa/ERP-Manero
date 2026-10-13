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
    mais: '<path d="M12 5v14M5 12h14"/>',
    estrela: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
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
    achados: { pesquisas: [], itens: [], auto: {}, raios: [] },
    filtroAchados: 'novo',
    buscandoPesquisa: null,
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
        if (String(ev.chave).startsWith('site-') && estado.abaAnuncios.startsWith('site-')) carregarSite();
    } else if (ev.tipo === 'precisa_login') {
        const logo = $('#modalLogo');
        logo.className = `logo-grande ${ev.plataforma === 'facebook' ? 'logo-fb' : 'logo-olx'}`;
        logo.textContent = ev.plataforma === 'facebook' ? 'f' : 'OLX';
        $('#modalTitulo').textContent = `Entre no ${ev.rotulo}`;
        $('#modalLogin').hidden = false;
    } else if (ev.tipo === 'conta') {
        desenharConta(ev.plataforma, ev);
    } else if (ev.tipo === 'achar') {
        estado.buscandoPesquisa = ev.status === 'buscando' ? ev.pesquisa : null;
        carregarAchados();
    } else if (ev.tipo === 'lista') {
        if (estado.abaAnuncios === `site-${ev.plataforma}`) carregarSite();
    } else if (ev.tipo === 'fim') {
        $('#modalLogin').hidden = true;
        if (ev.tarefa === 'postar') {
            aviso(ev.parado ? `Postagem parada: ${ev.ok} publicado(s).` : `Postagem concluída: ${ev.ok} publicado(s), ${ev.falhas} com erro.`, ev.falhas ? 'aviso' : '');
            estado.filaRodando = null;
            estado.excluidosDaFila.clear();
        } else if (ev.tarefa === 'remover' || ev.tarefa === 'excluir') {
            aviso(`${ev.ok} anúncio(s) tirado(s) do ar${ev.falhas ? `, ${ev.falhas} com erro` : ''}.`, ev.falhas ? 'aviso' : '');
        } else if (ev.tarefa === 'listar') {
            aviso(ev.falhas ? 'Não consegui ler um dos sites; veja o registro em Postar.' : 'Anúncios dos sites lidos.', ev.falhas ? 'aviso' : '');
        } else if (ev.tarefa === 'contas') {
            carregarContas(false);
        } else if (ev.tarefa === 'achar') {
            estado.buscandoPesquisa = null;
            carregarAchados().then(() => {
                const novos = estado.achados.itens.filter(i => i.estado === 'novo' && !i.sumiu).length;
                aviso(ev.parado ? 'Busca parada.' : `Busca concluída: ${novos} anúncio(s) novo(s) na lista.`, ev.falhas ? 'aviso' : '');
            });
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
    const contagem = `${st.feitos}/${st.total}`;
    $('#textoRodando').textContent = st.aguardando_login ? 'Esperando você entrar…' : ({
        remover: `Tirando do ar ${contagem}`, excluir: `Excluindo ${contagem}`, listar: 'Lendo os sites…',
        contas: 'Conferindo os logins…', achar: `Buscando produtos ${contagem}`,
    }[st.tarefa] || `Postando ${contagem}`);
    $('#botaoMostrarChrome').hidden = !estado.rodando || st.tarefa === 'login';
    $('#botaoLerSite').disabled = estado.rodando;
    atualizarBotaoExcluirSite();
    $$('[data-conferir]').forEach(b => { b.disabled = estado.rodando; });
    $('#botaoPostar').hidden = estado.rodando && st.tarefa !== 'login';
    $('#botaoParar').hidden = !estado.rodando || st.tarefa === 'login';
    $('#botaoRemoverVendidos').disabled = estado.rodando;
    $('#botaoBuscarAchados').disabled = estado.rodando;
    $$('[data-buscar-pesq]').forEach(b => { b.disabled = estado.rodando; });
    if (estado.rodando || antes) {
        const total = st.total || 0;
        $('#numFeitos').textContent = st.feitos || 0;
        $('#numTotal').textContent = total;
        $('#numOk').textContent = st.ok || 0;
        $('#numFalhas').textContent = st.falhas || 0;
        $('#barraProgresso').style.width = total ? `${Math.round(100 * (st.feitos || 0) / total)}%` : '0';
        $('#itemAtual').innerHTML = st.atual
            ? `${{ remover: 'Tirando do ar', excluir: 'Excluindo', listar: 'Lendo', achar: 'Buscando' }[st.tarefa] || 'Publicando'} no <b>${NOMES[st.atual.plataforma]}</b>: <b>${esc(st.atual.produto)}</b>`
            : (estado.rodando ? 'Aguardando o próximo…' : (st.feitos ? 'Concluído.' : 'Parado.'));
    }
    if (antes && !estado.rodando) desenharFila();
}

// ---------- anúncios ----------
async function carregarAnuncios() {
    const lista = $('#listaAnuncios');
    const site = estado.abaAnuncios.startsWith('site-');
    $('#barraSite').hidden = !site;
    $('#botaoRemoverVendidos').hidden = site;
    if (site) return carregarSite();
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

// ---------- anúncios que estão nos sites (lidos pelo Chrome do app) ----------
function siteDaAba() { return estado.abaAnuncios.replace('site-', ''); }

function atualizarBotaoExcluirSite() {
    const marcados = $$('#listaAnuncios [data-site-item]:checked').length;
    $('#botaoExcluirSite').disabled = estado.rodando || !marcados;
    $('#botaoExcluirSite').lastChild.textContent = marcados ? `Excluir ${marcados} selecionado(s)` : 'Excluir selecionados';
}

async function carregarSite() {
    const nome = siteDaAba();
    const lista = $('#listaAnuncios');
    $('#textoLerSite').textContent = `Ler os anúncios do ${NOMES[nome]} agora`;
    $('#marcarTodosSite').checked = false;
    try {
        const r = await chamar('sites');
        const dados = (r.listas || {})[nome];
        $('#lidoEm').textContent = dados ? `Lido em ${data(dados.em)} · ${dados.itens.length} anúncio(s)` : 'Ainda não lido nesta sessão';
        if (!dados) {
            lista.innerHTML = `<div class="vazio">Clique em "Ler os anúncios do ${NOMES[nome]} agora". O Chrome do AutoPost entra no site e traz a lista para cá; daí dá para excluir por aqui.</div>`;
        } else if (!dados.itens.length) {
            lista.innerHTML = `<div class="vazio">Nenhum anúncio encontrado no ${NOMES[nome]}.</div>`;
        } else {
            lista.innerHTML = dados.itens.map((a, i) => {
                const st = estado.statusItens[`site-${nome}-${a.titulo}`];
                const situacao = { publicando: 'excluindo…', ok: 'excluído ✓', erro: 'erro' }[st] || '';
                const meta = [
                    a.status ? esc(a.status) : '',
                    a.anuncio_id ? '<span class="no-erp">registrado no ERP</span>' : '<span class="fora-erp">não registrado no ERP</span>',
                    situacao ? `<b>${situacao}</b>` : '',
                ].filter(Boolean).join(' · ');
                const foto = a.imagem
                    ? `<img src="${esc(a.imagem)}" alt="" loading="lazy">`
                    : '<div class="sem-imagem"><span data-icone="imagem"></span></div>';
                const link = a.link ? `<button class="icone-botao" data-abrir="${esc(a.link)}" title="Abrir no site"><span data-icone="link"></span></button>` : '';
                return `<label class="anuncio site ${st || ''}">
                    <input type="checkbox" data-site-item="${i}" ${st === 'ok' ? 'disabled' : ''}>
                    ${foto}
                    <div style="min-width:0"><div class="titulo" title="${esc(a.titulo)}">${esc(a.titulo)}</div><div class="meta">${meta}</div></div>
                    <div class="valor">${esc(a.preco || '')}</div>
                    <div class="acoes">${link}</div>
                </label>`;
            }).join('');
            desenharIcones(lista);
        }
    } catch (e) {
        lista.innerHTML = `<div class="vazio">Erro: ${esc(e.message)}</div>`;
    }
    atualizarBotaoExcluirSite();
}

async function lerSite() {
    try {
        await chamar('listar_sites', [siteDaAba()]);
        $('#log').innerHTML = '';
        aviso(`Lendo os anúncios do ${NOMES[siteDaAba()]}… (leva um minutinho)`);
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
}

async function excluirDoSite() {
    const nome = siteDaAba();
    const r = await chamar('sites').catch(() => ({ listas: {} }));
    const itens = (r.listas[nome] || { itens: [] }).itens;
    const escolhidos = $$('#listaAnuncios [data-site-item]:checked').map(c => itens[Number(c.dataset.siteItem)]).filter(Boolean);
    if (!escolhidos.length) return;
    if (!confirm(`Excluir ${escolhidos.length} anúncio(s) do ${NOMES[nome]}? O Chrome do AutoPost entra no site e exclui um por um (marcando "vendi por outro meio").`)) return;
    try {
        escolhidos.forEach(a => { estado.statusItens[`site-${nome}-${a.titulo}`] = 'publicando'; });
        await chamar('excluir_do_site', escolhidos.map(a => ({ plataforma: nome, titulo: a.titulo })));
        $('#log').innerHTML = '';
        carregarSite();
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
}

// ---------- acha produto ----------
async function carregarAchados() {
    try {
        estado.achados = await chamar('achados');
    } catch (e) { aviso(e.message, 'erro'); return; }
    atualizarSeloAchados();
    if (!$('#pag-achar').hidden) desenharAchados();
}

function atualizarSeloAchados() {
    const novos = estado.achados.itens.filter(i => i.estado === 'novo' && !i.sumiu).length;
    $('#seloAchados').textContent = novos;
    $('#seloAchados').hidden = !novos;
    $('#qtdNovos').textContent = novos || '';
}

function textoPesquisa(p) {
    const preco = p.preco_min != null && p.preco_max != null ? `${reais(p.preco_min)} a ${reais(p.preco_max)}`
        : p.preco_max != null ? `até ${reais(p.preco_max)}` : p.preco_min != null ? `a partir de ${reais(p.preco_min)}` : 'qualquer preço';
    const cidade = p.cidade_rotulo ? p.cidade_rotulo.split(' · ')[0] : (p.cidade || 'localização do Facebook');
    return `${esc(cidade)} · ${p.raio_km} km · ${preco}`;
}

function desenharAchados() {
    const a = estado.achados;
    $('#autoAchados').checked = !!a.auto.ligado;
    $('#horasAchados').value = a.auto.horas || 3;
    $('#proximaAchados').textContent = a.auto.ligado && a.proxima ? `Próxima busca automática: ${data(a.proxima)}` : '';
    // pesquisas
    $('#listaPesquisas').innerHTML = a.pesquisas.length ? a.pesquisas.map(p => {
        const r = p.ultimo_resultado;
        const ultima = !p.ultima_busca ? 'Ainda não buscada'
            : r && r.erro ? `<span class="erro-txt">Erro em ${data(p.ultima_busca)}: ${esc(r.erro)}</span>`
            : `Buscada em ${data(p.ultima_busca)} · ${r ? r.lidos : 0} anúncio(s) · ${r ? r.novos : 0} novo(s)`;
        const qtd = a.itens.filter(i => (i.pesquisas || []).includes(p.id) && !i.sumiu && i.estado !== 'descartado').length;
        return `<div class="pesquisa ${p.ativa ? '' : 'inativa'} ${estado.buscandoPesquisa === p.id ? 'buscando' : ''}">
            <div class="termo">${esc(p.termo)}</div>
            <div class="meta">${textoPesquisa(p)}${(p.excluir || []).length ? ` · sem: ${esc(p.excluir.join(', '))}` : ''}</div>
            <div class="meta">${estado.buscandoPesquisa === p.id ? '<b>buscando agora…</b>' : ultima}</div>
            <div class="linha-acoes">
                <span class="discreto">${qtd} na lista</span><span class="espaco"></span>
                <button class="icone-botao" data-buscar-pesq="${p.id}" title="Buscar só esta agora"><span data-icone="busca"></span></button>
                <button class="icone-botao" data-editar-pesq="${p.id}" title="Editar"><span data-icone="editar"></span></button>
                <button class="icone-botao" data-apagar-pesq="${p.id}" title="Apagar a pesquisa (e os anúncios dela que não são favoritos)"><span data-icone="lixeira"></span></button>
            </div>
        </div>`;
    }).join('') : '<div class="vazio">Nenhuma pesquisa ainda. Clique em "Nova pesquisa" (ex.: ps4, Salto, até R$ 1.200).</div>';
    // filtro por pesquisa
    const sel = $('#filtroPesquisa');
    const escolhido = sel.value;
    sel.innerHTML = '<option value="">Todas as pesquisas</option>' + a.pesquisas.map(p => `<option value="${p.id}">${esc(p.termo)}${p.cidade ? ' · ' + esc(p.cidade) : ''}</option>`).join('');
    sel.value = a.pesquisas.some(p => p.id === escolhido) ? escolhido : '';
    // itens
    let itens = a.itens.filter(i => {
        if (sel.value && !(i.pesquisas || []).includes(sel.value)) return false;
        if (estado.filtroAchados === 'todos') return i.estado !== 'descartado';
        if (estado.filtroAchados === 'novo') return i.estado === 'novo' && !i.sumiu;
        return i.estado === estado.filtroAchados;
    });
    const ordem = $('#ordemAchados').value;
    itens.sort((x, y) => ordem === 'barato' ? (x.preco ?? 1e12) - (y.preco ?? 1e12)
        : ordem === 'caro' ? (y.preco ?? -1) - (x.preco ?? -1)
        : String(y.achado_em).localeCompare(String(x.achado_em)));
    const nomePesq = Object.fromEntries(a.pesquisas.map(p => [p.id, p.termo]));
    const lista = $('#listaAchados');
    if (!a.pesquisas.length) { lista.innerHTML = ''; desenharIcones($('#pag-achar')); return; }
    lista.innerHTML = itens.length ? itens.slice(0, 500).map(i => {
        const foto = i.imagem ? `<img src="${esc(i.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="sem-imagem"><span data-icone="imagem"></span></div>';
        const tags = [
            i.estado === 'novo' && !i.sumiu ? '<span class="tag novo">novo</span>' : '',
            i.preco_baixou ? '<span class="tag baixou">baixou</span>' : '',
            i.sumiu ? '<span class="tag sumiu">sumiu do Facebook</span>' : '',
        ].join('');
        const ult = (i.historico || []).slice(-1)[0];
        const meta = [esc(i.cidade || ''), `achado em ${data(i.achado_em)}`,
            ult ? `era ${reais(ult.de)}` : '', (i.pesquisas || []).map(p => esc(nomePesq[p] || '')).filter(Boolean).join(', ')].filter(Boolean).join(' · ');
        const valor = i.preco === 0 ? 'Grátis' : i.preco != null ? reais(i.preco) : '';
        const antigo = i.preco_antigo ? `<span class="riscado">${reais(i.preco_antigo)}</span>` : '';
        return `<div class="anuncio achado ${i.estado} ${i.sumiu ? 'sumiu' : ''}">
            ${foto}
            <div style="min-width:0"><div class="titulo" data-abrir-achado="${i.id}" title="Abrir no Facebook">${tags}${esc(i.titulo)}</div><div class="meta">${meta}</div></div>
            <div class="valor">${antigo}${valor}</div>
            <div class="acoes">
                <button class="icone-botao" data-abrir-achado="${i.id}" title="Abrir no Facebook"><span data-icone="link"></span></button>
                <button class="icone-botao ${i.estado === 'favorito' ? 'ligado' : ''}" data-marcar="${i.id}" data-estado="${i.estado === 'favorito' ? 'visto' : 'favorito'}" title="${i.estado === 'favorito' ? 'Tirar dos favoritos' : 'Favoritar'}"><span data-icone="estrela"></span></button>
                ${i.estado === 'descartado'
                    ? `<button class="icone-botao" data-marcar="${i.id}" data-estado="visto" title="Voltar para a lista"><span data-icone="olho"></span></button>`
                    : `<button class="icone-botao" data-marcar="${i.id}" data-estado="descartado" title="Descartar (não mostrar mais)"><span data-icone="fechar"></span></button>`}
            </div>
        </div>`;
    }).join('') : `<div class="vazio">${estado.filtroAchados === 'novo' ? 'Nenhum anúncio novo. Clique em "Buscar agora" ou espere a busca automática.' : 'Nada aqui.'}</div>`;
    desenharIcones($('#pag-achar'));
}

function abrirPesquisa(id) {
    const p = estado.achados.pesquisas.find(x => x.id === id) || { raio_km: 10, ativa: true };
    $('#tituloPesquisa').textContent = id ? 'Editar pesquisa' : 'Nova pesquisa';
    $('#pesqId').value = id || '';
    $('#pesqTermo').value = p.termo || '';
    $('#pesqCidade').value = p.cidade || '';
    $('#pesqRaio').innerHTML = (estado.achados.raios || [10]).map(r => `<option value="${r}">${r} km</option>`).join('');
    $('#pesqRaio').value = p.raio_km || 10;
    $('#pesqMin').value = p.preco_min ?? '';
    $('#pesqMax').value = p.preco_max ?? '';
    $('#pesqExcluir').value = (p.excluir || []).join(', ');
    $('#pesqAtiva').checked = p.ativa !== false;
    $('#pesqGratis').checked = p.ignorar_gratis !== false;
    $('#modalPesquisa').hidden = false;
    $('#pesqTermo').focus();
}

async function salvarPesquisa(ev) {
    ev.preventDefault();
    try {
        await chamar('salvar_pesquisa', {
            id: $('#pesqId').value || null, termo: $('#pesqTermo').value, cidade: $('#pesqCidade').value,
            raio_km: Number($('#pesqRaio').value), preco_min: $('#pesqMin').value, preco_max: $('#pesqMax').value,
            excluir: $('#pesqExcluir').value, ativa: $('#pesqAtiva').checked, ignorar_gratis: $('#pesqGratis').checked,
        });
        $('#modalPesquisa').hidden = true;
        aviso('Pesquisa salva.');
        carregarAchados();
    } catch (e) { aviso(e.message, 'erro'); }
}

async function buscarAchados(ids) {
    try {
        await chamar('buscar_achados', ids || null);
        $('#log').innerHTML = '';
        aviso('Buscando no Facebook… (o andamento aparece em Postar)');
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
}

async function marcarAchados(ids, novo) {
    try {
        await chamar('marcar_achados', ids, novo);
        ids.forEach(id => { const i = estado.achados.itens.find(x => x.id === id); if (i) { i.estado = novo; if (novo !== 'novo') i.preco_baixou = false; } });
        atualizarSeloAchados();
        desenharAchados();
    } catch (e) { aviso(e.message, 'erro'); }
}

// ---------- contas: status de login ----------
function desenharConta(nome, info) {
    const el = $(nome === 'facebook' ? '#statusFacebook' : '#statusOlx');
    if (!el) return;
    el.className = `conta-status ${info && !info.conferindo ? (info.logado ? 'logado' : 'deslogado') : ''}`;
    el.lastChild.textContent = !info ? 'Ainda não conferido'
        : info.conferindo ? 'Conferindo…'
            : `${info.logado ? 'Logado' : 'Não está logado'} · conferido em ${data(info.em)}`;
}

async function carregarContas(conferirSePreciso = true) {
    try {
        const r = await chamar('contas');
        ['facebook', 'olx'].forEach(n => desenharConta(n, r.contas[n]));
        const velho = n => !r.contas[n] || (Date.now() - new Date(r.contas[n].em)) > 2 * 3600 * 1000;
        if (conferirSePreciso && !r.ocupado && (velho('facebook') || velho('olx'))) conferirContas();
    } catch (e) { aviso(e.message, 'erro'); }
}

async function conferirContas() {
    try {
        await chamar('conferir_contas');
        ['facebook', 'olx'].forEach(n => desenharConta(n, { conferindo: true }));
        acompanhar();
    } catch (e) { aviso(e.message, 'erro'); }
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
        $('#cfgEscondido').checked = c.navegador_escondido !== false;
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
            navegador_escondido: $('#cfgEscondido').checked,
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
    if (pag === 'contas') carregarContas();
    if (pag === 'achar') carregarAchados();
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
        carregarAchados();
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
    $('#botaoLerSite').addEventListener('click', lerSite);
    $('#botaoExcluirSite').addEventListener('click', excluirDoSite);
    $('#marcarTodosSite').addEventListener('change', e => {
        $$('#listaAnuncios [data-site-item]:not(:disabled)').forEach(c => { c.checked = e.target.checked; });
        atualizarBotaoExcluirSite();
    });
    $('#listaAnuncios').addEventListener('change', e => { if (e.target.matches('[data-site-item]')) atualizarBotaoExcluirSite(); });
    $('#botaoMostrarChrome').addEventListener('click', () => chamar('mostrar_navegador').catch(e => aviso(e.message, 'erro')));
    $$('[data-conferir]').forEach(b => b.addEventListener('click', conferirContas));
    $('#listaAnuncios').addEventListener('click', async e => {
        const abrir = e.target.closest('[data-abrir]');
        if (abrir) { e.preventDefault(); return chamar('abrir_link', abrir.dataset.abrir); }
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
    $('#botaoNovaPesquisa').addEventListener('click', () => abrirPesquisa(null));
    $('#botaoBuscarAchados').addEventListener('click', () => buscarAchados(null));
    $('#formPesquisa').addEventListener('submit', salvarPesquisa);
    $('#pesqCancelar').addEventListener('click', () => { $('#modalPesquisa').hidden = true; });
    $('#filtroAchados').addEventListener('click', e => {
        const b = e.target.closest('[data-filtro]');
        if (!b) return;
        estado.filtroAchados = b.dataset.filtro;
        $$('#filtroAchados .chip').forEach(c => c.classList.toggle('ativo', c === b));
        desenharAchados();
    });
    $('#filtroPesquisa').addEventListener('change', desenharAchados);
    $('#ordemAchados').addEventListener('change', desenharAchados);
    const salvarAuto = () => chamar('salvar_auto_achados', $('#autoAchados').checked, Number($('#horasAchados').value || 3))
        .then(carregarAchados).catch(e => aviso(e.message, 'erro'));
    $('#autoAchados').addEventListener('change', salvarAuto);
    $('#horasAchados').addEventListener('change', salvarAuto);
    $('#botaoVerTodosNovos').addEventListener('click', () => {
        const ids = estado.achados.itens.filter(i => i.estado === 'novo').map(i => i.id);
        if (ids.length) marcarAchados(ids, 'visto');
    });
    $('#botaoLimparAchados').addEventListener('click', async () => {
        if (!confirm('Apagar da lista os descartados e os que sumiram do Facebook? Os favoritos ficam.')) return;
        const r = await chamar('limpar_achados').catch(e => { aviso(e.message, 'erro'); return null; });
        if (r) { aviso(`${r.apagados} anúncio(s) apagado(s) da lista.`); carregarAchados(); }
    });
    $('#listaPesquisas').addEventListener('click', async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.buscarPesq) buscarAchados([b.dataset.buscarPesq]);
        else if (b.dataset.editarPesq) abrirPesquisa(b.dataset.editarPesq);
        else if (b.dataset.apagarPesq) {
            const p = estado.achados.pesquisas.find(x => x.id === b.dataset.apagarPesq);
            if (!p || !confirm(`Apagar a pesquisa "${p.termo}"? Os anúncios dela saem da lista (menos os favoritos).`)) return;
            try { await chamar('remover_pesquisa', p.id); carregarAchados(); } catch (err) { aviso(err.message, 'erro'); }
        }
    });
    $('#listaAchados').addEventListener('click', e => {
        const abrir = e.target.closest('[data-abrir-achado]');
        if (abrir) {
            const i = estado.achados.itens.find(x => x.id === abrir.dataset.abrirAchado);
            if (i) {
                chamar('abrir_link', i.link);
                if (i.estado === 'novo') marcarAchados([i.id], 'visto');
            }
            return;
        }
        const m = e.target.closest('[data-marcar]');
        if (m) marcarAchados([m.dataset.marcar], m.dataset.estado);
    });
    setInterval(() => { if (estado.usuario) carregarAchados(); }, 60000);
    $('#linkFecharChrome').addEventListener('click', e => { e.preventDefault(); chamar('fechar_navegador').then(() => aviso('Chrome do AutoPost fechado.')); });

    $('#formConfig').addEventListener('submit', salvarConfig);
    $('#atualizacaoAgora').addEventListener('click', atualizarAgora);
    $('#atualizacaoDepois').addEventListener('click', () => { $('#modalAtualizacao').hidden = true; });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { $('#modalPreco').hidden = true; }
    });
}

// ---------- atualização do próprio AutoPost ----------
const CONFERIR_ATUALIZACAO = 2 * 60 * 60 * 1000;   // além de ao abrir, confere de 2 em 2 horas

async function verificarAtualizacao() {
    if (!$('#modalAtualizacao').hidden) return;
    const r = await api().verificar_atualizacao().catch(() => null);
    if (!r || r.erro || !r.nova) return;
    $('#atualizacaoAtual').textContent = `versão ${r.atual}`;
    $('#atualizacaoNova').textContent = r.nova.versao ? `versão ${r.nova.versao}` : 'versão nova';
    $('#atualizacaoNovidades').textContent = r.nova.alteracoes;
    $('#atualizacaoSituacao').textContent = '';
    $('#atualizacaoBarra').hidden = true;
    $('#atualizacaoAgora').disabled = $('#atualizacaoDepois').disabled = false;
    $('#modalAtualizacao').hidden = false;
}

async function atualizarAgora() {
    const situacao = $('#atualizacaoSituacao');
    try { await chamar('atualizar'); } catch (e) { situacao.textContent = e.message; return; }
    $('#atualizacaoAgora').disabled = $('#atualizacaoDepois').disabled = true;
    $('#atualizacaoBarra').hidden = false;
    const acompanharDownload = async () => {
        const p = await chamar('progresso_atualizacao').catch(e => ({ etapa: 'erro', erro: e.message }));
        if (p.etapa === 'baixando') {
            const pct = p.total ? Math.min(100, Math.round(p.baixado / p.total * 100)) : 0;
            $('#atualizacaoBarra div').style.width = `${pct}%`;
            situacao.textContent = `Baixando… ${pct}%`;
            setTimeout(acompanharDownload, 500);
            return;
        }
        if (p.etapa === 'pronto') {
            $('#atualizacaoBarra div').style.width = '100%';
            situacao.textContent = 'Pronto. Abrindo a versão nova…';
            chamar('abrir_versao_nova').catch(e => { situacao.textContent = e.message; });
            return;
        }
        situacao.textContent = p.erro || 'Não deu para atualizar.';
        $('#atualizacaoAgora').disabled = $('#atualizacaoDepois').disabled = false;
    };
    acompanharDownload();
}

async function iniciar() {
    desenharIcones();
    ligarEventos();
    const r = await chamar('inicio').catch(e => ({ erro: e.message }));
    if (r.erro) { $('#loginErro').textContent = r.erro; $('#loginErro').hidden = false; return; }
    $('#versao').textContent = `versão ${r.versao}`;
    verificarAtualizacao();
    setInterval(verificarAtualizacao, CONFERIR_ATUALIZACAO);
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
