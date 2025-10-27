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
            `<tr><td colspan="7" class="text-center">
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
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto encontrado</td></tr>';
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
        
        row.innerHTML = `
            <td>${produto.codigo || produto.id}</td>
            <td>${produto.nome}</td>
            <td>${produto.categoria_nome || 'Não categorizado'}</td>
            <td>R$ ${formatNumber(produto.preco_venda)}</td>
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
    
    // Botão Importar
    const btnImportar = document.getElementById('btnImportarProdutos');
    if (btnImportar) {
        console.log('Botão Importar encontrado, adicionando event listener');
        btnImportar.addEventListener('click', function(e) {
            console.log('Botão Importar clicado!');
            e.preventDefault();
            
            // Mostra opções de importação
            const importOptions = document.createElement('div');
            importOptions.className = 'modal active';
            importOptions.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Importar Produtos</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Escolha uma das opções abaixo:</p>
                        <div class="form-row" style="margin-top: 20px;">
                            <button id="btnDownloadTemplate" class="btn-primary">
                                <i class="fas fa-file-download"></i> Baixar Modelo Excel
                            </button>
                        </div>
                        <div class="form-row" style="margin-top: 20px;">
                            <button id="btnSelectFile" class="btn-primary">
                                <i class="fas fa-file-upload"></i> Selecionar Arquivo Excel
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(importOptions);
            document.body.classList.add('modal-open');
            
            // Fecha o modal
            const closeModal = importOptions.querySelector('.close-modal');
            closeModal.addEventListener('click', function() {
                document.body.removeChild(importOptions);
                document.body.classList.remove('modal-open');
            });
            
            // Botão para baixar o modelo
            const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');
            btnDownloadTemplate.addEventListener('click', function() {
                gerarModeloExcel();
                document.body.removeChild(importOptions);
                document.body.classList.remove('modal-open');
            });
            
            // Botão para selecionar arquivo
            const btnSelectFile = document.getElementById('btnSelectFile');
            btnSelectFile.addEventListener('click', function() {
                // Cria um input de arquivo invisível
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.xlsx';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
                
                // Quando um arquivo for selecionado
                fileInput.addEventListener('change', function() {
                    if (this.files && this.files[0]) {
                        const file = this.files[0];
                        console.log(`Arquivo selecionado: ${file.name}`);
                        document.body.removeChild(importOptions);
                        document.body.classList.remove('modal-open');
                        importarProdutosDoExcel(file);
                    }
                    // Remove o input após uso
                    document.body.removeChild(fileInput);
                });
                
                // Simula o clique no input de arquivo
                fileInput.click();
            });
        });
    } else {
        console.error('Botão Importar não encontrado no DOM!');
    }
    
    // Botão Exportar
    const btnExportar = document.getElementById('btnExportarProdutos');
    if (btnExportar) {
        console.log('Botão Exportar encontrado, adicionando event listener');
        btnExportar.addEventListener('click', function(e) {
            console.log('Botão Exportar clicado!');
            e.preventDefault();
            exportarProdutosParaExcel();
        });
    } else {
        console.error('Botão Exportar não encontrado no DOM!');
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
    ['preco_custo', 'preco_venda'].forEach(id => {
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
        
        // Se for edição, carrega os dados do produto
        if (produtoId) {
            console.log(`Carregando dados do produto ID: ${produtoId}`);
            loadProdutoData(produtoId);
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
        return;
    }
    
    try {
        console.log(`Enviando requisição GET para API centralizada: /api/produtos/${produtoId}`);
        
        // Usa a API centralizada
        const produto = await apiGet(`/api/produtos/${produtoId}`);
        
        console.log('Dados do produto recebidos:', produto);
        preencherFormularioProduto(produto, produtoId);
    } catch (error) {
        console.error('Erro ao carregar dados do produto:', error);
        
        // Se a API não estiver disponível, carrega dados de exemplo para demonstração
        console.log('Carregando dados de exemplo para o produto ID:', produtoId);
        
        // Dados de exemplo para demonstração
        const produtosExemplo = {
            1: {codigo: 'P001', nome: 'Notebook Dell', descricao: 'Notebook Dell Inspiron 15', preco_custo: 2800, preco_venda: 3500, estoque_minimo: 5, categoria_id: 1, ativo: true},
            2: {codigo: 'P002', nome: 'Mouse Logitech', descricao: 'Mouse sem fio Logitech', preco_custo: 50, preco_venda: 89.90, estoque_minimo: 10, categoria_id: 1, ativo: true},
            3: {codigo: 'P003', nome: 'Cadeira Gamer', descricao: 'Cadeira Gamer Ergonômica', preco_custo: 700, preco_venda: 950, estoque_minimo: 3, categoria_id: 2, ativo: true},
            4: {codigo: 'P004', nome: 'Teclado Mecânico', descricao: 'Teclado Mecânico RGB', preco_custo: 200, preco_venda: 299.90, estoque_minimo: 8, categoria_id: 1, ativo: false}
        };
        
        const produto = produtosExemplo[produtoId] || produtosExemplo[1];
        console.log('Usando dados de exemplo:', produto);
        
        preencherFormularioProduto(produto, produtoId);
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
        // Validação de formato de preços: apenas dígitos e opcionalmente uma vírgula seguida de até 2 dígitos
        const priceRegex = /^[0-9]+(,[0-9]{1,2})?$/;
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
        const preco_custo = parseFloat(preco_custo_value.replace(',', '.')); // converte vírgula para ponto
        const preco_venda = parseFloat(preco_venda_value.replace(',', '.')); // converte vírgula para ponto
        const estoque_minimo = parseInt(document.getElementById('estoque_minimo')?.value || 0);
        const categoria_id = document.getElementById('categoria_id')?.value || '';
        const ativo = document.getElementById('ativo')?.checked || false;
        
        const produtoData = {
            codigo,
            nome,
            descricao,
            preco_custo,
            preco_venda,
            estoque_minimo,
            categoria_id,
            ativo
        };
        
        console.log('Dados do produto a serem salvos:', produtoData);
        
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
            // Atualiza produto existente
            console.log(`Atualizando produto ID: ${produtoId}`);
            data = await apiPut(`/api/produtos/${produtoId}`, produtoData);
        } else {
            // Cria novo produto
            console.log('Criando novo produto');
            data = await apiPost('/api/produtos', produtoData);
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

// Importa produtos de um arquivo Excel
function importarProdutosDoExcel(file) {
    console.log('Iniciando importação de produtos do Excel...');
    
    try {
        // Mostra mensagem de carregamento
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'loading-overlay';
        loadingMessage.innerHTML = `
            <div class="loading-content">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Processando arquivo...</p>
            </div>
        `;
        document.body.appendChild(loadingMessage);
        
        // Lê o arquivo Excel
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                
                // Pega a primeira planilha
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Converte para JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
                // Verifica se há dados
                if (!jsonData || jsonData.length <= 1) {
                    document.body.removeChild(loadingMessage);
                    alert('O arquivo não contém dados válidos. Verifique o modelo de importação.');
                    return;
                }
                
                // Obtém os cabeçalhos (primeira linha)
                const headers = jsonData[0];
                
                // Verifica se os cabeçalhos estão corretos
                const requiredHeaders = ['Código', 'Nome', 'Categoria', 'Preço de Custo', 'Preço de Venda', 'Estoque Mínimo'];
                const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
                
                if (missingHeaders.length > 0) {
                    document.body.removeChild(loadingMessage);
                    alert(`O arquivo não contém todos os cabeçalhos obrigatórios. Faltam: ${missingHeaders.join(', ')}`);
                    return;
                }
                
                // Prepara os dados para validação
                const produtos = [];
                const erros = [];
                
                // Processa cada linha (exceto o cabeçalho)
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row.length === 0 || (row.length === 1 && !row[0])) continue; // Pula linhas vazias
                    
                    const produto = {};
                    const errosLinha = [];
                    
                    // Mapeia os valores baseados nos cabeçalhos
                    headers.forEach((header, index) => {
                        const value = row[index];
                        
                        switch(header) {
                            case 'Código':
                                produto.codigo = value ? String(value).trim() : '';
                                if (!produto.codigo) errosLinha.push('Código é obrigatório');
                                break;
                                
                            case 'Nome':
                                produto.nome = value ? String(value).trim() : '';
                                if (!produto.nome) errosLinha.push('Nome é obrigatório');
                                break;
                                
                            case 'Descrição':
                                produto.descricao = value ? String(value).trim() : '';
                                break;
                                
                            case 'Categoria':
                                produto.categoria_nome = value ? String(value).trim() : '';
                                if (!produto.categoria_nome) errosLinha.push('Categoria é obrigatória');
                                break;
                                
                            case 'Preço de Custo':
                                produto.preco_custo = value ? parseFloat(String(value).replace('R$', '').replace('.', '').replace(',', '.').trim()) : 0;
                                if (isNaN(produto.preco_custo)) {
                                    produto.preco_custo = 0;
                                    errosLinha.push('Preço de Custo inválido');
                                }
                                break;
                                
                            case 'Preço de Venda':
                                produto.preco_venda = value ? parseFloat(String(value).replace('R$', '').replace('.', '').replace(',', '.').trim()) : 0;
                                if (isNaN(produto.preco_venda)) {
                                    produto.preco_venda = 0;
                                    errosLinha.push('Preço de Venda inválido');
                                }
                                break;
                                
                            case 'Estoque Atual':
                                produto.estoque_atual = value ? parseInt(value) : 0;
                                if (isNaN(produto.estoque_atual)) {
                                    produto.estoque_atual = 0;
                                    errosLinha.push('Estoque Atual inválido');
                                }
                                break;
                                
                            case 'Estoque Mínimo':
                                produto.estoque_minimo = value ? parseInt(value) : 0;
                                if (isNaN(produto.estoque_minimo)) {
                                    produto.estoque_minimo = 0;
                                    errosLinha.push('Estoque Mínimo inválido');
                                }
                                break;
                                
                            case 'Status':
                                produto.ativo = value ? (String(value).trim().toLowerCase() === 'ativo') : true;
                                break;
                        }
                    });
                    
                    // Adiciona a linha e os erros (se houver)
                    if (errosLinha.length > 0) {
                        erros.push({
                            linha: i + 1,
                            codigo: produto.codigo || `Linha ${i + 1}`,
                            nome: produto.nome || 'N/A',
                            erros: errosLinha
                        });
                    } else {
                        produtos.push(produto);
                    }
                }
                
                // Se houver erros, gera um relatório de erros
                if (erros.length > 0) {
                    console.log(`Encontrados ${erros.length} erros na importação`);
                    gerarRelatorioErros(erros, file.name);
                    document.body.removeChild(loadingMessage);
                    return;
                }
                
                // Se não houver produtos válidos
                if (produtos.length === 0) {
                    document.body.removeChild(loadingMessage);
                    alert('Nenhum produto válido encontrado no arquivo.');
                    return;
                }
                
                console.log(`Processados ${produtos.length} produtos válidos para importação`);
                
                // Envia os produtos para a API
                // Carrega categorias para mapear nome -> ID
                console.log('[API LOG] Carregando categorias para mapear nome->ID');
                fetch('http://localhost:8000/api/categorias/', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Erro ao carregar categorias: ' + response.status);
                    }
                    return response.json();
                })
                .then(categories => {
                    console.log('[API LOG] Categorias carregadas:', categories);
                    const categoriaMap = {};
                    categories.forEach(cat => {
                        categoriaMap[cat.nome] = cat.id;
                    });
                    // Mapeia categoria para cada produto
                    produtos.forEach((produto, idx) => {
                        const nomeCat = produto.categoria_nome;
                        if (!nomeCat || !categoriaMap[nomeCat]) {
                            const mensagem = 'Categoria ' + nomeCat + ' não encontrada para produto ' + produto.codigo;
                            console.error('[API LOG] ' + mensagem);
                            throw new Error(mensagem);
                        }
                        produto.categoria_id = categoriaMap[nomeCat];
                        delete produto.categoria_nome;
                    });
                    // Envia os produtos para a API
                    enviarProdutosParaAPI(produtos, loadingMessage);
                })
                .catch(error => {
                    console.error('[API LOG] Erro ao mapear categorias:', error);
                    document.body.removeChild(loadingMessage);
                    alert('Erro ao mapear categorias: ' + error.message);
                });
                
            } catch (error) {
                console.error('Erro ao processar arquivo Excel:', error);
                document.body.removeChild(loadingMessage);
                alert('Erro ao processar o arquivo Excel. Verifique se o formato está correto.');
            }
        };
        
        reader.onerror = function() {
            console.error('Erro ao ler o arquivo');
            document.body.removeChild(loadingMessage);
            alert('Erro ao ler o arquivo. Tente novamente.');
        };
        
        reader.readAsArrayBuffer(file);
        
    } catch (error) {
        console.error('Erro inesperado na importação:', error);
        alert('Erro ao importar produtos. Tente novamente.');
    }
}

