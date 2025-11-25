// Variáveis globais
let condicoes = [];
let condicaoAtual = null;
let editandoCondicao = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado - iniciando configuração da página de condições de pagamento');
    
    // Verificar autenticação
    checkAuth();
    
    // Carregar dados do usuário
    loadUserData();
    
    // Configurar sidebar toggle
    setupSidebarToggle();
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Carregar dados iniciais
    carregarCondicoes();
    
    // Configurar botão Nova Condição
    const btnNovaCondicao = document.getElementById('btnNovaCondicao');
    if (btnNovaCondicao) {
        btnNovaCondicao.addEventListener('click', abrirModalNovaCondicao);
    }
    
    document.getElementById('btnCancelar').addEventListener('click', fecharModalCondicao);
    document.getElementById('btnSalvar').addEventListener('click', salvarCondicao);
    
    // Configurar eventos de fechamento de modal
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const modal = button.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.classList.remove('modal-open');
                
                if (modal.id === 'condicaoModal') {
                    limparFormularioCondicao();
                }
            }
        });
    });
    
    // Configurar fechamento ao clicar fora do modal
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.classList.remove('modal-open');
                
                if (modal.id === 'condicaoModal') {
                    limparFormularioCondicao();
                }
            }
        });
    });
    
    // Configurar filtros
    document.getElementById('filtroPesquisa').addEventListener('input', filtrarCondicoes);
    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltros);
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

// Funções para manipulação do sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    toggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });
}

// Funções para carregar dados
async function carregarCondicoes() {
    try {
        const canView = await hasPermission('financeiro_visualizar');
        if (!canView) {
            console.warn('Usuário sem permissão para visualizar condições de pagamento');
            const tbody = document.getElementById('condicoesTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">Você não tem acesso para visualizar condições de pagamento.</td></tr>';
            }
            return;
        }

        condicoes = await apiGet('/api/condicoes-pagamento');
        
        window.currentDisplayFunction = renderizarCondicoes;
        initPagination(condicoes, renderizarCondicoes);
    } catch (error) {
        console.error('Erro ao carregar condições de pagamento:', error);
        document.getElementById('condicoesTableBody').innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar condições de pagamento. Por favor, tente novamente.</td></tr>';
    }
}

// Funções para renderizar dados
async function renderizarCondicoes(condicoes) {
    const tbody = document.getElementById('condicoesTableBody');
    tbody.innerHTML = '';
    
    if (condicoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma condição de pagamento encontrada</td></tr>';
        return;
    }
    
    for (const condicao of condicoes) {
        const statusBadge = condicao.ativo ? '<span class="status-badge ativo">Ativo</span>' : '<span class="status-badge inativo">Inativo</span>';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${condicao.codigo}</td>
            <td>${condicao.nome}</td>
            <td>${condicao.prazo_dias} dias</td>
            <td>${condicao.numero_parcelas}x</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-edit" data-id="${condicao.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" data-id="${condicao.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    }
    
    // Adicionar event listeners para os botões de ação
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            editarCondicao(id);
        });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            if (confirm('Tem certeza que deseja excluir esta condição de pagamento?')) {
                excluirCondicao(id);
            }
        });
    });
}

