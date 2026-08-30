/**
 * Calendario.js - JavaScript para a página de Calendário de Datas Comemorativas
 * Gerencia CRUD de datas, configuração de notificações e importação CSV
 */

// Variáveis globais
let anoAtual = new Date().getFullYear();
let isAdmin = false;
let datasCalendario = [];

// Inicialização
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[Calendario] Inicializando...');

    // Verifica autenticação
    const userData = await verificarUsuario();
    if (!userData) return;

    // Atualiza UI de usuário
    atualizarUIUsuario(userData);

    // Verifica se é admin
    isAdmin = userData.nivel_acesso === 'admin';

    // Mostra/oculta elementos admin
    configurarPermissoes();

    // Esconde tela de loading de permissões e mostra app container
    const permissionLoading = document.getElementById('permission-loading');
    const appContainer = document.querySelector('.app-container');
    if (permissionLoading) permissionLoading.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    // Carrega configuração
    await carregarConfig();

    // Carrega datas do ano atual
    await carregarDatas();

    // Configura toggle de notificação
    document.getElementById('notificaAtivo').addEventListener('change', function () {
        const configFields = document.getElementById('configFields');
        if (this.checked) {
            configFields.classList.remove('hidden');
        } else {
            configFields.classList.add('hidden');
        }
    });

    console.log('[Calendario] Inicialização concluída');
});

async function verificarUsuario() {
    try {
        const userData = localStorage.getItem('erp_user_data');
        if (!userData) {
            window.location.href = 'index.html';
            return null;
        }
        return JSON.parse(userData);
    } catch (error) {
        console.error('[Calendario] Erro ao verificar usuário:', error);
        window.location.href = 'index.html';
        return null;
    }
}

function atualizarUIUsuario(userData) {
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');

    if (userNameEl) userNameEl.textContent = userData.nome || 'Usuário';
    if (userRoleEl) userRoleEl.textContent = userData.nivel_acesso === 'admin' ? 'Administrador' : 'Usuário';
}

function configurarPermissoes() {
    const adminPanel = document.getElementById('adminPanel');
    const thAcoes = document.getElementById('thAcoes');
    const toggleContainer = document.getElementById('toggleNotificacaoContainer');

    if (isAdmin) {
        adminPanel.classList.remove('hidden');
        thAcoes.classList.remove('hidden');
        if (toggleContainer) toggleContainer.classList.remove('hidden');
    } else {
        adminPanel.classList.add('hidden');
        thAcoes.classList.add('hidden');
        if (toggleContainer) toggleContainer.classList.add('hidden');
    }
}

// ============================================
// Configuração de Notificações
// ============================================

async function carregarConfig() {
    try {
        const config = await apiGet('/api/calendario/config/atual');

        if (config) {
            const notificaAtivo = document.getElementById('notificaAtivo');
            const totalNotificacoes = document.getElementById('totalNotificacoes');
            const diasAntes = document.getElementById('diasAntes');
            const configFields = document.getElementById('configFields');

            notificaAtivo.checked = config.notifica_ativo;
            totalNotificacoes.value = config.total_notificacoes || 3;
            diasAntes.value = config.dias_antes || 30;

            if (config.notifica_ativo && isAdmin) {
                configFields.classList.remove('hidden');
            }

            // Mostra última execução
            if (config.ultima_execucao) {
                const data = new Date(config.ultima_execucao);
                document.getElementById('ultimaExecucao').innerHTML =
                    `<i class="fas fa-clock"></i> <strong>Última verificação:</strong> ${data.toLocaleString('pt-BR')}`;
            }
        }
    } catch (error) {
        console.error('[Calendario] Erro ao carregar configuração:', error);
    }
}

async function salvarConfig() {
    if (!isAdmin) {
        alert('Apenas administradores podem alterar configurações.');
        return;
    }

    const config = {
        notifica_ativo: document.getElementById('notificaAtivo').checked,
        total_notificacoes: parseInt(document.getElementById('totalNotificacoes').value) || 3,
        dias_antes: parseInt(document.getElementById('diasAntes').value) || 30
    };

    try {
        await apiPut('/api/calendario/config/atualizar', config);
        alert('Configuração salva com sucesso!');
    } catch (error) {
        console.error('[Calendario] Erro ao salvar configuração:', error);
        alert('Erro ao salvar configuração: ' + error.message);
    }
}

