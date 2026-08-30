/**
 * Cadastro em Massa de Produtos
 * Permite selecionar imagens com nome no formato "N-Nome do Produto"
 * agrupa por nome, exibe lista editável e salva todos no banco com barra de progresso.
 */

// Armazena os produtos agrupados a partir das imagens
let produtosMassa = [];
// Categorias carregadas para o select
let categoriasMassa = [];

// =============================================
// ABERTURA / FECHAMENTO DO MODAL
// =============================================

function abrirCadastroMassa() {
    const modal = document.getElementById('cadastroMassaModal');
    if (!modal) return;

    // Reset estado
    produtosMassa = [];
    document.getElementById('cadastroMassaEtapa1').style.display = 'block';
    document.getElementById('cadastroMassaEtapa2').style.display = 'none';
    document.getElementById('cadastroMassaFooter').style.display = 'none';
    document.getElementById('cadastroMassaProgressContainer').style.display = 'none';
    document.getElementById('listaProdutosMassa').innerHTML = '';
    document.getElementById('cadastroMassaCount').textContent = '0 produto(s) detectado(s)';

    const inputImagens = document.getElementById('inputImagensMassa');
    if (inputImagens) inputImagens.value = '';

    // Reset compra
    const chkCompra = document.getElementById('massaCriarCompra');
    if (chkCompra) chkCompra.checked = false;
    const opcoesCompra = document.getElementById('massaCompraOpcoes');
    if (opcoesCompra) opcoesCompra.style.display = 'none';

    // Carregar categorias e fornecedores
    carregarCategoriasMassa();
    carregarFornecedoresMassa();

    // Abrir modal
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function fecharCadastroMassa() {
    const modal = document.getElementById('cadastroMassaModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function carregarCategoriasMassa() {
    try {
        const categorias = await apiGet('/api/categorias');
        categoriasMassa = categorias || [];

        // Preencher select global
        const selectGlobal = document.getElementById('massaCategoria');
        if (selectGlobal) {
            selectGlobal.innerHTML = '<option value="">Selecione...</option>';
            categoriasMassa.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nome;
                selectGlobal.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('[CadastroMassa] Erro ao carregar categorias:', e);
    }
}

async function carregarFornecedoresMassa() {
    try {
        const fornecedores = await apiGet('/api/parceiros', { tipo: 'fornecedor,ambos' });
        const select = document.getElementById('massaFornecedor');
        if (select) {
            select.innerHTML = '<option value="">Selecione o fornecedor...</option>';
            (fornecedores || []).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('[CadastroMassa] Erro ao carregar fornecedores:', e);
    }
}

// =============================================
// PROCESSAMENTO DE IMAGENS
// =============================================

function processarImagensMassa(files) {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);

    // Agrupar por nome do produto (parte após o primeiro "-")
    const grupos = {};

    filesArray.forEach(file => {
        // Remove extensão do nome do arquivo
        const nomeArquivo = file.name.replace(/\.[^/.]+$/, '');

        // Encontra o primeiro "-" e pega o nome depois dele
        const dashIndex = nomeArquivo.indexOf('-');
        let nomeProduto;

        if (dashIndex !== -1) {
            nomeProduto = nomeArquivo.substring(dashIndex + 1).trim();
        } else {
            // Se não tiver "-", usa o nome completo
            nomeProduto = nomeArquivo.trim();
        }

        if (!nomeProduto) return;

        // Normaliza a chave (lowercase para agrupar corretamente)
        const chave = nomeProduto.toLowerCase();

        if (!grupos[chave]) {
            grupos[chave] = {
                nome: nomeProduto,
                imagens: []
            };
        }

        // Limita a 3 imagens por produto
        if (grupos[chave].imagens.length < 3) {
            grupos[chave].imagens.push(file);
        }
    });

    // Converter para array
    produtosMassa = Object.values(grupos).map((grupo, index) => ({
        id: index,
        nome: grupo.nome,
        descricao: '',
        categoria_id: '',
        tipo_produto: 'comprado',
        preco_custo: '',
        preco_venda: '',
        comissao: '',
        estoque_minimo: 1,
        faturavel: true,
        ativo: true,
        post_facebook: false,
        post_olx: false,
        imagens: grupo.imagens,
        thumbUrl: null // será preenchido ao renderizar
    }));

    if (produtosMassa.length === 0) {
        alert('Nenhum produto detectado nas imagens selecionadas. Verifique o formato do nome dos arquivos (ex: 1-Nome do Produto).');
        return;
    }

    // Mostrar etapa 2
    document.getElementById('cadastroMassaEtapa1').style.display = 'none';
    document.getElementById('cadastroMassaEtapa2').style.display = 'block';
    document.getElementById('cadastroMassaFooter').style.display = 'flex';

    document.getElementById('cadastroMassaCount').textContent = `${produtosMassa.length} produto(s) detectado(s)`;

    renderizarListaProdutosMassa();
}

// =============================================
// RENDERIZAÇÃO DA LISTA DE PRODUTOS
// =============================================

function renderizarListaProdutosMassa() {
    const container = document.getElementById('listaProdutosMassa');
    if (!container) return;
    container.innerHTML = '';

    // Gerar opções de categorias HTML
    let categoriasOptions = '<option value="">Selecione...</option>';
    categoriasMassa.forEach(cat => {
        categoriasOptions += `<option value="${cat.id}">${cat.nome}</option>`;
    });

    produtosMassa.forEach((produto, idx) => {
        const card = document.createElement('div');
        card.className = 'massa-produto-card';
        card.setAttribute('data-massa-idx', idx);

        // Criar thumbnail da primeira imagem
        const thumbImg = document.createElement('img');
        thumbImg.className = 'massa-produto-thumb';
        thumbImg.alt = produto.nome;

        if (produto.imagens.length > 0) {
            const reader = new FileReader();
            reader.onload = function (e) {
                thumbImg.src = e.target.result;
            };
            reader.readAsDataURL(produto.imagens[0]);
        }

        // Campos editáveis
        const fields = document.createElement('div');
        fields.className = 'massa-produto-fields';

        const nomeSafe = (produto.nome || '').replace(/"/g, '&quot;');
        const descSafe = (produto.descricao || '').replace(/"/g, '&quot;');

        fields.innerHTML = `
            <div class="field-row">
                <input type="text" value="${nomeSafe}" placeholder="Nome do produto" style="flex: 1; font-size: 13px; font-weight: 600;"
                    onchange="produtosMassa[${idx}].nome = this.value">
                <span class="massa-img-count"><i class="fas fa-image"></i> ${produto.imagens.length} imagem(ns)</span>
            </div>
            <div class="field-row">
                <textarea rows="2" placeholder="Descrição do produto..." style="flex: 1;"
                    onchange="produtosMassa[${idx}].descricao = this.value" class="massa-desc-field" data-massa-idx="${idx}">${descSafe}</textarea>
            </div>
            <div class="field-row">
                <select style="flex: 1;" onchange="produtosMassa[${idx}].categoria_id = this.value" class="massa-cat-select" data-massa-idx="${idx}">
                    ${categoriasOptions}
                </select>
                <select style="width: 120px;" onchange="produtosMassa[${idx}].tipo_produto = this.value" class="massa-tipo-select" data-massa-idx="${idx}">
                    <option value="comprado" ${produto.tipo_produto === 'comprado' ? 'selected' : ''}>Comprado</option>
                    <option value="fabricado" ${produto.tipo_produto === 'fabricado' ? 'selected' : ''}>Fabricado</option>
                </select>
            </div>
            <div class="field-row">
                <input type="text" placeholder="Custo" style="width: 90px;" value="${produto.preco_custo}"
                    onchange="produtosMassa[${idx}].preco_custo = this.value" class="massa-custo-field" data-massa-idx="${idx}">
                <input type="text" placeholder="Venda" style="width: 90px;" value="${produto.preco_venda}"
                    onchange="produtosMassa[${idx}].preco_venda = this.value" class="massa-venda-field" data-massa-idx="${idx}">
                <input type="text" placeholder="Comissão" style="width: 90px;" value="${produto.comissao}"
                    onchange="produtosMassa[${idx}].comissao = this.value" class="massa-comissao-field" data-massa-idx="${idx}">
                <input type="number" min="0" placeholder="Est.Mín" style="width: 75px; text-align: center;" value="${produto.estoque_minimo}"
                    onchange="produtosMassa[${idx}].estoque_minimo = this.value" class="massa-estmin-field" data-massa-idx="${idx}" title="Estoque Mínimo">
                <label style="color: #a8b2d1; font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;">
                    <input type="checkbox" ${produto.faturavel ? 'checked' : ''}
                        onchange="produtosMassa[${idx}].faturavel = this.checked"> Fat.
                </label>
                <label style="color: #a8b2d1; font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;">
                    <input type="checkbox" ${produto.ativo ? 'checked' : ''}
                        onchange="produtosMassa[${idx}].ativo = this.checked"> Ativo
                </label>
                <label style="color: #a8b2d1; font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;">
                    <input type="checkbox" ${produto.post_facebook ? 'checked' : ''}
                        onchange="produtosMassa[${idx}].post_facebook = this.checked"> FB
                </label>
                <label style="color: #a8b2d1; font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;">
                    <input type="checkbox" ${produto.post_olx ? 'checked' : ''}
                        onchange="produtosMassa[${idx}].post_olx = this.checked"> OLX
                </label>
            </div>
            <div class="field-row massa-qtd-row" style="display: ${document.getElementById('massaCriarCompra')?.checked ? 'flex' : 'none'};">
                <label style="color: #f0ad4e; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <i class="fas fa-boxes"></i> Qtd Compra:
                </label>
                <input type="number" min="1" placeholder="Qtd" style="width: 80px; text-align: center;"
                    value="${produto.qtd_compra || ''}" onchange="produtosMassa[${idx}].qtd_compra = this.value" class="massa-qtd-field" data-massa-idx="${idx}">
            </div>
        `;

        // Botão remover
        const removeBtn = document.createElement('button');
        removeBtn.className = 'massa-remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remover produto';
        removeBtn.onclick = function () {
            produtosMassa.splice(idx, 1);
            document.getElementById('cadastroMassaCount').textContent = `${produtosMassa.length} produto(s) detectado(s)`;
            renderizarListaProdutosMassa();
            if (produtosMassa.length === 0) {
                document.getElementById('cadastroMassaEtapa1').style.display = 'block';
                document.getElementById('cadastroMassaEtapa2').style.display = 'none';
                document.getElementById('cadastroMassaFooter').style.display = 'none';
            }
        };

        card.appendChild(thumbImg);
        card.appendChild(fields);
        card.appendChild(removeBtn);
        container.appendChild(card);

        // Setar valores dos selects que vieram preenchidos
        if (produto.categoria_id) {
            const catSelect = card.querySelector('.massa-cat-select');
            if (catSelect) catSelect.value = produto.categoria_id;
        }
    });
}

// =============================================
// APLICAR CONFIGURAÇÕES GLOBAIS
// =============================================

function aplicarConfigGlobal() {
    const categoria = document.getElementById('massaCategoria')?.value || '';
    const tipo = document.getElementById('massaTipo')?.value || 'comprado';
    const custo = document.getElementById('massaPrecoCusto')?.value || '';
    const venda = document.getElementById('massaPrecoVenda')?.value || '';
    const comissao = document.getElementById('massaComissao')?.value || '';
    const faturavel = document.getElementById('massaFaturavel')?.checked || false;
    const ativo = document.getElementById('massaAtivo')?.checked || false;
    const postFb = document.getElementById('massaPostFacebook')?.checked || false;
    const postOlx = document.getElementById('massaPostOlx')?.checked || false;

    produtosMassa.forEach(p => {
        if (categoria) p.categoria_id = categoria;
        p.tipo_produto = tipo;
        if (custo) p.preco_custo = custo;
        if (venda) p.preco_venda = venda;
        if (comissao) p.comissao = comissao;
        p.faturavel = faturavel;
        p.ativo = ativo;
        p.post_facebook = postFb;
        p.post_olx = postOlx;
    });

    renderizarListaProdutosMassa();
}

// =============================================
// GERAR DESCRIÇÕES POR IA (EM MASSA)
// =============================================

async function gerarDescricoesMassaIA() {
    if (produtosMassa.length === 0) {
        alert('Nenhum produto para gerar descrições.');
        return;
    }

    const btn = document.getElementById('btnIAMassa');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        // Carregar configurações de IA
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

        // Carregar dados fixos
        if (typeof carregarDadosFixosDescricao === 'function') {
            await carregarDadosFixosDescricao();
        }
        const dadosFixos = (typeof dadosFixosDescricao !== 'undefined' && dadosFixosDescricao) ? dadosFixosDescricao : '';

        // Processar em lotes de 10
        const totalLotes = Math.ceil(produtosMassa.length / 10);

        for (let loteIdx = 0; loteIdx < totalLotes; loteIdx++) {
            const lote = produtosMassa.slice(loteIdx * 10, (loteIdx + 1) * 10);

            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Lote ${loteIdx + 1}/${totalLotes}...`;

            const produtosJson = {};
            lote.forEach(p => { produtosJson[`produto_${p.id}`] = p.nome; });

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
                            'X-Title': 'ERP Maneiro - Cadastro em Massa'
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

            // Extrair JSON da resposta
            const jsonMatch = resposta.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const descricoes = JSON.parse(jsonMatch[0]);
                    lote.forEach(p => {
                        const desc = descricoes[`produto_${p.id}`];
                        if (desc) {
                            p.descricao = desc;
                        }
                    });
                } catch (e) {
                    console.error('[CadastroMassa] Erro ao parsear JSON da IA:', e);
                }
            }
        }

        // Re-renderizar para mostrar descrições
        renderizarListaProdutosMassa();

        btn.innerHTML = '<i class="fas fa-check"></i> Descrições Geradas!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.innerHTML = textoOriginal;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[CadastroMassa] Erro ao gerar descrições IA:', error);
        alert('Erro ao gerar descrições: ' + error.message);
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// =============================================
// SALVAR TODOS OS PRODUTOS
// =============================================

async function salvarProdutosMassa() {
    if (produtosMassa.length === 0) {
        alert('Nenhum produto para salvar.');
        return;
    }

    // Sincronizar valores dos campos do DOM com o array (para caso o onchange não disparou)
    sincronizarCamposMassa();

    // Validações
    for (let i = 0; i < produtosMassa.length; i++) {
        const p = produtosMassa[i];
        if (!p.nome || !p.nome.trim()) {
            alert(`Produto ${i + 1}: Nome é obrigatório.`);
            return;
        }
        if (!p.categoria_id) {
            alert(`Produto "${p.nome}": Categoria é obrigatória.`);
            return;
        }
    }

    // Validar quantidades se criar compra estiver marcado
    const compraChecked = document.getElementById('massaCriarCompra')?.checked || false;
    if (compraChecked) {
        // Sincronizar quantidades do DOM
        document.querySelectorAll('.massa-qtd-field').forEach(input => {
            const mIdx = parseInt(input.getAttribute('data-massa-idx'));
            if (mIdx < produtosMassa.length) {
                produtosMassa[mIdx].qtd_compra = input.value;
            }
        });

        const fornecedorId = document.getElementById('massaFornecedor')?.value;
        if (!fornecedorId) {
            alert('Selecione um fornecedor para criar a ordem de compra.');
            return;
        }

        for (let i = 0; i < produtosMassa.length; i++) {
            const p = produtosMassa[i];
            if ((p.tipo_produto || 'comprado') === 'comprado') {
                const qtd = parseInt(p.qtd_compra);
                if (!qtd || qtd <= 0) {
                    alert(`Produto "${p.nome}": Quantidade de compra é obrigatória (deve ser um número maior que 0).`);
                    return;
                }
            }
        }
    }

    const btnSalvar = document.getElementById('btnSalvarMassa');
    const btnCancelar = document.getElementById('btnCancelarMassa');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    if (btnCancelar) btnCancelar.disabled = true;

    // Mostrar barra de progresso
    const progressContainer = document.getElementById('cadastroMassaProgressContainer');
    const progressBar = document.getElementById('cadastroMassaProgressBar');
    const progressPercent = document.getElementById('cadastroMassaProgressPercent');
    const progressDetail = document.getElementById('cadastroMassaProgressDetail');
    const progressLabel = document.getElementById('cadastroMassaProgressLabel');

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressLabel) progressLabel.textContent = 'Salvando produtos...';

    const total = produtosMassa.length;
    let sucesso = 0;
    let erros = 0;

    // Buscar próximo código disponível
    let proximoCodigo = 1;
    try {
        const todosProdutosExistentes = await apiGet('/api/produtos');
        if (todosProdutosExistentes && todosProdutosExistentes.length > 0) {
            let maiorCodigo = 0;
            todosProdutosExistentes.forEach(p => {
                const cod = parseInt(p.codigo, 10);
                if (!isNaN(cod) && cod > maiorCodigo) maiorCodigo = cod;
            });
            proximoCodigo = maiorCodigo + 1;
        }
    } catch (e) {
        console.warn('[CadastroMassa] Erro ao buscar próximo código, usando timestamp:', e);
        proximoCodigo = parseInt(new Date().getTime().toString().slice(-8), 10);
    }

    // Obter ID do usuário
    const userData = getUserData();
    const usuario_id = userData ? userData.id : null;

    if (!usuario_id) {
        alert('Erro: Não foi possível identificar o usuário. Faça login novamente.');
        if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Todos os Produtos'; }
        if (btnCancelar) btnCancelar.disabled = false;
        if (progressContainer) progressContainer.style.display = 'none';
        return;
    }

    for (let i = 0; i < total; i++) {
        const p = produtosMassa[i];
        const pctNum = Math.round(((i + 1) / total) * 100);

        if (progressBar) progressBar.style.width = `${pctNum}%`;
        if (progressPercent) progressPercent.textContent = `${pctNum}%`;
        if (progressDetail) progressDetail.textContent = `Salvando "${p.nome}" (${i + 1} de ${total})...`;

        try {
            const codigo = (proximoCodigo + i).toString();

            const precoCusto = p.preco_custo ? parseFloat(String(p.preco_custo).replace(',', '.')) : 0;
            const precoVenda = p.preco_venda ? parseFloat(String(p.preco_venda).replace(',', '.')) : 0;
            const comissao = p.comissao ? parseFloat(String(p.comissao).replace(',', '.')) : 0;

            // Montar FormData
            const formData = new FormData();
            formData.append('codigo', codigo);
            formData.append('nome', p.nome.trim());
            formData.append('descricao', p.descricao || '');
            formData.append('preco_custo', precoCusto);
            formData.append('preco_venda', precoVenda);
            formData.append('estoque_minimo', parseInt(p.estoque_minimo) || 1);
            formData.append('categoria_id', p.categoria_id);
            formData.append('tipo_produto', p.tipo_produto || 'comprado');
            formData.append('comissao', comissao);
            formData.append('faturavel', p.faturavel);
            formData.append('post_olx', p.post_olx);
            formData.append('post_facebook', p.post_facebook);
            formData.append('ativo', p.ativo);
            formData.append('usuario_id', usuario_id);

            // Comprimir e adicionar imagens
            for (let imgIdx = 0; imgIdx < p.imagens.length; imgIdx++) {
                const originalFile = p.imagens[imgIdx];
                let fileToUpload = originalFile;

                try {
                    if (typeof ImageCompressor !== 'undefined') {
                        const compressedBlob = await ImageCompressor.compress(originalFile, {
                            maxWidth: 1920,
                            maxHeight: 1080,
                            quality: 0.8,
                            maxSizeMB: 1
                        });
                        fileToUpload = ImageCompressor.blobToFile(compressedBlob, originalFile.name);
                    }
                } catch (compErr) {
                    console.warn(`[CadastroMassa] Erro ao comprimir imagem ${originalFile.name}:`, compErr);
                }

                formData.append('imagens', fileToUpload);
            }

            const resultadoProduto = await apiPostFormData('/api/produtos', formData);
            p._savedId = resultadoProduto?.id || null;
            p._savedCodigo = codigo;
            sucesso++;

        } catch (error) {
            console.error(`[CadastroMassa] Erro ao salvar "${p.nome}":`, error);
            erros++;
        }
    }

    // =============================================
    // CRIAR ORDEM DE COMPRA (se flag marcado)
    // =============================================
    const criarCompra = document.getElementById('massaCriarCompra')?.checked || false;
    let compraMsg = '';

    if (criarCompra && sucesso > 0) {
        const fornecedorId = document.getElementById('massaFornecedor')?.value;
        const compraStatus = document.getElementById('massaCompraStatus')?.value || 'pendente';

        // Ler quantidades dos campos do DOM
        document.querySelectorAll('.massa-qtd-field').forEach(input => {
            const mIdx = parseInt(input.getAttribute('data-massa-idx'));
            if (mIdx < produtosMassa.length) {
                produtosMassa[mIdx].qtd_compra = input.value;
            }
        });

        if (!fornecedorId) {
            compraMsg = '\n⚠ Ordem de compra NÃO criada: fornecedor não selecionado.';
        } else {
            // Filtrar apenas produtos comprados que foram salvos com sucesso
            const itensCompra = [];
            produtosMassa.forEach(p => {
                if (p._savedId && (p.tipo_produto || 'comprado') === 'comprado') {
                    const precoCusto = p.preco_custo ? parseFloat(String(p.preco_custo).replace(',', '.')) : 0;
                    const qtd = parseInt(p.qtd_compra) || 0;
                    if (qtd > 0) {
                        itensCompra.push({
                            produto_id: parseInt(p._savedId),
                            quantidade: qtd,
                            preco_unitario: precoCusto
                        });
                    }
                }
            });

            if (itensCompra.length === 0) {
                compraMsg = '\n⚠ Ordem de compra NÃO criada: nenhum produto do tipo "Comprado" foi salvo.';
            } else {
                if (progressDetail) progressDetail.textContent = 'Criando ordem de compra...';

                try {
                    const today = new Date().toISOString().split('T')[0];
                    const compraData = {
                        fornecedor_id: parseInt(fornecedorId),
                        data_previsao: today,
                        observacoes: `Cadastro em massa - ${itensCompra.length} produto(s)`,
                        status: 'pendente',
                        usuario_id: usuario_id,
                        itens: itensCompra
                    };

                    const compraResult = await apiPost('/api/compras', compraData);
                    console.log('[CadastroMassa] Compra criada:', compraResult);

                    // Se status selecionado for 'aprovado', atualizar
                    if (compraStatus === 'aprovado' && compraResult?.id) {
                        await apiPut(`/api/compras/${compraResult.id}`, { status: 'aprovado' });
                    }
                    // Se status selecionado for 'recebido', fazer entrada no estoque + webhook
                    else if (compraStatus === 'recebido' && compraResult?.id) {
                        // Chamar API de recebimento que atualiza o estoque
                        await apiPost(`/api/estoque/receber-pedido/${compraResult.id}`);
                        console.log('[CadastroMassa] Estoque atualizado via receber-pedido');

                        // Notificar vendedores via webhook sobre a entrada de produtos
                        // Usa itensCompra que já temos (produto_id + quantidade) em vez de re-buscar da API
                        if (itensCompra.length > 0 && window.webhookEstoque) {
                            console.log('[CadastroMassa] Notificando entrada de produtos via webhook...', itensCompra);
                            await window.webhookEstoque.notificarEntradaProdutos(itensCompra);
                            console.log('[CadastroMassa] Webhook de entrada enviado com sucesso');
                        } else {
                            console.warn('[CadastroMassa] Webhook não enviado - itens:', itensCompra.length, 'webhookEstoque:', !!window.webhookEstoque);
                        }
                    }

                    compraMsg = `\n✓ Ordem de compra criada com ${itensCompra.length} item(ns) - Status: ${compraStatus}.`;
                } catch (compraError) {
                    console.error('[CadastroMassa] Erro ao criar compra:', compraError);
                    compraMsg = `\n✗ Erro ao criar ordem de compra: ${compraError.message}`;
                }
            }
        }
    }

    // Finalizar
    if (progressBar) progressBar.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';
    if (progressDetail) progressDetail.textContent = `Concluído! ${sucesso} salvo(s)${erros > 0 ? `, ${erros} erro(s)` : ''}.`;
    if (progressLabel) progressLabel.textContent = 'Finalizado!';

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Todos os Produtos'; }
    if (btnCancelar) btnCancelar.disabled = false;

    alert(`Cadastro em massa concluído!\n${sucesso} produto(s) criado(s) com sucesso.${erros > 0 ? `\n${erros} produto(s) com erro.` : ''}${compraMsg}`);

    // Recarregar lista de produtos se a função existir
    if (typeof loadProdutos === 'function') {
        loadProdutos();
    }

    // Fechar modal
    fecharCadastroMassa();
}

// =============================================
// SINCRONIZAR CAMPOS DO DOM COM O ARRAY
// =============================================

function sincronizarCamposMassa() {
    // Sincroniza campos que podem ter sido editados diretamente no DOM
    const cards = document.querySelectorAll('.massa-produto-card');
    cards.forEach((card, idx) => {
        if (idx >= produtosMassa.length) return;

        const inputs = card.querySelectorAll('input[type="text"]');
        if (inputs[0]) produtosMassa[idx].nome = inputs[0].value;

        const textarea = card.querySelector('textarea');
        if (textarea) produtosMassa[idx].descricao = textarea.value;

        const catSelect = card.querySelector('.massa-cat-select');
        if (catSelect) produtosMassa[idx].categoria_id = catSelect.value;
        const tipoSelect = card.querySelector('.massa-tipo-select');
        if (tipoSelect) produtosMassa[idx].tipo_produto = tipoSelect.value;

        // Campos numéricos via classe
        const custoField = card.querySelector('.massa-custo-field');
        if (custoField) produtosMassa[idx].preco_custo = custoField.value;
        const vendaField = card.querySelector('.massa-venda-field');
        if (vendaField) produtosMassa[idx].preco_venda = vendaField.value;
        const comissaoField = card.querySelector('.massa-comissao-field');
        if (comissaoField) produtosMassa[idx].comissao = comissaoField.value;
        const estMinField = card.querySelector('.massa-estmin-field');
        if (estMinField) produtosMassa[idx].estoque_minimo = estMinField.value;

        const checkboxes = card.querySelectorAll('input[type="checkbox"]');
        if (checkboxes[0]) produtosMassa[idx].faturavel = checkboxes[0].checked;
        if (checkboxes[1]) produtosMassa[idx].ativo = checkboxes[1].checked;
        if (checkboxes[2]) produtosMassa[idx].post_facebook = checkboxes[2].checked;
        if (checkboxes[3]) produtosMassa[idx].post_olx = checkboxes[3].checked;
    });
}

// =============================================
// CATEGORIZAR POR IA (EM MASSA)
// =============================================

async function categorizarPorIAMassa() {
    if (produtosMassa.length === 0) {
        alert('Nenhum produto para categorizar.');
        return;
    }
    if (categoriasMassa.length === 0) {
        alert('Nenhuma categoria cadastrada. Cadastre categorias antes de usar esta função.');
        return;
    }

    const btn = document.getElementById('btnCategorizarIAMassa');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Categorizando...';

    try {
        // Carregar configurações de IA
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

        // Montar mapa de categorias
        const categoriasMap = {};
        categoriasMassa.forEach(cat => {
            categoriasMap[cat.id] = cat.nome;
        });

        // Processar em lotes de 15
        const totalLotes = Math.ceil(produtosMassa.length / 15);

        for (let loteIdx = 0; loteIdx < totalLotes; loteIdx++) {
            const lote = produtosMassa.slice(loteIdx * 15, (loteIdx + 1) * 15);

            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Lote ${loteIdx + 1}/${totalLotes}...`;

            const produtosJson = {};
            lote.forEach(p => { produtosJson[`produto_${p.id}`] = p.nome; });

            const prompt = `Você é um especialista em classificação de produtos de informática, eletrônicos e e-commerce em geral.

Sua tarefa: dado o nome de cada produto, escolha a categoria mais correta da lista abaixo.

CATEGORIAS DISPONÍVEIS (id: nome):
${JSON.stringify(categoriasMap, null, 2)}

PRODUTOS PARA CLASSIFICAR:
${JSON.stringify(produtosJson, null, 2)}

REGRAS DE CLASSIFICAÇÃO - siga com atenção:
1. Analise cada palavra-chave do nome do produto para entender do que se trata.
2. "Memória", "RAM", "DDR3", "DDR4", "DDR5", "DIMM", "SODIMM" = memória RAM (NÃO é armazenamento/HD/SSD).
3. "HD", "SSD", "NVMe", "M.2 SSD", "Pendrive", "Cartão SD" = armazenamento.
4. "Placa de vídeo", "GPU", "GTX", "RTX", "RX" = placa de vídeo/GPU.
5. "Processador", "CPU", "Ryzen", "Core i3/i5/i7/i9" = processador.
6. "Placa-mãe", "Motherboard" = placa-mãe.
7. "Fonte", "PSU" = fonte de alimentação.
8. "Monitor", "Tela" = monitor/display.
9. "Teclado", "Mouse", "Headset", "Webcam", "Mousepad" = periféricos.
10. "Notebook", "Laptop" = notebook.
11. "Gabinete", "Case" = gabinete.
12. "Cooler", "Ventoinha", "Water Cooler" = refrigeração.
13. Se não houver uma categoria exata, escolha a mais próxima disponível.
14. Em caso de dúvida, priorize o componente principal mencionado no nome.

Retorne APENAS um JSON válido no formato abaixo, onde o valor é o ID numérico da categoria escolhida:
{
  "produto_ID": ID_DA_CATEGORIA,
  ...
}

Use SOMENTE IDs que existam na lista de categorias acima.`;

            let resposta;

            if (typeof chamarIA === 'function') {
                resposta = await chamarIA(prompt, 2000, 2);
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
                            'X-Title': 'ERP Maneiro - Categorizar em Massa'
                        },
                        body: JSON.stringify({ model: configuracoesIA.model, messages: [{ role: 'user', content: prompt }], stream: false, temperature: 0.3, max_tokens: 2000 })
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
                        body: JSON.stringify({ model: configuracoesIA.lmstudio_model || 'default', messages: [{ role: 'user', content: prompt }], stream: false, temperature: 0.3, max_tokens: 2000 })
                    });
                    if (!response.ok) throw new Error(`Erro LM Studio: ${response.statusText}`);
                    data = await response.json();
                    resposta = data.choices[0]?.message?.content?.trim();

                } else {
                    throw new Error(`Provider de IA desconhecido: ${provider}`);
                }
            }

            // Extrair JSON da resposta
            const jsonMatch = resposta.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const categorias = JSON.parse(jsonMatch[0]);
                    lote.forEach(p => {
                        const catId = categorias[`produto_${p.id}`];
                        if (catId !== undefined && catId !== null) {
                            // Validar que o ID existe nas categorias cadastradas
                            const catIdStr = String(catId);
                            const categoriaExiste = categoriasMassa.some(c => String(c.id) === catIdStr);
                            if (categoriaExiste) {
                                p.categoria_id = catIdStr;
                            }
                        }
                    });
                } catch (e) {
                    console.error('[CadastroMassa] Erro ao parsear JSON de categorias da IA:', e);
                }
            }
        }

        // Re-renderizar para mostrar categorias
        renderizarListaProdutosMassa();

        btn.innerHTML = '<i class="fas fa-check"></i> Categorizado!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.innerHTML = textoOriginal;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[CadastroMassa] Erro ao categorizar por IA:', error);
        alert('Erro ao categorizar: ' + error.message);
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// =============================================
// PREENCHER TUDO (CATEGORIA + DESCRIÇÃO)
// =============================================

