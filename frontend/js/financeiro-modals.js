// Funções para manipulação de modals do módulo financeiro

// Funções para Contas a Receber
function abrirModalNovoRecebimento() {
    // Limpar formulário
    document.getElementById('recebimentoForm').reset();
    document.getElementById('recebimentoForm').removeAttribute('data-id');
    
    // Atualizar título
    document.getElementById('recebimentoModalTitle').textContent = 'Novo Recebimento';
    
    // Exibir modal
    document.getElementById('recebimentoModal').style.display = 'flex';
}

async function abrirModalEditarRecebimento(contaId) {
    try {
        document.getElementById('recebimentoModalTitle').textContent = `Editar Recebimento #${contaId}`;
        
        // Buscar dados do recebimento na API
        const conta = await apiGetAccountReceivable(contaId);
        
        // Preencher o formulário com os dados do recebimento
        document.getElementById('cliente_id_recebimento').value = conta.cliente_id || '';
        document.getElementById('descricao_recebimento').value = conta.descricao || '';
        document.getElementById('valor_recebimento').value = conta.valor || '';
        document.getElementById('data_vencimento_recebimento').value = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : '';
        document.getElementById('status_recebimento').value = conta.status || 'pendente';
        document.getElementById('forma_pagamento_recebimento').value = conta.forma_pagamento || '';
        document.getElementById('observacoes_recebimento').value = conta.observacoes || '';
        
        // Armazenar o ID do recebimento no formulário para uso posterior
        document.getElementById('recebimentoForm').setAttribute('data-id', contaId);
        
        // Exibir modal
        document.getElementById('recebimentoModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar dados do recebimento:', error);
        alert('Erro ao carregar dados do recebimento. Por favor, tente novamente.');
    }
}

async function salvarContaReceber() {
    try {
        // Obter dados do formulário
        const formElement = document.getElementById('recebimentoForm');
        const contaId = formElement.getAttribute('data-id');
        
        const contaReceber = {
            cliente_id: document.getElementById('cliente_id_recebimento').value,
            descricao: document.getElementById('descricao_recebimento').value,
            valor: parseFloat(document.getElementById('valor_recebimento').value),
            data_vencimento: formatarDataParaAPI(document.getElementById('data_vencimento_recebimento').value),
            status: document.getElementById('status_recebimento').value,
            forma_pagamento: document.getElementById('forma_pagamento_recebimento').value,
            observacoes: document.getElementById('observacoes_recebimento').value
        };
        
        // Salvar via API
        await apiSaveAccountReceivable(contaReceber, contaId);
        
        // Exibir mensagem de sucesso
        alert(contaId ? 'Recebimento atualizado com sucesso!' : 'Recebimento cadastrado com sucesso!');
        
        // Fechar modal e atualizar dados
        document.getElementById('recebimentoModal').style.display = 'none';
        carregarContasReceber();
        carregarIndicadoresFinanceiros();
        carregarFluxoCaixa();
    } catch (error) {
        console.error('Erro ao salvar conta a receber:', error);
        alert('Erro ao salvar conta a receber. Por favor, tente novamente.');
    }
}

// Funções para Contas a Pagar
function abrirModalNovoPagamento() {
    // Limpar formulário
    document.getElementById('pagamentoForm').reset();
    document.getElementById('pagamentoForm').removeAttribute('data-id');
    
    // Atualizar título
    document.getElementById('pagamentoModalTitle').textContent = 'Novo Pagamento';
    
    // Exibir modal
    document.getElementById('pagamentoModal').style.display = 'flex';
}

async function abrirModalEditarPagamento(contaId) {
    try {
        document.getElementById('pagamentoModalTitle').textContent = `Editar Pagamento #${contaId}`;
        
        // Buscar dados do pagamento na API
        const conta = await apiGetAccountPayable(contaId);
        
        // Preencher o formulário com os dados do pagamento
        document.getElementById('fornecedor_id_pagamento').value = conta.fornecedor_id || '';
        document.getElementById('descricao_pagamento').value = conta.descricao || '';
        document.getElementById('valor_pagamento').value = conta.valor || '';
        document.getElementById('data_vencimento_pagamento').value = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : '';
        document.getElementById('status_pagamento').value = conta.status || 'pendente';
        document.getElementById('categoria_pagamento').value = conta.categoria_id || '';
        document.getElementById('forma_pagamento_pagamento').value = conta.forma_pagamento || '';
        document.getElementById('observacoes_pagamento').value = conta.observacoes || '';
        
        // Armazenar o ID do pagamento no formulário para uso posterior
        document.getElementById('pagamentoForm').setAttribute('data-id', contaId);
        
        // Exibir modal
        document.getElementById('pagamentoModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar dados do pagamento:', error);
        alert('Erro ao carregar dados do pagamento. Por favor, tente novamente.');
    }
}

