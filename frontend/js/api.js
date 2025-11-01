// API central para o ERP Maneiro
// Este arquivo fornece funções para comunicação com a API do backend
// com tratamento padronizado de erros e autenticação

// Importa as funções de autenticação
// Nota: Este arquivo deve ser carregado após auth.js

// URL base da API - sempre obtida do banco de dados
async function getApiBaseUrl() {
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
        console.warn('Erro ao obter URL da API do banco, usando padrão:', error);
    }
    
    return defaultUrl;
}

// Função para obter a URL base atual (mantida para compatibilidade)
async function getBaseUrl() {
    return await getApiBaseUrl();
}

/**
 * Realiza uma requisição HTTP para a API com tratamento de autenticação e erros
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @param {Object} options - Opções para o fetch (method, headers, body, etc)
 * @returns {Promise<Response>} - Promise com a resposta da API
 */
async function apiRequest(endpoint, options = {}) {
    try {
        // Certifica-se que o endpoint começa com /
        if (!endpoint.startsWith('/')) {
            endpoint = '/' + endpoint;
        }

        // URL completa
        const baseUrl = await getApiBaseUrl();
        const url = `${baseUrl}${endpoint}`;
        
        // Usa fetchWithAuth do auth.js para fazer a requisição
        return await fetchWithAuth(url, options);
    } catch (error) {
        console.error(`Erro na requisição para ${endpoint}:`, error);
        throw error;
    }
}

/**
 * Realiza uma requisição GET para a API
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @param {Object} queryParams - Parâmetros de consulta (opcional)
 * @returns {Promise<any>} - Promise com os dados da resposta
 */
async function apiGet(endpoint, queryParams = {}) {
    // Constrói a string de query parameters
    const queryString = Object.keys(queryParams).length > 0
        ? '?' + new URLSearchParams(queryParams).toString()
        : '';
    
    const response = await apiRequest(`${endpoint}${queryString}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (!response || !response.ok) {
        throw new Error(`Falha na requisição GET para ${endpoint}: ${response ? response.status : 'sem resposta'}`);
    }
    
    return await response.json();
}

/**
 * Realiza uma requisição POST para a API
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @param {Object} data - Dados a serem enviados no corpo da requisição
 * @returns {Promise<any>} - Promise com os dados da resposta
 */
async function apiPost(endpoint, data = {}) {
    const response = await apiRequest(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'sem resposta';
        let errorDetail;
        
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.detail || errorText;
        } catch {
            errorDetail = errorText;
        }
        
        throw new Error(`Falha na requisição POST para ${endpoint}: ${errorDetail}`);
    }
    
    return await response.json();
}

/**
 * Realiza uma requisição POST para a API com FormData (para upload de arquivos)
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @param {FormData} formData - FormData a ser enviado no corpo da requisição
 * @returns {Promise<any>} - Promise com os dados da resposta
 */
async function apiPostFormData(endpoint, formData) {
    const response = await apiRequest(endpoint, {
        method: 'POST',
        // Não definir Content-Type para FormData - o browser define automaticamente
        body: formData
    });
    
    if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'sem resposta';
        let errorDetail;
        
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.detail || errorText;
        } catch {
            errorDetail = errorText;
        }
        
        throw new Error(`Falha na requisição POST FormData para ${endpoint}: ${errorDetail}`);
    }
    
    return await response.json();
}

/**
 * Realiza uma requisição PUT para a API
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @param {Object} data - Dados a serem enviados no corpo da requisição
 * @returns {Promise<any>} - Promise com os dados da resposta
 */
async function apiPut(endpoint, data = {}) {
    const response = await apiRequest(endpoint, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'sem resposta';
        let errorDetail;
        
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.detail || errorText;
        } catch {
            errorDetail = errorText;
        }
        
        throw new Error(`Falha na requisição PUT para ${endpoint}: ${errorDetail}`);
    }
    
    return await response.json();
}

/**
 * Realiza uma requisição DELETE para a API
 * @param {string} endpoint - O endpoint da API (sem a URL base)
 * @returns {Promise<boolean>} - Promise com true se a exclusão foi bem sucedida
 */
async function apiDelete(endpoint) {
    const response = await apiRequest(endpoint, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (!response) {
        throw new Error(`Falha na requisição DELETE para ${endpoint}: sem resposta`);
    }
    
    // Retorno 204 No Content é comum em operações DELETE bem sucedidas
    if (response.status === 204) {
        return true;
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        let errorDetail;
        
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.detail || errorText;
        } catch {
            errorDetail = errorText;
        }
        
        throw new Error(`Falha na requisição DELETE para ${endpoint}: ${errorDetail}`);
    }
    
    return true;
}
