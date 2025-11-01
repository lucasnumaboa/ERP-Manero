"""
API Config Manager - Gerencia a configuração dinâmica da API
Este módulo permite que o servidor verifique o link_api a cada requisição
sem precisar reiniciar o servidor.
"""

import time
import logging
from database import get_db_cursor

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api-config-manager")

# Cache para as configurações da API
_api_config_cache = {
    "link": None,
    "port": None,
    "host": None,
    "last_check": 0
}

# Tempo de expiração do cache em segundos (10 segundos)
CACHE_EXPIRATION = 10

def get_api_config():
    """
    Obtém a configuração atual da API, verificando o banco de dados
    se o cache estiver expirado.
    """
    current_time = time.time()
    
    # Verifica se o cache expirou
    if _api_config_cache["last_check"] == 0 or (current_time - _api_config_cache["last_check"]) > CACHE_EXPIRATION:
        refresh_api_config()
    
    return {
        "link": _api_config_cache["link"],
        "port": _api_config_cache["port"],
        "host": _api_config_cache["host"]
    }

def refresh_api_config():
    """
    Atualiza o cache com as configurações mais recentes do banco de dados.
    """
    try:
        with get_db_cursor() as cursor:
            # Verifica se a tabela link_api existe
            cursor.execute("""
                SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_schema = DATABASE() AND table_name = 'link_api'
            """)
            
            if cursor.fetchone()['count'] > 0:
                # Obtém o link da API da tabela link_api
                cursor.execute("SELECT link FROM link_api LIMIT 1")
                result = cursor.fetchone()
                
                if result and result['link']:
                    link = result['link']
                    _api_config_cache["link"] = link
                    
                    # Extrai a porta e o host do link
                    if "://" in link:
                        link = link.split("://")[1]
                    
                    # Separa o host e a porta
                    if ":" in link:
                        host_part = link.split(":")[0]
                        port_part = link.split(":")[1]
                        
                        # Remove qualquer caminho após a porta
                        if "/" in port_part:
                            port_part = port_part.split("/")[0]
                        
                        try:
                            port_int = int(port_part)
                            if port_int < 1 or port_int > 65535:
                                raise ValueError("Porta fora do intervalo válido")
                            
                            _api_config_cache["port"] = port_int
                            _api_config_cache["host"] = host_part
                            logger.info(f"Configuração atualizada da tabela link_api: {host_part}:{port_int}")
                        except ValueError:
                            logger.warning(f"Valor de porta inválido no link: {link}. Usando configuração padrão.")
                            _api_config_cache["port"] = 8000
                            _api_config_cache["host"] = "0.0.0.0"
                    else:
                        # Se não houver porta especificada, usa o host do link
                        if "/" in link:
                            host_part = link.split("/")[0]
                        else:
                            host_part = link
                        _api_config_cache["host"] = host_part
                        _api_config_cache["port"] = 8000
                        logger.info(f"Usando host da tabela link_api: {host_part} com porta padrão 8000")
                else:
                    # Fallback para configurações padrão
                    _api_config_cache["link"] = "http://localhost:8000"
                    _api_config_cache["port"] = 8000
                    _api_config_cache["host"] = "0.0.0.0"
            else:
                # Fallback para a tabela de configurações
                cursor.execute("""
                    SELECT COUNT(*) as count FROM information_schema.tables 
                    WHERE table_schema = DATABASE() AND table_name = 'configuracoes'
                """)
                
                if cursor.fetchone()['count'] > 0:
                    # Verifica se existe a configuração de porta
                    cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'api_port'")
                    port_result = cursor.fetchone()
                    
                    if port_result:
                        try:
                            _api_config_cache["port"] = int(port_result['valor'])
                        except ValueError:
                            _api_config_cache["port"] = 8000
                    else:
                        _api_config_cache["port"] = 8000
                    
                    # Verifica se existe a configuração de link_api
                    cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'link_api'")
                    link_result = cursor.fetchone()
                    
                    if link_result:
                        _api_config_cache["link"] = link_result['valor']
                    else:
                        _api_config_cache["link"] = "http://localhost:8000"
                    
                    _api_config_cache["host"] = "0.0.0.0"
                else:
                    # Configurações padrão se nada for encontrado
                    _api_config_cache["link"] = "http://localhost:8000"
                    _api_config_cache["port"] = 8000
                    _api_config_cache["host"] = "0.0.0.0"
        
        # Atualiza o timestamp da última verificação
        _api_config_cache["last_check"] = time.time()
        
    except Exception as e:
        logger.error(f"Erro ao atualizar configurações da API: {str(e)}")
        # Em caso de erro, usa valores padrão
        _api_config_cache["link"] = "http://localhost:8000"
        _api_config_cache["port"] = 8000
        _api_config_cache["host"] = "0.0.0.0"
        _api_config_cache["last_check"] = time.time()