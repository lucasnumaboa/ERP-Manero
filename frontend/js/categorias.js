// Verifica se o usuário está autenticado
document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Configura o botão de logout
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        logout();
    });

    // Configura o botão de toggle do sidebar
    document.getElementById('toggleSidebar').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    // Carrega os dados do usuário
    loadUserData();

    // Carrega a lista de categorias
    loadCategorias();

    // Configura os botões de ação
    setupActionButtons();
});

// Carrega os dados do usuário do localStorage
function loadUserData() {
    const userData = getUserData();
    if (userData) {
        document.getElementById('userName').textContent = userData.nome || 'Usuário';
        document.getElementById('userRole').textContent = formatRole(userData.nivel_acesso) || 'Usuário';
    }
}

// Formata o nível de acesso para exibição
function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'vendedor': 'Vendedor',
        'comprador': 'Comprador',
        'financeiro': 'Financeiro'
    };
    return roles[role] || role;
}

// Carrega a lista de categorias da API
async function loadCategorias() {
    console.log('Carregando categorias da API centralizada');
    
    // Mostra mensagem de carregamento
    document.getElementById('categoriasTableBody').innerHTML = '<tr><td colspan="6" class="text-center">Carregando categorias...</td></tr>';
    
    // Obtém valores dos filtros
    const status = document.getElementById('filtroStatus').value;
    
    // Constrói os parâmetros de consulta
    const params = new URLSearchParams();
    if (status !== '') params.append('ativo', status);
    
    try {
        // Usa a API centralizada
        const url = `/api/categorias${params.toString() ? '?' + params.toString() : ''}`;
        console.log(`Enviando requisição GET para API centralizada: ${url}`);
        
        const data = await apiGet(url);
        console.log('Categorias carregadas com sucesso:', data.length);
        
        // Configuração da paginação
        window.currentDisplayFunction = displayCategorias;
        initPagination(data, displayCategorias);
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        
        // Se a API não estiver disponível, carrega dados de exemplo para demonstração
        console.log('Carregando dados de exemplo para demonstração');
        const exemplosCategorias = [
            {id: 1, nome: 'Eletrônicos', descricao: 'Produtos eletrônicos em geral', ativo: true},
            {id: 2, nome: 'Móveis', descricao: 'Móveis para casa e escritório', ativo: true},
            {id: 3, nome: 'Vestuário', descricao: 'Roupas e acessórios', ativo: true},
            {id: 4, nome: 'Alimentos', descricao: 'Produtos alimentícios', ativo: false}
        ];
        
        // Configuração da paginação para dados de exemplo
        window.currentDisplayFunction = displayCategorias;
        initPagination(exemplosCategorias, displayCategorias);
    }
}

// Exibe as categorias na tabela
function displayCategorias(categorias) {
    console.log('Exibindo categorias na tabela:', categorias ? categorias.length : 0, 'categorias');
    
    const tbody = document.getElementById('categoriasTableBody');
    if (!tbody) {
        console.error('Elemento tbody não encontrado!');
        return;
    }
    
    if (!categorias || categorias.length === 0) {
        console.log('Nenhuma categoria encontrada para exibir');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma categoria encontrada</td></tr>';
        return;
    }
    
    console.log('Limpando tabela e adicionando', categorias.length, 'categorias');
    tbody.innerHTML = '';
    
    // Adiciona cada categoria na tabela
    categorias.forEach(categoria => {
        // Usa a contagem real de produtos da categoria (se disponível) ou zero
        const produtosCount = categoria.produtos_count || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${categoria.id}</td>
            <td>${categoria.nome}</td>
            <td>${categoria.descricao || '-'}</td>
            <td>
                <span class="status-badge ${categoria.ativo ? 'status-active' : 'status-inactive'}">
                    ${categoria.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>${produtosCount}</td>
            <td class="actions">
                <button class="btn-icon btn-edit" data-id="${categoria.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" data-id="${categoria.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // Adiciona event listeners para os botões de ação
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const categoriaId = this.getAttribute('data-id');
            openCategoriaModal(categoriaId);
        });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const categoriaId = this.getAttribute('data-id');
            deleteCategoria(categoriaId);
        });
    });
}

// Configura os botões de ação
function setupActionButtons() {
    // Botão Nova Categoria
    document.getElementById('btnNovaCategoria').addEventListener('click', function() {
        openCategoriaModal();
    });
    
    // Botão Exportar
    document.getElementById('btnExportarCategorias').addEventListener('click', function() {
        alert('Funcionalidade de exportação será implementada em breve!');
    });
    
    // Filtro de Status
    document.getElementById('filtroStatus').addEventListener('change', function() {
        loadCategorias();
    });
    
    // Botões do Modal
    document.querySelector('.close-modal').addEventListener('click', function() {
        closeModal('categoriaModal');
    });
    
    document.getElementById('btnCancelar').addEventListener('click', function() {
        closeModal('categoriaModal');
    });
    
    document.getElementById('btnSalvar').addEventListener('click', function() {
        saveCategoria();
    });
}

// Abre o modal de categoria
function openCategoriaModal(categoriaId = null) {
    console.log(`Abrindo modal de categoria${categoriaId ? ' para edição' : ' para criação'}`);
    
    // Limpa o formulário
    document.getElementById('categoriaForm').reset();
    
    // Configura o título do modal
    document.getElementById('modalTitle').textContent = categoriaId ? 'Editar Categoria' : 'Nova Categoria';
    
    // Se for edição, carrega os dados da categoria
    if (categoriaId) {
        loadCategoriaData(categoriaId);
    }
    
    // Armazena o ID da categoria sendo editada (se houver)
    document.getElementById('categoriaForm').setAttribute('data-id', categoriaId || '');
    
    // Exibe o modal
    document.getElementById('categoriaModal').classList.add('active');
}

