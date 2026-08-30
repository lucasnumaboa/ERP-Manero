// Variável global para armazenar dados do produto original (para detectar alterações de preço)
let produtoOriginal = null;

// Funções para controlar o Loading Overlay de Produtos
function mostrarLoadingProduto(texto = 'Salvando produto...', textoProgresso = 'Aguarde...') {
    const overlay = document.getElementById('loadingOverlayProdutos');
    const loadingText = document.getElementById('loadingTextProdutos');
    const progressText = document.getElementById('loadingProgressTextProdutos');

    if (overlay) {
        if (loadingText) loadingText.textContent = texto;
        if (progressText) progressText.textContent = textoProgresso;
        overlay.classList.add('active');
    }
}

function esconderLoadingProduto() {
    const overlay = document.getElementById('loadingOverlayProdutos');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function () {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Configura o botão de logout
    document.getElementById('logoutBtn').addEventListener('click', function (e) {
        e.preventDefault();
        logout();
    });

    // Configura o botão de toggle do sidebar
    document.getElementById('toggleSidebar').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    // Carrega os dados do usuário
    loadUserData();

    // NÃO carrega produtos automaticamente - usuário deve clicar em pesquisar
    // Mostra mensagem inicial
    document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="9" class="text-center">Clique no botão de pesquisa (lupa) para carregar os produtos</td></tr>';

    // Carrega as categorias para o dropdown
    loadCategorias();

    // Carrega os depósitos para o dropdown
    loadDepositos();

    // Configura os botões de ação
    setupActionButtons();

    // Configura o evento de pesquisa (Enter no campo de pesquisa)
    document.getElementById('filtroPesquisa').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            filtrarProdutos();
        }
    });

    // NÃO dispara pesquisa automaticamente ao mudar filtros
    // Usuário deve clicar na lupa para pesquisar

    // Configura sistema de abas do modal
    configurarAbasModalProdutos();
});

