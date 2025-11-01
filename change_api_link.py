import os
import re
import mysql.connector
import glob
import json
from pathlib import Path
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

# Arquivo para armazenar a última URL utilizada
LAST_URL_FILE = Path(__file__).parent / "last_api_url.json"

def get_api_link_from_db():
    """Obtém o link da API da tabela configuracoes no banco de dados MySQL."""
    try:
        # Obtém as configurações do banco de dados do arquivo .env
        db_host = os.getenv("DB_HOST", "localhost")
        db_user = os.getenv("DB_USER", "acore")
        db_password = os.getenv("DB_PASSWORD", "acore")
        db_name = os.getenv("DB_NAME", "erp_maneiro")
        db_port = int(os.getenv("DB_PORT", "3306"))
        
        # Conecta ao banco de dados MySQL
        conn = mysql.connector.connect(
            host=db_host,
            user=db_user,
            password=db_password,
            database=db_name,
            port=db_port
        )
        cursor = conn.cursor()
        
        # Consulta o valor do link_api na tabela configuracoes
        # Nota: Estamos verificando a tabela 'configuracoes' e também a tabela 'configuracoes_sistema'
        # já que não sabemos o nome exato da tabela
        try:
            cursor.execute("SHOW TABLES LIKE '%configurac%'")
            tables = cursor.fetchall()
            
            if not tables:
                raise Exception("Nenhuma tabela de configurações encontrada")
            
            table_name = tables[0][0]
            print(f"Tabela de configurações encontrada: {table_name}")
            
            # Verificar as colunas da tabela
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            
            # Procurar colunas que podem conter a chave e o valor
            key_column = None
            value_column = None
            
            for col in column_names:
                if col.lower() in ['chave', 'key', 'nome', 'name']:
                    key_column = col
                elif col.lower() in ['valor', 'value', 'conteudo', 'content']:
                    value_column = col
            
            if not key_column or not value_column:
                raise Exception(f"Colunas de chave/valor não encontradas na tabela {table_name}")
            
            print(f"Usando colunas: {key_column} (chave) e {value_column} (valor)")
            
            # Consultar o valor do link_api
            cursor.execute(f"SELECT {value_column} FROM {table_name} WHERE {key_column} = 'link_api'")
            result = cursor.fetchone()
            
            if result:
                return result[0]
            else:
                print(f"Configuração 'link_api' não encontrada na tabela {table_name}.")
                return "http://localhost:8000"  # Valor padrão
                
        except Exception as table_error:
            print(f"Erro ao consultar tabela: {table_error}")
            return "http://localhost:8000"  # Valor padrão
            
    except Exception as e:
        print(f"Erro ao acessar o banco de dados: {e}")
        return "http://localhost:8000"  # Valor padrão em caso de erro
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def get_last_url():
    """Obtém a última URL utilizada."""
    try:
        if LAST_URL_FILE.exists():
            with open(LAST_URL_FILE, 'r') as file:
                data = json.load(file)
                return data.get('last_url', 'http://localhost:8000')
        return 'http://localhost:8000'  # Valor padrão se o arquivo não existir
    except Exception as e:
        print(f"Erro ao ler a última URL: {e}")
        return 'http://localhost:8000'  # Valor padrão em caso de erro

def save_last_url(url):
    """Salva a última URL utilizada."""
    try:
        with open(LAST_URL_FILE, 'w') as file:
            json.dump({'last_url': url}, file)
        return True
    except Exception as e:
        print(f"Erro ao salvar a última URL: {e}")
        return False

