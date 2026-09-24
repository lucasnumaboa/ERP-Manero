#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Faz o ERP subir sozinho com o Windows, sem precisar de administrador nem de NSSM:
  - tarefa agendada "ERP Maneiro - Vigia", a cada 5 minutos, roda o vigia_erp.py (sobe o que estiver fora do ar);
  - atalho na pasta Inicializar, para o vigia rodar logo depois do login.

Uso:  python instalar_inicio_automatico.py            (instala / atualiza)
      python instalar_inicio_automatico.py --remover  (desfaz)

Observação: roda com o usuário logado. Para subir antes de alguém entrar no Windows, é preciso serviço
(instalar_servico.py, como administrador e com NSSM) ou login automático.
"""
import argparse
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
VIGIA = os.path.join(RAIZ, "vigia_erp.py")
TAREFA = "ERP Maneiro - Vigia"
ATALHO = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup", "ERP Maneiro - Vigia.lnk")


def pythonw():
    candidato = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    if not os.path.exists(candidato):
        sys.exit(f"pythonw.exe não encontrado ao lado de {sys.executable}")
    return candidato


def powershell(script):
    subprocess.run(["powershell", "-NoProfile", "-Command", script], check=True)


def instalar():
    exe = pythonw()
    subprocess.run(["schtasks", "/create", "/f", "/tn", TAREFA, "/sc", "minute", "/mo", "5",
                    "/tr", f'"{exe}" "{VIGIA}"'], check=True)
    powershell(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{0}'); "
        "$s.TargetPath = '{1}'; $s.Arguments = '\"{2}\"'; $s.WorkingDirectory = '{3}'; "
        "$s.Description = 'Sobe o backend e o frontend do ERP se estiverem fora do ar'; $s.Save()"
        .format(ATALHO, exe, VIGIA, RAIZ)
    )
    print(f"Tarefa '{TAREFA}' criada (a cada 5 minutos) e atalho criado em: {ATALHO}")
    print("Log do vigia: log\\vigia_<data>.log")


def remover():
    subprocess.run(["schtasks", "/delete", "/f", "/tn", TAREFA])
    if os.path.exists(ATALHO):
        os.remove(ATALHO)
    print("Início automático removido.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--remover", action="store_true", help="remove a tarefa e o atalho")
    remover() if parser.parse_args().remover else instalar()