// Gera um relatório de erros em Excel
function gerarRelatorioErros(erros, nomeArquivoOriginal) {
    console.log('Gerando relatório de erros de validação...');
    
    try {
        // Prepara os dados para o Excel
        const dadosErros = erros.map(erro => {
            return {
                'Linha': erro.linha,
                'Código': erro.codigo,
                'Nome': erro.nome,
                'Erros': erro.erros.join('; ')
            };
        });
        
        // Cria uma planilha
        const ws = XLSX.utils.json_to_sheet(dadosErros);
        
        // Configura a largura das colunas
        const wscols = [
            {wch: 8},  // Linha
            {wch: 15}, // Código
            {wch: 30}, // Nome
            {wch: 60}  // Erros
        ];
        ws['!cols'] = wscols;
        
        // Cria um workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Erros de Validação');
        
        // Gera o nome do arquivo com data e hora
        const dataHora = new Date().toISOString().replace(/[\-:]/g, '').replace('T', '_').substring(0, 15);
        const nomeBase = nomeArquivoOriginal.replace('.xlsx', '');
        const nomeArquivo = `${nomeBase}_erros_${dataHora}.xlsx`;
        
        // Exporta o arquivo
        XLSX.writeFile(wb, nomeArquivo);
        
        console.log(`Relatório de erros exportado com sucesso: ${nomeArquivo}`);
        alert(`Foram encontrados ${erros.length} erros na validação dos dados. Um relatório foi gerado com os detalhes.`);
        
    } catch (error) {
        console.error('Erro ao gerar relatório de erros:', error);
        alert('Erro ao gerar relatório de erros. Verifique o console para mais detalhes.');
    }
}

