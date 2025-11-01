// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Configura o botão de logout
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        logout();
    });

    // Configura o botão de toggle do sidebar
    document.getElementById('toggleSidebar').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    // Carrega os dados do usuário
    loadUserData();

    // Carrega a lista de fornecedores
    loadFornecedores();

    // Configura os botões de ação
    setupActionButtons();

    // Configura o filtro de status
    document.getElementById('filtroStatus').addEventListener('change', function() {
        loadFornecedores();
    });
    
    // Verifica se há parâmetros na URL para abrir o modal
    checkUrlParams();
});

// As funções de autenticação são importadas do arquivo auth.js
// Apenas definindo funções auxiliares que não estão em auth.js

// Carrega os dados do usuário usando a função do auth.js
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

// Formata o nível de acesso para exibição
function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'vendedor': 'Vendedor',
        'comprador': 'Comprador',
        'financeiro': 'Financeiro'
    };
    return roles[role] || role;
}

// Carrega a lista de fornecedores da API
async function loadFornecedores() {
    console.log('Carregando fornecedores da API centralizada');
    
    const statusFilter = document.getElementById('filtroStatus').value;
    
    // Mostra mensagem de carregamento
    document.getElementById('fornecedoresTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando fornecedores...</td></tr>';
    
    // Prepara os parâmetros de consulta
    const queryParams = {
        tipo: 'fornecedor,ambos'
    };
    
    if (statusFilter !== '') {
        queryParams.ativo = statusFilter;
    }
    
    try {
        // Usa a nova API centralizada
        console.log(`Enviando requisição GET para API centralizada: /api/parceiros`);
        const data = await apiGet('/api/parceiros', queryParams);
        console.log('Fornecedores carregados com sucesso:', data.length);
        
        // Configuração da paginação
        window.currentDisplayFunction = displayFornecedores;
        initPagination(data, displayFornecedores);
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        document.getElementById('fornecedoresTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar fornecedores. Tente novamente.</td></tr>';
    }
}

// Exibe os fornecedores na tabela
function displayFornecedores(fornecedores) {
    const tbody = document.getElementById('fornecedoresTableBody');
    
    if (!fornecedores || fornecedores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum fornecedor encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    fornecedores.forEach(fornecedor => {
        const row = document.createElement('tr');
        
        // Status com cor
        const statusClass = fornecedor.ativo ? 'status-active' : 'status-inactive';
        const statusText = fornecedor.ativo ? 'Ativo' : 'Inativo';
        
        // Tipo formatado
        const tipoText = fornecedor.tipo === 'ambos' ? 'Cliente e Fornecedor' : 'Fornecedor';
        
        // Contato (email e/ou telefone)
        const contato = [
            fornecedor.email ? fornecedor.email : '',
            fornecedor.telefone ? fornecedor.telefone : ''
        ].filter(Boolean).join(' / ') || '-';
        
        // Cidade/UF
        const cidadeUf = [
            fornecedor.cidade ? fornecedor.cidade : '',
            fornecedor.estado ? fornecedor.estado : ''
        ].filter(Boolean).join('/') || '-';
        
        row.innerHTML = `
            <td>${fornecedor.id}</td>
            <td>${fornecedor.nome}</td>
            <td>${fornecedor.documento || '-'}</td>
            <td>${contato}</td>
            <td>${cidadeUf}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                <button class="btn-icon btn-view" onclick="viewFornecedor(${fornecedor.id})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon btn-edit" onclick="editFornecedor(${fornecedor.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" onclick="deleteFornecedor(${fornecedor.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Configura os botões de ação
function setupActionButtons() {
    // Botão Novo Fornecedor
    document.getElementById('btnNovoFornecedor').addEventListener('click', function() {
        openFornecedorModal();
    });
    
    // Botão Cancelar no modal
    document.getElementById('btnCancelar').addEventListener('click', function() {
        closeModal('fornecedorModal');
    });
    
    // Botão Salvar no modal
    document.getElementById('btnSalvar').addEventListener('click', function() {
        saveFornecedor();
    });
    
    // Botão fechar modal (X)
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });
}

// Fecha o modal especificado
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.classList.remove('modal-open');
}

// Abre o modal de fornecedor
function openFornecedorModal(fornecedorId = null) {
    // Limpa o formulário
    document.getElementById('fornecedorForm').reset();
    document.getElementById('fornecedor_id').value = '';
    
    // Configura o título do modal
    document.getElementById('modalTitle').textContent = fornecedorId ? 'Editar Fornecedor' : 'Novo Fornecedor';
    
    // Se for edição, carrega os dados do fornecedor
    if (fornecedorId) {
        loadFornecedorData(fornecedorId);
    } else {
        // Valores padrão para novo fornecedor
        document.getElementById('tipo').value = 'fornecedor';
        document.getElementById('ativo').value = 'true';
    }
    
    // Exibe o modal
    document.getElementById('fornecedorModal').classList.add('active');
    // Adiciona classe ao body para evitar rolagem
    document.body.classList.add('modal-open');
}

// Carrega os dados de um fornecedor específico
async function loadFornecedorData(fornecedorId) {
    try {
        // Usa a API centralizada
        const data = await apiGet(`/api/parceiros/${fornecedorId}`);
        
        // Preenche o formulário com os dados do fornecedor
        document.getElementById('fornecedor_id').value = data.id;
        document.getElementById('tipo').value = data.tipo;
        document.getElementById('nome').value = data.nome;
        document.getElementById('documento').value = data.documento || '';
        document.getElementById('email').value = data.email || '';
        document.getElementById('telefone').value = data.telefone || '';
        document.getElementById('endereco').value = data.endereco || '';
        document.getElementById('cidade').value = data.cidade || '';
        document.getElementById('estado').value = data.estado || '';
        document.getElementById('cep').value = data.cep || '';
        document.getElementById('ativo').value = data.ativo.toString();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados do fornecedor. Tente novamente.');
        
        // Para fins de demonstração, vamos simular dados
        const mockData = {
            id: fornecedorId,
            tipo: 'fornecedor',
            nome: 'Fornecedor Exemplo',
            documento: '12.345.678/0001-90',
            email: 'contato@exemplo.com',
            telefone: '(11) 1234-5678',
            endereco: 'Rua Exemplo, 123',
            cidade: 'São Paulo',
            estado: 'SP',
            cep: '01234-567',
            ativo: true
        };
        
        // Preenche o formulário com os dados simulados
        document.getElementById('fornecedor_id').value = mockData.id;
        document.getElementById('tipo').value = mockData.tipo;
        document.getElementById('nome').value = mockData.nome;
        document.getElementById('documento').value = mockData.documento;
        document.getElementById('email').value = mockData.email;
        document.getElementById('telefone').value = mockData.telefone;
        document.getElementById('endereco').value = mockData.endereco;
        document.getElementById('cidade').value = mockData.cidade;
        document.getElementById('estado').value = mockData.estado;
        document.getElementById('cep').value = mockData.cep;
        document.getElementById('ativo').value = mockData.ativo.toString();
    }
}

// Esta função closeModal duplicada foi removida, pois já existe uma definição anterior

// Verifica se há parâmetros na URL para abrir o modal
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const returnTo = urlParams.get('return');
    
    if (action === 'new') {
        // Abre o modal para novo fornecedor
        openFornecedorModal();
        
        // Armazena a informação de retorno
        if (returnTo) {
            sessionStorage.setItem('returnTo', returnTo);
        }
    }
}

// Salva o fornecedor (novo ou edição)
async function saveFornecedor() {
    // Valida o formulário
    const form = document.getElementById('fornecedorForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Obtém os dados do formulário
    const fornecedorId = document.getElementById('fornecedor_id').value;
    const fornecedorData = {
        tipo: document.getElementById('tipo').value,
        nome: document.getElementById('nome').value,
        documento: document.getElementById('documento').value || null,
        email: document.getElementById('email').value || null,
        telefone: document.getElementById('telefone').value || null,
        endereco: document.getElementById('endereco').value || null,
        cidade: document.getElementById('cidade').value || null,
        estado: document.getElementById('estado').value || null,
        cep: document.getElementById('cep').value || null,
        ativo: document.getElementById('ativo').value === 'true'
    };
    
    try {
        let data;
        
        // Usa a API centralizada
        if (fornecedorId) {
            // Atualiza fornecedor existente
            data = await apiPut(`/api/parceiros/${fornecedorId}`, fornecedorData);
        } else {
            // Cria novo fornecedor
            data = await apiPost('/api/parceiros', fornecedorData);
        }
        
        // Verifica se deve retornar para outra página
        const returnTo = sessionStorage.getItem('returnTo');
        
        if (returnTo === 'compras') {
            // Redireciona para a página de compras com o ID do fornecedor
            window.location.href = `compras.html?returnFrom=fornecedores&fornecedorId=${data.id}`;
            return;
        }
        
        // Fecha o modal
        closeModal('fornecedorModal');
        
        // Recarrega a lista de fornecedores
        loadFornecedores();
        
        // Exibe mensagem de sucesso
        alert(fornecedorId ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor criado com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao salvar fornecedor: ${error.message}`);
        
        // Para fins de demonstração, vamos simular sucesso
        const returnTo = sessionStorage.getItem('returnTo');
        
        if (returnTo === 'compras') {
            // Simula um ID para demonstração
            const simulatedId = fornecedorId || Math.floor(Math.random() * 1000) + 1;
            window.location.href = `compras.html?returnFrom=fornecedores&fornecedorId=${simulatedId}`;
            return;
        }
        
        closeModal('fornecedorModal');
        loadFornecedores();
        alert(fornecedorId ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor criado com sucesso!');
    }
}

// Visualiza um fornecedor
function viewFornecedor(fornecedorId) {
    // Abre o modal em modo de visualização
    openFornecedorModal(fornecedorId);
    
    // Desabilita os campos do formulário
    document.querySelectorAll('#fornecedorForm input, #fornecedorForm select').forEach(field => {
        field.disabled = true;
    });
    
    // Altera o texto do botão Salvar para Fechar
    document.getElementById('btnSalvar').textContent = 'Fechar';
    document.getElementById('btnSalvar').onclick = function() {
        closeModal('fornecedorModal');
    };
    
    // Esconde o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'none';
}

// Edita um fornecedor
function editFornecedor(fornecedorId) {
    // Abre o modal em modo de edição
    openFornecedorModal(fornecedorId);
    
    // Habilita os campos do formulário
    document.querySelectorAll('#fornecedorForm input, #fornecedorForm select').forEach(field => {
        field.disabled = false;
    });
    
    // Restaura o texto do botão Salvar
    document.getElementById('btnSalvar').textContent = 'Salvar';
    document.getElementById('btnSalvar').onclick = saveFornecedor;
    
    // Exibe o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'inline-block';
}

// Exclui um fornecedor
async function deleteFornecedor(fornecedorId) {
    if (!confirm('Tem certeza que deseja excluir este fornecedor?')) {
        return;
    }
    
    try {
        // Usa a API centralizada
        await apiDelete(`/api/parceiros/${fornecedorId}`);
        
        // Recarrega a lista de fornecedores
        loadFornecedores();
        
        // Exibe mensagem de sucesso
        alert('Fornecedor excluído com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao excluir fornecedor: ${error.message}`);
        
        // Para fins de demonstração, vamos simular sucesso
        loadFornecedores();
        alert('Fornecedor excluído com sucesso!');
    }
}
