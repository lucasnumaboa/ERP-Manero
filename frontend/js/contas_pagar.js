// Variável global para armazenar todas as contas
let todasAsContasPagar = [];

// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Carrega os dados do usuário
    loadUserData();

    // Carrega a lista de contas a pagar
    carregarTodasAsContas();

    // Configura os botões de ação
    setupActionButtons();

    // Define datas padrão dos filtros (primeiro dia do mês até hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataInicial').valueAsDate = primeiroDiaDoMes;
    document.getElementById('filtroDataFinal').valueAsDate = hoje;

    // Configura os filtros
    document.getElementById('btnAplicarFiltros').addEventListener('click', aplicarFiltrosPagar);
    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltrosPagar);
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

// Carrega todas as contas a pagar da API
async function carregarTodasAsContas() {
    // Mostra mensagem de carregamento
    document.getElementById('contasTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando contas a pagar...</td></tr>';
    
    try {
        // Busca todas as contas sem filtro
        const data = await apiGet('/api/contas-pagar', {});
        
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
        todasAsContasPagar = contas;
        
        console.log('Total de contas carregadas:', todasAsContasPagar.length);
        
        // Exibe as contas
        if (!todasAsContasPagar || todasAsContasPagar.length === 0) {
            document.getElementById('contasTableBody').innerHTML = 
                '<tr><td colspan="7" class="text-center">Nenhuma conta a pagar encontrada</td></tr>';
            return;
        }
        
        // Configuração da paginação
        window.currentDisplayFunction = displayContasPagar;
        initPagination(todasAsContasPagar, displayContasPagar);
    } catch (error) {
        console.error('Erro ao carregar contas a pagar:', error);
        document.getElementById('contasTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar contas a pagar. Verifique se o backend está rodando.</td></tr>';
    }
}

// Aplica os filtros
function aplicarFiltrosPagar() {
    const codigo = document.getElementById('filtroCodigo').value.toLowerCase();
    const credor = document.getElementById('filtroCredor').value.toLowerCase();
    const dataInicial = document.getElementById('filtroDataInicial').value;
    const dataFinal = document.getElementById('filtroDataFinal').value;
    const status = document.getElementById('filterStatus').value;
    
    console.log('=== APLICANDO FILTROS - CONTAS A PAGAR ===');
    console.log('Filtros:', { codigo, credor, dataInicial, dataFinal, status });
    console.log('Total de contas antes do filtro:', todasAsContasPagar.length);
    
    // Filtra as contas armazenadas
    let contasFiltradas = todasAsContasPagar.filter(conta => {
        // Filtro por código
        if (codigo && !conta.codigo.toLowerCase().includes(codigo)) {
            return false;
        }
        
        // Filtro por credor (fornecedor ou vendedor)
        const nomeCredor = (conta.fornecedor_nome || conta.vendedor_nome || conta.nome || '').toLowerCase();
        if (credor && !nomeCredor.includes(credor)) {
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
    window.currentDisplayFunction = displayContasPagar;
    initPagination(contasFiltradas, displayContasPagar);
}

// Limpa os filtros
function limparFiltrosPagar() {
    document.getElementById('filtroCodigo').value = '';
    document.getElementById('filtroCredor').value = '';
    document.getElementById('filtroDataInicial').value = '';
    document.getElementById('filtroDataFinal').value = '';
    document.getElementById('filterStatus').value = '';
    
    // Recarrega todas as contas
    carregarTodasAsContas();
}

// Exibe as contas a pagar na tabela
async function displayContasPagar(contas) {
    const tbody = document.getElementById('contasTableBody');
    
    if (!contas || contas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma conta a pagar encontrada</td></tr>';
        return;
    }
    
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    
    tbody.innerHTML = '';
    
    // Processa cada conta e busca o nome do vendedor/fornecedor se necessário
    for (const conta of contas) {
        const row = document.createElement('tr');
        
        // Formata o status
        const statusClass = `status-${conta.status}`;
        const statusText = conta.status.charAt(0).toUpperCase() + conta.status.slice(1);
        
        // Obtém o nome do vendedor ou fornecedor
        let nomeCredor = conta.fornecedor_nome || conta.vendedor_nome || 'N/A';
        
        // Se não tem nome, tenta buscar pela API
        if (conta.vendedor_id && !conta.vendedor_nome) {
            try {
                const vendedor = await apiGet(`/api/vendedores/${conta.vendedor_id}`);
                nomeCredor = vendedor.nome || 'N/A';
            } catch (error) {
                console.error('Erro ao carregar vendedor:', error);
                nomeCredor = 'N/A';
            }
        } else if (conta.fornecedor_id && !conta.fornecedor_nome) {
            try {
                const fornecedor = await apiGet(`/api/parceiros/${conta.fornecedor_id}`);
                nomeCredor = fornecedor.nome || 'N/A';
            } catch (error) {
                console.error('Erro ao carregar fornecedor:', error);
                nomeCredor = 'N/A';
            }
        }
        
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
            <td>${nomeCredor}</td>
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
            alert('Você não tem permissão para criar contas a pagar.');
            return;
        }
    }
    
    const modal = document.getElementById('contaModal');
    const form = document.getElementById('contaForm');
    const modalTitle = document.getElementById('modalTitle');
    
    // Limpa o formulário
    form.reset();
    
    // Carrega os dados para os selects
    loadFornecedores();
    loadVendedores();
    
    if (contaId) {
        // Modo de edição
        modalTitle.textContent = 'Editar Conta a Pagar';
        loadContaData(contaId);
    } else {
        // Modo de criação
        modalTitle.textContent = 'Nova Conta a Pagar';
        document.getElementById('status').value = 'pendente';
    }
    
    // Exibe o modal
    modal.style.display = 'flex';
}

// Carrega os dados de uma conta específica
async function loadContaData(contaId) {
    try {
        // Usa a nova API centralizada
        const conta = await apiGet(`/api/contas-pagar/${contaId}`);
        
        // Aguarda o carregamento dos selects antes de preencher
        await loadFornecedores();
        await loadVendedores();
        
        // Preenche o formulário com os dados da conta
        document.getElementById('descricao').value = conta.descricao || '';
        document.getElementById('fornecedor_id').value = conta.fornecedor_id || '';
        document.getElementById('vendedor_id').value = conta.vendedor_id || '';
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

// Carrega a lista de fornecedores para o select
async function loadFornecedores() {
    const selectFornecedor = document.getElementById('fornecedor_id');
    
    // Mantém apenas a primeira opção (placeholder)
    selectFornecedor.innerHTML = '<option value="">Selecione um fornecedor (opcional)</option>';
    
    try {
        // Usa a nova API centralizada
        const fornecedores = await apiGet('/api/parceiros');
        
        // Filtra apenas fornecedores
        const fornecedoresFiltrados = fornecedores.filter(p => p.tipo === 'fornecedor');
        
        // Adiciona as opções de fornecedores ao select
        fornecedoresFiltrados.forEach(fornecedor => {
            const option = document.createElement('option');
            option.value = fornecedor.id;
            option.textContent = fornecedor.nome;
            selectFornecedor.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
    }
}

// Carrega a lista de vendedores para o select
async function loadVendedores() {
    const selectVendedor = document.getElementById('vendedor_id');
    
    // Mantém apenas a primeira opção (placeholder)
    selectVendedor.innerHTML = '<option value="">Selecione um vendedor (opcional)</option>';
    
    try {
        // Usa a nova API centralizada
        const vendedores = await apiGet('/api/vendedores');
        
        // Adiciona as opções de vendedores ao select
        vendedores.forEach(vendedor => {
            const option = document.createElement('option');
            option.value = vendedor.id;
            option.textContent = vendedor.nome;
            selectVendedor.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar vendedores:', error);
    }
}

// Salva a conta (nova ou edição)
async function saveConta() {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    if (!canEdit) {
        alert('Você não tem permissão para salvar contas a pagar.');
        return;
    }
    
    // Obtém os dados do formulário
    const form = document.getElementById('contaForm');
    const contaId = form.getAttribute('data-id');
    const descricao = document.getElementById('descricao').value;
    const fornecedor_id = document.getElementById('fornecedor_id').value;
    const vendedor_id = document.getElementById('vendedor_id').value;
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
        fornecedor_id: fornecedor_id || null,
        vendedor_id: vendedor_id || null,
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
            data = await apiPut(`/api/contas-pagar/${contaId}`, contaData);
        } else {
            // Cria nova conta
            data = await apiPost('/api/contas-pagar', contaData);
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
        alert('Você não tem permissão para editar contas a pagar.');
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

// Cancela uma conta (altera status para cancelado)
async function deleteConta(contaId) {
    // Verifica se o usuário tem permissão de edição
    const canEdit = await hasPermission('financeiro_editar');
    if (!canEdit) {
        alert('Você não tem permissão para cancelar contas a pagar.');
        return;
    }
    
    if (!confirm('Tem certeza que deseja cancelar esta conta a pagar?')) {
        return;
    }
    
    try {
        // Altera o status para 'cancelado' ao invés de deletar
        await apiPut(`/api/contas-pagar/${contaId}`, { status: 'cancelado' });
        
        // Recarrega a lista de contas
        carregarTodasAsContas();
        
        // Exibe mensagem de sucesso
        alert('Conta cancelada com sucesso!');
    } catch (error) {
        console.error('Erro:', error);
        alert(`Erro ao cancelar conta: ${error.message}`);
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
