// Variáveis globais
// API_URL é definido no arquivo api.js

document.addEventListener('DOMContentLoaded', function() {
    // Configurar sidebar toggle
    setupSidebarToggle();
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Configurar abas
    setupTabs();
    
    // Carregar dados do usuário
    carregarDadosUsuario();
    
    // Carregar dados da tabela Configuracoes
    carregarDadosConfiguracoes();
    
    // Carregar lista de usuários
    carregarUsuarios();
    
    // Configurar formulários
    setupForms();
    
    // Configurar modal de usuário
    setupUsuarioModal();
});

// Funções de autenticação
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
    }
}

async function verificarAcessoAdmin() {
    try {
        // Verifica se o token existe
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            window.location.href = 'index.html';
            return;
        }
        
        // Faz a requisição diretamente usando fetch com o token
        const response = await fetch(`${getApiBaseUrl()}/api/usuarios/me`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.error('Erro na requisição:', response.status);
            window.location.href = 'index.html';
            return;
        }
        
        const usuario = await response.json();
        
        // Verifica se a resposta contém dados do usuário
        if (!usuario || !usuario.nivel_acesso) {
            console.error('Dados do usuário inválidos');
            window.location.href = 'index.html';
            return;
        }
        
        if (usuario.nivel_acesso !== 'admin') {
            alert('Acesso restrito. Apenas administradores podem acessar esta página.');
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        console.error('Erro ao verificar nível de acesso:', error);
        // Redireciona para a página de login em caso de erro
        window.location.href = 'index.html';
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

function getAuthHeader() {
    const token = localStorage.getItem('erp_token');
    const tokenType = localStorage.getItem('erp_token_type') || 'Bearer';
    if (token) {
        return {
            'Authorization': `${tokenType} ${token}`
        };
    }
    return {};
}

// Funções para manipulação do sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    toggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });
}

// Funções para abas
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remover classe active de todos os botões
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // Adicionar classe active ao botão clicado
            this.classList.add('active');
            
            // Esconder todos os conteúdos de aba
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Mostrar o conteúdo correspondente à aba clicada
            const tabName = this.dataset.tab;
            document.getElementById(tabName).classList.add('active');
        });
    });
}

// Funções para carregar dados
async function carregarDadosUsuario() {
    try {
        // Verifica se o token existe
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            window.location.href = 'index.html';
            return;
        }
        
        // Faz a requisição diretamente usando fetch com o token
        const response = await fetch(`${getApiBaseUrl()}/api/usuarios/me`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.error('Erro na requisição:', response.status);
            alert('Erro ao carregar dados do usuário. Por favor, tente novamente.');
            return;
        }
        
        const usuario = await response.json();
        preencherDadosUsuario(usuario);
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        alert('Erro ao carregar dados do usuário. Por favor, tente novamente.');
    }
}

function preencherDadosUsuario(usuario) {
    // Preencher campos do formulário de perfil
    const nomeInput = document.getElementById('nome');
    if (nomeInput) nomeInput.value = usuario.nome || '';
    
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = usuario.email || '';
    
    const cargoInput = document.getElementById('cargo');
    if (cargoInput) cargoInput.value = usuario.nivel_acesso || '';
    
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) telefoneInput.value = usuario.telefone || '';
    
    // Atualizar nome e função na sidebar
    const userNameElement = document.getElementById('userName');
    if (userNameElement) userNameElement.textContent = usuario.nome || 'Usuário';
    
    const userRoleElement = document.getElementById('userRole');
    if (userRoleElement) userRoleElement.textContent = usuario.nivel_acesso || 'Usuário';
    
    // Controlar visibilidade baseado no nível de acesso
    controlarVisibilidadePorNivel(usuario.nivel_acesso);
}

