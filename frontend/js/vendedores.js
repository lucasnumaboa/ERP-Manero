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

    // Carrega a lista de vendedores
    loadVendedores();

    // Configura os botões de ação
    setupActionButtons();

    // Configura o filtro de status
    document.getElementById('filtroStatus').addEventListener('change', function() {
        loadVendedores();
    });
    
    // Verifica se há parâmetros na URL para abrir o modal
    checkUrlParams();
});

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

// Carrega a lista de vendedores da API
async function loadVendedores() {
    const statusFilter = document.getElementById('filtroStatus').value;
    
    // Mostra mensagem de carregamento
    document.getElementById('vendedoresTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando vendedores...</td></tr>';
    
    // Prepara os parâmetros de consulta
    const queryParams = {};
    if (statusFilter !== '') {
        queryParams.ativo = statusFilter;
    }
    
    try {
        // Obtém dados do usuário atual
        const userData = await getCurrentUser();
        
        // Verifica se o usuário é administrador
        const isAdmin = userData && userData.nivel_acesso === 'admin';
        
        // Usa a nova API centralizada
        let data;
        
        if (isAdmin) {
            // Administrador vê todos os vendedores
            data = await apiGet('/api/vendedores', queryParams);
        } else {
            // Usuário comum (vendedor) - busca apenas o vendedor associado ao usuário
            // Primeiro, busca todos os vendedores
            const allVendedores = await apiGet('/api/vendedores', queryParams);
            
            // Filtra apenas o vendedor associado ao usuário atual
            if (userData && userData.id) {
                // Filtra vendedores que têm o mesmo ID de usuário
                const filteredVendedores = allVendedores.filter(vendedor => 
                    vendedor.usuario_id === userData.id
                );
                
                console.log('Filtrando vendedores para o usuário:', userData.id);
                console.log('Vendedores encontrados:', filteredVendedores.length);
                
                data = filteredVendedores;
            } else {
                data = [];
            }
        }
        
        // Configuração da paginação
        window.currentDisplayFunction = displayVendedores;
        initPagination(data, displayVendedores);
    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('vendedoresTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar vendedores. Tente novamente.</td></tr>';
    }
}

// Exibe os vendedores na tabela
async function displayVendedores(vendedores) {
    const tbody = document.getElementById('vendedoresTableBody');
    
    if (!vendedores || vendedores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum vendedor encontrado</td></tr>';
        return;
    }
    
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('vendedores_editar');
    
    tbody.innerHTML = '';
    
    vendedores.forEach(vendedor => {
        const row = document.createElement('tr');
        
        // Status com cor
        const statusClass = vendedor.ativo ? 'status-active' : 'status-inactive';
        const statusText = vendedor.ativo ? 'Ativo' : 'Inativo';
        
        // Monta os botões de ação baseado nas permissões
        let actionButtons = `
            <button class="btn-icon view-btn" data-id="${vendedor.id}" title="Visualizar">
                <i class="fas fa-eye"></i>
            </button>
        `;
        
        // Só adiciona botões de edição e exclusão se o usuário tiver permissão
        if (canEdit) {
            actionButtons += `
                <button class="btn-icon edit-btn" data-id="${vendedor.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete-btn" data-id="${vendedor.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }
        
        row.innerHTML = `
            <td>${vendedor.id}</td>
            <td>${vendedor.nome}</td>
            <td>${vendedor.email || '-'}</td>
            <td>${vendedor.telefone || '-'}</td>
            <td>${vendedor.comissao_percentual}%</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                ${actionButtons}
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Adiciona os event listeners para os botões de ação
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => viewVendedor(btn.getAttribute('data-id')));
    });
    
    // Só adiciona listeners para edição e exclusão se o usuário tiver permissão
    if (canEdit) {
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => editVendedor(btn.getAttribute('data-id')));
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteVendedor(btn.getAttribute('data-id')));
        });
    }
}

// Configura os botões de ação
async function setupActionButtons() {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('vendedores_editar');
    
    // Botão Novo Vendedor - só exibe se tiver permissão de edição
    const btnNovoVendedor = document.getElementById('btnNovoVendedor');
    if (canEdit) {
        btnNovoVendedor.addEventListener('click', function() {
            openVendedorModal();
        });
    } else {
        // Oculta o botão se não tiver permissão
        btnNovoVendedor.style.display = 'none';
    }
    
    // Botão Cancelar do modal
    document.getElementById('btnCancelar').addEventListener('click', function() {
        closeModal('vendedorModal');
    });
    
    // Botão Salvar do modal
    document.getElementById('btnSalvar').addEventListener('click', saveVendedor);
    
    // Botão Fechar do modal
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });
}

// Fecha o modal especificado
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Abre o modal de vendedor
async function openVendedorModal(vendedorId = null) {
    // Se for para criar novo vendedor, verifica permissão de edição
    if (!vendedorId) {
        const canEdit = await hasPermission('vendedores_editar');
        if (!canEdit) {
            alert('Você não tem permissão para criar vendedores.');
            return;
        }
    }
    
    const modal = document.getElementById('vendedorModal');
    const form = document.getElementById('vendedorForm');
    const modalTitle = document.getElementById('modalTitle');
    
    // Limpa o formulário
    form.reset();
    document.getElementById('vendedor_id').value = '';
    
    // Carrega a lista de usuários para o select
    loadUsuarios();
    
    if (vendedorId) {
        // Modo de edição
        modalTitle.textContent = 'Editar Vendedor';
        loadVendedorData(vendedorId);
    } else {
        // Modo de criação
        modalTitle.textContent = 'Novo Vendedor';
        document.getElementById('comissao_percentual').value = '0';
        document.getElementById('ativo').value = 'true';
    }
    
    // Exibe o modal
    modal.classList.add('active');
}

