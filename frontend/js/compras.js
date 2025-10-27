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

    // Carrega a lista de compras
    loadCompras();

    // Configura os botões de ação
    setupActionButtons();
    
    // Configura os filtros
    setupFilters();
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

// Busca o nome do fornecedor pelo ID
async function getFornecedorNome(fornecedorId) {
    if (!fornecedorId) return '-';
    
    try {
        // Usa a nova API centralizada
        const fornecedor = await apiGet(`/api/parceiros/${fornecedorId}`);
        return fornecedor.nome || '-';
    } catch (error) {
        console.error('Erro ao buscar fornecedor:', error);
        return '-';
    }
}

// Busca o nome e descrição do produto pelo ID
async function getProdutoNome(produtoId) {
    if (!produtoId) return '-';
    
    try {
        // Usa a nova API centralizada
        const produto = await apiGet(`/api/produtos/${produtoId}`);
        return produto.nome || '-';
    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        return '-';
    }
}

// Busca o produto completo pelo ID
async function getProdutoCompleto(produtoId) {
    if (!produtoId) return null;
    
    try {
        // Usa a nova API centralizada
        const produto = await apiGet(`/api/produtos/${produtoId}`);
        return produto;
    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        return null;
    }
}

// Carrega a lista de compras da API
async function loadCompras() {
    // Mostra mensagem de carregamento
    document.getElementById('comprasTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Carregando compras...</td></tr>';
    
    try {
        // Usa a nova API centralizada
        const data = await apiGet('/api/compras');
        // Configuração da paginação
        window.currentDisplayFunction = displayCompras;
        initPagination(data, displayCompras);
    } catch (error) {
        console.error('Erro ao carregar compras:', error);
        document.getElementById('comprasTableBody').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar compras. Tente novamente.</td></tr>';
    }
}

// Configura os filtros da página
function setupFilters() {
    // Filtro de pesquisa por nome do fornecedor
    const filtroPesquisa = document.getElementById('filtroPesquisa');
    if (filtroPesquisa) {
        filtroPesquisa.addEventListener('input', function() {
            aplicarFiltros();
        });
    }
    
    // Filtro de status
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
        filterStatus.addEventListener('change', function() {
            aplicarFiltros();
        });
    }
}

// Aplica os filtros na tabela de compras
async function aplicarFiltros() {
    try {
        // Busca todas as compras novamente
        const compras = await apiGet('/api/compras');
        
        // Obtém os valores dos filtros
        const termoPesquisa = document.getElementById('filtroPesquisa').value.toLowerCase();
        const statusSelecionado = document.getElementById('filterStatus').value;
        
        // Filtra as compras
        let comprasFiltradas = compras;
        
        // Buscar todos os fornecedores para filtrar pelo nome
        const fornecedores = await apiGet('/api/parceiros', { tipo: 'fornecedor' });
        const fornecedoresMap = {};
        fornecedores.forEach(fornecedor => {
            fornecedoresMap[fornecedor.id] = fornecedor.nome.toLowerCase();
        });
        
        // Aplica filtro por nome do fornecedor
        if (termoPesquisa) {
            comprasFiltradas = comprasFiltradas.filter(compra => {
                const nomeFornecedor = fornecedoresMap[compra.fornecedor_id] || '';
                return nomeFornecedor.includes(termoPesquisa);
            });
        }
        
        // Aplica filtro por status
        if (statusSelecionado) {
            comprasFiltradas = comprasFiltradas.filter(compra => 
                compra.status === statusSelecionado
            );
        }
        
        // Atualiza a exibição com os itens filtrados
        window.currentDisplayFunction = displayCompras;
        initPagination(comprasFiltradas, displayCompras);
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
    }
}