// Gera um relatório de erros de importação em Excel
function gerarRelatorioErrosImportacao(erros, nomeArquivo) {
    console.log('Gerando relatório de erros de importação...', erros);
    
    try {
        // Prepara os dados para o Excel
        const dadosErros = erros.map(erro => {
            // Identifica o tipo de erro (criar ou atualizar)
            let tipoOperacao = 'Desconhecida';
            
            // Extrai a primeira mensagem de erro principal
            const mensagemPrincipal = erro.erros[0] || '';
            
            // Determina o tipo de operação
            if (mensagemPrincipal.includes('criar novo')) {
                tipoOperacao = 'Criar';
            } else if (mensagemPrincipal.includes('atualizar existente')) {
                tipoOperacao = 'Atualizar';
            } else if (mensagemPrincipal.includes('verificar se o produto existe')) {
                tipoOperacao = 'Verificar';
            }
            
            // Extrai mensagens de erro detalhadas
            let mensagemErro = erro.erros[0] || 'Erro desconhecido';
            
            // Prepara os detalhes do erro
            let detalhesErro = '';
            
            // Adiciona todas as mensagens de erro exceto a primeira
            if (erro.erros.length > 1) {
                // Filtra mensagens que contém informações úteis
                const mensagensDetalhadas = erro.erros.slice(1).filter(msg => {
                    // Filtra mensagens vazias ou duplicadas da mensagem principal
                    return msg && msg.trim() !== '' && !mensagemErro.includes(msg);
                });
                
                if (mensagensDetalhadas.length > 0) {
                    detalhesErro = mensagensDetalhadas.join('\n');
                }
            }
            
            // Se for erro 422 (Unprocessable Entity), adiciona informações específicas
            if (mensagemPrincipal.includes('422')) {
                // Procura por mensagens que contém 'Erro de validação' ou 'Campo'
                const errosValidacao = erro.erros.filter(e => 
                    e.includes('Erro de validação') || 
                    e.includes('Campo') || 
                    e.includes('JSON')
                );
                
                if (errosValidacao.length > 0) {
                    // Se houver mensagens de validação específicas, usa-as
                    detalhesErro = errosValidacao.join('\n');
                } else if (detalhesErro === '') {
                    // Se não houver detalhes, adiciona uma mensagem genérica mais útil
                    detalhesErro = 'Erro de validação de dados. Verifique se todos os campos estão preenchidos corretamente.';
                    
                    // Adiciona dicas comuns para erros 422
                    detalhesErro += '\n\nPossíveis problemas:\n';
                    detalhesErro += '- Campos numéricos com formato inválido (ex: preços com vírgula em vez de ponto)\n';
                    detalhesErro += '- Campos obrigatórios não preenchidos\n';
                    detalhesErro += '- Categoria inexistente\n';
                    detalhesErro += '- Valores negativos em campos que não aceitam\n';
                    detalhesErro += '- Formato de dados incorreto';
                }
            }
            
            return {
                'Produto': erro.linha,
                'Código': erro.codigo,
                'Nome': erro.nome,
                'Operação': tipoOperacao,
                'Erro': mensagemErro,
                'Detalhes': detalhesErro
            };
        });
        
        // Cria uma planilha
        const ws = XLSX.utils.json_to_sheet(dadosErros);
        
        // Configura a largura das colunas
        const wscols = [
            {wch: 8},  // Produto
            {wch: 15}, // Código
            {wch: 30}, // Nome
            {wch: 12}, // Operação
            {wch: 40}, // Erro
            {wch: 80}  // Detalhes - Aumentado para mostrar mais informações
        ];
        ws['!cols'] = wscols;
        
        // Cria um workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Erros de Importação');
        
        // Exporta o arquivo
        XLSX.writeFile(wb, nomeArquivo);
        
        console.log(`Relatório de erros de importação exportado com sucesso: ${nomeArquivo}`);
        
    } catch (error) {
        console.error('Erro ao gerar relatório de erros de importação:', error);
        alert('Erro ao gerar relatório de erros de importação. Verifique o console para mais detalhes.');
    }
}

