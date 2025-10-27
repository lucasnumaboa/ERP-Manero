// API functions for the financial module

// Function to load financial indicators
async function apiLoadFinancialIndicators() {
    try {
        // Usa a nova API centralizada
        return await apiGet('/api/financeiro/indicadores');
    } catch (error) {
        console.error('Error loading financial indicators:', error);
        throw error;
    }
}

// Functions for Accounts Receivable (Contas a Receber)
async function apiLoadAccountsReceivable(filters = {}) {
    try {
        // Filtra os parâmetros vazios
        const queryParams = {};
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                queryParams[key] = value;
            }
        }
        
        // Usa a nova API centralizada
        return await apiGet('/api/financeiro/contas-receber', queryParams);
    } catch (error) {
        console.error('Error loading accounts receivable:', error);
        throw error;
    }
}

async function apiGetAccountReceivable(id) {
    try {
        // Usa a nova API centralizada
        return await apiGet(`/api/financeiro/contas-receber/${id}`);
    } catch (error) {
        console.error(`Error loading account receivable #${id}:`, error);
        throw error;
    }
}

async function apiSaveAccountReceivable(data, id = null) {
    try {
        // Usa a nova API centralizada
        if (id) {
            return await apiPut(`/api/financeiro/contas-receber/${id}`, data);
        } else {
            return await apiPost('/api/financeiro/contas-receber', data);
        }
    } catch (error) {
        console.error('Error saving account receivable:', error);
        throw error;
    }
}

async function apiMarkAccountReceivableAsPaid(id) {
    try {
        // Usa a nova API centralizada
        return await apiPut(`/api/financeiro/contas-receber/${id}/pagar`);
    } catch (error) {
        console.error(`Error marking account receivable #${id} as paid:`, error);
        throw error;
    }
}

// Functions for Accounts Payable (Contas a Pagar)
async function apiLoadAccountsPayable(filters = {}) {
    try {
        // Filtra os parâmetros vazios
        const queryParams = {};
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                queryParams[key] = value;
            }
        }
        
        // Usa a nova API centralizada
        return await apiGet('/api/financeiro/contas-pagar', queryParams);
    } catch (error) {
        console.error('Error loading accounts payable:', error);
        throw error;
    }
}

async function apiGetAccountPayable(id) {
    try {
        // Usa a nova API centralizada
        return await apiGet(`/api/financeiro/contas-pagar/${id}`);
    } catch (error) {
        console.error(`Error loading account payable #${id}:`, error);
        throw error;
    }
}

async function apiSaveAccountPayable(data, id = null) {
    try {
        // Usa a nova API centralizada
        if (id) {
            return await apiPut(`/api/financeiro/contas-pagar/${id}`, data);
        } else {
            return await apiPost('/api/financeiro/contas-pagar', data);
        }
    } catch (error) {
        console.error('Error saving account payable:', error);
        throw error;
    }
}

async function apiMarkAccountPayableAsPaid(id) {
    try {
        // Usa a nova API centralizada
        return await apiPut(`/api/financeiro/contas-pagar/${id}/pagar`);
    } catch (error) {
        console.error(`Error marking account payable #${id} as paid:`, error);
        throw error;
    }
}

// Functions for Financial Transactions (Lançamentos)
async function apiLoadTransactions(filters = {}) {
    try {
        // Filtra os parâmetros vazios
        const queryParams = {};
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                queryParams[key] = value;
            }
        }
        
        // Usa a nova API centralizada
        return await apiGet('/api/financeiro/lancamentos', queryParams);
    } catch (error) {
        console.error('Error loading transactions:', error);
        throw error;
    }
}

async function apiGetTransaction(id) {
    try {
        // Usa a nova API centralizada
        return await apiGet(`/api/financeiro/lancamentos/${id}`);
    } catch (error) {
        console.error(`Error loading transaction #${id}:`, error);
        throw error;
    }
}

async function apiSaveTransaction(data, id = null) {
    try {
        // Usa a nova API centralizada
        if (id) {
            return await apiPut(`/api/financeiro/lancamentos/${id}`, data);
        } else {
            return await apiPost('/api/financeiro/lancamentos', data);
        }
    } catch (error) {
        console.error('Error saving transaction:', error);
        throw error;
    }
}

async function apiDeleteTransaction(id) {
    try {
        // Usa a nova API centralizada
        return await apiDelete(`/api/financeiro/lancamentos/${id}`);
    } catch (error) {
        console.error(`Error deleting transaction #${id}:`, error);
        throw error;
    }
}

// Functions for Cash Flow (Fluxo de Caixa)
async function apiLoadCashFlow(filters = {}) {
    try {
        // Filtra os parâmetros vazios
        const queryParams = {};
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                queryParams[key] = value;
            }
        }
        
        // Usa a nova API centralizada
        return await apiGet('/api/financeiro/fluxo-caixa', queryParams);
    } catch (error) {
        console.error('Error loading cash flow:', error);
        throw error;
    }
}

// Functions for loading reference data
async function apiLoadClients() {
    try {
        // Usa a nova API centralizada
        return await apiGet('/api/clientes');
    } catch (error) {
        console.error('Error loading clients:', error);
        throw error;
    }
}

async function apiLoadSuppliers() {
    try {
        // Usa a nova API centralizada
        return await apiGet('/api/fornecedores');
    } catch (error) {
        console.error('Error loading suppliers:', error);
        throw error;
    }
}

async function apiLoadCategories() {
    try {
        // Usa a nova API centralizada
        return await apiGet('/api/categorias');
    } catch (error) {
        console.error('Error loading categories:', error);
        throw error;
    }
}
