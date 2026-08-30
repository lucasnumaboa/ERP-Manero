// Exportar Catálogo - Gera PDF com produtos selecionados

// Variáveis globais
let categoriasDisponiveis = [];
let produtosDisponiveis = [];
let produtosSelecionados = [];
let vendedorLogado = null;

// Abre o modal de exportar catálogo
async function abrirExportarCatalogo() {
    // Carrega dados do vendedor logado
    await carregarVendedorLogado();

    // Carrega categorias e produtos
    await carregarDadosParaCatalogo();

    // Limpa seleções anteriores
    produtosSelecionados = [];

    // Abre o modal
    document.getElementById('exportarCatalogoModal').style.display = 'flex';
}

// Carrega dados do vendedor vinculado ao usuário logado
async function carregarVendedorLogado() {
    const vendedorInfo = document.getElementById('catalogoVendedorInfo');

    try {
        // Busca o vendedor vinculado ao usuário logado
        const vendedor = await apiGet('/api/vendedores/me/vinculado');

        if (vendedor) {
            vendedorLogado = vendedor;
            vendedorInfo.innerHTML = `
                <div class="vendedor-info-display">
                    <div class="vendedor-info-item">
                        <i class="fas fa-user"></i>
                        <span><strong>Vendedor:</strong> ${vendedor.nome}</span>
                    </div>
                    <div class="vendedor-info-item">
                        <i class="fas fa-phone"></i>
                        <span><strong>Celular:</strong> ${vendedor.telefone || 'Não informado'}</span>
                    </div>
                </div>
            `;
        } else {
            vendedorLogado = null;
            vendedorInfo.innerHTML = `
                <div class="vendedor-info-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>Nenhum vendedor vinculado ao seu usuário. Contate o administrador.</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao carregar vendedor:', error);
        vendedorLogado = null;
        vendedorInfo.innerHTML = `
            <div class="vendedor-info-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Nenhum vendedor vinculado ao seu usuário. Contate o administrador.</span>
            </div>
        `;
    }
}

// Carrega categorias e produtos para o modal
async function carregarDadosParaCatalogo() {
    try {
        // Carrega produtos com estoque, faturáveis e com foto
        const produtos = await apiGet('/api/estoque/produtos', {
            com_estoque: true,
            ativo: true,
            faturavel: true,
            com_foto: true
        });
        produtosDisponiveis = produtos || [];

        // Filtra categorias que têm produtos disponíveis (com estoque, faturáveis, com foto)
        const categoriasComProdutos = [...new Set(produtosDisponiveis.map(p => p.categoria_id).filter(id => id))];

        // Carrega todas as categorias e filtra apenas as que têm produtos
        const todasCategorias = await apiGet('/api/categorias');
        categoriasDisponiveis = (todasCategorias || []).filter(cat => categoriasComProdutos.includes(cat.id));

        // Renderiza as categorias
        renderizarCategoriasCatalogo();

        // Renderiza os produtos
        renderizarProdutosCatalogo();

    } catch (error) {
        console.error('Erro ao carregar dados para catálogo:', error);
        alert('Erro ao carregar dados. Tente novamente.');
    }
}

// Renderiza as categorias no modal
function renderizarCategoriasCatalogo() {
    const container = document.getElementById('catalogoCategoriasContainer');

    if (!categoriasDisponiveis || categoriasDisponiveis.length === 0) {
        container.innerHTML = '<p class="text-muted">Nenhuma categoria encontrada</p>';
        return;
    }

    let html = '';
    categoriasDisponiveis.forEach(cat => {
        // Conta quantos produtos tem nessa categoria
        const qtdProdutos = produtosDisponiveis.filter(p => p.categoria_id === cat.id).length;

        html += `
            <div class="catalogo-checkbox-item">
                <input type="checkbox" id="cat_${cat.id}" class="catalogo-categoria-checkbox" 
                       data-categoria-id="${cat.id}" onchange="filtrarProdutosPorCategoria()">
                <label for="cat_${cat.id}">${cat.nome} (${qtdProdutos})</label>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Obtém a URL base da API
async function getApiBaseUrlCatalogo() {
    try {
        if (typeof getBaseUrl === 'function') {
            return await getBaseUrl();
        }
    } catch (e) {
        console.log('Usando URL padrão para catálogo');
    }
    return 'https://erp-api-call.autoservto.com.br';
}

// Renderiza os produtos no modal
async function renderizarProdutosCatalogo(produtosFiltrados = null) {
    const container = document.getElementById('catalogoProdutosContainer');
    const produtos = produtosFiltrados || produtosDisponiveis;

    if (!produtos || produtos.length === 0) {
        container.innerHTML = '<p class="text-muted">Nenhum produto encontrado</p>';
        return;
    }

    const baseUrl = await getApiBaseUrlCatalogo();

    let html = '';
    produtos.forEach(prod => {
        const isChecked = produtosSelecionados.includes(prod.id) ? 'checked' : '';
        const primeiraImagem = prod.caminho_imagem ? prod.caminho_imagem.split(',')[0].trim() : '';
        const imagemUrl = primeiraImagem ? `${baseUrl}/uploads/${primeiraImagem.replace('uploads/', '')}` : '';

        html += `
            <div class="catalogo-produto-item ${isChecked ? 'selecionado' : ''}">
                <input type="checkbox" id="prod_${prod.id}" class="catalogo-produto-checkbox" 
                       data-produto-id="${prod.id}" ${isChecked} onchange="toggleProdutoSelecionado(${prod.id})">
                <label for="prod_${prod.id}" class="catalogo-produto-label">
                    ${imagemUrl ? `<img src="${imagemUrl}" alt="${prod.nome}" class="catalogo-produto-thumb">` :
                `<div class="catalogo-produto-thumb-placeholder"><i class="fas fa-image"></i></div>`}
                    <div class="catalogo-produto-info">
                        <span class="catalogo-produto-nome">${prod.nome}</span>
                        <span class="catalogo-produto-preco">${formatarMoedaCatalogo(prod.preco_venda)}</span>
                    </div>
                </label>
            </div>
        `;
    });

    container.innerHTML = html;
    atualizarContadorSelecionados();
}

// Filtra produtos por categorias selecionadas
function filtrarProdutosPorCategoria() {
    const checkboxes = document.querySelectorAll('.catalogo-categoria-checkbox:checked');
    const categoriasSelecionadas = Array.from(checkboxes).map(cb => parseInt(cb.dataset.categoriaId));

    if (categoriasSelecionadas.length === 0) {
        // Se nenhuma categoria selecionada, mostra todos
        renderizarProdutosCatalogo();
    } else {
        // Filtra produtos pelas categorias selecionadas
        const produtosFiltrados = produtosDisponiveis.filter(p => categoriasSelecionadas.includes(p.categoria_id));
        renderizarProdutosCatalogo(produtosFiltrados);
    }
}

// Toggle seleção de produto
function toggleProdutoSelecionado(produtoId) {
    const index = produtosSelecionados.indexOf(produtoId);

    if (index === -1) {
        produtosSelecionados.push(produtoId);
    } else {
        produtosSelecionados.splice(index, 1);
    }

    // Atualiza visual do item
    const item = document.querySelector(`#prod_${produtoId}`).closest('.catalogo-produto-item');
    if (item) {
        item.classList.toggle('selecionado', produtosSelecionados.includes(produtoId));
    }

    atualizarContadorSelecionados();
}

// Seleciona todos os produtos visíveis
function selecionarTodosProdutos() {
    const checkboxes = document.querySelectorAll('.catalogo-produto-checkbox');
    checkboxes.forEach(cb => {
        const produtoId = parseInt(cb.dataset.produtoId);
        if (!produtosSelecionados.includes(produtoId)) {
            produtosSelecionados.push(produtoId);
        }
        cb.checked = true;
        cb.closest('.catalogo-produto-item').classList.add('selecionado');
    });
    atualizarContadorSelecionados();
}

// Limpa seleção de produtos
function limparSelecaoProdutos() {
    produtosSelecionados = [];
    const checkboxes = document.querySelectorAll('.catalogo-produto-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.closest('.catalogo-produto-item').classList.remove('selecionado');
    });
    atualizarContadorSelecionados();
}

// Atualiza contador de produtos selecionados
function atualizarContadorSelecionados() {
    const contador = document.getElementById('catalogoContadorSelecionados');
    if (contador) {
        contador.textContent = `${produtosSelecionados.length} produto(s) selecionado(s)`;
    }
}

// Formata valor em moeda
function formatarMoedaCatalogo(valor) {
    return valor ? `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
}

// Variáveis para alteração de preços
let precosAlterados = {}; // {produtoId: novoPreco}
let usuarioLogadoId = null;

// Função para recuperar o ID do usuário logado
async function carregarUsuarioLogadoId() {
    try {
        const usuario = await apiGet('/api/usuarios/me');
        if (usuario) {
            usuarioLogadoId = usuario.id;
            console.log('[Catalogo] Usuário logado ID:', usuarioLogadoId);
        }
    } catch (error) {
        console.error('Erro ao carregar usuário logado:', error);
    }
}

// Inicia a geração do catálogo - pergunta se quer alterar preços
async function iniciarGeracaoCatalogo() {
    // Verifica se tem vendedor logado
    if (!vendedorLogado) {
        alert('Nenhum vendedor vinculado ao seu usuário. Contate o administrador.');
        return;
    }

    if (!vendedorLogado.telefone) {
        alert('O vendedor não possui telefone cadastrado. Atualize o cadastro do vendedor.');
        return;
    }

    if (produtosSelecionados.length === 0) {
        alert('Por favor, selecione pelo menos um produto.');
        return;
    }

    // Carrega ID do usuário logado se ainda não foi carregado
    if (!usuarioLogadoId) {
        await carregarUsuarioLogadoId();
    }

    // Pergunta se deseja alterar os preços
    if (confirm('Deseja alterar o preço dos produtos antes de gerar o catálogo?')) {
        abrirAlterarPrecosModal();
    } else {
        // Gera PDF diretamente sem alteração de preços
        precosAlterados = {};
        await gerarCatalogoPDF();
    }
}

// Abre o modal de alteração de preços
function abrirAlterarPrecosModal() {
    const tbody = document.getElementById('alterarPrecosBody');
    if (!tbody) {
        console.error('Tabela de preços não encontrada');
        return;
    }

    // Limpa preços alterados
    precosAlterados = {};

    // Filtra os produtos selecionados
    const produtosParaAlterar = produtosDisponiveis.filter(p => produtosSelecionados.includes(p.id));

    // Preenche a tabela
    tbody.innerHTML = '';
    produtosParaAlterar.forEach(produto => {
        // Verifica se o produto é do usuário logado
        const produtoProprio = produto.usuario_id === usuarioLogadoId;
        const precoOriginal = parseFloat(produto.preco_venda) || 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                ${produto.nome}
                ${produtoProprio ? '<span style="color: #28a745; font-size: 11px;"> (Seu)</span>' : '<span style="color: #6c757d; font-size: 11px;"> (Terceiro)</span>'}
            </td>
            <td style="text-align: right;">${formatarMoedaCatalogo(precoOriginal)}</td>
            <td>
                <input type="number" 
                       class="form-control preco-input" 
                       data-produto-id="${produto.id}"
                       data-preco-original="${precoOriginal}"
                       data-produto-proprio="${produtoProprio}"
                       value="${precoOriginal.toFixed(2)}"
                       min="0"
                       step="0.01"
                       style="width: 100%; text-align: right;">
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Exibe o modal
    const modal = document.getElementById('alterarPrecosModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

// Fecha o modal de alteração de preços
function fecharAlterarPrecosModal() {
    const modal = document.getElementById('alterarPrecosModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
}

// Confirma os preços e gera o PDF
async function confirmarPrecosEGerarPDF() {
    const inputs = document.querySelectorAll('.preco-input');
    let erros = [];

    // Valida cada input
    inputs.forEach(input => {
        const produtoId = parseInt(input.dataset.produtoId);
        const precoOriginal = parseFloat(input.dataset.precoOriginal);
        const produtoProprio = input.dataset.produtoProprio === 'true';
        const novoPreco = parseFloat(input.value) || 0;

        // Verifica regra: produtos de terceiros só podem ter preço aumentado
        if (!produtoProprio && novoPreco < precoOriginal) {
            const produto = produtosDisponiveis.find(p => p.id === produtoId);
            erros.push(`"${produto?.nome || 'Produto'}" é de terceiro - preço só pode ser aumentado (original: ${formatarMoedaCatalogo(precoOriginal)})`);
        }

        // Armazena o preço alterado se for diferente
        if (novoPreco !== precoOriginal) {
            precosAlterados[produtoId] = novoPreco;
        }
    });

    // Se houver erros, mostra e não continua
    if (erros.length > 0) {
        alert('Erros encontrados:\n\n' + erros.join('\n'));
        return;
    }

    console.log('[Catalogo] Preços alterados:', precosAlterados);

    // Fecha o modal
    fecharAlterarPrecosModal();

    // Gera o PDF
    await gerarCatalogoPDF();
}


// Gera o PDF do catálogo
async function gerarCatalogoPDF() {
    // Verifica se tem vendedor logado
    if (!vendedorLogado) {
        alert('Nenhum vendedor vinculado ao seu usuário. Contate o administrador.');
        return;
    }

    if (!vendedorLogado.telefone) {
        alert('O vendedor não possui telefone cadastrado. Atualize o cadastro do vendedor.');
        return;
    }

    if (produtosSelecionados.length === 0) {
        alert('Por favor, selecione pelo menos um produto.');
        return;
    }

    // Mostra loading
    const btnGerar = document.getElementById('btnGerarCatalogo');
    const btnConfirmar = document.getElementById('btnConfirmarPrecos');
    const textoOriginal = btnGerar?.innerHTML || '';
    if (btnGerar) {
        btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        btnGerar.disabled = true;
    }
    if (btnConfirmar) {
        btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        btnConfirmar.disabled = true;
    }

    try {
        // Filtra os produtos selecionados
        let produtosParaPDF = produtosDisponiveis.filter(p => produtosSelecionados.includes(p.id));

        // Aplica os preços alterados (apenas para o PDF, não salva no banco)
        if (Object.keys(precosAlterados).length > 0) {
            console.log('[Catalogo] Aplicando preços alterados:', precosAlterados);
            produtosParaPDF = produtosParaPDF.map(produto => {
                if (precosAlterados[produto.id] !== undefined) {
                    return {
                        ...produto,
                        preco_venda: precosAlterados[produto.id]
                    };
                }
                return produto;
            });
        }

        // Gera o PDF com dados do vendedor logado
        await criarPDFCatalogo(vendedorLogado.nome, vendedorLogado.telefone, produtosParaPDF);

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
        if (btnGerar) {
            btnGerar.innerHTML = textoOriginal || '<i class="fas fa-file-pdf"></i> Gerar PDF';
            btnGerar.disabled = false;
        }
        if (btnConfirmar) {
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar e Gerar PDF';
            btnConfirmar.disabled = false;
        }
    }
}

// Cria o PDF do catálogo usando jsPDF - Organizado por Categorias
async function criarPDFCatalogo(vendedorNome, vendedorCelular, produtos) {
    // Verifica se jsPDF está disponível
    if (typeof window.jspdf === 'undefined') {
        alert('Biblioteca jsPDF não carregada. Recarregue a página.');
        return;
    }

    const baseUrl = await getApiBaseUrlCatalogo();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const headerHeight = 25;
    const categoryHeaderHeight = 12;

    // Configurações do grid de produtos (3x3 = 9 por página)
    const cols = 3;
    const rows = 3;

    const contentWidth = pageWidth - (margin * 2);

    const cellWidth = contentWidth / cols;
    const cellHeight = 75; // Altura fixa para cada célula de produto
    const imageSize = 45; // Tamanho da imagem

    let currentY = headerHeight + margin;
    let currentPage = 1;
    let totalPages = 1;

    // Função para desenhar o cabeçalho do vendedor
    function desenharCabecalhoVendedor() {
        // Fundo do cabeçalho
        doc.setFillColor(74, 108, 247); // Azul do sistema
        doc.rect(0, 0, pageWidth, headerHeight, 'F');

        // Nome do vendedor
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(vendedorNome, margin, 10);

        // Celular do vendedor
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cel: ${vendedorCelular}`, margin, 18);

        // Data
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        doc.setFontSize(9);
        doc.text(`Catalogo gerado em: ${dataAtual}`, pageWidth - margin - 50, 18);
    }

    // Função para desenhar cabeçalho de categoria
    function desenharCabecalhoCategoria(nomeCategoria, y) {
        // Linha decorativa
        doc.setDrawColor(74, 108, 247);
        doc.setLineWidth(0.5);

        // Calcula largura do texto
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const textWidth = doc.getTextWidth(nomeCategoria);
        const lineWidth = (contentWidth - textWidth - 20) / 2;

        // Linha esquerda
        doc.line(margin, y + 5, margin + lineWidth, y + 5);

        // Texto da categoria
        doc.setTextColor(74, 108, 247);
        doc.text(nomeCategoria, pageWidth / 2, y + 7, { align: 'center' });

        // Linha direita
        doc.line(pageWidth - margin - lineWidth, y + 5, pageWidth - margin, y + 5);

        return y + categoryHeaderHeight;
    }

    // Função para carregar imagem como base64 com timeout para performance
    async function carregarImagemBase64(url) {
        return new Promise((resolve) => {
            // Timeout de 5 segundos para cada imagem
            const timeout = setTimeout(() => {
                console.log('Timeout ao carregar imagem:', url);
                resolve(null);
            }, 5000);

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    // Reduzido para 200px para melhor performance
                    const maxSize = 200;
                    let width = img.width;
                    let height = img.height;

                    // Redimensiona mantendo proporção
                    if (width > height) {
                        if (width > maxSize) {
                            height = Math.round(height * maxSize / width);
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width = Math.round(width * maxSize / height);
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    // Reduzida qualidade para 0.7 para melhor performance
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                } catch (e) {
                    console.error('Erro ao processar imagem:', e);
                    resolve(null);
                }
            };
            img.onerror = function () {
                clearTimeout(timeout);
                console.log('Erro ao carregar imagem:', url);
                resolve(null);
            };
            // Adiciona timestamp para evitar cache
            img.src = url + '?t=' + Date.now();
        });
    }

    // Função para adicionar nova página
    function novaPagina() {
        doc.addPage();
        currentPage++;
        totalPages++;
        desenharCabecalhoVendedor();
        currentY = headerHeight + margin;
    }

    // Função para verificar se precisa de nova página
    function verificarEspaco(alturaNeeded) {
        if (currentY + alturaNeeded > pageHeight - 15) {
            novaPagina();
            return true;
        }
        return false;
    }

    // Agrupa produtos por categoria
    const produtosPorCategoria = {};
    produtos.forEach(produto => {
        const catNome = produto.categoria_nome || 'Sem Categoria';
        if (!produtosPorCategoria[catNome]) {
            produtosPorCategoria[catNome] = [];
        }
        produtosPorCategoria[catNome].push(produto);
    });

    // Ordena categorias alfabeticamente
    const categoriasOrdenadas = Object.keys(produtosPorCategoria).sort();

    // Pré-carrega todas as imagens em paralelo para melhor performance
    console.log('Carregando imagens dos produtos...');
    const imagensCarregadas = {};

    // Cria array de promessas para carregar imagens em paralelo
    const promessasImagens = produtos.map(async (produto) => {
        if (produto.caminho_imagem) {
            const primeiraImagem = produto.caminho_imagem.split(',')[0].trim();
            if (primeiraImagem) {
                const imagemPath = primeiraImagem.replace('uploads/', '').replace(/^\//g, '');
                const imagemUrl = `${baseUrl}/uploads/${imagemPath}`;
                try {
                    const imgBase64 = await carregarImagemBase64(imagemUrl);
                    if (imgBase64) {
                        imagensCarregadas[produto.id] = imgBase64;
                    }
                } catch (e) {
                    console.log('Erro ao carregar imagem do produto:', produto.id);
                }
            }
        }
    });

    // Aguarda todas as imagens carregarem em paralelo
    await Promise.all(promessasImagens);
    console.log('Imagens carregadas:', Object.keys(imagensCarregadas).length);

    // Desenha cabeçalho inicial
    desenharCabecalhoVendedor();

    // Processa cada categoria
    for (const categoria of categoriasOrdenadas) {
        const produtosCategoria = produtosPorCategoria[categoria];

        // Verifica espaço para cabeçalho da categoria + pelo menos uma linha de produtos
        verificarEspaco(categoryHeaderHeight + cellHeight);

        // Desenha cabeçalho da categoria
        currentY = desenharCabecalhoCategoria(categoria, currentY);

        // Desenha produtos da categoria em grid
        let col = 0;

        for (let i = 0; i < produtosCategoria.length; i++) {
            const produto = produtosCategoria[i];

            // Se é início de nova linha, verifica espaço
            if (col === 0) {
                verificarEspaco(cellHeight);
            }

            const x = margin + (col * cellWidth);
            const y = currentY;

            // Borda do produto
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.3);
            doc.roundedRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4, 3, 3, 'S');

            // Imagem do produto
            const imgBase64 = imagensCarregadas[produto.id];
            if (imgBase64) {
                try {
                    const imgX = x + (cellWidth - imageSize) / 2;
                    const imgY = y + 5;
                    doc.addImage(imgBase64, 'JPEG', imgX, imgY, imageSize, imageSize);
                } catch (e) {
                    console.error('Erro ao adicionar imagem ao PDF:', e);
                }
            } else {
                // Placeholder se não tem imagem
                doc.setFillColor(240, 240, 240);
                const imgX = x + (cellWidth - imageSize) / 2;
                const imgY = y + 5;
                doc.roundedRect(imgX, imgY, imageSize, imageSize, 2, 2, 'F');
                doc.setTextColor(180, 180, 180);
                doc.setFontSize(8);
                doc.text('Sem imagem', x + cellWidth / 2, imgY + imageSize / 2, { align: 'center' });
            }

            // Nome do produto (truncado se necessário)
            doc.setTextColor(51, 51, 51);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');

            let nomeProduto = produto.nome;
            const maxNomeWidth = cellWidth - 8;
            while (doc.getTextWidth(nomeProduto) > maxNomeWidth && nomeProduto.length > 0) {
                nomeProduto = nomeProduto.slice(0, -1);
            }
            if (nomeProduto !== produto.nome && nomeProduto.length > 3) {
                nomeProduto = nomeProduto.slice(0, -3) + '...';
            }

            const nomeY = y + imageSize + 12;
            doc.text(nomeProduto, x + cellWidth / 2, nomeY, { align: 'center' });

            // Preço do produto
            doc.setTextColor(74, 108, 247);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            const precoFormatado = formatarMoedaCatalogo(produto.preco_venda);
            const precoY = nomeY + 6;
            doc.text(precoFormatado, x + cellWidth / 2, precoY, { align: 'center' });

            // Avança para próxima coluna
            col++;
            if (col >= cols) {
                col = 0;
                currentY += cellHeight;
            }
        }

        // Se não completou a linha, avança para próxima linha
        if (col > 0) {
            currentY += cellHeight;
        }

        // Espaço entre categorias
        currentY += 5;
    }

    // Adiciona número de página em todas as páginas
    const totalPaginasFinal = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginasFinal; i++) {
        doc.setPage(i);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.text(`Pagina ${i} de ${totalPaginasFinal}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    }

    // Salva o PDF
    const nomeArquivo = `catalogo_${vendedorNome.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nomeArquivo);

    const totalCategorias = categoriasOrdenadas.length;
    alert(`Catalogo gerado com sucesso!\n${produtos.length} produto(s) em ${totalCategorias} categoria(s).`);
}

// Fecha o modal de exportar catálogo
function fecharExportarCatalogo() {
    document.getElementById('exportarCatalogoModal').style.display = 'none';
}

// Inicializa eventos do modal
document.addEventListener('DOMContentLoaded', function () {
    // Fecha modal ao clicar no X
    const closeBtn = document.querySelector('#exportarCatalogoModal .close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', fecharExportarCatalogo);
    }

    // REMOVIDO: Fechar modal ao clicar fora
    // Modais agora só fecham ao clicar no X ou botão Cancelar/Fechar
});
