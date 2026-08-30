// softwares.js - Gerenciamento de Softwares

let isAdmin = false;
let softwareParaAtualizar = null;

// Funções de Loading
function showLoading(text = 'Enviando software...', progressText = 'Aguarde...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingProgressText = document.getElementById('loadingProgressText');
    
    if (loadingText) loadingText.textContent = text;
    if (loadingProgressText) loadingProgressText.textContent = progressText;
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
}

function updateLoadingText(text, progressText) {
    const loadingText = document.getElementById('loadingText');
    const loadingProgressText = document.getElementById('loadingProgressText');
    
    if (text && loadingText) loadingText.textContent = text;
    if (progressText && loadingProgressText) loadingProgressText.textContent = progressText;
}

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Softwares: Inicializando...');
    
    // Verifica se é admin para mostrar seção de upload
    await verificarPermissoes();

    // Carrega lista de softwares
    await carregarSoftwares();

    // Event listeners para formulários
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }

    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
        updateForm.addEventListener('submit', handleUpdate);
    }

    // Fecha modais ao clicar fora
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
});

async function verificarPermissoes() {
    try {
        const userData = await getCurrentUser();

        if (!userData) {
            console.log('Softwares: Usuário não autenticado');
            return;
        }

        isAdmin = userData.nivel_acesso === 'admin';
        console.log('Softwares: Usuário:', userData.nome, '| Admin:', isAdmin);

        // Mostra seção de upload apenas para admin
        const uploadSection = document.getElementById('upload-section');
        if (uploadSection && isAdmin) {
            uploadSection.style.display = 'block';
        }

        // Atualiza nome e cargo na sidebar
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        if (userNameEl) userNameEl.textContent = userData.nome || 'Usuário';
        if (userRoleEl) userRoleEl.textContent = userData.nivel_acesso === 'admin' ? 'Administrador' : 'Usuário';
    } catch (error) {
        console.error('Softwares: Erro ao verificar permissões:', error);
    }
}

async function carregarSoftwares() {
    const container = document.getElementById('softwares-container');
    const emptyState = document.getElementById('empty-state');

    try {
        console.log('Softwares: Carregando lista...');
        const softwares = await apiGet('/api/softwares');

        if (softwares === null) {
            console.log('Softwares: Erro de autenticação');
            return;
        }

        console.log('Softwares: Recebidos', softwares.length, 'itens');
        renderizarSoftwares(softwares);
    } catch (error) {
        console.error('Softwares: Erro ao carregar:', error);
        if (container) container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
    }
}

