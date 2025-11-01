// Configuração inicial

// Estado global para modals
let currentModalData = null;

document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticação
    checkAuth();
    
    // Configurar sidebar toggle
    setupSidebarToggle();
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Configurar abas
    setupTabs();
    
    // Carregar dados financeiros
    carregarIndicadoresFinanceiros();
    carregarContasReceber();
    carregarContasPagar();
    carregarLancamentos();
    carregarFluxoCaixa();
    
    // Configurar botões de ação
    setupActionButtons();
    
    // Configurar modals
    setupModals();
    
    // Carregar dados para selects
    carregarClientes();
    carregarCategorias();
});

// Funções de autenticação
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// Função getAuthHeader removida - Autenticação agora é gerenciada pela API centralizada

// Função para carregar indicadores financeiros (cards do topo)
async function carregarIndicadoresFinanceiros() {
    try {
        const data = await apiLoadFinancialIndicators();
        
        // Atualizar cards com os valores
        document.getElementById('totalReceberValor').textContent = formatarMoeda(data.totalReceber);
        document.getElementById('totalPagarValor').textContent = formatarMoeda(data.totalPagar);
        document.getElementById('saldoAtualValor').textContent = formatarMoeda(data.saldoAtual);
        document.getElementById('receitaMensalValor').textContent = formatarMoeda(data.receitaMensal);
        document.getElementById('despesaMensalValor').textContent = formatarMoeda(data.despesaMensal);
        document.getElementById('resultadoMensalValor').textContent = formatarMoeda(data.resultadoMensal);
        
        // Atualizar variações
        atualizarVariacao('totalReceberVariacao', data.variacaoReceber);
        atualizarVariacao('totalPagarVariacao', data.variacaoPagar);
        atualizarVariacao('saldoAtualVariacao', data.variacaoSaldo);
        atualizarVariacao('receitaMensalVariacao', data.variacaoReceita);
        atualizarVariacao('despesaMensalVariacao', data.variacaoDespesa);
        atualizarVariacao('resultadoMensalVariacao', data.variacaoResultado);
    } catch (error) {
        console.error('Erro ao carregar indicadores financeiros:', error);
        // Exibir mensagem de erro nos cards
        document.getElementById('valor-contas-receber').textContent = 'Erro ao carregar';
        document.getElementById('valor-contas-pagar').textContent = 'Erro ao carregar';
        document.getElementById('valor-saldo-caixa').textContent = 'Erro ao carregar';
        document.getElementById('valor-lucro-liquido').textContent = 'Erro ao carregar';
    }
}

// Função auxiliar para atualizar a variação com a classe CSS correta
function atualizarVariacao(elementId, variacao) {
    const element = document.getElementById(elementId);
    if (variacao > 0) {
        element.className = 'card-change positive';
        element.textContent = `+${variacao}% este mês`;
    } else if (variacao < 0) {
        element.className = 'card-change negative';
        element.textContent = `${variacao}% este mês`;
    } else {
        element.className = 'card-change neutral';
        element.textContent = `0% este mês`;
    }
}