// Carrega os dados de uma categoria específica
async function loadCategoriaData(categoriaId) {
    console.log(`Carregando dados da categoria ID: ${categoriaId}`);
    
    try {
        // Usa a API centralizada
        console.log(`Enviando requisição GET para API centralizada: /api/categorias/${categoriaId}`);
        const categoria = await apiGet(`/api/categorias/${categoriaId}`);
        
        console.log('Dados da categoria carregados:', categoria);
        preencherFormularioCategoria(categoria, categoriaId);
    } catch (error) {
        console.error('Erro ao carregar dados da categoria:', error);
        
        // Simulando dados para demonstração
        console.log('Carregando dados de exemplo para demonstração');
        const exemploCategoria = {
            id: categoriaId,
            nome: `Categoria ${categoriaId}`,
            descricao: `Descrição da categoria ${categoriaId}`,
            ativo: true
        };
        
        preencherFormularioCategoria(exemploCategoria, categoriaId);
    }
}

// Função auxiliar para preencher o formulário com os dados da categoria
function preencherFormularioCategoria(categoria, categoriaId) {
    document.getElementById('nome').value = categoria.nome || '';
    document.getElementById('descricao').value = categoria.descricao || '';
    document.getElementById('ativo').checked = categoria.ativo !== false;
}

// Fecha o modal
function closeModal(modalId) {
    console.log(`Fechando modal: ${modalId}`);
    
    // Limpa o formulário
    if (modalId === 'categoriaModal') {
        document.getElementById('categoriaForm').reset();
        document.getElementById('categoriaForm').removeAttribute('data-id');
    }
    
    // Esconde o modal
    document.getElementById(modalId).classList.remove('active');
}

// Salva a categoria (nova ou edição)
async function saveCategoria() {
    console.log('Tentando salvar categoria...');
    
    try {
        // Obtém o ID da categoria (se for edição)
        const form = document.getElementById('categoriaForm');
        const categoriaId = form.getAttribute('data-id');
        
        console.log(`Salvando categoria${categoriaId ? ' (edição)' : ' (nova)'}`);
        
        // Obtém os dados do formulário
        const nome = document.getElementById('nome').value.trim();
        const descricao = document.getElementById('descricao').value.trim();
        const ativo = document.getElementById('ativo').checked;
        
        // Validação básica
        if (!nome) {
            console.error('Nome da categoria é obrigatório!');
            alert('Por favor, informe o nome da categoria.');
            return;
        }
        
        // Prepara os dados para envio
        const categoriaData = {
            nome: nome,
            descricao: descricao,
            ativo: ativo
        };
        
        console.log('Dados da categoria para salvar:', categoriaData);
        
        try {
            let data;
            
            if (categoriaId) {
                // Atualiza categoria existente
                console.log(`Atualizando categoria ID: ${categoriaId}`);
                data = await apiPut(`/api/categorias/${categoriaId}`, categoriaData);
            } else {
                // Cria nova categoria
                console.log('Criando nova categoria');
                data = await apiPost('/api/categorias', categoriaData);
            }
            
            console.log('Categoria salva com sucesso:', data);
            
            // Fecha o modal
            closeModal('categoriaModal');
            
            // Recarrega a lista de categorias
            loadCategorias();
            
            // Exibe mensagem de sucesso
            alert(categoriaId ? 'Categoria atualizada com sucesso!' : 'Categoria criada com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar categoria:', error);
            
            // Exibe mensagem de erro
            alert(`Erro ao salvar categoria: ${error.message || 'Verifique os dados e tente novamente'}`);
            
            // Para fins de demonstração, simula sucesso se estiver em ambiente de desenvolvimento
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Ambiente de desenvolvimento detectado. Simulando salvamento bem-sucedido para demonstração');
                closeModal('categoriaModal');
                loadCategorias();
                alert(categoriaId ? 'Categoria atualizada com sucesso! (simulação)' : 'Categoria criada com sucesso! (simulação)');
            }
        }
    } catch (error) {
        console.error('Erro inesperado ao salvar categoria:', error);
        alert('Erro ao salvar categoria. Tente novamente.');
    }
}

// Exclui uma categoria
async function deleteCategoria(categoriaId) {
    console.log(`Tentando excluir categoria ID: ${categoriaId}`);
    
    try {
        if (!categoriaId) {
            console.error('ID da categoria não fornecido para exclusão!');
            return;
        }
        
        if (!confirm('Tem certeza que deseja excluir esta categoria?')) {
            console.log('Exclusão cancelada pelo usuário');
            return;
        }
        
        console.log('Exclusão confirmada, enviando requisição para a API centralizada...');
        
        try {
            // Usa a API centralizada
            await apiDelete(`/api/categorias/${categoriaId}`);
            console.log('Categoria excluída com sucesso');
            
            // Recarrega a lista de categorias
            loadCategorias();
            
            // Exibe mensagem de sucesso
            alert('Categoria excluída com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir categoria:', error);
            
            // Verifica se o erro é devido a produtos vinculados
            if (error.status === 400 || (error.message && error.message.includes('vinculados'))) {
                alert('Não é possível excluir esta categoria pois existem produtos vinculados a ela.');
            } else {
                alert(`Erro ao excluir categoria: ${error.message || 'Tente novamente mais tarde.'}`);
                
                // Simulando exclusão bem-sucedida para demonstração em ambiente de desenvolvimento
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('Ambiente de desenvolvimento detectado. Simulando exclusão bem-sucedida para demonstração');
                    loadCategorias();
                }
            }
        }
    } catch (error) {
        console.error('Erro inesperado ao excluir categoria:', error);
        alert('Erro ao excluir categoria. Tente novamente.');
    }
}
