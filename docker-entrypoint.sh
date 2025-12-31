#!/bin/bash
set -e

echo "Aguardando MySQL ficar disponível..."

# Wait for MySQL to be ready
while ! nc -z $DB_HOST ${DB_PORT:-3306}; do
    echo "MySQL não está pronto - aguardando..."
    sleep 2
done

echo "MySQL está pronto!"

# Wait a bit more for MySQL to fully initialize
sleep 5

# Initialize the database
echo "Inicializando banco de dados..."
cd /app
python init_db.py

echo "Banco de dados inicializado com sucesso!"

# Start the backend server
echo "Iniciando servidor FastAPI..."
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port 8000
