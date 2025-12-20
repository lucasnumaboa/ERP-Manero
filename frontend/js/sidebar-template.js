/**
 * Template da Sidebar com grupos colapsáveis
 * Este script injeta a estrutura da sidebar em todas as páginas
 * Verifica permissões do usuário antes de exibir cada grupo
 */

(function() {
    document.addEventListener('DOMContentLoaded', async function() {
        // Injeta o theme switch se não existir
        injectThemeSwitch();
        
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) return;
        
        // Verifica se já tem a nova estrutura de grupos
        if (sidebarNav.querySelector('.nav-group')) return;
        
        // Obtém as permissões do usuário
        const permissions = await getPermissionsForSidebar();
        
        // Substitui o conteúdo da sidebar pela nova estrutura baseada em permissões
        sidebarNav.innerHTML = getSidebarTemplate(permissions);
        
        // Remove grupos vazios (sem itens visíveis)
        removeEmptyGroups();
        
        // Inicializa os grupos colapsáveis
        initSidebarGroups();
    });
    
    // Obtém permissões do usuário para a sidebar
    async function getPermissionsForSidebar() {
        try {
            // Verifica se é admin
            const userData = localStorage.getItem('erp_user_data');
            if (userData) {
                const user = JSON.parse(userData);
                if (user.nivel_acesso === 'admin') {
                    return { isAdmin: true };
                }
            }
            
            // Busca permissões do cache ou da API
            const cachedPermissions = localStorage.getItem('erp_user_permissions');
            if (cachedPermissions) {
                return JSON.parse(cachedPermissions);
            }
            
            // Se não tiver cache, tenta buscar via função global
            if (typeof getUserPermissions === 'function') {
                return await getUserPermissions();
            }
            
            return {};
        } catch (error) {
            console.error('Erro ao obter permissões para sidebar:', error);
            return {};
        }
    }
    
    // Verifica se tem permissão para uma página específica
    function hasPagePermission(permissions, page) {
        if (permissions.isAdmin) return true;
        
        const permissionMap = {
            'dashboard.html': 'dashboard_visualizar',
            'relatorios.html': 'dashboard_visualizar',
            'metas.html': 'metas_visualizar',
            'vendas.html': 'vendas_visualizar',
            'clientes.html': 'clientes_visualizar',
            'vendedores.html': 'vendedores_visualizar',
            'plataformas_venda.html': 'vendas_visualizar',
            'compras.html': 'compras_visualizar',
            'fornecedores.html': 'fornecedores_visualizar',
            'produtos.html': 'produtos_visualizar',
            'categorias.html': 'categorias_visualizar',
            'estoque.html': 'estoque_visualizar',
            'exportar_estoque.html': 'estoque_visualizar',
            'contas_pagar.html': 'financeiro_visualizar',
            'contas_receber.html': 'financeiro_visualizar',
            'condicoes_pagamento.html': 'financeiro_visualizar',
            'configuracoes.html': 'configuracoes_visualizar'
        };
        
        const requiredPermission = permissionMap[page];
        if (!requiredPermission) return true; // Páginas sem permissão específica são visíveis
        
        return permissions[requiredPermission] === true || permissions[requiredPermission] === 1;
    }
    
    // Remove grupos que não têm nenhum item visível
    function removeEmptyGroups() {
        const groups = document.querySelectorAll('.nav-group');
        groups.forEach(group => {
            const visibleItems = group.querySelectorAll('.nav-group-items a:not([style*="display: none"])');
            if (visibleItems.length === 0) {
                group.style.display = 'none';
            }
        });
    }

    function getSidebarTemplate(permissions) {
        // Função auxiliar para criar item de menu
        function menuItem(href, icon, label) {
            if (!hasPagePermission(permissions, href)) return '';
            return `<a href="${href}"><i class="fas ${icon}"></i> <span>${label}</span></a>`;
        }
        
        // Função auxiliar para criar grupo de menu
        function menuGroup(groupId, icon, label, items) {
            const visibleItems = items.filter(item => item !== '');
            if (visibleItems.length === 0) return '';
            
            return `
                <li class="nav-group">
                    <div class="nav-group-header" data-group="${groupId}">
                        <span><i class="fas ${icon} group-icon"></i> ${label}</span>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                    <div class="nav-group-items">
                        ${visibleItems.join('')}
                    </div>
                </li>
            `;
        }
        
        // Gera os grupos baseados em permissões
        const vendasGroup = menuGroup('vendas', 'fa-shopping-cart', 'Vendas', [
            menuItem('vendas.html', 'fa-shopping-cart', 'Vendas'),
            menuItem('clientes.html', 'fa-users', 'Clientes'),
            menuItem('vendedores.html', 'fa-user-tie', 'Vendedores'),
            menuItem('plataformas_venda.html', 'fa-store', 'Plataformas'),
            menuItem('metas.html', 'fa-bullseye', 'Metas')
        ]);
        
        const comprasGroup = menuGroup('compras', 'fa-truck', 'Compras', [
            menuItem('compras.html', 'fa-truck', 'Compras'),
            menuItem('fornecedores.html', 'fa-industry', 'Fornecedores')
        ]);
        
        const produtosGroup = menuGroup('produtos', 'fa-box', 'Produtos', [
            menuItem('produtos.html', 'fa-box', 'Produtos'),
            menuItem('categorias.html', 'fa-tags', 'Categorias'),
            menuItem('estoque.html', 'fa-warehouse', 'Estoque'),
            menuItem('exportar_estoque.html', 'fa-file-export', 'Exportar')
        ]);
        
        const financeiroGroup = menuGroup('financeiro', 'fa-dollar-sign', 'Financeiro', [
            menuItem('contas_pagar.html', 'fa-money-bill-wave', 'Contas a Pagar'),
            menuItem('contas_receber.html', 'fa-hand-holding-usd', 'Contas a Receber'),
            menuItem('condicoes_pagamento.html', 'fa-percent', 'Condições Pgto')
        ]);
        
        const relatoriosGroup = menuGroup('relatorios', 'fa-chart-bar', 'Relatórios', [
            menuItem('relatorios.html', 'fa-chart-line', 'Relatórios')
        ]);
        
        const sistemaGroup = menuGroup('sistema', 'fa-cog', 'Sistema', [
            menuItem('configuracoes.html', 'fa-cog', 'Configurações')
        ]);
        
        // Verifica se há grupos visíveis para adicionar separadores
        const hasGroups = vendasGroup || comprasGroup || produtosGroup || financeiroGroup || relatoriosGroup;
        const hasSistema = sistemaGroup;
        
        // Dashboard - verifica permissão
        const dashboardItem = hasPagePermission(permissions, 'dashboard.html') 
            ? '<li><a href="dashboard.html"><i class="fas fa-tachometer-alt"></i> <span>Dashboard</span></a></li>'
            : '';
        
        return `
            <ul>
                <!-- Links Diretos -->
                <li>
                    <a href="homepage.html"><i class="fas fa-home"></i> <span>Home</span></a>
                </li>
                ${dashboardItem}
                
                ${hasGroups ? '<li class="nav-separator"></li>' : ''}
                
                ${vendasGroup}
                ${comprasGroup}
                ${produtosGroup}
                ${financeiroGroup}
                ${relatoriosGroup}
                
                ${hasSistema ? '<li class="nav-separator"></li>' : ''}
                
                ${sistemaGroup}
                
                <li class="nav-separator"></li>
                
                <li class="logout">
                    <a href="#" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> <span>Sair</span></a>
                </li>
            </ul>
        `;
    }

    function initSidebarGroups() {
        const groupHeaders = document.querySelectorAll('.nav-group-header');
        
        groupHeaders.forEach(header => {
            header.addEventListener('click', function(e) {
                e.preventDefault();
                toggleGroup(this);
            });
        });

        expandCurrentPageGroup();
        restoreGroupStates();
    }

    function toggleGroup(header) {
        const groupItems = header.nextElementSibling;
        const isExpanded = header.classList.contains('expanded');
        
        if (isExpanded) {
            header.classList.remove('expanded');
            groupItems.classList.remove('expanded');
        } else {
            header.classList.add('expanded');
            groupItems.classList.add('expanded');
        }
        
        saveGroupStates();
    }

    function expandCurrentPageGroup() {
        const currentPage = window.location.pathname.split('/').pop() || 'homepage.html';
        
        const activeLink = document.querySelector(`.nav-group-items a[href="${currentPage}"]`);
        
        if (activeLink) {
            activeLink.classList.add('active');
            
            const groupItems = activeLink.closest('.nav-group-items');
            const groupHeader = groupItems?.previousElementSibling;
            
            if (groupItems && groupHeader) {
                groupHeader.classList.add('expanded', 'active');
                groupItems.classList.add('expanded');
            }
        }
        
        const directLink = document.querySelector(`.sidebar-nav > ul > li > a[href="${currentPage}"]`);
        if (directLink) {
            directLink.classList.add('active');
            directLink.parentElement.classList.add('active');
        }
    }

    function saveGroupStates() {
        const groupHeaders = document.querySelectorAll('.nav-group-header');
        const states = {};
        
        groupHeaders.forEach(header => {
            const groupName = header.dataset.group;
            if (groupName) {
                states[groupName] = header.classList.contains('expanded');
            }
        });
        
        localStorage.setItem('sidebarGroupStates', JSON.stringify(states));
    }

    function restoreGroupStates() {
        const savedStates = localStorage.getItem('sidebarGroupStates');
        if (!savedStates) return;
        
        try {
            const states = JSON.parse(savedStates);
            const groupHeaders = document.querySelectorAll('.nav-group-header');
            
            groupHeaders.forEach(header => {
                const groupName = header.dataset.group;
                const groupItems = header.nextElementSibling;
                
                if (header.classList.contains('active')) return;
                
                if (groupName && states[groupName]) {
                    header.classList.add('expanded');
                    groupItems?.classList.add('expanded');
                }
            });
        } catch (e) {
            console.error('Erro ao restaurar estados dos grupos:', e);
        }
    }
    
    // Injeta o theme switch na sidebar se não existir
    function injectThemeSwitch() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        
        // Verifica se já existe o theme switch
        if (sidebar.querySelector('.theme-switch-wrapper')) return;
        
        const sidebarHeader = sidebar.querySelector('.sidebar-header');
        if (!sidebarHeader) return;
        
        // Cria o elemento do theme switch
        const themeSwitchWrapper = document.createElement('div');
        themeSwitchWrapper.className = 'theme-switch-wrapper';
        themeSwitchWrapper.innerHTML = `
            <span class="switch-label"><i class="fas fa-moon"></i></span>
            <label class="theme-switch">
                <input type="checkbox" id="themeSwitch">
                <span class="slider"></span>
            </label>
            <span class="switch-label"><i class="fas fa-sun"></i></span>
        `;
        
        // Insere após o sidebar-header
        sidebarHeader.insertAdjacentElement('afterend', themeSwitchWrapper);
        
        // Inicializa o estado do switch baseado no tema atual
        const themeSwitch = themeSwitchWrapper.querySelector('#themeSwitch');
        if (themeSwitch) {
            const isLight = document.body.classList.contains('theme-light');
            themeSwitch.checked = isLight;
            
            // Chama o init do ThemeSwitcher se disponível
            if (typeof ThemeSwitcher !== 'undefined' && ThemeSwitcher.init) {
                ThemeSwitcher.init();
            } else {
                // Fallback: adiciona event listener diretamente
                themeSwitch.addEventListener('change', function() {
                    if (typeof ThemeSwitcher !== 'undefined') {
                        ThemeSwitcher.toggle();
                    } else {
                        document.body.classList.toggle('theme-light');
                        localStorage.setItem('erp-maneiro-theme', 
                            document.body.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'
                        );
                    }
                });
            }
        }
    }
})();
