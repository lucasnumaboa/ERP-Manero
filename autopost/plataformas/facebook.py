"""
Facebook Marketplace: publicar e excluir anúncios.

A publicação segue o app antigo "ERP AutoPost Facebook" (versão do git): fotos, título, preço, categoria,
condição, descrição colada pela área de transferência (para manter emoji e acentos), Avançar, grupos e
Publicar. As esperas fixas viraram esperas pelo campo/botão, e a exclusão agora tira só o anúncio do produto
(o app antigo excluía todos, um a um).
"""
import time

from .base import ParadaSolicitada, Plataforma, SkipItemException, normalizar
from navegador import copiar_para_area_de_transferencia

URL_CRIAR = "https://www.facebook.com/marketplace/create/item"
URL_VENDENDO = "https://www.facebook.com/marketplace/you/selling"
INPUT_FOTOS = 'input[accept="image/*,image/heif,image/heic"]'


class Facebook(Plataforma):
    nome = "facebook"
    rotulo = "Facebook"
    url_login = "https://www.facebook.com/login"

    def __init__(self, navegador, log, parar=lambda: False, opcoes=None):
        super().__init__(navegador, log, parar)
        self.opcoes = opcoes or {}

    # ---------- utilidades ----------
    def _esperar_elemento(self, by, seletor, segundos=30, visivel=True):
        from selenium.common.exceptions import TimeoutException
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
        condicao = EC.visibility_of_element_located if visivel else EC.presence_of_element_located
        fim = time.monotonic() + segundos
        while True:
            try:
                return WebDriverWait(self.scraper.driver, 1).until(condicao((by, seletor)))
            except TimeoutException:
                if time.monotonic() >= fim:
                    return None
                if self._parar():   # deixa o botão Parar funcionar enquanto espera
                    raise ParadaSolicitada()

    def _achar_com_ajuda(self, by, seletor, segundos, etapa, visivel=True):
        """Espera o elemento; se não aparecer, pede ajuda à IA (a tela pode ser outra) e espera mais um pouco."""
        el = self._esperar_elemento(by, seletor, segundos, visivel)
        for _ in range(2):
            if el is not None or not self.ajuda_da_ia(etapa, tentativa=f"esperou {segundos}s: {etapa}"):
                break
            el = self._esperar_elemento(by, seletor, 15, visivel)
        return el

    def _escolher_com_ajuda(self, etapa):
        """Escolha de lista que falhou: a IA vê a tela; a 1ª ajuda costuma só abrir a lista e a 2ª escolher a opção."""
        for _ in range(2):
            if not self.ajuda_da_ia(etapa, tentativa=f"não consegui: {etapa}"):
                break

    def _clicar(self, elemento):
        try:
            elemento.click()
        except Exception:
            self.scraper.driver.execute_script("arguments[0].click();", elemento)

    def _abrir_seletor(self, rotulo):
        """Abre o combobox de "Categoria"/"Condição" pelo texto do rótulo."""
        from selenium.webdriver.common.by import By
        rotulo_el = self.scraper.driver.find_element(By.XPATH, f'//span[text()="{rotulo}"]')
        try:
            caixa = rotulo_el.find_element(By.XPATH, './ancestor::*[@role="combobox" or @tabindex][1]')
        except Exception:
            caixa = rotulo_el.find_element(By.XPATH, '..')
        self._clicar(caixa)
        self.esperar(1.5)

    # ---------- login ----------
    def esta_logado(self) -> bool:
        self.scraper.go_to_page("https://www.facebook.com/")
        self.esperar(3)
        return "c_user" in self.navegador.cookies()

    # ---------- publicar ----------
    def publicar(self, item: dict) -> str | None:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys

        self.log("Abrindo a criação de anúncio no Marketplace...")
        self.scraper.go_to_page(URL_CRIAR)
        if not self._achar_com_ajuda(By.CSS_SELECTOR, INPUT_FOTOS, 45,
                                     "tela de criar anúncio do Marketplace (campo das fotos)", visivel=False):
            raise SkipItemException("a página de criar anúncio não abriu (sem login ou o Facebook mudou a tela)")

        self.scraper.input_file_add_files(INPUT_FOTOS, "\n".join(item["imagens"]))
        self.log(f"{len(item['imagens'])} foto(s) enviada(s).")
        self.esperar(3)

        campos = [c for c in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]') if c.is_displayed()]
        if len(campos) < 2 and self.ajuda_da_ia("campos de título e preço (logo depois das fotos)",
                                                tentativa="não achei os campos de título e preço"):
            campos = [c for c in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
                      if c.is_displayed()]
        if len(campos) < 2:
            raise SkipItemException("campos de título/preço não encontrados")
        self._clicar(campos[0])
        campos[0].send_keys(item["titulo"])
        self.log(f"Título: {item['titulo']}")
        self.esperar(0.8)
        self._clicar(campos[1])
        campos[1].send_keys(str(item["preco"]))
        self.log(f"Preço: {item['preco']}")
        self.esperar(0.8)

        categoria = item.get("categoria_facebook") or self.opcoes.get("categoria_padrao") or "Eletrônicos e informática"
        try:
            self._abrir_seletor("Categoria")
            self.scraper.element_click_by_xpath(f'//span[text()="{categoria}"]')
            self.log(f"Categoria: {categoria}")
        except Exception as e:
            self.log(f"AVISO: não consegui escolher a categoria ({e}).")
            self._escolher_com_ajuda(f"escolher a categoria '{categoria}' (só a categoria; condição e descrição vêm depois)")
        self.esperar(1)

        try:
            self._abrir_seletor("Condição")
            opcoes = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
            if len(opcoes) > 1:
                self._clicar(opcoes[1])   # segunda opção da lista, como no app antigo
                self.log("Condição selecionada.")
        except Exception as e:
            self.log(f"AVISO: não consegui escolher a condição ({e}).")
            self._escolher_com_ajuda("escolher a condição do produto (só a condição; a descrição vem depois)")
        self.esperar(1)

        descricao = item.get("descricao") or ""
        contato = (self.opcoes.get("contato") or "").strip()
        if contato:
            descricao = f"Meu contato: {contato}\n{descricao}"
        areas = [t for t in self.scraper.driver.find_elements(By.CSS_SELECTOR, "textarea") if t.is_displayed()]
        if areas and descricao.strip():
            self._clicar(areas[0])
            self.esperar(0.5)
            # digita pelo próprio navegador (mantém emoji e acentos e funciona com o Chrome escondido, sem mexer
            # na área de transferência de quem está usando o PC); se não pegar, cola como o app antigo
            self.scraper.driver.execute_script(
                "arguments[0].focus(); document.execCommand('insertText', false, arguments[1]);", areas[0], descricao)
            if not (areas[0].get_attribute("value") or "").strip():
                copiar_para_area_de_transferencia(descricao)
                areas[0].send_keys(Keys.CONTROL, "v")
            self.log("Descrição preenchida.")
        self.esperar(1.5)

        avancar = self._achar_com_ajuda(By.XPATH, '//span[text()="Avançar"]', 20,
                                        "botão Avançar (depois de título, preço, categoria, condição e descrição)")
        if not avancar:
            raise SkipItemException("botão Avançar não apareceu (algum campo obrigatório ficou vazio?)")
        self._clicar(avancar)
        self.log("Avançar.")
        self.esperar(3)

        if self.opcoes.get("grupos"):
            marcados = 0
            for caixa in self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="checkbox"]'):
                if marcados >= 20:
                    break
                try:
                    if caixa.get_attribute("aria-checked") == "false":
                        self._clicar(caixa)
                        marcados += 1
                        self.esperar(0.4)
                except Exception:
                    pass
            self.log(f"Grupos marcados: {marcados}")
        self.esperar(1.5)

        publicar = self._achar_com_ajuda(By.XPATH, '//span[text()="Publicar"]', 20, "botão Publicar (última tela)")
        if not publicar:
            raise SkipItemException("botão Publicar não apareceu")
        self._clicar(publicar)
        self.log("Publicar clicado.")
        self.esperar(6)
        return None   # o Marketplace não devolve o link na hora; o anúncio é achado pelo título

    # ---------- excluir ----------
    def excluir(self, titulo: str) -> bool:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        self.log(f"Procurando o anúncio no Marketplace: {titulo}")
        cartao = self._cartao_no_marketplace(titulo)
        menu = cartao["botao"] if cartao else None
        if not menu:
            self.log("Anúncio não encontrado no Marketplace (já foi excluído ou o título mudou).")
            return False

        self._clicar(menu)
        self.esperar(2)
        try:
            WebDriverWait(self.scraper.driver, 10).until(EC.element_to_be_clickable(
                (By.XPATH, '//span[contains(text(), "Excluir classificado")]'))).click()
        except Exception as e:
            self.log(f"Opção 'Excluir classificado' não apareceu: {e}")
            return False
        self.esperar(3)

        # o diálogo tem dois "Excluir": um escondido e desabilitado (aria-disabled, sem texto) e o de verdade; o app
        # clicava no primeiro, nada acontecia, e mesmo assim dizia "excluído"
        confirmar = self.scraper.driver.execute_script(JS_CONFIRMAR_EXCLUSAO)
        if not confirmar:
            self.log("Botão Excluir da confirmação não encontrado.")
            return False
        self._clicar(confirmar)
        self.esperar(3)

        for xpath in ('//span[contains(text(), "Sim, vendi em outro lugar")]',):
            for el in self.scraper.driver.find_elements(By.XPATH, xpath):
                try:
                    self._clicar(el)
                    break
                except Exception:
                    continue
        self.esperar(1.5)
        for el in self.scraper.driver.find_elements(By.XPATH, '//span[text()="Avançar"]/ancestor::div[@role="button"]'):
            try:
                self._clicar(el)
                break
            except Exception:
                continue
        self.esperar(2)
        # só diz que excluiu depois de ver que saiu da lista
        if self._cartao_no_marketplace(titulo, rolagens=4):
            self.log("O Facebook não confirmou a exclusão: o anúncio continua em Vendendo.")
            return False
        self.log("Anúncio excluído no Marketplace (conferido: saiu de Vendendo).")
        return True

    def _cartao_no_marketplace(self, titulo, rolagens=8):
        """Cartão do anúncio com este título em Vendendo (título inteiro; o do botão vem cortado em ~70 letras).
        Só cartões de anúncio: o "Mais opções para <pessoa>" das conversas e títulos parecidos não batem."""
        self.scraper.go_to_page(URL_VENDENDO)
        self.esperar(5)
        alvo = normalizar(titulo)
        for _ in range(rolagens):
            for cartao in self.scraper.driver.execute_script(JS_LISTA_FACEBOOK) or []:
                curto = normalizar(cartao["rotulo"])
                if normalizar(cartao["titulo"]) == alvo or (len(curto) >= 60 and alvo.startswith(curto)):
                    return cartao
            self.scraper.driver.execute_script("window.scrollBy(0, 1200);")
            self.esperar(2)
        return None

    # ---------- listar ----------
    def listar(self) -> list[dict]:
        """Anúncios da página "Vendendo" do Marketplace (rola até a lista parar de crescer)."""
        self.log("Lendo os anúncios do Marketplace...")
        self.scraper.go_to_page(URL_VENDENDO)
        self.esperar(5)
        itens, antes = [], -1
        for _ in range(25):
            itens = [{k: v for k, v in c.items() if k not in ("botao", "rotulo")}
                     for c in self.scraper.driver.execute_script(JS_LISTA_FACEBOOK) or []]
            if len(itens) == antes:
                break
            antes = len(itens)
            self.scraper.driver.execute_script("window.scrollBy(0, 2500);")
            self.esperar(2)
        self.log(f"{len(itens)} anúncio(s) encontrado(s) no Marketplace.")
        return itens


