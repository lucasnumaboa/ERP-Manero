// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function () {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('logoutBtn')?.addEventListener('click', function (e) {
        e.preventDefault();
        logout();
    });

    document.getElementById('toggleSidebar').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    loadUserData();
    loadDepositos();
    setupActionButtons();
});

// Carrega os dados do usuário do localStorage
function loadUserData() {
    const userData = getUserData();
    if (userData) {
        document.getElementById('userName').textContent = userData.nome || 'Usuário';
        document.getElementById('userRole').textContent = formatRole(userData.nivel_acesso) || 'Usuário';
    }
}

function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'vendedor': 'Vendedor',
        'comprador': 'Comprador',
        'financeiro': 'Financeiro'
    };
    return roles[role] || role;
}

// Carrega a lista de depósitos da API
async function loadDepositos() {
    const tbody = document.getElementById('depositosTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando depósitos...</td></tr>';

    try {
        const depositos = await apiGet('/api/depositos');
        displayDepositos(depositos);
    } catch (error) {
        console.error('Erro ao carregar depósitos:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Erro ao carregar depósitos</td></tr>';
    }
}

// Exibe os depósitos na tabela
function displayDepositos(depositos) {
    const tbody = document.getElementById('depositosTableBody');

    if (!depositos || depositos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum depósito encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    depositos.forEach(deposito => {
        const produtosCount = deposito.produtos_count || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${deposito.id}</td>
            <td>${deposito.nome}</td>
            <td>${deposito.descricao || '-'}</td>
            <td class="text-center">
                ${deposito.padrao
                    ? '<span class="status-badge status-active">Padrão</span>'
                    : `<button class="btn-outline btn-sm btn-tornar-padrao" data-id="${deposito.id}">Tornar padrão</button>`}
            </td>
            <td class="text-center">${produtosCount}</td>
            <td class="text-center">
                <span class="status-badge ${deposito.ativo ? 'status-active' : 'status-inactive'}">
                    ${deposito.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td class="actions">
                <button class="btn-icon btn-edit" data-id="${deposito.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${deposito.id}" title="Excluir"
                    ${deposito.padrao || produtosCount > 0 ? 'disabled' : ''}>
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function () {
            openDepositoModal(this.getAttribute('data-id'));
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function () {
            if (!this.disabled) {
                deleteDeposito(this.getAttribute('data-id'));
            }
        });
    });

    document.querySelectorAll('.btn-tornar-padrao').forEach(btn => {
        btn.addEventListener('click', function () {
            tornarDepositoPadrao(this.getAttribute('data-id'));
        });
    });
}

// Configura os botões de ação
function setupActionButtons() {
    document.getElementById('btnNovoDeposito').addEventListener('click', function () {
        openDepositoModal();
    });

    document.querySelector('#depositoModal .close-modal').addEventListener('click', function () {
        closeModal('depositoModal');
    });

    document.getElementById('btnCancelar').addEventListener('click', function () {
        closeModal('depositoModal');
    });

    document.getElementById('btnSalvar').addEventListener('click', function () {
        saveDeposito();
    });
}

// Abre o modal de depósito
function openDepositoModal(depositoId = null) {
    document.getElementById('depositoForm').reset();
    document.getElementById('modalTitle').textContent = depositoId ? 'Editar Depósito' : 'Novo Depósito';

    if (depositoId) {
        loadDepositoData(depositoId);
    }

    document.getElementById('depositoForm').setAttribute('data-id', depositoId || '');
    document.getElementById('depositoModal').classList.add('active');
}

// Carrega os dados de um depósito específico
async function loadDepositoData(depositoId) {
    try {
        const deposito = await apiGet(`/api/depositos/${depositoId}`);
        document.getElementById('nome').value = deposito.nome || '';
        document.getElementById('descricao').value = deposito.descricao || '';
        document.getElementById('ativo').checked = deposito.ativo !== false;
    } catch (error) {
        console.error('Erro ao carregar dados do depósito:', error);
        alert('Erro ao carregar dados do depósito.');
    }
}

// Fecha o modal
function closeModal(modalId) {
    if (modalId === 'depositoModal') {
        document.getElementById('depositoForm').reset();
        document.getElementById('depositoForm').removeAttribute('data-id');
    }
    document.getElementById(modalId).classList.remove('active');
}

// Salva o depósito (novo ou edição)
async function saveDeposito() {
    const form = document.getElementById('depositoForm');
    const depositoId = form.getAttribute('data-id');

    const nome = document.getElementById('nome').value.trim();
    const descricao = document.getElementById('descricao').value.trim();
    const ativo = document.getElementById('ativo').checked;

    if (!nome) {
        alert('Por favor, informe o nome do depósito.');
        return;
    }

    const depositoData = { nome, descricao: descricao || null, ativo };

    try {
        if (depositoId) {
            await apiPut(`/api/depositos/${depositoId}`, depositoData);
        } else {
            await apiPost('/api/depositos', depositoData);
        }

        closeModal('depositoModal');
        loadDepositos();
        alert(depositoId ? 'Depósito atualizado com sucesso!' : 'Depósito criado com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar depósito:', error);
        alert(`Erro ao salvar depósito: ${error.message || 'Verifique os dados e tente novamente'}`);
    }
}

// Marca um depósito como padrão
async function tornarDepositoPadrao(depositoId) {
    if (!confirm('Tornar este depósito o padrão do sistema? Produtos sem depósito definido passarão a usar este.')) {
        return;
    }

    try {
        await apiPut(`/api/depositos/${depositoId}`, { padrao: true });
        loadDepositos();
        alert('Depósito padrão atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao tornar depósito padrão:', error);
        alert(`Erro ao atualizar depósito padrão: ${error.message || 'Tente novamente.'}`);
    }
}

// Exclui um depósito
async function deleteDeposito(depositoId) {
    if (!confirm('Tem certeza que deseja excluir este depósito?')) {
        return;
    }

    try {
        await apiDelete(`/api/depositos/${depositoId}`);
        loadDepositos();
        alert('Depósito excluído com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir depósito:', error);
        if (error.message && error.message.includes('vinculados')) {
            alert('Não é possível excluir este depósito pois existem produtos vinculados a ele.');
        } else if (error.message && error.message.includes('padrão')) {
            alert('Não é possível excluir o depósito padrão.');
        } else {
            alert(`Erro ao excluir depósito: ${error.message || 'Tente novamente mais tarde.'}`);
        }
    }
}
