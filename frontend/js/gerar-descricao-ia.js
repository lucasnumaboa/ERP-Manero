/**
 * Geração de Descrição de Produto por IA
 * Utiliza a API do OpenRouter para gerar descrições automáticas de produtos
 * Inclui dados fixos obrigatórios configurados no sistema
 */

// Variável para armazenar os dados fixos da descrição
let dadosFixosDescricao = null;

/**
 * Carrega os dados fixos para descrição das configurações do sistema
 */
async function carregarDadosFixosDescricao() {
    try {
        const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
        const config = configuracoes.find(c => c.chave === 'descricao_produto_dados_fixos');
        dadosFixosDescricao = config?.valor || '- 30 dias de garantia\n- Entrego em Salto SP\n- Somente venda';
        return dadosFixosDescricao;
    } catch (error) {
        console.error('Erro ao carregar dados fixos para descrição:', error);
        dadosFixosDescricao = '- 30 dias de garantia\n- Entrego em Salto SP\n- Somente venda';
        return dadosFixosDescricao;
    }
}

/**
 * Mostra overlay de loading no modal de produtos
 */
function mostrarLoadingModalDescricao() {
    // Verificar se já existe overlay
    let overlay = document.getElementById('overlayGerarDescricaoIA');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlayGerarDescricaoIA';
        overlay.innerHTML = `
            <div class="loading-ia-content">
                <i class="fas fa-robot fa-3x fa-bounce"></i>
                <p>Gerando descrição com IA...</p>
                <small>Aguarde alguns segundos</small>
            </div>
        `;
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 25, 47, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            border-radius: 8px;
        `;

        const loadingContent = overlay.querySelector('.loading-ia-content');
        if (loadingContent) {
            loadingContent.style.cssText = `
                text-align: center;
                color: #64ffda;
            `;
        }

        // Adicionar ao modal
        const modalContent = document.querySelector('#produtoModal .modal-content');
        if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.appendChild(overlay);
        }
    }

    overlay.style.display = 'flex';
}

/**
 * Esconde overlay de loading do modal
 */
function esconderLoadingModalDescricao() {
    const overlay = document.getElementById('overlayGerarDescricaoIA');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Gera uma descrição do produto usando IA
 * Lê o nome do produto e gera uma descrição persuasiva incluindo dados fixos
 */
async function gerarDescricaoIA() {
    const btnGerarIA = document.getElementById('btnGerarDescricaoIA');
    const descricaoField = document.getElementById('descricao');
    const nomeField = document.getElementById('nome');

    // Validar se o nome foi preenchido
    const nomeProduto = nomeField?.value?.trim();
    if (!nomeProduto) {
        alert('Por favor, preencha o nome do produto antes de gerar a descrição.');
        nomeField?.focus();
        return;
    }

    // Estado de loading - botão
    const textoOriginal = btnGerarIA.innerHTML;
    btnGerarIA.disabled = true;
    btnGerarIA.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btnGerarIA.title = 'Gerando descrição...';

    // Mostrar overlay no modal (trava o modal)
    mostrarLoadingModalDescricao();

    try {
        // Carregar configurações de IA (reutiliza do gerar-relatorio-ia.js se disponível)
        if (typeof configuracoesIA === 'undefined' || !configuracoesIA) {
            if (typeof carregarConfiguracoeIA === 'function') {
                await carregarConfiguracoeIA();
            } else {
                // Carregar manualmente se a função não existir
                const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
                window.configuracoesIA = {
                    provider: configuracoes.find(c => c.chave === 'ia_provider')?.valor || 'openrouter',
                    apikey: configuracoes.find(c => c.chave === 'apikey_openrouter')?.valor || '',
                    model: configuracoes.find(c => c.chave === 'model_openrouter')?.valor || 'openai/gpt-oss-20b:free',
                    ollama_model: configuracoes.find(c => c.chave === 'ollama_model')?.valor || 'llama3',
                    ollama_url: configuracoes.find(c => c.chave === 'ollama_url')?.valor || 'http://localhost:11434',
                    ollama_apikey: configuracoes.find(c => c.chave === 'ollama_apikey')?.valor || '',
                    lmstudio_model: configuracoes.find(c => c.chave === 'lmstudio_model')?.valor || 'default',
                    lmstudio_url: configuracoes.find(c => c.chave === 'lmstudio_url')?.valor || 'http://localhost:1234',
                    lmstudio_apikey: configuracoes.find(c => c.chave === 'lmstudio_apikey')?.valor || '',
                    ia_think: configuracoes.find(c => c.chave === 'ia_think')?.valor || 'on',
                    ia_think_tokens: parseInt(configuracoes.find(c => c.chave === 'ia_think_tokens')?.valor || '0', 10)
                };
            }
        }

        const provider = configuracoesIA?.provider || 'openrouter';

        // Verificar configuração do provider
        if (provider === 'openrouter' && !configuracoesIA?.apikey) {
            throw new Error('API Key do OpenRouter não configurada. Verifique as configurações do sistema.');
        }

        // Carregar dados fixos
        await carregarDadosFixosDescricao();

        // Criar prompt para IA - DADOS FIXOS VÃO NO INÍCIO DA DESCRIÇÃO
        const prompt = `Você é um especialista em copywriting para e-commerce e marketplaces. Gere uma descrição de venda atrativa e persuasiva para o seguinte produto:

**Nome do Produto:** ${nomeProduto}

A descrição deve:
1. Ter entre 3-5 linhas
2. Ressaltar pontos positivos e benefícios do produto
3. Usar linguagem persuasiva mas honesta
4. Ser adequada para marketplace (OLX, Facebook Marketplace, Mercado Livre)
5. Não usar emojis excessivos
6. Ser direta e objetiva

IMPORTANTE: No INÍCIO da descrição (nas primeiras linhas), INCLUA OBRIGATORIAMENTE as seguintes informações:

${dadosFixosDescricao}

Depois dessas informações, escreva a descrição do produto.

Responda APENAS com a descrição pronta, sem explicações adicionais, títulos ou formatação markdown.`;

        console.log(`[IA Descrição] Gerando descrição via ${provider} para:`, nomeProduto);

        // Chamar IA usando a função compartilhada se disponível
        let descricaoGerada;
        if (typeof chamarIA === 'function') {
            descricaoGerada = await chamarIA(prompt, 1000, 2);
        } else {
            // Chamada direta com suporte a múltiplos providers
            let response, data;

            const iaThink = configuracoesIA?.ia_think || 'on'; // off|low|medium|high|on
            const iaThinkTokens = parseInt(configuracoesIA?.ia_think_tokens || '0', 10);

            if (provider === 'openrouter') {
                const orPayload = {
                    model: configuracoesIA.model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: false, temperature: 0.7, max_tokens: 2000
                };
                // Reasoning para OpenRouter: effort + optional max_tokens budget
                if (iaThink !== 'on') {
                    // 'off' não é suportado diretamente no OpenRouter, usa budget_tokens=0
                    if (iaThink === 'off') {
                        orPayload.reasoning = { effort: 'low' };
                        orPayload.budget_tokens = 0;
                    } else {
                        const reasoning = { effort: iaThink };
                        if (iaThinkTokens > 0) reasoning.max_tokens = iaThinkTokens;
                        orPayload.reasoning = reasoning;
                    }
                } else if (iaThinkTokens > 0) {
                    orPayload.reasoning = { max_tokens: iaThinkTokens };
                }
                response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${configuracoesIA.apikey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'ERP Maneiro - Descrição Produto'
                    },
                    body: JSON.stringify(orPayload)
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(`Erro OpenRouter: ${err.error?.message || response.statusText}`);
                }
                data = await response.json();
                descricaoGerada = data.choices[0]?.message?.content?.trim();

            } else if (provider === 'ollama') {
                const ollamaUrl = configuracoesIA.ollama_url || 'http://localhost:11434';
                const ollamaHeaders = { 'Content-Type': 'application/json' };
                if (configuracoesIA.ollama_apikey) {
                    ollamaHeaders['Authorization'] = `Bearer ${configuracoesIA.ollama_apikey}`;
                }
                const ollamaBody = {
                    model: configuracoesIA.ollama_model || 'llama3',
                    messages: [{ role: 'user', content: prompt }],
                    stream: false
                };
                // Ollama usa think: false para desabilitar (não suporta níveis)
                if (iaThink === 'off') {
                    ollamaBody.think = false;
                }
                response = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: ollamaHeaders,
                    body: JSON.stringify(ollamaBody)
                });
                if (!response.ok) throw new Error(`Erro Ollama: ${response.statusText}`);
                data = await response.json();
                descricaoGerada = (data.message?.content || '').trim();

            } else if (provider === 'lmstudio') {
                const lmUrl = configuracoesIA.lmstudio_url || 'http://localhost:1234';
                const lmHeaders = { 'Content-Type': 'application/json' };
                if (configuracoesIA.lmstudio_apikey) {
                    lmHeaders['Authorization'] = `Bearer ${configuracoesIA.lmstudio_apikey}`;
                }
                const lmPayload = {
                    model: configuracoesIA.lmstudio_model || 'default',
                    messages: [{ role: 'user', content: prompt }],
                    stream: false, temperature: 0.7, max_tokens: 2000
                };
                // LMStudio suporta reasoning como string: "off"|"low"|"medium"|"high"|"on"
                if (iaThink !== 'on') {
                    lmPayload.reasoning = iaThink;
                }
                // Budget de tokens para raciocínio
                if (iaThinkTokens > 0) {
                    lmPayload.reasoning_budget = iaThinkTokens;
                }
                response = await fetch(`${lmUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: lmHeaders,
                    body: JSON.stringify(lmPayload)
                });
                if (!response.ok) throw new Error(`Erro LM Studio: ${response.statusText}`);
                data = await response.json();
                descricaoGerada = data.choices[0]?.message?.content?.trim();

            } else {
                throw new Error(`Provider de IA desconhecido: ${provider}`);
            }
        }

        if (!descricaoGerada || descricaoGerada.length < 20) {
            throw new Error('A IA retornou uma descrição vazia ou muito curta. Tente novamente.');
        }

        // Se for produto fabricado, adicionar lista de componentes
        const tipoProduto = document.getElementById('tipo_produto')?.value;
        const produtoId = document.getElementById('produtoForm')?.getAttribute('data-id');

        if (tipoProduto === 'fabricado') {
            let componentesNomes = [];

            try {
                // Tenta buscar via API primeiro se tiver ID
                if (produtoId) {
                    console.log('[IA Descrição] Buscando componentes via API...');
                    try {
                        const componentes = await apiGet(`/api/produtos/${produtoId}/consumo`);
                        if (componentes && componentes.length > 0) {
                            componentesNomes = componentes.map(c => c.consumo_produto_nome);
                        }
                    } catch (apiError) {
                        console.warn('[IA Descrição] Erro ao buscar via API, tentando DOM:', apiError);
                    }
                }

                // Se não conseguiu via API (ou array vazio), tenta ler do DOM (tabela visual)
                // Isso cobre o caso de novos produtos onde os componentes estão na tabela mas ainda não salvos/associados com ID persistido corretamente ou delay de API
                if (componentesNomes.length === 0) {
                    console.log('[IA Descrição] Lendo componentes da tabela HTML...');
                    const linhas = document.querySelectorAll('#consumoTableBody tr');
                    linhas.forEach(linha => {
                        // Ignora linha de "Nenhum componente" ou "Carregando"
                        if (linha.cells.length > 1) {
                            // A segunda coluna (índice 1) é o Nome do Componente
                            const nomeComponente = linha.cells[1]?.textContent?.trim();
                            if (nomeComponente && nomeComponente !== '-' && nomeComponente !== 'Carregando...') {
                                componentesNomes.push(nomeComponente);
                            }
                        }
                    });
                }

                // Adiciona à descrição se tiver componentes
                if (componentesNomes.length > 0) {
                    let listaComponentes = '\n\nEspecificações:';
                    componentesNomes.forEach(nome => {
                        listaComponentes += `\n- ${nome}`;
                    });
                    descricaoGerada += listaComponentes;
                }

            } catch (err) {
                console.error('[IA Descrição] Erro ao processar componentes:', err);
            }
        }

        // Preencher o campo de descrição
        descricaoField.value = descricaoGerada;

        // Esconder overlay
        esconderLoadingModalDescricao();

        // Feedback visual de sucesso
        btnGerarIA.innerHTML = '<i class="fas fa-check"></i>';
        btnGerarIA.style.background = '#28a745';

        console.log('[IA Descrição] Descrição gerada com sucesso!');

        // Restaurar botão após 2 segundos
        setTimeout(() => {
            btnGerarIA.innerHTML = textoOriginal;
            btnGerarIA.style.background = '';
            btnGerarIA.disabled = false;
            btnGerarIA.title = 'Gerar descrição por IA';
        }, 2000);

    } catch (error) {
        console.error('[IA Descrição] Erro:', error);

        // Esconder overlay
        esconderLoadingModalDescricao();

        alert('Erro ao gerar descrição: ' + error.message);

        // Restaurar botão
        btnGerarIA.innerHTML = textoOriginal;
        btnGerarIA.disabled = false;
        btnGerarIA.title = 'Gerar descrição por IA';
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function () {
    carregarDadosFixosDescricao();
});

