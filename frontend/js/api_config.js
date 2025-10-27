/**
 * API Config - ERP Maneiro
 * Este script gerencia a configuração da URL da API no frontend,
 * sincronizando com o banco de dados quando possível.
 */

// Função para sincronizar a URL da API com o banco de dados
async function syncApiUrl() {
    try {
        // Obtém a URL base atual do localStorage ou usa o padrão
        const currentApiUrl = localStorage.getItem('api_base_url') || 'http://localhost:8000';
        
        // Tenta obter a configuração da API do banco de dados com timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos de timeout
        
        const response = await fetch(`${currentApiUrl}/api/configuracoes/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Não incluímos o token de autenticação aqui para permitir acesso público a esta configuração
            },
            signal: controller.signal
        }).catch(error => {
            // Silencia o erro para não interromper o fluxo de login
            console.log('API não disponível para sincronização, usando URL local:', currentApiUrl);
            return null;
        });
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
            const data = await response.json();
            
            // Se a URL da API no config for diferente da armazenada localmente
            if (data.config && data.config.api_url && data.config.api_url !== currentApiUrl) {
                console.log(`Atualizando URL da API: ${currentApiUrl} -> ${data.config.api_url}`);
                localStorage.setItem('api_base_url', data.config.api_url);
                
                // Se o usuário estiver logado, exibe um aviso sobre a mudança
                if (localStorage.getItem('erp_token')) {
                    showApiUrlChangedAlert(data.config.api_url);
                }
            }
        }
    } catch (error) {
        // Silencia o erro para não interromper o fluxo de login
        console.log('Não foi possível sincronizar a URL da API, usando URL local');
    }
}

// Exibe um alerta informando que a URL da API foi alterada
function showApiUrlChangedAlert(newUrl) {
    // Cria o elemento de alerta
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-warning alert-dismissible fade show';
    alertDiv.role = 'alert';
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '10px';
    alertDiv.style.right = '10px';
    alertDiv.style.maxWidth = '400px';
    alertDiv.style.zIndex = '9999';
    
    alertDiv.innerHTML = `
        <strong>Atenção!</strong> A URL da API foi atualizada para <code>${newUrl}</code>.
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    `;
    
    // Adiciona o alerta ao corpo do documento
    document.body.appendChild(alertDiv);
    
    // Remove o alerta após 10 segundos
    setTimeout(() => {
        if (document.body.contains(alertDiv)) {
            alertDiv.remove();
        }
    }, 10000);
}

// Adiciona um endpoint para obter a URL da API no backend
// Este endpoint deve ser adicionado ao arquivo routers/configuracoes.py

// Tenta sincronizar a URL da API quando o script é carregado
document.addEventListener('DOMContentLoaded', function() {
    // Sincroniza a URL da API apenas se não estivermos na página de configuração
    if (!window.location.pathname.includes('config_api.html')) {
        syncApiUrl();
    }
});
