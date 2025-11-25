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
});

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
    document.getElementById('mensagemInicial').style.display = 'none';
    
    try {
        // Busca dados da API
        const response = await apiGet(`/api/relatorios/completo?data_inicio=${dataInicio}&data_fim=${dataFim}`);
        
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
                <td colspan="9" class="mensagem-vazia">
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
            <td style="text-align: right;">${formatarNumero(produto.quantidade)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.preco_custo)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.preco_venda)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.valor_venda_total)}</td>
            <td style="text-align: right;">${formatarMoeda(produto.custo_total)}</td>
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
