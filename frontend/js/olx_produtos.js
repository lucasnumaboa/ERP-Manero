// OLX Produtos - JavaScript (Cadastro de Pesquisas)
document.addEventListener('DOMContentLoaded', function () {
    initPage();
});

let pesquisas = [];
let categorias = [];
let flags = [];
let editingId = null;

async function initPage() {
    await Promise.all([
        carregarCategorias(),
        carregarFlags(),
        carregarPesquisas()
    ]);

    setupEventListeners();
}

function setupEventListeners() {
    // Form submit
    document.getElementById('pesquisaForm').addEventListener('submit', salvarPesquisa);

    // Categoria change
    document.getElementById('categoria_id').addEventListener('change', carregarSubcategorias);

    // Add button
    document.getElementById('btnAddPesquisa').addEventListener('click', abrirModal);

    // Close modal on overlay click
    document.getElementById('modalPesquisa').addEventListener('click', function (e) {
        if (e.target === this) fecharModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') fecharModal();
    });
}

function abrirModal() {
    editingId = null;
    const form = document.getElementById('pesquisaForm');
    form.reset();
    form.ativo.checked = true;
    document.getElementById('subcategoria_id').disabled = true;
    document.getElementById('subcategoria_id').innerHTML = '<option value="">Selecione uma categoria...</option>';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus"></i> Nova Pesquisa';
    form.querySelectorAll('input[name^="flag_"]').forEach(cb => cb.checked = false);
    document.getElementById('modalPesquisa').classList.add('active');
}

function fecharModal() {
    document.getElementById('modalPesquisa').classList.remove('active');
    editingId = null;
}

async function carregarCategorias() {
    try {
        const response = await apiGet('/api/olx/categorias');
        categorias = response || [];

        const select = document.getElementById('categoria_id');
        select.innerHTML = '<option value="">Selecione...</option>';

        categorias.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

async function carregarSubcategorias() {
    const categoriaId = document.getElementById('categoria_id').value;
    const subcategoriaSelect = document.getElementById('subcategoria_id');

    subcategoriaSelect.innerHTML = '<option value="">Selecione uma subcategoria...</option>';

    if (!categoriaId) {
        subcategoriaSelect.disabled = true;
        return;
    }

    try {
        const response = await apiGet(`/api/olx/categorias/${categoriaId}/subcategorias`);

        subcategoriaSelect.disabled = false;
        (response || []).forEach(sub => {
            subcategoriaSelect.innerHTML += `<option value="${sub.id}">${sub.nome}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar subcategorias:', error);
        subcategoriaSelect.disabled = true;
    }
}

async function carregarFlags() {
    try {
        const response = await apiGet('/api/olx/flags');
        flags = response || [];

        const container = document.getElementById('flagsContainer');

        if (flags.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhuma flag cadastrada. <a href="olx_flags.html">Criar flags</a></p>';
            return;
        }

        container.innerHTML = '';
        flags.forEach(flag => {
            const typeClass = flag.incluir ? 'include' : 'exclude';
            const badgeClass = flag.incluir ? 'badge-include' : 'badge-exclude';
            const badgeText = flag.incluir ? 'Incluir' : 'Excluir';

            container.innerHTML += `
                <label class="flag-checkbox ${typeClass}">
                    <input type="checkbox" name="flag_${flag.id}" value="${flag.id}">
                    ${flag.nome}
                    <span class="${badgeClass}">${badgeText}</span>
                </label>
            `;
        });
    } catch (error) {
        console.error('Erro ao carregar flags:', error);
        document.getElementById('flagsContainer').innerHTML = '<p class="text-danger">Erro ao carregar flags</p>';
    }
}

async function carregarPesquisas() {
    try {
        const response = await apiGet('/api/olx/pesquisas');
        pesquisas = response || [];
        renderizarTabela();
    } catch (error) {
        console.error('Erro ao carregar pesquisas:', error);
        document.querySelector('#pesquisasTable tbody').innerHTML =
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar pesquisas</td></tr>';
    }
}

function renderizarTabela() {
    const tbody = document.querySelector('#pesquisasTable tbody');

    if (pesquisas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma pesquisa cadastrada</td></tr>';
        return;
    }

    tbody.innerHTML = pesquisas.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.nome_produto}</td>
            <td>R$ ${parseFloat(p.preco_maximo).toFixed(2).replace('.', ',')}</td>
            <td>${p.categoria_nome || '-'} ${p.subcategoria_nome ? '/ ' + p.subcategoria_nome : ''}</td>
            <td><span class="product-count">${p.produtos_count || 0}</span></td>
            <td>
                ${p.ativo
            ? '<span class="badge-active">Ativo</span>'
            : '<span class="badge-inactive">Inativo</span>'}
            </td>
            <td>
                <button class="btn-icon" onclick="editarPesquisa(${p.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="excluirPesquisa(${p.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function salvarPesquisa(e) {
    e.preventDefault();

    const form = e.target;
    const selectedFlags = [];
    form.querySelectorAll('input[name^="flag_"]:checked').forEach(cb => {
        selectedFlags.push(cb.value);
    });

    const dados = {
        nome_produto: form.nome_produto.value,
        preco_maximo: parseFloat(form.preco_maximo.value),
        instrucoes: form.instrucoes.value || null,
        categoria_id: form.categoria_id.value ? parseInt(form.categoria_id.value) : null,
        subcategoria_id: form.subcategoria_id.value ? parseInt(form.subcategoria_id.value) : null,
        flags: selectedFlags.join(',') || null,
        ativo: form.ativo.checked
    };

    try {
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        if (editingId) {
            await apiPut(`/api/olx/pesquisas/${editingId}`, dados);
            showNotification('Pesquisa atualizada com sucesso!', 'success');
        } else {
            await apiPost('/api/olx/pesquisas', dados);
            showNotification('Pesquisa criada com sucesso!', 'success');
        }

        fecharModal();
        await carregarPesquisas();

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Pesquisa';
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showNotification('Erro ao salvar pesquisa: ' + error.message, 'error');

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Pesquisa';
    }
}

async function editarPesquisa(id) {
    const pesquisa = pesquisas.find(p => p.id === id);
    if (!pesquisa) return;

    editingId = id;

    const form = document.getElementById('pesquisaForm');
    form.nome_produto.value = pesquisa.nome_produto;
    form.preco_maximo.value = pesquisa.preco_maximo;
    form.instrucoes.value = pesquisa.instrucoes || '';
    form.categoria_id.value = pesquisa.categoria_id || '';
    form.ativo.checked = pesquisa.ativo;

    // Carregar subcategorias se houver categoria
    if (pesquisa.categoria_id) {
        await carregarSubcategorias();
        form.subcategoria_id.value = pesquisa.subcategoria_id || '';
    }

    // Marcar flags
    form.querySelectorAll('input[name^="flag_"]').forEach(cb => cb.checked = false);
    if (pesquisa.flags) {
        const flagIds = pesquisa.flags.split(',');
        flagIds.forEach(flagId => {
            const cb = form.querySelector(`input[name="flag_${flagId}"]`);
            if (cb) cb.checked = true;
        });
    }

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Pesquisa';
    document.getElementById('modalPesquisa').classList.add('active');
}

async function excluirPesquisa(id) {
    if (!confirm('Tem certeza que deseja excluir esta pesquisa?')) return;

    try {
        await apiDelete(`/api/olx/pesquisas/${id}`);
        showNotification('Pesquisa excluída com sucesso!', 'success');
        await carregarPesquisas();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        showNotification('Erro ao excluir pesquisa: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
    notification.innerHTML = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
}
