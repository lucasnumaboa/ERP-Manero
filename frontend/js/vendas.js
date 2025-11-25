// Variáveis globais
// const API_URL = 'http://localhost:8000'; (duplicada, já definida em auth.js)
let vendas = [];
let itensVenda = [];
let vendaAtual = null;
let editandoVenda = false;
let editingItemIndex = null; // Índice do item sendo editado no modal

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
    carregarCondicoesPagamento();
    
    // Define datas padrão dos filtros (primeiro dia do mês até hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataInicial').valueAsDate = primeiroDiaDoMes;
    document.getElementById('filtroDataFinal').valueAsDate = hoje;
    
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
    // O botão de confirmação do item agora decide entre adicionar ou salvar edição
    document.getElementById('btnAdicionarItemConfirm').addEventListener('click', salvarItemModal);
    
    // Configurar eventos de fechamento de modal
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function(e) {
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
    
    // Configurar fechamento ao clicar fora do modal
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
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
    
    // Configurar eventos para cálculo de subtotal
    document.getElementById('quantidade').addEventListener('input', calcularSubtotal);
    document.getElementById('preco_unitario').addEventListener('input', calcularSubtotal);
    document.getElementById('produto_id').addEventListener('change', atualizarPrecoUnitario);
    
    // Configurar filtros
    document.getElementById('btnAplicarFiltros').addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltros);
    document.getElementById('btnExportarDados').addEventListener('click', exportarDadosCSV);
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
        // Verifica permissão de visualização de vendas
        const canView = await hasPermission('vendas_visualizar');
        if (!canView) {
            console.warn('Usuário sem permissão para visualizar vendas');
            const tbody = document.getElementById('vendasTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="12" class="text-center">Você não tem acesso para visualizar vendas.</td></tr>';
            }
            return;
        }

        // Não carrega vendas automaticamente - aguarda aplicação de filtros
        const tbody = document.getElementById('vendasTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center">Use os filtros acima para visualizar as vendas</td></tr>';
        }
        
        console.log('Página de vendas carregada - aguardando aplicação de filtros');
    } catch (error) {
        console.error('Erro ao carregar vendas:', error);
        // Exibir mensagem de erro
        document.getElementById('vendasTableBody').innerHTML = '<tr><td colspan="12" class="text-center">Erro ao carregar vendas. Por favor, tente novamente.</td></tr>';
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
        
        // Verifica permissão de visualização de vendas
        const canView = await hasPermission('vendas_visualizar');
        if (!canView) {
            alert('Você não tem permissão para visualizar vendas');
            return;
        }

        // Obtém dados do usuário atual
        const userData = await getCurrentUser();
        const isAdmin = userData && userData.nivel_acesso === 'admin';

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

        // Obtém valores dos filtros
        const filtroIdPedido = document.getElementById('filtroIdPedido').value.toLowerCase().trim();
        const filtroCliente = document.getElementById('filtroCliente').value.toLowerCase().trim();
        const filtroVendedor = document.getElementById('filtroVendedor').value;
        const filtroCondicaoPagamento = document.getElementById('filtroCondicaoPagamento').value;
        const filtroDataInicial = document.getElementById('filtroDataInicial').value;
        const filtroDataFinal = document.getElementById('filtroDataFinal').value;
        const filtroPendenteCR = document.getElementById('filtroPendenteCR').checked;
        const filtroPendenteAP = document.getElementById('filtroPendenteAP').checked;
        
        console.log('Valores dos filtros:');
        console.log('  ID Pedido:', filtroIdPedido);
        console.log('  Cliente:', filtroCliente);
        console.log('  Vendedor:', filtroVendedor, '(tipo:', typeof filtroVendedor, ')');
        console.log('  Condição Pagamento:', filtroCondicaoPagamento);
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

            // Filtro Vendedor - Converter para número para comparação correta
            if (filtroVendedor) {
                const vendedorVenda = parseInt(venda.vendedor_id);
                const vendedorFiltro = parseInt(filtroVendedor);
                console.log(`Venda ${venda.codigo}: vendedor_id=${vendedorVenda}, filtro=${vendedorFiltro}, match=${vendedorVenda === vendedorFiltro}`);
                if (vendedorVenda !== vendedorFiltro) {
                    console.log(`Venda ${venda.codigo} excluída: Vendedor não corresponde`);
                    return false;
                }
            }

            // Filtro Condição de Pagamento - Converter para número para comparação correta
            if (filtroCondicaoPagamento && parseInt(venda.condicao_pagamento_id) !== parseInt(filtroCondicaoPagamento)) {
                console.log(`Venda ${venda.codigo} excluída: Condição de Pagamento não corresponde`);
                return false;
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
        for (const venda of vendasFiltradas) {
            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                venda.produtos = vendaDetalhada.itens || [];
            } catch (error) {
                console.warn(`Erro ao buscar itens da venda ${venda.id}:`, error);
                venda.produtos = [];
            }
        }

        // Configuração da paginação
        window.currentDisplayFunction = renderizarVendas;
        initPagination(vendasFiltradas, renderizarVendas);
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
        alert('Erro ao aplicar filtros. Por favor, tente novamente.');
    }
}

