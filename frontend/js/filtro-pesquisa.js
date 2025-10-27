/**
 * Filtro de Pesquisa - Implementação comum para todas as páginas
 * Este script adiciona funcionalidade de pesquisa às tabelas do sistema
 */

document.addEventListener('DOMContentLoaded', function() {
    // Verifica se existe um campo de pesquisa na página
    const campoPesquisa = document.getElementById('filtroPesquisa');
    if (campoPesquisa) {
        // Adiciona o evento de input para filtrar em tempo real
        campoPesquisa.addEventListener('input', function() {
            aplicarFiltroPesquisa();
        });
    }
    
    // Não tentamos inicializar a paginação aqui, pois isso é feito pelos scripts específicos de cada página
});

/**
 * Aplica o filtro de pesquisa na tabela atual
 */
function aplicarFiltroPesquisa() {
    const termoPesquisa = document.getElementById('filtroPesquisa').value.toLowerCase().trim();
    
    // Identifica qual tabela está sendo usada na página atual
    let tabela = document.querySelector('.data-table tbody');
    if (!tabela) return;
    
    // Obtém todas as linhas da tabela
    const linhas = tabela.querySelectorAll('tr');
    
    // Para cada linha, verifica se deve ser exibida ou ocultada
    linhas.forEach(linha => {
        // Ignora linhas de carregamento ou mensagens
        if (linha.querySelector('td[colspan]')) return;
        
        // Obtém o texto de todas as células da linha
        const textoLinha = Array.from(linha.querySelectorAll('td'))
            .map(celula => celula.textContent.toLowerCase())
            .join(' ');
        
        // Exibe ou oculta a linha com base no termo de pesquisa
        if (termoPesquisa === '' || textoLinha.includes(termoPesquisa)) {
            linha.style.display = '';
        } else {
            linha.style.display = 'none';
        }
    });
    
    // Verifica se há resultados visíveis
    const linhasVisiveis = Array.from(linhas).filter(linha => 
        linha.style.display !== 'none' && !linha.querySelector('td[colspan]')
    );
    
    // Se não houver resultados, exibe uma mensagem
    if (linhasVisiveis.length === 0 && termoPesquisa !== '') {
        // Verifica se já existe uma linha de "nenhum resultado"
        let nenhumResultado = tabela.querySelector('.nenhum-resultado');
        
        if (!nenhumResultado) {
            // Cria uma nova linha para a mensagem
            nenhumResultado = document.createElement('tr');
            nenhumResultado.className = 'nenhum-resultado';
            
            const td = document.createElement('td');
            td.colSpan = linha.querySelectorAll('td').length || 7;
            td.textContent = 'Nenhum resultado encontrado para a pesquisa.';
            td.className = 'text-center';
            
            nenhumResultado.appendChild(td);
            tabela.appendChild(nenhumResultado);
        } else {
            nenhumResultado.style.display = '';
        }
    } else {
        // Oculta a mensagem de "nenhum resultado" se existir
        const nenhumResultado = tabela.querySelector('.nenhum-resultado');
        if (nenhumResultado) {
            nenhumResultado.style.display = 'none';
        }
    }
    
    // Não tentamos reinicializar a paginação aqui, pois isso pode causar erros
    // A paginação é gerenciada pelos scripts específicos de cada página
}