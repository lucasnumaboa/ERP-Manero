"""
Configuração local do ERP AutoPost, em %APPDATA%\\ERP AutoPost\\config.json.

A senha do ERP só é guardada se a pessoa marcar "lembrar", e mesmo assim criptografada pelo próprio Windows
(DPAPI): só o mesmo usuário do Windows, neste mesmo PC, consegue ler de volta.
"""
import base64
import copy
import ctypes
import ctypes.wintypes
import json
import os
from pathlib import Path

PASTA = Path(os.getenv("APPDATA") or Path.home()) / "ERP AutoPost"
ARQUIVO = PASTA / "config.json"

CATEGORIAS_FACEBOOK = ["Eletrônicos e informática", "Videogames", "Telefones celulares"]

PADRAO = {
    "api_url": "https://erp-api-call.manerostream.com.br",
    "email": "",
    "senha_protegida": "",
    "lembrar": True,
    "delay_min": 20,           # segundos de espera entre um anúncio e outro (sorteado entre min e max)
    "delay_max": 60,
    "navegador_escondido": True,   # posta com o Chrome fora da tela; ele aparece só quando precisa de login
    "contas": {},              # última conferência de login: {"facebook": {"logado": true, "em": "..."}}
    "facebook": {
        "grupos": True,        # também anunciar nos grupos (até 20) na etapa final do Marketplace
        "contato": "",         # se preenchido, entra no começo da descrição: "Meu contato: ..."
        "categoria_padrao": CATEGORIAS_FACEBOOK[0],
        "categorias": {},      # nome da categoria no ERP -> categoria do Facebook
    },
    "precos": {},              # produto_id -> preço personalizado para os anúncios
    "escolhas_locais": {},     # produto_id -> {"facebook": bool, "olx": bool} quando o ERP não deixou salvar
}


def _mesclar(base, novo):
    resultado = copy.deepcopy(base)
    for chave, valor in (novo or {}).items():
        if isinstance(valor, dict) and isinstance(resultado.get(chave), dict):
            resultado[chave] = _mesclar(resultado[chave], valor)
        else:
            resultado[chave] = valor
    return resultado


def carregar() -> dict:
    try:
        return _mesclar(PADRAO, json.loads(ARQUIVO.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return copy.deepcopy(PADRAO)


def salvar(cfg: dict):
    PASTA.mkdir(parents=True, exist_ok=True)
    temporario = ARQUIVO.with_suffix(".tmp")
    temporario.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    temporario.replace(ARQUIVO)


# ---------- DPAPI (CryptProtectData / CryptUnprotectData) ----------

class _Blob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(funcao, dados: bytes) -> bytes:
    buffer = ctypes.create_string_buffer(dados, len(dados))
    entrada = _Blob(len(dados), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    saida = _Blob()
    funcao.argtypes = [ctypes.POINTER(_Blob), ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_void_p,
                       ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.POINTER(_Blob)]
    funcao.restype = ctypes.wintypes.BOOL
    if not funcao(ctypes.byref(entrada), None, None, None, None, 0x01, ctypes.byref(saida)):  # 0x01: sem janela
        raise OSError("O Windows recusou proteger/ler a senha (DPAPI).")
    try:
        return ctypes.string_at(saida.pbData, saida.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(ctypes.cast(saida.pbData, ctypes.c_void_p))


def proteger(texto: str) -> str:
    if not texto:
        return ""
    return base64.b64encode(_dpapi(ctypes.windll.crypt32.CryptProtectData, texto.encode("utf-8"))).decode("ascii")


def revelar(protegido: str) -> str:
    if not protegido:
        return ""
    try:
        return _dpapi(ctypes.windll.crypt32.CryptUnprotectData, base64.b64decode(protegido)).decode("utf-8")
    except (OSError, ValueError):
        return ""   # outro usuário/PC ou arquivo mexido: pede a senha de novo
