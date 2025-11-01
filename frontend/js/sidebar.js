// Sidebar functionality
document.addEventListener('DOMContentLoaded', async function() {
    // Oculta todos os itens do menu inicialmente
    hideAllMenuItems();
    
    setupSidebarToggle();
    
    // Carrega os dados do usuário
    await loadUserData();
    
    // Verifica permissões e atualiza o menu
    updateMenuBasedOnPermissions();
});

// Função para carregar os dados do usuário
async function loadUserData() {
    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');
    
    if (userName && userRole) {
        // Obter token do localStorage
        const token = localStorage.getItem('erp_token');
        
        if (!token) {
            // Redirecionar para a página de login se não houver token
            window.location.href = 'index.html';
            return;
        }
        
        // Obter a URL da API sempre do banco
        const apiUrl = await getApiUrl();
        
        // Fazer requisição para obter dados do usuário
        fetch(`${apiUrl}/api/usuarios/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao obter dados do usuário');
            }
            return response.json();
        })
        .then(data => {
            // Atualizar elementos na interface
            userName.textContent = data.nome || data.email;
            userRole.textContent = data.role || 'Usuário';
        })
        .catch(error => {
            console.error('Erro ao carregar dados do usuário:', error);
            // Em caso de erro, mostrar valores padrão
            userName.textContent = 'Usuário';
            userRole.textContent = 'Não autenticado';
        });
    }
}

// Função para ocultar todos os itens do menu inicialmente
function hideAllMenuItems() {
    const menuLinks = document.querySelectorAll('.sidebar-nav a');
    for (const link of menuLinks) {
        // Não oculta o link de logout
        if (link.closest('.logout')) continue;
        
        // Oculta os demais links
        link.parentElement.style.display = 'none';
    }
}

// Função para atualizar o menu com base nas permissões do usuário
async function updateMenuBasedOnPermissions() {
    try {
        console.log('Iniciando atualização do menu baseado em permissões');
        
        const menuItems = {
            'homepage.html': 'homepage_visualizar',
            'dashboard.html': 'dashboard_visualizar',
            'produtos.html': 'produtos_visualizar',
            'clientes.html': 'clientes_visualizar',
            'vendas.html': 'vendas_visualizar',
            'vendedores.html': 'vendedores_visualizar',
            'compras.html': 'compras_visualizar',
            'fornecedores.html': 'fornecedores_visualizar',
            'estoque.html': 'estoque_visualizar',
            'financeiro.html': 'financeiro_visualizar',
            'configuracoes.html': 'configuracoes_visualizar'
        };
        
        // Obtém o usuário atual
        console.log('Obtendo dados do usuário atual...');
        const user = await getCurrentUser();
        console.log('Usuário atual:', user);
        
        // Se for admin, mostra todas as opções
        if (user && user.nivel_acesso === 'admin') {
            console.log('Usuário é admin, mostrando todas as opções');
            const menuLinks = document.querySelectorAll('.sidebar-nav a');
            for (const link of menuLinks) {
                link.parentElement.style.display = 'block';
                console.log(`Item de menu exibido (admin): ${link.getAttribute('href') || 'sem href'}`);
            }
            return;
        }
        
        console.log('Usuário não é admin, verificando permissões específicas');
        
        // Força a atualização das permissões do usuário
        localStorage.removeItem('erp_user_permissions'); // Limpa o cache para forçar nova consulta
        console.log('Chamando getUserPermissions()...');
        const permissions = await getUserPermissions();
        console.log('Permissões atualizadas para o menu:', permissions);
        console.log('Permissões disponíveis:', Object.keys(permissions).join(', '));
        
        // Obtém todos os links do menu
        const menuLinks = document.querySelectorAll('.sidebar-nav a');
        
        // Verifica cada link do menu
        for (const link of menuLinks) {
            const href = link.getAttribute('href');
            
            // Pula o link de logout
            if (link.closest('.logout')) {
                link.parentElement.style.display = 'block';
                console.log('Link de logout exibido');
                continue;
            }
            
            // Homepage é sempre acessível
            if (href === 'homepage.html') {
                link.parentElement.style.display = 'block';
                console.log('Mostrando homepage - acessível para todos os usuários');
                continue;
            }
            
            // Redireciona dashboard.html para homepage.html sempre
            if (href === 'dashboard.html') {
                // Redireciona quando clicado
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.location.href = 'homepage.html';
                });
                
                // Também redireciona se esta for a página atual
                if (window.location.pathname.includes('dashboard.html')) {
                    window.location.href = 'homepage.html';
                }
            }
            
            // Verifica se o link está no mapeamento de permissões
            if (href && menuItems[href]) {
                const permission = menuItems[href];
                
                // Verifica se a permissão existe e é verdadeira (aceita true ou 1)
                const hasAccess = permissions && (permissions[permission] === true || permissions[permission] === 1);
                console.log(`Item: ${href}, Permissão necessária: ${permission}, Valor da permissão: ${permissions[permission]}, Acesso concedido: ${hasAccess}`);
                
                if (hasAccess) {
                    console.log(`Mostrando opção ${href} - permissão ${permission} concedida`);
                    link.parentElement.style.display = 'block';
                } else {
                    console.log(`Ocultando opção ${href} - permissão ${permission} negada`);
                    link.parentElement.style.display = 'none';
                }
            } else {
                // Para links que não têm mapeamento de permissão, mostra por padrão
                link.parentElement.style.display = 'block';
                console.log(`Exibindo link sem mapeamento de permissão: ${href || 'sem href'}`);
            }
        }
        
        console.log('Atualização do menu concluída');
    } catch (error) {
        console.error('Exceção ao atualizar menu com base nas permissões:', error);
        // Em caso de erro, mostra todos os itens do menu
        console.warn('Exibindo todos os itens do menu devido ao erro');
        const menuLinks = document.querySelectorAll('.sidebar-nav a');
        for (const link of menuLinks) {
            link.parentElement.style.display = 'block';
            console.log(`Item de menu exibido (devido a erro): ${link.getAttribute('href') || 'sem href'}`);
        }
    }
}

// Function to toggle sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
}



// Function to fix vendas link issue
function fixVendasLink() {
    const vendasLink = document.querySelector('.sidebar-nav a[href="vendas.html"]');
    if (vendasLink) {
        vendasLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'vendas.html';
        });
    }
}