// Função para carregar contas a receber
async function carregarContasReceber() {
    try {
        // Obter filtros selecionados
        const status = document.getElementById('filterStatusReceber').value;
        const periodo = document.getElementById('filterPeriodoReceber').value;
        
        // Construir objeto de filtros
        const filters = {
            status: status !== 'todos' ? status : null,
            periodo: periodo !== 'todos' ? periodo : null
        };
        
        // Chamar API para obter dados
        const data = await apiLoadAccountsReceivable(filters);
        displayContasReceber(data);
    } catch (error) {
        console.error('Erro ao carregar contas a receber:', error);
        document.getElementById('contasReceberTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar contas a receber. Tente novamente.</td></tr>';
    }
}

// Exibir contas a receber na tabela
function displayContasReceber(contas) {
    const tableBody = document.getElementById('contasReceberTableBody');
    
    if (!contas || contas.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma conta a receber encontrada</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    contas.forEach(conta => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${conta.id}</td>
            <td>${conta.cliente_nome}</td>
            <td>${conta.descricao}</td>
            <td>${formatarData(conta.data_vencimento)}</td>
            <td>${formatarMoeda(conta.valor)}</td>
            <td><span class="status-badge ${conta.status}">${conta.status}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" title="Visualizar" data-id="${conta.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" title="Editar" data-id="${conta.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${conta.status !== 'pago' ? 
                        `<button class="btn-icon btn-check" title="Marcar como Pago" data-id="${conta.id}">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Configurar eventos para os botões
    setupContasReceberButtons();
}

// Carregar contas a pagar
async function carregarContasPagar() {
    try {
        // Obter filtros selecionados
        const status = document.getElementById('filterStatusPagar').value;
        const periodo = document.getElementById('filterPeriodoPagar').value;
        
        // Construir objeto de filtros
        const filters = {
            status: status !== 'todos' ? status : null,
            periodo: periodo !== 'todos' ? periodo : null
        };
        
        // Chamar API para obter dados
        const data = await apiLoadAccountsPayable(filters);
        displayContasPagar(data);
    } catch (error) {
        console.error('Erro ao carregar contas a pagar:', error);
        document.getElementById('contasPagarTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar contas a pagar. Tente novamente.</td></tr>';
    }
}

// Exibir contas a pagar na tabela
function displayContasPagar(contas) {
    const tableBody = document.getElementById('contasPagarTableBody');
    
    if (!contas || contas.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma conta a pagar encontrada</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    contas.forEach(conta => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${conta.id}</td>
            <td>${conta.fornecedor_nome}</td>
            <td>${conta.descricao}</td>
            <td>${formatarData(conta.data_vencimento)}</td>
            <td>${formatarMoeda(conta.valor)}</td>
            <td><span class="status-badge ${conta.status}">${conta.status}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" title="Visualizar" data-id="${conta.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" title="Editar" data-id="${conta.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${conta.status !== 'pago' ? 
                        `<button class="btn-icon btn-check" title="Marcar como Pago" data-id="${conta.id}">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Configurar eventos para os botões
    setupContasPagarButtons();
}

// Carregar lançamentos financeiros
async function carregarLancamentos() {
    try {
        // Obter filtros selecionados
        const tipo = document.getElementById('filterTipoLancamento').value;
        const periodo = document.getElementById('filterPeriodoLancamento').value;
        
        // Construir objeto de filtros
        const filters = {
            tipo: tipo !== 'todos' ? tipo : null,
            periodo: periodo !== 'todos' ? periodo : null
        };
        
        // Chamar API para obter dados
        const data = await apiLoadTransactions(filters);
        displayLancamentos(data);
    } catch (error) {
        console.error('Erro ao carregar lançamentos:', error);
        document.getElementById('lancamentosTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar lançamentos. Tente novamente.</td></tr>';
    }
}

// Exibir lançamentos na tabela
function displayLancamentos(lancamentos) {
    const tableBody = document.getElementById('lancamentosTableBody');
    
    if (!lancamentos || lancamentos.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum lançamento encontrado</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    lancamentos.forEach(lancamento => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${lancamento.id}</td>
            <td>${formatarData(lancamento.data)}</td>
            <td>${lancamento.descricao}</td>
            <td><span class="badge ${lancamento.tipo}">${lancamento.tipo}</span></td>
            <td>${lancamento.categoria}</td>
            <td>${formatarMoeda(lancamento.valor)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" title="Visualizar" data-id="${lancamento.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" title="Editar" data-id="${lancamento.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Excluir" data-id="${lancamento.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Configurar eventos para os botões
    setupLancamentosButtons();
}

// Configurar botões de ação
function setupActionButtons() {
    // Botão de novo recebimento
    document.getElementById('btnNovoRecebimento').addEventListener('click', () => {
        abrirModalNovoRecebimento();
    });
    
    // Botão de novo pagamento
    document.getElementById('btnNovoPagamento').addEventListener('click', () => {
        abrirModalNovoPagamento();
    });
    
    // Botão de novo lançamento
    document.getElementById('btnNovoLancamento').addEventListener('click', () => {
        abrirModalNovoLancamento();
    });
    
    // Filtros de status
    document.getElementById('filterStatusReceber').addEventListener('change', carregarContasReceber);
    document.getElementById('filterStatusPagar').addEventListener('change', carregarContasPagar);
    document.getElementById('filterTipoLancamento').addEventListener('change', carregarLancamentos);
    
    // Filtros de período
    document.getElementById('filterPeriodoReceber').addEventListener('change', carregarContasReceber);
    document.getElementById('filterPeriodoPagar').addEventListener('change', carregarContasPagar);
    document.getElementById('filterPeriodoLancamento').addEventListener('change', carregarLancamentos);
}

// Configurar eventos para os botões de contas a receber
function setupContasReceberButtons() {
    // Botões de visualizar
    document.querySelectorAll('#contasReceberTableBody .btn-view').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            visualizarContaReceber(contaId);
        });
    });
    
    // Botões de editar
    document.querySelectorAll('#contasReceberTableBody .btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            abrirModalEditarRecebimento(contaId);
        });
    });
    
    // Botões de marcar como pago
    document.querySelectorAll('#contasReceberTableBody .btn-check').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            marcarComoPagoReceber(contaId);
        });
    });
}

// Configurar eventos para os botões de contas a pagar
function setupContasPagarButtons() {
    // Botões de visualizar
    document.querySelectorAll('#contasPagarTableBody .btn-view').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            visualizarContaPagar(contaId);
        });
    });
    
    // Botões de editar
    document.querySelectorAll('#contasPagarTableBody .btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            abrirModalEditarPagamento(contaId);
        });
    });
    
    // Botões de marcar como pago
    document.querySelectorAll('#contasPagarTableBody .btn-check').forEach(button => {
        button.addEventListener('click', function() {
            const contaId = this.dataset.id;
            marcarComoPagoPagar(contaId);
        });
    });
}

