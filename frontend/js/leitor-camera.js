/* Leitor de código de barras pela câmera (EAN-13, EAN-8, UPC, Code 128, Code 39).
 * Usa o BarcodeDetector do navegador quando ele lê EAN-13 (Chrome no Android) e, se não, a biblioteca ZXing
 * (iPhone e outros), baixada só na primeira vez que a câmera abre. A câmera só abre em https (ou localhost).
 *
 * Uso: abrirLeitorCamera({ titulo, aoLer(codigo) })
 *   - a tela fica aberta para ler vários códigos seguidos; o mesmo código parado na frente da câmera não repete;
 *   - aoLer pode devolver (ou prometer) um texto, que aparece embaixo do vídeo (ex.: o nome do produto).
 */
(function () {
    'use strict';

    const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
    const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
    const REPETICAO_MS = 2500;   // o mesmo código só conta de novo depois de sair da frente da câmera por esse tempo
    let aberto = null;

    function carregarZxing() {
        if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
        return new Promise((ok, falha) => {
            const script = document.createElement('script');
            script.src = ZXING_URL;
            script.async = true;
            script.onload = () => (window.ZXingBrowser ? ok(window.ZXingBrowser) : falha(new Error('o leitor não carregou')));
            script.onerror = () => falha(new Error('sem internet para baixar o leitor'));
            document.head.appendChild(script);
        });
    }

    async function detectorDoNavegador() {
        if (!('BarcodeDetector' in window)) return null;
        try {
            const suportados = await window.BarcodeDetector.getSupportedFormats();
            const usar = FORMATOS.filter(f => suportados.includes(f));
            return usar.includes('ean_13') ? new window.BarcodeDetector({ formats: usar }) : null;
        } catch (e) {
            return null;
        }
    }

    function montarTela(titulo) {
        const tela = document.createElement('div');
        tela.className = 'leitor-camera';
        tela.setAttribute('role', 'dialog');
        tela.innerHTML = `
            <div class="leitor-camera-topo">
                <span><i class="fas fa-camera"></i> </span>
                <button type="button" class="leitor-camera-fechar" aria-label="Fechar"><i class="fas fa-times"></i></button>
            </div>
            <div class="leitor-camera-video"><video playsinline muted autoplay></video><div class="leitor-camera-mira"></div></div>
            <p class="leitor-camera-status">Abrindo a câmera…</p>
            <button type="button" class="btn-secondary leitor-camera-pronto"><i class="fas fa-check"></i> Pronto</button>`;
        tela.querySelector('.leitor-camera-topo span').append(titulo);
        document.body.appendChild(tela);
        document.body.classList.add('leitor-camera-aberto');   // esconde o botão do chat e o aviso da sessão
        return tela;
    }

    function bip(audio) {
        if (!audio) return;
        try {
            const osc = audio.createOscillator();
            const volume = audio.createGain();
            osc.frequency.value = 1700;
            volume.gain.value = 0.12;
            osc.connect(volume);
            volume.connect(audio.destination);
            osc.start();
            osc.stop(audio.currentTime + 0.08);
        } catch (e) { /* sem som */ }
    }

    function motivoDaFalha(erro) {
        if (erro && erro.name === 'NotAllowedError') return 'Permita o uso da câmera no navegador para ler o código.';
        if (erro && (erro.name === 'NotFoundError' || erro.name === 'OverconstrainedError')) return 'Nenhuma câmera encontrada neste aparelho.';
        if (erro && erro.name === 'NotReadableError') return 'A câmera está sendo usada por outro aplicativo.';
        return `Não consegui abrir a câmera${erro && erro.message ? ': ' + erro.message : '.'}`;
    }

    async function abrirLeitorCamera(opcoes = {}) {
        if (aberto) return;
        const tela = montarTela(opcoes.titulo || 'Ler código de barras');
        const video = tela.querySelector('video');
        const status = tela.querySelector('.leitor-camera-status');
        const estado = { parar: [], ultimo: '', ultimoEm: 0, fechado: false, audio: null };
        aberto = estado;

        const fechar = () => {
            if (estado.fechado) return;
            estado.fechado = true;
            estado.parar.forEach(parar => { try { parar(); } catch (e) { /* já parado */ } });
            video.srcObject = null;
            tela.remove();
            document.body.classList.remove('leitor-camera-aberto');
            if (estado.audio) estado.audio.close().catch(() => {});
            document.removeEventListener('keydown', teclas);
            document.removeEventListener('visibilitychange', escondeu);
            aberto = null;
            if (opcoes.aoFechar) opcoes.aoFechar();
        };
        const teclas = ev => { if (ev.key === 'Escape') fechar(); };
        const escondeu = () => { if (document.hidden) fechar(); };   // trocou de app: solta a câmera
        tela.querySelector('.leitor-camera-fechar').addEventListener('click', fechar);
        tela.querySelector('.leitor-camera-pronto').addEventListener('click', fechar);
        document.addEventListener('keydown', teclas);
        document.addEventListener('visibilitychange', escondeu);
        try { estado.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sem som */ }

        const lido = codigo => {
            codigo = String(codigo || '').trim();
            const agora = Date.now();
            if (!codigo || estado.fechado) return;
            if (codigo === estado.ultimo && agora - estado.ultimoEm < REPETICAO_MS) {
                estado.ultimoEm = agora;   // continua na frente da câmera: não repete
                return;
            }
            estado.ultimo = codigo;
            estado.ultimoEm = agora;
            if (navigator.vibrate) navigator.vibrate(70);
            bip(estado.audio);
            tela.classList.add('leu');
            setTimeout(() => tela.classList.remove('leu'), 400);
            status.textContent = `Lido: ${codigo}`;
            Promise.resolve(opcoes.aoLer ? opcoes.aoLer(codigo) : null)
                .then(texto => { if (texto && !estado.fechado) status.textContent = texto; })
                .catch(() => {});
        };

        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = 'A câmera só abre com o ERP em https.';
            return;
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            });
        } catch (erro) {
            status.textContent = motivoDaFalha(erro);
            return;
        }
        if (estado.fechado) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        estado.parar.push(() => stream.getTracks().forEach(t => t.stop()));
        try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* sem foco automático */ }
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* autoplay segura até o primeiro quadro */ }
        status.textContent = 'Aponte para o código de barras';

        const detector = await detectorDoNavegador();
        if (detector) {
            let lendo = false;
            const relogio = setInterval(async () => {
                if (lendo || estado.fechado || video.readyState < 2) return;
                lendo = true;
                try {
                    const achados = await detector.detect(video);
                    if (achados.length) lido(achados[0].rawValue);
                } catch (e) { /* quadro ruim: tenta no próximo */ }
                lendo = false;
            }, 150);
            estado.parar.push(() => clearInterval(relogio));
            return;
        }
        try {
            const ZX = await carregarZxing();
            if (estado.fechado) return;
            const leitor = new ZX.BrowserMultiFormatOneDReader();
            const controles = await leitor.decodeFromStream(stream, video, resultado => { if (resultado) lido(resultado.getText()); });
            estado.parar.push(() => controles.stop());
        } catch (erro) {
            status.textContent = `Não consegui iniciar o leitor: ${erro.message}`;
        }
    }

    window.abrirLeitorCamera = abrirLeitorCamera;
})();
