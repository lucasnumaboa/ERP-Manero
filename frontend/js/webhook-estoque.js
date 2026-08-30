/**
 * Sistema de Webhook para Notificação de Movimentação de Estoque
 * 
 * Este módulo envia notificações via webhook para vendedores ativos
 * quando há entrada ou saída de produtos no estoque.
 * 
 * Configurações necessárias (em Configurações > Configurações):
 * - webhook_url: URL do webhook (ex: https://api.exemplo.com/webhook)
 * - webhook_ativo: true/false para ativar/desativar
 */

// Cache das configurações de webhook
let webhookConfig = null;

/**
 * Carrega as configurações de webhook do banco de dados
 * @returns {Promise<{url: string, ativo: boolean}>}
 */
async function carregarConfiguracoesWebhook() {
    try {
        const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
        
        const webhookUrl = configuracoes.find(c => c.chave === 'webhook_url');
        const webhookAtivo = configuracoes.find(c => c.chave === 'webhook_ativo');
        
        webhookConfig = {
            url: webhookUrl ? webhookUrl.valor : '',
            ativo: webhookAtivo ? webhookAtivo.valor === 'true' : false
        };
        
        console.log('[Webhook] Configurações carregadas:', webhookConfig);
        return webhookConfig;
    } catch (error) {
        console.error('[Webhook] Erro ao carregar configurações:', error);
        webhookConfig = { url: '', ativo: false };
        return webhookConfig;
    }
}

/**
 * Busca todos os vendedores ativos que possuem telefone
 * @returns {Promise<Array>}
 */
async function buscarVendedoresAtivosComTelefone() {
    try {
        const vendedores = await apiGet('/api/vendedores', { ativo: true });
        
        // Filtra apenas vendedores com telefone preenchido
        const vendedoresComTelefone = vendedores.filter(v => v.telefone && v.telefone.trim() !== '');
        
        console.log(`[Webhook] Vendedores ativos com telefone: ${vendedoresComTelefone.length}`);
        return vendedoresComTelefone;
    } catch (error) {
        console.error('[Webhook] Erro ao buscar vendedores:', error);
        return [];
    }
}

/**
 * Formata o valor em moeda brasileira
 * @param {number} valor 
 * @returns {string}
 */
