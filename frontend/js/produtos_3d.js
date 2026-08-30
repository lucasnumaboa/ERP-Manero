/**
 * Produtos 3D - JavaScript
 * Gerenciamento de produtos 3D com upload de imagens, vídeos e arquivos STL
 */

// Variáveis globais
let produtos3D = [];
let categorias3D = [];
let subcategorias3D = [];
let isAdmin = false;
let imagensParaUpload = [];
let videosParaUpload = [];
let stlParaUpload = [];
let gifParaUpload = []; // Máximo 1 GIF
let stlViewer = null;
let categoriasAdicionais = []; // Categorias adicionais selecionadas (além da principal)

// Variáveis para navegação de imagens
let imagensAtuais = [];
let imagemAtualIndex = 0;

// Função utilitária para formatar tamanho de arquivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Inicialização
document.addEventListener('DOMContentLoaded', async function () {
    // Verifica autenticação
    const userData = localStorage.getItem('erp_user_data');
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(userData);
    isAdmin = user.nivel_acesso === 'admin';

    // Mostra botão de gerenciar categorias para admin
    if (isAdmin) {
        document.getElementById('btnGerenciarCategorias').style.display = 'flex';
    }

    // Carrega dados iniciais
    await carregarCategorias();
    await carregarSubcategorias();
    await carregarProdutos();

    // Event listeners
    setupEventListeners();
});

// Setup de event listeners
function setupEventListeners() {
    // Botão novo produto
    document.getElementById('btnNovoProduto3D').addEventListener('click', abrirModalNovoProduto);

    // Botão gerenciar categorias (admin)
    document.getElementById('btnGerenciarCategorias').addEventListener('click', abrirModalCategorias);

    // Filtro de categoria
    document.getElementById('filtroCategoria').addEventListener('change', atualizarFiltroSubcategorias);

    // Filtro de subcategoria
    document.getElementById('filtroSubcategoria').addEventListener('change', filtrarProdutos);

    // Limpar filtro
    document.getElementById('btnLimparFiltro').addEventListener('click', limparFiltro);

    // Form de produto
    document.getElementById('btnSalvar').addEventListener('click', salvarProduto);
    document.getElementById('btnCancelar').addEventListener('click', fecharModalProduto);

    // Form de nova categoria
    document.getElementById('novaCategoriaForm').addEventListener('submit', criarCategoria);

    // Upload de arquivos
    setupUploadListeners();

    // Sistema de abas do modal
    setupModalTabs();

    // Pesquisa de categoria (modal)
    setupPesquisaCategoria();

    // Pesquisa de categoria (filtro)
    setupPesquisaFiltroCategoria();

    // Pesquisa de subcategoria (filtro)
    setupPesquisaFiltroSubcategoria();

    // Pesquisa de subcategoria (modal)
    setupPesquisaSubcategoria();

    // Quando categoria muda, recarrega subcategorias
    document.getElementById('categoriaId').addEventListener('change', atualizarSubcategoriasDoSelect);

    // Botão nova subcategoria
    document.getElementById('btnNovaSubcategoria')?.addEventListener('click', criarNovaSubcategoria);

    // Botão gerar descrição IA
    document.getElementById('btnGerarDescricaoIA3D')?.addEventListener('click', gerarDescricaoIA3D);

    // Categorias adicionais
    setupCategoriasAdicionais();

    // Fechar modais apenas pelo botão X (não ao clicar fora)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            this.closest('.modal').style.display = 'none';
        });
    });

    // NÃO fecha modal ao clicar fora para evitar perda de dados
    // Apenas modais secundários (imagem ampliada, categorias) fecham ao clicar fora
    document.getElementById('imagemAmpliadaModal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });

    document.getElementById('categoriasModal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
}

// Setup do sistema de abas
function setupModalTabs() {
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');
            const modal = this.closest('.modal');

            // Remove active de todas as abas e conteúdos
            modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

            // Adiciona active na aba clicada e no conteúdo correspondente
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
        });
    });
}

// Setup da pesquisa de categoria (modal)
function setupPesquisaCategoria() {
    const pesquisaInput = document.getElementById('pesquisaCategoria');
    const categoriaSelect = document.getElementById('categoriaId');

    if (!pesquisaInput || !categoriaSelect) return;

    pesquisaInput.addEventListener('input', function () {
        const termo = this.value.toLowerCase().trim();
        const options = categoriaSelect.querySelectorAll('option');

        options.forEach(option => {
            if (option.value === '') {
                option.style.display = '';
                return;
            }

            const texto = option.textContent.toLowerCase();
            option.style.display = texto.includes(termo) ? '' : 'none';
        });

        const visibleOptions = Array.from(options).filter(o =>
            o.value !== '' && o.style.display !== 'none'
        );

        if (visibleOptions.length === 1) {
            categoriaSelect.value = visibleOptions[0].value;
        }
    });
}

// Setup da pesquisa de categoria (filtro da página)
function setupPesquisaFiltroCategoria() {
    const pesquisaInput = document.getElementById('pesquisaFiltroCategoria');
    const categoriaSelect = document.getElementById('filtroCategoria');

    if (!pesquisaInput || !categoriaSelect) return;

    pesquisaInput.addEventListener('input', function () {
        const termo = this.value.toLowerCase().trim();
        const options = categoriaSelect.querySelectorAll('option');

        options.forEach(option => {
            if (option.value === '') {
                option.style.display = '';
                return;
            }

            const texto = option.textContent.toLowerCase();
            option.style.display = texto.includes(termo) ? '' : 'none';
        });

        // Se só houver uma opção visível (além do placeholder), seleciona e filtra
        const visibleOptions = Array.from(options).filter(o =>
            o.value !== '' && o.style.display !== 'none'
        );

        if (visibleOptions.length === 1) {
            categoriaSelect.value = visibleOptions[0].value;
            atualizarFiltroSubcategorias(); // Atualiza subcategorias e filtra
        }
    });
}

// Setup da pesquisa de subcategoria (filtro da página)
function setupPesquisaFiltroSubcategoria() {
    const pesquisaInput = document.getElementById('pesquisaFiltroSubcategoria');
    const subcategoriaSelect = document.getElementById('filtroSubcategoria');

    if (!pesquisaInput || !subcategoriaSelect) return;

    pesquisaInput.addEventListener('input', function () {
        const termo = this.value.toLowerCase().trim();
        const options = subcategoriaSelect.querySelectorAll('option');

        options.forEach(option => {
            if (option.value === '') {
                option.style.display = '';
                return;
            }

            const texto = option.textContent.toLowerCase();
            option.style.display = texto.includes(termo) ? '' : 'none';
        });

        const visibleOptions = Array.from(options).filter(o =>
            o.value !== '' && o.style.display !== 'none'
        );

        if (visibleOptions.length === 1) {
            subcategoriaSelect.value = visibleOptions[0].value;
            filtrarProdutos();
        }
    });
}

// Atualizar filtro de subcategorias baseado na categoria selecionada
function atualizarFiltroSubcategorias() {
    const categoriaId = document.getElementById('filtroCategoria').value;
    const subcategoriaSelect = document.getElementById('filtroSubcategoria');
    const pesquisaSubcategoria = document.getElementById('pesquisaFiltroSubcategoria');

    // Limpa opções e pesquisa
    subcategoriaSelect.innerHTML = '<option value="">Todas as subcategorias</option>';
    if (pesquisaSubcategoria) pesquisaSubcategoria.value = '';

    if (categoriaId) {
        // Filtra subcategorias da categoria selecionada
        const subcategoriasFiltradas = subcategorias3D.filter(sub => sub.categoria_id == categoriaId);

        subcategoriasFiltradas.forEach(sub => {
            subcategoriaSelect.innerHTML += `<option value="${sub.id}">${sub.nome}</option>`;
        });
    }

    // Aplica filtro de produtos
    filtrarProdutos();
}

