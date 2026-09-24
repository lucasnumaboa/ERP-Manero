"""
Limite de tentativas erradas no login (o site é público pela Cloudflare).

- 5 senhas erradas para o mesmo e-mail, vindas do mesmo IP, em 15 minutos: bloqueia esse par por 15 minutos.
- 20 senhas erradas do mesmo IP (qualquer e-mail) em 15 minutos: bloqueia o IP, contra quem testa vários e-mails.
Login certo zera as falhas daquele e-mail. Fica em memória: reiniciar o backend libera tudo.
"""
import threading
import time

JANELA = 15 * 60
MAX_POR_EMAIL = 5
MAX_POR_IP = 20

_falhas = {}          # chave -> lista de horários das tentativas erradas
_trava = threading.Lock()


def ip_do_cliente(request) -> str:
    # Atrás da Cloudflare o IP real vem no CF-Connecting-IP (a Cloudflare sobrescreve o que o cliente mandar).
    return (request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "desconhecido"))


def _chaves(ip, email):
    return (("email", ip, (email or "").strip().lower()), MAX_POR_EMAIL), (("ip", ip), MAX_POR_IP)


def _recentes(chave, agora):
    horarios = [t for t in _falhas.get(chave, []) if agora - t < JANELA]
    if horarios:
        _falhas[chave] = horarios
    else:
        _falhas.pop(chave, None)
    return horarios


def segundos_bloqueado(ip, email) -> int:
    """0 se pode tentar; senão, quantos segundos faltam para liberar."""
    agora = time.time()
    with _trava:
        espera = 0
        for chave, limite in _chaves(ip, email):
            horarios = _recentes(chave, agora)
            if len(horarios) >= limite:
                espera = max(espera, int(horarios[-limite] + JANELA - agora) + 1)
        return espera


def registrar_falha(ip, email):
    agora = time.time()
    with _trava:
        for chave, _ in _chaves(ip, email):
            _falhas.setdefault(chave, []).append(agora)
        if len(_falhas) > 10_000:  # não deixa crescer sem fim sob ataque
            for chave in list(_falhas):
                _recentes(chave, agora)


def registrar_sucesso(ip, email):
    with _trava:
        _falhas.pop(_chaves(ip, email)[0][0], None)


def limpar():
    with _trava:
        _falhas.clear()
