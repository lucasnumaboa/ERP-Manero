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

    // Carrega a lista de compras
    loadCompras();

    // Configura os botões de ação
    setupActionButtons();

    // Configura os filtros
    setupFilters();

    // Configura sistema de abas do modal
    configurarAbasModalCompras();

    // Configura modal de produtos da compra
    const btnFecharProdutosCompra = document.getElementById('btnFecharProdutosCompra');
    if (btnFecharProdutosCompra) {
        btnFecharProdutosCompra.addEventListener('click', fecharModalProdutosCompra);
    }
    const produtosCompraModal = document.getElementById('produtosCompraModal');
    if (produtosCompraModal) {
        produtosCompraModal.querySelector('.close-modal')?.addEventListener('click', fecharModalProdutosCompra);
    }
});

// Função para configurar o sistema de abas do modal de compras
function configurarAbasModalCompras() {
    const tabs = document.querySelectorAll('#compraModal .modal-tab');
    const contents = document.querySelectorAll('#compraModal .modal-tab-content');

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

// Função para resetar abas ao abrir modal de compras
function resetarAbasModalCompras() {
    const tabs = document.querySelectorAll('#compraModal .modal-tab');
    const contents = document.querySelectorAll('#compraModal .modal-tab-content');

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
    document.getElementById('comprasTableBody').innerHTML = '<tr><td colspan="8" class="text-center">Carregando compras...</td></tr>';

    // Obtém o filtro de apenas minhas compras
    const apenasMinhasCompras = document.getElementById('filtroApenasMinhasCompras').checked;

    // Prepara os parâmetros de consulta
    const queryParams = {};
    if (apenasMinhasCompras) {
        queryParams.apenas_meus = true;
    }

    try {
        // Usa a nova API centralizada
        const data = await apiGet('/api/compras', queryParams);
        // Configuração da paginação
        window.currentDisplayFunction = displayCompras;
        initPagination(data, displayCompras);
    } catch (error) {
        console.error('Erro ao carregar compras:', error);
        document.getElementById('comprasTableBody').innerHTML =
            '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar compras. Tente novamente.</td></tr>';
    }
}

// Configura os filtros da página
function setupFilters() {
    // Filtro de pesquisa por nome do fornecedor
    const filtroPesquisa = document.getElementById('filtroPesquisa');
    if (filtroPesquisa) {
        filtroPesquisa.addEventListener('input', function () {
            aplicarFiltros();
        });
    }

    // Filtro de status
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
        filterStatus.addEventListener('change', function () {
            aplicarFiltros();
        });
    }

    // Filtro de apenas minhas compras
    const filtroApenasMinhasCompras = document.getElementById('filtroApenasMinhasCompras');
    if (filtroApenasMinhasCompras) {
        filtroApenasMinhasCompras.addEventListener('change', function () {
            loadCompras();
        });
    }

    // Botão limpar filtros
    const btnLimparFiltros = document.getElementById('btnLimparFiltros');
    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener('click', limparFiltros);
    }
}

// Limpa todos os filtros
function limparFiltros() {
    document.getElementById('filtroPesquisa').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filtroApenasMinhasCompras').checked = true; // Padrão: marcado
    loadCompras();
}

