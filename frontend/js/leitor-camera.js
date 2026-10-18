/* Leitor de código de barras pela câmera (EAN-13, EAN-8, UPC, Code 128, Code 39).
 * Usa o BarcodeDetector do navegador quando ele lê EAN-13 (Chrome no Android) e, se não, a biblioteca ZXing
 * (iPhone e outros), baixada só na primeira vez que a câmera abre. A câmera só abre em https (ou localhost).
 *
 * Celular não foca de perto (menos de ~10 cm): a etiqueta encostada fica borrada. Por isso a câmera abre em
 * resolução alta, com zoom (quando o aparelho deixa) para ler de 15–20 cm, foco no toque, lanterna e troca de
 * lente. Embaixo do vídeo aparece qual leitor e resolução estão em uso (ajuda a entender um aparelho que não lê).
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
    const ZOOM_PADRAO = 2;       // com 2x dá para segurar a etiqueta longe o bastante para o celular focar
    const CHAVE_ZOOM = 'erp_camera_zoom';
    // ZXing: DecodeHintType.POSSIBLE_FORMATS = 2 e TRY_HARDER = 3 (conferido no zxing-browser 0.1.5)
    const ZX_FORMATOS = 2;
    const ZX_CAPRICHAR = 3;
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

    function lerPreferencia(chave) {
        try { return localStorage.getItem(chave); } catch (e) { return null; }
    }

    function gravarPreferencia(chave, valor) {
        try { localStorage.setItem(chave, valor); } catch (e) { /* só não lembra */ }
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
            <div class="leitor-camera-controles"></div>
            <p class="leitor-camera-status">Abrindo a câmera…</p>
            <p class="leitor-camera-dica">Segure a uns 15–20 cm (de perto não foca) e toque na imagem para focar.</p>
            <p class="leitor-camera-info"></p>
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
        const caixa = tela.querySelector('.leitor-camera-video');
        const controles = tela.querySelector('.leitor-camera-controles');
        const status = tela.querySelector('.leitor-camera-status');
        const info = tela.querySelector('.leitor-camera-info');
        const estado = { parar: [], ultimo: '', ultimoEm: 0, fechado: false, audio: null, trilha: null, lentes: [], lente: 0 };
        aberto = estado;

        const pararCamera = () => {
            estado.parar.forEach(parar => { try { parar(); } catch (e) { /* já parado */ } });
            estado.parar = [];
            estado.trilha = null;
            video.srcObject = null;
        };
        const fechar = () => {
            if (estado.fechado) return;
            estado.fechado = true;
            pararCamera();
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

        // ---------- ajustes da câmera: zoom, lanterna, foco no toque, troca de lente ----------
        const aplicar = async ajustes => {
            if (!estado.trilha) return false;
            try {
                await estado.trilha.applyConstraints({ advanced: [ajustes] });
                return true;
            } catch (e) {
                return false;
            }
        };

        const montarControles = (capacidades) => {
            controles.innerHTML = '';
            const botao = (html, titulo) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.innerHTML = html;
                b.title = titulo;
                controles.appendChild(b);
                return b;
            };
            const zoom = capacidades.zoom;
            estado.temZoom = !!(zoom && zoom.max > zoom.min);
            let zoomAtual = null;
            if (zoom && zoom.max > zoom.min) {
                const niveis = [...new Set([1, 2, 3, 4].map(n => Math.min(zoom.max, Math.max(zoom.min, n))))];
                const botoes = niveis.map(n => {
                    const b = botao(`${Math.round(n * 10) / 10}x`, `Zoom ${n}x`);
                    b.addEventListener('click', async () => {
                        if (await aplicar({ zoom: n })) {
                            botoes.forEach(x => x.classList.toggle('ativo', x === b));
                            zoomAtual = n;
                            gravarPreferencia(CHAVE_ZOOM, String(n));
                            atualizarInfo();
                        }
                    });
                    return b;
                });
                const preferido = Number(lerPreferencia(CHAVE_ZOOM)) || ZOOM_PADRAO;
                const inicial = niveis.reduce((a, b) => (Math.abs(b - preferido) < Math.abs(a - preferido) ? b : a));
                botoes[niveis.indexOf(inicial)].click();
            }
            if (capacidades.torch) {
                let ligada = false;
                const b = botao('<i class="fas fa-lightbulb"></i>', 'Lanterna');
                b.addEventListener('click', async () => {
                    if (await aplicar({ torch: !ligada })) {
                        ligada = !ligada;
                        b.classList.toggle('ativo', ligada);
                    }
                });
            }
            if (estado.lentes.length > 1) {
                const b = botao('<i class="fas fa-sync-alt"></i> Lente', 'Trocar de câmera');
                b.addEventListener('click', () => {
                    estado.lente = (estado.lente + 1) % estado.lentes.length;
                    iniciar(estado.lentes[estado.lente].deviceId);
                });
            }
            const atualizarInfo = () => {
                const partes = [estado.leitor, `${video.videoWidth}×${video.videoHeight}`];
                if (zoomAtual) partes.push(`zoom ${zoomAtual}x`);
                partes.push(estado.focoNoToque ? 'foco no toque' : 'sem foco no toque');
                if (estado.lentes.length > 1) partes.push(`lente ${estado.lente + 1}/${estado.lentes.length}`);
                info.textContent = partes.join(' · ');
            };
            estado.atualizarInfo = atualizarInfo;
            atualizarInfo();
        };

        // toque na imagem: foca naquele ponto (quando o aparelho deixa o navegador mandar no foco)
        caixa.addEventListener('click', async ev => {
            if (!estado.trilha) return;
            const r = caixa.getBoundingClientRect();
            const x = (ev.clientX - r.left) / r.width;
            const y = (ev.clientY - r.top) / r.height;
            const anel = document.createElement('span');
            anel.className = 'leitor-camera-foco';
            anel.style.left = `${x * 100}%`;
            anel.style.top = `${y * 100}%`;
            caixa.appendChild(anel);
            setTimeout(() => anel.remove(), 900);
            if (!estado.focoNoToque) {
                status.textContent = `Este aparelho não deixa o navegador focar: afaste um pouco${estado.temZoom ? ' e use o zoom' : ''}.`;
                return;
            }
            const modos = estado.modosFoco;
            const ajuste = { pointsOfInterest: [{ x, y }] };
            if (modos.includes('single-shot')) ajuste.focusMode = 'single-shot';
            await aplicar(ajuste);
            if (modos.includes('continuous')) setTimeout(() => aplicar({ focusMode: 'continuous' }), 1500);
        });

        // ---------- câmera e leitura ----------
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = 'A câmera só abre com o ERP em https.';
            return;
        }
        const detector = await detectorDoNavegador();
        estado.leitor = detector ? 'leitor do navegador' : 'leitor ZXing';
        let ZX = null;
        if (!detector) {
            try {
                ZX = await carregarZxing();
            } catch (erro) {
                status.textContent = `Não consegui iniciar o leitor: ${erro.message}`;
                return;
            }
        }

        async function iniciar(deviceId) {
            pararCamera();
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        advanced: [{ focusMode: 'continuous' }],
                    },
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
            const trilha = stream.getVideoTracks()[0];
            estado.trilha = trilha;
            const capacidades = (trilha.getCapabilities && trilha.getCapabilities()) || {};
            estado.modosFoco = capacidades.focusMode || [];
            estado.focoNoToque = !!capacidades.pointsOfInterest || estado.modosFoco.includes('single-shot');
            if (estado.modosFoco.includes('continuous')) await aplicar({ focusMode: 'continuous' });

            // câmeras traseiras (os nomes só aparecem depois da permissão): para trocar de lente
            if (!estado.lentes.length && navigator.mediaDevices.enumerateDevices) {
                try {
                    const todas = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
                    const traseiras = todas.filter(d => /back|rear|traseira|environment/i.test(d.label));
                    estado.lentes = traseiras.length ? traseiras : todas;
                    const atual = trilha.getSettings ? trilha.getSettings().deviceId : null;
                    estado.lente = Math.max(0, estado.lentes.findIndex(d => d.deviceId === atual));
                } catch (e) { /* sem lista de câmeras */ }
            }

            video.srcObject = stream;
            try { await video.play(); } catch (e) { /* autoplay segura até o primeiro quadro */ }
            if (!video.videoWidth) await new Promise(ok => video.addEventListener('loadedmetadata', ok, { once: true }));
            montarControles(capacidades);
            status.textContent = 'Aponte para o código de barras';

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
                }, 120);
                estado.parar.push(() => clearInterval(relogio));
                return;
            }
            try {
                const F = ZX.BarcodeFormat;
                const dicas = new Map([
                    [ZX_FORMATOS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39]],
                    [ZX_CAPRICHAR, true],   // varre a imagem toda, não só 15 linhas do meio
                ]);
                const leitor = new ZX.BrowserMultiFormatOneDReader(dicas, { delayBetweenScanAttempts: 120 });
                const controlesZx = await leitor.decodeFromStream(stream, video, resultado => { if (resultado) lido(resultado.getText()); });
                estado.parar.push(() => controlesZx.stop());
            } catch (erro) {
                status.textContent = `Não consegui iniciar o leitor: ${erro.message}`;
            }
        }

        await iniciar(null);
    }

    window.abrirLeitorCamera = abrirLeitorCamera;
})();
