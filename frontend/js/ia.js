// Chamada de IA feita pelo backend (/api/ia/gerar): a chave do provedor nunca vem para o navegador.
// Carregado antes de gerar-descricao-ia.js, cadastro-massa.js e gerar-relatorio-ia.js.

// Marca a configuração como resolvida no servidor: os scripts de IA pulam o download das configurações.
var configuracoesIA = { provider: 'servidor' };

async function carregarConfiguracoeIA() {
    return configuracoesIA;
}

// Gera texto com a IA configurada no sistema. `espera` é o intervalo entre tentativas.
async function chamarIA(prompt, espera = 2000, tentativas = 2, maxTokens = 4000) {
    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
            const resposta = await apiPost('/api/ia/gerar', { prompt, max_tokens: maxTokens });
            return resposta.texto;
        } catch (erro) {
            ultimoErro = erro;
            console.warn(`[IA] Tentativa ${tentativa}/${tentativas} falhou:`, erro.message);
            if (tentativa < tentativas) await new Promise(r => setTimeout(r, espera));
        }
    }
    throw new Error(String(ultimoErro?.message || ultimoErro).replace(/^Falha na requisição POST para \S+: /, ''));
}

// Alias usado pelo código antigo de relatórios
async function chamarOpenRouter(prompt, espera = 2000, tentativas = 2) {
    return chamarIA(prompt, espera, tentativas);
}
