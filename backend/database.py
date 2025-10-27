import mysql.connector
from contextlib import contextmanager
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# Configurações do banco de dados
db_config = {
    'host': DB_HOST,
    'user': DB_USER,
    'password': DB_PASSWORD,
    'database': DB_NAME
}

@contextmanager
def get_db_connection():
    """
    Gerenciador de contexto para conexões com o banco de dados.
    Garante que a conexão seja fechada após o uso.
    """
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        yield conn
    finally:
        if conn is not None and conn.is_connected():
            conn.close()

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