// Função para formatar valores monetários
function formatarMoeda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) {
        return 'R$ 0,00';
    }
    
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Verifica permissões antes de inicializar o dashboard
    checkDashboardPermissions();
    
    // Carrega os dados do usuário
    loadUserData();
    
    // Configura o toggle do sidebar
    setupSidebarToggle();
    
    // Configura o filtro de mês/ano
    setupDateFilter();
});

// Inicializa o dashboard com dados
async function initDashboard(monthYear = null) {
    try {
        // Carrega dados reais da API
        console.log('Iniciando inicialização do dashboard...');
        console.log('Mês/Ano selecionado:', monthYear);
        
        // Busca os dados do dashboard da API
        console.log('Chamando fetchDashboardData...');
        const dashboardData = await fetchDashboardData(monthYear);
        console.log('Dados recebidos do dashboard:', dashboardData);
        
        // Verifica se os dados foram recebidos corretamente
        if (!dashboardData) {
            console.error('Não foi possível obter dados do dashboard');
            return;
        }
        
        // Verifica a estrutura dos dados recebidos
        console.log('Estrutura dos dados recebidos:', {
            'vendas': dashboardData.vendas ? 'presente' : 'ausente',
            'vendas_recentes': dashboardData.vendas_recentes ? `${dashboardData.vendas_recentes.length} itens` : 'ausente',
            'produtos_mais_vendidos': dashboardData.produtos_mais_vendidos ? `${dashboardData.produtos_mais_vendidos.length} itens` : 'ausente',
            'vendas_por_periodo': dashboardData.vendas_por_periodo ? `${dashboardData.vendas_por_periodo.length} itens` : 'ausente'
        });
        
        // Atualiza os cards e gráficos com os dados reais
        console.log('Atualizando cards do dashboard...');
        updateDashboardCards(dashboardData);
        
        console.log('Atualizando atividades recentes...');
        updateRecentActivities(dashboardData.vendas_recentes);
        
        // Busca e atualiza dados de valorização do estoque
        console.log('Buscando valorização do estoque...');
        await updateValorizacaoEstoque();
        
        // Busca e atualiza dados de custo total do estoque
        console.log('Buscando custo total do estoque...');
        await updateCustoTotalEstoque();
        
        // Carrega dados de contas a pagar e receber
        console.log('Carregando contas financeiras...');
        await carregarContasFinanceiras();
        
        // Gráficos removidos conforme solicitado
        
        console.log('Dashboard inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar dashboard:', error);
    }
}

