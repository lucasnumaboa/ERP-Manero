/* Venda simplificada (balcão): escaneia o EAN-13, digita o nome do cliente e conclui.
 * O servidor (POST /api/vendas/simplificada) acha ou cria o cliente pelo nome, cria a venda pelas mesmas regras da
 * tela Vendas (baixa de estoque, contas a receber, comissão do vendedor logado) e já finaliza e dá como recebida.
 */
'use strict';

const NOMES_FORMA = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_debito: 'Cartão de débito', cartao_credito: 'Cartão de crédito',
    transferencia: 'Transferência', boleto: 'Boleto',
};
const vs = { itens: [], enviando: false };

function vsReais(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function vsEscape(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// o api.js põe "Falha na requisição POST para /api/...: " antes do detalhe do servidor
function vsMensagem(e, padrao) {
    return String((e && e.message) || padrao).replace(/^Falha na requisição \w+ para [^:]+: /, '') || padrao;
}

function vsTotal() {
    return vs.itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
}

function vsDesenhar() {
    const corpo = document.getElementById('vsItens');
    if (!vs.itens.length) {
        corpo.innerHTML = '<tr><td colspan="5" class="vs-vazio">Nenhum produto ainda: escaneie o primeiro.</td></tr>';
    } else {
        corpo.innerHTML = vs.itens.map((i, n) => `
            <tr>
                <td>${vsEscape(i.nome)}<br><small>${vsEscape(i.ean || i.codigo)}</small>
                    ${i.quantidade > i.estoque ? `<br><span class="vs-sem-estoque">só ${i.estoque} no estoque</span>` : ''}</td>
                <td><input type="number" min="1" step="1" value="${i.quantidade}" data-qtd="${n}"></td>
                <td><input type="number" min="0" step="0.01" value="${i.preco.toFixed(2)}" data-preco="${n}"></td>
                <td class="vs-num">${vsReais(i.quantidade * i.preco)}</td>
                <td><button class="btn-icon" data-remover="${n}" title="Tirar da venda"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
    }
    document.getElementById('vsTotal').textContent = vsReais(vsTotal());
    vsAtualizarBotao();
}

function vsAtualizarBotao() {
    const nome = document.getElementById('vsCliente').value.trim();
    const semEstoque = vs.itens.some(i => i.quantidade > i.estoque);
    document.getElementById('vsConcluir').disabled = vs.enviando || !vs.itens.length || nome.length < 2 || semEstoque;
}

async function vsAdicionar(codigo) {
    codigo = String(codigo || '').trim();
    if (!codigo) return;
    let produto;
    try {
        produto = await apiGet(`/api/produtos/codigo/${encodeURIComponent(codigo)}`);
    } catch (e) {
        mostrarAviso(/: 404$/.test(e.message) ? `Nenhum produto com o código ${codigo}.` : vsMensagem(e, 'Não consegui buscar o produto.'), 'erro');
        return;
    }
    if (!produto) return;
    if (produto.ativo === false) {
        mostrarAviso(`${produto.nome} está inativo.`, 'aviso');
        return;
    }
    const existente = vs.itens.find(i => i.id === produto.id);
    if (existente) {
        existente.quantidade += 1;
    } else {
        vs.itens.push({
            id: produto.id, nome: produto.nome, ean: produto.ean13, codigo: produto.codigo,
            preco: Number(produto.preco_venda || 0), quantidade: 1, estoque: Number(produto.estoque_atual || 0),
        });
    }
    const item = existente || vs.itens[vs.itens.length - 1];
    if (item.quantidade > item.estoque) mostrarAviso(`${produto.nome}: só tem ${item.estoque} no estoque.`, 'aviso');
    vsDesenhar();
}

async function vsConcluir() {
    const nome = document.getElementById('vsCliente').value.trim();
    if (!vs.itens.length || nome.length < 2 || vs.enviando) return;
    vs.enviando = true;
    vsAtualizarBotao();
    const botao = document.getElementById('vsConcluir');
    botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Concluindo…';
    try {
        const r = await apiPost('/api/vendas/simplificada', {
            cliente_nome: nome,
            forma_pagamento: document.getElementById('vsForma').value || 'pix',
            plataforma_id: Number(document.getElementById('vsPlataforma').value) || null,
            itens: vs.itens.map(i => ({ produto_id: i.id, quantidade: i.quantidade, preco_unitario: Number(i.preco.toFixed(2)) })),
        });
        if (!r) return;
        // mesmo aviso de saída de estoque que a tela Vendas manda
        if (window.webhookEstoque) {
            window.webhookEstoque.notificarSaidaProdutos(
                r.itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
                { comissao_total: r.comissao_total || 0, vendedor_nome: r.vendedor || '' });
        }
        document.getElementById('vsUltima').innerHTML =
            `<i class="fas fa-check-circle"></i> Venda <b>${vsEscape(r.codigo)}</b> concluída: ${vsReais(r.valor_total)} · ${vsEscape(nome)}` +
            (r.cliente_novo ? ' (cliente cadastrado agora)' : '');
        mostrarAviso(`Venda ${r.codigo} concluída.`, 'sucesso');
        vs.itens = [];
        document.getElementById('vsCliente').value = '';
        vsDesenhar();
        document.getElementById('vsCodigo').focus();
    } catch (e) {
        mostrarAviso(vsMensagem(e, 'Não consegui concluir a venda.'), 'erro');
    } finally {
        vs.enviando = false;
        botao.innerHTML = '<i class="fas fa-check"></i> Concluir venda';
        vsAtualizarBotao();
    }
}

async function vsCarregarPadroes() {
    try {
        const p = await apiGet('/api/vendas/simplificada/padroes');
        if (!p) return;
        document.getElementById('vsForma').innerHTML = p.formas_pagamento
            .map(f => `<option value="${f}" ${f === p.forma_padrao ? 'selected' : ''}>${NOMES_FORMA[f] || f}</option>`).join('');
        document.getElementById('vsPlataforma').innerHTML = p.plataformas
            .map(pl => `<option value="${pl.id}" ${pl.id === p.plataforma_padrao ? 'selected' : ''}>${vsEscape(pl.nome)}</option>`).join('');
        document.getElementById('vsVendedor').textContent = p.vendedor
            ? `Vendedor: ${p.vendedor.nome} (com a comissão de cada produto)`
            : 'Seu usuário não está ligado a um vendedor: a venda sai sem vendedor e sem comissão.';
    } catch (e) {
        mostrarAviso(vsMensagem(e, 'Não consegui carregar a venda simplificada.'), 'erro');
    }
    try {   // sugestões de nome (clientes já cadastrados; precisa ver Parceiros); o servidor decide se usa um existente ou cria
        const clientes = await apiGet('/api/parceiros/', { tipo: 'cliente', ativo: true });
        document.getElementById('vsClientesSugestao').innerHTML = (clientes || []).slice(0, 2000)
            .map(c => `<option value="${vsEscape(c.nome)}"></option>`).join('');
    } catch (e) { /* sem sugestões */ }
}

document.addEventListener('DOMContentLoaded', () => {
    vsCarregarPadroes();
    const campo = document.getElementById('vsCodigo');
    document.getElementById('vsFormScanner').addEventListener('submit', ev => {
        ev.preventDefault();
        const codigo = campo.value;
        campo.value = '';
        vsAdicionar(codigo).finally(() => campo.focus());
    });
    document.getElementById('vsCliente').addEventListener('input', vsAtualizarBotao);
    document.getElementById('vsConcluir').addEventListener('click', vsConcluir);
    document.getElementById('vsItens').addEventListener('change', ev => {
        const qtd = ev.target.dataset.qtd, preco = ev.target.dataset.preco;
        if (qtd !== undefined) vs.itens[qtd].quantidade = Math.max(1, parseInt(ev.target.value, 10) || 1);
        if (preco !== undefined) vs.itens[preco].preco = Math.max(0, parseFloat(String(ev.target.value).replace(',', '.')) || 0);
        vsDesenhar();
    });
    document.getElementById('vsItens').addEventListener('click', ev => {
        const b = ev.target.closest('[data-remover]');
        if (!b) return;
        vs.itens.splice(Number(b.dataset.remover), 1);
        vsDesenhar();
        campo.focus();
    });
});
