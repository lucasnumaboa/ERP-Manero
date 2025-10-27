import uvicorn
import os
import sys

# Adiciona o diretório pai ao path do Python para permitir importações relativas
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if __name__ == "__main__":
    # Importa e inicia o gerenciador de timeout
    from timeout_manager import start_timeout_manager
    from database import get_db_cursor
    
    # Obter a porta da configuração do banco de dados
    port = 8000
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'api_port'")
            result = cursor.fetchone()
            if result and result['valor']:
                port = int(result['valor'])
    except Exception as e:
        print(f"Erro ao obter porta da API: {e}")
        print("Usando porta padrão 8000")
    
    # Verificar se é ambiente de produção
    is_production = False
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'environment'")
            result = cursor.fetchone()
            if result and result['valor'] == 'production':
                is_production = True
    except Exception as e:
        print(f"Erro ao verificar ambiente: {e}")
    
    # Inicializar o gerenciador de timeout
    print("Iniciando gerenciador de timeout...")
    start_timeout_manager()
    
    print(f"Iniciando servidor na porta {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=not is_production)
