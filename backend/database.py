import threading
import mysql.connector
from mysql.connector import pooling
from contextlib import contextmanager
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT

# Configurações do banco de dados
db_config = {
    'host': DB_HOST,
    'user': DB_USER,
    'password': DB_PASSWORD,
    'database': DB_NAME,
    'port': DB_PORT
}

# Conexões reaproveitadas entre requisições (abrir uma conexão nova custa mais que a consulta típica).
TAMANHO_POOL = 20
_pool = None
_pool_lock = threading.Lock()


def _obter_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="erp", pool_size=TAMANHO_POOL, pool_reset_session=True, **db_config
                )
    return _pool


def _abrir_conexao():
    try:
        conn = _obter_pool().get_connection()
    except pooling.errors.PoolError:
        # Pool esgotado num pico: abre uma conexão avulsa em vez de falhar a requisição.
        return mysql.connector.connect(**db_config)
    # Conexão parada no pool pode ter caído (wait_timeout do MySQL); reconecta se preciso.
    conn.ping(reconnect=True, attempts=2, delay=0)
    return conn


@contextmanager
def get_db_connection():
    """
    Gerenciador de contexto para conexões com o banco de dados.
    Ao sair, a conexão volta para o pool (ou é fechada, se for avulsa).
    """
    conn = None
    try:
        conn = _abrir_conexao()
        yield conn
    finally:
        if conn is not None:
            try:
                conn.close()
            except mysql.connector.Error:
                pass

@contextmanager
def get_db_cursor(commit=False):
    """
    Gerenciador de contexto para cursores de banco de dados.
    Opcionalmente realiza commit após as operações.
    """
    with get_db_connection() as conn:
        # Add buffered=True to prevent "Unread result found" errors
        cursor = conn.cursor(dictionary=True, buffered=True)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception:
            if commit:
                conn.rollback()
            raise
        finally:
            cursor.close()

# Alternative: Separate cursors for different operations
@contextmanager
def get_db_cursor_unbuffered(commit=False):
    """
    Gerenciador de contexto para cursores não-bufferizados.
    Use quando você souber que vai consumir todos os resultados.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(dictionary=True, buffered=False)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception:
            if commit:
                conn.rollback()
            raise
        finally:
            # Consume any remaining results before closing
            try:
                while cursor.nextset():
                    pass
            except:
                pass
            cursor.close()

# Utility function to safely execute queries
def safe_execute(cursor, query, params=None):
    """
    Executa uma query de forma segura, limpando resultados anteriores.
    """
    # Clear any unread results
    try:
        while cursor.nextset():
            pass
    except:
        pass
    
    # Execute the query
    if params:
        cursor.execute(query, params)
    else:
        cursor.execute(query)
    
    return cursor