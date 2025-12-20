/**
 * Mapa Interativo do Brasil - Vendas por Região
 * Exibe vendas por estado com cores baseadas na concentração
 * Usa o arquivo brazil.svg externo
 */

// Variáveis globais
let dadosVendasRegiao = null;
let estadoSelecionado = null;
let svgMapaCarregado = false;

/**
 * Inicializa o mapa de vendas por região
 * Carrega o SVG externo brazil.svg
 */
async function inicializarMapaRegiao() {
    const container = document.getElementById('mapaContainer');
    if (!container) return;
    
    // Se já carregou, não precisa carregar novamente
    if (svgMapaCarregado && container.querySelector('svg')) {
        return;
    }
    
    try {
        // Carrega o SVG externo
        const response = await fetch('brazil.svg');
        const svgText = await response.text();
        container.innerHTML = svgText;
        
        // Adiciona classe e estilos ao SVG para se ajustar ao container
        const svg = container.querySelector('svg');
        if (svg) {
            svg.id = 'mapaBrasil';
            // Define viewBox fixo baseado nas dimensões do brazil.svg (612.51611 x 639.04297)
            if (!svg.getAttribute('viewBox')) {
                svg.setAttribute('viewBox', '0 0 612.52 639.05');
            }
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            // Remove width/height fixos para usar o container
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.style.display = 'block';
            svg.style.width = 'auto';
            svg.style.height = 'auto';
            svg.style.maxWidth = '450px';
            svg.style.maxHeight = '490px';
        }
        
        // Configura eventos dos estados (IDs no formato BR-XX)
        const estados = container.querySelectorAll('path[id^="BR-"]');
        estados.forEach(estado => {
            estado.classList.add('estado');
            const sigla = estado.id.replace('BR-', '');
            estado.dataset.sigla = sigla;
            estado.dataset.nome = estado.getAttribute('title') || sigla;
            
            estado.addEventListener('click', () => selecionarEstado(sigla));
            estado.addEventListener('mouseenter', (e) => mostrarTooltipEstado(e, estado));
            estado.addEventListener('mouseleave', esconderTooltipEstado);
        });
        
        svgMapaCarregado = true;
        
    } catch (error) {
        console.error('Erro ao carregar mapa:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <p>Erro ao carregar o mapa do Brasil</p>
            </div>
        `;
    }
}

/**
 * Carrega dados de vendas por região
 */
async function carregarVendasPorRegiao() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const plataformaId = document.getElementById('plataformaRegiaoFiltro')?.value || '';
    
    // Mostra loading
    document.getElementById('loadingMapa').style.display = 'flex';
    document.getElementById('mapaConteudo').style.display = 'none';
    
    try {
        let url = '/api/relatorios/vendas-por-regiao';
        const params = [];
        
        if (dataInicio) params.push(`data_inicio=${dataInicio}`);
        if (dataFim) params.push(`data_fim=${dataFim}`);
        if (plataformaId) params.push(`plataforma_id=${plataformaId}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        const response = await apiGet(url);
        
        if (!response) {
            throw new Error('Erro ao buscar dados de vendas por região');
        }
        
        dadosVendasRegiao = response;
        
        // Renderiza o mapa com os dados
        renderizarMapaComDados(response);
        
        // Atualiza resumo
        atualizarResumoRegiao(response);
        
        // Esconde loading
        document.getElementById('loadingMapa').style.display = 'none';
        document.getElementById('mapaConteudo').style.display = 'flex';
        
    } catch (error) {
        console.error('Erro ao carregar vendas por região:', error);
        document.getElementById('loadingMapa').style.display = 'none';
        alert('Erro ao carregar dados de vendas por região: ' + error.message);
    }
}

/**
 * Renderiza o mapa com os dados de vendas
 */
function renderizarMapaComDados(dados) {
    if (!dados || !dados.vendas_por_estado) return;
    
    // Encontra o valor máximo para calcular a escala de cores
    const valorMaximo = Math.max(...dados.vendas_por_estado.map(v => v.valor_total), 1);
    
    // Reseta cores dos estados (usando o formato BR-XX)
    document.querySelectorAll('.estado').forEach(estado => {
        estado.style.fill = '#e0e0e0';
        estado.style.stroke = '#ffffff';
        estado.style.strokeWidth = '0.5';
    });
    
    // Aplica cores baseado nos dados
    dados.vendas_por_estado.forEach(venda => {
        // Busca pelo ID no formato BR-XX
        const estadoElement = document.getElementById(`BR-${venda.sigla}`);
        if (estadoElement) {
            // Calcula intensidade da cor (0 a 1)
            const intensidade = venda.valor_total / valorMaximo;
            
            // Cor do estado (verde mais intenso = mais vendas)
            const cor = calcularCorIntensidade(intensidade);
            estadoElement.style.fill = cor;
            estadoElement.style.stroke = '#2e7d32';
            estadoElement.style.strokeWidth = '1.5';
        }
    });
}

/**
 * Calcula cor baseada na intensidade (0 a 1)
 */
function calcularCorIntensidade(intensidade) {
    // Gradiente de verde claro a verde escuro
    const r = Math.round(200 - (intensidade * 150));
    const g = Math.round(230 - (intensidade * 80));
    const b = Math.round(200 - (intensidade * 150));
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Mostra tooltip ao passar o mouse no estado
 */
function mostrarTooltipEstado(event, estado) {
    const sigla = estado.dataset.sigla;
    const nome = estado.dataset.nome;
    
    // Busca dados de venda do estado
    let vendaInfo = null;
    if (dadosVendasRegiao && dadosVendasRegiao.vendas_por_estado) {
        vendaInfo = dadosVendasRegiao.vendas_por_estado.find(v => v.sigla === sigla);
    }
    
    // Cria ou atualiza tooltip
    let tooltip = document.getElementById('tooltipMapa');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltipMapa';
        tooltip.className = 'tooltip-mapa';
        document.body.appendChild(tooltip);
    }
    
    // Conteúdo do tooltip
    let conteudo = `<strong>${nome} (${sigla})</strong>`;
    if (vendaInfo) {
        conteudo += `<br><span style="color: #4CAF50;">Vendas: ${vendaInfo.total_vendas}</span>`;
        conteudo += `<br><span style="color: #2196F3;">Valor: ${formatarMoedaRegiao(vendaInfo.valor_total)}</span>`;
    } else {
        conteudo += `<br><span style="color: #999;">Sem vendas no período</span>`;
    }
    
    tooltip.innerHTML = conteudo;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top = (event.pageY + 15) + 'px';
}

/**
 * Esconde tooltip
 */
function esconderTooltipEstado() {
    const tooltip = document.getElementById('tooltipMapa');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Atualiza o resumo de vendas por região
 */
function atualizarResumoRegiao(dados) {
    document.getElementById('totalEstadosVenda').textContent = dados.estados_com_venda || 0;
    document.getElementById('valorTotalRegiao').textContent = formatarMoedaRegiao(dados.total_geral || 0);
}

/**
 * Seleciona um estado e carrega detalhes
 */
async function selecionarEstado(sigla) {
    estadoSelecionado = sigla;
    
    // Destaca o estado selecionado
    document.querySelectorAll('.estado').forEach(e => {
        e.classList.remove('selecionado');
    });
    
    // Busca pelo ID no formato BR-XX
    const estadoElement = document.getElementById(`BR-${sigla}`);
    if (estadoElement) {
        estadoElement.classList.add('selecionado');
    }
    
    // Mostra painel lateral
    const painelLateral = document.getElementById('painelEstado');
    painelLateral.style.display = 'block';
    painelLateral.innerHTML = `
        <div class="loading-estado">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Carregando dados do estado...</p>
        </div>
    `;
    
    try {
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;
        
        let url = `/api/relatorios/vendas-por-regiao/${sigla}`;
        const params = [];
        const plataformaId = document.getElementById('plataformaRegiaoFiltro')?.value || '';
        
        if (dataInicio) params.push(`data_inicio=${dataInicio}`);
        if (dataFim) params.push(`data_fim=${dataFim}`);
        if (plataformaId) params.push(`plataforma_id=${plataformaId}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        const dados = await apiGet(url);
        
        if (!dados) {
            throw new Error('Erro ao buscar detalhes do estado');
        }
        
        renderizarPainelEstado(dados);
        
    } catch (error) {
        console.error('Erro ao carregar detalhes do estado:', error);
        painelLateral.innerHTML = `
            <div class="erro-estado">
                <i class="fas fa-exclamation-circle"></i>
                <p>Erro ao carregar dados do estado</p>
            </div>
        `;
    }
}

/**
 * Renderiza o painel lateral com detalhes do estado
 */
function renderizarPainelEstado(dados) {
    const painelLateral = document.getElementById('painelEstado');
    
    let produtosHTML = '';
    if (dados.produtos && dados.produtos.length > 0) {
        produtosHTML = dados.produtos.map((prod, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${prod.codigo}</td>
                <td>${prod.nome}</td>
                <td class="text-right">${prod.quantidade}</td>
                <td class="text-right">${formatarMoedaRegiao(prod.valor_total)}</td>
            </tr>
        `).join('');
    } else {
        produtosHTML = `
            <tr>
                <td colspan="5" class="text-center">Nenhum produto vendido neste estado</td>
            </tr>
        `;
    }
    
    painelLateral.innerHTML = `
        <div class="painel-header">
            <h3><i class="fas fa-map-marker-alt"></i> ${dados.estado} (${dados.sigla})</h3>
            <button class="btn-fechar-painel" onclick="fecharPainelEstado()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="painel-resumo">
            <div class="resumo-item">
                <span class="resumo-label">Total de Vendas</span>
                <span class="resumo-valor">${dados.total_vendas}</span>
            </div>
            <div class="resumo-item">
                <span class="resumo-label">Valor Total</span>
                <span class="resumo-valor valor-destaque">${formatarMoedaRegiao(dados.valor_total)}</span>
            </div>
        </div>
        <div class="painel-produtos">
            <h4><i class="fas fa-box"></i> Produtos Mais Vendidos</h4>
            <div class="tabela-produtos-estado">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código</th>
                            <th>Produto</th>
                            <th class="text-right">Qtd</th>
                            <th class="text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${produtosHTML}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Fecha o painel lateral
 */
function fecharPainelEstado() {
    const painelLateral = document.getElementById('painelEstado');
    painelLateral.style.display = 'none';
    
    // Remove destaque do estado
    document.querySelectorAll('.estado').forEach(e => {
        e.classList.remove('selecionado');
    });
    
    estadoSelecionado = null;
}


/**
 * Formata valor em moeda brasileira
 */
function formatarMoedaRegiao(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

/**
 * Gera relatório de vendas por região
 */
async function gerarRelatorioRegiao() {
    // Esconde outros relatórios
    document.getElementById('loading').style.display = 'none';
    document.getElementById('loadingIA').style.display = 'none';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('mensagemInicial').style.display = 'none';
    
    // Mostra o relatório de região
    document.getElementById('relatorioRegiaoConteudo').style.display = 'block';
    
    await inicializarMapaRegiao();
    await carregarVendasPorRegiao();
}