// Função para configurar o sistema de abas do modal de produtos
function configurarAbasModalProdutos() {
    const tabs = document.querySelectorAll('#produtoModal .modal-tab');
    const contents = document.querySelectorAll('#produtoModal .modal-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            const targetId = this.getAttribute('data-tab');

            // Remover active de todas as abas
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Adicionar active na aba clicada
            this.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// Função para resetar abas ao abrir modal de produtos
function resetarAbasModalProdutos() {
    const tabs = document.querySelectorAll('#produtoModal .modal-tab');
    const contents = document.querySelectorAll('#produtoModal .modal-tab-content');

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    // Ativar primeira aba
    if (tabs.length > 0) tabs[0].classList.add('active');
    if (contents.length > 0) contents[0].classList.add('active');
}

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

// Variável global para armazenar todos os produtos
let todosProdutos = [];

// Carrega apenas os produtos do usuário logado
async function loadProdutos() {
    // Mostra mensagem de carregamento
    document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="9" class="text-center">Carregando produtos...</td></tr>';

    try {
        // Carrega apenas os produtos do usuário logado
        console.log('Carregando produtos do usuário logado...');
        const data = await apiGet('/api/produtos?apenas_meus=true');

        // Armazena os produtos do usuário
        todosProdutos = data || [];
        console.log(`${todosProdutos.length} produtos carregados da API`);
        console.log('Primeiros produtos:', todosProdutos.slice(0, 3));

        // Aplica os filtros no frontend
        filtrarProdutos();
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
                imagemHtml = `<img src="https://erp-api-call.autoservto.com.br/uploads/${primeiraImagem.replace('uploads/', '')}" alt="${produto.nome}" class="produto-thumbnail" style="width: 40px; height: 40px; object-fit: cover; margin-right: 10px;">`;
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
        row.addEventListener('click', function (e) {
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
        button.addEventListener('click', function (e) {
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
        button.addEventListener('click', function (e) {
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

// Carrega os depósitos para o dropdown do formulário de produto
async function loadDepositos() {
    const selectDeposito = document.getElementById('deposito_id');
    if (!selectDeposito) return;

    try {
        const depositos = await apiGet('/api/depositos');
        selectDeposito.innerHTML = '<option value="">Selecione...</option>';

        if (depositos && depositos.length > 0) {
            depositos.forEach(deposito => {
                const option = document.createElement('option');
                option.value = deposito.id;
                option.textContent = deposito.nome + (deposito.padrao ? ' (padrão)' : '');
                selectDeposito.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar depósitos:', error);
    }
}

// Abre o modal para criar novo depósito
function openDepositoModal() {
    document.getElementById('depositoForm').reset();
    document.getElementById('depositoModal').classList.add('active');
}

// Fecha o modal de depósito
function closeDepositoModal() {
    document.getElementById('depositoModal').classList.remove('active');
}

// Salva um novo depósito
async function saveDeposito() {
    const nome = document.getElementById('deposito_nome').value;
    const descricao = document.getElementById('deposito_descricao').value;

    if (!nome) {
        alert('Por favor, preencha o nome do depósito.');
        return;
    }

    try {
        const depositoData = {
            nome: nome,
            descricao: descricao || null
        };

        const data = await apiPost('/api/depositos', depositoData);

        closeDepositoModal();
        await loadDepositos();
        document.getElementById('deposito_id').value = data.id;

        alert('Depósito criado com sucesso!');
    } catch (error) {
        console.error('Erro ao criar depósito:', error);
        alert(`Erro ao criar depósito: ${error.message}`);
    }
}

// Configura os botões do modal de depósito
document.addEventListener('DOMContentLoaded', function () {
    const btnNovoDeposito = document.getElementById('btnNovoDepositoModal');
    if (btnNovoDeposito) {
        btnNovoDeposito.addEventListener('click', openDepositoModal);
    }

    const btnCancelarDeposito = document.getElementById('btnCancelarDeposito');
    if (btnCancelarDeposito) {
        btnCancelarDeposito.addEventListener('click', closeDepositoModal);
    }

    const btnSalvarDeposito = document.getElementById('btnSalvarDeposito');
    if (btnSalvarDeposito) {
        btnSalvarDeposito.addEventListener('click', saveDeposito);
    }

    const closeButtonsDeposito = document.querySelectorAll('#depositoModal .close-modal');
    closeButtonsDeposito.forEach(btn => {
        btn.addEventListener('click', closeDepositoModal);
    });
});

// Configura os botões de ação
function setupActionButtons() {
    console.log('Configurando botões de ação...');

    // Botão Novo Produto
    const btnNovoProduto = document.getElementById('btnNovoProduto');
    if (btnNovoProduto) {
        console.log('Botão Novo Produto encontrado, adicionando event listener');
        btnNovoProduto.addEventListener('click', function (e) {
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
        button.addEventListener('click', function (e) {
            console.log('Botão fechar modal clicado!');
            e.preventDefault();
            closeModal('produtoModal');
        });
    });

    // Botão Salvar
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) {
        console.log('Botão Salvar encontrado, adicionando event listener');
        btnSalvar.addEventListener('click', function (e) {
            console.log('Botão Salvar clicado!');
            e.preventDefault();
            saveProduto();
        });
    } else {
        console.error('Botão Salvar não encontrado no DOM!');
    }

    // Botão Gerar Descrição por IA
    const btnGerarDescricaoIA = document.getElementById('btnGerarDescricaoIA');
    if (btnGerarDescricaoIA) {
        console.log('Botão Gerar Descrição por IA encontrado, adicionando event listener');
        btnGerarDescricaoIA.addEventListener('click', function (e) {
            console.log('Botão Gerar Descrição por IA clicado!');
            e.preventDefault();
            if (typeof gerarDescricaoIA === 'function') {
                gerarDescricaoIA();
            } else {
                alert('Função de geração de descrição por IA não disponível.');
            }
        });
    } else {
        console.warn('Botão Gerar Descrição por IA não encontrado no DOM');
    }

    // Botões de microfone (ditar por voz, transcrito localmente via Parakeet)
    document.getElementById('btnMicDescricao')?.addEventListener('click', function () {
        alternarGravacaoAudio(this, function (texto) {
            const campo = document.getElementById('descricao');
            campo.value = (campo.value ? campo.value + ' ' : '') + texto;
        });
    });
    document.getElementById('btnMicInstrucoes')?.addEventListener('click', function () {
        alternarGravacaoAudio(this, function (texto) {
            const campo = document.getElementById('instrucoes_duvidas');
            campo.value = (campo.value ? campo.value + ' ' : '') + texto;
        });
    });

    // Filtros NÃO disparam automaticamente - usuário deve clicar no botão de pesquisa
    // Os filtros são lidos quando o usuário clica em pesquisar (filtrarProdutos())

    // Botões de paginação
    const paginationButtons = document.querySelectorAll('.btn-page');
    console.log(`Encontrados ${paginationButtons.length} botões de paginação`);
    paginationButtons.forEach(button => {
        button.addEventListener('click', function (e) {
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
            input.addEventListener('input', function () {
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
        imagensInput.addEventListener('change', function (e) {
            const files = Array.from(e.target.files);
            const previewContainer = document.getElementById('preview_imagens');

            // Limitar a 5 imagens
            if (files.length > 5) {
                alert('Você pode selecionar no máximo 5 imagens.');
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
                    reader.onload = function (e) {
                        const previewDiv = document.createElement('div');
                        previewDiv.style.cssText = 'position: relative; display: inline-block;';

                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px;';

                        const removeBtn = document.createElement('button');
                        removeBtn.innerHTML = '×';
                        removeBtn.type = 'button';
                        removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;';
                        removeBtn.onclick = function () {
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

    // Configurar preview de vídeo
    const videoInput = document.getElementById('video_produto');
    if (videoInput) {
        videoInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            const previewContainer = document.getElementById('preview_video');
            previewContainer.innerHTML = '';

            if (!file) return;

            if (!file.type.startsWith('video/')) {
                alert('Por favor, selecione um arquivo de vídeo válido.');
                e.target.value = '';
                return;
            }

            const url = URL.createObjectURL(file);
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; display: inline-block;';

            const videoEl = document.createElement('video');
            videoEl.src = url;
            videoEl.controls = true;
            videoEl.style.cssText = 'max-width: 240px; max-height: 160px; border: 1px solid #ddd; border-radius: 4px;';

            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '×';
            removeBtn.type = 'button';
            removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;';
            removeBtn.onclick = function () {
                wrapper.remove();
                videoInput.value = '';
            };

            wrapper.appendChild(videoEl);
            wrapper.appendChild(removeBtn);
            previewContainer.appendChild(wrapper);
        });
    }
}

// Função para carregar e exibir vídeo já cadastrado do produto
function carregarVideoProduto(caminhoVideo) {
    const previewDiv = document.getElementById('preview_video');
    if (!previewDiv) return;

    previewDiv.innerHTML = '';

    if (!caminhoVideo) return;

    const apiUrl = "https://erp-api-call.autoservto.com.br";
    const videoUrl = `${apiUrl}/uploads/${caminhoVideo.trim().replace('uploads/', '')}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-video';
    wrapper.innerHTML = `
        <video src="${videoUrl}" controls style="max-width: 240px; max-height: 160px; border: 1px solid #ddd; border-radius: 4px;"></video>
        <div class="preview-actions">
            <a href="${videoUrl}" download title="Baixar vídeo">
                <i class="fas fa-download"></i>
            </a>
        </div>
    `;
    previewDiv.appendChild(wrapper);
}

// Função para carregar e exibir imagens do produto
async function carregarImagensProduto(caminhoImagem) {
    if (!caminhoImagem) return;

    const previewDiv = document.getElementById('preview_imagens');
    if (!previewDiv) return;

    previewDiv.innerHTML = '';

    try {
        const apiUrl = "https://erp-api-call.autoservto.com.br";

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

        // Limpa o preview de vídeo
        const previewVideoDiv = document.getElementById('preview_video');
        if (previewVideoDiv) {
            previewVideoDiv.innerHTML = '';
        }
        const videoInputEl = document.getElementById('video_produto');
        if (videoInputEl) {
            videoInputEl.value = '';
        }

        // Se for edição, carrega os dados do produto
        if (produtoId) {
            console.log(`Carregando dados do produto ID: ${produtoId}`);
            loadProdutoData(produtoId).then(produto => {
                // Carregar imagens do produto
                if (produto && produto.caminho_imagem) {
                    carregarImagensProduto(produto.caminho_imagem);
                }
                // Carregar vídeo do produto
                if (produto && produto.caminho_video) {
                    carregarVideoProduto(produto.caminho_video);
                }
                // Guarda os dados originais do produto para comparar preço depois
                produtoOriginal = produto ? { ...produto } : null;
                console.log('[Webhook] Produto original guardado para comparação de preço:', produtoOriginal);
            });
        } else {
            // Se for novo produto, limpa o ID do formulário e gera um novo código
            form.removeAttribute('data-id');
            produtoOriginal = null; // Limpa dados do produto original
            console.log('Removido atributo data-id do formulário');

            // Gera o próximo código de produto automaticamente
            gerarProximoCodigoProduto();
        }

        // Resetar abas para a primeira
        resetarAbasModalProdutos();

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

        console.log('Modal aberto com jQuery');
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
            1: { codigo: 'P001', nome: 'Notebook Dell', descricao: 'Notebook Dell Inspiron 15', preco_custo: 2800, preco_venda: 3500, estoque_minimo: 5, categoria_id: 1, ativo: true, caminho_imagem: '' },
            2: { codigo: 'P002', nome: 'Mouse Logitech', descricao: 'Mouse sem fio Logitech', preco_custo: 50, preco_venda: 89.90, estoque_minimo: 10, categoria_id: 1, ativo: true, caminho_imagem: '' },
            3: { codigo: 'P003', nome: 'Cadeira Gamer', descricao: 'Cadeira Gamer Ergonômica', preco_custo: 700, preco_venda: 950, estoque_minimo: 3, categoria_id: 2, ativo: true, caminho_imagem: '' },
            4: { codigo: 'P004', nome: 'Teclado Mecânico', descricao: 'Teclado Mecânico RGB', preco_custo: 200, preco_venda: 299.90, estoque_minimo: 8, categoria_id: 1, ativo: false, caminho_imagem: '' }
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

        const instrucoesDuvidasInput = document.getElementById('instrucoes_duvidas');
        if (instrucoesDuvidasInput) instrucoesDuvidasInput.value = produto.instrucoes_duvidas || '';

        const precoCustoInput = document.getElementById('preco_custo');
        if (precoCustoInput) precoCustoInput.value = produto.preco_custo ? String(produto.preco_custo).replace('.', ',') : '';

        const precoVendaInput = document.getElementById('preco_venda');
        if (precoVendaInput) precoVendaInput.value = produto.preco_venda ? String(produto.preco_venda).replace('.', ',') : '';

        const comissaoInput = document.getElementById('comissao');
        if (comissaoInput) comissaoInput.value = produto.comissao ? String(produto.comissao).replace('.', ',') : '0';

        const estoqueMinInput = document.getElementById('estoque_minimo');
        if (estoqueMinInput) estoqueMinInput.value = produto.estoque_minimo || '';

        const categoriaInput = document.getElementById('categoria_id');
        if (categoriaInput) categoriaInput.value = produto.categoria_id || '';

        const depositoInput = document.getElementById('deposito_id');
        if (depositoInput) depositoInput.value = produto.deposito_id || '';

        const faturavelInput = document.getElementById('faturavel');
        if (faturavelInput) faturavelInput.checked = produto.faturavel !== false;

        const postOlxInput = document.getElementById('post_olx');
        if (postOlxInput) postOlxInput.checked = produto.post_olx === true;

        const postFacebookInput = document.getElementById('post_facebook');
        if (postFacebookInput) postFacebookInput.checked = produto.post_facebook === true;

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

    // Mostra loading enquanto salva
    mostrarLoadingProduto('Cadastrando produto...', 'Aguarde, processando...');

    try {
        const form = document.getElementById('produtoForm');
        if (!form) {
            console.error('Formulário não encontrado!');
            esconderLoadingProduto();
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
        const instrucoes_duvidas = document.getElementById('instrucoes_duvidas')?.value || '';
        const preco_custo_value = document.getElementById('preco_custo')?.value || '';
        const preco_venda_value = document.getElementById('preco_venda')?.value || '';
        const comissao_value = document.getElementById('comissao')?.value || '';

        // Validação de formato de preços: apenas dígitos e opcionalmente uma vírgula seguida de até 2 dígitos
        const priceRegex = /^[0-9]+(,[0-9]{1,2})?$/;

        // Validar formato de custo apenas se preenchido (campo opcional)
        if (preco_custo_value && !priceRegex.test(preco_custo_value)) {
            console.error('Formato de Preço de Custo inválido:', preco_custo_value);
            alert('Formato inválido para Preço de Custo. Use apenas números e até 2 casas decimais separadas por vírgula.');
            esconderLoadingProduto();
            return;
        }

        // Verifica se é faturável para validar preço de venda
        const faturavelCheck = document.getElementById('faturavel')?.checked || false;

        // Preço de venda é obrigatório apenas se for faturável
        if (faturavelCheck && !preco_venda_value) {
            console.error('Preço de Venda não preenchido e item é faturável');
            alert('Por favor, preencha o Preço de Venda (obrigatório para itens faturáveis).');
            esconderLoadingProduto();
            return;
        }
        // Valida formato apenas se preenchido
        if (preco_venda_value && !priceRegex.test(preco_venda_value)) {
            console.error('Formato de Preço de Venda inválido:', preco_venda_value);
            alert('Formato inválido para Preço de Venda. Use apenas números e até 2 casas decimais separadas por vírgula.');
            esconderLoadingProduto();
            return;
        }
        if (comissao_value && !priceRegex.test(comissao_value)) {
            console.error('Formato de Comissão inválido:', comissao_value);
            alert('Formato inválido para Comissão. Use apenas números e até 2 casas decimais separadas por vírgula.');
            esconderLoadingProduto();
            return;
        }

        const preco_custo = preco_custo_value ? parseFloat(preco_custo_value.replace(',', '.')) : 0; // custo opcional, default 0
        const preco_venda = preco_venda_value ? parseFloat(preco_venda_value.replace(',', '.')) : 0; // converte vírgula para ponto
        const comissao = comissao_value ? parseFloat(comissao_value.replace(',', '.')) : 0; // converte vírgula para ponto
        const estoque_minimo = parseInt(document.getElementById('estoque_minimo')?.value || 0);
        const categoria_id = document.getElementById('categoria_id')?.value || '';
        const deposito_id = document.getElementById('deposito_id')?.value || '';
        const tipo_produto = document.getElementById('tipo_produto')?.value || 'comprado';
        const faturavel = document.getElementById('faturavel')?.checked || false;
        const post_olx = document.getElementById('post_olx')?.checked || false;
        const post_facebook = document.getElementById('post_facebook')?.checked || false;
        const ativo = document.getElementById('ativo')?.checked || false;

        // Coleta as imagens
        const imagensInput = document.getElementById('imagens_produto');
        const imagensOriginais = imagensInput ? imagensInput.files : [];

        // Comprime as imagens antes de enviar
        let imagens = [];
        if (imagensOriginais.length > 0) {
            console.log('Comprimindo imagens antes do envio...');
            try {
                for (let i = 0; i < imagensOriginais.length; i++) {
                    const originalFile = imagensOriginais[i];
                    console.log(`Comprimindo imagem ${i + 1}/${imagensOriginais.length}: ${originalFile.name} (${ImageCompressor.formatFileSize(originalFile.size)})`);

                    // Comprime a imagem
                    const compressedBlob = await ImageCompressor.compress(originalFile, {
                        maxWidth: 1920,
                        maxHeight: 1080,
                        quality: 0.8,
                        maxSizeMB: 1,
                        debug: true
                    });

                    // Converte Blob para File mantendo o nome original
                    const compressedFile = ImageCompressor.blobToFile(compressedBlob, originalFile.name);
                    imagens.push(compressedFile);

                    console.log(`Imagem ${i + 1} comprimida: ${ImageCompressor.formatFileSize(compressedFile.size)}`);
                }
                console.log('Todas as imagens foram comprimidas com sucesso!');
            } catch (error) {
                console.error('Erro ao comprimir imagens:', error);
                alert('Erro ao comprimir imagens. Tentando enviar originais...');
                imagens = Array.from(imagensOriginais);
            }
        }

        // Obtém o ID do usuário atual
        const userData = getUserData();
        const usuario_id = userData ? userData.id : null;

        if (!usuario_id) {
            console.error('ID do usuário não encontrado!');
            alert('Erro: Não foi possível identificar o usuário. Por favor, faça login novamente.');
            return;
        }

        // Cria FormData para envio
        const formData = new FormData();
        formData.append('codigo', codigo);
        formData.append('nome', nome);
        formData.append('descricao', descricao);
        formData.append('instrucoes_duvidas', instrucoes_duvidas);
        formData.append('preco_custo', preco_custo);
        formData.append('preco_venda', preco_venda);
        formData.append('estoque_minimo', estoque_minimo);
        formData.append('categoria_id', categoria_id);
        formData.append('tipo_produto', tipo_produto);
        formData.append('comissao', comissao);
        formData.append('faturavel', faturavel);
        formData.append('post_olx', post_olx);
        formData.append('post_facebook', post_facebook);
        formData.append('ativo', ativo);
        formData.append('usuario_id', usuario_id);
        if (deposito_id) {
            formData.append('deposito_id', deposito_id);
        }

        // Adiciona as imagens ao FormData
        for (let i = 0; i < imagens.length; i++) {
            formData.append('imagens', imagens[i]);
        }

        // Adiciona o vídeo ao FormData, se selecionado
        const videoInput = document.getElementById('video_produto');
        if (videoInput && videoInput.files && videoInput.files[0]) {
            formData.append('video', videoInput.files[0]);
        }

        console.log('Dados do produto a serem salvos');

        // Validação básica
        if (!codigo || !nome) {
            console.error('Campos obrigatórios não preenchidos!');
            alert('Por favor, preencha todos os campos obrigatórios.');
            esconderLoadingProduto();
            return;
        }

        // Validações numéricas (preco_custo não é validado pois é opcional e já tem default 0)
        if (isNaN(preco_venda)) {
            console.error('Preço de venda inválido!');
            alert('Por favor, insira um valor numérico válido para o preço de venda.');
            esconderLoadingProduto();
            return;
        }
        if (isNaN(estoque_minimo)) {
            console.error('Estoque mínimo inválido!');
            alert('Por favor, insira um valor numérico válido para o estoque mínimo.');
            esconderLoadingProduto();
            return;
        }

        // Validação de categoria obrigatória
        if (!categoria_id) {
            console.error('Categoria obrigatória não selecionada!');
            alert('Por favor, selecione a categoria.');
            esconderLoadingProduto();
            return;
        }

        console.log(`Enviando requisição para API centralizada`);

        let data;

        if (produtoId) {
            // Para atualização, verificar se há imagens ou vídeo novos selecionados
            const videoSelecionado = videoInput && videoInput.files && videoInput.files.length > 0;
            if (imagens.length > 0 || videoSelecionado) {
                // Se tiver imagens/vídeo, usar PUT com FormData para o endpoint específico de upload
                formData.append('id', produtoId);
                console.log(`Atualizando produto ID: ${produtoId} com imagens/vídeo`);
                data = await apiPostFormData(`/api/produtos/${produtoId}/upload`, formData);
            } else {
                // Se não tiver imagens nem vídeo novos, usar PUT normal com JSON
                console.log(`Atualizando produto ID: ${produtoId} sem imagens/vídeo`);
                const jsonData = {
                    codigo, nome, descricao, instrucoes_duvidas, preco_custo, preco_venda,
                    estoque_minimo, categoria_id, tipo_produto, comissao, faturavel, post_olx, post_facebook, ativo, usuario_id
                };
                if (deposito_id) {
                    jsonData.deposito_id = parseInt(deposito_id, 10);
                }
                data = await apiPut(`/api/produtos/${produtoId}`, jsonData);
            }
        } else {
            // Cria novo produto com FormData (incluindo imagens)
            console.log('Criando novo produto');
            data = await apiPostFormData('/api/produtos', formData);
        }

        console.log('Produto salvo com sucesso:', data);

        // Se for edição e o preço de venda mudou, notifica via webhook
        if (produtoId && produtoOriginal && window.webhookEstoque) {
            const precoAnterior = parseFloat(produtoOriginal.preco_venda) || 0;
            const precoNovo = preco_venda;

            if (precoAnterior !== precoNovo) {
                console.log('[Webhook] Detectada alteração de preço:', { precoAnterior, precoNovo });

                // Monta os dados do produto para o webhook
                const dadosProdutoWebhook = {
                    id: produtoId,
                    nome: nome,
                    codigo: codigo,
                    preco_venda: precoNovo,
                    comissao: comissao,
                    faturavel: faturavel,
                    estoque_atual: produtoOriginal.estoque_atual
                };

                // Envia notificação de alteração de preço
                window.webhookEstoque.notificarAlteracaoPreco(dadosProdutoWebhook, precoAnterior, precoNovo);
            }
        }

        // Limpa os dados do produto original
        produtoOriginal = null;

        // Fecha o modal
        closeModal('produtoModal');

        // Recarrega a lista de produtos
        loadProdutos();

        // Exibe mensagem de sucesso
        esconderLoadingProduto();
        alert(produtoId ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar produto:', error);

        // Esconde loading e exibe mensagem de erro
        esconderLoadingProduto();
        alert(`Erro ao salvar produto: ${error.message || 'Verifique os dados e tente novamente'}`);
    }
}

// Gera o próximo código de produto automaticamente
function gerarProximoCodigoProduto() {
    console.log('Gerando próximo código de produto...');

    try {
        const token = getToken();

        // Busca todos os produtos para determinar o próximo código
        fetch('https://erp-api-call.autoservto.com.br/api/produtos', {
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

// Abre o modal para criar nova categoria
function openCategoriaModal() {
    document.getElementById('categoriaForm').reset();
    document.getElementById('categoriaModal').classList.add('active');
}

// Fecha o modal de categoria
function closeCategoriaModal() {
    document.getElementById('categoriaModal').classList.remove('active');
}

// Salva uma nova categoria
async function saveCategoria() {
    const nome = document.getElementById('categoria_nome').value;
    const descricao = document.getElementById('categoria_descricao').value;

    if (!nome) {
        alert('Por favor, preencha o nome da categoria.');
        return;
    }

    try {
        const categoriaData = {
            nome: nome,
            descricao: descricao || null
        };

        console.log('Criando categoria:', categoriaData);
        const data = await apiPost('/api/categorias', categoriaData);
        console.log('Categoria criada com sucesso:', data);

        // Fecha o modal de categoria
        closeCategoriaModal();

        // Recarrega a lista de categorias
        await loadCategorias();

        // Seleciona a nova categoria
        document.getElementById('categoria_id').value = data.id;

        // Exibe mensagem de sucesso
        alert('Categoria criada com sucesso!');
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        alert(`Erro ao criar categoria: ${error.message}`);
    }
}

// Configura os botões do modal de categoria
document.addEventListener('DOMContentLoaded', function () {
    // Botão para abrir modal de nova categoria
    const btnNovaCategoria = document.getElementById('btnNovaCategoriaModal');
    if (btnNovaCategoria) {
        btnNovaCategoria.addEventListener('click', openCategoriaModal);
    }

    // Botão para cancelar
    const btnCancelarCategoria = document.getElementById('btnCancelarCategoria');
    if (btnCancelarCategoria) {
        btnCancelarCategoria.addEventListener('click', closeCategoriaModal);
    }

    // Botão para salvar
    const btnSalvarCategoria = document.getElementById('btnSalvarCategoria');
    if (btnSalvarCategoria) {
        btnSalvarCategoria.addEventListener('click', saveCategoria);
    }

    // Fechar modal ao clicar no X
    const closeButtons = document.querySelectorAll('#categoriaModal .close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', closeCategoriaModal);
    });
});

// Função para filtrar produtos no frontend - chamada ao clicar no botão de pesquisa
function filtrarProdutos() {
    console.log('Filtrando produtos no frontend...');
    console.log('Total de produtos disponíveis:', todosProdutos.length);

    // Se não há produtos carregados, carrega da API primeiro
    if (todosProdutos.length === 0) {
        console.log('Nenhum produto carregado ainda, chamando loadProdutos()...');
        loadProdutos();
        return;
    }

    // Obtém valores dos filtros
    const termoPesquisa = document.getElementById('filtroPesquisa').value.toLowerCase().trim();
    const categoria = document.getElementById('filtroCategoria').value;
    const status = document.getElementById('filtroStatus').value;
    const apenasComEstoque = document.getElementById('filtroApenasComEstoque').checked;

    console.log('Filtros:', { termoPesquisa, categoria, status, apenasComEstoque });

    // Filtra os produtos
    let produtosFiltrados = todosProdutos.filter(produto => {
        // Filtro de pesquisa (busca em nome, código, descrição e categoria)
        let matchPesquisa = true;
        if (termoPesquisa) {
            const nome = (produto.nome || '').toLowerCase();
            const codigo = (produto.codigo || '').toLowerCase();
            const descricao = (produto.descricao || '').toLowerCase();
            const categoriaNome = (produto.categoria_nome || '').toLowerCase();

            matchPesquisa = nome.includes(termoPesquisa) ||
                codigo.includes(termoPesquisa) ||
                descricao.includes(termoPesquisa) ||
                categoriaNome.includes(termoPesquisa);

            console.log(`Produto "${produto.nome}" - Match: ${matchPesquisa}`);
        }

        // Filtro de categoria
        let matchCategoria = true;
        if (categoria) {
            matchCategoria = produto.categoria_id == categoria;
        }

        // Filtro de status
        let matchStatus = true;
        if (status !== '') {
            matchStatus = produto.ativo == (status === 'true');
        }

        // Filtro de apenas com estoque
        let matchEstoque = true;
        if (apenasComEstoque) {
            matchEstoque = (produto.estoque_atual || 0) > 0;
        }

        return matchPesquisa && matchCategoria && matchStatus && matchEstoque;
    });

    console.log(`${produtosFiltrados.length} produtos após filtros`);

    // Inicializa a paginação com os produtos filtrados
    window.currentDisplayFunction = displayProdutos;
    initPagination(produtosFiltrados, displayProdutos);
}

// Função para limpar todos os filtros
function limparFiltros() {
    console.log('Limpando filtros...');

    // Limpa o campo de pesquisa
    document.getElementById('filtroPesquisa').value = '';

    // Reseta os selects para o valor padrão
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroApenasComEstoque').checked = false;

    // Se já tiver produtos carregados, mostra todos
    if (todosProdutos.length > 0) {
        filtrarProdutos();
    } else {
        // Mostra mensagem inicial
        document.getElementById('produtosTableBody').innerHTML = '<tr><td colspan="9" class="text-center">Clique no botão de pesquisa para carregar os produtos</td></tr>';

        // Limpa a paginação
        const paginationContainer = document.querySelector('.pagination');
        if (paginationContainer) {
            paginationContainer.innerHTML = '';
        }
    }
}

// ============================================
// SISTEMA DE CONSUMO DE PRODUTOS (BOM)
// ============================================

// Variável para armazenar o ID do produto sendo editado no consumo
let consumoProdutoId = null;

// Configura os events listeners para o sistema de consumo
document.addEventListener('DOMContentLoaded', function () {
    // Botão para adicionar componente
    const btnAdicionarConsumo = document.getElementById('btnAdicionarConsumo');
    if (btnAdicionarConsumo) {
        btnAdicionarConsumo.addEventListener('click', abrirModalConsumo);
    }

    // Botão cancelar no modal de consumo
    const btnCancelarConsumo = document.getElementById('btnCancelarConsumo');
    if (btnCancelarConsumo) {
        btnCancelarConsumo.addEventListener('click', fecharModalConsumo);
    }

    // Botão fechar modal consumo (X)
    const closeConsumoModal = document.querySelectorAll('#consumoModal .close-modal');
    closeConsumoModal.forEach(btn => {
        btn.addEventListener('click', fecharModalConsumo);
    });

    // Botão salvar componente
    const btnSalvarConsumo = document.getElementById('btnSalvarConsumo');
    if (btnSalvarConsumo) {
        btnSalvarConsumo.addEventListener('click', salvarConsumoItem);
    }

    // Listener para mudança de tipo de produto (mostrar/esconder aba consumo)
    const tipoProdutoSelect = document.getElementById('tipo_produto');
    if (tipoProdutoSelect) {
        tipoProdutoSelect.addEventListener('change', function () {
            atualizarVisibilidadeAbaConsumo(this.value);
        });
    }
});

// Atualiza a visibilidade da aba de consumo baseado no tipo de produto
function atualizarVisibilidadeAbaConsumo(tipoProduto) {
    const tabConsumo = document.getElementById('tabConsumo');
    if (tabConsumo) {
        if (tipoProduto === 'fabricado') {
            tabConsumo.style.display = 'block';
        } else {
            tabConsumo.style.display = 'none';
            // Se a aba de consumo estava ativa, volta para a primeira aba
            if (tabConsumo.classList.contains('active')) {
                resetarAbasModalProdutos();
            }
        }
    }
}

// Carrega os itens de consumo de um produto
async function carregarItensConsumo(produtoId) {
    console.log('Carregando itens de consumo para produto:', produtoId);
    consumoProdutoId = produtoId;

    const tbody = document.getElementById('consumoTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';

    try {
        const itens = await apiGet(`/api/produtos/${produtoId}/consumo`);
        console.log('Itens de consumo recebidos:', itens);

        if (!itens || itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum componente cadastrado</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        itens.forEach(item => {
            const row = document.createElement('tr');
            const estoqueStatus = item.consumo_produto_estoque >= item.quantidade
                ? '<span style="color: green;"><i class="fas fa-check-circle"></i></span>'
                : '<span style="color: red;"><i class="fas fa-exclamation-triangle"></i></span>';

            row.innerHTML = `
                <td>${item.consumo_produto_codigo || '-'}</td>
                <td>${item.consumo_produto_nome || '-'}</td>
                <td>${item.quantidade}</td>
                <td>${item.consumo_produto_estoque || 0} ${estoqueStatus}</td>
                <td class="actions">
                    <button class="btn-icon btn-delete" onclick="removerConsumoItem(${item.id})" title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Erro ao carregar itens de consumo:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Erro ao carregar componentes</td></tr>';
    }
}

// Abre o modal para adicionar um novo item de consumo
async function abrirModalConsumo() {
    // Verifica se temos o ID do produto
    const form = document.getElementById('produtoForm');
    const produtoId = form ? form.getAttribute('data-id') : null;

    if (!produtoId) {
        alert('Salve o produto antes de adicionar componentes.');
        return;
    }

    consumoProdutoId = produtoId;

    // Carrega a lista de produtos para o select
    await carregarProdutosParaConsumo(produtoId);

    // Limpa o formulário
    document.getElementById('consumoForm').reset();
    document.getElementById('consumo_quantidade').value = '1';

    // Abre o modal
    const modal = document.getElementById('consumoModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

// Carrega a lista de produtos disponíveis para serem adicionados como componentes
async function carregarProdutosParaConsumo(produtoIdAtual) {
    const select = document.getElementById('consumo_produto_id');
    if (!select) return;

    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        // Carrega todos os produtos ativos
        const produtos = await apiGet('/api/produtos?ativo=true');

        select.innerHTML = '<option value="">Selecione um produto...</option>';

        if (produtos && produtos.length > 0) {
            // Filtra para não incluir o produto atual
            const produtosDisponiveis = produtos.filter(p => p.id != produtoIdAtual);

            produtosDisponiveis.forEach(produto => {
                const option = document.createElement('option');
                option.value = produto.id;
                option.textContent = `${produto.codigo} - ${produto.nome} (Estoque: ${produto.estoque_atual || 0})`;
                select.appendChild(option);
            });
        }

        // Adiciona campo de pesquisa para os produtos
        adicionarPesquisaConsumo();
    } catch (error) {
        console.error('Erro ao carregar produtos para consumo:', error);
        select.innerHTML = '<option value="">Erro ao carregar produtos</option>';
    }
}

// Função para adicionar campo de pesquisa para produtos no modal de consumo
function adicionarPesquisaConsumo() {
    // ID único para o campo de pesquisa do consumo
    if (!document.getElementById('pesquisaConsumo')) {
        const selectProduto = document.getElementById('consumo_produto_id');
        const container = selectProduto.parentElement;

        // Criar campo de pesquisa
        const pesquisaDiv = document.createElement('div');
        pesquisaDiv.className = 'form-group mb-2';
        pesquisaDiv.id = 'pesquisaConsumoContainer';
        pesquisaDiv.innerHTML = `
            <label for="pesquisaConsumo">Pesquisar Produto:</label>
            <input type="text" id="pesquisaConsumo" class="form-control" placeholder="Digite para pesquisar..." style="margin-bottom: 10px;">
        `;

        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectProduto);

        // Adicionar evento de pesquisa
        document.getElementById('pesquisaConsumo').addEventListener('input', function (e) {
            const termo = e.target.value.toLowerCase();
            const options = selectProduto.querySelectorAll('option');

            options.forEach(option => {
                if (option.value === '') return; // Pular a opção "Selecione..."

                const visivel = option.textContent.toLowerCase().includes(termo);
                option.style.display = visivel ? '' : 'none';
            });
        });
    } else {
        // Se já existe, limpa o valor do campo de pesquisa
        document.getElementById('pesquisaConsumo').value = '';
        // Mostra todas as opções novamente
        const selectProduto = document.getElementById('consumo_produto_id');
        const options = selectProduto.querySelectorAll('option');
        options.forEach(option => {
            option.style.display = '';
        });
    }
}

// Fecha o modal de consumo
function fecharModalConsumo() {
    const modal = document.getElementById('consumoModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// Salva um novo item de consumo
async function salvarConsumoItem() {
    const produtoId = document.getElementById('consumo_produto_id').value;
    const quantidade = parseFloat(document.getElementById('consumo_quantidade').value);

    if (!produtoId) {
        alert('Selecione um produto componente.');
        return;
    }

    if (!quantidade || quantidade <= 0) {
        alert('A quantidade deve ser maior que zero.');
        return;
    }

    if (!consumoProdutoId) {
        alert('Erro: ID do produto pai não encontrado.');
        return;
    }

    try {
        const response = await apiPost(`/api/produtos/${consumoProdutoId}/consumo`, {
            consumo_produto_id: parseInt(produtoId),
            quantidade: quantidade
        });

        console.log('Componente adicionado:', response);
        fecharModalConsumo();

        // Recarrega a lista de componentes
        await carregarItensConsumo(consumoProdutoId);

        alert('Componente adicionado com sucesso!');
    } catch (error) {
        console.error('Erro ao adicionar componente:', error);

        // Tenta extrair mensagem de erro da API
        let mensagem = 'Erro ao adicionar componente.';
        if (error.message) {
            mensagem += ' ' + error.message;
        }
        alert(mensagem);
    }
}

// Remove um item de consumo
async function removerConsumoItem(consumoId) {
    if (!confirm('Deseja realmente remover este componente?')) {
        return;
    }

    if (!consumoProdutoId) {
        alert('Erro: ID do produto pai não encontrado.');
        return;
    }

    try {
        await apiDelete(`/api/produtos/${consumoProdutoId}/consumo/${consumoId}`);

        console.log('Componente removido:', consumoId);

        // Recarrega a lista de componentes
        await carregarItensConsumo(consumoProdutoId);

        alert('Componente removido com sucesso!');
    } catch (error) {
        console.error('Erro ao remover componente:', error);
        alert('Erro ao remover componente. Tente novamente.');
    }
}

// Sobrescreve a função preencherFormularioProduto para incluir lógica de consumo
const _preencherFormularioProdutoOriginal = preencherFormularioProduto;
preencherFormularioProduto = function (produto, produtoId) {
    // Chama a função original
    _preencherFormularioProdutoOriginal(produto, produtoId);

    // Define o tipo de produto no select
    const tipoProdutoSelect = document.getElementById('tipo_produto');
    if (tipoProdutoSelect && produto.tipo_produto) {
        tipoProdutoSelect.value = produto.tipo_produto;
    }

    // Atualiza visibilidade da aba de consumo
    atualizarVisibilidadeAbaConsumo(produto.tipo_produto || 'comprado');

    // Se for produto fabricado e estiver editando, carrega os itens de consumo
    if (produto.tipo_produto === 'fabricado' && produtoId) {
        carregarItensConsumo(produtoId);
    }
};

// ============================================
// SISTEMA DE RECÁLCULO DE CUSTO
// ============================================

let dadosRecalculoCusto = [];

// Abre o modal de recalcular custo e busca os dados
async function abrirRecalcularCusto() {
    const modal = document.getElementById('recalcularCustoModal');
    if (!modal) return;

    modal.classList.add('active');
    modal.style.display = 'flex';

    // Mostra loading, esconde conteúdo
    document.getElementById('recalcularCustoLoading').style.display = 'block';
    document.getElementById('recalcularCustoContent').style.display = 'none';
    document.getElementById('btnAplicarRecalculo').disabled = true;

    try {
        dadosRecalculoCusto = await apiGet('/api/produtos/recalcular-custo');
        console.log('[RecalcularCusto] Dados recebidos:', dadosRecalculoCusto.length, 'produtos');

        renderizarTabelaRecalculo(dadosRecalculoCusto);

        document.getElementById('recalcularCustoLoading').style.display = 'none';
        document.getElementById('recalcularCustoContent').style.display = 'block';
    } catch (error) {
        console.error('[RecalcularCusto] Erro:', error);
        document.getElementById('recalcularCustoLoading').innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #f5576c;"></i>
            <p style="margin-top: 15px; color: #f5576c;">Erro ao recalcular custos: ${error.message || 'Erro desconhecido'}</p>
        `;
    }
}

// Renderiza a tabela de recálculo de custo
function renderizarTabelaRecalculo(dados) {
    const tbody = document.getElementById('recalcularCustoTableBody');
    if (!tbody) return;

    if (!dados || dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #a8b2d1;">Nenhum produto com estoque encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    dados.forEach((item, index) => {
        const diff = item.custo_recalculado - item.custo_atual;
        const diffPercent = item.custo_atual > 0 ? ((diff / item.custo_atual) * 100).toFixed(1) : '0.0';
        let diffClass = 'diff-zero';
        let diffText = 'R$ 0,00';

        if (Math.abs(diff) > 0.01) {
            if (diff > 0) {
                diffClass = 'diff-positiva';
                diffText = `+R$ ${diff.toFixed(2).replace('.', ',')} (+${diffPercent}%)`;
            } else {
                diffClass = 'diff-negativa';
                diffText = `-R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} (${diffPercent}%)`;
            }
        }

        const row = document.createElement('tr');
        row.setAttribute('data-index', index);
        row.innerHTML = `
            <td style="text-align:center;" onclick="event.stopPropagation();">
                <input type="checkbox" class="custo-checkbox" data-produto-id="${item.produto_id}" data-index="${index}" style="cursor:pointer;width:16px;height:16px;" checked>
            </td>
            <td>${item.produto_codigo || '-'}</td>
            <td>${item.produto_nome}</td>
            <td style="text-align: center;">${item.estoque_atual}</td>
            <td style="text-align: right;">R$ ${item.custo_atual.toFixed(2).replace('.', ',')}</td>
            <td style="text-align: right;">
                <input type="text" class="custo-input" 
                       data-produto-id="${item.produto_id}"
                       value="${item.custo_recalculado.toFixed(2).replace('.', ',')}"
                       onclick="event.stopPropagation();">
            </td>
            <td style="text-align: right;" class="${diffClass}" data-diff-cell="${index}">${diffText}</td>
            <td style="text-align: center;">
                <button class="btn-icon" onclick="event.stopPropagation(); verComposicaoCusto(${item.produto_id})" title="Ver composição do custo" style="color: #64ffda;">
                    <i class="fas fa-search"></i>
                </button>
            </td>
        `;

        // Clica na linha = ver composição
        row.addEventListener('click', () => verComposicaoCusto(item.produto_id));

        tbody.appendChild(row);
    });

    // Atualiza diferença ao editar o input
    tbody.querySelectorAll('.custo-input').forEach(input => {
        input.addEventListener('input', function () {
            const index = this.closest('tr').getAttribute('data-index');
            const item = dados[index];
            const novoValor = parseFloat(this.value.replace(',', '.')) || 0;
            const diff = novoValor - item.custo_atual;
            const diffPercent = item.custo_atual > 0 ? ((diff / item.custo_atual) * 100).toFixed(1) : '0.0';
            const diffCell = document.querySelector(`[data-diff-cell="${index}"]`);

            if (diffCell) {
                if (Math.abs(diff) > 0.01) {
                    if (diff > 0) {
                        diffCell.className = 'diff-positiva';
                        diffCell.textContent = `+R$ ${diff.toFixed(2).replace('.', ',')} (+${diffPercent}%)`;
                    } else {
                        diffCell.className = 'diff-negativa';
                        diffCell.textContent = `-R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} (${diffPercent}%)`;
                    }
                } else {
                    diffCell.className = 'diff-zero';
                    diffCell.textContent = 'R$ 0,00';
                }
            }
        });
    });

    // Seleção de todos
    const selecionarTodosCb = document.getElementById('selecionarTodosCusto');
    if (selecionarTodosCb) {
        selecionarTodosCb.checked = true;
        selecionarTodosCb.indeterminate = false;
        selecionarTodosCb.onchange = function () {
            tbody.querySelectorAll('.custo-checkbox').forEach(cb => { cb.checked = this.checked; });
            atualizarContadorCusto();
        };
    }

    // Atualiza contador ao marcar/desmarcar individualmente
    tbody.querySelectorAll('.custo-checkbox').forEach(cb => {
        cb.addEventListener('change', atualizarContadorCusto);
    });
    atualizarContadorCusto();
}

// Atualiza o contador de produtos selecionados no recalcular custo
function atualizarContadorCusto() {
    const total = document.querySelectorAll('#recalcularCustoTableBody .custo-checkbox').length;
    const selecionados = document.querySelectorAll('#recalcularCustoTableBody .custo-checkbox:checked').length;
    const el = document.getElementById('recalcularCustoCount');
    if (el) el.textContent = `${selecionados} de ${total} produto(s) selecionado(s)`;
    const btnAplicar = document.getElementById('btnAplicarRecalculo');
    if (btnAplicar) btnAplicar.disabled = selecionados === 0;
    const selecionarTodos = document.getElementById('selecionarTodosCusto');
    if (selecionarTodos) {
        selecionarTodos.checked = selecionados === total && total > 0;
        selecionarTodos.indeterminate = selecionados > 0 && selecionados < total;
    }
}

// Ver composição de custo de um produto
async function verComposicaoCusto(produtoId) {
    const modal = document.getElementById('composicaoCustoModal');
    if (!modal) return;

    modal.classList.add('active');
    modal.style.display = 'flex';

    document.getElementById('composicaoCustoLoading').style.display = 'block';
    document.getElementById('composicaoCustoContent').style.display = 'none';

    try {
        const data = await apiGet(`/api/produtos/${produtoId}/composicao-custo`);
        console.log('[ComposicaoCusto] Dados:', data);

        // Preenche cabeçalho
        document.getElementById('composicaoProdutoNome').textContent = data.produto_nome;
        document.getElementById('composicaoEstoque').textContent = data.estoque_atual;
        document.getElementById('composicaoCustoAtual').textContent = `R$ ${data.custo_atual.toFixed(2).replace('.', ',')}`;
        document.getElementById('composicaoCustoRecalc').textContent = `R$ ${data.custo_recalculado.toFixed(2).replace('.', ',')}`;

        // Renderiza tabela de composição
        const tbody = document.getElementById('composicaoCustoTableBody');

        if (!data.composicao || data.composicao.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #a8b2d1;">Nenhuma movimentação de entrada encontrada com valor unitário</td></tr>';
        } else {
            tbody.innerHTML = '';
            data.composicao.forEach(comp => {
                const badgeClass = comp.tipo_origem === 'compra' ? 'badge-compra' : 'badge-movimentacao';
                const badgeText = comp.tipo_origem === 'compra' ? 'Compra' : 'Mov. Manual';

                const dataFormatada = (() => {
                    try {
                        const d = new Date(comp.data);
                        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    } catch {
                        return comp.data;
                    }
                })();

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td><span class="${badgeClass}">${badgeText}</span></td>
                    <td>${comp.referencia || '-'}</td>
                    <td style="text-align: center;">${comp.quantidade_total}</td>
                    <td style="text-align: center;">${comp.quantidade_usada}</td>
                    <td style="text-align: right;">R$ ${comp.valor_unitario.toFixed(2).replace('.', ',')}</td>
                `;
                tbody.appendChild(row);
            });
        }

        document.getElementById('composicaoCustoLoading').style.display = 'none';
        document.getElementById('composicaoCustoContent').style.display = 'block';
    } catch (error) {
        console.error('[ComposicaoCusto] Erro:', error);
        document.getElementById('composicaoCustoLoading').innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f5576c;"></i>
            <p style="margin-top: 10px; color: #f5576c;">Erro: ${error.message || 'Erro desconhecido'}</p>
        `;
    }
}

// Abre o modal de confirmação com os itens selecionados
async function aplicarCustoRecalculado() {
    const checkboxes = document.querySelectorAll('#recalcularCustoTableBody .custo-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('Selecione ao menos um produto para atualizar.');
        return;
    }

    const itens = [];
    checkboxes.forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-index'));
        const item = dadosRecalculoCusto[idx];
        const tr = document.querySelector(`#recalcularCustoTableBody tr[data-index="${idx}"]`);
        const input = tr ? tr.querySelector('.custo-input') : null;
        const novoCusto = input ? (parseFloat(input.value.replace(',', '.')) || 0) : (item?.custo_recalculado || 0);
        itens.push({
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            produto_codigo: item.produto_codigo || '-',
            custo_atual: item.custo_atual,
            novo_custo: novoCusto
        });
    });

    const confirmarTbody = document.getElementById('confirmarCustoTableBody');
    if (confirmarTbody) {
        confirmarTbody.innerHTML = '';
        itens.forEach(item => {
            const diff = item.novo_custo - item.custo_atual;
            const diffClass = diff > 0.01 ? 'diff-positiva' : diff < -0.01 ? 'diff-negativa' : 'diff-zero';
            const diffText = Math.abs(diff) > 0.01
                ? `${diff > 0 ? '+' : ''}R$ ${diff.toFixed(2).replace('.', ',')}`
                : 'R$ 0,00';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.produto_codigo}</td>
                <td>${item.produto_nome}</td>
                <td style="text-align:right;">R$ ${item.custo_atual.toFixed(2).replace('.', ',')}</td>
                <td style="text-align:right;">R$ ${item.novo_custo.toFixed(2).replace('.', ',')}</td>
                <td style="text-align:right;" class="${diffClass}">${diffText}</td>
            `;
            confirmarTbody.appendChild(row);
        });
    }

    window._itensCustoParaAplicar = itens;
    const modal = document.getElementById('confirmarAplicarCustoModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

// Confirma e aplica os custos selecionados
async function confirmarAplicarCusto() {
    const itens = window._itensCustoParaAplicar;
    if (!itens || itens.length === 0) return;

    const btnConfirmar = document.getElementById('btnConfirmarAplicarCusto');
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';
    }

    try {
        const resultado = await apiPost('/api/produtos/aplicar-custo-recalculado', {
            itens: itens.map(i => ({ produto_id: i.produto_id, novo_custo: i.novo_custo }))
        });
        console.log('[RecalcularCusto] Resultado aplicação:', resultado);
        alert(resultado.message || 'Custos atualizados com sucesso!');

        const confirmarModal = document.getElementById('confirmarAplicarCustoModal');
        if (confirmarModal) {
            confirmarModal.classList.remove('active');
            confirmarModal.style.display = 'none';
        }
        fecharRecalcularCusto();
        loadProdutos();
    } catch (error) {
        console.error('[RecalcularCusto] Erro ao aplicar:', error);
        alert(`Erro ao aplicar custos: ${error.message || 'Erro desconhecido'}`);
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar e Aplicar';
        }
    }
}

// Fecha o modal de recalcular custo
function fecharRecalcularCusto() {
    const modal = document.getElementById('recalcularCustoModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    dadosRecalculoCusto = [];
}

// Fecha o modal de composição de custo
function fecharComposicaoCusto() {
    const modal = document.getElementById('composicaoCustoModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

// Event listeners para recalcular custo
document.addEventListener('DOMContentLoaded', function () {
    // Botão abrir recalcular custo
    const btnRecalcular = document.getElementById('btnRecalcularCusto');
    if (btnRecalcular) {
        btnRecalcular.addEventListener('click', abrirRecalcularCusto);
    }

    // Botão cancelar recalcular custo
    const btnCancelar = document.getElementById('btnCancelarRecalculo');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', fecharRecalcularCusto);
    }

    // Botão aplicar recalcular custo
    const btnAplicar = document.getElementById('btnAplicarRecalculo');
    if (btnAplicar) {
        btnAplicar.addEventListener('click', aplicarCustoRecalculado);
    }

    // Botão fechar composição custo
    const btnFechar = document.getElementById('btnFecharComposicao');
    if (btnFechar) {
        btnFechar.addEventListener('click', fecharComposicaoCusto);
    }

    // Botão confirmar aplicação de custo
    const btnConfirmarCusto = document.getElementById('btnConfirmarAplicarCusto');
    if (btnConfirmarCusto) {
        btnConfirmarCusto.addEventListener('click', confirmarAplicarCusto);
    }

    // Botão cancelar confirmação
    const btnCancelarConfirmar = document.getElementById('btnCancelarConfirmarCusto');
    if (btnCancelarConfirmar) {
        btnCancelarConfirmar.addEventListener('click', function () {
            const modal = document.getElementById('confirmarAplicarCustoModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    }

    // Fechar modais pelo X
    document.querySelectorAll('#recalcularCustoModal .close-modal').forEach(btn => {
        btn.addEventListener('click', fecharRecalcularCusto);
    });
    document.querySelectorAll('#composicaoCustoModal .close-modal').forEach(btn => {
        btn.addEventListener('click', fecharComposicaoCusto);
    });
    document.querySelectorAll('#confirmarAplicarCustoModal .close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = document.getElementById('confirmarAplicarCustoModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        });
    });

    // Pesquisa dentro do modal de recalculo
    const searchInput = document.getElementById('recalcularCustoSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const termo = this.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#recalcularCustoTableBody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(termo) ? '' : 'none';
            });
        });
    }

    // Botão Atualizar Descrições
    const btnAtualizarDesc = document.getElementById('btnAtualizarDescricoes');
    if (btnAtualizarDesc) {
        btnAtualizarDesc.addEventListener('click', function () {
            if (typeof abrirAtualizarDescricoes === 'function') {
                abrirAtualizarDescricoes();
            }
        });
    }
});
