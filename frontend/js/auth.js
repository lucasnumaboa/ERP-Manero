// Funções de autenticação e gerenciamento de token

// URL da API de backend - sempre busca do banco de dados
async function getApiUrl() {
    try {
        const response = await fetch('/api/configuracoes/link_api');
        if (response.ok) {
            const data = await response.json();
            return data.config?.api_url || 'https://erp-api-call.autoservto.com.br';
        }
    } catch (error) {
        console.warn('Erro ao buscar URL da API:', error);
    }
    return 'https://erp-api-call.autoservto.com.br';
}

// Variável para controlar se o modal de sessão expirada já está sendo exibido
let sessionExpiredModalShown = false;
// Variável para controlar se já estamos redirecionando para login
let isRedirectingToLogin = false;

// Verifica se o usuário está autenticado
function isAuthenticated() {
    const token = localStorage.getItem('erp_token');
    return !!token; // Retorna true se o token existir
}

// Obtém o token de autenticação
function getAuthToken() {
    return {
        token: localStorage.getItem('erp_token'),
        type: localStorage.getItem('erp_token_type')
    };
}

// Obtém o cabeçalho de autorização para requisições
function getAuthHeader() {
    const auth = getAuthToken();
    if (auth.token && auth.type) {
        return {
            'Authorization': `${auth.type} ${auth.token}`
        };
    }
    return {};
}

// Faz logout do sistema
function logout() {
    // Previne múltiplos logouts simultâneos
    if (isRedirectingToLogin) return;
    isRedirectingToLogin = true;
    
    // Salvar credenciais "lembrar senha" antes de limpar
    const rememberEmail = localStorage.getItem('erp_remember_email');
    const rememberPassword = localStorage.getItem('erp_remember_password');
    const rememberMe = localStorage.getItem('erp_remember_me');
    
    // Limpa todo o localStorage
    localStorage.clear();
    
    // Restaurar credenciais "lembrar senha" se existirem
    if (rememberMe === 'true' && rememberEmail && rememberPassword) {
        localStorage.setItem('erp_remember_email', rememberEmail);
        localStorage.setItem('erp_remember_password', rememberPassword);
        localStorage.setItem('erp_remember_me', rememberMe);
    }
    
    // Limpa o sessionStorage também
    sessionStorage.clear();
    
    // Redireciona para a página de login
    window.location.href = 'index.html';
}

// Exibe modal informando que o usuário foi desconectado
function showSessionExpiredModal() {
    // Evita exibir o modal múltiplas vezes ou redirecionar múltiplas vezes
    if (sessionExpiredModalShown || isRedirectingToLogin) return;
    sessionExpiredModalShown = true;
    isRedirectingToLogin = true;
    
    // Salvar credenciais "lembrar senha" antes de limpar
    const rememberEmail = localStorage.getItem('erp_remember_email');
    const rememberPassword = localStorage.getItem('erp_remember_password');
    const rememberMe = localStorage.getItem('erp_remember_me');
    
    // Limpa todo o cache imediatamente
    localStorage.clear();
    sessionStorage.clear();
    
    // Restaurar credenciais "lembrar senha" se existirem
    if (rememberMe === 'true' && rememberEmail && rememberPassword) {
        localStorage.setItem('erp_remember_email', rememberEmail);
        localStorage.setItem('erp_remember_password', rememberPassword);
        localStorage.setItem('erp_remember_me', rememberMe);
    }
    
    // Cria o modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '9999';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.borderRadius = '5px';
    modalContent.style.padding = '20px';
    modalContent.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.3)';
    modalContent.style.maxWidth = '400px';
    modalContent.style.width = '100%';
    modalContent.style.textAlign = 'center';
    
    const modalHeader = document.createElement('h3');
    modalHeader.textContent = 'Sessão Expirada';
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.color = '#e74c3c';
    
    const modalMessage = document.createElement('p');
    modalMessage.textContent = 'Sua sessão expirou. Redirecionando para o login...';
    modalMessage.style.marginBottom = '20px';
    
    const modalButton = document.createElement('button');
    modalButton.textContent = 'Ir para Login';
    modalButton.style.padding = '8px 16px';
    modalButton.style.backgroundColor = '#3498db';
    modalButton.style.color = '#fff';
    modalButton.style.border = 'none';
    modalButton.style.borderRadius = '4px';
    modalButton.style.cursor = 'pointer';
    
    modalButton.addEventListener('click', function() {
        if (document.body.contains(modalOverlay)) {
            document.body.removeChild(modalOverlay);
        }
        window.location.href = 'index.html';
    });
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalMessage);
    modalContent.appendChild(modalButton);
    modalOverlay.appendChild(modalContent);
    
    document.body.appendChild(modalOverlay);
    
    // Redireciona para a página de login após 2 segundos
    setTimeout(() => {
        if (document.body.contains(modalOverlay)) {
            document.body.removeChild(modalOverlay);
        }
        window.location.href = 'index.html';
    }, 2000);
}