// Gerar descrição por IA para Produto 3D
async function gerarDescricaoIA3D() {
    const btnGerarIA = document.getElementById('btnGerarDescricaoIA3D');
    const descricaoField = document.getElementById('descricao');
    const tituloField = document.getElementById('titulo');
    const categoriaSelect = document.getElementById('categoriaId');

    // Validar se o título foi preenchido
    const tituloProduto = tituloField?.value?.trim();
    if (!tituloProduto) {
        alert('Por favor, preencha o título do produto antes de gerar a descrição.');
        tituloField?.focus();
        return;
    }

    // Obter categoria selecionada
    const categoriaId = categoriaSelect?.value;
    const categoriaNome = categoriaSelect?.options[categoriaSelect.selectedIndex]?.text || '';

    // Obter subcategoria selecionada
    const subcategoriaSelect = document.getElementById('subcategoriaId');
    const subcategoriaId = subcategoriaSelect?.value;
    const subcategoriaNome = subcategoriaSelect?.options[subcategoriaSelect.selectedIndex]?.text || '';

    // Estado de loading
    const textoOriginal = btnGerarIA.innerHTML;
    btnGerarIA.disabled = true;
    btnGerarIA.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        // Carregar configurações de IA
        const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
        const apiKey = configuracoes.find(c => c.chave === 'apikey_openrouter')?.valor;
        const model = configuracoes.find(c => c.chave === 'model_openrouter')?.valor || 'openai/gpt-oss-20b:free';
        const dadosFixos = configuracoes.find(c => c.chave === 'descricao_produto_dados_fixos')?.valor ||
            '- 30 dias de garantia\n- Entrego em Salto SP\n- Somente venda';

        if (!apiKey) {
            throw new Error('API Key do OpenRouter não configurada. Verifique as configurações do sistema.');
        }

        // Criar prompt para IA com título, categoria e subcategoria
        // Inclui categoria principal
        let todasCategorias = [];
        if (categoriaId && categoriaNome && categoriaNome !== 'Selecione uma categoria') {
            todasCategorias.push(categoriaNome);
        }

        // Inclui categorias adicionais
        if (categoriasAdicionais && categoriasAdicionais.length > 0) {
            categoriasAdicionais.forEach(cat => {
                if (!todasCategorias.includes(cat.nome)) {
                    todasCategorias.push(cat.nome);
                }
            });
        }

        const categoriaContexto = todasCategorias.length > 0
            ? `\n**Categorias:** ${todasCategorias.join(', ')}`
            : '';

        const subcategoriaContexto = subcategoriaId && subcategoriaNome && subcategoriaNome !== 'Selecione uma subcategoria'
            ? `\n**Subcategoria:** ${subcategoriaNome}`
            : '';

        const prompt = `Você é um especialista em copywriting para vendas de produtos impressos em 3D. Gere uma descrição de venda atrativa e persuasiva para o seguinte produto 3D:

**Nome do Produto 3D:** ${tituloProduto}${categoriaContexto}${subcategoriaContexto}

A descrição deve:
1. Ter entre 3-5 linhas
2. Ressaltar que é um produto impresso em 3D com qualidade
3. Mencionar possibilidades de personalização (se aplicável)
4. Usar linguagem persuasiva mas honesta
5. Ser adequada para marketplace (OLX, Facebook Marketplace, Mercado Livre)
6. Não usar emojis excessivos
7. Ser direta e objetiva

IMPORTANTE: No INÍCIO da descrição, INCLUA OBRIGATORIAMENTE:

${dadosFixos}

Depois dessas informações, escreva a descrição do produto.

Responda APENAS com a descrição pronta, sem explicações adicionais.`;

        console.log('[IA Descrição 3D] Gerando descrição para:', tituloProduto);

        // Ler configuração de reasoning
        const iaThink = configuracoes.find(c => c.chave === 'ia_think')?.valor || 'on'; // off|low|medium|high|on
        const iaThinkTokens = parseInt(configuracoes.find(c => c.chave === 'ia_think_tokens')?.valor || '0', 10);

        // Montar payload base
        const payload3D = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            temperature: 0.7,
            max_tokens: 2000
        };

        // Aplicar reasoning (OpenRouter: objeto com effort; 'off' usa budget_tokens=0)
        if (iaThink !== 'on') {
            if (iaThink === 'off') {
                payload3D.reasoning = { effort: 'low' };
                payload3D.budget_tokens = 0;
            } else {
                const reasoning = { effort: iaThink };
                if (iaThinkTokens > 0) reasoning.max_tokens = iaThinkTokens;
                payload3D.reasoning = reasoning;
            }
        } else if (iaThinkTokens > 0) {
            payload3D.reasoning = { max_tokens: iaThinkTokens };
        }

        // Chamar OpenRouter
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'ERP Maneiro - Descrição Produto 3D'
            },
            body: JSON.stringify(payload3D)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erro da API: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const descricaoGerada = data.choices[0]?.message?.content?.trim();

        if (!descricaoGerada || descricaoGerada.length < 20) {
            throw new Error('A IA retornou uma descrição vazia ou muito curta. Tente novamente.');
        }

        // Preencher o campo de descrição
        descricaoField.value = descricaoGerada;

        // Feedback visual de sucesso
        btnGerarIA.innerHTML = '<i class="fas fa-check"></i> Gerado!';
        btnGerarIA.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';

        console.log('[IA Descrição 3D] Descrição gerada com sucesso!');

        // Restaurar botão após 2 segundos
        setTimeout(() => {
            btnGerarIA.innerHTML = textoOriginal;
            btnGerarIA.style.background = '';
            btnGerarIA.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[IA Descrição 3D] Erro:', error);
        alert('Erro ao gerar descrição: ' + error.message);

        // Restaurar botão
        btnGerarIA.innerHTML = textoOriginal;
        btnGerarIA.style.background = '';
        btnGerarIA.disabled = false;
    }
}

// Setup de upload de arquivos
function setupUploadListeners() {
    // Imagens
    const uploadImagens = document.getElementById('uploadImagens');
    const inputImagens = document.getElementById('inputImagens');

    uploadImagens.addEventListener('click', () => inputImagens.click());
    uploadImagens.addEventListener('dragover', (e) => { e.preventDefault(); uploadImagens.style.borderColor = '#64ffda'; });
    uploadImagens.addEventListener('dragleave', () => { uploadImagens.style.borderColor = 'rgba(100, 255, 218, 0.3)'; });
    uploadImagens.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadImagens.style.borderColor = 'rgba(100, 255, 218, 0.3)';
        handleImagensUpload(e.dataTransfer.files);
    });
    inputImagens.addEventListener('change', (e) => handleImagensUpload(e.target.files));

    // Vídeos
    const uploadVideos = document.getElementById('uploadVideos');
    const inputVideos = document.getElementById('inputVideos');

    uploadVideos.addEventListener('click', () => inputVideos.click());
    uploadVideos.addEventListener('dragover', (e) => { e.preventDefault(); uploadVideos.style.borderColor = '#64ffda'; });
    uploadVideos.addEventListener('dragleave', () => { uploadVideos.style.borderColor = 'rgba(100, 255, 218, 0.3)'; });
    uploadVideos.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadVideos.style.borderColor = 'rgba(100, 255, 218, 0.3)';
        handleVideosUpload(e.dataTransfer.files);
    });
    inputVideos.addEventListener('change', (e) => handleVideosUpload(e.target.files));

    // STL
    const uploadSTL = document.getElementById('uploadSTL');
    const inputSTL = document.getElementById('inputSTL');

    uploadSTL.addEventListener('click', () => inputSTL.click());
    uploadSTL.addEventListener('dragover', (e) => { e.preventDefault(); uploadSTL.style.borderColor = '#64ffda'; });
    uploadSTL.addEventListener('dragleave', () => { uploadSTL.style.borderColor = 'rgba(100, 255, 218, 0.3)'; });
    uploadSTL.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadSTL.style.borderColor = 'rgba(100, 255, 218, 0.3)';
        handleSTLUpload(e.dataTransfer.files);
    });
    inputSTL.addEventListener('change', (e) => handleSTLUpload(e.target.files));

    // GIF
    const uploadGIF = document.getElementById('uploadGIF');
    const inputGIF = document.getElementById('inputGIF');

    if (uploadGIF && inputGIF) {
        uploadGIF.addEventListener('click', () => inputGIF.click());
        uploadGIF.addEventListener('dragover', (e) => { e.preventDefault(); uploadGIF.style.borderColor = '#64ffda'; });
        uploadGIF.addEventListener('dragleave', () => { uploadGIF.style.borderColor = 'rgba(100, 255, 218, 0.3)'; });
        uploadGIF.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadGIF.style.borderColor = 'rgba(100, 255, 218, 0.3)';
            handleGIFUpload(e.dataTransfer.files);
        });
        inputGIF.addEventListener('change', (e) => handleGIFUpload(e.target.files));
    }
}

