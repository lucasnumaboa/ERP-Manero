/**
 * Módulo de Análise de Preços
 * Pesquisa preços de produtos na internet e usa IA para analisar competitividade
 */

// Variável para controlar o intervalo de verificação de status
let statusCheckInterval = null;

/**
 * Abre a seção de Análise de Preço
 * Se existirem dados, mostra a tabela. Senão, mostra opção de iniciar análise.
 */
async function abrirAnalisePreco() {
    // Esconde todas as outras seções
    document.getElementById('mensagemInicial').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('loadingIA').style.display = 'none';
    document.getElementById('loadingAnalisePreco').style.display = 'none';
    
    // Mostra loading enquanto carrega
    document.getElementById('loading').style.display = 'block';
    
    try {
        // Busca análises existentes
        const response = await apiGet('/api/analise-precos/');
        
        document.getElementById('loading').style.display = 'none';
        
        if (response && response.analises && response.analises.length > 0) {
            // Existem dados, mostra a tabela
            exibirResultadosAnalise(response);
        } else {
            // Não existem dados, pergunta se quer iniciar
            if (confirm('Nenhuma análise de preço encontrada.\n\nDeseja iniciar uma nova pesquisa?\n\nIsso pode levar alguns minutos dependendo da quantidade de produtos.')) {
                iniciarNovaAnalisePreco();
            } else {
                // Volta para mensagem inicial
                document.getElementById('mensagemInicial').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar análises de preço:', error);
        document.getElementById('loading').style.display = 'none';
        
        // Pergunta se quer iniciar nova análise
        if (confirm('Erro ao carregar análises.\n\nDeseja iniciar uma nova pesquisa?')) {
            iniciarNovaAnalisePreco();
        } else {
            document.getElementById('mensagemInicial').style.display = 'block';
        }
    }
}

/**
 * Exibe os resultados da análise na tabela
 */
function exibirResultadosAnalise(response) {
    const analises = response.analises;
    const dataUltima = response.data_ultima_analise;
    
    // Armazena análises para uso no modal
    analisesNaoCompetitivas = analises;
    
    // Verifica permissão para mostrar botão de replicar
    verificarPermissaoReplicarSugestao();
    
    // Atualiza data da última análise
    if (dataUltima) {
        const data = new Date(dataUltima);
        document.getElementById('dataUltimaAnalise').textContent = 
            `Última análise: ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR')}`;
    }
    
    // Calcula totais
    const totalAnalisados = analises.length;
    const totalCompetitivos = analises.filter(a => a.preco_competitivo === 'sim').length;
    const totalNaoCompetitivos = analises.filter(a => a.preco_competitivo === 'nao').length;
    
    // Atualiza cards de resumo
    document.getElementById('totalAnalisados').textContent = totalAnalisados;
    document.getElementById('totalCompetitivos').textContent = totalCompetitivos;
    document.getElementById('totalNaoCompetitivos').textContent = totalNaoCompetitivos;
    
    // Preenche tabela
    const tbody = document.getElementById('bodyAnalisePreco');
    tbody.innerHTML = '';
    
    if (analises.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="mensagem-vazia">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhuma análise encontrada</p>
                </td>
            </tr>
        `;
    } else {
        analises.forEach(analise => {
            const row = document.createElement('tr');
            
            // Determina se é competitivo (normaliza para comparação)
            const isCompetitivo = analise.preco_competitivo && analise.preco_competitivo.toLowerCase() === 'sim';
            
            // Classe de cor para a linha inteira
            const rowClass = isCompetitivo ? 'row-competitivo' : 'row-nao-competitivo';
            row.className = rowClass;
            
            // Badge
            const competitivoClass = isCompetitivo ? 'badge-success' : 'badge-danger';
            const competitivoTexto = isCompetitivo ? 'SIM' : 'NÃO';
            
            // Formata valores
            const precoERP = formatarMoeda(analise.valor_venda_erp);
            const precoSugerido = analise.preco_adequado ? formatarMoeda(analise.preco_adequado) : '-';
            
            // Justificativa completa (sem truncar, mas com tooltip)
            let justificativa = analise.justificativa || '-';
            let justificativaDisplay = justificativa;
            if (justificativa.length > 200) {
                justificativaDisplay = justificativa.substring(0, 200) + '...';
            }
            
            // Parse fontes de pesquisa
            let fontesHtml = '';
            if (analise.fontes_pesquisa) {
                try {
                    // fontes_pesquisa pode ser uma string JSON ou lista
                    let fontes = analise.fontes_pesquisa;
                    if (typeof fontes === 'string') {
                        fontes = fontes.replace(/'/g, '"');
                        fontes = JSON.parse(fontes);
                    }
                    if (Array.isArray(fontes) && fontes.length > 0) {
                        const fontesEscaped = JSON.stringify(fontes).replace(/"/g, '&quot;');
                        fontesHtml = `<i class="fas fa-external-link-alt" style="color: #3498db; cursor: pointer; margin-left: 8px;" onclick="mostrarFontesPesquisa('${analise.titulo_produto.replace(/'/g, "\\'")}', '${fontesEscaped}')" title="Clique para ver as fontes pesquisadas"></i>`;
                    }
                } catch (e) {
                    // Se não conseguir parsear, mostra o texto direto
                    fontesHtml = `<i class="fas fa-external-link-alt" style="color: #3498db; cursor: pointer; margin-left: 8px;" title="Fontes: ${analise.fontes_pesquisa}"></i>`;
                }
            }
            
            row.innerHTML = `
                <td><strong>${analise.titulo_produto}</strong></td>
                <td style="text-align: right;">${precoERP}</td>
                <td style="text-align: center;">
                    <span class="badge ${competitivoClass}">${competitivoTexto}</span>
                </td>
                <td style="text-align: right;">${precoSugerido}</td>
                <td style="font-size: 12px;" title="${justificativa.replace(/"/g, '&quot;')}">${justificativaDisplay}${fontesHtml}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    // Mostra a seção de análise de preço
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'block';
}

/**
 * Formata valor para moeda brasileira
 */
function formatarMoeda(valor) {
    if (!valor && valor !== 0) return '-';
    return parseFloat(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

/**
 * Inicia uma nova análise de preço
 */
async function iniciarNovaAnalisePreco() {
    // Esconde todas as seções
    document.getElementById('mensagemInicial').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('relatorioConteudo').style.display = 'none';
    document.getElementById('relatorioIAConteudo').style.display = 'none';
    document.getElementById('relatorioRegiaoConteudo').style.display = 'none';
    document.getElementById('relatorioAnalisePrecoConteudo').style.display = 'none';
    document.getElementById('loadingIA').style.display = 'none';
    
    // Mostra loading de análise
    document.getElementById('loadingAnalisePreco').style.display = 'block';
    document.getElementById('progressoAnaliseBar').style.width = '0%';
    document.getElementById('progressoAnaliseBar').textContent = '0%';
    document.getElementById('progressoAnaliseTexto').textContent = '0%';
    document.getElementById('produtoAtualAnalise').textContent = 'Iniciando análise...';
    
    try {
        // Inicia a análise no backend
        const response = await apiPost('/api/analise-precos/iniciar', {});
        
        if (response && response.status === 'iniciado') {
            // Mostra mensagem de sucesso
            alert('Análise iniciada!\n\nVocê será notificado quando a análise for concluída.\n\nPode continuar usando o sistema normalmente.');
            
            // Inicia verificação de status
            iniciarVerificacaoStatus();
        } else if (response && response.status === 'em_andamento') {
            alert('Já existe uma análise em andamento.\n\nAguarde a conclusão.');
            iniciarVerificacaoStatus();
        } else {
            throw new Error(response?.message || 'Erro ao iniciar análise');
        }
    } catch (error) {
        console.error('Erro ao iniciar análise de preço:', error);
        alert('Erro ao iniciar análise de preço.\n\n' + (error.message || 'Tente novamente.'));
        
        // Volta para mensagem inicial
        document.getElementById('loadingAnalisePreco').style.display = 'none';
        document.getElementById('mensagemInicial').style.display = 'block';
    }
}

/**
 * Inicia a verificação periódica do status da análise
 */
function iniciarVerificacaoStatus() {
    // Limpa intervalo anterior se existir
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    // Verifica status a cada 5 segundos
    statusCheckInterval = setInterval(async () => {
        try {
            const status = await apiGet('/api/analise-precos/status');
            
            if (status) {
                // Atualiza barra de progresso
                const progresso = status.progresso || 0;
                document.getElementById('progressoAnaliseBar').style.width = `${progresso}%`;
                document.getElementById('progressoAnaliseBar').textContent = `${progresso}%`;
                document.getElementById('progressoAnaliseTexto').textContent = `${progresso}%`;
                
                if (status.produto_atual) {
                    document.getElementById('produtoAtualAnalise').textContent = 
                        `Analisando: ${status.produto_atual}`;
                }
                
                // Verifica se concluiu
                if (status.status === 'concluido') {
                    clearInterval(statusCheckInterval);
                    statusCheckInterval = null;
                    
                    // Carrega resultados
                    document.getElementById('loadingAnalisePreco').style.display = 'none';
                    abrirAnalisePreco();
                } else if (status.status === 'erro') {
                    clearInterval(statusCheckInterval);
                    statusCheckInterval = null;
                    
                    alert('Erro na análise: ' + (status.mensagem || 'Erro desconhecido'));
                    document.getElementById('loadingAnalisePreco').style.display = 'none';
                    document.getElementById('mensagemInicial').style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, 5000);
}

/**
 * Para a verificação de status
 */
function pararVerificacaoStatus() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

// Variável para armazenar análises não competitivas
let analisesNaoCompetitivas = [];

/**
 * Verifica permissão e mostra/esconde botão de replicar sugestão
 */
async function verificarPermissaoReplicarSugestao() {
    try {
        const temPermissao = await hasPermission('produto_editar');
        const btn = document.getElementById('btnReplicarSugestao');
        if (btn) {
            btn.style.display = temPermissao ? 'inline-flex' : 'none';
        }
    } catch (error) {
        console.error('Erro ao verificar permissão:', error);
    }
}

/**
 * Abre o modal para replicar sugestões de preço
 */
function abrirModalReplicarSugestao() {
    const tbody = document.getElementById('bodyReplicarPrecos');
    tbody.innerHTML = '';
    
    // Filtra apenas os não competitivos com preço sugerido
    const naoCompetitivos = analisesNaoCompetitivas.filter(a => 
        a.preco_competitivo && a.preco_competitivo.toLowerCase() !== 'sim' && a.preco_adequado
    );
    
    if (naoCompetitivos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted, #666);">
                    <i class="fas fa-check-circle" style="font-size: 24px; color: #27ae60;"></i>
                    <p>Todos os preços estão competitivos!</p>
                </td>
            </tr>
        `;
        document.getElementById('selecionarTodosPrecos').style.display = 'none';
    } else {
        document.getElementById('selecionarTodosPrecos').style.display = 'inline';
        document.getElementById('selecionarTodosPrecos').checked = false;
        
        naoCompetitivos.forEach(analise => {
            const row = document.createElement('tr');
            
            const precoAtual = analise.valor_venda_erp;
            const precoSugerido = analise.preco_adequado;
            const diferenca = precoSugerido - precoAtual;
            const diferencaPercent = ((diferenca / precoAtual) * 100).toFixed(1);
            const diferencaClass = diferenca > 0 ? 'color: #27ae60;' : 'color: #e74c3c;';
            const diferencaSinal = diferenca > 0 ? '+' : '';
            
            row.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="checkbox-replicar" data-produto-id="${analise.produto_id}" data-preco-sugerido="${precoSugerido}">
                </td>
                <td><strong>${analise.titulo_produto}</strong></td>
                <td style="text-align: right;">${formatarMoeda(precoAtual)}</td>
                <td style="text-align: right; color: #27ae60; font-weight: 600;">${formatarMoeda(precoSugerido)}</td>
                <td style="text-align: right; ${diferencaClass}">${diferencaSinal}${formatarMoeda(diferenca)} (${diferencaSinal}${diferencaPercent}%)</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('modalReplicarSugestao').style.display = 'flex';
}

/**
 * Fecha o modal de replicar sugestão
 */
function fecharModalReplicarSugestao() {
    document.getElementById('modalReplicarSugestao').style.display = 'none';
    resetarModalReplicar();
}

/**
 * Toggle selecionar todos os checkboxes
 */
function toggleSelecionarTodosPrecos() {
    const selecionarTodos = document.getElementById('selecionarTodosPrecos').checked;
    const checkboxes = document.querySelectorAll('.checkbox-replicar');
    checkboxes.forEach(cb => cb.checked = selecionarTodos);
}

/**
 * Confirma e aplica as alterações de preço com barra de progresso
 */
async function confirmarReplicarSugestao() {
    const checkboxes = document.querySelectorAll('.checkbox-replicar:checked');
    
    if (checkboxes.length === 0) {
        alert('Selecione pelo menos um produto para atualizar.');
        return;
    }
    
    const produtos = [];
    checkboxes.forEach(cb => {
        // Busca o nome do produto na linha da tabela
        const row = cb.closest('tr');
        const nomeProduto = row ? row.querySelector('td:nth-child(2) strong')?.textContent : 'Produto';
        
        produtos.push({
            produto_id: parseInt(cb.dataset.produtoId),
            preco_sugerido: parseFloat(cb.dataset.precoSugerido),
            nome: nomeProduto
        });
    });
    
    if (!confirm(`Deseja realmente atualizar o preço de ${produtos.length} produto(s)?`)) {
        return;
    }
    
    // Mostra barra de progresso e esconde botões
    document.getElementById('progressoReplicar').style.display = 'block';
    document.getElementById('botoesReplicar').style.display = 'none';
    document.getElementById('selecionarTodosPrecos').disabled = true;
    
    // Desabilita checkboxes
    document.querySelectorAll('.checkbox-replicar').forEach(cb => cb.disabled = true);
    
    let atualizados = 0;
    let erros = 0;
    const total = produtos.length;
    
    try {
        for (let i = 0; i < produtos.length; i++) {
            const produto = produtos[i];
            const progresso = Math.round(((i + 1) / total) * 100);
            
            // Atualiza barra de progresso
            document.getElementById('progressoReplicarBar').style.width = `${progresso}%`;
            document.getElementById('progressoReplicarBar').textContent = `${progresso}%`;
            document.getElementById('progressoReplicarTexto').textContent = `${progresso}%`;
            document.getElementById('produtoAtualReplicar').textContent = `Atualizando: ${produto.nome} (${i + 1}/${total})`;
            
            try {
                // Envia um produto por vez
                const response = await apiPost('/api/analise-precos/replicar-sugestao', { 
                    produtos: [{ produto_id: produto.produto_id, preco_sugerido: produto.preco_sugerido }] 
                });
                
                if (response && response.atualizados > 0) {
                    atualizados++;
                    // Marca a linha como atualizada (verde)
                    const checkbox = document.querySelector(`.checkbox-replicar[data-produto-id="${produto.produto_id}"]`);
                    if (checkbox) {
                        const row = checkbox.closest('tr');
                        if (row) {
                            row.style.backgroundColor = 'rgba(39, 174, 96, 0.3)';
                        }
                    }
                } else {
                    erros++;
                }
            } catch (error) {
                console.error(`Erro ao atualizar produto ${produto.produto_id}:`, error);
                erros++;
            }
            
            // Pequeno delay entre atualizações para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Finaliza
        document.getElementById('produtoAtualReplicar').textContent = `Concluído! ${atualizados} atualizado(s), ${erros} erro(s)`;
        
        // Aguarda um pouco para o usuário ver o resultado
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (atualizados > 0) {
            alert(`${atualizados} produto(s) atualizado(s) com sucesso!${erros > 0 ? ` (${erros} erro(s))` : ''}`);
            fecharModalReplicarSugestao();
            // Recarrega a análise para mostrar os novos valores
            abrirAnalisePreco();
        } else {
            alert('Nenhum produto foi atualizado. Verifique se você tem permissão.');
            resetarModalReplicar();
        }
    } catch (error) {
        console.error('Erro ao replicar sugestão:', error);
        alert('Erro ao atualizar preços: ' + (error.message || 'Tente novamente.'));
        resetarModalReplicar();
    }
}

/**
 * Reseta o modal de replicar para o estado inicial
 */
function resetarModalReplicar() {
    document.getElementById('progressoReplicar').style.display = 'none';
    document.getElementById('botoesReplicar').style.display = 'flex';
    document.getElementById('selecionarTodosPrecos').disabled = false;
    document.getElementById('progressoReplicarBar').style.width = '0%';
    document.getElementById('progressoReplicarBar').textContent = '0%';
    document.getElementById('progressoReplicarTexto').textContent = '0%';
    document.getElementById('produtoAtualReplicar').textContent = '';
    
    // Reabilita checkboxes
    document.querySelectorAll('.checkbox-replicar').forEach(cb => cb.disabled = false);
}

/**
 * Mostra popup com as fontes pesquisadas
 */
function mostrarFontesPesquisa(produto, fontesJson) {
    try {
        const fontes = JSON.parse(fontesJson.replace(/&quot;/g, '"'));
        
        // Cria lista de links
        let linksHtml = fontes.map(fonte => {
            // Gera URL de busca no Google para cada fonte
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(produto + ' ' + fonte)}`;
            return `<li style="margin-bottom: 8px;">
                <a href="${searchUrl}" target="_blank" style="color: #3498db; text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> ${fonte}
                </a>
            </li>`;
        }).join('');
        
        // Cria e mostra o modal
        const modalHtml = `
            <div id="modalFontesPesquisa" class="modal" style="display: flex; z-index: 10001;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-search"></i> Fontes Pesquisadas</h3>
                        <button class="close-modal" onclick="fecharModalFontes()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 10px; color: var(--text-muted, #666);">
                            <strong>Produto:</strong> ${produto}
                        </p>
                        <p style="margin-bottom: 15px; color: var(--text-muted, #666);">
                            Clique em uma fonte para pesquisar no Google:
                        </p>
                        <ul style="list-style: none; padding: 0;">
                            ${linksHtml}
                        </ul>
                    </div>
                    <div class="modal-footer" style="padding-top: 15px; border-top: 1px solid var(--border-color, #ddd);">
                        <button class="btn-cancelar" onclick="fecharModalFontes()">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove modal anterior se existir
        const existente = document.getElementById('modalFontesPesquisa');
        if (existente) existente.remove();
        
        // Adiciona ao body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (e) {
        console.error('Erro ao mostrar fontes:', e);
        alert('Erro ao carregar fontes de pesquisa.');
    }
}

/**
 * Fecha o modal de fontes
 */
function fecharModalFontes() {
    const modal = document.getElementById('modalFontesPesquisa');
    if (modal) modal.remove();
}

// Exporta funções para uso global
window.abrirAnalisePreco = abrirAnalisePreco;
window.iniciarNovaAnalisePreco = iniciarNovaAnalisePreco;
window.abrirModalReplicarSugestao = abrirModalReplicarSugestao;
window.fecharModalReplicarSugestao = fecharModalReplicarSugestao;
window.toggleSelecionarTodosPrecos = toggleSelecionarTodosPrecos;
window.confirmarReplicarSugestao = confirmarReplicarSugestao;
window.mostrarFontesPesquisa = mostrarFontesPesquisa;
window.fecharModalFontes = fecharModalFontes;

console.log('[Análise Preços] Módulo carregado');
