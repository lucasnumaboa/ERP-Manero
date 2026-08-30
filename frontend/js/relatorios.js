// Variável global para armazenar dados do relatório
let dadosRelatorioAtual = null;
let dadosEstoqueAtual = null;

// Inicialização
document.addEventListener('DOMContentLoaded', async function () {
    // Verifica permissões
    const hasAccess = await hasPermission('dashboard_visualizar');

    if (!hasAccess) {
        document.querySelector('.app-container').style.display = 'none';
        document.getElementById('permission-loading').innerHTML = `
            <i class="fas fa-lock"></i>
            <p>Você não tem permissão para acessar esta página</p>
        `;
        return;
    }

    // Mostra o conteúdo
    document.querySelector('.app-container').style.display = 'flex';
    document.getElementById('permission-loading').style.display = 'none';

    // Define datas padrão (primeiro dia do mês atual até hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    document.getElementById('dataInicio').valueAsDate = primeiroDiaDoMes;
    document.getElementById('dataFim').valueAsDate = hoje;

    // Carrega plataformas de venda com base no período
    await carregarPlataformasComVendas();

    // Adiciona listeners para atualizar plataformas quando as datas mudarem
    document.getElementById('dataInicio').addEventListener('change', carregarPlataformasComVendas);
    document.getElementById('dataFim').addEventListener('change', carregarPlataformasComVendas);
});

// Carrega apenas plataformas que têm vendas no período selecionado
async function carregarPlataformasComVendas() {
    try {
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;

        // Busca vendas do período para identificar plataformas com vendas
        let url = '/api/vendas/';
        const params = [];
        if (dataInicio) params.push(`data_inicio=${dataInicio}`);
        if (dataFim) params.push(`data_fim=${dataFim}`);
        if (params.length > 0) url += '?' + params.join('&');

        const vendas = await apiGet(url);

        // Extrai plataformas e vendedores únicos das vendas
        const plataformasComVendas = {};
        const vendedoresComVendas = {};
        if (vendas && vendas.length > 0) {
            vendas.forEach(venda => {
                if (venda.plataforma_id && venda.plataforma_nome) {
                    plataformasComVendas[venda.plataforma_id] = venda.plataforma_nome;
                }
                if (venda.vendedor_id && venda.vendedor_nome) {
                    vendedoresComVendas[venda.vendedor_id] = venda.vendedor_nome;
                }
            });
        }

        // Atualiza os selects de plataforma
        const selectFiltro = document.getElementById('plataformaFiltro');
        const selectRegiaoFiltro = document.getElementById('plataformaRegiaoFiltro');
        const selectVendedor = document.getElementById('vendedorFiltro');

        // Guarda valores selecionados
        const valorSelecionado = selectFiltro.value;
        const valorSelecionadoRegiao = selectRegiaoFiltro.value;
        const valorSelecionadoVendedor = selectVendedor ? selectVendedor.value : '';

        // Limpa opções existentes
        selectFiltro.innerHTML = '<option value="">Todas as Plataformas</option>';
        selectRegiaoFiltro.innerHTML = '<option value="">Todas as Plataformas</option>';
        if (selectVendedor) {
            selectVendedor.innerHTML = '<option value="">Todos os Vendedores</option>';
        }

        // Adiciona plataformas com vendas
        Object.entries(plataformasComVendas).forEach(([id, nome]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = nome;
            selectFiltro.appendChild(option);

            const optionRegiao = document.createElement('option');
            optionRegiao.value = id;
            optionRegiao.textContent = nome;
            selectRegiaoFiltro.appendChild(optionRegiao);
        });

        // Adiciona vendedores com vendas
        if (selectVendedor) {
            Object.entries(vendedoresComVendas).forEach(([id, nome]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = nome;
                selectVendedor.appendChild(option);
            });
        }

        // Restaura valores selecionados se ainda existirem
        if (plataformasComVendas[valorSelecionado]) {
            selectFiltro.value = valorSelecionado;
        }
        if (plataformasComVendas[valorSelecionadoRegiao]) {
            selectRegiaoFiltro.value = valorSelecionadoRegiao;
        }
        if (selectVendedor && vendedoresComVendas[valorSelecionadoVendedor]) {
            selectVendedor.value = valorSelecionadoVendedor;
        }

    } catch (error) {
        console.error('Erro ao carregar plataformas com vendas:', error);
    }
}

// Formata valor em moeda brasileira
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

// Formata número com separadores
function formatarNumero(numero) {
    return new Intl.NumberFormat('pt-BR').format(numero);
}

// Gera o relatório
async function gerarRelatorio() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const plataformaId = document.getElementById('plataformaFiltro').value;
    const vendedorId = document.getElementById('vendedorFiltro').value;

    if (!dataInicio || !dataFim) {
        alert('Por favor, selecione as datas inicial e final');
        return;
    }

    if (dataInicio > dataFim) {
        alert('A data inicial não pode ser maior que a data final');
        return;
    }

    // Mostra loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('relatorioEstoqueConteudo').style.display = 'none';
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'none';
    document.getElementById('relatorioProdutosConteudo').style.display = 'none';
    document.getElementById('mensagemInicial').style.display = 'none';

    try {
        // Busca dados da API
        let url = `/api/relatorios/completo?data_inicio=${dataInicio}&data_fim=${dataFim}`;
        if (plataformaId) {
            url += `&plataforma_id=${plataformaId}`;
        }
        if (vendedorId) {
            url += `&vendedor_id=${vendedorId}`;
        }
        const response = await apiGet(url);

        if (!response) {
            throw new Error('Erro ao buscar dados do relatório');
        }

        // Armazena dados globalmente
        dadosRelatorioAtual = response;

        // Renderiza o relatório
        renderizarRelatorio(response);

        // Mostra conteúdo
        document.getElementById('loading').style.display = 'none';
        document.getElementById('relatorioConteudo').style.display = 'block';
        document.getElementById('mensagemInicial').style.display = 'none';

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        document.getElementById('loading').style.display = 'none';
        alert('Erro ao gerar relatório: ' + error.message);
    }
}