// ============================================
// Carregamento de Datas
// ============================================

async function carregarDatas() {
    const loading = document.getElementById('loading');
    const tabela = document.getElementById('tabelaDatas');

    loading.style.display = 'block';
    tabela.innerHTML = '';

    // Atualiza ano exibido
    document.getElementById('anoAtual').textContent = anoAtual;

    try {
        datasCalendario = await apiGet(`/api/calendario/?ano=${anoAtual}`);

        if (!datasCalendario || datasCalendario.length === 0) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="${isAdmin ? 4 : 3}" class="mensagem-vazia">
                        <i class="fas fa-calendar-times"></i>
                        <p>Nenhuma data cadastrada para ${anoAtual}</p>
                    </td>
                </tr>
            `;
        } else {
            tabela.innerHTML = datasCalendario.map(item => renderizarLinhaData(item)).join('');
        }
    } catch (error) {
        console.error('[Calendario] Erro ao carregar datas:', error);
        tabela.innerHTML = `
            <tr>
                <td colspan="${isAdmin ? 4 : 3}" class="mensagem-vazia">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar datas</p>
                </td>
            </tr>
        `;
    } finally {
        loading.style.display = 'none';
    }
}

function renderizarLinhaData(item) {
    const data = new Date(item.data + 'T00:00:00');
    const dataFormatada = data.toLocaleDateString('pt-BR');

    const badgeClass = item.notifica ? 'badge-success' : 'badge-danger';
    const badgeText = item.notifica ? 'Sim' : 'Não';

    let acoes = '';
    if (isAdmin) {
        acoes = `
            <td>
                <button class="btn-action btn-primary" onclick="editarData(${item.id})" style="padding: 5px 10px; font-size: 12px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-danger" onclick="excluirData(${item.id})" style="padding: 5px 10px; font-size: 12px;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    }

    return `
        <tr>
            <td>${dataFormatada}</td>
            <td>${item.descricao}</td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            ${acoes}
        </tr>
    `;
}

function mudarAno(delta) {
    anoAtual += delta;
    carregarDatas();
}

// ============================================
// CRUD de Datas
// ============================================

function abrirModalNovo() {
    document.getElementById('modalDataTitulo').innerHTML = '<i class="fas fa-calendar-plus"></i> Adicionar Data';
    document.getElementById('dataId').value = '';
    document.getElementById('dataEvento').value = '';
    document.getElementById('descricaoEvento').value = '';
    document.getElementById('notificaEvento').checked = true;
    document.getElementById('modalData').style.display = 'flex';
}

function editarData(id) {
    const item = datasCalendario.find(d => d.id === id);
    if (!item) {
        alert('Data não encontrada');
        return;
    }

    document.getElementById('modalDataTitulo').innerHTML = '<i class="fas fa-calendar-check"></i> Editar Data';
    document.getElementById('dataId').value = item.id;
    document.getElementById('dataEvento').value = item.data;
    document.getElementById('descricaoEvento').value = item.descricao;
    document.getElementById('notificaEvento').checked = item.notifica;
    document.getElementById('modalData').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalData').style.display = 'none';
}

async function salvarData() {
    const id = document.getElementById('dataId').value;
    const data = document.getElementById('dataEvento').value;
    const descricao = document.getElementById('descricaoEvento').value;
    const notifica = document.getElementById('notificaEvento').checked;

    if (!data || !descricao) {
        alert('Por favor, preencha todos os campos.');
        return;
    }

    const payload = { data, descricao, notifica };

    try {
        if (id) {
            await apiPut(`/api/calendario/${id}`, payload);
            alert('Data atualizada com sucesso!');
        } else {
            await apiPost('/api/calendario/', payload);
            alert('Data criada com sucesso!');
        }

        fecharModal();
        await carregarDatas();
    } catch (error) {
        console.error('[Calendario] Erro ao salvar data:', error);
        alert('Erro ao salvar: ' + error.message);
    }
}

async function excluirData(id) {
    if (!confirm('Tem certeza que deseja excluir esta data?')) {
        return;
    }

    try {
        await apiDelete(`/api/calendario/${id}`);
        alert('Data excluída com sucesso!');
        await carregarDatas();
    } catch (error) {
        console.error('[Calendario] Erro ao excluir data:', error);
        alert('Erro ao excluir: ' + error.message);
    }
}

// ============================================
// Importação CSV
// ============================================

async function importarCSV(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const token = localStorage.getItem('erp_token');
        const apiUrl = localStorage.getItem('erp_api_url') || 'https://erp-api-call.autoservto.com.br';

        const response = await fetch(`${apiUrl}/api/calendario/importar-csv`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            let mensagem = `Importação concluída!\n\n`;
            mensagem += `✅ Importadas: ${result.linhas_importadas}\n`;
            mensagem += `⚠️ Duplicadas: ${result.linhas_duplicadas}\n`;
            mensagem += `❌ Erros: ${result.linhas_erro}`;

            if (result.detalhes_erro && result.detalhes_erro.length > 0) {
                mensagem += `\n\nDetalhes dos erros:\n${result.detalhes_erro.join('\n')}`;
            }

            alert(mensagem);
            await carregarDatas();
        } else {
            alert('Erro ao importar: ' + (result.detail || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('[Calendario] Erro ao importar CSV:', error);
        alert('Erro ao importar arquivo: ' + error.message);
    }

    // Limpa o input para permitir reimportação do mesmo arquivo
    input.value = '';
}

// ============================================
// Execução Manual
// ============================================

async function executarAgora() {
    if (!confirm('Deseja executar a verificação de notificações agora?')) {
        return;
    }

    console.log('[Calendario] ========== EXECUTANDO VERIFICAÇÃO ==========');
    console.log('[Calendario] Data de hoje:', new Date().toLocaleDateString('pt-BR'));

    try {
        console.log('[Calendario] Chamando API /api/calendario/executar-agora...');
        const result = await apiPost('/api/calendario/executar-agora');

        console.log('[Calendario] Resposta da API:', result);
        console.log('[Calendario] Notificações enviadas:', result.enviadas);

        if (result.detalhes && result.detalhes.length > 0) {
            console.log('[Calendario] Detalhes das notificações:');
            result.detalhes.forEach((d, i) => {
                console.log(`  ${i + 1}. ${d.descricao} - ${d.dias_restantes} dias - ${d.notificacao} (${d.vendedores} vendedores)`);
            });
        } else {
            console.log('[Calendario] Nenhuma notificação enviada. Possíveis motivos:');
            console.log('  - Nenhuma data comemorativa com notifica=TRUE dentro do período');
            console.log('  - Hoje não é um dia de notificação calculado');
            console.log('  - Webhook não está configurado ou desativado');
            console.log('  - Nenhum vendedor ativo com telefone');
        }

        let mensagem = `Verificação concluída!\n\n`;
        mensagem += `📧 Notificações enviadas: ${result.enviadas}\n`;
        mensagem += `📋 Mensagem: ${result.message}\n`;

        if (result.detalhes && result.detalhes.length > 0) {
            mensagem += `\nDetalhes:\n`;
            result.detalhes.forEach(d => {
                mensagem += `• ${d.descricao} - ${d.dias_restantes} dias - ${d.notificacao} (${d.vendedores} vendedores)\n`;
            });
        }

        alert(mensagem);

        // Recarrega config para atualizar última execução
        await carregarConfig();
    } catch (error) {
        console.error('[Calendario] Erro ao executar verificação:', error);
        alert('Erro ao executar: ' + error.message);
    }
}

// Fecha modal clicando fora
document.addEventListener('click', function (e) {
    const modal = document.getElementById('modalData');
    if (e.target === modal) {
        fecharModal();
    }
});

console.log('[Calendario] Módulo carregado');
