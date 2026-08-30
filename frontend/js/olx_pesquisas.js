// OLX Pesquisas - JavaScript (Produtos Encontrados)
document.addEventListener('DOMContentLoaded', function () {
    initPage();
});

let produtos = [];
let pesquisas = [];
let filteredProdutos = [];
let selectedProducts = new Set();
let currentPesquisaId = null;
let showingHidden = false;

async function initPage() {
    await Promise.all([
        carregarPesquisas(),
        carregarProdutos(),
        carregarProdutosPendentes()
    ]);

    setupEventListeners();
    updateStats();
}

function setupEventListeners() {
    // Search
    document.getElementById('searchInput').addEventListener('input', filtrarProdutos);

    // Filter by pesquisa
    document.getElementById('pesquisaFilter').addEventListener('change', function () {
        currentPesquisaId = this.value || null;
        filtrarProdutos();
    });

    // Toggle hidden
    document.getElementById('btnToggleHidden').addEventListener('click', function () {
        showingHidden = !showingHidden;
        this.innerHTML = showingHidden
            ? '<i class="fas fa-eye"></i> Mostrar Visíveis'
            : '<i class="fas fa-eye-slash"></i> Mostrar Ocultos';
        filtrarProdutos();
    });

    // Show selected
    document.getElementById('btnShowSelected').addEventListener('click', () => alterarVisibilidadeEmLote('show'));

    // Hide selected
    document.getElementById('btnHideSelected').addEventListener('click', () => alterarVisibilidadeEmLote('hide'));

    // Avaliar produtos
    document.getElementById('btnAvaliar').addEventListener('click', avaliarProdutos);

    // Reavaliar todos
    document.getElementById('btnReavaliar').addEventListener('click', reavaliarProdutos);

    // Card de pendentes (clique para avaliar)
    document.getElementById('pendentesCard').addEventListener('click', avaliarProdutos);
}

async function carregarPesquisas() {
    try {
        const response = await apiGet('/api/olx/pesquisas');
        pesquisas = response || [];

        const select = document.getElementById('pesquisaFilter');
        select.innerHTML = '<option value="">Todas as Pesquisas</option>';

        pesquisas.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.nome_produto}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar pesquisas:', error);
    }
}

