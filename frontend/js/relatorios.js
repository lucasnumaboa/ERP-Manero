// Configuração inicial

document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticação
    checkAuth();
    
    // Configurar sidebar toggle
    setupSidebarToggle();
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Configurar categorias de relatórios
    setupReportCategories();
    
    // Configurar botões de ação
    document.getElementById('btnGerarRelatorio').addEventListener('click', gerarRelatorio);
    document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
    document.getElementById('btnExportarExcel').addEventListener('click', exportarExcel);
    
    // Inicializar datas
    initializeDates();
});

// Funções de autenticação
function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
    }
}

function logout() {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_token_type');
    localStorage.removeItem('erp_user_data');
    window.location.href = 'index.html';
}

// Função getAuthHeader removida - Autenticação agora é gerenciada pela API centralizada

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

// Funções para relatórios
function setupReportCategories() {
    const categories = document.querySelectorAll('.category-card');
    const reportContents = document.querySelectorAll('.report-content');
    
    categories.forEach(category => {
        category.addEventListener('click', function() {
            // Remover classe active de todas as categorias
            categories.forEach(c => c.classList.remove('active'));
            
            // Adicionar classe active à categoria clicada
            this.classList.add('active');
            
            // Esconder todos os conteúdos de relatório
            reportContents.forEach(content => content.classList.remove('active'));
            
            // Mostrar o conteúdo correspondente à categoria clicada
            const categoryName = this.dataset.category;
            document.getElementById(`report-${categoryName}`).classList.add('active');
        });
    });
}

function initializeDates() {
    // Definir data inicial como primeiro dia do mês atual
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    document.getElementById('filterDataInicio').valueAsDate = firstDay;
    document.getElementById('filterDataFim').valueAsDate = lastDay;
}

async function gerarRelatorio() {
    const dataInicio = document.getElementById('filterDataInicio').value;
    const dataFim = document.getElementById('filterDataFim').value;
    
    if (!dataInicio || !dataFim) {
        alert('Por favor, selecione o período do relatório.');
        return;
    }
    
    // Identificar qual categoria está ativa
    const activeCategory = document.querySelector('.category-card.active').dataset.category;
    
    // Atualizar o período exibido
    const dataInicioFormatada = formatarData(dataInicio);
    const dataFimFormatada = formatarData(dataFim);
    // Atualiza o período exibido com segurança
    const periodElId = `periodo${capitalizeFirstLetter(activeCategory)}`;
    console.log('Atualizando período para elemento:', periodElId);
    const periodEl = document.getElementById(periodElId);
    if (periodEl) {
        periodEl.textContent = `${dataInicioFormatada} a ${dataFimFormatada}`;
    } else {
        console.warn(`Elemento de período não encontrado: ${periodElId}`);
    }
    
    try {
        console.log(`Gerando relatório de ${activeCategory} para o período ${dataInicio} a ${dataFim}`);
        
        // Usa a API centralizada
        const url = `/api/relatorios/${activeCategory}?data_inicio=${dataInicio}&data_fim=${dataFim}`;
        console.log(`Enviando requisição GET para API centralizada: ${url}`);
        console.log(`Full request URL: ${getApiBaseUrl()}${url}`);
        
        const data = await apiGet(url);
        console.log(`Dados do relatório de ${activeCategory} recebidos:`, data);
        
        renderizarRelatorio(activeCategory, data);
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        alert(`Erro ao gerar relatório: ${error.message || 'Por favor, tente novamente.'}`);
        
        // Para fins de demonstração, poderia implementar dados simulados aqui
        // se estiver em ambiente de desenvolvimento
    }
}

function renderizarRelatorio(categoria, dados) {
    // Esta função renderiza os dados reais do relatório
    console.log(`Renderizando relatório de ${categoria} com dados:`, dados);

    if (categoria === 'geral') {
        const container = document.getElementById('geral-summary');
        container.innerHTML = '';
        const metrics = [
            { title: 'Leads', value: dados.leads, isCurrency: false },
            { title: 'Valorização de Estoque', value: dados.estoque_valorizacao, isCurrency: true },
            { title: 'Lucro', value: dados.lucro, isCurrency: true },
            { title: 'Faturamento Bruto', value: dados.faturamento_bruto, isCurrency: true },
            { title: 'Faturamento Líquido', value: dados.faturamento_liquido, isCurrency: true }
        ];
        metrics.forEach(metric => {
            const card = document.createElement('div');
            card.className = 'summary-card';
            const h3 = document.createElement('h3');
            h3.textContent = metric.title;
            const p = document.createElement('p');
            p.className = 'summary-value';
            if (metric.isCurrency) {
                p.textContent = metric.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            } else {
                p.textContent = metric.value;
            }
            card.appendChild(h3);
            card.appendChild(p);
            container.appendChild(card);
        });
        alert('Relatório Geral gerado com sucesso!');
        return;
    }

    // Implementação para relatório de vendas
    if (categoria === 'vendas') {
        const container = document.getElementById('report-vendas');
        const summaryContainer = container.querySelector('.report-summary');
        summaryContainer.innerHTML = '';
        const metrics = [
            { title: 'Total de Vendas', value: dados.total_vendas, isCurrency: true },
            { title: 'Quantidade de Pedidos', value: dados.quantidade_pedidos, isCurrency: false },
            { title: 'Ticket Médio', value: dados.ticket_medio, isCurrency: true }
        ];
        metrics.forEach(metric => {
            const card = document.createElement('div');
            card.className = 'summary-card';
            const h3 = document.createElement('h3');
            h3.textContent = metric.title;
            const p = document.createElement('p');
            p.className = 'summary-value';
            if (metric.isCurrency) {
                p.textContent = metric.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            } else {
                p.textContent = metric.value;
            }
            card.appendChild(h3);
            card.appendChild(p);
            summaryContainer.appendChild(card);
        });
        alert('Relatório de Vendas gerado com sucesso!');
        return;
    }

    // Implementação para outras categorias
    alert(`Relatório de ${capitalizeFirstLetter(categoria)} gerado com sucesso!`);
}

// Função de dados mockados removida

function exportarPDF() {
    const activeCategory = document.querySelector('.category-card.active').dataset.category;
    alert(`Exportando relatório de ${capitalizeFirstLetter(activeCategory)} em PDF...`);
    // Aqui você implementaria a lógica para exportar o relatório em PDF
}

function exportarExcel() {
    const activeCategory = document.querySelector('.category-card.active').dataset.category;
    alert(`Exportando relatório de ${capitalizeFirstLetter(activeCategory)} em Excel...`);
    // Aqui você implementaria a lógica para exportar o relatório em Excel
}

// Funções utilitárias
function formatarData(dataString) {
    if (!dataString) return '';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
