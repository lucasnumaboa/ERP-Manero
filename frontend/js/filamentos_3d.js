/**
 * Filamentos 3D - JavaScript
 * Gerencia CRUD de filamentos, compras, calculadora e estoque
 * Segue o padrão do controle-financeiro.js usando fetch direto
 */

(function () {
    'use strict';

    const API_BASE = localStorage.getItem('api_base_url') || 'https://erp-api-call.autoservto.com.br';

    function getToken() {
        return localStorage.getItem('erp_token') || sessionStorage.getItem('erp_token') || '';
    }

    function authHeaders() {
        const token = getToken();
        const tokenType = localStorage.getItem('erp_token_type') || 'Bearer';
        return { 'Content-Type': 'application/json', 'Authorization': `${tokenType} ${token}` };
    }

    function showMsg(msg, success = true) {
        if (window.showToast) { window.showToast(msg, success ? 'success' : 'error'); } else { alert(msg); }
    }

    let filamentos = [];
    let fornecedores = [];
    let compras = [];
    let calcItens = [];
    let ultimoCalculo = null;

    document.addEventListener('DOMContentLoaded', async () => {
        // Verificação de acesso: apenas admin
        const userData = localStorage.getItem('erp_user_data');
        if (userData) {
            const user = JSON.parse(userData);
            if (user.nivel_acesso !== 'admin') {
                alert('Acesso restrito a administradores.');
                window.location.href = 'homepage.html';
                return;
            }
        }
        initTabs();
        await carregarDados();
        bindEvents();
    });

    // ── TABS ──
    function initTabs() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
                const tab = btn.dataset.tab;
                if (tab === 'tab-estoque') carregarEstoque();
                if (tab === 'tab-compra') { carregarCompras(); carregarFornecedores(); }
            });
        });
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab) { const btn = document.querySelector(`.tab-btn[data-tab="tab-${tab}"]`); if (btn) btn.click(); }
    }

    // ── DATA LOADING ──
    async function carregarDados() {
        try {
            await Promise.all([carregarFilamentos(), carregarFornecedores(), carregarCompras(), carregarCustoHora(), carregarEstoque()]);
            popularSelectFilamentos();
        } catch (e) { console.error('Erro ao carregar dados:', e); }
    }

    async function carregarFilamentos() {
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/filamentos`, { headers: authHeaders() });
            if (!resp.ok) throw new Error('Falha');
            filamentos = await resp.json();
            renderFilamentos();
            popularSelectFilamentos();
        } catch (e) { console.error('Erro filamentos:', e); filamentos = []; renderFilamentos(); }
    }

    async function carregarFornecedores() {
        try {
            const resp1 = await fetch(`${API_BASE}/api/parceiros/?tipo=fornecedor`, { headers: authHeaders() });
            const resp2 = await fetch(`${API_BASE}/api/parceiros/?tipo=ambos`, { headers: authHeaders() });
            const d1 = resp1.ok ? await resp1.json() : [];
            const d2 = resp2.ok ? await resp2.json() : [];
            fornecedores = [...d1, ...d2];
            const sel = document.getElementById('compraFornecedor');
            sel.innerHTML = '<option value="">Selecione...</option>';
            fornecedores.forEach(f => { sel.innerHTML += `<option value="${f.id}">${f.nome}</option>`; });
        } catch (e) { console.error('Erro fornecedores:', e); }
    }

    async function carregarCompras() {
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/compras`, { headers: authHeaders() });
            if (!resp.ok) throw new Error('Falha');
            compras = await resp.json();
            renderCompras();
        } catch (e) { console.error('Erro compras:', e); compras = []; renderCompras(); }
    }

    async function carregarCustoHora() {
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/custo-hora`, { headers: authHeaders() });
            if (!resp.ok) throw new Error('Falha');
            const ch = await resp.json();
            if (ch && ch.valor_hora) document.getElementById('custoHoraInput').value = ch.valor_hora;
        } catch (e) { console.error('Erro custo hora:', e); }
    }

    async function carregarEstoque() {
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/estoque`, { headers: authHeaders() });
            if (!resp.ok) throw new Error('Falha');
            const est = await resp.json();
            renderEstoque(est);
        } catch (e) { console.error('Erro estoque:', e); }
    }

    function popularSelectFilamentos() {
        const sel = document.getElementById('compraFilamento');
        if (!sel) return;
        const val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        filamentos.filter(f => f.ativo).forEach(f => {
            sel.innerHTML += `<option value="${f.id}">${f.material} - ${f.cor} (${f.peso_gramas}g)</option>`;
        });
        sel.value = val;
    }

    // ── RENDER FILAMENTOS ──
    function renderFilamentos() {
        const tbody = document.getElementById('tblFilamentos');
        if (!filamentos.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#8892b0;padding:30px">Nenhum filamento cadastrado</td></tr>'; return; }
        tbody.innerHTML = filamentos.map(f => `
            <tr>
                <td>${f.id}</td>
                <td><span style="background:rgba(100,255,218,0.1);color:#64ffda;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">${f.material}</span></td>
                <td>${f.cor}</td>
                <td>${Number(f.peso_gramas).toLocaleString('pt-BR')}</td>
                <td>${Number(f.estoque_gramas).toLocaleString('pt-BR')}</td>
                <td>R$ ${Number(f.preco_referencia).toFixed(2)}</td>
                <td>${f.ativo ? '<span style="color:#64ffda">Ativo</span>' : '<span style="color:#ff6b6b">Inativo</span>'}</td>
                <td class="actions-cell">
                    <button class="btn-edit-sm" onclick="editarFilamento(${f.id})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete-sm" onclick="excluirFilamento(${f.id})" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    // ── RENDER COMPRAS ──
    function renderCompras() {
        const tbody = document.getElementById('tblCompras');
        if (!compras.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#8892b0;padding:30px">Nenhuma compra registrada</td></tr>'; return; }
        tbody.innerHTML = compras.map(c => `
            <tr>
                <td>${new Date(c.data_compra).toLocaleDateString('pt-BR')}</td>
                <td>${c.filamento_material || ''} - ${c.filamento_cor || ''}</td>
                <td>${c.fornecedor_nome || '-'}</td>
                <td>${c.quantidade}</td>
                <td>R$ ${Number(c.valor_unitario).toFixed(2)}</td>
                <td>R$ ${Number(c.valor_total).toFixed(2)}</td>
                <td class="actions-cell">
                    <button class="btn-edit-sm" onclick="editarCompra(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete-sm" onclick="excluirCompra(${c.id})" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    // ── RENDER ESTOQUE ──
    function renderEstoque(estoque) {
        const grid = document.getElementById('estoqueGrid');
        if (!estoque.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-boxes"></i><p>Nenhum filamento em estoque</p></div>'; return; }
        grid.innerHTML = estoque.map(e => {
            const pct = e.peso_gramas > 0 ? Math.min((e.estoque_gramas / e.peso_gramas) * 100, 100) : 0;
            const isLow = pct < 20;
            return `
                <div class="estoque-card ${isLow ? 'estoque-low' : ''}" id="estoque-card-${e.id}">
                    <span class="material-badge">${e.material}</span>
                    <div class="cor-label">${e.cor}</div>
                    <div class="estoque-bar-container">
                        <div class="estoque-bar" style="width:${pct}%"></div>
                    </div>
                    <div class="estoque-info">
                        <span>${Number(e.estoque_gramas).toLocaleString('pt-BR')}g disponível</span>
                        <span>${pct.toFixed(0)}%</span>
                    </div>
                    ${e.preco_referencia > 0 ? `<div class="preco-ref"><i class="fas fa-tag"></i> Ref: R$ ${Number(e.preco_referencia).toFixed(2)}</div>` : ''}
                    <div class="estoque-actions" id="estoque-actions-${e.id}">
                        <button class="btn-edit-estoque" onclick="iniciarEdicaoEstoque(${e.id}, ${e.estoque_gramas})"><i class="fas fa-edit"></i> Editar Estoque</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── EVENTS ──
    function bindEvents() {
        document.getElementById('btnNovoFilamento').addEventListener('click', () => {
            document.getElementById('filamentoId').value = '';
            document.getElementById('filMaterial').value = '';
            document.getElementById('filCor').value = '';
            document.getElementById('filPeso').value = '1000';
            document.getElementById('filDescricao').value = '';
            document.getElementById('formFilamento').style.display = 'block';
        });
        document.getElementById('btnCancelarFilamento').addEventListener('click', () => { document.getElementById('formFilamento').style.display = 'none'; });
        document.getElementById('btnSalvarFilamento').addEventListener('click', salvarFilamento);
        document.getElementById('btnRegistrarCompra').addEventListener('click', registrarCompra);
        document.getElementById('btnSalvarCustoHora').addEventListener('click', salvarCustoHora);
        document.getElementById('btnCalcular').addEventListener('click', calcular);
        document.getElementById('btnEfetivar').addEventListener('click', efetivar);

        // Search dropdown for calculator
        const searchInput = document.getElementById('calcSearchInput');
        const dropdown = document.getElementById('calcDropdown');

        searchInput.addEventListener('focus', () => { renderDropdown(searchInput.value); });
        searchInput.addEventListener('input', () => { renderDropdown(searchInput.value); });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.calc-search-wrapper')) dropdown.classList.remove('show');
        });
    }

    // ── SEARCH DROPDOWN ──
    function renderDropdown(query) {
        const dropdown = document.getElementById('calcDropdown');
        const q = (query || '').toLowerCase();
        const filtered = filamentos.filter(f => f.ativo && (f.material.toLowerCase().includes(q) || f.cor.toLowerCase().includes(q)));

        if (!filtered.length) {
            dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:#8892b0;font-size:13px">Nenhum filamento encontrado</div>';
            dropdown.classList.add('show');
            return;
        }

        dropdown.innerHTML = filtered.map(f => {
            const alreadyAdded = calcItens.find(i => i.filamento_id === f.id);
            return `
                <div class="calc-dropdown-item ${alreadyAdded ? 'disabled' : ''}" data-id="${f.id}">
                    <span class="dd-badge">${f.material}</span>
                    <span class="dd-name">${f.cor}</span>
                    <span class="dd-stock">${Number(f.estoque_gramas).toLocaleString('pt-BR')}g</span>
                    ${alreadyAdded ? '<i class="fas fa-check" style="color:#64ffda;font-size:12px"></i>' : '<i class="fas fa-plus" style="color:#64ffda;font-size:12px"></i>'}
                </div>
            `;
        }).join('');

        dropdown.querySelectorAll('.calc-dropdown-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                addCalcItemById(id);
                document.getElementById('calcSearchInput').value = '';
                dropdown.classList.remove('show');
            });
        });

        dropdown.classList.add('show');
    }

    function addCalcItemById(id) {
        if (calcItens.find(i => i.filamento_id === id)) return;
        const f = filamentos.find(x => x.id === id);
        if (!f) return;
        calcItens.push({ filamento_id: id, gramas_utilizadas: 0, material: f.material, cor: f.cor, estoque: f.estoque_gramas });
        renderCalcItens();
    }

    // ── CALC ITEMS ──
    function renderCalcItens() {
        const container = document.getElementById('calcItensList');
        const empty = document.getElementById('calcEmpty');
        if (!calcItens.length) {
            container.innerHTML = '';
            if (empty) { container.appendChild(empty); empty.style.display = 'block'; }
            return;
        }
        if (empty) empty.style.display = 'none';
        container.innerHTML = calcItens.map((item, i) => `
            <div class="calc-item">
                <div class="item-num">${i + 1}</div>
                <div class="item-info">
                    <div class="name">${item.material} - ${item.cor}</div>
                    <div class="detail"><i class="fas fa-boxes" style="margin-right:4px"></i>Estoque: ${Number(item.estoque).toLocaleString('pt-BR')}g</div>
                </div>
                <div class="item-gramas">
                    <input type="number" step="0.01" min="0" value="${item.gramas_utilizadas}" placeholder="Gramas"
                           onchange="updateCalcGramas(${i}, this.value)" class="calc-gramas-input">
                </div>
                <button class="btn-remove-item" onclick="removeCalcItem(${i})" title="Remover"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    }

    window.updateCalcGramas = function (idx, val) { calcItens[idx].gramas_utilizadas = parseFloat(val) || 0; };
    window.removeCalcItem = function (idx) { calcItens.splice(idx, 1); renderCalcItens(); };

    // ── FILAMENTO CRUD ──
    async function salvarFilamento() {
        const id = document.getElementById('filamentoId').value;
        const data = { material: document.getElementById('filMaterial').value, cor: document.getElementById('filCor').value, peso_gramas: parseFloat(document.getElementById('filPeso').value) || 1000, descricao: document.getElementById('filDescricao').value || null };
        if (!data.material || !data.cor) { showMsg('Material e Cor são obrigatórios', false); return; }
        try {
            const url = id ? `${API_BASE}/api/filamentos-3d/filamentos/${id}` : `${API_BASE}/api/filamentos-3d/filamentos`;
            const resp = await fetch(url, { method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(data) });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro'); }
            document.getElementById('formFilamento').style.display = 'none';
            await carregarFilamentos();
            showMsg(id ? 'Filamento atualizado!' : 'Filamento cadastrado!');
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    }

    window.editarFilamento = function (id) {
        const f = filamentos.find(x => x.id === id); if (!f) return;
        document.getElementById('filamentoId').value = f.id;
        document.getElementById('filMaterial').value = f.material;
        document.getElementById('filCor').value = f.cor;
        document.getElementById('filPeso').value = f.peso_gramas;
        document.getElementById('filDescricao').value = f.descricao || '';
        document.getElementById('formFilamento').style.display = 'block';
    };

    window.excluirFilamento = async function (id) {
        if (!confirm('Deseja excluir este filamento?')) return;
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/filamentos/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!resp.ok && resp.status !== 204) throw new Error('Erro');
            await carregarFilamentos(); showMsg('Filamento excluído!');
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    };

    // ── COMPRA CRUD ──
    async function registrarCompra() {
        const data = { filamento_id: parseInt(document.getElementById('compraFilamento').value), fornecedor_id: parseInt(document.getElementById('compraFornecedor').value) || null, quantidade: parseInt(document.getElementById('compraQtd').value) || 1, valor_unitario: parseFloat(document.getElementById('compraValor').value) || 0, observacoes: document.getElementById('compraObs').value || null };
        if (!data.filamento_id) { showMsg('Selecione um filamento', false); return; }
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/compras`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro'); }
            showMsg('Compra registrada!');
            document.getElementById('compraQtd').value = '1'; document.getElementById('compraValor').value = '0'; document.getElementById('compraObs').value = '';
            await Promise.all([carregarCompras(), carregarFilamentos(), carregarEstoque()]);
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    }

    window.editarCompra = function (id) {
        const c = compras.find(x => x.id === id); if (!c) return;
        document.getElementById('compraFilamento').value = c.filamento_id;
        document.getElementById('compraFornecedor').value = c.fornecedor_id || '';
        document.getElementById('compraQtd').value = c.quantidade;
        document.getElementById('compraValor').value = c.valor_unitario;
        document.getElementById('compraObs').value = c.observacoes || '';
        document.querySelector('#tab-compra .card-section').scrollIntoView({ behavior: 'smooth' });
        showMsg('Dados carregados. Edite e registre novamente.');
    };

    window.excluirCompra = async function (id) {
        if (!confirm('Excluir esta compra? O estoque NÃO será restaurado.')) return;
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/compras/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!resp.ok && resp.status !== 204) throw new Error('Erro');
            showMsg('Compra excluída!');
            await Promise.all([carregarCompras(), carregarFilamentos(), carregarEstoque()]);
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    };

    // ── CUSTO HORA ──
    async function salvarCustoHora() {
        const valor = parseFloat(document.getElementById('custoHoraInput').value) || 0;
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/custo-hora`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ valor_hora: valor, descricao: 'Custo por hora impressão 3D' }) });
            if (!resp.ok) throw new Error('Erro');
            showMsg('Custo/hora salvo!');
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    }

    // ── CALCULADORA ──
    async function calcular() {
        if (!calcItens.length) { showMsg('Adicione ao menos um filamento', false); return; }
        const itens = calcItens.filter(i => i.gramas_utilizadas > 0).map(i => ({ filamento_id: i.filamento_id, gramas_utilizadas: i.gramas_utilizadas }));
        if (!itens.length) { showMsg('Informe as gramas para ao menos um filamento', false); return; }
        const body = { itens, horas: parseFloat(document.getElementById('calcHoras').value) || 0, taxa_percentual: parseFloat(document.getElementById('calcTaxaPerc').value) || 0, taxa_valor: parseFloat(document.getElementById('calcTaxaValor').value) || 0 };
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/calcular`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro'); }
            const res = await resp.json();
            ultimoCalculo = { itens, body };
            renderCalcResult(res);
            document.getElementById('btnEfetivar').style.display = 'inline-flex';
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    }

    function renderCalcResult(r) {
        const div = document.getElementById('calcResult');
        div.style.display = 'block';
        let detailsHtml = r.detalhes?.map(d => `
            <div class="result-row"><span>${d.material} ${d.cor} (${d.gramas_utilizadas}g × R$ ${d.preco_por_grama.toFixed(4)}/g)</span><span>R$ ${d.custo_item.toFixed(2)}</span></div>
        `).join('') || '';
        div.innerHTML = `
            <h4 style="color:#64ffda;margin:0 0 12px;font-size:15px"><i class="fas fa-receipt"></i> Resultado do Cálculo</h4>
            ${detailsHtml}
            <div class="result-row"><span>Custo Filamentos</span><span>R$ ${r.custo_filamentos.toFixed(2)}</span></div>
            <div class="result-row"><span>Custo Horas (${r.valor_hora.toFixed(2)}/h)</span><span>R$ ${r.custo_horas.toFixed(2)}</span></div>
            <div class="result-row"><span>Subtotal</span><span>R$ ${r.subtotal.toFixed(2)}</span></div>
            ${r.taxa_percentual_valor > 0 ? `<div class="result-row"><span>Taxa ${r.taxa_percentual}%</span><span>R$ ${r.taxa_percentual_valor.toFixed(2)}</span></div>` : ''}
            ${r.taxa_valor > 0 ? `<div class="result-row"><span>Taxa Fixa</span><span>R$ ${r.taxa_valor.toFixed(2)}</span></div>` : ''}
            <div class="result-row total"><span>Custo Total</span><span>R$ ${r.custo_total.toFixed(2)}</span></div>
            <div class="result-row sugerido"><span><i class="fas fa-star"></i> Valor Sugerido (50% margem)</span><span>R$ ${r.valor_sugerido.toFixed(2)}</span></div>
        `;
    }

    async function efetivar() {
        if (!ultimoCalculo) { showMsg('Calcule antes de efetivar', false); return; }
        if (!confirm('Deseja efetivar? Isso irá deduzir as gramas do estoque.')) return;
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/efetivar`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ itens: ultimoCalculo.itens }) });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro'); }
            const res = await resp.json();
            showMsg(res.mensagem || 'Estoque atualizado!');
            calcItens = []; ultimoCalculo = null; renderCalcItens();
            document.getElementById('calcResult').style.display = 'none';
            document.getElementById('btnEfetivar').style.display = 'none';
            document.getElementById('calcHoras').value = '0';
            document.getElementById('calcTaxaPerc').value = '0';
            document.getElementById('calcTaxaValor').value = '0';
            await Promise.all([carregarFilamentos(), carregarEstoque()]);
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    }

    // ── ESTOQUE EDIÇÃO ──
    window.iniciarEdicaoEstoque = function (id, estoqueAtual) {
        const actionsDiv = document.getElementById(`estoque-actions-${id}`);
        if (!actionsDiv) return;
        actionsDiv.innerHTML = `
            <div class="estoque-edit-inline">
                <input type="number" id="estoque-input-${id}" value="${estoqueAtual}" step="0.01" min="0" placeholder="Gramas">
                <button class="btn-save-est" onclick="salvarEstoque(${id})"><i class="fas fa-check"></i> Salvar</button>
                <button class="btn-cancel-est" onclick="cancelarEdicaoEstoque(${id}, ${estoqueAtual})"><i class="fas fa-times"></i></button>
            </div>
        `;
    };

    window.cancelarEdicaoEstoque = function (id, estoqueAtual) {
        const actionsDiv = document.getElementById(`estoque-actions-${id}`);
        if (!actionsDiv) return;
        actionsDiv.innerHTML = `<button class="btn-edit-estoque" onclick="iniciarEdicaoEstoque(${id}, ${estoqueAtual})"><i class="fas fa-edit"></i> Editar Estoque</button>`;
    };

    window.salvarEstoque = async function (id) {
        const input = document.getElementById(`estoque-input-${id}`);
        if (!input) return;
        const novoEstoque = parseFloat(input.value);
        if (isNaN(novoEstoque) || novoEstoque < 0) { showMsg('Valor inválido', false); return; }
        try {
            const resp = await fetch(`${API_BASE}/api/filamentos-3d/estoque/${id}`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify({ estoque_gramas: novoEstoque })
            });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro'); }
            showMsg('Estoque atualizado!');
            await Promise.all([carregarEstoque(), carregarFilamentos()]);
        } catch (e) { showMsg('Erro: ' + e.message, false); }
    };
})();
