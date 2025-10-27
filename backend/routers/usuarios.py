from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from database import get_db_cursor
from auth import get_current_user, get_password_hash, verify_password
from models import Usuario, UsuarioBase, UsuarioCreate, UsuarioUpdate, UserInDB, PasswordChange

router = APIRouter()

# Rotas
@router.get("/me", response_model=Usuario)
async def get_current_user_info(current_user: UserInDB = Depends(get_current_user)):
    """
    Retorna informações do usuário atualmente autenticado.
    Requer autenticação.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, ultimo_acesso FROM usuarios WHERE id = %s",
            (current_user.id,)
        )
        usuario = cursor.fetchone()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Converter o campo ultimo_acesso para string se for um objeto datetime
    if usuario and usuario.get('ultimo_acesso'):
        usuario['ultimo_acesso'] = str(usuario['ultimo_acesso'])
    
    return usuario
@router.get("/", response_model=List[Usuario])
async def listar_usuarios(current_user: UserInDB = Depends(get_current_user)):
    """
    Lista todos os usuários cadastrados no sistema.
    Requer autenticação com nível de acesso 'admin'.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar este recurso"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, ultimo_acesso FROM usuarios"
        )
        usuarios = cursor.fetchall()
    
    # Converter o campo ultimo_acesso para string se for um objeto datetime
    for usuario in usuarios:
        if usuario and usuario.get('ultimo_acesso'):
            usuario['ultimo_acesso'] = str(usuario['ultimo_acesso'])
    
    return usuarios

@router.get("/{usuario_id}", response_model=Usuario)
async def obter_usuario(
    usuario_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Obtém os detalhes de um usuário específico.
    Requer autenticação. Usuários normais só podem ver seus próprios dados.
    """
    if current_user.nivel_acesso != "admin" and current_user.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar este recurso"
        )
    
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, ultimo_acesso FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
        usuario = cursor.fetchone()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Converter o campo ultimo_acesso para string se for um objeto datetime
    if usuario and usuario.get('ultimo_acesso'):
        usuario['ultimo_acesso'] = str(usuario['ultimo_acesso'])
    
    return usuario

@router.post("/", response_model=Usuario, status_code=status.HTTP_201_CREATED)
async def criar_usuario(
    usuario: UsuarioCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Cria um novo usuário no sistema.
    Requer autenticação com nível de acesso 'admin'.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar este recurso"
        )
    
    # Verifica se o email já está em uso
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM usuarios WHERE email = %s",
            (usuario.email,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já está em uso"
            )
    
    # Cria o usuário
    hashed_password = get_password_hash(usuario.senha)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO usuarios (nome, email, senha, nivel_acesso)
            VALUES (%s, %s, %s, %s)
            """,
            (usuario.nome, usuario.email, hashed_password, usuario.nivel_acesso)
        )
        
        # Obtém o ID do usuário criado
        cursor.execute("SELECT LAST_INSERT_ID()")
        usuario_id = cursor.fetchone()["LAST_INSERT_ID()"]
        
        # Obtém os dados do usuário criado
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, ultimo_acesso FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
        novo_usuario = cursor.fetchone()
    
    # Converter o campo ultimo_acesso para string se for um objeto datetime
    if novo_usuario and novo_usuario.get('ultimo_acesso'):
        novo_usuario['ultimo_acesso'] = str(novo_usuario['ultimo_acesso'])
    
    return novo_usuario

@router.put("/{usuario_id}", response_model=Usuario)
async def atualizar_usuario(
    usuario_id: int,
    usuario: UsuarioUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza os dados de um usuário existente.
    Requer autenticação. Usuários normais só podem atualizar seus próprios dados.
    """
    if current_user.nivel_acesso != "admin" and current_user.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar este recurso"
        )
    
    # Verifica se o usuário existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
    
    # Prepara os dados para atualização
    update_data = {}
    if usuario.nome:
        update_data["nome"] = usuario.nome
    if usuario.email:
        update_data["email"] = usuario.email
    if usuario.nivel_acesso and current_user.nivel_acesso == "admin":
        update_data["nivel_acesso"] = usuario.nivel_acesso
    if usuario.senha:
        update_data["senha"] = get_password_hash(usuario.senha)
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dado para atualizar"
        )
    
    # Atualiza o usuário
    with get_db_cursor(commit=True) as cursor:
        set_clause = ", ".join([f"{key} = %s" for key in update_data.keys()])
        values = list(update_data.values())
        values.append(usuario_id)
        
        cursor.execute(
            f"UPDATE usuarios SET {set_clause} WHERE id = %s",
            values
        )
        
        # Obtém os dados atualizados
        cursor.execute(
            "SELECT id, nome, email, nivel_acesso, ultimo_acesso FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
        usuario_atualizado = cursor.fetchone()
    
    # Converter o campo ultimo_acesso para string se for um objeto datetime
    if usuario_atualizado and usuario_atualizado.get('ultimo_acesso'):
        usuario_atualizado['ultimo_acesso'] = str(usuario_atualizado['ultimo_acesso'])
    
    return usuario_atualizado

@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_usuario(
    usuario_id: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Exclui um usuário do sistema.
    Requer autenticação com nível de acesso 'admin'.
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar este recurso"
        )
    
    # Verifica se o usuário existe
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
    
    # Exclui o usuário
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM usuarios WHERE id = %s",
            (usuario_id,)
        )
    
    return None

@router.put("/me/senha", status_code=status.HTTP_200_OK)
async def alterar_senha(
    password_data: PasswordChange,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Altera a senha do usuário atualmente autenticado.
    Requer autenticação e validação da senha atual.
    """
    # Busca a senha atual do usuário no banco
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT senha FROM usuarios WHERE id = %s",
            (current_user.id,)
        )
        user_data = cursor.fetchone()
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Verifica se a senha atual está correta
    if not verify_password(password_data.senha_atual, user_data['senha']):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta"
        )
    
    # Gera o hash da nova senha
    new_password_hash = get_password_hash(password_data.nova_senha)
    
    # Atualiza a senha no banco
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE usuarios SET senha = %s WHERE id = %s",
            (new_password_hash, current_user.id)
        )
    
    return {"message": "Senha alterada com sucesso"}
