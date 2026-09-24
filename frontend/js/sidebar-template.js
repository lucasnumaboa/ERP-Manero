/**
 * Template da Sidebar com grupos colapsáveis
 * Este script injeta a estrutura da sidebar em todas as páginas
 * Verifica permissões do usuário antes de exibir cada grupo
 */

(function () {
    // Este script fica no fim do <body>, então o menu já existe no DOM: desenha agora, sem esperar
    // o DOMContentLoaded. O CSS (.sidebar-nav:not(.menu-pronto)) esconde o menu até aqui, para o
    // vendedor nunca ver, nem por um instante, opções que não tem permissão de usar.
    if (document.querySelector('.sidebar-nav')) {
        iniciarSidebar();
    } else {
        document.addEventListener('DOMContentLoaded', iniciarSidebar);
    }

    document.addEventListener('DOMContentLoaded', function () {
        injectThemeSwitch();
        // Widget de chat com IA sobre produtos (não roda na tela de login)
        injectProdutoChatWidget();
    });

    if (document.querySelector('.sidebar')) prepararCelular();

    // ---------- Celular (css/celular.css) ----------
    // Menu lateral em gaveta: botão ☰ fixo no canto, sombra atrás da gaveta, fecha ao escolher uma tela.
    function prepararCelular() {
        if (document.getElementById('botaoMenuCelular')) return;
        const botao = document.createElement('button');
        botao.id = 'botaoMenuCelular';
        botao.type = 'button';
        botao.setAttribute('aria-label', 'Abrir menu');
        botao.innerHTML = '<i class="fas fa-bars"></i>';
        const sombra = document.createElement('div');
        sombra.id = 'sombraMenuCelular';
        document.body.append(botao);
        // A sombra fica ao lado do menu, dentro do mesmo container: o .app-container tem z-index próprio,
        // e uma sombra solta no <body> ficaria por cima da gaveta (todo toque no menu fechava a gaveta).
        const sidebar = document.querySelector('.sidebar');
        sidebar.parentElement.insertBefore(sombra, sidebar);
        document.body.classList.add('tem-menu-celular');

        const noCelular = () => window.matchMedia('(max-width: 768px)').matches;
        const fechar = () => document.body.classList.remove('menu-celular-aberto');
        botao.addEventListener('click', () => document.body.classList.add('menu-celular-aberto'));
        sombra.addEventListener('click', fechar);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
        document.querySelector('.sidebar').addEventListener('click', (e) => {
            if (!noCelular()) return;
            // o botão de recolher (☰ dentro da gaveta) fecha; um link de tela também (a página vai trocar)
            if (e.target.closest('#toggleSidebar') || e.target.closest('a[href]:not([href="#"])')) fechar();
        }, true);

        rotularTabelasEmCartoes();
    }

    // Tabelas com .tabela-cartoes viram cartões no celular: cada célula recebe o nome da coluna
    // (data-label), inclusive as linhas que a tela desenha depois, ao carregar ou filtrar.
    function rotularTabelasEmCartoes() {
        const rotular = (tabela) => {
            const titulos = [...tabela.querySelectorAll('thead th')].map(th => th.textContent.trim());
            tabela.querySelectorAll('tbody tr').forEach(tr => {
                [...tr.children].forEach((td, i) => {
                    if (td.tagName === 'TD' && !td.hasAttribute('colspan') && td.dataset.label === undefined) {
                        td.dataset.label = titulos[i] || '';
                    }
                });
            });
        };
        const rotularTudo = () => document.querySelectorAll('table.tabela-cartoes').forEach(rotular);
        rotularTudo();
        let agendado = false;
        new MutationObserver(() => {
            if (agendado) return;
            agendado = true;
            requestAnimationFrame(() => { agendado = false; rotularTudo(); });
        }).observe(document.body, { childList: true, subtree: true });
    }

    async function iniciarSidebar() {
        try {
            ligarBotaoRecolher();
            preencherUsuario(lerJson('erp_user_data'));
        } catch (error) {
            console.error('Erro ao preparar a barra lateral:', error);
        }

        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) {
            try {
                if (!sidebarNav.querySelector('.nav-group')) {
                    const emCache = permissoesEmCache();
                    renderizarMenu(sidebarNav, emCache || await getPermissionsForSidebar());
                    if (emCache && !emCache.isAdmin) revalidarPermissoes(sidebarNav, emCache);
                }
            } catch (error) {
                console.error('Erro ao montar o menu:', error);
            } finally {
                sidebarNav.classList.add('menu-pronto');
            }
        }

        // Os dados podem ter chegado junto com as permissões; se não, busca na API
        const usuario = lerJson('erp_user_data') || (typeof getCurrentUser === 'function' ? await getCurrentUser() : null);
        preencherUsuario(usuario);
        avisarDiscoCheio(usuario);
    }

    // Admin: confere uma vez por sessão se o disco do servidor está quase cheio (banco, fotos e backups param).
    async function avisarDiscoCheio(usuario) {
        if (!usuario || usuario.nivel_acesso !== 'admin' || typeof fetchWithAuth !== 'function') return;
        try {
            if (sessionStorage.getItem('erp_disco_conferido')) return;
            sessionStorage.setItem('erp_disco_conferido', '1');
            const resp = await fetchWithAuth(`${await getApiUrl()}/api/configuracoes/saude-sistema`);
            if (!resp || !resp.ok) return;
            const { disco } = await resp.json();
            if (disco && disco.alerta && typeof mostrarAviso === 'function') {
                mostrarAviso(`Disco do servidor com ${disco.usado_pct}% em uso (restam ${disco.livre_gb} GB). Libere espaço para o banco e os backups não pararem.`, 'aviso');
            }
        } catch (error) {
            console.error('Erro ao conferir o disco do servidor:', error);
        }
    }

    function renderizarMenu(sidebarNav, permissions) {
        sidebarNav.innerHTML = getSidebarTemplate(permissions);
        removeEmptyGroups();
        initSidebarGroups();
        setupLogoutButton();
    }

    // Permissões de grupo podem mudar enquanto o usuário está logado: busca as atuais em segundo
    // plano e redesenha o menu só se algo mudou.
    async function revalidarPermissoes(sidebarNav, emCache) {
        if (typeof getUserPermissions !== 'function') return;
        try {
            const atuais = await getUserPermissions();
            if (atuais && Object.keys(atuais).length && JSON.stringify(atuais) !== JSON.stringify(emCache)) {
                renderizarMenu(sidebarNav, atuais);
            }
        } catch (error) {
            console.error('Erro ao atualizar permissões do menu:', error);
        }
    }

    function permissoesEmCache() {
        const user = lerJson('erp_user_data');
        if (user && user.nivel_acesso === 'admin') return { isAdmin: true };
        return lerJson('erp_user_permissions');
    }

    function lerJson(chave) {
        try {
            return JSON.parse(localStorage.getItem(chave)) || null;
        } catch (e) {
            return null;
        }
    }

    function preencherUsuario(user) {
        if (!user) return;
        const nomesNivel = { admin: 'Administrador', usuario: 'Usuário', vendedor: 'Vendedor', comprador: 'Comprador', financeiro: 'Financeiro' };
        const nome = document.getElementById('userName');
        const nivel = document.getElementById('userRole');
        if (nome) nome.textContent = user.nome || 'Usuário';
        if (nivel) nivel.textContent = nomesNivel[user.nivel_acesso] || user.nivel_acesso || 'Usuário';
    }

    // Único ponto que liga o botão de recolher o menu (as telas não ligam mais por conta própria).
    function ligarBotaoRecolher() {
        const botao = document.getElementById('toggleSidebar');
        if (!botao || botao.dataset.recolherLigado) return;
        botao.dataset.recolherLigado = '1';
        botao.addEventListener('click', function () {
            document.querySelector('.sidebar')?.classList.toggle('collapsed');
            document.querySelector('.main-content')?.classList.toggle('expanded');
        });
    }

    function setupLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof logout === 'function') {
                    logout();
                } else {
                    // Fallback se a função logout não estiver disponível
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = 'index.html';
                }
            });
        }
    }

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
            'orcamentos.html': 'vendas_visualizar',
            'clientes.html': 'clientes_visualizar',
            'vendedores.html': 'vendedores_visualizar',
            'plataformas_venda.html': 'vendas_visualizar',
            'compras.html': 'compras_visualizar',
            'fornecedores.html': 'fornecedores_visualizar',
            'produtos.html': 'produtos_visualizar',
            'categorias.html': 'categorias_visualizar',
            'depositos.html': 'depositos_visualizar',
            'estoque.html': 'estoque_visualizar',
            'exportar_estoque.html': 'estoque_visualizar',

            'controle_financeiro.html': 'financeiro_visualizar',
            'contas_pagar.html': 'financeiro_visualizar',
            'contas_receber.html': 'financeiro_visualizar',
            'condicoes_pagamento.html': 'financeiro_visualizar',
            'configuracoes.html': 'configuracoes_visualizar',

            'produtos_3d.html': 'filamentos_3d_visualizar',
            'filamentos_3d.html': 'filamentos_3d_visualizar',
            'filamentos_3d.html?tab=compra': 'filamentos_3d_visualizar',
            'filamentos_3d.html?tab=calculadora': 'filamentos_3d_visualizar',
            'filamentos_3d.html?tab=estoque': 'filamentos_3d_visualizar'
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
            menuItem('orcamentos.html', 'fa-file-invoice-dollar', 'Orçamentos'),
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
            menuItem('depositos.html', 'fa-warehouse', 'Depósitos'),
            menuItem('estoque.html', 'fa-warehouse', 'Estoque'),
            menuItem('exportar_estoque.html', 'fa-file-export', 'Exportar')
        ]);

        const produtos3DGroup = menuGroup('produtos3d', 'fa-cube', 'Produtos 3D', [
            menuItem('produtos_3d.html', 'fa-cube', 'Produtos 3D'),
            menuItem('filamentos_3d.html', 'fa-layer-group', 'Filamentos'),
            menuItem('filamentos_3d.html?tab=compra', 'fa-shopping-cart', 'Compra'),
            menuItem('filamentos_3d.html?tab=calculadora', 'fa-calculator', 'Calculadora'),
            menuItem('filamentos_3d.html?tab=estoque', 'fa-boxes', 'Estoque')
        ]);

        const financeiroGroup = menuGroup('financeiro', 'fa-dollar-sign', 'Financeiro', [
            menuItem('controle_financeiro.html', 'fa-sliders-h', 'Controle Financeiro'),
            menuItem('contas_pagar.html', 'fa-money-bill-wave', 'Contas a Pagar'),
            menuItem('contas_receber.html', 'fa-hand-holding-usd', 'Contas a Receber'),
            menuItem('condicoes_pagamento.html', 'fa-percent', 'Condições Pgto')
        ]);

        const relatoriosGroup = menuGroup('relatorios', 'fa-chart-bar', 'Relatórios', [
            menuItem('relatorios.html', 'fa-chart-line', 'Relatórios'),
            menuItem('calendario.html', 'fa-calendar-alt', 'Calendário')
        ]);

        const olxFinderGroup = menuGroup('olxfinder', 'fa-search-dollar', 'OLX Finder', [
            menuItem('olx_produtos.html', 'fa-box-open', 'Produtos'),
            menuItem('olx_pesquisas.html', 'fa-search', 'Pesquisas'),
            menuItem('olx_flags.html', 'fa-filter', 'Flags')
        ]);

        const sistemaGroup = menuGroup('sistema', 'fa-cog', 'Sistema', [
            menuItem('configuracoes.html', 'fa-cog', 'Configurações')
        ]);

        // Softwares como item separado
        const softwaresItem = hasPagePermission(permissions, 'softwares.html')
            ? '<li><a href="softwares.html"><i class="fas fa-download"></i> <span>Softwares</span></a></li>'
            : '';

        // Verifica se há grupos visíveis para adicionar separadores
        const hasGroups = vendasGroup || comprasGroup || produtosGroup || produtos3DGroup || financeiroGroup || relatoriosGroup || olxFinderGroup;
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
                ${produtos3DGroup}
                ${financeiroGroup}
                ${relatoriosGroup}
                ${olxFinderGroup}
                
                ${hasSistema ? '<li class="nav-separator"></li>' : ''}
                
                ${sistemaGroup}
                
                ${softwaresItem}
                
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
            header.addEventListener('click', function (e) {
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
                themeSwitch.addEventListener('change', function () {
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

    // Injeta o script do widget de chat com IA sobre produtos, uma única vez por página.
    // Fica de fora da tela de login (não há sessão/produtos pra consultar ali).
    function injectProdutoChatWidget() {
        if (window.location.pathname.includes('index.html')) return;
        if (document.getElementById('produtoChatWidgetScript')) return;

        const script = document.createElement('script');
        script.id = 'produtoChatWidgetScript';
        script.src = 'js/produto-chat-widget.js?v=82c3beb715';
        document.body.appendChild(script);
    }
})();
