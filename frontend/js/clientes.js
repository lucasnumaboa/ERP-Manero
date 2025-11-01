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

    // Carrega a lista de clientes
    loadClientes();

    // Configura os botões de ação
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

// Carrega a lista de clientes da API
async function loadClientes() {
    console.log('Carregando clientes da API centralizada');
    
    // Mostra mensagem de carregamento
    const tableBody = document.getElementById('clientesTableBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando clientes...</td></tr>';
    }
    
    // Obtém valores dos filtros com verificação de null
    const statusElement = document.getElementById('statusCliente');
    const tipoElement = document.getElementById('tipoCliente');
    const status = statusElement ? statusElement.value : '';
    const tipo = tipoElement ? tipoElement.value : '';
    
    // Constrói os parâmetros de consulta
    const params = new URLSearchParams();
    if (status !== '') params.append('ativo', status);
    if (tipo !== '') params.append('tipo', tipo);
    
    try {
        // Usa a API centralizada
        const url = `/api/clientes${params.toString() ? '?' + params.toString() : ''}`;
        console.log(`Enviando requisição GET para API centralizada: ${url}`);
        
        const data = await apiGet(url);
        console.log('Clientes carregados com sucesso:', data.length);
        
        // Configuração da paginação
        window.currentDisplayFunction = displayClientes;
        initPagination(data, displayClientes);
    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('clientesTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar clientes. Tente novamente.</td></tr>';
    }
}

// Exibe os clientes na tabela
function displayClientes(clientes) {
    const tbody = document.getElementById('clientesTableBody');
    
    if (!clientes || clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum cliente encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    clientes.forEach(cliente => {
        const row = document.createElement('tr');
        
        // Status com cor
        const statusClass = cliente.ativo ? 'status-active' : 'status-inactive';
        const statusText = cliente.ativo ? 'Ativo' : 'Inativo';
        
        row.innerHTML = `
            <td>${cliente.nome}</td>
            <td>${cliente.cpf_cnpj || '-'}</td>
            <td>${cliente.email || '-'}</td>
            <td>${cliente.telefone || '-'}</td>
            <td>${cliente.cidade ? cliente.cidade + '/' + cliente.estado : '-'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                <button class="btn-icon btn-edit" data-id="${cliente.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${cliente.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Adiciona event listeners para os botões de editar e excluir
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            openClienteModal(id);
        });
    });
    
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            deleteCliente(id);
        });
    });
}

// Configura os botões de ação
function setupActionButtons() {
    // Botão Novo Cliente
    const btnNovoCliente = document.getElementById('btnNovoCliente');
    if (btnNovoCliente) {
        btnNovoCliente.addEventListener('click', function() {
            openClienteModal();
        });
    }
    
    // Botão Fechar Modal
    document.querySelectorAll('.close-modal, #btnCancelar').forEach(button => {
        button.addEventListener('click', function() {
            closeModal('clienteModal');
        });
    });
    
    // Botão Salvar
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', function() {
            saveCliente();
        });
    }
    
    // Botões de filtro
    const filterTipo = document.getElementById('tipoCliente');
    if (filterTipo) {
        filterTipo.addEventListener('change', function() {
            // Implementar filtro por tipo
            loadClientes(); // Por enquanto apenas recarrega
        });
    }
    
    const filterStatus = document.getElementById('statusCliente');
    if (filterStatus) {
        filterStatus.addEventListener('change', function() {
            // Implementar filtro por status
            loadClientes(); // Por enquanto apenas recarrega
        });
    }
    
    // Evento para formatar CPF/CNPJ conforme o tipo selecionado
    const tipoElement = document.getElementById('tipo');
    if (tipoElement) {
        tipoElement.addEventListener('change', function() {
            const cpfCnpjInput = document.getElementById('cpf_cnpj');
            if (cpfCnpjInput) {
                cpfCnpjInput.placeholder = this.value === 'pessoa_fisica' ? 'CPF (apenas números)' : 'CNPJ (apenas números)';
            }
        });
    }
    
    // Evento para buscar endereço pelo CEP
    const cepElement = document.getElementById('cep');
    if (cepElement) {
        cepElement.addEventListener('blur', function() {
            const cep = this.value.replace(/\D/g, '');
            if (cep.length === 8) {
                buscarEnderecoPorCEP(cep);
            }
        });
    }
}

// Busca endereço pelo CEP usando a API ViaCEP
function buscarEnderecoPorCEP(cep) {
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then(response => response.json())
        .then(data => {
            if (!data.erro) {
                document.getElementById('endereco').value = `${data.logradouro}, ${data.bairro}`;
                document.getElementById('cidade').value = data.localidade;
                document.getElementById('estado').value = data.uf;
            }
        })
        .catch(error => console.error('Erro ao buscar CEP:', error));
}

// Abre o modal de cliente
function openClienteModal(clienteId = null) {
    // Limpa o formulário
    document.getElementById('clienteForm').reset();
    
    // Define o título do modal
    document.getElementById('modalTitle').textContent = clienteId ? 'Editar Cliente' : 'Novo Cliente';
    
    // Se for edição, carrega os dados do cliente
    if (clienteId) {
        loadClienteData(clienteId);
    }
    
    // Abre o modal
    document.getElementById('clienteModal').classList.add('active');
}

// Carrega os dados de um cliente específico
async function loadClienteData(clienteId) {
    try {
        // Usa a API centralizada
        const cliente = await apiGet(`/api/clientes/${clienteId}`);
        
        // Preenche o formulário com os dados do cliente
        document.getElementById('nome').value = cliente.nome || '';
        document.getElementById('tipo').value = cliente.tipo || 'pessoa_fisica';
        document.getElementById('cpf_cnpj').value = cliente.cpf_cnpj || '';
        document.getElementById('email').value = cliente.email || '';
        document.getElementById('telefone').value = cliente.telefone || '';
        document.getElementById('cep').value = cliente.cep || '';
        document.getElementById('endereco').value = cliente.endereco || '';
        document.getElementById('cidade').value = cliente.cidade || '';
        document.getElementById('estado').value = cliente.estado || '';
        document.getElementById('ativo').checked = cliente.ativo;
        
        // Armazena o ID do cliente no formulário para uso posterior
        document.getElementById('clienteForm').setAttribute('data-id', clienteId);
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao carregar dados do cliente: ${error.message}`);
    }
}

// Fecha o modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Salva o cliente (novo ou edição)
async function saveCliente() {
    const form = document.getElementById('clienteForm');
    const clienteId = form.getAttribute('data-id');
    
    // Coleta os dados do formulário
    const clienteData = {
        nome: document.getElementById('nome').value,
        tipo: document.getElementById('tipo').value,
        cpf_cnpj: document.getElementById('cpf_cnpj').value,
        email: document.getElementById('email').value,
        telefone: document.getElementById('telefone').value,
        cep: document.getElementById('cep').value,
        endereco: document.getElementById('endereco').value,
        cidade: document.getElementById('cidade').value,
        estado: document.getElementById('estado').value,
        ativo: document.getElementById('ativo').checked
    };
    
    try {
        // Usa a API centralizada
        if (clienteId) {
            // Atualiza cliente existente
            await apiPut(`/api/clientes/${clienteId}`, clienteData);
        } else {
            // Cria novo cliente
            await apiPost('/api/clientes', clienteData);
        }
        
        // Fecha o modal
        closeModal('clienteModal');
        
        // Recarrega a lista de clientes
        loadClientes();
        
        // Exibe mensagem de sucesso
        alert(clienteId ? 'Cliente atualizado com sucesso!' : 'Cliente criado com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao salvar cliente: ${error.message}`);
    }
}

// Exclui um cliente
async function deleteCliente(clienteId) {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) {
        return;
    }
    
    try {
        // Usa a API centralizada
        await apiDelete(`/api/clientes/${clienteId}`);
        
        // Recarrega a lista de clientes
        loadClientes();
        
        // Exibe mensagem de sucesso
        alert('Cliente excluído com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao excluir cliente: ${error.message}`);
    }
}
