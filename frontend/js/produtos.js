// Verifica se o usuário está autenticado
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

    // Carrega a lista de produtos
    loadProdutos();
    
    // Carrega as categorias para o dropdown
    loadCategorias();

    // Configura os botões de ação
    setupActionButtons();
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

// Carrega a lista de produtos da API
async function loadProdutos() {
    // Mostra mensagem de carregamento
    document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando produtos...</td></tr>';
    
    // Obtém valores dos filtros
    const categoria = document.getElementById('filtroCategoria').value;
    const status = document.getElementById('filtroStatus').value;
    
    // Prepara os parâmetros de consulta
    const queryParams = {};
    if (categoria) queryParams.categoria_id = categoria;
    if (status !== '') queryParams.ativo = status;
    
    console.log('Filtros aplicados:', { categoria_id: categoria, ativo: status });
    
    try {
        // Usa a API centralizada
        const data = await apiGet('/api/produtos', queryParams);
        
        // Inicializa a paginação com os dados obtidos
        window.currentDisplayFunction = displayProdutos;
        initPagination(data, displayProdutos);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        
        // Adiciona um indicador de status na tabela
        document.getElementById('produtosTableBody').innerHTML = 
            `<tr><td colspan="9" class="text-center">
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Erro ao carregar produtos: ${error.message}
                    <button class="btn btn-sm btn-outline-danger ml-2" onclick="loadProdutos()">Tentar novamente</button>
                </div>
            </td></tr>`;
            
        // Verifica se é um problema de URL da API
        if (error.message.includes('404') || error.message.includes('conexão')) {
            // Tenta sincronizar a URL da API
            tryAlternativeEndpoint();
        }
    }
}

