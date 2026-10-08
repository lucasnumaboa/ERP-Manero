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
        if not self._esperar_elemento(By.CSS_SELECTOR, INPUT_FOTOS, 45, visivel=False):
            raise SkipItemException("a página de criar anúncio não abriu (sem login ou o Facebook mudou a tela)")

        self.scraper.input_file_add_files(INPUT_FOTOS, "\n".join(item["imagens"]))
        self.log(f"{len(item['imagens'])} foto(s) enviada(s).")
        self.esperar(3)

        campos = [c for c in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]') if c.is_displayed()]
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
        self.esperar(1)

        try:
            self._abrir_seletor("Condição")
            opcoes = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
            if len(opcoes) > 1:
                self._clicar(opcoes[1])   # segunda opção da lista, como no app antigo
                self.log("Condição selecionada.")
        except Exception as e:
            self.log(f"AVISO: não consegui escolher a condição ({e}).")
        self.esperar(1)

        descricao = item.get("descricao") or ""
        contato = (self.opcoes.get("contato") or "").strip()
        if contato:
            descricao = f"Meu contato: {contato}\n{descricao}"
        areas = [t for t in self.scraper.driver.find_elements(By.CSS_SELECTOR, "textarea") if t.is_displayed()]
        if areas and descricao.strip():
            self._clicar(areas[0])
            self.esperar(0.5)
            copiar_para_area_de_transferencia(descricao)
            areas[0].send_keys(Keys.CONTROL, "v")
            self.log("Descrição preenchida.")
        self.esperar(1.5)

        avancar = self._esperar_elemento(By.XPATH, '//span[text()="Avançar"]', 20)
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

        publicar = self._esperar_elemento(By.XPATH, '//span[text()="Publicar"]', 20)
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
        self.scraper.go_to_page(URL_VENDENDO)
        self.esperar(5)
        alvo = normalizar(titulo)[:50]
        menu = None
        # o botão de "..." de cada anúncio tem aria-label "Mais opções para <título>"
        for _ in range(3):
            for botao in self.scraper.driver.find_elements(By.XPATH, '//div[contains(@aria-label, "Mais opções para")][@role="button"]'):
                try:
                    rotulo = normalizar(botao.get_attribute("aria-label") or "").replace("mais opções para", "", 1).strip()
                    if botao.is_displayed() and (alvo in rotulo or rotulo[:50] in alvo):
                        menu = botao
                        break
                except Exception:
                    continue
            if menu:
                break
            self.scraper.driver.execute_script("window.scrollBy(0, 1200);")
            self.esperar(2)
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

        confirmou = False
        for xpath in ('//div[@role="dialog"]//div[@aria-label="Excluir" and @role="button"]',
                      '//div[@role="dialog"]//div[@role="button"]//span[text()="Excluir"]/ancestor::div[@role="button"]'):
            botoes = self.scraper.driver.find_elements(By.XPATH, xpath)
            if botoes:
                self._clicar(botoes[0])
                confirmou = True
                break
        if not confirmou:
            self.log("Botão Excluir da confirmação não encontrado.")
            return False
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
        self.log("Anúncio excluído no Marketplace.")
        return True
