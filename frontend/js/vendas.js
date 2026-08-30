// Variáveis globais
// const API_URL = 'https://erp-api-call.autoservto.com.br'; (duplicada, já definida em auth.js)
let vendas = [];
let itensVenda = [];
let vendaAtual = null;
let editandoVenda = false;
let editingItemIndex = null; // Índice do item sendo editado no modal

// Funções para controlar o Loading Overlay
function mostrarLoading(texto = 'Carregando vendas...', textoProgresso = 'Aguarde...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const progressText = document.getElementById('loadingProgressText');

    if (overlay) {
        if (loadingText) loadingText.textContent = texto;
        if (progressText) progressText.textContent = textoProgresso;
        overlay.classList.add('active');
    }
}

function esconderLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function atualizarLoadingTexto(texto, textoProgresso) {
    const loadingText = document.getElementById('loadingText');
    const progressText = document.getElementById('loadingProgressText');

    if (loadingText && texto) loadingText.textContent = texto;
    if (progressText && textoProgresso) progressText.textContent = textoProgresso;
}

// ===== FUNÇÕES MULTI-SELECT DROPDOWN =====

// Toggle para abrir/fechar dropdown multi-select
function toggleMultiSelect(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const container = dropdown.closest('.multi-select-dropdown');

    // Fecha outros dropdowns abertos
    document.querySelectorAll('.multi-select-dropdown.open').forEach(d => {
        if (d !== container) {
            d.classList.remove('open');
        }
    });

    container.classList.toggle('open');
}

// Fecha dropdowns ao clicar fora
document.addEventListener('click', function (e) {
    if (!e.target.closest('.multi-select-dropdown')) {
        document.querySelectorAll('.multi-select-dropdown.open').forEach(d => {
            d.classList.remove('open');
        });
    }
});

// Atualiza o texto exibido no trigger do multi-select
function atualizarTextoMultiSelect(tipo) {
    let container, textElement, defaultText;

    if (tipo === 'vendedor') {
        container = document.getElementById('filtroVendedorDropdown');
        textElement = document.querySelector('#filtroVendedorContainer .multi-select-text');
        defaultText = 'Todos os vendedores';
    } else if (tipo === 'situacao') {
        container = document.getElementById('filtroSituacaoDropdown');
        textElement = document.querySelector('#filtroSituacaoContainer .multi-select-text');
        defaultText = 'Todas as situações';
    }

    if (!container || !textElement) return;

    const checkedItems = container.querySelectorAll('input[type="checkbox"]:checked');
    const checkedCount = checkedItems.length;

    if (checkedCount === 0) {
        textElement.textContent = defaultText;
    } else if (checkedCount === 1) {
        // Mostra o nome do item selecionado
        const label = checkedItems[0].closest('.multi-select-option');
        textElement.textContent = label ? label.textContent.trim() : '1 selecionado';
    } else {
        textElement.textContent = `${checkedCount} selecionados`;
    }
}

// Preenche o multi-select de vendedores
function preencherMultiSelectVendedores(vendedores) {
    const container = document.getElementById('filtroVendedorDropdown');
    if (!container) return;

    container.innerHTML = '';

    if (vendedores && vendedores.length > 0) {
        vendedores.forEach(vendedor => {
            const label = document.createElement('label');
            label.className = 'multi-select-option';
            label.innerHTML = `
                <input type="checkbox" value="${vendedor.id}" onchange="atualizarTextoMultiSelect('vendedor')">
                <span class="checkmark-multi"></span>
                ${vendedor.nome}
            `;
            container.appendChild(label);
        });
    }
}

// Obtém os valores selecionados de um multi-select
function getMultiSelectValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const checkedInputs = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkedInputs).map(input => input.value);
}

// Limpa seleções de um multi-select
function limparMultiSelect(containerId, tipo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    atualizarTextoMultiSelect(tipo);
}


document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM carregado - iniciando configuração da página de vendas');
    // Verificar autenticação
    checkAuth();

    // Carregar dados do usuário
    loadUserData();

    // Configurar sidebar toggle
    setupSidebarToggle();

    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Carregar dados iniciais
    carregarVendas();
    carregarClientes();
    carregarProdutos();
    carregarVendedores();
    carregarCondicoesPagamento();
    carregarPlataformas();

    // Define datas padrão dos filtros (primeiro dia do mês até hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataInicial').valueAsDate = primeiroDiaDoMes;
    document.getElementById('filtroDataFinal').valueAsDate = hoje;

    console.log('Configurando botão Nova Venda');
    const btnNovaVenda = document.getElementById('btnNovaVenda');
    console.log('Botão Nova Venda encontrado:', btnNovaVenda);
    if (btnNovaVenda) {
        btnNovaVenda.addEventListener('click', function () {
            console.log('Botão Nova Venda clicado');
            abrirModalNovaVenda();
        });
    } else {
        console.error('Botão Nova Venda não encontrado no DOM');
    }

    document.getElementById('btnCancelar').addEventListener('click', fecharModalVenda);
    document.getElementById('btnSalvar').addEventListener('click', salvarVenda);
    document.getElementById('btnAdicionarItem').addEventListener('click', abrirModalItem);
    document.getElementById('btnCancelarItem').addEventListener('click', fecharModalItem);
    // O botão de confirmação do item agora decide entre adicionar ou salvar edição
    document.getElementById('btnAdicionarItemConfirm').addEventListener('click', salvarItemModal);

    // Configurar eventos de fechamento de modal
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Encontrar o modal pai do botão clicado
            const modal = button.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');

                // Remover a classe modal-open do body
                document.body.classList.remove('modal-open');

                // Limpar formulários se necessário
                if (modal.id === 'vendaModal') {
                    limparFormularioVenda();
                } else if (modal.id === 'itemModal') {
                    limparFormularioItem();
                }
            }
        });
    });

    // REMOVIDO: Fechar modal ao clicar fora
    // Modais agora só fecham ao clicar no X ou botão Cancelar/Fechar

    // Configurar eventos para cálculo de subtotal
    document.getElementById('quantidade').addEventListener('input', calcularSubtotal);
    document.getElementById('preco_unitario').addEventListener('input', calcularSubtotal);
    document.getElementById('produto_id').addEventListener('change', atualizarPrecoUnitario);

    // Configurar filtros
    document.getElementById('btnAplicarFiltros').addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltros);
    document.getElementById('btnExportarDados').addEventListener('click', exportarDadosCSV);

    // Configurar sistema de abas do modal de vendas
    configurarAbasModal();

    // Configurar modal de produtos
    const btnFecharProdutos = document.getElementById('btnFecharProdutos');
    if (btnFecharProdutos) {
        btnFecharProdutos.addEventListener('click', fecharModalProdutos);
    }

    // Fechar modal de produtos ao clicar no X
    const produtosModal = document.getElementById('produtosModal');
    if (produtosModal) {
        produtosModal.querySelector('.close-modal')?.addEventListener('click', fecharModalProdutos);
    }
});

