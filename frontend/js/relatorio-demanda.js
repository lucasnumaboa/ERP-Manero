// Relatório "Pedem e não tem": perguntas do assistente de IA (chat de produtos) que terminaram sem produto em
// estoque, agrupadas pelo que foi procurado (GET /api/relatorios/demanda). Usa as datas do filtro da tela;
// sem datas, os últimos 30 dias.

let dadosDemandaAtual = null;

// Os outros relatórios da tela chamam isto ao aparecer, para não ficarem dois abertos ao mesmo tempo
function esconderRelatorioDemanda() {
    const el = document.getElementById('relatorioDemandaConteudo');
    if (el) el.style.display = 'none';
}

async function gerarRelatorioDemanda() {
    const inicio = document.getElementById('dataInicio')?.value;
    const fim = document.getElementById('dataFim')?.value;
    if (inicio && fim && inicio > fim) {
        mostrarAviso('A data inicial não pode ser maior que a data final', 'aviso');
        return;
    }

    document.querySelectorAll('[id^="relatorio"][id$="Conteudo"]').forEach(el => { el.style.display = 'none'; });
    document.getElementById('mensagemInicial').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    try {
        const filtros = {};
        if (inicio) filtros.data_inicio = inicio;
        if (fim) filtros.data_fim = fim;
        const dados = await apiGet('/api/relatorios/demanda', filtros);
        if (!dados) throw new Error('sem resposta do servidor');
        dadosDemandaAtual = dados;
        renderizarDemanda(dados);
        document.getElementById('relatorioDemandaConteudo').style.display = 'block';
    } catch (error) {
        mostrarAviso('Erro ao gerar o relatório: ' + (error.message || 'tente novamente'), 'erro');
        document.getElementById('mensagemInicial').style.display = 'block';
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function _dataBR(iso, comHora) {
    if (!iso) return '-';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return comHora
        ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('pt-BR');
}

function renderizarDemanda(dados) {
    const r = dados.resumo;
    document.getElementById('demandaPerguntas').textContent = r.perguntas;
    document.getElementById('demandaAtendidas').textContent = r.atendidas;
    document.getElementById('demandaSemEstoque').textContent = r.sem_estoque;
    document.getElementById('demandaNaoCadastrado').textContent = r.nao_cadastrado;
    document.getElementById('demandaPeriodo').textContent =
        `(${_dataBR(dados.periodo.data_inicio)} a ${_dataBR(dados.periodo.data_fim)})`;

    const tbody = document.getElementById('bodyDemanda');
    if (!dados.itens.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="mensagem-vazia"><i class="fas fa-inbox"></i>
            <p>${r.perguntas ? 'Tudo o que perguntaram no período tinha em estoque.' : 'Ninguém perguntou sobre produtos no assistente nesse período.'}</p></td></tr>`;
        return;
    }
    tbody.innerHTML = dados.itens.map(item => {
        const semEstoque = item.situacao === 'sem_estoque';
        const produtos = item.produtos.length
            ? item.produtos.map(p => `${escapeHtml(p.codigo || '')} — ${escapeHtml(p.nome)}`).join('<br>') +
              (item.total_produtos > item.produtos.length ? `<small>+ ${item.total_produtos - item.produtos.length} outro(s)</small>` : '')
            : '<small>nenhum produto com esse nome</small>' + (item.alternativas && item.alternativas.length
                ? `<small>a IA ofereceu: ${item.alternativas.map(p => escapeHtml(p.nome)).join(', ')}${item.total_alternativas > item.alternativas.length ? '…' : ''}</small>`
                : '');
        return `<tr>
            <td><strong>${escapeHtml(item.procurado)}</strong></td>
            <td class="texto-centro"><strong>${item.vezes}</strong></td>
            <td><span class="demanda-situacao ${semEstoque ? 'sem-estoque' : 'nao-cadastrado'}">${semEstoque ? 'Sem estoque' : 'Não cadastrado'}</span></td>
            <td class="demanda-produtos">${produtos}</td>
            <td>${item.vendedores.map(escapeHtml).join(', ')}</td>
            <td>${_dataBR(item.ultima_vez, true)}</td>
            <td class="demanda-exemplo">${item.exemplos.length ? '"' + escapeHtml(item.exemplos[0]) + '"' : '-'}</td>
        </tr>`;
    }).join('');
}

// Planilha simples (abre no Excel): uma linha por item procurado
function exportarDemandaCSV() {
    if (!dadosDemandaAtual || !dadosDemandaAtual.itens.length) {
        mostrarAviso('Gere o relatório antes de exportar (e ele precisa ter itens).', 'aviso');
        return;
    }
    const campo = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Procurado', 'Vezes', 'Situação', 'Produtos no cadastro', 'Quem perguntou', 'Última vez', 'Exemplos de pergunta']];
    dadosDemandaAtual.itens.forEach(i => linhas.push([
        i.procurado, i.vezes, i.situacao === 'sem_estoque' ? 'Sem estoque' : 'Não cadastrado',
        i.produtos.length ? i.produtos.map(p => `${p.codigo} - ${p.nome}`).join(' | ')
            : (i.alternativas || []).length ? 'IA ofereceu: ' + i.alternativas.map(p => p.nome).join(' | ') : '',
        i.vendedores.join(', '),
        _dataBR(i.ultima_vez, true), i.exemplos.join(' | ')
    ]));
    // ; e BOM: o Excel em português abre com acentos e colunas certas
    const csv = '﻿' + linhas.map(l => l.map(campo).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `pedem-e-nao-tem_${dadosDemandaAtual.periodo.data_inicio}_a_${dadosDemandaAtual.periodo.data_fim}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}
