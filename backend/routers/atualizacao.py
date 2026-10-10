"""
Botão "Atualizar" em Configurações: compara a versão instalada com a do GitHub e atualiza (só admin).

- Instalação local (Windows): roda scripts/atualizar.py num processo à parte. Ele reinicia o backend no fim,
  por isso o andamento fica num arquivo (log/atualizacao.json) e a tela continua lendo depois do reinício.
- Docker (ERP_MODO=docker): repassa para o serviço `atualizador`, que remonta as imagens.
"""
import importlib.util
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from auth import get_current_user

router = APIRouter()

RAIZ = Path(__file__).resolve().parent.parent.parent
SEM_JANELA, NOVO_GRUPO, FORA_DO_JOB = 0x08000000, 0x00000200, 0x01000000


def modo() -> str:
    return "docker" if os.getenv("ERP_MODO") == "docker" else "local"


def somente_admin(current_user=Depends(get_current_user)):
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Apenas administradores podem atualizar o sistema.")
    return current_user


def _modulo_local():
    """scripts/atualizar.py (só existe na instalação local; a imagem Docker não leva a pasta scripts/)."""
    spec = importlib.util.spec_from_file_location("atualizar_erp", RAIZ / "scripts" / "atualizar.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


async def _atualizador(metodo, caminho):
    url = os.getenv("ATUALIZADOR_URL", "http://atualizador:9000") + caminho
    try:
        async with httpx.AsyncClient(timeout=120) as cliente:
            r = await cliente.request(metodo, url, headers={"X-Token": os.getenv("SECRET_KEY", "")})
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "O serviço atualizador não está rodando. Na pasta do ERP: docker compose up -d atualizador")
    dados = r.json() if r.content else {}
    if r.status_code >= 400:
        raise HTTPException(r.status_code, dados.get("detail", f"Erro {r.status_code} no atualizador"))
    return dados


@router.get("/")
async def verificar(_=Depends(somente_admin)):
    """Versão instalada, a do GitHub, o que muda e o que impediria a atualização."""
    if modo() == "docker":
        return {"modo": "docker", **await _atualizador("GET", "/verificar")}
    try:
        return {"modo": "local", **await run_in_threadpool(_modulo_local().verificar, RAIZ)}
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Não consegui consultar o GitHub: {e}")


@router.post("/iniciar", status_code=status.HTTP_202_ACCEPTED)
async def iniciar(_=Depends(somente_admin)):
    if modo() == "docker":
        return await _atualizador("POST", "/iniciar")
    atualizar = _modulo_local()
    if atualizar.em_andamento(RAIZ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já tem uma atualização em andamento.")
    # estado inicial já gravado: a tela não confunde com o resultado da atualização anterior
    arquivo = atualizar.arquivo_estado(RAIZ)
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(json.dumps({"rodando": True, "pid": None, "inicio": datetime.now().isoformat(timespec="seconds"),
                                   "linhas": ["Iniciando a atualização..."]}, ensure_ascii=False), encoding="utf-8")
    comando = [sys.executable, str(RAIZ / "scripts" / "atualizar.py")]
    saida = open(RAIZ / "log" / "atualizacao_saida.log", "a", encoding="utf-8")
    try:
        # processo à parte e fora do job do backend: continua vivo quando o backend é reiniciado
        subprocess.Popen(comando, cwd=RAIZ, stdout=saida, stderr=subprocess.STDOUT, close_fds=True,
                         creationflags=SEM_JANELA | NOVO_GRUPO | FORA_DO_JOB)
    except OSError:
        subprocess.Popen(comando, cwd=RAIZ, stdout=saida, stderr=subprocess.STDOUT, close_fds=True,
                         creationflags=SEM_JANELA | NOVO_GRUPO)
    finally:
        saida.close()
    return {"ok": True}


@router.get("/andamento")
async def andamento(_=Depends(somente_admin)):
    if modo() == "docker":
        return await _atualizador("GET", "/andamento")
    atualizar = _modulo_local()
    estado = atualizar.ler_estado(RAIZ)
    if estado.get("rodando") and not atualizar.em_andamento(RAIZ):
        estado.update({"rodando": False, "ok": False,
                       "mensagem": "A atualização parou sem terminar. Veja log/atualizacao_saida.log."})
    return estado
