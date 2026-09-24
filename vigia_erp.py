#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Vigia do ERP: se o backend (porta 8000) ou o frontend (porta 3000) não estiver respondendo, sobe de novo.

Roda sem janela (pythonw) pela tarefa agendada "ERP Maneiro - Vigia" (a cada 5 minutos) e pelo atalho na
pasta Inicializar do Windows (logo depois do login). Assim o ERP volta sozinho quando o PC reinicia ou
quando algum dos dois cai. Para instalar/remover: python instalar_inicio_automatico.py [--remover]

Usa os mesmos start_backend.bat / start_frontend.bat e os mesmos logs do start_erp.bat, e roda o
change_api_link.py antes de subir o frontend, como o start_erp.bat faz.
"""
import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime

RAIZ = os.path.dirname(os.path.abspath(__file__))
PASTA_LOG = os.path.join(RAIZ, "log")
ESTADO = os.path.join(PASTA_LOG, "vigia_estado.json")
# O backend demora alguns segundos para abrir a porta; não sobe de novo enquanto a última tentativa for recente.
ESPERA_ENTRE_TENTATIVAS = 180

SERVICOS = {
    "backend": {"porta": 8000, "bat": "start_backend.bat"},
    "frontend": {"porta": 3000, "bat": "start_frontend.bat"},
}

SEM_JANELA = 0x08000000           # CREATE_NO_WINDOW: o cmd e os filhos dele ficam sem janela
NOVO_GRUPO = 0x00000200           # CREATE_NEW_PROCESS_GROUP
FORA_DO_JOB = 0x01000000          # CREATE_BREAKAWAY_FROM_JOB: não morre junto com a tarefa agendada


def hoje():
    return datetime.now().strftime("%Y-%m-%d")


def registrar(msg):
    os.makedirs(PASTA_LOG, exist_ok=True)
    with open(os.path.join(PASTA_LOG, f"vigia_{hoje()}.log"), "a", encoding="utf-8") as f:
        f.write(f"{datetime.now():%H:%M:%S} {msg}\n")


def porta_respondendo(porta):
    try:
        with socket.create_connection(("127.0.0.1", porta), timeout=3):
            return True
    except OSError:
        return False


def ler_estado():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def salvar_estado(estado):
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(estado, f)


def python_com_console():
    """change_api_link.py roda com python.exe (pythonw não tem saída para o log)."""
    pasta = os.path.dirname(sys.executable)
    candidato = os.path.join(pasta, "python.exe")
    return candidato if os.path.exists(candidato) else "python"


def subir(nome):
    bat = SERVICOS[nome]["bat"]
    log = os.path.join(PASTA_LOG, f"{nome}_{hoje()}.log")
    comando = f'cmd /c "cd /d "{RAIZ}" && call "{os.path.join(RAIZ, bat)}" >> "{log}" 2>&1"'
    try:
        subprocess.Popen(comando, cwd=RAIZ, creationflags=SEM_JANELA | NOVO_GRUPO | FORA_DO_JOB, close_fds=True)
    except OSError:
        # Se a tarefa agendada não permitir sair do job, sobe mesmo assim (o processo continua depois que o vigia termina).
        subprocess.Popen(comando, cwd=RAIZ, creationflags=SEM_JANELA | NOVO_GRUPO, close_fds=True)


def main():
    estado = ler_estado()
    agora = time.time()
    for nome, info in SERVICOS.items():
        if porta_respondendo(info["porta"]):
            continue
        ultima = estado.get(nome, 0)
        if agora - ultima < ESPERA_ENTRE_TENTATIVAS:
            registrar(f"{nome} ainda fora do ar, aguardando a tentativa de {int(agora - ultima)}s atrás")
            continue
        if nome == "frontend":
            r = subprocess.run([python_com_console(), os.path.join(RAIZ, "change_api_link.py")], cwd=RAIZ,
                               capture_output=True, text=True, creationflags=SEM_JANELA)
            registrar(f"change_api_link.py (código {r.returncode}): {(r.stdout + r.stderr).strip()[-300:]}")
        registrar(f"{nome} fora do ar (porta {info['porta']}), subindo {info['bat']}")
        subir(nome)
        estado[nome] = agora
    salvar_estado(estado)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # sem janela, o único lugar onde um erro aparece é o log
        registrar(f"ERRO no vigia: {e!r}")
        raise