// Exibe os produtos na tabela
function displayProdutos(produtos) {
    console.log('Exibindo produtos na tabela:', produtos ? produtos.length : 0, 'produtos');
    
    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) {
        console.error('Elemento tbody não encontrado!');
        return;
    }
    
    if (!produtos || produtos.length === 0) {
        console.log('Nenhum produto encontrado para exibir');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum produto encontrado</td></tr>';
        return;
    }
    
    console.log('Limpando tabela e adicionando', produtos.length, 'produtos');
    tbody.innerHTML = '';
    
    produtos.forEach((produto, index) => {
        console.log(`Renderizando produto ${index + 1}/${produtos.length}:`, produto.id, produto.nome);
        
        const row = document.createElement('tr');
        
        // Status com cor
        const statusClass = produto.ativo ? 'status-active' : 'status-inactive';
        const statusText = produto.ativo ? 'Ativo' : 'Inativo';
        
        // Verificar se há imagem e criar o elemento de imagem
        let imagemHtml = '';
        if (produto.caminho_imagem) {
            // Pega apenas a primeira imagem se houver múltiplas (separadas por vírgula)
            const primeiraImagem = produto.caminho_imagem.split(',')[0].trim();
            if (primeiraImagem) {
                imagemHtml = `<img src="http://localhost:8000/uploads/${primeiraImagem.replace('uploads/', '')}" alt="${produto.nome}" class="produto-thumbnail" style="width: 40px; height: 40px; object-fit: cover; margin-right: 10px;">`;
            }
        }
        
        row.innerHTML = `
            <td>${produto.codigo || produto.id}</td>
            <td>${imagemHtml}${produto.nome}</td>
            <td>${produto.categoria_nome || 'Não categorizado'}</td>
            <td>R$ ${formatNumber(produto.preco_custo || 0)}</td>
            <td>R$ ${formatNumber(produto.preco_venda)}</td>
            <td>R$ ${formatNumber(produto.comissao || 0)}</td>
            <td>${produto.estoque_atual || 0}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                <button class="btn-icon btn-edit" data-id="${produto.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${produto.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        // Adiciona evento de clique na linha para abrir o modal (exceto nos botões de ação)
        row.addEventListener('click', function(e) {
            // Se o clique não foi em um botão de ação
            if (!e.target.closest('.btn-icon')) {
                console.log(`Linha clicada para o produto ID: ${produto.id}`);
                openProdutoModal(produto.id);
            }
        });
        
        tbody.appendChild(row);
    });
    
    console.log('Configurando botões de ação nas linhas da tabela');
    
    // Adiciona event listeners para os botões de editar e excluir
    const editButtons = document.querySelectorAll('.btn-edit');
    console.log(`Encontrados ${editButtons.length} botões de editar`);
    
    editButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Previne comportamento padrão
            e.stopPropagation(); // Impede que o evento de clique se propague para a linha
            
            const id = this.getAttribute('data-id');
            console.log(`Botão editar clicado para o produto ID: ${id}`);
            
            // Pequeno atraso para garantir que o evento seja registrado corretamente
            setTimeout(() => {
                openProdutoModal(id);
            }, 10);
        });
    });
    
    const deleteButtons = document.querySelectorAll('.btn-delete');
    console.log(`Encontrados ${deleteButtons.length} botões de excluir`);
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Previne comportamento padrão
            e.stopPropagation(); // Impede que o evento de clique se propague para a linha
            
            const id = this.getAttribute('data-id');
            console.log(`Botão excluir clicado para o produto ID: ${id}`);
            
            // Pequeno atraso para garantir que o evento seja registrado corretamente
            setTimeout(() => {
                deleteProduto(id);
            }, 10);
        });
    });
    
    console.log('Produtos exibidos e eventos configurados com sucesso!');
}

// Formata números para exibição
function formatNumber(value) {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tenta endpoints alternativos para obter a URL da API
async function tryAlternativeEndpoint() {
    console.log('Tentando endpoints alternativos para sincronizar URL da API...');
    
    // Obtém a URL atual da API
    const currentApiUrl = getApiBaseUrl();
    console.log('URL atual da API:', currentApiUrl);
    
    try {
        // Cria um controller para abortar a requisição se demorar muito
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos de timeout
        
        // Primeiro tenta o endpoint de status
        const statusUrl = `${currentApiUrl}/api/configuracoes/status`;
        console.log('Tentando endpoint de status:', statusUrl);
        
        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        }).catch(error => {
            console.log('Endpoint de status não disponível:', error);
            return null;
        });
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
            const data = await response.json();
            
            // Se a URL da API no servidor for diferente da armazenada localmente
            if (data.api_url && data.api_url !== currentApiUrl) {
                console.log(`Atualizando URL da API: ${currentApiUrl} -> ${data.api_url}`);
                localStorage.setItem('api_base_url', data.api_url);
                
                // Exibe mensagem e recarrega a página após 2 segundos
                showApiUrlChangedAlert(data.api_url);
                setTimeout(() => location.reload(), 2000);
                return true;
            }
            return true;
        }
        
        // Se o endpoint de status falhar, tenta o endpoint link_api
        console.log('Tentando endpoint link_api...');
        const linkApiUrl = `${currentApiUrl}/api/configuracoes/link_api`;
        
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
        
        const response2 = await fetch(linkApiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller2.signal
        }).catch(error => {
            console.log('Endpoint link_api não disponível:', error);
            return null;
        });
        
        clearTimeout(timeoutId2);
        
        if (response2 && response2.ok) {
            const data = await response2.json();
            
            if (data.valor && data.valor !== currentApiUrl) {
                console.log(`Atualizando URL da API: ${currentApiUrl} -> ${data.valor}`);
                localStorage.setItem('api_base_url', data.valor);
                
                // Exibe mensagem e recarrega a página após 2 segundos
                showApiUrlChangedAlert(data.valor);
                setTimeout(() => location.reload(), 2000);
                return true;
            }
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Erro ao tentar endpoints alternativos:', error);
        return false;
    }
}

// Exibe alerta de mudança na URL da API
function showApiUrlChangedAlert(newUrl) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-warning alert-dismissible fade show';
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '10px';
    alertDiv.style.left = '50%';
    alertDiv.style.transform = 'translateX(-50%)';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
    alertDiv.style.width = 'auto';
    alertDiv.style.maxWidth = '90%';
    
    alertDiv.innerHTML = `
        <strong>Atenção!</strong> A URL da API foi atualizada para: ${newUrl}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Remove o alerta após 5 segundos
    setTimeout(() => {
        if (document.body.contains(alertDiv)) {
            document.body.removeChild(alertDiv);
        }
    }, 5000);
}

// Carrega as categorias para o dropdown
async function loadCategorias() {
    console.log('Carregando categorias da API...');
    
    const selectCategoria = document.getElementById('filtroCategoria');
    const selectCategoriaModal = document.getElementById('categoria_id');
    
    if (!selectCategoria && !selectCategoriaModal) {
        console.error('Elementos de seleção de categoria não encontrados!');
        return;
    }
    
    try {
        // Usa a API centralizada
        console.log('Enviando requisição GET para /api/categorias');
        const categorias = await apiGet('/api/categorias');
        console.log('Categorias recebidas da API:', categorias);
        
        // Adiciona a opção "Todas" apenas para o filtro
        if (selectCategoria) {
            console.log('Preenchendo dropdown de filtro de categorias');
            selectCategoria.innerHTML = '<option value="">Todas as categorias</option>';
            
            if (categorias && categorias.length > 0) {
                categorias.forEach(categoria => {
                    console.log(`Adicionando categoria ao filtro: ID=${categoria.id}, Nome=${categoria.nome}, Produtos=${categoria.produtos_count || 0}`);
                    const option = document.createElement('option');
                    option.value = categoria.id;
                    option.textContent = categoria.nome;
                    selectCategoria.appendChild(option);
                });
            } else {
                console.log('Nenhuma categoria recebida da API');
            }
        }
        
        // Adiciona as opções ao select do modal
        if (selectCategoriaModal) {
            console.log('Preenchendo dropdown de categorias no modal');
            selectCategoriaModal.innerHTML = '<option value="">Selecione...</option>';
            
            if (categorias && categorias.length > 0) {
                categorias.forEach(categoria => {
                    console.log(`Adicionando categoria ao modal: ID=${categoria.id}, Nome=${categoria.nome}`);
                    const option = document.createElement('option');
                    option.value = categoria.id;
                    option.textContent = categoria.nome;
                    selectCategoriaModal.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        
        // Adiciona mensagem de erro nos dropdowns
        const errorOption = document.createElement('option');
        errorOption.value = "";
        errorOption.textContent = "Erro ao carregar categorias";
        errorOption.disabled = true;
        
        if (selectCategoria) {
            selectCategoria.innerHTML = '';
            selectCategoria.appendChild(errorOption.cloneNode(true));
        }
        
        if (selectCategoriaModal) {
            selectCategoriaModal.innerHTML = '';
            selectCategoriaModal.appendChild(errorOption.cloneNode(true));
        }
        
        // Verifica se é um problema de URL da API
        if (error.message.includes('404') || error.message.includes('conexão')) {
            // Tenta sincronizar a URL da API
            tryAlternativeEndpoint();
        }
    }
}

// Configura os botões de ação
function setupActionButtons() {
    console.log('Configurando botões de ação...');
    
    // Botão Novo Produto
    const btnNovoProduto = document.getElementById('btnNovoProduto');
    if (btnNovoProduto) {
        console.log('Botão Novo Produto encontrado, adicionando event listener');
        btnNovoProduto.addEventListener('click', function(e) {
            console.log('Botão Novo Produto clicado!');
            e.preventDefault();

            console.log('Chamando openProdutoModal()...');
            
            // Verificar se o modal existe antes de tentar abri-lo
            const modal = document.getElementById('produtoModal');
            console.log('Modal encontrado:', modal);
            
            openProdutoModal();
        });
    } else {
        console.error('Botão Novo Produto não encontrado no DOM!');
    }
    
    // Botão Fechar Modal
    const closeButtons = document.querySelectorAll('.close-modal, #btnCancelar');
    console.log(`Encontrados ${closeButtons.length} botões de fechar modal`);
    closeButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            console.log('Botão fechar modal clicado!');
            e.preventDefault();
            closeModal('produtoModal');
        });
    });
    
    // Botão Salvar
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) {
        console.log('Botão Salvar encontrado, adicionando event listener');
        btnSalvar.addEventListener('click', function(e) {
            console.log('Botão Salvar clicado!');
            e.preventDefault();
            saveProduto();
        });
    } else {
        console.error('Botão Salvar não encontrado no DOM!');
    }
    

    
    // Botões de filtro
    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) {
        console.log('Filtro Categoria encontrado, adicionando event listener');
        filtroCategoria.addEventListener('change', function() {
            console.log('Filtro Categoria alterado para:', this.value);
            loadProdutos();
        });
    } else {
        console.error('Filtro Categoria não encontrado no DOM!');
    }
    
    const filtroStatus = document.getElementById('filtroStatus');
    if (filtroStatus) {
        console.log('Filtro Status encontrado, adicionando event listener');
        filtroStatus.addEventListener('change', function() {
            console.log('Filtro Status alterado para:', this.value);
            loadProdutos();
        });
    } else {
        console.error('Filtro Status não encontrado no DOM!');
    }
    
    // Botões de paginação
    const paginationButtons = document.querySelectorAll('.btn-page');
    console.log(`Encontrados ${paginationButtons.length} botões de paginação`);
    paginationButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            console.log('Botão de paginação clicado:', this.textContent);
            e.preventDefault();
            document.querySelectorAll('.btn-page').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            loadProdutos();
        });
    });
    
    console.log('Configuração de botões concluída!');
    
    // Bloquear pontos em preços: somente números e vírgula, um único separador e até 2 casas decimais
    ['preco_custo', 'preco_venda', 'comissao'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                // Remove pontos
                let val = this.value.replace(/\./g, '');
                // Mantém apenas dígitos e vírgula
                val = val.replace(/[^0-9,]/g, '');
                // Garante apenas uma vírgula e até 2 dígitos decimais
                const parts = val.split(',');
                if (parts.length > 1) {
                    const integerPart = parts[0];
                    let decimalPart = parts.slice(1).join(''); // remove vírgulas extras
                    decimalPart = decimalPart.slice(0, 2); // até 2 dígitos
                    val = integerPart + ',' + decimalPart;
                }
                this.value = val;
            });
        }
    });

    // Configurar preview de imagens
    const imagensInput = document.getElementById('imagens_produto');
    if (imagensInput) {
        imagensInput.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            const previewContainer = document.getElementById('preview_imagens');
            
            // Limitar a 3 imagens
            if (files.length > 3) {
                alert('Você pode selecionar no máximo 3 imagens.');
                e.target.value = '';
                previewContainer.innerHTML = '';
                return;
            }
            
            // Limpar preview anterior
            previewContainer.innerHTML = '';
            
            // Criar preview para cada imagem
            files.forEach((file, index) => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const previewDiv = document.createElement('div');
                        previewDiv.style.cssText = 'position: relative; display: inline-block;';
                        
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px;';
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.innerHTML = '×';
                        removeBtn.type = 'button';
                        removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;';
                        removeBtn.onclick = function() {
                            previewDiv.remove();
                            // Remover arquivo da lista
                            const dt = new DataTransfer();
                            const currentFiles = Array.from(imagensInput.files);
                            currentFiles.forEach((f, i) => {
                                if (i !== index) dt.items.add(f);
                            });
                            imagensInput.files = dt.files;
                        };
                        
                        previewDiv.appendChild(img);
                        previewDiv.appendChild(removeBtn);
                        previewContainer.appendChild(previewDiv);
                    };
                    reader.readAsDataURL(file);
                }
            });
        });
    }
}

