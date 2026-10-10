"""
OLX: publicar e excluir anúncios.

O fluxo de publicação (publicar_item e os métodos de tela daqui para baixo, até "Novos no AutoPost") veio do
app antigo "ERP AutoPost OLX" sem mudanças de lógica: ele já trata as telas da OLX (boas-vindas, categoria
Produtos, fotos com aviso de qualidade, campos obrigatórios, OLX Pay/frete grátis, peso, destaque, modal de
saída...). O que é novo está no fim: verificação de login, publicar() e excluir() de um anúncio específico.
"""
import time

from .base import ParadaSolicitada, Plataforma, SkipItemException, normalizar  # noqa: F401

URL_ANUNCIOS = "https://conta.olx.com.br/anuncios/publicados"


class Olx(Plataforma):
    nome = "olx"
    rotulo = "OLX"
    url_login = "https://conta.olx.com.br/acesso"

    # ===================== Fluxo trazido do app antigo =====================

    def _normalize_olx_body_text(self):
        from selenium.webdriver.common.by import By
        raw = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
        return ' '.join(raw.split())

    def _olx_raw_visible_text_com_iframes(self):
        """Texto visível do documento + iframes (ex.: olx-pay.olx.com.br renderiza no frame)."""
        from selenium.webdriver.common.by import By

        parts = []
        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass

        def _grab_body():
            try:
                t = self.scraper.driver.find_element(By.TAG_NAME, "body").text
                if t and t.strip():
                    parts.append(t.strip())
            except Exception:
                pass

        _grab_body()
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            frames = []
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                _grab_body()
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return "\n".join(parts)

    def _normalize_olx_snapshot(self):
        """Snapshot para comparar mudança de tela (inclui texto dentro de iframes)."""
        try:
            raw = self._olx_raw_visible_text_com_iframes()
            return " ".join(raw.lower().split())
        except Exception:
            return ""

    def _olx_try_click_continuar_finalizar_em_iframes(self):
        """Clica Continuar / Finalizar no documento principal ou dentro de iframes."""
        from selenium.webdriver.common.by import By

        def _click_no_contexto():
            xpaths = (
                '//span[text()="Continuar"]/ancestor::button',
                '//button[contains(.,"Continuar")]',
                '//button[contains(.,"Finalizar anúncio")]',
                '//button[contains(.,"Finalizar anuncio")]',
                '//button[contains(.,"Finalizar")]',
            )
            for xp in xpaths:
                try:
                    for el in self.scraper.driver.find_elements(By.XPATH, xp):
                        try:
                            if el.is_displayed():
                                el.click()
                                return True
                        except Exception:
                            try:
                                self.scraper.driver.execute_script("arguments[0].click();", el)
                                return True
                            except Exception:
                                pass
                except Exception:
                    pass
            return False

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        if _click_no_contexto():
            return True
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            frames = []
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                if _click_no_contexto():
                    self.scraper.driver.switch_to.default_content()
                    return True
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return False

    def _retry_continuar_com_iframe(self):
        if self._perform_continuar_click():
            return
        self._olx_try_click_continuar_finalizar_em_iframes()

    def wait_for_olx_body_min_length(self, min_len=50, context="", max_wait=120):
        """Após navegação: verifica a cada 1s se o corpo da página tem conteúdo suficiente."""
        t0 = time.monotonic()
        stall = t0
        while time.monotonic() - t0 < max_wait:
            time.sleep(1)
            try:
                cur = self._normalize_olx_body_text()
            except Exception:
                continue
            if len(cur) >= min_len:
                return True
            if time.monotonic() - stall >= 10:
                self.log(f"Página ainda carregando ({context})...")
                stall = time.monotonic()
        self.log(f"AVISO: tempo máximo de carregamento ({context}).")
        return False

    def _olx_na_etapa_titulo(self):
        """Detecta a tela de título do anúncio (evita falso 'sem mudança' se o texto do body for parecido)."""
        from selenium.webdriver.common.by import By

        try:
            low = self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
        except Exception:
            low = ""
        if "título do anúncio" in low or "como vai ser o título" in low:
            return True
        for el in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input#subject'):
            try:
                if el.is_displayed():
                    return True
            except Exception:
                continue
        return False

    def olx_wait_page_changed_from(self, baseline, context, retry_fn=None, max_stall_cycles=15, success_if=None):
        """A cada 1s compara o texto da página com baseline; se 10s sem mudança, chama retry_fn e atualiza baseline.
        baseline deve ser o texto ANTES da ação que dispara a transição. success_if, se definido, encerra a espera quando verdadeiro."""
        stall_start = time.monotonic()
        stall_cycles = 0
        while True:
            time.sleep(1)
            try:
                if success_if and success_if():
                    return
                cur = self._normalize_olx_snapshot()
            except Exception:
                continue
            if cur != baseline:
                return
            if time.monotonic() - stall_start < 10:
                continue
            stall_cycles += 1
            if stall_cycles > max_stall_cycles:
                self.log(f"AVISO: parei de esperar mudança de tela ({context}) após várias repetições.")
                return
            self.log(f"Página sem mudança por 10s ({context}). Relendo e repetindo ação...")
            if retry_fn:
                try:
                    retry_fn()
                except Exception as e:
                    self.log(f"Erro ao repetir ação ({context}): {e}")
            try:
                baseline = self._normalize_olx_snapshot()
            except Exception:
                pass
            stall_start = time.monotonic()

    def _olx_poll_find_first(self, find_fn, context, retry_fn=None, max_seconds=90, stall_seconds=10):
        """Procura elemento a cada 1s; a cada stall_seconds sem sucesso chama retry_fn."""
        t0 = time.monotonic()
        last_stall = t0
        while time.monotonic() - t0 < max_seconds:
            time.sleep(1)
            try:
                el = find_fn()
                if el is not None:
                    return el
            except Exception:
                pass
            if retry_fn and time.monotonic() - last_stall >= stall_seconds:
                self.log(f"Ainda aguardando elemento ({context}), tentando ação auxiliar...")
                try:
                    retry_fn()
                except Exception as e:
                    self.log(f"Erro no retry ({context}): {e}")
                last_stall = time.monotonic()
        return None

    def _perform_continuar_click(self):
        """Executa um clique em Continuar (vários métodos). Não registra log de início."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        try:
            btns = self.scraper.driver.find_elements(
                By.XPATH, '//span[text()="Continuar"]/ancestor::button'
            )
            if btns:
                btns[0].click()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Continuar")]')
            if btns:
                ActionChains(self.scraper.driver).move_to_element(btns[0]).click().perform()
                return True
        except Exception:
            pass
        try:
            self.scraper.element_click_by_xpath('//button[contains(.,"Continuar")]')
            return True
        except Exception:
            pass
        return False

    def _perform_comecar_anuncio_click(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        try:
            btns = self.scraper.driver.find_elements(
                By.XPATH, '//span[contains(text(),"Começar meu anúncio")]/ancestor::button'
            )
            if btns:
                btns[0].click()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Começar meu anúncio")]')
            if btns:
                ActionChains(self.scraper.driver).move_to_element(btns[0]).click().perform()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Começar meu anúncio")]')
            if btns:
                self.scraper.driver.execute_script("arguments[0].click();", btns[0])
                return True
        except Exception:
            pass
        return False

    def _retry_click_produtos_categoria(self):
        from selenium.webdriver.common.by import By
        try:
            produtos_btn2 = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[aria-label*="Produtos"]')
            if produtos_btn2:
                self.scraper.driver.execute_script("arguments[0].click();", produtos_btn2[0])
                return
        except Exception:
            pass
        try:
            self.scraper.element_click_by_xpath('//span[contains(text(),"Produtos")]/ancestor::button')
        except Exception:
            pass

    def _olx_body_text_lower(self):
        from selenium.webdriver.common.by import By

        try:
            return self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
        except Exception:
            return ""

    def _log_corpo_pagina_olx(self, motivo, max_total=20000, chunk_size=1800):
        """Grava no log o texto visível do body (em blocos), para depuração quando a tela não é reconhecida."""
        from selenium.webdriver.common.by import By

        try:
            url = self.scraper.driver.current_url
        except Exception:
            url = "(url indisponível)"
        try:
            raw = self._olx_raw_visible_text_com_iframes()
            if not raw.strip():
                raw = self.scraper.driver.find_element(By.TAG_NAME, "body").text
        except Exception as e:
            self.log(f"{motivo} — não foi possível ler o corpo da página: {e} | URL: {url}")
            return
        raw = raw.strip()
        if not raw:
            self.log(f"{motivo} — corpo da página vazio. URL: {url}")
            return
        total = len(raw)
        limite = min(total, max_total)
        if total > max_total:
            self.log(
                f"{motivo} — texto da página ({total} caracteres; "
                f"primeiros {max_total} no log). URL: {url}"
            )
        else:
            self.log(f"{motivo} — texto da página ({total} caracteres). URL: {url}")
        trecho = raw[:limite]
        parte = 1
        for i in range(0, len(trecho), chunk_size):
            bloco = trecho[i : i + chunk_size]
            self.log(f"  <<< página parte {parte} >>>\n{bloco}")
            parte += 1

    def _olx_esta_na_etapa_fotos(self, low=None):
        """Textos da tela de upload (inclui cópias novas da OLX)."""
        if low is None:
            low = self._olx_body_text_lower()
        return (
            "adicione algumas fotos" in low
            or "arraste as fotos" in low
            or "clique para adicionar fotos" in low
            or "adicione algumas fotos do seu anúncio" in low
            or ("perfeito" in low and "adicione" in low and "fotos" in low and "anúncio" in low)
            or "até 6 fotos nos formatos" in low
            or "ate 6 fotos nos formatos" in low
            or ("até 6 fotos" in low and "formatos" in low)
        )

    def _olx_precisa_reenviar_fotos(self, low=None):
        """OLX indica que nenhuma foto válida foi anexada — é preciso enviar de novo."""
        if low is None:
            low = self._olx_body_text_lower()
        return (
            "você precisa adicionar pelo menos uma foto de qualidade" in low
            or "voce precisa adicionar pelo menos uma foto de qualidade" in low
            or "pelo menos uma foto de qualidade para publicar" in low
        )

    def olx_reenviar_fotos_se_aviso_qualidade(self, upload_fn, max_tentativas=8):
        """Após upload, se a página mostrar o aviso de falta de foto de qualidade, chama upload_fn novamente."""
        for t in range(max_tentativas):
            time.sleep(1)
            low = self._olx_body_text_lower()
            if not self._olx_precisa_reenviar_fotos(low):
                return True
            self.log(
                "AVISO: OLX indica que as fotos não foram anexadas "
                "(falta foto de qualidade). Reenviando imagens…"
            )
            try:
                upload_fn()
            except Exception as e:
                self.log(f"Erro ao reanexar fotos ({t + 1}/{max_tentativas}): {e}")
        if self._olx_precisa_reenviar_fotos():
            self.log("AVISO: mensagem de falta de foto persiste após várias tentativas de reenvio.")
            return False
        return True

    def olx_wait_left_photo_step(self, context="processamento pós-fotos", retry_upload_fn=None, max_cycles=20):
        """A cada 1s verifica se saiu da tela de fotos; aviso de qualidade dispara reenvio na hora;
        a cada 10s ainda na etapa, repete retry_upload_fn."""
        stall_start = time.monotonic()
        cycles = 0
        while cycles < max_cycles:
            time.sleep(1)
            low = self._olx_body_text_lower()
            if self._olx_precisa_reenviar_fotos(low) and retry_upload_fn:
                self.log("Tela de fotos: aviso de qualidade — reenviando anexos agora.")
                try:
                    retry_upload_fn()
                except Exception as e:
                    self.log(f"Erro no retry de fotos: {e}")
                stall_start = time.monotonic()
                continue
            if not self._olx_esta_na_etapa_fotos(low):
                return True
            if time.monotonic() - stall_start < 10:
                continue
            cycles += 1
            self.log(f"Ainda na etapa de fotos por 10s ({context}). Repetindo ação...")
            if retry_upload_fn:
                try:
                    retry_upload_fn()
                except Exception as e:
                    self.log(f"Erro no retry de fotos: {e}")
            stall_start = time.monotonic()
        return False

    def _tentar_com_retry(self, func, contexto, max_tentativas=3):
        """Tenta executar uma ação com retry, relendo o site a cada tentativa.
        Após todas as tentativas falharem, registra o conteúdo da página no log
        e levanta SkipItemException para pular o item atual."""
        from selenium.webdriver.common.by import By

        ultima_excecao = None
        for tentativa in range(1, max_tentativas + 1):
            try:
                if tentativa > 1:
                    self.log(f"[Retry {tentativa}/{max_tentativas}] Aguardando e retentando '{contexto}'...")
                    time.sleep(4)
                return func()
            except Exception as e:
                ultima_excecao = e
                self.log(f"[Tentativa {tentativa}/{max_tentativas}] Falhou em '{contexto}': {e}")
                if tentativa < max_tentativas:
                    time.sleep(2)

        self.log(f"[FALHA CRÍTICA] '{contexto}' falhou após {max_tentativas} tentativas.")
        try:
            page_content = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
            self.log(f"[CONTEÚDO DA PÁGINA]:\n{page_content[:1000]}")
        except Exception:
            self.log("[CONTEÚDO DA PÁGINA]: Não foi possível obter o conteúdo.")
        raise SkipItemException(f"'{contexto}' falhou após {max_tentativas} tentativas") from ultima_excecao

    def publicar_item(self, item):
        """Publica um item na OLX"""
        from selenium.webdriver.common.by import By

        # guarda o título: os campos de características (Marca, Modelo, VRAM...) são escolhidos por ele
        self._current_titulo = item.get('titulo', '')

        # 1. Navegar para página de criação de anúncio
        self.log("Navegando para página de criação de anúncio...")
        self.scraper.go_to_page('https://www2.olx.com.br/desapega?lis=cta_header_home')
        self.wait_for_olx_body_min_length(50, "desapega / criar anúncio")

        # 1.1. Tela de boas-vindas ("Anuncie de graça", e desde out/2026 "Anuncie em poucos minutos com total
        # segurança"): reconhece pelo botão "Começar meu anúncio", não pelo texto, que a OLX muda.
        try:
            page_text_inicial = self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
            tem_botao_comecar = bool(self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(normalize-space(.),"Começar meu anúncio")]'))
            if tem_botao_comecar or "anuncie de gra" in page_text_inicial or "anuncie em poucos minutos" in page_text_inicial:
                self.log("Tela de boas-vindas da OLX detectada! Clicando em 'Começar meu anúncio'...")
                snap = self._normalize_olx_body_text()
                if self._perform_comecar_anuncio_click():
                    self.log("Botão 'Começar meu anúncio' clicado!")
                else:
                    self.log("Botão 'Começar meu anúncio' não encontrado na tela inicial.")
                self.olx_wait_page_changed_from(
                    snap, "após Começar meu anúncio", retry_fn=self._perform_comecar_anuncio_click
                )
        except Exception as e:
            self.log(f"Erro ao verificar tela inicial: {e}")

        # 2. Clicar em "Produtos"
        self.log("Aguardando página carregar...")
        self.wait_for_olx_body_min_length(40, "grade de categorias", max_wait=90)
        self.log("Selecionando categoria Produtos...")

        def _find_prod_btn():
            els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'button[aria-label*="Produtos"]')
            for el in els:
                try:
                    if el.is_displayed():
                        return el
                except Exception:
                    continue
            return None

        produtos_btn = self._olx_poll_find_first(
            _find_prod_btn, "botão Produtos", retry_fn=self._retry_click_produtos_categoria, max_seconds=90
        )
        # Snapshot ANTES do clique: se capturarmos depois, a SPA pode já estar na tela do título e a espera nunca vê "mudança".
        try:
            snap_antes_produtos = self._normalize_olx_body_text()
        except Exception:
            snap_antes_produtos = ""
        if produtos_btn:
            try:
                produtos_btn.click()
                self.log("Categoria Produtos selecionada!")
            except Exception:
                try:
                    self.scraper.driver.execute_script("arguments[0].click();", produtos_btn)
                    self.log("Categoria Produtos selecionada!")
                except Exception as e:
                    self.log(f"Erro ao clicar Produtos: {e}")
        else:
            self.log("Tentando método alternativo para selecionar categoria...")
            try:
                self.scraper.element_click_by_xpath('//span[contains(text(),"Produtos")]/ancestor::button')
                self.log("Categoria Produtos selecionada (método alternativo)!")
            except Exception as e2:
                self.log(f"Erro ao selecionar categoria: {e2}")
        try:
            if self._olx_na_etapa_titulo():
                self.log("Tela de título já detectada após Produtos.")
            else:
                self.olx_wait_page_changed_from(
                    snap_antes_produtos,
                    "após selecionar Produtos",
                    retry_fn=self._retry_click_produtos_categoria,
                    success_if=self._olx_na_etapa_titulo,
                )
        except Exception as e:
            self.log(f"Espera pós-Produtos: {e}")

        # 3. Preencher título (com retry de categoria se falhar)
        self.log(f"Preenchendo título: {item['titulo']}")
        titulo_preenchido = False

        def _find_subject():
            els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input#subject')
            for el in els:
                try:
                    if el.is_displayed():
                        return el
                except Exception:
                    continue
            return None

        for tentativa in range(3):
            try:
                titulo_input = _find_subject()
                if not titulo_input:
                    titulo_input = self._olx_poll_find_first(
                        _find_subject,
                        "campo título #subject",
                        retry_fn=self._retry_click_produtos_categoria,
                        max_seconds=45,
                    )
                if not titulo_input:
                    raise RuntimeError("input#subject não encontrado")
                titulo_input.clear()
                time.sleep(0.3)
                titulo_input.send_keys(item['titulo'])
                time.sleep(0.5)
                valor_atual = titulo_input.get_attribute('value')
                if valor_atual and len(valor_atual.strip()) > 0:
                    self.log(f"Título preenchido e verificado: {valor_atual}")
                    titulo_preenchido = True
                    break
                self.log("AVISO: Título não foi inserido corretamente (valor vazio), tentando novamente...")
                self.scraper.driver.execute_script("arguments[0].value = '';", titulo_input)
                self.scraper.driver.execute_script(
                    "arguments[0].value = arguments[1];", titulo_input, item['titulo']
                )
                self.scraper.driver.execute_script(
                    "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", titulo_input
                )
                time.sleep(0.5)
                valor_atual = titulo_input.get_attribute('value')
                if valor_atual and len(valor_atual.strip()) > 0:
                    self.log(f"Título preenchido via JS: {valor_atual}")
                    titulo_preenchido = True
                    break
                self.log("AVISO: Falha ao preencher via JS também...")
            except Exception as e:
                if tentativa < 2:
                    self.log(
                        f"Título não encontrado, tentando clicar em Produtos novamente... (tentativa {tentativa + 1})"
                    )
                    try:
                        produtos_elem = self.scraper.driver.find_elements(
                            By.XPATH,
                            '//*[contains(text(),"Produtos") and (self::button or self::a or self::div or self::span)]',
                        )
                        if produtos_elem:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", produtos_elem[0])
                            self.log("Categoria Produtos clicada (JS)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                        produtos_btn2 = self.scraper.driver.find_elements(
                            By.CSS_SELECTOR, '[aria-label*="Produtos"]'
                        )
                        if produtos_btn2:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", produtos_btn2[0])
                            self.log("Categoria Produtos clicada (aria-label + JS)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                        card = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Celulares")]/..')
                        if card:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", card[0])
                            self.log("Categoria Produtos clicada (card)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                    except Exception as click_error:
                        self.log(f"Erro no clique: {click_error}")
                else:
                    self.log(f"Erro ao preencher título: {e}")

        if not titulo_preenchido:
            try:
                inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
                if inputs:
                    inputs[0].clear()
                    time.sleep(0.3)
                    inputs[0].send_keys(item['titulo'])
                    time.sleep(0.5)
                    valor_atual = inputs[0].get_attribute('value')
                    if valor_atual and len(valor_atual.strip()) > 0:
                        self.log(f"Título preenchido (fallback) e verificado: {valor_atual}")
                        titulo_preenchido = True
                    else:
                        self.scraper.driver.execute_script(
                            "arguments[0].value = arguments[1];", inputs[0], item['titulo']
                        )
                        self.scraper.driver.execute_script(
                            "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", inputs[0]
                        )
                        self.log("Título preenchido via JS (fallback)!")
            except Exception as e:
                self.log(f"Erro no fallback de título: {e}")

        # 4. Clicar em Continuar (espera mudança de tela a cada 1s; a cada 10s repete clique)
        self.clicar_continuar("após título")

        # 5. Upload de imagens
        self.log("Fazendo upload das imagens...")
        imagens_path = '\n'.join(item['imagens'])

        def _upload_imagens():
            def _inp():
                els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
                return els[0] if els else None

            inp = self._olx_poll_find_first(_inp, "input upload imagens", max_seconds=90)
            if not inp:
                raise RuntimeError("input file não encontrado")
            inp.send_keys(imagens_path)
            self.log(f"Imagens enviadas: {len(item['imagens'])} arquivo(s)")

        try:
            snap_antes_upload = self._normalize_olx_body_text()
        except Exception:
            snap_antes_upload = ""
        self._tentar_com_retry(_upload_imagens, "upload de imagens")
        try:
            self.olx_wait_page_changed_from(
                snap_antes_upload, "após selecionar arquivos (upload)", retry_fn=_upload_imagens
            )
        except Exception as e:
            self.log(f"Espera pós-upload: {e}")

        self.olx_reenviar_fotos_se_aviso_qualidade(_upload_imagens)

        self.log("Aguardando resposta do site após envio das imagens...")
        # 6. Continuar após imagens + 7. sair da etapa de fotos / IA
        self.clicar_continuar("após imagens")
        self.log("Aguardando OLX processar dados com IA...")

        def _retry_fotos():
            try:
                file_inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
                if file_inputs and item.get('imagens'):
                    file_inputs[0].send_keys(imagens_path)
                    self.log("Imagens reenviadas (retry)!")
            except Exception as ex:
                self.log(f"Retry fotos: {ex}")
            self._perform_continuar_click()

        if not self.olx_wait_left_photo_step("sair da etapa de fotos / IA", retry_upload_fn=_retry_fotos):
            self.log("AVISO: possível permanência na etapa de fotos; seguindo fluxo.")

        # 8. Preencher campos obrigatórios (listbox/select)
        self.log("Preenchendo campos obrigatórios...")
        self.preencher_campos_obrigatorios()

        # 9. Clicar em Continuar após listbox
        self.clicar_continuar("após campos")

        # 10. Preencher descrição
        self.log("Preenchendo descrição...")
        self.preencher_descricao(item.get('descricao', ''))

        # 11. Clicar em Continuar após descrição
        self.clicar_continuar("após descrição")

        # 12. Preencher preço
        self.log("Preenchendo preço: R$ " + str(item['preco']))
        self._current_preco = item['preco']
        self.preencher_preco(item['preco'])

        # 13. Clicar em Continuar após preço
        self.clicar_continuar("após preço")

        self.processar_telas_dinamicas()

        self.log("Anúncio publicado com sucesso!")

    def processar_telas_dinamicas(self):
        """Telas após o preço: ordem típica OLX (informativa → envio → endereço → peso → destaque → Finalizar anúncio).
        O fluxo só encerra de forma concluída ao publicar via botão Finalizar anúncio (texto na página)."""
        from selenium.webdriver.common.by import By

        max_tentativas = 25
        tentativas = 0
        price_retry_count = 0

        while tentativas < max_tentativas:
            tentativas += 1

            if self.fechar_modal_saida():
                continue

            try:
                current_url = self.scraper.driver.current_url.lower()
            except Exception:
                current_url = ""
            try:
                page_text = self._normalize_olx_snapshot()
            except Exception:
                page_text = ""
            if not page_text.strip() and (
                "olx-pay.olx.com.br" in current_url
                or "olx-pay" in current_url
                or ("aderir" in current_url and "olx" in current_url)
            ):
                self.log("Conteúdo vazio no body principal; aguardando iframe (OLX Pay)…")
                time.sleep(2)
                page_text = self._normalize_olx_snapshot()

            self.log(f"Processando tela {tentativas}...")

            # Modal OLX Pay: "Qual foi o motivo para não oferecer Frete grátis?" (antes do modal genérico)
            if (
                ("qual foi o motivo" in page_text and "frete" in page_text and "não oferecer" in page_text)
                or "não oferecer frete grátis" in page_text
                or ("motivo" in page_text and "não oferecer" in page_text and "frete grátis" in page_text)
            ):
                self.log("Modal OLX Pay: motivo para não oferecer frete grátis.")
                self._olx_modal_motivo_frete_gratis_caro()
                continue

            if "qual foi o motivo" in page_text or "não ter escolhido" in page_text:
                self.log("Modal de Motivo detectado!")
                self.tratar_modal_motivo()
                continue

            # 1) Escolha do endereço de envio (só Continuar — antes de qualquer regra genérica com "entrega")
            elif (
                ("escolha o endereço" in page_text and "envio" in page_text)
                or "endereço de envio" in page_text
                or ("usaremos o endereço" in page_text and "entrega" in page_text)
            ):
                self.log("Tela: escolha do endereço de envio.")
                self.clicar_continuar("após endereço de envio")
                continue

            # 2) Envie com segurança pela OLX
            elif "envie com segurança" in page_text:
                self.log("Tela: Envie com segurança pela OLX.")
                self.clicar_continuar("após envie com segurança")
                continue

            # 2b) OLX Pay — "Ofereça frete grátis ao comprador": Não obrigado → modal → "R$ 27,90 é caro" → Continuar
            elif (
                ("olx-pay" in current_url and "aderir" in current_url)
                or "olx-pay.olx.com.br" in current_url
            ) and (
                "ofereça frete grátis" in page_text
                or "frete grátis ao comprador" in page_text
                or ("frete grátis" in page_text and "comprador" in page_text)
                or "sim, quero oferecer" in page_text
            ):
                self.log("OLX Pay: oferta de frete grátis ao comprador.")
                self._olx_aceitar_cookies_se_existir()
                self.processar_tela_olx_pay_frete_gratis()
                time.sleep(1)
                self._olx_aceitar_cookies_se_existir()
                if not self._olx_try_click_continuar_finalizar_em_iframes():
                    self.clicar_continuar("após OLX Pay frete grátis")
                else:
                    time.sleep(1)
                continue

            # 3) Informativa pagamento / evolução ("Evoluímos o jeito de vender", etc.)
            elif (
                "evoluímos" in page_text
                or "protegemos a sua venda" in page_text
                or "recebe online" in page_text
                or "pagamento pela olx" in page_text
                or "milhões de compradores" in page_text
                or ("grátis pra você" in page_text and "sem taxas" in page_text)
                or ("é grátis" in page_text and "pra você" in page_text)
            ):
                self.log("Tela informativa (pagamento / evolução OLX).")
                self.clicar_continuar("tela informativa pagamento")
                continue

            # 3b) OLX Pay (URL aderir) — fallback (exceto tela de frete grátis já tratada em 2b)
            elif ("olx-pay.olx.com.br" in current_url or (
                "olx-pay" in current_url and "aderir" in current_url
            )) and not (
                "ofereça frete grátis" in page_text
                or "frete grátis ao comprador" in page_text
                or ("frete grátis" in page_text and "comprador" in page_text)
            ):
                self.log("Tela OLX Pay (aderir) — clicando Continuar no frame se necessário.")
                self._olx_aceitar_cookies_se_existir()
                if not self._olx_try_click_continuar_finalizar_em_iframes():
                    self.clicar_continuar("OLX Pay aderir")
                else:
                    time.sleep(1)
                continue

            # 4) Preço (retry)
            elif "hora de definir o preço" in page_text or "você precisa definir um preço" in page_text:
                price_retry_count += 1
                if price_retry_count > 3:
                    self.log("AVISO: Preço não aceito após 3 tentativas no loop, ignorando tela...")
                    price_retry_count = 0
                    break
                self.log(f"Tela de Preço detectada! Tentando preencher novamente ({price_retry_count}/3)...")
                preco = getattr(self, '_current_preco', None)
                if preco is not None:
                    self.preencher_preco(preco)
                    time.sleep(1)
                self.clicar_continuar("após preço retry")
                continue

            # 5) Peso (listbox → preferir 1 kg)
            elif "peso do produto" in page_text or "informe o peso" in page_text:
                self.log("Tela de Peso detectada!")
                preencheu = self.preencher_peso_se_existir()
                if preencheu:
                    self.clicar_continuar("após peso")
                else:
                    self.log("Peso não encontrado, tentando continuar...")
                    self.clicar_continuar("tela peso")
                continue

            # 6) Frete / parcelamento / “Não, obrigado” (sem confundir com endereço de envio)
            elif (
                "frete" in page_text
                or "parcelamento" in page_text
                or "não, obrigado" in page_text
                or ("ofereça" in page_text and "envio" in page_text)
            ) and "escolha o endereço" not in page_text and "endereço de envio" not in page_text:
                self.log("Tela de Frete / opções de envio detectada!")
                self.processar_tela_frete()
                self.clicar_continuar("após frete")
                continue

            # 7) Tela final: só trata como conclusão com texto "finalizar anúncio" (não usa "finalizar" solto)
            elif "finalizar anúncio" in page_text:
                self.log("Tela final: Finalizar anúncio.")
                self.selecionar_sem_destacar()
                time.sleep(1)
                self.finalizar_anuncio()
                return

            # 8) Destaque / planos (ex.: "Aumente as suas chances de vender mais rápido!")
            elif (
                "aumente" in page_text
                or "chances de vender" in page_text
                or "anunciar sem destacar" in page_text
            ):
                self.log("Tela de Destaque / planos detectada!")
                self.selecionar_sem_destacar()
                time.sleep(1)
                self.finalizar_anuncio()
                return

            # 9) CEP / localização (sem "endereço" genérico para não colidir com endereço de envio)
            elif "cep" in page_text or "localização" in page_text:
                self.log("Tela de Localização detectada - apenas continuar")
                self.clicar_continuar("após localização")
                continue

            # 10) Outras informativas
            elif (
                "dica" in page_text
                or "informação" in page_text
                or "garantia da olx" in page_text
            ):
                self.log("Tela informativa detectada - apenas continuar")
                self.clicar_continuar("tela informativa")
                continue

            # 11) Voltou para fotos
            elif (
                "adicione algumas fotos" in page_text
                or "clique para adicionar fotos" in page_text
                or "arraste as fotos" in page_text
            ):
                self.log("ERRO: Voltou para tela de fotos! Tentando continuar...")
                self.clicar_continuar("após fotos")
                continue

            else:
                self.log("Tela não identificada - tentando Continuar ou Finalizar anúncio...")
                self._log_corpo_pagina_olx("[DEBUG] Conteúdo encontrado na página (tela não reconhecida)")
                if not self.clicar_continuar_ou_finalizar():
                    try:
                        url_saida = self.scraper.driver.current_url
                    except Exception:
                        url_saida = "?"
                    self.log(
                        "Não encontrou botão Continuar nem Finalizar anúncio; saindo do loop. "
                        f"URL: {url_saida}"
                    )
                    break

        self.log(f"Loop finalizado após {tentativas} tentativas")

    def _olx_for_each_frame(self, fn):
        """Executa fn() no documento principal e em cada iframe; retorna True se fn retornar True."""
        from selenium.webdriver.common.by import By

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        try:
            if fn():
                return True
        except Exception:
            pass
        frames = []
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            pass
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                if fn():
                    self.scraper.driver.switch_to.default_content()
                    return True
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return False

    def _olx_aceitar_cookies_se_existir(self):
        """Fecha banner de privacidade/cookies se estiver cobrindo botões (ex.: Continuar)."""
        from selenium.webdriver.common.by import By

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        try:
            for el in self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Aceitar")] | //a[contains(.,"Aceitar")]'
            ):
                try:
                    if el.is_displayed():
                        self.scraper.driver.execute_script("arguments[0].click();", el)
                        self.log("Cookies/privacidade: Aceitar clicado.")
                        time.sleep(0.6)
                        return
                except Exception:
                    pass
        except Exception:
            pass

    def _olx_modal_motivo_frete_gratis_caro(self):
        """Modal 'motivo para não oferecer frete grátis': opção R$ 27,90 caro + Confirmar."""
        from selenium.webdriver.common.by import By

        def _clicar_opcao_caro():
            xpaths = (
                '//*[contains(text(),"27,90") and contains(text(),"caro")]',
                '//*[contains(text(),"R$ 27")]',
                '//*[contains(text(),"é caro para mim")]',
                '//*[contains(text(),"e caro para mim")]',
                '//label[contains(.,"27,90")]',
            )
            for xp in xpaths:
                for el in self.scraper.driver.find_elements(By.XPATH, xp):
                    try:
                        if not el.is_displayed():
                            continue
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.15)
                        el.click()
                        self.log("Motivo selecionado: preço do frete grátis é caro.")
                        return True
                    except Exception:
                        try:
                            self.scraper.driver.execute_script("arguments[0].click();", el)
                            self.log("Motivo selecionado (JS): preço do frete grátis é caro.")
                            return True
                        except Exception:
                            pass
            return False

        def _clicar_confirmar():
            for btn in self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Confirmar")]'
            ):
                try:
                    if btn.is_displayed():
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", btn
                        )
                        time.sleep(0.1)
                        btn.click()
                        self.log("Modal frete grátis: Confirmar clicado.")
                        return True
                except Exception:
                    try:
                        self.scraper.driver.execute_script("arguments[0].click();", btn)
                        self.log("Modal frete grátis: Confirmar clicado (JS).")
                        return True
                    except Exception:
                        pass
            return False

        self._olx_for_each_frame(_clicar_opcao_caro)
        time.sleep(0.4)
        self._olx_for_each_frame(_clicar_confirmar)
        time.sleep(0.8)

    def processar_tela_olx_pay_frete_gratis(self):
        """Tela OLX Pay 'Ofereça frete grátis': Não obrigado → modal motivo (caro) → confirmar."""
        from selenium.webdriver.common.by import By

        def _clicar_nao_obrigado():
            for xp in (
                '//*[contains(text(),"Não, obrigado")]',
                '//*[contains(text(),"Nao, obrigado")]',
                '//label[contains(.,"Não, obrigado")]',
                '//span[contains(text(),"Não, obrigado")]/ancestor::label',
            ):
                for el in self.scraper.driver.find_elements(By.XPATH, xp):
                    try:
                        if not el.is_displayed():
                            continue
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.15)
                        el.click()
                        return True
                    except Exception:
                        try:
                            self.scraper.driver.execute_script("arguments[0].click();", el)
                            return True
                        except Exception:
                            pass
            return False

        if self._olx_for_each_frame(_clicar_nao_obrigado):
            self.log("'Não, obrigado' clicado (frete grátis OLX Pay).")
        else:
            self.log("AVISO: não encontrei 'Não, obrigado' na tela de frete grátis OLX Pay.")
        time.sleep(1.2)
        self._olx_modal_motivo_frete_gratis_caro()

    def processar_tela_frete(self):
        """Processa a tela de frete - seleciona entrega em mãos ou desmarca frete grátis"""
        from selenium.webdriver.common.by import By
        
        try:
            # Opção 1: Tentar selecionar "Não, obrigado" (tela de frete grátis e parcelamento)
            nao_obrigado = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não, obrigado")]')
            if nao_obrigado:
                nao_obrigado[0].click()
                self.log("'Não, obrigado' selecionado!")
                time.sleep(2)
                
                # Tratar modal "Qual foi o motivo..." - selecionar última opção
                try:
                    # Selecionar "Não tenho interesse"
                    nao_interesse = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não tenho interesse")]')
                    if nao_interesse:
                        nao_interesse[0].click()
                        self.log("'Não tenho interesse' selecionado!")
                        time.sleep(1)
                        
                        # Clicar em Confirmar
                        confirmar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Confirmar")]')
                        if confirmar:
                            confirmar[0].click()
                            self.log("Modal confirmado!")
                            time.sleep(2)
                    else:
                        self._olx_modal_motivo_frete_gratis_caro()
                except Exception:
                    self._olx_modal_motivo_frete_gratis_caro()
                return
            
            # Opção 2: Tentar selecionar "Entrega em mãos"
            entrega_maos = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Entrega em mãos")]')
            if entrega_maos:
                entrega_maos[0].click()
                self.log("Entrega em mãos selecionada!")
                return
            
            self.log("Tela de frete sem ação necessária")
        except Exception:
            self.log("Erro ao processar tela de frete")

    def tratar_modal_motivo(self):
        """Trata o modal 'Qual foi o motivo para não ter escolhido...'"""
        from selenium.webdriver.common.by import By
        
        try:
            time.sleep(2)  # Aguardar modal carregar completamente
            
            # Buscar elemento com texto "Não tenho interesse" - mesmo método usado em outros lugares
            nao_interesse = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não tenho interesse")]')
            self.log(f"Encontrados {len(nao_interesse)} elementos 'Não tenho interesse'")
            
            if nao_interesse:
                # Clicar no primeiro elemento encontrado (como funciona nos outros modais)
                nao_interesse[0].click()
                self.log("'Não tenho interesse' selecionado!")
                time.sleep(1)
                
                # Clicar em Confirmar
                confirmar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Confirmar")]')
                if confirmar:
                    confirmar[0].click()
                    self.log("Modal confirmado!")
                    time.sleep(2)
        except Exception as e:
            self.log(f"Erro ao tratar modal: {e}")

    def clicar_continuar_ou_finalizar(self):
        """Tenta Continuar; se houver botão explícito Finalizar anúncio, clica nele (fim do fluxo)."""
        from selenium.webdriver.common.by import By

        try:
            final_anuncio = self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Finalizar anúncio") or contains(.,"Finalizar anuncio")]'
            )
            if final_anuncio:
                try:
                    final_anuncio[0].click()
                    self.log("Finalizar anúncio clicado!")
                    return True
                except Exception:
                    self.scraper.driver.execute_script("arguments[0].click();", final_anuncio[0])
                    self.log("Finalizar anúncio clicado (JS)!")
                    return True

            finalizar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Finalizar")]')
            if finalizar:
                finalizar[0].click()
                self.log("Finalizar clicado!")
                return True

            continuar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Continuar")]')
            if continuar:
                continuar[0].click()
                self.log("Continuar clicado!")
                return True

            if self._olx_try_click_continuar_finalizar_em_iframes():
                self.log("Continuar/Finalizar clicado (iframe ou contexto alternativo)!")
                return True

            return False
        except Exception:
            return False

    def fechar_modal_saida(self):
        """Fecha o modal de confirmação de saída se aparecer"""
        from selenium.webdriver.common.by import By
        
        try:
            # Verificar se há modal de saída
            modal_text = ["Tem certeza que deseja sair", "deseja sair", "quero sair"]
            page_text = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
            
            for text in modal_text:
                if text.lower() in page_text.lower():
                    self.log("Modal de saída detectado! Clicando em 'Não, vou continuar'...")
                    
                    # Tentar clicar em "Não, vou continuar"
                    try:
                        nao_btn = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Não, vou continuar")]')
                        nao_btn.click()
                        self.log("Modal fechado!")
                        time.sleep(2)
                        return True
                    except Exception:
                        # Tentar botão com texto similar
                        try:
                            nao_btn = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Não")]')
                            nao_btn.click()
                            self.log("Modal fechado (alternativo)!")
                            time.sleep(2)
                            return True
                        except Exception:
                            pass
                    break
            return False
        except Exception:
            return False

    def clicar_continuar(self, contexto=""):
        self.log("Clicando em Continuar " + contexto + "...")
        url_antes = self.scraper.driver.current_url
        try:
            snap = self._normalize_olx_snapshot()
        except Exception:
            snap = ""
        ok = self._perform_continuar_click()
        if not ok:
            ok = self._olx_try_click_continuar_finalizar_em_iframes()
        if ok:
            self.log("Continuar clicado!")
        else:
            self.log("Botão Continuar não encontrado ou clique não confirmado; aguardando mudança mesmo assim...")
        self.olx_wait_page_changed_from(
            snap, f"Continuar {contexto}", retry_fn=self._retry_continuar_com_iframe
        )
        url_depois = self.scraper.driver.current_url
        if "desapega" in url_depois and url_antes != url_depois:
            self.log("AVISO: Navegou de volta para página inicial!")

    def preencher_descricao(self, descricao):
        from selenium.webdriver.common.by import By

        try:
            def _ta():
                els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'textarea')
                for el in els:
                    try:
                        if el.is_displayed():
                            return el
                    except Exception:
                        continue
                return None

            textarea = self._olx_poll_find_first(_ta, "textarea descrição", max_seconds=60)
            if not textarea:
                textareas = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'textarea')
            else:
                textareas = [textarea]
            
            if textareas:
                textarea = textareas[0]
                textarea.click()
                time.sleep(0.5)
                textarea.clear()
                
                # Sanitizar a descrição
                texto = descricao if descricao else "Produto em excelente estado."
                
                # Remover emojis e caracteres unicode especiais
                import re
                # Remove emojis e símbolos unicode
                texto = re.sub(r'[\U0001F600-\U0001F64F]', '', texto)  # Emoticons
                texto = re.sub(r'[\U0001F300-\U0001F5FF]', '', texto)  # Símbolos e pictogramas
                texto = re.sub(r'[\U0001F680-\U0001F6FF]', '', texto)  # Transporte e mapa
                texto = re.sub(r'[\U0001F1E0-\U0001F1FF]', '', texto)  # Bandeiras
                texto = re.sub(r'[\U00002702-\U000027B0]', '', texto)  # Dingbats
                texto = re.sub(r'[\U0001F900-\U0001F9FF]', '', texto)  # Suplemento
                texto = re.sub(r'[\U0001FA00-\U0001FA6F]', '', texto)  # Xadrez
                texto = re.sub(r'[\U0001FA70-\U0001FAFF]', '', texto)  # Símbolos extras
                texto = re.sub(r'[\U00002600-\U000026FF]', '', texto)  # Misc símbolos
                
                # Remover tabs
                texto = texto.replace('\t', ' ')
                # Remover quebras de linha - substituir por espaço
                texto = texto.replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ')
                # Remover espaços múltiplos
                texto = re.sub(r' +', ' ', texto)
                # Remover caracteres especiais problemáticos - manter apenas ASCII básico
                texto = re.sub(r'[^\x20-\x7EáéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]', '', texto)
                texto = texto.strip()
                
                # Limitar tamanho se muito grande
                if len(texto) > 2000:
                    texto = texto[:2000]
                
                # Usar send_keys com texto limpo
                textarea.send_keys(texto)
                
                self.log(f"Descrição preenchida: {texto[:50]}...")
            else:
                self.log("Textarea não encontrado!")
        except Exception as e:
            self.log(f"Erro descrição: {e}")

    def preencher_preco(self, preco):
        from selenium.webdriver.common.by import By

        try:
            def _find_preco_inp():
                els = self.scraper.driver.find_elements(
                    By.CSS_SELECTOR,
                    'input[type="text"], input[type="number"], input[inputmode="numeric"]',
                )
                for el in els:
                    try:
                        if el.is_displayed():
                            return el
                    except Exception:
                        continue
                return None

            inp = self._olx_poll_find_first(_find_preco_inp, "campo preço", max_seconds=60)
            if inp:
                inputs = [inp]
            else:
                inputs = []

            if inputs:
                inp = inputs[0]
                preenchido = False
                # Método 1: interação direta com TAB para disparar validação React
                try:
                    from selenium.webdriver.common.keys import Keys
                    inp.click()
                    time.sleep(0.5)
                    inp.send_keys(Keys.CONTROL + 'a')
                    inp.send_keys(str(preco))
                    time.sleep(0.3)
                    inp.send_keys(Keys.TAB)
                    self.log(f"Preço preenchido: {preco}")
                    preenchido = True
                except Exception:
                    pass
                # Método 2: JavaScript com React native setter
                if not preenchido:
                    try:
                        self.scraper.driver.execute_script("""
                            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                            nativeInputValueSetter.call(arguments[0], arguments[1]);
                            arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
                            arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                            arguments[0].dispatchEvent(new Event('blur', { bubbles: true }));
                        """, inp, str(preco))
                        self.log(f"Preço preenchido via JS: {preco}")
                        preenchido = True
                    except Exception as e2:
                        self.log(f"Erro preço JS: {e2}")
                if not preenchido:
                    self.log("Falha ao preencher preço em todos os métodos.")
            else:
                self.log("Input de preço não encontrado!")
        except Exception as e:
            self.log(f"Erro preço: {e}")

    def desmarcar_frete_gratis(self):
        from selenium.webdriver.common.by import By
        try:
            entrega = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Entrega em mãos")]')
            entrega.click()
            self.log("Entrega em mãos selecionada!")
        except Exception:
            pass

    def preencher_peso_se_existir(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import Select
        
        try:
            # Buscar QUALQUER select na página de peso
            selects = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            self.log(f"Peso: encontrados {len(selects)} selects")
            
            for select_elem in selects:
                try:
                    select = Select(select_elem)
                    current_value = select.first_selected_option.text.lower()
                    
                    # Se está com placeholder, preencher
                    if 'selecione' in current_value or current_value == '':
                        opcoes = select.options
                        self.log(f"Opções de peso: {[o.text for o in opcoes[:5]]}...")
                        
                        # Preferir 1 kg conforme fluxo OLX
                        peso_encontrado = False
                        for peso in ['1 kg', '1kg', 'até 1 kg', 'ate 1 kg', '2 kg', '2kg', 'até 2', '500']:
                            for opt in opcoes:
                                if peso.lower() in opt.text.lower() and 'selecione' not in opt.text.lower():
                                    select.select_by_visible_text(opt.text)
                                    self.log(f"Peso selecionado: {opt.text}")
                                    peso_encontrado = True
                                    break
                            if peso_encontrado:
                                break
                        
                        # Se não encontrou, selecionar segunda opção
                        if not peso_encontrado and len(opcoes) > 1:
                            select.select_by_index(1)
                            self.log(f"Peso por índice: {opcoes[1].text}")
                        
                        time.sleep(0.5)
                        return True  # Peso preenchido com sucesso
                        
                except Exception as e:
                    self.log(f"Erro select peso: {e}")
                    continue
            
            return False  # Nenhum select encontrado ou preenchido
            
        except Exception as e:
            self.log(f"Erro geral peso: {e}")
            return False

    def selecionar_sem_destacar(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        
        try:
            # Tentar múltiplos seletores
            selectors = [
                '//*[contains(text(),"Anunciar sem destacar")]',
                '//*[contains(text(),"sem destacar")]',
                '//*[contains(text(),"R$ 0,00")]',
                '//div[contains(.,"Grátis")]',
                '//input[@type="radio"][1]'  # Primeiro radio button
            ]
            
            for selector in selectors:
                try:
                    elementos = self.scraper.driver.find_elements(By.XPATH, selector)
                    if elementos:
                        # Usar ActionChains para clicar
                        actions = ActionChains(self.scraper.driver)
                        actions.move_to_element(elementos[0]).click().perform()
                        self.log(f"'Sem destacar' selecionado via: {selector[:30]}...")
                        time.sleep(1)
                        return
                except Exception:
                    continue
            
            self.log("Opção 'sem destacar' não encontrada!")
        except Exception as e:
            self.log(f"Erro ao selecionar sem destacar: {e}")

    def finalizar_anuncio(self):
        from selenium.webdriver.common.by import By

        def _btn_finalizar():
            for xpath in (
                '//button[contains(.,"Finalizar anúncio")]',
                '//button[contains(.,"Finalizar anuncio")]',
                '//button[contains(.,"Finalizar")]',
            ):
                for el in self.scraper.driver.find_elements(By.XPATH, xpath):
                    try:
                        if el.is_displayed() and el.is_enabled():
                            return el
                    except Exception:
                        continue
            return None

        try:
            btn = self._olx_poll_find_first(_btn_finalizar, "botão Finalizar", max_seconds=90)
            if btn:
                btn.click()
                self.log("Finalizado!")
            else:
                self.log("Erro finalizar: botão não encontrado")
        except Exception as e:
            self.log("Erro finalizar: " + str(e))

    def preencher_campos_obrigatorios(self):
        """Preenche campos obrigatórios que estão vazios"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import Select

        def _primeiro_select():
            els = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            return els[0] if els else None

        self._olx_poll_find_first(_primeiro_select, "selects obrigatórios", max_seconds=45)

        try:
            # Método 1: Buscar por elementos SELECT nativos
            selects = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            self.log(f"Encontrados {len(selects)} selects nativos")
            
            for select_elem in selects:
                try:
                    # Verificar se precisa preencher (valor vazio ou "Selecione")
                    select = Select(select_elem)
                    current_value = select.first_selected_option.text
                    
                    if current_value.lower() in ['selecione', 'select', '']:
                        # Tentar encontrar opções com "Usado"
                        opcoes_texto = [opt.text for opt in select.options]
                        self.log(f"Opções disponíveis: {opcoes_texto[:5]}...")
                        
                        # Prioridade: Usado > Usado - Excelente > Usado - Bom > Outros
                        opcoes_prioridade = ['Usado', 'Usado - Excelente', 'Usado - Bom', 'Outros']
                        
                        selecionado = False
                        for opcao in opcoes_prioridade:
                            for opt in select.options:
                                if opcao.lower() in opt.text.lower():
                                    select.select_by_visible_text(opt.text)
                                    self.log(f"Selecionado: {opt.text}")
                                    selecionado = True
                                    break
                            if selecionado:
                                break
                        
                        if not selecionado:
                            # Para selects numéricos (ex: memória, GB), selecionar última opção
                            # Para outros, selecionar segunda opção (pular "Selecione")
                            if len(select.options) > 1:
                                ultimo_idx = len(select.options) - 1
                                select.select_by_index(ultimo_idx)
                                self.log(f"Selecionado por índice (último): {select.options[ultimo_idx].text}")
                        
                        time.sleep(0.5)
                        
                except Exception as e:
                    self.log(f"Erro em select: {e}")
                    continue
            
            # Método 2: Buscar por dropdowns customizados (divs clicáveis)
            self.preencher_dropdowns_customizados()
            
        except Exception as e:
            self.log(f"Erro geral: {e}")

    def preencher_dropdowns_customizados(self):
        """Preenche os dropdowns customizados da OLX (olx-core-singleselect: div[role=combobox])."""
        import re

        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys

        titulo = (getattr(self, "_current_titulo", "") or "").lower()

        def _listbox_do(combobox):
            """Opções do listbox que pertencem a este combobox (mesmo bloco olx-core-singleselect)."""
            try:
                bloco = combobox.find_element(
                    By.XPATH, "./ancestor::div[contains(@class,'olx-core-singleselect')][1]")
            except Exception:
                return []
            try:
                return bloco.find_elements(By.CSS_SELECTOR, 'li[role="option"]')
            except Exception:
                return []

        def _escolher(opcoes):
            textos = [(o.text.strip(), o) for o in opcoes if o.text.strip()]
            titulo_limpo = re.sub(r"[^a-z0-9]", "", titulo)
            # 1) opção que aparece no título (ex.: "2gb" -> "2 GB")
            for texto, opcao in textos:
                limpo = re.sub(r"[^a-z0-9]", "", texto.lower())
                if len(limpo) >= 2 and limpo in titulo_limpo:
                    return opcao
            for palavra in re.findall(r"[a-z0-9]{3,}", titulo):
                for texto, opcao in textos:
                    if palavra in re.sub(r"[^a-z0-9]", "", texto.lower()):
                        return opcao
            # 2) reserva: opções que valem em qualquer campo
            for texto, opcao in textos:
                if texto.lower() in ("outros", "usado"):
                    return opcao
            return None

        try:
            comboboxes = [
                c for c in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'div[role="combobox"]')
                if c.is_displayed() and c.find_elements(By.CSS_SELECTOR, 'span[class*="placeholder"]')
            ]
        except Exception:
            comboboxes = []

        for combobox in comboboxes:
            try:
                self.scraper.driver.execute_script(
                    "arguments[0].scrollIntoView({block:'center'});", combobox)
                time.sleep(0.3)
                combobox.click()
                time.sleep(0.8)
                opcao = _escolher(_listbox_do(combobox))
                if opcao is None:
                    self.log("Dropdown OLX: nenhuma opção adequada encontrada.")
                    combobox.send_keys(Keys.ESCAPE)
                    continue
                self.log(f"Dropdown OLX: {opcao.text.strip()} escolhido.")
                self.scraper.driver.execute_script("arguments[0].click();", opcao)
                time.sleep(0.5)
            except Exception as e:
                self.log(f"Erro ao preencher dropdown OLX: {e}")
                continue

    def preencher_dropdown_por_label(self, label_text, valor):
        """Preenche um dropdown encontrando-o pelo label próximo"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        
        try:
            # Encontrar o label
            labels = self.scraper.driver.find_elements(By.XPATH, f'//*[contains(text(),"{label_text}")]')
            
            for label in labels:
                try:
                    # Encontrar o container pai que contém o dropdown
                    parent = label.find_element(By.XPATH, './ancestor::div[1] | ./parent::div')
                    
                    # Buscar elementos clicáveis dentro do parent
                    clickables = parent.find_elements(By.CSS_SELECTOR, 'div, span, button')
                    
                    for clickable in clickables:
                        if "Selecione" in clickable.text:
                            # Clicar para abrir dropdown
                            actions = ActionChains(self.scraper.driver)
                            actions.move_to_element(clickable).click().perform()
                            time.sleep(1)
                            
                            # Selecionar valor
                            opcoes = self.scraper.driver.find_elements(By.XPATH, f'//*[text()="{valor}"]')
                            if opcoes:
                                opcoes[0].click()
                                self.log(f"{label_text}: {valor} selecionado!")
                                return
                            break
                except Exception:
                    continue
        except Exception:
            pass

    # ===================== Novos no AutoPost =====================

    def esta_logado(self) -> bool:
        """Abre a lista de anúncios: sem login a OLX manda para a tela de acesso."""
        self.scraper.go_to_page(URL_ANUNCIOS)
        self.wait_for_olx_body_min_length(30, "minha conta OLX", max_wait=30)
        url = (self.scraper.driver.current_url or "").lower()
        return "acesso" not in url and "login" not in url

    def publicar(self, item: dict) -> str | None:
        self._current_preco = item["preco"]
        self.publicar_item(item)
        return None   # a OLX não mostra o link do anúncio no fim do fluxo; ele é achado pelo título

    def excluir(self, titulo: str) -> bool:
        """Exclui o anúncio com este título em "Meus anúncios" (o app antigo excluía todos, um a um)."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        self.log(f"Procurando o anúncio na OLX: {titulo}")
        self.scraper.go_to_page(URL_ANUNCIOS)
        self.wait_for_olx_body_min_length(50, "meus anúncios", max_wait=60)
        self.esperar(3)

        # botão Excluir do card que tem este título: sobe a partir de cada botão até achar o título e confere
        # que aquele bloco tem um botão Excluir só (senão seria a lista inteira)
        botao = self.scraper.driver.execute_script("""
            const alvo = arguments[0];
            const limpa = t => (t || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const botoes = [...document.querySelectorAll('button, a')].filter(b => limpa(b.innerText) === 'excluir'
                || limpa(b.innerText).startsWith('excluir'));
            for (const b of botoes) {
                let bloco = b;
                for (let i = 0; i < 12 && bloco; i++) {
                    bloco = bloco.parentElement;
                    if (!bloco) break;
                    if (limpa(bloco.innerText).includes(alvo)) {
                        const qtd = [...bloco.querySelectorAll('button, a')].filter(x => limpa(x.innerText).startsWith('excluir')).length;
                        if (qtd === 1) return b;
                        break;
                    }
                }
            }
            return null;
        """, normalizar(titulo)[:60])
        if not botao:
            self.log("Anúncio não encontrado em Meus anúncios (já foi excluído ou o título mudou).")
            return False

        self.scraper.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", botao)
        try:
            botao.click()
        except Exception:
            self.scraper.driver.execute_script("arguments[0].click();", botao)
        self.esperar(4)

        try:
            WebDriverWait(self.scraper.driver, 10).until(EC.element_to_be_clickable(
                (By.XPATH, '//*[contains(text(), "Vendi por outro meio")]'))).click()
            self.log("Motivo: Vendi por outro meio")
        except Exception:
            self.log("Opção 'Vendi por outro meio' não apareceu; seguindo.")
        self.esperar(2)

        try:
            WebDriverWait(self.scraper.driver, 10).until(EC.element_to_be_clickable((
                By.XPATH, '//div[@role="dialog"]//button[contains(., "Excluir")] | '
                          '//div[contains(@class, "modal")]//button[contains(., "Excluir")]'))).click()
        except Exception:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(., "Excluir")]')
            if len(btns) > 1:
                self.scraper.driver.execute_script("arguments[0].click();", btns[-1])
        self.esperar(3)

        for el in self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(), "Entendi")]'):
            try:
                el.click()
                break
            except Exception:
                continue
        self.esperar(2)
        self.log("Anúncio excluído na OLX.")
        return True

    def listar(self) -> list[dict]:
        """Anúncios em "Meus anúncios › Publicados" (todas as páginas). Cada card é achado pelo botão Excluir."""
        from selenium.webdriver.common.by import By

        self.log("Lendo os anúncios publicados na OLX...")
        self.scraper.go_to_page(URL_ANUNCIOS)
        self.wait_for_olx_body_min_length(50, "meus anúncios", max_wait=60)
        self.esperar(3)
        itens, vistos = [], set()
        for pagina in range(1, 21):
            for _ in range(6):   # a lista carrega rolando
                self.scraper.driver.execute_script("window.scrollBy(0, 2500);")
                self.esperar(1)
            for item in self.scraper.driver.execute_script(JS_LISTA_OLX) or []:
                if item["titulo"] not in vistos:
                    vistos.add(item["titulo"])
                    itens.append(item)
            proxima = [b for b in self.scraper.driver.find_elements(
                By.XPATH, '//a[contains(@aria-label,"róxima") or normalize-space(.)="Próxima"] | '
                          '//button[contains(@aria-label,"róxima") or normalize-space(.)="Próxima"]')
                if b.is_displayed() and b.is_enabled() and b.get_attribute("aria-disabled") != "true"]
            if not proxima:
                break
            self._log(f"Página {pagina} lida ({len(itens)} anúncio(s) até agora); indo para a próxima...")  # progresso, não conta como repetição
            self.scraper.driver.execute_script("arguments[0].click();", proxima[0])
            self.esperar(4)
        self.log(f"{len(itens)} anúncio(s) encontrado(s) na OLX.")
        return itens