def update_config_api_html(api_url):
    """Atualiza o arquivo config_api.html com o novo link da API."""
    config_file_path = Path(__file__).parent / "frontend" / "config_api.html"
    
    try:
        # Lê o conteúdo do arquivo
        with open(config_file_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Padrão para encontrar a definição do apiUrl no localStorage
        pattern = r"(let currentApiUrl = localStorage\.getItem\('api_base_url'\) \|\| )'[^']*'"
        
        # Substitui o valor padrão pelo valor do banco de dados
        updated_content = re.sub(pattern, f"\\1'{api_url}'", content)
        
        # Escreve o conteúdo atualizado de volta no arquivo
        with open(config_file_path, 'w', encoding='utf-8') as file:
            file.write(updated_content)
        
        print(f"Arquivo config_api.html atualizado com sucesso. API URL: {api_url}")
        return True
    except Exception as e:
        print(f"Erro ao atualizar o arquivo config_api.html: {e}")
        return False

def update_js_files(api_url):
    """Atualiza todos os arquivos JS na pasta frontend/js substituindo a URL anterior pela nova."""
    js_folder_path = Path(__file__).parent / "frontend" / "js"
    
    # Obtém a URL anterior
    last_url = get_last_url()
    print(f"URL anterior: {last_url}")
    print(f"Nova URL: {api_url}")
    
    if last_url == api_url:
        print("A URL não mudou, mas os arquivos serão atualizados mesmo assim.")
    
    # Encontra todos os arquivos JS na pasta
    js_files = glob.glob(str(js_folder_path / "**/*.js"), recursive=True)
    
    updated_count = 0
    
    for js_file in js_files:
        try:
            # Lê o conteúdo do arquivo
            with open(js_file, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Prepara as URLs sem protocolo para substituição em strings
            last_url_without_protocol = last_url.replace('http://', '').replace('https://', '')
            api_url_without_protocol = api_url.replace('http://', '').replace('https://', '')
            
            # Substitui a URL anterior pela nova em diferentes formatos
            updated_content = content
            
            # Substitui URLs completas (com http:// ou https://)
            updated_content = updated_content.replace(last_url, api_url)
            
            # Substitui URLs sem protocolo em strings
            updated_content = updated_content.replace(f'"{last_url_without_protocol}', f'"{api_url_without_protocol}')
            updated_content = updated_content.replace(f"'{last_url_without_protocol}", f"'{api_url_without_protocol}")
            updated_content = updated_content.replace(f"`{last_url_without_protocol}", f"`{api_url_without_protocol}")
            
            # Substitui URLs hardcoded para imagens (com /uploads/)
            updated_content = updated_content.replace(f'"{last_url}/uploads/', f'"{api_url}/uploads/')
            updated_content = updated_content.replace(f"'{last_url}/uploads/", f"'{api_url}/uploads/")
            updated_content = updated_content.replace(f"`{last_url}/uploads/", f"`{api_url}/uploads/")
            
            # Substitui URLs hardcoded para imagens sem protocolo
            updated_content = updated_content.replace(f'"{last_url_without_protocol}/uploads/', f'"{api_url_without_protocol}/uploads/')
            updated_content = updated_content.replace(f"'{last_url_without_protocol}/uploads/", f"'{api_url_without_protocol}/uploads/")
            updated_content = updated_content.replace(f"`{last_url_without_protocol}/uploads/", f"`{api_url_without_protocol}/uploads/")
            
            # Escreve o conteúdo atualizado de volta no arquivo
            with open(js_file, 'w', encoding='utf-8') as file:
                file.write(updated_content)
            
            updated_count += 1
            print(f"Arquivo atualizado: {js_file}")
        
        except Exception as e:
            print(f"Erro ao processar o arquivo {js_file}: {e}")
    
    # Salva a nova URL como a última utilizada
    save_last_url(api_url)
    
    print(f"Total de {updated_count} arquivos JS atualizados com sucesso.")
    return updated_count > 0

def main():
    """Função principal que coordena a atualização do link da API."""
    # Obtém o link da API do banco de dados
    api_url = get_api_link_from_db()
    print(f"Link da API obtido: {api_url}")
    
    # Atualiza o arquivo config_api.html
    config_updated = update_config_api_html(api_url)
    
    # Atualiza todos os arquivos JS na pasta frontend/js
    js_files_updated = update_js_files(api_url)
    
    if config_updated and js_files_updated:
        print("Configuração da API atualizada com sucesso em todos os arquivos!")
    else:
        print("Houve problemas ao atualizar a configuração da API em alguns arquivos.")

if __name__ == "__main__":
    main()