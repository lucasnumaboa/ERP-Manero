#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script para instalar o backend do ERP-MANEIRO como um serviço do Windows
Isso permite que o sistema seja executado automaticamente quando o servidor for iniciado
"""

import os
import sys
import argparse
import subprocess
import winreg

def is_admin():
    """Verifica se o script está sendo executado como administrador"""
    try:
        return subprocess.check_output('net session', stderr=subprocess.DEVNULL, shell=True) is not None
    except:
        return False

def install_nssm():
    """Verifica se o NSSM está instalado e o instala se necessário"""
    try:
        # Verifica se o NSSM já está instalado
        subprocess.check_output('where nssm', stderr=subprocess.DEVNULL, shell=True)
        print("NSSM já está instalado.")
        return True
    except:
        print("NSSM não encontrado. É necessário instalá-lo manualmente.")
        print("Por favor, baixe o NSSM de https://nssm.cc/download")
        print("Extraia o arquivo e coloque nssm.exe em uma pasta no PATH do sistema.")
        return False

def create_service(service_name, python_path, script_path, description):
    """Cria um serviço do Windows usando NSSM"""
    if not is_admin():
        print("Este script deve ser executado como administrador.")
        print("Por favor, feche e execute novamente como administrador.")
        return False
    
    if not install_nssm():
        return False
    
    try:
        # Caminho completo para o script
        full_script_path = os.path.abspath(script_path)
        script_dir = os.path.dirname(full_script_path)
        
        # Comando para criar o serviço
        cmd = [
            'nssm', 'install', service_name,
            python_path, full_script_path
        ]
        
        # Executa o comando para criar o serviço
        subprocess.run(cmd, check=True)
        
        # Configura o diretório de trabalho
        subprocess.run(['nssm', 'set', service_name, 'AppDirectory', script_dir], check=True)
        
        # Configura a descrição do serviço
        subprocess.run(['nssm', 'set', service_name, 'Description', description], check=True)
        
        # Configura o serviço para reiniciar automaticamente em caso de falha
        subprocess.run(['nssm', 'set', service_name, 'AppRestartDelay', '30000'], check=True)
        
        # Configura o serviço para iniciar automaticamente
        subprocess.run(['nssm', 'set', service_name, 'Start', 'SERVICE_AUTO_START'], check=True)
        
        print(f"Serviço '{service_name}' criado com sucesso!")
        print(f"Para iniciar o serviço, execute: net start {service_name}")
        print(f"Para parar o serviço, execute: net stop {service_name}")
        
        return True
    except subprocess.CalledProcessError as e:
        print(f"Erro ao criar o serviço: {e}")
        return False
    except Exception as e:
        print(f"Erro inesperado: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Instalar o backend do ERP-MANEIRO como um serviço do Windows')
    parser.add_argument('--nome', default='ERP-Maneiro-API', help='Nome do serviço (padrão: ERP-Maneiro-API)')
    parser.add_argument('--python', default=sys.executable, help='Caminho para o executável Python')
    parser.add_argument('--script', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend', 'start_production.py'),
                        help='Caminho para o script de inicialização')
    
    args = parser.parse_args()
    
    # Descrição do serviço
    description = "Servidor API do ERP Maneiro - Sistema de Gestão Empresarial"
    
    # Cria o serviço
    create_service(args.nome, args.python, args.script, description)

if __name__ == "__main__":
    main()
