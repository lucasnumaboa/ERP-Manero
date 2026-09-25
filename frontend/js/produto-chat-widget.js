// Widget flutuante do assistente de produtos (IA), em todas as páginas (exceto login).
// Já abre pronto para perguntar, por texto ou áudio ("tem placa rx580 disponível?"): o servidor dá à IA
// ferramentas para consultar produtos, estoque e preço no banco (backend/ferramentas_ia.py). Os produtos
// que ela encontrar aparecem como atalhos; escolher um foca a conversa nele (opcional).

(function () {
    let produtosCache = null;
    let produtoSelecionado = null;   // {id, codigo, nome} ou null = conversa geral
    let historicoCarregado = false;
    let enviando = false;

    // Este script é injetado dinamicamente (por sidebar-template.js) depois que o
    // DOMContentLoaded da página já disparou, então não dá pra esperar esse evento
    // aqui — a essa altura o DOM já está pronto, então só inicializa direto.
    // No app do Assistente (assistente/index.html) o chat ocupa a tela toda e só começa depois do login,
    // que a própria página faz e então chama window.assistenteProdutos.iniciar().
    const MODO_APP = document.body.dataset.assistente === 'app';
    window.assistenteProdutos = { iniciar };
    iniciar();

    function iniciar() {
        if (!isAuthenticated() || document.getElementById('pcwPainel')) return;
        if (!MODO_APP) criarBotaoFlutuante();
        criarPainel();
        if (MODO_APP) abrirPainel();
    }

    function criarBotaoFlutuante() {
        if (document.getElementById('pcwBotao')) return;

        const botao = document.createElement('button');
        botao.id = 'pcwBotao';
        botao.title = 'Assistente de produtos (IA)';
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
            'width: 400px', 'max-width: calc(100vw - 32px)', 'height: 600px',
            'max-height: calc(100vh - 140px)', 'background: #1b2333', 'color: #e6e9f0',
            'border-radius: 20px', 'box-shadow: 0 16px 50px rgba(0,0,0,0.5)',
            'display: none', 'flex-direction: column', 'overflow: hidden',
            'font-family: inherit', 'border: 1px solid rgba(255,255,255,0.08)'
        ].join(';');
        if (MODO_APP) {
            painel.style.cssText += ';inset: 0; width: 100%; max-width: 100%; height: 100dvh; max-height: none; border-radius: 0; border: none; box-shadow: none;';
        }

        const botoesCabecalho = MODO_APP
            ? `<button id="pcwSair" title="Sair" style="background:none;border:none;color:#8892b0;font-size:15px;cursor:pointer;padding:4px 6px;">
                   <i class="fas fa-sign-out-alt"></i>
               </button>`
            : `<button id="pcwBaixarApp" title="Baixar o app do Assistente (fica na tela do celular, como um WhatsApp)" style="background:none;border:none;color:#8892b0;font-size:15px;cursor:pointer;padding:4px 6px;">
                   <i class="fas fa-mobile-alt"></i>
               </button>
               <button id="pcwFechar" title="Fechar" style="background:none;border:none;color:#e6e9f0;font-size:16px;cursor:pointer;padding:4px 6px;">
                   <i class="fas fa-times"></i>
               </button>`;

        painel.innerHTML = `
            <style>
                #pcwPainel .pcw-atalho { display:flex; justify-content:space-between; gap:8px; width:100%; text-align:left;
                    background:#111826; color:#e6e9f0; border:1px solid rgba(255,255,255,0.12); border-radius:10px;
                    padding:6px 9px; font-size:12px; cursor:pointer; }
                #pcwPainel .pcw-atalho:hover { border-color:#3f8efc; }
                #pcwPainel .pcw-atalho small { color:#8892b0; white-space:nowrap; }
                #pcwPainel .pcw-atalho .pcw-tem { color:#2ecc71; }
                #pcwPainel .pcw-bolha ul { margin:4px 0; padding-left:18px; }
                #pcwPainel .pcw-bolha p { margin:0 0 6px; }
                #pcwPainel .pcw-bolha p:last-child { margin-bottom:0; }
            </style>
            <div style="padding: 12px 14px; background: #232d42; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <strong style="font-size: 14px;"><i class="fas fa-robot"></i> ${MODO_APP ? 'Assistente Maneiro' : 'Assistente de produtos'}</strong>
                <span style="display:flex; gap:4px;">
                    <button id="pcwLimpar" title="Apagar esta conversa" style="background:none;border:none;color:#8892b0;font-size:14px;cursor:pointer;padding:4px 6px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    ${botoesCabecalho}
                </span>
            </div>
            <div style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <div id="pcwProdutoAtual" style="font-size:12px; color:#8892b0; display:flex; align-items:center; justify-content:space-between; gap:8px;"></div>
                <input type="text" id="pcwBusca" placeholder="Focar em um produto (opcional): nome ou código..."
                    style="width:100%; margin-top:6px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:#111826; color:#e6e9f0; font-size:13px; box-sizing:border-box;">
                <label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; color:#c3c9d6; cursor:pointer;">
                    <input type="checkbox" id="pcwSomenteComEstoque" style="cursor:pointer;">
                    Somente produto com estoque
                </label>
                <div id="pcwResultados" style="max-height:120px; overflow-y:auto; margin-top:6px;"></div>
            </div>
            <div id="pcwMensagens" style="flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:8px;"></div>
            <div style="padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); display:flex; gap:8px;">
                <input type="text" id="pcwInput" placeholder="Pergunte ou grave: tem placa rx580?"
                    style="flex:1; min-width:0; padding:9px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:#111826; color:#e6e9f0; font-size:13px; box-sizing:border-box;">
                <button id="pcwMicrofone" title="Gravar pergunta por áudio (envia sozinho ao parar)"
                    style="background:#2a3448; color:#e6e9f0; border:none; border-radius:10px; width:40px; cursor:pointer;">
                    <i class="fas fa-microphone"></i>
                </button>
                <button id="pcwEnviar" title="Enviar"
                    style="background:#3f8efc; color:#fff; border:none; border-radius:10px; width:40px; cursor:pointer;">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;
        document.body.appendChild(painel);

        if (MODO_APP) {
            document.getElementById('pcwSair').addEventListener('click', () => logout());
        } else {
            document.getElementById('pcwFechar').addEventListener('click', togglePainel);
            // o app fica em assistente/ (as telas do ERP estão todas na raiz do frontend)
            document.getElementById('pcwBaixarApp').addEventListener('click', () => window.open(new URL('assistente/', location.href).href, '_blank'));
        }
        document.getElementById('pcwLimpar').addEventListener('click', limparConversa);
        document.getElementById('pcwBusca').addEventListener('input', onBuscaProduto);
        document.getElementById('pcwSomenteComEstoque').addEventListener('change', onBuscaProduto);
        document.getElementById('pcwMicrofone').addEventListener('click', function () {
            const input = document.getElementById('pcwInput');
            const estavaVazio = !input.value.trim();
            alternarGravacaoAudio(this, function (texto) {
                input.value = (input.value ? input.value + ' ' : '') + texto;
                // pergunta feita só por áudio: já envia; se havia texto digitado, deixa para a pessoa revisar
                if (estavaVazio) enviarPergunta(); else input.focus();
            });
        });
        document.getElementById('pcwEnviar').addEventListener('click', enviarPergunta);
        document.getElementById('pcwInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') enviarPergunta();
        });
        atualizarCabecalho();
    }

    function togglePainel() {
        const painel = document.getElementById('pcwPainel');
        if (painel.style.display === 'flex') painel.style.display = 'none';
        else abrirPainel();
    }

    function abrirPainel() {
        document.getElementById('pcwPainel').style.display = 'flex';
        if (!historicoCarregado) carregarHistorico();
        if (!MODO_APP) document.getElementById('pcwInput').focus();   // no celular, não abre o teclado sozinho
    }

    function urlConversa() {
        return produtoSelecionado ? `/api/produto-chat/${produtoSelecionado.id}` : '/api/produto-chat/geral';
    }

    function atualizarCabecalho() {
        const el = document.getElementById('pcwProdutoAtual');
        if (!produtoSelecionado) {
            el.innerHTML = '<span><i class="fas fa-comments"></i> Conversa geral: a IA consulta produtos, estoque e preços</span>';
            return;
        }
        el.innerHTML = `
            <span style="color:#e6e9f0;"><i class="fas fa-box"></i> ${escapeHtml(produtoSelecionado.codigo || '')} — ${escapeHtml(produtoSelecionado.nome || '')}</span>
            <button id="pcwVoltarGeral" style="background:none; border:1px solid rgba(255,255,255,0.2); color:#c3c9d6; border-radius:8px; font-size:11px; padding:3px 8px; cursor:pointer; white-space:nowrap;">
                Conversa geral
            </button>`;
        document.getElementById('pcwVoltarGeral').addEventListener('click', () => {
            produtoSelecionado = null;
            atualizarCabecalho();
            carregarHistorico();
        });
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
                <strong>${escapeHtml(p.codigo || '-')}</strong> — ${escapeHtml(p.nome)}
            </div>
        `).join('');

        container.querySelectorAll('.pcw-resultado-item').forEach(el => {
            el.addEventListener('click', () => {
                const produto = produtosCache.find(p => p.id === parseInt(el.dataset.id, 10));
                if (produto) selecionarProduto(produto);
            });
        });
    }

    async function selecionarProduto(produto) {
        produtoSelecionado = { id: produto.id, codigo: produto.codigo, nome: produto.nome };
        document.getElementById('pcwBusca').value = '';
        document.getElementById('pcwResultados').innerHTML = '';
        atualizarCabecalho();
        await carregarHistorico();
        document.getElementById('pcwInput').focus();
    }

    function mensagemInicial() {
        return produtoSelecionado
            ? 'Pergunte algo sobre este produto (ou sobre outro: a IA também consulta o estoque).'
            : 'Pergunte por texto ou áudio, por exemplo: "tem placa rx580 disponível?", "quanto custa o SSD 240?", "o que tem em estoque de placa-mãe?"';
    }

    async function carregarHistorico() {
        historicoCarregado = true;
        const container = document.getElementById('pcwMensagens');
        container.innerHTML = '<div style="color:#8892b0; font-size:12px; text-align:center;">Carregando conversa...</div>';

        try {
            const mensagens = await apiGet(`${urlConversa()}/mensagens`) || [];
            container.innerHTML = '';
            if (mensagens.length === 0) {
                container.innerHTML = `<div style="color:#8892b0; font-size:13px; text-align:center; margin-top: 20px; padding: 0 10px;">${escapeHtml(mensagemInicial())}</div>`;
                return;
            }
            mensagens.forEach(m => adicionarBolha(m.role, m.conteudo));
        } catch (error) {
            historicoCarregado = false;
            container.innerHTML = '<div style="color:#e74c3c; font-size:12px;">Erro ao carregar histórico</div>';
        }
    }

    async function limparConversa() {
        const confirmar = typeof confirmarAcao === 'function'
            ? await confirmarAcao('Apagar esta conversa com o assistente?')
            : window.confirm('Apagar esta conversa com o assistente?');
        if (!confirmar) return;
        try {
            await apiDelete(`${urlConversa()}/mensagens`);
        } catch (error) { /* se falhar, o recarregamento abaixo mostra o que ficou */ }
        await carregarHistorico();
    }

    // Markdown simples que a IA usa (negrito, itálico, listas), sempre sobre texto já escapado
    function formatarResposta(texto) {
        const linhas = escapeHtml(texto).split('\n');
        let html = '', lista = false;
        const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
        for (const linha of linhas) {
            const item = linha.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
            if (item) {
                if (!lista) { html += '<ul>'; lista = true; }
                html += `<li>${inline(item[1])}</li>`;
                continue;
            }
            if (lista) { html += '</ul>'; lista = false; }
            if (linha.trim()) html += `<p>${inline(linha.replace(/^#{1,6}\s+/, ''))}</p>`;
        }
        return html + (lista ? '</ul>' : '');
    }

    function adicionarBolha(role, texto) {
        const container = document.getElementById('pcwMensagens');
        const bolha = document.createElement('div');
        const isUser = role === 'user';
        bolha.className = 'pcw-bolha';
        bolha.style.cssText = [
            'max-width: 88%', 'padding: 9px 12px', 'border-radius: 14px', 'font-size: 13px',
            'word-wrap: break-word', 'line-height: 1.45',
            isUser ? 'white-space: pre-wrap' : 'white-space: normal',
            isUser ? 'align-self: flex-end' : 'align-self: flex-start',
            isUser ? 'background: #3f8efc' : 'background: #2a3448',
            isUser ? 'color: #fff' : 'color: #e6e9f0'
        ].join(';');
        if (isUser) bolha.textContent = texto;
        else bolha.innerHTML = formatarResposta(texto);
        container.appendChild(bolha);
        container.scrollTop = container.scrollHeight;
        return bolha;
    }

    // Produtos que a IA consultou: atalhos para focar a conversa em um deles
    function adicionarAtalhos(produtos) {
        if (!produtos || !produtos.length) return;
        const container = document.getElementById('pcwMensagens');
        const bloco = document.createElement('div');
        bloco.style.cssText = 'align-self: stretch; display:flex; flex-direction:column; gap:4px;';
        bloco.innerHTML = '<div style="font-size:11px; color:#8892b0;">Toque num produto para perguntar só sobre ele:</div>' +
            produtos.map((p, i) => {
                const estoque = Number(p.estoque_atual) || 0;
                const preco = p.preco_venda != null ? `R$ ${Number(p.preco_venda).toFixed(2).replace('.', ',')}` : '';
                return `<button type="button" class="pcw-atalho" data-i="${i}">
                    <span>${escapeHtml(p.codigo || '')} — ${escapeHtml(p.nome || '')}</span>
                    <small class="${estoque > 0 ? 'pcw-tem' : ''}">${estoque > 0 ? `${estoque} em estoque` : 'sem estoque'} ${preco ? '· ' + preco : ''}</small>
                </button>`;
            }).join('');
        bloco.querySelectorAll('.pcw-atalho').forEach(btn => {
            btn.addEventListener('click', () => selecionarProduto(produtos[parseInt(btn.dataset.i, 10)]));
        });
        container.appendChild(bloco);
        container.scrollTop = container.scrollHeight;
    }

    async function enviarPergunta() {
        if (enviando) return;
        const input = document.getElementById('pcwInput');
        const pergunta = input.value.trim();
        if (!pergunta) return;

        enviando = true;
        input.value = '';
        input.disabled = true;
        const btnEnviar = document.getElementById('pcwEnviar');
        btnEnviar.disabled = true;

        const container = document.getElementById('pcwMensagens');
        // tira a dica inicial ("Pergunte por texto ou áudio...") na primeira pergunta
        if (container.children.length === 1 && !container.firstElementChild.classList.contains('pcw-bolha')) container.innerHTML = '';
        adicionarBolha('user', pergunta);

        const carregando = document.createElement('div');
        carregando.id = 'pcwCarregando';
        carregando.style.cssText = 'align-self: flex-start; color:#8892b0; font-size:12px;';
        carregando.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando o estoque...';
        container.appendChild(carregando);
        container.scrollTop = container.scrollHeight;

        try {
            const resposta = await apiPost(`${urlConversa()}/enviar`, { conteudo: pergunta });
            document.getElementById('pcwCarregando')?.remove();
            adicionarBolha('assistant', resposta.conteudo);
            // na conversa de um produto não repete o próprio produto como atalho
            adicionarAtalhos((resposta.produtos || []).filter(p => !produtoSelecionado || p.id !== produtoSelecionado.id));
        } catch (error) {
            document.getElementById('pcwCarregando')?.remove();
            const detalhe = String(error.message || '').replace(/^Falha na requisição POST para [^:]+: /, '');
            adicionarBolha('assistant', `Não consegui responder agora. ${detalhe || 'Tente novamente em instantes.'}`);
        } finally {
            enviando = false;
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