async function salvarContaPagar() {
    try {
        // Obter dados do formulário
        const formElement = document.getElementById('pagamentoForm');
        const contaId = formElement.getAttribute('data-id');
        
        const contaPagar = {
            fornecedor_id: document.getElementById('fornecedor_id_pagamento').value,
            descricao: document.getElementById('descricao_pagamento').value,
            valor: parseFloat(document.getElementById('valor_pagamento').value),
            data_vencimento: formatarDataParaAPI(document.getElementById('data_vencimento_pagamento').value),
            status: document.getElementById('status_pagamento').value,
            categoria_id: document.getElementById('categoria_pagamento').value,
            forma_pagamento: document.getElementById('forma_pagamento_pagamento').value,
            observacoes: document.getElementById('observacoes_pagamento').value
        };
        
        // Salvar via API
        await apiSaveAccountPayable(contaPagar, contaId);
        
        // Exibir mensagem de sucesso
        alert(contaId ? 'Pagamento atualizado com sucesso!' : 'Pagamento cadastrado com sucesso!');
        
        // Fechar modal e atualizar dados
        document.getElementById('pagamentoModal').style.display = 'none';
        carregarContasPagar();
        carregarIndicadoresFinanceiros();
        carregarFluxoCaixa();
    } catch (error) {
        console.error('Erro ao salvar conta a pagar:', error);
        alert('Erro ao salvar conta a pagar. Por favor, tente novamente.');
    }
}

// Funções para Lançamentos
function abrirModalNovoLancamento() {
    // Limpar formulário
    document.getElementById('lancamentoForm').reset();
    document.getElementById('lancamentoForm').removeAttribute('data-id');
    
    // Atualizar título
    document.getElementById('lancamentoModalTitle').textContent = 'Novo Lançamento';
    
    // Exibir modal
    document.getElementById('lancamentoModal').style.display = 'flex';
}

async function abrirModalEditarLancamento(lancamentoId) {
    try {
        document.getElementById('lancamentoModalTitle').textContent = `Editar Lançamento #${lancamentoId}`;
        
        // Buscar dados do lançamento na API
        const lancamento = await apiGetTransaction(lancamentoId);
        
        // Preencher o formulário com os dados do lançamento
        document.getElementById('descricao_lancamento').value = lancamento.descricao || '';
        document.getElementById('tipo_lancamento').value = lancamento.tipo || 'entrada';
        document.getElementById('categoria_lancamento').value = lancamento.categoria_id || '';
        document.getElementById('valor_lancamento').value = lancamento.valor || '';
        document.getElementById('data_lancamento').value = lancamento.data ? lancamento.data.split('T')[0] : '';
        document.getElementById('cliente_id_lancamento').value = lancamento.cliente_id || '';
        document.getElementById('observacao_lancamento').value = lancamento.observacao || '';
        
        // Armazenar o ID do lançamento no formulário para uso posterior
        document.getElementById('lancamentoForm').setAttribute('data-id', lancamentoId);
        
        // Exibir modal
        document.getElementById('lancamentoModal').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao carregar dados do lançamento:', error);
        alert('Erro ao carregar dados do lançamento. Por favor, tente novamente.');
    }
}

async function salvarLancamento() {
    try {
        // Obter dados do formulário
        const formElement = document.getElementById('lancamentoForm');
        const lancamentoId = formElement.getAttribute('data-id');
        
        const lancamento = {
            descricao: document.getElementById('descricao_lancamento').value,
            tipo: document.getElementById('tipo_lancamento').value,
            categoria_id: document.getElementById('categoria_lancamento').value,
            valor: parseFloat(document.getElementById('valor_lancamento').value),
            data: formatarDataParaAPI(document.getElementById('data_lancamento').value),
            cliente_id: document.getElementById('cliente_id_lancamento').value || null,
            observacao: document.getElementById('observacao_lancamento').value
        };
        
        // Salvar via API
        await apiSaveTransaction(lancamento, lancamentoId);
        
        // Exibir mensagem de sucesso
        alert(lancamentoId ? 'Lançamento atualizado com sucesso!' : 'Lançamento cadastrado com sucesso!');
        
        // Fechar modal e atualizar dados
        document.getElementById('lancamentoModal').style.display = 'none';
        carregarLancamentos();
        carregarIndicadoresFinanceiros();
        carregarFluxoCaixa();
    } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        alert('Erro ao salvar lançamento. Por favor, tente novamente.');
    }
}
