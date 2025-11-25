// Script específico para a homepage
document.addEventListener('DOMContentLoaded', function() {
    // Verificar se estamos na página correta
    if (window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'homepage.html';
        return;
    }
    
    // Carregar dados do usuário do localStorage
    loadUserData();
    
    // Configurar data e hora atual
    updateDateTime();
    
    // Configurar atalhos com base nas permissões
    setupShortcuts();
    
    // Carregar atividades recentes se o usuário tiver permissão
    loadRecentActivities();
    
    // Configurar botão de logout
    setupLogout();
});

// Função para carregar os dados do usuário do localStorage
function loadUserData() {
    const welcomeUserName = document.getElementById('welcomeUserName');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    // Obter dados do usuário do localStorage
    const userData = JSON.parse(localStorage.getItem('erp_user_data'));
    
    if (userData) {
        // Atualizar elementos na interface
        if (welcomeUserName) welcomeUserName.textContent = userData.nome || userData.email || 'Usuário';
        if (userName) userName.textContent = userData.nome || userData.email || 'Usuário';
        if (userRole) userRole.textContent = userData.role || 'Usuário';
    }
}

// Função para atualizar a data e hora
function updateDateTime() {
    const dateTimeElement = document.getElementById('currentDateTime');
    if (dateTimeElement) {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        dateTimeElement.textContent = now.toLocaleDateString('pt-BR', options);
    }
}

// Função para carregar atividades recentes
async function loadRecentActivities() {
    try {
        // Verificar se o usuário tem permissão para visualizar vendas
        const hasVendasPermission = await hasPermission('vendas_visualizar');
        
        if (!hasVendasPermission) {
            return; // Não exibe a seção se não tiver permissão
        }
        
        // Mostrar a seção de atividades recentes
        const recentActivitiesSection = document.getElementById('recent-activities-section');
        if (recentActivitiesSection) {
            recentActivitiesSection.style.display = 'block';
        }
        
        // Fazer requisição para obter dados do dashboard
        const response = await fetch(`${API_BASE_URL}/dashboard/`, {
            method: 'GET',
            headers: {
                'Authorization': `${localStorage.getItem('erp_token_type')} ${localStorage.getItem('erp_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar atividades recentes');
        }
        
        const data = await response.json();
        updateHomepageRecentActivities(data.vendas_recentes || []);
        
    } catch (error) {
        console.error('Erro ao carregar atividades recentes:', error);
        // Em caso de erro, ocultar a seção
        const recentActivitiesSection = document.getElementById('recent-activities-section');
        if (recentActivitiesSection) {
            recentActivitiesSection.style.display = 'none';
        }
    }
}

// Função para atualizar a tabela de atividades recentes no homepage
function updateHomepageRecentActivities(vendasRecentes) {
    const tbody = document.getElementById('homepage-recent-activities');
    
    if (!vendasRecentes || vendasRecentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma atividade recente encontrada</td></tr>';
        return;
    }
    
    // Pegar apenas as 3 atividades mais recentes
    const recentActivities = vendasRecentes.slice(0, 3);
    
    tbody.innerHTML = recentActivities.map(venda => {
        const dataFormatada = new Date(venda.data_pedido).toLocaleDateString('pt-BR');
        const statusClass = venda.status === 'concluido' ? 'status-completed' : 
                           venda.status === 'pendente' ? 'status-pending' : 'status-cancelled';
        
        // Formatação dos produtos vendidos
        const produtosVendidos = venda.produtos_vendidos || 'N/A';
        const quantidadeTotal = venda.quantidade_total || 0;
        
        // Truncar produtos se muito longo
        const produtosDisplay = produtosVendidos.length > 30 ? 
                               produtosVendidos.substring(0, 30) + '...' : 
                               produtosVendidos;
        
        return `
            <tr>
                <td>#${venda.codigo}</td>
                <td>${venda.cliente_nome}</td>
                <td title="${produtosVendidos}">${produtosDisplay}</td>
                <td>${quantidadeTotal}</td>
                <td>R$ ${parseFloat(venda.valor_total).toFixed(2)}</td>
                <td><span class="status ${statusClass}">${venda.status}</span></td>
                <td>${dataFormatada}</td>
            </tr>
        `;
    }).join('');
}

// Função para configurar os atalhos com base nas permissões
async function setupShortcuts() {
    // Mapeamento de atalhos para permissões
    const shortcutPermissions = {
        'dashboard-shortcut': 'dashboard_visualizar',
        'produtos-shortcut': 'produtos_visualizar',
        'categorias-shortcut': 'categorias_visualizar',
        'clientes-shortcut': 'clientes_visualizar',
        'vendas-shortcut': 'vendas_visualizar',
        'vendedores-shortcut': 'vendedores_visualizar',
        'estoque-shortcut': 'estoque_visualizar',
        'financeiro-shortcut': 'financeiro_visualizar',
        'compras-shortcut': 'compras_visualizar',
        'fornecedores-shortcut': 'fornecedores_visualizar',
        'contas_pagar-shortcut': 'financeiro_visualizar',
        'contas_receber-shortcut': 'financeiro_visualizar',
        'condicoes_pagamento-shortcut': 'financeiro_visualizar',
        'relatorios-shortcut': 'dashboard_visualizar',
        'configuracoes-shortcut': 'configuracoes_visualizar'
    };

    // Verificar permissões para cada atalho
    const shortcuts = document.querySelectorAll('.shortcut-card');
    for (const shortcut of shortcuts) {
        const id = shortcut.id;
        const permission = shortcutPermissions[id];
        
        if (permission) {
            // Verificar se o usuário tem permissão para visualizar este atalho
            const hasViewPermission = await hasPermission(permission);
            shortcut.style.display = hasViewPermission ? 'flex' : 'none';
        } else {
            // Se não houver mapeamento de permissão, mostrar por padrão
            shortcut.style.display = 'flex';
        }
    }
    
    // A verificação de permissão para o dashboard foi removida
}

// As funções de carregamento de dados do dashboard foram removidas
// para manter a página inicial mais limpa e organizada

// Função para configurar o botão de logout
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Limpar dados de autenticação
            localStorage.removeItem('erp_token');
            localStorage.removeItem('erp_token_type');
            localStorage.removeItem('erp_user_data');
            // Redirecionar para a página de login
            window.location.href = 'index.html';
        });
    }
}