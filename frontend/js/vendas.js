// Variáveis globais
// const API_URL = 'http://localhost:8000'; (duplicada, já definida em auth.js)
let vendas = [];
let itensVenda = [];
let vendaAtual = null;
let editandoVenda = false;

document.addEventListener('DOMContentLoaded', function() {
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
    
    console.log('Configurando botão Nova Venda');
    const btnNovaVenda = document.getElementById('btnNovaVenda');
    console.log('Botão Nova Venda encontrado:', btnNovaVenda);
    if (btnNovaVenda) {
        btnNovaVenda.addEventListener('click', function() {
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
    document.getElementById('btnAdicionarItemConfirm').addEventListener('click', adicionarItemVenda);
    
    // Configurar eventos de fechamento de modal
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // Configurar eventos para cálculo de subtotal
    document.getElementById('quantidade').addEventListener('input', calcularSubtotal);
    document.getElementById('preco_unitario').addEventListener('input', calcularSubtotal);
    document.getElementById('produto_id').addEventListener('change', atualizarPrecoUnitario);
    
    // Configurar filtros
    document.getElementById('filterCliente').addEventListener('change', filtrarVendas);
    document.getElementById('filterStatus').addEventListener('change', filtrarVendas);
});

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
    
    toggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });
}

// Funções para carregar dados
async function carregarVendas() {
    try {
        // Usa a API centralizada
        vendas = await apiGet('/api/vendas');
        // Configuração da paginação
        window.currentDisplayFunction = renderizarVendas;
        initPagination(vendas, renderizarVendas);
    } catch (error) {
        console.error('Erro ao carregar vendas:', error);
        // Exibir mensagem de erro
        document.getElementById('vendasTableBody').innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar vendas. Por favor, tente novamente.</td></tr>';
    }
}

