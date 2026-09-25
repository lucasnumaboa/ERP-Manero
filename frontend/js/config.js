// Configuração central do frontend. Carregado antes de todos os outros scripts em todas as páginas.

// Endereço da API. É o ÚNICO lugar com o domínio no frontend: o change_api_link.py (rodado pelo
// start_erp.bat) grava aqui o link_api do banco a cada inicialização, então um localhost que veio
// do PC de desenvolvimento é trocado pelo endereço publicado na Cloudflare.
const ERP_API_URL_PADRAO = 'https://erp-api-call.autoservto.com.br';

// Endereço em uso, sem esperar a rede: o confirmado nesta sessão ou, antes disso, o deste arquivo.
// Usado para montar links de imagens, vídeos e downloads.
function apiUrlAtual() {
    try {
        return sessionStorage.getItem('erp_api_url_sessao') || ERP_API_URL_PADRAO;
    } catch (e) {
        return ERP_API_URL_PADRAO;
    }
}

function _guardarApiUrl(url) {
    try {
        sessionStorage.setItem('erp_api_url_sessao', url);
        localStorage.setItem('api_base_url', url);
    } catch (e) { /* armazenamento indisponível: segue só com o valor em memória */ }
}

async function _buscarLinkApi(base) {
    const resposta = await fetch(`${base}/api/configuracoes/link_api`, { headers: { 'Content-Type': 'application/json' } });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    return dados && dados.valor ? String(dados.valor).replace(/\/+$/, '') : null;
}

// Endereço da API configurado no banco (link_api), consultado uma vez por sessão do navegador
// em vez de antes de cada requisição.
let _promessaApiUrl = null;
function getApiUrl() {
    if (!_promessaApiUrl) {
        _promessaApiUrl = (async () => {
            try {
                const daSessao = sessionStorage.getItem('erp_api_url_sessao');
                if (daSessao) return daSessao;
            } catch (e) { /* segue buscando */ }

            for (const base of new Set([apiUrlAtual(), ERP_API_URL_PADRAO])) {
                try {
                    const url = await _buscarLinkApi(base);
                    if (url) {
                        _guardarApiUrl(url);
                        return url;
                    }
                } catch (e) {
                    console.warn(`Não foi possível consultar a URL da API em ${base}`);
                }
            }
            return apiUrlAtual();
        })();
    }
    return _promessaApiUrl;
}

// App instalável (manifest.webmanifest + sw.js): no celular aparece "Adicionar à tela inicial" e o ERP
// abre em tela cheia, como um aplicativo. O service worker não guarda telas em cache (ver sw.js).
// O sw.js fica na raiz do frontend (ao lado das telas), achado a partir deste arquivo para funcionar também
// no app do Assistente, que está numa subpasta (assistente/).
const _URL_SERVICE_WORKER = document.currentScript ? new URL('../sw.js', document.currentScript.src).href : 'sw.js';
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(_URL_SERVICE_WORKER).catch(() => { /* sem app instalável, o site segue normal */ });
    });
}