// Aplica os filtros na tabela de compras
async function aplicarFiltros() {
    try {
        // Obtém o filtro de apenas minhas compras
        const apenasMinhasCompras = document.getElementById('filtroApenasMinhasCompras').checked;

        // Prepara os parâmetros de consulta
        const queryParams = {};
        if (apenasMinhasCompras) {
            queryParams.apenas_meus = true;
        }

        // Busca as compras com o filtro de usuário
        const compras = await apiGet('/api/compras', queryParams);

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
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhuma compra encontrada</td></tr>';
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
                statusClass = 'status-aprovado';
                break;
            case 'recebido':
                statusClass = 'status-recebido';
                break;
            case 'cancelado':
                statusClass = 'status-cancelado';
                break;
        }

        // Formata a data
        const data = compra.data_pedido ? formatDate(compra.data_pedido) : '-';

        // Obtém o nome do fornecedor do mapa já carregado
        const fornecedorNome = compra.fornecedor_id ? (fornecedoresMap[compra.fornecedor_id] || '-') : '-';

        // Cria o dropdown de status inline
        const statusSelectHtml = `
            <select class="status-select-inline ${statusClass}" 
                    data-compra-id="${compra.id}" 
                    data-status-atual="${compra.status}">
                <option value="pendente" ${compra.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                <option value="aprovado" ${compra.status === 'aprovado' ? 'selected' : ''}>Aprovado</option>
                <option value="recebido" ${compra.status === 'recebido' ? 'selected' : ''}>Recebido</option>
                <option value="cancelado" ${compra.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
        `;

        // Busca os itens da compra para exibir na coluna de produtos
        let itensCompra = [];
        try {
            const compraDetalhada = await apiGet(`/api/compras/${compra.id}`);
            itensCompra = compraDetalhada.itens || [];
        } catch (error) {
            console.warn(`Erro ao buscar itens da compra ${compra.id}:`, error);
        }

        // Cria o HTML dos produtos
        const produtosHTML = criarProdutosCellCompra(itensCompra, compra.id);

        row.innerHTML = `
            <td>${compra.id}</td>
            <td>${fornecedorNome}</td>
            <td>${data}</td>
            <td>R$ ${formatNumber(compra.valor_total)}</td>
            ${produtosHTML}
            <td>${statusSelectHtml}</td>
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
        button.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            viewCompra(id);
        });
    });

    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            editCompra(id);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            deleteCompra(id);
        });
    });

    // Adiciona event listeners para os dropdowns de status inline
    document.querySelectorAll('.status-select-inline').forEach(select => {
        select.addEventListener('change', async function () {
            const compraId = parseInt(this.dataset.compraId);
            const statusAtual = this.dataset.statusAtual;
            const novoStatus = this.value;

            if (novoStatus === statusAtual) return;

            // Confirmação antes de alterar
            if (!confirm(`Deseja alterar o status da compra #${compraId} para "${formatStatus(novoStatus)}"?`)) {
                this.value = statusAtual;
                return;
            }

            try {
                this.disabled = true;

                // Se estiver alterando para 'recebido', usa a função receberCompra que atualiza estoque e envia webhook
                if (novoStatus === 'recebido' && statusAtual !== 'recebido') {
                    // Busca os dados da compra para verificar criado_tit_ap
                    const compraDetalhes = await apiGet(`/api/compras/${compraId}`);

                    // Verifica se deve criar conta a pagar
                    const naoFoiCriado = compraDetalhes.criado_tit_ap === false || compraDetalhes.criado_tit_ap === 0 || !compraDetalhes.criado_tit_ap;

                    if (naoFoiCriado) {
                        try {
                            // Cria o movimento em contas a pagar
                            const contaPagarData = {
                                descricao: `Compra do fornecedor - Ref. Compra #${compraId}`,
                                fornecedor_id: parseInt(compraDetalhes.fornecedor_id),
                                valor: compraDetalhes.valor_total || 0,
                                data_vencimento: compraDetalhes.data_previsao || new Date().toISOString().split('T')[0],
                                forma_pagamento: 'dinheiro',
                                observacoes: compraDetalhes.observacoes || ''
                            };

                            await apiPost('/api/contas-pagar', contaPagarData);
                            console.log('[Compras] Conta a pagar criada com sucesso!');

                            // Marca como criado no backend
                            await apiPut(`/api/compras/${compraId}`, { criado_tit_ap: true });
                        } catch (error) {
                            console.error('[Compras] Erro ao criar conta a pagar:', error);
                        }
                    }

                    // Busca os itens da compra antes de receber para notificar via webhook
                    let itensCompra = compraDetalhes.itens || [];

                    // Usa a API de receber pedido que atualiza o estoque
                    await apiPost(`/api/estoque/receber-pedido/${compraId}`);

                    // Notifica via webhook sobre a entrada de produtos
                    if (itensCompra.length > 0 && window.webhookEstoque) {
                        console.log('[Compras] Notificando entrada de produtos via webhook...');
                        window.webhookEstoque.notificarEntradaProdutos(itensCompra);
                    }

                    // Atualiza o data-attribute e classe
                    this.dataset.statusAtual = novoStatus;
                    this.className = `status-select-inline status-${novoStatus}`;

                    console.log(`Status da compra #${compraId} alterado para "recebido" com atualização de estoque e webhook`);

                } else if (novoStatus === 'aprovado' && statusAtual !== 'aprovado') {
                    // Busca os dados da compra para verificar criado_tit_ap
                    const compraDetalhes = await apiGet(`/api/compras/${compraId}`);

                    // Verifica se deve criar conta a pagar
                    const naoFoiCriado = compraDetalhes.criado_tit_ap === false || compraDetalhes.criado_tit_ap === 0 || !compraDetalhes.criado_tit_ap;

                    if (naoFoiCriado) {
                        try {
                            // Cria o movimento em contas a pagar
                            const contaPagarData = {
                                descricao: `Compra do fornecedor - Ref. Compra #${compraId}`,
                                fornecedor_id: parseInt(compraDetalhes.fornecedor_id),
                                valor: compraDetalhes.valor_total || 0,
                                data_vencimento: compraDetalhes.data_previsao || new Date().toISOString().split('T')[0],
                                forma_pagamento: 'dinheiro',
                                observacoes: compraDetalhes.observacoes || ''
                            };

                            await apiPost('/api/contas-pagar', contaPagarData);
                            console.log('[Compras] Conta a pagar criada com sucesso!');

                            // Marca como criado no backend
                            await apiPut(`/api/compras/${compraId}`, { criado_tit_ap: true, status: novoStatus });
                        } catch (error) {
                            console.error('[Compras] Erro ao criar conta a pagar:', error);
                            // Ainda atualiza o status mesmo se falhar ao criar conta
                            await apiPut(`/api/compras/${compraId}`, { status: novoStatus });
                        }
                    } else {
                        // Atualiza o status via API (endpoint correto: /api/compras/)
                        await apiPut(`/api/compras/${compraId}`, { status: novoStatus });
                    }

                    // Atualiza o data-attribute e classe
                    this.dataset.statusAtual = novoStatus;
                    this.className = `status-select-inline status-${novoStatus}`;

                    console.log(`Status da compra #${compraId} alterado de "${statusAtual}" para "${novoStatus}"`);

                } else {
                    // Atualiza o status via API (endpoint correto: /api/compras/)
                    await apiPut(`/api/compras/${compraId}`, { status: novoStatus });

                    // Atualiza o data-attribute e classe
                    this.dataset.statusAtual = novoStatus;
                    this.className = `status-select-inline status-${novoStatus}`;

                    console.log(`Status da compra #${compraId} alterado de "${statusAtual}" para "${novoStatus}"`);
                }

                this.disabled = false;

            } catch (error) {
                console.error('Erro ao alterar status da compra:', error);
                alert(`Erro ao alterar status: ${error.message || error.detail || 'Erro desconhecido'}`);
                this.value = statusAtual;
                this.disabled = false;
            }
        });
    });

    // Adiciona event listeners para os botões de ver produtos
    document.querySelectorAll('.btn-ver-produtos-compra').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itensJSON = btn.dataset.itens;
            const compraId = btn.dataset.compraId;

            try {
                const itens = JSON.parse(itensJSON.replace(/&quot;/g, '"'));
                abrirModalProdutosCompra(itens, compraId);
            } catch (error) {
                console.error('Erro ao parsear itens:', error);
            }
        });
    });
}

