/**
 * orcamentos.js
 * Lógica completa do módulo de Orçamentos
 * Usa fetchWithAuth / getAuthHeader do auth.js (chaves: erp_token, erp_user_data)
 */

// Estado global
let regras = { preco_por_km: 0, periodos: [], produtos_config: [], campos: [], descontos: [] };
let produtosDisponiveis = [];
let produtosSelecionados = []; // [{ produto, quantidade }]
let ultimoCalculo = null;
let isAdmin = false;
let apiUrl = '';

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Obtém URL da API
        apiUrl = await getApiUrl();

        // Verifica nível de acesso via dados em cache
        const user = getUserData();
        if (user && user.nivel_acesso === 'admin') {
            isAdmin = true;
        }

        // Mostra aba de configurações apenas para admin
        if (isAdmin) {
            document.getElementById('tabConfigBtn').style.display = 'flex';
        }

        // Carrega regras de negócio para uso no cálculo
        await carregarRegras();

        // Renderiza campos livres dinâmicos no formulário
        renderCamposLivresDinamicos();

    } catch (e) {
        console.error('Erro ao inicializar:', e);
    }
});

// ============================================================
// TABS
// ============================================================

function switchTab(tab) {
    document.querySelectorAll('.orc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.orc-tab-pane').forEach(p => p.classList.remove('active'));

    document.getElementById(`tab${capitalize(tab)}Btn`).classList.add('active');
    document.getElementById(`tab${capitalize(tab)}`).classList.add('active');

    if (tab === 'config' && isAdmin) carregarDadosConfig();
    if (tab === 'historico') carregarHistorico();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
// API HELPER (usa fetchWithAuth do auth.js)
// ============================================================

async function orcFetch(endpoint, options = {}) {
    const url = `${apiUrl}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeader()
    };

    const resp = await fetch(url, { ...options, headers });

    if (resp.status === 401) {
        showSessionExpiredModal();
        throw new Error('Não autorizado');
    }
    if (resp.status === 204) return null;
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
}

// ============================================================
// REGRAS
// ============================================================

async function carregarRegras() {
    try {
        regras = await orcFetch('/api/orcamentos/regras');
    } catch (e) {
        console.warn('Não foi possível carregar regras:', e);
    }
}

async function carregarDadosConfig() {
    await carregarRegras();
    document.getElementById('precoPorKm').value = regras.preco_por_km || 0;
    renderPeriodosTable();
    renderConfigProdutosTable();
    renderCamposTable();
    renderDescontosTable();
}

// ============================================================
// PRECO POR KM
// ============================================================

async function salvarPrecoPorKm() {
    const valor = parseFloat(document.getElementById('precoPorKm').value);
    if (isNaN(valor) || valor < 0) { alert('Valor inválido'); return; }
    try {
        await orcFetch('/api/orcamentos/config', {
            method: 'PUT',
            body: JSON.stringify({ preco_por_km: valor })
        });
        regras.preco_por_km = valor;
        showToast('Preço por KM salvo!', 'success');
    } catch (e) {
        showToast('Erro ao salvar: ' + (e.message || e), 'error');
    }
}

// ============================================================
// PERÍODOS
// ============================================================

async function adicionarPeriodo() {
    const nome = document.getElementById('periodoNome').value.trim();
    const data_inicio = document.getElementById('periodoDataInicio').value;
    const data_fim = document.getElementById('periodoDataFim').value;
    const hora_inicio = document.getElementById('periodoHoraInicio').value + ':00';
    const hora_fim = document.getElementById('periodoHoraFim').value + ':59';
    const valor_adicional = parseFloat(document.getElementById('periodoValor').value || 0);

    if (!nome || !data_inicio || !data_fim) { alert('Preencha nome, data início e data fim'); return; }

    try {
        const resp = await orcFetch('/api/orcamentos/config/periodos', {
            method: 'POST',
            body: JSON.stringify({ nome, data_inicio, data_fim, hora_inicio, hora_fim, valor_adicional })
        });
        regras.periodos.push(resp);
        renderPeriodosTable();
        ['periodoNome', 'periodoDataInicio', 'periodoDataFim', 'periodoValor'].forEach(id =>
            document.getElementById(id).value = '');
        showToast('Período adicionado!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

async function excluirPeriodo(id) {
    if (!confirm('Excluir este período?')) return;
    try {
        await orcFetch(`/api/orcamentos/config/periodos/${id}`, { method: 'DELETE' });
        regras.periodos = regras.periodos.filter(p => p.id !== id);
        renderPeriodosTable();
        showToast('Período excluído!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

function renderPeriodosTable() {
    const tbody = document.getElementById('periodosTableBody');
    if (!regras.periodos || regras.periodos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum período cadastrado</td></tr>';
        return;
    }
    tbody.innerHTML = regras.periodos.map(p => `
        <tr>
            <td>${p.nome}</td>
            <td>${formatDate(p.data_inicio)}</td>
            <td>${formatDate(p.data_fim)}</td>
            <td>${String(p.hora_inicio).substring(0, 5)} – ${String(p.hora_fim).substring(0, 5)}</td>
            <td><strong style="color:var(--accent-primary,#64ffda);">+ R$ ${parseFloat(p.valor_adicional).toFixed(2)}</strong></td>
            <td><span class="badge-status ${p.ativo ? 'badge-aberto' : 'badge-recusado'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-danger btn-sm" onclick="excluirPeriodo(${p.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// PRODUTOS CONFIG (estilos de orçamento)
// ============================================================

async function adicionarConfigProduto() {
    const nome = document.getElementById('cpNome').value.trim();
    const valor = parseFloat(document.getElementById('cpValor').value || 0);
    if (!nome) { alert('Informe o nome do produto/estilo'); return; }

    try {
        const resp = await orcFetch('/api/orcamentos/config/produtos-config', {
            method: 'POST',
            body: JSON.stringify({ nome, valor })
        });
        regras.produtos_config.push(resp);
        renderConfigProdutosTable();
        document.getElementById('cpNome').value = '';
        document.getElementById('cpValor').value = '';
        showToast('Produto/Estilo adicionado!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

async function excluirConfigProduto(id) {
    if (!confirm('Excluir este produto/estilo?')) return;
    try {
        await orcFetch(`/api/orcamentos/config/produtos-config/${id}`, { method: 'DELETE' });
        regras.produtos_config = regras.produtos_config.filter(p => p.id !== id);
        renderConfigProdutosTable();
        showToast('Excluído!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

function renderConfigProdutosTable() {
    const tbody = document.getElementById('configProdutosTableBody');
    if (!regras.produtos_config || regras.produtos_config.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum produto/estilo cadastrado</td></tr>';
        return;
    }
    tbody.innerHTML = regras.produtos_config.map(p => `
        <tr>
            <td>${p.nome}</td>
            <td><strong style="color:var(--accent-primary,#64ffda);">R$ ${parseFloat(p.valor).toFixed(2)}</strong></td>
            <td><span class="badge-status ${p.ativo ? 'badge-aberto' : 'badge-recusado'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-danger btn-sm" onclick="excluirConfigProduto(${p.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// CAMPOS LIVRES
// ============================================================

function toggleOpcoesCampo() {
    const tipo = document.getElementById('campoTipo').value;
    document.getElementById('campoOpcoesGroup').style.display = tipo === 'opcoes' ? 'flex' : 'none';
}

async function adicionarCampo() {
    const rotulo = document.getElementById('campoRotulo').value.trim();
    const tipo = document.getElementById('campoTipo').value;
    const opcoes = document.getElementById('campoOpcoes').value.trim() || null;
    const ordem = parseInt(document.getElementById('campoOrdem').value || 0);
    const obrigatorio = document.getElementById('campoObrigatorio').checked;

    if (!rotulo) { alert('Informe o rótulo do campo'); return; }

    try {
        const resp = await orcFetch('/api/orcamentos/config/campos', {
            method: 'POST',
            body: JSON.stringify({ rotulo, tipo, opcoes, ordem, obrigatorio })
        });
        regras.campos.push(resp);
        renderCamposTable();
        renderCamposLivresDinamicos();
        document.getElementById('campoRotulo').value = '';
        document.getElementById('campoOpcoes').value = '';
        showToast('Campo adicionado!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

async function excluirCampo(id) {
    if (!confirm('Excluir este campo?')) return;
    try {
        await orcFetch(`/api/orcamentos/config/campos/${id}`, { method: 'DELETE' });
        regras.campos = regras.campos.filter(c => c.id !== id);
        renderCamposTable();
        renderCamposLivresDinamicos();
        showToast('Campo excluído!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

function renderCamposTable() {
    const tbody = document.getElementById('camposTableBody');
    if (!regras.campos || regras.campos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum campo cadastrado</td></tr>';
        return;
    }
    tbody.innerHTML = regras.campos.map(c => `
        <tr>
            <td>${c.rotulo}${c.obrigatorio ? ' <span style="color:#ff6b6b;">*</span>' : ''}</td>
            <td>${c.tipo}</td>
            <td>${c.opcoes || '-'}</td>
            <td>${c.ordem}</td>
            <td>
                <button class="btn-danger btn-sm" onclick="excluirCampo(${c.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderCamposLivresDinamicos() {
    const campos = (regras.campos || []).filter(c => c.ativo);
    const section = document.getElementById('camposLivresSection');
    const container = document.getElementById('camposLivresDinamicos');

    if (campos.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    container.innerHTML = campos.map(c => {
        const id = `campo_livre_${c.id}`;
        let input = '';
        if (c.tipo === 'texto') {
            input = `<input type="text" id="${id}" class="campo-livre" placeholder="${c.rotulo}">`;
        } else if (c.tipo === 'numero') {
            input = `<input type="number" id="${id}" step="0.01" class="campo-livre" placeholder="0">`;
        } else if (c.tipo === 'opcoes') {
            const opts = (c.opcoes || '').split(',').map(o =>
                `<option value="${o.trim()}">${o.trim()}</option>`).join('');
            input = `<select id="${id}" class="campo-livre"><option value="">Selecione...</option>${opts}</select>`;
        }
        return `<div class="form-group">
            <label>${c.rotulo}${c.obrigatorio ? ' <span style="color:#ff6b6b;">*</span>' : ''}</label>
            ${input}
        </div>`;
    }).join('');
}

// ============================================================
// DESCONTOS
// ============================================================

async function adicionarDesconto() {
    const quantidade_minima = parseInt(document.getElementById('descontoQtd').value);
    const percentual_desconto = parseFloat(document.getElementById('descontoPct').value);
    const descricao = document.getElementById('descontoDesc').value.trim() || null;

    if (!quantidade_minima || !percentual_desconto) {
        alert('Informe quantidade mínima e percentual de desconto'); return;
    }

    try {
        const resp = await orcFetch('/api/orcamentos/config/descontos', {
            method: 'POST',
            body: JSON.stringify({ quantidade_minima, percentual_desconto, descricao })
        });
        regras.descontos.push(resp);
        renderDescontosTable();
        document.getElementById('descontoQtd').value = '';
        document.getElementById('descontoPct').value = '';
        document.getElementById('descontoDesc').value = '';
        showToast('Regra de desconto adicionada!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

async function excluirDesconto(id) {
    if (!confirm('Excluir esta regra?')) return;
    try {
        await orcFetch(`/api/orcamentos/config/descontos/${id}`, { method: 'DELETE' });
        regras.descontos = regras.descontos.filter(d => d.id !== id);
        renderDescontosTable();
        showToast('Desconto excluído!', 'success');
    } catch (e) { showToast('Erro: ' + (e.message || e), 'error'); }
}

function renderDescontosTable() {
    const tbody = document.getElementById('descontosTableBody');
    if (!regras.descontos || regras.descontos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma regra cadastrada</td></tr>';
        return;
    }
    tbody.innerHTML = [...regras.descontos]
        .sort((a, b) => a.quantidade_minima - b.quantidade_minima)
        .map(d => `
        <tr>
            <td>${d.quantidade_minima} un.</td>
            <td><strong style="color:var(--accent-primary,#64ffda);">${parseFloat(d.percentual_desconto).toFixed(2)}%</strong></td>
            <td>${d.descricao || '-'}</td>
            <td>
                <button class="btn-danger btn-sm" onclick="excluirDesconto(${d.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// TIPO DE ENTREGA
// ============================================================

function onChangeTipoEntrega(tipo) {
    document.getElementById('radioRetira').classList.toggle('selected', tipo === 'retira');
    document.getElementById('radioEntrega').classList.toggle('selected', tipo === 'entrega');
    document.getElementById('kmGroup').style.display = tipo === 'entrega' ? 'block' : 'none';
    // Limpa cálculo anterior ao mudar tipo
    document.getElementById('calcuoResultado').classList.remove('visible');
    ultimoCalculo = null;
}

// ============================================================
// MODAL DE PRODUTOS (mesmo padrão do vendas.html: tabela com busca)
// ============================================================

async function abrirModalProdutos() {
    document.getElementById('modalProdutos').style.display = 'flex';
    document.getElementById('searchProdutosInput').value = '';
    document.getElementById('tabelaProdutosBody').innerHTML =
        '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        if (produtosDisponiveis.length === 0) {
            produtosDisponiveis = await orcFetch('/api/orcamentos/produtos-disponiveis');
        }
        renderTabelaProdutos(produtosDisponiveis);
    } catch (e) {
        document.getElementById('tabelaProdutosBody').innerHTML =
            `<tr><td colspan="5" class="text-center">Erro: ${e.message}</td></tr>`;
    }
}

function fecharModalProdutos() {
    document.getElementById('modalProdutos').style.display = 'none';
}

function filtrarProdutosModal() {
    const q = document.getElementById('searchProdutosInput').value.toLowerCase();
    const filtrados = produtosDisponiveis.filter(p =>
        p.nome.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q)
    );
    renderTabelaProdutos(filtrados);
}

function renderTabelaProdutos(lista) {
    const tbody = document.getElementById('tabelaProdutosBody');
    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum produto encontrado</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(p => {
        const jaSelecionado = produtosSelecionados.some(s => s.produto.id === p.id);
        return `
        <tr class="${jaSelecionado ? 'produto-ja-selecionado' : ''}" onclick="selecionarProdutoModal(${p.id})" style="cursor:pointer;">
            <td>
                ${jaSelecionado
                ? '<i class="fas fa-check-circle" style="color:var(--accent-primary,#64ffda);"></i>'
                : '<i class="far fa-circle" style="color:var(--text-muted,#8892b0);"></i>'}
            </td>
            <td><strong>${p.nome}</strong></td>
            <td><span style="color:var(--text-secondary,#a8b2d1);">${p.codigo || '-'}</span></td>
            <td><strong style="color:var(--accent-primary,#64ffda);">R$ ${parseFloat(p.preco_venda).toFixed(2)}</strong></td>
            <td>
                <span class="badge-status ${p.estoque_atual > 0 ? 'badge-aberto' : 'badge-recusado'}">
                    ${p.estoque_atual} un.
                </span>
            </td>
        </tr>`;
    }).join('');
}

function selecionarProdutoModal(id) {
    const prod = produtosDisponiveis.find(p => p.id === id);
    if (!prod) return;

    const jaSelecionado = produtosSelecionados.some(s => s.produto.id === id);
    if (jaSelecionado) {
        // Remove se já estava na lista
        produtosSelecionados = produtosSelecionados.filter(s => s.produto.id !== id);
        showToast(`"${prod.nome}" removido`, 'info');
    } else {
        produtosSelecionados.push({ produto: prod, quantidade: 1 });
        showToast(`"${prod.nome}" adicionado`, 'success');
    }

    // Atualiza visual da tabela modal
    filtrarProdutosModal();

    // Atualiza lista de selecionados no formulário principal
    renderProdutosSelecionados();

    // Limpa cálculo anterior
    document.getElementById('calcuoResultado').classList.remove('visible');
    ultimoCalculo = null;
}

function renderProdutosSelecionados() {
    const container = document.getElementById('produtosSelecionadosList');
    if (produtosSelecionados.length === 0) {
        container.innerHTML =
            '<p style="color:var(--text-muted,#8892b0);margin-top:12px;font-size:14px;">' +
            '<i class="fas fa-info-circle"></i> Nenhum produto selecionado. Clique em "Selecionar Produto" para adicionar.</p>';
        return;
    }
    container.innerHTML = produtosSelecionados.map((sel, idx) => `
        <div class="produto-selecionado-item">
            <div class="nome">
                <strong>${sel.produto.nome}</strong>
                <span style="color:var(--text-muted,#8892b0);font-size:12px;margin-left:8px;">
                    R$ ${parseFloat(sel.produto.preco_venda).toFixed(2)}/un.
                </span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="font-size:12px;color:var(--text-secondary,#a8b2d1);">Qtd:</label>
                <input type="number" class="qtd-input" value="${sel.quantidade}" min="1"
                       max="${sel.produto.estoque_atual}"
                       onchange="atualizarQtdSelecionado(${idx}, this.value)"
                       oninput="atualizarQtdSelecionado(${idx}, this.value)">
            </div>
            <span class="preco">R$ ${(parseFloat(sel.produto.preco_venda) * sel.quantidade).toFixed(2)}</span>
            <button class="btn-remover-item" onclick="removerSelecionado(${idx})" title="Remover">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function atualizarQtdSelecionado(idx, val) {
    const qtd = Math.max(1, parseInt(val) || 1);
    produtosSelecionados[idx].quantidade = qtd;
    renderProdutosSelecionados();
    document.getElementById('calcuoResultado').classList.remove('visible');
    ultimoCalculo = null;
}

function removerSelecionado(idx) {
    produtosSelecionados.splice(idx, 1);
    renderProdutosSelecionados();
    // Atualiza modal se estiver aberto
    if (document.getElementById('modalProdutos').style.display === 'flex') {
        filtrarProdutosModal();
    }
    document.getElementById('calcuoResultado').classList.remove('visible');
    ultimoCalculo = null;
}

// ============================================================
// CÁLCULO DO ORÇAMENTO (client-side)
// ============================================================

function calcularOrcamento() {
    if (produtosSelecionados.length === 0) {
        alert('Selecione pelo menos um produto para calcular o orçamento.');
        return;
    }

    const tipoEntrega = document.querySelector('input[name="tipoEntrega"]:checked').value;
    const kmEntrega = tipoEntrega === 'entrega'
        ? parseFloat(document.getElementById('kmEntrega').value || 0) : 0;

    if (tipoEntrega === 'entrega' && kmEntrega <= 0) {
        alert('Informe a distância em KM para a entrega.');
        return;
    }

    const precoPorKm = parseFloat(regras.preco_por_km) || 0;
    const agora = new Date();

    // Subtotal dos produtos
    let valorProdutos = 0;
    let totalQtd = 0;
    produtosSelecionados.forEach(sel => {
        valorProdutos += parseFloat(sel.produto.preco_venda) * sel.quantidade;
        totalQtd += sel.quantidade;
    });
    valorProdutos = Math.round(valorProdutos * 100) / 100;

    // Período ativo agora?
    let periodoAtivo = null;
    let valorAdicionalPeriodo = 0;
    (regras.periodos || []).filter(p => p.ativo).forEach(p => {
        const di = new Date(p.data_inicio + 'T00:00:00');
        const df = new Date(p.data_fim + 'T23:59:59');
        if (agora < di || agora > df) return;
        const horaAtual = agora.toTimeString().substring(0, 8);
        const hi = String(p.hora_inicio).substring(0, 8);
        const hf = String(p.hora_fim).substring(0, 8);
        if (horaAtual >= hi && horaAtual <= hf) {
            periodoAtivo = p;
            valorAdicionalPeriodo = parseFloat(p.valor_adicional);
        }
    });

    // Custo de entrega
    const valorKm = tipoEntrega === 'entrega'
        ? Math.round(kmEntrega * precoPorKm * 100) / 100 : 0;

    // Desconto por quantidade (maior faixa aplicável)
    let descontoPercentual = 0;
    const descontosAtivos = [...(regras.descontos || [])]
        .filter(d => d.ativo)
        .sort((a, b) => b.quantidade_minima - a.quantidade_minima);

    for (const d of descontosAtivos) {
        if (totalQtd >= d.quantidade_minima) {
            descontoPercentual = parseFloat(d.percentual_desconto);
            break;
        }
    }
    const descontoAplicado = Math.round(valorProdutos * descontoPercentual / 100 * 100) / 100;
    const valorTotal = Math.round(
        (valorProdutos - descontoAplicado + valorAdicionalPeriodo + valorKm) * 100) / 100;

    // Renderiza breakdown
    let linhasHTML = `
        <div class="calculo-linha destaque">
            <span><i class="fas fa-box"></i> Subtotal dos produtos (${totalQtd} un.)</span>
            <span>R$ ${valorProdutos.toFixed(2)}</span>
        </div>`;

    if (descontoAplicado > 0) {
        linhasHTML += `
        <div class="calculo-linha desconto">
            <span><i class="fas fa-percent"></i> Desconto por quantidade (${descontoPercentual}%)</span>
            <span>– R$ ${descontoAplicado.toFixed(2)}</span>
        </div>`;
    }

    if (valorAdicionalPeriodo > 0) {
        linhasHTML += `
        <div class="calculo-linha adicional">
            <span><i class="fas fa-calendar-alt"></i> Adicional – Período "${periodoAtivo.nome}"</span>
            <span>+ R$ ${valorAdicionalPeriodo.toFixed(2)}</span>
        </div>`;
    }

    if (valorKm > 0) {
        linhasHTML += `
        <div class="calculo-linha entrega">
            <span><i class="fas fa-truck"></i> Entrega: ${kmEntrega} km × R$ ${precoPorKm.toFixed(2)}/km</span>
            <span>+ R$ ${valorKm.toFixed(2)}</span>
        </div>`;
    }

    document.getElementById('calcuoLinhas').innerHTML = linhasHTML;
    document.getElementById('calcuoTotalVal').textContent = `R$ ${valorTotal.toFixed(2)}`;
    document.getElementById('calcuoResultado').classList.add('visible');

    ultimoCalculo = {
        tipoEntrega, kmEntrega, valorProdutos,
        descontoPercentual, descontoAplicado,
        periodoAtivo, valorAdicionalPeriodo,
        valorKm, valorTotal, totalQtd
    };
}

// ============================================================
// SALVAR ORÇAMENTO
// ============================================================

async function salvarOrcamento() {
    if (!ultimoCalculo) { alert('Calcule o orçamento primeiro.'); return; }

    const btn = document.getElementById('btnSalvarOrcamento');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const camposLivres = {};
        (regras.campos || []).filter(c => c.ativo).forEach(c => {
            const el = document.getElementById(`campo_livre_${c.id}`);
            if (el && el.value) camposLivres[c.rotulo] = el.value;
        });

        const itens = produtosSelecionados.map(sel => ({
            produto_id: sel.produto.id,
            nome_produto: sel.produto.nome,
            quantidade: sel.quantidade,
            preco_unitario: parseFloat(sel.produto.preco_venda)
        }));

        const payload = {
            tipo_entrega: ultimoCalculo.tipoEntrega,
            km_entrega: ultimoCalculo.kmEntrega,
            itens,
            campos_livres: Object.keys(camposLivres).length > 0 ? camposLivres : null,
            observacoes: document.getElementById('orcObservacoes').value || null
        };

        const result = await orcFetch('/api/orcamentos/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        showToast(`Orçamento ${result.codigo} salvo com sucesso!`, 'success');
        resetFormOrcamento();

    } catch (e) {
        showToast('Erro ao salvar: ' + (e.message || e), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Orçamento';
    }
}

function resetFormOrcamento() {
    produtosSelecionados = [];
    ultimoCalculo = null;
    renderProdutosSelecionados();
    document.getElementById('calcuoResultado').classList.remove('visible');
    document.getElementById('orcObservacoes').value = '';
    document.getElementById('kmEntrega').value = '';
    document.querySelector('input[name="tipoEntrega"][value="retira"]').checked = true;
    onChangeTipoEntrega('retira');
    // Reseta campos livres
    document.querySelectorAll('.campo-livre').forEach(el => el.value = '');
}

// ============================================================
// HISTÓRICO
// ============================================================

async function carregarHistorico() {
    const tbody = document.getElementById('historicoTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    try {
        const lista = await orcFetch('/api/orcamentos/');
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum orçamento encontrado</td></tr>';
            return;
        }
        tbody.innerHTML = lista.map(o => `
            <tr>
                <td><strong style="color:var(--accent-primary,#64ffda);">${o.codigo}</strong></td>
                <td>${o.vendedor_nome || '-'}</td>
                <td>${o.tipo_entrega === 'entrega'
                ? `<i class="fas fa-truck"></i> Entrega (${o.km_entrega} km)`
                : '<i class="fas fa-store"></i> Retira'}</td>
                <td>–</td>
                <td><strong>R$ ${parseFloat(o.valor_total).toFixed(2)}</strong></td>
                <td><span class="badge-status badge-${o.status}">${o.status}</span></td>
                <td>${formatDateTime(o.criado_em)}</td>
                <td>
                    <button class="btn-outline btn-sm" onclick="verDetalheOrcamento(${o.id})" title="Ver detalhe">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isAdmin ? `<button class="btn-danger btn-sm" onclick="excluirOrcamento(${o.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center">Erro: ${e.message}</td></tr>`;
    }
}

async function verDetalheOrcamento(id) {
    try {
        const o = await orcFetch(`/api/orcamentos/${id}`);
        document.getElementById('detalheTitle').innerHTML =
            `<i class="fas fa-file-invoice-dollar"></i> ${o.codigo}`;

        const itensHtml = (o.itens || []).map(i => `
            <tr>
                <td>${i.nome_produto}</td>
                <td>${i.quantidade}</td>
                <td>R$ ${parseFloat(i.preco_unitario).toFixed(2)}</td>
                <td><strong>R$ ${parseFloat(i.subtotal).toFixed(2)}</strong></td>
            </tr>
        `).join('');

        document.getElementById('detalheBody').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <p><strong>Tipo:</strong> ${o.tipo_entrega === 'entrega' ? `Entrega (${o.km_entrega} km)` : 'Retira'}</p>
                <p><strong>Status:</strong> <span class="badge-status badge-${o.status}">${o.status}</span></p>
                <p><strong>Data:</strong> ${formatDateTime(o.criado_em)}</p>
                <p><strong>Vendedor:</strong> ${o.vendedor_nome || '-'}</p>
            </div>
            <div class="table-container" style="margin-bottom:16px;">
                <table class="data-table">
                    <thead><tr><th>Produto</th><th>Qtd</th><th>Preço Un.</th><th>Subtotal</th></tr></thead>
                    <tbody>${itensHtml}</tbody>
                </table>
            </div>
            <div class="calculo-box">
                <div class="calculo-title"><i class="fas fa-receipt"></i> Detalhamento do Cálculo</div>
                <pre style="white-space:pre-wrap;color:var(--text-secondary,#a8b2d1);font-family:inherit;font-size:14px;line-height:1.6;">${o.calculo_detalhado || 'N/A'}</pre>
                <div class="calculo-total">
                    <span>TOTAL</span>
                    <span>R$ ${parseFloat(o.valor_total).toFixed(2)}</span>
                </div>
            </div>
            ${o.observacoes ? `<p style="margin-top:12px;color:var(--text-secondary,#a8b2d1);"><strong>Obs:</strong> ${o.observacoes}</p>` : ''}
        `;
        document.getElementById('modalDetalhe').style.display = 'flex';
    } catch (e) {
        alert('Erro ao carregar detalhe: ' + e.message);
    }
}

function fecharModalDetalhe() {
    document.getElementById('modalDetalhe').style.display = 'none';
}

async function excluirOrcamento(id) {
    if (!confirm('Excluir este orçamento permanentemente?')) return;
    try {
        await orcFetch(`/api/orcamentos/${id}`, { method: 'DELETE' });
        showToast('Orçamento excluído!', 'success');
        carregarHistorico();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(str) {
    if (!str) return '–';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function formatDateTime(str) {
    if (!str) return '–';
    return new Date(str).toLocaleString('pt-BR');
}

function showToast(msg, type = 'success') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(msg, type);
    } else {
        // fallback: mini toast se não tiver o sistema global
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed;bottom:24px;right:24px;z-index:9999;
            padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;
            background:${type === 'success' ? '#64ffda' : type === 'error' ? '#ff6b6b' : '#a8b2d1'};
            color:#0a192f;box-shadow:0 4px 15px rgba(0,0,0,0.3);
            animation:slideIn 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}
