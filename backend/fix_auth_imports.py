import os
import re
import glob

def fix_imports_in_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Substituir importações do main.py para auth.py
    content = re.sub(r'from main import (get_current_user|get_password_hash|UserInDB|Token|TokenData)', r'from auth import \1', content)
    content = re.sub(r'from \.\.main import (get_current_user|get_password_hash|UserInDB|Token|TokenData)', r'from auth import \1', content)
    
    # Remover importações do sistema para resolver o path se não forem mais necessárias
    if 'from auth import' in content and 'import sys, os' in content:
        content = re.sub(r'import sys, os\nsys\.path\.append\(.*?\)\n', '', content)
    
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)
    
    print(f"Fixed imports in {file_path}")

def main():
    # Encontrar todos os arquivos Python na pasta routers
    router_files = glob.glob('routers/*.py')
    
    for file_path in router_files:
        if '__init__' not in file_path:
            fix_imports_in_file(file_path)
    
    print("All imports fixed successfully!")

if __name__ == "__main__":
    main()
