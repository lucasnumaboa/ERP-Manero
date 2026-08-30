from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional
import os
import shutil

from database import get_db_cursor
from auth import get_current_user

router = APIRouter()

# Pasta onde os softwares serão armazenados (raiz do projeto)
SOFTWARES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Softwares")

# Garante que a pasta existe
os.makedirs(SOFTWARES_DIR, exist_ok=True)


@router.get("/")
async def listar_softwares(current_user: dict = Depends(get_current_user)):
    """Lista todos os softwares disponíveis"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT s.id, s.nome_arquivo, s.descricao, s.versao, s.tamanho, 
                       s.usuario_id, s.data_upload, s.data_atualizacao,
                       u.nome as usuario_nome
                FROM softwares s
                LEFT JOIN usuarios u ON s.usuario_id = u.id
                ORDER BY s.nome_arquivo ASC
            """)
            softwares = cursor.fetchall()
        
        return softwares if softwares else []
    except Exception as e:
        print(f"Erro ao listar softwares: {e}")
        return []


@router.get("/verificar/{nome_arquivo:path}")
async def verificar_software_existe(nome_arquivo: str, current_user: dict = Depends(get_current_user)):
    """Verifica se um software com o nome especificado já existe"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, nome_arquivo, versao
                FROM softwares
                WHERE nome_arquivo = %s
            """, (nome_arquivo,))
            software = cursor.fetchone()
        
        if software:
            return {"existe": True, "software": software}
        return {"existe": False, "software": None}
    except Exception as e:
        print(f"Erro ao verificar software: {e}")
        return {"existe": False, "software": None}


@router.get("/recentes")
async def listar_softwares_recentes(current_user: dict = Depends(get_current_user)):
    """Lista softwares atualizados nos últimos 5 dias"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT s.id, s.nome_arquivo, s.versao, s.data_atualizacao,
                       h.alteracoes, u.nome as usuario_nome
                FROM softwares s
                LEFT JOIN usuarios u ON s.usuario_id = u.id
                LEFT JOIN softwares_historico h ON h.software_id = s.id AND h.versao = s.versao
                WHERE s.data_atualizacao >= DATE_SUB(CURDATE(), INTERVAL 5 DAY)
                ORDER BY s.data_atualizacao DESC
            """)
            softwares = cursor.fetchall()
        
        return softwares if softwares else []
    except Exception as e:
        print(f"Erro ao listar softwares recentes: {e}")
        return []


@router.get("/historico/{software_id}")
async def obter_historico(software_id: int, current_user: dict = Depends(get_current_user)):
    """Obtém o histórico de versões de um software"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT h.id, h.software_id, h.versao, h.alteracoes, h.usuario_id, 
                       h.data_alteracao, u.nome as usuario_nome
                FROM softwares_historico h
                LEFT JOIN usuarios u ON h.usuario_id = u.id
                WHERE h.software_id = %s
                ORDER BY h.versao DESC
            """, (software_id,))
            historico = cursor.fetchall()
        
        return historico if historico else []
    except Exception as e:
        print(f"Erro ao obter histórico: {e}")
        return []


@router.get("/download/{software_id}")
async def download_software(software_id: int, current_user: dict = Depends(get_current_user)):
    """Download de um software"""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT nome_arquivo FROM softwares WHERE id = %s", (software_id,))
        software = cursor.fetchone()
    
    if not software:
        raise HTTPException(status_code=404, detail="Software não encontrado")
    
    caminho_arquivo = os.path.join(SOFTWARES_DIR, software["nome_arquivo"])
    
    if not os.path.exists(caminho_arquivo):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
    
    return FileResponse(
        path=caminho_arquivo,
        filename=software["nome_arquivo"],
        media_type="application/octet-stream"
    )


