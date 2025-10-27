from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from database import get_db_cursor
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from models import Token, TokenData, UserInDB

# Utilitários de segurança
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Funções de autenticação
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# Funções de token
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Função para obter o usuário atual
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, last_access, connected FROM usuarios WHERE email = %s",
            (token_data.username,)
        )
        user = cursor.fetchone()
    
    if user is None:
        raise credentials_exception
    
    # Converte os dados para o formato esperado pelo modelo
    user_data = {
        "id": user["id"],
        "nome": user["nome"],
        "email": user["email"],
        "nivel_acesso": user["nivel_acesso"],
        "last_access": user["last_access"].isoformat() if user["last_access"] else None,
        "connected": bool(user["connected"]) if user["connected"] is not None else False
    }
    
    # Verifica se o usuário está conectado
    if not user_data["connected"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário desconectado por inatividade",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Atualiza o last_access a cada requisição autenticada
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE usuarios SET last_access = NOW() WHERE id = %s",
            (user_data["id"],)
        )
    
    return UserInDB(**user_data)