// Gera um modelo de Excel para importação
function gerarModeloExcel() {
    console.log('Gerando modelo de Excel para importação...');
    
    try {
        // Cria uma planilha com os cabeçalhos
        const headers = [
            'Código', 'Nome', 'Descrição', 'Categoria', 
            'Preço de Custo', 'Preço de Venda', 'Estoque Atual', 
            'Estoque Mínimo', 'Status'
        ];
        
        // Cria exemplos de dados
        const exampleData = [
            [
                'PROD001', 'Produto Exemplo 1', 'Descrição do produto exemplo 1', 'Eletrônicos',
                'R$ 100,00', 'R$ 150,00', '10', '5', 'Ativo'
            ],
            [
                'PROD002', 'Produto Exemplo 2', 'Descrição do produto exemplo 2', 'Informática',
                'R$ 200,00', 'R$ 300,00', '20', '10', 'Ativo'
            ],
            [
                'PROD003', 'Produto Exemplo 3', 'Descrição do produto exemplo 3', 'Papelaria',
                'R$ 50,00', 'R$ 75,00', '30', '15', 'Inativo'
            ]
        ];
        
        // Combina cabeçalhos e dados
        const data = [headers, ...exampleData];
        
        // Cria uma planilha
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Configura a largura das colunas
        const wscols = [
            {wch: 10}, // Código
            {wch: 30}, // Nome
            {wch: 40}, // Descrição
            {wch: 15}, // Categoria
            {wch: 15}, // Preço de Custo
            {wch: 15}, // Preço de Venda
            {wch: 15}, // Estoque Atual
            {wch: 15}, // Estoque Mínimo
            {wch: 10}  // Status
        ];
        ws['!cols'] = wscols;
        
        // Cria um workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Modelo de Importação');
        
        // Gera o nome do arquivo com data e hora
        const dataHora = new Date().toISOString().replace(/[\-:]/g, '').replace('T', '_').substring(0, 15);
        const nomeArquivo = `modelo_importacao_produtos_${dataHora}.xlsx`;
        
        // Exporta o arquivo
        XLSX.writeFile(wb, nomeArquivo);
        
        console.log(`Modelo de Excel gerado com sucesso: ${nomeArquivo}`);
        
    } catch (error) {
        console.error('Erro ao gerar modelo de Excel:', error);
        alert('Erro ao gerar modelo de Excel. Tente novamente.');
    }
}

