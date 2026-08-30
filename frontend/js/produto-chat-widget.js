// Widget flutuante de chat com IA sobre um produto específico.
// Aparece em todas as páginas (exceto login). Qualquer usuário pode abrir,
// escolher um produto e tirar dúvidas com a IA sobre ele.

(function () {
    let produtosCache = null;
    let produtoSelecionadoId = null;

    // Este script é injetado dinamicamente (por sidebar-template.js) depois que o
    // DOMContentLoaded da página já disparou, então não dá pra esperar esse evento
    // aqui — a essa altura o DOM já está pronto, então só inicializa direto.
    if (isAuthenticated()) {
        criarBotaoFlutuante();
        criarPainel();
    }

    function criarBotaoFlutuante() {
        if (document.getElementById('pcwBotao')) return;

        const botao = document.createElement('button');
        botao.id = 'pcwBotao';
        botao.title = 'Tirar dúvidas sobre um produto com a IA';
        botao.innerHTML = '<i class="fas fa-comment-dots"></i>';
        botao.style.cssText = [
            'position: fixed', 'bottom: 24px', 'right: 24px', 'z-index: 99998',
            'width: 56px', 'height: 56px', 'border-radius: 50%',
            'background: #3f8efc', 'color: #fff', 'border: none',
            'box-shadow: 0 4px 14px rgba(0,0,0,0.35)', 'cursor: pointer',
            'font-size: 22px', 'display: flex', 'align-items: center', 'justify-content: center'
        ].join(';');
        botao.addEventListener('click', togglePainel);
        document.body.appendChild(botao);
    }

    function criarPainel() {
        if (document.getElementById('pcwPainel')) return;

        const painel = document.createElement('div');
        painel.id = 'pcwPainel';
        painel.style.cssText = [
            'position: fixed', 'bottom: 92px', 'right: 24px', 'z-index: 99999',
            'width: 400px', 'max-width: calc(100vw - 32px)', 'height: 580px',
            'max-height: calc(100vh - 140px)', 'background: #1b2333', 'color: #e6e9f0',
            'border-radius: 20px', 'box-shadow: 0 16px 50px rgba(0,0,0,0.5)',
            'display: none', 'flex-direction: column', 'overflow: hidden',
            'font-family: inherit', 'border: 1px solid rgba(255,255,255,0.08)'
        ].join(';');

        painel.innerHTML = `
            <div style="padding: 12px 14px; background: #232d42; display: flex; align-items: center; justify-content: space-between;">
                <strong style="font-size: 14px;"><i class="fas fa-robot"></i> Dúvidas sobre o produto</strong>
                <button id="pcwFechar" style="background:none;border:none;color:#e6e9f0;font-size:16px;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <input type="text" id="pcwBusca" placeholder="Buscar produto por nome ou código..."
                    style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:#111826; color:#e6e9f0; font-size:13px; box-sizing:border-box;">
                <label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; color:#c3c9d6; cursor:pointer;">
                    <input type="checkbox" id="pcwSomenteComEstoque" checked style="cursor:pointer;">
                    Somente produto com estoque
                </label>
                <div id="pcwResultados" style="max-height:120px; overflow-y:auto; margin-top:6px;"></div>
                <div id="pcwProdutoAtual" style="margin-top:6px; font-size:12px; color:#8892b0;"></div>
            </div>
            <div id="pcwMensagens" style="flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:8px;">
                <div style="color:#8892b0; font-size:13px; text-align:center; margin-top: 20px;">
                    Escolha um produto acima pra começar.
                </div>
            </div>
            <div style="padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); display:flex; gap:8px;">
                <input type="text" id="pcwInput" placeholder="Digite ou grave sua dúvida..." disabled
                    style="flex:1; padding:9px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:#111826; color:#e6e9f0; font-size:13px; box-sizing:border-box;">
                <button id="pcwMicrofone" disabled
                    style="background:#2a3448; color:#e6e9f0; border:none; border-radius:10px; width:40px; cursor:pointer; opacity:0.5;">
                    <i class="fas fa-microphone"></i>
                </button>
                <button id="pcwEnviar" disabled
                    style="background:#3f8efc; color:#fff; border:none; border-radius:10px; width:40px; cursor:pointer; opacity:0.5;">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;
        document.body.appendChild(painel);

        document.getElementById('pcwFechar').addEventListener('click', togglePainel);
        document.getElementById('pcwBusca').addEventListener('input', onBuscaProduto);
        document.getElementById('pcwSomenteComEstoque').addEventListener('change', onBuscaProduto);
        document.getElementById('pcwMicrofone').addEventListener('click', function () {
            alternarGravacaoAudio(this, function (texto) {
                const input = document.getElementById('pcwInput');
                input.value = (input.value ? input.value + ' ' : '') + texto;
                input.focus();
            });
        });
        document.getElementById('pcwEnviar').addEventListener('click', enviarPergunta);
        document.getElementById('pcwInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') enviarPergunta();
        });
    }

    function togglePainel() {
        const painel = document.getElementById('pcwPainel');
        const aberto = painel.style.display === 'flex';
        painel.style.display = aberto ? 'none' : 'flex';
    }

    async function onBuscaProduto() {
        const termo = document.getElementById('pcwBusca').value.trim().toLowerCase();
        const container = document.getElementById('pcwResultados');

        if (!termo) {
            container.innerHTML = '';
            return;
        }

        if (!produtosCache) {
            try {
                produtosCache = await apiGet('/api/produtos') || [];
            } catch (error) {
                container.innerHTML = '<div style="color:#e74c3c; font-size:12px;">Erro ao carregar produtos</div>';
                return;
            }
        }

        const somenteComEstoque = document.getElementById('pcwSomenteComEstoque').checked;

        const encontrados = produtosCache
            .filter(p => p.nome.toLowerCase().includes(termo) || (p.codigo || '').toLowerCase().includes(termo))
            .filter(p => !somenteComEstoque || (p.estoque_atual || 0) > 0)
            .slice(0, 8);

        if (encontrados.length === 0) {
            container.innerHTML = '<div style="color:#8892b0; font-size:12px;">Nenhum produto encontrado</div>';
            return;
        }

        container.innerHTML = encontrados.map(p => `
            <div class="pcw-resultado-item" data-id="${p.id}"
                style="padding:6px 8px; cursor:pointer; border-radius:4px; font-size:13px;"
                onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                onmouseout="this.style.background='transparent'">
                <strong>${p.codigo || '-'}</strong> — ${p.nome}
            </div>
        `).join('');

        container.querySelectorAll('.pcw-resultado-item').forEach(el => {
            el.addEventListener('click', () => selecionarProduto(parseInt(el.dataset.id, 10)));
        });
    }

    async function selecionarProduto(produtoId) {
        produtoSelecionadoId = produtoId;
        const produto = produtosCache.find(p => p.id === produtoId);

        document.getElementById('pcwBusca').value = '';
        document.getElementById('pcwResultados').innerHTML = '';
        document.getElementById('pcwProdutoAtual').textContent = produto
            ? `Produto selecionado: ${produto.codigo || ''} — ${produto.nome}`
            : `Produto #${produtoId}`;

        document.getElementById('pcwInput').disabled = false;
        const btnMicrofone = document.getElementById('pcwMicrofone');
        btnMicrofone.disabled = false;
        btnMicrofone.style.opacity = '1';
        const btnEnviar = document.getElementById('pcwEnviar');
        btnEnviar.disabled = false;
        btnEnviar.style.opacity = '1';

        await carregarHistorico();
    }

    async function carregarHistorico() {
        const container = document.getElementById('pcwMensagens');
        container.innerHTML = '<div style="color:#8892b0; font-size:12px; text-align:center;">Carregando conversa...</div>';

        try {
            const mensagens = await apiGet(`/api/produto-chat/${produtoSelecionadoId}/mensagens`) || [];
            if (mensagens.length === 0) {
                container.innerHTML = '<div style="color:#8892b0; font-size:13px; text-align:center; margin-top: 20px;">Pergunte algo sobre este produto.</div>';
                return;
            }
            container.innerHTML = '';
            mensagens.forEach(m => adicionarBolha(m.role, m.conteudo));
        } catch (error) {
            container.innerHTML = '<div style="color:#e74c3c; font-size:12px;">Erro ao carregar histórico</div>';
        }
    }

    function adicionarBolha(role, texto) {
        const container = document.getElementById('pcwMensagens');
        const bolha = document.createElement('div');
        const isUser = role === 'user';
        bolha.style.cssText = [
            'max-width: 85%', 'padding: 9px 12px', 'border-radius: 14px', 'font-size: 13px',
            'white-space: pre-wrap', 'word-wrap: break-word',
            isUser ? 'align-self: flex-end' : 'align-self: flex-start',
            isUser ? 'background: #3f8efc' : 'background: #2a3448',
            isUser ? 'color: #fff' : 'color: #e6e9f0'
        ].join(';');
        bolha.textContent = texto;
        container.appendChild(bolha);
        container.scrollTop = container.scrollHeight;
    }

    async function enviarPergunta() {
        if (!produtoSelecionadoId) return;

        const input = document.getElementById('pcwInput');
        const pergunta = input.value.trim();
        if (!pergunta) return;

        input.value = '';
        input.disabled = true;
        const btnEnviar = document.getElementById('pcwEnviar');
        btnEnviar.disabled = true;

        adicionarBolha('user', pergunta);

        const container = document.getElementById('pcwMensagens');
        const carregando = document.createElement('div');
        carregando.id = 'pcwCarregando';
        carregando.style.cssText = 'align-self: flex-start; color:#8892b0; font-size:12px;';
        carregando.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pensando...';
        container.appendChild(carregando);
        container.scrollTop = container.scrollHeight;

        try {
            const resposta = await apiPost(`/api/produto-chat/${produtoSelecionadoId}/enviar`, { conteudo: pergunta });
            document.getElementById('pcwCarregando')?.remove();
            adicionarBolha('assistant', resposta.conteudo);
        } catch (error) {
            document.getElementById('pcwCarregando')?.remove();
            adicionarBolha('assistant', 'Erro ao consultar a IA. Tente novamente em instantes.');
        } finally {
            input.disabled = false;
            btnEnviar.disabled = false;
            input.focus();
        }
    }
})();