function controlarVisibilidadePorNivel(nivelAcesso) {
    const isAdmin = nivelAcesso === 'admin';
    
    // 1. Controlar campo "Nível de Acesso"
    const cargoGroup = document.querySelector('#cargo').closest('.form-group');
    const cargoSelect = document.getElementById('cargo');
    
    if (cargoGroup && cargoSelect) {
        if (isAdmin) {
            // Para admins: mostrar o campo mas desabilitar e adicionar mensagem
            cargoGroup.style.display = 'block';
            cargoSelect.disabled = true;
            cargoSelect.style.backgroundColor = '#f5f5f5';
            cargoSelect.style.cursor = 'not-allowed';
            
            // Adicionar mensagem explicativa se não existir
            let adminMessage = cargoGroup.querySelector('.admin-protection-message');
            if (!adminMessage) {
                adminMessage = document.createElement('small');
                adminMessage.className = 'admin-protection-message';
                adminMessage.style.color = '#666';
                adminMessage.style.fontStyle = 'italic';
                adminMessage.textContent = 'Administradores não podem alterar seu próprio nível de acesso.';
                cargoGroup.appendChild(adminMessage);
            }
        } else {
            // Para não-admins: ocultar completamente
            cargoGroup.style.display = 'none';
        }
    }
    
    // 2. Ocultar aba "Usuários" para não-admins
    const usuariosTab = document.querySelector('[data-tab="usuarios"]');
    if (usuariosTab) {
        usuariosTab.style.display = isAdmin ? 'block' : 'none';
    }
    
    // 3. Ocultar aba "Configurações" para não-admins
    const configuracoesTab = document.querySelector('[data-tab="configuracoes"]');
    if (configuracoesTab) {
        configuracoesTab.style.display = isAdmin ? 'block' : 'none';
    }
    
    // 4. Se não é admin e está numa aba restrita, redirecionar para a aba "perfil"
    if (!isAdmin) {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && (activeTab.dataset.tab === 'usuarios' || activeTab.dataset.tab === 'configuracoes')) {
            // Ativar a aba "perfil"
            document.querySelector('[data-tab="perfil"]').click();
        }
    }
}

// Função de dados mockados removida

async function carregarDadosEmpresa() {
    try {
        // Usa a API centralizada com o caminho correto
        const empresa = await apiGet('/api/empresa');
        preencherDadosEmpresa(empresa);
    } catch (error) {
        console.error('Erro ao carregar dados da empresa:', error);
        alert('Erro ao carregar dados da empresa. Por favor, tente novamente.');
    }
}

function preencherDadosEmpresa(empresa) {
    // Preencher campos do formulário de empresa
    document.getElementById('razao_social').value = empresa.razao_social || '';
    document.getElementById('nome_fantasia').value = empresa.nome_fantasia || '';
    document.getElementById('cnpj').value = empresa.cnpj || '';
    document.getElementById('inscricao_estadual').value = empresa.inscricao_estadual || '';
    document.getElementById('telefone_empresa').value = empresa.telefone || '';
    document.getElementById('email_empresa').value = empresa.email || '';
    document.getElementById('endereco').value = empresa.endereco || '';
    document.getElementById('cidade').value = empresa.cidade || '';
    document.getElementById('estado').value = empresa.estado || '';
    document.getElementById('cep').value = empresa.cep || '';
}

