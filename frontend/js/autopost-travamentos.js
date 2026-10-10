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
            alvo.dataset.carregado = '1';
            alvo.hidden = false;
            botao.textContent = 'Esconder detalhes';
        } catch (erro) {
            if (window.mostrarAviso) window.mostrarAviso(erro.message, 'erro');
        } finally {
            botao.disabled = false;
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
