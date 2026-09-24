"""
Alertas do sistema para o administrador (ERP caiu e voltou, disco quase cheio), enviados por WhatsApp pelo
mesmo webhook (n8n) das notificações de estoque: Configurações > Notificações > "Telefone(s) para alertas".
Usado pelo vigia_erp.py (que roda fora do backend) e pela rota de saúde do sistema.
"""
import re
import shutil
from datetime import datetime

import httpx

from database import get_db_cursor

LIMITE_DISCO_PCT = 95


def _configuracoes():
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('webhook_url', 'webhook_ativo', 'alerta_telefones')")
        return {c["chave"]: (c["valor"] or "").strip() for c in cursor.fetchall()}


def telefones_de_alerta(cfg=None):
    cfg = cfg if cfg is not None else _configuracoes()
    return [t for t in re.split(r"[,;\s]+", cfg.get("alerta_telefones", "")) if t]


def enviar_alerta(mensagem: str) -> int:
    """Manda para cada telefone de alerta. Devolve quantos enviou (0 = alerta não configurado).
    Levanta exceção se o banco ou o webhook falharem, para quem chamou tentar de novo depois."""
    cfg = _configuracoes()
    url, telefones = cfg.get("webhook_url"), telefones_de_alerta(cfg)
    if cfg.get("webhook_ativo", "").lower() != "true" or not url or not telefones:
        return 0
    for telefone in telefones:
        r = httpx.post(url, json={"telefone": telefone, "mensagem": mensagem, "timestamp": datetime.now().isoformat()},
                          timeout=10)
        r.raise_for_status()
    return len(telefones)


def uso_disco(caminho) -> dict:
    total, usado, livre = shutil.disk_usage(caminho)
    pct = round(usado * 100 / total, 1)
    return {"total_gb": round(total / 1024 ** 3, 1), "livre_gb": round(livre / 1024 ** 3, 1),
            "usado_pct": pct, "alerta": pct >= LIMITE_DISCO_PCT, "limite_pct": LIMITE_DISCO_PCT}
