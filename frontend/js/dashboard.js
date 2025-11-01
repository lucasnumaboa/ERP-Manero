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
    
    // Atualiza o card de vendas
    const salesValue = document.querySelector('.card:nth-child(1) .card-value');
    const salesChange = document.querySelector('.card:nth-child(1) .card-change');
    if (salesValue) {
        salesValue.textContent = `R$ ${data.vendas.total.toFixed(2).replace('.', ',')}`;
    }
    if (salesChange) {
        const isPositive = data.vendas.variacao > 0;
        salesChange.textContent = `${isPositive ? '+' : ''}${data.vendas.variacao}% `;
        salesChange.innerHTML += '<span>este período</span>';
        salesChange.className = `card-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Atualiza o card de clientes
    const clientsValue = document.querySelector('.card:nth-child(2) .card-value');
    const clientsChange = document.querySelector('.card:nth-child(2) .card-change');
    if (clientsValue) {
        clientsValue.textContent = data.clientes.total;
    }
    if (clientsChange) {
        const isPositive = data.clientes.variacao > 0;
        clientsChange.textContent = `${isPositive ? '+' : ''}${data.clientes.variacao}% `;
        clientsChange.innerHTML += '<span>este período</span>';
        clientsChange.className = `card-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Atualiza o card de vendedores
    const vendedoresValue = document.querySelector('.card:nth-child(3) .card-value');
    const vendedoresChange = document.querySelector('.card:nth-child(3) .card-change');
    if (vendedoresValue) {
        vendedoresValue.textContent = data.vendedores.total;
    }
    if (vendedoresChange) {
        const isPositive = data.vendedores.variacao > 0;
        vendedoresChange.textContent = `${isPositive ? '+' : ''}${data.vendedores.variacao}% `;
        vendedoresChange.innerHTML += '<span>este período</span>';
        vendedoresChange.className = `card-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Atualiza o card de pedidos
    const ordersValue = document.querySelector('.card:nth-child(4) .card-value');
    const ordersChange = document.querySelector('.card:nth-child(4) .card-change');
    if (ordersValue) {
        ordersValue.textContent = data.pedidos.total;
    }
    if (ordersChange) {
        const isPositive = data.pedidos.variacao > 0;
        ordersChange.textContent = `${isPositive ? '+' : ''}${data.pedidos.variacao}% `;
        ordersChange.innerHTML += '<span>este período</span>';
        ordersChange.className = `card-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Atualiza o card de lucro
    const profitValue = document.querySelector('.card:nth-child(5) .card-value');
    const profitChange = document.querySelector('.card:nth-child(5) .card-change');
    if (profitValue) {
        profitValue.textContent = `R$ ${data.lucro.total.toFixed(2).replace('.', ',')}`;
    }
    if (profitChange) {
        const isPositive = data.lucro.variacao > 0;
        profitChange.textContent = `${isPositive ? '+' : ''}${data.lucro.variacao}% `;
        profitChange.innerHTML += '<span>este período</span>';
        profitChange.className = `card-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Atualiza as novas métricas
    // Total Cancelados
    const totalCanceladosValue = document.getElementById('total-cancelados');
    if (totalCanceladosValue) {
        totalCanceladosValue.textContent = data.total_cancelados;
    }
    
    // Faturamento Pendente
    const faturamentoPendenteValue = document.getElementById('faturamento-pendente');
    if (faturamentoPendenteValue) {
        faturamentoPendenteValue.textContent = `R$ ${data.faturamento_pendente.toFixed(2).replace('.', ',')}`;
    }
    
    // Lucro Pendente
    const lucroPendenteValue = document.getElementById('lucro-pendente');
    if (lucroPendenteValue) {
        lucroPendenteValue.textContent = `R$ ${data.lucro_pendente.toFixed(2).replace('.', ',')}`;
    }
    
    // Faturamento Concluído
    const faturamentoConcluidoValue = document.getElementById('faturamento-concluido');
    if (faturamentoConcluidoValue) {
        faturamentoConcluidoValue.textContent = `R$ ${data.faturamento_concluido.toFixed(2).replace('.', ',')}`;
    }
    
    // Lucro Concluído
    const lucroConcluidoValue = document.getElementById('lucro-concluido');
    if (lucroConcluidoValue) {
        lucroConcluidoValue.textContent = `R$ ${data.lucro_concluido.toFixed(2).replace('.', ',')}`;
    }
}

// Função para atualizar a tabela de atividades recentes
function updateRecentActivities(vendasRecentes) {
    const tableBody = document.querySelector('.recent-activities .data-table tbody');
    if (!tableBody) return;
    
    // Limpa a tabela atual
    tableBody.innerHTML = '';
    
    // Verifica se há vendas recentes
    if (!vendasRecentes || !vendasRecentes.length) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="8" style="text-align: center; padding: 20px;">
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
        
        // Usa o custo do produto da tabela pedidos_venda
        const custo = venda.custo_produto !== null ? venda.custo_produto : venda.valor_total * 0.6;
        // Calcula o lucro com base no custo obtido
        const lucro = venda.valor_total - custo;
        
        row.innerHTML = `
            <td>#${venda.codigo}</td>
            <td>${venda.cliente_nome}</td>
            <td>Pedido #${venda.codigo}</td>
            <td>R$ ${custo.toFixed(2).replace('.', ',')}</td>
            <td>R$ ${venda.valor_total.toFixed(2).replace('.', ',')}</td>
            <td>R$ ${lucro.toFixed(2).replace('.', ',')}</td>
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

// Funções de gráficos removidas conforme solicitado