// Função para configurar o sistema de abas do modal
function configurarAbasModal() {
    const tabs = document.querySelectorAll('.modal-tab');
    const contents = document.querySelectorAll('.modal-tab-content');

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

// Função para resetar abas ao abrir modal
function resetarAbasModal() {
    const tabs = document.querySelectorAll('.modal-tab');
    const contents = document.querySelectorAll('.modal-tab-content');

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    // Ativar primeira aba
    if (tabs.length > 0) tabs[0].classList.add('active');
    if (contents.length > 0) contents[0].classList.add('active');
}

// Função para abrir modal de produtos
function abrirModalProdutos(itens, vendaId) {
    const modal = document.getElementById('produtosModal');
    const tbody = document.getElementById('produtosModalBody');
    const totalSpan = document.getElementById('produtosModalTotal');
    const title = document.getElementById('produtosModalTitle');

    if (!modal || !tbody) return;

    // Atualiza título
    title.innerHTML = `<i class="fas fa-box"></i> Produtos da Venda #${vendaId}`;

    // Limpa e preenche a tabela
    tbody.innerHTML = '';
    let total = 0;

    itens.forEach(item => {
        const subtotal = item.quantidade * item.preco_unitario;
        total += subtotal;

        // Exibe o custo_item se disponível, senão mostra "-"
        const custoUnitario = item.custo_item ? formatarMoeda(item.custo_item) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.produto_nome || 'Produto desconhecido'}</td>
            <td style="text-align: center;">${item.quantidade}</td>
            <td style="text-align: right;">${custoUnitario}</td>
            <td style="text-align: right;">${formatarMoeda(item.preco_unitario)}</td>
            <td style="text-align: right;">${formatarMoeda(subtotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza total
    totalSpan.textContent = formatarMoeda(total);

    // Abre o modal
    modal.classList.add('active');
}

// Função para fechar modal de produtos
function fecharModalProdutos() {
    const modal = document.getElementById('produtosModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Autenticação usando auth.js
function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
    }
}

// Carrega os dados do usuário usando a função do auth.js
async function loadUserData() {
    try {
        const userData = await getCurrentUser();
        if (userData) {
            document.getElementById('userName').textContent = userData.nome || 'Usuário';
            document.getElementById('userRole').textContent = formatRole(userData.nivel_acesso) || 'Usuário';
        }
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
    }
}

function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'gerente': 'Gerente',
        'vendedor': 'Vendedor'
    };
    return roles[role] || role;
}

// Logout e cabeçalhos de autenticação são tratados em auth.js


// Funções para manipulação do sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    toggleBtn.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });
}

// Funções para carregar dados
async function carregarVendas() {
    try {
        // Verifica permissão de visualização de vendas
        const canView = await hasPermission('vendas_visualizar');
        if (!canView) {
            console.warn('Usuário sem permissão para visualizar vendas');
            const tbody = document.getElementById('vendasTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="13" class="text-center">Você não tem acesso para visualizar vendas.</td></tr>';
            }
            return;
        }

        // Não carrega vendas automaticamente - aguarda aplicação de filtros
        const tbody = document.getElementById('vendasTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center">Use os filtros acima para visualizar as vendas</td></tr>';
        }

        console.log('Página de vendas carregada - aguardando aplicação de filtros');
    } catch (error) {
        console.error('Erro ao carregar vendas:', error);
        // Exibir mensagem de erro
        document.getElementById('vendasTableBody').innerHTML = '<tr><td colspan="13" class="text-center">Erro ao carregar vendas. Por favor, tente novamente.</td></tr>';
    }
}

// Variável global para armazenar todos os clientes
let todosClientesVendas = [];

async function carregarClientes() {
    try {
        // Usa a API centralizada
        const clientes = await apiGet('/api/parceiros', { tipo: 'cliente' });
        console.log('Clientes carregados da API:', clientes);

        // Armazena todos os clientes para pesquisa
        todosClientesVendas = clientes;

        // Ordena por ID decrescente (últimos cadastrados primeiro) e pega os últimos 10
        const ultimosClientes = [...clientes].sort((a, b) => b.id - a.id).slice(0, 10);
        console.log('Últimos 10 clientes:', ultimosClientes);

        preencherSelectClientes(ultimosClientes);
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

async function carregarProdutos() {
    try {
        // Usa a API centralizada com filtros para produtos ativos e com estoque
        const produtos = await apiGet('/api/produtos', { com_estoque: true, ativo: true });
        preencherSelectProdutos(produtos);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

async function carregarVendedores() {
    try {
        // Usa a API centralizada
        const vendedores = await apiGet('/api/vendedores');
        preencherSelectVendedores(vendedores);
        preencherMultiSelectVendedores(vendedores); // Preenche o multi-select do filtro
    } catch (error) {
        console.error('Erro ao carregar vendedores:', error);
    }
}

async function carregarCondicoesPagamento() {
    try {
        // Usa a API centralizada
        const condicoes = await apiGet('/api/condicoes-pagamento');
        preencherSelectCondicoesPagamento(condicoes);
    } catch (error) {
        console.error('Erro ao carregar condições de pagamento:', error);
    }
}

// Função para aplicar filtros
async function aplicarFiltros() {
    try {
        console.log('Aplicando filtros...');

        // Mostra o loading overlay
        mostrarLoading('Carregando vendas...', 'Buscando dados do servidor...');

        // Verifica permissão de visualização de vendas
        const canView = await hasPermission('vendas_visualizar');
        if (!canView) {
            esconderLoading();
            alert('Você não tem permissão para visualizar vendas');
            return;
        }

        // Obtém dados do usuário atual
        const userData = await getCurrentUser();
        const isAdmin = userData && userData.nivel_acesso === 'admin';

        atualizarLoadingTexto('Carregando vendas...', 'Obtendo lista de vendas...');

        // Busca todas as vendas (conforme permissão)
        let todasVendas = [];
        if (isAdmin) {
            todasVendas = await apiGet('/api/vendas') || [];
        } else {
            // Não admin: se tiver cadastro de vendedor, vê apenas suas vendas
            const vendedores = await apiGet('/api/vendedores') || [];
            const vendedorAtual = vendedores.find(v => v.usuario_id === userData?.id);
            if (vendedorAtual) {
                todasVendas = await apiGet('/api/vendas', { vendedor_id: vendedorAtual.id }) || [];
            } else {
                todasVendas = [];
            }
        }

        atualizarLoadingTexto('Processando dados...', 'Aplicando filtros...');

        // Obtém valores dos filtros
        const filtroIdPedido = document.getElementById('filtroIdPedido').value.toLowerCase().trim();
        const filtroCliente = document.getElementById('filtroCliente').value.toLowerCase().trim();
        const filtroVendedores = getMultiSelectValues('filtroVendedorDropdown'); // Array de IDs
        const filtroCondicaoPagamento = document.getElementById('filtroCondicaoPagamento').value;
        const filtroSituacoes = getMultiSelectValues('filtroSituacaoDropdown'); // Array de status
        const filtroDataInicial = document.getElementById('filtroDataInicial').value;
        const filtroDataFinal = document.getElementById('filtroDataFinal').value;
        const filtroPendenteCR = document.getElementById('filtroPendenteCR').checked;
        const filtroPendenteAP = document.getElementById('filtroPendenteAP').checked;

        console.log('Valores dos filtros:');
        console.log('  ID Pedido:', filtroIdPedido);
        console.log('  Cliente:', filtroCliente);
        console.log('  Vendedores:', filtroVendedores);
        console.log('  Condição Pagamento:', filtroCondicaoPagamento);
        console.log('  Situações:', filtroSituacoes);
        console.log('  Data Inicial:', filtroDataInicial);
        console.log('  Data Final:', filtroDataFinal);
        console.log('  Pendente CR:', filtroPendenteCR);
        console.log('  Pendente AP:', filtroPendenteAP);
        console.log('Total de vendas carregadas:', todasVendas.length);

        // Busca contas a receber e a pagar para filtros
        let contasReceber = [];
        let contasPagar = [];
        if (filtroPendenteCR || filtroPendenteAP) {
            try {
                contasReceber = await apiGet('/api/contas-receber') || [];
                contasPagar = await apiGet('/api/contas-pagar') || [];
            } catch (error) {
                console.warn('Erro ao buscar contas:', error);
            }
        }

        // Aplica filtros
        let vendasFiltradas = todasVendas.filter(venda => {
            // Filtro ID Pedido
            if (filtroIdPedido && !venda.codigo.toLowerCase().includes(filtroIdPedido)) {
                console.log(`Venda ${venda.codigo} excluída: ID Pedido não corresponde`);
                return false;
            }

            // Filtro Cliente - Busca parcial no nome do cliente
            if (filtroCliente) {
                const nomeCliente = (venda.cliente_nome || '').toLowerCase();
                if (!nomeCliente.includes(filtroCliente)) {
                    console.log(`Venda ${venda.codigo} excluída: Cliente não corresponde (${nomeCliente} não contém ${filtroCliente})`);
                    return false;
                }
            }

            // Filtro Vendedores (múltipla seleção) - Verifica se está na lista
            if (filtroVendedores.length > 0) {
                const vendedorVenda = venda.vendedor_id ? venda.vendedor_id.toString() : '';
                if (!filtroVendedores.includes(vendedorVenda)) {
                    console.log(`Venda ${venda.codigo} excluída: Vendedor ${vendedorVenda} não está na lista ${filtroVendedores}`);
                    return false;
                }
            }

            // Filtro Condição de Pagamento - Converter para número para comparação correta
            if (filtroCondicaoPagamento && parseInt(venda.condicao_pagamento_id) !== parseInt(filtroCondicaoPagamento)) {
                console.log(`Venda ${venda.codigo} excluída: Condição de Pagamento não corresponde`);
                return false;
            }

            // Filtro Situações (múltipla seleção) - Verifica se o status está na lista
            if (filtroSituacoes.length > 0) {
                const statusVenda = (venda.status || '').toLowerCase();
                if (!filtroSituacoes.includes(statusVenda)) {
                    console.log(`Venda ${venda.codigo} excluída: Situação ${statusVenda} não está na lista ${filtroSituacoes}`);
                    return false;
                }
            }

            // Filtro Data Inicial
            if (filtroDataInicial) {
                const dataVenda = new Date(venda.data_pedido);
                const dataInicial = new Date(filtroDataInicial);
                if (dataVenda < dataInicial) {
                    console.log(`Venda ${venda.codigo} excluída: Data anterior ao filtro`);
                    return false;
                }
            }

            // Filtro Data Final
            if (filtroDataFinal) {
                const dataVenda = new Date(venda.data_pedido);
                const dataFinal = new Date(filtroDataFinal);
                // Adiciona 1 dia para incluir todo o dia final
                dataFinal.setDate(dataFinal.getDate() + 1);
                if (dataVenda >= dataFinal) {
                    console.log(`Venda ${venda.codigo} excluída: Data posterior ao filtro`);
                    return false;
                }
            }

            // Filtro Pendente CR
            if (filtroPendenteCR) {
                const temContasReceber = contasReceber.some(cr => cr.documento_referencia === venda.codigo);
                if (temContasReceber) {
                    console.log(`Venda ${venda.codigo} excluída: Já tem CR criado`);
                    return false; // Exclui vendas que já têm CR criado
                }
            }

            // Filtro Pendente AP
            if (filtroPendenteAP) {
                const temContasPagar = contasPagar.some(cp => cp.documento_referencia === venda.codigo);
                if (temContasPagar || !venda.vendedor_id) {
                    console.log(`Venda ${venda.codigo} excluída: Já tem AP criado ou sem vendedor`);
                    return false; // Exclui vendas que já têm AP criado ou sem vendedor
                }
            }

            console.log(`Venda ${venda.codigo} INCLUÍDA nos resultados`);
            return true;
        });

        console.log(`✓ Filtros aplicados: ${vendasFiltradas.length} vendas encontradas de ${todasVendas.length}`);

        // Busca os itens (produtos) de cada venda para exportação
        // Mostra o loading se houver muitas vendas para processar
        if (vendasFiltradas.length > 0) {
            mostrarLoading();
            atualizarLoadingTexto('Processando vendas...', `0/${vendasFiltradas.length}`);
        }

        let processados = 0;
        for (const venda of vendasFiltradas) {
            processados++;

            // Atualiza o texto a cada X itens para não travar a UI (opcional, mas bom para performance)
            // Mas como o usuário pediu "o mesmo texto do log", vamos mostrar cada um
            atualizarLoadingTexto('Carregando detalhes...', `Processando venda ${venda.codigo} (${processados}/${vendasFiltradas.length})`);

            // console.log(`Processando venda ${venda.codigo} (${processados}/${vendasFiltradas.length})`);

            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                venda.produtos = vendaDetalhada.itens || [];
            } catch (error) {
                console.warn(`Erro ao buscar itens da venda ${venda.id}:`, error);
                venda.produtos = [];
            }
        }

        atualizarLoadingTexto('Finalizando...', `${vendasFiltradas.length} vendas encontradas`);

        // Configuração da paginação
        window.currentDisplayFunction = renderizarVendas;
        initPagination(vendasFiltradas, renderizarVendas);

        // Esconde o loading overlay
        esconderLoading();
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
        esconderLoading();
        alert('Erro ao aplicar filtros. Por favor, tente novamente.');
    }
}

// Função para limpar filtros
function limparFiltros() {
    document.getElementById('filtroIdPedido').value = '';
    document.getElementById('filtroCliente').value = '';
    limparMultiSelect('filtroVendedorDropdown', 'vendedor');
    document.getElementById('filtroCondicaoPagamento').value = '';
    limparMultiSelect('filtroSituacaoDropdown', 'situacao');
    document.getElementById('filtroDataInicial').value = '';
    document.getElementById('filtroDataFinal').value = '';
    document.getElementById('filtroPendenteCR').checked = false;
    document.getElementById('filtroPendenteAP').checked = false;

    // Limpa a tabela
    const tbody = document.getElementById('vendasTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">Use os filtros acima para visualizar as vendas</td></tr>';
    }

    console.log('Filtros limpos');
}

// Função para exportar dados em CSV
async function exportarDadosCSV() {
    try {
        // Verifica se há dados na tabela
        const tbody = document.getElementById('vendasTableBody');
        const linhas = tbody.querySelectorAll('tr');

        if (linhas.length === 0 || tbody.innerHTML.includes('Nenhuma venda encontrada') || tbody.innerHTML.includes('Use os filtros')) {
            alert('Nenhum dado para exportar. Aplique os filtros primeiro.');
            return;
        }

        // Obtém os dados da paginação atual
        let dadosExportacao = [];

        // Se houver paginação, obtém todos os dados da paginação (allItems vem de pagination.js)
        if (typeof allItems !== 'undefined' && allItems && allItems.length > 0) {
            dadosExportacao = allItems;
        } else {
            alert('Nenhum dado para exportar. Aplique os filtros primeiro.');
            return;
        }

        // Define os cabeçalhos do CSV
        const cabecalhos = [
            'ID',
            'Cliente',
            'Data',
            'Valor Total',
            'Produtos',
            'Status',
            'Vendedor',
            'Condição Pagamento',
            'Comissão (R$)',
            'Contas a Receber',
            'Contas a Pagar'
        ];

        // Busca contas a receber e a pagar para referência
        let contasReceber = [];
        let contasPagar = [];
        try {
            contasReceber = await apiGet('/api/contas-receber') || [];
            contasPagar = await apiGet('/api/contas-pagar') || [];
        } catch (error) {
            console.warn('Erro ao buscar contas:', error);
        }

        // Cria as linhas do CSV
        const linhasCSV = dadosExportacao.map(venda => {
            // Verifica status de CR
            const temContasReceber = contasReceber.some(cr => cr.documento_referencia === venda.codigo);
            const statusCR = temContasReceber ? 'Criado' : 'Pendente';

            // Verifica status de AP
            const temContasPagar = contasPagar.some(cp => cp.documento_referencia === venda.codigo);
            const statusAP = venda.vendedor_id ? (temContasPagar ? 'Criado' : 'Pendente') : 'Sem vendedor';

            // Busca produtos (simplificado - apenas nomes)
            const produtosTexto = venda.produtos ? venda.produtos.map(p => p.produto_nome).join('; ') : '-';

            return [
                venda.id,
                venda.cliente_nome || '-',
                formatarData(venda.data_pedido),
                formatarMoedaCSV(venda.valor_total),
                produtosTexto,
                venda.status,
                venda.vendedor_nome || '-',
                venda.condicao_pagamento_nome || '-',
                formatarMoedaCSV(venda.comissao_total || 0),
                statusCR,
                statusAP
            ];
        });

        // Monta o conteúdo do CSV
        let conteudoCSV = cabecalhos.join(';') + '\n';
        linhasCSV.forEach(linha => {
            // Escapa aspas duplas e envolve campos com vírgula/ponto-e-vírgula em aspas
            const linhaFormatada = linha.map(campo => {
                const campoStr = String(campo || '');
                if (campoStr.includes(';') || campoStr.includes('"') || campoStr.includes('\n')) {
                    return '"' + campoStr.replace(/"/g, '""') + '"';
                }
                return campoStr;
            }).join(';');
            conteudoCSV += linhaFormatada + '\n';
        });

        // Cria o blob e faz download
        const blob = new Blob([conteudoCSV], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        // Define o nome do arquivo com data/hora
        const agora = new Date();
        const dataHora = agora.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
            agora.getHours().toString().padStart(2, '0') + '-' +
            agora.getMinutes().toString().padStart(2, '0') + '-' +
            agora.getSeconds().toString().padStart(2, '0');

        link.setAttribute('href', url);
        link.setAttribute('download', `vendas_${dataHora}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`Arquivo exportado com sucesso: ${linhasCSV.length} vendas`);
        alert(`Arquivo exportado com sucesso! (${linhasCSV.length} vendas)`);
    } catch (error) {
        console.error('Erro ao exportar dados:', error);
        alert('Erro ao exportar dados. Por favor, tente novamente.');
    }
}

// Função auxiliar para formatar moeda no CSV (sem símbolo)
function formatarMoedaCSV(valor) {
    if (!valor) return '0,00';
    const numero = parseFloat(valor);
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Funções para renderizar dados
async function renderizarVendas(vendas) {
    const tbody = document.getElementById('vendasTableBody');
    tbody.innerHTML = '';

    if (vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">Nenhuma venda encontrada</td></tr>';
        return;
    }

    // Obtém dados do usuário atual
    const userData = await getCurrentUser();

    // Verifica se o usuário é administrador
    const isAdmin = userData && userData.nivel_acesso === 'admin';

    // Verifica permissão de financeiro
    const temPermissaoFinanceiro = await hasPermission('financeiro_editar');

    // Se não for admin, busca o vendedor associado ao usuário
    let vendedorId = null;
    if (!isAdmin && userData) {
        const vendedores = await apiGet('/api/vendedores');
        const vendedorAtual = vendedores.find(v => v.usuario_id === userData.id);
        if (vendedorAtual) {
            vendedorId = vendedorAtual.id;
        }
    }

    // OTIMIZAÇÃO: Buscar todas as contas uma única vez (sem filtro para ter todas disponíveis)
    let contasReceber = [];
    let contasPagar = [];
    try {
        contasReceber = await apiGet('/api/contas-receber') || [];
        contasPagar = await apiGet('/api/contas-pagar') || [];
        console.log(`Contas carregadas: ${contasReceber.length} a receber, ${contasPagar.length} a pagar`);
    } catch (error) {
        console.warn('Erro ao buscar contas:', error);
    }

    // Processar vendas uma por vez
    for (const venda of vendas) {
        // Formata status para exibição e para CSS
        const label = formatarStatus(venda.status);
        const statusKey = label.toLowerCase();
        const tr = document.createElement('tr');

        // Aplicar classe baseada no status
        tr.classList.add(`status-${statusKey}`);

        // Verifica se o usuário pode editar esta venda
        // Administradores podem editar qualquer venda
        // Vendedores só podem editar suas próprias vendas
        const podeEditar = isAdmin || (vendedorId && venda.vendedor_id === vendedorId);

        // Usar comissão total diretamente do banco de dados
        const comissao = venda.comissao_total || 0;

        // Busca os itens da venda
        let itensVenda = [];
        try {
            const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
            itensVenda = vendaDetalhada.itens || [];
        } catch (error) {
            console.warn(`Erro ao buscar itens da venda ${venda.id}:`, error);
        }

        // Cria o HTML dos produtos
        const produtosHTML = criarProdutosCell(itensVenda, venda.id);

        // Verifica se existe contas a receber para esta venda usando documento_referencia (código do pedido)
        const temContasReceber = contasReceber && contasReceber.some(cr => cr.documento_referencia === venda.codigo);
        let contasReceberHTML = '<td><span class="cr-badge cr-nao-criado"><i class="fas fa-times"></i> Não criado</span></td>';
        if (temContasReceber) {
            contasReceberHTML = '<td><span class="cr-badge cr-criado"><i class="fas fa-check"></i> Criado</span></td>';
        } else if (temPermissaoFinanceiro) {
            // Só mostra botão se tiver permissão de financeiro
            contasReceberHTML = `<td><div class="cr-status"><span class="cr-badge cr-nao-criado"><i class="fas fa-times"></i> Não criado</span><button class="btn-criar-cr" data-venda-id="${venda.id}" data-venda-codigo="${venda.codigo}"><i class="fas fa-plus"></i> Criar CR</button></div></td>`;
        }

        // Verifica se existe contas a pagar para esta venda usando documento_referencia (código do pedido) - apenas se houver vendedor
        let contasPagarHTML = '<td><span class="cp-badge cp-nao-criado"><i class="fas fa-times"></i> Não criado</span></td>';
        if (venda.vendedor_id) {
            const temContasPagar = contasPagar && contasPagar.some(cp => cp.documento_referencia === venda.codigo);
            if (temContasPagar) {
                contasPagarHTML = '<td><span class="cp-badge cp-criado"><i class="fas fa-check"></i> Criado</span></td>';
            } else if (temPermissaoFinanceiro) {
                // Só mostra botão se tiver permissão de financeiro
                contasPagarHTML = `<td><div class="cp-status"><span class="cp-badge cp-nao-criado"><i class="fas fa-times"></i> Não criado</span><button class="btn-criar-cp" data-venda-id="${venda.id}" data-venda-codigo="${venda.codigo}" data-vendedor-id="${venda.vendedor_id}"><i class="fas fa-plus"></i> Criar CP</button></div></td>`;
            }
        } else {
            contasPagarHTML = '<td><span class="cp-badge cp-sem-vendedor"><i class="fas fa-ban"></i> Sem vendedor</span></td>';
        }

        // Verifica se pode mostrar botão de devolução (apenas para vendas finalizadas)
        const podeDevolucao = podeEditar && statusKey === 'finalizada';

        tr.innerHTML = `
            <td>${venda.id}</td>
            <td>${venda.cliente_nome} <span title="Total de pedidos deste cliente" style="font-size: 0.85em; color: #6c757d; margin-left: 5px;">(${venda.total_pedidos_cliente || 0})</span></td>
            <td>${formatarData(venda.data_pedido)}</td>
            <td>${formatarMoeda(venda.valor_total)}</td>
            ${produtosHTML}
            <td>
                ${podeEditar ? `
                <select class="status-select-inline" data-venda-id="${venda.id}" data-status-atual="${statusKey}">
                    <option value="pendente" ${statusKey === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="finalizada" ${statusKey === 'finalizada' ? 'selected' : ''}>Finalizada</option>
                    <option value="cancelada" ${statusKey === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                    <option value="devolvido" ${statusKey === 'devolvido' ? 'selected' : ''}>Devolvido</option>
                </select>
                ` : `<span class="status-badge ${statusKey}">${label}</span>`}
            </td>
            <td>${venda.vendedor_nome ? venda.vendedor_nome : '-'}</td>
            <td>${venda.plataforma_nome ? venda.plataforma_nome : '-'}</td>
            <td>${venda.condicao_pagamento_nome ? venda.condicao_pagamento_nome : '-'}</td>
            <td>${formatarMoeda(comissao)}</td>
            ${contasReceberHTML}
            ${contasPagarHTML}
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" data-id="${venda.id}" title="Visualizar">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${podeEditar ? `
                    <button class="btn-icon btn-edit" data-id="${venda.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" data-id="${venda.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                    ${podeDevolucao ? `
                    <button class="btn-devolucao" data-id="${venda.id}" data-codigo="${venda.codigo}" data-cliente="${venda.cliente_nome}" data-valor="${venda.valor_total}" data-vendedor="${venda.vendedor_nome || '-'}" title="Devolução">
                        <i class="fas fa-undo-alt"></i> Devolução
                    </button>
                    ` : ''}
                    ${venda.vendedor_id && comissao > 0 ? `
                    <button class="btn-comis" data-vendedor-id="${venda.vendedor_id}" data-vendedor-nome="${venda.vendedor_nome}" data-comissao="${comissao}" title="PIX Comissão">
                        <i class="fas fa-qrcode"></i> Comis
                    </button>
                    ` : ''}
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    }

    // Adicionar event listeners para os botões de ação
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => visualizarVenda(parseInt(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => editarVenda(parseInt(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => excluirVenda(parseInt(btn.dataset.id)));
    });

    // Adicionar event listeners para os botões de ver produtos
    document.querySelectorAll('.btn-ver-produtos').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itensJSON = btn.dataset.itens;
            const vendaId = btn.dataset.vendaId;

            try {
                const itens = JSON.parse(itensJSON.replace(/&quot;/g, '"'));
                abrirModalProdutos(itens, vendaId);
            } catch (error) {
                console.error('Erro ao parsear itens:', error);
            }
        });
    });

    // Adicionar event listeners para os botões de criar CR
    document.querySelectorAll('.btn-criar-cr').forEach(btn => {
        btn.addEventListener('click', () => criarContasReceber(parseInt(btn.dataset.vendaId), btn.dataset.vendaCodigo));
    });

    // Adicionar event listeners para os botões de criar CP
    document.querySelectorAll('.btn-criar-cp').forEach(btn => {
        btn.addEventListener('click', () => criarContasPagar(parseInt(btn.dataset.vendaId), btn.dataset.vendaCodigo, parseInt(btn.dataset.vendedorId)));
    });

    // Adicionar event listeners para os botões de devolução
    document.querySelectorAll('.btn-devolucao').forEach(btn => {
        btn.addEventListener('click', () => abrirModalDevolucao(
            parseInt(btn.dataset.id),
            btn.dataset.codigo,
            btn.dataset.cliente,
            parseFloat(btn.dataset.valor),
            btn.dataset.vendedor
        ));
    });

    // Adicionar event listeners para os botões de comissão PIX
    document.querySelectorAll('.btn-comis').forEach(btn => {
        btn.addEventListener('click', () => abrirModalPixComissao(
            parseInt(btn.dataset.vendedorId),
            btn.dataset.vendedorNome,
            parseFloat(btn.dataset.comissao)
        ));
    });

    // Adicionar event listeners para os dropdowns de status inline
    document.querySelectorAll('.status-select-inline').forEach(select => {
        select.addEventListener('change', async function () {
            const vendaId = parseInt(this.dataset.vendaId);
            const statusAtual = this.dataset.statusAtual;
            const novoStatus = this.value;

            if (novoStatus === statusAtual) return;

            // Confirmação antes de alterar
            if (!confirm(`Deseja alterar o status da venda #${vendaId} para "${novoStatus}"?`)) {
                // Reverter para o status original se cancelar
                this.value = statusAtual;
                return;
            }

            try {
                // Desabilita o select enquanto processa
                this.disabled = true;

                // Se estiver mudando para 'devolvido' ou 'cancelada', precisa processar devolução de estoque
                const statusAnteriorNormalizado = statusAtual.toLowerCase();
                const statusNovoNormalizado = novoStatus.toLowerCase();

                // Verifica se precisa fazer devolução de estoque (retornar produtos ao estoque)
                const precisaDevolucao = (statusNovoNormalizado === 'devolvido' || statusNovoNormalizado === 'cancelada') &&
                    (statusAnteriorNormalizado === 'pendente' || statusAnteriorNormalizado === 'finalizada');

                if (precisaDevolucao) {
                    // Chama a API de devolução que já faz o retorno de estoque
                    console.log(`[Vendas] Processando devolução/cancelamento para venda #${vendaId}`);

                    const response = await apiPost(`/api/vendas/${vendaId}/devolucao`, {
                        justificativa: `Alteração de status para ${novoStatus} via página de vendas`
                    });

                    console.log('Resposta da devolução:', response);

                    // Notifica via webhook sobre o retorno de produtos
                    if (window.webhookEstoque) {
                        // Busca os itens da venda para notificar
                        try {
                            const vendaDetalhada = await apiGet(`/api/vendas/${vendaId}`);
                            if (vendaDetalhada.itens && vendaDetalhada.itens.length > 0) {
                                console.log('[Vendas] Notificando retorno de produtos ao estoque via webhook...');
                                window.webhookEstoque.notificarEntradaProdutos(vendaDetalhada.itens);
                            }
                        } catch (webhookError) {
                            console.warn('Erro ao notificar webhook:', webhookError);
                        }
                    }
                } else {
                    // Atualização simples de status (não precisa de devolução de estoque)
                    await apiPut(`/api/vendas/${vendaId}`, { status: novoStatus });
                }

                // Atualiza o data-attribute para o novo status
                this.dataset.statusAtual = novoStatus;

                // Muda a cor da linha baseado no novo status
                const row = this.closest('tr');
                if (row) {
                    row.className = `status-${novoStatus}`;
                }

                console.log(`Status da venda #${vendaId} alterado de "${statusAtual}" para "${novoStatus}"`);

                // Re-habilita o select
                this.disabled = false;

            } catch (error) {
                console.error('Erro ao alterar status da venda:', error);
                alert(`Erro ao alterar status: ${error.message || error.detail || 'Erro desconhecido'}`);
                // Reverter para o status original em caso de erro
                this.value = statusAtual;
                this.disabled = false;
            }
        });
    });
}

// Função para criar a célula de produtos
function criarProdutosCell(itens, vendaId) {
    if (!itens || itens.length === 0) {
        return '<td class="produtos-cell">-</td>';
    }

    const quantidade = itens.length;
    const itensJSON = JSON.stringify(itens).replace(/"/g, '&quot;');

    return `
        <td class="produtos-cell">
            <button class="produtos-preview btn-ver-produtos" data-itens="${itensJSON}" data-venda-id="${vendaId}">
                <i class="fas fa-box"></i>
                <span class="produtos-badge">${quantidade} ${quantidade === 1 ? 'produto' : 'produtos'}</span>
            </button>
        </td>
    `;
}

function preencherSelectClientes(clientes) {
    const selectCliente = document.getElementById('cliente_id');

    // Limpar opções existentes, mantendo a primeira
    if (selectCliente) {
        selectCliente.innerHTML = '<option value="">Selecione...</option>';
    }

    // Se não houver clientes, usar dados mockados
    if (!clientes || clientes.length === 0) {
        clientes = [
            { id: 1, nome: 'Cliente A' },
            { id: 2, nome: 'Cliente B' },
            { id: 3, nome: 'Cliente C' }
        ];
    }

    clientes.forEach(cliente => {
        // Adicionar ao select do formulário
        if (selectCliente) {
            const option = document.createElement('option');
            option.value = cliente.id;
            option.textContent = cliente.nome;
            option.dataset.nome = cliente.nome;
            selectCliente.appendChild(option);
        }
    });

    // Adicionar campo de pesquisa para clientes
    adicionarPesquisaClientes();
}

// Função para adicionar campo de pesquisa para clientes
function adicionarPesquisaClientes() {
    // Verificar se o campo já existe
    if (!document.getElementById('pesquisaCliente')) {
        const selectCliente = document.getElementById('cliente_id');
        const container = selectCliente.parentElement;

        // Criar campo de pesquisa
        const pesquisaDiv = document.createElement('div');
        pesquisaDiv.className = 'form-group mb-2';
        pesquisaDiv.innerHTML = `
            <label for="pesquisaCliente">Pesquisar Cliente:</label>
            <input type="text" id="pesquisaCliente" class="form-control" placeholder="Digite para pesquisar todos os clientes...">
        `;

        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectCliente);

        // Adicionar evento de pesquisa - pesquisa em TODOS os clientes
        document.getElementById('pesquisaCliente').addEventListener('input', function (e) {
            const termo = e.target.value.toLowerCase().trim();

            // Se não há termo, mostra os últimos 10 clientes
            if (!termo) {
                const ultimosClientes = [...todosClientesVendas].sort((a, b) => b.id - a.id).slice(0, 10);
                atualizarSelectClientes(ultimosClientes);
                return;
            }

            // Filtra todos os clientes pelo termo de pesquisa
            const clientesFiltrados = todosClientesVendas.filter(cliente => {
                const nome = (cliente.nome || '').toLowerCase();
                const email = (cliente.email || '').toLowerCase();
                const cpf_cnpj = (cliente.cpf_cnpj || '').toLowerCase();
                return nome.includes(termo) || email.includes(termo) || cpf_cnpj.includes(termo);
            });

            atualizarSelectClientes(clientesFiltrados);
        });
    }
}

// Função auxiliar para atualizar o select de clientes
function atualizarSelectClientes(clientes) {
    const selectCliente = document.getElementById('cliente_id');
    if (!selectCliente) return;

    // Salva o valor selecionado atual
    const valorAtual = selectCliente.value;

    // Limpa e repopula o select
    selectCliente.innerHTML = '<option value="">Selecione...</option>';

    clientes.forEach(cliente => {
        const option = document.createElement('option');
        option.value = cliente.id;
        option.textContent = cliente.nome;
        option.dataset.nome = cliente.nome;
        selectCliente.appendChild(option);
    });

    // Restaura o valor selecionado se ainda existir
    if (valorAtual) {
        selectCliente.value = valorAtual;
    }
}

function preencherSelectProdutos(produtos) {
    const selectProduto = document.getElementById('produto_id');

    // Limpar opções existentes, mantendo a primeira
    selectProduto.innerHTML = '<option value="">Selecione...</option>';

    // Verificar se produtos foram carregados
    if (!produtos || produtos.length === 0) {
        console.log('Nenhum produto carregado da API');
        return;
    }

    // Filtrar apenas produtos com estoque maior que zero
    const produtosComEstoque = produtos.filter(produto => {
        const estoque = produto.estoque_atual || 0;
        return estoque > 0;
    });

    if (produtosComEstoque.length === 0) {
        console.log('Nenhum produto com estoque disponível');
        return;
    }

    // Mostrar apenas produtos com estoque
    produtosComEstoque.forEach(produto => {
        const estoque = produto.estoque_atual || 0;

        const option = document.createElement('option');
        option.value = produto.id;
        option.textContent = `${produto.nome} (Estoque: ${estoque})`;
        option.dataset.preco = produto.preco_venda;
        option.dataset.custo = produto.preco_custo;
        option.dataset.estoque = estoque;
        option.dataset.comissao = produto.comissao || 0;
        selectProduto.appendChild(option);
    });

    // Adicionar campo de pesquisa para produtos
    adicionarPesquisaProdutos();
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

function preencherSelectVendedores(vendedores) {
    const selectVendedor = document.getElementById('vendedor_id');
    const filtroVendedor = document.getElementById('filtroVendedor');

    // Limpar opções existentes, mantendo a primeira
    selectVendedor.innerHTML = '<option value="">Selecione...</option>';
    if (filtroVendedor) {
        filtroVendedor.innerHTML = '<option value="">Todos os vendedores</option>';
    }

    // Não usar dados mockados, apenas usar os vendedores reais da API
    if (vendedores && vendedores.length > 0) {
        vendedores.forEach(vendedor => {
            const option = document.createElement('option');
            option.value = vendedor.id;
            option.textContent = vendedor.nome;
            selectVendedor.appendChild(option);

            // Adicionar também ao filtro
            if (filtroVendedor) {
                const optionFiltro = document.createElement('option');
                optionFiltro.value = vendedor.id;
                optionFiltro.textContent = vendedor.nome;
                filtroVendedor.appendChild(optionFiltro);
            }
        });
    } else {
        console.log('Nenhum vendedor encontrado na API');
    }
}

function preencherSelectCondicoesPagamento(condicoes) {
    const selectCondicao = document.getElementById('condicao_pagamento_id');
    const filtroCondicao = document.getElementById('filtroCondicaoPagamento');

    // Limpar opções existentes, mantendo a primeira
    selectCondicao.innerHTML = '<option value="">Selecione...</option>';
    if (filtroCondicao) {
        filtroCondicao.innerHTML = '<option value="">Todas as condições</option>';
    }

    // Preencher com as condições de pagamento da API
    if (condicoes && condicoes.length > 0) {
        condicoes.forEach(condicao => {
            const option = document.createElement('option');
            option.value = condicao.id;
            option.textContent = `${condicao.nome} (${condicao.numero_parcelas}x)`;
            selectCondicao.appendChild(option);

            // Adicionar também ao filtro
            if (filtroCondicao) {
                const optionFiltro = document.createElement('option');
                optionFiltro.value = condicao.id;
                optionFiltro.textContent = `${condicao.nome} (${condicao.numero_parcelas}x)`;
                filtroCondicao.appendChild(optionFiltro);
            }
        });
    } else {
        console.log('Nenhuma condição de pagamento encontrada na API');
    }
}

// Função para carregar plataformas de venda - Método de Venda
async function carregarPlataformas() {
    try {
        // Usa a API centralizada para buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda', { ativo: true });
        console.log('Plataformas de venda carregadas da API:', plataformas);
        preencherSelectPlataformas(plataformas);
    } catch (error) {
        console.error('Erro ao carregar plataformas:', error);
    }
}

// Função para preencher o select de plataformas (Método de Venda)
function preencherSelectPlataformas(plataformas) {
    const selectPlataforma = document.getElementById('plataforma_id');

    if (!selectPlataforma) {
        console.error('Select plataforma_id não encontrado');
        return;
    }

    // Limpar opções existentes, mantendo a primeira
    selectPlataforma.innerHTML = '<option value="">Selecione...</option>';

    // Preencher com as plataformas de venda da API
    if (plataformas && plataformas.length > 0) {
        plataformas.forEach(plataforma => {
            const option = document.createElement('option');
            option.value = plataforma.id;
            option.textContent = plataforma.nome;
            selectPlataforma.appendChild(option);
        });
    } else {
        console.log('Nenhuma plataforma de venda encontrada na API');
    }
}

// Funções para manipulação de vendas
async function abrirModalNovaVenda() {
    console.log('Função abrirModalNovaVenda iniciada');
    editandoVenda = false;
    vendaAtual = null;
    itensVenda = [];

    // Recarrega produtos com estoque atualizado antes de abrir o modal
    await carregarProdutos();
    console.log('Produtos recarregados com estoque atualizado');

    // Resetar formulário
    console.log('Resetando formulário');
    const vendaForm = document.getElementById('vendaForm');
    if (!vendaForm) {
        console.error('Formulário vendaForm não encontrado');
    } else {
        vendaForm.reset();
    }

    const dataEntrega = document.getElementById('data_entrega');
    if (!dataEntrega) {
        console.error('Campo data_entrega não encontrado');
    } else {
        dataEntrega.valueAsDate = new Date();
    }

    const modalTitle = document.getElementById('modalTitle');
    if (!modalTitle) {
        console.error('Elemento modalTitle não encontrado');
    } else {
        modalTitle.textContent = 'Nova Venda';
    }

    const itensVendaTableBody = document.getElementById('itensVendaTableBody');
    if (!itensVendaTableBody) {
        console.error('Tabela itensVendaTableBody não encontrada');
    } else {
        itensVendaTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum item adicionado</td></tr>';
    }

    const valorTotal = document.getElementById('valorTotal');
    if (!valorTotal) {
        console.error('Elemento valorTotal não encontrado');
    } else {
        valorTotal.textContent = 'R$ 0,00';
    }

    const comissaoTotal = document.getElementById('comissaoTotal');
    if (!comissaoTotal) {
        console.error('Elemento comissaoTotal não encontrado');
    } else {
        comissaoTotal.textContent = 'R$ 0,00';
    }

    // Resetar abas para a primeira
    resetarAbasModal();

    // Exibir modal
    console.log('Tentando exibir o modal');
    const vendaModal = document.getElementById('vendaModal');
    if (!vendaModal) {
        console.error('Modal vendaModal não encontrado');
    } else {
        console.log('Modal encontrado, adicionando classe active');
        // Remover o estilo inline e usar apenas a classe active
        vendaModal.style.display = '';
        vendaModal.classList.add('active');
        console.log('Estado atual do modal: classe active =', vendaModal.classList.contains('active'));
    }
}

async function editarVenda(id) {
    editandoVenda = true;
    // Recarregar lista de clientes e vendedores antes de preencher os selects
    await carregarClientes();
    await carregarVendedores();

    try {
        // Usar a API centralizada
        vendaAtual = await apiGet(`/api/vendas/${id}`);
    } catch (error) {
        console.error('Erro ao obter detalhes da venda:', error);
        alert('Erro ao carregar dados da venda. Por favor, tente novamente.');
        return;
    }

    if (!vendaAtual) {
        alert('Venda não encontrada!');
        return;
    }

    // Preencher formulário com dados da venda
    document.getElementById('modalTitle').textContent = `Editar Venda #${vendaAtual.id}`;

    // Garantir que o cliente da venda esteja no select antes de selecionar
    const selectCliente = document.getElementById('cliente_id');
    if (vendaAtual.cliente_id && selectCliente) {
        // Verificar se o cliente já está no select
        const clienteExiste = Array.from(selectCliente.options).some(opt => opt.value == vendaAtual.cliente_id);
        if (!clienteExiste) {
            // Buscar o cliente na lista completa ou usar o nome da venda
            const clienteDaVenda = todosClientesVendas.find(c => c.id == vendaAtual.cliente_id);
            const nomeCliente = clienteDaVenda ? clienteDaVenda.nome : (vendaAtual.cliente_nome || `Cliente ${vendaAtual.cliente_id}`);
            const option = document.createElement('option');
            option.value = vendaAtual.cliente_id;
            option.textContent = nomeCliente;
            option.dataset.nome = nomeCliente;
            selectCliente.appendChild(option);
        }
    }

    document.getElementById('cliente_id').value = vendaAtual.cliente_id || '';
    document.getElementById('vendedor_id').value = vendaAtual.vendedor_id || '';
    document.getElementById('condicao_pagamento_id').value = vendaAtual.condicao_pagamento_id || '';
    document.getElementById('plataforma_id').value = vendaAtual.plataforma_id || '';
    document.getElementById('data_entrega').value = vendaAtual.data_entrega || '';
    document.getElementById('forma_pagamento').value = vendaAtual.forma_pagamento || '';
    // Normalizar status para garantir seleção correta no <select>
    const statusSelect = document.getElementById('status');
    const statusRaw = vendaAtual.status || 'pendente';
    const statusNormalized = String(statusRaw).toLowerCase();
    const allowedStatuses = ['pendente', 'finalizada', 'cancelada'];
    statusSelect.value = allowedStatuses.includes(statusNormalized) ? statusNormalized : 'pendente';
    document.getElementById('observacoes').value = vendaAtual.observacoes || '';

    // Exibir comissão total do banco de dados
    const comissaoTotalElement = document.getElementById('comissaoTotal');
    if (comissaoTotalElement) {
        comissaoTotalElement.textContent = formatarMoeda(vendaAtual.comissao_total || 0);
    }

    // Carregar itens da venda
    carregarItensVenda(id);

    // Resetar abas para a primeira
    resetarAbasModal();

    // Exibir modal
    document.getElementById('vendaModal').style.display = 'flex';
}

async function carregarItensVenda(vendaId) {
    try {
        // Usa a API centralizada
        const data = await apiGet(`/api/vendas/${vendaId}`);
        itensVenda = data.itens;

        renderizarItensVenda();
        atualizarValorTotal();
    } catch (error) {
        console.error('Erro ao carregar itens da venda:', error);
        // Sem dados fictícios
        itensVenda = [];
        alert('Erro ao carregar itens da venda. Por favor, tente novamente.');

        renderizarItensVenda();
        atualizarValorTotal();
    }
}

function visualizarVenda(id) {
    editarVenda(id);

    // Definir como modo de visualização (não edição)
    editandoVenda = false;

    // Desabilitar campos para visualização
    const form = document.getElementById('vendaForm');
    Array.from(form.elements).forEach(element => {
        element.disabled = true;
    });

    document.getElementById('btnAdicionarItem').disabled = true;
    document.getElementById('btnSalvar').style.display = 'none';
    document.getElementById('modalTitle').textContent = `Visualizar Venda #${id}`;

    // Remover botões de exclusão de itens
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.style.display = 'none';
    });
}

function excluirVenda(id) {
    if (confirm(`Tem certeza que deseja excluir a venda #${id}?`)) {
        excluirVendaAPI(id);
    }
}

async function excluirVendaAPI(id) {
    try {
        // Usa a API centralizada
        await apiDelete(`/api/vendas/${id}`);

        alert('Venda excluída com sucesso!');
        carregarVendas();
    } catch (error) {
        console.error('Erro ao excluir venda:', error);
        alert('Erro ao excluir venda. Por favor, tente novamente.');
    }
}

function fecharModalVenda() {
    console.log('Fechando modal de venda');
    const vendaModal = document.getElementById('vendaModal');
    if (vendaModal) {
        // Remover a classe active E definir display como none para garantir que o modal seja fechado
        vendaModal.classList.remove('active');
        vendaModal.style.display = 'none';
        console.log('Modal fechado com sucesso (classe active removida e display none aplicado)');
    } else {
        console.error('Modal vendaModal não encontrado ao tentar fechar');
    }

    // Remover a classe modal-open do body para permitir o scroll novamente
    document.body.classList.remove('modal-open');

    // Reabilitar campos que possam ter sido desabilitados
    const form = document.getElementById('vendaForm');
    if (form) {
        Array.from(form.elements).forEach(element => {
            element.disabled = false;
        });
    }

    const btnAdicionarItem = document.getElementById('btnAdicionarItem');
    if (btnAdicionarItem) {
        btnAdicionarItem.disabled = false;
    }

    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) {
        btnSalvar.style.display = 'block';
    }
}

async function salvarVenda() {
    // Validar formulário
    const form = document.getElementById('vendaForm');
    if (!form.checkValidity()) {
        const invalidFields = form.querySelectorAll(':invalid');
        if (invalidFields.length > 0) {
            const firstInvalid = invalidFields[0];

            // Verifica se o campo está em uma aba oculta e muda para ela
            const tabContent = firstInvalid.closest('.modal-tab-content');
            if (tabContent && !tabContent.classList.contains('active')) {
                const tabId = tabContent.id;
                const tabButton = document.querySelector(`.modal-tab[data-tab="${tabId}"]`);
                if (tabButton) {
                    tabButton.click();
                }
            }

            // Pequeno delay para garantir que a aba trocou antes de focar
            setTimeout(() => {
                firstInvalid.focus();
            }, 100);

            invalidFields.forEach(field => {
                field.classList.add('is-invalid');
                field.addEventListener('input', function () {
                    this.classList.remove('is-invalid');
                }, { once: true });
            });
        }
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    // Verificar se há itens na venda
    if (itensVenda.length === 0) {
        alert('Adicione pelo menos um item à venda.');
        return;
    }

    // Coletar dados do formulário
    // Usar o cliente selecionado no formulário
    const clienteSelect = document.getElementById('cliente_id');
    const clienteId = parseInt(clienteSelect.value);

    // Obter o nome do cliente selecionado para salvar corretamente
    const clienteOption = clienteSelect.options[clienteSelect.selectedIndex];
    const clienteNome = clienteOption ? clienteOption.textContent : '';

    console.log('Usando cliente ID selecionado:', clienteId);
    console.log('Nome do cliente selecionado:', clienteNome);

    // Validar se um cliente foi selecionado
    if (!clienteId) {
        alert('Por favor, selecione um cliente.');
        return;
    }

    console.log('ID do cliente a ser usado:', clienteId);

    // Calcular o custo total dos produtos
    const custoTotal = itensVenda.reduce((total, item) => {
        return total + (item.preco_custo * item.quantidade);
    }, 0);

    // Calcular a comissão total
    const comissaoTotal = itensVenda.reduce((total, item) => {
        return total + (item.comissao_item || 0);
    }, 0);

    // Validar se uma plataforma (Método de Venda) foi selecionada
    const plataformaSelect = document.getElementById('plataforma_id');
    const plataformaId = plataformaSelect ? parseInt(plataformaSelect.value) : null;

    if (!plataformaId) {
        alert('Por favor, selecione um Método de Venda.');
        return;
    }

    const vendaData = {
        cliente_id: clienteId, // Usando o ID do cliente selecionado no formulário
        cliente_nome: clienteNome, // Adicionando o nome do cliente para garantir que seja salvo corretamente
        plataforma_id: plataformaId, // Método de Venda (obrigatório)
        data_entrega: document.getElementById('data_entrega').value, // Usando o campo data_entrega do formulário
        forma_pagamento: document.getElementById('forma_pagamento').value, // Usando a forma de pagamento selecionada no formulário
        observacoes: document.getElementById('observacoes').value,
        valor_frete: 0, // Adicionando campos obrigatórios do modelo PedidoVendaBase
        valor_desconto: 0,
        custo_produto: custoTotal, // Adicionando o custo total dos produtos
        comissao_total: comissaoTotal, // Adicionando a comissão total
        itens: itensVenda.map(item => ({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            comissao_item: item.comissao_item || 0, // Adicionando comissão por item
            desconto: 0 // Adicionando campo obrigatório do modelo ItemPedidoVendaBase
        }))
    };

    // Adicionar vendedor_id se existir no formulário e tiver um valor selecionado
    const vendedorSelect = document.getElementById('vendedor_id');
    if (vendedorSelect && vendedorSelect.value && vendedorSelect.value !== "0") {
        vendaData.vendedor_id = parseInt(vendedorSelect.value);
    } else {
        // Se não houver vendedor selecionado ou o valor for 0, enviar 0
        // O backend espera 0 como ausência de vendedor, não null
        vendaData.vendedor_id = 0;
    }

    // Adicionar condicao_pagamento_id se existir no formulário e tiver um valor selecionado
    const condicaoSelect = document.getElementById('condicao_pagamento_id');
    if (condicaoSelect && condicaoSelect.value) {
        vendaData.condicao_pagamento_id = parseInt(condicaoSelect.value);
    }

    console.log('Dados da venda a serem enviados:', vendaData); // Log para debug

    // Ativar estado de loading no botão
    const btnSalvar = document.getElementById('btnSalvar');
    const originalText = btnSalvar ? btnSalvar.textContent : 'Salvar';
    if (btnSalvar) {
        btnSalvar.textContent = 'Aguarde...';
        btnSalvar.disabled = true;
    }

    try {
        if (editandoVenda && vendaAtual) {
            // Adicionar status apenas para atualizações
            vendaData.status = document.getElementById('status').value;
            console.log('Atualizando venda com status:', vendaData.status);
            await atualizarVenda(vendaAtual.id, vendaData);
        } else {
            await criarVenda(vendaData);
        }
    } finally {
        // Restaurar estado do botão
        if (btnSalvar) {
            btnSalvar.textContent = originalText;
            btnSalvar.disabled = false;
        }
    }
}

async function criarVenda(vendaData) {
    try {
        // Adicionar logs para debug
        console.log('Dados da venda a serem enviados:', vendaData);

        // Usa a API centralizada
        await apiPost('/api/vendas', vendaData);

        // Notifica via webhook sobre a saída de produtos
        if (vendaData.itens && vendaData.itens.length > 0 && window.webhookEstoque) {
            console.log('[Vendas] Notificando saída de produtos via webhook...');

            // Obter nome do vendedor selecionado
            const vendedorSelect = document.getElementById('vendedor_id');
            let vendedorNome = '';
            if (vendedorSelect && vendedorSelect.selectedIndex > 0) {
                vendedorNome = vendedorSelect.options[vendedorSelect.selectedIndex].textContent;
            }

            // Dados adicionais do pedido para o webhook
            const dadosPedido = {
                comissao_total: vendaData.comissao_total || 0,
                vendedor_nome: vendedorNome
            };

            window.webhookEstoque.notificarSaidaProdutos(vendaData.itens, dadosPedido);
        }

        alert('Venda criada com sucesso!');
        fecharModalVenda();
        carregarVendas();
    } catch (error) {
        console.error('Erro ao criar venda:', error);

        // Tratamento de erro mais detalhado
        let errorMessage = 'Erro ao criar venda: ';

        if (error.detail) {
            // Handle array of error details
            if (Array.isArray(error.detail)) {
                console.error('Array de erros:', error.detail);
                errorMessage += error.detail.join(', ');
            } else {
                errorMessage += error.detail;
            }
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }

        alert(errorMessage);
    }
}

async function atualizarVenda(id, vendaData) {
    try {
        // Obter o status anterior
        const statusAnterior = vendaAtual ? vendaAtual.status : null;
        let statusNovo = vendaData.status;

        // Normalizar status (remover espaços e converter para minúsculas)
        statusNovo = statusNovo ? String(statusNovo).trim().toLowerCase() : null;

        console.log('=== ATUALIZANDO VENDA ===');
        console.log('Status anterior (raw):', vendaAtual ? vendaAtual.status : null);
        console.log('Status anterior (normalizado):', statusAnterior ? String(statusAnterior).trim().toLowerCase() : null);
        console.log('Status novo (raw):', vendaData.status);
        console.log('Status novo (normalizado):', statusNovo);

        // Usa a API centralizada
        await apiPut(`/api/vendas/${id}`, vendaData);

        // Verificar se as flags de atualização de contas estão marcadas
        const atualizarAP = document.getElementById('atualizarContasAPagar').checked;
        const atualizarAR = document.getElementById('atualizarContasAReceber').checked;

        // Obter o código da venda (documento_referencia)
        const codigoVenda = vendaAtual ? vendaAtual.codigo : null;

        console.log('Atualizar AP:', atualizarAP, 'Atualizar AR:', atualizarAR);
        console.log('Código da venda:', codigoVenda);

        // Normalizar status anterior também
        const statusAnteriorNormalizado = statusAnterior ? String(statusAnterior).trim().toLowerCase() : null;

        // Se o status mudou para "finalizada" e as flags estão marcadas
        if (statusNovo === 'finalizada' && statusAnteriorNormalizado !== 'finalizada') {
            console.log('>>> Acionando atualização para FINALIZADA');
            if (atualizarAP) {
                console.log('Atualizando contas a pagar...');
                await atualizarContasAPagar(codigoVenda, 'pago');
            }
            if (atualizarAR) {
                console.log('Atualizando contas a receber...');
                await atualizarContasAReceber(codigoVenda, 'recebido');
            }
        } else {
            console.log('Condição de finalizada NÃO foi atendida');
            console.log('statusNovo === "finalizada"?', statusNovo === 'finalizada');
            console.log('statusAnteriorNormalizado !== "finalizada"?', statusAnteriorNormalizado !== 'finalizada');
        }

        // Se o status mudou para "cancelada" e as flags estão marcadas
        if (statusNovo === 'cancelada' && statusAnteriorNormalizado !== 'cancelada') {
            console.log('>>> Acionando atualização para CANCELADA');
            if (atualizarAP) {
                console.log('Atualizando contas a pagar...');
                await atualizarContasAPagar(codigoVenda, 'cancelado');
            }
            if (atualizarAR) {
                console.log('Atualizando contas a receber...');
                await atualizarContasAReceber(codigoVenda, 'cancelado');
            }
        } else {
            console.log('Condição de cancelada NÃO foi atendida');
            console.log('statusNovo === "cancelada"?', statusNovo === 'cancelada');
            console.log('statusAnteriorNormalizado !== "cancelada"?', statusAnteriorNormalizado !== 'cancelada');
        }

        alert('Venda atualizada com sucesso!');
        fecharModalVenda();
        carregarVendas();
    } catch (error) {
        console.error('Erro ao atualizar venda:', error);

        // Tratamento de erro mais detalhado
        let errorMessage = 'Erro ao atualizar venda: ';

        if (error.detail) {
            // Handle array of error details
            if (Array.isArray(error.detail)) {
                console.error('Array de erros:', error.detail);
                errorMessage += error.detail.join(', ');
            } else {
                errorMessage += error.detail;
            }
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }

        alert(errorMessage);
    }
}

// Funções para manipulação de itens da venda
function abrirModalItem() {
    editingItemIndex = null;
    document.getElementById('itemForm').reset();
    document.getElementById('subtotal').value = 'R$ 0,00';
    // Ajustar título e texto do botão para modo adicionar
    const itemModalTitle = document.querySelector('#itemModal .modal-header h2');
    if (itemModalTitle) itemModalTitle.textContent = 'Adicionar Item';
    const btnConfirm = document.getElementById('btnAdicionarItemConfirm');
    if (btnConfirm) btnConfirm.textContent = 'Adicionar';
    document.getElementById('itemModal').style.display = 'flex';
}

function fecharModalItem() {
    editingItemIndex = null;
    document.getElementById('itemModal').style.display = 'none';
}

function adicionarItemVenda() {
    // Validar formulário
    const form = document.getElementById('itemForm');
    if (!form.checkValidity()) {
        const invalidFields = form.querySelectorAll(':invalid');
        if (invalidFields.length > 0) {
            invalidFields[0].focus();
            invalidFields.forEach(field => {
                field.classList.add('is-invalid');
                field.addEventListener('input', function () {
                    this.classList.remove('is-invalid');
                }, { once: true });
            });
        }
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    // Coletar dados do item
    const produtoSelect = document.getElementById('produto_id');
    const produtoId = produtoSelect.value;
    const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
    const quantidade = parseFloat(document.getElementById('quantidade').value);
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value);
    const comissaoUnitaria = parseFloat(document.getElementById('comissao_item').value) || 0;
    const comissaoItem = comissaoUnitaria * quantidade; // Multiplicar comissão pela quantidade
    const precoCusto = parseFloat(produtoSelect.options[produtoSelect.selectedIndex].dataset.custo || 0);
    const precoOriginal = parseFloat(produtoSelect.options[produtoSelect.selectedIndex].dataset.preco || 0);
    const subtotal = quantidade * precoUnitario;

    // Adicionar item à lista
    const novoItem = {
        produto_id: parseInt(produtoId),
        produto_nome: produtoNome,
        quantidade: quantidade,
        preco_unitario: precoUnitario,
        comissao_item: comissaoItem,
        preco_custo: precoCusto,
        preco_original: precoOriginal,
        subtotal: subtotal
    };

    itensVenda.push(novoItem);

    // Atualizar a tabela de itens
    renderizarItensVenda();
    atualizarValorTotal();
    atualizarComissaoTotal();

    // Fechar modal
    fecharModalItem();
}

function renderizarItensVenda() {
    const tbody = document.getElementById('itensVendaTableBody');
    tbody.innerHTML = '';

    if (itensVenda.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum item adicionado</td></tr>';
        return;
    }

    itensVenda.forEach((item, index) => {
        const tr = document.createElement('tr');
        // Exibir ações quando estiver criando nova venda (vendaAtual == null) ou editando (editandoVenda == true).
        const mostrarAcoes = (vendaAtual === null) || editandoVenda;
        const acoesHTML = mostrarAcoes ? `
                <button class="btn-icon btn-edit-item" data-index="${index}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-remove-item" data-index="${index}" title="Remover">
                    <i class="fas fa-trash"></i>
                </button>
            ` : '';
        tr.innerHTML = `
            <td>${item.produto_nome}</td>
            <td>${item.quantidade}</td>
            <td>${formatarMoeda(item.preco_unitario)}</td>
            <td>${formatarMoeda(item.comissao_item || 0)}</td>
            <td>${formatarMoeda(item.subtotal)}</td>
            <td class="actions">${acoesHTML}</td>
        `;
        tbody.appendChild(tr);
    });

    // Adicionar event listeners para os botões de ação quando em modo edição
    if ((vendaAtual === null) || editandoVenda) {
        document.querySelectorAll('.btn-edit-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                editarItemVenda(parseInt(btn.dataset.index));
            });
        });
        document.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                removerItemVenda(parseInt(btn.dataset.index));
            });
        });
    }
}

