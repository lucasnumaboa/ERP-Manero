"""Peças comuns às plataformas (Facebook e OLX)."""
import re
import time

from .tela import JS_ACHAR_CAMPO, JS_ACHAR_CLICAVEL, JS_OPCAO_VISIVEL, JS_TELA, com_dados_do_produto, descrever


class ParadaSolicitada(BaseException):
    """A pessoa clicou em Parar. BaseException de propósito: os fluxos de publicação têm muitos
    `except Exception` (para tentar de novo de outro jeito) e a parada não pode ser engolida por eles."""


class Travou(BaseException):
    """O robô está patinando (mesmo passo repetido demais ou tempo demais num anúncio). BaseException pelo
    mesmo motivo da ParadaSolicitada. `acao` é o que ele estava tentando fazer."""

    def __init__(self, acao: str, motivo: str):
        super().__init__(f"{motivo}: {acao}")
        self.acao = acao
        self.motivo = motivo


class SkipItemException(Exception):
    """Não deu para publicar este item: pula para o próximo (nome mantido do app antigo da OLX)."""


def normalizar(texto: str) -> str:
    """Para comparar títulos: minúsculo, sem espaços repetidos."""
    return re.sub(r"\s+", " ", (texto or "").strip().lower())


# mensagens de quem está esperando/tentando de novo; números e tempos não contam ("tentativa 3", "10s")
_CARA_DE_PROBLEMA = re.compile(r"erro|aviso|não encontr|nao encontr|sem mudança|ainda aguardando|tentando|"
                               r"repetindo|retry|falh|não apareceu|não consegui", re.I)
LIMITE_REPETICOES = 5          # "mais de 5 vezes" o mesmo passo = travou
TEMPO_MAXIMO_ANUNCIO = 10 * 60  # segundos num anúncio só