// Carregar dados do fluxo de caixa
async function carregarFluxoCaixa() {
    try {
        // Obter filtros se necessário (pode ser expandido no futuro)
        const filters = {};
        
        // Chamar API para obter dados
        const data = await apiLoadCashFlow(filters);
        renderizarFluxoCaixa(data);
    } catch (error) {
        console.error('Erro ao carregar fluxo de caixa:', error);
        document.getElementById('fluxo-caixa-chart').innerHTML = 
            '<div class="text-center text-danger">Erro ao carregar dados do fluxo de caixa. Tente novamente.</div>';
    }
}

// Renderizar gráfico de fluxo de caixa
function renderizarFluxoCaixa(dados) {
    const chartContainer = document.getElementById('fluxo-caixa-chart');
    
    if (!dados || !dados.entradas || !dados.saidas || dados.entradas.length === 0) {
        chartContainer.innerHTML = '<div class="text-center">Nenhum dado disponível para o período selecionado</div>';
        return;
    }
    
    // Limpar conteúdo anterior
    chartContainer.innerHTML = '';
    
    // Criar elemento para o gráfico
    const chartElement = document.createElement('div');
    chartElement.className = 'mock-chart';
    
    // Obter valores máximos para normalização
    const maxEntrada = Math.max(...dados.entradas.map(item => item.valor));
    const maxSaida = Math.max(...dados.saidas.map(item => item.valor));
    const maxValor = Math.max(maxEntrada, maxSaida);
    
    // Criar barras para cada período
    for (let i = 0; i < dados.entradas.length; i++) {
        const entrada = dados.entradas[i];
        const saida = dados.saidas[i] || { valor: 0 };
        
        // Calcular altura proporcional das barras (entre 10% e 90%)
        const alturaEntrada = 10 + (entrada.valor / maxValor * 80);
        const alturaSaida = 10 + (saida.valor / maxValor * 80);
        
        // Criar barra de entrada
        const barraEntrada = document.createElement('div');
        barraEntrada.className = 'chart-bar entrada';
        barraEntrada.style.height = `${alturaEntrada}%`;
        barraEntrada.title = `Entradas: ${formatarMoeda(entrada.valor)}`;
        
        // Criar barra de saída
        const barraSaida = document.createElement('div');
        barraSaida.className = 'chart-bar saida';
        barraSaida.style.height = `${alturaSaida}%`;
        barraSaida.title = `Saídas: ${formatarMoeda(saida.valor)}`;
        
        // Adicionar barras ao gráfico
        chartElement.appendChild(barraEntrada);
        chartElement.appendChild(barraSaida);
    }
    
    // Adicionar gráfico ao container
    chartContainer.appendChild(chartElement);
    
    // Adicionar legenda
    const legendaHTML = `
        <div class="chart-legend">
            <div class="legend-item">
                <div class="legend-color entrada"></div>
                <span>Entradas</span>
            </div>
            <div class="legend-item">
                <div class="legend-color saida"></div>
                <span>Saídas</span>
            </div>
        </div>
    `;
    
    chartContainer.insertAdjacentHTML('beforeend', legendaHTML);
}