// Funções para manipulação de condições
function abrirModalNovaCondicao() {
    editandoCondicao = false;
    condicaoAtual = null;
    
    const condicaoForm = document.getElementById('condicaoForm');
    if (condicaoForm) {
        condicaoForm.reset();
    }
    
    document.getElementById('modalTitle').textContent = 'Nova Condição de Pagamento';
    document.getElementById('ativo').checked = true;
    
    const condicaoModal = document.getElementById('condicaoModal');
    if (condicaoModal) {
        condicaoModal.style.display = '';
        condicaoModal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

async function editarCondicao(id) {
    editandoCondicao = true;
    
    try {
        condicaoAtual = await apiGet(`/api/condicoes-pagamento/${id}`);
    } catch (error) {
        console.error('Erro ao obter detalhes da condição:', error);
        alert('Erro ao carregar dados da condição. Por favor, tente novamente.');
        return;
    }
    
    if (!condicaoAtual) {
        alert('Condição não encontrada!');
        return;
    }
    
    // Preencher formulário com dados da condição
    document.getElementById('modalTitle').textContent = `Editar Condição #${condicaoAtual.id}`;
    document.getElementById('codigo').value = condicaoAtual.codigo || '';
    document.getElementById('nome').value = condicaoAtual.nome || '';
    document.getElementById('prazo_dias').value = condicaoAtual.prazo_dias || 0;
    document.getElementById('numero_parcelas').value = condicaoAtual.numero_parcelas || 1;
    document.getElementById('ativo').checked = condicaoAtual.ativo || false;
    
    // Exibir modal
    document.getElementById('condicaoModal').style.display = 'flex';
}

function fecharModalCondicao() {
    document.getElementById('condicaoModal').style.display = 'none';
    document.getElementById('condicaoModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    limparFormularioCondicao();
}

function limparFormularioCondicao() {
    document.getElementById('condicaoForm').reset();
    editandoCondicao = false;
    condicaoAtual = null;
}

async function salvarCondicao() {
    const form = document.getElementById('condicaoForm');
    if (!form.checkValidity()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    const condicaoData = {
        codigo: document.getElementById('codigo').value,
        nome: document.getElementById('nome').value,
        prazo_dias: parseInt(document.getElementById('prazo_dias').value),
        numero_parcelas: parseInt(document.getElementById('numero_parcelas').value),
        ativo: document.getElementById('ativo').checked
    };
    
    console.log('Dados da condição a serem enviados:', condicaoData);
    
    if (editandoCondicao && condicaoAtual) {
        await atualizarCondicao(condicaoAtual.id, condicaoData);
    } else {
        await criarCondicao(condicaoData);
    }
}

async function criarCondicao(condicaoData) {
    try {
        console.log('Dados da condição a serem enviados:', condicaoData);
        
        await apiPost('/api/condicoes-pagamento', condicaoData);
        
        alert('Condição de pagamento criada com sucesso!');
        fecharModalCondicao();
        carregarCondicoes();
    } catch (error) {
        console.error('Erro ao criar condição de pagamento:', error);
        
        let errorMessage = 'Erro ao criar condição de pagamento: ';
        
        if (error.detail) {
            if (Array.isArray(error.detail)) {
                console.error('Array de erros:', error.detail);
                errorMessage += error.detail.join(', ');
            } else {
                errorMessage += error.detail;
            }
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }
        
        alert(errorMessage);
    }
}

async function atualizarCondicao(id, condicaoData) {
    try {
        await apiPut(`/api/condicoes-pagamento/${id}`, condicaoData);
        
        alert('Condição de pagamento atualizada com sucesso!');
        fecharModalCondicao();
        carregarCondicoes();
    } catch (error) {
        console.error('Erro ao atualizar condição de pagamento:', error);
        
        let errorMessage = 'Erro ao atualizar condição de pagamento: ';
        
        if (error.detail) {
            if (Array.isArray(error.detail)) {
                console.error('Array de erros:', error.detail);
                errorMessage += error.detail.join(', ');
            } else {
                errorMessage += error.detail;
            }
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }
        
        alert(errorMessage);
    }
}

async function excluirCondicao(id) {
    try {
        await apiDelete(`/api/condicoes-pagamento/${id}`);
        
        alert('Condição de pagamento excluída com sucesso!');
        carregarCondicoes();
    } catch (error) {
        console.error('Erro ao excluir condição de pagamento:', error);
        
        let errorMessage = 'Erro ao excluir condição de pagamento: ';
        
        if (error.detail) {
            if (Array.isArray(error.detail)) {
                console.error('Array de erros:', error.detail);
                errorMessage += error.detail.join(', ');
            } else {
                errorMessage += error.detail;
            }
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }
        
        alert(errorMessage);
    }
}

// Funções de filtro
function filtrarCondicoes() {
    const termo = document.getElementById('filtroPesquisa').value.toLowerCase();
    
    const condicoesFiltradas = condicoes.filter(condicao => {
        return (
            condicao.codigo.toLowerCase().includes(termo) ||
            condicao.nome.toLowerCase().includes(termo)
        );
    });
    
    window.currentDisplayFunction = renderizarCondicoes;
    initPagination(condicoesFiltradas, renderizarCondicoes);
}

function limparFiltros() {
    document.getElementById('filtroPesquisa').value = '';
    carregarCondicoes();
}
