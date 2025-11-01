/**
 * API Config - ERP Maneiro
 * Este script gerencia a configuração da URL da API no frontend,
 * sincronizando com o banco de dados quando possível.
 */

// Função para obter a URL da API sempre do banco de dados
async function getApiUrl() {
    const defaultUrl = 'http://localhost:8000';
    
    try {
        // Sempre busca a URL da API do endpoint configuracoes
        const response = await fetch(`${defaultUrl}/api/configuracoes/link_api`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.valor) {
                return data.valor;
            }
        }
    } catch (error) {
        console.log('API não disponível para sincronização, usando URL padrão:', defaultUrl);
    }
    
    // Se falhar, retorna a URL padrão
    return defaultUrl;
}

// Função para sincronizar a URL da API com o banco de dados (mantida para compatibilidade)
async function syncApiUrl() {
    try {
        const apiUrl = await getApiUrl();
        console.log('URL da API obtida do banco:', apiUrl);
    } catch (error) {
        console.log('Não foi possível obter a URL da API do banco');
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