// Função para criar a célula de produtos da compra
function criarProdutosCellCompra(itens, compraId) {
    if (!itens || itens.length === 0) {
        return '<td class="produtos-cell">-</td>';
    }

    const quantidade = itens.length;
    const itensJSON = JSON.stringify(itens).replace(/"/g, '&quot;');

    return `
        <td class="produtos-cell">
            <button class="produtos-preview btn-ver-produtos-compra" data-itens="${itensJSON}" data-compra-id="${compraId}">
                <i class="fas fa-box"></i>
                <span class="produtos-badge">${quantidade} ${quantidade === 1 ? 'produto' : 'produtos'}</span>
            </button>
        </td>
    `;
}

// Função para abrir modal de produtos da compra
function abrirModalProdutosCompra(itens, compraId) {
    const modal = document.getElementById('produtosCompraModal');
    const tbody = document.getElementById('produtosCompraModalBody');
    const totalSpan = document.getElementById('produtosCompraModalTotal');
    const title = document.getElementById('produtosCompraModalTitle');

    if (!modal || !tbody) return;

    // Atualiza título
    title.innerHTML = `<i class="fas fa-box"></i> Produtos da Compra #${compraId}`;

    // Limpa e preenche a tabela
    tbody.innerHTML = '';
    let total = 0;

    itens.forEach(item => {
        const subtotal = item.quantidade * item.preco_unitario;
        total += subtotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.produto_nome || 'Produto desconhecido'}</td>
            <td style="text-align: center;">${item.quantidade}</td>
            <td style="text-align: right;">R$ ${formatNumber(item.preco_unitario)}</td>
            <td style="text-align: right;">R$ ${formatNumber(subtotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza total
    totalSpan.textContent = `R$ ${formatNumber(total)}`;

    // Abre o modal
    modal.classList.add('active');
}

// Função para fechar modal de produtos da compra
function fecharModalProdutosCompra() {
    const modal = document.getElementById('produtosCompraModal');
    if (modal) {
        modal.classList.remove('active');
    }
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
    document.getElementById('btnNovaCompra').addEventListener('click', function () {
        openCompraModal();
    });



    // Configura o botão de consultar estoque
    document.getElementById('btnConsultarEstoque').addEventListener('click', function () {
        window.location.href = 'estoque.html';
    });

    // Botão fechar modal (X)
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function () {
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
    document.getElementById('btnAdicionarItemConfirm').addEventListener('click', function (e) {
        e.preventDefault();
        addItemToCompra();
    });

    // Configura o botão cancelar item
    document.getElementById('btnCancelarItem').addEventListener('click', function () {
        closeModal('itemModal');
    });

    // Configura o botão Salvar compra
    document.getElementById('btnSalvar').addEventListener('click', function (e) {
        e.preventDefault();
        saveCompra();
    });

    // Configura o botão Cancelar compra
    document.getElementById('btnCancelar').addEventListener('click', function () {
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

        // Adicionar campo de pesquisa para fornecedores
        adicionarPesquisaFornecedores();

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

        // Adicionar campo de pesquisa para fornecedores
        adicionarPesquisaFornecedores();
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        fornecedorSelect.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
    }
}

// Função para adicionar campo de pesquisa para fornecedores
function adicionarPesquisaFornecedores() {
    // Verificar se o campo já existe
    if (!document.getElementById('pesquisaFornecedor')) {
        const selectFornecedor = document.getElementById('fornecedor_id');
        const container = selectFornecedor.parentElement;

        // Criar campo de pesquisa
        const pesquisaDiv = document.createElement('div');
        pesquisaDiv.className = 'form-group mb-2';
        pesquisaDiv.innerHTML = `
            <label for="pesquisaFornecedor">Pesquisar Fornecedor:</label>
            <input type="text" id="pesquisaFornecedor" class="form-control" placeholder="Digite para pesquisar...">
        `;

        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectFornecedor);

        // Adicionar evento de pesquisa
        document.getElementById('pesquisaFornecedor').addEventListener('input', function (e) {
            const termo = e.target.value.toLowerCase();
            const options = selectFornecedor.querySelectorAll('option');

            options.forEach(option => {
                if (option.value === '') return; // Pular a opção "Selecione..."

                const visivel = option.textContent.toLowerCase().includes(termo);
                option.style.display = visivel ? '' : 'none';
            });
        });
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

    // Resetar abas para a primeira
    resetarAbasModalCompras();

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

        // Armazena o status atual para comparação posterior
        document.getElementById('compraForm').setAttribute('data-status-anterior', data.status || 'pendente');
        console.log('Carregou compra com status:', data.status, 'e criado_tit_ap:', data.criado_tit_ap);

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
        button.addEventListener('click', function () {
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
        // Usa a nova API centralizada - filtra apenas produtos do usuário atual
        const data = await apiGet('/api/produtos', { ativo: true, apenas_meus: true });

        // Limpa o select
        produtoSelect.innerHTML = '<option value="">Selecione...</option>';

        // Filtra para não incluir produtos fabricados (apenas produtos comprados podem ser adicionados a pedidos de compra)
        const produtosComprados = data.filter(produto => produto.tipo_produto !== 'fabricado');

        // Adiciona os produtos ao select
        produtosComprados.forEach(produto => {
            const option = document.createElement('option');
            option.value = produto.id;
            option.textContent = produto.nome;
            option.dataset.preco = produto.preco_venda || 0;
            option.dataset.custo = produto.preco_custo || 0; // Armazena preço de custo
            produtoSelect.appendChild(option);
        });

        // Adiciona evento para preencher o preço unitário automaticamente quando selecionar um produto
        // Usa o preço de custo se existir, senão deixa em branco
        produtoSelect.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const precoCusto = parseFloat(selectedOption.dataset.custo) || 0;
                // Se o produto tem preço de custo cadastrado, preenche. Caso contrário, deixa em branco
                document.getElementById('preco_unitario').value = precoCusto > 0 ? precoCusto : '';
                calcularSubtotal();
            }
        });

        // Adicionar campo de pesquisa para produtos
        adicionarPesquisaProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        produtoSelect.innerHTML = '<option value="">Erro ao carregar produtos</option>';

        // Adiciona evento para preencher o preço unitário automaticamente
        // Usa o preço de custo se existir, senão deixa em branco
        produtoSelect.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const precoCusto = parseFloat(selectedOption.dataset.custo) || 0;
                document.getElementById('preco_unitario').value = precoCusto > 0 ? precoCusto : '';
                calcularSubtotal();
            }
        });
    }
}

// Função para adicionar campo de pesquisa para produtos
function adicionarPesquisaProdutos() {
    // Verificar se o campo já existe
    if (!document.getElementById('pesquisaProduto')) {
        const selectProduto = document.getElementById('produto_id');
        const container = selectProduto.parentElement;

        // Criar campo de pesquisa
        const pesquisaDiv = document.createElement('div');
        pesquisaDiv.className = 'form-group mb-2';
        pesquisaDiv.innerHTML = `
            <label for="pesquisaProduto">Pesquisar Produto:</label>
            <input type="text" id="pesquisaProduto" class="form-control" placeholder="Digite para pesquisar...">
        `;

        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectProduto);

        // Adicionar evento de pesquisa
        document.getElementById('pesquisaProduto').addEventListener('input', function (e) {
            const termo = e.target.value.toLowerCase();
            const options = selectProduto.querySelectorAll('option');

            options.forEach(option => {
                if (option.value === '') return; // Pular a opção "Selecione..."

                const visivel = option.textContent.toLowerCase().includes(termo);
                option.style.display = visivel ? '' : 'none';
            });
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
    row.querySelector('.btn-delete-item').addEventListener('click', function () {
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

    // Obtém o ID do usuário atual
    const userData = getUserData();
    const usuario_id = userData ? userData.id : null;

    if (!usuario_id) {
        console.error('ID do usuário não encontrado!');
        alert('Erro: Não foi possível identificar o usuário. Por favor, faça login novamente.');
        return;
    }

    // Coleta os dados do formulário
    const compraData = {
        fornecedor_id: parseInt(document.getElementById('fornecedor_id').value),
        data_previsao: document.getElementById('data_compra').value, // O campo no HTML é data_compra, mas no backend é data_previsao
        observacoes: document.getElementById('observacoes').value,
        status: document.getElementById('status').value,
        usuario_id: usuario_id,
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

        // Verifica se deve criar conta a pagar
        // Se status for 'aprovado' OU 'recebido' E criado_tit_ap for 0 ou false, cria a conta
        // Usa novoStatus ao invés de data.status porque quando vai para 'recebido', o status é deletado antes de enviar
        const statusAprovadoOuRecebido = novoStatus === 'aprovado' || novoStatus === 'recebido';
        const naoFoiCriado = data.criado_tit_ap === false || data.criado_tit_ap === 0;
        const deveGravarConta = statusAprovadoOuRecebido && naoFoiCriado;

        console.log('Status:', data.status);
        console.log('criado_tit_ap:', data.criado_tit_ap);
        console.log('Status aprovado ou recebido?', statusAprovadoOuRecebido);
        console.log('Não foi criado?', naoFoiCriado);
        console.log('Deve gravar conta?', deveGravarConta);

        if (deveGravarConta) {
            console.log('Iniciando criação de conta a pagar');
            try {
                // Usa o valor total retornado pela API
                const valorTotal = data.valor_total || 0;

                console.log('Valor total da compra:', valorTotal);

                // Cria o movimento em contas a pagar
                const contaPagarData = {
                    descricao: `Compra do fornecedor - Ref. Compra #${data.id}`,
                    fornecedor_id: parseInt(data.fornecedor_id),
                    valor: valorTotal,
                    data_vencimento: data.data_previsao,
                    forma_pagamento: 'dinheiro',
                    observacoes: data.observacoes || ''
                };

                console.log('Criando conta a pagar:', contaPagarData);
                const resultadoConta = await apiPost('/api/contas-pagar', contaPagarData);
                console.log('Conta a pagar criada com sucesso!', resultadoConta);

                // Marca como criado no backend
                console.log('Marcando criado_tit_ap = 1 para compra #' + data.id);
                try {
                    await apiPut(`/api/compras/${data.id}`, { criado_tit_ap: true });
                    console.log('Marcado criado_tit_ap = 1 com sucesso!');
                } catch (error) {
                    console.error('Erro ao marcar criado_tit_ap:', error);
                }
            } catch (error) {
                console.error('Erro ao criar conta a pagar:', error);
                // Não interrompe o fluxo se falhar ao criar a conta a pagar
            }
        }

        // Se o status foi alterado para 'recebido' (e não era 'recebido' antes), chama a API para atualizar o estoque
        console.log('statusAnterior:', statusAnterior, 'novoStatus:', novoStatus, 'alterandoParaRecebido:', alterandoParaRecebido);

        // Para compras existentes que estão sendo alteradas para "recebido"
        if (compraId && alterandoParaRecebido) {
            console.log('Chamando receberCompra...');
            receberCompra(compraId);
        }
        // Para novas compras com status "recebido" selecionado
        else if (!compraId && novoStatus === 'recebido') {
            console.log('Nova compra com status recebido - processando recebimento...');
            // Como a compra foi criada com status 'pendente', precisamos recebê-la
            // Usa o ID retornado pela API
            await receberCompraAsync(data.id);

            // Fecha o modal
            closeModal('compraModal');

            // Recarrega a lista de compras
            loadCompras();

            // Exibe mensagem de sucesso
            alert('Compra criada e recebida com sucesso!');
        }
        // Para novas compras com status "aprovado" selecionado
        else if (!compraId && novoStatus === 'aprovado') {
            console.log('Nova compra com status aprovado - atualizando status...');
            // Atualiza o status para aprovado
            await apiPut(`/api/compras/${data.id}`, { status: 'aprovado' });

            // Fecha o modal
            closeModal('compraModal');

            // Recarrega a lista de compras
            loadCompras();

            // Exibe mensagem de sucesso
            alert('Compra criada com sucesso!');
        }
        else {
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
    newSaveButton.addEventListener('click', function () {
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
        // Busca os itens da compra antes de receber para notificar via webhook
        let itensCompra = [];
        try {
            const compraDetalhes = await apiGet(`/api/compras/${compraId}`);
            itensCompra = compraDetalhes.itens || [];
        } catch (error) {
            console.warn('Erro ao buscar itens da compra para webhook:', error);
        }

        // Usa a nova API centralizada
        await apiPost(`/api/estoque/receber-pedido/${compraId}`);

        // Notifica via webhook sobre a entrada de produtos
        if (itensCompra.length > 0 && window.webhookEstoque) {
            console.log('[Compras] Notificando entrada de produtos via webhook...');
            window.webhookEstoque.notificarEntradaProdutos(itensCompra);
        }

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

// Versão async de receberCompra para uso quando criando nova compra com status 'recebido'
// Não gerencia o modal nem exibe alertas - isso é feito pelo chamador
async function receberCompraAsync(compraId) {
    console.log('Recebendo compra de forma assíncrona:', compraId);

    // Busca os itens da compra antes de receber para notificar via webhook
    let itensCompra = [];
    try {
        const compraDetalhes = await apiGet(`/api/compras/${compraId}`);
        itensCompra = compraDetalhes.itens || [];
    } catch (error) {
        console.warn('Erro ao buscar itens da compra para webhook:', error);
    }

    // Usa a API de receber pedido que atualiza o estoque
    await apiPost(`/api/estoque/receber-pedido/${compraId}`);

    // Notifica via webhook sobre a entrada de produtos
    if (itensCompra.length > 0 && window.webhookEstoque) {
        console.log('[Compras] Notificando entrada de produtos via webhook...');
        window.webhookEstoque.notificarEntradaProdutos(itensCompra);
    }

    console.log('Compra recebida com sucesso:', compraId);
}

// Abre o modal para criar novo fornecedor
function openFornecedorModal() {
    document.getElementById('fornecedorForm').reset();
    document.getElementById('fornecedorModal').classList.add('active');
}

// Fecha o modal de fornecedor
function closeFornecedorModal() {
    document.getElementById('fornecedorModal').classList.remove('active');
}

// Salva um novo fornecedor
async function saveFornecedor() {
    const nome = document.getElementById('fornecedor_nome').value;
    const cnpj = document.getElementById('fornecedor_cnpj').value;
    const email = document.getElementById('fornecedor_email').value;
    const telefone = document.getElementById('fornecedor_telefone').value;
    const endereco = document.getElementById('fornecedor_endereco').value;

    if (!nome) {
        alert('Por favor, preencha o nome do fornecedor.');
        return;
    }

    try {
        const fornecedorData = {
            nome: nome,
            tipo: 'fornecedor',
            cnpj: cnpj || null,
            email: email || null,
            telefone: telefone || null,
            endereco: endereco || null
        };

        console.log('Criando fornecedor:', fornecedorData);
        const data = await apiPost('/api/parceiros', fornecedorData);
        console.log('Fornecedor criado com sucesso:', data);

        // Fecha o modal de fornecedor
        closeFornecedorModal();

        // Recarrega a lista de fornecedores
        await loadFornecedores();

        // Seleciona o novo fornecedor
        document.getElementById('fornecedor_id').value = data.id;

        // Exibe mensagem de sucesso
        alert('Fornecedor criado com sucesso!');
    } catch (error) {
        console.error('Erro ao criar fornecedor:', error);
        alert(`Erro ao criar fornecedor: ${error.message}`);
    }
}

// Configura os botões do modal de fornecedor
document.addEventListener('DOMContentLoaded', function () {
    // Botão para abrir modal de novo fornecedor
    const btnNovoFornecedor = document.getElementById('btnNovoFornecedorModal');
    if (btnNovoFornecedor) {
        btnNovoFornecedor.addEventListener('click', openFornecedorModal);
    }

    // Botão para cancelar
    const btnCancelarFornecedor = document.getElementById('btnCancelarFornecedor');
    if (btnCancelarFornecedor) {
        btnCancelarFornecedor.addEventListener('click', closeFornecedorModal);
    }

    // Botão para salvar
    const btnSalvarFornecedor = document.getElementById('btnSalvarFornecedor');
    if (btnSalvarFornecedor) {
        btnSalvarFornecedor.addEventListener('click', saveFornecedor);
    }

    // Fechar modal ao clicar no X
    const closeButtons = document.querySelectorAll('#fornecedorModal .close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', closeFornecedorModal);
    });

    // ============================================
    // SISTEMA DE FABRICAÇÃO DE PRODUTOS
    // ============================================

    // Botão para abrir modal de fabricação
    const btnFabricarProduto = document.getElementById('btnFabricarProduto');
    if (btnFabricarProduto) {
        btnFabricarProduto.addEventListener('click', abrirModalFabricar);
    }

    // Botão cancelar fabricação
    const btnCancelarFabricar = document.getElementById('btnCancelarFabricar');
    if (btnCancelarFabricar) {
        btnCancelarFabricar.addEventListener('click', fecharModalFabricar);
    }

    // Botão confirmar fabricação
    const btnConfirmarFabricar = document.getElementById('btnConfirmarFabricar');
    if (btnConfirmarFabricar) {
        btnConfirmarFabricar.addEventListener('click', executarFabricacao);
    }

    // Fechar modal ao clicar no X
    const closeFabricarButtons = document.querySelectorAll('#fabricarModal .close-modal');
    closeFabricarButtons.forEach(btn => {
        btn.addEventListener('click', fecharModalFabricar);
    });

    // Evento para verificar estoque quando produto ou quantidade mudar
    const fabricarProdutoSelect = document.getElementById('fabricar_produto_id');
    if (fabricarProdutoSelect) {
        fabricarProdutoSelect.addEventListener('change', verificarEstoqueFabricacao);
    }

    const fabricarQuantidadeInput = document.getElementById('fabricar_quantidade');
    if (fabricarQuantidadeInput) {
        fabricarQuantidadeInput.addEventListener('change', verificarEstoqueFabricacao);
        fabricarQuantidadeInput.addEventListener('input', verificarEstoqueFabricacao);
    }

    // Botão para salvar preços no modal de fabricação
    const btnSalvarPrecos = document.getElementById('btnSalvarPrecosModal');
    if (btnSalvarPrecos) {
        btnSalvarPrecos.addEventListener('click', salvarPrecosFabricacao);
    }
});

// Abre o modal de fabricação
async function abrirModalFabricar() {
    // Limpa o formulário
    document.getElementById('fabricarForm').reset();
    document.getElementById('fabricar_quantidade').value = '1';

    // Esconde a tabela de componentes e containers adicionais
    document.getElementById('componentesContainer').style.display = 'none';
    document.getElementById('custoFabricacaoContainer').style.display = 'none';
    document.getElementById('atualizarPrecosContainer').style.display = 'none';
    document.getElementById('loadingCustoContainer').style.display = 'none';

    // Limpa a tabela de componentes
    document.getElementById('componentesFabricacaoBody').innerHTML =
        '<tr><td colspan="5" class="text-center">Selecione um produto para ver os componentes</td></tr>';

    // Desabilita o botão de fabricar
    document.getElementById('btnConfirmarFabricar').disabled = true;

    // Carrega os produtos fabricados
    await carregarProdutosFabricados();

    // Abre o modal
    document.getElementById('fabricarModal').classList.add('active');
}

// Carrega apenas produtos com tipo 'fabricado'
async function carregarProdutosFabricados() {
    const select = document.getElementById('fabricar_produto_id');
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        // Carrega todos os produtos ativos
        const produtos = await apiGet('/api/produtos?ativo=true&apenas_meus=true');

        select.innerHTML = '<option value="">Selecione um produto fabricado...</option>';

        if (produtos && produtos.length > 0) {
            // Filtra apenas produtos fabricados
            const produtosFabricados = produtos.filter(p => p.tipo_produto === 'fabricado');

            if (produtosFabricados.length === 0) {
                select.innerHTML = '<option value="">Nenhum produto fabricado encontrado</option>';
                return;
            }

            produtosFabricados.forEach(produto => {
                const option = document.createElement('option');
                option.value = produto.id;
                option.textContent = `${produto.codigo} - ${produto.nome} (Estoque: ${produto.estoque_atual || 0})`;
                select.appendChild(option);
            });

            // Adiciona campo de pesquisa para os produtos
            adicionarPesquisaFabricacao();
        } else {
            select.innerHTML = '<option value="">Nenhum produto encontrado</option>';
        }
    } catch (error) {
        console.error('Erro ao carregar produtos fabricados:', error);
        select.innerHTML = '<option value="">Erro ao carregar produtos</option>';
    }
}

// Função para adicionar campo de pesquisa para produtos no modal de fabricação
function adicionarPesquisaFabricacao() {
    // ID único para o campo de pesquisa da fabricação
    if (!document.getElementById('pesquisaFabricacao')) {
        const selectProduto = document.getElementById('fabricar_produto_id');
        const container = selectProduto.parentElement;

        // Criar campo de pesquisa
        const pesquisaDiv = document.createElement('div');
        pesquisaDiv.className = 'form-group mb-2';
        pesquisaDiv.id = 'pesquisaFabricacaoContainer';
        pesquisaDiv.innerHTML = `
            <label for="pesquisaFabricacao">Pesquisar Produto:</label>
            <input type="text" id="pesquisaFabricacao" class="form-control" placeholder="Digite para pesquisar..." style="margin-bottom: 10px;">
        `;

        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectProduto);

        // Adicionar evento de pesquisa
        document.getElementById('pesquisaFabricacao').addEventListener('input', function (e) {
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
        document.getElementById('pesquisaFabricacao').value = '';
        // Mostra todas as opções novamente
        const selectProduto = document.getElementById('fabricar_produto_id');
        const options = selectProduto.querySelectorAll('option');
        options.forEach(option => {
            option.style.display = '';
        });
    }
}

// Verifica o estoque dos componentes para fabricação
async function verificarEstoqueFabricacao() {
    const produtoId = document.getElementById('fabricar_produto_id').value;
    const quantidade = parseInt(document.getElementById('fabricar_quantidade').value) || 1;

    const componentesContainer = document.getElementById('componentesContainer');
    const tbody = document.getElementById('componentesFabricacaoBody');
    const statusEl = document.getElementById('fabricarStatus');
    const btnFabricar = document.getElementById('btnConfirmarFabricar');
    const custoContainer = document.getElementById('custoFabricacaoContainer');
    const custoTotal = document.getElementById('custoFabricacaoTotal');
    const precosContainer = document.getElementById('atualizarPrecosContainer');

    if (!produtoId) {
        componentesContainer.style.display = 'none';
        custoContainer.style.display = 'none';
        precosContainer.style.display = 'none';
        btnFabricar.disabled = true;
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Verificando estoque...</td></tr>';
    componentesContainer.style.display = 'block';

    try {
        // Busca dados do produto para obter preço de venda e comissão atuais
        const produto = await apiGet(`/api/produtos/${produtoId}`);

        // Preenche os campos de preço e comissão com os valores atuais
        document.getElementById('fabricar_preco_venda').value = produto.preco_venda || 0;
        document.getElementById('fabricar_comissao').value = produto.comissao || 0;

        // Armazena o ID do produto para uso posterior
        document.getElementById('fabricarForm').setAttribute('data-produto-id', produtoId);

        // Mostra o container de atualização de preços
        precosContainer.style.display = 'block';

        const resultado = await apiGet(`/api/produtos/${produtoId}/verificar-estoque-fabricacao?quantidade=${quantidade}`);
        console.log('Resultado verificação estoque:', resultado);

        if (!resultado.componentes || resultado.componentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Este produto não possui componentes cadastrados</td></tr>';
            statusEl.innerHTML = '<span style="color: orange;"><i class="fas fa-exclamation-circle"></i> Produto sem componentes</span>';
            btnFabricar.disabled = true;
            custoContainer.style.display = 'none';
            return;
        }

        // Mostra o loading indicator
        const loadingContainer = document.getElementById('loadingCustoContainer');
        const progressBar = document.getElementById('progressBarCusto');
        const progressText = document.getElementById('progressTextCusto');

        loadingContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        // Busca os custos dos componentes para calcular o custo total
        let custoTotalFabricacao = 0;
        const componentesComCusto = [];
        const totalComponentes = resultado.componentes.length;

        for (let i = 0; i < resultado.componentes.length; i++) {
            const comp = resultado.componentes[i];
            try {
                // Busca dados completos do componente para obter preco_custo
                const componenteProduto = await apiGet(`/api/produtos/${comp.produto_id}`);
                const custoPorUnidade = parseFloat(componenteProduto.preco_custo) || 0;
                const custoComponente = custoPorUnidade * comp.quantidade_necessaria;
                custoTotalFabricacao += custoComponente;

                componentesComCusto.push({
                    ...comp,
                    preco_custo: custoPorUnidade,
                    custo_total: custoComponente
                });
            } catch (error) {
                console.warn(`Erro ao buscar custo do componente ${comp.produto_id}:`, error);
                componentesComCusto.push({
                    ...comp,
                    preco_custo: 0,
                    custo_total: 0
                });
            }

            // Atualiza a barra de progresso
            const progresso = Math.round(((i + 1) / totalComponentes) * 100);
            progressBar.style.width = progresso + '%';
            progressText.textContent = progresso + '%';
        }

        // Esconde o loading indicator
        loadingContainer.style.display = 'none';

        // Exibe o custo total
        custoTotal.textContent = `R$ ${custoTotalFabricacao.toFixed(2).replace('.', ',')}`
        custoContainer.style.display = 'block';

        tbody.innerHTML = '';
        componentesComCusto.forEach(comp => {
            const row = document.createElement('tr');
            const statusIcon = comp.estoque_suficiente
                ? '<span style="color: green;"><i class="fas fa-check-circle"></i> OK</span>'
                : '<span style="color: red;"><i class="fas fa-times-circle"></i> Insuficiente</span>';

            row.innerHTML = `
                <td>${comp.codigo || '-'}</td>
                <td>${comp.nome || '-'}</td>
                <td>${comp.quantidade_necessaria}</td>
                <td>${comp.estoque_atual}</td>
                <td>${statusIcon}</td>
            `;
            tbody.appendChild(row);
        });

        // Atualiza o status geral
        if (resultado.pode_fabricar) {
            statusEl.innerHTML = '<span style="color: green;"><i class="fas fa-check-circle"></i> Estoque suficiente para fabricação</span>';
            btnFabricar.disabled = false;
        } else {
            statusEl.innerHTML = '<span style="color: red;"><i class="fas fa-times-circle"></i> Estoque insuficiente - verifique os componentes marcados em vermelho</span>';
            btnFabricar.disabled = true;
        }
    } catch (error) {
        console.error('Erro ao verificar estoque:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Erro ao verificar estoque</td></tr>';
        statusEl.innerHTML = '<span style="color: red;"><i class="fas fa-exclamation-triangle"></i> Erro ao verificar estoque</span>';
        btnFabricar.disabled = true;
        custoContainer.style.display = 'none';
        precosContainer.style.display = 'none';
        document.getElementById('loadingCustoContainer').style.display = 'none';
    }
}

// Executa a fabricação do produto
async function executarFabricacao() {
    const produtoId = document.getElementById('fabricar_produto_id').value;
    const quantidade = parseInt(document.getElementById('fabricar_quantidade').value) || 1;

    if (!produtoId) {
        alert('Selecione um produto para fabricar.');
        return;
    }

    if (quantidade <= 0) {
        alert('A quantidade deve ser maior que zero.');
        return;
    }

    // Confirma a fabricação
    const produtoNome = document.getElementById('fabricar_produto_id').options[
        document.getElementById('fabricar_produto_id').selectedIndex
    ].textContent;

    if (!confirm(`Confirma a fabricação de ${quantidade} unidade(s) de:\n\n${produtoNome}?\n\nOs componentes serão consumidos do estoque.`)) {
        return;
    }

    // Desabilita o botão enquanto processa
    const btnFabricar = document.getElementById('btnConfirmarFabricar');
    const originalText = btnFabricar.innerHTML;
    btnFabricar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fabricando...';
    btnFabricar.disabled = true;

    try {
        const resultado = await apiPost(`/api/produtos/${produtoId}/fabricar`, {
            quantidade: quantidade
        });

        console.log('Fabricação concluída:', resultado);

        // Notifica via webhook sobre a entrada do produto fabricado
        if (window.webhookEstoque) {
            console.log('[Compras] Notificando fabricação de produto via webhook...');
            window.webhookEstoque.notificarEntradaProdutos([{
                produto_id: parseInt(produtoId),
                quantidade: quantidade
            }]);
        }

        // Fecha o modal
        fecharModalFabricar();

        // Exibe mensagem de sucesso
        alert(resultado.message || 'Produto fabricado com sucesso!');

        // Recarrega a lista de compras (opcional, pode não ser necessário)
        // loadCompras();
    } catch (error) {
        console.error('Erro ao fabricar produto:', error);

        // Tenta extrair mensagem de erro da API
        let mensagem = 'Erro ao fabricar produto.';
        if (error.message) {
            mensagem += '\n\n' + error.message;
        }
        alert(mensagem);

        // Restaura o botão
        btnFabricar.innerHTML = originalText;
        btnFabricar.disabled = false;
    }
}

// Fecha o modal de fabricação
function fecharModalFabricar() {
    document.getElementById('fabricarModal').classList.remove('active');
}

// Salva os preços atualizados do produto no modal de fabricação
async function salvarPrecosFabricacao() {
    const produtoId = document.getElementById('fabricarForm').getAttribute('data-produto-id');
    const precoVenda = parseFloat(document.getElementById('fabricar_preco_venda').value) || 0;
    const comissao = parseFloat(document.getElementById('fabricar_comissao').value) || 0;

    if (!produtoId) {
        alert('Nenhum produto selecionado.');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarPrecosModal');
    const statusEl = document.getElementById('salvarPrecosStatus');
    const originalText = btnSalvar.innerHTML;

    // Mostra que está salvando
    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btnSalvar.disabled = true;
    statusEl.style.display = 'none';

    try {
        await apiPut(`/api/produtos/${produtoId}`, {
            preco_venda: precoVenda,
            comissao: comissao
        });

        console.log('Preços atualizados com sucesso!');

        // Mostra mensagem de sucesso
        statusEl.innerHTML = '<span style="color: green;"><i class="fas fa-check-circle"></i> Salvo!</span>';
        statusEl.style.display = 'inline';

        // Esconde a mensagem após 3 segundos
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);

    } catch (error) {
        console.error('Erro ao salvar preços:', error);

        // Mostra mensagem de erro
        statusEl.innerHTML = '<span style="color: red;"><i class="fas fa-times-circle"></i> Erro ao salvar</span>';
        statusEl.style.display = 'inline';
    } finally {
        // Restaura o botão
        btnSalvar.innerHTML = originalText;
        btnSalvar.disabled = false;
    }
}
