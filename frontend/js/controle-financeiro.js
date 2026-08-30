/**
 * controle-financeiro.js
 * Gerencia categorias e lançamentos de controle financeiro na aba "Controle" do financeiro.html
 */

(function () {
    'use strict';

    const API_BASE = localStorage.getItem('api_base_url') || 'https://erp-api-call.autoservto.com.br';

    // ──────────────────────────────────────────────────────────────
    // UTILITÁRIOS
    // ──────────────────────────────────────────────────────────────

    function getToken() {
        return localStorage.getItem('erp_token') || sessionStorage.getItem('erp_token') || '';
    }

    function authHeaders() {
        const token = getToken();
        const tokenType = localStorage.getItem('erp_token_type') || 'Bearer';
        return {
            'Content-Type': 'application/json',
            'Authorization': `${tokenType} ${token}`
        };
    }

    function formatDate(isoStr) {
        if (!isoStr) return '-';
        const [y, m, d] = isoStr.split('T')[0].split('-');
        return `${d}/${m}/${y}`;
    }

    function formatMoney(value) {
        return 'R$ ' + parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function badgeTipo(tipo) {
        const cls = tipo === 'lucro' ? 'badge-lucro' : 'badge-desconto';
        const label = tipo === 'lucro' ? 'Lucro' : 'Desconto';
        return `<span class="badge-tipo ${cls}">${label}</span>`;
    }

    function showMsg(msg, success = true) {
        // Reaproveita toast se existir, ou usa alert simples
        if (window.showToast) {
            window.showToast(msg, success ? 'success' : 'error');
        } else {
            alert(msg);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // ESTADO
    // ──────────────────────────────────────────────────────────────

    let _categorias = [];   // cache de categorias

    // ──────────────────────────────────────────────────────────────
    // CATEGORIAS
    // ──────────────────────────────────────────────────────────────

    async function carregarCategorias() {
        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/categorias`, {
                headers: authHeaders()
            });
            if (!resp.ok) throw new Error('Falha ao carregar categorias');
            _categorias = await resp.json();
            renderizarCategorias();
            sincronizarSelectCategorias();
        } catch (err) {
            console.error(err);
            const tbody = document.getElementById('tbodyControleCategorias');
            if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#e74c3c;">Erro ao carregar</td></tr>';
        }
    }

    function renderizarCategorias() {
        const tbody = document.getElementById('tbodyControleCategorias');
        if (!tbody) return;
        if (_categorias.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#8892b0;">Nenhuma categoria cadastrada</td></tr>';
            return;
        }
        tbody.innerHTML = _categorias.map(cat => `
            <tr>
                <td>${cat.nome}</td>
                <td>${badgeTipo(cat.tipo)}</td>
                <td>
                    <button class="btn-del-controle" title="Excluir" data-id="${cat.id}" data-target="categoria">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function sincronizarSelectCategorias() {
        // Atualiza o select de categoria no modal de lançamento
        const sel = document.getElementById('cl_categoria');
        if (!sel) return;
        const tipoAtual = document.getElementById('cl_tipo')?.value || 'lucro';
        const filtradas = _categorias.filter(c => c.tipo === tipoAtual);
        sel.innerHTML = '<option value="">Sem categoria</option>' +
            filtradas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }

    async function criarCategoria() {
        const nome = document.getElementById('inputNomeCategoria')?.value?.trim();
        const tipo = document.getElementById('selectTipoCategoria')?.value;
        if (!nome) { showMsg('Informe o nome da categoria', false); return; }

        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/categorias`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ nome, tipo })
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || 'Erro ao criar categoria');
            }
            document.getElementById('inputNomeCategoria').value = '';
            showMsg('Categoria criada com sucesso!');
            await carregarCategorias();
        } catch (err) {
            showMsg(err.message, false);
        }
    }

    async function excluirCategoria(id) {
        if (!confirm('Deseja excluir esta categoria?')) return;
        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/categorias/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            if (!resp.ok && resp.status !== 204) throw new Error('Erro ao excluir');
            showMsg('Categoria removida');
            await carregarCategorias();
        } catch (err) {
            showMsg(err.message, false);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // LANÇAMENTOS
    // ──────────────────────────────────────────────────────────────

    async function carregarLancamentos() {
        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/lancamentos`, {
                headers: authHeaders()
            });
            if (!resp.ok) throw new Error('Falha ao carregar lançamentos');
            const lancamentos = await resp.json();
            renderizarLancamentos(lancamentos);
        } catch (err) {
            console.error(err);
            const tbody = document.getElementById('tbodyControleLancamentos');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c;">Erro ao carregar</td></tr>';
        }
    }

    function renderizarLancamentos(list) {
        const tbody = document.getElementById('tbodyControleLancamentos');
        if (!tbody) return;
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#8892b0;">Nenhum lançamento cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(l => {
            const valorCor = l.tipo === 'lucro' ? '#27ae60' : '#e74c3c';
            const sinal = l.tipo === 'lucro' ? '+' : '-';
            return `
                <tr data-tipo="${l.tipo}" data-valor="${l.valor}">
                    <td>${formatDate(l.data)}</td>
                    <td>${badgeTipo(l.tipo)}</td>
                    <td>${l.categoria_nome || '<span style="color:#8892b0">—</span>'}</td>
                    <td>${l.descricao}</td>
                    <td style="text-align:right;font-weight:700;color:${valorCor};">${sinal} ${formatMoney(l.valor)}</td>
                    <td>
                        <button class="btn-del-controle" title="Excluir" data-id="${l.id}" data-target="lancamento">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function abrirModalLancamento() {
        sincronizarSelectCategorias();
        // Definir data de hoje como padrão
        const hoje = new Date().toISOString().split('T')[0];
        const el = document.getElementById('cl_data');
        if (el && !el.value) el.value = hoje;

        const modal = document.getElementById('controleLancamentoModal');
        if (modal) modal.classList.add('active');
    }

    function fecharModalLancamento() {
        const modal = document.getElementById('controleLancamentoModal');
        if (modal) modal.classList.remove('active');
        const form = document.getElementById('controleLancamentoForm');
        if (form) form.reset();
    }

    async function salvarLancamento() {
        const data = document.getElementById('cl_data')?.value;
        const tipo = document.getElementById('cl_tipo')?.value;
        const categoriaId = document.getElementById('cl_categoria')?.value;
        const descricao = document.getElementById('cl_descricao')?.value?.trim();
        const valor = parseFloat(document.getElementById('cl_valor')?.value);

        if (!data || !tipo || !descricao || isNaN(valor) || valor <= 0) {
            showMsg('Preencha todos os campos obrigatórios corretamente', false);
            return;
        }

        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/lancamentos`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    data,
                    tipo,
                    categoria_id: categoriaId ? parseInt(categoriaId) : null,
                    descricao,
                    valor
                })
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || 'Erro ao salvar lançamento');
            }
            showMsg('Lançamento salvo com sucesso!');
            fecharModalLancamento();
            await carregarLancamentos();
        } catch (err) {
            showMsg(err.message, false);
        }
    }

    async function excluirLancamento(id) {
        if (!confirm('Deseja excluir este lançamento?')) return;
        try {
            const resp = await fetch(`${API_BASE}/api/controle-financeiro/lancamentos/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            if (!resp.ok && resp.status !== 204) throw new Error('Erro ao excluir');
            showMsg('Lançamento removido');
            await carregarLancamentos();
        } catch (err) {
            showMsg(err.message, false);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // INICIALIZAÇÃO E EVENTOS
    // ──────────────────────────────────────────────────────────────

    function inicializar() {
        // Botão criar categoria
        document.getElementById('btnCriarCategoria')?.addEventListener('click', criarCategoria);

        // Botão abrir modal de lançamento
        document.getElementById('btnNovoControleLancamento')?.addEventListener('click', abrirModalLancamento);

        // Fechar modal
        document.getElementById('fecharControleLancamentoModal')?.addEventListener('click', fecharModalLancamento);
        document.getElementById('btnCancelarControleLancamento')?.addEventListener('click', fecharModalLancamento);

        // Salvar lançamento
        document.getElementById('btnSalvarControleLancamento')?.addEventListener('click', salvarLancamento);

        // Filtrar categorias no select ao mudar tipo
        document.getElementById('cl_tipo')?.addEventListener('change', sincronizarSelectCategorias);

        // Delegação de clique para excluir (categoria e lançamento)
        document.getElementById('tbodyControleCategorias')?.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-target="categoria"]');
            if (btn) excluirCategoria(btn.dataset.id);
        });
        document.getElementById('tbodyControleLancamentos')?.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-target="lancamento"]');
            if (btn) excluirLancamento(btn.dataset.id);
        });

        // Fechar modal ao clicar fora
        document.getElementById('controleLancamentoModal')?.addEventListener('click', function (e) {
            if (e.target === this) fecharModalLancamento();
        });

        // Carregar dados ao clicar na aba Controle
        document.querySelectorAll('.tab-btn[data-tab="controle"]').forEach(btn => {
            btn.addEventListener('click', function () {
                carregarCategorias();
                carregarLancamentos();
            });
        });
    }

    // Aguarda o DOM estar pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    // Expõe API pública para uso em páginas sem sistema de abas
    window.ControleFinanceiro = {
        carregar: function () {
            carregarCategorias();
            carregarLancamentos();
        }
    };

})();