@router.get("/{software_id}")
async def obter_software(software_id: int, current_user: dict = Depends(get_current_user)):
    """Obtém detalhes de um software específico"""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT s.id, s.nome_arquivo, s.descricao, s.versao, s.tamanho, 
                   s.usuario_id, s.data_upload, s.data_atualizacao,
                   u.nome as usuario_nome
            FROM softwares s
            LEFT JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.id = %s
        """, (software_id,))
        software = cursor.fetchone()
    
    if not software:
        raise HTTPException(status_code=404, detail="Software não encontrado")
    
    return software


@router.post("/upload")
async def upload_software(
    arquivo: UploadFile = File(...),
    descricao: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload de um novo software (apenas admin)"""
    # Verifica se é admin
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem fazer upload de softwares")
    
    nome_arquivo = arquivo.filename
    caminho_arquivo = os.path.join(SOFTWARES_DIR, nome_arquivo)
    
    # Verifica se já existe no banco
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id FROM softwares WHERE nome_arquivo = %s", (nome_arquivo,))
        existe = cursor.fetchone()
    
    if existe:
        raise HTTPException(
            status_code=409,
            detail="Software já existe. Use a função de atualização para enviar uma nova versão."
        )
    
    # Salva o arquivo
    try:
        # Lê o conteúdo do arquivo
        conteudo = await arquivo.read()
        
        with open(caminho_arquivo, "wb") as buffer:
            buffer.write(conteudo)
        
        # Obtém tamanho do arquivo
        tamanho = os.path.getsize(caminho_arquivo)
        
        # Registra no banco
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                INSERT INTO softwares (nome_arquivo, descricao, versao, tamanho, usuario_id)
                VALUES (%s, %s, 1, %s, %s)
            """, (nome_arquivo, descricao or "", tamanho, current_user.id))
            software_id = cursor.lastrowid
            
            # Registra no histórico
            cursor.execute("""
                INSERT INTO softwares_historico (software_id, versao, alteracoes, usuario_id)
                VALUES (%s, 1, %s, %s)
            """, (software_id, descricao or "Versão inicial", current_user.id))
        
        return {
            "success": True,
            "message": "Software enviado com sucesso",
            "id": software_id,
            "nome_arquivo": nome_arquivo,
            "versao": 1,
            "tamanho": tamanho
        }
    
    except Exception as e:
        # Remove arquivo se falhar
        if os.path.exists(caminho_arquivo):
            os.remove(caminho_arquivo)
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")


@router.post("/atualizar/{software_id}")
async def atualizar_software(
    software_id: int,
    arquivo: UploadFile = File(...),
    alteracoes: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um software existente com nova versão (apenas admin)"""
    # Verifica se é admin
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem atualizar softwares")
    
    # Busca software atual
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, nome_arquivo, versao FROM softwares WHERE id = %s", (software_id,))
        software = cursor.fetchone()
    
    if not software:
        raise HTTPException(status_code=404, detail="Software não encontrado")
    
    nome_arquivo = software["nome_arquivo"]
    caminho_arquivo = os.path.join(SOFTWARES_DIR, nome_arquivo)
    nova_versao = software["versao"] + 1
    
    # Salva o novo arquivo (substituindo o anterior)
    try:
        # Lê o conteúdo do arquivo
        conteudo = await arquivo.read()
        
        with open(caminho_arquivo, "wb") as buffer:
            buffer.write(conteudo)
        
        # Obtém tamanho do arquivo
        tamanho = os.path.getsize(caminho_arquivo)
        
        # Atualiza no banco
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE softwares 
                SET versao = %s, tamanho = %s, usuario_id = %s, data_atualizacao = NOW()
                WHERE id = %s
            """, (nova_versao, tamanho, current_user.id, software_id))
            
            # Registra no histórico
            cursor.execute("""
                INSERT INTO softwares_historico (software_id, versao, alteracoes, usuario_id)
                VALUES (%s, %s, %s, %s)
            """, (software_id, nova_versao, alteracoes, current_user.id))
        
        return {
            "success": True,
            "message": "Software atualizado com sucesso",
            "id": software_id,
            "nome_arquivo": nome_arquivo,
            "versao": nova_versao,
            "tamanho": tamanho
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar arquivo: {str(e)}")


@router.delete("/{software_id}")
async def excluir_software(software_id: int, current_user: dict = Depends(get_current_user)):
    """Exclui um software (apenas admin)"""
    # Verifica se é admin
    if current_user.nivel_acesso != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem excluir softwares")
    
    with get_db_cursor() as cursor:
        cursor.execute("SELECT nome_arquivo FROM softwares WHERE id = %s", (software_id,))
        software = cursor.fetchone()
    
    if not software:
        raise HTTPException(status_code=404, detail="Software não encontrado")
    
    caminho_arquivo = os.path.join(SOFTWARES_DIR, software["nome_arquivo"])
    
    # Remove do banco (histórico será removido em cascata)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM softwares WHERE id = %s", (software_id,))
    
    # Remove arquivo do disco
    if os.path.exists(caminho_arquivo):
        os.remove(caminho_arquivo)
    
    return {"success": True, "message": "Software excluído com sucesso"}
