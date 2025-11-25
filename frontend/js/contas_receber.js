// Variável global para armazenar todas as contas
let todasAsContasReceber = [];

// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Carrega os dados do usuário
    loadUserData();

    // Carrega a lista de contas a receber
    carregarTodasAsContas();

    // Configura os botões de ação
    setupActionButtons();

    // Define datas padrão dos filtros (primeiro dia do mês até hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataInicial').valueAsDate = primeiroDiaDoMes;
    document.getElementById('filtroDataFinal').valueAsDate = hoje;

    // Configura os filtros
    document.getElementById('btnAplicarFiltros').addEventListener('click', aplicarFiltrosReceber);
    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltrosReceber);
});

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

// Carrega todas as contas a receber da API
async function carregarTodasAsContas() {
    // Mostra mensagem de carregamento
    document.getElementById('contasTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando contas a receber...</td></tr>';
    
    try {
        // Busca todas as contas sem filtro
        const data = await apiGet('/api/contas-receber', {});
        
        console.log('Dados recebidos:', data);
        
        // Converte para array se necessário
        let contas = [];
        if (Array.isArray(data)) {
            contas = data;
        } else if (data && typeof data === 'object') {
            if (data.data && Array.isArray(data.data)) {
                contas = data.data;
            } else if (data.contas && Array.isArray(data.contas)) {
                contas = data.contas;
            } else {
                contas = [data];
            }
        }
        
        // Armazena todas as contas globalmente
        todasAsContasReceber = contas;
        
        console.log('Total de contas carregadas:', todasAsContasReceber.length);
        
        // Exibe as contas
        if (!todasAsContasReceber || todasAsContasReceber.length === 0) {
            document.getElementById('contasTableBody').innerHTML = 
                '<tr><td colspan="7" class="text-center">Nenhuma conta a receber encontrada</td></tr>';
            return;
        }
        
        // Configuração da paginação
        window.currentDisplayFunction = displayContasReceber;
        initPagination(todasAsContasReceber, displayContasReceber);
    } catch (error) {
        console.error('Erro ao carregar contas a receber:', error);
        document.getElementById('contasTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar contas a receber. Verifique se o backend está rodando.</td></tr>';
    }
}

// Aplica os filtros
function aplicarFiltrosReceber() {
    const codigo = document.getElementById('filtroCodigo').value.toLowerCase();
    const cliente = document.getElementById('filtroCliente').value.toLowerCase();
    const dataInicial = document.getElementById('filtroDataInicial').value;
    const dataFinal = document.getElementById('filtroDataFinal').value;
    const status = document.getElementById('filterStatus').value;
    
    console.log('=== APLICANDO FILTROS - CONTAS A RECEBER ===');
    console.log('Filtros:', { codigo, cliente, dataInicial, dataFinal, status });
    console.log('Total de contas antes do filtro:', todasAsContasReceber.length);
    
    // Filtra as contas armazenadas
    let contasFiltradas = todasAsContasReceber.filter(conta => {
        // Filtro por código
        if (codigo && !conta.codigo.toLowerCase().includes(codigo)) {
            return false;
        }
        
        // Filtro por cliente
        const nomeCliente = (conta.cliente_nome || '').toLowerCase();
        if (cliente && !nomeCliente.includes(cliente)) {
            return false;
        }
        
        // Filtro por data inicial
        if (dataInicial && new Date(conta.data_vencimento) < new Date(dataInicial)) {
            return false;
        }
        
        // Filtro por data final
        if (dataFinal && new Date(conta.data_vencimento) > new Date(dataFinal)) {
            return false;
        }
        
        // Filtro por status
        if (status && conta.status !== status) {
            return false;
        }
        
        return true;
    });
    
    console.log('Total de contas após filtro:', contasFiltradas.length);
    
    // Exibe as contas filtradas
    if (contasFiltradas.length === 0) {
        document.getElementById('contasTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center">Nenhuma conta encontrada com os filtros aplicados</td></tr>';
        return;
    }
    
    // Configuração da paginação com contas filtradas
    window.currentDisplayFunction = displayContasReceber;
    initPagination(contasFiltradas, displayContasReceber);
}

// Limpa os filtros
function limparFiltrosReceber() {
    document.getElementById('filtroCodigo').value = '';
    document.getElementById('filtroCliente').value = '';
    document.getElementById('filtroDataInicial').value = '';
    document.getElementById('filtroDataFinal').value = '';
    document.getElementById('filterStatus').value = '';
    
    // Recarrega todas as contas
    carregarTodasAsContas();
}

// Exibe as contas a receber na tabela
async function displayContasReceber(contas) {
    const tbody = document.getElementById('contasTableBody');
    
    if (!contas || contas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma conta a receber encontrada</td></tr>';
        return;
    }
    
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    
    tbody.innerHTML = '';
    
    // Processa cada conta e busca o nome do cliente se necessário
    for (const conta of contas) {
        const row = document.createElement('tr');
        
        // Formata o status
        const statusClass = `status-${conta.status}`;
        const statusText = conta.status.charAt(0).toUpperCase() + conta.status.slice(1);
        
        // Obtém o nome do cliente
        let nomeCliente = conta.cliente_nome || 'N/A';
        
        // Monta os botões de ação baseado nas permissões
        let actionButtons = `
            <button class="btn-icon view-btn" data-id="${conta.id}" title="Visualizar">
                <i class="fas fa-eye"></i>
            </button>
        `;
        
        // Só adiciona botões de edição e exclusão se o usuário tiver permissão
        if (canEdit && conta.status === 'pendente') {
            actionButtons += `
                <button class="btn-icon edit-btn" data-id="${conta.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete-btn" data-id="${conta.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }
        
        row.innerHTML = `
            <td>${conta.codigo}</td>
            <td>${conta.descricao}</td>
            <td>${nomeCliente}</td>
            <td>${formatarMoeda(conta.valor)}</td>
            <td>${formatarData(conta.data_vencimento)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                ${actionButtons}
            </td>
        `;
        
        tbody.appendChild(row);
    }
    
    // Adiciona os event listeners para os botões de ação
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => viewConta(btn.getAttribute('data-id')));
    });
    
    // Só adiciona listeners para edição e exclusão se o usuário tiver permissão
    if (canEdit) {
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => editConta(btn.getAttribute('data-id')));
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteConta(btn.getAttribute('data-id')));
        });
    }
}

// Configura os botões de ação
async function setupActionButtons() {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    
    // Botão Nova Conta - só exibe se tiver permissão de edição
    const btnNovaConta = document.getElementById('btnNovaConta');
    if (canEdit) {
        btnNovaConta.addEventListener('click', function() {
            openContaModal();
        });
    } else {
        // Oculta o botão se não tiver permissão
        btnNovaConta.style.display = 'none';
    }
    
    // Botão Cancelar do modal
    document.getElementById('btnCancelar').onclick = function() {
        closeModal('contaModal');
    };
    
    // Botão Salvar do modal
    document.getElementById('btnSalvar').onclick = saveConta;
    
    // Botão Fechar do modal
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = function() {
            closeModal(this.closest('.modal').id);
        };
    });
    
    // Botão Limpar Filtros
    document.getElementById('btnLimparFiltros').onclick = function() {
        document.getElementById('filterStatus').value = '';
        carregarTodasAsContas();
    };
}

// Fecha o modal especificado
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Abre o modal de conta
async function openContaModal(contaId = null) {
    // Se for para criar nova conta, verifica permissão de edição
    if (!contaId) {
        const canEdit = await hasPermission('financeiro_editar');
        if (!canEdit) {
            alert('Você não tem permissão para criar contas a receber.');
            return;
        }
    }
    
    const modal = document.getElementById('contaModal');
    const form = document.getElementById('contaForm');
    const modalTitle = document.getElementById('modalTitle');
    
    // Limpa o formulário
    form.reset();
    
    // Carrega os dados para os selects
    loadClientes();
    
    if (contaId) {
        // Modo de edição
        modalTitle.textContent = 'Editar Conta a Receber';
        loadContaData(contaId);
    } else {
        // Modo de criação
        modalTitle.textContent = 'Nova Conta a Receber';
        document.getElementById('status').value = 'pendente';
    }
    
    // Exibe o modal
    modal.style.display = 'flex';
}

// Carrega os dados de uma conta específica
async function loadContaData(contaId) {
    try {
        // Usa a nova API centralizada
        const conta = await apiGet(`/api/contas-receber/${contaId}`);
        
        // Aguarda o carregamento dos selects antes de preencher
        await loadClientes();
        
        // Preenche o formulário com os dados da conta
        document.getElementById('descricao').value = conta.descricao || '';
        document.getElementById('cliente_id').value = conta.cliente_id || '';
        document.getElementById('valor').value = conta.valor || '';
        document.getElementById('data_vencimento').value = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : '';
        document.getElementById('forma_pagamento').value = conta.forma_pagamento || 'dinheiro';
        document.getElementById('status').value = conta.status || 'pendente';
        document.getElementById('observacoes').value = conta.observacoes || '';
        
        // Armazena o ID da conta no formulário
        const form = document.getElementById('contaForm');
        form.setAttribute('data-id', contaId);
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados da conta. Tente novamente.');
        closeModal('contaModal');
    }
}

// Carrega a lista de clientes para o select
async function loadClientes() {
    const selectCliente = document.getElementById('cliente_id');
    
    // Mantém apenas a primeira opção (placeholder)
    selectCliente.innerHTML = '<option value="">Selecione um cliente (opcional)</option>';
    
    try {
        // Usa a nova API centralizada
        const clientes = await apiGet('/api/parceiros');
        
        // Filtra apenas clientes
        const clientesFiltrados = clientes.filter(p => p.tipo === 'cliente');
        
        // Adiciona as opções de clientes ao select
        clientesFiltrados.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id;
            option.textContent = cliente.nome;
            selectCliente.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

// Salva a conta (nova ou edição)
async function saveConta() {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    if (!canEdit) {
        alert('Você não tem permissão para salvar contas a receber.');
        return;
    }
    
    // Obtém os dados do formulário
    const form = document.getElementById('contaForm');
    const contaId = form.getAttribute('data-id');
    const descricao = document.getElementById('descricao').value;
    const cliente_id = document.getElementById('cliente_id').value;
    const valor = parseFloat(document.getElementById('valor').value);
    const data_vencimento = document.getElementById('data_vencimento').value;
    const forma_pagamento = document.getElementById('forma_pagamento').value;
    const status = document.getElementById('status').value;
    const observacoes = document.getElementById('observacoes').value;
    
    // Validação básica
    if (!descricao) {
        alert('Por favor, preencha a descrição.');
        return;
    }
    
    if (isNaN(valor) || valor <= 0) {
        alert('Por favor, informe um valor válido.');
        return;
    }
    
    if (!data_vencimento) {
        alert('Por favor, informe a data de vencimento.');
        return;
    }
    
    // Prepara os dados para envio
    const contaData = {
        descricao,
        cliente_id: cliente_id || null,
        valor,
        data_vencimento,
        forma_pagamento,
        observacoes: observacoes || null
    };
    
    try {
        let data;
        
        // Usa a nova API centralizada
        if (contaId) {
            // Atualiza conta existente
            contaData.status = status;
            data = await apiPut(`/api/contas-receber/${contaId}`, contaData);
        } else {
            // Cria nova conta
            data = await apiPost('/api/contas-receber', contaData);
        }
        
        // Fecha o modal
        closeModal('contaModal');
        
        // Recarrega a lista de contas
        carregarTodasAsContas();
        
        // Exibe mensagem de sucesso
        alert(contaId ? 'Conta atualizada com sucesso!' : 'Conta criada com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao salvar conta: ${error.message}`);
    }
}

// Visualiza uma conta
function viewConta(contaId) {
    // Abre o modal em modo de visualização
    openContaModal(contaId);
    
    // Desabilita os campos do formulário
    document.querySelectorAll('#contaForm input, #contaForm select, #contaForm textarea').forEach(field => {
        field.disabled = true;
    });
    
    // Altera o texto do botão Salvar para Fechar
    document.getElementById('btnSalvar').textContent = 'Fechar';
    document.getElementById('btnSalvar').onclick = function() {
        closeModal('contaModal');
    };
    
    // Esconde o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'none';
}

// Edita uma conta
async function editConta(contaId) {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    if (!canEdit) {
        alert('Você não tem permissão para editar contas a receber.');
        return;
    }
    
    // Abre o modal em modo de edição
    openContaModal(contaId);
    
    // Habilita os campos do formulário
    document.querySelectorAll('#contaForm input, #contaForm select, #contaForm textarea').forEach(field => {
        field.disabled = false;
    });
    
    // Restaura o texto do botão Salvar
    document.getElementById('btnSalvar').textContent = 'Salvar';
    document.getElementById('btnSalvar').onclick = saveConta;
    
    // Exibe o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'inline-block';
}

// Exclui uma conta
async function deleteConta(contaId) {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    if (!canEdit) {
        alert('Você não tem permissão para excluir contas a receber.');
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir esta conta a receber?')) {
        return;
    }
    
    try {
        // Usa a nova API centralizada
        await apiDelete(`/api/contas-receber/${contaId}`);
        
        // Recarrega a lista de contas
        carregarTodasAsContas();
        
        // Exibe mensagem de sucesso
        alert('Conta excluída com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao excluir conta: ${error.message}`);
    }
}

// Formata valor para moeda
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

// Formata data
function formatarData(data) {
    if (!data) return '';
    const date = new Date(data);
    return date.toLocaleDateString('pt-BR');
}
