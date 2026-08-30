// OLX Flags - JavaScript
document.addEventListener('DOMContentLoaded', function () {
    carregarFlags();
    setupEventListeners();
});

let flags = [];
let editingId = null;

function setupEventListeners() {
    document.getElementById('flagForm').addEventListener('submit', salvarFlag);
    document.getElementById('btnCancelar').addEventListener('click', cancelarEdicao);
}

async function carregarFlags() {
    try {
        const response = await apiGet('/api/olx/flags');
        flags = response || [];
        renderizarTabela();
    } catch (error) {
        console.error('Erro ao carregar flags:', error);
        document.querySelector('#flagsTable tbody').innerHTML =
            '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar flags</td></tr>';
    }
}

function renderizarTabela() {
    const tbody = document.querySelector('#flagsTable tbody');

    if (flags.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma flag cadastrada</td></tr>';
        return;
    }

    tbody.innerHTML = flags.map(f => `
        <tr>
            <td>${f.id}</td>
            <td>${f.nome}</td>
            <td>
                ${f.incluir
            ? '<span class="badge-include">Incluir</span>'
            : '<span class="badge-exclude">Excluir</span>'}
            </td>
            <td>
                <div class="keywords-preview" title="${f.palavras_chave}">
                    ${f.palavras_chave}
                </div>
            </td>
            <td>
                <button class="btn-icon" onclick="editarFlag(${f.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="excluirFlag(${f.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function salvarFlag(e) {
    e.preventDefault();

    const form = e.target;
    const dados = {
        nome: form.nome.value,
        incluir: form.incluir.value === 'true',
        palavras_chave: form.palavras_chave.value
    };

    try {
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        if (editingId) {
            await apiPut(`/api/olx/flags/${editingId}`, dados);
            showNotification('Flag atualizada com sucesso!', 'success');
        } else {
            await apiPost('/api/olx/flags', dados);
            showNotification('Flag criada com sucesso!', 'success');
        }

        form.reset();
        form.querySelector('input[value="true"]').checked = true;
        editingId = null;
        document.getElementById('btnCancelar').style.display = 'none';

        await carregarFlags();

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Flag';
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showNotification('Erro ao salvar flag: ' + error.message, 'error');

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Flag';
    }
}

function editarFlag(id) {
    const flag = flags.find(f => f.id === id);
    if (!flag) return;

    editingId = id;

    const form = document.getElementById('flagForm');
    form.nome.value = flag.nome;
    form.palavras_chave.value = flag.palavras_chave;

    // Set radio button
    form.querySelector(`input[value="${flag.incluir}"]`).checked = true;

    document.getElementById('btnCancelar').style.display = 'inline-block';
    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Atualizar Flag';

    form.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicao() {
    editingId = null;
    const form = document.getElementById('flagForm');
    form.reset();
    form.querySelector('input[value="true"]').checked = true;
    document.getElementById('btnCancelar').style.display = 'none';
    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Salvar Flag';
}

async function excluirFlag(id) {
    if (!confirm('Tem certeza que deseja excluir esta flag?')) return;

    try {
        await apiDelete(`/api/olx/flags/${id}`);
        showNotification('Flag excluída com sucesso!', 'success');
        await carregarFlags();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        showNotification('Erro ao excluir flag: ' + error.message, 'error');
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
