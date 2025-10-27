import os
import re
import glob

def fix_imports_in_file(file_path):
    print(f"Processando arquivo: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Substituir importações do main.py para auth.py e models.py
    content = re.sub(r'from main import (get_current_user|get_password_hash)', r'from auth import \1', content)
    content = re.sub(r'from main import (UserInDB|Token|TokenData)', r'from models import \1', content)
    content = re.sub(r'from \.\.main import (get_current_user|get_password_hash)', r'from auth import \1', content)
    content = re.sub(r'from \.\.main import (UserInDB|Token|TokenData)', r'from models import \1', content)
    
    # Remover importações do sistema para resolver o path se não forem mais necessárias
    content = re.sub(r'import sys, os\nsys\.path\.append\(.*?\)\n', '', content)
    
    # Substituir importações relativas por absolutas
    content = content.replace('from ..database import', 'from database import')
    
    # Verificar se há modelos Pydantic definidos no arquivo que devem ser movidos para models.py
    if 'class' in content and 'BaseModel' in content:
        # Adicionar importação de models.py se necessário
        if not 'from models import' in content:
            content = re.sub(r'from pydantic import (BaseModel.*)', r'from pydantic import \1\nfrom models import UserInDB', content)
    
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)
    
    print(f"Corrigido: {file_path}")

def main():
    # Encontrar todos os arquivos Python na pasta routers
    router_files = glob.glob('routers/*.py')
    
    for file_path in router_files:
        if '__init__' not in file_path:
            fix_imports_in_file(file_path)
    
    print("Todas as importações foram corrigidas com sucesso!")

if __name__ == "__main__":
    main()