function renderizarSoftwares(softwares) {
    const container = document.getElementById('softwares-container');
    const emptyState = document.getElementById('empty-state');

    if (!container) {
        console.error('Softwares: Container não encontrado');
        return;
    }

    if (!softwares || softwares.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    container.innerHTML = softwares.map(software => {
        const nomeArquivoEscapado = escapeHtml(software.nome_arquivo).replace(/'/g, "\\'");
        return `
        <div class="software-card" data-id="${software.id}">
            <h4>
                <i class="fas fa-file-archive"></i>
                ${escapeHtml(software.nome_arquivo)}
            </h4>
            <div class="software-info">
                <p><span class="version-badge">v${software.versao || 1}</span></p>
                <p><strong>Tamanho:</strong> <span class="file-size">${formatarTamanho(software.tamanho)}</span></p>
                ${software.descricao ? `<p><strong>Descrição:</strong> ${escapeHtml(software.descricao)}</p>` : ''}
                <p><strong>Atualizado em:</strong> ${formatarData(software.data_atualizacao || software.data_upload)}</p>
                ${software.usuario_nome ? `<p><strong>Por:</strong> ${escapeHtml(software.usuario_nome)}</p>` : ''}
            </div>
            <div class="software-actions">
                <button class="btn-download" onclick="downloadSoftware(${software.id})">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn-history" onclick="abrirModalHistorico(${software.id})">
                    <i class="fas fa-history"></i> Histórico
                </button>
                ${isAdmin ? `
                    <button class="btn-update" onclick="abrirModalAtualizar(${software.id})">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                    <button class="btn-delete" onclick="excluirSoftware(${software.id}, '${nomeArquivoEscapado}')">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

async function handleUpload(event) {
    event.preventDefault();
    console.log('Softwares: Iniciando upload...');

    const fileInput = document.getElementById('arquivo');
    const descricaoInput = document.getElementById('descricao');

    if (!fileInput || !fileInput.files[0]) {
        alert('Selecione um arquivo');
        return;
    }

    const file = fileInput.files[0];
    const nomeArquivo = file.name;
    console.log('Softwares: Arquivo selecionado:', nomeArquivo);

    // Verifica se arquivo já existe
    try {
        const checkData = await apiGet(`/api/softwares/verificar/${encodeURIComponent(nomeArquivo)}`);
        console.log('Softwares: Verificação:', checkData);

        if (checkData && checkData.existe) {
            // Arquivo já existe, abre modal de atualização
            softwareParaAtualizar = checkData.software;
            const updateIdField = document.getElementById('update-software-id');
            if (updateIdField) updateIdField.value = checkData.software.id;
            
            const modalAtualizar = document.getElementById('modal-atualizar');
            if (modalAtualizar) modalAtualizar.classList.add('active');
            
            alert(`O arquivo "${nomeArquivo}" já existe (versão ${checkData.software.versao}).\n\nDescreva as alterações da nova versão.`);
            return;
        }
    } catch (error) {
        console.error('Softwares: Erro ao verificar existência:', error);
    }

    // Upload de novo arquivo
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('descricao', descricaoInput ? descricaoInput.value : '');

    // Mostra loading
    showLoading('Enviando software...', `Enviando: ${nomeArquivo}`);

    try {
        console.log('Softwares: Enviando arquivo...');
        const result = await apiPostFormData('/api/softwares/upload', formData);

        if (result === null) {
            console.log('Softwares: Erro de autenticação no upload');
            hideLoading();
            return;
        }

        console.log('Softwares: Upload concluído:', result);
        hideLoading();
        alert('Software enviado com sucesso!');

        // Notifica via webhook sobre o novo software
        if (window.webhookEstoque) {
            window.webhookEstoque.notificarNovoSoftware(
                nomeArquivo,
                1,
                descricaoInput ? descricaoInput.value : ''
            ).catch(err => console.warn('[Softwares] Erro ao enviar webhook:', err));
        }

        // Limpa formulário e recarrega lista
        fileInput.value = '';
        if (descricaoInput) descricaoInput.value = '';
        await carregarSoftwares();
    } catch (error) {
        console.error('Softwares: Erro ao enviar:', error);
        hideLoading();
        alert('Erro ao enviar software: ' + (error.message || error));
    }
}

async function handleUpdate(event) {
    event.preventDefault();
    console.log('Softwares: Iniciando atualização...');

    const softwareIdField = document.getElementById('update-software-id');
    const fileInput = document.getElementById('update-arquivo');
    const alteracoesInput = document.getElementById('update-alteracoes');

    const softwareId = softwareIdField ? softwareIdField.value : null;

    if (!softwareId) {
        alert('Erro: ID do software não encontrado');
        return;
    }

    if (!fileInput || !fileInput.files[0]) {
        alert('Selecione um arquivo');
        return;
    }

    if (!alteracoesInput || !alteracoesInput.value.trim()) {
        alert('Descreva as alterações desta versão');
        return;
    }

    const formData = new FormData();
    formData.append('arquivo', fileInput.files[0]);
    formData.append('alteracoes', alteracoesInput.value.trim());

    // Mostra loading
    const nomeArquivo = fileInput.files[0].name;
    showLoading('Atualizando software...', `Enviando: ${nomeArquivo}`);

    try {
        console.log('Softwares: Atualizando software ID:', softwareId);
        const result = await apiPostFormData(`/api/softwares/atualizar/${softwareId}`, formData);

        if (result === null) {
            console.log('Softwares: Erro de autenticação na atualização');
            hideLoading();
            return;
        }

        console.log('Softwares: Atualização concluída:', result);
        hideLoading();
        alert(`Software atualizado para versão ${result.versao}!`);

        // Notifica via webhook sobre a atualização do software
        if (window.webhookEstoque) {
            window.webhookEstoque.notificarNovoSoftware(
                fileInput.files[0].name,
                result.versao,
                alteracoesInput ? alteracoesInput.value.trim() : ''
            ).catch(err => console.warn('[Softwares] Erro ao enviar webhook:', err));
        }

        // Fecha modal e recarrega lista
        fecharModalAtualizar();
        await carregarSoftwares();

        // Limpa form principal também
        const arquivoInput = document.getElementById('arquivo');
        const descricaoInput = document.getElementById('descricao');
        if (arquivoInput) arquivoInput.value = '';
        if (descricaoInput) descricaoInput.value = '';
    } catch (error) {
        console.error('Softwares: Erro ao atualizar:', error);
        hideLoading();
        alert('Erro ao atualizar software: ' + (error.message || error));
    }
}

async function downloadSoftware(softwareId) {
    console.log('Softwares: Iniciando download ID:', softwareId);
    
    // Mostra loading
    showLoading('Baixando software...', 'Preparando download...');
    
    try {
        // Primeiro busca informações do software para pegar o nome correto
        const software = await apiGet(`/api/softwares/${softwareId}`);
        if (!software) {
            throw new Error('Software não encontrado');
        }
        
        const baseUrl = await getApiBaseUrl();
        const token = localStorage.getItem('erp_token');

        if (!token) {
            alert('Você precisa estar autenticado para baixar arquivos');
            return;
        }

        // Faz requisição com autenticação
        const response = await fetch(`${baseUrl}/api/softwares/download/${softwareId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Softwares: Erro no download:', errorText);
            throw new Error('Erro ao baixar software');
        }

        // Usa o nome do arquivo do banco de dados (mais confiável)
        let filename = software.nome_arquivo || 'download.exe';
        
        // Garante que tem extensão .exe se não tiver
        if (!filename.toLowerCase().endsWith('.exe')) {
            filename = filename + '.exe';
        }

        console.log('Softwares: Baixando arquivo:', filename);
        
        updateLoadingText('Baixando software...', `Baixando: ${filename}`);

        // Cria blob e faz download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
        
        hideLoading();

    } catch (error) {
        console.error('Softwares: Erro ao baixar:', error);
        hideLoading();
        alert('Erro ao baixar software: ' + (error.message || error));
    }
}

async function abrirModalHistorico(softwareId) {
    console.log('Softwares: Carregando histórico ID:', softwareId);
    
    try {
        const historico = await apiGet(`/api/softwares/historico/${softwareId}`);

        if (historico === null) {
            console.log('Softwares: Erro de autenticação no histórico');
            return;
        }

        console.log('Softwares: Histórico recebido:', historico.length, 'itens');
        renderizarHistorico(historico);
        
        const modal = document.getElementById('modal-historico');
        if (modal) modal.classList.add('active');
    } catch (error) {
        console.error('Softwares: Erro ao carregar histórico:', error);
        alert('Erro ao carregar histórico: ' + (error.message || error));
    }
}

function renderizarHistorico(historico) {
    const lista = document.getElementById('historico-lista');

    if (!lista) {
        console.error('Softwares: Lista de histórico não encontrada');
        return;
    }

    if (!historico || historico.length === 0) {
        lista.innerHTML = '<li class="history-item">Nenhum histórico disponível</li>';
        return;
    }

    lista.innerHTML = historico.map(item => `
        <li class="history-item">
            <div>
                <span class="version">Versão ${item.versao}</span>
                <span class="date"> - ${formatarData(item.data_alteracao)}</span>
                ${item.usuario_nome ? `<span class="date"> por ${escapeHtml(item.usuario_nome)}</span>` : ''}
            </div>
            <div class="changes">${escapeHtml(item.alteracoes)}</div>
        </li>
    `).join('');
}

function fecharModalHistorico() {
    const modal = document.getElementById('modal-historico');
    if (modal) modal.classList.remove('active');
}

function abrirModalAtualizar(softwareId) {
    console.log('Softwares: Abrindo modal de atualização ID:', softwareId);
    
    const updateIdField = document.getElementById('update-software-id');
    const updateArquivo = document.getElementById('update-arquivo');
    const updateAlteracoes = document.getElementById('update-alteracoes');
    const modal = document.getElementById('modal-atualizar');

    if (updateIdField) updateIdField.value = softwareId;
    if (updateArquivo) updateArquivo.value = '';
    if (updateAlteracoes) updateAlteracoes.value = '';
    if (modal) modal.classList.add('active');
}

function fecharModalAtualizar() {
    const updateIdField = document.getElementById('update-software-id');
    const updateArquivo = document.getElementById('update-arquivo');
    const updateAlteracoes = document.getElementById('update-alteracoes');
    const modal = document.getElementById('modal-atualizar');

    if (updateIdField) updateIdField.value = '';
    if (updateArquivo) updateArquivo.value = '';
    if (updateAlteracoes) updateAlteracoes.value = '';
    if (modal) modal.classList.remove('active');
    
    softwareParaAtualizar = null;
}

async function excluirSoftware(softwareId, nomeArquivo) {
    if (!confirm(`Tem certeza que deseja excluir o software "${nomeArquivo}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }

    console.log('Softwares: Excluindo ID:', softwareId);

    try {
        const result = await apiDelete(`/api/softwares/${softwareId}`);

        if (result === null) {
            console.log('Softwares: Erro de autenticação na exclusão');
            return;
        }

        console.log('Softwares: Exclusão concluída');
        alert('Software excluído com sucesso!');
        await carregarSoftwares();
    } catch (error) {
        console.error('Softwares: Erro ao excluir:', error);
        alert('Erro ao excluir software: ' + (error.message || error));
    }
}

// Funções auxiliares
function formatarTamanho(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= sizes.length) return bytes + ' B';
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatarData(dataStr) {
    if (!dataStr) return '-';
    try {
        const data = new Date(dataStr);
        if (isNaN(data.getTime())) return '-';
        return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '-';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