function removerItemVenda(index) {
    itensVenda.splice(index, 1);
    renderizarItensVenda();
    atualizarValorTotal();
    atualizarComissaoTotal();
}

function atualizarValorTotal() {
    const valorTotal = itensVenda.reduce((total, item) => total + item.subtotal, 0);
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotal);
}

function atualizarComissaoTotal() {
    // Se estiver em modo de visualização (não editando), manter o valor do banco
    if (vendaAtual && !editandoVenda) {
        const comissaoTotalElement = document.getElementById('comissaoTotal');
        if (comissaoTotalElement) {
            comissaoTotalElement.textContent = formatarMoeda(vendaAtual.comissao_total || 0);
        }
        return;
    }

    // Caso contrário, calcular baseado nos itens (modo de edição/criação)
    const comissaoTotal = itensVenda.reduce((total, item) => total + (item.comissao_item || 0), 0);
    document.getElementById('comissaoTotal').textContent = formatarMoeda(comissaoTotal);
}

// Inicia edição de um item da venda
function editarItemVenda(index) {
    const item = itensVenda[index];
    if (!item) return;
    editingItemIndex = index;

    // Abrir modal e ajustar cabeçalho/botão
    const itemModal = document.getElementById('itemModal');
    const itemModalTitle = document.querySelector('#itemModal .modal-header h2');
    const btnConfirm = document.getElementById('btnAdicionarItemConfirm');
    if (itemModalTitle) itemModalTitle.textContent = 'Editar Item';
    if (btnConfirm) btnConfirm.textContent = 'Salvar';

    // Preencher campos
    const produtoSelect = document.getElementById('produto_id');
    const quantidadeInput = document.getElementById('quantidade');
    const precoUnitarioInput = document.getElementById('preco_unitario');
    const comissaoItemInput = document.getElementById('comissao_item');

    if (produtoSelect) {
        produtoSelect.value = item.produto_id;
        // NÃO disparar change aqui pois sobrescreve os valores que vamos definir abaixo
    }
    if (quantidadeInput) {
        quantidadeInput.value = item.quantidade;
        quantidadeInput.min = 1;
        quantidadeInput.max = item.quantidade; // Limitar a quantidade ao disponível (ex.: 2)
    }
    // Definir preço e comissão DEPOIS de selecionar o produto (sem disparar change)
    if (precoUnitarioInput) precoUnitarioInput.value = item.preco_unitario;
    // A comissão armazenada é o total (unitária * quantidade), então dividimos pela quantidade para exibir a unitária
    if (comissaoItemInput) {
        const comissaoUnitaria = item.quantidade > 0 ? (item.comissao_item || 0) / item.quantidade : 0;
        comissaoItemInput.value = comissaoUnitaria;
    }

    // Atualizar subtotal
    calcularSubtotal();

    // Exibir modal
    itemModal.style.display = 'flex';
}