// Função para carregar dados da tabela Configuracoes
async function carregarDadosConfiguracoes() {
    try {
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            return;
        }
        
        const response = await fetch(`${getApiBaseUrl()}/api/configuracoes/configuracoes/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // Suprimir erro 403 (acesso negado) para usuários não-admin
            if (response.status !== 403) {
                console.error('Erro ao carregar configurações:', response.status);
            }
            return;
        }
        
        const configuracoes = await response.json();
        preencherDadosConfiguracoes(configuracoes);
    } catch (error) {
        console.error('Erro ao carregar dados de configurações:', error);
    }
}

// Função para preencher os dados de configurações na interface
function preencherDadosConfiguracoes(configuracoes) {
    // Armazenar em cache para uso posterior
    configuracoesCacheadas = configuracoes;
    
    // Verifica se há um container para as configurações
    const configContainer = document.getElementById('configuracoes-container');
    if (!configContainer) return;
    
    // Limpa o container (remove o estado de carregamento)
    configContainer.innerHTML = '';
    configContainer.className = 'configurations-content';
    
    // Verifica se há configurações para exibir
    if (!configuracoes || configuracoes.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <i class="fas fa-database"></i>
            <h3>Nenhuma configuração encontrada</h3>
            <p>Não há configurações cadastradas no sistema no momento.</p>
        `;
        configContainer.appendChild(emptyState);
        return;
    }
    
    // Cria uma tabela para exibir as configurações
    const table = document.createElement('table');
    table.className = 'table table-striped';
    
    // Cria o cabeçalho da tabela
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Chave</th>
            <th>Valor</th>
            <th>Descrição</th>
            <th>Ações</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Cria o corpo da tabela
    const tbody = document.createElement('tbody');
    
    // Adiciona cada configuração como uma linha na tabela
    configuracoes.forEach(config => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${config.chave}</td>
            <td>${config.valor}</td>
            <td>${config.descricao || ''}</td>
            <td>
                <button class="btn btn-sm btn-primary editar-config" data-id="${config.chave}">Editar</button>
                <button class="btn btn-sm btn-danger excluir-config" data-id="${config.chave}">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    configContainer.appendChild(table);
    
    // Adiciona eventos aos botões de editar e excluir
    document.querySelectorAll('.editar-config').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            abrirModalEditarConfiguracao(id);
        });
    });
    
    document.querySelectorAll('.excluir-config').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            confirmarExclusaoConfiguracao(id);
        });
    });
}

