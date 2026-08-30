/**
 * Integração com OpenRouter para geração de relatórios por IA
 * Utiliza a API do OpenRouter para gerar análises inteligentes de vendas, estoque e recomendações
 */

// Variável para armazenar configurações de IA
let configuracoesIA = null;

// Função para carregar configurações de IA (suporta OpenRouter, Ollama e LM Studio)
async function carregarConfiguracoeIA() {
    try {
        const configuracoes = await apiGet('/api/configuracoes/configuracoes/');
        configuracoesIA = {
            provider: configuracoes.find(c => c.chave === 'ia_provider')?.valor || 'openrouter',
            // OpenRouter
            apikey: configuracoes.find(c => c.chave === 'apikey_openrouter')?.valor || '',
            model: configuracoes.find(c => c.chave === 'model_openrouter')?.valor || 'openai/gpt-oss-20b:free',
            // Ollama
            ollama_model: configuracoes.find(c => c.chave === 'ollama_model')?.valor || 'llama3',
            ollama_url: configuracoes.find(c => c.chave === 'ollama_url')?.valor || 'http://localhost:11434',
            ollama_apikey: configuracoes.find(c => c.chave === 'ollama_apikey')?.valor || '',
            // LM Studio
            lmstudio_model: configuracoes.find(c => c.chave === 'lmstudio_model')?.valor || 'default',
            lmstudio_url: configuracoes.find(c => c.chave === 'lmstudio_url')?.valor || 'http://localhost:1234',
            lmstudio_apikey: configuracoes.find(c => c.chave === 'lmstudio_apikey')?.valor || '',
            // Think (desabilitar modo de raciocínio)
            ia_think: configuracoes.find(c => c.chave === 'ia_think')?.valor || 'yes'
        };

        console.log(`[IA] Provider configurado: ${configuracoesIA.provider}`);

        if (configuracoesIA.provider === 'openrouter' && !configuracoesIA.apikey) {
            console.warn('API Key do OpenRouter não configurada');
        }

        return configuracoesIA;
    } catch (error) {
        console.error('Erro ao carregar configurações de IA:', error);
        return null;
    }
}