// Intercepta respostas HTTP para verificar erros 401
async function fetchWithAuth(url, options = {}) {
    try {
        // Se já estamos redirecionando, não faz mais requisições
        if (isRedirectingToLogin) {
            return null;
        }

        // Verifica se o token existe antes de fazer a requisição
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            showSessionExpiredModal();
            return null;
        }

        // Adiciona headers de autenticação se não forem fornecidos
        if (!options.headers) {
            options.headers = getAuthHeader();
        } else if (!options.headers['Authorization']) {
            options.headers = { ...options.headers, ...getAuthHeader() };
        }

        const response = await fetch(url, options);

        // Verifica se a resposta é 401 Unauthorized
        if (response.status === 401) {
            console.error('Erro 401: Sessão expirada');
            // Mostra modal e redireciona (só uma vez)
            showSessionExpiredModal();
            return null;
        }

        // Qualquer requisição autenticada bem-sucedida (não-401) atualiza o
        // last_access no backend, então reinicia o contador de sessão exibido.
        resetSessionTimer();

        return response;
    } catch (error) {
        // Se já estamos redirecionando, não mostra erro
        if (isRedirectingToLogin) {
            return null;
        }
        console.error('Erro na requisição:', error);
        throw error;
    }
}

// Obtém dados do usuário atual
async function getCurrentUser() {
    try {
        // Verifica se o token existe antes de tentar obter dados do usuário
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado ao tentar obter dados do usuário');
            return null;
        }
        
        // Primeiro, verifica se já temos os dados do usuário em cache
        const cachedUserData = localStorage.getItem('erp_user_data');
        if (cachedUserData) {
            return JSON.parse(cachedUserData);
        }

        // Se não tiver em cache, busca da API
        const apiUrl = await getApiUrl();
        const response = await fetchWithAuth(`${apiUrl}/api/usuarios/me`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response || !response.ok) {
            throw new Error(`Falha ao obter dados do usuário: ${response ? response.status : 'sem resposta'}`);
        }

        const userData = await response.json();
        
        // Salva os dados do usuário em cache
        localStorage.setItem('erp_user_data', JSON.stringify(userData));
        
        return userData;
    } catch (error) {
        console.error('Erro ao obter dados do usuário:', error);
        // Se houver erro na obtenção dos dados, faz logout
        if (error.message.includes('401') || error.message.includes('403')) {
            showSessionExpiredModal();
        }
        return null;
    }
}

// Obtém as permissões do usuário atual
async function getUserPermissions() {
    try {
        console.log('Iniciando obtenção de permissões do usuário');
        const user = await getCurrentUser();
        console.log('Dados do usuário obtidos:', user);
        
        if (!user) {
            console.error('Usuário não encontrado');
            return {};
        }
        
        // Se for admin, concede todas as permissões
        if (user.nivel_acesso === 'admin') {
            console.log('Usuário é admin, concedendo todas as permissões');
            return {
                dashboard_visualizar: true,
                dashboard_editar: true,
                produtos_visualizar: true,
                produtos_editar: true,
                clientes_visualizar: true,
                clientes_editar: true,
                vendas_visualizar: true,
                vendas_editar: true,
                vendedores_visualizar: true,
                vendedores_editar: true,
                compras_visualizar: true,
                compras_editar: true,
                fornecedores_visualizar: true,
                fornecedores_editar: true,
                estoque_visualizar: true,
                estoque_editar: true,
                depositos_visualizar: true,
                depositos_editar: true,
                configuracoes_visualizar: true,
                configuracoes_editar: true,
                financeiro_visualizar: true,
                financeiro_editar: true,
                metas_visualizar: true,
                metas_editar: true,
                filamentos_3d_visualizar: true
            };
        }
        
        // Usar o grupo_id original do usuário
        console.log('Usando grupo_id original do usuário:', user.grupo_id);
        
        if (!user.grupo_id) {
            console.error('Usuário não possui grupo_id');
            return {};
        }
        
        console.log(`Buscando permissões para o grupo ${user.grupo_id}`);
        
        // Busca as permissões do grupo do usuário
        const apiUrl = await getApiUrl();
        const url = `${apiUrl}/api/usuarios/grupo/${user.grupo_id}`;
        console.log('URL da requisição:', url);
        
        const headers = {
            ...getAuthHeader(),
            'Content-Type': 'application/json'
        };
        console.log('Headers da requisição:', headers);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        
        console.log('Status da resposta:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Permissões obtidas com sucesso:', data);
            
            // Salva as permissões no localStorage para acesso rápido
            localStorage.setItem('erp_user_permissions', JSON.stringify(data));
            return data;
        } else {
            const errorText = await response.text();
            console.error('Erro ao obter permissões do usuário:', response.status, response.statusText);
            console.error('Detalhes do erro:', errorText);
            
            // Limpa as permissões em cache para forçar nova tentativa
            localStorage.removeItem('erp_user_permissions');
            return {};
        }
    } catch (error) {
        console.error('Exceção ao obter permissões do usuário:', error);
        return {};
    }
}