// Função para abrir o modal de nova configuração
function abrirModalNovaConfiguracao() {
    // Criar modal dinamicamente
    const modalHtml = `
        <div class="modal" id="configModal">
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h2><i class="fas fa-cog"></i> Nova Configuração</h2>
                    <button class="close-modal" type="button">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="configForm">
                        <div class="form-group">
                            <label for="chave"><i class="fas fa-key"></i> Chave</label>
                            <input type="text" id="chave" name="chave" class="form-control" placeholder="Digite a chave da configuração" required>
                        </div>
                        <div class="form-group">
                            <label for="valor"><i class="fas fa-edit"></i> Valor</label>
                            <input type="text" id="valor" name="valor" class="form-control" placeholder="Digite o valor da configuração" required>
                        </div>
                        <div class="form-group">
                            <label for="descricao"><i class="fas fa-info-circle"></i> Descrição</label>
                            <textarea id="descricao" name="descricao" class="form-control" rows="3" placeholder="Digite uma descrição para a configuração (opcional)"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="cancelarConfig">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button type="submit" form="configForm" class="btn btn-primary">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar modal ao DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Configurar eventos do modal
    const modal = document.getElementById('configModal');
    const closeBtn = modal.querySelector('.close-modal');
    const cancelBtn = document.getElementById('cancelarConfig');
    const form = document.getElementById('configForm');
    
    // Exibir modal com animação
    setTimeout(() => {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }, 10);
    
    // Função para fechar modal
    function fecharModal() {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        setTimeout(() => {
            if (modalContainer.parentNode) {
                document.body.removeChild(modalContainer);
            }
        }, 300);
    }
    
    // Fechar modal
    closeBtn.addEventListener('click', fecharModal);
    cancelBtn.addEventListener('click', fecharModal);
    
    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            fecharModal();
        }
    });
    
    // Enviar formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const configData = {
            chave: document.getElementById('chave').value,
            valor: document.getElementById('valor').value,
            descricao: document.getElementById('descricao').value
        };
        
        await salvarNovaConfiguracao(configData);
        fecharModal();
    });
}

// Função para abrir o modal de edição de configuração
async function abrirModalEditarConfiguracao(chave) {
    try {
        // Buscar dados da configuração no cache
        if (!configuracoesCacheadas || configuracoesCacheadas.length === 0) {
            console.error('Dados de configurações não carregados');
            alert('Erro: dados de configurações não carregados. Recarregue a página.');
            return;
        }
        
        // Encontrar a configuração pela chave
        const config = configuracoesCacheadas.find(c => c.chave === chave);
        if (!config) {
            console.error('Configuração não encontrada:', chave);
            alert('Erro: configuração não encontrada.');
            return;
        }
        
        // Criar modal dinamicamente
        const modalHtml = `
            <div class="modal" id="configModal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h2><i class="fas fa-edit"></i> Editar Configuração</h2>
                        <button class="close-modal" type="button">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="configForm">
                            <input type="hidden" id="config_id" value="${config.id}">
                            <div class="form-group">
                                <label for="chave"><i class="fas fa-key"></i> Chave</label>
                                <input type="text" id="chave" name="chave" class="form-control" value="${config.chave}" readonly>
                                <small class="form-text text-muted">A chave não pode ser alterada</small>
                            </div>
                            <div class="form-group">
                                <label for="valor"><i class="fas fa-edit"></i> Valor</label>
                                <input type="text" id="valor" name="valor" class="form-control" value="${config.valor}" placeholder="Digite o valor da configuração" required>
                            </div>
                            <div class="form-group">
                                <label for="descricao"><i class="fas fa-info-circle"></i> Descrição</label>
                                <textarea id="descricao" name="descricao" class="form-control" rows="3" placeholder="Digite uma descrição para a configuração (opcional)">${config.descricao || ''}</textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="cancelarConfig">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button type="submit" form="configForm" class="btn btn-primary">
                            <i class="fas fa-save"></i> Salvar Alterações
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar modal ao DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        
        // Configurar eventos do modal
        const modal = document.getElementById('configModal');
        const closeBtn = modal.querySelector('.close-modal');
        const cancelBtn = document.getElementById('cancelarConfig');
        const form = document.getElementById('configForm');
        
        // Exibir modal com animação
        setTimeout(() => {
            modal.classList.add('active');
            document.body.classList.add('modal-open');
        }, 10);
        
        // Função para fechar modal
        function fecharModal() {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            setTimeout(() => {
                if (modalContainer.parentNode) {
                    document.body.removeChild(modalContainer);
                }
            }, 300);
        }
        
        // Fechar modal
        closeBtn.addEventListener('click', fecharModal);
        cancelBtn.addEventListener('click', fecharModal);
        
        // Fechar modal ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                fecharModal();
            }
        });
        
        // Enviar formulário
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const configData = {
                id: document.getElementById('config_id').value,
                chave: document.getElementById('chave').value,
                valor: document.getElementById('valor').value,
                descricao: document.getElementById('descricao').value
            };
            
            await atualizarConfiguracao(configData);
            fecharModal();
        });
    } catch (error) {
        console.error('Erro ao abrir modal de edição:', error);
    }
}

// Função para confirmar exclusão de configuração
function confirmarExclusaoConfiguracao(configChave) {
    if (confirm('Tem certeza que deseja excluir esta configuração?')) {
        excluirConfiguracao(configChave);
    }
}