// Renderiza o relatório
function renderizarRelatorio(dados) {
    // Resumo
    document.getElementById('totalVendas').textContent = dados.resumo.total_pedidos_venda;
    document.getElementById('faturamento').textContent = formatarMoeda(dados.resumo.faturamento_total);

    // Lucro: exibe o lucro ajustado pelos lançamentos de controle
    const lucroAjustado = dados.resumo.lucro_total_ajustado !== undefined
        ? dados.resumo.lucro_total_ajustado
        : dados.resumo.lucro_total;
    const ajuste = dados.resumo.ajuste_controle || 0;

    document.getElementById('lucroTotal').textContent = formatarMoeda(lucroAjustado);
    document.getElementById('lucroTotal').style.color = lucroAjustado >= 0 ? '#27ae60' : '#e74c3c';

    // Card de ajuste de controle (se existir)
    const cardAjuste = document.getElementById('ajusteControle');
    const cardLucroOriginal = document.getElementById('lucroOriginal');
    if (cardAjuste) {
        cardAjuste.textContent = (ajuste >= 0 ? '+' : '') + formatarMoeda(ajuste);
        cardAjuste.style.color = ajuste >= 0 ? '#27ae60' : '#e74c3c';
    }
    if (cardLucroOriginal) {
        cardLucroOriginal.textContent = formatarMoeda(dados.resumo.lucro_total);
    }

    document.getElementById('margemLucro').textContent = dados.resumo.margem_lucro.toFixed(2) + '%';
    document.getElementById('totalCompras').textContent = dados.resumo.total_pedidos_compra;
    document.getElementById('valorCompras').textContent = formatarMoeda(dados.resumo.valor_total_compras);

    // Produtos Vendidos
    renderizarProdutosVendidos(dados.produtos_vendidos);

    // Comissões
    renderizarComissoes(dados.comissoes_vendedores);

    // Produtos Comprados
    renderizarProdutosComprados(dados.produtos_comprados);

    // Quadro de Lançamentos de Controle
    renderizarControle(dados.lancamentos_controle || [], dados.resumo.ajuste_controle || 0);
}