// Função para carregar e exibir imagens do produto
async function carregarImagensProduto(caminhoImagem) {
    if (!caminhoImagem) return;
    
    const previewDiv = document.getElementById('preview_imagens');
    if (!previewDiv) return;
    
    previewDiv.innerHTML = '';
    
    try {
        const apiUrl = "http://localhost:8000";
        
        // Verifica se há múltiplas imagens separadas por vírgula
        const caminhos = caminhoImagem.split(',');
        
        // Para cada caminho de imagem, criar um elemento de preview
        for (const caminho of caminhos) {
            if (!caminho.trim()) continue; // Ignora caminhos vazios
            
            const imagemUrl = `${apiUrl}/uploads/${caminho.trim().replace('uploads/', '')}`;
            
            // Criar elemento de imagem para preview
            const imgElement = document.createElement('div');
            imgElement.className = 'preview-image';
            imgElement.innerHTML = `
                <img src="${imagemUrl}" alt="Imagem do produto" style="max-width: 100px; max-height: 100px;">
                <div class="preview-actions">
                    <a href="${imagemUrl}" target="_blank" title="Ver imagem completa">
                        <i class="fas fa-eye"></i>
                    </a>
                    <a href="${imagemUrl}" download title="Baixar imagem">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
            
            previewDiv.appendChild(imgElement);
        }
    } catch (error) {
        console.error('Erro ao carregar imagem do produto:', error);
    }
}

// Abre o modal de produto
function openProdutoModal(produtoId = null) {
    console.log(`Abrindo modal de produto. ID: ${produtoId || 'Novo produto'}`);
    
    try {
        // Limpa o formulário
        const form = document.getElementById('produtoForm');
        if (!form) {
            console.error('Formulário não encontrado!');
            return;
        }
        form.reset();
        console.log('Formulário resetado');
        
        // Define o título do modal
        const modalTitle = document.getElementById('modalTitle');
        if (!modalTitle) {
            console.error('Título do modal não encontrado!');
            return;
        }
        modalTitle.textContent = produtoId ? 'Editar Produto' : 'Novo Produto';
        console.log(`Título do modal definido: ${modalTitle.textContent}`);
        
        // Limpa o preview de imagens
        const previewDiv = document.getElementById('preview_imagens');
        if (previewDiv) {
            previewDiv.innerHTML = '';
        }
        
        // Se for edição, carrega os dados do produto
        if (produtoId) {
            console.log(`Carregando dados do produto ID: ${produtoId}`);
            loadProdutoData(produtoId).then(produto => {
                // Carregar imagens do produto
                if (produto && produto.caminho_imagem) {
                    carregarImagensProduto(produto.caminho_imagem);
                }
            });
        } else {
            // Se for novo produto, limpa o ID do formulário e gera um novo código
            form.removeAttribute('data-id');
            console.log('Removido atributo data-id do formulário');
            
            // Gera o próximo código de produto automaticamente
            gerarProximoCodigoProduto();
        }
        
        // Usando jQuery para manipular o modal - abordagem mais confiável
        const $modal = $('#produtoModal');
        if ($modal.length === 0) {
            console.error('Modal não encontrado!');
            return;
        }
        
        // Exibir o modal com jQuery
        $modal.css({
            'display': 'flex',
            'align-items': 'flex-start',
            'justify-content': 'center'
        }).addClass('active');
        
        // Adicionar classe ao body para impedir rolagem
        $('body').addClass('modal-open');
        
        console.log('Modal aberto com jQuery e rolagem do body bloqueada');
        console.log('Modal deveria estar visível agora');
    } catch (error) {
        console.error('Erro ao abrir modal:', error);
        alert('Erro ao abrir o modal. Por favor, tente novamente.');
    }
}

// Carrega os dados de um produto específico
async function loadProdutoData(produtoId) {
    console.log(`Carregando dados do produto ID: ${produtoId}`);
    
    if (!produtoId) {
        console.error('ID do produto não fornecido!');
        return null;
    }
    
    try {
        console.log(`Enviando requisição GET para API centralizada: /api/produtos/${produtoId}`);
        
        // Usa a API centralizada
        const produto = await apiGet(`/api/produtos/${produtoId}`);
        
        console.log('Dados do produto recebidos:', produto);
        preencherFormularioProduto(produto, produtoId);
        return produto; // Retorna o produto para uso em outras funções
    } catch (error) {
        console.error('Erro ao carregar dados do produto:', error);
        
        // Se a API não estiver disponível, carrega dados de exemplo para demonstração
        console.log('Carregando dados de exemplo para o produto ID:', produtoId);
        
        // Dados de exemplo para demonstração
        const produtosExemplo = {
            1: {codigo: 'P001', nome: 'Notebook Dell', descricao: 'Notebook Dell Inspiron 15', preco_custo: 2800, preco_venda: 3500, estoque_minimo: 5, categoria_id: 1, ativo: true, caminho_imagem: ''},
            2: {codigo: 'P002', nome: 'Mouse Logitech', descricao: 'Mouse sem fio Logitech', preco_custo: 50, preco_venda: 89.90, estoque_minimo: 10, categoria_id: 1, ativo: true, caminho_imagem: ''},
            3: {codigo: 'P003', nome: 'Cadeira Gamer', descricao: 'Cadeira Gamer Ergonômica', preco_custo: 700, preco_venda: 950, estoque_minimo: 3, categoria_id: 2, ativo: true, caminho_imagem: ''},
            4: {codigo: 'P004', nome: 'Teclado Mecânico', descricao: 'Teclado Mecânico RGB', preco_custo: 200, preco_venda: 299.90, estoque_minimo: 8, categoria_id: 1, ativo: false, caminho_imagem: ''}
        };
        
        const produto = produtosExemplo[produtoId] || produtosExemplo[1];
        console.log('Usando dados de exemplo:', produto);
        
        preencherFormularioProduto(produto, produtoId);
        return produto; // Retorna o produto para uso em outras funções
    }
}

// Função auxiliar para preencher o formulário com os dados do produto
function preencherFormularioProduto(produto, produtoId) {
    console.log('Preenchendo formulário com dados do produto');
    
    try {
        // Verifica se os elementos existem antes de definir seus valores
        const codigoInput = document.getElementById('codigo');
        if (codigoInput) codigoInput.value = produto.codigo || '';
        
        const nomeInput = document.getElementById('nome');
        if (nomeInput) nomeInput.value = produto.nome || '';
        
        const descricaoInput = document.getElementById('descricao');
        if (descricaoInput) descricaoInput.value = produto.descricao || '';
        
        const precoCustoInput = document.getElementById('preco_custo');
        if (precoCustoInput) precoCustoInput.value = produto.preco_custo || '';
        
        const precoVendaInput = document.getElementById('preco_venda');
        if (precoVendaInput) precoVendaInput.value = produto.preco_venda || '';
        
        const comissaoInput = document.getElementById('comissao');
        if (comissaoInput) comissaoInput.value = produto.comissao || '0';
        
        const estoqueMinInput = document.getElementById('estoque_minimo');
        if (estoqueMinInput) estoqueMinInput.value = produto.estoque_minimo || '';
        
        const categoriaInput = document.getElementById('categoria_id');
        if (categoriaInput) categoriaInput.value = produto.categoria_id || '';
        
        const ativoInput = document.getElementById('ativo');
        if (ativoInput) ativoInput.checked = produto.ativo;
        
        // Armazena o ID do produto no formulário para uso posterior
        const form = document.getElementById('produtoForm');
        if (form) {
            form.setAttribute('data-id', produtoId);
            console.log(`ID ${produtoId} armazenado no formulário`);
        } else {
            console.error('Formulário não encontrado para armazenar ID!');
        }
        
        console.log('Formulário preenchido com sucesso!');
    } catch (error) {
        console.error('Erro ao preencher formulário:', error);
    }
}

// Fecha o modal
function closeModal(modalId) {
    console.log(`Fechando modal: ${modalId}`);
    
    try {
        // Usando jQuery para manipular o modal
        const $modal = $(`#${modalId}`);
        if ($modal.length === 0) {
            console.error(`Modal ${modalId} não encontrado!`);
            return;
        }
        
        // Esconder o modal com jQuery
        $modal.css('display', 'none').removeClass('active');
        
        // Remover classe do body para permitir rolagem novamente
        $('body').removeClass('modal-open');
        
        console.log(`Modal ${modalId} fechado com sucesso`);
    } catch (error) {
        console.error('Erro ao fechar modal:', error);
    }
}

// Salva o produto (novo ou edição)
async function saveProduto() {
    console.log('Iniciando salvamento de produto...');
    
    try {
        const form = document.getElementById('produtoForm');
        if (!form) {
            console.error('Formulário não encontrado!');
            return;
        }
        
        const produtoId = form.getAttribute('data-id');
        console.log(`Tipo de operação: ${produtoId ? 'Edição (ID: ' + produtoId + ')' : 'Novo produto'}`);
        
        const token = getToken();
        if (!token) {
            console.warn('Token não encontrado, pode haver problemas de autenticação');
        }
        
        // Coleta os dados do formulário
        const codigo = document.getElementById('codigo')?.value || '';
        const nome = document.getElementById('nome')?.value || '';
        const descricao = document.getElementById('descricao')?.value || '';
        const preco_custo_value = document.getElementById('preco_custo')?.value || '';
        const preco_venda_value = document.getElementById('preco_venda')?.value || '';
        const comissao_value = document.getElementById('comissao')?.value || '';
        
        // Validação de formato de preços: apenas dígitos e opcionalmente uma vírgula seguida de até 2 dígitos
        const priceRegex = /^[0-9]+(,[0-9]{1,2})?$/;
        // Validação de formato de comissão: apenas números inteiros
        const comissaoRegex = /^[0-9]+$/;
        
        if (!priceRegex.test(preco_custo_value)) {
            console.error('Formato de Preço de Custo inválido:', preco_custo_value);
            alert('Formato inválido para Preço de Custo. Use apenas números e até 2 casas decimais separadas por vírgula.');
            return;
        }
        if (!priceRegex.test(preco_venda_value)) {
            console.error('Formato de Preço de Venda inválido:', preco_venda_value);
            alert('Formato inválido para Preço de Venda. Use apenas números e até 2 casas decimais separadas por vírgula.');
            return;
        }
        if (comissao_value && !comissaoRegex.test(comissao_value)) {
            console.error('Formato de Comissão inválido:', comissao_value);
            alert('Formato inválido para Comissão. Use apenas números inteiros (ex: 50 para R$ 50,00).');
            return;
        }
        
        const preco_custo = parseFloat(preco_custo_value.replace(',', '.')); // converte vírgula para ponto
        const preco_venda = parseFloat(preco_venda_value.replace(',', '.')); // converte vírgula para ponto
        const comissao = comissao_value ? parseInt(comissao_value) : 0;
        const estoque_minimo = parseInt(document.getElementById('estoque_minimo')?.value || 0);
        const categoria_id = document.getElementById('categoria_id')?.value || '';
        const tipo_produto = document.getElementById('tipo_produto')?.value || 'comprado';
        const ativo = document.getElementById('ativo')?.checked || false;
        
        // Coleta as imagens
        const imagensInput = document.getElementById('imagens_produto');
        const imagens = imagensInput ? imagensInput.files : [];
        
        // Cria FormData para envio
        const formData = new FormData();
        formData.append('codigo', codigo);
        formData.append('nome', nome);
        formData.append('descricao', descricao);
        formData.append('preco_custo', preco_custo);
        formData.append('preco_venda', preco_venda);
        formData.append('estoque_minimo', estoque_minimo);
        formData.append('categoria_id', categoria_id);
        formData.append('tipo_produto', tipo_produto);
        formData.append('comissao', comissao);
        formData.append('ativo', ativo);
        
        // Adiciona as imagens ao FormData
        for (let i = 0; i < imagens.length; i++) {
            formData.append('imagens', imagens[i]);
        }
        
        console.log('Dados do produto a serem salvos');
        
        // Validação básica
        if (!codigo || !nome) {
            console.error('Campos obrigatórios não preenchidos!');
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        // Validações numéricas
        if (isNaN(preco_custo)) {
            console.error('Preço de custo inválido!');
            alert('Por favor, insira um valor numérico válido para o preço de custo.');
            return;
        }
        if (isNaN(preco_venda)) {
            console.error('Preço de venda inválido!');
            alert('Por favor, insira um valor numérico válido para o preço de venda.');
            return;
        }
        if (isNaN(estoque_minimo)) {
            console.error('Estoque mínimo inválido!');
            alert('Por favor, insira um valor numérico válido para o estoque mínimo.');
            return;
        }
        
        // Validação de categoria obrigatória
        if (!categoria_id) {
            console.error('Categoria obrigatória não selecionada!');
            alert('Por favor, selecione a categoria.');
            return;
        }

        console.log(`Enviando requisição para API centralizada`);
        
        let data;
        
        if (produtoId) {
            // Para atualização, verificar se há imagens selecionadas
            if (imagens.length > 0) {
                // Se tiver imagens, usar PUT com FormData para o endpoint específico de upload de imagens
                formData.append('id', produtoId);
                console.log(`Atualizando produto ID: ${produtoId} com imagens`);
                data = await apiPostFormData(`/api/produtos/${produtoId}/upload`, formData);
            } else {
                // Se não tiver imagens, usar PUT normal com JSON
                console.log(`Atualizando produto ID: ${produtoId} sem imagens`);
                const jsonData = {
                    codigo, nome, descricao, preco_custo, preco_venda,
                    estoque_minimo, categoria_id, tipo_produto, comissao, ativo
                };
                data = await apiPut(`/api/produtos/${produtoId}`, jsonData);
            }
        } else {
            // Cria novo produto com FormData (incluindo imagens)
            console.log('Criando novo produto');
            data = await apiPostFormData('/api/produtos', formData);
        }
        
        console.log('Produto salvo com sucesso:', data);
        
        // Fecha o modal
        closeModal('produtoModal');
        
        // Recarrega a lista de produtos
        loadProdutos();
        
        // Exibe mensagem de sucesso
        alert(produtoId ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!');
        
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        
        // Exibe mensagem de erro
        alert(`Erro ao salvar produto: ${error.message || 'Verifique os dados e tente novamente'}`);
    }
}

// Gera o próximo código de produto automaticamente
function gerarProximoCodigoProduto() {
    console.log('Gerando próximo código de produto...');
    
    try {
        const token = getToken();
        
        // Busca todos os produtos para determinar o próximo código
        fetch('http://localhost:8000/api/produtos', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar produtos');
            }
            return response.json();
        })
        .then(produtos => {
            // Encontra o maior código numérico
            let maiorCodigo = 0;
            
            produtos.forEach(produto => {
                // Extrai o número do código (assumindo que os códigos são numéricos)
                const codigoNumerico = parseInt(produto.codigo, 10);
                
                // Verifica se é um número válido e maior que o atual
                if (!isNaN(codigoNumerico) && codigoNumerico > maiorCodigo) {
                    maiorCodigo = codigoNumerico;
                }
            });
            
            // Incrementa para obter o próximo código
            const proximoCodigo = maiorCodigo + 1;
            console.log(`Próximo código de produto: ${proximoCodigo}`);
            
            // Define o valor no campo de código
            const codigoInput = document.getElementById('codigo');
            if (codigoInput) {
                codigoInput.value = proximoCodigo.toString();
            } else {
                console.error('Campo de código não encontrado!');
            }
        })
        .catch(error => {
            console.error('Erro ao gerar próximo código de produto:', error);
            
            // Em caso de erro, gera um código baseado no timestamp
            const fallbackCodigo = new Date().getTime().toString().slice(-8);
            console.log(`Usando código fallback: ${fallbackCodigo}`);
            
            const codigoInput = document.getElementById('codigo');
            if (codigoInput) {
                codigoInput.value = fallbackCodigo;
            }
        });
    } catch (error) {
        console.error('Erro inesperado ao gerar código de produto:', error);
        
        // Em caso de erro, gera um código baseado no timestamp
        const fallbackCodigo = new Date().getTime().toString().slice(-8);
        console.log(`Usando código fallback: ${fallbackCodigo}`);
        
        const codigoInput = document.getElementById('codigo');
        if (codigoInput) {
            codigoInput.value = fallbackCodigo;
        }
    }
}



// Gera um relatório de erros em Excel










// Exclui um produto
async function deleteProduto(produtoId) {
    console.log(`Tentando excluir produto ID: ${produtoId}`);
    
    try {
        if (!produtoId) {
            console.error('ID do produto não fornecido para exclusão!');
            return;
        }
        
        if (!confirm('Tem certeza que deseja excluir este produto?')) {
            console.log('Exclusão cancelada pelo usuário');
            return;
        }
        
        console.log('Exclusão confirmada, enviando requisição para a API centralizada...');
        
        // Usa a API centralizada
        await apiDelete(`/api/produtos/${produtoId}`);
        
        console.log('Produto excluído com sucesso');
        
        // Recarrega a lista de produtos
        loadProdutos();
        
        // Exibe mensagem de sucesso
        alert('Produto excluído com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        
        // Verifica se é um problema de URL da API
        if (error.message.includes('404') || error.message.includes('conexão')) {
            // Tenta sincronizar a URL da API
            tryAlternativeEndpoint();
        }
        
        // Mostra mensagem de erro ao usuário
        alert(`Erro ao excluir produto: ${error.message}\nPor favor, verifique a conexão com a API e tente novamente.`);
    }
}