// Decide entre adicionar novo item ou salvar edição
function salvarItemModal() {
    // Validar formulário
    const form = document.getElementById('itemForm');
    if (!form.checkValidity()) {
        const invalidFields = form.querySelectorAll(':invalid');
        if (invalidFields.length > 0) {
            invalidFields[0].focus();
            invalidFields.forEach(field => {
                field.classList.add('is-invalid');
                field.addEventListener('input', function () {
                    this.classList.remove('is-invalid');
                }, { once: true });
            });
        }
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    if (editingItemIndex !== null) {
        // Salvar alterações no item existente
        const produtoSelect = document.getElementById('produto_id');
        const produtoId = parseInt(produtoSelect.value);
        const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
        const quantidade = parseFloat(document.getElementById('quantidade').value);
        const precoUnitario = parseFloat(document.getElementById('preco_unitario').value);
        const comissaoUnitaria = parseFloat(document.getElementById('comissao_item').value) || 0;
        const comissaoItem = comissaoUnitaria * quantidade; // Multiplicar comissão pela quantidade
        const precoCusto = parseFloat(produtoSelect.options[produtoSelect.selectedIndex].dataset.custo || 0);
        const precoOriginal = parseFloat(produtoSelect.options[produtoSelect.selectedIndex].dataset.preco || 0);
        const subtotal = quantidade * precoUnitario;

        itensVenda[editingItemIndex] = {
            produto_id: produtoId,
            produto_nome: produtoNome,
            quantidade,
            preco_unitario: precoUnitario,
            comissao_item: comissaoItem,
            preco_custo: precoCusto,
            preco_original: precoOriginal,
            subtotal
        };

        // Atualizar UI e totais
        renderizarItensVenda();
        atualizarValorTotal();
        atualizarComissaoTotal();

        // Fechar modal e resetar estado
        fecharModalItem();
        editingItemIndex = null;
    } else {
        // Fluxo antigo: adicionar novo item
        adicionarItemVenda();
    }
}

function calcularSubtotal() {
    const quantidadeInput = document.getElementById('quantidade');
    const produtoSelect = document.getElementById('produto_id');
    const precoUnitarioInput = document.getElementById('preco_unitario');

    let quantidade = parseFloat(quantidadeInput.value) || 0;
    const precoUnitario = parseFloat(precoUnitarioInput.value) || 0;

    // Determinar limite máximo de quantidade
    let maxQuantidade;
    if (editingItemIndex !== null && itensVenda[editingItemIndex]) {
        // Ao editar um item, limitar à quantidade já presente no pedido
        maxQuantidade = itensVenda[editingItemIndex].quantidade;
    } else if (produtoSelect && produtoSelect.selectedIndex >= 0) {
        const option = produtoSelect.options[produtoSelect.selectedIndex];
        const estoqueDataset = option && option.dataset ? parseInt(option.dataset.estoque) : NaN;
        if (!isNaN(estoqueDataset)) {
            maxQuantidade = estoqueDataset; // Em nova venda, limitar ao estoque disponível do produto
        }
    }

    if (maxQuantidade !== undefined && !isNaN(maxQuantidade) && quantidade > maxQuantidade) {
        quantidade = maxQuantidade;
        quantidadeInput.value = String(maxQuantidade);
    }

    const subtotal = quantidade * precoUnitario;
    document.getElementById('subtotal').value = formatarMoeda(subtotal);
}

function atualizarPrecoUnitario() {
    const produtoSelect = document.getElementById('produto_id');
    const option = produtoSelect.options[produtoSelect.selectedIndex];

    if (option && option.dataset.preco) {
        document.getElementById('preco_unitario').value = option.dataset.preco;

        // Preencher automaticamente a comissão do produto
        const comissaoItem = document.getElementById('comissao_item');
        if (comissaoItem && option.dataset.comissao) {
            comissaoItem.value = option.dataset.comissao;
        }

        calcularSubtotal();
    } else {
        document.getElementById('preco_unitario').value = '';
        document.getElementById('subtotal').value = 'R$ 0,00';

        // Limpar também o campo de comissão
        const comissaoItem = document.getElementById('comissao_item');
        if (comissaoItem) {
            comissaoItem.value = '0';
        }
    }
}

// Funções para filtrar vendas
function filtrarVendas() {
    const clienteId = document.getElementById('filterCliente').value;
    const status = document.getElementById('filterStatus').value;

    let vendasFiltradas = [...vendas];

    if (clienteId) {
        vendasFiltradas = vendasFiltradas.filter(v => v.cliente_id == clienteId);
    }

    if (status) {
        vendasFiltradas = vendasFiltradas.filter(v => v.status === status);
    }

    renderizarVendas(vendasFiltradas);
}

// Funções utilitárias
function formatarData(dataString) {
    if (!dataString) return '';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function formatarMoeda(valor) {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function formatarStatus(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'finalizada': 'Finalizada',
        'cancelada': 'Cancelada',
        'devolvido': 'Devolvido'
    };
    return statusMap[status] || status;
}

// Funções para limpar formulários
function limparFormularioVenda() {
    const form = document.getElementById('vendaForm');
    if (form) {
        form.reset();
    }

    // Limpar variáveis globais
    itensVenda = [];
    vendaAtual = null;
    editandoVenda = false;

    // Limpar tabela de itens
    renderizarItensVenda();

    // Atualizar valor total
    atualizarValorTotal();

    // Resetar título do modal
    document.getElementById('modalTitle').textContent = 'Nova Venda';
}

function limparFormularioItem() {
    const form = document.getElementById('itemForm');
    if (form) {
        form.reset();
    }

    // Limpar campos específicos
    document.getElementById('subtotal').value = 'R$ 0,00';
    document.getElementById('quantidade').value = '1';
    document.getElementById('preco_unitario').value = '';
    document.getElementById('comissao_item').value = '0';
}

// Abre o modal para criar novo cliente
function openClienteModal() {
    document.getElementById('clienteForm').reset();
    // Marca o checkbox de ativo por padrão
    const ativoCheckbox = document.getElementById('cliente_ativo');
    if (ativoCheckbox) ativoCheckbox.checked = true;
    document.getElementById('clienteModal').classList.add('active');
}

// Fecha o modal de cliente
function closeClienteModal() {
    document.getElementById('clienteModal').classList.remove('active');
}

// Busca endereço pelo CEP usando a API ViaCEP
function buscarEnderecoPorCEPVendas(cep) {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
        return;
    }

    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
        .then(response => response.json())
        .then(data => {
            if (!data.erro) {
                const enderecoInput = document.getElementById('cliente_endereco');
                const cidadeInput = document.getElementById('cliente_cidade');
                const estadoInput = document.getElementById('cliente_estado');

                if (enderecoInput) enderecoInput.value = `${data.logradouro}, ${data.bairro}`;
                if (cidadeInput) cidadeInput.value = data.localidade;
                if (estadoInput) estadoInput.value = data.uf;
            }
        })
        .catch(error => console.error('Erro ao buscar CEP:', error));
}

// Salva um novo cliente
async function saveCliente() {
    const nomeInput = document.getElementById('cliente_nome');
    const nome = nomeInput.value;
    const tipo = document.getElementById('cliente_tipo')?.value || 'pessoa_fisica';
    const cpf_cnpj = document.getElementById('cliente_cpf').value;
    const email = document.getElementById('cliente_email').value;
    const telefone = document.getElementById('cliente_telefone').value;
    const cep = document.getElementById('cliente_cep')?.value || '';
    const endereco = document.getElementById('cliente_endereco').value;
    const cidade = document.getElementById('cliente_cidade')?.value || '';
    const estado = document.getElementById('cliente_estado')?.value || '';
    const ativo = document.getElementById('cliente_ativo')?.checked ?? true;

    // Validação visual
    if (!nome) {
        alert('Por favor, preencha o nome do cliente.');
        nomeInput.classList.add('is-invalid'); // Adiciona classe visual de erro
        nomeInput.focus(); // Foca no campo

        // Remove a classe de erro quando o usuário começar a digitar
        nomeInput.addEventListener('input', function () {
            this.classList.remove('is-invalid');
        }, { once: true });

        return;
    }

    // Verificar se já existe cliente com este nome
    // Normaliza para comparação (remove espaços extras e case insensitive)
    const nomeNormalizado = nome.trim().toLowerCase();
    const clienteExistente = todosClientesVendas.find(c => (c.nome || '').trim().toLowerCase() === nomeNormalizado);

    if (clienteExistente) {
        if (confirm(`Já existe um cliente com o nome "${clienteExistente.nome}". Deseja selecioná-lo?`)) {
            closeClienteModal();
            console.log('Selecionando cliente existente:', clienteExistente);

            const selectCliente = document.getElementById('cliente_id');
            if (selectCliente) {
                selectCliente.value = clienteExistente.id;
                // Dispara evento change se necessário
                const event = new Event('change');
                selectCliente.dispatchEvent(event);
            }
            return;
        }
        // Se o usuário cancelar, continua para criar um novo (pode ser homônimo)
    }

    // Ativar estado de loading no botão
    const btnSalvarCliente = document.getElementById('btnSalvarCliente');
    const originalText = btnSalvarCliente ? btnSalvarCliente.textContent : 'Salvar';
    if (btnSalvarCliente) {
        btnSalvarCliente.textContent = 'Aguarde...';
        btnSalvarCliente.disabled = true;
    }

    try {
        const clienteData = {
            nome: nome,
            tipo: tipo,
            cpf_cnpj: cpf_cnpj || null,
            email: email || null,
            telefone: telefone || null,
            cep: cep || null,
            endereco: endereco || null,
            cidade: cidade || null,
            estado: estado || null,
            ativo: ativo
        };

        console.log('Criando cliente:', clienteData);
        // Cria o cliente na tabela 'clientes' (e backend sincroniza com 'parceiros')
        // O retorno contém o ID da tabela 'clientes', que pode ser diferente do ID da tabela 'parceiros'
        const novoCliente = await apiPost('/api/clientes', clienteData);
        console.log('Cliente criado com sucesso (ID Cliente):', novoCliente);

        // Fecha o modal de cliente
        closeClienteModal();

        // IMPORTANTE: Precisamos recarregar a lista de clientes da API /api/parceiros 
        // para obter o ID correto do PARCEIRO, que é o que a venda espera.
        await carregarClientes();

        let parceiroEncontrado = null;

        // Tenta encontrar o parceiro recém-criado na lista atualizada
        // 1. Pelo CPF/CNPJ se existir
        if (novoCliente.cpf_cnpj) {
            parceiroEncontrado = todosClientesVendas.find(c => c.documento === novoCliente.cpf_cnpj);
        }

        // 2. Se não encontrou ou não tem documento, tenta pelo Nome + Email
        if (!parceiroEncontrado) {
            parceiroEncontrado = todosClientesVendas.find(c =>
                c.nome === novoCliente.nome &&
                (!novoCliente.email || c.email === novoCliente.email)
            );
        }

        // 3. Se ainda não encontrou, tenta pegar o último cadastro (maior ID)
        if (!parceiroEncontrado && todosClientesVendas.length > 0) {
            parceiroEncontrado = [...todosClientesVendas].sort((a, b) => b.id - a.id)[0];
        }

        if (parceiroEncontrado) {
            console.log('Parceiro correspondente encontrado:', parceiroEncontrado);

            // Seleciona o novo cliente no select
            const selectCliente = document.getElementById('cliente_id');
            if (selectCliente) {
                selectCliente.value = parceiroEncontrado.id;

                // Dispara evento change se necessário
                const event = new Event('change');
                selectCliente.dispatchEvent(event);
            }
        } else {
            console.warn('Não foi possível encontrar o parceiro correspondente ao cliente criado.');
        }

        // Exibe mensagem de sucesso
        alert('Cliente criado com sucesso!');
    } catch (error) {
        console.error('Erro ao criar cliente:', error);
        alert(`Erro ao criar cliente: ${error.message}`);
    } finally {
        // Restaurar estado do botão
        if (btnSalvarCliente) {
            btnSalvarCliente.textContent = originalText;
            btnSalvarCliente.disabled = false;
        }
    }
}

// Função para criar contas a receber
async function criarContasReceber(vendaId, vendaCodigo) {
    // Confirma com o usuário
    const confirmar = confirm(`Deseja criar o contas a receber para o pedido ${vendaCodigo}?`);
    if (!confirmar) {
        return;
    }

    try {
        // Busca os dados da venda
        const venda = await apiGet(`/api/vendas/${vendaId}`);

        if (!venda) {
            alert('Erro: Venda não encontrada');
            return;
        }

        // Cria o contas a receber
        const contaReceber = {
            cliente_id: venda.cliente_id,
            descricao: `Venda - Pedido ${venda.codigo}`,
            valor: venda.valor_total,
            data_vencimento: venda.data_entrega || new Date().toISOString().split('T')[0],
            pedido_venda_id: vendaId,
            documento_referencia: venda.codigo,
            observacoes: `Criado automaticamente a partir da venda ${venda.codigo}`
        };

        const response = await apiPost('/api/contas-receber', contaReceber);

        if (response) {
            alert('Contas a receber criado com sucesso!');
            // Recarrega a tabela de vendas
            carregarVendas();
        }
    } catch (error) {
        console.error('Erro ao criar contas a receber:', error);
        alert(`Erro ao criar contas a receber: ${error.message}`);
    }
}

// Função para criar contas a pagar
async function criarContasPagar(vendaId, vendaCodigo, vendedorId) {
    // Confirma com o usuário
    const confirmar = confirm(`Deseja criar o contas a pagar para o pedido ${vendaCodigo}?`);
    if (!confirmar) {
        return;
    }

    try {
        // Busca os dados da venda
        const venda = await apiGet(`/api/vendas/${vendaId}`);

        if (!venda) {
            alert('Erro: Venda não encontrada');
            return;
        }

        // Busca os dados do vendedor
        const vendedor = await apiGet(`/api/vendedores/${vendedorId}`);

        if (!vendedor) {
            alert('Erro: Vendedor não encontrado');
            return;
        }

        // Busca a condição de pagamento para calcular a data da última parcela
        let numero_parcelas = 1;
        let prazo_dias = 30;

        if (venda.condicao_pagamento_id) {
            try {
                const condicao = await apiGet(`/api/condicoes-pagamento/${venda.condicao_pagamento_id}`);
                if (condicao) {
                    numero_parcelas = condicao.numero_parcelas || 1;
                    prazo_dias = condicao.prazo_dias || 30;
                }
            } catch (error) {
                console.warn('Erro ao buscar condição de pagamento:', error);
            }
        }

        // Calcula a data da última parcela
        const dias_por_parcela = Math.floor(prazo_dias / numero_parcelas);
        const hoje = new Date();
        const data_ultima_parcela = new Date(hoje);
        data_ultima_parcela.setDate(data_ultima_parcela.getDate() + (dias_por_parcela * numero_parcelas));
        const data_vencimento_cp = data_ultima_parcela.toISOString().split('T')[0];

        // Cria o contas a pagar
        const contaPagar = {
            vendedor_id: vendedorId,
            descricao: `Comissão - Pedido ${venda.codigo}`,
            valor: venda.comissao_total || 0,
            data_vencimento: data_vencimento_cp,
            pedido_venda_id: vendaId,
            documento_referencia: venda.codigo,
            forma_pagamento: 'transferencia'
        };

        const response = await apiPost('/api/contas-pagar', contaPagar);

        if (response) {
            alert('Contas a pagar criado com sucesso!');
            // Recarrega a tabela de vendas
            carregarVendas();
        }
    } catch (error) {
        console.error('Erro ao criar contas a pagar:', error);
        alert(`Erro ao criar contas a pagar: ${error.message}`);
    }
}

// Função para atualizar contas a pagar
async function atualizarContasAPagar(codigoVenda, novoStatus) {
    try {
        console.log(`>>> INICIANDO atualizarContasAPagar - Status: ${novoStatus}, Código: ${codigoVenda}`);

        // Buscar todas as contas a pagar com o documento_referencia igual ao código da venda
        console.log('Buscando contas a pagar com documento_referencia:', codigoVenda);
        const contas = await apiGet('/api/contas-pagar', {
            documento_referencia: codigoVenda
        });

        console.log('Resposta da API:', contas);

        if (!contas || contas.length === 0) {
            console.log('❌ Nenhuma conta a pagar encontrada para este pedido');
            return;
        }

        console.log(`✓ Encontradas ${contas.length} contas a pagar para atualizar`);

        // Atualizar cada conta
        for (const conta of contas) {
            try {
                console.log(`Atualizando conta a pagar ${conta.id} (${conta.codigo})...`);
                const updateData = {
                    status: novoStatus
                };

                // Se o status for "pago", adicionar data de pagamento
                if (novoStatus === 'pago') {
                    updateData.data_pagamento = new Date().toISOString().split('T')[0];
                    console.log('Data de pagamento adicionada:', updateData.data_pagamento);
                }

                console.log('Enviando para API:', updateData);
                await apiPut(`/api/contas-pagar/${conta.id}`, updateData);
                console.log(`✓ Conta a pagar ${conta.codigo} atualizada para ${novoStatus}`);
            } catch (error) {
                console.error(`❌ Erro ao atualizar conta a pagar ${conta.id}:`, error);
            }
        }

        // Recarregar dados na página de contas a pagar se estiver aberta
        if (window.location.pathname.includes('contas_pagar.html')) {
            console.log('Recarregando dados de contas a pagar...');
            if (typeof carregarTodasAsContas === 'function') {
                await carregarTodasAsContas();
            }
        }
        console.log('>>> FIM atualizarContasAPagar');
    } catch (error) {
        console.error('❌ Erro ao buscar contas a pagar:', error);
    }
}

// Função para atualizar contas a receber
async function atualizarContasAReceber(codigoVenda, novoStatus) {
    try {
        console.log(`>>> INICIANDO atualizarContasAReceber - Status: ${novoStatus}, Código: ${codigoVenda}`);

        // Buscar todas as contas a receber com o documento_referencia igual ao código da venda
        console.log('Buscando contas a receber com documento_referencia:', codigoVenda);
        const contas = await apiGet('/api/contas-receber', {
            documento_referencia: codigoVenda
        });

        console.log('Resposta da API:', contas);

        if (!contas || contas.length === 0) {
            console.log('❌ Nenhuma conta a receber encontrada para este pedido');
            return;
        }

        console.log(`✓ Encontradas ${contas.length} contas a receber para atualizar`);

        // Atualizar cada conta
        for (const conta of contas) {
            try {
                console.log(`Atualizando conta a receber ${conta.id} (${conta.codigo})...`);
                const updateData = {
                    status: novoStatus
                };

                // Se o status for "recebido", adicionar data de recebimento
                if (novoStatus === 'recebido') {
                    updateData.data_recebimento = new Date().toISOString().split('T')[0];
                    console.log('Data de recebimento adicionada:', updateData.data_recebimento);
                }

                console.log('Enviando para API:', updateData);
                await apiPut(`/api/contas-receber/${conta.id}`, updateData);
                console.log(`✓ Conta a receber ${conta.codigo} atualizada para ${novoStatus}`);
            } catch (error) {
                console.error(`❌ Erro ao atualizar conta a receber ${conta.id}:`, error);
            }
        }

        // Recarregar dados na página de contas a receber se estiver aberta
        if (window.location.pathname.includes('contas_receber.html')) {
            console.log('Recarregando dados de contas a receber...');
            if (typeof carregarTodasAsContas === 'function') {
                await carregarTodasAsContas();
            }
        }
        console.log('>>> FIM atualizarContasAReceber');
    } catch (error) {
        console.error('❌ Erro ao buscar contas a receber:', error);
    }
}

// ==========================================
// FUNÇÕES DE DEVOLUÇÃO DE VENDA
// ==========================================

/**
 * Abre o modal de devolução com os dados da venda
 */
function abrirModalDevolucao(vendaId, codigo, cliente, valor, vendedor) {
    console.log('Abrindo modal de devolução para venda:', vendaId, codigo);

    // Preenche os dados no modal
    document.getElementById('devolucaoVendaId').value = vendaId;
    document.getElementById('devolucaoPedidoCodigo').textContent = codigo;
    document.getElementById('devolucaoCliente').textContent = cliente;
    document.getElementById('devolucaoValor').textContent = formatarMoeda(valor);
    document.getElementById('devolucaoVendedor').textContent = vendedor;

    // Limpa a justificativa
    document.getElementById('devolucaoJustificativa').value = '';

    // Exibe o modal
    const modal = document.getElementById('devolucaoModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

/**
 * Fecha o modal de devolução
 */
function fecharModalDevolucao() {
    const modal = document.getElementById('devolucaoModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    // Limpa o formulário
    document.getElementById('devolucaoForm').reset();
}

/**
 * Processa a devolução da venda
 */
async function processarDevolucao() {
    const vendaId = document.getElementById('devolucaoVendaId').value;
    const justificativa = document.getElementById('devolucaoJustificativa').value.trim();

    // Valida a justificativa
    if (!justificativa) {
        alert('Por favor, informe a justificativa da devolução.');
        return;
    }

    // Confirma a ação
    const confirmar = confirm('Tem certeza que deseja processar a devolução desta venda?\n\nEsta ação não pode ser desfeita.');
    if (!confirmar) {
        return;
    }

    // Desabilita o botão durante o processamento
    const btnConfirmar = document.getElementById('btnConfirmarDevolucao');
    const textoOriginal = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        console.log('Processando devolução da venda:', vendaId);

        // Chama a API de devolução
        const response = await apiPost(`/api/vendas/${vendaId}/devolucao`, {
            justificativa: justificativa
        });

        console.log('Resposta da devolução:', response);

        // Monta a mensagem de sucesso
        let mensagem = response.mensagem || 'Devolução processada com sucesso!';

        if (response.titulo_devolucao_codigo && response.titulo_devolucao_valor > 0) {
            mensagem += `\n\nTítulo de devolução de comissão gerado:\n`;
            mensagem += `Código: ${response.titulo_devolucao_codigo}\n`;
            mensagem += `Valor: ${formatarMoeda(response.titulo_devolucao_valor)}`;
        }

        alert(mensagem);

        // Fecha o modal
        fecharModalDevolucao();

        // Recarrega a lista de vendas
        aplicarFiltros();

    } catch (error) {
        console.error('Erro ao processar devolução:', error);

        let errorMessage = 'Erro ao processar devolução: ';
        if (error.detail) {
            errorMessage += error.detail;
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Verifique os dados e tente novamente.';
        }

        alert(errorMessage);
    } finally {
        // Reabilita o botão
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = textoOriginal;
    }
}

// Configura os botões do modal de devolução
document.addEventListener('DOMContentLoaded', function () {
    // Botão para cancelar devolução
    const btnCancelarDevolucao = document.getElementById('btnCancelarDevolucao');
    if (btnCancelarDevolucao) {
        btnCancelarDevolucao.addEventListener('click', fecharModalDevolucao);
    }

    // Botão para confirmar devolução
    const btnConfirmarDevolucao = document.getElementById('btnConfirmarDevolucao');
    if (btnConfirmarDevolucao) {
        btnConfirmarDevolucao.addEventListener('click', processarDevolucao);
    }

    // Fechar modal ao clicar no X
    const closeButtonsDevolucao = document.querySelectorAll('#devolucaoModal .close-modal');
    closeButtonsDevolucao.forEach(btn => {
        btn.addEventListener('click', fecharModalDevolucao);
    });

    // Fechar modal ao clicar fora
    const devolucaoModal = document.getElementById('devolucaoModal');
    if (devolucaoModal) {
        devolucaoModal.addEventListener('click', function (e) {
            if (e.target === devolucaoModal) {
                fecharModalDevolucao();
            }
        });
    }
});

// Configura os botões do modal de cliente
document.addEventListener('DOMContentLoaded', function () {
    // Botão para abrir modal de novo cliente
    const btnNovoCliente = document.getElementById('btnNovoClienteModal');
    if (btnNovoCliente) {
        btnNovoCliente.addEventListener('click', openClienteModal);
    }

    // Botão para cancelar
    const btnCancelarCliente = document.getElementById('btnCancelarCliente');
    if (btnCancelarCliente) {
        btnCancelarCliente.addEventListener('click', closeClienteModal);
    }

    // Botão para salvar
    const btnSalvarCliente = document.getElementById('btnSalvarCliente');
    if (btnSalvarCliente) {
        btnSalvarCliente.addEventListener('click', saveCliente);
    }

    // Fechar modal ao clicar no X
    const closeButtons = document.querySelectorAll('#clienteModal .close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', closeClienteModal);
    });

    // Evento para buscar endereço pelo CEP
    const cepElement = document.getElementById('cliente_cep');
    if (cepElement) {
        cepElement.addEventListener('blur', function () {
            buscarEnderecoPorCEPVendas(this.value);
        });
    }

    // Evento para formatar CPF/CNPJ conforme o tipo selecionado
    const tipoElement = document.getElementById('cliente_tipo');
    if (tipoElement) {
        tipoElement.addEventListener('change', function () {
            const cpfCnpjInput = document.getElementById('cliente_cpf');
            if (cpfCnpjInput) {
                cpfCnpjInput.placeholder = this.value === 'pessoa_fisica' ? 'CPF (apenas números)' : 'CNPJ (apenas números)';
            }
        });
    }
});

// ===== FUNÇÕES PARA PIX QR CODE DE COMISSÃO =====

// Abre o modal de PIX QR Code para comissão
async function abrirModalPixComissao(vendedorId, vendedorNome, comissao) {
    try {
        // Busca os dados completos do vendedor para obter a chave PIX
        const vendedor = await apiGet(`/api/vendedores/${vendedorId}`);

        if (!vendedor.pix) {
            alert(`O vendedor "${vendedorNome}" não possui chave PIX cadastrada.\n\nPor favor, cadastre a chave PIX na página de Vendedores.`);
            return;
        }

        // Preenche as informações do modal
        document.getElementById('pixVendedorNome').textContent = vendedorNome;
        document.getElementById('pixValorComissao').textContent = formatarMoeda(comissao);
        document.getElementById('pixChave').textContent = vendedor.pix;

        // Gera o QR Code
        gerarPixQRCode(vendedor.pix, comissao, vendedor.nome_destinatario || vendedorNome);

        // Exibe o modal
        const modal = document.getElementById('pixQrcodeModal');
        modal.classList.add('active');
        modal.style.display = 'flex';

    } catch (error) {
        console.error('Erro ao buscar dados do vendedor:', error);
        alert('Erro ao buscar dados do vendedor. Por favor, tente novamente.');
    }
}

// Gera o QR Code para pagamento PIX
function gerarPixQRCode(chavePix, valor, nomeDestinatario) {
    const qrcodeContainer = document.getElementById('pixQrcode');
    qrcodeContainer.innerHTML = ''; // Limpa QR code anterior

    // Gera o payload PIX no formato EMV
    const pixPayload = gerarPayloadPix(chavePix, valor, nomeDestinatario);

    console.log('PIX Payload gerado:', pixPayload);

    // Usa a biblioteca qrcode-generator
    const typeNumber = 0; // Auto-detect
    const errorCorrectionLevel = 'M';
    const qr = qrcode(typeNumber, errorCorrectionLevel);
    qr.addData(pixPayload);
    qr.make();

    // Gera a imagem do QR code
    const cellSize = 6;
    const margin = 2;
    qrcodeContainer.innerHTML = qr.createImgTag(cellSize, margin);

    // Adiciona estilo à imagem gerada
    const img = qrcodeContainer.querySelector('img');
    if (img) {
        img.style.display = 'block';
        img.style.margin = '0 auto';
    }
}

// Gera o payload PIX no formato EMV QRCPS-MPM (baseado em pix-qrcode-master)
function gerarPayloadPix(chavePix, valor, nomeDestinatario) {
    // Detecta o tipo de chave e obtém o tamanho do GUI
    const tipoChave = detectarTipoChave(chavePix);
    const guiSizes = {
        "mobile": "36",
        "cpf": "33",
        "cnpj": "36",
        "uuid": "58",
        "email": "46"
    };
    const guiSize = guiSizes[tipoChave] || "58"; // default para uuid

    // GUI fixo para PIX
    const gui = "BR.GOV.BCB.PIX";

    // Formata o valor
    const valorStr = valor.toFixed(2);

    // Limpa e formata o nome (sem acentos)
    const nomeFormatado = removerAcentos(nomeDestinatario).substring(0, 25);

    // Cidade
    const cidade = "SAO PAULO";

    // Reference label (txId)
    const referenceLabel = gerarTxId();

    // Funções auxiliares
    const leftZero = (text) => text.length.toString().padStart(2, '0');

    // Monta o payload seguindo o formato do pix-qrcode-master
    // Formato: 00020126{gui_total_size}0014{gui}01{key_len}{key}5204000053039865404{valor_len}{valor}5802{country}59{name_len}{name}60{city_len}{city}62{ref_total}05{ref_len}{ref}6304{crc}

    // Calcula o tamanho do merchant account info (ID 26)
    // Conteúdo: 0014BR.GOV.BCB.PIX01{key_len}{key}
    const merchantContent = `0014${gui}01${leftZero(chavePix)}${chavePix}`;
    const merchantSize = leftZero(merchantContent);

    // Calcula o tamanho do additional data (ID 62)
    // Conteúdo: 05{ref_len}{ref}
    const additionalContent = `05${leftZero(referenceLabel)}${referenceLabel}`;
    const additionalSize = leftZero(additionalContent);

    // Monta o payload completo (sem CRC)
    let payload = "";
    payload += "000201"; // Payload Format Indicator
    payload += `26${merchantSize}${merchantContent}`; // Merchant Account Info
    payload += "52040000"; // Merchant Category Code
    payload += "5303986"; // Transaction Currency (BRL)
    payload += `54${leftZero(valorStr)}${valorStr}`; // Transaction Amount
    payload += "5802BR"; // Country Code
    payload += `59${leftZero(nomeFormatado)}${nomeFormatado}`; // Merchant Name
    payload += `60${leftZero(cidade)}${cidade}`; // Merchant City
    payload += `62${additionalSize}${additionalContent}`; // Additional Data
    payload += "6304"; // CRC placeholder

    // Calcula e adiciona o CRC
    const crc = calcularCRC16(payload);
    payload += crc;

    console.log('PIX Payload:', payload);

    return payload;
}

// Detecta o tipo de chave PIX
function detectarTipoChave(chave) {
    // Remove caracteres especiais para análise
    const chaveClean = chave.replace(/[\s\-\.\(\)]/g, '');

    // UUID (chave aleatória): formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
        return 'uuid';
    }

    // Email: contém @
    if (chave.includes('@')) {
        return 'email';
    }

    // Telefone (mobile): começa com + ou tem 11 dígitos
    if (chave.startsWith('+') || /^\d{10,11}$/.test(chaveClean)) {
        return 'mobile';
    }

    // CPF: 11 dígitos numéricos
    if (/^\d{11}$/.test(chaveClean)) {
        return 'cpf';
    }

    // CNPJ: 14 dígitos numéricos
    if (/^\d{14}$/.test(chaveClean)) {
        return 'cnpj';
    }

    return 'uuid'; // default
}

