// Script específico para corrigir as abas na página de configurações
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando correção para abas de configurações...');
    
    // Selecionar todos os botões de aba
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    // Adicionar eventos de clique diretamente
    tabButtons.forEach(button => {
        // Remover qualquer evento de clique existente
        button.replaceWith(button.cloneNode(true));
    });
    
    // Selecionar os botões novamente após substituí-los
    const newTabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Adicionar novos eventos de clique
    newTabButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const tabName = this.getAttribute('data-tab');
            console.log(`Clicou na aba: ${tabName}`);
            
            // Remover classe active de todos os botões
            newTabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Adicionar classe active ao botão clicado
            this.classList.add('active');
            
            // Esconder todos os conteúdos de aba
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });
            
            // Mostrar o conteúdo correspondente à aba clicada
            const tabContent = document.getElementById(tabName);
            if (tabContent) {
                tabContent.classList.add('active');
                tabContent.style.display = 'block';
                console.log(`Ativando conteúdo da aba: ${tabName}`);
            } else {
                console.error(`Conteúdo da aba não encontrado: ${tabName}`);
            }
        });
    });
    
    // Garantir que a primeira aba esteja ativa por padrão
    if (newTabButtons.length > 0 && tabContents.length > 0) {
        // Verificar se já existe uma aba ativa
        const activeButtons = Array.from(newTabButtons).filter(btn => btn.classList.contains('active'));
        
        if (activeButtons.length === 0) {
            // Se não houver aba ativa, ativar a primeira
            newTabButtons[0].classList.add('active');
            const firstTabName = newTabButtons[0].getAttribute('data-tab');
            const firstTabContent = document.getElementById(firstTabName);
            
            if (firstTabContent) {
                // Esconder todos os conteúdos primeiro
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    content.style.display = 'none';
                });
                
                // Mostrar apenas o primeiro
                firstTabContent.classList.add('active');
                firstTabContent.style.display = 'block';
            }
        } else {
            // Se já houver uma aba ativa, garantir que seu conteúdo esteja visível
            const activeTabName = activeButtons[0].getAttribute('data-tab');
            const activeTabContent = document.getElementById(activeTabName);
            
            if (activeTabContent) {
                activeTabContent.style.display = 'block';
            }
        }
    }
});