// Handlers de upload
async function handleImagensUpload(files) {
    const preview = document.getElementById('previewImagens');

    for (let file of files) {
        if (imagensParaUpload.length >= 3) {
            alert('Máximo de 3 imagens permitidas');
            break;
        }

        if (!file.type.startsWith('image/')) continue;

        // Comprime a imagem
        try {
            const compressedBlob = await ImageCompressor.compress(file, {
                maxWidth: 1920,
                maxHeight: 1080,
                quality: 0.8,
                maxSizeMB: 1
            });
            const compressedFile = ImageCompressor.blobToFile(compressedBlob, file.name);
            imagensParaUpload.push(compressedFile);

            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="remove-btn" onclick="removerImagem(${imagensParaUpload.length - 1})">&times;</button>
                `;
                preview.appendChild(div);
            };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Erro ao comprimir imagem:', error);
        }
    }
}

function handleVideosUpload(files) {
    const preview = document.getElementById('previewVideos');

    for (let file of files) {
        if (videosParaUpload.length >= 3) {
            alert('Máximo de 3 vídeos permitidos');
            break;
        }

        if (!file.type.startsWith('video/')) continue;

        videosParaUpload.push(file);

        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <div class="file-icon"><i class="fas fa-video"></i></div>
            <button type="button" class="remove-btn" onclick="removerVideo(${videosParaUpload.length - 1})">&times;</button>
        `;
        preview.appendChild(div);
    }
}

function handleSTLUpload(files) {
    const preview = document.getElementById('previewSTL');
    const MAX_SIZE_MB = 100;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    // Extensões de arquivo comprimido aceitas
    const compressedExtensions = ['.zip', '.rar', '.7z', '.gz', '.tar', '.tgz', '.bz2'];

    for (let file of files) {
        const fileName = file.name.toLowerCase();
        const isSTL = fileName.endsWith('.stl');
        const isCompressed = compressedExtensions.some(ext => fileName.endsWith(ext));

        if (!isSTL && !isCompressed) {
            alert('Apenas arquivos .stl ou comprimidos (.zip, .rar, .7z, etc.) são permitidos');
            continue;
        }

        // Validação de tamanho (100MB para Cloudflare)
        if (file.size > MAX_SIZE_BYTES) {
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            alert(`⚠️ Arquivo muito grande!\n\nO arquivo "${file.name}" tem ${fileSizeMB} MB.\n\nLimite máximo: ${MAX_SIZE_MB} MB\n\n💡 Dica: Compacte o arquivo em ZIP/RAR/7Z para reduzir o tamanho.`);
            continue;
        }

        stlParaUpload.push(file);

        // Calcula tamanho para exibição
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const icon = isCompressed ? 'file-archive' : 'cube';
        const iconColor = isCompressed ? '#ffc107' : '#64ffda';

        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <div class="file-icon" style="color: ${iconColor}"><i class="fas fa-${icon}"></i></div>
            <div class="file-info-stl">
                <span class="file-name" title="${file.name}">${file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name}</span>
                <span class="file-size">${fileSizeMB} MB</span>
            </div>
            <button type="button" class="remove-btn" onclick="removerSTL(${stlParaUpload.length - 1})">&times;</button>
        `;
        preview.appendChild(div);
    }
}

// Handler de upload de GIF (máximo 1)
function handleGIFUpload(files) {
    const preview = document.getElementById('previewGIF');

    for (let file of files) {
        // Verifica se é GIF
        if (!file.type.startsWith('image/gif') && !file.name.toLowerCase().endsWith('.gif')) continue;

        // Máximo 1 GIF
        if (gifParaUpload.length >= 1) {
            alert('Apenas 1 GIF é permitido. Remova o atual para adicionar outro.');
            break;
        }

        gifParaUpload.push(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="GIF Preview">
                <button type="button" class="remove-btn" onclick="removerGIF(${gifParaUpload.length - 1})">&times;</button>
            `;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    }
}

// Funções para remover arquivos do preview
function removerImagem(index) {
    imagensParaUpload.splice(index, 1);
    atualizarPreviewImagens();
}

function removerVideo(index) {
    videosParaUpload.splice(index, 1);
    atualizarPreviewVideos();
}

function removerSTL(index) {
    stlParaUpload.splice(index, 1);
    atualizarPreviewSTL();
}

function removerGIF(index) {
    gifParaUpload.splice(index, 1);
    atualizarPreviewGIF();
}

function atualizarPreviewImagens() {
    const preview = document.getElementById('previewImagens');
    preview.innerHTML = '';
    imagensParaUpload.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="remove-btn" onclick="removerImagem(${index})">&times;</button>
            `;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function atualizarPreviewVideos() {
    const preview = document.getElementById('previewVideos');
    preview.innerHTML = '';
    videosParaUpload.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <div class="file-icon"><i class="fas fa-video"></i></div>
            <button type="button" class="remove-btn" onclick="removerVideo(${index})">&times;</button>
        `;
        preview.appendChild(div);
    });
}