// Remove acentos de uma string
function removerAcentos(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Gera um ID de transação único
function gerarTxId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let txId = '';
    for (let i = 0; i < 10; i++) {
        txId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return txId;
}

// Calcula o CRC16-CCITT-FALSE do payload PIX
function calcularCRC16(payload) {
    let crc = 0xFFFF;
    const polynomial = 0x1021;

    for (let i = 0; i < payload.length; i++) {
        crc ^= (payload.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc <<= 1;
            }
        }
    }

    crc &= 0xFFFF;
    return crc.toString(16).toUpperCase().padStart(4, '0');
}


// Fecha o modal de PIX QR Code
function fecharModalPixQrcode() {
    const modal = document.getElementById('pixQrcodeModal');
    modal.classList.remove('active');
    modal.style.display = 'none';
}

// Copia a chave PIX para a área de transferência
function copiarChavePix() {
    const chavePix = document.getElementById('pixChave').textContent;

    navigator.clipboard.writeText(chavePix).then(() => {
        // Feedback visual
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.background = '#27ae60';

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '#00b894';
        }, 2000);

    }).catch(err => {
        console.error('Erro ao copiar:', err);
        alert('Erro ao copiar a chave PIX. Por favor, copie manualmente.');
    });
}

// Fecha modal ao clicar fora
document.addEventListener('DOMContentLoaded', function () {
    const pixModal = document.getElementById('pixQrcodeModal');
    if (pixModal) {
        pixModal.addEventListener('click', function (e) {
            if (e.target === pixModal) {
                fecharModalPixQrcode();
            }
        });
    }
});