function formatarMoedaWebhook(valor) {
    if (!valor) return 'R$ 0,00';
    return parseFloat(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

/**
 * Monta a mensagem de notificação para um produto
 * @param {string} tipoMovimento - 'entrada' ou 'saida'
 * @param {number} quantidade 
 * @param {object} produto - Objeto com nome, preco_venda, descricao, comissao
 * @param {object} dadosPedido - Dados adicionais do pedido (comissao_total, vendedor_nome)
 * @returns {string}
 */
function montarMensagemProduto(tipoMovimento, quantidade, produto, dadosPedido = {}) {
    const emoji = tipoMovimento === 'entrada' ? '📦➡️' : '📦⬅️';
    const acao = tipoMovimento === 'entrada' ? 'ENTROU' : 'SAIU';
    
    let mensagem = `${emoji} *${acao}* ${quantidade} unidade(s) do produto:\n\n`;
    
    // Adiciona informações do pedido (vendedor e comissão)
    if (dadosPedido.vendedor_nome) {
        mensagem += `👤 *Vendedor:* ${dadosPedido.vendedor_nome}\n`;
    }
    if (dadosPedido.comissao_total && dadosPedido.comissao_total > 0) {
        mensagem += `💵 *Comissão do Pedido:* ${formatarMoedaWebhook(dadosPedido.comissao_total)}\n`;
    }
    if (dadosPedido.vendedor_nome || (dadosPedido.comissao_total && dadosPedido.comissao_total > 0)) {
        mensagem += `\n`;
    }
    
    mensagem += `📌 *Nome:* ${produto.nome || 'N/A'}\n`;
    mensagem += `💰 *Preço:* ${formatarMoedaWebhook(produto.preco_venda)}\n`;
    
    // Adiciona estoque disponível
    const estoqueDisponivel = produto.estoque_atual !== undefined ? produto.estoque_atual : 'N/A';
    mensagem += `📊 *Estoque Disponível:* ${estoqueDisponivel} unidade(s)\n`;
    
    // Adiciona comissão se existir
    if (produto.comissao && produto.comissao > 0) {
        mensagem += `💵 *Comissão:* ${formatarMoedaWebhook(produto.comissao)}\n`;
    }
    
    return mensagem;
}

/**
 * Monta a mensagem de notificação para múltiplos produtos
 * @param {string} tipoMovimento - 'entrada' ou 'saida'
 * @param {Array} produtos - Array de objetos {produto, quantidade}
 * @param {object} dadosPedido - Dados adicionais do pedido (comissao_total, vendedor_nome)
 * @returns {string}
 */
function montarMensagemMultiplosProdutos(tipoMovimento, produtos, dadosPedido = {}) {
    const emoji = tipoMovimento === 'entrada' ? '📦➡️' : '📦⬅️';
    const acao = tipoMovimento === 'entrada' ? 'ENTRARAM' : 'SAÍRAM';
    
    let mensagem = `${emoji} *${acao}* ${produtos.length} produto(s):\n\n`;
    
    // Adiciona informações do pedido (vendedor e comissão)
    if (dadosPedido.vendedor_nome) {
        mensagem += `👤 *Vendedor:* ${dadosPedido.vendedor_nome}\n`;
    }
    if (dadosPedido.comissao_total && dadosPedido.comissao_total > 0) {
        mensagem += `💵 *Comissão do Pedido:* ${formatarMoedaWebhook(dadosPedido.comissao_total)}\n`;
    }
    if (dadosPedido.vendedor_nome || (dadosPedido.comissao_total && dadosPedido.comissao_total > 0)) {
        mensagem += `\n`;
    }
    
    produtos.forEach((item, index) => {
        mensagem += `━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `*${index + 1}.* ${item.produto.nome || 'N/A'}\n`;
        mensagem += `   📊 Qtd: ${item.quantidade}\n`;
        mensagem += `   💰 Preço: ${formatarMoedaWebhook(item.produto.preco_venda)}\n`;
        // Adiciona estoque disponível
        const estoqueDisponivel = item.produto.estoque_atual !== undefined ? item.produto.estoque_atual : 'N/A';
        mensagem += `   🏷️ Estoque: ${estoqueDisponivel} un.\n`;
        // Adiciona comissão se existir
        if (item.produto.comissao && item.produto.comissao > 0) {
            mensagem += `   💵 Comissão: ${formatarMoedaWebhook(item.produto.comissao)}\n`;
        }
    });
    
    mensagem += `━━━━━━━━━━━━━━━━━━`;
    
    return mensagem;
}

/**
 * Envia uma mensagem via webhook para um vendedor específico
 * @param {string} webhookUrl - URL do webhook
 * @param {string} telefone - Telefone do vendedor
 * @param {string} mensagem - Mensagem a ser enviada
 * @returns {Promise<boolean>}
 */
async function enviarWebhook(webhookUrl, telefone, mensagem) {
    try {
        const payload = {
            telefone: telefone,
            mensagem: mensagem,
            timestamp: new Date().toISOString()
        };
        
        console.log(`[Webhook] Enviando para ${telefone}...`);
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`[Webhook] Enviado com sucesso para ${telefone}`);
            return true;
        } else {
            console.error(`[Webhook] Erro ao enviar para ${telefone}: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`[Webhook] Erro ao enviar para ${telefone}:`, error);
        return false;
    }
}

/**
 * Notifica todos os vendedores ativos sobre movimentação de estoque
 * @param {string} tipoMovimento - 'entrada' ou 'saida'
 * @param {Array} produtos - Array de objetos {produto, quantidade}
 * @param {object} dadosPedido - Dados adicionais do pedido (comissao_total, vendedor_nome)
 * @returns {Promise<{sucesso: number, falha: number}>}
 */
async function notificarVendedoresMovimentacao(tipoMovimento, produtos, dadosPedido = {}) {
    // Carrega configurações se ainda não foram carregadas
    if (!webhookConfig) {
        await carregarConfiguracoesWebhook();
    }
    
    // Verifica se o webhook está ativo
    if (!webhookConfig.ativo) {
        console.log('[Webhook] Webhook desativado, notificação ignorada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Verifica se a URL está configurada
    if (!webhookConfig.url || webhookConfig.url.trim() === '') {
        console.log('[Webhook] URL do webhook não configurada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Busca vendedores ativos com telefone
    const vendedores = await buscarVendedoresAtivosComTelefone();
    
    if (vendedores.length === 0) {
        console.log('[Webhook] Nenhum vendedor ativo com telefone encontrado');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Monta a mensagem
    let mensagem;
    if (produtos.length === 1) {
        mensagem = montarMensagemProduto(tipoMovimento, produtos[0].quantidade, produtos[0].produto, dadosPedido);
    } else {
        mensagem = montarMensagemMultiplosProdutos(tipoMovimento, produtos, dadosPedido);
    }
    
    // Envia para cada vendedor
    let sucesso = 0;
    let falha = 0;
    
    for (const vendedor of vendedores) {
        const resultado = await enviarWebhook(webhookConfig.url, vendedor.telefone, mensagem);
        if (resultado) {
            sucesso++;
        } else {
            falha++;
        }
        
        // Pequeno delay entre envios para não sobrecarregar o webhook
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[Webhook] Notificações enviadas: ${sucesso} sucesso, ${falha} falha`);
    return { sucesso, falha, ignorado: false };
}

/**
 * Notifica sobre entrada de produtos (compras recebidas)
 * Envia apenas produtos com faturavel = TRUE
 * @param {Array} itens - Array de itens da compra com produto_id e quantidade
 * @returns {Promise}
 */
async function notificarEntradaProdutos(itens) {
    if (!itens || itens.length === 0) {
        console.log('[Webhook] Nenhum item para notificar entrada');
        return;
    }
    
    try {
        // Busca os dados completos de cada produto
        const produtos = [];
        for (const item of itens) {
            try {
                const produto = await apiGet(`/api/produtos/${item.produto_id}`);
                // Filtra apenas produtos faturáveis (faturavel = true ou undefined/null para compatibilidade)
                if (produto.faturavel === true || produto.faturavel === undefined || produto.faturavel === null) {
                    produtos.push({
                        produto: produto,
                        quantidade: item.quantidade
                    });
                } else {
                    console.log(`[Webhook] Produto ${produto.nome} ignorado (não faturável)`);
                }
            } catch (error) {
                console.error(`[Webhook] Erro ao buscar produto ${item.produto_id}:`, error);
            }
        }
        
        if (produtos.length > 0) {
            await notificarVendedoresMovimentacao('entrada', produtos);
        } else {
            console.log('[Webhook] Nenhum produto faturável para notificar entrada');
        }
    } catch (error) {
        console.error('[Webhook] Erro ao notificar entrada de produtos:', error);
    }
}

/**
 * Notifica sobre saída de produtos (vendas)
 * Envia apenas produtos com faturavel = TRUE
 * @param {Array} itens - Array de itens da venda com produto_id e quantidade
 * @param {object} dadosPedido - Dados adicionais do pedido (comissao_total, vendedor_nome)
 * @returns {Promise}
 */
async function notificarSaidaProdutos(itens, dadosPedido = {}) {
    if (!itens || itens.length === 0) {
        console.log('[Webhook] Nenhum item para notificar saída');
        return;
    }
    
    console.log('[Webhook] Dados do pedido recebidos:', dadosPedido);
    
    try {
        // Busca os dados completos de cada produto
        const produtos = [];
        for (const item of itens) {
            try {
                const produto = await apiGet(`/api/produtos/${item.produto_id}`);
                // Filtra apenas produtos faturáveis (faturavel = true ou undefined/null para compatibilidade)
                if (produto.faturavel === true || produto.faturavel === undefined || produto.faturavel === null) {
                    produtos.push({
                        produto: produto,
                        quantidade: item.quantidade
                    });
                } else {
                    console.log(`[Webhook] Produto ${produto.nome} ignorado (não faturável)`);
                }
            } catch (error) {
                console.error(`[Webhook] Erro ao buscar produto ${item.produto_id}:`, error);
            }
        }
        
        if (produtos.length > 0) {
            await notificarVendedoresMovimentacao('saida', produtos, dadosPedido);
        } else {
            console.log('[Webhook] Nenhum produto faturável para notificar saída');
        }
    } catch (error) {
        console.error('[Webhook] Erro ao notificar saída de produtos:', error);
    }
}

/**
 * Monta a mensagem de notificação para movimentação manual
 * @param {string} tipo - 'entrada' ou 'saida'
 * @param {number} quantidade 
 * @param {object} produto - Objeto com nome, preco_venda, descricao
 * @param {string} motivo - Motivo da movimentação
 * @returns {string}
 */
function montarMensagemMovimentacaoManual(tipo, quantidade, produto, motivo) {
    const emoji = tipo === 'entrada' ? '📦➡️' : '📦⬅️';
    const acao = tipo === 'entrada' ? 'ENTRADA MANUAL' : 'SAÍDA MANUAL';
    const tipoTexto = tipo === 'entrada' ? 'Entrada' : 'Saída';
    
    let mensagem = `${emoji} *${acao}*\n\n`;
    mensagem += `📋 *Tipo:* ${tipoTexto}\n`;
    mensagem += `📊 *Quantidade:* ${quantidade} unidade(s)\n`;
    mensagem += `📌 *Produto:* ${produto.nome || 'N/A'}\n`;
    mensagem += `💰 *Preço:* ${formatarMoedaWebhook(produto.preco_venda)}\n`;
    
    // Adiciona estoque disponível
    const estoqueDisponivel = produto.estoque_atual !== undefined ? produto.estoque_atual : 'N/A';
    mensagem += `🏷️ *Estoque Disponível:* ${estoqueDisponivel} unidade(s)\n`;
    
    if (motivo && motivo.trim() !== '') {
        mensagem += `📝 *Motivo:* ${motivo}\n`;
    }
    
    mensagem += `\n⏰ *Data/Hora:* ${new Date().toLocaleString('pt-BR')}`;
    
    return mensagem;
}

/**
 * Notifica sobre movimentação manual de estoque
 * Envia apenas se o produto tiver faturavel = TRUE
 * @param {string} tipo - 'entrada' ou 'saida'
 * @param {number} produtoId - ID do produto
 * @param {number} quantidade - Quantidade movimentada
 * @param {string} motivo - Motivo da movimentação
 * @returns {Promise}
 */
async function notificarMovimentacaoManual(tipo, produtoId, quantidade, motivo) {
    // Carrega configurações se ainda não foram carregadas
    if (!webhookConfig) {
        await carregarConfiguracoesWebhook();
    }
    
    // Verifica se o webhook está ativo
    if (!webhookConfig.ativo) {
        console.log('[Webhook] Webhook desativado, notificação ignorada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Verifica se a URL está configurada
    if (!webhookConfig.url || webhookConfig.url.trim() === '') {
        console.log('[Webhook] URL do webhook não configurada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    try {
        const produto = await apiGet(`/api/produtos/${produtoId}`);
        
        // Filtra apenas produtos faturáveis (faturavel = true ou undefined/null para compatibilidade)
        if (produto.faturavel === false) {
            console.log(`[Webhook] Produto ${produto.nome} ignorado (não faturável)`);
            return { sucesso: 0, falha: 0, ignorado: true };
        }
        
        // Busca vendedores ativos com telefone
        const vendedores = await buscarVendedoresAtivosComTelefone();
        
        if (vendedores.length === 0) {
            console.log('[Webhook] Nenhum vendedor ativo com telefone encontrado');
            return { sucesso: 0, falha: 0, ignorado: true };
        }
        
        // Monta a mensagem específica para movimentação manual
        const mensagem = montarMensagemMovimentacaoManual(tipo, quantidade, produto, motivo);
        
        // Envia para cada vendedor
        let sucesso = 0;
        let falha = 0;
        
        for (const vendedor of vendedores) {
            const resultado = await enviarWebhook(webhookConfig.url, vendedor.telefone, mensagem);
            if (resultado) {
                sucesso++;
            } else {
                falha++;
            }
            
            // Pequeno delay entre envios para não sobrecarregar o webhook
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`[Webhook] Notificações de movimentação manual enviadas: ${sucesso} sucesso, ${falha} falha`);
        return { sucesso, falha, ignorado: false };
    } catch (error) {
        console.error('[Webhook] Erro ao notificar movimentação manual:', error);
    }
}

/**
 * Força o recarregamento das configurações de webhook
 * Útil quando as configurações são alteradas
 */
async function recarregarConfiguracoesWebhook() {
    webhookConfig = null;
    return await carregarConfiguracoesWebhook();
}

/**
 * Monta a mensagem de notificação para alteração de preço
 * @param {object} produto - Objeto com nome, codigo, preco_venda, comissao
 * @param {number} precoAnterior - Preço anterior
 * @param {number} precoNovo - Novo preço
 * @returns {string}
 */
function montarMensagemAlteracaoPreco(produto, precoAnterior, precoNovo) {
    const diferenca = precoNovo - precoAnterior;
    const percentual = precoAnterior > 0 ? ((diferenca / precoAnterior) * 100).toFixed(1) : 0;
    const emoji = diferenca > 0 ? '📈' : '📉';
    const direcao = diferenca > 0 ? 'AUMENTO' : 'REDUÇÃO';
    
    let mensagem = `${emoji} *ALTERAÇÃO DE PREÇO - ${direcao}*\n\n`;
    mensagem += `📌 *Produto:* ${produto.nome || 'N/A'}\n`;
    if (produto.codigo) {
        mensagem += `🏷️ *Código:* ${produto.codigo}\n`;
    }
    mensagem += `\n`;
    mensagem += `💰 *Preço Anterior:* ${formatarMoedaWebhook(precoAnterior)}\n`;
    mensagem += `💵 *Preço Novo:* ${formatarMoedaWebhook(precoNovo)}\n`;
    mensagem += `${emoji} *Diferença:* ${diferenca > 0 ? '+' : ''}${formatarMoedaWebhook(diferenca)} (${diferenca > 0 ? '+' : ''}${percentual}%)\n`;
    
    // Adiciona comissão se existir
    if (produto.comissao && produto.comissao > 0) {
        mensagem += `\n💵 *Comissão:* ${formatarMoedaWebhook(produto.comissao)}\n`;
    }
    
    // Adiciona estoque disponível se existir
    if (produto.estoque_atual !== undefined) {
        mensagem += `📊 *Estoque Disponível:* ${produto.estoque_atual} unidade(s)\n`;
    }
    
    mensagem += `\n⏰ *Data/Hora:* ${new Date().toLocaleString('pt-BR')}`;
    
    return mensagem;
}

/**
 * Notifica sobre alteração de preço de um produto
 * Envia apenas se o produto tiver faturavel = TRUE
 * @param {object} produto - Dados do produto (id, nome, codigo, preco_venda, comissao, faturavel, estoque_atual)
 * @param {number} precoAnterior - Preço anterior
 * @param {number} precoNovo - Novo preço
 * @returns {Promise}
 */
async function notificarAlteracaoPreco(produto, precoAnterior, precoNovo) {
    // Não notifica se o preço não mudou
    if (precoAnterior === precoNovo) {
        console.log('[Webhook] Preço não alterado, notificação ignorada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Carrega configurações se ainda não foram carregadas
    if (!webhookConfig) {
        await carregarConfiguracoesWebhook();
    }
    
    // Verifica se o webhook está ativo
    if (!webhookConfig.ativo) {
        console.log('[Webhook] Webhook desativado, notificação ignorada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Verifica se a URL está configurada
    if (!webhookConfig.url || webhookConfig.url.trim() === '') {
        console.log('[Webhook] URL do webhook não configurada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    // Filtra apenas produtos faturáveis (faturavel = true ou undefined/null para compatibilidade)
    if (produto.faturavel === false) {
        console.log(`[Webhook] Produto ${produto.nome} ignorado (não faturável)`);
        return { sucesso: 0, falha: 0, ignorado: true };
    }
    
    try {
        // Busca vendedores ativos com telefone
        const vendedores = await buscarVendedoresAtivosComTelefone();
        
        if (vendedores.length === 0) {
            console.log('[Webhook] Nenhum vendedor ativo com telefone encontrado');
            return { sucesso: 0, falha: 0, ignorado: true };
        }
        
        // Monta a mensagem específica para alteração de preço
        const mensagem = montarMensagemAlteracaoPreco(produto, precoAnterior, precoNovo);
        
        // Envia para cada vendedor
        let sucesso = 0;
        let falha = 0;
        
        for (const vendedor of vendedores) {
            const resultado = await enviarWebhook(webhookConfig.url, vendedor.telefone, mensagem);
            if (resultado) {
                sucesso++;
            } else {
                falha++;
            }
            
            // Pequeno delay entre envios para não sobrecarregar o webhook
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`[Webhook] Notificações de alteração de preço enviadas: ${sucesso} sucesso, ${falha} falha`);
        return { sucesso, falha, ignorado: false };
    } catch (error) {
        console.error('[Webhook] Erro ao notificar alteração de preço:', error);
        return { sucesso: 0, falha: 0, erro: error.message };
    }
}

/**
 * Notifica sobre envio ou atualização de software
 * @param {string} nomeArquivo - Nome do arquivo
 * @param {number} versao - Número da versão
 * @param {string} descricao - Descrição ou alterações da versão
 * @returns {Promise}
 */
async function notificarNovoSoftware(nomeArquivo, versao, descricao) {
    if (!webhookConfig) {
        await carregarConfiguracoesWebhook();
    }

    if (!webhookConfig.ativo) {
        console.log('[Webhook] Webhook desativado, notificação ignorada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }

    if (!webhookConfig.url || webhookConfig.url.trim() === '') {
        console.log('[Webhook] URL do webhook não configurada');
        return { sucesso: 0, falha: 0, ignorado: true };
    }

    try {
        const vendedores = await buscarVendedoresAtivosComTelefone();

        if (vendedores.length === 0) {
            console.log('[Webhook] Nenhum vendedor ativo com telefone encontrado');
            return { sucesso: 0, falha: 0, ignorado: true };
        }

        const emoji = versao > 1 ? '🔄' : '🚀';
        const acao = versao > 1 ? `ATUALIZAÇÃO - v${versao}` : 'NOVO SOFTWARE';

        let mensagem = `${emoji} *SOFTWARE - ${acao}*\n\n`;
        mensagem += `📦 *Arquivo:* ${nomeArquivo}\n`;
        mensagem += `🏷️ *Versão:* v${versao}\n`;
        if (descricao && descricao.trim()) {
            mensagem += `📝 *Descrição:* ${descricao.trim()}\n`;
        }
        mensagem += `\n⏰ *Data/Hora:* ${new Date().toLocaleString('pt-BR')}`;

        let sucesso = 0;
        let falha = 0;

        for (const vendedor of vendedores) {
            const resultado = await enviarWebhook(webhookConfig.url, vendedor.telefone, mensagem);
            if (resultado) {
                sucesso++;
            } else {
                falha++;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`[Webhook] Notificações de software enviadas: ${sucesso} sucesso, ${falha} falha`);
        return { sucesso, falha, ignorado: false };
    } catch (error) {
        console.error('[Webhook] Erro ao notificar software:', error);
        return { sucesso: 0, falha: 0, erro: error.message };
    }
}

// Exporta as funções para uso global
window.webhookEstoque = {
    notificarEntradaProdutos,
    notificarSaidaProdutos,
    notificarMovimentacaoManual,
    notificarAlteracaoPreco,
    notificarNovoSoftware,
    recarregarConfiguracoesWebhook,
    carregarConfiguracoesWebhook
};

console.log('[Webhook] Módulo de webhook de estoque carregado');
