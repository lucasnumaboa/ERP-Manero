// Variáveis globais
let plataformas = [];
let plataformaAtual = null;
let editandoPlataforma = false;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM carregado - iniciando configuração da página de plataformas de venda');
    
    // Verificar autenticação
    checkAuth();
    
    // Carregar dados do usuário
    loadUserData();
    
    // Configurar sidebar toggle
    setupSidebarToggle();
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Verificar permissão para editar (fornecedores_editar)
    const podeEditar = await hasPermission('fornecedores_editar');
    const btnNovaPlataforma = document.getElementById('btnNovaPlataforma');
    
    if (btnNovaPlataforma) {
        if (podeEditar) {
            btnNovaPlataforma.style.display = 'inline-flex';
            btnNovaPlataforma.addEventListener('click', abrirModalNovaPlataforma);
        } else {
            btnNovaPlataforma.style.display = 'none';
        }
    }
    
    // Carregar plataformas
    carregarPlataformas();
    
    // Configurar eventos
    document.getElementById('btnCancelar').addEventListener('click', fecharModal);
    document.getElementById('btnSalvar').addEventListener('click', salvarPlataforma);
    document.getElementById('filtroStatus').addEventListener('change', carregarPlataformas);
    
    // Configurar eventos de fechamento de modal
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', fecharModal);
    });
    
    // Fechar modal ao clicar fora
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                fecharModal();
            }
        });
    });
});

// Autenticação
function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
    }
}

// Carrega os dados do usuário
async function loadUserData() {
    try {
        const userData = await getCurrentUser();
        if (userData) {
            document.getElementById('userName').textContent = userData.nome || 'Usuário';
            document.getElementById('userRole').textContent = formatRole(userData.nivel_acesso) || 'Usuário';
        }
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
    }
}

function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'gerente': 'Gerente',
        'vendedor': 'Vendedor'
    };
    return roles[role] || role;
}

// Sidebar toggle
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
}

// Carregar plataformas
async function carregarPlataformas() {
    try {
        const filtroStatus = document.getElementById('filtroStatus').value;
        
        let params = {};
        if (filtroStatus !== '') {
            params.ativo = filtroStatus === 'true';
        }
        
        plataformas = await apiGet('/api/plataformas-venda', params);
        console.log('Plataformas carregadas:', plataformas);
        
        renderizarPlataformas(plataformas);
    } catch (error) {
        console.error('Erro ao carregar plataformas:', error);
        document.getElementById('plataformasTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center">Erro ao carregar plataformas. Tente novamente.</td></tr>';
    }
}

// Renderizar plataformas na tabela
async function renderizarPlataformas(plataformas) {
    const tbody = document.getElementById('plataformasTableBody');
    tbody.innerHTML = '';
    
    if (!plataformas || plataformas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma plataforma de venda cadastrada</td></tr>';
        return;
    }
    
    // Verificar permissão para editar
    const podeEditar = await hasPermission('fornecedores_editar');
    
    plataformas.forEach(plataforma => {
        const tr = document.createElement('tr');
        
        const statusClass = plataforma.ativo ? 'status-ativo' : 'status-inativo';
        const statusText = plataforma.ativo ? 'Ativo' : 'Inativo';
        
        // Botões de ação só aparecem se tiver permissão de editar
        const acoesHTML = podeEditar ? `
            <div class="table-actions">
                <button class="btn-icon btn-edit" data-id="${plataforma.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${plataforma.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : '-';
        
        tr.innerHTML = `
            <td>${plataforma.id}</td>
            <td>${plataforma.nome}</td>
            <td>${plataforma.descricao || '-'}</td>
            <td>${plataforma.url ? `<a href="${plataforma.url}" target="_blank">${plataforma.url}</a>` : '-'}</td>
            <td>${plataforma.taxa_percentual ? plataforma.taxa_percentual.toFixed(2) + '%' : '0.00%'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${acoesHTML}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // Adicionar event listeners para os botões
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => editarPlataforma(parseInt(btn.dataset.id)));
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => excluirPlataforma(parseInt(btn.dataset.id)));
    });
}

// Abrir modal para nova plataforma
function abrirModalNovaPlataforma() {
    editandoPlataforma = false;
    plataformaAtual = null;
    
    // Resetar formulário
    document.getElementById('plataformaForm').reset();
    document.getElementById('plataforma_id').value = '';
    document.getElementById('modalTitle').textContent = 'Nova Plataforma de Venda';
    document.getElementById('ativo').value = 'true';
    document.getElementById('taxa_percentual').value = '0';
    
    // Exibir modal
    document.getElementById('plataformaModal').classList.add('active');
}

// Editar plataforma
async function editarPlataforma(id) {
    try {
        plataformaAtual = await apiGet(`/api/plataformas-venda/${id}`);
        editandoPlataforma = true;
        
        // Preencher formulário
        document.getElementById('plataforma_id').value = plataformaAtual.id;
        document.getElementById('nome').value = plataformaAtual.nome || '';
        document.getElementById('descricao').value = plataformaAtual.descricao || '';
        document.getElementById('url').value = plataformaAtual.url || '';
        document.getElementById('taxa_percentual').value = plataformaAtual.taxa_percentual || 0;
        document.getElementById('ativo').value = plataformaAtual.ativo ? 'true' : 'false';
        
        document.getElementById('modalTitle').textContent = 'Editar Plataforma de Venda';
        
        // Exibir modal
        document.getElementById('plataformaModal').classList.add('active');
    } catch (error) {
        console.error('Erro ao carregar plataforma:', error);
        alert('Erro ao carregar dados da plataforma.');
    }
}

// Salvar plataforma
async function salvarPlataforma() {
    const form = document.getElementById('plataformaForm');
    
    if (!form.checkValidity()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    const dados = {
        nome: document.getElementById('nome').value.trim(),
        descricao: document.getElementById('descricao').value.trim() || null,
        url: document.getElementById('url').value.trim() || null,
        taxa_percentual: parseFloat(document.getElementById('taxa_percentual').value) || 0,
        ativo: document.getElementById('ativo').value === 'true'
    };
    
    try {
        if (editandoPlataforma && plataformaAtual) {
            await apiPut(`/api/plataformas-venda/${plataformaAtual.id}`, dados);
            alert('Plataforma atualizada com sucesso!');
        } else {
            await apiPost('/api/plataformas-venda', dados);
            alert('Plataforma criada com sucesso!');
        }
        
        fecharModal();
        carregarPlataformas();
    } catch (error) {
        console.error('Erro ao salvar plataforma:', error);
        alert('Erro ao salvar plataforma: ' + (error.detail || error.message || 'Erro desconhecido'));
    }
}

// Excluir plataforma
async function excluirPlataforma(id) {
    if (!confirm('Tem certeza que deseja excluir esta plataforma de venda?')) {
        return;
    }
    
    try {
        await apiDelete(`/api/plataformas-venda/${id}`);
        alert('Plataforma excluída com sucesso!');
        carregarPlataformas();
    } catch (error) {
        console.error('Erro ao excluir plataforma:', error);
        alert('Erro ao excluir plataforma: ' + (error.detail || error.message || 'Erro desconhecido'));
    }
}

// Fechar modal
function fecharModal() {
    document.getElementById('plataformaModal').classList.remove('active');
    document.getElementById('plataformaForm').reset();
    plataformaAtual = null;
    editandoPlataforma = false;
}