// Carrega os dados de um vendedor específico
async function loadVendedorData(vendedorId) {
    try {
        // Usa a nova API centralizada
        const vendedor = await apiGet(`/api/vendedores/${vendedorId}`);
        
        // Preenche o formulário com os dados do vendedor
        document.getElementById('vendedor_id').value = vendedor.id;
        document.getElementById('nome').value = vendedor.nome || '';
        document.getElementById('email').value = vendedor.email || '';
        document.getElementById('telefone').value = vendedor.telefone || '';
        document.getElementById('comissao_percentual').value = vendedor.comissao_percentual || 0;
        document.getElementById('usuario_id').value = vendedor.usuario_id || '';
        document.getElementById('ativo').value = vendedor.ativo.toString();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados do vendedor. Tente novamente.');
        closeModal('vendedorModal');
    }
}

// Carrega a lista de usuários para o select
async function loadUsuarios() {
    const selectUsuario = document.getElementById('usuario_id');
    
    // Mantém apenas a primeira opção (placeholder)
    selectUsuario.innerHTML = '<option value="">Selecione um usuário (opcional)</option>';
    
    try {
        // Usa a nova API centralizada
        const usuarios = await apiGet('/api/usuarios/');
        
        // Adiciona as opções de usuários ao select
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.email})`;
            selectUsuario.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

// Salva o vendedor (novo ou edição)
async function saveVendedor() {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('vendedores_editar');
    if (!canEdit) {
        alert('Você não tem permissão para salvar vendedores.');
        return;
    }
    
    // Obtém os dados do formulário
    const vendedorId = document.getElementById('vendedor_id').value;
    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;
    const telefone = document.getElementById('telefone').value;
    const comissao_percentual = parseFloat(document.getElementById('comissao_percentual').value);
    const usuario_id = document.getElementById('usuario_id').value;
    const ativo = document.getElementById('ativo').value === 'true';
    
    // Validação básica
    if (!nome) {
        alert('Por favor, preencha o nome do vendedor.');
        return;
    }
    
    if (isNaN(comissao_percentual) || comissao_percentual < 0 || comissao_percentual > 100) {
        alert('Por favor, informe uma comissão válida (entre 0 e 100%).');
        return;
    }
    
    // Prepara os dados para envio
    const vendedorData = {
        nome,
        email: email || null,
        telefone: telefone || null,
        comissao_percentual,
        usuario_id: usuario_id || null,
        ativo
    };
    
    try {
        let data;
        
        // Usa a nova API centralizada
        if (vendedorId) {
            // Atualiza vendedor existente
            data = await apiPut(`/api/vendedores/${vendedorId}`, vendedorData);
        } else {
            // Cria novo vendedor
            data = await apiPost('/api/vendedores', vendedorData);
        }
        
        // Fecha o modal
        closeModal('vendedorModal');
        
        // Recarrega a lista de vendedores
        loadVendedores();
        
        // Exibe mensagem de sucesso
        alert(vendedorId ? 'Vendedor atualizado com sucesso!' : 'Vendedor criado com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao salvar vendedor: ${error.message}`);
    }
}

// Visualiza um vendedor
function viewVendedor(vendedorId) {
    // Abre o modal em modo de visualização
    openVendedorModal(vendedorId);
    
    // Desabilita os campos do formulário
    document.querySelectorAll('#vendedorForm input, #vendedorForm select').forEach(field => {
        field.disabled = true;
    });
    
    // Altera o texto do botão Salvar para Fechar
    document.getElementById('btnSalvar').textContent = 'Fechar';
    document.getElementById('btnSalvar').onclick = function() {
        closeModal('vendedorModal');
    };
    
    // Esconde o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'none';
}

// Edita um vendedor
async function editVendedor(vendedorId) {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('vendedores_editar');
    if (!canEdit) {
        alert('Você não tem permissão para editar vendedores.');
        return;
    }
    
    // Abre o modal em modo de edição
    openVendedorModal(vendedorId);
    
    // Habilita os campos do formulário
    document.querySelectorAll('#vendedorForm input, #vendedorForm select').forEach(field => {
        field.disabled = false;
    });
    
    // Restaura o texto do botão Salvar
    document.getElementById('btnSalvar').textContent = 'Salvar';
    document.getElementById('btnSalvar').onclick = saveVendedor;
    
    // Exibe o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'inline-block';
}

// Exclui um vendedor
async function deleteVendedor(vendedorId) {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('vendedores_editar');
    if (!canEdit) {
        alert('Você não tem permissão para excluir vendedores.');
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir este vendedor?')) {
        return;
    }
    
    try {
        // Usa a nova API centralizada
        await apiDelete(`/api/vendedores/${vendedorId}`);
        
        // Recarrega a lista de vendedores
        loadVendedores();
        
        // Exibe mensagem de sucesso
        alert('Vendedor excluído com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao excluir vendedor: ${error.message}`);
    }
}

// Verifica se há parâmetros na URL para abrir o modal
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const returnTo = urlParams.get('return');
    
    if (action === 'new') {
        // Abre o modal para novo vendedor
        openVendedorModal();
        
        // Armazena a informação de retorno
        if (returnTo) {
            sessionStorage.setItem('returnTo', returnTo);
        }
    }
}