// Função para fazer chamada à IA com suporte a múltiplos providers
async function chamarIA(prompt, delay = 5000, maxRetries = 3) {
    let lastError = null;

    for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
        try {
            if (!configuracoesIA) {
                await carregarConfiguracoeIA();
            }

            const provider = configuracoesIA.provider || 'openrouter';

            // Validações por provider
            if (provider === 'openrouter' && !configuracoesIA.apikey) {
                throw new Error('API Key do OpenRouter não configurada. Verifique as configurações do sistema.');
            }

            // Aguardar delay
            await new Promise(resolve => setTimeout(resolve, delay));

            console.log(`[IA] Tentativa ${tentativa}/${maxRetries} - Chamando ${provider}...`);

            let response;
            let content;

            if (provider === 'openrouter') {
                // ===== OPENROUTER =====
                response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${configuracoesIA.apikey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'ERP Maneiro'
                    },
                    body: JSON.stringify({
                        model: configuracoesIA.model,
                        messages: [{ role: 'user', content: prompt }],
                        stream: false,
                        temperature: 0.7,
                        max_tokens: 2000
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Erro da API OpenRouter: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                content = data.choices[0].message.content;

            } else if (provider === 'ollama') {
                // ===== OLLAMA =====
                const ollamaUrl = configuracoesIA.ollama_url || 'http://localhost:11434';
                const ollamaHeaders = { 'Content-Type': 'application/json' };
                if (configuracoesIA.ollama_apikey) {
                    ollamaHeaders['Authorization'] = `Bearer ${configuracoesIA.ollama_apikey}`;
                }
                const ollamaBody = {
                    model: configuracoesIA.ollama_model || 'llama3',
                    messages: [{ role: 'user', content: prompt }],
                    stream: false
                };
                // Se think=no, desabilita o modo de raciocínio (ex: DeepSeek-R1)
                if (configuracoesIA.ia_think === 'no') {
                    ollamaBody.think = false;
                }
                response = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: ollamaHeaders,
                    body: JSON.stringify(ollamaBody)
                });

                if (!response.ok) {
                    throw new Error(`Erro da API Ollama: ${response.statusText}`);
                }

                const dataOllama = await response.json();
                content = dataOllama.message?.content || '';

            } else if (provider === 'lmstudio') {
                // ===== LM STUDIO (OpenAI-compatible) =====
                const lmUrl = configuracoesIA.lmstudio_url || 'http://localhost:1234';
                const headers = { 'Content-Type': 'application/json' };
                if (configuracoesIA.lmstudio_apikey) {
                    headers['Authorization'] = `Bearer ${configuracoesIA.lmstudio_apikey}`;
                }

                response = await fetch(`${lmUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        model: configuracoesIA.lmstudio_model || 'default',
                        messages: [{ role: 'user', content: prompt }],
                        stream: false,
                        temperature: 0.7,
                        max_tokens: 2000
                    })
                });

                if (!response.ok) {
                    throw new Error(`Erro da API LM Studio: ${response.statusText}`);
                }

                const dataLM = await response.json();
                content = dataLM.choices[0].message.content;

            } else {
                throw new Error(`Provider de IA desconhecido: ${provider}`);
            }

            // Verifica se a resposta está vazia ou muito curta
            if (!content || content.trim().length < 50) {
                throw new Error('Resposta da IA vazia ou muito curta. Tentando novamente...');
            }

            console.log(`[IA] Sucesso na tentativa ${tentativa} via ${provider}`);
            return content;

        } catch (error) {
            console.error(`[IA] Erro na tentativa ${tentativa}/${maxRetries}:`, error.message);
            lastError = error;

            // Se não for a última tentativa, aguarda antes de tentar novamente
            if (tentativa < maxRetries) {
                const retryDelay = 5000; // 5 segundos entre tentativas
                console.log(`[IA] Aguardando ${retryDelay / 1000}s antes da próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    // Se chegou aqui, todas as tentativas falharam
    console.error('[IA] Todas as tentativas falharam');
    throw lastError;
}

// Alias para compatibilidade com código existente
async function chamarOpenRouter(prompt, delay = 5000, maxRetries = 3) {
    return chamarIA(prompt, delay, maxRetries);
}


// Função para gerar relatório de vendas por IA (COM DADOS REAIS DAS APIS)
async function gerarRelatorioVendasIA(dataInicio, dataFim) {
    try {
        // Buscar dados de vendas da API
        const vendas = await apiGet('/api/vendas', {
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        // Buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda/');
        const plataformasMap = {};
        if (plataformas) {
            plataformas.forEach(p => plataformasMap[p.id] = p.nome);
        }

        if (!vendas || vendas.length === 0) {
            return 'Nenhuma venda encontrada no período selecionado.';
        }

        // Processar dados de vendas com detalhes REAIS
        let totalVendas = 0;
        let totalFaturamento = 0;
        let totalCusto = 0;
        let totalComissoes = 0;
        const vendidosPorDia = {};
        const vendidosPorProduto = {};
        const vendidosPorCategoria = {};
        const vendedoresPerformance = {};
        const vendasPorPlataforma = {};

        for (const venda of vendas || []) {
            totalVendas++;
            totalFaturamento += venda.valor_total || 0;

            const data = new Date(venda.data_pedido);
            const diaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][data.getDay()];

            if (!vendidosPorDia[diaSemana]) {
                vendidosPorDia[diaSemana] = { quantidade: 0, valor: 0 };
            }
            vendidosPorDia[diaSemana].quantidade++;
            vendidosPorDia[diaSemana].valor += venda.valor_total || 0;

            // Registrar performance do vendedor
            const vendedor = venda.vendedor_nome || 'Sem vendedor';
            if (!vendedoresPerformance[vendedor]) {
                vendedoresPerformance[vendedor] = { quantidade: 0, valor: 0, comissao: 0 };
            }
            vendedoresPerformance[vendedor].quantidade++;
            vendedoresPerformance[vendedor].valor += venda.valor_total || 0;
            vendedoresPerformance[vendedor].comissao += venda.comissao_total || 0;
            totalComissoes += venda.comissao_total || 0;

            // Registrar vendas por plataforma
            const plataformaNome = venda.plataforma_nome || plataformasMap[venda.plataforma_id] || 'Sem plataforma';
            if (!vendasPorPlataforma[plataformaNome]) {
                vendasPorPlataforma[plataformaNome] = { quantidade: 0, valor: 0, ticketMedio: 0 };
            }
            vendasPorPlataforma[plataformaNome].quantidade++;
            vendasPorPlataforma[plataformaNome].valor += venda.valor_total || 0;

            // Buscar detalhes completos da venda (inclui itens)
            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                if (vendaDetalhada && vendaDetalhada.itens && Array.isArray(vendaDetalhada.itens)) {
                    for (const item of vendaDetalhada.itens) {
                        const categoria = item.categoria_nome || 'Sem categoria';
                        const valorItem = item.preco_unitario * item.quantidade;
                        const custoItem = (item.preco_custo || 0) * item.quantidade;

                        // Vendas por produto
                        if (!vendidosPorProduto[item.produto_id]) {
                            vendidosPorProduto[item.produto_id] = {
                                nome: item.produto_nome || 'Produto desconhecido',
                                categoria: categoria,
                                quantidade: 0,
                                valor: 0,
                                custo: 0,
                                preco_unitario: item.preco_unitario
                            };
                        }
                        vendidosPorProduto[item.produto_id].quantidade += item.quantidade;
                        vendidosPorProduto[item.produto_id].valor += valorItem;
                        vendidosPorProduto[item.produto_id].custo += custoItem;

                        // Vendas por categoria
                        if (!vendidosPorCategoria[categoria]) {
                            vendidosPorCategoria[categoria] = { quantidade: 0, valor: 0, custo: 0, produtos: [] };
                        }
                        vendidosPorCategoria[categoria].quantidade += item.quantidade;
                        vendidosPorCategoria[categoria].valor += valorItem;
                        vendidosPorCategoria[categoria].custo += custoItem;

                        if (!vendidosPorCategoria[categoria].produtos.includes(item.produto_nome)) {
                            vendidosPorCategoria[categoria].produtos.push(item.produto_nome);
                        }

                        totalCusto += custoItem;
                    }
                }
            } catch (e) {
                console.warn('Erro ao buscar detalhes da venda:', e);
            }
        }

        // Ordenar produtos por quantidade vendida
        const produtosOrdenados = Object.values(vendidosPorProduto)
            .sort((a, b) => b.quantidade - a.quantidade)
            .slice(0, 20);

        // Ordenar vendedores por performance
        const vendedoresOrdenados = Object.entries(vendedoresPerformance)
            .sort((a, b) => b[1].valor - a[1].valor)
            .slice(0, 10);

        // Ordenar plataformas por valor
        const plataformasOrdenadas = Object.entries(vendasPorPlataforma)
            .map(([nome, dados]) => ({
                nome,
                quantidade: dados.quantidade,
                valor: dados.valor,
                ticketMedio: dados.quantidade > 0 ? dados.valor / dados.quantidade : 0
            }))
            .sort((a, b) => b.valor - a.valor);

        const lucroTotal = totalFaturamento - totalCusto - totalComissoes;
        const margemLucro = totalFaturamento > 0 ? ((lucroTotal / totalFaturamento) * 100).toFixed(1) : 0;
        const ticketMedioGeral = totalVendas > 0 ? totalFaturamento / totalVendas : 0;

        // Criar prompt para IA com dados REAIS
        const prompt = `
Você é um analista de vendas experiente. Analise os seguintes dados REAIS de vendas do banco de dados e forneça insights ESPECÍFICOS e AÇÕES PRÁTICAS:

===== RESUMO FINANCEIRO DO PERÍODO =====
- Total de Vendas: ${totalVendas} pedidos
- Faturamento Total: R$ ${totalFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Custo Total dos Produtos: R$ ${totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Total de Comissões Pagas: R$ ${totalComissoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Lucro Líquido: R$ ${lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Margem de Lucro Líquida: ${margemLucro}%
- Ticket Médio: R$ ${ticketMedioGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

===== VENDAS POR PLATAFORMA DE VENDA =====
${plataformasOrdenadas.map((p, idx) =>
            `${idx + 1}. ${p.nome}: ${p.quantidade} vendas - R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Ticket Médio: R$ ${p.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

===== VENDAS POR DIA DA SEMANA =====
${Object.entries(vendidosPorDia).map(([dia, dados]) =>
            `${dia}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Ticket Médio: R$ ${(dados.quantidade > 0 ? dados.valor / dados.quantidade : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

===== TOP 15 PRODUTOS MAIS VENDIDOS =====
${produtosOrdenados.slice(0, 15).map((p, idx) => {
            const lucroItem = p.valor - p.custo;
            const margemItem = p.valor > 0 ? ((lucroItem / p.valor) * 100).toFixed(1) : 0;
            return `${idx + 1}. ${p.nome} (${p.categoria}): ${p.quantidade} un - Faturou R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Lucro R$ ${lucroItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${margemItem}%)`;
        }).join('\n')}

===== VENDAS POR CATEGORIA =====
${Object.entries(vendidosPorCategoria).map(([categoria, dados]) => {
            const lucroCategoria = dados.valor - dados.custo;
            const margemCategoria = dados.valor > 0 ? ((lucroCategoria / dados.valor) * 100).toFixed(1) : 0;
            return `${categoria}: ${dados.quantidade} un - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Lucro R$ ${lucroCategoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${margemCategoria}%)`;
        }).join('\n')}

===== PERFORMANCE DE VENDEDORES =====
${vendedoresOrdenados.map(([vendedor, dados], idx) =>
            `${idx + 1}. ${vendedor}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Comissão: R$ ${dados.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

Com base nos dados acima, forneça uma ANÁLISE DETALHADA e ESPECÍFICA:

1. **ANÁLISE POR PLATAFORMA DE VENDA**:
   - Qual plataforma tem melhor desempenho?
   - Qual plataforma tem maior ticket médio?
   - Recomendações específicas para cada plataforma

2. **ANÁLISE DE PRODUTOS E CATEGORIAS**:
   - Quais produtos/categorias geram MAIS LUCRO (não apenas faturamento)?
   - Produtos com alta venda mas baixa margem (oportunidade de ajuste de preço)
   - Produtos com baixa venda mas alta margem (oportunidade de promoção)

3. **ANÁLISE DE VENDEDORES**:
   - Ranking de eficiência (valor vendido vs comissão)
   - Vendedores que precisam de treinamento
   - Melhores práticas dos top vendedores

4. **PADRÕES TEMPORAIS**:
   - Melhores dias da semana para vendas
   - Sugestões de ações para dias fracos

5. **AÇÕES IMEDIATAS RECOMENDADAS** (lista com 5-7 ações específicas e executáveis)

Seja ESPECÍFICO com nomes de produtos, valores e percentuais. Não seja genérico.

IMPORTANTE: Você DEVE fornecer uma resposta completa e detalhada. NUNCA retorne uma resposta vazia ou incompleta. Se os dados forem insuficientes, forneça uma análise baseada nos dados disponíveis e indique as limitações.
`;

        // Chamar IA com delay
        const resposta = await chamarOpenRouter(prompt, 5000);
        return resposta;
    } catch (error) {
        console.error('Erro ao gerar relatório de vendas:', error);
        throw error;
    }
}

// Função para gerar relatório de estoque por IA (MELHORADO - COM API DE ESTOQUE)
async function gerarRelatorioEstoqueIA() {
    try {
        // Buscar dados de estoque da API específica de estoque
        const estoqueAPI = await apiGet('/api/estoque/produtos', { com_estoque: true });

        // Buscar dados de vendas para calcular saída
        const vendas = await apiGet('/api/vendas');

        // Buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda/');
        const plataformasMap = {};
        if (plataformas) {
            plataformas.forEach(p => plataformasMap[p.id] = p.nome);
        }

        if (!estoqueAPI || estoqueAPI.length === 0) {
            return 'Nenhum produto com estoque encontrado no sistema.';
        }

        // Calcular saída de produtos (quantidade vendida)
        const saidaProdutos = {};
        for (const venda of vendas || []) {
            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                if (vendaDetalhada && vendaDetalhada.itens && Array.isArray(vendaDetalhada.itens)) {
                    for (const item of vendaDetalhada.itens) {
                        if (!saidaProdutos[item.produto_id]) {
                            saidaProdutos[item.produto_id] = 0;
                        }
                        saidaProdutos[item.produto_id] += item.quantidade || 0;
                    }
                }
            } catch (e) {
                console.warn('Erro ao buscar detalhes da venda:', e);
            }
        }

        // Processar dados de estoque - FOCANDO EM PRODUTOS COM SAÍDA
        const produtosComSaidaBaixoEstoque = [];
        const produtosSemSaida = [];
        const produtosComSaidaAdequado = [];

        for (const produto of estoqueAPI) {
            // FILTRO: Apenas produtos com estoque > 0, ativos e faturáveis
            const estoque = produto.estoque_atual || 0;
            if (estoque <= 0) continue;
            if (produto.ativo === false) continue;
            if (produto.faturavel === false) continue;

            const estoqueMinimo = produto.estoque_minimo || 10;
            const saida = saidaProdutos[produto.id] || 0;
            const preco = produto.preco_venda || 0;
            const custo = produto.preco_custo || 0;
            const margem = preco > 0 ? ((preco - custo) / preco * 100).toFixed(1) : 0;

            // Produtos com saída (vendidos) mas com estoque baixo - PRIORIDADE
            if (saida > 0 && estoque < (saida / 3)) {
                produtosComSaidaBaixoEstoque.push({
                    nome: produto.nome,
                    categoria: produto.categoria_nome || 'Sem categoria',
                    estoque: estoque,
                    estoqueMinimo: estoqueMinimo,
                    saida: saida,
                    preco: preco,
                    custo: custo,
                    margem: margem,
                    velocidadeVenda: (saida / 30).toFixed(2) // Média por dia
                });
            }
            // Produtos sem saída (não vendem)
            else if (saida === 0 && estoque > 0) {
                produtosSemSaida.push({
                    nome: produto.nome,
                    categoria: produto.categoria_nome || 'Sem categoria',
                    estoque: estoque,
                    preco: preco,
                    custo: custo,
                    margem: margem
                });
            }
            // Produtos com saída e estoque adequado
            else if (saida > 0) {
                produtosComSaidaAdequado.push({
                    nome: produto.nome,
                    categoria: produto.categoria_nome || 'Sem categoria',
                    estoque: estoque,
                    estoqueMinimo: estoqueMinimo,
                    saida: saida,
                    preco: preco,
                    custo: custo,
                    margem: margem,
                    velocidadeVenda: (saida / 30).toFixed(2)
                });
            }
        }

        // Ordenar por velocidade de venda
        produtosComSaidaBaixoEstoque.sort((a, b) => parseFloat(b.velocidadeVenda) - parseFloat(a.velocidadeVenda));
        produtosComSaidaAdequado.sort((a, b) => parseFloat(b.velocidadeVenda) - parseFloat(a.velocidadeVenda));

        // Calcular valor total em estoque
        const valorTotalEstoque = (estoqueAPI || []).reduce((acc, p) => acc + (p.estoque_atual * p.preco_custo), 0);
        const valorTotalVenda = (estoqueAPI || []).reduce((acc, p) => acc + (p.estoque_atual * p.preco_venda), 0);

        // Criar prompt para IA com dados REAIS do banco
        const prompt = `
Você é um especialista em gestão de estoque e análise de vendas. Analise os seguintes dados REAIS do banco de dados e forneça recomendações ESPECÍFICAS e EXECUTÁVEIS:

===== RESUMO DO ESTOQUE =====
- Total de produtos em estoque: ${estoqueAPI?.length || 0}
- Valor total em estoque (custo): R$ ${valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Valor potencial de venda: R$ ${valorTotalVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Produtos críticos (alta saída, baixo estoque): ${produtosComSaidaBaixoEstoque.length}
- Produtos sem movimento: ${produtosSemSaida.length}

===== PRODUTOS CRÍTICOS - REPOR URGENTE =====
${produtosComSaidaBaixoEstoque.slice(0, 20).map((p, idx) =>
            `${idx + 1}. ${p.nome} (${p.categoria}):
   - Estoque ATUAL: ${p.estoque} un | Vendeu: ${p.saida} un | Venda média: ${p.velocidadeVenda} un/dia
   - Preço Venda: R$ ${p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Custo: R$ ${p.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Margem: ${p.margem}%
   - DIAS DE ESTOQUE RESTANTE: ${p.velocidadeVenda > 0 ? Math.round(p.estoque / parseFloat(p.velocidadeVenda)) : 'N/A'} dias`
        ).join('\n')}

===== PRODUTOS COM BOA PERFORMANCE =====
${produtosComSaidaAdequado.slice(0, 10).map((p, idx) =>
            `${idx + 1}. ${p.nome}: Estoque ${p.estoque} un | Vendeu ${p.saida} un | Margem ${p.margem}%`
        ).join('\n')}

===== PRODUTOS PARADOS - CONSIDERAR AÇÃO =====
${produtosSemSaida.slice(0, 15).map((p, idx) =>
            `${idx + 1}. ${p.nome} (${p.categoria}): ${p.estoque} un paradas | Preço R$ ${p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Valor parado: R$ ${(p.estoque * p.custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

Com base nesses dados, forneça:

1. **LISTA DE COMPRAS URGENTE** (tabela com colunas: Produto | Qtd Atual | Qtd Sugerida | Urgência | Investimento Estimado)
   - Calcule a quantidade ideal baseada na velocidade de venda (estoque para 30 dias)
   - Priorize por margem de lucro e velocidade de venda

2. **PRODUTOS PARA LIQUIDAR** (tabela com colunas: Produto | Estoque | Valor Parado | Desconto Sugerido | Preço Final)
   - Sugira descontos para produtos parados
   - Calcule o valor que será recuperado

3. **ANÁLISE DE CAPITAL PARADO**:
   - Quanto dinheiro está parado em produtos sem saída?
   - Como realocar esse capital?

4. **PLANO DE AÇÃO SEMANAL**:
   - Ações específicas para cada dia da semana
   - Foco em reposição e liquidação

5. **KPIs PARA ACOMPANHAR**:
   - Métricas específicas para monitorar a saúde do estoque

Seja ESPECÍFICO com nomes de produtos, quantidades e valores. Use os dados REAIS fornecidos.

IMPORTANTE: Você DEVE fornecer uma resposta completa e detalhada. NUNCA retorne uma resposta vazia ou incompleta. Se os dados forem insuficientes, forneça uma análise baseada nos dados disponíveis e indique as limitações.
`;

        // Chamar IA com delay
        const resposta = await chamarOpenRouter(prompt, 5000);
        return resposta;
    } catch (error) {
        console.error('Erro ao gerar relatório de estoque:', error);
        throw error;
    }
}

// Função para gerar recomendações de vendas por IA
async function gerarRecomendacoesVendasIA(dataInicio, dataFim) {
    try {
        // Buscar dados de vendas
        const vendas = await apiGet('/api/vendas', {
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        // Buscar dados de estoque
        const produtos = await apiGet('/api/produtos');

        // Buscar dados de vendedores
        const vendedores = await apiGet('/api/vendedores');

        // Buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda/');
        const plataformasMap = {};
        if (plataformas) {
            plataformas.forEach(p => plataformasMap[p.id] = p.nome);
        }

        // Processar dados
        const vendedoresComVendas = {};
        const vendasPorPlataforma = {};
        const produtosVendidos = {};

        for (const venda of vendas || []) {
            const vendedor = venda.vendedor_nome || 'Sem vendedor';
            if (!vendedoresComVendas[vendedor]) {
                vendedoresComVendas[vendedor] = { quantidade: 0, valor: 0, comissao: 0 };
            }
            vendedoresComVendas[vendedor].quantidade++;
            vendedoresComVendas[vendedor].valor += venda.valor_total || 0;
            vendedoresComVendas[vendedor].comissao += venda.comissao_total || 0;

            // Vendas por plataforma
            const plataformaNome = venda.plataforma_nome || plataformasMap[venda.plataforma_id] || 'Sem plataforma';
            if (!vendasPorPlataforma[plataformaNome]) {
                vendasPorPlataforma[plataformaNome] = { quantidade: 0, valor: 0 };
            }
            vendasPorPlataforma[plataformaNome].quantidade++;
            vendasPorPlataforma[plataformaNome].valor += venda.valor_total || 0;
        }

        // Ordenar plataformas
        const plataformasOrdenadas = Object.entries(vendasPorPlataforma)
            .sort((a, b) => b[1].valor - a[1].valor);

        // Criar prompt para IA
        const prompt = `
Você é um consultor de vendas experiente. Com base nos dados REAIS abaixo, forneça recomendações ESPECÍFICAS e EXECUTÁVEIS:

===== PERFORMANCE DE VENDEDORES =====
${Object.entries(vendedoresComVendas).map(([vendedor, dados]) =>
            `- ${vendedor}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Comissão: R$ ${dados.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

===== VENDAS POR PLATAFORMA =====
${plataformasOrdenadas.map(([plataforma, dados]) =>
            `- ${plataforma}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Ticket Médio: R$ ${(dados.quantidade > 0 ? dados.valor / dados.quantidade : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n')}

TOTAL DE VENDEDORES ATIVOS: ${Object.keys(vendedoresComVendas).length}
TOTAL DE VENDAS NO PERÍODO: ${vendas?.length || 0}
TOTAL DE PLATAFORMAS: ${plataformasOrdenadas.length}

Com base nesses dados, forneça RECOMENDAÇÕES ESPECÍFICAS:

1. **ESTRATÉGIA POR PLATAFORMA**:
   - Qual plataforma deve receber mais investimento?
   - Qual plataforma precisa de melhorias?
   - Ações específicas para cada plataforma (ex: "No Mercado Livre, focar em...")

2. **OTIMIZAÇÃO DE VENDEDORES**:
   - Quais vendedores estão performando bem e por quê?
   - Quais precisam de suporte/treinamento?
   - Sugestões de metas individuais

3. **CROSS-SELLING E UP-SELLING**:
   - Oportunidades de venda cruzada baseadas nos dados
   - Como aumentar o ticket médio em cada plataforma

4. **PLANO DE AÇÃO SEMANAL**:
   - Segunda a Sexta: ações específicas para cada dia
   - Foco em plataformas e produtos específicos

5. **METAS SUGERIDAS PARA O PRÓXIMO MÊS**:
   - Meta de faturamento por plataforma
   - Meta por vendedor
   - KPIs para acompanhar

Seja ESPECÍFICO com nomes, valores e percentuais. Evite recomendações genéricas.

IMPORTANTE: Você DEVE fornecer uma resposta completa e detalhada. NUNCA retorne uma resposta vazia ou incompleta. Se os dados forem insuficientes, forneça recomendações baseadas nos dados disponíveis e indique as limitações.
`;

        // Chamar IA com delay
        const resposta = await chamarOpenRouter(prompt, 5000);
        return resposta;
    } catch (error) {
        console.error('Erro ao gerar recomendações de vendas:', error);
        throw error;
    }
}

// Função para gerar estratégia para o mês por IA (COM DADOS REAIS DAS APIS)
async function gerarEstrategiaParaMesIA(dataInicio, dataFim) {
    try {
        // Buscar dados de vendas do período
        const vendas = await apiGet('/api/vendas', {
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        // Buscar estoque disponível da API de estoque
        const estoqueAPI = await apiGet('/api/estoque/produtos', { com_estoque: true });

        // Buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda/');
        const plataformasMap = {};
        if (plataformas) {
            plataformas.forEach(p => plataformasMap[p.id] = p.nome);
        }

        // Calcular vendas por produto (com detalhes REAIS)
        const vendidosPorProduto = {};
        const vendidosPorDia = {};
        const vendidosPorCategoria = {};
        const vendasPorPlataforma = {};

        for (const venda of vendas || []) {
            const data = new Date(venda.data_pedido);
            const diaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][data.getDay()];

            if (!vendidosPorDia[diaSemana]) {
                vendidosPorDia[diaSemana] = { quantidade: 0, valor: 0 };
            }
            vendidosPorDia[diaSemana].quantidade++;
            vendidosPorDia[diaSemana].valor += venda.valor_total || 0;

            // Vendas por plataforma
            const plataformaNome = venda.plataforma_nome || plataformasMap[venda.plataforma_id] || 'Sem plataforma';
            if (!vendasPorPlataforma[plataformaNome]) {
                vendasPorPlataforma[plataformaNome] = { quantidade: 0, valor: 0, produtos: {} };
            }
            vendasPorPlataforma[plataformaNome].quantidade++;
            vendasPorPlataforma[plataformaNome].valor += venda.valor_total || 0;

            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                if (vendaDetalhada && vendaDetalhada.itens && Array.isArray(vendaDetalhada.itens)) {
                    for (const item of vendaDetalhada.itens) {
                        const categoria = item.categoria_nome || 'Sem categoria';

                        // Vendas por produto
                        if (!vendidosPorProduto[item.produto_id]) {
                            vendidosPorProduto[item.produto_id] = {
                                nome: item.produto_nome || 'Produto desconhecido',
                                categoria: categoria,
                                quantidade: 0,
                                valor: 0,
                                preco_venda: item.preco_unitario,
                                preco_custo: item.preco_custo || 0
                            };
                        }
                        vendidosPorProduto[item.produto_id].quantidade += item.quantidade || 0;
                        vendidosPorProduto[item.produto_id].valor += (item.preco_unitario * item.quantidade) || 0;

                        // Vendas por categoria
                        if (!vendidosPorCategoria[categoria]) {
                            vendidosPorCategoria[categoria] = { quantidade: 0, valor: 0, produtos: [] };
                        }
                        vendidosPorCategoria[categoria].quantidade += item.quantidade || 0;
                        vendidosPorCategoria[categoria].valor += (item.preco_unitario * item.quantidade) || 0;

                        if (!vendidosPorCategoria[categoria].produtos.includes(item.produto_nome)) {
                            vendidosPorCategoria[categoria].produtos.push(item.produto_nome);
                        }
                    }
                }
            } catch (e) {
                console.warn('Erro ao buscar detalhes da venda:', e);
            }
        }

        // Ordenar produtos por quantidade vendida
        const produtosOrdenados = Object.values(vendidosPorProduto)
            .sort((a, b) => b.quantidade - a.quantidade)
            .slice(0, 20); // Top 20 produtos

        // Preparar dados de estoque disponível com dados REAIS da API
        const estoqueDisponivel = (estoqueAPI || [])
            .map(p => ({
                nome: p.nome,
                categoria: p.categoria_nome,
                estoque: p.estoque_atual,
                preco_venda: p.preco_venda,
                preco_custo: p.preco_custo,
                margem: p.preco_venda > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_venda * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.estoque - a.estoque)
            .slice(0, 30); // Top 30 produtos em estoque

        // Verificar se há dados suficientes
        if (produtosOrdenados.length === 0 && estoqueDisponivel.length === 0) {
            return 'Sem dados de vendas ou estoque para gerar estratégia. Verifique se há vendas registradas no período.';
        }

        // Construir dados formatados para o prompt
        const vendidosPorDiaTexto = Object.entries(vendidosPorDia)
            .map(([dia, dados]) => `${dia}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
            .join('\n');

        const produtosOrdenadosTexto = produtosOrdenados
            .map((p, idx) => `${idx + 1}. ${p.nome} (${p.categoria}): ${p.quantidade} unidades - R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Preço: R$ ${p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
            .join('\n');

        const vendidosPorCategoriaTexto = Object.entries(vendidosPorCategoria)
            .map(([categoria, dados]) => `${categoria}: ${dados.quantidade} unidades - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
            .join('\n');

        // Plataformas ordenadas
        const plataformasOrdenadas = Object.entries(vendasPorPlataforma)
            .sort((a, b) => b[1].valor - a[1].valor);

        const vendasPorPlataformaTexto = plataformasOrdenadas
            .map(([plataforma, dados], idx) => `${idx + 1}. ${plataforma}: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Ticket Médio: R$ ${(dados.quantidade > 0 ? dados.valor / dados.quantidade : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
            .join('\n');

        const estoqueDisponvelTexto = estoqueDisponivel
            .map((p, idx) => `${idx + 1}. ${p.nome} (${p.categoria}): ${p.estoque} unidades - Preço: R$ ${p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - Margem: ${p.margem}%`)
            .join('\n');

        const melhorDia = Object.entries(vendidosPorDia).sort((a, b) => b[1].quantidade - a[1].quantidade)[0];
        const piorDia = Object.entries(vendidosPorDia).sort((a, b) => a[1].quantidade - b[1].quantidade)[0];
        const primeiroProduto = produtosOrdenados[0]?.nome || 'Produto';

        // Criar prompt detalhado para IA com dados REAIS
        const prompt = `Você é um estrategista de vendas experiente. Com base nos dados REAIS de vendas do período anterior e estoque disponível do banco de dados, crie uma ESTRATÉGIA PRÁTICA, DETALHADA e EXECUTÁVEL para o próximo mês:

===== VENDAS POR PLATAFORMA (DADOS REAIS) =====
${vendasPorPlataformaTexto}

===== VENDAS POR DIA DA SEMANA =====
${vendidosPorDiaTexto}

===== TOP 20 PRODUTOS MAIS VENDIDOS =====
${produtosOrdenadosTexto}

===== VENDAS POR CATEGORIA =====
${vendidosPorCategoriaTexto}

===== ESTOQUE DISPONÍVEL =====
${estoqueDisponvelTexto}

===== DIAS CRÍTICOS =====
- Melhor dia: ${melhorDia?.[0] || 'N/A'} (${melhorDia?.[1].quantidade || 0} vendas - R$ ${melhorDia?.[1].valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'})
- Pior dia: ${piorDia?.[0] || 'N/A'} (${piorDia?.[1].quantidade || 0} vendas - R$ ${piorDia?.[1].valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'})

Com base nos dados acima, crie um PLANO ESTRATÉGICO DETALHADO:

1. **ESTRATÉGIA POR PLATAFORMA DE VENDA**:
   - Para cada plataforma listada, defina:
     * Produtos prioritários para vender
     * Faixa de desconto recomendada
     * Melhor dia/horário para postar
     * Meta de vendas específica

2. **CALENDÁRIO SEMANAL DE AÇÕES**:
   - Segunda: [ação específica com produto e plataforma]
   - Terça: [ação específica com produto e plataforma]
   - Quarta: [ação específica com produto e plataforma]
   - Quinta: [ação específica com produto e plataforma]
   - Sexta: [ação específica com produto e plataforma]
   - Sábado: [ação específica com produto e plataforma]
   - Domingo: [ação específica com produto e plataforma]

3. **PROMOÇÕES RECOMENDADAS**:
   - Liste 5-7 promoções específicas com:
     * Nome do produto (do TOP 20)
     * Plataforma onde aplicar
     * Percentual de desconto
     * Duração da promoção
     * Resultado esperado

4. **COMBOS E KITS SUGERIDOS**:
   - Baseado nos produtos mais vendidos, sugira combos
   - Preço sugerido para cada combo
   - Em qual plataforma vender cada combo

5. **METAS DO MÊS**:
   - Meta de faturamento total
   - Meta por plataforma
   - Meta de ticket médio
   - Número de vendas esperado

Seja EXTREMAMENTE ESPECÍFICO. Use nomes de produtos REAIS da lista, valores REAIS e plataformas REAIS. Não seja genérico.

IMPORTANTE: Você DEVE fornecer uma resposta completa e detalhada. NUNCA retorne uma resposta vazia ou incompleta. Se os dados forem insuficientes, forneça uma estratégia baseada nos dados disponíveis e indique as limitações.`;

        // Chamar IA com delay
        const resposta = await chamarOpenRouter(prompt, 5000);
        return resposta;
    } catch (error) {
        console.error('Erro ao gerar estratégia para o mês:', error);
        throw error;
    }
}

// Função para gerar relatório resumido para WhatsApp (TOP 5 categorias por plataforma)
async function gerarRelatorioWhatsAppIA(dataInicio, dataFim) {
    try {
        // Buscar dados de vendas da API
        const vendas = await apiGet('/api/vendas', {
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        // Buscar plataformas de venda
        const plataformas = await apiGet('/api/plataformas-venda/');
        const plataformasMap = {};
        if (plataformas) {
            plataformas.forEach(p => plataformasMap[p.id] = p.nome);
        }

        // Buscar categorias
        const categorias = await apiGet('/api/categorias/');
        const categoriasMap = {};
        if (categorias) {
            categorias.forEach(c => categoriasMap[c.id] = c.nome);
        }

        if (!vendas || vendas.length === 0) {
            return 'Nenhuma venda encontrada no período selecionado.';
        }

        // Agrupar vendas por plataforma e categoria
        const vendasPorPlataforma = {};

        for (const venda of vendas || []) {
            const plataformaNome = venda.plataforma_nome || plataformasMap[venda.plataforma_id] || 'Sem plataforma';

            if (!vendasPorPlataforma[plataformaNome]) {
                vendasPorPlataforma[plataformaNome] = {
                    quantidade: 0,
                    valor: 0,
                    categorias: {}
                };
            }
            vendasPorPlataforma[plataformaNome].quantidade++;
            vendasPorPlataforma[plataformaNome].valor += venda.valor_total || 0;

            // Buscar itens da venda para pegar categorias
            try {
                const vendaDetalhada = await apiGet(`/api/vendas/${venda.id}`);
                if (vendaDetalhada && vendaDetalhada.itens && Array.isArray(vendaDetalhada.itens)) {
                    for (const item of vendaDetalhada.itens) {
                        // Buscar categoria do produto
                        let categoriaNome = 'Sem categoria';
                        if (item.categoria_id) {
                            categoriaNome = categoriasMap[item.categoria_id] || 'Sem categoria';
                        } else if (item.produto_id) {
                            // Tentar buscar produto para pegar categoria
                            try {
                                const produto = await apiGet(`/api/produtos/${item.produto_id}`);
                                if (produto && produto.categoria_id) {
                                    categoriaNome = categoriasMap[produto.categoria_id] || 'Sem categoria';
                                }
                            } catch (e) {
                                // Ignorar erro
                            }
                        }

                        if (!vendasPorPlataforma[plataformaNome].categorias[categoriaNome]) {
                            vendasPorPlataforma[plataformaNome].categorias[categoriaNome] = {
                                quantidade: 0,
                                valor: 0
                            };
                        }
                        vendasPorPlataforma[plataformaNome].categorias[categoriaNome].quantidade += item.quantidade || 0;
                        vendasPorPlataforma[plataformaNome].categorias[categoriaNome].valor += (item.preco_unitario * item.quantidade) || 0;
                    }
                }
            } catch (e) {
                console.warn('Erro ao buscar detalhes da venda:', e);
            }
        }

        // Montar texto EXATO com TOP 5 categorias de cada plataforma
        let textoPlataformas = '';
        const plataformasComVendas = [];

        for (const [plataforma, dados] of Object.entries(vendasPorPlataforma)) {
            // Ordenar categorias por quantidade e pegar TOP 5
            const categoriasOrdenadas = Object.entries(dados.categorias)
                .map(([nome, info]) => ({ nome, ...info }))
                .sort((a, b) => b.quantidade - a.quantidade)
                .slice(0, 5);

            if (categoriasOrdenadas.length > 0) {
                plataformasComVendas.push(plataforma);
                const ticketMedio = dados.quantidade > 0 ? dados.valor / dados.quantidade : 0;
                textoPlataformas += `\n===== ${plataforma.toUpperCase()} =====\n`;
                textoPlataformas += `Total: ${dados.quantidade} vendas - R$ ${dados.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                textoPlataformas += `Ticket Médio: R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                textoPlataformas += `\nTOP 5 Categorias:\n`;

                categoriasOrdenadas.forEach((cat, idx) => {
                    const mediaVenda = cat.quantidade > 0 ? cat.valor / cat.quantidade : 0;
                    textoPlataformas += `${idx + 1}. ${cat.nome}: ${cat.quantidade} un vendidas - R$ ${cat.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                });
            }
        }

        if (!textoPlataformas) {
            return 'Sem dados suficientes para gerar resumo por plataforma.';
        }

        // Criar prompt para IA gerar resumo SEM INVENTAR dados
        const prompt = `Você é um gerente de vendas. Com base nos dados REAIS abaixo, crie um RESUMO SUCINTO para enviar aos vendedores via WhatsApp.

ATENÇÃO: Use SOMENTE os dados fornecidos abaixo. NÃO INVENTE dados. NÃO adicione plataformas que não estão listadas. 
As ÚNICAS plataformas com vendas são: ${plataformasComVendas.join(', ')}.

DADOS DO PERÍODO (${dataInicio} a ${dataFim}):
${textoPlataformas}

INSTRUÇÕES OBRIGATÓRIAS:
1. Use APENAS as plataformas listadas acima (${plataformasComVendas.join(', ')})
2. Use APENAS os números exatos fornecidos (vendas, valores, categorias)
3. NÃO invente vendas em outras plataformas
4. O resumo deve ser CURTO e DIRETO
5. Foque em CATEGORIAS, não em produtos específicos
6. Use emojis: 📊 🏆 💰 📈 🎯 🛒
7. Formate para WhatsApp (use * para negrito)

FORMATO:
📊 *RESUMO DE VENDAS*
[Período]

🏪 *[PLATAFORMA]* (X vendas)
🏆 Categoria campeã: [nome da categoria top 1]
💰 Ticket médio: R$ X
📈 Outras categorias: [resumo das outras top categorias]

[REPETIR APENAS para as plataformas listadas acima]

🎯 *FOCO DA SEMANA*
[1-2 ações baseadas nos dados reais]

IMPORTANTE: Inclua SOMENTE as ${plataformasComVendas.length} plataformas listadas. NÃO adicione OLX, Mercado Livre ou qualquer outra se não estiver na lista acima.`;

        // Chamar IA com delay
        const resposta = await chamarOpenRouter(prompt, 5000);
        return resposta;
    } catch (error) {
        console.error('Erro ao gerar relatório WhatsApp:', error);
        throw error;
    }
}

// Função para enviar relatório WhatsApp via webhook
async function enviarRelatorioWhatsApp(mensagem) {
    try {
        // Carregar configurações de webhook
        const configuracoes = await apiGet('/api/configuracoes/configuracoes/');

        const webhookUrl = configuracoes.find(c => c.chave === 'webhook_url');
        const webhookAtivo = configuracoes.find(c => c.chave === 'webhook_ativo');

        if (!webhookAtivo || webhookAtivo.valor !== 'true') {
            throw new Error('Webhook não está ativo. Configure em Configurações > Webhook.');
        }

        if (!webhookUrl || !webhookUrl.valor) {
            throw new Error('URL do webhook não configurada. Configure em Configurações > Webhook.');
        }

        // Buscar vendedores ativos com telefone
        const vendedores = await apiGet('/api/vendedores', { ativo: true });
        const vendedoresComTelefone = vendedores.filter(v => v.telefone && v.telefone.trim() !== '');

        if (vendedoresComTelefone.length === 0) {
            throw new Error('Nenhum vendedor ativo com telefone cadastrado.');
        }

        // Enviar para cada vendedor
        let sucesso = 0;
        let falha = 0;

        for (const vendedor of vendedoresComTelefone) {
            try {
                const payload = {
                    telefone: vendedor.telefone,
                    mensagem: mensagem,
                    timestamp: new Date().toISOString()
                };

                const response = await fetch(webhookUrl.valor, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    sucesso++;
                } else {
                    falha++;
                }

                // Pequeno delay entre envios
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error(`Erro ao enviar para ${vendedor.nome}:`, e);
                falha++;
            }
        }

        return { sucesso, falha, total: vendedoresComTelefone.length };
    } catch (error) {
        console.error('Erro ao enviar relatório WhatsApp:', error);
        throw error;
    }
}


// Função para abrir modal de geração de relatório por IA
async function abrirModalRelatorioIA(dataInicio, dataFim) {
    try {
        // Criar modal
        const modalHtml = `
            <div class="modal" id="relatorioIAModal">
                <div class="modal-content modal-lg" style="max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h2><i class="fas fa-brain"></i> Relatório Gerado por IA</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="tabs-ia">
                            <button class="tab-btn-ia active" data-tab="vendas">
                                <i class="fas fa-chart-line"></i> Análise de Vendas
                            </button>
                            <button class="tab-btn-ia" data-tab="estoque">
                                <i class="fas fa-warehouse"></i> Análise de Estoque
                            </button>
                            <button class="tab-btn-ia" data-tab="recomendacoes">
                                <i class="fas fa-lightbulb"></i> Recomendações
                            </button>
                            <button class="tab-btn-ia" data-tab="estrategia">
                                <i class="fas fa-calendar-alt"></i> Estratégia Mês
                            </button>
                            <button class="tab-btn-ia" data-tab="whatsapp" style="background: rgba(37, 211, 102, 0.1); border-color: #25D366;">
                                <i class="fab fa-whatsapp" style="color: #25D366;"></i> Relatório WhatsApp
                            </button>
                        </div>
                        
                        <div class="tab-content-ia active" id="tab-vendas">
                            <div class="loading-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Gerando análise de vendas...</p>
                            </div>
                        </div>
                        
                        <div class="tab-content-ia" id="tab-estoque">
                            <div class="loading-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Gerando análise de estoque...</p>
                            </div>
                        </div>
                        
                        <div class="tab-content-ia" id="tab-recomendacoes">
                            <div class="loading-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Gerando recomendações...</p>
                            </div>
                        </div>
                        
                        <div class="tab-content-ia" id="tab-estrategia">
                            <div class="loading-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Gerando estratégia para o mês...</p>
                            </div>
                        </div>
                        
                        <div class="tab-content-ia" id="tab-whatsapp">
                            <div class="loading-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Gerando relatório para WhatsApp...</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-outline close-modal">Fechar</button>
                        <button type="button" class="btn-primary" id="exportarRelatorioIA">
                            <i class="fas fa-file-pdf"></i> Exportar PDFs
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Adicionar modal ao DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // Exibir modal
        const modal = document.getElementById('relatorioIAModal');
        setTimeout(() => {
            modal.classList.add('active');
            document.body.classList.add('modal-open');
        }, 10);

        // Configurar eventos de fechamento
        const closeButtons = modal.querySelectorAll('.close-modal');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
                document.body.classList.remove('modal-open');
                setTimeout(() => {
                    if (modalContainer.parentNode) {
                        document.body.removeChild(modalContainer);
                    }
                }, 300);
            });
        });

        // Configurar abas
        const tabButtons = modal.querySelectorAll('.tab-btn-ia');
        const tabContents = modal.querySelectorAll('.tab-content-ia');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const tabName = btn.getAttribute('data-tab');
                document.getElementById(`tab-${tabName}`).classList.add('active');
            });
        });

        // Gerar relatórios
        try {
            // Relatório de vendas
            const relatorioVendas = await gerarRelatorioVendasIA(dataInicio, dataFim);
            const conteudoFormatadoVendas = formatarConteudoRelatorio(relatorioVendas);
            document.getElementById('tab-vendas').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoVendas}</div>
                </div>
            `;
        } catch (error) {
            document.getElementById('tab-vendas').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar relatório de vendas: ${error.message}
                </div>
            `;
        }

        // Relatório de estoque
        try {
            const relatorioEstoque = await gerarRelatorioEstoqueIA();
            const conteudoFormatadoEstoque = formatarConteudoRelatorio(relatorioEstoque);
            document.getElementById('tab-estoque').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoEstoque}</div>
                </div>
            `;
        } catch (error) {
            document.getElementById('tab-estoque').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar relatório de estoque: ${error.message}
                </div>
            `;
        }

        // Recomendações
        try {
            const recomendacoes = await gerarRecomendacoesVendasIA(dataInicio, dataFim);
            const conteudoFormatadoRecomendacoes = formatarConteudoRelatorio(recomendacoes);
            document.getElementById('tab-recomendacoes').innerHTML = `
                <div class="relatorio-ia-content">
                    <div class="relatorio-ia-text">${conteudoFormatadoRecomendacoes}</div>
                </div>
            `;
        } catch (error) {
            document.getElementById('tab-recomendacoes').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar recomendações: ${error.message}
                </div>
            `;
        }

        // Estratégia para o mês
        try {
            const estrategia = await gerarEstrategiaParaMesIA(dataInicio, dataFim);
            console.log('Estratégia recebida:', estrategia);

            if (!estrategia || estrategia.trim() === '') {
                document.getElementById('tab-estrategia').innerHTML = `
                    <div class="alert alert-warning">
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
        } catch (error) {
            console.error('Erro ao gerar estratégia:', error);
            document.getElementById('tab-estrategia').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar estratégia: ${error.message}
                </div>
            `;
        }

        // Relatório WhatsApp
        try {
            const relatorioWhatsApp = await gerarRelatorioWhatsAppIA(dataInicio, dataFim);
            console.log('Relatório WhatsApp recebido:', relatorioWhatsApp);

            if (!relatorioWhatsApp || relatorioWhatsApp.trim() === '') {
                document.getElementById('tab-whatsapp').innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-info-circle"></i>
                        Relatório vazio. Verifique se há dados de vendas no período.
                    </div>
                `;
            } else {
                document.getElementById('tab-whatsapp').innerHTML = `
                    <div class="relatorio-ia-content">
                        <div style="margin-bottom: 15px; padding: 15px; background: rgba(37, 211, 102, 0.1); border: 1px solid #25D366; border-radius: 8px;">
                            <h4 style="color: #25D366; margin: 0 0 10px 0;"><i class="fab fa-whatsapp"></i> Prévia do Relatório WhatsApp</h4>
                            <p style="margin: 0; font-size: 13px; color: var(--text-muted, #8892b0);">
                                Este relatório será enviado para todos os vendedores ativos com telefone cadastrado.
                            </p>
                        </div>
                        <div class="relatorio-ia-text" style="white-space: pre-wrap; font-family: 'Segoe UI', sans-serif; background: rgba(10, 25, 47, 0.8); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color, rgba(100, 255, 218, 0.1));" id="whatsapp-content">
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
        } catch (error) {
            console.error('Erro ao gerar relatório WhatsApp:', error);
            document.getElementById('tab-whatsapp').innerHTML = `
                            < div class= "alert alert-danger" >
                            <i class="fas fa-exclamation-circle"></i>
                    Erro ao gerar relatório WhatsApp: ${error.message}
                </div >
                            `;
        }

        // Configurar botão de exportação
        document.getElementById('exportarRelatorioIA').addEventListener('click', () => {
            exportarRelatorioIAPDF(dataInicio, dataFim);
        });

    } catch (error) {
        console.error('Erro ao abrir modal:', error);
        alert('Erro ao abrir modal de relatório: ' + error.message);
    }
}

// Função para exportar relatórios em PDF (4 PDFs)
async function exportarRelatorioIAPDF(dataInicio, dataFim) {
    try {
        const tabContents = document.querySelectorAll('.tab-content-ia');
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

        // Verificar se html2pdf está disponível
        if (typeof html2pdf === 'undefined') {
            alert('Biblioteca html2pdf não carregada. Por favor, recarregue a página.');
            return;
        }

        // Mostrar mensagem de progresso
        const btnExportar = document.getElementById('exportarRelatorioIA');
        const textoOriginal = btnExportar.innerHTML;
        btnExportar.disabled = true;
        btnExportar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDFs...';

        // Array com os dados dos PDFs
        const pdfs = [
            {
                titulo: 'ANÁLISE DE VENDAS',
                conteudo: tabContents[0].innerText,
                nome: `relatorio_vendas_${dataAtual}.pdf`
            },
            {
                titulo: 'ANÁLISE DE ESTOQUE',
                conteudo: tabContents[1].innerText,
                nome: `relatorio_estoque_${dataAtual}.pdf`
            },
            {
                titulo: 'RECOMENDAÇÕES DE VENDAS',
                conteudo: tabContents[2].innerText,
                nome: `relatorio_recomendacoes_${dataAtual}.pdf`
            },
            {
                titulo: 'ESTRATÉGIA PARA O MÊS',
                conteudo: tabContents[3].innerText,
                nome: `relatorio_estrategia_${dataAtual}.pdf`
            }
        ];

        // Gerar cada PDF com delay
        for (let i = 0; i < pdfs.length; i++) {
            const pdf = pdfs[i];

            // Criar elemento HTML para o PDF
            const elemento = document.createElement('div');
            elemento.style.padding = '20px';
            elemento.style.fontFamily = 'Arial, sans-serif';
            elemento.style.fontSize = '12px';
            elemento.style.lineHeight = '1.6';
            elemento.innerHTML = `
                        < h1 style = "text-align: center; color: #2c3e50; margin-bottom: 10px;" > ${pdf.titulo}</h1 >
                <p style="text-align: center; color: #7f8c8d; margin-bottom: 20px;">
                    Período: ${dataInicio} a ${dataFim}<br>
                    Gerado em: ${new Date().toLocaleString('pt-BR')}
                </p>
                <hr style="border: 1px solid #e9ecef; margin: 20px 0;">
                <div style="white-space: pre-wrap; word-wrap: break-word; color: #2c3e50;">
                    ${pdf.conteudo}
                </div>
            `;

            // Configurar opções do PDF
            const opcoes = {
                margin: 10,
                filename: pdf.nome,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
            };

            // Gerar PDF
            await html2pdf().set(opcoes).from(elemento).save();

            // Delay entre PDFs (exceto o último)
            if (i < pdfs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Restaurar botão
        btnExportar.disabled = false;
        btnExportar.innerHTML = textoOriginal;

        alert(`✅ 4 PDFs gerados com sucesso!\n\n- relatorio_vendas_${dataAtual}.pdf\n- relatorio_estoque_${dataAtual}.pdf\n- relatorio_recomendacoes_${dataAtual}.pdf\n- relatorio_estrategia_${dataAtual}.pdf`);

    } catch (error) {
        console.error('Erro ao exportar PDFs:', error);
        alert('Erro ao exportar PDFs: ' + error.message);

        // Restaurar botão em caso de erro
        const btnExportar = document.getElementById('exportarRelatorioIA');
        btnExportar.disabled = false;
        btnExportar.innerHTML = '<i class="fas fa-file-pdf"></i> Exportar PDFs';
    }
}

// Função para limpar código HTML/CSS da resposta da IA
function limparCodigoHTML(texto) {
    if (!texto) return '';

    // Remover TODAS as variações do padrão de CSS da tabela
    // Padrão: "100%; border-collapse: collapse; margin: 15px 0; background: white; border: 1px solid #e9ecef;\">"
    texto = texto.replace(/\d+%;?\s*border-collapse:\s*collapse;[\s\S]*?>?\s*/gi, '');

    // Remover linhas que contêm CSS inline
    const linhas = texto.split('\n');
    const linhasLimpas = linhas.filter(linha => {
        // Remover linhas com propriedades CSS
        if (linha.includes('border-collapse') ||
            linha.includes('background: white') ||
            linha.includes('margin: 15px') ||
            linha.includes('style="') ||
            linha.match(/^\s*\d+%;\s*$/)) {
            return false;
        }
        return true;
    });

    texto = linhasLimpas.join('\n');

    // Remover blocos de código HTML/CSS
    texto = texto.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    texto = texto.replace(/```html[\s\S]*?```/gi, '');
    texto = texto.replace(/```css[\s\S]*?```/gi, '');
    texto = texto.replace(/```[\s\S]*?```/gi, '');

    // Remover atributos style inline completamente (qualquer style="...")
    texto = texto.replace(/\s*style="[^"]*"/gi, '');

    // Remover tags HTML (div, table, thead, tbody, tr, td, th, span, p, hr, br)
    texto = texto.replace(/<(?:div|table|thead|tbody|tr|td|th|span|p|hr|br)[^>]*>/gi, '');
    texto = texto.replace(/<\/(?:div|table|thead|tbody|tr|td|th|span|p|hr|br)>/gi, '');

    // Remover fragmentos de CSS soltos
    texto = texto.replace(/\d+%\s*;?\s*border-collapse[^>]*>/gi, '');
    texto = texto.replace(/[0-9a-f]{3,6}["\s]*;?\s*>\s*$/gmi, '');

    // Remover propriedades CSS soltas
    texto = texto.replace(/\b(?:border-collapse|background|margin|padding|width|height|color|font-weight|text-align|border|font-size):\s*[^;]*;/gi, '');

    // Remover linhas que começam com "> " (fragmentos de fechamento de tag)
    texto = texto.replace(/^\s*>\s*$/gm, '');

    // Remover ">" soltos no início de linhas
    texto = texto.replace(/^\s*>\s*/gm, '');

    // Limpar linhas vazias múltiplas
    texto = texto.replace(/\n{3,}/g, '\n\n');

    return texto.trim();
}

// Função para converter tabelas markdown em HTML
function converterTabelasMarkdown(texto) {
    // Padrão para detectar tabelas markdown
    const linhaTabela = /\|(.+)\|/g;
    const linhas = texto.split('\n');
    let resultado = [];
    let emTabela = false;
    let tabelaLinhas = [];

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        // Detectar início de tabela (linha com |)
        if (linha.includes('|') && !emTabela) {
            emTabela = true;
            tabelaLinhas = [linha];
        } else if (emTabela && linha.includes('|')) {
            // Continuar tabela
            tabelaLinhas.push(linha);
        } else if (emTabela && !linha.includes('|')) {
            // Fim da tabela
            emTabela = false;
            if (tabelaLinhas.length > 0) {
                resultado.push(construirTabelaHTML(tabelaLinhas));
            }
            tabelaLinhas = [];
            resultado.push(linha);
        } else {
            resultado.push(linha);
        }
    }

    // Se terminou com tabela
    if (emTabela && tabelaLinhas.length > 0) {
        resultado.push(construirTabelaHTML(tabelaLinhas));
    }

    return resultado.join('\n');
}

// Função para construir tabela HTML a partir de linhas markdown
function construirTabelaHTML(linhasMarkdown) {
    if (linhasMarkdown.length < 2) return linhasMarkdown.join('\n');

    let html = '<table style="width: 100%; border-collapse: collapse; margin: 15px 0; background: white; border: 1px solid #e9ecef;">';

    // Processar cada linha
    for (let i = 0; i < linhasMarkdown.length; i++) {
        const linha = linhasMarkdown[i];

        // Pular linha separadora (---|---|)
        if (linha.includes('---') || linha.includes('---')) {
            continue;
        }

        // Extrair células
        const celulas = linha
            .split('|')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        if (celulas.length === 0) continue;

        // Primeira linha é cabeçalho
        if (i === 0) {
            html += '<thead><tr style="background-color: #3498db; color: white;">';
            celulas.forEach(celula => {
                html += `<th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #e9ecef;">${celula}</th>`;
            });
            html += '</tr></thead>';
        } else {
            // Linhas de dados
            const isAlternada = (i % 2 === 0);
            const bgColor = isAlternada ? '#f8f9fa' : 'white';

            html += `<tr style="background-color: ${bgColor};">`;
            celulas.forEach((celula, idx) => {
                // Alinhar números à direita
                const isNumero = /^[\d.,\s%R$]+$/.test(celula);
                const align = isNumero ? 'right' : 'left';

                html += `<td style="padding: 12px; text-align: ${align}; border: 1px solid #e9ecef; color: #2c3e50;">${celula}</td>`;
            });
            html += '</tr>';
        }
    }

    html += '</table>';
    return html;
}

// Função para formatar o conteúdo do relatório com melhorias visuais
function formatarConteudoRelatorio(texto) {
    // Limpar código HTML/CSS primeiro
    let conteudo = limparCodigoHTML(texto);

    // Converter tabelas markdown em HTML
    conteudo = converterTabelasMarkdown(conteudo);

    // Converter quebras de linha em <br>
    conteudo = conteudo.replace(/\n/g, '<br>');

    // Formatar títulos em negrito
    conteudo = conteudo.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #2c3e50;">$1</strong>');

    // Formatar listas
    conteudo = conteudo.replace(/^- (.+)$/gm, '<li style="margin-left: 20px; color: #2c3e50;">$1</li>');

    // Envolver listas em <ul>
    conteudo = conteudo.replace(/(<li[^>]*>.*?<\/li>)/s, '<ul style="list-style-type: disc; margin: 10px 0;">$1</ul>');

    // Formatar números em moeda
    conteudo = conteudo.replace(/R\$\s*([\d.,]+)/g, '<span style="color: #27ae60; font-weight: bold;">R$ $1</span>');

    // Formatar percentuais
    conteudo = conteudo.replace(/(\d+(?:[.,]\d+)?)\s*%/g, '<span style="color: #e74c3c; font-weight: bold;">$1%</span>');

    return conteudo;
}

// Inicializar configurações de IA ao carregar
document.addEventListener('DOMContentLoaded', () => {
    carregarConfiguracoeIA();
});