# Botão Excluir de verdade do diálogo de confirmação (visível, habilitado e com o texto "Excluir")
JS_CONFIRMAR_EXCLUSAO = r"""
const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (!vis(d)) continue;
    const b = [...d.querySelectorAll('[role="button"], button')].find(x => vis(x)
        && x.getAttribute('aria-disabled') !== 'true' && !x.disabled && limpa(x.innerText) === 'Excluir');
    if (b) return b;
}
return null;
"""


# Cada anúncio da página "Vendendo" tem botões "Mais opções para <título>" (o título vem cortado em ~70 letras). O
# cartão é o MENOR bloco acima do botão com foto e preço, e só vale se todos os botões desse tipo nele são do mesmo
# anúncio: os "Mais opções para <pessoa>" das conversas sobem até a página inteira (com todos os botões) e ficam de
# fora. O título inteiro é a linha do cartão que começa com o do botão.
JS_LISTA_FACEBOOK = r"""
const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
const rotuloDe = b => limpa((b.getAttribute('aria-label') || '').replace(/^Mais opções para /, ''));
const saida = [], vistos = new Set();
for (const botao of document.querySelectorAll('[aria-label^="Mais opções para "]')) {
    const rotulo = rotuloDe(botao);
    let card = botao.parentElement;
    while (card && !(card.querySelector('img') && /R\$|Grátis/.test(card.innerText || ''))) card = card.parentElement;
    if (!card || !rotulo) continue;
    const doCard = [...card.querySelectorAll('[aria-label^="Mais opções para "]')].map(rotuloDe);
    if (doCard.some(r => r !== rotulo)) continue;
    const texto = card.innerText || '';
    const linhas = texto.split('\n').map(limpa).filter(Boolean);
    const titulo = linhas.find(l => l.toLowerCase().startsWith(rotulo.toLowerCase())) || rotulo;
    if (vistos.has(titulo)) continue;
    vistos.add(titulo);
    const img = card.querySelector('img');
    const link = card.querySelector('a[href*="/marketplace/item/"]');
    saida.push({
        titulo, rotulo, botao,
        preco: (texto.match(/R\$\s?[\d.]+(,\d{2})?/) || [/Grátis/.test(texto) ? 'Grátis' : ''])[0],
        status: linhas.find(l => /^(vendido|pendente|ativo|em estoque|esgotado|reservado|indisponível|anúncio|listado|aguardando)/i.test(l)) || '',
        imagem: img ? img.currentSrc || img.src : '',
        link: link ? link.href : '',
        detalhes: linhas.slice(0, 6).join(' · ').slice(0, 300),
    });
}
return saida;
"""
