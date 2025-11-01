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
    
    // Não carregamos mais dados do dashboard na homepage
    
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