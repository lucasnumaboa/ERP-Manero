// Cartão "Atualização do sistema" em Configurações (só admin): compara a versão instalada com a do GitHub
// e atualiza pelo backend (/api/atualizacao). Na atualização o backend reinicia; enquanto ele está fora do
// ar a tela continua perguntando o andamento até ele voltar.
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    let ultimaVerificacao = null;
    let acompanhando = false;

    async function pedir(metodo, caminho) {
        const resposta = await apiRequest(caminho, { method: metodo, headers: { 'Content-Type': 'application/json' } });
        if (!resposta) throw new Error('Sessão expirada');
        const texto = await resposta.text();
        let dados = {};
        try { dados = texto ? JSON.parse(texto) : {}; } catch (e) { /* resposta sem JSON */ }
        if (!resposta.ok) throw new Error(dados.detail || `Erro ${resposta.status}`);
        return dados;
    }

    function dataCurta(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function mostrarVersao(prefixo, versao) {
        $(`atu${prefixo}`).textContent = versao ? versao.curto || String(versao.commit || '').slice(0, 7) : 'desconhecida';
        $(`atu${prefixo}Info`).textContent = versao ? `${dataCurta(versao.data)} · ${versao.mensagem || ''}` : '';
        $(`atu${prefixo}Info`).title = versao ? versao.mensagem || '' : '';
    }

    function situacao(texto, tipo) {
        const el = $('atuSituacao');
        el.textContent = texto;
        el.className = `atualizacao-situacao ${tipo || ''}`;
    }

    function lista(el, itens, montar) {
        el.innerHTML = '';
        itens.forEach(item => el.appendChild(montar(item)));
        el.hidden = !itens.length;
    }

    async function verificar() {
        if (acompanhando) return;
        $('atuVerificar').disabled = true;
        $('atuAtualizar').disabled = true;
        situacao('Consultando o GitHub…');
        try {
            const v = await pedir('GET', '/api/atualizacao/');
            ultimaVerificacao = v;
            mostrarVersao('Instalada', v.instalada);
            mostrarVersao('Disponivel', v.disponivel);
            $('atuModo').textContent = v.modo === 'docker' ? 'Docker' : 'Local (Windows)';
            $('atuModoInfo').textContent = v.branch ? `branch ${v.branch}` : '';
            lista($('atuImpedimentos'), v.impedimentos || [], texto => {
                const li = document.createElement('li');
                li.textContent = texto;
                return li;
            });
            lista($('atuNovidades'), v.atualizado ? [] : v.novidades || [], n => {
                const li = document.createElement('li');
                const codigo = document.createElement('code');
                codigo.textContent = n.curto;
                const quando = document.createElement('time');
                quando.textContent = dataCurta(n.data);
                li.append(codigo, n.mensagem, quando);
                return li;
            });
            if (v.atualizado) {
                situacao('O sistema já está na versão mais nova.', 'ok');
            } else if ((v.impedimentos || []).length) {
                situacao('Tem versão nova, mas a atualização não pode rodar agora:', 'erro');
            } else {
                const qtd = (v.novidades || []).length;
                situacao(v.historico_conhecido
                    ? `Versão nova disponível: ${qtd} mudança(s).`
                    : 'Versão nova disponível. Últimas mudanças no GitHub:', 'novo');
            }
            $('atuAtualizar').disabled = v.atualizado || (v.impedimentos || []).length > 0;
        } catch (erro) {
            situacao(erro.message, 'erro');
        } finally {
            $('atuVerificar').disabled = false;
        }
    }

    function mostrarLog(estado) {
        const log = $('atuLog');
        log.hidden = false;
        log.textContent = (estado.linhas || []).join('\n');
        log.scrollTop = log.scrollHeight;
    }

    async function atualizar() {
        const v = ultimaVerificacao;
        const mensagem = `Atualizar o ERP para ${v && v.disponivel ? v.disponivel.curto : 'a versão nova'}? `
            + (v && v.modo === 'docker'
                ? 'As imagens do backend e da tela serão montadas de novo (alguns minutos).'
                : 'O backend reinicia no fim (alguns segundos fora do ar).')
            + ' Antes, é feito um backup do banco.';
        const confirmado = window.confirmarAcao
            ? await window.confirmarAcao(mensagem, { titulo: 'Atualizar o sistema', confirmar: 'Atualizar', perigo: false })
            : window.confirm(mensagem);
        if (!confirmado) return;
        let anterior = null;
        try { anterior = (await pedir('GET', '/api/atualizacao/andamento')).inicio || null; } catch (e) { /* sem histórico */ }
        try {
            await pedir('POST', '/api/atualizacao/iniciar');
        } catch (erro) {
            situacao(erro.message, 'erro');
            return;
        }
        acompanhar(anterior);
    }

    async function acompanhar(inicioAnterior) {
        acompanhando = true;
        $('atuAtualizar').disabled = true;
        $('atuVerificar').disabled = true;
        situacao('Atualizando… não feche esta página.', 'novo');
        const limite = Date.now() + 20 * 60 * 1000;
        while (Date.now() < limite) {
            try {
                const estado = await pedir('GET', '/api/atualizacao/andamento');
                if (estado.inicio && estado.inicio !== inicioAnterior) {
                    mostrarLog(estado);
                    if (!estado.rodando) {
                        terminar(estado);
                        return;
                    }
                    situacao('Atualizando… não feche esta página.', 'novo');
                }
            } catch (erro) {
                situacao('Reiniciando o servidor… aguarde.', 'novo');
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        acompanhando = false;
        situacao('A atualização está demorando demais. Veja o log no servidor (log/atualizacao.json).', 'erro');
        $('atuVerificar').disabled = false;
    }

    function terminar(estado) {
        acompanhando = false;
        $('atuVerificar').disabled = false;
        situacao(estado.mensagem || (estado.ok ? 'Atualizado.' : 'A atualização falhou.'), estado.ok ? 'ok' : 'erro');
        if (window.mostrarAviso) window.mostrarAviso(estado.mensagem, estado.ok ? 'sucesso' : 'erro');
        if (estado.ok && estado.para && (!estado.de || estado.de.commit !== estado.para.commit)) {
            $('atuRecarregar').hidden = false;   // a tela aberta ainda é a versão antiga
        }
        if (estado.para) mostrarVersao('Instalada', estado.para);
        $('atuNovidades').hidden = true;
    }

    async function iniciar() {
        if (!$('cartaoAtualizacao')) return;
        $('atuVerificar').addEventListener('click', verificar);
        $('atuAtualizar').addEventListener('click', atualizar);
        $('atuRecarregar').addEventListener('click', () => window.location.reload());
        // se a página foi aberta no meio de uma atualização, continua acompanhando
        try {
            const estado = await pedir('GET', '/api/atualizacao/andamento');
            if (estado.rodando) {
                mostrarLog(estado);
                acompanhar(null);
                return;
            }
        } catch (e) { /* sem permissão ou servidor fora: a verificação abaixo mostra o erro */ }
        verificar();
    }

    document.addEventListener('DOMContentLoaded', iniciar);
})();