// Função para limpar filtros
function limparFiltros() {
    document.getElementById('filtroIdPedido').value = '';
    document.getElementById('filtroCliente').value = '';
    document.getElementById('filtroVendedor').value = '';
    document.getElementById('filtroCondicaoPagamento').value = '';
    document.getElementById('filtroDataInicial').value = '';
    document.getElementById('filtroDataFinal').value = '';
    document.getElementById('filtroPendenteCR').checked = false;
    document.getElementById('filtroPendenteAP').checked = false;
    
    // Limpa a tabela
    const tbody = document.getElementById('vendasTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">Use os filtros acima para visualizar as vendas</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Nenhuma venda encontrada</td></tr>';
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
        
        tr.innerHTML = `
            <td>${venda.id}</td>
            <td>${venda.cliente_nome}</td>
            <td>${formatarData(venda.data_pedido)}</td>
            <td>${formatarMoeda(venda.valor_total)}</td>
            ${produtosHTML}
            <td><span class="status-badge ${statusKey}">${label}</span></td>
            <td>${venda.vendedor_nome ? venda.vendedor_nome : '-'}</td>
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
    
    // Adicionar event listeners para os produtos
    document.querySelectorAll('.produtos-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const lista = btn.nextElementSibling;
            if (lista && lista.classList.contains('produtos-list')) {
                lista.classList.toggle('show');
            }
        });
    });
    
    // Fechar lista de produtos ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.produtos-cell')) {
            document.querySelectorAll('.produtos-list.show').forEach(lista => {
                lista.classList.remove('show');
            });
        }
    });
    
    // Adicionar event listeners para os botões de criar CR
    document.querySelectorAll('.btn-criar-cr').forEach(btn => {
        btn.addEventListener('click', () => criarContasReceber(parseInt(btn.dataset.vendaId), btn.dataset.vendaCodigo));
    });
    
    // Adicionar event listeners para os botões de criar CP
    document.querySelectorAll('.btn-criar-cp').forEach(btn => {
        btn.addEventListener('click', () => criarContasPagar(parseInt(btn.dataset.vendaId), btn.dataset.vendaCodigo, parseInt(btn.dataset.vendedorId)));
    });
}

// Função para criar a célula de produtos
function criarProdutosCell(itens, vendaId) {
    if (!itens || itens.length === 0) {
        return '<td class="produtos-cell">-</td>';
    }
    
    const quantidade = itens.length;
    const produtosListHTML = itens.map(item => `
        <div class="produto-item">
            <div class="produto-nome">${item.produto_nome || 'Produto desconhecido'}</div>
            <div class="produto-detalhes">
                Qtd: ${item.quantidade} | Preço: ${formatarMoeda(item.preco_unitario)}
            </div>
        </div>
    `).join('');
    
    return `
        <td class="produtos-cell">
            <div class="produtos-preview">
                <i class="fas fa-box"></i>
                <span class="produtos-badge">${quantidade} ${quantidade === 1 ? 'produto' : 'produtos'}</span>
            </div>
            <div class="produtos-list">
                ${produtosListHTML}
            </div>
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
    document.getElementById('cliente_id').value = vendaAtual.cliente_id || '';
    document.getElementById('vendedor_id').value = vendaAtual.vendedor_id || '';
    document.getElementById('condicao_pagamento_id').value = vendaAtual.condicao_pagamento_id || '';
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

    const vendaData = {
        cliente_id: clienteId, // Usando o ID do cliente selecionado no formulário
        cliente_nome: clienteNome, // Adicionando o nome do cliente para garantir que seja salvo corretamente
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
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    // Coletar dados do item
    const produtoSelect = document.getElementById('produto_id');
    const produtoId = produtoSelect.value;
    const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
    const quantidade = parseFloat(document.getElementById('quantidade').value);
    const precoUnitario = parseFloat(document.getElementById('preco_unitario').value);
    const comissaoItem = parseFloat(document.getElementById('comissao_item').value) || 0;
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
            btn.addEventListener('click', () => editarItemVenda(parseInt(btn.dataset.index)));
        });
        document.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', () => removerItemVenda(parseInt(btn.dataset.index)));
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
        // Disparar change para atualizar preço e comissão conforme dataset
        const event = new Event('change');
        produtoSelect.dispatchEvent(event);
    }
    if (quantidadeInput) {
        quantidadeInput.value = item.quantidade;
        quantidadeInput.min = 1;
        quantidadeInput.max = item.quantidade; // Limitar a quantidade ao disponível (ex.: 2)
    }
    if (precoUnitarioInput) precoUnitarioInput.value = item.preco_unitario;
    if (comissaoItemInput) comissaoItemInput.value = item.comissao_item || 0;
    
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
        const comissaoItem = parseFloat(document.getElementById('comissao_item').value) || 0;
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
        'cancelada': 'Cancelada'
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
    document.getElementById('clienteModal').classList.add('active');
}

