/* Impressora de etiquetas Niimbot D110 pelo Bluetooth do próprio computador (Web Bluetooth: Chrome ou Edge).
 *
 * O ERP fica no servidor, mas quem imprime é o navegador de quem clicou: a etiqueta sai na D110 que estiver perto
 * desse PC. Mesmo protocolo do projeto niimbot-D110 (Python, testado na impressora): pacote
 * 55 55 | tipo | tamanho | dados | xor | AA AA; etiqueta T15x50 (50 x 15 mm) a 8 pontos/mm = 400 x 120,
 * girada 90° para a saída do rolo (120 pontos de largura x 400 linhas), uma linha por pacote 0x85.
 */
'use strict';

const Niimbot = (() => {
    const SERVICO = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
    const CARACTERISTICA = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f';
    const PONTOS_POR_MM = 8;
    let dispositivo = null;
    let canal = null;

    const esperar = ms => new Promise(r => setTimeout(r, ms));

    // ---------- protocolo ----------
    function pacote(tipo, dados) {
        const d = Array.from(dados);
        let soma = tipo ^ d.length;
        for (const b of d) soma ^= b;
        return new Uint8Array([0x55, 0x55, tipo, d.length, ...d, soma & 0xff, 0xaa, 0xaa]);
    }

    // ---------- EAN-13 ----------
    const CODIGO_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const CODIGO_R = CODIGO_L.map(c => [...c].map(b => (b === '1' ? '0' : '1')).join(''));
    const CODIGO_G = CODIGO_R.map(c => [...c].reverse().join(''));
    const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

    function digitoEan13(doze) {
        let soma = 0;
        for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 ? 3 : 1);
        return (10 - (soma % 10)) % 10;
    }

    /** As 95 barras do EAN-13 ("1" = barra preta), com as guardas. */
    function modulosEan13(ean) {
        if (!/^[0-9]{13}$/.test(ean) || digitoEan13(ean) !== Number(ean[12])) {
            throw new Error(`EAN-13 inválido: ${ean}`);
        }
        const paridade = PARIDADE[Number(ean[0])];
        let bits = '101';
        for (let i = 1; i <= 6; i++) {
            const n = Number(ean[i]);
            bits += paridade[i - 1] === 'L' ? CODIGO_L[n] : CODIGO_G[n];
        }
        bits += '01010';
        for (let i = 7; i <= 12; i++) bits += CODIGO_R[Number(ean[i])];
        return bits + '101';
    }

    // ---------- desenho da etiqueta (deitada, como fica na mão) ----------
    function cortarTexto(ctx, texto, largura) {
        if (ctx.measureText(texto).width <= largura) return texto;
        while (texto.length > 1 && ctx.measureText(texto + '…').width > largura) texto = texto.slice(0, -1);
        return texto.trimEnd() + '…';
    }

    /** Desenha título, barras e números. canvas fica com 400 x 120 (50 x 15 mm). */
    function desenharEtiqueta(canvas, { titulo, ean, larguraMm = 50, alturaMm = 15 }) {
        const L = larguraMm * PONTOS_POR_MM;
        const A = Math.min(120, alturaMm * PONTOS_POR_MM);
        canvas.width = L;
        canvas.height = A;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, L, A);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px Arial, "Segoe UI", sans-serif';
        let topo = 1;
        if (titulo) {
            ctx.textBaseline = 'top';
            ctx.fillText(cortarTexto(ctx, String(titulo).trim(), L - 12), L / 2, 1);
            topo = 19;
        }
        ctx.textBaseline = 'bottom';
        ctx.fillText(ean, L / 2, A - 2);
        // barras com largura inteira (3 pontos = 0,375 mm por barra) e margem branca dos dois lados para o leitor
        const modulos = modulosEan13(ean);
        const largura = Math.max(2, Math.floor((L * 0.9) / modulos.length));
        const x0 = Math.round((L - modulos.length * largura) / 2);
        const altura = Math.max(30, A - topo - 18 - 2);
        for (let i = 0; i < modulos.length; i++) {
            if (modulos[i] === '1') ctx.fillRect(x0 + i * largura, topo, largura, altura);
        }
        return canvas;
    }

    /** Gira 90° (anti-horário, igual ao Python) e transforma em linhas de bits: 1 = ponto queimado. */
    function linhasParaImpressao(canvasDeitado) {
        const deitada = canvasDeitado;
        const girada = document.createElement('canvas');
        girada.width = deitada.height;   // 120
        girada.height = deitada.width;   // 400
        const g = girada.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, girada.width, girada.height);
        g.translate(0, girada.height);
        g.rotate(-Math.PI / 2);
        g.drawImage(deitada, 0, 0);
        const largura = Math.min(120, Math.max(96, Math.ceil(girada.width / 8) * 8));
        const { data } = g.getImageData(0, 0, girada.width, girada.height);
        const bytesPorLinha = largura / 8;
        const desloc = Math.floor((largura - girada.width) / 2);
        const linhas = [];
        for (let y = 0; y < girada.height; y++) {
            const linha = new Uint8Array(bytesPorLinha);
            for (let x = 0; x < girada.width; x++) {
                const i = (y * girada.width + x) * 4;
                const cinza = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                if (cinza < 128) {
                    const px = x + desloc;
                    linha[px >> 3] |= 0x80 >> (px & 7);
                }
            }
            linhas.push(linha);
        }
        return { linhas, largura, altura: girada.height };
    }

    // ---------- Bluetooth ----------
    function disponivel() {
        return !!(navigator.bluetooth && window.isSecureContext);
    }

    async function conectar() {
        if (canal && dispositivo && dispositivo.gatt.connected) return dispositivo.name;
        if (!disponivel()) {
            throw new Error('Este navegador não imprime pelo Bluetooth. Use o Google Chrome ou o Microsoft Edge no computador (com o Bluetooth ligado).');
        }
        if (!dispositivo) {
            // a 1ª vez em cada página o navegador mostra a lista: escolha a D110
            dispositivo = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'D110' }, { namePrefix: 'D11' }, { namePrefix: 'NIIMBOT' }, { namePrefix: 'Niimbot' }],
                optionalServices: [SERVICO],
            });
            dispositivo.addEventListener('gattserverdisconnected', () => { canal = null; });
        }
        const servidor = await dispositivo.gatt.connect();
        const servico = await servidor.getPrimaryService(SERVICO);
        canal = await servico.getCharacteristic(CARACTERISTICA);
        try { await canal.startNotifications(); } catch (e) { /* a impressão não depende das respostas */ }
        return dispositivo.name;
    }

    async function escrever(bytes) {
        if (canal.writeValueWithoutResponse) await canal.writeValueWithoutResponse(bytes);
        else await canal.writeValue(bytes);
    }

    /**
     * Imprime a etiqueta desenhada em canvasDeitado. Mesma sequência do Python que funcionou na D110:
     * densidade, tipo (com intervalo), início, página, tamanho, cópias, as linhas, fim da página e fim.
     */
    async function imprimir(canvasDeitado, { copias = 1, densidade = 2, aoAndar = null, escritor = null } = {}) {
        const enviar = escritor || escrever;
        if (!escritor) await conectar();
        const { linhas, largura, altura } = linhasParaImpressao(canvasDeitado);
        const q = Math.max(1, Math.min(999, Math.round(copias)));
        await enviar(pacote(0x21, [Math.max(1, Math.min(3, densidade))])); await esperar(50);
        await enviar(pacote(0x23, [1])); await esperar(50);
        await enviar(pacote(0x01, [1])); await esperar(50);
        await enviar(pacote(0x03, [1])); await esperar(50);
        await enviar(pacote(0x13, [altura >> 8, altura & 0xff, largura >> 8, largura & 0xff])); await esperar(50);
        await enviar(pacote(0x15, [q >> 8, q & 0xff])); await esperar(50);
        for (let y = 0; y < linhas.length; y++) {
            await enviar(pacote(0x85, [y >> 8, y & 0xff, 0, 0, 0, 1, ...linhas[y]]));
            await esperar(8);
            if (aoAndar && y % 20 === 0) aoAndar(y / linhas.length);
        }
        await enviar(pacote(0xe3, [1])); await esperar(100);
        await esperar(500);
        await enviar(pacote(0xf3, [1])); await esperar(100);
        if (aoAndar) aoAndar(1);
    }

    function nomeImpressora() {
        return dispositivo && dispositivo.gatt.connected ? dispositivo.name : '';
    }

    return { desenharEtiqueta, imprimir, conectar, disponivel, nomeImpressora, modulosEan13, pacote, linhasParaImpressao };
})();