// Função para salvar nova configuração
async function salvarNovaConfiguracao(configData) {
    try {
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            return;
        }
        
        const response = await fetch(`${getApiBaseUrl()}/api/configuracoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(configData)
        });
        
        if (!response.ok) {
            console.error('Erro ao salvar configuração:', response.status);
            alert('Erro ao salvar configuração. Por favor, tente novamente.');
            return;
        }
        
        alert('Configuração salva com sucesso!');
        carregarDadosConfiguracoes(); // Recarregar dados
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        alert('Erro ao salvar configuração. Por favor, tente novamente.');
    }
}

// Função para atualizar configuração existente
async function atualizarConfiguracao(configData) {
    try {
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            return;
        }
        
        // Preparar dados para envio no formato JSON
        const requestBody = {
            valor: configData.valor,
            descricao: configData.descricao || null
        };
        
        const response = await fetch(`${getApiBaseUrl()}/api/configuracoes/${configData.chave}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Erro ao atualizar configuração:', response.status, errorData);
            alert(`Erro ao atualizar configuração: ${errorData.detail || 'Por favor, tente novamente.'}`);
            return;
        }
        
        const result = await response.json();
        alert('Configuração atualizada com sucesso!');
        carregarDadosConfiguracoes(); // Recarregar dados
    } catch (error) {
        console.error('Erro ao atualizar configuração:', error);
        alert('Erro ao atualizar configuração. Por favor, tente novamente.');
    }
}