// ===== Gravação de áudio + transcrição (Parakeet local, via backend) =====
// Utilitário global (não fica preso à IIFE acima) porque também é usado pelo
// botão de microfone do campo "Instruções e Dúvidas" no cadastro de produto.
const _audioTranscricaoState = { mediaRecorder: null, chunks: [], stream: null, gravando: false };

async function alternarGravacaoAudio(botaoEl, aoTranscrever) {
    if (_audioTranscricaoState.gravando) {
        _pararGravacaoAudio(botaoEl, aoTranscrever);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _audioTranscricaoState.stream = stream;
        _audioTranscricaoState.chunks = [];

        const mediaRecorder = new MediaRecorder(stream);
        _audioTranscricaoState.mediaRecorder = mediaRecorder;
        mediaRecorder.addEventListener('dataavailable', function (e) {
            if (e.data.size > 0) _audioTranscricaoState.chunks.push(e.data);
        });
        mediaRecorder.start();
        _audioTranscricaoState.gravando = true;

        botaoEl.innerHTML = '<i class="fas fa-stop"></i>';
        botaoEl.style.background = '#c0392b';
        botaoEl.style.color = '#fff';
    } catch (error) {
        alert('Não foi possível acessar o microfone: ' + error.message);
    }
}

function _pararGravacaoAudio(botaoEl, aoTranscrever) {
    const { mediaRecorder, stream } = _audioTranscricaoState;
    if (!mediaRecorder) return;

    _audioTranscricaoState.gravando = false;
    botaoEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    botaoEl.disabled = true;

    mediaRecorder.addEventListener('stop', async function () {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(_audioTranscricaoState.chunks, { type: 'audio/webm' });

        try {
            const formData = new FormData();
            formData.append('audio', blob, 'gravacao.webm');
            const resultado = await apiPostFormData('/api/transcricao/audio', formData);
            if (resultado && resultado.texto) {
                aoTranscrever(resultado.texto);
            } else {
                alert('Não entendi nada no áudio gravado. Tente novamente.');
            }
        } catch (error) {
            alert('Erro ao transcrever áudio: ' + (error.message || 'tente novamente'));
        } finally {
            botaoEl.disabled = false;
            botaoEl.style.background = '';
            botaoEl.style.color = '';
            botaoEl.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    }, { once: true });

    mediaRecorder.stop();
}