// Exibe as compras na tabela
async function displayCompras(compras) {
    const tbody = document.getElementById('comprasTableBody');
    
    if (!compras || compras.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma compra encontrada</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    // Buscar todos os fornecedores de uma vez
    const fornecedoresIds = [...new Set(compras.map(compra => compra.fornecedor_id).filter(id => id))];
    const fornecedoresMap = {};
    
    try {
        // Buscar todos os fornecedores em uma única chamada, se possível
        if (fornecedoresIds.length > 0) {
            const fornecedores = await apiGet('/api/parceiros', { tipo: 'fornecedor' });
            fornecedores.forEach(fornecedor => {
                fornecedoresMap[fornecedor.id] = fornecedor.nome;
            });
        }
    } catch (error) {
        console.error('Erro ao buscar fornecedores:', error);
    }
    
    // Processa cada compra com os fornecedores já carregados
    for (const compra of compras) {
        const row = document.createElement('tr');
        
        // Status com cor
        let statusClass = '';
        switch (compra.status) {
            case 'pendente':
                statusClass = 'status-pendente';
                break;
            case 'aprovado':
                statusClass = 'status-aprovada';
                break;
            case 'recebido':
                statusClass = 'status-recebida';
                break;
            case 'cancelado':
                statusClass = 'status-cancelada';
                break;
        }
        
        // Formata a data
        const data = compra.data_pedido ? formatDate(compra.data_pedido) : '-';
        
        // Obtém o nome do fornecedor do mapa já carregado
        const fornecedorNome = compra.fornecedor_id ? (fornecedoresMap[compra.fornecedor_id] || '-') : '-';
        
        row.innerHTML = `
            <td>${compra.id}</td>
            <td>${fornecedorNome}</td>
            <td>${data}</td>
            <td>R$ ${formatNumber(compra.valor_total)}</td>
            <td><span class="status-badge ${statusClass}">${formatStatus(compra.status)}</span></td>
            <td>${compra.usuario_nome || '-'}</td>
            <td class="actions">
                <button class="btn-icon btn-view" data-id="${compra.id}" title="Visualizar Compra">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon btn-edit" data-id="${compra.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${compra.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    }
    
    // Adiciona event listeners para os botões
    document.querySelectorAll('.btn-view').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            viewCompra(id);
        });
    });
    
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            editCompra(id);
        });
    });
    
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            deleteCompra(id);
        });
    });
}

// Formata o status para exibição
function formatStatus(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'aprovada': 'Aprovada',
        'recebida': 'Recebida',
        'cancelada': 'Cancelada'
    };
    return statusMap[status] || status;
}

// Formata a data para exibição
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// Formata números para exibição
function formatNumber(value) {
    if (!value) return '0,00';
    return parseFloat(value).toFixed(2).replace('.', ',');
}

// Configura os botões de ação
function setupActionButtons() {
    // Configura o botão de nova compra
    document.getElementById('btnNovaCompra').addEventListener('click', function() {
        openCompraModal();
    });
    
    // Configura o botão de importar compras
    document.getElementById('btnImportarCompras').addEventListener('click', function() {
        alert('Funcionalidade de importação em desenvolvimento');
    });
    
    // Configura o botão de exportar compras
    document.getElementById('btnExportarCompras').addEventListener('click', function() {
        alert('Funcionalidade de exportação em desenvolvimento');
    });
    
    // Configura o botão de consultar estoque
    document.getElementById('btnConsultarEstoque').addEventListener('click', function() {
        window.location.href = 'estoque.html';
    });
    
    // Botão fechar modal (X)
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });
    
    // Eventos para calcular subtotal
    document.getElementById('quantidade').addEventListener('input', calcularSubtotal);
    document.getElementById('preco_unitario').addEventListener('input', calcularSubtotal);
    
    // Verifica se está retornando da página de fornecedores
    checkReturnFromFornecedores();

    // Configura o botão de adicionar item
    document.getElementById('btnAdicionarItem').addEventListener('click', openItemModal);

    // Configura o botão de confirmar adição de item
    document.getElementById('btnAdicionarItemConfirm').addEventListener('click', function(e) {
        e.preventDefault();
        addItemToCompra();
    });

    // Configura o botão cancelar item
    document.getElementById('btnCancelarItem').addEventListener('click', function() {
        closeModal('itemModal');
    });

    // Configura o botão Salvar compra
    document.getElementById('btnSalvar').addEventListener('click', function(e) {
        e.preventDefault();
        saveCompra();
    });

    // Configura o botão Cancelar compra
    document.getElementById('btnCancelar').addEventListener('click', function() {
        closeModal('compraModal');
    });
}

// Função para verificar se está retornando da página de fornecedores
function checkReturnFromFornecedores() {
    const urlParams = new URLSearchParams(window.location.search);
    const returnFrom = urlParams.get('returnFrom');
    const fornecedorId = urlParams.get('fornecedorId');
    
    if (returnFrom === 'fornecedores' && fornecedorId) {
        // Recupera os dados do modal de compra salvos
        const compraModalData = JSON.parse(sessionStorage.getItem('compraModalData') || '{}');
        
        // Abre o modal de compra
        openCompraModal();
        
        // Preenche os dados do formulário que foram salvos
        if (compraModalData) {
            Object.keys(compraModalData).forEach(key => {
                const element = document.getElementById(key);
                if (element && key !== 'fornecedor_id') {
                    element.value = compraModalData[key];
                }
            });
        }
        
        // Seleciona o fornecedor recém-cadastrado
        document.getElementById('fornecedor_id').value = fornecedorId;
        
        // Limpa os dados salvos
        sessionStorage.removeItem('compraModalData');
        
        // Limpa os parâmetros da URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Obtém os dados do formulário de compra
function getCompraFormData() {
    return {
        fornecedor_id: document.getElementById('fornecedor_id').value,
        data_compra: document.getElementById('data_compra').value,
        previsao_entrega: document.getElementById('previsao_entrega').value,
        status: document.getElementById('status').value,
        observacoes: document.getElementById('observacoes').value
    };
}

// Calcula o subtotal do item
function calcularSubtotal() {
    const quantidade = parseFloat(document.getElementById('quantidade').value) || 0;
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value) || 0;
    const subtotal = quantidade * precoUnitario;
    
    document.getElementById('subtotal').value = `R$ ${subtotal.toFixed(2)}`;
}

// Nota: getAuthHeader() já está definido em auth.js

// Carrega a lista de fornecedores com um fornecedor específico selecionado
async function loadFornecedoresWithSelection(selectedFornecedorId) {
    // Mostra mensagem de carregamento no select
    const fornecedorSelect = document.getElementById('fornecedor_id');
    fornecedorSelect.innerHTML = '<option value="">Carregando fornecedores...</option>';
    
    try {
        // Usa a função apiGet para buscar fornecedores
        const data = await apiGet('/api/parceiros', { tipo: 'fornecedor,ambos' });
        
        // Limpa o select
        fornecedorSelect.innerHTML = '<option value="">Selecione...</option>';
        
        // Adiciona os fornecedores ao select
        data.forEach(fornecedor => {
            const option = document.createElement('option');
            option.value = fornecedor.id;
            option.textContent = fornecedor.nome;
            
            // Seleciona o fornecedor se for o mesmo ID
            if (fornecedor.id == selectedFornecedorId) {
                option.selected = true;
            }
            
            fornecedorSelect.appendChild(option);
        });
        
        return true;
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        fornecedorSelect.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
        
        // Não exibir dados fictícios, apenas a mensagem de erro
        
        return false;
    }
}

// Carrega a lista de fornecedores da API
async function loadFornecedores() {
    // Mostra mensagem de carregamento no select
    const fornecedorSelect = document.getElementById('fornecedor_id');
    fornecedorSelect.innerHTML = '<option value="">Carregando fornecedores...</option>';
    
    try {
        // Usa a nova API centralizada
        const data = await apiGet('/api/parceiros', { tipo: 'fornecedor,ambos' });
        
        // Limpa o select
        fornecedorSelect.innerHTML = '<option value="">Selecione...</option>';
        
        // Adiciona os fornecedores ao select
        data.forEach(fornecedor => {
            const option = document.createElement('option');
            option.value = fornecedor.id;
            option.textContent = fornecedor.nome;
            fornecedorSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        fornecedorSelect.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
    }
}

// Abre o modal de compra
function openCompraModal(compraId = null) {
    // Limpa o formulário
    document.getElementById('compraForm').reset();
    
    // Limpa a tabela de itens
    document.getElementById('itensCompraTableBody').innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
    
    // Define o título do modal
    document.getElementById('modalTitle').textContent = compraId ? 'Editar Compra' : 'Nova Compra';
    
    // Define a data atual se for uma nova compra
    if (!compraId) {
        // Carrega a lista de fornecedores primeiro para nova compra
        loadFornecedores();
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('data_compra').value = today;
    } else {
        // Para edição, carrega os dados da compra primeiro e depois os fornecedores
        // para garantir que o fornecedor seja selecionado corretamente
        loadCompraDataAndThenFornecedores(compraId);
    }
    
    // Abre o modal
    document.getElementById('compraModal').classList.add('active');
}

// Carrega os dados da compra e depois carrega os fornecedores
async function loadCompraDataAndThenFornecedores(compraId) {
    // Reseta a flag de modo de visualização por segurança
    window.isViewMode = window.isViewMode || false;
    
    try {
        // Primeiro, busca os dados da compra usando a função apiGet
        const data = await apiGet(`/api/compras/${compraId}`);
        const fornecedorId = data.fornecedor_id;
        
        // Agora carrega os fornecedores
        await loadFornecedoresWithSelection(fornecedorId);
        
        // Preenche os outros campos do formulário
        const dataCompra = data.data_pedido || data.data_previsao;
        document.getElementById('data_compra').value = dataCompra ? dataCompra.split('T')[0] : '';
        document.getElementById('observacoes').value = data.observacoes || '';
        document.getElementById('status').value = data.status || 'pendente';
        
        // Carrega os itens da compra
        if (data.itens && data.itens.length > 0) {
            await displayItensCompra(data.itens, window.isViewMode);
            updateValorTotal(data.itens);
        }
        
        // Armazena o ID da compra no formulário para uso posterior
        document.getElementById('compraForm').setAttribute('data-id', compraId);
        
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados da compra. Tente novamente.');
        
        // Carrega os fornecedores sem seleção específica
        loadFornecedores();
        
        // Removido o código de dados fictícios
    }
}

// Carrega os dados de uma compra específica
async function loadCompraData(compraId) {
    // Reseta a flag de modo de visualização por segurança
    window.isViewMode = window.isViewMode || false;
    
    try {
        // Usa a nova API centralizada
        const data = await apiGet(`/api/compras/${compraId}`);
        
        // Preenche o formulário com os dados da compra
        document.getElementById('fornecedor_id').value = data.fornecedor_id || '';
        // Pode ser data_pedido ou data_previsao dependendo do endpoint
        const dataCompra = data.data_pedido || data.data_previsao;
        document.getElementById('data_compra').value = dataCompra ? dataCompra.split('T')[0] : '';
        document.getElementById('observacoes').value = data.observacoes || '';
        document.getElementById('status').value = data.status || 'pendente';
        
        // Armazena o status atual para comparação posterior
        document.getElementById('compraForm').setAttribute('data-status-anterior', data.status || 'pendente');
        
        // Carrega os itens da compra
        if (data.itens && data.itens.length > 0) {
            await displayItensCompra(data.itens, window.isViewMode);
            updateValorTotal(data.itens);
        }
        
        // Armazena o ID da compra no formulário para uso posterior
        document.getElementById('compraForm').setAttribute('data-id', compraId);
    } catch (error) {
        console.error('Erro ao carregar dados da compra:', error);
        alert('Erro ao carregar dados da compra. Tente novamente.');
    }
}

// Exibe os itens da compra na tabela
async function displayItensCompra(itens, isViewMode = false) {
    const tbody = document.getElementById('itensCompraTableBody');
    
    if (!itens || itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    // Processamos cada item de forma assíncrona para buscar o nome do produto
    for (const item of itens) {
        const row = document.createElement('tr');
        row.setAttribute('data-item-id', item.id || 'temp_' + Date.now());
        row.setAttribute('data-produto-id', item.produto_id); // Armazena o ID do produto na linha
        
        // Busca o produto completo se não estiver disponível
        let produtoNome = item.produto_nome;
        let produtoDescricao = item.produto_descricao || '';
        
        if ((!produtoNome || !produtoDescricao) && item.produto_id) {
            const produto = await getProdutoCompleto(item.produto_id);
            if (produto) {
                produtoNome = produto.nome || '-';
                produtoDescricao = produto.descricao || '';
            }
        }
        
        const subtotal = item.subtotal || (item.quantidade * item.preco_unitario);
        
        row.innerHTML = `
            <td>
                <div>${produtoNome || '-'}</div>
                <small class="text-muted">${produtoDescricao || ''}</small>
            </td>
            <td>${item.quantidade}</td>
            <td>R$ ${formatNumber(item.preco_unitario)}</td>
            <td>R$ ${formatNumber(subtotal)}</td>
            <td class="actions">
                ${!isViewMode ? `
                <button class="btn-icon btn-delete-item" title="Remover">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </td>
        `;
        
        tbody.appendChild(row);
    }
    
    // Adiciona event listeners para os botões de remover item
    document.querySelectorAll('.btn-delete-item').forEach(button => {
        button.addEventListener('click', function() {
            const row = this.closest('tr');
            row.remove();
            
            // Atualiza o valor total
            updateValorTotalFromTable();
            
            // Se não houver mais itens, mostra mensagem
            if (document.querySelectorAll('#itensCompraTableBody tr').length === 0) {
                document.getElementById('itensCompraTableBody').innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
            }
        });
    });
}

// Atualiza o valor total da compra com base nos itens
function updateValorTotal(itens) {
    let total = 0;
    
    itens.forEach(item => {
        total += parseFloat(item.subtotal) || 0;
    });
    
    document.getElementById('valorTotal').textContent = `R$ ${formatNumber(total)}`;
}

// Atualiza o valor total com base na tabela atual
function updateValorTotalFromTable() {
    let total = 0;
    
    document.querySelectorAll('#itensCompraTableBody tr').forEach(row => {
        if (row.cells.length > 3) {
            const subtotalText = row.cells[3].textContent.replace('R$ ', '').replace(',', '.');
            total += parseFloat(subtotalText) || 0;
        }
    });
    
    document.getElementById('valorTotal').textContent = `R$ ${formatNumber(total)}`;
}

// Carrega a lista de produtos da API
async function loadProdutos() {
    // Mostra mensagem de carregamento no select
    const produtoSelect = document.getElementById('produto_id');
    produtoSelect.innerHTML = '<option value="">Carregando produtos...</option>';
    
    try {
        // Usa a nova API centralizada
        const data = await apiGet('/api/produtos', { ativo: true });
        
        // Limpa o select
        produtoSelect.innerHTML = '<option value="">Selecione...</option>';
        
        // Adiciona os produtos ao select
        data.forEach(produto => {
            const option = document.createElement('option');
            option.value = produto.id;
            option.textContent = produto.nome;
            option.dataset.preco = produto.preco_venda || 0;
            produtoSelect.appendChild(option);
        });
        
        // Adiciona evento para preencher o preço unitário automaticamente quando selecionar um produto
        produtoSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset.preco) {
                document.getElementById('preco_unitario').value = selectedOption.dataset.preco;
                calcularSubtotal();
            }
        });
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        produtoSelect.innerHTML = '<option value="">Erro ao carregar produtos</option>';
        
        // Adiciona evento para preencher o preço unitário automaticamente
        produtoSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset.preco) {
                document.getElementById('preco_unitario').value = selectedOption.dataset.preco;
                calcularSubtotal();
            }
        });
    }
}

