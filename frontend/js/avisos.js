// Avisos (no lugar do alert) e confirmações (no lugar do confirm) no visual do ERP.
// Carregado em todas as páginas logo após o config.js.
(function () {
    const CHAVE_PENDENTES = 'erp_avisos_pendentes';
    const DURACAO = { sucesso: 3500, info: 4500, aviso: 6000, erro: 7000 };
    const ICONE = { sucesso: 'fa-check-circle', info: 'fa-info-circle', aviso: 'fa-exclamation-triangle', erro: 'fa-times-circle' };

    const CSS = `
        .erp-avisos { position: fixed; right: 16px; bottom: 88px; /* acima do botão do chat de IA */ z-index: 10050; display: flex; flex-direction: column;
            gap: 8px; max-width: min(380px, calc(100vw - 32px)); pointer-events: none; }
        .erp-aviso { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
            border-radius: 10px; background: var(--bg-card, #112240); color: var(--text-primary, #e6f1ff);
            border: 1px solid var(--border-color, #233554); border-left: 4px solid var(--cor-aviso);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); font-size: 14px; line-height: 1.45;
            animation: erp-aviso-entra .18s ease-out; }
        .erp-aviso i.icone { color: var(--cor-aviso); margin-top: 2px; }
        .erp-aviso .texto { flex: 1; white-space: pre-line; overflow-wrap: anywhere; }
        .erp-aviso button { background: none; border: none; color: var(--text-muted, #8892b0); cursor: pointer;
            font-size: 16px; line-height: 1; padding: 0 2px; }
        .erp-aviso.sucesso { --cor-aviso: var(--success-color, #2ecc71); }
        .erp-aviso.info { --cor-aviso: var(--info-color, #3498db); }
        .erp-aviso.aviso { --cor-aviso: var(--warning-color, #f39c12); }
        .erp-aviso.erro { --cor-aviso: var(--danger-color, #e74c3c); }
        .erp-confirmacao-fundo { position: fixed; inset: 0; z-index: 10060; background: rgba(2, 12, 27, 0.6);
            display: flex; align-items: center; justify-content: center; padding: 16px; }
        .erp-confirmacao { width: min(440px, 100%); background: var(--bg-card, #112240); color: var(--text-primary, #e6f1ff);
            border: 1px solid var(--border-color, #233554); border-radius: 12px; padding: 20px 22px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); animation: erp-aviso-entra .15s ease-out; }
        .erp-confirmacao h3 { margin: 0 0 8px; font-size: 17px; display: flex; align-items: center; gap: 8px; }
        .erp-confirmacao p { margin: 0 0 18px; white-space: pre-line; color: var(--text-secondary, #a8b2d1); line-height: 1.5; }
        .erp-confirmacao .acoes { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
        .erp-confirmacao .acoes button { padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .erp-confirmacao .cancelar { background: none; border: 1px solid var(--border-color, #233554); color: var(--text-secondary, #a8b2d1); }
        .erp-confirmacao .confirmar { border: none; background: var(--accent-primary, #64ffda); color: #0a192f; }
        .erp-confirmacao.perigo .confirmar { background: var(--danger-color, #e74c3c); color: #fff; }
        .erp-confirmacao.perigo h3 i { color: var(--danger-color, #e74c3c); }
        .erp-confirmacao button:focus-visible, .erp-aviso button:focus-visible { outline: 2px solid var(--accent-primary, #64ffda); outline-offset: 2px; }
        @keyframes erp-aviso-entra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .erp-aviso, .erp-confirmacao { animation: none; } }
    `;

    function quandoPronto(fn) {
        if (document.body) fn();
        else document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function garantirEstilo() {
        if (document.getElementById('erp-avisos-estilo')) return;
        const estilo = document.createElement('style');
        estilo.id = 'erp-avisos-estilo';
        estilo.textContent = CSS;
        document.head.appendChild(estilo);
    }

    function container() {
        let c = document.querySelector('.erp-avisos');
        if (!c) {
            c = document.createElement('div');
            c.className = 'erp-avisos';
            c.setAttribute('role', 'status');
            c.setAttribute('aria-live', 'polite');
            document.body.appendChild(c);
        }
        return c;
    }

    // Deduz o tipo pelo texto, para as chamadas antigas de alert() que não informam o tipo
    function tipoPelaMensagem(texto) {
        const t = texto.toLowerCase();
        if (/\berro|falha|falhou|não foi possível|nao foi possivel|inválid|invalid|negad|sem permissão|expirou/.test(t)) return 'erro';
        if (/sucesso|salv[oa]|cadastrad|exclu[íi]d|atualizad|criad|registrad|removid|enviad|conclu[íi]d/.test(t)) return 'sucesso';
        if (/preencha|selecione|informe|atenção|atencao|obrigat|adicione|insira|aguarde|verifique/.test(t)) return 'aviso';
        return 'info';
    }

    function lerPendentes() {
        try { return JSON.parse(sessionStorage.getItem(CHAVE_PENDENTES)) || []; } catch (e) { return []; }
    }

    function gravarPendentes(lista) {
        try { sessionStorage.setItem(CHAVE_PENDENTES, JSON.stringify(lista)); } catch (e) { /* sem armazenamento */ }
    }

    function exibir(texto, tipo, duracao, id) {
        garantirEstilo();
        const aviso = document.createElement('div');
        aviso.className = `erp-aviso ${tipo}`;
        const icone = document.createElement('i');
        icone.className = `fas ${ICONE[tipo]} icone`;
        icone.setAttribute('aria-hidden', 'true');
        const corpo = document.createElement('div');
        corpo.className = 'texto';
        corpo.textContent = texto;
        const fechar = document.createElement('button');
        fechar.type = 'button';
        fechar.setAttribute('aria-label', 'Fechar aviso');
        fechar.textContent = '×';
        aviso.append(icone, corpo, fechar);

        const avisos = container();
        while (avisos.children.length >= 4) avisos.firstElementChild.remove();
        avisos.appendChild(aviso);

        const remover = () => {
            aviso.remove();
            gravarPendentes(lerPendentes().filter(p => p.id !== id));
        };
        fechar.addEventListener('click', remover);
        setTimeout(remover, duracao);
    }

    // Mostra um aviso no canto da tela. Se a página mudar logo em seguida, ele reaparece na próxima.
    function mostrarAviso(mensagem, tipo) {
        const texto = String(mensagem ?? '');
        const emIngles = { success: 'sucesso', error: 'erro', warning: 'aviso', info: 'info' };
        tipo = emIngles[tipo] || tipo;
        const tipoFinal = DURACAO[tipo] ? tipo : tipoPelaMensagem(texto);
        const duracao = DURACAO[tipoFinal];
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        gravarPendentes([...lerPendentes(), { id, texto, tipo: tipoFinal, expira: Date.now() + duracao }]);
        quandoPronto(() => exibir(texto, tipoFinal, duracao, id));
    }

    // Janela de confirmação. Resolve true (confirmou) ou false (cancelou, Esc ou clique fora).
    function confirmarAcao(mensagem, opcoes = {}) {
        const texto = String(mensagem ?? '');
        const perigo = opcoes.perigo ?? /excluir|remover|apagar|cancelar|devolu|resetar|não pode ser desfeita|nao pode ser desfeita|não será restaurado/i.test(texto);
        return new Promise(resolver => {
            quandoPronto(() => {
                garantirEstilo();
                const anterior = document.activeElement;
                const fundo = document.createElement('div');
                fundo.className = 'erp-confirmacao-fundo';
                const caixa = document.createElement('div');
                caixa.className = `erp-confirmacao${perigo ? ' perigo' : ''}`;
                caixa.setAttribute('role', 'alertdialog');
                caixa.setAttribute('aria-modal', 'true');
                const titulo = document.createElement('h3');
                titulo.innerHTML = `<i class="fas ${perigo ? 'fa-exclamation-triangle' : 'fa-question-circle'}" aria-hidden="true"></i>`;
                titulo.append(opcoes.titulo || (perigo ? 'Confirmar ação' : 'Confirmação'));
                const corpo = document.createElement('p');
                corpo.textContent = texto;
                const acoes = document.createElement('div');
                acoes.className = 'acoes';
                const cancelar = document.createElement('button');
                cancelar.type = 'button';
                cancelar.className = 'cancelar';
                cancelar.textContent = opcoes.cancelar || 'Cancelar';
                const confirmar = document.createElement('button');
                confirmar.type = 'button';
                confirmar.className = 'confirmar';
                confirmar.textContent = opcoes.confirmar || (perigo ? 'Sim, continuar' : 'Confirmar');
                acoes.append(cancelar, confirmar);
                caixa.append(titulo, corpo, acoes);
                fundo.appendChild(caixa);
                document.body.appendChild(fundo);
                (perigo ? cancelar : confirmar).focus();

                const concluir = resposta => {
                    document.removeEventListener('keydown', teclas, true);
                    fundo.remove();
                    if (anterior && anterior.focus) anterior.focus();
                    resolver(resposta);
                };
                const teclas = e => {
                    if (e.key === 'Escape') { e.preventDefault(); concluir(false); }
                    else if (e.key === 'Enter' && document.activeElement !== cancelar) { e.preventDefault(); concluir(true); }
                    else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === confirmar ? cancelar : confirmar).focus(); }
                };
                document.addEventListener('keydown', teclas, true);
                cancelar.addEventListener('click', () => concluir(false));
                confirmar.addEventListener('click', () => concluir(true));
                fundo.addEventListener('click', e => { if (e.target === fundo) concluir(false); });
            });
        });
    }

    // Avisos que ficaram pendentes da página anterior (ex.: "Salvo!" seguido de redirecionamento)
    quandoPronto(() => {
        const agora = Date.now();
        const vivos = lerPendentes().filter(p => p.expira > agora);
        gravarPendentes(vivos);
        vivos.forEach(p => exibir(p.texto, p.tipo, p.expira - agora, p.id));
    });

    window.mostrarAviso = mostrarAviso;
    window.confirmarAcao = confirmarAcao;
    window.showNotification = mostrarAviso;
    window.alert = mensagem => mostrarAviso(mensagem);
})();