# Cards de "Meus anúncios": sobe a partir de cada botão Excluir até o bloco com foto e preço (sem pegar a lista
# inteira, que teria mais de um Excluir). Título: link do anúncio, um título (h2/h3) ou a primeira linha com cara
# de título.
JS_LISTA_OLX = r"""
const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
const ehExcluir = b => /^excluir/i.test(limpa(b.innerText || b.getAttribute('aria-label')));
const saida = [], vistos = new Set();
for (const botao of [...document.querySelectorAll('button, a, [role=button]')].filter(ehExcluir)) {
    let bloco = botao, card = null;
    for (let i = 0; i < 15 && bloco.parentElement; i++) {
        bloco = bloco.parentElement;
        if ([...bloco.querySelectorAll('button, a, [role=button]')].filter(ehExcluir).length > 1) break;
        if (bloco.querySelector('img') && /R\$/.test(bloco.innerText)) card = bloco;
    }
    if (!card) continue;
    const texto = card.innerText || '';
    const linhas = texto.split('\n').map(limpa).filter(Boolean);
    const link = [...card.querySelectorAll('a[href]')].find(a => /olx\.com\.br\/.*\d{6,}/.test(a.href));
    const cabecalho = card.querySelector('h2, h3, [data-testid*="title"], [class*="title"]');
    let titulo = limpa(link && link.innerText) || limpa(cabecalho && cabecalho.innerText)
        || linhas.find(l => l.length > 6 && !/R\$|excluir|editar|vend|visualiza|destac|publicad|expira|^\d/i.test(l)) || '';
    if (!titulo || vistos.has(titulo)) continue;
    vistos.add(titulo);
    const img = card.querySelector('img');
    saida.push({
        titulo,
        preco: (texto.match(/R\$\s?[\d.]+(,\d{2})?/) || [''])[0],
        status: linhas.find(l => /publicad|ativo|expirad|pendente|em análise|reprovad|vendid|inativ|pausad/i.test(l)) || '',
        imagem: img ? img.currentSrc || img.src : '',
        link: link ? link.href : '',
        detalhes: linhas.slice(0, 6).join(' · ').slice(0, 300),
    });
}
return saida;
"""