// Abre o modal de adicionar item
function openItemModal() {
    // Limpa o formulário
    document.getElementById('itemForm').reset();
    
    // Carrega a lista de produtos
    loadProdutos();
    
    // Abre o modal
    document.getElementById('itemModal').classList.add('active');
}

// Adiciona um item à compra
function addItemToCompra() {
    const produtoId = document.getElementById('produto_id').value;
    const produtoNome = document.getElementById('produto_id').options[document.getElementById('produto_id').selectedIndex].text;
    const quantidade = parseFloat(document.getElementById('quantidade').value) || 0;
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value) || 0;
    const subtotal = quantidade * precoUnitario;
    
    if (!produtoId || quantidade <= 0 || precoUnitario <= 0) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }
    
    // Adiciona o item à tabela
    const tbody = document.getElementById('itensCompraTableBody');
    
    // Remove a mensagem "Nenhum item adicionado" se for o primeiro item
    if (tbody.querySelector('td.text-center')) {
        tbody.innerHTML = '';
    }
    
    const row = document.createElement('tr');
    const itemId = 'temp_' + Date.now(); // ID temporário para o item
    row.setAttribute('data-item-id', itemId);
    row.setAttribute('data-produto-id', produtoId); // Armazena o ID do produto na linha
    
    row.innerHTML = `
        <td>${produtoNome}</td>
        <td>${quantidade}</td>
        <td>R$ ${formatNumber(precoUnitario)}</td>
        <td>R$ ${formatNumber(subtotal)}</td>
        <td class="actions">
            <button class="btn-icon btn-delete-item" title="Remover">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    
    // Adiciona event listener para o botão de remover item
    row.querySelector('.btn-delete-item').addEventListener('click', function() {
        row.remove();
        
        // Atualiza o valor total
        updateValorTotalFromTable();
        
        // Se não houver mais itens, mostra mensagem
        if (document.querySelectorAll('#itensCompraTableBody tr').length === 0) {
            document.getElementById('itensCompraTableBody').innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
        }
    });
    
    // Atualiza o valor total
    updateValorTotalFromTable();
    
    // Fecha o modal de item
    closeModal('itemModal');
}

// Fecha o modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Salva a compra (nova ou edição)
async function saveCompra() {
    // Valida o formulário
    const form = document.getElementById('compraForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Obtém o ID da compra do atributo data-id do formulário
    const compraId = form.getAttribute('data-id');
    
    // Coleta os dados do formulário
    const compraData = {
        fornecedor_id: parseInt(document.getElementById('fornecedor_id').value),
        data_previsao: document.getElementById('data_compra').value, // O campo no HTML é data_compra, mas no backend é data_previsao
        observacoes: document.getElementById('observacoes').value,
        status: document.getElementById('status').value,
        itens: []
    };
    
    // Verifica se o status está sendo alterado para 'recebido'
    const statusAnterior = form.getAttribute('data-status-anterior') || '';
    const novoStatus = compraData.status;
    const alterandoParaRecebido = statusAnterior !== 'recebido' && novoStatus === 'recebido';
    // Se estiver recebendo, remova o status para que a API de recebimento o atualize com controle de estoque
    if (alterandoParaRecebido) {
        delete compraData.status;
    }
    
    // Coleta os itens da tabela
    document.querySelectorAll('#itensCompraTableBody tr').forEach(row => {
        if (row.cells.length > 1 && !row.querySelector('td.text-center')) {
            const produtoId = row.getAttribute('data-produto-id');
            const quantidade = parseFloat(row.cells[1].textContent);
            const precoUnitario = parseFloat(row.cells[2].textContent.replace('R$ ', '').replace(',', '.'));
            
            if (produtoId) {
                compraData.itens.push({
                    produto_id: parseInt(produtoId),
                    quantidade: quantidade,
                    preco_unitario: precoUnitario
                });
            }
        }
    });
    
    // Verifica se há itens na compra
    if (compraData.itens.length === 0) {
        alert('Adicione pelo menos um item à compra.');
        return;
    }
    
    // Exibe mensagem de processamento
    const btnSalvar = document.getElementById('btnSalvar');
    const originalText = btnSalvar.textContent;
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;
    
    try {
        console.log('Enviando dados para a API:', compraData);
        
        // Usa a nova API centralizada
        let data;
        if (compraId) {
            data = await apiPut(`/api/compras/${compraId}`, compraData);
        } else {
            data = await apiPost('/api/compras', compraData);
        }
        
        console.log('Compra salva com sucesso:', data);
        
        // Se o status foi alterado para 'recebido', chama a API para atualizar o estoque
        if (compraId && alterandoParaRecebido) {
            receberCompra(compraId);
        } else {
            // Fecha o modal
            closeModal('compraModal');
            
            // Recarrega a lista de compras
            loadCompras();
            
            // Exibe mensagem de sucesso
            alert(compraId ? 'Compra atualizada com sucesso!' : 'Compra criada com sucesso!');
        }
    } catch (error) {
        console.error('Erro ao salvar compra:', error);
        alert(`Erro ao salvar compra: ${error.message}`);
        
        // Restaura o botão
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    } finally {
        // Restaura o botão
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    }
}

// Visualiza uma compra
function viewCompra(compraId) {
    // Indica que estamos em modo de visualização
    window.isViewMode = true;
    
    // Abre o modal em modo de visualização
    openCompraModal(compraId);
    
    // Altera o título do modal para "Visualizar Compra"
    document.getElementById('modalTitle').textContent = 'Visualizar Compra';
    
    // Desabilita os campos do formulário
    document.querySelectorAll('#compraForm input, #compraForm select, #compraForm textarea').forEach(field => {
        field.disabled = true;
    });
    
    // Esconde o botão de adicionar item
    document.getElementById('btnAdicionarItem').style.display = 'none';
    
    // Altera o texto do botão Salvar para Fechar
    const saveButton = document.getElementById('btnSalvar');
    saveButton.textContent = 'Fechar';
    
    // Remove qualquer event listener existente
    const newSaveButton = saveButton.cloneNode(true);
    saveButton.parentNode.replaceChild(newSaveButton, saveButton);
    
    // Adiciona o novo event listener que apenas fecha o modal
    newSaveButton.addEventListener('click', function() {
        window.isViewMode = false;
        closeModal('compraModal');
    });
    
    // Esconde o botão Cancelar
    document.getElementById('btnCancelar').style.display = 'none';
}

// Edita uma compra
function editCompra(compraId) {
    openCompraModal(compraId);
}

// Exclui uma compra
async function deleteCompra(compraId) {
    if (!confirm('Tem certeza que deseja excluir esta compra?')) {
        return;
    }
    
    try {
        // Usa a nova API centralizada
        await apiDelete(`/api/compras/${compraId}`);
        
        // Sucesso: recarrega lista e notifica
        loadCompras();
        alert('Compra excluída com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir compra:', error);
        alert(`Erro ao excluir compra: ${error.message}`);
    }
}

// Recebe uma compra e atualiza o estoque
async function receberCompra(compraId) {
    // Exibe mensagem de processamento
    const loadingMessage = 'Recebendo compra e atualizando estoque...';
    console.log(loadingMessage);
    
    try {
        // Usa a nova API centralizada
        await apiPost(`/api/estoque/receber-pedido/${compraId}`);
        
        // Fecha o modal
        closeModal('compraModal');
        
        // Recarrega a lista de compras
        loadCompras();
        
        // Exibe mensagem de sucesso
        alert('Compra recebida e estoque atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao receber compra:', error);
        alert(`Erro ao receber compra: ${error.message}`);
        
        // Fecha o modal e recarrega a lista de compras mesmo em caso de erro
        closeModal('compraModal');
        loadCompras();
    }
}