// Configurar eventos para os botões de lançamentos
function setupLancamentosButtons() {
    // Botões de visualizar
    document.querySelectorAll('#lancamentosTableBody .btn-view').forEach(button => {
        button.addEventListener('click', function() {
            const lancamentoId = this.dataset.id;
            visualizarLancamento(lancamentoId);
        });
    });
    
    // Botões de editar
    document.querySelectorAll('#lancamentosTableBody .btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const lancamentoId = this.dataset.id;
            abrirModalEditarLancamento(lancamentoId);
        });
    });
    
    // Botões de excluir
    document.querySelectorAll('#lancamentosTableBody .btn-delete').forEach(button => {
        button.addEventListener('click', function() {
            const lancamentoId = this.dataset.id;
            excluirLancamento(lancamentoId);
        });
    });
}

// Funções para manipulação de contas a receber
function visualizarContaReceber(contaId) {
    alert(`Visualizando conta a receber #${contaId}`);
    // Implementar visualização de conta a receber
}

function editarContaReceber(contaId) {
    document.getElementById('recebimentoModalTitle').textContent = `Editar Recebimento #${contaId}`;
    
    // Buscar dados da conta a receber na API
    const headers = getAuthHeader();
    
    fetch(`${API_URL}/api/financeiro/contas-receber/${contaId}`, {
        method: 'GET',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao carregar dados do recebimento');
        }
        return response.json();
    })
    .then(conta => {
        // Preencher o formulário com os dados da conta
        document.getElementById('cliente_id_recebimento').value = conta.cliente_id || '';
        document.getElementById('descricao_recebimento').value = conta.descricao || '';
        document.getElementById('valor_recebimento').value = conta.valor || '';
        document.getElementById('data_vencimento_recebimento').value = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : '';
        document.getElementById('status_recebimento').value = conta.status || 'pendente';
        
        // Armazenar o ID da conta no formulário para uso posterior
        document.getElementById('recebimentoForm').setAttribute('data-id', contaId);
        
        document.getElementById('recebimentoModal').style.display = 'flex';
    })
    .catch(error => {
        console.error('Erro ao carregar dados do recebimento:', error);
        alert('Erro ao carregar dados do recebimento. Por favor, tente novamente.');
    });
}

async function marcarComoPagoReceber(contaId) {
    if (confirm(`Confirmar recebimento da conta #${contaId}?`)) {
        try {
            await apiMarkAccountReceivableAsPaid(contaId);
            alert('Recebimento confirmado com sucesso!');
            
            // Recarregar dados
            carregarContasReceber();
            carregarLancamentos();
            carregarIndicadoresFinanceiros();
        } catch (error) {
            console.error('Erro ao confirmar recebimento:', error);
            alert('Erro ao confirmar recebimento. Por favor, tente novamente.');
        }
    }
}

// Funções para manipulação de contas a pagar
function visualizarContaPagar(contaId) {
    alert(`Visualizando conta a pagar #${contaId}`);
    // Implementar visualização de conta a pagar
}