// ============================================
// ATUALIZAÇÃO EM MASSA DE DESCRIÇÕES POR IA
// ============================================

let produtosDescBulk = [];
let produtosDescBulkFiltrados = [];
let resultadosDescBulkGerados = [];

async function abrirAtualizarDescricoes() {
    const modal = document.getElementById('atualizarDescricoesModal');
    if (!modal) return;

    modal.classList.add('active');
    modal.style.display = 'flex';

    const searchInput = document.getElementById('descBulkSearch');
    if (searchInput) searchInput.value = '';

    const tbody = document.getElementById('descBulkTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando produtos...</td></tr>';

    await carregarCategoriasDescBulk();

    try {
        const produtos = await apiGet('/api/produtos');
        produtosDescBulk = produtos || [];
        produtosDescBulkFiltrados = [...produtosDescBulk];
        renderizarTabelaDescBulk(produtosDescBulkFiltrados);
    } catch (error) {
        const tbody2 = document.getElementById('descBulkTableBody');
        if (tbody2) tbody2.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#f5576c;">Erro ao carregar produtos: ${error.message}</td></tr>`;
    }
}

async function carregarCategoriasDescBulk() {
    const select = document.getElementById('descBulkCategoria');
    if (!select) return;

    try {
        const categorias = await apiGet('/api/categorias');
        select.innerHTML = '<option value="">Todas as categorias</option>';
        if (categorias) {
            categorias.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nome;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('[DescBulk] Erro ao carregar categorias:', e);
    }
}

function filtrarProdutosDescBulk() {
    const search = (document.getElementById('descBulkSearch')?.value || '').toLowerCase().trim();
    const catId = document.getElementById('descBulkCategoria')?.value || '';

    produtosDescBulkFiltrados = produtosDescBulk.filter(p => {
        const matchSearch = !search || p.nome.toLowerCase().includes(search) || (p.codigo || '').toLowerCase().includes(search);
        const matchCat = !catId || String(p.categoria_id) === String(catId);
        return matchSearch && matchCat;
    });

    renderizarTabelaDescBulk(produtosDescBulkFiltrados);
}

function renderizarTabelaDescBulk(produtos) {
    const tbody = document.getElementById('descBulkTableBody');
    if (!tbody) return;

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#a8b2d1;">Nenhum produto encontrado</td></tr>';
        atualizarContadorDescBulk();
        return;
    }

    tbody.innerHTML = '';
    produtos.forEach(produto => {
        const temDescricao = produto.descricao && produto.descricao.trim().length > 0;
        const nomeSafe = (produto.nome || '').replace(/"/g, '&quot;');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align:center;" onclick="event.stopPropagation();">
                <input type="checkbox" class="desc-bulk-checkbox"
                    data-produto-id="${produto.id}"
                    data-produto-nome="${nomeSafe}"
                    style="cursor:pointer;width:16px;height:16px;" checked>
            </td>
            <td>${produto.codigo || produto.id}</td>
            <td>${produto.nome}</td>
            <td>${produto.categoria_nome || '-'}</td>
            <td style="text-align:center;">
                <span style="color:${temDescricao ? '#38ef7d' : '#f5576c'};">
                    <i class="fas fa-${temDescricao ? 'check' : 'times'}"></i>
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('.desc-bulk-checkbox').forEach(cb => {
        cb.addEventListener('change', atualizarContadorDescBulk);
    });

    const selecionarTodos = document.getElementById('selecionarTodosDesc');
    if (selecionarTodos) { selecionarTodos.checked = true; selecionarTodos.indeterminate = false; }

    atualizarContadorDescBulk();
}

function selecionarTodosDescBulk(val) {
    document.querySelectorAll('#descBulkTableBody .desc-bulk-checkbox').forEach(cb => { cb.checked = val; });
    const selecionarTodos = document.getElementById('selecionarTodosDesc');
    if (selecionarTodos) { selecionarTodos.checked = val; selecionarTodos.indeterminate = false; }
    atualizarContadorDescBulk();
}

function atualizarContadorDescBulk() {
    const total = document.querySelectorAll('#descBulkTableBody .desc-bulk-checkbox').length;
    const selecionados = document.querySelectorAll('#descBulkTableBody .desc-bulk-checkbox:checked').length;
    const el = document.getElementById('descBulkCount');
    if (el) el.textContent = `${selecionados} de ${total} produto(s) selecionado(s)`;
    const selecionarTodos = document.getElementById('selecionarTodosDesc');
    if (selecionarTodos) {
        selecionarTodos.checked = selecionados === total && total > 0;
        selecionarTodos.indeterminate = selecionados > 0 && selecionados < total;
    }
}

async function iniciarGeracaoDescricoes() {
    const checkboxes = document.querySelectorAll('#descBulkTableBody .desc-bulk-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('Selecione ao menos um produto para gerar descrição.');
        return;
    }

    const produtosSelecionados = [];
    checkboxes.forEach(cb => {
        produtosSelecionados.push({
            id: parseInt(cb.getAttribute('data-produto-id')),
            nome: cb.getAttribute('data-produto-nome')
        });
    });

    const selModal = document.getElementById('atualizarDescricoesModal');
    if (selModal) { selModal.classList.remove('active'); selModal.style.display = 'none'; }

    const resModal = document.getElementById('resultadoDescricoesModal');
    if (resModal) { resModal.classList.add('active'); resModal.style.display = 'flex'; }

    document.getElementById('descResultadoLoading').style.display = 'block';
    document.getElementById('descResultadoContent').style.display = 'none';
    document.getElementById('descResultadoFooter').style.display = 'none';
    document.getElementById('descResultadoLista').innerHTML = '';

    resultadosDescBulkGerados = [];

    try {
        if (typeof configuracoesIA === 'undefined' || !configuracoesIA) {
            if (typeof carregarConfiguracoeIA === 'function') {
                await carregarConfiguracoeIA();
            } else {
                const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
                window.configuracoesIA = {
                    provider: configuracoes.find(c => c.chave === 'ia_provider')?.valor || 'openrouter',
                    apikey: configuracoes.find(c => c.chave === 'apikey_openrouter')?.valor || '',
                    model: configuracoes.find(c => c.chave === 'model_openrouter')?.valor || 'openai/gpt-4o-mini',
                    ollama_model: configuracoes.find(c => c.chave === 'ollama_model')?.valor || 'llama3',
                    ollama_url: configuracoes.find(c => c.chave === 'ollama_url')?.valor || 'http://localhost:11434',
                    ollama_apikey: configuracoes.find(c => c.chave === 'ollama_apikey')?.valor || '',
                    lmstudio_model: configuracoes.find(c => c.chave === 'lmstudio_model')?.valor || 'default',
                    lmstudio_url: configuracoes.find(c => c.chave === 'lmstudio_url')?.valor || 'http://localhost:1234',
                    lmstudio_apikey: configuracoes.find(c => c.chave === 'lmstudio_apikey')?.valor || '',
                    ia_think: configuracoes.find(c => c.chave === 'ia_think')?.valor || 'on',
                    ia_think_tokens: parseInt(configuracoes.find(c => c.chave === 'ia_think_tokens')?.valor || '0', 10)
                };
            }
        }

        if (!dadosFixosDescricao) await carregarDadosFixosDescricao();

        const totalLotes = Math.ceil(produtosSelecionados.length / 10);

        for (let loteIdx = 0; loteIdx < totalLotes; loteIdx++) {
            const lote = produtosSelecionados.slice(loteIdx * 10, (loteIdx + 1) * 10);
            const progresso = document.getElementById('descResultadoProgresso');
            if (progresso) progresso.textContent = `Processando lote ${loteIdx + 1} de ${totalLotes} (${lote.length} produto(s))...`;

            try {
                const resultados = await gerarDescricoesBulkBatch(lote);
                resultadosDescBulkGerados.push(...resultados);
            } catch (batchError) {
                console.error(`[DescBulk] Erro no lote ${loteIdx + 1}:`, batchError);
                lote.forEach(p => resultadosDescBulkGerados.push({ produto_id: p.id, produto_nome: p.nome, descricao_nova: '', erro: batchError.message }));
            }
        }

        document.getElementById('descResultadoLoading').style.display = 'none';
        document.getElementById('descResultadoContent').style.display = 'block';
        document.getElementById('descResultadoFooter').style.display = 'flex';
        renderizarResultadosDescBulk(resultadosDescBulkGerados);

    } catch (error) {
        console.error('[DescBulk] Erro geral:', error);
        document.getElementById('descResultadoLoading').style.display = 'none';
        document.getElementById('descResultadoContent').style.display = 'block';
        document.getElementById('descResultadoLista').innerHTML = `<p style="color:#f5576c;text-align:center;padding:30px;">Erro: ${error.message}</p>`;
        document.getElementById('descResultadoFooter').style.display = 'flex';
    }
}

async function gerarDescricoesBulkBatch(lote) {
    const produtosJson = {};
    lote.forEach(p => { produtosJson[`produto_${p.id}`] = p.nome; });

    const dadosFixos = dadosFixosDescricao || '';

    const prompt = `Você é um especialista em copywriting para e-commerce e marketplaces. Gere descrições de venda atrativas para os produtos abaixo.

Cada descrição deve:
- Ter entre 3-5 linhas
- Ressaltar pontos positivos e benefícios do produto
- Ser adequada para marketplace (OLX, Facebook Marketplace, Mercado Livre)
- Não usar emojis excessivos
${dadosFixos ? `\nINCLUA no INÍCIO de cada descrição:\n${dadosFixos}\n` : ''}
Produtos:
${JSON.stringify(produtosJson, null, 2)}

Retorne APENAS um JSON válido no formato abaixo, sem texto adicional:
{
  "produto_ID": "descrição completa aqui",
  ...
}`;

    let resposta;

    if (typeof chamarIA === 'function') {
        resposta = await chamarIA(prompt, 4000, 2);
    } else {
        const provider = configuracoesIA?.provider || 'openrouter';
        let response, data;

        if (provider === 'openrouter') {
            response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${configuracoesIA.apikey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'ERP Maneiro - Descrições em Massa'
                },
                body: JSON.stringify({ model: configuracoesIA.model, messages: [{ role: 'user', content: prompt }], stream: false, temperature: 0.7, max_tokens: 4000 })
            });
            if (!response.ok) { const err = await response.json(); throw new Error(`Erro OpenRouter: ${err.error?.message || response.statusText}`); }
            data = await response.json();
            resposta = data.choices[0]?.message?.content?.trim();

        } else if (provider === 'ollama') {
            const ollamaUrl = configuracoesIA.ollama_url || 'http://localhost:11434';
            const ollamaHeaders = { 'Content-Type': 'application/json' };
            if (configuracoesIA.ollama_apikey) ollamaHeaders['Authorization'] = `Bearer ${configuracoesIA.ollama_apikey}`;
            response = await fetch(`${ollamaUrl}/api/chat`, {
                method: 'POST', headers: ollamaHeaders,
                body: JSON.stringify({ model: configuracoesIA.ollama_model || 'llama3', messages: [{ role: 'user', content: prompt }], stream: false })
            });
            if (!response.ok) throw new Error(`Erro Ollama: ${response.statusText}`);
            data = await response.json();
            resposta = (data.message?.content || '').trim();

        } else if (provider === 'lmstudio') {
            const lmUrl = configuracoesIA.lmstudio_url || 'http://localhost:1234';
            const lmHeaders = { 'Content-Type': 'application/json' };
            if (configuracoesIA.lmstudio_apikey) lmHeaders['Authorization'] = `Bearer ${configuracoesIA.lmstudio_apikey}`;
            response = await fetch(`${lmUrl}/v1/chat/completions`, {
                method: 'POST', headers: lmHeaders,
                body: JSON.stringify({ model: configuracoesIA.lmstudio_model || 'default', messages: [{ role: 'user', content: prompt }], stream: false, temperature: 0.7, max_tokens: 4000 })
            });
            if (!response.ok) throw new Error(`Erro LM Studio: ${response.statusText}`);
            data = await response.json();
            resposta = data.choices[0]?.message?.content?.trim();

        } else {
            throw new Error(`Provider de IA desconhecido: ${provider}`);
        }
    }

    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta da IA não contém JSON válido');

    let descricoes;
    try { descricoes = JSON.parse(jsonMatch[0]); }
    catch (e) { throw new Error('Erro ao interpretar JSON da IA: ' + e.message); }

    return lote.map(p => ({
        produto_id: p.id,
        produto_nome: p.nome,
        descricao_nova: descricoes[`produto_${p.id}`] || ''
    }));
}

function renderizarResultadosDescBulk(resultados) {
    const lista = document.getElementById('descResultadoLista');
    if (!lista) return;

    lista.innerHTML = '';
    resultados.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'border:1px solid rgba(100,255,218,0.15);border-radius:8px;padding:15px;background:rgba(17,34,64,0.5);';
        div.innerHTML = `
            <div style="margin-bottom:8px;font-weight:600;color:#ccd6f6;">${item.produto_nome}</div>
            ${item.erro ? `<p style="color:#f5576c;font-size:13px;margin-bottom:6px;">Erro: ${item.erro}</p>` : ''}
            <textarea data-produto-id="${item.produto_id}" class="desc-bulk-resultado" rows="4"
                style="width:100%;box-sizing:border-box;background:rgba(10,25,47,0.8);color:#a8b2d1;border:1px solid rgba(100,255,218,0.2);border-radius:6px;padding:8px;font-size:13px;resize:vertical;"
            >${item.descricao_nova || ''}</textarea>
        `;
        lista.appendChild(div);
    });
}

