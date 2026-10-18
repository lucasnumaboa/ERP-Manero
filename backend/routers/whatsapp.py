"""
WhatsApp pedido pela tela (entrada/saída de estoque, relatório da IA, teste do webhook em Configurações).

O navegador não chama mais o webhook direto: o webhook pode ser um endereço que só o servidor alcança (o middleware
do Evolution no mesmo Docker, http://host.docker.internal:8094/webhook) e um webhook aberto na internet manda
mensagem para qualquer número. Aqui o servidor repassa o mesmo corpo de sempre ({telefone, mensagem, timestamp})
para o webhook_url das Configurações, só com o webhook ligado (webhook_ativo) e só para telefone de vendedor ativo.
"""
import re
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_db_cursor
from models import UserInDB

router = APIRouter()


class MensagemWhatsApp(BaseModel):
    telefone: str = Field(..., max_length=40)
    mensagem: str = Field(..., min_length=1, max_length=20000)


def _digitos(telefone: str) -> str:
    """Só os dígitos, com o 55 na frente quando falta (como o webhook faz)."""
    d = re.sub(r"\D", "", telefone or "")
    return d if d.startswith("55") and len(d) >= 12 else "55" + d


def _configuracao():
    with get_db_cursor() as cursor:
        cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('webhook_url', 'webhook_ativo')")
        cfg = {linha["chave"]: (linha["valor"] or "").strip() for linha in cursor.fetchall()}
        cursor.execute("SELECT telefone FROM vendedores WHERE ativo = TRUE AND telefone IS NOT NULL AND TRIM(telefone) <> ''")
        vendedores = {_digitos(linha["telefone"]) for linha in cursor.fetchall()}
    return cfg.get("webhook_url", ""), cfg.get("webhook_ativo", "").lower() == "true", vendedores


@router.post("/enviar")
async def enviar(msg: MensagemWhatsApp, current_user: UserInDB = Depends(get_current_user)):
    url, ativo, vendedores = _configuracao()
    if not ativo or not url:
        return {"enviado": False, "motivo": "webhook desligado ou sem URL (Configurações > Webhook)"}
    if _digitos(msg.telefone) not in vendedores:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só envia para telefone de vendedor ativo")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json={"telefone": msg.telefone, "mensagem": msg.mensagem,
                                             "timestamp": datetime.now().isoformat()})
    except httpx.HTTPError as erro:
        return {"enviado": False, "motivo": f"webhook não respondeu: {erro.__class__.__name__}"}
    return {"enviado": 200 <= r.status_code < 300, "status": r.status_code}
