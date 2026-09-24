#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Vigia do ERP: se o backend (porta 8000) ou o frontend (porta 3000) não estiver respondendo, sobe de novo.

Roda sem janela (pythonw) pela tarefa agendada "ERP Maneiro - Vigia" (a cada 5 minutos) e pelo atalho na
pasta Inicializar do Windows (logo depois do login). Assim o ERP volta sozinho quando o PC reinicia ou
quando algum dos dois cai. Para instalar/remover: python instalar_inicio_automatico.py [--remover]

Usa os mesmos start_backend.bat / start_frontend.bat e os mesmos logs do start_erp.bat, e roda o
change_api_link.py antes de subir o frontend, como o start_erp.bat faz.

Também: avisa por WhatsApp (backend/alertas.py) quando precisou religar algo, quando não voltou e quando o
disco passa de 95%; e apaga uma vez por dia os logs com mais de 30 dias.
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime

RAIZ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
PASTA_LOG = os.path.join(RAIZ, "log")
ESTADO = os.path.join(PASTA_LOG, "vigia_estado.json")
# O backend demora alguns segundos para abrir a porta; não sobe de novo enquanto a última tentativa for recente.
ESPERA_ENTRE_TENTATIVAS = 180
RETENCAO_LOGS_DIAS = 30
ALERTA_VALIDADE = 24 * 3600    # alerta que não saiu (webhook fora) é tentado de novo por até 1 dia
LOG_COM_DATA = re.compile(r"_(\d{4}-\d{2}-\d{2})\.log$")

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


def limpar_logs_antigos(estado):
    """Uma vez por dia apaga log/<nome>_AAAA-MM-DD.log com mais de RETENCAO_LOGS_DIAS dias."""
    if estado.get("limpeza_logs") == hoje():
        return
    estado["limpeza_logs"] = hoje()
    apagados = 0
    for arquivo in os.listdir(PASTA_LOG):
        m = LOG_COM_DATA.search(arquivo)
        if not m:
            continue
        try:
            idade = (datetime.now() - datetime.strptime(m.group(1), "%Y-%m-%d")).days
            if idade > RETENCAO_LOGS_DIAS:
                os.remove(os.path.join(PASTA_LOG, arquivo))
                apagados += 1
        except (ValueError, OSError):
            continue  # data estranha no nome ou arquivo em uso: fica para amanhã
    if apagados:
        registrar(f"{apagados} log(s) com mais de {RETENCAO_LOGS_DIAS} dias apagado(s)")


def conferir_disco(estado):
    import alertas
    disco = alertas.uso_disco(RAIZ)
    if disco["alerta"] and estado.get("alerta_disco") != hoje():
        estado["alerta_disco"] = hoje()
        registrar(f"disco com {disco['usado_pct']}% em uso")
        return [f"💾 ERP Maneiro: disco do servidor com {disco['usado_pct']}% em uso (restam {disco['livre_gb']} GB). "
                "Libere espaço para o banco e os backups não pararem."]
    return []


def enviar_alertas(estado, novos):
    """Manda os alertas novos e os que ficaram pendentes (banco ou webhook fora do ar logo após reiniciar o PC)."""
    agora = time.time()
    fila = [a for a in estado.get("alertas_pendentes", []) if agora - a["quando"] < ALERTA_VALIDADE]
    fila += [{"quando": agora, "mensagem": m} for m in novos]
    if not fila:
        estado.pop("alertas_pendentes", None)
        return
    try:
        import alertas
        for alerta in list(fila):
            hora = datetime.fromtimestamp(alerta["quando"]).strftime("%d/%m %H:%M")
            enviados = alertas.enviar_alerta(f"{alerta['mensagem']} ({hora})")
            fila.remove(alerta)
            registrar(f"alerta {'enviado para ' + str(enviados) + ' telefone(s)' if enviados else 'sem telefone configurado, descartado'}: {alerta['mensagem']}")
    except Exception as e:
        registrar(f"alerta não saiu, tento de novo na próxima rodada: {e!r}")
    estado["alertas_pendentes"] = fila


def main():
    estado = ler_estado()
    agora = time.time()
    novos_alertas = []
    religados = []
    for nome, info in SERVICOS.items():
        if porta_respondendo(info["porta"]):
            estado.pop(nome, None)  # subiu: uma queda futura é queda nova, não "não voltou"
            if estado.pop(f"{nome}_falhou", None):
                novos_alertas.append(f"✅ ERP Maneiro: {nome} voltou a responder.")
            continue
        ultima = estado.get(nome, 0)
        if agora - ultima < ESPERA_ENTRE_TENTATIVAS:
            registrar(f"{nome} ainda fora do ar, aguardando a tentativa de {int(agora - ultima)}s atrás")
            continue
        if ultima and agora - ultima < ESPERA_ENTRE_TENTATIVAS + 600 and not estado.get(f"{nome}_falhou"):
            # Religou na rodada anterior e continua fora: avisa uma vez até voltar.
            estado[f"{nome}_falhou"] = True
            novos_alertas.append(f"❌ ERP Maneiro: {nome} não voltou depois de religado. Veja log/{nome}_{hoje()}.log")
        if nome == "frontend":
            r = subprocess.run([python_com_console(), os.path.join(RAIZ, "change_api_link.py")], cwd=RAIZ,
                               capture_output=True, text=True, creationflags=SEM_JANELA)
            registrar(f"change_api_link.py (código {r.returncode}): {(r.stdout + r.stderr).strip()[-300:]}")
        registrar(f"{nome} fora do ar (porta {info['porta']}), subindo {info['bat']}")
        subir(nome)
        estado[nome] = agora
        if not estado.get(f"{nome}_falhou"):  # enquanto não volta, já avisou; não repete a cada rodada
            religados.append(nome)
    if len(religados) == len(SERVICOS):
        novos_alertas.append("⚠️ ERP Maneiro: backend e frontend estavam fora do ar (PC ligado/reiniciado ou processos caíram) "
                             "e foram religados automaticamente.")
    elif religados:
        novos_alertas.append(f"⚠️ ERP Maneiro: {religados[0]} estava fora do ar e foi religado automaticamente.")
    try:
        limpar_logs_antigos(estado)
        novos_alertas += conferir_disco(estado)
    except Exception as e:
        registrar(f"falha na manutenção (logs/disco): {e!r}")
    enviar_alertas(estado, novos_alertas)
    salvar_estado(estado)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # sem janela, o único lugar onde um erro aparece é o log
        registrar(f"ERRO no vigia: {e!r}")
        raise