async function carregarProdutos() {
    try {
        const response = await apiGet('/api/olx/produtos');
        produtos = response || [];
        filtrarProdutos();
        updateStats();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        document.getElementById('productsList').innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao carregar produtos</p>
            </div>
        `;
    }
}

function updateStats() {
    const total = produtos.length;
    const visiveis = produtos.filter(p => p.visivel).length;
    const ocultos = total - visiveis;

    document.getElementById('totalProdutos').textContent = total;
    document.getElementById('produtosVisiveis').textContent = visiveis;
    document.getElementById('produtosOcultos').textContent = ocultos;
}

function filtrarProdutos() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    filteredProdutos = produtos.filter(p => {
        // Filter by pesquisa
        if (currentPesquisaId && p.pesquisa_id != currentPesquisaId) return false;

        // Filter by visibility
        if (showingHidden && p.visivel) return false;
        if (!showingHidden && !p.visivel) return false;

        // Filter by search term
        if (searchTerm) {
            const titleMatch = p.titulo.toLowerCase().includes(searchTerm);
            const descMatch = p.descricao && p.descricao.toLowerCase().includes(searchTerm);
            if (!titleMatch && !descMatch) return false;
        }

        return true;
    });

    renderizarProdutos();
}

function renderizarProdutos() {
    const container = document.getElementById('productsList');

    if (filteredProdutos.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-inbox"></i>
                <p>Nenhum produto encontrado</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredProdutos.map(p => `
        <div class="product-card" data-id="${p.id}">
            <div class="product-image-container">
                <div class="product-checkbox-container">
                    <input type="checkbox" class="product-checkbox" value="${p.id}" 
                        ${selectedProducts.has(p.id) ? 'checked' : ''}>
                </div>
                <div class="product-visibility-badge">
                    ${p.visivel
            ? '<span class="badge-visible">Visível</span>'
            : '<span class="badge-hidden">Oculto</span>'}
                </div>
                ${p.imagem
            ? `<img src="${p.imagem}" alt="${p.titulo}" class="product-image" onerror="this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'><i class=\\'fas fa-box\\'></i></div>'">`
            : `<div class="product-image-placeholder"><i class="fas fa-box"></i></div>`
        }
            </div>
            <div class="product-body">
                <div class="product-title" title="${p.titulo}">${p.titulo}</div>
                <div class="product-price">${p.preco ? 'R$ ' + parseFloat(p.preco).toFixed(2).replace('.', ',') : 'Preço não informado'}</div>
                ${p.pesquisa_nome ? `<span class="product-search-tag">${p.pesquisa_nome}</span>` : ''}
                <div class="product-actions">
                    <a href="${p.link}" target="_blank" class="btn-icon" title="Ver no OLX">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                    <button class="btn-icon" onclick="toggleVisibilidade(${p.id})" title="${p.visivel ? 'Ocultar' : 'Mostrar'}">
                        <i class="fas ${p.visivel ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    // Setup checkbox listeners
    container.querySelectorAll('.product-checkbox').forEach(cb => {
        cb.addEventListener('change', function () {
            if (this.checked) {
                selectedProducts.add(parseInt(this.value));
            } else {
                selectedProducts.delete(parseInt(this.value));
            }
            updateButtonStates();
        });
    });
}

function updateButtonStates() {
    const hasSelection = selectedProducts.size > 0;
    document.getElementById('btnShowSelected').disabled = !hasSelection;
    document.getElementById('btnHideSelected').disabled = !hasSelection;
}

async function toggleVisibilidade(id) {
    try {
        const response = await apiPost(`/api/olx/produtos/${id}/toggle`);

        // Update local data
        const produto = produtos.find(p => p.id === id);
        if (produto) {
            produto.visivel = response.visible;
        }

        filtrarProdutos();
        updateStats();
        showNotification(response.message, 'success');
    } catch (error) {
        console.error('Erro ao alterar visibilidade:', error);
        showNotification('Erro ao alterar visibilidade', 'error');
    }
}

async function alterarVisibilidadeEmLote(action) {
    if (selectedProducts.size === 0) return;

    try {
        const response = await apiPost('/api/olx/produtos/bulk-visibility', {
            product_ids: Array.from(selectedProducts),
            action: action
        });

        // Update local data
        const visible = action === 'show';
        selectedProducts.forEach(id => {
            const produto = produtos.find(p => p.id === id);
            if (produto) produto.visivel = visible;
        });

        selectedProducts.clear();
        filtrarProdutos();
        updateStats();
        updateButtonStates();

        showNotification(response.message, 'success');
    } catch (error) {
        console.error('Erro ao alterar visibilidade em lote:', error);
        showNotification('Erro ao alterar visibilidade', 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
    notification.innerHTML = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
}

// ============================================
// Funções de Avaliação de Produtos
// ============================================

async function carregarProdutosPendentes() {
    try {
        const response = await apiGet('/api/olx/produtos/pendentes');
        const pendentes = response.pendentes || 0;
        
        const element = document.getElementById('produtosPendentes');
        if (element) {
            element.textContent = pendentes;
            
            // Destacar se houver pendentes
            if (pendentes > 0) {
                element.style.color = '#e74c3c';
                element.style.animation = 'pulse 2s infinite';
            } else {
                element.style.color = '#27ae60';
                element.style.animation = 'none';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar produtos pendentes:', error);
    }
}

async function avaliarProdutos() {
    const btnAvaliar = document.getElementById('btnAvaliar');
    const originalText = btnAvaliar.innerHTML;
    
    try {
        // Mostrar loading
        btnAvaliar.disabled = true;
        btnAvaliar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Avaliando...';
        
        // Chamar API de avaliação
        const pesquisaId = currentPesquisaId || '';
        const url = pesquisaId 
            ? `/api/olx/produtos/avaliar?pesquisa_id=${pesquisaId}` 
            : '/api/olx/produtos/avaliar';
        
        const response = await apiPost(url);
        
        // Mostrar resultado
        showNotification(response.message, 'success');
        
        // Recarregar dados
        await Promise.all([
            carregarProdutos(),
            carregarProdutosPendentes()
        ]);
        
    } catch (error) {
        console.error('Erro ao avaliar produtos:', error);
        showNotification('Erro ao avaliar produtos: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
        // Restaurar botão
        btnAvaliar.disabled = false;
        btnAvaliar.innerHTML = originalText;
    }
}

async function reavaliarProdutos() {
    const btnReavaliar = document.getElementById('btnReavaliar');
    const originalText = btnReavaliar.innerHTML;
    
    // Confirmar ação
    if (!confirm('Isso irá resetar e reavaliar todos os produtos. Deseja continuar?')) {
        return;
    }
    
    try {
        // Mostrar loading
        btnReavaliar.disabled = true;
        btnReavaliar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reavaliando...';
        
        // Chamar API de reavaliação
        const pesquisaId = currentPesquisaId || '';
        const url = pesquisaId 
            ? `/api/olx/produtos/reavaliar?pesquisa_id=${pesquisaId}` 
            : '/api/olx/produtos/reavaliar';
        
        const response = await apiPost(url);
        
        // Mostrar resultado
        showNotification(response.message, 'success');
        
        // Recarregar dados
        await Promise.all([
            carregarProdutos(),
            carregarProdutosPendentes()
        ]);
        
    } catch (error) {
        console.error('Erro ao reavaliar produtos:', error);
        showNotification('Erro ao reavaliar produtos: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
        // Restaurar botão
        btnReavaliar.disabled = false;
        btnReavaliar.innerHTML = originalText;
    }
}