// Verifica se o usuário tem uma permissão específica
async function hasPermission(permission) {
    try {
        const user = await getCurrentUser();
        
        // Administradores têm todas as permissões
        if (user && user.nivel_acesso === 'admin') {
            return true;
        }
        
        // Verifica se já temos as permissões no localStorage
        const cachedPermissions = localStorage.getItem('erp_user_permissions');
        let permissions;
        
        if (cachedPermissions) {
            permissions = JSON.parse(cachedPermissions);
        } else {
            permissions = await getUserPermissions();
        }
        
        return permissions && (permissions[permission] === true || permissions[permission] === 1);
    } catch (error) {
        console.error('Erro ao verificar permissão:', error);
        return false;
    }
}

/**
 * Obtém dados de usuário armazenados no localStorage de forma síncrona.
 * @returns {Object|null} Dados do usuário ou null se não houver.
 */
function getUserData() {
    const data = localStorage.getItem('erp_user_data');
    return data ? JSON.parse(data) : null;
}

/**
 * Obtém o token de autenticação armazenado no localStorage.
 * @returns {string|null} Token ou null se não houver.
 */
function getToken() {
    return localStorage.getItem('erp_token');
}

// ===== Contador de sessão (tempo até desconexão por inatividade) =====
// O backend desconecta o usuário quando `last_access` fica mais velho que
// `configuracoes.timeout_time` minutos (ver backend/timeout_manager.py).
// Esse contador só espelha essa regra na tela; a decisão real continua no backend.
let sessionTimeoutMinutes = 15;
let sessionRemainingSeconds = null;
let sessionTimerInterval = null;
let sessionConfigInterval = null;

async function fetchSessionTimeoutConfig() {
    try {
        const apiUrl = await getApiUrl();
        const response = await fetch(`${apiUrl}/api/configuracoes/timeout-sessao`, {
            method: 'GET',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            if (data && data.timeout_minutos) {
                sessionTimeoutMinutes = data.timeout_minutos;
            }
        }
    } catch (error) {
        console.warn('Erro ao obter configuração de timeout de sessão:', error);
    }
}

function resetSessionTimer() {
    if (sessionRemainingSeconds !== null) {
        sessionRemainingSeconds = sessionTimeoutMinutes * 60;
        updateSessionTimerDisplay();
    }
}

function renderSessionTimerBar() {
    if (document.getElementById('sessionTimerBar')) return;

    const bar = document.createElement('div');
    bar.id = 'sessionTimerBar';
    bar.style.cssText = [
        'position: fixed', 'top: 8px', 'left: 50%', 'transform: translateX(-50%)',
        'z-index: 99999', 'background: rgba(30,32,45,0.92)', 'color: #fff',
        'padding: 4px 14px', 'border-radius: 20px', 'font-size: 12px',
        'font-family: inherit', 'display: flex', 'align-items: center', 'gap: 6px',
        'box-shadow: 0 2px 10px rgba(0,0,0,0.35)', 'pointer-events: none',
        'transition: background-color 0.3s ease', 'white-space: nowrap'
    ].join(';');
    bar.innerHTML = '<i class="fas fa-clock"></i> <span id="sessionTimerText">--:--</span>';
    document.body.appendChild(bar);
}

function updateSessionTimerDisplay() {
    const textEl = document.getElementById('sessionTimerText');
    const barEl = document.getElementById('sessionTimerBar');
    if (!textEl || !barEl || sessionRemainingSeconds === null) return;

    const minutes = Math.floor(sessionRemainingSeconds / 60);
    const seconds = sessionRemainingSeconds % 60;
    textEl.textContent = `Sessão expira em ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (sessionRemainingSeconds <= 30) {
        barEl.style.background = 'rgba(204,45,45,0.95)';
    } else if (sessionRemainingSeconds <= 120) {
        barEl.style.background = 'rgba(212,140,20,0.95)';
    } else {
        barEl.style.background = 'rgba(30,32,45,0.92)';
    }
}

async function initSessionTimer() {
    if (!isAuthenticated()) return;

    await fetchSessionTimeoutConfig();
    sessionRemainingSeconds = sessionTimeoutMinutes * 60;
    renderSessionTimerBar();
    updateSessionTimerDisplay();

    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(function () {
        if (sessionRemainingSeconds === null) return;
        sessionRemainingSeconds--;
        if (sessionRemainingSeconds <= 0) {
            clearInterval(sessionTimerInterval);
            showSessionExpiredModal();
            return;
        }
        updateSessionTimerDisplay();
    }, 1000);

    // Revalida periodicamente a configuração (reflete mudança feita por um admin)
    if (sessionConfigInterval) clearInterval(sessionConfigInterval);
    sessionConfigInterval = setInterval(fetchSessionTimeoutConfig, 5 * 60 * 1000);
}

// Verifica autenticação em páginas protegidas
document.addEventListener('DOMContentLoaded', function() {
    // Não verifica autenticação na página de login
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        if (isAuthenticated()) {
            // Se já estiver autenticado e estiver na página de login, redireciona para a homepage
            window.location.href = 'homepage.html';
        }
        return;
    }

    // Verifica autenticação em todas as outras páginas
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Configura o botão de logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    }

    // Inicia o contador de tempo até a desconexão por inatividade
    initSessionTimer();
});
