import os
import re
import glob

def fix_imports_in_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Substituir importações relativas por absolutas
    content = re.sub(r'from \.\.([\w\.]+) import', r'from \1 import', content)
    content = re.sub(r'from \.([\w\.]+) import', r'from routers.\1 import', content)
    
    # Adicionar importação do sistema para resolver o path
    if 'from ..main import' in content or 'from ..database import' in content:
        if 'import sys, os' not in content:
            content = content.replace('from fastapi import', 'import sys, os\nsys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))\nfrom fastapi import')
    
    # Substituir importações específicas
    content = content.replace('from ..database import', 'from database import')
    content = content.replace('from ..main import', 'from main import')
    
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
