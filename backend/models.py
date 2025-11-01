from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any

# Modelos de autenticação
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    nivel_acesso: Optional[str] = None

# Modelos de usuário
class UsuarioBase(BaseModel):
    nome: str
    email: str
    nivel_acesso: str

class UsuarioCreate(UsuarioBase):
    senha: str
    grupo_id: Optional[int] = None

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    nivel_acesso: Optional[str] = None
    senha: Optional[str] = None
    grupo_id: Optional[int] = None

class PasswordChange(BaseModel):
    senha_atual: str
    nova_senha: str

class Usuario(UsuarioBase):
    id: int
    ultimo_acesso: Optional[str] = None
    last_access: Optional[str] = None
    connected: Optional[bool] = False
    grupo_id: Optional[int] = None

class UserInDB(BaseModel):
    id: int
    nome: str
    email: str
    nivel_acesso: str
    last_access: Optional[str] = None
    connected: Optional[bool] = False
    grupo_id: Optional[int] = None
