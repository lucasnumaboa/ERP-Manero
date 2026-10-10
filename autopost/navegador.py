"""
Chrome controlado pelo app (substitui o antigo helpers/scraper.py, que se perdeu).

- Perfil próprio e permanente (%LOCALAPPDATA%\\ERP AutoPost\\chrome-perfil): o login no Facebook e na OLX fica
  salvo como num Chrome normal, sem arquivos de cookie.
- undetected-chromedriver (a OLX bloqueia o Chrome automatizado comum); se não estiver disponível, usa o
  Selenium normal com as opções que escondem a automação (como o app antigo do Facebook fazia).
- Os nomes go_to_page / element_click_by_xpath / input_file_add_files são os do Scraper antigo: o fluxo de
  publicação da OLX foi trazido do app antigo quase sem mudança.
"""
import ctypes
import os
import re
import subprocess
import time
import winreg
from pathlib import Path

PERFIL = Path(os.getenv("LOCALAPPDATA") or Path.home()) / "ERP AutoPost" / "chrome-perfil"


def versao_chrome() -> int | None:
    """Versão principal do Chrome instalado (o chromedriver precisa ser da mesma)."""
    for raiz, chave in ((winreg.HKEY_CURRENT_USER, r"Software\Google\Chrome\BLBeacon"),
                        (winreg.HKEY_LOCAL_MACHINE, r"Software\Google\Chrome\BLBeacon"),
                        (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Google\Chrome\BLBeacon")):
        try:
            with winreg.OpenKey(raiz, chave) as k:
                return int(str(winreg.QueryValueEx(k, "version")[0]).split(".")[0])
        except (OSError, ValueError):
            continue
    for pasta in (os.getenv("PROGRAMFILES"), os.getenv("PROGRAMFILES(X86)"), os.getenv("LOCALAPPDATA")):
        exe = Path(pasta or "") / "Google" / "Chrome" / "Application" / "chrome.exe"
        if exe.exists():
            for item in exe.parent.iterdir():
                m = re.match(r"(\d+)\.\d+\.\d+\.\d+$", item.name)
                if m:
                    return int(m.group(1))
    return None


def chrome_instalado() -> bool:
    return versao_chrome() is not None


def copiar_para_area_de_transferencia(texto: str):
    """Para colar descrições com emoji/acentos (o chromedriver não digita emoji com send_keys)."""
    CF_UNICODETEXT, GMEM_MOVEABLE = 13, 0x0002
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    k32.GlobalAlloc.restype = ctypes.c_void_p
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalLock.argtypes = [ctypes.c_void_p]
    k32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    u32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    dados = (texto + "\0").encode("utf-16-le")
    for _ in range(10):  # outro programa pode estar com a área de transferência aberta
        if u32.OpenClipboard(None):
            break
        time.sleep(0.1)
    else:
        raise OSError("Não consegui abrir a área de transferência.")
    try:
        u32.EmptyClipboard()
        memoria = k32.GlobalAlloc(GMEM_MOVEABLE, len(dados))
        ponteiro = k32.GlobalLock(memoria)
        ctypes.memmove(ponteiro, dados, len(dados))
        k32.GlobalUnlock(memoria)
        u32.SetClipboardData(CF_UNICODETEXT, memoria)
    finally:
        u32.CloseClipboard()


FORA_DA_TELA = (-32000, -32000)
TAMANHO_ESCONDIDO = (1366, 900)
# janela escondida (fora da tela) não pode ser tratada como "em segundo plano": sem isso o Chrome desacelera a
# página e os cliques/esperas falham
SEM_DESACELERAR = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
                   "--disable-background-timer-throttling"]

# Retrato da página para o diagnóstico de travamento: o que está visível e dá para clicar/preencher.
JS_RETRATO = r"""
const visivel = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const texto = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
    .replace(/\s+/g, ' ').trim().slice(0, 200);
const descrever = el => { const d = { tag: el.tagName.toLowerCase(), texto: texto(el) };
    for (const a of ['id', 'name', 'type', 'role', 'aria-label', 'data-testid', 'href', 'placeholder'])
        if (el.getAttribute(a)) d[a] = el.getAttribute(a).slice(0, 200);
    if (typeof el.className === 'string' && el.className) d.classe = el.className.slice(0, 120);
    if (el.disabled) d.desabilitado = true;
    return d; };
const todos = (seletor, filtro, limite) => [...document.querySelectorAll(seletor)].filter(filtro).slice(0, limite);
return {
    url: location.href,
    titulo: document.title,
    janela: [innerWidth, innerHeight],
    titulos: todos('h1, h2, h3', visivel, 60).map(texto),
    botoes: todos('button, [role=button], input[type=submit], input[type=button]', visivel, 250).map(descrever),
    campos: todos('input, textarea, select', e => visivel(e) || e.type === 'file', 250).map(e => ({
        ...descrever(e), valor: e.type === 'password' ? '***' : String(e.value || '').slice(0, 200),
        obrigatorio: e.required || undefined, marcado: (e.type === 'checkbox' || e.type === 'radio') ? e.checked : undefined })),
    links: todos('a[href]', visivel, 150).map(descrever),
    dialogos: todos('[role=dialog], [aria-modal=true]', visivel, 10).map(e => texto(e) || (e.innerText || '').slice(0, 1500)),
    iframes: [...document.querySelectorAll('iframe')].map(f => ({ src: f.src, visivel: visivel(f) })),
    texto_visivel: (document.body ? document.body.innerText : '').slice(0, 20000),
};
"""


class Navegador:
    def __init__(self, log=print, escondido=lambda: True):
        self.log = log
        self.driver = None
        self._escondido = escondido   # configuração "postar com o Chrome escondido"
        self.visivel = False

    # ---------- abrir / fechar ----------
    def aberto(self) -> bool:
        if not self.driver:
            return False
        try:
            self.driver.current_url  # noqa: B018  (só para ver se a janela ainda existe)
            return True
        except Exception:
            self.driver = None
            return False

    def _argumentos_janela(self, visivel):
        if visivel:
            return ["--start-maximized", *SEM_DESACELERAR]
        return [f"--window-position={FORA_DA_TELA[0]},{FORA_DA_TELA[1]}",
                f"--window-size={TAMANHO_ESCONDIDO[0]},{TAMANHO_ESCONDIDO[1]}", *SEM_DESACELERAR]

    def abrir(self, visivel=None):
        """Abre o Chrome do app. Escondido (fora da tela) quando a configuração pede, a não ser que visivel=True."""
        if self.aberto():
            if visivel:
                self.mostrar()
            return self.driver
        PERFIL.mkdir(parents=True, exist_ok=True)
        versao = versao_chrome()
        if versao is None:
            raise RuntimeError("O Google Chrome não está instalado neste PC. Instale pelo site google.com/chrome.")
        self.visivel = bool(visivel) if visivel is not None else not self._escondido()
        try:
            import undetected_chromedriver as uc
            opcoes = uc.ChromeOptions()
            for argumento in self._argumentos_janela(self.visivel):
                opcoes.add_argument(argumento)
            opcoes.add_argument("--lang=pt-BR")
            opcoes.add_argument("--disable-notifications")
            self.driver = uc.Chrome(options=opcoes, user_data_dir=str(PERFIL), version_main=versao,
                                    use_subprocess=True)
            self.log(f"Chrome {versao} aberto (perfil do AutoPost{'' if self.visivel else ', escondido'}).")
        except ImportError:
            self.driver = self._abrir_selenium()
        except Exception as e:
            if "user data directory is already in use" in str(e).lower():
                raise RuntimeError("O Chrome do AutoPost já está aberto em outra janela. Feche-o e tente de novo.")
            self.log(f"Não consegui abrir pelo modo anti-bloqueio ({e}); usando o Chrome padrão.")
            self.driver = self._abrir_selenium()
        self.driver.implicitly_wait(0)
        return self.driver

    def _abrir_selenium(self):
        from selenium import webdriver
        opcoes = webdriver.ChromeOptions()
        opcoes.add_argument(f"--user-data-dir={PERFIL}")
        for argumento in self._argumentos_janela(self.visivel):
            opcoes.add_argument(argumento)
        opcoes.add_argument("--lang=pt-BR")
        opcoes.add_argument("--disable-blink-features=AutomationControlled")
        opcoes.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
        opcoes.add_experimental_option("prefs", {"profile.default_content_setting_values.notifications": 2})
        servico = webdriver.ChromeService(popen_kw={"creation_flags": subprocess.CREATE_NO_WINDOW})
        driver = webdriver.Chrome(options=opcoes, service=servico)
        self.log("Chrome aberto (perfil do AutoPost).")
        return driver

    def fechar(self):
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
        self.driver = None

    # ---------- mostrar / esconder ----------
    def mostrar(self):
        """Traz a janela para a tela (login, ou quando a pessoa quer ver)."""
        if not self.aberto():
            return
        try:
            self.driver.set_window_position(0, 0)
            self.driver.maximize_window()
            self.driver.minimize_window()   # minimizar e maximizar põe a janela na frente das outras
            self.driver.maximize_window()
        except Exception:
            pass
        self.visivel = True

    def esconder(self):
        """Tira a janela da tela de novo (se a configuração pede o Chrome escondido)."""
        if not self.aberto() or not self._escondido():
            return
        try:
            self.driver.set_window_size(*TAMANHO_ESCONDIDO)   # sai do "maximizado" antes de mover
            self.driver.set_window_position(*FORA_DA_TELA)
        except Exception:
            pass
        self.visivel = False

    # ---------- diagnóstico de travamento ----------
    def retrato(self) -> dict:
        """Imagem da tela (PNG em base64), HTML e a página em JSON, para mandar ao ERP."""
        dados = {"url": None, "imagem_base64": None, "html": None, "pagina": None}
        if not self.aberto():
            return dados
        for chave, obter in (("url", lambda: self.driver.current_url),
                             ("imagem_base64", lambda: self.driver.get_screenshot_as_base64()),
                             ("pagina", lambda: self.driver.execute_script(JS_RETRATO)),
                             ("html", lambda: self.driver.page_source)):
            try:
                dados[chave] = obter()
            except Exception as e:
                dados[chave] = None if chave != "pagina" else {"erro_ao_ler": str(e)}
        return dados

    # ---------- ações (mesmos nomes do Scraper antigo) ----------
    def go_to_page(self, url: str):
        self.abrir().get(url)

    def element_click_by_xpath(self, xpath: str, espera: float = 10):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
        elemento = WebDriverWait(self.driver, espera).until(EC.presence_of_element_located((By.XPATH, xpath)))
        try:
            elemento.click()
        except Exception:
            self.driver.execute_script("arguments[0].click();", elemento)
        return elemento

    def input_file_add_files(self, css: str, caminhos: str, espera: float = 20):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
        faltando = [c for c in caminhos.split("\n") if c and not os.path.exists(c)]
        if faltando:
            raise FileNotFoundError("Imagens não encontradas: " + ", ".join(faltando))
        campo = WebDriverWait(self.driver, espera).until(EC.presence_of_element_located((By.CSS_SELECTOR, css)))
        campo.send_keys(caminhos)

    def texto_da_pagina(self) -> str:
        from selenium.webdriver.common.by import By
        try:
            return self.driver.find_element(By.TAG_NAME, "body").text
        except Exception:
            return ""

    def cookies(self) -> dict:
        try:
            return {c["name"]: c["value"] for c in self.driver.get_cookies()}
        except Exception:
            return {}
