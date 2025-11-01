// Utilitário para verificação de permissões em todas as páginas

document.addEventListener('DOMContentLoaded', function() {
    // Verifica permissões para ações na página atual
    checkPagePermissions();
});

// Verifica permissões para a página atual
async function checkPagePermissions() {
    try {
        // Identifica a página atual
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Mapeamento de páginas para permissões de visualização e edição
        const permissions = {
            'dashboard.html': {
                view: 'dashboard_visualizar',
                edit: 'dashboard_editar'
            },
            'produtos.html': {
                view: 'produtos_visualizar',
                edit: 'produtos_editar'
            },
            'clientes.html': {
                view: 'clientes_visualizar',
                edit: 'clientes_editar'
            },
            'vendas.html': {
                view: 'vendas_visualizar',
                edit: 'vendas_editar'
            },
            'vendedores.html': {
                view: 'vendedores_visualizar',
                edit: 'vendedores_editar'
            },
            'compras.html': {
                view: 'compras_visualizar',
                edit: 'compras_editar'
            },
            'fornecedores.html': {
                view: 'fornecedores_visualizar',
                edit: 'fornecedores_editar'
            },
            'estoque.html': {
                view: 'estoque_visualizar',
                edit: 'estoque_editar'
            },
            'financeiro.html': {
                view: 'financeiro_visualizar',
                edit: 'financeiro_editar'
            },
            'configuracoes.html': {
                view: 'configuracoes_visualizar',
                edit: 'configuracoes_editar'
            },
            'categorias.html': {
                view: 'categorias_visualizar',
                edit: 'categorias_editar'
            }
        };
        
        // Se a página atual tem permissões associadas
        if (permissions[currentPage]) {
            // Verifica permissão de edição
            const canEdit = await hasPermission(permissions[currentPage].edit);
            
            // Se pode editar, adiciona classe para mostrar botões
            if (canEdit) {
                document.body.classList.add('has-edit-permission');
            }
        }
    } catch (error) {
        console.error('Erro ao verificar permissões da página:', error);
    }
}

// Oculta botões de edição na página
function hideEditButtons() {
    // Botões comuns de adição, edição e exclusão
    const editButtons = document.querySelectorAll('.btn-primary, .btn-add, .btn-edit, .btn-delete, .btn-save, [data-action="edit"], [data-action="delete"], #btnNovaVenda, #btnNovoProduto, #btnNovoCliente, #btnNovoFornecedor, #btnNovaCompra');
    
    editButtons.forEach(button => {
        // Oculta o botão completamente
        button.style.display = 'none';
    });
    
    // Desabilita formulários de edição
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.disabled = true;
        });
        
        // Oculta botões de submit nos formulários
        const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
        submitButtons.forEach(button => {
            button.style.display = 'none';
        });
    });
    
    // Oculta ícones e botões de ação nas tabelas
    const actionIcons = document.querySelectorAll('.action-icons, .table-actions');
    actionIcons.forEach(container => {
        container.style.display = 'none';
    });
}

// Verifica permissão específica e retorna promessa
function checkPermission(permission) {
    return new Promise(async (resolve) => {
        const hasAccess = await hasPermission(permission);
        resolve(hasAccess);
    });
}