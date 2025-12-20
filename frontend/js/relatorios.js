// Variável global para armazenar dados do relatório
let dadosRelatorioAtual = null;

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
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
    
    // Define datas padrão (últimos 30 dias)
    const hoje = new Date();
    const trinta_dias_atras = new Date(hoje.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('dataInicio').valueAsDate = trinta_dias_atras;
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
        
        // Habilita botão de exportação
        document.getElementById('btnExportar').disabled = false;
        
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
    document.getElementById('lucroTotal').textContent = formatarMoeda(dados.resumo.lucro_total);
    document.getElementById('margemLucro').textContent = dados.resumo.margem_lucro.toFixed(2) + '%';
    document.getElementById('totalCompras').textContent = dados.resumo.total_pedidos_compra;
    document.getElementById('valorCompras').textContent = formatarMoeda(dados.resumo.valor_total_compras);
    
    // Produtos Vendidos
    renderizarProdutosVendidos(dados.produtos_vendidos);
    
    // Comissões
    renderizarComissoes(dados.comissoes_vendedores);
    
    // Produtos Comprados
    renderizarProdutosComprados(dados.produtos_comprados);
}

// Renderiza tabela de produtos vendidos
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
    
    tbody.innerHTML = produtos.map(produto => `
        <tr>
            <td>${produto.codigo}</td>
            <td>${produto.nome}</td>
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
    `).join('');
}

// Renderiza tabela de comissões
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
    
    tbody.innerHTML = comissoes.map(comissao => `
        <tr>
            <td>${comissao.vendedor}</td>
            <td style="text-align: right;">${formatarNumero(comissao.total_vendas)}</td>
            <td style="text-align: right;">${formatarMoeda(comissao.valor_total_vendas)}</td>
            <td style="text-align: right; font-weight: 600; color: #27ae60;">
                ${formatarMoeda(comissao.comissao_total)}
            </td>
        </tr>
    `).join('');
}

// Renderiza tabela de produtos comprados
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
    
    tbody.innerHTML = produtos.map(produto => `
        <tr>
            <td>${produto.codigo}</td>
            <td>${produto.nome}</td>
            <td>${produto.fornecedor}</td>
            <td style="text-align: right;">${formatarNumero(produto.quantidade)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.preco_compra)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.valor_total_compra)}</td>
        </tr>
    `).join('');
}

// Exporta relatório em PDF
function exportarPDF() {
    if (!dadosRelatorioAtual) {
        alert('Gere um relatório primeiro');
        return;
    }
    
    const elemento = document.getElementById('relatorioConteudo');
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    
    const opcoes = {
        margin: 10,
        filename: `relatorio_${dataInicio}_ate_${dataFim}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
    };
    
    html2pdf().set(opcoes).from(elemento).save();
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
    document.getElementById('mensagemInicial').style.display = 'none';
    
    // Resetar progresso
    atualizarProgresso(0, 4);
    document.getElementById('status-vendas').style.background = '#e9ecef';
    document.getElementById('status-estoque').style.background = '#e9ecef';
    document.getElementById('status-recomendacoes').style.background = '#e9ecef';
    document.getElementById('status-estrategia').style.background = '#e9ecef';
    
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
            atualizarProgresso(etapaAtual, 4);
            atualizarStatusItem('vendas', 'concluido');
        } catch (error) {
            document.getElementById('tab-vendas').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar análise de vendas: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 4);
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
            atualizarProgresso(etapaAtual, 4);
            atualizarStatusItem('estoque', 'concluido');
        } catch (error) {
            document.getElementById('tab-estoque').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar análise de estoque: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 4);
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
            atualizarProgresso(etapaAtual, 4);
            atualizarStatusItem('recomendacoes', 'concluido');
        } catch (error) {
            document.getElementById('tab-recomendacoes').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar recomendações: ${error.message}
                </div>
            `;
            etapaAtual++;
            atualizarProgresso(etapaAtual, 4);
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
            atualizarProgresso(etapaAtual, 4);
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
            atualizarProgresso(etapaAtual, 4);
            atualizarStatusItem('estrategia', 'erro');
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
