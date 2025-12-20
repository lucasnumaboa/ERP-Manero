// Exportar Estoque - JavaScript

// Variáveis globais
let todosProdutos = [];
let produtosSelecionados = new Set();
let produtosAlterados = {}; // Armazena alterações de título/descrição

document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Configura o botão de logout
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        logout();
    });

    // Configura o botão de toggle do sidebar
    document.getElementById('toggleSidebar').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    // Carrega os dados do usuário
    loadUserData();

    // Carrega as categorias
    loadCategorias();

    // Carrega os produtos
    loadProdutos();

    // Configura os eventos
    setupEventListeners();
});

// Carrega os dados do usuário do localStorage
function loadUserData() {
    const userData = getUserData();
    if (userData) {
        document.getElementById('userName').textContent = userData.nome || 'Usuário';
        document.getElementById('userRole').textContent = formatRole(userData.nivel_acesso) || 'Usuário';
    }
}

// Formata o nível de acesso para exibição
function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'vendedor': 'Vendedor',
        'comprador': 'Comprador',
        'financeiro': 'Financeiro'
    };
    return roles[role] || role;
}

// Carrega as categorias para o filtro
async function loadCategorias() {
    const select = document.getElementById('filtroCategoria');
    select.innerHTML = '<option value="">Todas as categorias</option>';
    
    try {
        const categorias = await apiGet('/api/categorias');
        
        if (categorias && Array.isArray(categorias) && categorias.length > 0) {
            categorias.forEach(categoria => {
                const option = document.createElement('option');
                option.value = categoria.id;
                option.textContent = categoria.nome;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

// Carrega os produtos com filtros
async function loadProdutos() {
    const termoPesquisa = document.getElementById('filtroPesquisa').value.trim();
    const categoriaId = document.getElementById('filtroCategoria').value || null;
    
    // Prepara os parâmetros de consulta
    // Sempre filtra: estoque > 0 e faturavel = true
    const queryParams = {
        com_estoque: true,
        faturavel: true
    };
    
    if (termoPesquisa) {
        queryParams.nome = termoPesquisa;
    }
    
    if (categoriaId) {
        queryParams.categoria_id = categoriaId;
    }
    
    // Mostra mensagem de carregamento
    document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando produtos...</td></tr>';
    
    try {
        const data = await apiGet('/api/estoque/produtos', queryParams);
        
        if (data && Array.isArray(data)) {
            // Filtra apenas produtos com estoque > 0, faturavel = true e que tenham foto
            todosProdutos = data.filter(p => 
                p.estoque_atual > 0 && 
                (p.faturavel === true || p.faturavel === 1) &&
                p.caminho_imagem && p.caminho_imagem.trim() !== ''
            );
            
            // Ordena por código
            todosProdutos.sort((a, b) => a.id - b.id);
            
            // Limpa seleção
            produtosSelecionados.clear();
            updateSelectionCount();
            document.getElementById('selectAll').checked = false;
            
            // Exibe os produtos
            displayProdutos(todosProdutos);
        } else {
            document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Nenhum produto encontrado.</td></tr>';
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar produtos. Tente novamente.</td></tr>';
    }
}

// Exibe os produtos na tabela
function displayProdutos(produtos) {
    const tableBody = document.getElementById('produtosTableBody');
    
    if (!produtos || produtos.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto encontrado com estoque, faturável e com foto</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    produtos.forEach(produto => {
        const row = document.createElement('tr');
        row.dataset.produtoId = produto.id;
        
        // Cria o elemento de imagem
        let imagemHtml = '';
        if (produto.caminho_imagem) {
            const primeiraImagem = produto.caminho_imagem.split(',')[0].trim();
            if (primeiraImagem) {
                const imagemUrl = getImageUrl(primeiraImagem);
                imagemHtml = `<img src="${imagemUrl}" alt="${produto.nome}" class="produto-thumbnail" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                              <div class="produto-thumbnail-placeholder" style="display:none;"><i class="fas fa-image"></i></div>`;
            } else {
                imagemHtml = `<div class="produto-thumbnail-placeholder"><i class="fas fa-image"></i></div>`;
            }
        } else {
            imagemHtml = `<div class="produto-thumbnail-placeholder"><i class="fas fa-image"></i></div>`;
        }
        
        const isSelected = produtosSelecionados.has(produto.id);
        
        row.innerHTML = `
            <td class="text-center">
                <input type="checkbox" class="produto-checkbox produto-select" data-id="${produto.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td>${imagemHtml}</td>
            <td>${produto.codigo || '-'}</td>
            <td>${produto.nome}</td>
            <td>${produto.categoria_nome || '-'}</td>
            <td class="text-center">${produto.estoque_atual}</td>
            <td class="text-right">${formatNumber(produto.preco_venda)}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Adiciona eventos aos checkboxes
    document.querySelectorAll('.produto-select').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const produtoId = parseInt(this.dataset.id);
            if (this.checked) {
                produtosSelecionados.add(produtoId);
            } else {
                produtosSelecionados.delete(produtoId);
            }
            updateSelectionCount();
            updateSelectAllCheckbox();
        });
    });
}

// Variável para armazenar a URL base da API
let apiBaseUrlCache = null;

// Obtém a URL base da API (usa cache para evitar múltiplas requisições)
async function getApiBaseUrlCached() {
    if (apiBaseUrlCache) {
        return apiBaseUrlCache;
    }
    
    // Tenta usar a função do api.js se disponível
    if (typeof getApiBaseUrl === 'function') {
        apiBaseUrlCache = await getApiBaseUrl();
        return apiBaseUrlCache;
    }
    
    // Fallback: tenta obter do localStorage
    const storedUrl = localStorage.getItem('api_base_url');
    if (storedUrl) {
        apiBaseUrlCache = storedUrl;
        return apiBaseUrlCache;
    }
    
    // Último fallback
    apiBaseUrlCache = 'http://localhost:8000';
    return apiBaseUrlCache;
}

// Obtém a URL da imagem (usa URL dinâmica da API)
async function getImageUrlAsync(caminhoImagem) {
    const baseUrl = await getApiBaseUrlCached();
    // Remove 'uploads/' se já estiver no caminho, mantém o resto
    return `${baseUrl}/uploads/${caminhoImagem.replace('uploads/', '')}`;
}

// Obtém a URL da imagem (versão síncrona usando cache)
function getImageUrl(caminhoImagem) {
    const baseUrl = apiBaseUrlCache || 'http://localhost:8000';
    // Remove 'uploads/' se já estiver no caminho, mantém o resto
    return `${baseUrl}/uploads/${caminhoImagem.replace('uploads/', '')}`;
}

// Obtém a URL da imagem para download no ZIP
// Usa o mesmo formato que funciona no estoque.js: /uploads/produtos/{nomeArquivo}
function getImageDownloadUrl(caminhoImagem) {
    const baseUrl = apiBaseUrlCache || 'http://localhost:8000';
    // Extrai apenas o nome do arquivo
    const nomeArquivo = caminhoImagem.split('/').pop();
    return `${baseUrl}/uploads/produtos/${nomeArquivo}`;
}

// Formata números para exibição
function formatNumber(value) {
    return value ? `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
}

// Atualiza o contador de seleção
function updateSelectionCount() {
    document.getElementById('selectionCount').textContent = produtosSelecionados.size;
    document.getElementById('btnExportar').disabled = produtosSelecionados.size === 0;
}

// Atualiza o checkbox "Selecionar Todos"
function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAll');
    const totalProdutos = todosProdutos.length;
    const totalSelecionados = produtosSelecionados.size;
    
    if (totalSelecionados === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else if (totalSelecionados === totalProdutos) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

// Configura os event listeners
function setupEventListeners() {
    // Botão Aplicar Filtros
    document.getElementById('btnAplicarFiltros').addEventListener('click', loadProdutos);
    
    // Botão Limpar Filtros
    document.getElementById('btnLimparFiltros').addEventListener('click', function() {
        document.getElementById('filtroPesquisa').value = '';
        document.getElementById('filtroCategoria').value = '';
        loadProdutos();
    });
    
    // Enter no campo de pesquisa
    document.getElementById('filtroPesquisa').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadProdutos();
        }
    });
    
    // Checkbox Selecionar Todos
    document.getElementById('selectAll').addEventListener('change', function() {
        const isChecked = this.checked;
        
        if (isChecked) {
            todosProdutos.forEach(p => produtosSelecionados.add(p.id));
        } else {
            produtosSelecionados.clear();
        }
        
        // Atualiza os checkboxes na tabela
        document.querySelectorAll('.produto-select').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        
        updateSelectionCount();
    });
    
    // Botão Exportar - Agora abre modal de confirmação
    document.getElementById('btnExportar').addEventListener('click', abrirModalEdicao);
    
    // Eventos do Modal de Edição
    document.getElementById('btnFecharModalEdicao').addEventListener('click', fecharModalEdicao);
    document.getElementById('btnCancelarEdicao').addEventListener('click', fecharModalEdicao);
    document.getElementById('btnExportarSemAlterar').addEventListener('click', () => exportarProdutos(false));
    document.getElementById('btnExportarComAlteracoes').addEventListener('click', () => exportarProdutos(true));
    
    // Fechar modal ao clicar fora
    document.getElementById('modalEdicao').addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalEdicao();
        }
    });
}

// Abre o modal de edição antes de exportar
function abrirModalEdicao() {
    if (produtosSelecionados.size === 0) {
        alert('Selecione pelo menos um produto para exportar.');
        return;
    }
    
    // Limpa alterações anteriores
    produtosAlterados = {};
    
    // Preenche o modal com os produtos selecionados
    const container = document.getElementById('produtosEdicaoContainer');
    const produtosParaEditar = todosProdutos.filter(p => produtosSelecionados.has(p.id));
    
    container.innerHTML = produtosParaEditar.map(produto => {
        // Cria o elemento de imagem
        let imagemHtml = '';
        if (produto.caminho_imagem) {
            const primeiraImagem = produto.caminho_imagem.split(',')[0].trim();
            if (primeiraImagem) {
                const imagemUrl = getImageUrl(primeiraImagem);
                imagemHtml = `<img src="${imagemUrl}" alt="${produto.nome}" class="produto-edicao-imagem" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                              <div class="produto-edicao-imagem-placeholder" style="display:none;"><i class="fas fa-image"></i></div>`;
            } else {
                imagemHtml = `<div class="produto-edicao-imagem-placeholder"><i class="fas fa-image"></i></div>`;
            }
        } else {
            imagemHtml = `<div class="produto-edicao-imagem-placeholder"><i class="fas fa-image"></i></div>`;
        }
        
        return `
            <div class="produto-edicao-item" data-produto-id="${produto.id}">
                ${imagemHtml}
                <div class="produto-edicao-campos">
                    <div class="produto-edicao-info">
                        <strong>Código:</strong> ${produto.codigo || '-'} | 
                        <strong>Categoria:</strong> ${produto.categoria_nome || '-'} | 
                        <strong>Preço Original:</strong> ${formatNumber(produto.preco_venda)}
                    </div>
                    <div class="campo-edicao">
                        <label for="titulo-${produto.id}">Título:</label>
                        <input type="text" id="titulo-${produto.id}" value="${escapeHtml(produto.nome)}" 
                               data-original="${escapeHtml(produto.nome)}" 
                               onchange="registrarAlteracao(${produto.id}, 'nome', this.value)">
                    </div>
                    <div class="campo-edicao">
                        <label for="preco-${produto.id}">Preço de Venda (mínimo: ${formatNumber(produto.preco_venda)}):</label>
                        <input type="number" id="preco-${produto.id}" 
                               value="${produto.preco_venda ? parseFloat(produto.preco_venda).toFixed(2) : '0.00'}" 
                               data-original="${produto.preco_venda ? parseFloat(produto.preco_venda).toFixed(2) : '0.00'}"
                               data-min="${produto.preco_venda ? parseFloat(produto.preco_venda).toFixed(2) : '0.00'}"
                               step="0.01" min="${produto.preco_venda ? parseFloat(produto.preco_venda).toFixed(2) : '0.00'}"
                               onchange="validarPreco(${produto.id}, this)">
                    </div>
                    <div class="campo-edicao">
                        <label for="descricao-${produto.id}">Descrição:</label>
                        <textarea id="descricao-${produto.id}" rows="2"
                                  data-original="${escapeHtml(produto.descricao || '')}" 
                                  onchange="registrarAlteracao(${produto.id}, 'descricao', this.value)">${escapeHtml(produto.descricao || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Exibe o modal
    document.getElementById('modalEdicao').style.display = 'flex';
}

// Fecha o modal de edição
function fecharModalEdicao() {
    document.getElementById('modalEdicao').style.display = 'none';
}

// Registra alteração feita pelo usuário
function registrarAlteracao(produtoId, campo, valor) {
    if (!produtosAlterados[produtoId]) {
        produtosAlterados[produtoId] = {};
    }
    produtosAlterados[produtoId][campo] = valor;
}

// Valida e registra alteração de preço
function validarPreco(produtoId, input) {
    const valorMinimo = parseFloat(input.dataset.min) || 0;
    const valorAtual = parseFloat(input.value) || 0;
    
    if (valorAtual < valorMinimo) {
        alert(`O preço não pode ser menor que o valor original: ${formatNumber(valorMinimo)}`);
        input.value = valorMinimo.toFixed(2);
        return;
    }
    
    registrarAlteracao(produtoId, 'preco_venda', valorAtual);
}

// Escapa HTML para evitar XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exporta os produtos selecionados - Agrupados por categoria
async function exportarProdutos(usarAlteracoes = false) {
    if (produtosSelecionados.size === 0) {
        alert('Selecione pelo menos um produto para exportar.');
        return;
    }
    
    // Inicializa o cache da URL da API antes de começar
    await getApiBaseUrlCached();
    console.log('URL da API para imagens:', apiBaseUrlCache);
    
    // Se usar alterações, coleta os valores atuais dos campos
    if (usarAlteracoes) {
        const produtosParaEditar = todosProdutos.filter(p => produtosSelecionados.has(p.id));
        produtosParaEditar.forEach(produto => {
            const tituloInput = document.getElementById(`titulo-${produto.id}`);
            const descricaoInput = document.getElementById(`descricao-${produto.id}`);
            const precoInput = document.getElementById(`preco-${produto.id}`);
            
            if (tituloInput && tituloInput.value !== produto.nome) {
                registrarAlteracao(produto.id, 'nome', tituloInput.value);
            }
            if (descricaoInput && descricaoInput.value !== (produto.descricao || '')) {
                registrarAlteracao(produto.id, 'descricao', descricaoInput.value);
            }
            if (precoInput) {
                const precoOriginal = parseFloat(produto.preco_venda) || 0;
                const precoNovo = parseFloat(precoInput.value) || 0;
                if (precoNovo !== precoOriginal && precoNovo >= precoOriginal) {
                    registrarAlteracao(produto.id, 'preco_venda', precoNovo);
                }
            }
        });
    }
    
    // Fecha o modal
    fecharModalEdicao();
    
    // Mostra o loading
    showLoading('Preparando exportação...');
    
    try {
        const produtosParaExportar = todosProdutos.filter(p => produtosSelecionados.has(p.id));
        const total = produtosParaExportar.length;
        
        // Agrupa produtos por categoria
        const produtosPorCategoria = {};
        for (const produto of produtosParaExportar) {
            const categoria = produto.categoria_nome || 'Sem_Categoria';
            if (!produtosPorCategoria[categoria]) {
                produtosPorCategoria[categoria] = [];
            }
            produtosPorCategoria[categoria].push(produto);
        }
        
        const categorias = Object.keys(produtosPorCategoria);
        const totalCategorias = categorias.length;
        let processados = 0;
        let zipsGerados = 0;
        
        console.log(`Exportando ${total} produtos em ${totalCategorias} categoria(s):`, categorias);
        
        // Processa cada categoria e gera um ZIP separado
        for (const categoria of categorias) {
            const produtosCategoria = produtosPorCategoria[categoria];
            const zip = new JSZip();
            
            updateProgress(processados, total, `Processando categoria: ${categoria}`);
            
            for (const produto of produtosCategoria) {
                processados++;
                
                // Aplica alterações se existirem
                const produtoExportacao = { ...produto };
                if (usarAlteracoes && produtosAlterados[produto.id]) {
                    if (produtosAlterados[produto.id].nome) {
                        produtoExportacao.nome = produtosAlterados[produto.id].nome;
                    }
                    if (produtosAlterados[produto.id].descricao !== undefined) {
                        produtoExportacao.descricao = produtosAlterados[produto.id].descricao;
                    }
                    if (produtosAlterados[produto.id].preco_venda !== undefined) {
                        produtoExportacao.preco_venda = produtosAlterados[produto.id].preco_venda;
                    }
                }
                
                updateProgress(processados, total, `[${categoria}] Processando: ${produtoExportacao.nome}`);
                
                // Cria o nome da pasta (sanitizado) - usa o nome alterado se houver
                const nomePasta = sanitizeFolderName(produtoExportacao.nome);
                const pasta = zip.folder(nomePasta);
                
                // Cria o CSV com as informações do produto (com alterações se houver)
                const csvContent = criarCSV(produtoExportacao);
                pasta.file('produto.csv', csvContent);
                
                // Adiciona as imagens
                if (produto.caminho_imagem) {
                    // Faz split por vírgula, remove espaços e filtra vazios
                    let imagens = produto.caminho_imagem.split(',').map(img => img.trim()).filter(img => img);
                    
                    // Remove duplicatas (usando Set)
                    imagens = [...new Set(imagens)];
                    
                    console.log(`Produto ${produto.nome}: ${imagens.length} imagem(ns) encontrada(s):`, imagens);
                    
                    let imagemIndex = 1; // Contador para nomear as imagens exportadas
                    
                    for (let i = 0; i < imagens.length; i++) {
                        try {
                            // Tenta primeiro a URL de exibição, depois a de download
                            let imagemUrl = getImageUrl(imagens[i]);
                            console.log(`[${i+1}/${imagens.length}] Tentando baixar: ${imagemUrl}`);
                            let imagemBlob = await fetchImageAsBlob(imagemUrl);
                            
                            // Se não conseguiu, tenta a URL alternativa
                            if (!imagemBlob || imagemBlob.size === 0) {
                                imagemUrl = getImageDownloadUrl(imagens[i]);
                                console.log(`[${i+1}/${imagens.length}] Tentando URL alternativa: ${imagemUrl}`);
                                imagemBlob = await fetchImageAsBlob(imagemUrl);
                            }
                            
                            if (imagemBlob && imagemBlob.size > 0) {
                                // Extrai a extensão do arquivo
                                const extensao = getFileExtension(imagens[i]);
                                const nomeImagem = `imagem_${imagemIndex}${extensao}`;
                                pasta.file(nomeImagem, imagemBlob);
                                console.log(`✓ Imagem adicionada: ${nomeImagem} (${imagemBlob.size} bytes)`);
                                imagemIndex++;
                            } else {
                                console.warn(`✗ Imagem não encontrada ou vazia: ${imagens[i]}`);
                            }
                        } catch (imgError) {
                            console.warn(`✗ Erro ao baixar imagem ${imagens[i]}:`, imgError);
                        }
                    }
                    
                    console.log(`Produto ${produto.nome}: ${imagemIndex - 1} imagem(ns) exportada(s) de ${imagens.length} encontrada(s)`);
                }
            }
            
            // Gera o ZIP para esta categoria
            updateProgress(processados, total, `Gerando ZIP: ${categoria}...`);
            
            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            
            // Cria o nome do arquivo ZIP baseado na categoria
            const nomeCategoriaSanitizado = sanitizeFolderName(categoria).toLowerCase();
            const nomeArquivo = `${nomeCategoriaSanitizado}.zip`;
            
            downloadBlob(zipBlob, nomeArquivo);
            zipsGerados++;
            
            console.log(`✓ ZIP gerado: ${nomeArquivo} (${produtosCategoria.length} produtos)`);
            
            // Pequeno delay entre downloads para evitar problemas no navegador
            if (zipsGerados < totalCategorias) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        hideLoading();
        alert(`Exportação concluída!\n${total} produto(s) exportado(s) em ${zipsGerados} arquivo(s) ZIP por categoria.`);
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        hideLoading();
        alert('Erro ao exportar produtos. Tente novamente.');
    }
}

// Cria o conteúdo CSV do produto
function criarCSV(produto) {
    // Cabeçalho
    const header = 'nome_produto;preco_venda;categoria;condicao;descricao';
    
    // Dados do produto
    const nome = escapeCsvField(produto.nome);
    const preco = produto.preco_venda ? parseFloat(produto.preco_venda).toFixed(2).replace('.', ',') : '0,00';
    const categoria = escapeCsvField(produto.categoria_nome || '');
    const condicao = 'Usado — estado de novo';
    const descricao = escapeCsvField(produto.descricao || '');
    
    const linha = `${nome};${preco};${categoria};${condicao};${descricao}`;
    
    // Adiciona BOM para UTF-8
    return '\ufeff' + header + '\n' + linha;
}

// Escapa campos CSV
function escapeCsvField(field) {
    if (!field) return '';
    // Se contém ponto e vírgula, aspas ou quebra de linha, envolve em aspas
    if (field.includes(';') || field.includes('"') || field.includes('\n')) {
        return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
}

// Sanitiza o nome da pasta
function sanitizeFolderName(nome) {
    // Remove caracteres inválidos para nomes de pasta
    return nome
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100); // Limita o tamanho
}

// Obtém a extensão do arquivo
function getFileExtension(filename) {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : '.jpg';
}

// Baixa uma imagem como Blob
async function fetchImageAsBlob(url) {
    try {
        // Primeira tentativa: fetch normal com CORS
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit', // Não envia cookies para evitar problemas de CORS
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.blob();
    } catch (error) {
        console.warn('Erro ao baixar imagem via fetch:', error);
        
        // Segunda tentativa: usar Image para contornar CORS
        try {
            return await fetchImageViaCanvas(url);
        } catch (canvasError) {
            console.warn('Erro ao baixar imagem via canvas:', canvasError);
            return null;
        }
    }
}

// Baixa imagem usando canvas (contorna alguns problemas de CORS)
async function fetchImageViaCanvas(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Tenta com CORS
        
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob(function(blob) {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Falha ao converter canvas para blob'));
                    }
                }, 'image/jpeg', 0.95);
            } catch (e) {
                reject(e);
            }
        };
        
        img.onerror = function() {
            reject(new Error('Falha ao carregar imagem'));
        };
        
        // Adiciona timestamp para evitar cache
        img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    });
}

// Faz o download de um Blob
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Mostra o loading
function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Esconde o loading
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Atualiza o progresso
function updateProgress(current, total, text) {
    const percent = Math.round((current / total) * 100);
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = percent + '%';
    if (text) {
        document.getElementById('loadingText').textContent = text;
    }
}
