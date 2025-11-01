// Configuração de modals para o módulo financeiro

/**
 * Adiciona uma barra de pesquisa a um select específico
 * @param {string} selectId - ID do elemento select
 */
function addSearchToSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Encontra o container (div.form-group) que contém o select
    const container = select.closest('.form-group');
    if (!container) return;
    
    // Verifica se já existe uma barra de pesquisa
    if (container.querySelector('.search-input')) return;
    
    // Cria a barra de pesquisa
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.marginBottom = '8px';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Pesquisar...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px';
    searchInput.style.boxSizing = 'border-box';
    searchInput.style.marginBottom = '5px';
    
    // Adiciona a barra de pesquisa antes do select
    searchContainer.appendChild(searchInput);
    container.insertBefore(searchContainer, select);
    
    // Guarda as opções originais para filtrar
    const originalOptions = Array.from(select.options);
    
    // Adiciona o evento de pesquisa
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        // Limpa o select
        select.innerHTML = '';
        
        // Filtra e adiciona as opções que correspondem à pesquisa
        originalOptions.forEach(option => {
            if (option.text.toLowerCase().includes(searchTerm)) {
                select.appendChild(option.cloneNode(true));
            }
        });
        
        // Se não houver resultados, mostra uma mensagem
        if (select.options.length === 0) {
            const noResultOption = document.createElement('option');
            noResultOption.text = 'Nenhum resultado encontrado';
            noResultOption.disabled = true;
            select.appendChild(noResultOption);
        }
    });
}

/**
 * Configura barras de pesquisa para todos os selects em modais
 */
function setupSelectSearches() {
    // Adiciona barras de pesquisa a todos os selects em modais que precisam
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const selects = modal.querySelectorAll('select');
        selects.forEach(select => {
            // Não adiciona pesquisa para selects pequenos como status, forma de pagamento, etc.
            const skipIds = ['status', 'forma_pagamento', 'tipo_documento', 'tipo_lancamento'];
            if (skipIds.includes(select.id)) return;
            
            // Adiciona a barra de pesquisa
            addSearchToSelect(select.id);
        });
    });
}

// Função principal que configura os modais
function setupModals() {
    // Fechar modals quando clicar no X ou no botão Cancelar
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            modal.style.display = 'none';
        });
    });
    
    // Fechar modal ao clicar fora dele
    window.addEventListener('click', (event) => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Configurar barras de pesquisa nos selects
    setupSelectSearches();
    
    // Configurar botões de cancelar
    document.getElementById('btnCancelarRecebimento').addEventListener('click', () => {
        document.getElementById('recebimentoModal').style.display = 'none';
    });
    
    document.getElementById('btnCancelarPagamento').addEventListener('click', () => {
        document.getElementById('pagamentoModal').style.display = 'none';
    });
    
    document.getElementById('btnCancelarLancamento').addEventListener('click', () => {
        document.getElementById('lancamentoModal').style.display = 'none';
    });
    
    // Carregar dados para os selects
    carregarClientes();
    carregarCategorias();
    carregarFornecedores();
}

// Carregar clientes para os selects
async function carregarClientes() {
    try {
        const clientes = await apiLoadClients();
        
        // Preencher selects de clientes
        const selectRecebimento = document.getElementById('cliente_id_recebimento');
        const selectLancamento = document.getElementById('cliente_id_lancamento');
        
        // Limpar opções existentes
        selectRecebimento.innerHTML = '<option value="">Selecione...</option>';
        if (selectLancamento) {
            selectLancamento.innerHTML = '<option value="">Selecione...</option>';
        }
        
        // Adicionar clientes aos selects
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id;
            option.textContent = cliente.nome;
            
            selectRecebimento.appendChild(option.cloneNode(true));
            if (selectLancamento) {
                selectLancamento.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        alert('Erro ao carregar lista de clientes. Verifique o console para mais detalhes.');
    }
}

// Carregar categorias para os selects
async function carregarCategorias() {
    try {
        const categorias = await apiLoadCategories();
        
        // Preencher selects de categorias
        const selectPagamento = document.getElementById('categoria_pagamento');
        const selectLancamento = document.getElementById('categoria_lancamento');
        
        // Limpar opções existentes
        if (selectPagamento) {
            selectPagamento.innerHTML = '<option value="">Selecione...</option>';
        }
        if (selectLancamento) {
            selectLancamento.innerHTML = '<option value="">Selecione...</option>';
        }
        
        // Adicionar categorias aos selects
        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria.id;
            option.textContent = categoria.nome;
            
            if (selectPagamento) {
                selectPagamento.appendChild(option.cloneNode(true));
            }
            if (selectLancamento) {
                selectLancamento.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        alert('Erro ao carregar lista de categorias. Verifique o console para mais detalhes.');
    }
}

// Carregar fornecedores para os selects
async function carregarFornecedores() {
    try {
        const fornecedores = await apiLoadSuppliers();
        
        // Preencher selects de fornecedores
        const selectPagamento = document.getElementById('fornecedor_id_pagamento');
        
        // Limpar opções existentes
        if (selectPagamento) {
            selectPagamento.innerHTML = '<option value="">Selecione...</option>';
            
            // Adicionar fornecedores ao select
            fornecedores.forEach(fornecedor => {
                const option = document.createElement('option');
                option.value = fornecedor.id;
                option.textContent = fornecedor.nome;
                
                selectPagamento.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        alert('Erro ao carregar lista de fornecedores. Verifique o console para mais detalhes.');
    }
}

// Função para converter data para formato ISO
function formatarDataParaAPI(dataString) {
    if (!dataString) return null;
    const data = new Date(dataString);
    return data.toISOString().split('T')[0];
}
