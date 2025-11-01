// Script para corrigir redirecionamentos indesejados para o dashboard
(function() {
    // Intercepta todas as chamadas fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        // Se a URL contém 'api/dashboard', redireciona para a homepage APENAS se estamos na página dashboard.html
        if (typeof url === 'string' && url.includes('/api/dashboard')) {
            console.log('Interceptando chamada para dashboard API:', url);
            
            // Redireciona para homepage APENAS se estamos na página dashboard.html
            if (window.location.pathname.includes('dashboard.html')) {
                console.log('Redirecionando para homepage...');
                window.location.href = 'homepage.html';
                // Retorna uma promise vazia para evitar erros
                return new Promise(() => {});
            }
            
            // Se já estamos na homepage ou em qualquer outra página, apenas simula a resposta da API
            console.log('Simulando resposta da API do dashboard');
            return new Promise(resolve => {
                // Retorna um objeto vazio como resposta
                resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        vendas: 0,
                        clientes: 0,
                        pedidos: 0,
                        lucro: 0,
                        vendas_recentes: [],
                        produtos_mais_vendidos: [],
                        vendas_por_periodo: []
                    })
                });
            });
        }
        
        // Para outras chamadas, usa o fetch original
        return originalFetch.apply(this, arguments);
    };
    
    // Verifica se estamos na página de dashboard e redireciona
    if (window.location.pathname.includes('dashboard.html')) {
        console.log('Página de dashboard detectada, redirecionando para homepage...');
        window.location.href = 'homepage.html';
    }
    
    // Adiciona um evento para verificar se o usuário está sendo redirecionado para dashboard.html após o login
    // e corrige para homepage.html
    window.addEventListener('beforeunload', function(event) {
        // Verifica se o redirecionamento é para dashboard.html
        const nextUrl = window.location.href;
        if (nextUrl.includes('dashboard.html')) {
            // Cancela o evento atual
            event.preventDefault();
            // Redireciona para homepage.html
            window.location.href = 'homepage.html';
        }
    });
})();