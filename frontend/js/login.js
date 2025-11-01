document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginMessage = document.getElementById('loginMessage');
    
    // Obtém a URL da API sempre do banco, sem cache local
    async function getApiUrl() {
        const defaultUrl = 'http://localhost:8000';
        
        try {
            // Sempre tenta buscar a URL da API do endpoint configuracoes
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
            console.warn('Erro ao obter URL da API do servidor, usando fallback:', error);
        }
        
        // Se falhar, retorna a URL padrão
        return defaultUrl;
    }
    

    
    // Verificar e sincronizar a URL da API ao carregar a página
    checkApiConnection();
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Limpar mensagens anteriores
        loginMessage.className = 'message-container';
        loginMessage.style.display = 'none';
        loginMessage.textContent = '';
        
        try {
            // Obter a URL da API
            const apiUrl = await getApiUrl();
            
            // Formatar os dados conforme esperado pela API (username = email)
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);
            
            // Adicionar timeout para a requisição
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout
            
            // Fazer a requisição de login
            const response = await fetch(`${apiUrl}/token`, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            }).catch(error => {
                if (error.name === 'AbortError') {
                    throw new Error('Tempo limite de conexão excedido. Verifique se o servidor está acessível.');
                } else if (error.message.includes('Failed to fetch')) {
                    throw new Error('Não foi possível conectar ao servidor, entre em contato com a administração');
                } else {
                    throw error;
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response) {
                throw new Error('Não foi possível conectar ao servidor, entre em contato com a administração');
            }
            
            const data = await response.json().catch(() => {
                throw new Error('Resposta inválida do servidor. Verifique a URL da API.');
            });
            
            if (!response.ok) {
                throw new Error(data.detail || 'Falha na autenticação');
            }
            
            // Login bem-sucedido
            // Armazenar o token no localStorage
            localStorage.setItem('erp_token', data.access_token);
            localStorage.setItem('erp_token_type', data.token_type);
            
            // Exibir mensagem de sucesso
            loginMessage.textContent = 'Login realizado com sucesso! Redirecionando...';
            loginMessage.classList.add('success-message');
            loginMessage.style.display = 'block';
            
            // Redirecionar para a homepage após um breve delay
            setTimeout(() => {
                window.location.href = 'homepage.html';
            }, 1500);
            
        } catch (error) {
            // Exibir mensagem de erro
            loginMessage.textContent = error.message || 'Erro ao fazer login. Verifique suas credenciais.';
            loginMessage.classList.add('error-message');
            loginMessage.style.display = 'block';
            console.error('Erro de login:', error);
            
            // Se for um erro de conexão, mostrar botão para configurar API
            if (error.message.includes('conectar ao servidor') || 
                error.message.includes('Failed to fetch') || 
                error.message.includes('Tempo limite')) {
                showConfigApiButton(loginMessage);
            }
        }
    });
    
    // Função para mostrar botão de configuração da API
    function showConfigApiButton(container) {
        // Verificar se já existe um botão
        if (container.querySelector('.config-api-btn')) return;
        
        const configBtn = document.createElement('button');
        configBtn.textContent = 'Configurar URL da API';
        configBtn.className = 'btn-secondary config-api-btn';
        configBtn.style.marginTop = '10px';
        configBtn.style.padding = '8px 16px';
        configBtn.style.backgroundColor = '#6c757d';
        configBtn.style.color = '#fff';
        configBtn.style.border = 'none';
        configBtn.style.borderRadius = '4px';
        configBtn.style.cursor = 'pointer';
        
        configBtn.addEventListener('click', function() {
            window.location.href = 'config_api.html';
        });
        
        container.appendChild(configBtn);
    }
    
    // Função para verificar a conexão com a API
    async function checkApiConnection() {
        const apiUrl = await getApiUrl();
        const statusElement = document.createElement('div');
        statusElement.id = 'api-status';
        statusElement.style.fontSize = '12px';
        statusElement.style.marginTop = '10px';
        statusElement.style.textAlign = 'center';
        
        // Adicionar ao DOM se não existir
        if (!document.getElementById('api-status')) {
            const loginContainer = document.querySelector('.login-container');
            if (loginContainer) {
                loginContainer.appendChild(statusElement);
            }
        }
        
        // Criar indicadores de status
        statusElement.innerHTML = `
            <div class="status-container">
                <span>Status da API: </span>
                <span id="api-status-indicator" class="status-indicator status-checking"></span>
                <span id="api-status-text">Verificando...</span>
            </div>
        `;
        
        const statusIndicator = document.getElementById('api-status-indicator');
        const statusText = document.getElementById('api-status-text');
        
        if (!statusIndicator || !statusText) return;
        
        // Configurar timeout para a requisição
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout
        
        // Primeiro tentar o endpoint de status
        fetch(`${apiUrl}/api/configuracoes/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        })
            .then(response => {
                clearTimeout(timeoutId);
                if (response.ok) {
                    statusIndicator.className = 'status-indicator status-online';
                    statusText.textContent = 'Online';
                    
                    // Verificar se a URL da API no servidor é diferente da armazenada localmente
                    return response.json().then(data => {
                        if (data && data.config && data.config.api_url && data.config.api_url !== apiUrl) {
                            console.log(`A URL da API no servidor (${data.config.api_url}) é diferente da URL local (${apiUrl}).`);
                            // Não salva mais no localStorage - sempre busca do banco
                        }
                    }).catch(() => {
                        // Erro ao processar JSON, mas a API está online
                    });
                } else {
                    // Tentar o endpoint alternativo
                    return tryAlternativeEndpoint(apiUrl, statusIndicator, statusText);
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Erro ao verificar status da API:', error);
                
                if (error.name === 'AbortError') {
                    statusIndicator.className = 'status-indicator status-offline';
                    statusText.textContent = 'Timeout';
                } else {
                    statusIndicator.className = 'status-indicator status-offline';
                    statusText.textContent = 'Offline';
                }
                
                // Tentar endpoint alternativo
                tryAlternativeEndpoint(apiUrl, statusIndicator, statusText);
            });
    }
    
    // Função para tentar endpoints alternativos se o principal falhar
    function tryAlternativeEndpoint(apiUrl, statusIndicator, statusText) {
        // Tentar o endpoint link_api
        fetch(`${apiUrl}/api/configuracoes/link_api`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(response => {
                if (response.ok) {
                    statusIndicator.className = 'status-indicator status-online';
                    statusText.textContent = 'Online';
                    
                    // Verificar se a URL da API no banco é diferente da armazenada localmente
                    return response.json().then(data => {
                        if (data && data.valor && data.valor !== apiUrl) {
                            console.log(`A URL da API no servidor (${data.valor}) é diferente da URL local (${apiUrl}).`);
                            // Não salva mais no localStorage - sempre busca do banco
                        }
                    }).catch(() => {
                        // Erro ao processar JSON, mas a API está online
                    });
                } else {
                    // Por último, tentar a raiz da API
                    return fetch(`${apiUrl}/`, { method: 'GET' })
                        .then(rootResponse => {
                            if (rootResponse.ok) {
                                statusIndicator.className = 'status-indicator status-online';
                                statusText.textContent = 'Online (raiz)';
                            } else {
                                statusIndicator.className = 'status-indicator status-offline';
                                statusText.textContent = 'Offline';
                                showConfigApiButton(document.querySelector('.login-container') || document.body);
                            }
                        })
                        .catch(() => {
                            statusIndicator.className = 'status-indicator status-offline';
                            statusText.textContent = 'Offline';
                            showConfigApiButton(document.querySelector('.login-container') || document.body);
                        });
                }
            })
            .catch(() => {
                // Se todos os endpoints falharem, mostrar offline e exibir botão de configuração
                statusIndicator.className = 'status-indicator status-offline';
                statusText.textContent = 'Offline';
                showConfigApiButton(document.querySelector('.login-container') || document.body);
            });
    }
});

// Adicionar estilos para os indicadores de status
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 5px;
        }
        .status-checking {
            background-color: #ffc107;
        }
        .status-online {
            background-color: #28a745;
        }
        .status-offline {
            background-color: #dc3545;
        }
        .status-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 10px;
            font-size: 12px;
        }
    `;
    document.head.appendChild(style);
});
