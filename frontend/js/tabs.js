// Script específico para gerenciar as abas em todas as páginas
document.addEventListener('DOMContentLoaded', function() {
    // Função para inicializar as abas
    function initTabs() {
        console.log('Inicializando abas...');
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        console.log(`Encontrados ${tabButtons.length} botões de abas e ${tabContents.length} conteúdos de abas`);
        
        if (tabButtons.length > 0) {
            // Garantir que pelo menos uma aba esteja ativa
            let hasActiveTab = false;
            tabButtons.forEach(btn => {
                if (btn.classList.contains('active')) {
                    hasActiveTab = true;
                    const tabName = btn.getAttribute('data-tab');
                    const tabContent = document.getElementById(tabName);
                    if (tabContent) {
                        tabContent.classList.add('active');
                    }
                }
            });
            
            // Se nenhuma aba estiver ativa, ativar a primeira
            if (!hasActiveTab && tabButtons[0]) {
                tabButtons[0].classList.add('active');
                const firstTabName = tabButtons[0].getAttribute('data-tab');
                const firstTabContent = document.getElementById(firstTabName);
                if (firstTabContent) {
                    firstTabContent.classList.add('active');
                }
            }
            
            // Adicionar eventos de clique
            tabButtons.forEach(button => {
                button.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log(`Clicou na aba: ${this.getAttribute('data-tab')}`);
                    
                    // Remover classe active de todos os botões
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Adicionar classe active ao botão clicado
                    this.classList.add('active');
                    
                    // Esconder todos os conteúdos de aba
                    tabContents.forEach(content => content.classList.remove('active'));
                    
                    // Mostrar o conteúdo correspondente à aba clicada
                    const tabName = this.getAttribute('data-tab');
                    const tabContent = document.getElementById(tabName);
                    if (tabContent) {
                        tabContent.classList.add('active');
                        console.log(`Ativando conteúdo da aba: ${tabName}`);
                    } else {
                        console.error(`Conteúdo da aba não encontrado: ${tabName}`);
                    }
                });
            });
        }
    }
    
    // Inicializar abas
    initTabs();
    
    // Verificar se as abas foram inicializadas corretamente após um pequeno delay
    setTimeout(() => {
        const activeButtons = document.querySelectorAll('.tab-btn.active');
        const activeContents = document.querySelectorAll('.tab-content.active');
        
        if (activeButtons.length === 0 || activeContents.length === 0) {
            console.warn('Abas não inicializadas corretamente. Tentando novamente...');
            initTabs();
        }
    }, 500);
});
