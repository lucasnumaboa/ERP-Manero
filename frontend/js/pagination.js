/**
 * Sistema de paginação para o ERP Maneiro
 * Implementa paginação dinâmica com limite de 25 registros por página
 */

// Variáveis globais de paginação
let currentPage = 1;
let totalPages = 1;
let itemsPerPage = 25;
let allItems = [];

/**
 * Inicializa o sistema de paginação
 * @param {Array} items - Array com todos os itens a serem paginados
 * @param {Function} displayFunction - Função que exibe os itens na página
 * @param {string} paginationContainerId - ID do container de paginação (opcional)
 */
function initPagination(items, displayFunction, paginationContainerId = 'pagination') {
    // Verifica se os parâmetros necessários foram fornecidos
    if (!items || !displayFunction) {
        console.log('Paginação: aguardando dados...');
        return;
    }
    
    allItems = items;
    currentPage = 1;
    
    // Calcula o total de páginas
    totalPages = Math.ceil(allItems.length / itemsPerPage);
    
    // Atualiza a exibição dos itens
    updateDisplay(displayFunction);
    
    // Atualiza os botões de paginação
    updatePaginationButtons(paginationContainerId);
}

/**
 * Atualiza a exibição dos itens com base na página atual
 * @param {Function} displayFunction - Função que exibe os itens na página
 */
function updateDisplay(displayFunction) {
    // Calcula o índice inicial e final dos itens a serem exibidos
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
    
    // Obtém os itens da página atual
    const currentItems = allItems.slice(startIndex, endIndex);
    
    // Chama a função de exibição com os itens da página atual
    displayFunction(currentItems);
}

/**
 * Atualiza os botões de paginação
 * @param {string} containerId - ID do container de paginação
 */
function updatePaginationButtons(containerId = 'pagination') {
    const paginationContainer = document.querySelector(`.${containerId}`);
    if (!paginationContainer) return;
    
    // Limpa o container de paginação
    paginationContainer.innerHTML = '';
    
    // Botão anterior
    const prevButton = document.createElement('button');
    prevButton.className = 'btn-page';
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateDisplay(window.currentDisplayFunction);
            updatePaginationButtons(containerId);
        }
    });
    paginationContainer.appendChild(prevButton);
    
    // Determina quais números de página mostrar
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    // Ajusta o startPage se necessário
    if (endPage - startPage < 4 && startPage > 1) {
        startPage = Math.max(1, endPage - 4);
    }
    
    // Adiciona os botões de número de página
    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.className = `btn-page ${i === currentPage ? 'active' : ''}`;
        pageButton.textContent = i;
        pageButton.addEventListener('click', () => {
            currentPage = i;
            updateDisplay(window.currentDisplayFunction);
            updatePaginationButtons(containerId);
        });
        paginationContainer.appendChild(pageButton);
    }
    
    // Botão próximo
    const nextButton = document.createElement('button');
    nextButton.className = 'btn-page';
    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateDisplay(window.currentDisplayFunction);
            updatePaginationButtons(containerId);
        }
    });
    paginationContainer.appendChild(nextButton);
}

/**
 * Muda para uma página específica
 * @param {number} page - Número da página
 * @param {Function} displayFunction - Função que exibe os itens na página
 * @param {string} containerId - ID do container de paginação
 */
function goToPage(page, displayFunction, containerId = 'pagination') {
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        updateDisplay(displayFunction);
        updatePaginationButtons(containerId);
    }
}