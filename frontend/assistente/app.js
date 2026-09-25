// App do Assistente (instalável, só o chat). Faz o próprio login com o mesmo e-mail/senha do ERP e depois
// liga o chat em tela cheia (produto-chat-widget.js em modo app). Quando a sessão expira, o auth.js manda
// para "index.html", que aqui é esta mesma página: volta para o login do app.
(function () {
    const telaLogin = document.getElementById('telaLogin');
    const form = document.getElementById('formLogin');
    const erro = document.getElementById('loginErro');
    const botaoEntrar = document.getElementById('loginEntrar');

    function iniciarChat() {
        telaLogin.hidden = true;
        window.assistenteProdutos.iniciar();
        prepararAvisoInstalar();
    }

    function mostrarLogin() {
        telaLogin.hidden = false;
        let lembrado = '';
        try { lembrado = localStorage.getItem('erp_remember_email') || ''; } catch (e) { /* sem armazenamento */ }
        document.getElementById('loginEmail').value = lembrado;
        document.getElementById(lembrado ? 'loginSenha' : 'loginEmail').focus();
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        erro.hidden = true;
        botaoEntrar.disabled = true;
        botaoEntrar.textContent = 'Entrando...';
        const email = document.getElementById('loginEmail').value.trim();
        try {
            const dados = new FormData();
            dados.append('username', email);
            dados.append('password', document.getElementById('loginSenha').value);
            const resposta = await fetch(`${await getApiUrl()}/token`, { method: 'POST', body: dados });
            const corpo = await resposta.json().catch(() => ({}));
            if (!resposta.ok) throw new Error(corpo.detail || 'E-mail ou senha incorretos');
            localStorage.setItem('erp_token', corpo.access_token);
            localStorage.setItem('erp_token_type', corpo.token_type);
            localStorage.setItem('erp_remember_email', email);
            localStorage.setItem('erp_remember_me', 'true');   // sessão expirada não apaga o e-mail
            document.getElementById('loginSenha').value = '';
            iniciarChat();
        } catch (e) {
            erro.textContent = e.message === 'Failed to fetch' ? 'Sem conexão com o servidor. Tente de novo.' : e.message;
            erro.hidden = false;
        } finally {
            botaoEntrar.disabled = false;
            botaoEntrar.textContent = 'Entrar';
        }
    });

    // ---- Aviso "instalar o app" (quando ainda está aberto no navegador) ----
    let pedidoInstalacao = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();          // o próprio app mostra o convite, na hora certa
        pedidoInstalacao = e;
        prepararAvisoInstalar();
    });
    window.addEventListener('appinstalled', () => { document.getElementById('avisoInstalar').hidden = true; });

    function prepararAvisoInstalar() {
        const jaInstalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
        let dispensado = false;
        try { dispensado = sessionStorage.getItem('assistente_aviso_instalar') === 'fechado'; } catch (e) { /* ok */ }
        if (jaInstalado || dispensado || telaLogin.hidden === false) return;

        const aviso = document.getElementById('avisoInstalar');
        const texto = document.getElementById('avisoInstalarTexto');
        const botao = document.getElementById('botaoInstalar');
        const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (pedidoInstalacao) {
            texto.textContent = 'Instale o Assistente no celular: ele fica na tela inicial, como um WhatsApp.';
            botao.hidden = false;
        } else if (iPhone) {
            texto.innerHTML = 'Para instalar: toque em <i class="fas fa-arrow-up-from-bracket"></i> <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.';
            botao.hidden = true;
        } else {
            return;   // navegador sem instalação (ou ainda não liberou): não mostra nada
        }
        aviso.hidden = false;
    }

    document.getElementById('botaoInstalar').addEventListener('click', async () => {
        if (!pedidoInstalacao) return;
        pedidoInstalacao.prompt();
        await pedidoInstalacao.userChoice.catch(() => null);
        pedidoInstalacao = null;
        document.getElementById('avisoInstalar').hidden = true;
    });
    document.getElementById('fecharAvisoInstalar').addEventListener('click', () => {
        document.getElementById('avisoInstalar').hidden = true;
        try { sessionStorage.setItem('assistente_aviso_instalar', 'fechado'); } catch (e) { /* ok */ }
    });

    if (isAuthenticated()) iniciarChat(); else mostrarLogin();
})();