// Fecha o modal de cliente
function closeClienteModal() {
    document.getElementById('clienteModal').classList.remove('active');
}

// Salva um novo cliente
async function saveCliente() {
    const nome = document.getElementById('cliente_nome').value;
    const cpf_cnpj = document.getElementById('cliente_cpf').value;
    const email = document.getElementById('cliente_email').value;
    const telefone = document.getElementById('cliente_telefone').value;
    const endereco = document.getElementById('cliente_endereco').value;
    
    if (!nome) {
        alert('Por favor, preencha o nome do cliente.');
        return;
    }
    
    try {
        const clienteData = {
            nome: nome,
            tipo: 'pessoa_fisica',
            cpf_cnpj: cpf_cnpj || null,
            email: email || null,
            telefone: telefone || null,
            endereco: endereco || null
        };
        
        console.log('Criando cliente:', clienteData);
        const data = await apiPost('/api/clientes', clienteData);
        console.log('Cliente criado com sucesso:', data);
        
        // Fecha o modal de cliente
        closeClienteModal();
        
        // Recarrega a lista de clientes
        await carregarClientes();
        
        // Seleciona o novo cliente
        document.getElementById('cliente_id').value = data.id;
        
        // Exibe mensagem de sucesso
        alert('Cliente criado com sucesso!');
    } catch (error) {
        console.error('Erro ao criar cliente:', error);
        alert(`Erro ao criar cliente: ${error.message}`);
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

// Configura os botões do modal de cliente
document.addEventListener('DOMContentLoaded', function() {
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
});