function editarContaPagar(contaId) {
    document.getElementById('pagamentoModalTitle').textContent = `Editar Pagamento #${contaId}`;
    
    // Buscar dados da conta a pagar na API
    const headers = getAuthHeader();
    
    fetch(`${API_URL}/api/financeiro/contas-pagar/${contaId}`, {
        method: 'GET',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao carregar dados do pagamento');
        }
        return response.json();
    })
    .then(conta => {
        // Preencher o formulário com os dados da conta
        document.getElementById('fornecedor_id_pagamento').value = conta.fornecedor_id || '';
        document.getElementById('descricao_pagamento').value = conta.descricao || '';
        document.getElementById('valor_pagamento').value = conta.valor || '';
        document.getElementById('data_vencimento_pagamento').value = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : '';
        document.getElementById('status_pagamento').value = conta.status || 'pendente';
        
        // Armazenar o ID da conta no formulário para uso posterior
        document.getElementById('pagamentoForm').setAttribute('data-id', contaId);
        
        document.getElementById('pagamentoModal').style.display = 'flex';
    })
    .catch(error => {
        console.error('Erro ao carregar dados do pagamento:', error);
        alert('Erro ao carregar dados do pagamento. Por favor, tente novamente.');
    });
}

async function marcarComoPagoPagar(contaId) {
    if (confirm(`Confirmar pagamento da conta #${contaId}?`)) {
        try {
            await apiMarkAccountPayableAsPaid(contaId);
            alert('Pagamento confirmado com sucesso!');
            
            // Recarregar dados
            carregarContasPagar();
            carregarLancamentos();
            carregarIndicadoresFinanceiros();
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error);
            alert('Erro ao confirmar pagamento. Por favor, tente novamente.');
        }
    }
}

// Funções para manipulação de lançamentos
function visualizarLancamento(lancamentoId) {
    alert(`Visualizando lançamento #${lancamentoId}`);
    // Implementar visualização de lançamento
}

async function editarLancamento(lancamentoId) {
    document.getElementById('lancamentoModalTitle').textContent = `Editar Lançamento #${lancamentoId}`;
    
    try {
        console.log(`Carregando dados do lançamento ID: ${lancamentoId}`);
        
        // Usa a API centralizada
        const url = `/api/financeiro/lancamentos/${lancamentoId}`;
        console.log(`Enviando requisição GET para API centralizada: ${url}`);
        
        const lancamento = await apiGet(url);
        console.log('Dados do lançamento recebidos:', lancamento);
        
        // Preencher o formulário com os dados do lançamento
        document.getElementById('descricao_lancamento').value = lancamento.descricao || '';
        document.getElementById('tipo_lancamento').value = lancamento.tipo || 'entrada';
        document.getElementById('categoria_lancamento').value = lancamento.categoria_id || '';
        document.getElementById('valor_lancamento').value = lancamento.valor || '';
        document.getElementById('data_lancamento').value = lancamento.data ? lancamento.data.split('T')[0] : '';
        document.getElementById('observacao_lancamento').value = lancamento.observacao || '';
        
        // Armazenar o ID do lançamento no formulário para uso posterior
        document.getElementById('lancamentoForm').setAttribute('data-id', lancamentoId);
        
        document.getElementById('lancamentoModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar dados do lançamento:', error);
        alert(`Erro ao carregar dados do lançamento: ${error.message || 'Por favor, tente novamente.'}`);
        
        // Para fins de demonstração, poderia implementar dados simulados aqui
        // se estiver em ambiente de desenvolvimento
    }
}

async function excluirLancamento(lancamentoId) {
    if (confirm(`Tem certeza que deseja excluir o lançamento #${lancamentoId}?`)) {
        try {
            await apiDeleteTransaction(lancamentoId);
            alert('Lançamento excluído com sucesso!');
            
            // Recarregar dados
            carregarLancamentos();
            carregarIndicadoresFinanceiros();
            carregarFluxoCaixa();
        } catch (error) {
            console.error('Erro ao excluir lançamento:', error);
            alert('Erro ao excluir lançamento. Por favor, tente novamente.');
        }
    }
}