// Envia os produtos para a API
function enviarProdutosParaAPI(produtos, loadingMessage) {
    console.log('Enviando produtos para a API...');
    
    try {
        const token = getToken();
        
        // Atualiza a mensagem de carregamento
        const loadingContent = loadingMessage.querySelector('.loading-content');
        if (loadingContent) {
            loadingContent.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <p>Importando ${produtos.length} produtos...</p>
            `;
        }
        
        // Envia os produtos para a API um por um
        let processados = 0;
        let sucessos = 0;
        let falhas = 0;
        const errosImportacao = []; // Array para armazenar erros de importação
        
        // Função para processar cada produto
        const processarProduto = (index) => {
            if (index >= produtos.length) {
                // Todos os produtos foram processados
                document.body.removeChild(loadingMessage);
                
                // Se houver erros, gera um relatório
                if (falhas > 0 && errosImportacao.length > 0) {
                    console.log(`Gerando relatório para ${errosImportacao.length} erros de importação`);
                    const dataHora = new Date().toISOString().replace(/[\-:]/g, '').replace('T', '_').substring(0, 15);
                    const nomeArquivo = `erros_importacao_${dataHora}.xlsx`;
                    gerarRelatorioErrosImportacao(errosImportacao, nomeArquivo);
                    alert(`Importação concluída com erros: ${sucessos} produtos importados com sucesso, ${falhas} falhas. Um relatório de erros foi gerado.`);
                } else {
                    alert(`Importação concluída: ${sucessos} produtos importados com sucesso, ${falhas} falhas.`);
                }
                
                // Recarrega a lista de produtos
                loadProdutos();
                return;
            }
            
            const produto = produtos[index];
            
            // Atualiza a mensagem de progresso
            if (loadingContent) {
                loadingContent.innerHTML = `
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Importando produto ${index + 1} de ${produtos.length}...</p>
                    <p>${produto.codigo} - ${produto.nome}</p>
                `;
            }
            
            // Log da chamada de verificação
            console.log(`[API LOG] Verificando se produto existe - GET http://localhost:8000/api/produtos/codigo/${produto.codigo}`);
            
            // Primeiro verifica se o produto já existe pelo código
            fetch(`http://localhost:8000/api/produtos/codigo/${produto.codigo}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                // Verifica se a resposta foi bem-sucedida
                if (response.status === 404) {
                    console.log(`Produto ${produto.codigo} não encontrado, será criado como novo`);
                    // Produto não existe, vamos criá-lo
                    console.log(`[API LOG] Produto ${produto.codigo} não encontrado, criando novo produto - POST http://localhost:8000/api/produtos`);
                    console.log(`[API LOG] Dados enviados:`, JSON.stringify(produto, null, 2));
                    
                    return { operacao: 'criar', promise: fetch('http://localhost:8000/api/produtos', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(produto)
                    })};
                } else if (response.ok) {
                    // Produto existe, vamos atualizá-lo
                    return response.json().then(produtoExistente => {
                        console.log(`Produto ${produto.codigo} encontrado com ID ${produtoExistente.id}, será atualizado`);
                        
                        // Log da chamada de atualização
                        console.log(`[API LOG] Atualizando produto existente - PUT http://localhost:8000/api/produtos/${produtoExistente.id}`);
                        console.log(`[API LOG] Dados enviados:`, JSON.stringify(produto, null, 2));
                        
                        // Atualiza o produto existente
                        return { operacao: 'atualizar', promise: fetch(`http://localhost:8000/api/produtos/${produtoExistente.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(produto)
                        })};
                    });
                } else {
                    // Erro ao verificar a existência do produto
                    throw new Error(`Erro ao verificar existência do produto ${produto.codigo}: ${response.status} ${response.statusText}`);
                }
            })
            .then(resultado => {
                const { operacao, promise } = resultado;
                return promise.then(response => {
                    return { operacao, response };
                });
            })
            .then(resultado => {
                processados++;
                const { operacao, response } = resultado;
                
                if (response.ok) {
                    sucessos++;
                    const operacaoTexto = operacao === 'criar' ? 'criado' : 'atualizado';
                    
                    // Log de sucesso com a resposta
                    response.clone().json().then(data => {
                        console.log(`[API LOG] Resposta de sucesso (${operacao}):`, JSON.stringify(data, null, 2));
                    }).catch(err => {
                        console.log(`[API LOG] Não foi possível converter a resposta para JSON:`, err);
                    });
                    
                    console.log(`Produto ${produto.codigo} ${operacaoTexto} com sucesso`);
                } else {
                    falhas++;
                    const operacaoTexto = operacao === 'criar' ? 'criar novo' : 'atualizar existente';
                    const mensagemErro = `Erro ao ${operacaoTexto} (${response.status}: ${response.statusText})`;
                    
                    // Log de erro detalhado
                    console.error(`[API LOG] Erro ao importar produto ${produto.codigo}:`, mensagemErro);
                    console.error(`[API LOG] Status: ${response.status}, StatusText: ${response.statusText}`);
                    console.error(`Erro ao importar produto ${produto.codigo}:`, mensagemErro);
                    
                    // Captura o erro para o relatório
                    const erroItem = {
                        linha: index + 1,
                        codigo: produto.codigo,
                        nome: produto.nome,
                        erros: [mensagemErro],
                        detalhes: {}
                    };
                    errosImportacao.push(erroItem);
                    
                    // Tenta obter mais detalhes do erro
                    response.clone().text().then(rawText => {
                        console.log('Resposta de erro bruta:', rawText);
                        
                        try {
                            // Tenta analisar como JSON
                            const data = JSON.parse(rawText);
                            console.log('Resposta de erro como JSON:', data);
                            
                            // Adiciona detalhes do erro
                            if (data.detail) {
                                if (typeof data.detail === 'string') {
                                    // Erro simples com mensagem de texto
                                    erroItem.erros.push(`Detalhe: ${data.detail}`);
                                    console.error('Detalhes do erro:', data.detail);
                                } else if (Array.isArray(data.detail)) {
                                    // FastAPI validation errors format
                                    data.detail.forEach(err => {
                                        let campo = 'desconhecido';
                                        if (err.loc && Array.isArray(err.loc)) {
                                            // Remove o primeiro elemento 'body' e junta o resto
                                            campo = err.loc.slice(1).join('.');
                                        }
                                        const msg = `Campo '${campo}': ${err.msg}`;
                                        erroItem.erros.push(msg);
                                        console.error('Erro de validação:', msg);
                                    });
                                }
                            }
                            
                            // Verifica outros campos comuns de erro
                            if (data.message) erroItem.erros.push(`Mensagem: ${data.message}`);
                            if (data.error) erroItem.erros.push(`Erro: ${data.error}`);
                            
                            // Para erro 422, verifica todos os campos da resposta
                            if (response.status === 422) {
                                // Converte o objeto de erro em string para debug
                                const errorStr = JSON.stringify(data, null, 2);
                                console.log(`Detalhes completos do erro 422: ${errorStr}`);
                                erroItem.erros.push(`Erro de validação: ${errorStr}`);
                                
                                // Verifica campos específicos
                                Object.keys(data).forEach(key => {
                                    if (key !== 'detail' && key !== 'message' && key !== 'error') {
                                        const msg = `Campo '${key}': ${JSON.stringify(data[key])}`;
                                        erroItem.erros.push(msg);
                                    }
                                });
                            }
                        } catch (jsonError) {
                            // Se não for JSON válido, adiciona o texto bruto
                            console.error('Erro ao analisar resposta JSON:', jsonError);
                            erroItem.erros.push(`Resposta não-JSON: ${rawText}`);
                        }
                    }).catch(err => {
                        console.error('Erro ao processar texto da resposta:', err);
                    });
                }
                
                // Processa o próximo produto
                processarProduto(index + 1);
            })
            .catch(error => {
                processados++;
                falhas++;
                
                // Verifica se o erro está relacionado à verificação de existência
                let mensagemErro = error.message || 'Erro desconhecido';
                if (mensagemErro.includes('verificar existência')) {
                    mensagemErro = `Erro ao verificar se o produto existe: ${mensagemErro}`;
                } else {
                    mensagemErro = `Erro ao processar produto: ${mensagemErro}`;
                }
                
                // Log de erro detalhado
                console.error(`[API LOG] Erro na requisição para o produto ${produto.codigo}:`, error);
                console.error(`[API LOG] Mensagem de erro: ${mensagemErro}`);
                console.error(`Erro ao importar produto ${produto.codigo}:`, mensagemErro);
                
                // Captura o erro para o relatório com detalhes mais claros
                errosImportacao.push({
                    linha: index + 1,
                    codigo: produto.codigo,
                    nome: produto.nome,
                    erros: [mensagemErro]
                });
                
                // Continua mesmo com erro
                processarProduto(index + 1);
            });
        };
        
        // Inicia o processamento do primeiro produto
        processarProduto(0);
        
    } catch (error) {
        console.error('Erro inesperado ao enviar produtos para a API:', error);
        if (loadingMessage && document.body.contains(loadingMessage)) {
            document.body.removeChild(loadingMessage);
        }
        alert('Erro ao importar produtos. Tente novamente.');
    }
}

// Exporta os produtos filtrados para Excel
function exportarProdutosParaExcel() {
    console.log('Iniciando exportação de produtos para Excel...');
    
    try {
        // Obtém valores dos filtros atuais
        const categoria = document.getElementById('filtroCategoria').value;
        const status = document.getElementById('filtroStatus').value;
        
        // Constrói a URL com os filtros
        let url = 'http://localhost:8000/api/produtos?';
        if (categoria) url += `categoria=${categoria}&`;
        if (status !== '') url += `ativo=${status}&`;
        
        console.log(`Buscando produtos filtrados para exportação: ${url}`);
        
        const token = getToken();
        
        // Faz a requisição para a API com os mesmos filtros da tabela
        fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar produtos para exportação');
            }
            return response.json();
        })
        .then(produtos => {
            if (!produtos || produtos.length === 0) {
                alert('Não há produtos para exportar com os filtros atuais.');
                return;
            }
            
            console.log(`Exportando ${produtos.length} produtos para Excel`);
            
            // Prepara os dados para o Excel
            const dadosExcel = produtos.map(produto => {
                // Formata os valores para o Excel
                return {
                    'Código': produto.codigo || '',
                    'Nome': produto.nome || '',
                    'Descrição': produto.descricao || '',
                    'Categoria': produto.categoria_nome || 'Não categorizado',
                    'Preço de Custo': produto.preco_custo ? Number(produto.preco_custo) : 0,
                    'Preço de Venda': produto.preco_venda ? Number(produto.preco_venda) : 0,
                    'Estoque Atual': produto.estoque_atual || 0,
                    'Estoque Mínimo': produto.estoque_minimo || 0,
                    'Status': produto.ativo ? 'Ativo' : 'Inativo'
                };
            });
            
            // Cria uma planilha
            const ws = XLSX.utils.json_to_sheet(dadosExcel);
            
            // Formata as colunas numéricas para exibir como moeda
            const range = XLSX.utils.decode_range(ws['!ref']);
            const precoCustoCol = XLSX.utils.encode_col(4); // Coluna E (Preço de Custo)
            const precoVendaCol = XLSX.utils.encode_col(5); // Coluna F (Preço de Venda)
            
            for (let row = range.s.r + 1; row <= range.e.r; ++row) {
                const cellCusto = precoCustoCol + (row + 1);
                const cellVenda = precoVendaCol + (row + 1);
                
                if (ws[cellCusto]) ws[cellCusto].z = 'R$#,##0.00';
                if (ws[cellVenda]) ws[cellVenda].z = 'R$#,##0.00';
            }
            
            // Cria um workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
            
            // Gera o nome do arquivo com data e hora
            const dataHora = new Date().toISOString().replace(/[\-:]/g, '').replace('T', '_').substring(0, 15);
            const nomeArquivo = `produtos_${dataHora}.xlsx`;
            
            // Exporta o arquivo
            XLSX.writeFile(wb, nomeArquivo);
            
            console.log(`Arquivo Excel exportado com sucesso: ${nomeArquivo}`);
        })
        .catch(error => {
            console.error('Erro ao exportar produtos:', error);
            
            // Verifica se é um problema de URL da API
            if (error.message.includes('404') || error.message.includes('conexão')) {
                // Tenta sincronizar a URL da API
                tryAlternativeEndpoint();
            }
            
            // Mostra mensagem de erro ao usuário
            alert(`Erro ao exportar produtos: ${error.message}\nPor favor, verifique a conexão com a API e tente novamente.`);
        });
    } catch (error) {
        console.error('Erro inesperado ao exportar produtos:', error);
        alert('Erro ao exportar produtos. Tente novamente.');
    }
}

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
