/**
 * Gerenciador de grupos colapsáveis da sidebar
 */

(function() {
    document.addEventListener('DOMContentLoaded', function() {
        initSidebarGroups();
    });

    function initSidebarGroups() {
        // Seleciona todos os headers de grupo
        const groupHeaders = document.querySelectorAll('.nav-group-header');
        
        groupHeaders.forEach(header => {
            header.addEventListener('click', function(e) {
                e.preventDefault();
                toggleGroup(this);
            });
        });

        // Expande automaticamente o grupo que contém a página atual
        expandCurrentPageGroup();
        
        // Restaura estado salvo dos grupos
        restoreGroupStates();
    }

    function toggleGroup(header) {
        const groupItems = header.nextElementSibling;
        const isExpanded = header.classList.contains('expanded');
        
        if (isExpanded) {
            // Fecha o grupo
            header.classList.remove('expanded');
            groupItems.classList.remove('expanded');
        } else {
            // Abre o grupo
            header.classList.add('expanded');
            groupItems.classList.add('expanded');
        }
        
        // Salva o estado
        saveGroupStates();
    }

    function expandCurrentPageGroup() {
        const currentPage = window.location.pathname.split('/').pop() || 'homepage.html';
        
        // Encontra o link ativo na sidebar
        const activeLink = document.querySelector(`.nav-group-items a[href="${currentPage}"]`);
        
        if (activeLink) {
            // Marca como ativo
            activeLink.classList.add('active');
            
            // Expande o grupo pai
            const groupItems = activeLink.closest('.nav-group-items');
            const groupHeader = groupItems?.previousElementSibling;
            
            if (groupItems && groupHeader) {
                groupHeader.classList.add('expanded', 'active');
                groupItems.classList.add('expanded');
            }
        }
        
        // Também verifica links diretos (Home, Dashboard)
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
                
                // Não sobrescreve se já está expandido (página atual)
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
})();
