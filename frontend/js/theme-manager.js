/**
 * Gerenciador de Tema Next.js para ERP Maneiro
 * Aplica automaticamente o tema escuro moderno
 */

(function() {
    // Aplica o tema Next.js automaticamente
    document.addEventListener('DOMContentLoaded', function() {
        // Adiciona a classe do tema ao body
        document.body.classList.add('theme-nextjs');
        
        // Adiciona animação de entrada suave
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';
        
        setTimeout(function() {
            document.body.style.opacity = '1';
        }, 50);
        
        console.log('[Theme Manager] Tema Next.js aplicado');
    });
})();
