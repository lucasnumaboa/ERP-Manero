"""Uma classe por site de anúncio. Cada uma sabe ver se está logada, publicar e excluir pelo título."""
from .base import ParadaSolicitada, Plataforma, SkipItemException, Travou  # noqa: F401

NOMES = {"facebook": "Facebook", "olx": "OLX"}


def criar(nome, navegador, log, parar, opcoes=None):
    if nome == "facebook":
        from .facebook import Facebook
        return Facebook(navegador, log, parar, opcoes=(opcoes or {}).get("facebook", {}))
    if nome == "olx":
        from .olx import Olx
        return Olx(navegador, log, parar)
    raise ValueError(f"Plataforma desconhecida: {nome}")