// Carrega os dados do usuário atual
async function loadUserData() {
    try {
        const user = await getCurrentUser();
        if (user) {
            // Atualiza o nome e função do usuário na sidebar
            const userNameElement = document.getElementById('userName');
            const userRoleElement = document.getElementById('userRole');
            
            if (userNameElement) {
                userNameElement.textContent = user.nome;
            }
            
            if (userRoleElement) {
                userRoleElement.textContent = user.nivel_acesso;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
    }
}

// Configura o toggle do sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleBtn && sidebar && mainContent) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
}

// Verifica permissões do dashboard e mostra/oculta conteúdo
async function checkDashboardPermissions() {
    try {
        // Obtém o usuário atual e suas permissões
        const user = await getCurrentUser();
        if (!user) {
            console.error('Não foi possível obter dados do usuário');
            return;
        }
        
        console.log('Verificando permissões do dashboard para o usuário:', user);
        console.log('Valor de dashboard_visualizar:', user.dashboard_visualizar, 'Tipo:', typeof user.dashboard_visualizar);
        console.log('Valor de dashboard_editar:', user.dashboard_editar, 'Tipo:', typeof user.dashboard_editar);
        
        // SOLUÇÃO TEMPORÁRIA: Se o usuário for admin, conceder acesso independentemente das permissões específicas
        const isAdmin = user.nivel_acesso === 'admin' || user.nivel_acesso === 'Admin' || user.nivel_acesso === 'ADMIN';
        
        // Verifica se o usuário tem permissão para visualizar ou editar o dashboard
        // Aceita qualquer valor que não seja null, undefined, 0, false ou string vazia
        const canView = Boolean(user.dashboard_visualizar) || isAdmin;
        const canEdit = Boolean(user.dashboard_editar) || isAdmin;
        
        console.log('É admin:', isAdmin);
        console.log('Permissão para visualizar dashboard:', canView);
        console.log('Permissão para editar dashboard:', canEdit);
        
        // Remove a tela de carregamento
        const loadingScreen = document.getElementById('permission-loading');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (canView || canEdit) {
            // Se tem permissão, inicializa o dashboard normalmente
            document.querySelector('.app-container').style.display = 'flex';
            initDashboard();
            document.querySelector('.content').style.display = 'block';
        } else {
            // Se não tem permissão, exibe a app-container mas com mensagem de acesso negado
            document.querySelector('.app-container').style.display = 'flex';
            
            // Se não tem permissão, oculta todo o conteúdo do dashboard
            document.querySelector('.content').style.display = 'none';
            
            // Exibe mensagem informando que não tem permissão
            const content = document.querySelector('.content');
            content.innerHTML = `
                <div class="permission-denied">
                    <i class="fas fa-lock" style="font-size: 48px; color: #e74c3c; margin-bottom: 20px;"></i>
                    <h2>Acesso Restrito</h2>
                    <p>Você não possui permissão para visualizar o Dashboard.</p>
                    <p>Entre em contato com o administrador do sistema para solicitar acesso.</p>
                </div>
            `;
            
            // Estilo para a mensagem de permissão negada
            const style = document.createElement('style');
            style.textContent = `
                .permission-denied {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    height: 70vh;
                    padding: 20px;
                }
                .permission-denied h2 {
                    color: #e74c3c;
                    margin-bottom: 10px;
                }
                .permission-denied p {
                    color: #7f8c8d;
                    margin: 5px 0;
                }
            `;
            document.head.appendChild(style);
            
            // Exibe o conteúdo (agora com a mensagem de permissão negada)
            content.style.display = 'block';
        }
    } catch (error) {
        console.error('Erro ao verificar permissões do dashboard:', error);
        
        // Em caso de erro, remove a tela de carregamento e mostra mensagem de erro
        const loadingScreen = document.getElementById('permission-loading');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // Exibe a app-container com mensagem de erro
        document.querySelector('.app-container').style.display = 'flex';
    }
}

// Função para buscar dados do dashboard da API
async function fetchDashboardData(monthYear = null) {
    try {
        console.log('Iniciando fetchDashboardData, mês/ano:', monthYear);
        
        // Usa a nova API centralizada
        let url = '/api/dashboard';
        
        // Adiciona parâmetro de mês/ano se fornecido
        if (monthYear) {
            url += `?month_year=${monthYear}`;
        }
        
        console.log('Buscando dados do dashboard na URL:', url);
        
        const data = await apiGet(url);
        console.log('Dados recebidos do dashboard:', data);
        
        // Verificar especificamente os dados de vendas por período
        if (data && data.vendas_por_periodo) {
            console.log('Dados de vendas por período:', data.vendas_por_periodo);
            console.log('Quantidade de períodos:', data.vendas_por_periodo.length);
        } else {
            console.warn('Dados de vendas por período não encontrados ou vazios');
        }
        
        return data;
    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        return null;
    }
}

// Função para atualizar os cards do dashboard com dados reais
function updateDashboardCards(data) {
    if (!data) return;
    
    // Atualiza os cards da seção "Resumo Geral"
    const summaryCards = document.querySelectorAll('.summary-section:nth-child(1) .summary-card');
    
    // Card de vendas (primeiro card)
    if (summaryCards[0]) {
        const salesValue = summaryCards[0].querySelector('.card-value');
        if (salesValue) {
            salesValue.textContent = formatarMoeda(data.vendas.total);
        }
    }
    
    // Card de clientes (segundo card)
    if (summaryCards[1]) {
        const clientsValue = summaryCards[1].querySelector('.card-value');
        if (clientsValue) {
            clientsValue.textContent = data.clientes.total;
        }
    }
    
    // Card de vendedores (terceiro card)
    if (summaryCards[2]) {
        const vendedoresValue = summaryCards[2].querySelector('.card-value');
        if (vendedoresValue) {
            vendedoresValue.textContent = data.vendedores.total;
        }
    }
    
    // Card de pedidos (quarto card)
    if (summaryCards[3]) {
        const ordersValue = summaryCards[3].querySelector('.card-value');
        if (ordersValue) {
            ordersValue.textContent = data.pedidos.total;
        }
    }
    
    // Atualiza os cards da seção "Financeiro"
    const financialCards = document.querySelectorAll('.summary-section:nth-child(2) .summary-card');
    
    // Card de lucro total (primeiro card da seção financeira)
    if (financialCards[0]) {
        const profitValue = financialCards[0].querySelector('.card-value');
        if (profitValue) {
            profitValue.textContent = formatarMoeda(data.lucro.total);
        }
    }
    
    // Atualiza as métricas específicas por ID (mantém compatibilidade)
    // Total Cancelados
    const totalCanceladosValue = document.getElementById('total-cancelados');
    if (totalCanceladosValue) {
        totalCanceladosValue.textContent = data.total_cancelados || '0';
    }
    
    // Faturamento Pendente
    const faturamentoPendenteValue = document.getElementById('faturamento-pendente');
    if (faturamentoPendenteValue) {
        faturamentoPendenteValue.textContent = formatarMoeda(data.faturamento_pendente || 0);
    }
    
    // Lucro Pendente
    const lucroPendenteValue = document.getElementById('lucro-pendente');
    if (lucroPendenteValue) {
        lucroPendenteValue.textContent = formatarMoeda(data.lucro_pendente || 0);
    }
    
    // Faturamento Concluído
    const faturamentoConcluidoValue = document.getElementById('faturamento-concluido');
    if (faturamentoConcluidoValue) {
        faturamentoConcluidoValue.textContent = formatarMoeda(data.faturamento_concluido || 0);
    }
    
    // Lucro Concluído
    const lucroConcluidoValue = document.getElementById('lucro-concluido');
    if (lucroConcluidoValue) {
        lucroConcluidoValue.textContent = formatarMoeda(data.lucro_concluido || 0);
    }
    
    // Valorização do Estoque
    const valorizacaoEstoqueValue = document.getElementById('valorizacao-estoque');
    if (valorizacaoEstoqueValue) {
        valorizacaoEstoqueValue.textContent = formatarMoeda(data.valorizacao_estoque || 0);
    }
    
    // Custo Total do Estoque
    const custoTotalValue = document.getElementById('custo-total-estoque');
    if (custoTotalValue) {
        custoTotalValue.textContent = formatarMoeda(data.custo_total_estoque || 0);
    }

    // Comissão Paga Total
    const comissaoPagaTotalValue = document.getElementById('comissaoPagaTotal');
    if (comissaoPagaTotalValue) {
        comissaoPagaTotalValue.textContent = formatarMoeda(data.comissao_paga_total || 0);
    }
}



// Função para buscar e atualizar dados de valorização do estoque
async function updateValorizacaoEstoque() {
    try {
        const valorizacaoData = await apiGet('/api/estoque/valorizacao');
        
        if (valorizacaoData) {
            const valorizacaoElement = document.getElementById('valorizacao-estoque');
            if (valorizacaoElement) {
                const valorFormatado = formatarMoeda(valorizacaoData.valor_total_estoque);
                valorizacaoElement.textContent = valorFormatado;
                
                // Adiciona informações adicionais como tooltip ou subtítulo
                valorizacaoElement.title = `${valorizacaoData.total_produtos_com_estoque} produtos com estoque (${valorizacaoData.quantidade_total_estoque} unidades)`;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar valorização do estoque:', error);
        const valorizacaoElement = document.getElementById('valorizacao-estoque');
        if (valorizacaoElement) {
            valorizacaoElement.textContent = 'R$ 0,00';
        }
    }
}

// Função para buscar e atualizar dados de custo total do estoque
async function updateCustoTotalEstoque() {
    try {
        const custoTotalData = await apiGet('/api/estoque/custo-total');
        
        if (custoTotalData) {
            const custoTotalElement = document.getElementById('custo-total-estoque');
            if (custoTotalElement) {
                const valorFormatado = formatarMoeda(custoTotalData.custo_total_estoque);
                custoTotalElement.textContent = valorFormatado;
                
                // Adiciona informações adicionais como tooltip ou subtítulo
                custoTotalElement.title = `${custoTotalData.total_produtos_com_estoque} produtos com estoque (${custoTotalData.quantidade_total_estoque} unidades)`;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar custo total do estoque:', error);
        const custoTotalElement = document.getElementById('custo-total-estoque');
        if (custoTotalElement) {
            custoTotalElement.textContent = 'R$ 0,00';
        }
    }
}

function updateRecentActivities(vendasRecentes) {
    const tableBody = document.querySelector('.recent-activities .data-table tbody');
    if (!tableBody) return;
    
    // Limpa a tabela atual
    tableBody.innerHTML = '';
    
    // Verifica se há vendas recentes
    if (!vendasRecentes || !vendasRecentes.length) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="11" style="text-align: center; padding: 20px;">
                Não há atividades registradas para este período
            </td>
        `;
        tableBody.appendChild(row);
        return;
    }
    
    // Adiciona as vendas recentes à tabela
    vendasRecentes.forEach(venda => {
        const row = document.createElement('tr');
        
        // Formata a data
        const data = new Date(venda.data_pedido);
        const dataFormatada = data.toLocaleDateString('pt-BR');
        
        // Cria o status com a classe apropriada
        const statusClass = getStatusClass(venda.status);
        
        // Usa os valores calculados no backend
        const custo = venda.custo_produto || 0;
        const comissao = venda.comissao_paga || 0;
        const lucroLiquido = venda.lucro_liquido || 0;
        const vendedor = venda.vendedor_nome || '-';
        
        // Formatação dos produtos vendidos
        const produtosVendidos = venda.produtos_vendidos || 'N/A';
        const quantidadeTotal = venda.quantidade_total || 0;
        
        row.innerHTML = `
            <td>#${venda.codigo}</td>
            <td>${venda.cliente_nome}</td>
            <td title="${produtosVendidos}">${produtosVendidos.length > 50 ? produtosVendidos.substring(0, 50) + '...' : produtosVendidos}</td>
            <td>${quantidadeTotal}</td>
            <td>${formatarMoeda(custo)}</td>
            <td>${formatarMoeda(venda.valor_total)}</td>
            <td>${vendedor}</td>
            <td>${formatarMoeda(comissao)}</td>
            <td>${formatarMoeda(lucroLiquido)}</td>
            <td><span class="status ${statusClass}">${formatarStatus(venda.status)}</span></td>
            <td>${dataFormatada}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Função para formatar o status
function formatarStatus(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'processando': 'Processando',
        'enviado': 'Enviado',
        'concluido': 'Concluído',
        'cancelado': 'Cancelado'
    };
    
    return statusMap[status] || status;
}

// Função para obter a classe CSS do status
function getStatusClass(status) {
    // Mapeamento atualizado para os status exatos que aparecem na tabela
    const classMap = {
        'Pendente': 'pending',
        'Processando': 'processing',
        'Enviado': 'shipped',
        'Concluída': 'completed',
        'Finalizada': 'completed', // Status "Finalizada" com cor verde
        'Cancelada': 'canceled'    // Status "Cancelada" com cor vermelha
    };
    
    return classMap[status] || 'pending';
}

// Função para configurar o filtro de mês/ano
function setupDateFilter() {
    const filterInput = document.getElementById('month-year-filter');
    const applyFilterBtn = document.getElementById('apply-filter');
    
    // Define o valor padrão como o mês atual
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    filterInput.value = `${currentYear}-${currentMonth}`;
    
    // Aplica o filtro automaticamente ao carregar a página
    const monthYear = filterInput.value;
    if (monthYear) {
        // Recarrega o dashboard com o filtro selecionado
        initDashboard(monthYear);
    }
    
    // Adiciona evento de clique ao botão de aplicar filtro
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', function() {
            const monthYear = filterInput.value;
            if (monthYear) {
                // Recarrega o dashboard com o filtro selecionado
                initDashboard(monthYear);
            }
        });
    }
}

// Carrega dados de contas a pagar e receber
async function carregarContasFinanceiras() {
    try {
        const hoje = new Date();
        const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        
        // Formata datas para YYYY-MM-DD
        const dataHoje = hoje.toISOString().split('T')[0];
        const dataProximoDia = new Date(hoje);
        dataProximoDia.setDate(dataProximoDia.getDate() + 1);
        const dataProximoDiaStr = dataProximoDia.toISOString().split('T')[0];
        const dataFimMes = ultimoDiaDoMes.toISOString().split('T')[0];
        
        // Carrega contas a pagar
        const contasPagarHoje = await apiGet('/api/contas-pagar', {
            vencimento_inicio: dataHoje,
            vencimento_fim: dataHoje,
            status: 'pendente'
        });
        
        const contasPagarMes = await apiGet('/api/contas-pagar', {
            vencimento_inicio: dataProximoDiaStr,
            vencimento_fim: dataFimMes,
            status: 'pendente'
        });
        
        // Carrega contas a receber
        const contasReceberHoje = await apiGet('/api/contas-receber', {
            vencimento_inicio: dataHoje,
            vencimento_fim: dataHoje,
            status: 'pendente'
        });
        
        const contasReceberMes = await apiGet('/api/contas-receber', {
            vencimento_inicio: dataProximoDiaStr,
            vencimento_fim: dataFimMes,
            status: 'pendente'
        });
        
        // Calcula totais
        const totalPagarHoje = Array.isArray(contasPagarHoje) 
            ? contasPagarHoje.reduce((sum, conta) => sum + (conta.valor || 0), 0)
            : 0;
        
        const totalPagarMes = Array.isArray(contasPagarMes)
            ? contasPagarMes.reduce((sum, conta) => sum + (conta.valor || 0), 0)
            : 0;
        
        const totalReceberHoje = Array.isArray(contasReceberHoje)
            ? contasReceberHoje.reduce((sum, conta) => sum + (conta.valor || 0), 0)
            : 0;
        
        const totalReceberMes = Array.isArray(contasReceberMes)
            ? contasReceberMes.reduce((sum, conta) => sum + (conta.valor || 0), 0)
            : 0;
        
        // Atualiza os elementos HTML
        const elemPagarHoje = document.getElementById('contas-pagar-hoje');
        const elemPagarMes = document.getElementById('contas-pagar-mes');
        const elemReceberHoje = document.getElementById('contas-receber-hoje');
        const elemReceberMes = document.getElementById('contas-receber-mes');
        
        if (elemPagarHoje) elemPagarHoje.textContent = formatarMoeda(totalPagarHoje);
        if (elemPagarMes) elemPagarMes.textContent = formatarMoeda(totalPagarMes);
        if (elemReceberHoje) elemReceberHoje.textContent = formatarMoeda(totalReceberHoje);
        if (elemReceberMes) elemReceberMes.textContent = formatarMoeda(totalReceberMes);
        
    } catch (error) {
        console.error('Erro ao carregar contas financeiras:', error);
    }
}

// Funções de gráficos removidas conforme solicitado
