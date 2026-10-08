"""Peças comuns às plataformas (Facebook e OLX)."""
import re


class ParadaSolicitada(BaseException):
    """A pessoa clicou em Parar. BaseException de propósito: os fluxos de publicação têm muitos
    `except Exception` (para tentar de novo de outro jeito) e a parada não pode ser engolida por eles."""


class SkipItemException(Exception):
    """Não deu para publicar este item: pula para o próximo (nome mantido do app antigo da OLX)."""


def normalizar(texto: str) -> str:
    """Para comparar títulos: minúsculo, sem espaços repetidos."""
    return re.sub(r"\s+", " ", (texto or "").strip().lower())


class Plataforma:
    nome = ""          # "facebook" | "olx"
    rotulo = ""        # para a tela
    url_login = ""

    def __init__(self, navegador, log, parar=lambda: False):
        self.scraper = navegador        # nome usado pelos fluxos trazidos do app antigo
        self.navegador = navegador
        self._log = log
        self._parar = parar

    def log(self, mensagem):
        self._log(mensagem)
        if self._parar():
            raise ParadaSolicitada()

    def esperar(self, segundos):
        """sleep que obedece ao botão Parar."""
        import time
        fim = time.monotonic() + segundos
        while time.monotonic() < fim:
            if self._parar():
                raise ParadaSolicitada()
            time.sleep(min(0.5, fim - time.monotonic()))

    # implementadas por cada plataforma
    def esta_logado(self) -> bool:
        raise NotImplementedError

    def publicar(self, item: dict) -> str | None:
        """Publica e devolve o link do anúncio, se der para descobrir."""
        raise NotImplementedError

    def excluir(self, titulo: str) -> bool:
        """Exclui o anúncio com este título. False se não achou."""
        raise NotImplementedError