// Função para excluir configuração
async function excluirConfiguracao(configChave) {
    try {
        const token = localStorage.getItem('erp_token');
        if (!token) {
            console.error('Token não encontrado');
            return;
        }
        
        const response = await fetch(`${getApiBaseUrl()}/api/configuracoes/${configChave}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.error('Erro ao excluir configuração:', response.status);
            alert('Erro ao excluir configuração. Por favor, tente novamente.');
            return;
        }
        
        alert('Configuração excluída com sucesso!');
        carregarDadosConfiguracoes(); // Recarregar dados
    } catch (error) {
        console.error('Erro ao excluir configuração:', error);
        alert('Erro ao excluir configuração. Por favor, tente novamente.');
    }
}


// Funções para formulários
function setupForms() {
    // Formulário de perfil
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            salvarPerfil();
        });
    }
    
    // Formulário de senha
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alterarSenha();
        });
    }
    
    // Formulário de preferências - Verificar se existe
    const preferencesForm = document.getElementById('preferencesForm');
    if (preferencesForm) {
        preferencesForm.addEventListener('submit', function(e) {
            e.preventDefault();
            salvarPreferencias();
        });
    }
    
    // Formulário de configurações
    const configuracoesForm = document.getElementById('configuracoesForm');
    if (configuracoesForm) {
        configuracoesForm.addEventListener('submit', function(e) {
            e.preventDefault();
            salvarConfiguracoes();
        });
    }
}

async function salvarPerfil() {
    try {
        // Validar se um nível de acesso foi selecionado
        const nivelAcesso = document.getElementById('cargo').value;
        if (nivelAcesso === '' || nivelAcesso === 'Selecione o nível de acesso') {
            alert('Por favor, selecione um nível de acesso válido.');
            return;
        }
        
        // Primeiro, obter o ID do usuário atual
        const currentUser = await apiGet('/api/usuarios/me');
        
        // Proteção: Usuários admin não podem alterar seu próprio nível de acesso
        if (currentUser.nivel_acesso === 'admin' && nivelAcesso !== 'admin') {
            alert('Usuários administradores não podem alterar seu próprio nível de acesso para outro nível.');
            // Restaurar o valor original
            document.getElementById('cargo').value = 'admin';
            return;
        }
        
        const perfilData = {
            nome: document.getElementById('nome').value,
            email: document.getElementById('email').value,
            nivel_acesso: nivelAcesso
        };
        
        // Usa a API centralizada com o ID do usuário
        await apiPut(`/api/usuarios/${currentUser.id}`, perfilData);
        
        alert('Perfil atualizado com sucesso!');
        // Atualizar nome na sidebar
        document.getElementById('userName').textContent = perfilData.nome;
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        alert(`Erro ao atualizar perfil: ${error.message}`);
    }
}

async function salvarConfiguracoes() {
    const configData = {
        moeda: document.getElementById('moeda').value,
        formato_data: document.getElementById('formato_data').value,
        fuso_horario: document.getElementById('fuso_horario').value,
        itens_por_pagina: document.getElementById('itens_por_pagina').value
    };
    
    try {
        // Usa a API centralizada
        await apiPut('/api/configuracoes', configData);
        
        alert('Configurações atualizadas com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar configurações:', error);
        alert(`Erro ao atualizar configurações: ${error.message}`);
    }
}

async function alterarSenha() {
    const senhaAtual = document.getElementById('senha_atual').value;
    const novaSenha = document.getElementById('nova_senha').value;
    const confirmarSenha = document.getElementById('confirmar_senha').value;
    
    // Validações básicas
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
        alert('Por favor, preencha todos os campos.');
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        alert('A nova senha e a confirmação não correspondem.');
        return;
    }
    
    const senhaData = {
        senha_atual: senhaAtual,
        nova_senha: novaSenha
    };
    
    try {
        // Usa a API centralizada com o endpoint correto
        await apiPut('/api/usuarios/me/senha', senhaData);
        
        alert('Senha alterada com sucesso!');
        // Limpar campos
        document.getElementById('senha_atual').value = '';
        document.getElementById('nova_senha').value = '';
        document.getElementById('confirmar_senha').value = '';
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        alert(`Erro ao alterar senha: ${error.message}`);
    }
}

function salvarPreferencias() {
    const preferencesData = {
        tema: document.getElementById('tema').value,
        idioma: document.getElementById('idioma').value,
        notificacoes: {
            email: document.getElementById('notif_email').checked,
            sistema: document.getElementById('notif_sistema').checked,
            estoque: document.getElementById('notif_estoque').checked
        }
    };
    
    // Salvar preferências no localStorage
    localStorage.setItem('userPreferences', JSON.stringify(preferencesData));
    alert('Preferências salvas com sucesso!');
}

async function salvarEmpresa() {
    const empresaData = {
        razao_social: document.getElementById('razao_social').value,
        nome_fantasia: document.getElementById('nome_fantasia').value,
        cnpj: document.getElementById('cnpj').value,
        inscricao_estadual: document.getElementById('inscricao_estadual').value,
        telefone: document.getElementById('telefone_empresa').value,
        email: document.getElementById('email_empresa').value,
        endereco: document.getElementById('endereco').value,
        cidade: document.getElementById('cidade').value,
        estado: document.getElementById('estado').value,
        cep: document.getElementById('cep').value
    };
    
    try {
        // Usa a API centralizada com o caminho correto
        await apiPut('/api/empresa', empresaData);
        alert('Dados da empresa atualizados com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar dados da empresa:', error);
        alert(`Erro ao atualizar dados da empresa: ${error.message}`);
    }
}

function salvarSistema() {
    const sistemaData = {
        moeda: document.getElementById('moeda').value,
        formato_data: document.getElementById('formato_data').value,
        fuso_horario: document.getElementById('fuso_horario').value,
        itens_por_pagina: document.getElementById('itens_por_pagina').value,
        log_atividades: document.getElementById('log_atividades').checked,
        backup_automatico: document.getElementById('backup_automatico').checked,
        modo_manutencao: document.getElementById('modo_manutencao').checked
    };
    
    // Salvar configurações do sistema no localStorage
    localStorage.setItem('systemSettings', JSON.stringify(sistemaData));
    alert('Configurações do sistema salvas com sucesso!');
}

function salvarConfigBackup() {
    const backupData = {
        frequencia: document.getElementById('frequencia_backup').value,
        hora: document.getElementById('hora_backup').value,
        retencao: document.getElementById('retencao_backup').value,
        tipo: document.getElementById('tipo_backup').value
    };
    
    // Salvar configurações de backup no localStorage
    localStorage.setItem('backupSettings', JSON.stringify(backupData));
    alert('Configurações de backup salvas com sucesso!');
}

function fazerBackup() {
    alert('Iniciando backup do sistema...');
    // Aqui você implementaria a lógica para fazer o backup
    setTimeout(() => {
        alert('Backup concluído com sucesso!');
    }, 2000);
}

function restaurarBackup() {
    alert('Esta operação irá restaurar o sistema para um backup anterior. Deseja continuar?');
    // Aqui você implementaria a lógica para restaurar um backup
}

// Configurações de usuários
async function carregarUsuarios() {
    try {
        const apiBaseUrl = localStorage.getItem('api_base_url') || 'http://localhost:8000';
        const response = await fetch(`${apiBaseUrl}/api/usuarios/`, {
            method: 'GET',
            headers: getAuthHeader()
        });

        if (!response.ok) {
            // Suprimir erro 403 (acesso negado) para usuários não-admin
            if (response.status !== 403) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            // Para erro 403, apenas retornar silenciosamente
            preencherTabelaUsuarios([]);
            return;
        }

        const usuarios = await response.json();
        preencherTabelaUsuarios(usuarios);
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        // Em caso de erro, mostrar tabela vazia
        preencherTabelaUsuarios([]);
    }
}

function preencherTabelaUsuarios(usuarios) {
    const tbody = document.getElementById('usuariosTableBody');
    if (!tbody) {
        console.error('Elemento usuariosTableBody não encontrado');
        return;
    }

    tbody.innerHTML = '';

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum usuário encontrado</td></tr>';
        return;
    }

    usuarios.forEach(usuario => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${usuario.id || ''}</td>
            <td>${usuario.nome || ''}</td>
            <td>${usuario.email || ''}</td>
            <td>${usuario.nivel_acesso || ''}</td>
            <td>
                <button class="btn-action btn-edit" onclick="abrirModalEditarUsuario(${usuario.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" onclick="confirmarExclusaoUsuario(${usuario.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function abrirModalEditarUsuario(userId) {
    document.getElementById('usuarioModalTitle').textContent = `Editar Usuário #${userId}`;
    
    try {
        // Buscar dados do usuário atual e do usuário a ser editado
        const [currentUser, usuario] = await Promise.all([
            apiGet('/api/usuarios/me'),
            apiGet(`/api/usuarios/${userId}`)
        ]);
        
        document.getElementById('usuario_nome').value = usuario.nome || '';
        document.getElementById('usuario_email').value = usuario.email || '';
        document.getElementById('usuario_senha').value = '';
        document.getElementById('usuario_nivel_acesso').value = usuario.nivel_acesso || 'usuario';
        
        // Armazenar o ID do usuário para atualização
        document.getElementById('usuarioForm').dataset.userId = userId;
        
        // Verificar se admin está editando seu próprio usuário
        const nivelAcessoField = document.getElementById('usuario_nivel_acesso');
        const isEditingSelf = currentUser.nivel_acesso === 'admin' && parseInt(userId) === currentUser.id;
        
        if (isEditingSelf) {
            // Desabilitar o campo de nível de acesso
            nivelAcessoField.disabled = true;
            nivelAcessoField.style.backgroundColor = '#f5f5f5';
            nivelAcessoField.style.cursor = 'not-allowed';
            nivelAcessoField.title = 'Administradores não podem alterar seu próprio nível de acesso';
            
            // Adicionar mensagem explicativa se não existir
            let warningMessage = document.getElementById('admin-self-edit-warning');
            if (!warningMessage) {
                warningMessage = document.createElement('div');
                warningMessage.id = 'admin-self-edit-warning';
                warningMessage.style.cssText = 'color: #856404; background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 8px; border-radius: 4px; margin-top: 5px; font-size: 12px;';
                warningMessage.textContent = 'Você não pode alterar seu próprio nível de acesso.';
                nivelAcessoField.parentNode.appendChild(warningMessage);
            }
        } else {
            // Habilitar o campo normalmente
            nivelAcessoField.disabled = false;
            nivelAcessoField.style.backgroundColor = '';
            nivelAcessoField.style.cursor = '';
            nivelAcessoField.title = '';
            
            // Remover mensagem de aviso se existir
            const warningMessage = document.getElementById('admin-self-edit-warning');
            if (warningMessage) {
                warningMessage.remove();
            }
        }
        
        document.getElementById('usuarioModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        alert(`Erro ao carregar dados do usuário: ${error.message}`);
    }
}

async function criarUsuario(usuarioData) {
    try {
        return await apiPost('/api/usuarios/', usuarioData);
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        throw error;
    }
}

async function atualizarUsuario(userId, usuarioData) {
    try {
        return await apiPut(`/api/usuarios/${userId}`, usuarioData);
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        throw error;
    }
}

function confirmarExclusaoUsuario(userId) {
    if (confirm(`Tem certeza que deseja excluir o usuário #${userId}?`)) {
        excluirUsuario(userId);
    }
}

async function excluirUsuario(userId) {
    try {
        const apiBaseUrl = localStorage.getItem('api_base_url') || 'http://localhost:8000';
        const response = await fetch(`${apiBaseUrl}/api/usuarios/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
        }

        alert('Usuário excluído com sucesso!');
        carregarUsuarios(); // Recarregar a lista
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        alert(`Erro ao excluir usuário: ${error.message}`);
    }
}

// Funções para modal de usuário
function setupUsuarioModal() {
    const modal = document.getElementById('usuarioModal');
    const closeBtn = modal.querySelector('.close-modal');
    const form = document.getElementById('usuarioForm');
    
    // Abrir modal ao clicar no botão Novo Usuário
    document.getElementById('btnNovoUsuario').addEventListener('click', function() {
        abrirModalNovoUsuario();
    });
    
    // Fechar modal
    closeBtn.addEventListener('click', function() {
        fecharModalUsuario();
    });
    
    // Submeter formulário
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        salvarUsuario();
    });
}

function abrirModalNovoUsuario() {
    document.getElementById('usuarioModalTitle').textContent = 'Novo Usuário';
    const form = document.getElementById('usuarioForm');
    form.reset();
    delete form.dataset.userId; // Limpar ID para indicar novo usuário
    document.getElementById('usuarioModal').style.display = 'flex';
}

function fecharModalUsuario() {
    document.getElementById('usuarioModal').style.display = 'none';
}

async function salvarUsuario() {
    // Validar formulário
    const form = document.getElementById('usuarioForm');
    if (!form.checkValidity()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    const senha = document.getElementById('usuario_senha').value;
    const userId = form.dataset.userId;
    
    const usuarioData = {
        nome: document.getElementById('usuario_nome').value,
        email: document.getElementById('usuario_email').value,
        nivel_acesso: document.getElementById('usuario_nivel_acesso').value
    };
    
    // Adicionar senha apenas se foi preenchida
    if (senha) {
        usuarioData.senha = senha;
    }
    
    try {
        // Verificar se é uma edição de usuário existente
        if (userId) {
            // Obter dados do usuário atual para verificar se é admin editando a si mesmo
            const currentUser = await apiGet('/api/usuarios/me');
            
            // Verificar se o admin está tentando alterar seu próprio nível de acesso
            if (currentUser.nivel_acesso === 'admin' && 
                parseInt(userId) === currentUser.id && 
                usuarioData.nivel_acesso !== 'admin') {
                
                alert('Administradores não podem alterar seu próprio nível de acesso.');
                
                // Restaurar o valor original no campo
                document.getElementById('usuario_nivel_acesso').value = 'admin';
                return;
            }
            
            // Atualizar usuário existente
            await atualizarUsuario(userId, usuarioData);
            alert('Usuário atualizado com sucesso!');
        } else {
            // Criar novo usuário
            if (!senha) {
                alert('A senha é obrigatória para novos usuários.');
                return;
            }
            await criarUsuario(usuarioData);
            alert('Usuário criado com sucesso!');
        }
        
        fecharModalUsuario();
        carregarUsuarios(); // Recarregar lista de usuários
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        alert(`Erro ao salvar usuário: ${error.message}`);
    }
}