async function carregarClientes() {
    try {
        // Usa a API centralizada
        const clientes = await apiGet('/api/parceiros', { tipo: 'cliente' });
        console.log('Clientes carregados da API:', clientes);
        preencherSelectClientes(clientes);
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

async function carregarProdutos() {
    try {
        // Usa a API centralizada
        const produtos = await apiGet('/api/produtos');
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
    } catch (error) {
        console.error('Erro ao carregar vendedores:', error);
    }
}

// Funções para renderizar dados
function renderizarVendas(vendas) {
    const tbody = document.getElementById('vendasTableBody');
    tbody.innerHTML = '';
    
    if (vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma venda encontrada</td></tr>';
        return;
    }
    
    vendas.forEach(venda => {
        // Formata status para exibição e para CSS
        const label = formatarStatus(venda.status);
        const statusKey = label.toLowerCase();
        const tr = document.createElement('tr');
        
        // Aplicar classe baseada no status
        tr.classList.add(`status-${statusKey}`);
        
        tr.innerHTML = `
            <td>${venda.id}</td>
            <td>${venda.cliente_nome}</td>
            <td>${formatarData(venda.data_pedido)}</td>
            <td>${formatarMoeda(venda.valor_total)}</td>
            <td><span class="status-badge ${statusKey}">${label}</span></td>
            <td>${venda.vendedor_nome ? venda.vendedor_nome : '-'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" data-id="${venda.id}" title="Visualizar">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" data-id="${venda.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" data-id="${venda.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
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
}

function preencherSelectClientes(clientes) {
    const selectCliente = document.getElementById('cliente_id');
    const filterCliente = document.getElementById('filterCliente');
    
    // Limpar opções existentes, mantendo a primeira
    selectCliente.innerHTML = '<option value="">Selecione...</option>';
    filterCliente.innerHTML = '<option value="">Todos</option>';
    
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
        const option = document.createElement('option');
        option.value = cliente.id;
        option.textContent = cliente.nome;
        option.dataset.nome = cliente.nome;
        selectCliente.appendChild(option);
        
        // Adicionar ao select de filtro
        const filterOption = document.createElement('option');
        filterOption.value = cliente.id;
        filterOption.textContent = cliente.nome;
        filterCliente.appendChild(filterOption);
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
            <input type="text" id="pesquisaCliente" class="form-control" placeholder="Digite para pesquisar...">
        `;
        
        // Inserir antes do select
        container.insertBefore(pesquisaDiv, selectCliente);
        
        // Adicionar evento de pesquisa
        document.getElementById('pesquisaCliente').addEventListener('input', function(e) {
            const termo = e.target.value.toLowerCase();
            const options = selectCliente.querySelectorAll('option');
            
            options.forEach(option => {
                if (option.value === '') return; // Pular a opção "Selecione..."
                
                const visivel = option.textContent.toLowerCase().includes(termo);
                option.style.display = visivel ? '' : 'none';
            });
        });
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
        document.getElementById('pesquisaProduto').addEventListener('input', function(e) {
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
    
    // Limpar opções existentes, mantendo a primeira
    selectVendedor.innerHTML = '<option value="">Selecione...</option>';
    
    // Não usar dados mockados, apenas usar os vendedores reais da API
    if (vendedores && vendedores.length > 0) {
        vendedores.forEach(vendedor => {
            const option = document.createElement('option');
            option.value = vendedor.id;
            option.textContent = vendedor.nome;
            selectVendedor.appendChild(option);
        });
    } else {
        console.log('Nenhum vendedor encontrado na API');
    }
}

// Funções para manipulação de vendas
function abrirModalNovaVenda() {
    console.log('Função abrirModalNovaVenda iniciada');
    editandoVenda = false;
    vendaAtual = null;
    itensVenda = [];
    
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
        itensVendaTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
    }
    
    const valorTotal = document.getElementById('valorTotal');
    if (!valorTotal) {
        console.error('Elemento valorTotal não encontrado');
    } else {
        valorTotal.textContent = 'R$ 0,00';
    }
    
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
        
        // Adicionar classe modal-open ao body para bloquear o scroll
        document.body.classList.add('modal-open');
    }
}

async function editarVenda(id) {
    editandoVenda = true;
    // Recarregar lista de clientes antes de preencher o select
    await carregarClientes();
    
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
    document.getElementById('cliente_id').value = vendaAtual.cliente_id || '';
    document.getElementById('data_entrega').value = vendaAtual.data_entrega || '';
    document.getElementById('forma_pagamento').value = vendaAtual.forma_pagamento || '';
    document.getElementById('status').value = vendaAtual.status || 'pendente';
    document.getElementById('observacoes').value = vendaAtual.observacoes || '';
    
    // Carregar itens da venda
    carregarItensVenda(id);
    
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
    
    const vendaData = {
        cliente_id: clienteId, // Usando o ID do cliente selecionado no formulário
        cliente_nome: clienteNome, // Adicionando o nome do cliente para garantir que seja salvo corretamente
        data_entrega: document.getElementById('data_entrega').value, // Usando o campo data_entrega do formulário
        forma_pagamento: document.getElementById('forma_pagamento').value, // Usando a forma de pagamento selecionada no formulário
        observacoes: document.getElementById('observacoes').value,
        valor_frete: 0, // Adicionando campos obrigatórios do modelo PedidoVendaBase
        valor_desconto: 0,
        custo_produto: custoTotal, // Adicionando o custo total dos produtos
        itens: itensVenda.map(item => ({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
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
    
    console.log('Dados da venda a serem enviados:', vendaData); // Log para debug
    
    if (editandoVenda && vendaAtual) {
        // Adicionar status apenas para atualizações
        vendaData.status = document.getElementById('status').value;
        console.log('Atualizando venda com status:', vendaData.status);
        await atualizarVenda(vendaAtual.id, vendaData);
    } else {
        await criarVenda(vendaData);
    }
}

async function criarVenda(vendaData) {
    try {
        // Adicionar logs para debug
        console.log('Dados da venda a serem enviados:', vendaData);
        
        // Usa a API centralizada
        await apiPost('/api/vendas', vendaData);
        
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
        // Usa a API centralizada
        await apiPut(`/api/vendas/${id}`, vendaData);
        
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
    document.getElementById('itemForm').reset();
    document.getElementById('subtotal').value = 'R$ 0,00';
    document.getElementById('itemModal').style.display = 'flex';
}

function fecharModalItem() {
    document.getElementById('itemModal').style.display = 'none';
}

function adicionarItemVenda() {
    // Validar formulário
    const form = document.getElementById('itemForm');
    if (!form.checkValidity()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    // Coletar dados do item
    const produtoSelect = document.getElementById('produto_id');
    const produtoId = produtoSelect.value;
    const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
    const quantidade = parseFloat(document.getElementById('quantidade').value);
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value);
    const precoCusto = parseFloat(produtoSelect.options[produtoSelect.selectedIndex].dataset.custo || 0);
    const subtotal = quantidade * precoUnitario;
    
    // Adicionar item à lista
    const novoItem = {
        produto_id: parseInt(produtoId),
        produto_nome: produtoNome,
        quantidade: quantidade,
        preco_unitario: precoUnitario,
        preco_custo: precoCusto,
        subtotal: subtotal
    };
    
    itensVenda.push(novoItem);
    
    // Atualizar a tabela de itens
    renderizarItensVenda();
    atualizarValorTotal();
    
    // Fechar modal
    fecharModalItem();
}

function renderizarItensVenda() {
    const tbody = document.getElementById('itensVendaTableBody');
    tbody.innerHTML = '';
    
    if (itensVenda.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item adicionado</td></tr>';
        return;
    }
    
    itensVenda.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.produto_nome}</td>
            <td>${item.quantidade}</td>
            <td>${formatarMoeda(item.preco_unitario)}</td>
            <td>${formatarMoeda(item.subtotal)}</td>
            <td>
                <button class="btn-icon btn-remove-item" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Adicionar event listeners para os botões de remoção
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.addEventListener('click', () => removerItemVenda(parseInt(btn.dataset.index)));
    });
}

function removerItemVenda(index) {
    itensVenda.splice(index, 1);
    renderizarItensVenda();
    atualizarValorTotal();
}

function atualizarValorTotal() {
    const valorTotal = itensVenda.reduce((total, item) => total + item.subtotal, 0);
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotal);
}

function calcularSubtotal() {
    const quantidade = parseFloat(document.getElementById('quantidade').value) || 0;
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value) || 0;
    const subtotal = quantidade * precoUnitario;
    
    document.getElementById('subtotal').value = formatarMoeda(subtotal);
}

function atualizarPrecoUnitario() {
    const produtoSelect = document.getElementById('produto_id');
    const option = produtoSelect.options[produtoSelect.selectedIndex];
    
    if (option && option.dataset.preco) {
        document.getElementById('preco_unitario').value = option.dataset.preco;
        calcularSubtotal();
    } else {
        document.getElementById('preco_unitario').value = '';
        document.getElementById('subtotal').value = 'R$ 0,00';
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
        'cancelada': 'Cancelada'
    };
    
    return statusMap[status] || status;
}
