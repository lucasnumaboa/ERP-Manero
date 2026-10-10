"""Peças comuns às plataformas (Facebook e OLX)."""
import re
import time


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