// Renderiza o quadro de ajustes de controle financeiro
function renderizarControle(lancamentos, ajusteTotal) {
    const container = document.getElementById('controleRelatorioContainer');
    if (!container) return;

    if (!lancamentos || lancamentos.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const tbody = document.getElementById('bodyControleRelatorio');
    if (tbody) {
        tbody.innerHTML = lancamentos.map(l => {
            const sinal = l.tipo === 'lucro' ? '+' : '-';
            const cor = l.tipo === 'lucro' ? '#27ae60' : '#e74c3c';
            const badgeCls = l.tipo === 'lucro' ? 'badge-success' : 'badge-danger';
            const d = l.data ? l.data.split('T')[0].split('-') : ['--', '--', '--'];
            const dataFmt = d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : l.data;
            return `
                <tr>
                    <td>${dataFmt}</td>
                    <td><span class="badge ${badgeCls}" style="font-size:11px;">${l.tipo === 'lucro' ? 'Lucro' : 'Desconto'}</span></td>
                    <td>${l.categoria_nome || '<span style="color:#8892b0">—</span>'}</td>
                    <td>${l.descricao}</td>
                    <td style="text-align:right;font-weight:700;color:${cor};">${sinal} ${formatarMoeda(l.valor)}</td>
                </tr>
            `;
        }).join('');
    }

    const totalEl = document.getElementById('controleRelatorioTotal');
    if (totalEl) {
        const cor = ajusteTotal >= 0 ? '#27ae60' : '#e74c3c';
        const sinal = ajusteTotal >= 0 ? '+' : '';
        totalEl.innerHTML = `Ajuste total: <strong style="color:${cor};">${sinal}${formatarMoeda(ajusteTotal)}</strong>`;
    }
}

// Renderiza tabela de produtos vendidos (agrupados por categoria)
function renderizarProdutosVendidos(produtos) {
    const tbody = document.getElementById('bodyProdutosVendidos');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto vendido no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Agrupa produtos por categoria
    const grupos = {};
    produtos.forEach(produto => {
        const catId = produto.categoria_id || 0;
        const catNome = produto.categoria_nome || 'Sem Categoria';

        if (!grupos[catId]) {
            grupos[catId] = {
                id: catId,
                nome: catNome,
                produtos: [],
                totais: {
                    quantidade: 0,
                    valor_venda_total: 0,
                    custo_total: 0,
                    comissao_proporcional: 0,
                    lucro_total: 0
                }
            };
        }

        grupos[catId].produtos.push(produto);
        grupos[catId].totais.quantidade += produto.quantidade;
        grupos[catId].totais.valor_venda_total += produto.valor_venda_total;
        grupos[catId].totais.custo_total += produto.custo_total;
        grupos[catId].totais.comissao_proporcional += produto.comissao_proporcional || 0;
        grupos[catId].totais.lucro_total += produto.lucro_total;
    });

    // Ordena categorias por nome
    const categorias = Object.values(grupos).sort((a, b) => a.nome.localeCompare(b.nome));

    let html = '';
    categorias.forEach(cat => {
        const margem = cat.totais.valor_venda_total > 0
            ? (cat.totais.lucro_total / cat.totais.valor_venda_total * 100)
            : 0;

        // Linha da categoria (clicável)
        html += `
            <tr class="categoria-row" style="background: rgba(52, 152, 219, 0.15); cursor: pointer;" onclick="toggleCategoriaVendidos(${cat.id})">
                <td colspan="3" style="font-weight: 700; color: var(--accent-primary, #64ffda);">
                    <i id="icon-vendidos-${cat.id}" class="fas fa-chevron-right" style="margin-right: 8px; font-size: 12px;"></i>
                    ${cat.nome} (${cat.produtos.length} produtos)
                </td>
                <td style="text-align: right; font-weight: 600;">${formatarNumero(cat.totais.quantidade)}</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; font-weight: 600;">${formatarMoeda(cat.totais.valor_venda_total)}</td>
                <td style="text-align: right; font-weight: 600;">${formatarMoeda(cat.totais.custo_total)}</td>
                <td style="text-align: right; color: #f39c12; font-weight: 600;">${formatarMoeda(cat.totais.comissao_proporcional)}</td>
                <td style="text-align: right; color: ${cat.totais.lucro_total >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 600;">
                    ${formatarMoeda(cat.totais.lucro_total)}
                </td>
                <td style="text-align: right; font-weight: 600;">${margem.toFixed(2)}%</td>
            </tr>
        `;

        // Linhas dos produtos (ocultas inicialmente)
        cat.produtos.forEach(produto => {
            html += `
                <tr class="produto-row-vendidos-${cat.id}" style="display: none; background: rgba(10, 25, 47, 0.5);">
                    <td style="padding-left: 30px;">${produto.codigo}</td>
                    <td style="font-style: italic;">${produto.nome}</td>
                    <td>${produto.plataforma_nome || 'N/A'}</td>
                    <td style="text-align: right;">${formatarNumero(produto.quantidade)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.preco_custo)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.preco_venda)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.valor_venda_total)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.custo_total)}</td>
                    <td style="text-align: right; color: #f39c12;">
                        ${formatarMoeda(produto.comissao_proporcional || 0)}
                    </td>
                    <td style="text-align: right; color: ${produto.lucro_total >= 0 ? '#27ae60' : '#e74c3c'};">
                        ${formatarMoeda(produto.lucro_total)}
                    </td>
                    <td style="text-align: right;">${produto.margem_lucro.toFixed(2)}%</td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

// Toggle expansão de categoria - Produtos Vendidos
function toggleCategoriaVendidos(categoriaId) {
    const rows = document.querySelectorAll(`.produto-row-vendidos-${categoriaId}`);
    const icon = document.getElementById(`icon-vendidos-${categoriaId}`);

    rows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });

    if (icon) {
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }
}

// Renderiza tabela de comissões (com total geral)
function renderizarComissoes(comissoes) {
    const tbody = document.getElementById('bodyComissoes');

    if (!comissoes || comissoes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhuma comissão no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Calcula totais gerais
    let totalVendas = 0;
    let totalValorVendas = 0;
    let totalComissao = 0;

    comissoes.forEach(comissao => {
        totalVendas += comissao.total_vendas;
        totalValorVendas += comissao.valor_total_vendas;
        totalComissao += comissao.comissao_total;
    });

    let html = comissoes.map(comissao => `
        <tr>
            <td>${comissao.vendedor}</td>
            <td style="text-align: right;">${formatarNumero(comissao.total_vendas)}</td>
            <td style="text-align: right;">${formatarMoeda(comissao.valor_total_vendas)}</td>
            <td style="text-align: right; font-weight: 600; color: #27ae60;">
                ${formatarMoeda(comissao.comissao_total)}
            </td>
        </tr>
    `).join('');

    // Adiciona linha de total geral
    html += `
        <tr style="background: rgba(100, 255, 218, 0.1); font-weight: 700;">
            <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">TOTAL GERAL</td>
            <td style="text-align: right; color: var(--accent-primary, #64ffda);">${formatarNumero(totalVendas)}</td>
            <td style="text-align: right; color: var(--accent-primary, #64ffda);">${formatarMoeda(totalValorVendas)}</td>
            <td style="text-align: right; color: #27ae60; font-size: 1.1em;">${formatarMoeda(totalComissao)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

// Renderiza tabela de produtos comprados (agrupados por tipo de produto)
function renderizarProdutosComprados(produtos) {
    const tbody = document.getElementById('bodyProdutosComprados');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto comprado no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Agrupa produtos por tipo de produto
    const grupos = {};
    produtos.forEach(produto => {
        const tipo = produto.tipo_produto || 'comprado';
        const tipoLabel = tipo === 'fabricado' ? 'Fabricado' : 'Comprado';

        if (!grupos[tipo]) {
            grupos[tipo] = {
                tipo: tipo,
                label: tipoLabel,
                produtos: [],
                totais: {
                    quantidade: 0,
                    valor_total_compra: 0
                }
            };
        }

        grupos[tipo].produtos.push(produto);
        grupos[tipo].totais.quantidade += produto.quantidade;
        grupos[tipo].totais.valor_total_compra += produto.valor_total_compra;
    });

    // Ordena tipos (Comprado primeiro, depois Fabricado)
    const tiposOrdenados = Object.values(grupos).sort((a, b) => {
        if (a.tipo === 'comprado') return -1;
        if (b.tipo === 'comprado') return 1;
        return a.label.localeCompare(b.label);
    });

    let html = '';
    tiposOrdenados.forEach(grupo => {
        const icon = grupo.tipo === 'fabricado' ? 'fa-cogs' : 'fa-shopping-basket';
        const bgColor = grupo.tipo === 'fabricado'
            ? 'rgba(155, 89, 182, 0.15)'
            : 'rgba(52, 152, 219, 0.15)';

        // Linha do tipo (clicável)
        html += `
            <tr class="categoria-row" style="background: ${bgColor}; cursor: pointer;" onclick="toggleTipoProdutoComprado('${grupo.tipo}')">
                <td colspan="3" style="font-weight: 700; color: var(--accent-primary, #64ffda);">
                    <i id="icon-comprados-${grupo.tipo}" class="fas fa-chevron-right" style="margin-right: 8px; font-size: 12px;"></i>
                    <i class="fas ${icon}" style="margin-right: 8px;"></i>
                    ${grupo.label} (${grupo.produtos.length} produtos)
                </td>
                <td style="text-align: right; font-weight: 600;">${formatarNumero(grupo.totais.quantidade)}</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; font-weight: 600;">${formatarMoeda(grupo.totais.valor_total_compra)}</td>
            </tr>
        `;

        // Linhas dos produtos (ocultas inicialmente)
        grupo.produtos.forEach(produto => {
            html += `
                <tr class="produto-row-comprados-${grupo.tipo}" style="display: none; background: rgba(10, 25, 47, 0.5);">
                    <td style="padding-left: 30px;">${produto.codigo}</td>
                    <td style="font-style: italic;">${produto.nome}</td>
                    <td>${produto.fornecedor}</td>
                    <td style="text-align: right;">${formatarNumero(produto.quantidade)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.preco_compra)}</td>
                    <td style="text-align: right;">${formatarMoeda(produto.valor_total_compra)}</td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

// Toggle expansão de tipo - Produtos Comprados
function toggleTipoProdutoComprado(tipo) {
    const rows = document.querySelectorAll(`.produto-row-comprados-${tipo}`);
    const icon = document.getElementById(`icon-comprados-${tipo}`);

    rows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });

    if (icon) {
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }
}


// Função para atualizar progresso
function atualizarProgresso(etapa, total = 4) {
    const percentual = (etapa / total) * 100;
    const progressoBar = document.getElementById('progressoBar');
    const progressoTexto = document.getElementById('progressoTexto');

    progressoBar.style.width = percentual + '%';
    progressoBar.textContent = Math.round(percentual) + '%';
    progressoTexto.textContent = `${etapa}/${total}`;
}

// Função para atualizar status de um item
function atualizarStatusItem(item, status) {
    const statusElement = document.getElementById(`status-${item}`);
    if (!statusElement) return;

    if (status === 'carregando') {
        statusElement.style.background = '#f39c12';
        statusElement.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 10px;"></i>';
    } else if (status === 'concluido') {
        statusElement.style.background = '#27ae60';
        statusElement.innerHTML = '<i class="fas fa-check" style="font-size: 10px;"></i>';
    } else if (status === 'erro') {
        statusElement.style.background = '#e74c3c';
        statusElement.innerHTML = '<i class="fas fa-times" style="font-size: 10px;"></i>';
    }
}

// Gera relatório de estoque
async function gerarRelatorioEstoque() {
    // Mostra loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('relatorioEstoqueConteudo').style.display = 'none';
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'none';
    document.getElementById('relatorioProdutosConteudo').style.display = 'none';
    document.getElementById('mensagemInicial').style.display = 'none';

    try {
        // Busca dados da API (não precisa de datas)
        const response = await apiGet('/api/relatorios/estoque');

        if (!response) {
            throw new Error('Erro ao buscar dados do relatório de estoque');
        }

        // Armazena dados globalmente
        dadosEstoqueAtual = response;

        // Renderiza o relatório
        renderizarRelatorioEstoque(response);

        // Mostra conteúdo
        document.getElementById('loading').style.display = 'none';
        document.getElementById('relatorioEstoqueConteudo').style.display = 'block';


    } catch (error) {
        console.error('Erro ao gerar relatório de estoque:', error);
        document.getElementById('loading').style.display = 'none';
        alert('Erro ao gerar relatório de estoque: ' + error.message);
    }
}

// Renderiza o relatório de estoque
function renderizarRelatorioEstoque(dados) {
    // Resumo
    document.getElementById('estoqueQtdProdutos').textContent = formatarNumero(dados.resumo.total_produtos);
    document.getElementById('estoqueQtdItens').textContent = formatarNumero(dados.resumo.total_itens);
    document.getElementById('estoqueCustoTotal').textContent = formatarMoeda(dados.resumo.custo_total_estoque);
    document.getElementById('estoqueValorVenda').textContent = formatarMoeda(dados.resumo.valor_venda_total_estoque);
    document.getElementById('estoqueValorizacaoSimulada').textContent = formatarMoeda(dados.resumo.valorizacao_simulada_total);
    document.getElementById('estoqueValorizacaoReal').textContent = formatarMoeda(dados.resumo.valorizacao_real_total);
    document.getElementById('estoqueMargemSimulada').textContent = dados.resumo.margem_media_simulada.toFixed(2) + '%';
    document.getElementById('estoqueMargemReal').textContent = dados.resumo.margem_media_real.toFixed(2) + '%';

    // Tabela de produtos
    renderizarTabelaEstoque(dados.produtos);
}

// Renderiza tabela de produtos em estoque
function renderizarTabelaEstoque(produtos) {
    const tbody = document.getElementById('bodyEstoque');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto em estoque</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = produtos.map(produto => {
        // Determina cor da valorização
        const corValSimulada = produto.valorizacao_simulada >= 0 ? '#27ae60' : '#e74c3c';
        const corValReal = produto.valorizacao_real !== null ? (produto.valorizacao_real >= 0 ? '#9b59b6' : '#e74c3c') : '#7f8c8d';
        const corMargemSim = produto.margem_simulada >= 0 ? '#27ae60' : '#e74c3c';
        const corMargemReal = produto.margem_real !== null ? (produto.margem_real >= 0 ? '#9b59b6' : '#e74c3c') : '#7f8c8d';

        return `
            <tr>
                <td>${produto.codigo}</td>
                <td>${produto.nome}</td>
                <td>${produto.categoria_nome || 'N/A'}</td>
                <td style="text-align: right; font-weight: 600;">${formatarNumero(produto.estoque_atual)}</td>
                <td style="text-align: right;">${formatarMoeda(produto.preco_custo)}</td>
                <td style="text-align: right; color: #e74c3c;">${formatarMoeda(produto.custo_total)}</td>
                <td style="text-align: right;">${formatarMoeda(produto.preco_venda)}</td>
                <td style="text-align: right; color: ${produto.preco_medio_venda ? '#3498db' : '#7f8c8d'};">
                    ${produto.preco_medio_venda ? formatarMoeda(produto.preco_medio_venda) : 'N/A'}
                </td>
                <td style="text-align: right;">${formatarNumero(produto.qtd_vendida)}</td>
                <td style="text-align: right;">${produto.comissao_percentual.toFixed(0)}%</td>
                <td style="text-align: right; color: ${corValSimulada}; font-weight: 600;">
                    ${formatarMoeda(produto.valorizacao_simulada)}
                </td>
                <td style="text-align: right; color: ${corValReal}; font-weight: 600;">
                    ${produto.valorizacao_real !== null ? formatarMoeda(produto.valorizacao_real) : 'N/A'}
                </td>
                <td style="text-align: right; color: ${corMargemSim};">
                    ${produto.margem_simulada.toFixed(2)}%
                </td>
                <td style="text-align: right; color: ${corMargemReal};">
                    ${produto.margem_real !== null ? produto.margem_real.toFixed(2) + '%' : 'N/A'}
                </td>
                <td style="text-align: right; color: ${produto.giro_estoque !== null ? '#16a085' : '#7f8c8d'};">
                    ${produto.giro_estoque !== null ? produto.giro_estoque.toFixed(2) + 'x' : 'N/A'}
                </td>
            </tr>
        `;
    }).join('');
}

// Exporta relatório de estoque em PDF
function exportarEstoquePDF() {
    if (!dadosEstoqueAtual) {
        alert('Gere um relatório de estoque primeiro');
        return;
    }

    const elemento = document.getElementById('relatorioEstoqueConteudo');
    const hoje = new Date().toISOString().split('T')[0];

    const opcoes = {
        margin: 5,
        filename: `relatorio_estoque_${hoje}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a3' }
    };

    html2pdf().set(opcoes).from(elemento).save();
}

// Exporta relatório de estoque em Excel
function exportarEstoqueExcel() {
    if (!dadosEstoqueAtual) {
        alert('Gere um relatório de estoque primeiro');
        return;
    }

    const hoje = new Date().toISOString().split('T')[0];

    // Prepara dados para Excel
    const dadosExcel = dadosEstoqueAtual.produtos.map(p => ({
        'Código': p.codigo,
        'Produto': p.nome,
        'Categoria': p.categoria_nome || 'N/A',
        'Qtd Disponível': p.estoque_atual,
        'Custo Unitário': p.preco_custo,
        'Custo Total': p.custo_total,
        'Preço Venda': p.preco_venda,
        'Preço Médio Vendido': p.preco_medio_venda || 'N/A',
        'Qtd Vendida': p.qtd_vendida,
        'Comissão %': p.comissao_percentual,
        'Valorização Simulada': p.valorizacao_simulada,
        'Valorização Real': p.valorizacao_real !== null ? p.valorizacao_real : 'N/A',
        'Margem Simulada %': p.margem_simulada,
        'Margem Real %': p.margem_real !== null ? p.margem_real : 'N/A',
        'Giro Estoque': p.giro_estoque !== null ? p.giro_estoque : 'N/A'
    }));

    // Adiciona resumo no início
    const resumo = [
        { 'Resumo': 'Total de Produtos', 'Valor': dadosEstoqueAtual.resumo.total_produtos },
        { 'Resumo': 'Total de Itens', 'Valor': dadosEstoqueAtual.resumo.total_itens },
        { 'Resumo': 'Custo Total Estoque', 'Valor': dadosEstoqueAtual.resumo.custo_total_estoque },
        { 'Resumo': 'Valor Venda Total', 'Valor': dadosEstoqueAtual.resumo.valor_venda_total_estoque },
        { 'Resumo': 'Valorização Simulada Total', 'Valor': dadosEstoqueAtual.resumo.valorizacao_simulada_total },
        { 'Resumo': 'Valorização Real Total', 'Valor': dadosEstoqueAtual.resumo.valorizacao_real_total },
        { 'Resumo': 'Margem Média Simulada', 'Valor': dadosEstoqueAtual.resumo.margem_media_simulada + '%' },
        { 'Resumo': 'Margem Média Real', 'Valor': dadosEstoqueAtual.resumo.margem_media_real + '%' }
    ];

    // Cria CSV
    let csv = 'RELATÓRIO DE ESTOQUE - ' + hoje + '\n\n';
    csv += 'RESUMO\n';
    csv += 'Métrica;Valor\n';
    resumo.forEach(r => {
        csv += `${r.Resumo};${r.Valor}\n`;
    });
    csv += '\nPRODUTOS\n';

    // Cabeçalho
    const headers = Object.keys(dadosExcel[0]);
    csv += headers.join(';') + '\n';

    // Dados
    dadosExcel.forEach(row => {
        csv += headers.map(h => {
            let val = row[h];
            if (typeof val === 'string' && val.includes(';')) {
                val = `"${val}"`;
            }
            return val;
        }).join(';') + '\n';
    });

    // Download
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_estoque_${hoje}.csv`;
    link.click();
}

// Gera relatório por IA
async function gerarRelatorioIA() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;

    if (!dataInicio || !dataFim) {
        alert('Por favor, selecione as datas inicial e final');
        return;
    }

    // Mostra loading com progresso
    document.getElementById('loading').style.display = 'none';
    document.getElementById('loadingIA').style.display = 'block';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('relatorioEstoqueConteudo').style.display = 'none';
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'none';
    document.getElementById('relatorioProdutosConteudo').style.display = 'none';
    document.getElementById('mensagemInicial').style.display = 'none';

    // Resetar progresso
    atualizarProgresso(0, 5);
    document.getElementById('status-vendas').style.background = '#e9ecef';
    document.getElementById('status-estoque').style.background = '#e9ecef';
    document.getElementById('status-recomendacoes').style.background = '#e9ecef';
    document.getElementById('status-estrategia').style.background = '#e9ecef';
    document.getElementById('status-whatsapp').style.background = '#e9ecef';

    let etapaAtual = 0;

    try {
        // Configurar abas
        const tabButtons = document.querySelectorAll('.tab-btn-ia');
        const tabContents = document.querySelectorAll('.tab-content-ia');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => {
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = '#7f8c8d';
                });
                tabContents.forEach(c => c.style.display = 'none');

                btn.style.borderBottomColor = '#9b59b6';
                btn.style.color = '#9b59b6';
                const tabName = btn.getAttribute('data-tab');
                document.getElementById(`tab-${tabName}`).style.display = 'block';
            });
        });

        // Gerar relatórios
        // Análise de vendas
        atualizarStatusItem('vendas', 'carregando');
        try {
            const relatorioVendas = await gerarRelatorioVendasIA(dataInicio, dataFim);
            const conteudoFormatadoVendas = formatarConteudoRelatorio(relatorioVendas);
            document.getElementById('tab-vendas').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoVendas}</div>
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('vendas', 'concluido');
        } catch (error) {
            document.getElementById('tab-vendas').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar análise de vendas: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('vendas', 'erro');
        }

        // Análise de estoque
        atualizarStatusItem('estoque', 'carregando');
        try {
            const relatorioEstoque = await gerarRelatorioEstoqueIA();
            const conteudoFormatadoEstoque = formatarConteudoRelatorio(relatorioEstoque);
            document.getElementById('tab-estoque').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoEstoque}</div>
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('estoque', 'concluido');
        } catch (error) {
            document.getElementById('tab-estoque').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar análise de estoque: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('estoque', 'erro');
        }

        // Recomendações
        atualizarStatusItem('recomendacoes', 'carregando');
        try {
            const recomendacoes = await gerarRecomendacoesVendasIA(dataInicio, dataFim);
            const conteudoFormatadoRecomendacoes = formatarConteudoRelatorio(recomendacoes);
            document.getElementById('tab-recomendacoes').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoRecomendacoes}</div>
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('recomendacoes', 'concluido');
        } catch (error) {
            document.getElementById('tab-recomendacoes').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar recomendações: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('recomendacoes', 'erro');
        }

        // Estratégia para o mês
        atualizarStatusItem('estrategia', 'carregando');
        try {
            const estrategia = await gerarEstrategiaParaMesIA(dataInicio, dataFim);
            console.log('Estratégia recebida:', estrategia);

            if (!estrategia || estrategia.trim() === '') {
                document.getElementById('tab-estrategia').innerHTML = `
                    <div style="padding: 20px; background: #fef3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;">
                        <i class="fas fa-info-circle"></i>
                        Estratégia vazia. Verifique se há dados de vendas no período.
                    </div>
                `;
            } else {
                const conteudoFormatadoEstrategia = formatarConteudoRelatorio(estrategia);
                document.getElementById('tab-estrategia').innerHTML = `
                    <div class="relatorio-ia-content">
                        <div class="relatorio-ia-text">${conteudoFormatadoEstrategia}</div>
                    </div>
                `;
            }
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('estrategia', 'concluido');
        } catch (error) {
            console.error('Erro ao gerar estratégia:', error);
            document.getElementById('tab-estrategia').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar estratégia: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('estrategia', 'erro');
        }

        // Relatório WhatsApp
        atualizarStatusItem('whatsapp', 'carregando');
        try {
            const relatorioWhatsApp = await gerarRelatorioWhatsAppIA(dataInicio, dataFim);
            console.log('Relatório WhatsApp recebido:', relatorioWhatsApp);

            if (!relatorioWhatsApp || relatorioWhatsApp.trim() === '') {
                document.getElementById('tab-whatsapp').innerHTML = `
                    <div style="padding: 20px; background: #fef3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;">
                        <i class="fas fa-info-circle"></i>
                        Relatório vazio. Verifique se há dados de vendas no período.
                    </div>
                `;
            } else {
                document.getElementById('tab-whatsapp').innerHTML = `
                    <div class="relatorio-ia-content">
                        <div style="margin-bottom: 15px; padding: 15px; background: rgba(37, 211, 102, 0.1); border: 1px solid #25D366; border-radius: 8px;">
                            <h4 style="color: #25D366; margin: 0 0 10px 0;"><i class="fab fa-whatsapp"></i> Prévia do Relatório WhatsApp</h4>
                            <p style="margin: 0; font-size: 13px; color: #7f8c8d;">
                                Este relatório será enviado para todos os vendedores ativos com telefone cadastrado.
                            </p>
                        </div>
                        <div class="relatorio-ia-text" style="white-space: pre-wrap; font-family: 'Segoe UI', sans-serif; background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;" id="whatsapp-content">
                            ${relatorioWhatsApp}
                        </div>
                        <div style="margin-top: 20px; text-align: center;">
                            <button type="button" id="btnEnviarWhatsApp" style="background: #25D366; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; transition: all 0.3s ease;">
                                <i class="fab fa-whatsapp" style="font-size: 20px;"></i>
                                Enviar para Vendedores
                            </button>
                        </div>
                    </div>
                `;

                // Configurar botão de envio WhatsApp
                document.getElementById('btnEnviarWhatsApp').addEventListener('click', async () => {
                    const btn = document.getElementById('btnEnviarWhatsApp');
                    const textoOriginal = btn.innerHTML;

                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

                        const resultado = await enviarRelatorioWhatsApp(relatorioWhatsApp);

                        btn.innerHTML = '<i class="fas fa-check"></i> Enviado!';
                        btn.style.background = '#27ae60';

                        alert(`✅ Relatório enviado com sucesso!\n\n📤 Enviados: ${resultado.sucesso}\n❌ Falhas: ${resultado.falha}\n📊 Total: ${resultado.total} vendedores`);

                        setTimeout(() => {
                            btn.innerHTML = textoOriginal;
                            btn.style.background = '#25D366';
                            btn.disabled = false;
                        }, 3000);

                    } catch (error) {
                        console.error('Erro ao enviar WhatsApp:', error);
                        btn.innerHTML = '<i class="fas fa-times"></i> Erro ao enviar';
                        btn.style.background = '#e74c3c';

                        alert('❌ Erro ao enviar relatório: ' + error.message);

                        setTimeout(() => {
                            btn.innerHTML = textoOriginal;
                            btn.style.background = '#25D366';
                            btn.disabled = false;
                        }, 3000);
                    }
                });
            }
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('whatsapp', 'concluido');
        } catch (error) {
            console.error('Erro ao gerar relatório WhatsApp:', error);
            document.getElementById('tab-whatsapp').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar relatório WhatsApp: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 5);
            atualizarStatusItem('whatsapp', 'erro');
        }

        // Mostra conteúdo
        document.getElementById('loadingIA').style.display = 'none';
        document.getElementById('relatorioConteudo').style.display = 'none';
        document.getElementById('relatorioIAConteudo').style.display = 'block';
        document.getElementById('mensagemInicial').style.display = 'none';

    } catch (error) {
        console.error('Erro ao gerar relatório por IA:', error);
        document.getElementById('loadingIA').style.display = 'none';
        alert('Erro ao gerar relatório por IA: ' + error.message);
    }
}

// ===== RELATÓRIO POR PRODUTOS MENSAIS =====

let dadosProdutosMensaisAtual = null;

// Carrega categorias para o filtro
async function carregarCategoriasProdutos() {
    try {
        const categorias = await apiGet('/api/categorias');
        const select = document.getElementById('categoriaProdutoFiltro');

        if (!select) return;

        // Mantém a opção padrão
        select.innerHTML = '<option value="">Todas as Categorias</option>';

        if (categorias && categorias.length > 0) {
            categorias.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nome;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

// Gera o relatório por produtos
async function gerarRelatorioProdutos() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;

    if (!dataInicio || !dataFim) {
        alert('Por favor, selecione as datas inicial e final');
        return;
    }

    if (dataInicio > dataFim) {
        alert('A data inicial não pode ser maior que a data final');
        return;
    }

    // Mostra loading e esconde outros conteúdos
    document.getElementById('loading').style.display = 'block';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('relatorioEstoqueConteudo').style.display = 'none';
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'none';
    document.getElementById('relatorioProdutosConteudo').style.display = 'none';
    document.getElementById('mensagemInicial').style.display = 'none';

    try {
        // Pega os filtros ANTES de recarregar categorias
        const categoriaId = document.getElementById('categoriaProdutoFiltro').value;
        const nomeProduto = document.getElementById('nomeProdutoFiltro').value;

        // Carrega categorias se ainda não carregou
        await carregarCategoriasProdutos();

        // Restaura a categoria selecionada se existir
        if (categoriaId) {
            document.getElementById('categoriaProdutoFiltro').value = categoriaId;
        }

        // Monta URL com filtros
        let url = `/api/relatorios/produtos-mensais?data_inicio=${dataInicio}&data_fim=${dataFim}`;
        if (categoriaId) {
            url += `&categoria_id=${categoriaId}`;
        }
        if (nomeProduto) {
            url += `&nome_produto=${encodeURIComponent(nomeProduto)}`;
        }

        // Busca dados da API
        const response = await apiGet(url);

        if (!response) {
            throw new Error('Erro ao buscar dados do relatório de produtos');
        }

        // Armazena dados globalmente
        dadosProdutosMensaisAtual = response;

        // Renderiza o relatório
        renderizarRelatorioProdutos(response);

        // Mostra conteúdo
        document.getElementById('loading').style.display = 'none';
        document.getElementById('relatorioProdutosConteudo').style.display = 'block';


    } catch (error) {
        console.error('Erro ao gerar relatório de produtos:', error);
        document.getElementById('loading').style.display = 'none';
        alert('Erro ao gerar relatório de produtos: ' + error.message);
    }
}

// Filtra o relatório de produtos (re-busca com novos filtros)
async function filtrarRelatorioProdutos() {
    await gerarRelatorioProdutos();
}

// Variável para controlar se há filtros ativos
let filtrosAtivos = false;

// Renderiza o relatório de produtos
function renderizarRelatorioProdutos(dados) {
    const produtos = dados.produtos || [];

    // Verifica se há filtros ativos
    const categoriaId = document.getElementById('categoriaProdutoFiltro').value;
    const nomeProduto = document.getElementById('nomeProdutoFiltro').value;
    filtrosAtivos = categoriaId !== '' || nomeProduto !== '';

    renderizarTabelaQuantidade(produtos, filtrosAtivos);
    renderizarTabelaFaturamento(produtos, filtrosAtivos);
    renderizarTabelaLucro(produtos, filtrosAtivos);
}

// Agrupa produtos por categoria
function agruparPorCategoria(produtos, campo) {
    const grupos = {};

    produtos.forEach(produto => {
        const catId = produto.categoria_id || 0;
        const catNome = produto.categoria_nome || 'Sem Categoria';

        if (!grupos[catId]) {
            grupos[catId] = {
                id: catId,
                nome: catNome,
                produtos: [],
                totais_mensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                total_geral: 0
            };
        }

        grupos[catId].produtos.push(produto);

        // Soma os valores mensais
        const valores = produto[campo];
        valores.forEach((v, i) => {
            grupos[catId].totais_mensais[i] += v;
        });

        // Soma o total
        const totalField = campo.replace('_mensal', '_total');
        grupos[catId].total_geral += produto[totalField];
    });

    // Ordena categorias por nome
    return Object.values(grupos).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Toggle expansão de categoria
function toggleCategoria(categoriaId, tabela) {
    const rows = document.querySelectorAll(`.produto-row-${tabela}-${categoriaId}`);
    const icon = document.getElementById(`icon-${tabela}-${categoriaId}`);

    rows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });

    if (icon) {
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }
}

// Renderiza tabela de quantidade por mês
function renderizarTabelaQuantidade(produtos, mostrarDetalhado = false) {
    const tbody = document.getElementById('bodyQuantidadeMensal');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto vendido no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Calcula totais gerais
    const totaisMensais = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let totalGeral = 0;
    produtos.forEach(produto => {
        produto.quantidade_mensal.forEach((v, i) => {
            totaisMensais[i] += v;
        });
        totalGeral += produto.quantidade_total;
    });

    let html = '';

    if (mostrarDetalhado) {
        // Mostra todos os produtos diretamente
        html = produtos.map(produto => {
            const qtd = produto.quantidade_mensal;
            return `
                <tr>
                    <td>${produto.nome}</td>
                    ${qtd.map((v, i) => `<td style="text-align: center; color: ${v > 0 ? 'var(--text-primary, #e6f1ff)' : 'var(--text-muted, #8892b0)'};">${formatarNumero(v)}</td>`).join('')}
                    <td style="text-align: center; font-weight: 700; color: #3498db;">${formatarNumero(produto.quantidade_total)}</td>
                </tr>
            `;
        }).join('');
    } else {
        // Agrupa por categoria
        const categorias = agruparPorCategoria(produtos, 'quantidade_mensal');

        categorias.forEach(cat => {
            // Linha da categoria (clicável)
            html += `
                <tr class="categoria-row" style="background: rgba(52, 152, 219, 0.15); cursor: pointer;" onclick="toggleCategoria(${cat.id}, 'qtd')">
                    <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">
                        <i id="icon-qtd-${cat.id}" class="fas fa-chevron-right" style="margin-right: 8px; font-size: 12px;"></i>
                        ${cat.nome} (${cat.produtos.length})
                    </td>
                    ${cat.totais_mensais.map(v => `<td style="text-align: center; font-weight: 600; color: ${v > 0 ? 'var(--text-primary, #e6f1ff)' : 'var(--text-muted, #8892b0)'};">${formatarNumero(v)}</td>`).join('')}
                    <td style="text-align: center; font-weight: 700; color: #3498db;">${formatarNumero(cat.total_geral)}</td>
                </tr>
            `;

            // Linhas dos produtos (ocultas inicialmente)
            cat.produtos.forEach(produto => {
                const qtd = produto.quantidade_mensal;
                html += `
                    <tr class="produto-row-qtd-${cat.id}" style="display: none; background: rgba(10, 25, 47, 0.5);">
                        <td style="padding-left: 30px; font-style: italic;">${produto.nome}</td>
                        ${qtd.map((v, i) => `<td style="text-align: center; color: ${v > 0 ? 'var(--text-primary, #e6f1ff)' : 'var(--text-muted, #8892b0)'};">${formatarNumero(v)}</td>`).join('')}
                        <td style="text-align: center; color: #3498db;">${formatarNumero(produto.quantidade_total)}</td>
                    </tr>
                `;
            });
        });
    }

    // Adiciona linha de totais
    html += `
        <tr style="background: rgba(100, 255, 218, 0.1); font-weight: 700;">
            <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">TOTAL GERAL</td>
            ${totaisMensais.map(v => `<td style="text-align: center; color: var(--accent-primary, #64ffda);">${formatarNumero(v)}</td>`).join('')}
            <td style="text-align: center; color: #3498db; font-size: 1.1em;">${formatarNumero(totalGeral)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

// Renderiza tabela de faturamento por mês
function renderizarTabelaFaturamento(produtos, mostrarDetalhado = false) {
    const tbody = document.getElementById('bodyFaturamentoMensal');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto vendido no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Calcula totais gerais
    const totaisMensais = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let totalGeral = 0;
    produtos.forEach(produto => {
        produto.faturamento_mensal.forEach((v, i) => {
            totaisMensais[i] += v;
        });
        totalGeral += produto.faturamento_total;
    });

    let html = '';

    if (mostrarDetalhado) {
        html = produtos.map(produto => {
            const fat = produto.faturamento_mensal;
            return `
                <tr>
                    <td>${produto.nome}</td>
                    ${fat.map((v, i) => `<td style="text-align: right; color: ${v > 0 ? '#27ae60' : 'var(--text-muted, #8892b0)'};">${v > 0 ? formatarMoeda(v) : '-'}</td>`).join('')}
                    <td style="text-align: right; font-weight: 700; color: #27ae60;">${formatarMoeda(produto.faturamento_total)}</td>
                </tr>
            `;
        }).join('');
    } else {
        const categorias = agruparPorCategoria(produtos, 'faturamento_mensal');

        categorias.forEach(cat => {
            html += `
                <tr class="categoria-row" style="background: rgba(39, 174, 96, 0.15); cursor: pointer;" onclick="toggleCategoria(${cat.id}, 'fat')">
                    <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">
                        <i id="icon-fat-${cat.id}" class="fas fa-chevron-right" style="margin-right: 8px; font-size: 12px;"></i>
                        ${cat.nome} (${cat.produtos.length})
                    </td>
                    ${cat.totais_mensais.map(v => `<td style="text-align: right; font-weight: 600; color: ${v > 0 ? '#27ae60' : 'var(--text-muted, #8892b0)'};">${v > 0 ? formatarMoeda(v) : '-'}</td>`).join('')}
                    <td style="text-align: right; font-weight: 700; color: #27ae60;">${formatarMoeda(cat.total_geral)}</td>
                </tr>
            `;

            cat.produtos.forEach(produto => {
                const fat = produto.faturamento_mensal;
                html += `
                    <tr class="produto-row-fat-${cat.id}" style="display: none; background: rgba(10, 25, 47, 0.5);">
                        <td style="padding-left: 30px; font-style: italic;">${produto.nome}</td>
                        ${fat.map((v, i) => `<td style="text-align: right; color: ${v > 0 ? '#27ae60' : 'var(--text-muted, #8892b0)'};">${v > 0 ? formatarMoeda(v) : '-'}</td>`).join('')}
                        <td style="text-align: right; color: #27ae60;">${formatarMoeda(produto.faturamento_total)}</td>
                    </tr>
                `;
            });
        });
    }

    html += `
        <tr style="background: rgba(100, 255, 218, 0.1); font-weight: 700;">
            <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">TOTAL GERAL</td>
            ${totaisMensais.map(v => `<td style="text-align: right; color: var(--accent-primary, #64ffda);">${formatarMoeda(v)}</td>`).join('')}
            <td style="text-align: right; color: #27ae60; font-size: 1.1em;">${formatarMoeda(totalGeral)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

// Renderiza tabela de lucro por mês
function renderizarTabelaLucro(produtos, mostrarDetalhado = false) {
    const tbody = document.getElementById('bodyLucroMensal');

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum produto vendido no período</p>
                </td>
            </tr>
        `;
        return;
    }

    // Calcula totais gerais
    const totaisMensais = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let totalGeral = 0;
    produtos.forEach(produto => {
        produto.lucro_mensal.forEach((v, i) => {
            totaisMensais[i] += v;
        });
        totalGeral += produto.lucro_total;
    });

    let html = '';

    if (mostrarDetalhado) {
        html = produtos.map(produto => {
            const lucro = produto.lucro_mensal;
            return `
                <tr>
                    <td>${produto.nome}</td>
                    ${lucro.map((v, i) => {
                const cor = v > 0 ? '#27ae60' : (v < 0 ? '#e74c3c' : 'var(--text-muted, #8892b0)');
                return `<td style="text-align: right; color: ${cor};">${v !== 0 ? formatarMoeda(v) : '-'}</td>`;
            }).join('')}
                    <td style="text-align: right; font-weight: 700; color: ${produto.lucro_total >= 0 ? '#27ae60' : '#e74c3c'};">${formatarMoeda(produto.lucro_total)}</td>
                </tr>
            `;
        }).join('');
    } else {
        const categorias = agruparPorCategoria(produtos, 'lucro_mensal');

        categorias.forEach(cat => {
            const corTotal = cat.total_geral >= 0 ? '#27ae60' : '#e74c3c';
            html += `
                <tr class="categoria-row" style="background: rgba(39, 174, 96, 0.15); cursor: pointer;" onclick="toggleCategoria(${cat.id}, 'lucro')">
                    <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">
                        <i id="icon-lucro-${cat.id}" class="fas fa-chevron-right" style="margin-right: 8px; font-size: 12px;"></i>
                        ${cat.nome} (${cat.produtos.length})
                    </td>
                    ${cat.totais_mensais.map(v => {
                const cor = v >= 0 ? '#27ae60' : '#e74c3c';
                return `<td style="text-align: right; font-weight: 600; color: ${cor};">${v !== 0 ? formatarMoeda(v) : '-'}</td>`;
            }).join('')}
                    <td style="text-align: right; font-weight: 700; color: ${corTotal};">${formatarMoeda(cat.total_geral)}</td>
                </tr>
            `;

            cat.produtos.forEach(produto => {
                const lucro = produto.lucro_mensal;
                html += `
                    <tr class="produto-row-lucro-${cat.id}" style="display: none; background: rgba(10, 25, 47, 0.5);">
                        <td style="padding-left: 30px; font-style: italic;">${produto.nome}</td>
                        ${lucro.map((v, i) => {
                    const cor = v > 0 ? '#27ae60' : (v < 0 ? '#e74c3c' : 'var(--text-muted, #8892b0)');
                    return `<td style="text-align: right; color: ${cor};">${v !== 0 ? formatarMoeda(v) : '-'}</td>`;
                }).join('')}
                        <td style="text-align: right; color: ${produto.lucro_total >= 0 ? '#27ae60' : '#e74c3c'};">${formatarMoeda(produto.lucro_total)}</td>
                    </tr>
                `;
            });
        });
    }

    html += `
        <tr style="background: rgba(100, 255, 218, 0.1); font-weight: 700;">
            <td style="font-weight: 700; color: var(--accent-primary, #64ffda);">TOTAL GERAL</td>
            ${totaisMensais.map(v => {
        const cor = v >= 0 ? 'var(--accent-primary, #64ffda)' : '#e74c3c';
        return `<td style="text-align: right; color: ${cor};">${formatarMoeda(v)}</td>`;
    }).join('')}
            <td style="text-align: right; color: ${totalGeral >= 0 ? '#27ae60' : '#e74c3c'}; font-size: 1.1em;">${formatarMoeda(totalGeral)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}


