/**
 * Chat - JavaScript para a página de chat com IA
 * Gerencia configuração (admin) e chat com assistente IA
 */

(function () {
    let isAdmin = false;

    document.addEventListener('DOMContentLoaded', async function () {
        // Verifica se é admin
        const userData = localStorage.getItem('erp_user_data');
        if (userData) {
            const user = JSON.parse(userData);
            isAdmin = user.nivel_acesso === 'admin';
        }

        // Mostra/esconde tab de configuração
        const tabConfig = document.getElementById('tabConfig');
        if (tabConfig) {
            tabConfig.style.display = isAdmin ? 'flex' : 'none';
        }

        // Carrega mensagens existentes
        await carregarMensagens();

        // Se admin, carrega config
        if (isAdmin) {
            await carregarConfiguracao();
        }

        // Auto-resize do textarea de input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });

            // Enviar com Enter, Shift+Enter para nova linha
            chatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviarMensagem();
                }
            });
        }
    });

    // ============ TAB SWITCHING ============
    window.switchTab = function (tab) {
        // Atualiza tabs
        document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));

        if (tab === 'config') {
            document.getElementById('tabConfig').classList.add('active');
            document.getElementById('contentConfig').classList.add('active');
        } else {
            document.getElementById('tabChat').classList.add('active');
            document.getElementById('contentChat').classList.add('active');
        }
    };

    // ============ CONFIGURAÇÃO ============
    async function carregarConfiguracao() {
        try {
            const data = await apiGet('/api/chat/config');
            if (!data) return;

            document.getElementById('enderecoOrigem').value = data.endereco_origem || '';
            document.getElementById('custoPorKm').value = data.custo_por_km || 3.00;
            document.getElementById('regrasProdutos').value = data.regras_produtos || '';
            document.getElementById('instrucoesAdicionais').value = data.instrucoes_adicionais || '';

            // Carrega regras de incremento
            const regrasList = document.getElementById('regrasList');
            regrasList.innerHTML = '';

            const regras = data.regras_incremento || [];
            regras.forEach(regra => adicionarRegraUI(regra));

        } catch (error) {
            console.error('Erro ao carregar configuração do chat:', error);
        }
    }

    window.salvarConfiguracao = async function () {
        const btn = document.getElementById('btnSaveConfig');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            // Coleta dados do form
            const regras = coletarRegras();

            const configData = {
                endereco_origem: document.getElementById('enderecoOrigem').value.trim(),
                custo_por_km: parseFloat(document.getElementById('custoPorKm').value) || 3.00,
                regras_incremento: regras,
                regras_produtos: document.getElementById('regrasProdutos').value.trim(),
                instrucoes_adicionais: document.getElementById('instrucoesAdicionais').value.trim()
            };

            await apiPut('/api/chat/config', configData);

            btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configuração';
                btn.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('Erro ao salvar configuração:', error);
            btn.innerHTML = '<i class="fas fa-times"></i> Erro ao salvar';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configuração';
                btn.disabled = false;
            }, 2000);
        }
    };

    // ============ REGRAS DE INCREMENTO ============
    window.adicionarRegra = function (regra = null) {
        adicionarRegraUI(regra);
    };

    function adicionarRegraUI(regra = null) {
        const regrasList = document.getElementById('regrasList');
        const idx = regrasList.children.length;

        const div = document.createElement('div');
        div.className = 'regra-item';
        div.dataset.index = idx;

        const tipo = regra ? regra.tipo : '';
        const valor = regra ? regra.valor : '';
        const dias = regra ? (regra.dias || '') : '';
        const aKadaKm = regra ? (regra.a_cada_km || '') : '';

        div.innerHTML = `
            <select class="regra-tipo" onchange="onRegraTipoChange(this)">
                <option value="">Selecione o tipo...</option>
                <option value="horario_pico" ${tipo === 'horario_pico' ? 'selected' : ''}>Horário de Pico</option>
                <option value="dia_semana" ${tipo === 'dia_semana' ? 'selected' : ''}>Dia da Semana</option>
                <option value="distancia" ${tipo === 'distancia' ? 'selected' : ''}>Distância (a cada Xkm)</option>
            </select>
            <div>
                <label style="font-size:12px;color:var(--text-muted);">Valor (R$)</label>
                <input type="number" class="regra-valor-input" step="0.50" min="0" value="${valor}" placeholder="5.00">
            </div>
            <div class="regra-extra regra-dias ${tipo === 'dia_semana' ? 'visible' : ''}">
                <label style="font-size:12px;color:var(--text-muted);">Dias</label>
                <input type="text" class="regra-dias-input" value="${dias}" placeholder="segunda, terca, quarta, quinta, sexta">
            </div>
            <div class="regra-extra regra-km ${tipo === 'distancia' ? 'visible' : ''}">
                <label style="font-size:12px;color:var(--text-muted);">A cada (km)</label>
                <input type="number" class="regra-km-input" min="1" value="${aKadaKm}" placeholder="20">
            </div>
            <button class="btn-remove-regra" onclick="removerRegra(this)">
                <i class="fas fa-trash"></i>
            </button>
        `;

        regrasList.appendChild(div);
    }

    window.onRegraTipoChange = function (select) {
        const item = select.closest('.regra-item');
        const diasDiv = item.querySelector('.regra-dias');
        const kmDiv = item.querySelector('.regra-km');

        diasDiv.classList.remove('visible');
        kmDiv.classList.remove('visible');

        if (select.value === 'dia_semana') {
            diasDiv.classList.add('visible');
        } else if (select.value === 'distancia') {
            kmDiv.classList.add('visible');
        }
    };

    window.removerRegra = function (btn) {
        btn.closest('.regra-item').remove();
    };

    function coletarRegras() {
        const regras = [];
        document.querySelectorAll('.regra-item').forEach(item => {
            const tipo = item.querySelector('.regra-tipo').value;
            const valor = parseFloat(item.querySelector('.regra-valor-input').value) || 0;

            if (!tipo) return;

            const regra = { tipo, valor };

            if (tipo === 'dia_semana') {
                regra.dias = item.querySelector('.regra-dias-input').value.trim();
            } else if (tipo === 'distancia') {
                regra.a_cada_km = parseInt(item.querySelector('.regra-km-input').value) || 20;
            }

            regras.push(regra);
        });
        return regras;
    }

    // ============ CHAT ============
    async function carregarMensagens() {
        try {
            const mensagens = await apiGet('/api/chat/mensagens');
            if (!mensagens || mensagens.length === 0) return;

            const chatEmpty = document.getElementById('chatEmpty');
            if (chatEmpty) chatEmpty.style.display = 'none';

            const chatMessages = document.getElementById('chatMessages');

            mensagens.forEach(msg => {
                appendMessage(msg.role, msg.conteudo, false);
            });

            scrollToBottom();

        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
        }
    }

    window.enviarMensagem = async function () {
        const input = document.getElementById('chatInput');
        const conteudo = input.value.trim();
        if (!conteudo) return;

        const btnSend = document.getElementById('btnSend');
        btnSend.disabled = true;
        input.disabled = true;

        // Esconde mensagem vazia
        const chatEmpty = document.getElementById('chatEmpty');
        if (chatEmpty) chatEmpty.style.display = 'none';

        // Mostra mensagem do usuário
        appendMessage('user', conteudo, true);
        input.value = '';
        input.style.height = 'auto';

        // Mostra indicador de digitação
        showTyping(true);
        scrollToBottom();

        try {
            const response = await apiPost('/api/chat/enviar', { conteudo });
            showTyping(false);

            if (response && response.conteudo) {
                appendMessage('assistant', response.conteudo, true);
            }

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            showTyping(false);
            appendMessage('assistant', '❌ Erro ao obter resposta. Tente novamente.', true);
        }

        btnSend.disabled = false;
        input.disabled = false;
        input.focus();
        scrollToBottom();
    };

    window.limparChat = async function () {
        if (!confirm('Deseja realmente limpar todo o histórico de mensagens?')) return;

        try {
            await apiDelete('/api/chat/mensagens');

            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="chat-empty" id="chatEmpty">
                    <i class="fas fa-comments"></i>
                    <p>Olá! Sou o assistente do ERP Maneiro. Posso ajudar com cálculos de entrega, valores de produtos como pagamento e muito mais. Faça sua pergunta!</p>
                </div>
            `;

        } catch (error) {
            console.error('Erro ao limpar chat:', error);
        }
    };

    function appendMessage(role, conteudo, animate) {
        const chatMessages = document.getElementById('chatMessages');

        const div = document.createElement('div');
        div.className = `chat-message ${role}`;
        if (!animate) div.style.animation = 'none';

        const iconClass = role === 'user' ? 'fa-user' : 'fa-robot';

        // Formatar conteúdo simples: **bold**, \n 
        let formattedContent = escapeHtml(conteudo)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');

        div.innerHTML = `
            <div class="chat-avatar">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="chat-bubble">${formattedContent}</div>
        `;

        chatMessages.appendChild(div);

        scrollToBottom();
    }

    function showTyping(show) {
        const typing = document.getElementById('chatTyping');
        if (typing) {
            typing.classList.toggle('visible', show);
        }
    }

    function scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 50);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