async function preencherTudoMassa() {
    if (produtosMassa.length === 0) {
        alert('Nenhum produto para preencher.');
        return;
    }

    const btn = document.getElementById('btnPreencherTudoMassa');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preenchendo...';

    try {
        // 1) Categorizar por IA
        await categorizarPorIAMassa();

        // 2) Gerar descrições por IA
        await gerarDescricoesMassaIA();

        btn.innerHTML = '<i class="fas fa-check"></i> Tudo Preenchido!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.innerHTML = textoOriginal;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[CadastroMassa] Erro ao preencher tudo:', error);
        alert('Erro ao preencher tudo: ' + error.message);
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// =============================================
// VOLTAR PARA ETAPA 1
// =============================================

function voltarEtapa1Massa() {
    produtosMassa = [];
    document.getElementById('cadastroMassaEtapa1').style.display = 'block';
    document.getElementById('cadastroMassaEtapa2').style.display = 'none';
    document.getElementById('cadastroMassaFooter').style.display = 'none';
    document.getElementById('cadastroMassaProgressContainer').style.display = 'none';
    document.getElementById('listaProdutosMassa').innerHTML = '';

    const inputImagens = document.getElementById('inputImagensMassa');
    if (inputImagens) inputImagens.value = '';
}

// =============================================
// EVENT LISTENERS
// =============================================

document.addEventListener('DOMContentLoaded', function () {
    // Botão abrir modal
    const btnCadastroMassa = document.getElementById('btnCadastroMassa');
    if (btnCadastroMassa) {
        btnCadastroMassa.addEventListener('click', abrirCadastroMassa);
    }

    // Fechar modal
    const btnFechar = document.getElementById('btnFecharCadastroMassa');
    if (btnFechar) {
        btnFechar.addEventListener('click', fecharCadastroMassa);
    }

    const btnCancelar = document.getElementById('btnCancelarMassa');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', fecharCadastroMassa);
    }

    // Input de imagens
    const inputImagens = document.getElementById('inputImagensMassa');
    if (inputImagens) {
        inputImagens.addEventListener('change', function (e) {
            processarImagensMassa(e.target.files);
        });
    }

    // Drag and drop na zona de upload
    const dropZone = document.getElementById('dropZoneMassa');
    if (dropZone) {
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.style.borderColor = '#64ffda';
            this.style.background = 'rgba(100,255,218,0.05)';
        });
        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.style.borderColor = 'rgba(100,255,218,0.3)';
            this.style.background = '';
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.style.borderColor = 'rgba(100,255,218,0.3)';
            this.style.background = '';

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                // Filtrar apenas imagens
                const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
                if (imageFiles.length > 0) {
                    processarImagensMassa(imageFiles);
                } else {
                    alert('Por favor, selecione apenas arquivos de imagem.');
                }
            }
        });
    }

    // Botão voltar etapa 1
    const btnVoltar = document.getElementById('btnVoltarEtapa1');
    if (btnVoltar) {
        btnVoltar.addEventListener('click', voltarEtapa1Massa);
    }

    // Botão aplicar global
    const btnAplicarGlobal = document.getElementById('btnAplicarGlobal');
    if (btnAplicarGlobal) {
        btnAplicarGlobal.addEventListener('click', aplicarConfigGlobal);
    }

    // Botão gerar descrições IA
    const btnIA = document.getElementById('btnIAMassa');
    if (btnIA) {
        btnIA.addEventListener('click', gerarDescricoesMassaIA);
    }

    // Botão categorizar por IA
    const btnCategorizar = document.getElementById('btnCategorizarIAMassa');
    if (btnCategorizar) {
        btnCategorizar.addEventListener('click', categorizarPorIAMassa);
    }

    // Botão preencher tudo
    const btnPreencherTudo = document.getElementById('btnPreencherTudoMassa');
    if (btnPreencherTudo) {
        btnPreencherTudo.addEventListener('click', preencherTudoMassa);
    }

    // Botão salvar
    const btnSalvar = document.getElementById('btnSalvarMassa');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarProdutosMassa);
    }

    // Toggle criar ordem de compra
    const chkCriarCompra = document.getElementById('massaCriarCompra');
    if (chkCriarCompra) {
        chkCriarCompra.addEventListener('change', function () {
            const opcoes = document.getElementById('massaCompraOpcoes');
            if (opcoes) opcoes.style.display = this.checked ? 'block' : 'none';
            // Mostrar/ocultar campos de quantidade em cada card
            document.querySelectorAll('.massa-qtd-row').forEach(row => {
                row.style.display = this.checked ? 'flex' : 'none';
            });
        });
    }

    // Máscara de preço nos campos globais
    ['massaPrecoCusto', 'massaPrecoVenda', 'massaComissao'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function () {
                let val = this.value.replace(/\./g, '');
                val = val.replace(/[^0-9,]/g, '');
                const parts = val.split(',');
                if (parts.length > 1) {
                    const integerPart = parts[0];
                    let decimalPart = parts.slice(1).join('');
                    decimalPart = decimalPart.slice(0, 2);
                    val = integerPart + ',' + decimalPart;
                }
                this.value = val;
            });
        }
    });
});