function atualizarPreviewSTL() {
    const preview = document.getElementById('previewSTL');
    preview.innerHTML = '';
    stlParaUpload.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <div class="file-icon"><i class="fas fa-cube"></i></div>
            <button type="button" class="remove-btn" onclick="removerSTL(${index})">&times;</button>
        `;
        preview.appendChild(div);
    });
}

function atualizarPreviewGIF() {
    const preview = document.getElementById('previewGIF');
    if (!preview) return;
    preview.innerHTML = '';
    gifParaUpload.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="GIF Preview">
                <button type="button" class="remove-btn" onclick="removerGIF(${index})">&times;</button>
            `;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

// Carregar categorias
async function carregarCategorias() {
    try {
        categorias3D = await apiGet('/api/produtos-3d/categorias', { ativo: true });

        // Preenche selects
        const filtroCategoria = document.getElementById('filtroCategoria');
        const categoriaId = document.getElementById('categoriaId');

        // Limpa opções existentes (exceto a primeira)
        filtroCategoria.innerHTML = '<option value="">Todas as categorias</option>';
        categoriaId.innerHTML = '<option value="">Selecione uma categoria</option>';

        categorias3D.forEach(cat => {
            filtroCategoria.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
            categoriaId.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

// Carregar subcategorias
async function carregarSubcategorias() {
    try {
        subcategorias3D = await apiGet('/api/produtos-3d/subcategorias', { ativo: true });
    } catch (error) {
        console.error('Erro ao carregar subcategorias:', error);
    }
}

// ============================================
// Gerenciamento de Categorias Adicionais
// ============================================

// Setup das categorias adicionais
function setupCategoriasAdicionais() {
    const selectAdicional = document.getElementById('categoriaAdicionalSelect');

    if (selectAdicional) {
        selectAdicional.addEventListener('change', function () {
            if (this.value) {
                adicionarCategoriaAdicional();
            }
        });
    }
}

// Preencher select de categorias adicionais
function preencherSelectCategoriasAdicionais() {
    const selectAdicional = document.getElementById('categoriaAdicionalSelect');
    const categoriaPrincipalId = document.getElementById('categoriaId').value;

    if (!selectAdicional) return;

    selectAdicional.innerHTML = '<option value="">+ Adicionar...</option>';

    categorias3D.forEach(cat => {
        // Não mostra a categoria principal nem as já adicionadas
        const jaAdicionada = categoriasAdicionais.some(c => c.id == cat.id);
        if (cat.id != categoriaPrincipalId && !jaAdicionada) {
            selectAdicional.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
        }
    });
}

// Adicionar categoria adicional
function adicionarCategoriaAdicional() {
    const selectAdicional = document.getElementById('categoriaAdicionalSelect');
    const categoriaId = selectAdicional.value;

    if (!categoriaId) return;

    // Encontra a categoria
    const categoria = categorias3D.find(c => c.id == categoriaId);
    if (!categoria) return;

    // Verifica se já foi adicionada
    if (categoriasAdicionais.some(c => c.id == categoriaId)) {
        alert('Esta categoria já foi adicionada.');
        return;
    }

    // Adiciona à lista
    categoriasAdicionais.push({ id: categoria.id, nome: categoria.nome });

    // Atualiza interface
    renderizarCategoriasAdicionais();
    preencherSelectCategoriasAdicionais();
    atualizarCampoCategoriasIds();

    // Limpa seleção
    selectAdicional.value = '';
}

// Remover categoria adicional
function removerCategoriaAdicional(categoriaId) {
    categoriasAdicionais = categoriasAdicionais.filter(c => c.id != categoriaId);

    renderizarCategoriasAdicionais();
    preencherSelectCategoriasAdicionais();
    atualizarCampoCategoriasIds();
}

// Renderizar tags de categorias adicionais
function renderizarCategoriasAdicionais() {
    const container = document.getElementById('categoriasAdicionaisTags');
    if (!container) return;

    container.innerHTML = categoriasAdicionais.map(cat => `
        <span class="categoria-tag" data-id="${cat.id}">
            <i class="fas fa-tag"></i>
            ${cat.nome}
            <span class="remove-tag" onclick="removerCategoriaAdicional(${cat.id})">&times;</span>
        </span>
    `).join('');
}

// Atualizar campo hidden com IDs das categorias
function atualizarCampoCategoriasIds() {
    const campoIds = document.getElementById('categoriasAdicionaisIds');
    if (campoIds) {
        campoIds.value = categoriasAdicionais.map(c => c.id).join(',');
    }
}

// Limpar categorias adicionais
function limparCategoriasAdicionais() {
    categoriasAdicionais = [];
    renderizarCategoriasAdicionais();
    preencherSelectCategoriasAdicionais();
    atualizarCampoCategoriasIds();
}

// Atualizar select de subcategorias baseado na categoria selecionada
function atualizarSubcategoriasDoSelect() {
    const categoriaId = document.getElementById('categoriaId').value;
    const subcategoriaSelect = document.getElementById('subcategoriaId');
    const btnNovaSubcategoria = document.getElementById('btnNovaSubcategoria');

    // Limpa opções
    subcategoriaSelect.innerHTML = '<option value="">Selecione uma subcategoria</option>';

    if (!categoriaId) {
        // Esconde botão de criar subcategoria se não há categoria
        if (btnNovaSubcategoria) btnNovaSubcategoria.style.display = 'none';
        return;
    }

    // Mostra botão de criar subcategoria para admins
    if (isAdmin && btnNovaSubcategoria) {
        btnNovaSubcategoria.style.display = 'flex';
    }

    // Filtra subcategorias da categoria selecionada
    const subcategoriasFiltradas = subcategorias3D.filter(sub => sub.categoria_id == categoriaId);

    subcategoriasFiltradas.forEach(sub => {
        subcategoriaSelect.innerHTML += `<option value="${sub.id}">${sub.nome}</option>`;
    });
}

// Setup da pesquisa de subcategoria (modal)
function setupPesquisaSubcategoria() {
    const pesquisaInput = document.getElementById('pesquisaSubcategoria');
    const subcategoriaSelect = document.getElementById('subcategoriaId');

    if (!pesquisaInput || !subcategoriaSelect) return;

    pesquisaInput.addEventListener('input', function () {
        const termo = this.value.toLowerCase().trim();
        const options = subcategoriaSelect.querySelectorAll('option');

        options.forEach(option => {
            if (option.value === '') {
                option.style.display = '';
                return;
            }

            const texto = option.textContent.toLowerCase();
            option.style.display = texto.includes(termo) ? '' : 'none';
        });

        const visibleOptions = Array.from(options).filter(o =>
            o.value !== '' && o.style.display !== 'none'
        );

        if (visibleOptions.length === 1) {
            subcategoriaSelect.value = visibleOptions[0].value;
        }
    });
}

// Criar nova subcategoria
async function criarNovaSubcategoria() {
    const categoriaId = document.getElementById('categoriaId').value;
    const pesquisaInput = document.getElementById('pesquisaSubcategoria');
    const nomeSubcategoria = pesquisaInput?.value?.trim();

    if (!categoriaId) {
        alert('Selecione uma categoria primeiro');
        return;
    }

    if (!nomeSubcategoria) {
        alert('Digite o nome da subcategoria no campo de pesquisa');
        pesquisaInput?.focus();
        return;
    }

    // Verifica se já existe
    const existe = subcategorias3D.some(sub =>
        sub.categoria_id == categoriaId &&
        sub.nome.toLowerCase() === nomeSubcategoria.toLowerCase()
    );

    if (existe) {
        alert('Já existe uma subcategoria com este nome nesta categoria');
        return;
    }

    try {
        const novaSubcategoria = await apiPost('/api/produtos-3d/subcategorias', {
            nome: nomeSubcategoria,
            categoria_id: parseInt(categoriaId)
        });

        // Adiciona à lista local
        subcategorias3D.push(novaSubcategoria);

        // Atualiza select
        atualizarSubcategoriasDoSelect();

        // Seleciona a nova subcategoria
        document.getElementById('subcategoriaId').value = novaSubcategoria.id;

        // Limpa pesquisa
        pesquisaInput.value = '';

        alert('Subcategoria criada com sucesso!');
    } catch (error) {
        console.error('Erro ao criar subcategoria:', error);
        alert('Erro ao criar subcategoria: ' + (error.message || 'Erro desconhecido'));
    }
}

// Carregar produtos
async function carregarProdutos() {
    try {
        const filtroCategoria = document.getElementById('filtroCategoria').value;
        const filtroSubcategoria = document.getElementById('filtroSubcategoria').value;
        const params = { ativo: true };

        if (filtroCategoria) {
            params.categoria_id = filtroCategoria;
        }

        if (filtroSubcategoria) {
            params.subcategoria_id = filtroSubcategoria;
        }

        produtos3D = await apiGet('/api/produtos-3d/', params);

        // Paginação: 20 produtos 3D por página
        itemsPerPage = 20;
        window.currentDisplayFunction = renderizarProdutos;
        initPagination(produtos3D, renderizarProdutos);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        document.getElementById('produtos3DGrid').innerHTML = `
            <p style="color: #e74c3c; grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle"></i> Erro ao carregar produtos
            </p>
        `;
    }
}

// Renderizar produtos (recebe os produtos da página atual, vindos da paginação)
function renderizarProdutos(produtosPagina) {
    const grid = document.getElementById('produtos3DGrid');

    if (!produtosPagina || produtosPagina.length === 0) {
        grid.innerHTML = `
            <p style="color: #8892b0; grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-cube" style="font-size: 48px; display: block; margin-bottom: 15px;"></i>
                Nenhum produto 3D encontrado
            </p>
        `;
        return;
    }

    grid.innerHTML = produtosPagina.map(produto => {
        // Verifica se existe GIF cadastrado - ele tem prioridade
        const gif = produto.arquivos?.find(a => a.tipo === 'gif');
        // Fallback para primeira imagem
        const imagem = !gif ? produto.arquivos?.find(a => a.tipo === 'imagem') : null;
        // Usa GIF se existir, senão usa imagem
        const imagemPadrao = gif || imagem;

        const qtdImagens = produto.arquivos?.filter(a => a.tipo === 'imagem').length || 0;
        const qtdVideos = produto.arquivos?.filter(a => a.tipo === 'video').length || 0;
        const qtdSTL = produto.arquivos?.filter(a => a.tipo === 'stl').length || 0;
        const qtdGIF = produto.arquivos?.filter(a => a.tipo === 'gif').length || 0;

        // Monta lista de categorias
        let categoriasHtml = '';
        if (produto.categorias && produto.categorias.length > 0) {
            // Primeira categoria sempre visível
            const primeiraCat = produto.categorias[0];
            categoriasHtml = `<span class="card-category">${primeiraCat.nome}</span>`;

            // Se tem mais de uma categoria, mostra contador com tooltip listando todas
            if (produto.categorias.length > 1) {
                const extras = produto.categorias.length - 1;
                const outrasCategoriasNomes = produto.categorias
                    .slice(1)
                    .map(c => c.nome)
                    .join(', ');
                categoriasHtml += `<span class="card-category card-category-extra" title="${outrasCategoriasNomes}">+${extras}</span>`;
            }
        } else {
            categoriasHtml = `<span class="card-category">${produto.categoria_nome || 'Sem categoria'}</span>`;
        }

        return `
            <div class="produto-3d-card" data-id="${produto.id}">
                <div class="card-image">
                    ${imagemPadrao
                ? `<img src="${imagemPadrao.caminho}" alt="${produto.titulo}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-cube no-image\\'></i>'">`
                : '<i class="fas fa-cube no-image"></i>'
            }
                </div>
                <div class="card-body">
                    <div class="card-categories">${categoriasHtml}</div>
                    <h3 class="card-title">${produto.titulo}</h3>

                    <div class="card-meta">
                        <span><i class="fas fa-image"></i> ${qtdImagens}</span>
                        <span><i class="fas fa-video"></i> ${qtdVideos}</span>
                        <span><i class="fas fa-cube"></i> ${qtdSTL}</span>
                        ${qtdGIF > 0 ? '<span title="GIF cadastrado"><i class="fas fa-film" style="color: #64ffda;"></i></span>' : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn-ver-detalhes" onclick="verDetalhes(${produto.id})">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="btn-download" onclick="downloadProduto(${produto.id})">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-editar-card" onclick="editarProduto(${produto.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-excluir-card" onclick="excluirProduto(${produto.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filtrar produtos
function filtrarProdutos() {
    carregarProdutos();
}

// Limpar filtro
function limparFiltro() {
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroSubcategoria').value = '';
    document.getElementById('filtroSubcategoria').innerHTML = '<option value="">Todas as subcategorias</option>';
    document.getElementById('pesquisaFiltroCategoria').value = '';
    document.getElementById('pesquisaFiltroSubcategoria').value = '';
    carregarProdutos();
}

// Abrir modal de novo produto
function abrirModalNovoProduto() {
    document.getElementById('modalTitulo').textContent = 'Novo Produto 3D';
    document.getElementById('produto3DForm').reset();
    document.getElementById('produtoId').value = '';

    // Limpa previews
    imagensParaUpload = [];
    videosParaUpload = [];
    stlParaUpload = [];
    gifParaUpload = [];
    document.getElementById('previewImagens').innerHTML = '';
    document.getElementById('previewVideos').innerHTML = '';
    document.getElementById('previewSTL').innerHTML = '';
    const previewGIF = document.getElementById('previewGIF');
    if (previewGIF) previewGIF.innerHTML = '';

    // Limpa subcategorias e esconde botão
    document.getElementById('subcategoriaId').innerHTML = '<option value="">Selecione uma subcategoria</option>';
    document.getElementById('pesquisaSubcategoria').value = '';
    const btnNovaSubcategoria = document.getElementById('btnNovaSubcategoria');
    if (btnNovaSubcategoria) btnNovaSubcategoria.style.display = 'none';

    // Limpa categorias adicionais
    limparCategoriasAdicionais();

    // Reset para primeira aba
    resetModalTabs();

    document.getElementById('produto3DModal').style.display = 'flex';
}

// Reset das abas do modal para a primeira
function resetModalTabs() {
    const modal = document.getElementById('produto3DModal');
    modal.querySelectorAll('.modal-tab').forEach((t, i) => {
        t.classList.toggle('active', i === 0);
    });
    modal.querySelectorAll('.modal-tab-content').forEach((c, i) => {
        c.classList.toggle('active', i === 0);
    });
}

// Fechar modal de produto
function fecharModalProduto() {
    document.getElementById('produto3DModal').style.display = 'none';
}

// Salvar produto
async function salvarProduto() {
    const produtoId = document.getElementById('produtoId').value;
    const titulo = document.getElementById('titulo').value;
    const categoriaId = document.getElementById('categoriaId').value;
    const subcategoriaId = document.getElementById('subcategoriaId').value;
    const descricao = document.getElementById('descricao').value;

    if (!titulo || !categoriaId) {
        alert('Preencha todos os campos obrigatórios');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvar');
    btnSalvar.disabled = true;

    // Mostra overlay de progresso
    showUploadProgress();

    // Contagem de arquivos para estatísticas
    const totalImages = imagensParaUpload.length;
    const totalVideos = videosParaUpload.length;
    const totalSTL = stlParaUpload.length;
    const totalGIF = gifParaUpload.length;
    const totalFiles = totalImages + totalVideos + totalSTL + totalGIF;

    // Atualiza estatísticas iniciais
    updateUploadStats(0, totalImages, 0, totalVideos, 0, totalSTL, 0, totalGIF);

    // Verifica se há arquivos grandes (> 10MB)
    const hasLargeFiles = [...imagensParaUpload, ...videosParaUpload, ...stlParaUpload, ...gifParaUpload]
        .some(f => f.size > 10 * 1024 * 1024);
    if (hasLargeFiles) {
        document.getElementById('uploadWarningLarge').style.display = 'flex';
    }

    let currentStep = 0;
    const totalSteps = 4 + (totalFiles > 0 ? 1 : 0); // compress + prepare + upload + save + finalize

    try {
        // Step 1: Comprimir imagens
        currentStep++;
        updateUploadStage('image', 'Comprimindo imagens...', 0, '-');
        updateOverallProgress(currentStep, totalSteps);

        const imagensComprimidas = [];
        if (imagensParaUpload.length > 0) {
            console.log(`Comprimindo ${imagensParaUpload.length} imagem(ns)...`);
            for (let i = 0; i < imagensParaUpload.length; i++) {
                const originalFile = imagensParaUpload[i];
                const percentFile = Math.round(((i + 1) / imagensParaUpload.length) * 100);

                updateUploadStage(
                    'image',
                    `Comprimindo imagem ${i + 1} de ${imagensParaUpload.length}`,
                    percentFile,
                    originalFile.name
                );

                console.log(`Comprimindo imagem ${i + 1}/${imagensParaUpload.length}: ${originalFile.name} (${formatFileSize(originalFile.size)})`);

                const compressedBlob = await ImageCompressor.compress(originalFile, {
                    maxWidth: 1920,
                    maxHeight: 1080,
                    quality: 0.8,
                    maxSizeMB: 1,
                    debug: true
                });

                const compressedFile = ImageCompressor.blobToFile(compressedBlob, originalFile.name);
                imagensComprimidas.push(compressedFile);
                console.log(`Imagem ${i + 1} comprimida: ${formatFileSize(compressedFile.size)}`);
            }
            updateUploadStats(imagensComprimidas.length, totalImages, 0, totalVideos, 0, totalSTL, 0, totalGIF);
        }

        // Step 2: Preparando FormData
        currentStep++;
        updateUploadStage('cog', 'Preparando dados...', 50, '-');
        updateOverallProgress(currentStep, totalSteps);

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('categoria_id', categoriaId);
        if (subcategoriaId) {
            formData.append('subcategoria_id', subcategoriaId);
        }
        formData.append('descricao', descricao || '');

        // Adiciona categorias adicionais
        const categoriasIds = document.getElementById('categoriasAdicionaisIds').value;
        formData.append('categoria_ids', categoriasIds);

        // Adiciona arquivos ao FormData com progresso visual
        if (produtoId) {
            // Atualizar - usa nomes de campos específicos para atualização
            for (let i = 0; i < imagensComprimidas.length; i++) {
                updateUploadStage('image', `Preparando imagem ${i + 1} de ${imagensComprimidas.length}`, Math.round(((i + 1) / imagensComprimidas.length) * 100), imagensComprimidas[i].name);
                formData.append('novas_imagens', imagensComprimidas[i]);
            }
            for (let i = 0; i < videosParaUpload.length; i++) {
                updateUploadStage('video', `Preparando vídeo ${i + 1} de ${videosParaUpload.length}`, Math.round(((i + 1) / videosParaUpload.length) * 100), videosParaUpload[i].name);
                formData.append('novos_videos', videosParaUpload[i]);
            }
            for (let i = 0; i < stlParaUpload.length; i++) {
                updateUploadStage('cube', `Preparando STL ${i + 1} de ${stlParaUpload.length}`, Math.round(((i + 1) / stlParaUpload.length) * 100), stlParaUpload[i].name);
                formData.append('novos_stl_files', stlParaUpload[i]);
            }
            for (let i = 0; i < gifParaUpload.length; i++) {
                updateUploadStage('film', `Preparando GIF ${i + 1} de ${gifParaUpload.length}`, Math.round(((i + 1) / gifParaUpload.length) * 100), gifParaUpload[i].name);
                formData.append('gif_files', gifParaUpload[i]);
            }
        } else {
            // Criar - usa nomes de campos padrão
            for (let i = 0; i < imagensComprimidas.length; i++) {
                updateUploadStage('image', `Preparando imagem ${i + 1} de ${imagensComprimidas.length}`, Math.round(((i + 1) / imagensComprimidas.length) * 100), imagensComprimidas[i].name);
                formData.append('imagens', imagensComprimidas[i]);
            }
            for (let i = 0; i < videosParaUpload.length; i++) {
                updateUploadStage('video', `Preparando vídeo ${i + 1} de ${videosParaUpload.length}`, Math.round(((i + 1) / videosParaUpload.length) * 100), videosParaUpload[i].name);
                formData.append('videos', videosParaUpload[i]);
            }
            for (let i = 0; i < stlParaUpload.length; i++) {
                updateUploadStage('cube', `Preparando STL ${i + 1} de ${stlParaUpload.length}`, Math.round(((i + 1) / stlParaUpload.length) * 100), stlParaUpload[i].name);
                formData.append('stl_files', stlParaUpload[i]);
            }
            for (let i = 0; i < gifParaUpload.length; i++) {
                updateUploadStage('film', `Preparando GIF ${i + 1} de ${gifParaUpload.length}`, Math.round(((i + 1) / gifParaUpload.length) * 100), gifParaUpload[i].name);
                formData.append('gif_files', gifParaUpload[i]);
            }
        }

        // Step 3: Upload com progresso
        currentStep++;
        updateUploadStage('cloud-upload-alt', 'Enviando para o servidor...', 0, '-');
        updateOverallProgress(currentStep, totalSteps);

        const endpoint = produtoId ? `/api/produtos-3d/${produtoId}` : '/api/produtos-3d/';
        const method = produtoId ? 'PUT' : 'POST';

        await uploadFormDataWithProgress(endpoint, method, formData, (percent, loaded, total) => {
            updateUploadStage(
                'cloud-upload-alt',
                `Enviando arquivos... ${formatFileSize(loaded)} / ${formatFileSize(total)}`,
                percent,
                `${percent}% concluído`
            );

            // Atualiza estatísticas baseado no progresso
            const completedImages = Math.floor((percent / 100) * totalImages);
            const completedVideos = Math.floor((percent / 100) * totalVideos);
            const completedSTL = Math.floor((percent / 100) * totalSTL);
            const completedGIF = Math.floor((percent / 100) * totalGIF);
            updateUploadStats(
                Math.min(completedImages, totalImages), totalImages,
                Math.min(completedVideos, totalVideos), totalVideos,
                Math.min(completedSTL, totalSTL), totalSTL,
                Math.min(completedGIF, totalGIF), totalGIF
            );
        });

        // Step 4: Finalizando
        currentStep++;
        updateUploadStage('check-circle', 'Finalizando...', 100, '-');
        updateOverallProgress(currentStep, totalSteps);

        // Atualiza estatísticas finais
        updateUploadStats(totalImages, totalImages, totalVideos, totalVideos, totalSTL, totalSTL, totalGIF, totalGIF);

        // Pequeno delay para mostrar o progresso final
        await new Promise(resolve => setTimeout(resolve, 500));

        hideUploadProgress();
        fecharModalProduto();
        await carregarProdutos();
        alert('Produto salvo com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        hideUploadProgress();
        alert('Erro ao salvar produto: ' + (error.message || 'Erro desconhecido'));
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
}

// Editar produto
async function editarProduto(id) {
    try {
        const produto = await apiGet(`/api/produtos-3d/${id}`);

        document.getElementById('modalTitulo').textContent = 'Editar Produto 3D';
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('titulo').value = produto.titulo;
        document.getElementById('categoriaId').value = produto.categoria_id;
        document.getElementById('descricao').value = produto.descricao || '';

        // Atualiza subcategorias baseado na categoria do produto
        atualizarSubcategoriasDoSelect();

        // Seleciona a subcategoria do produto (se existir)
        if (produto.subcategoria_id) {
            document.getElementById('subcategoriaId').value = produto.subcategoria_id;
        }

        // Carrega categorias adicionais (excluindo a categoria principal)
        categoriasAdicionais = [];
        if (produto.categorias && produto.categorias.length > 0) {
            produto.categorias.forEach(cat => {
                if (cat.id != produto.categoria_id) {
                    categoriasAdicionais.push({ id: cat.id, nome: cat.nome });
                }
            });
        }
        renderizarCategoriasAdicionais();
        preencherSelectCategoriasAdicionais();
        atualizarCampoCategoriasIds();

        // Limpa previews
        imagensParaUpload = [];
        videosParaUpload = [];
        stlParaUpload = [];
        gifParaUpload = [];
        document.getElementById('previewImagens').innerHTML = '';
        document.getElementById('previewVideos').innerHTML = '';
        document.getElementById('previewSTL').innerHTML = '';
        const previewGIF = document.getElementById('previewGIF');
        if (previewGIF) previewGIF.innerHTML = '';

        // Mostra arquivos existentes
        if (produto.arquivos) {
            const imagens = produto.arquivos.filter(a => a.tipo === 'imagem');
            const videos = produto.arquivos.filter(a => a.tipo === 'video');
            const stls = produto.arquivos.filter(a => a.tipo === 'stl');
            const gifs = produto.arquivos.filter(a => a.tipo === 'gif');

            imagens.forEach(img => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <img src="${img.caminho}" alt="Imagem existente">
                    <button type="button" class="remove-btn" onclick="excluirArquivo(${produto.id}, ${img.id})">&times;</button>
                `;
                document.getElementById('previewImagens').appendChild(div);
            });

            videos.forEach(video => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <div class="file-icon"><i class="fas fa-video"></i></div>
                    <button type="button" class="remove-btn" onclick="excluirArquivo(${produto.id}, ${video.id})">&times;</button>
                `;
                document.getElementById('previewVideos').appendChild(div);
            });

            stls.forEach(stl => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <div class="file-icon"><i class="fas fa-cube"></i></div>
                    <button type="button" class="remove-btn" onclick="excluirArquivo(${produto.id}, ${stl.id})">&times;</button>
                `;
                document.getElementById('previewSTL').appendChild(div);
            });

            // Mostra GIF existente
            gifs.forEach(gif => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <img src="${gif.caminho}" alt="GIF existente">
                    <button type="button" class="remove-btn" onclick="excluirArquivo(${produto.id}, ${gif.id})">&times;</button>
                `;
                if (previewGIF) previewGIF.appendChild(div);
            });
        }

        document.getElementById('produto3DModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar produto:', error);
        alert('Erro ao carregar produto');
    }
}

// Excluir arquivo
async function excluirArquivo(produtoId, arquivoId) {
    if (!confirm('Deseja excluir este arquivo?')) return;

    try {
        await apiDelete(`/api/produtos-3d/${produtoId}/arquivo/${arquivoId}`);
        await editarProduto(produtoId); // Recarrega o modal
    } catch (error) {
        console.error('Erro ao excluir arquivo:', error);
        alert('Erro ao excluir arquivo');
    }
}

// Excluir produto
async function excluirProduto(id) {
    if (!confirm('Deseja excluir este produto 3D e todos os seus arquivos?')) return;

    try {
        await apiDelete(`/api/produtos-3d/${id}`);
        await carregarProdutos();
        alert('Produto excluído com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir produto');
    }
}

// Ver detalhes do produto
async function verDetalhes(id) {
    try {
        const produto = await apiGet(`/api/produtos-3d/${id}`);

        document.getElementById('detalhesTitulo').textContent = produto.titulo;
        document.getElementById('detalhesNome').textContent = produto.titulo;
        document.getElementById('detalhesCategoria').textContent = produto.categoria_nome || 'Sem categoria';
        document.getElementById('detalhesSubcategoria').textContent = produto.subcategoria_nome || '-';
        document.getElementById('detalhesUsuario').textContent = produto.usuario_nome || 'Desconhecido';
        document.getElementById('detalhesDescricao').textContent = produto.descricao || 'Sem descrição';

        // Imagens
        const imagensDiv = document.getElementById('detalhesImagens');
        const imagens = produto.arquivos?.filter(a => a.tipo === 'imagem') || [];
        if (imagens.length > 0) {
            // Armazena caminhos globalmente para navegação
            window.imagensDoDetalhe = imagens.map(img => img.caminho);

            imagensDiv.innerHTML = imagens.map((img, index) => `
                <img src="${img.caminho}" alt="${img.nome_arquivo}" onclick="ampliarImagemComNavegacao(${index})">
            `).join('');
        } else {
            imagensDiv.innerHTML = '<p style="color: #8892b0;">Nenhuma imagem</p>';
        }

        // Vídeos
        const videosDiv = document.getElementById('detalhesVideos');
        const videos = produto.arquivos?.filter(a => a.tipo === 'video') || [];
        if (videos.length > 0) {
            videosDiv.innerHTML = videos.map(video => `
                <video controls>
                    <source src="${video.caminho}" type="video/mp4">
                    Seu navegador não suporta vídeo.
                </video>
            `).join('');
        } else {
            videosDiv.innerHTML = '<p style="color: #8892b0;">Nenhum vídeo</p>';
        }

        // Arquivos STL
        const stlLista = document.getElementById('arquivosSTLLista');
        const stls = produto.arquivos?.filter(a => a.tipo === 'stl') || [];
        if (stls.length > 0) {
            stlLista.innerHTML = stls.map(stl => `
                <div class="arquivo-stl-item">
                    <span onclick="carregarSTL('${stl.caminho}', this.parentElement)">
                        <i class="fas fa-cube"></i> ${stl.nome_arquivo}
                    </span>
                    <div class="arquivo-acoes">
                        <i class="fas fa-eye" onclick="carregarSTL('${stl.caminho}', this.closest('.arquivo-stl-item'))" title="Visualizar"></i>
                        <i class="fas fa-download" onclick="downloadArquivoIndividual('${stl.caminho}', '${stl.nome_arquivo}')" title="Download direto"></i>
                    </div>
                </div>
            `).join('');

            // Carrega o primeiro STL automaticamente
            carregarSTL(stls[0].caminho, stlLista.querySelector('.arquivo-stl-item'));
        } else {
            stlLista.innerHTML = '<p style="color: #8892b0;">Nenhum arquivo STL</p>';
            document.getElementById('stlViewerContainer').innerHTML = `
                <p style="color: #8892b0; text-align: center; padding-top: 130px;">
                    Nenhum arquivo STL disponível
                </p>
            `;
        }

        // Botão download
        document.getElementById('btnDownloadTodos').onclick = () => downloadProduto(id);

        document.getElementById('detalhesModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        alert('Erro ao carregar detalhes do produto');
    }
}

// Fechar modal de detalhes
function fecharModalDetalhes() {
    document.getElementById('detalhesModal').style.display = 'none';

    // Limpa o viewer STL
    const container = document.getElementById('stlViewerContainer');
    container.innerHTML = `
        <p style="color: #8892b0; text-align: center; padding-top: 130px;">
            Selecione um arquivo STL para visualizar
        </p>
    `;
    stlViewer = null;
}

// Carregar e visualizar STL
async function carregarSTL(caminho, elemento) {
    // Marca item ativo
    document.querySelectorAll('.arquivo-stl-item').forEach(el => el.classList.remove('active'));
    if (elemento) elemento.classList.add('active');

    const container = document.getElementById('stlViewerContainer');
    container.innerHTML = '<p style="color: #64ffda; text-align: center; padding-top: 130px;"><i class="fas fa-spinner fa-spin"></i> Carregando modelo 3D...</p>';

    try {
        // Primeiro, busca o arquivo e valida
        console.log('Carregando STL de:', caminho);
        const response = await fetch(caminho);

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        console.log('Content-Type recebido:', contentType);

        // Se recebeu HTML, provavelmente é página de erro
        if (contentType.includes('text/html')) {
            throw new Error('Servidor retornou página HTML ao invés do arquivo STL. Verifique se o arquivo existe no servidor.');
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log('Tamanho do arquivo:', arrayBuffer.byteLength, 'bytes');

        // Valida tamanho mínimo (STL binário tem header de 84 bytes)
        if (arrayBuffer.byteLength < 84) {
            throw new Error('Arquivo muito pequeno para ser um STL válido');
        }

        // Verifica se parece ser um STL válido (binário ou ASCII)
        const header = new Uint8Array(arrayBuffer, 0, 80);
        const headerText = String.fromCharCode.apply(null, header);
        const isAscii = headerText.toLowerCase().startsWith('solid');

        // Para binário, verifica se o número de triângulos faz sentido
        if (!isAscii) {
            const dataView = new DataView(arrayBuffer);
            const numTriangles = dataView.getUint32(80, true);
            const expectedSize = 84 + (numTriangles * 50);

            console.log('STL Binário - Triângulos:', numTriangles, '- Tamanho esperado:', expectedSize);

            // Valida se o tamanho faz sentido (com tolerância de alguns bytes)
            if (Math.abs(arrayBuffer.byteLength - expectedSize) > 100) {
                console.warn('Tamanho do arquivo não corresponde ao esperado. Arquivo pode estar corrompido ou não é STL.');
            }
        } else {
            console.log('STL ASCII detectado');
        }

        // Cria cena Three.js
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a192f);

        const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);

        container.innerHTML = '';
        container.appendChild(renderer.domElement);

        // Controles
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;

        // Luzes
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight2.position.set(-1, -1, -1);
        scene.add(directionalLight2);

        // Carrega STL usando parse() com o ArrayBuffer já validado
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(arrayBuffer);

        const material = new THREE.MeshPhongMaterial({
            color: 0x64ffda,
            specular: 0x111111,
            shininess: 200
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Centraliza o modelo
        geometry.center();

        // Ajusta escala para caber na visualização
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 100 / maxDim;
        mesh.scale.set(scale, scale, scale);

        scene.add(mesh);

        // Posiciona câmera
        camera.position.set(0, 0, 150);
        controls.update();

        // Adiciona controles na UI
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'stl-controls';
        controlsDiv.innerHTML = `
            <button onclick="resetSTLView()">Reset View</button>
        `;
        container.appendChild(controlsDiv);

        // Armazena referência
        stlViewer = { scene, camera, renderer, controls, mesh };

        // Animação
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

    } catch (error) {
        console.error('Erro ao carregar STL:', error);
        container.innerHTML = `
            <p style="color: #e74c3c; text-align: center; padding-top: 100px;">
                <i class="fas fa-exclamation-triangle"></i><br>
                Erro ao carregar arquivo STL<br>
                <small style="color: #a8b2d1;">${error.message}</small>
            </p>
        `;
    }
}

// Reset da visualização STL
function resetSTLView() {
    if (stlViewer) {
        stlViewer.camera.position.set(0, 0, 150);
        stlViewer.controls.reset();
    }
}

// Ampliar imagem com navegação usando índice (chamada do detalhe)
function ampliarImagemComNavegacao(index) {
    if (window.imagensDoDetalhe && window.imagensDoDetalhe.length > 0) {
        imagensAtuais = window.imagensDoDetalhe;
        imagemAtualIndex = index;
        abrirGaleria();
    }
}

// Ampliar imagem simples (sem navegação)
function ampliarImagem(src) {
    imagensAtuais = [src];
    imagemAtualIndex = 0;
    abrirGaleria();
}

// Abrir galeria de imagens
function abrirGaleria() {
    const modal = document.getElementById('imagemAmpliadaModal');
    const miniaturasContainer = document.getElementById('galeriaMiniaturas');

    // Gera as miniaturas
    miniaturasContainer.innerHTML = imagensAtuais.map((src, i) => `
        <div class="galeria-miniatura ${i === imagemAtualIndex ? 'active' : ''}" onclick="selecionarImagem(${i})">
            <img src="${src}" alt="Miniatura ${i + 1}">
        </div>
    `).join('');

    // Atualiza imagem principal
    atualizarImagemGaleria();

    // Mostra modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Fechar galeria
function fecharGaleria() {
    const modal = document.getElementById('imagemAmpliadaModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Selecionar imagem por miniatura
function selecionarImagem(index) {
    imagemAtualIndex = index;
    atualizarImagemGaleria();
    atualizarMiniaturaAtiva();
}

// Atualizar imagem principal da galeria
function atualizarImagemGaleria() {
    const img = document.getElementById('imagemAmpliada');
    img.src = imagensAtuais[imagemAtualIndex];
}

// Atualizar miniatura ativa
function atualizarMiniaturaAtiva() {
    const miniaturas = document.querySelectorAll('.galeria-miniatura');
    miniaturas.forEach((m, i) => {
        m.classList.toggle('active', i === imagemAtualIndex);
    });
}

// Navegar entre imagens
function navegarImagem(direcao) {
    imagemAtualIndex += direcao;

    // Loop circular
    if (imagemAtualIndex >= imagensAtuais.length) {
        imagemAtualIndex = 0;
    } else if (imagemAtualIndex < 0) {
        imagemAtualIndex = imagensAtuais.length - 1;
    }

    atualizarImagemGaleria();
    atualizarMiniaturaAtiva();
}

// Mostrar loading de download
function mostrarLoadingDownload(texto, progresso = 0) {
    const overlay = document.getElementById('loadingOverlayDownload');
    const textoEl = document.getElementById('loadingTextDownload');
    const progressBar = document.getElementById('downloadProgressBar');
    const progressText = document.getElementById('downloadProgressText');

    if (textoEl) textoEl.textContent = texto;
    if (progressBar) progressBar.style.width = `${progresso}%`;
    if (progressText) progressText.textContent = progresso > 0 ? `${progresso}%` : 'Aguarde...';
    if (overlay) overlay.classList.add('active');
}

// Esconder loading de download
function esconderLoadingDownload() {
    const overlay = document.getElementById('loadingOverlayDownload');
    const progressBar = document.getElementById('downloadProgressBar');
    if (overlay) overlay.classList.remove('active');
    if (progressBar) progressBar.style.width = '0%';
}

// Download de todos os arquivos do produto (cria ZIP no navegador)
async function downloadProduto(id) {
    try {
        mostrarLoadingDownload('Carregando arquivos...', 10);

        // Busca dados do produto
        const produto = await apiGet(`/api/produtos-3d/${id}`);
        const arquivos = produto.arquivos || [];

        if (arquivos.length === 0) {
            esconderLoadingDownload();
            alert('Nenhum arquivo disponível para download');
            return;
        }

        // Se só tem 1 arquivo, baixa direto
        if (arquivos.length === 1) {
            const arq = arquivos[0];
            await downloadArquivoIndividual(arq.caminho, arq.nome_arquivo);
            return;
        }

        mostrarLoadingDownload('Baixando arquivos...', 20);

        // Cria ZIP no navegador com os arquivos
        const zip = new JSZip();
        let progresso = 20;
        const incremento = 60 / arquivos.length;

        for (const arq of arquivos) {
            try {
                const response = await fetch(arq.caminho);
                if (response.ok) {
                    const blob = await response.blob();
                    const pasta = arq.tipo + 's'; // imagens, videos, stls
                    zip.file(`${pasta}/${arq.nome_arquivo}`, blob);
                }
                progresso += incremento;
                mostrarLoadingDownload('Preparando arquivos...', Math.round(progresso));
            } catch (e) {
                console.warn(`Erro ao baixar ${arq.nome_arquivo}:`, e);
            }
        }

        mostrarLoadingDownload('Gerando ZIP...', 85);

        // Gera o ZIP (rápido pois arquivos já estão comprimidos)
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE' // Não recomprime - arquivos já estão comprimidos
        });

        mostrarLoadingDownload('Baixando...', 95);

        // Faz download
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        const nomeArquivo = produto.titulo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        a.download = `${nomeArquivo}_3D.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        esconderLoadingDownload();
    } catch (error) {
        console.error('Erro ao baixar produto:', error);
        esconderLoadingDownload();
        alert('Erro ao baixar arquivos: ' + error.message);
    }
}

// Download de arquivo individual (direto, sem ZIP)
async function downloadArquivoIndividual(caminho, nomeArquivo) {
    try {
        mostrarLoadingDownload('Baixando arquivo...', 50);

        const response = await fetch(caminho);
        if (!response.ok) throw new Error('Erro ao baixar');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        esconderLoadingDownload();
    } catch (error) {
        console.error('Erro ao baixar arquivo:', error);
        esconderLoadingDownload();
        alert('Erro ao baixar arquivo');
    }
}

// ============================================
// Funções de Categorias (Admin)
// ============================================

// Abrir modal de categorias
async function abrirModalCategorias() {
    await carregarListaCategorias();
    document.getElementById('categoriasModal').style.display = 'flex';
}

// Fechar modal de categorias
function fecharModalCategorias() {
    document.getElementById('categoriasModal').style.display = 'none';
}

// Carregar lista de categorias no modal
async function carregarListaCategorias() {
    try {
        const categorias = await apiGet('/api/produtos-3d/categorias');
        const lista = document.getElementById('categoriasLista');

        if (categorias.length === 0) {
            lista.innerHTML = '<p style="color: #8892b0; text-align: center;">Nenhuma categoria cadastrada</p>';
            return;
        }

        lista.innerHTML = categorias.map(cat => `
            <div class="categoria-item">
                <span class="nome">${cat.nome}</span>
                <div class="acoes">
                    <button style="background: #ffc107; color: #000;" onclick="editarCategoria(${cat.id}, '${cat.nome}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button style="background: #e74c3c; color: #fff;" onclick="excluirCategoria(${cat.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

// Criar categoria
async function criarCategoria(e) {
    e.preventDefault();

    const nome = document.getElementById('novaCategoriaNome').value;
    if (!nome) return;

    try {
        await apiPost('/api/produtos-3d/categorias', { nome });
        document.getElementById('novaCategoriaNome').value = '';
        await carregarListaCategorias();
        await carregarCategorias();
        alert('Categoria criada com sucesso!');
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        alert('Erro ao criar categoria: ' + (error.message || 'Erro desconhecido'));
    }
}

// Editar categoria
async function editarCategoria(id, nomeAtual) {
    const novoNome = prompt('Novo nome da categoria:', nomeAtual);
    if (!novoNome || novoNome === nomeAtual) return;

    try {
        await apiPut(`/api/produtos-3d/categorias/${id}`, { nome: novoNome });
        await carregarListaCategorias();
        await carregarCategorias();
        alert('Categoria atualizada com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        alert('Erro ao atualizar categoria: ' + (error.message || 'Erro desconhecido'));
    }
}

// Excluir categoria
async function excluirCategoria(id) {
    if (!confirm('Deseja excluir esta categoria? Esta ação não poderá ser desfeita.')) return;

    try {
        await apiDelete(`/api/produtos-3d/categorias/${id}`);
        await carregarListaCategorias();
        await carregarCategorias();
        alert('Categoria excluída com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        alert('Erro ao excluir categoria: ' + (error.message || 'Possui produtos vinculados'));
    }
}

// ============================================
// Funções de Progresso de Upload
// ============================================

// Mostra o overlay de progresso
function showUploadProgress() {
    const overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) {
        overlay.classList.add('active');
        // Reset estado inicial
        document.getElementById('uploadProgressTitle').textContent = 'Salvando Produto...';
        document.getElementById('uploadStageName').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando...';
        document.getElementById('uploadStagePercent').textContent = '0%';
        document.getElementById('uploadStageBar').style.width = '0%';
        document.getElementById('uploadFileName').textContent = '-';
        document.getElementById('uploadOverallPercent').textContent = '0%';
        document.getElementById('uploadOverallBar').style.width = '0%';
        document.getElementById('uploadWarningLarge').style.display = 'none';
    }
}

// Esconde o overlay de progresso
function hideUploadProgress() {
    const overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Atualiza o estágio atual do upload
function updateUploadStage(icon, text, percent, filename) {
    const stageName = document.getElementById('uploadStageName');
    const stagePercent = document.getElementById('uploadStagePercent');
    const stageBar = document.getElementById('uploadStageBar');
    const fileNameEl = document.getElementById('uploadFileName');

    if (stageName) {
        stageName.innerHTML = `<i class="fas fa-${icon}"></i> ${text}`;
    }
    if (stagePercent) {
        stagePercent.textContent = `${percent}%`;
    }
    if (stageBar) {
        stageBar.style.width = `${percent}%`;
    }
    if (fileNameEl) {
        fileNameEl.textContent = filename || '-';
    }
}

// Atualiza o progresso geral
function updateOverallProgress(currentStep, totalSteps) {
    const percent = Math.round((currentStep / totalSteps) * 100);
    const overallPercent = document.getElementById('uploadOverallPercent');
    const overallBar = document.getElementById('uploadOverallBar');

    if (overallPercent) {
        overallPercent.textContent = `${percent}%`;
    }
    if (overallBar) {
        overallBar.style.width = `${percent}%`;
    }
}

// Atualiza as estatísticas de upload
function updateUploadStats(imagesComplete, imagesTotal, videosComplete, videosTotal, stlComplete, stlTotal, gifComplete, gifTotal) {
    const statImages = document.getElementById('uploadStatImages');
    const statVideos = document.getElementById('uploadStatVideos');
    const statSTL = document.getElementById('uploadStatSTL');
    const statGIF = document.getElementById('uploadStatGIF');

    if (statImages) {
        statImages.textContent = imagesTotal > 0 ? `${imagesComplete}/${imagesTotal}` : '0';
    }
    if (statVideos) {
        statVideos.textContent = videosTotal > 0 ? `${videosComplete}/${videosTotal}` : '0';
    }
    if (statSTL) {
        statSTL.textContent = stlTotal > 0 ? `${stlComplete}/${stlTotal}` : '0';
    }
    if (statGIF) {
        statGIF.textContent = gifTotal > 0 ? `${gifComplete}/${gifTotal}` : '0';
    }
}

// Upload com progresso usando XMLHttpRequest
function uploadFormDataWithProgress(endpoint, method, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const token = localStorage.getItem('erp_token');
        const apiBaseUrl = localStorage.getItem('api_base_url') || 'https://erp-api-call.autoservto.com.br';

        const xhr = new XMLHttpRequest();
        xhr.open(method, `${apiBaseUrl}${endpoint}`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        // Progresso do upload
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                if (onProgress) {
                    onProgress(percent, event.loaded, event.total);
                }
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    resolve(xhr.responseText);
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText);
                    reject(new Error(error.detail || `Erro HTTP ${xhr.status}`));
                } catch (e) {
                    reject(new Error(`Erro HTTP ${xhr.status}`));
                }
            }
        };

        xhr.onerror = () => {
            reject(new Error('Erro de conexão. Verifique sua internet e tente novamente.'));
        };

        xhr.ontimeout = () => {
            reject(new Error('Tempo limite excedido. O arquivo pode ser muito grande.'));
        };

        // Timeout de 10 minutos para arquivos grandes
        xhr.timeout = 600000;

        xhr.send(formData);
    });
}

// ============================================
// Funções auxiliares de API com FormData
// ============================================

async function apiPostFormData(endpoint, formData) {
    const token = localStorage.getItem('erp_token');
    const apiBaseUrl = localStorage.getItem('api_base_url') || 'https://erp-api-call.autoservto.com.br';

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro na requisição');
    }

    return response.json();
}

async function apiPutFormData(endpoint, formData) {
    const token = localStorage.getItem('erp_token');
    const apiBaseUrl = localStorage.getItem('api_base_url') || 'https://erp-api-call.autoservto.com.br';

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro na requisição');
    }

    return response.json();
}
