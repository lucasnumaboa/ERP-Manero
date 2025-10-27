import threading
import time
from datetime import datetime, timedelta
from database import get_db_cursor
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TimeoutManager:
    def __init__(self):
        self.running = False
        self.thread = None
        self.timeout_minutes = 15  # Valor padrão
        
    def get_timeout_setting(self):
        """Obtém a configuração de timeout do banco de dados"""
        try:
            with get_db_cursor() as cursor:
                cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'timeout_time'")
                result = cursor.fetchone()
                if result and result['valor']:
                    self.timeout_minutes = int(result['valor'])
                    logger.info(f"Timeout configurado para {self.timeout_minutes} minutos")
                else:
                    logger.warning("Configuração de timeout não encontrada, usando valor padrão de 15 minutos")
        except Exception as e:
            logger.error(f"Erro ao obter configuração de timeout: {e}")
            
    def check_user_timeouts(self):
        """Verifica e desconecta usuários que excederam o tempo limite"""
        try:
            # Obtém a configuração atual de timeout
            self.get_timeout_setting()
            
            # Calcula o tempo limite
            timeout_threshold = datetime.now() - timedelta(minutes=self.timeout_minutes)
            
            with get_db_cursor(commit=True) as cursor:
                # Busca usuários conectados que excederam o tempo limite
                cursor.execute("""
                    SELECT id, nome, email, last_access 
                    FROM usuarios 
                    WHERE connected = TRUE 
                    AND (last_access IS NULL OR last_access < %s)
                """, (timeout_threshold,))
                
                expired_users = cursor.fetchall()
                
                if expired_users:
                    # Desconecta os usuários que excederam o tempo limite
                    user_ids = [user['id'] for user in expired_users]
                    placeholders = ','.join(['%s'] * len(user_ids))
                    
                    cursor.execute(f"""
                        UPDATE usuarios 
                        SET connected = FALSE 
                        WHERE id IN ({placeholders})
                    """, user_ids)
                    
                    logger.info(f"Desconectados {len(expired_users)} usuários por timeout:")
                    for user in expired_users:
                        last_access = user['last_access'] if user['last_access'] else 'Nunca'
                        logger.info(f"  - {user['nome']} ({user['email']}) - Último acesso: {last_access}")
                else:
                    logger.debug("Nenhum usuário para desconectar por timeout")
                    
        except Exception as e:
            logger.error(f"Erro ao verificar timeouts de usuários: {e}")
            
    def timeout_worker(self):
        """Worker thread que executa a verificação de timeout a cada minuto"""
        logger.info("Thread de timeout iniciada")
        
        while self.running:
            try:
                self.check_user_timeouts()
                # Aguarda 60 segundos antes da próxima verificação
                time.sleep(60)
            except Exception as e:
                logger.error(f"Erro na thread de timeout: {e}")
                time.sleep(60)  # Aguarda antes de tentar novamente
                
        logger.info("Thread de timeout finalizada")
        
    def start(self):
        """Inicia o gerenciador de timeout"""
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self.timeout_worker, daemon=True)
            self.thread.start()
            logger.info("Gerenciador de timeout iniciado")
        else:
            logger.warning("Gerenciador de timeout já está em execução")
            
    def stop(self):
        """Para o gerenciador de timeout"""
        if self.running:
            self.running = False
            if self.thread:
                self.thread.join(timeout=5)
            logger.info("Gerenciador de timeout parado")
        else:
            logger.warning("Gerenciador de timeout não está em execução")

# Instância global do gerenciador de timeout
timeout_manager = TimeoutManager()

def start_timeout_manager():
    """Função para iniciar o gerenciador de timeout"""
    timeout_manager.start()

def stop_timeout_manager():
    """Função para parar o gerenciador de timeout"""
    timeout_manager.stop()