async function aplicarDescricoesBulk() {
    const textareas = document.querySelectorAll('#descResultadoLista .desc-bulk-resultado');
    if (textareas.length === 0) { alert('Nenhuma descrição para aplicar.'); return; }

    const btnAplicar = document.getElementById('btnAplicarDescBulk');
    if (btnAplicar) { btnAplicar.disabled = true; btnAplicar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...'; }

    const total = textareas.length;
    let sucesso = 0, erros = 0, atual = 0;

    if (typeof mostrarLoadingProduto === 'function') {
        mostrarLoadingProduto('Aplicando descrições...', `0 de ${total} produto(s)`);
    }

    try {
        for (const ta of textareas) {
            const produtoId = parseInt(ta.getAttribute('data-produto-id'));
            const descricao = ta.value.trim();
            if (!descricao) { atual++; continue; }

            const progressText = document.getElementById('loadingProgressTextProdutos');
            if (progressText) progressText.textContent = `${atual + 1} de ${total} produto(s)...`;

            try {
                const produto = produtosDescBulk.find(p => p.id === produtoId);
                if (produto) {
                    await apiPut(`/api/produtos/${produtoId}`, { ...produto, descricao });
                } else {
                    const produtoFetched = await apiGet(`/api/produtos/${produtoId}`);
                    await apiPut(`/api/produtos/${produtoId}`, { ...produtoFetched, descricao });
                }
                sucesso++;
            } catch (error) {
                console.error(`[DescBulk] Erro ao atualizar produto ${produtoId}:`, error);
                erros++;
            }
            atual++;
        }
    } finally {
        if (typeof esconderLoadingProduto === 'function') esconderLoadingProduto();
        if (btnAplicar) { btnAplicar.disabled = false; btnAplicar.innerHTML = '<i class="fas fa-check"></i> OK - Aplicar Todas as Descrições'; }
    }

    alert(`Descrições aplicadas: ${sucesso} com sucesso${erros > 0 ? `, ${erros} com erro` : ''}.`);

    const modal = document.getElementById('resultadoDescricoesModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }

    if (typeof loadProdutos === 'function') loadProdutos();
}

// Event listeners para os modais de atualização em massa
document.addEventListener('DOMContentLoaded', function () {
    // Modal seleção de produtos
    const btnCancelarDesc = document.getElementById('btnCancelarDescBulk');
    if (btnCancelarDesc) {
        btnCancelarDesc.addEventListener('click', function () {
            const modal = document.getElementById('atualizarDescricoesModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    }

    document.querySelectorAll('#atualizarDescricoesModal .close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = document.getElementById('atualizarDescricoesModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    });

    const selecionarTodosDesc = document.getElementById('selecionarTodosDesc');
    if (selecionarTodosDesc) {
        selecionarTodosDesc.addEventListener('change', function () {
            selecionarTodosDescBulk(this.checked);
        });
    }

    const btnGerarDesc = document.getElementById('btnGerarDescBulk');
    if (btnGerarDesc) {
        btnGerarDesc.addEventListener('click', iniciarGeracaoDescricoes);
    }

    // Modal resultados
    const btnCancelarResultado = document.getElementById('btnCancelarResultadoDesc');
    if (btnCancelarResultado) {
        btnCancelarResultado.addEventListener('click', function () {
            const modal = document.getElementById('resultadoDescricoesModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    }

    document.querySelectorAll('#resultadoDescricoesModal .close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = document.getElementById('resultadoDescricoesModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    });

    const btnAplicarDesc = document.getElementById('btnAplicarDescBulk');
    if (btnAplicarDesc) {
        btnAplicarDesc.addEventListener('click', aplicarDescricoesBulk);
    }
});
