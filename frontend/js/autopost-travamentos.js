// Cartão "AutoPost: travamentos para ajustar" em Configurações (só admin). Lista o que o app AutoPost mandou para
// /api/autopost/diagnosticos: o que ele tentava fazer, a imagem da tela, o passo a passo, o JSON e o HTML da página.
(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    async function pedir(metodo, caminho, corpo) {
        const opcoes = { method: metodo, headers: { 'Content-Type': 'application/json' } };
        if (corpo) opcoes.body = JSON.stringify(corpo);
        const resposta = await apiRequest(caminho, opcoes);
        if (!resposta) throw new Error('Sessão expirada');
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.detail || `Erro ${resposta.status}`);
        return dados;
    }

    function quando(iso) {
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function elemento(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    function baixar(nome, conteudo, tipo) {
        const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
        const a = Object.assign(document.createElement('a'), { href: url, download: nome });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function detalhar(item, alvo, botao) {
        if (alvo.dataset.carregado) {
            alvo.hidden = !alvo.hidden;
            botao.textContent = alvo.hidden ? 'Ver detalhes' : 'Esconder detalhes';
            return;
        }
        botao.disabled = true;
        try {
            const d = await pedir('GET', `/api/autopost/diagnosticos/${item.id}`);
            alvo.innerHTML = '';
            if (d.erro) alvo.appendChild(elemento('p', 'travamento-erro', `Erro: ${d.erro}`));
            if (d.url) {
                const link = elemento('a', '', d.url);
                Object.assign(link, { href: d.url, target: '_blank', rel: 'noopener' });
                const p = elemento('p', '', 'Página: ');
                p.appendChild(link);
                alvo.appendChild(p);
            }
            alvo.appendChild(elemento('h4', '', 'Passo a passo'));
            alvo.appendChild(elemento('pre', 'atualizacao-log', d.log_texto || '(sem registro)'));
            const acoes = elemento('div', 'atualizacao-acoes');
            const base = `autopost-${item.plataforma}-${item.id}`;
            if (d.pagina) {
                const b = elemento('button', 'btn-secondary', 'Baixar JSON da página');
                b.type = 'button';
                b.onclick = () => baixar(`${base}.json`, JSON.stringify(d.pagina, null, 2), 'application/json');
                acoes.appendChild(b);
            }
            if (d.html) {
                const b = elemento('button', 'btn-secondary', 'Baixar HTML da página');
                b.type = 'button';
                b.onclick = () => baixar(`${base}.html`, d.html, 'text/html');
                acoes.appendChild(b);
            }
            alvo.appendChild(acoes);
            const correcao = elemento('div', 'correcao-ia');
            alvo.appendChild(correcao);
            mostrarCorrecao(item, correcao);
            alvo.dataset.carregado = '1';
            alvo.hidden = false;
            botao.textContent = 'Esconder detalhes';
        } catch (erro) {
            if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
        } finally {
            botao.disabled = false;
        }
    }

    // ---------- Correção com IA (rotas /api/autopost/correcoes) ----------
    // A IA propõe trechos para trocar no código do AutoPost; o admin aprova (o construtor do servidor aplica, gera o
    // .exe, faz o commit e publica em Softwares) ou rejeita dizendo o que quer, e a IA refaz.
    const ROTULO = {
        analisando: 'A IA está analisando…', proposta: 'Proposta da IA', rejeitada: 'Rejeitada', erro: 'Erro na análise',
        aprovada: 'Aprovada: aguardando o servidor', aplicando: 'Aplicando no código…', gerando: 'Gerando o .exe…',
        publicada: 'Publicada', falhou: 'Falhou ao publicar'
    };
    const EM_ANDAMENTO = ['analisando', 'aprovada', 'aplicando', 'gerando'];

    function blocoCodigo(classe, titulo, texto) {
        const div = elemento('div', classe);
        div.appendChild(elemento('small', '', titulo));
        div.appendChild(elemento('pre', `atualizacao-log ${classe}`, texto));
        return div;
    }

    function desenharRodada(r, atual, repositorio, recarregar) {
        const caixa = elemento('div', `correcao-rodada${atual ? '' : ' antiga'}`);
        const topo = elemento('div', 'correcao-topo');
        topo.appendChild(elemento('span', `correcao-status ${r.status}`, ROTULO[r.status] || r.status));
        topo.appendChild(elemento('span', '', `Rodada ${r.rodada} · ${quando(r.data_criacao)}`));
        if (r.versao) topo.appendChild(elemento('span', '', `versão ${r.versao}`));
        if (r.commit_sha) {
            const link = Object.assign(elemento('a', '', `commit ${r.commit_sha.slice(0, 7)}`),
                { href: `https://github.com/${repositorio}/commit/${r.commit_sha}`, target: '_blank', rel: 'noopener' });
            topo.appendChild(link);
        }
        caixa.appendChild(topo);
        if (r.instrucao) caixa.appendChild(elemento('p', 'correcao-pedido', `Você pediu: ${r.instrucao}`));
        const a = r.analise && typeof r.analise === 'object' ? r.analise : null;
        if (a) {
            [['O que aconteceu', a.diagnostico], ['Causa', a.causa], ['Solução', a.solucao]].forEach(([rotulo, texto]) => {
                if (!texto) return;
                const p = elemento('p', 'correcao-texto');
                p.appendChild(elemento('strong', '', `${rotulo}: `));
                p.appendChild(document.createTextNode(texto));
                caixa.appendChild(p);
            });
        }
        if (atual && Array.isArray(r.alteracoes)) {
            r.alteracoes.forEach((alt, i) => {
                const bloco = elemento('div', 'correcao-alteracao');
                bloco.appendChild(elemento('span', 'correcao-arquivo', `${i + 1}. ${alt.arquivo}`));
                if (alt.motivo) bloco.appendChild(elemento('span', 'correcao-texto', alt.motivo));
                const codigo = elemento('div', 'correcao-codigo');
                codigo.appendChild(blocoCodigo('antes', 'Antes', alt.buscar));
                codigo.appendChild(blocoCodigo('depois', 'Depois', alt.substituir));
                bloco.appendChild(codigo);
                caixa.appendChild(bloco);
            });
        }
        if (r.erro) caixa.appendChild(elemento('p', 'travamento-erro', r.erro));
        if (atual && r.log_texto && ['aprovada', 'aplicando', 'gerando', 'publicada', 'falhou'].includes(r.status)) {
            caixa.appendChild(elemento('pre', 'atualizacao-log', r.log_texto));
        }
        if (atual && r.status === 'falhou' && Array.isArray(r.alteracoes) && r.alteracoes.length) {
            // a proposta continua valendo: o problema foi na publicação (GitHub, geração do .exe...)
            const acoes = elemento('div', 'atualizacao-acoes');
            const repetir = Object.assign(elemento('button', 'btn-primary', 'Tentar publicar de novo'), { type: 'button' });
            repetir.onclick = async () => {
                repetir.disabled = true;
                try {
                    await pedir('POST', `/api/autopost/correcoes/rodadas/${r.id}/aprovar`);
                    recarregar();
                } catch (erro) {
                    repetir.disabled = false;
                    if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
                }
            };
            acoes.appendChild(repetir);
            caixa.appendChild(acoes);
        }
        if (atual && r.status === 'proposta') {
            const instrucao = Object.assign(elemento('textarea', 'correcao-instrucao'), {
                placeholder: 'Para rejeitar, diga o que a IA deve fazer diferente…', maxLength: 4000 });
            const acoes = elemento('div', 'atualizacao-acoes');
            const aprovar = elemento('button', 'btn-primary', 'Aprovar e publicar');
            const rejeitar = elemento('button', 'btn-secondary', 'Rejeitar e pedir outra');
            aprovar.type = rejeitar.type = 'button';
            aprovar.onclick = async () => {
                aprovar.disabled = rejeitar.disabled = true;
                try {
                    await pedir('POST', `/api/autopost/correcoes/rodadas/${r.id}/aprovar`);
                    recarregar();
                } catch (erro) {
                    aprovar.disabled = rejeitar.disabled = false;
                    if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
                }
            };
            rejeitar.onclick = async () => {
                const texto = instrucao.value.trim();
                if (texto.length < 3) {
                    if (window.mostrarAviso) window.mostrarAviso('Escreva o que a IA deve fazer diferente.', 'erro');
                    instrucao.focus();
                    return;
                }
                aprovar.disabled = rejeitar.disabled = true;
                try {
                    await pedir('POST', `/api/autopost/correcoes/rodadas/${r.id}/rejeitar`, { instrucao: texto });
                    recarregar();
                } catch (erro) {
                    aprovar.disabled = rejeitar.disabled = false;
                    if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
                }
            };
            acoes.appendChild(aprovar);
            acoes.appendChild(rejeitar);
            caixa.appendChild(instrucao);
            caixa.appendChild(acoes);
        }
        return caixa;
    }

    async function mostrarCorrecao(item, alvo) {
        clearTimeout(alvo.espera);
        let dados;
        try {
            dados = await pedir('GET', `/api/autopost/correcoes/${item.id}`);
        } catch (erro) {
            alvo.innerHTML = '';
            alvo.appendChild(elemento('p', 'travamento-erro', erro.message));
            return;
        }
        const recarregar = () => mostrarCorrecao(item, alvo);
        alvo.innerHTML = '';
        alvo.appendChild(elemento('h4', '', 'Correção com IA'));
        const rodadas = dados.rodadas || [];
        const ultima = rodadas[rodadas.length - 1];
        rodadas.slice().reverse().forEach(r => alvo.appendChild(desenharRodada(r, r === ultima, dados.repositorio, recarregar)));
        if (!ultima || ['erro', 'falhou', 'publicada'].includes(ultima.status)) {
            const instrucao = Object.assign(elemento('textarea', 'correcao-instrucao'), {
                placeholder: 'Opcional: alguma orientação para a IA (ex.: "o botão Continuar mudou de nome")', maxLength: 4000 });
            const acoes = elemento('div', 'atualizacao-acoes');
            const analisar = elemento('button', 'btn-primary', ultima ? 'Analisar de novo com IA' : 'Analisar com IA');
            analisar.type = 'button';
            analisar.onclick = async () => {
                analisar.disabled = true;
                try {
                    await pedir('POST', `/api/autopost/correcoes/${item.id}/analisar`, { instrucao: instrucao.value.trim() || null });
                    recarregar();
                } catch (erro) {
                    analisar.disabled = false;
                    if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
                }
            };
            acoes.appendChild(analisar);
            alvo.appendChild(instrucao);
            alvo.appendChild(acoes);
        }
        if (ultima && EM_ANDAMENTO.includes(ultima.status)) {
            alvo.espera = setTimeout(() => { if (document.body.contains(alvo)) recarregar(); }, 4000);
        }
    }

    function cartao(item) {
        const div = elemento('div', `travamento ${item.status}`);
        if (item.imagem) {
            const url = `${apiUrlAtual()}/${item.imagem}`;
            const a = Object.assign(elemento('a', 'travamento-imagem'), { href: url, target: '_blank', rel: 'noopener', title: 'Abrir a imagem da tela' });
            const img = Object.assign(document.createElement('img'), { src: url, alt: 'Tela no momento do travamento', loading: 'lazy' });
            a.appendChild(img);
            div.appendChild(a);
        } else {
            div.appendChild(elemento('div', 'travamento-imagem vazia', 'sem imagem'));
        }
        const corpo = elemento('div', 'travamento-corpo');
        const topo = elemento('div', 'travamento-topo');
        topo.appendChild(elemento('span', `travamento-site ${item.plataforma}`, item.plataforma === 'olx' ? 'OLX' : 'Facebook'));
        topo.appendChild(elemento('span', '', quando(item.data_criacao)));
        if (item.usuario_nome) topo.appendChild(elemento('span', '', item.usuario_nome));
        if (item.versao_app) topo.appendChild(elemento('span', '', `app ${item.versao_app}`));
        corpo.appendChild(topo);
        corpo.appendChild(elemento('strong', '', item.acao));
        if (item.titulo) corpo.appendChild(elemento('span', 'travamento-produto', item.titulo));
        if (item.erro) corpo.appendChild(elemento('span', 'travamento-erro', item.erro));
        if (item.status === 'resolvido') {
            corpo.appendChild(elemento('span', 'travamento-resolvido',
                `Resolvido em ${quando(item.data_resolucao)}${item.observacao ? ` · ${item.observacao}` : ''}`));
        }
        const detalhes = elemento('div', 'travamento-detalhes');
        detalhes.hidden = true;
        const acoes = elemento('div', 'atualizacao-acoes');
        const ver = elemento('button', 'btn-secondary', 'Ver detalhes');
        ver.type = 'button';
        ver.onclick = () => detalhar(item, detalhes, ver);
        acoes.appendChild(ver);
        const mudar = elemento('button', 'btn-primary', item.status === 'pendente' ? 'Marcar como resolvido' : 'Voltar para pendente');
        mudar.type = 'button';
        mudar.onclick = async () => {
            mudar.disabled = true;
            try {
                await pedir('PUT', `/api/autopost/diagnosticos/${item.id}`, { status: item.status === 'pendente' ? 'resolvido' : 'pendente' });
                carregar();
            } catch (erro) {
                mudar.disabled = false;
                if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
            }
        };
        acoes.appendChild(mudar);
        corpo.appendChild(acoes);
        corpo.appendChild(detalhes);
        div.appendChild(corpo);
        return div;
    }

    async function carregar() {
        const lista = $('travLista');
        try {
            const r = await pedir('GET', `/api/autopost/diagnosticos/?status=${$('travResolvidos').checked ? '' : 'pendente'}`);
            $('travContagem').hidden = !r.pendentes;
            $('travContagem').textContent = `${r.pendentes} pendente(s)`;
            lista.innerHTML = '';
            if (!r.itens.length) {
                lista.appendChild(elemento('p', 'atualizacao-situacao ok', 'Nenhum travamento pendente.'));
                return;
            }
            r.itens.forEach(item => lista.appendChild(cartao(item)));
        } catch (erro) {
            lista.innerHTML = '';
            lista.appendChild(elemento('p', 'atualizacao-situacao erro', erro.message));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('cartaoTravamentos')) return;
        $('travRecarregar').addEventListener('click', carregar);
        $('travResolvidos').addEventListener('change', carregar);
        carregar();
    });
})();