class Plataforma:
    nome = ""          # "facebook" | "olx"
    rotulo = ""        # para a tela
    url_login = ""
    # tarefas.py liga ao ERP (None = sem IA):
    escolher_campos = None    # ({"campos": [...], ...}) -> {"escolhas": {...}, "memorias": {...}}
    pedir_ajuda = None        # ({"etapa_esperada", "tela", "imagem_base64", ...}) -> {"acoes": [...], "memoria_id"}
    relatar_memoria = None    # (memoria_id, deu_certo): conta se a resposta guardada funcionou
    MAX_AJUDAS = 6            # pedidos de ajuda à IA por anúncio

    def __init__(self, navegador, log, parar=lambda: False):
        self.scraper = navegador        # nome usado pelos fluxos trazidos do app antigo
        self.navegador = navegador
        self._log = log
        self._parar = parar
        self.iniciar_item()

    # ---------- vigia de travamento ----------
    def iniciar_item(self):
        """Zera a contagem de repetições (chamado antes de cada anúncio)."""
        self._repeticoes = {}
        self._ultima = None
        self._seguidas = 0
        self._inicio_item = time.monotonic()
        self._travou = None
        self._ajudas = 0
        self._tentativas_ia = []

    def _vigiar(self, mensagem):
        if self._travou:   # algum "except" do fluxo engoliu: dispara de novo no passo seguinte
            raise self._travou
        chave = re.sub(r"\d+", "#", normalizar(str(mensagem)))
        self._seguidas = self._seguidas + 1 if chave == self._ultima else 1
        self._ultima = chave
        vezes = self._seguidas
        if _CARA_DE_PROBLEMA.search(chave):
            self._repeticoes[chave] = self._repeticoes.get(chave, 0) + 1
            vezes = max(vezes, self._repeticoes[chave])
        if vezes > LIMITE_REPETICOES:
            self._travou = Travou(str(mensagem), f"repetiu {vezes} vezes")
        elif time.monotonic() - self._inicio_item > TEMPO_MAXIMO_ANUNCIO:
            self._travou = Travou(str(mensagem), f"mais de {TEMPO_MAXIMO_ANUNCIO // 60} minutos no mesmo anúncio")
        if self._travou:
            raise self._travou

    def log(self, mensagem):
        self._log(mensagem)
        if self._parar():
            raise ParadaSolicitada()
        self._vigiar(mensagem)

    def esperar(self, segundos):
        """sleep que obedece ao botão Parar."""
        fim = time.monotonic() + segundos
        while time.monotonic() < fim:
            if self._parar():
                raise ParadaSolicitada()
            if self._travou:
                raise self._travou
            time.sleep(min(0.5, fim - time.monotonic()))

    # ---------- ajuda da IA quando trava (memória e IA ficam no ERP: /api/autopost/ia/ajuda) ----------
    def ajuda_da_ia(self, etapa, tentativa="") -> bool:
        """O robô patinou. Manda ao ERP a etapa em que ele ACHA que está e a tela de verdade (resumo + print): a
        resposta diz em que etapa a tela realmente está e o que fazer. Faz as ações e conta ao ERP se a tela mudou.
        True se fez alguma ação."""
        if not self.pedir_ajuda or self._ajudas >= self.MAX_AJUDAS:
            return False
        self._ajudas += 1
        if tentativa:
            self._tentativas_ia.append(tentativa[:300])
        driver = self.scraper.driver
        try:
            self.fechar_listas()   # lista aberta esconde opções e cobre outros campos
        except Exception:
            pass
        try:
            tela = driver.execute_script(JS_TELA) or {}
            imagem = driver.get_screenshot_as_base64()
        except Exception as e:
            self._log(f"Não consegui ler a tela para a IA: {e}")
            return False
        item = getattr(self, "_item_atual", None) or {}
        self._log(f"Pedindo ajuda à IA do ERP: o robô travou em '{etapa}'...")
        try:
            resposta = self.pedir_ajuda({
                "plataforma": self.nome, "produto_id": item.get("produto_id"), "titulo": item.get("titulo") or "",
                "preco": str(item.get("preco") or ""), "etapa_esperada": etapa[:300],
                "tentativas": self._tentativas_ia[-10:], "tela": tela, "imagem_base64": imagem}) or {}
        except Exception as e:
            self._log(f"IA do ERP indisponível ({e}).")
            return False
        origem = "memória" if resposta.get("origem") == "memória" else "IA"
        etapa_atual = resposta.get("etapa_atual") or "?"
        self._log(f"{origem}: a tela é '{etapa_atual}' (o robô esperava '{etapa}'). {resposta.get('explicacao') or ''}")
        for motivo in resposta.get("recusadas") or []:
            self._log(f"Ação da IA recusada: {motivo}.")
        antes = self._texto_da_tela()
        feitas = 0
        for acao in resposta.get("acoes") or []:
            if acao.get("tipo") == "desistir":
                self._log(f"A IA diz que só uma pessoa resolve: {acao.get('motivo')}")
                break
            ok = self._executar_acao(acao, item)
            self._tentativas_ia.append(f"{origem}: {descrever(acao)} -> {'feito' if ok else 'não consegui'}")
            self._log(f"{origem}: {descrever(acao)} -> {'feito' if ok else 'não consegui'}.")
            feitas += bool(ok)
        time.sleep(2)
        self.relatar(resposta.get("memoria_id"), feitas and self._texto_da_tela() != antes)
        return bool(feitas)

    def relatar(self, memoria_id, deu_certo):
        if memoria_id and self.relatar_memoria:
            try:
                self.relatar_memoria(memoria_id, bool(deu_certo))
            except Exception:
                pass

    def _texto_da_tela(self):
        try:
            return self.scraper.driver.execute_script("return document.body ? document.body.innerText : ''") or ""
        except Exception:
            return ""

    def fechar_listas(self):
        """Fecha lista de opções aberta (Esc): ela cobre o campo de baixo e esconde as opções dos outros."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys

        for _ in range(3):
            abertos = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="combobox"][aria-expanded="true"]')
            if not abertos:
                return
            try:
                abertos[0].send_keys(Keys.ESCAPE)
            except Exception:
                self.scraper.driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
            time.sleep(0.3)

    def selecionar_em_lista(self, campo, opcao) -> bool:
        """Escolhe a opção num <select> ou numa lista própria do site (abre, clica na opção visível, fecha)."""
        from selenium.webdriver.support.ui import Select

        driver = self.scraper.driver
        self.fechar_listas()
        el = driver.execute_script(JS_ACHAR_CAMPO, campo)
        if el is None:
            return False
        if el.tag_name.lower() == "select":
            Select(el).select_by_visible_text(opcao)
            return True
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        time.sleep(0.3)
        try:
            el.click()
        except Exception:
            self.fechar_listas()
            driver.execute_script("arguments[0].click();", el)
        fim, li = time.monotonic() + 3, None
        while li is None and time.monotonic() < fim:
            li = driver.execute_script(JS_OPCAO_VISIVEL, opcao)
            if li is None:
                time.sleep(0.2)
        if li is None:
            self.fechar_listas()
            return False
        try:
            li.click()
        except Exception:
            driver.execute_script("arguments[0].click();", li)
        time.sleep(0.5)
        self.fechar_listas()
        return True

    def _executar_acao(self, acao, item) -> bool:
        """Só o que o ERP já validou: clicar num botão da tela, preencher, selecionar ou esperar."""
        driver = self.scraper.driver
        tipo = acao.get("tipo")
        try:
            if tipo == "esperar":
                self.esperar(int(acao.get("segundos") or 5))
                return True
            if tipo == "selecionar":
                return self.selecionar_em_lista(acao["campo"], acao["opcao"])
            if tipo == "clicar":
                el = driver.execute_script(JS_ACHAR_CLICAVEL, acao["texto"])
                if el is None:
                    return False
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
                time.sleep(0.3)
                try:
                    el.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", el)
                time.sleep(1)
                return True
            if tipo == "preencher":
                from selenium.webdriver.common.keys import Keys
                el = driver.execute_script(JS_ACHAR_CAMPO, acao["campo"])
                if el is None:
                    return False
                valor = com_dados_do_produto(acao.get("valor"), item)
                if el.tag_name.lower() == "input":   # Enter num campo de uma linha enviaria o formulário
                    valor = " ".join(valor.split())
                driver.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].focus();", el)
                el.send_keys(Keys.CONTROL, "a")
                el.send_keys(Keys.DELETE)
                if all(ord(c) <= 0xFFFF for c in valor):
                    el.send_keys(valor)
                else:   # emoji: o ChromeDriver não digita fora do BMP
                    driver.execute_script("arguments[0].focus(); document.execCommand('insertText', false, arguments[1]);",
                                          el, valor)
                time.sleep(0.5)
                return True
        except Exception as e:
            self._log(f"Não consegui {descrever(acao)}: {e}")
        return False

    # ---------- implementadas por cada plataforma ----------
    def esta_logado(self) -> bool:
        raise NotImplementedError

    def publicar(self, item: dict) -> str | None:
        """Publica e devolve o link do anúncio, se der para descobrir."""
        raise NotImplementedError

    def excluir(self, titulo: str) -> bool:
        """Exclui o anúncio com este título. False se não achou."""
        raise NotImplementedError

    def listar(self) -> list[dict]:
        """Anúncios que estão no site: [{titulo, preco, status, imagem, link, detalhes}]."""
        raise NotImplementedError
