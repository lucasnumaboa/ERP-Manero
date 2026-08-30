"""
Router para gerenciamento do Calendário de Datas Comemorativas
Inclui CRUD, importação CSV, configuração de notificações e thread de background
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from database import get_db_cursor
from auth import get_current_user
import threading
import time
import csv
import io
import logging

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Modelos Pydantic
class CalendarioBase(BaseModel):
    data: date
    descricao: str
    notifica: bool = True

class CalendarioCreate(CalendarioBase):
    pass

class CalendarioUpdate(CalendarioBase):
    pass

class CalendarioResponse(CalendarioBase):
    id: int
    data_cadastro: Optional[datetime] = None
    usuario_id: Optional[int] = None

class CalendarioConfigBase(BaseModel):
    notifica_ativo: bool = False
    total_notificacoes: int = 3
    dias_antes: int = 30

class CalendarioConfigUpdate(CalendarioConfigBase):
    pass

class CalendarioConfigResponse(CalendarioConfigBase):
    id: int
    ultima_execucao: Optional[datetime] = None

router = APIRouter(
    prefix="/calendario",
    tags=["calendario"]
)

# ============================================
# CRUD de Datas Comemorativas
# ============================================

@router.get("/", response_model=List[dict])
async def listar_datas(
    ano: Optional[int] = None,
    current_user = Depends(get_current_user)
):
    """Lista todas as datas comemorativas, opcionalmente filtradas por ano"""
    with get_db_cursor() as cursor:
        if ano:
            cursor.execute("""
                SELECT id, data, descricao, notifica, usuario_id, data_cadastro
                FROM calendario
                WHERE YEAR(data) = %s
                ORDER BY data
            """, (ano,))
        else:
            cursor.execute("""
                SELECT id, data, descricao, notifica, usuario_id, data_cadastro
                FROM calendario
                ORDER BY data
            """)
        datas = cursor.fetchall()
        return datas

@router.get("/{id}")
async def buscar_data(id: int, current_user = Depends(get_current_user)):
    """Busca uma data comemorativa pelo ID"""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, data, descricao, notifica, usuario_id, data_cadastro
            FROM calendario
            WHERE id = %s
        """, (id,))
        data_comemorativa = cursor.fetchone()
        
        if not data_comemorativa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data comemorativa com ID {id} não encontrada"
            )
        return data_comemorativa

@router.post("/")
async def criar_data(
    data_info: CalendarioCreate,
    current_user = Depends(get_current_user)
):
    """Cria uma nova data comemorativa (apenas admin)"""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem criar datas comemorativas"
        )
    
    with get_db_cursor(commit=True) as cursor:
        try:
            cursor.execute("""
                INSERT INTO calendario (data, descricao, notifica, usuario_id)
                VALUES (%s, %s, %s, %s)
            """, (data_info.data, data_info.descricao, data_info.notifica, current_user.id))
            
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            novo_id = cursor.fetchone()["id"]
            
            return {
                "id": novo_id,
                "data": str(data_info.data),
                "descricao": data_info.descricao,
                "notifica": data_info.notifica,
                "message": "Data comemorativa criada com sucesso"
            }
        except Exception as e:
            if "Duplicate entry" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Já existe uma data comemorativa com esta data e descrição"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e)
            )

@router.put("/{id}")
async def atualizar_data(
    id: int,
    data_info: CalendarioUpdate,
    current_user = Depends(get_current_user)
):
    """Atualiza uma data comemorativa (apenas admin)"""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem atualizar datas comemorativas"
        )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM calendario WHERE id = %s", (id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data comemorativa com ID {id} não encontrada"
            )
        
        cursor.execute("""
            UPDATE calendario
            SET data = %s, descricao = %s, notifica = %s
            WHERE id = %s
        """, (data_info.data, data_info.descricao, data_info.notifica, id))
        
        return {
            "id": id,
            "data": str(data_info.data),
            "descricao": data_info.descricao,
            "notifica": data_info.notifica,
            "message": "Data comemorativa atualizada com sucesso"
        }

@router.delete("/{id}")
async def excluir_data(id: int, current_user = Depends(get_current_user)):
    """Exclui uma data comemorativa (apenas admin)"""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem excluir datas comemorativas"
        )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT descricao FROM calendario WHERE id = %s", (id,))
        data_info = cursor.fetchone()
        
        if not data_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data comemorativa com ID {id} não encontrada"
            )
        
        cursor.execute("DELETE FROM calendario WHERE id = %s", (id,))
        
        return {"message": f"Data comemorativa '{data_info['descricao']}' excluída com sucesso"}

# ============================================
# Importação de CSV
# ============================================

@router.post("/importar-csv")
async def importar_csv(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """
    Importa datas comemorativas de um arquivo CSV (apenas admin)
    Formato esperado: data (DD/MM/AAAA), descricao, notifica (sim/não)
    Aceita vírgula (,) ou ponto-e-vírgula (;) como separador
    """
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem importar datas"
        )
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo deve ser um CSV"
        )
    
    try:
        content = await file.read()
        # Tenta decodificar com diferentes encodings
        try:
            decoded = content.decode('utf-8')
        except UnicodeDecodeError:
            decoded = content.decode('latin-1')
        
        # Detecta o delimitador (vírgula ou ponto-e-vírgula)
        first_line = decoded.split('\n')[0] if decoded else ''
        delimiter = ';' if ';' in first_line else ','
        logger.info(f"[Calendario] Delimitador detectado: '{delimiter}'")
        
        reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
        
        linhas_importadas = 0
        linhas_erro = []
        linhas_duplicadas = 0
        
        with get_db_cursor(commit=True) as cursor:
            for i, row in enumerate(reader):
                # Verifica se é linha de cabeçalho (verificando se o primeiro campo parece ser uma data)
                if i == 0 and len(row) >= 1:
                    primeiro_campo = row[0].strip().lower()
                    # Se o primeiro campo for "data" ou similar, pula o header
                    if primeiro_campo in ['data', 'date', 'dt']:
                        continue
                
                if len(row) < 3:
                    linhas_erro.append(f"Linha {i + 1}: formato inválido (esperado 3 colunas, encontrado {len(row)})")
                    continue
                
                try:
                    # Parseia a data no formato DD/MM/AAAA
                    data_str = row[0].strip()
                    descricao = row[1].strip()
                    notifica_str = row[2].strip().lower()
                    
                    # Converte data
                    partes = data_str.split('/')
                    if len(partes) == 3:
                        data_obj = date(int(partes[2]), int(partes[1]), int(partes[0]))
                    else:
                        linhas_erro.append(f"Linha {i + 1}: data inválida '{data_str}'")
                        continue
                    
                    # Converte notifica
                    notifica = notifica_str in ['sim', 's', 'yes', 'y', '1', 'true']
                    
                    # Insere no banco
                    try:
                        cursor.execute("""
                            INSERT INTO calendario (data, descricao, notifica, usuario_id)
                            VALUES (%s, %s, %s, %s)
                        """, (data_obj, descricao, notifica, current_user.id))
                        linhas_importadas += 1
                    except Exception as insert_error:
                        if "Duplicate entry" in str(insert_error):
                            linhas_duplicadas += 1
                        else:
                            linhas_erro.append(f"Linha {i + 1}: {str(insert_error)}")
                    
                except Exception as e:
                    linhas_erro.append(f"Linha {i + 1}: {str(e)}")
        
        return {
            "message": "Importação concluída",
            "linhas_importadas": linhas_importadas,
            "linhas_duplicadas": linhas_duplicadas,
            "linhas_erro": len(linhas_erro),
            "detalhes_erro": linhas_erro[:10]  # Limita a 10 erros
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao processar arquivo: {str(e)}"
        )

# ============================================
# Configuração de Notificações
# ============================================

@router.get("/config/atual")
async def buscar_config(current_user = Depends(get_current_user)):
    """Busca a configuração atual de notificações"""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT * FROM calendario_config LIMIT 1")
        config = cursor.fetchone()
        
        if not config:
            # Cria configuração padrão
            cursor.execute("""
                INSERT INTO calendario_config (notifica_ativo, total_notificacoes, dias_antes)
                VALUES (FALSE, 3, 30)
            """)
            cursor.execute("SELECT * FROM calendario_config LIMIT 1")
            config = cursor.fetchone()
        
        return config

@router.put("/config/atualizar")
async def atualizar_config(
    config: CalendarioConfigUpdate,
    current_user = Depends(get_current_user)
):
    """Atualiza a configuração de notificações (apenas admin)"""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem alterar configurações"
        )
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("SELECT id FROM calendario_config LIMIT 1")
        existing = cursor.fetchone()
        
        if not existing:
            cursor.execute("""
                INSERT INTO calendario_config (notifica_ativo, total_notificacoes, dias_antes)
                VALUES (%s, %s, %s)
            """, (config.notifica_ativo, config.total_notificacoes, config.dias_antes))
        else:
            cursor.execute("""
                UPDATE calendario_config
                SET notifica_ativo = %s, total_notificacoes = %s, dias_antes = %s
                WHERE id = %s
            """, (config.notifica_ativo, config.total_notificacoes, config.dias_antes, existing['id']))
        
        return {
            "message": "Configuração atualizada com sucesso",
            "notifica_ativo": config.notifica_ativo,
            "total_notificacoes": config.total_notificacoes,
            "dias_antes": config.dias_antes
        }

# ============================================
# Execução Manual e Sistema de Notificação
# ============================================

@router.post("/executar-agora")
async def executar_verificacao(current_user = Depends(get_current_user)):
    """Executa a verificação de notificações imediatamente (apenas admin)"""
    if current_user.nivel_acesso != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem executar esta ação"
        )
    
    resultado = await verificar_e_enviar_notificacoes()
    return resultado


async def verificar_e_enviar_notificacoes():
    """
    Verifica se há datas comemorativas para notificar e envia webhooks.
    Lógica:
    - Pega a configuração (dias_antes, total_notificacoes)
    - Para cada data com notifica=True:
      - Calcula o intervalo entre notificações (dias_antes / total_notificacoes)
      - Verifica se hoje é um dia de notificação
      - Se sim, verifica se já foi enviada e envia webhook
    """
    from datetime import date as date_type
    
    logger.info("[Calendario] Iniciando verificação de notificações...")
    
    try:
        with get_db_cursor(commit=True) as cursor:
            # Busca configuração
            cursor.execute("SELECT * FROM calendario_config LIMIT 1")
            config = cursor.fetchone()
            
            if not config or not config.get('notifica_ativo'):
                logger.info("[Calendario] Notificações desativadas")
                return {"message": "Notificações desativadas", "enviadas": 0}
            
            total_notificacoes = config.get('total_notificacoes', 3)
            dias_antes = config.get('dias_antes', 30)
            
            # Busca datas comemorativas com notifica=True
            hoje = date_type.today()
            cursor.execute("""
                SELECT id, data, descricao
                FROM calendario
                WHERE notifica = TRUE AND data >= %s
                ORDER BY data
            """, (hoje,))
            datas = cursor.fetchall()
            
            notificacoes_enviadas = 0
            detalhes = []
            
            for data_comemorativa in datas:
                data_evento = data_comemorativa['data']
                if isinstance(data_evento, str):
                    data_evento = datetime.strptime(data_evento, '%Y-%m-%d').date()
                
                dias_ate_evento = (data_evento - hoje).days
                
                # Se já passou ou falta mais que dias_antes, pula
                if dias_ate_evento < 0 or dias_ate_evento > dias_antes:
                    continue
                
                # Calcula intervalo entre notificações
                intervalo = dias_antes // total_notificacoes if total_notificacoes > 0 else dias_antes
                
                # Verifica se hoje é dia de notificação
                # Notifica quando: dias_ate_evento == dias_antes, dias_antes - intervalo, dias_antes - 2*intervalo, etc.
                dias_notificacao = []
                for i in range(total_notificacoes):
                    dia = dias_antes - (i * intervalo)
                    if dia >= 0:
                        dias_notificacao.append(dia)
                
                if dias_ate_evento in dias_notificacao:
                    numero_notificacao = dias_notificacao.index(dias_ate_evento) + 1
                    
                    # Verifica se já foi enviada hoje para este evento
                    cursor.execute("""
                        SELECT id FROM calendario_notificacoes
                        WHERE calendario_id = %s 
                        AND DATE(data_envio) = %s
                        AND numero_notificacao = %s
                    """, (data_comemorativa['id'], hoje, numero_notificacao))
                    
                    if cursor.fetchone():
                        logger.info(f"[Calendario] Notificação {numero_notificacao} já enviada para {data_comemorativa['descricao']}")
                        continue
                    
                    # Envia webhook
                    vendedores_notificados = await enviar_webhook_calendario(
                        data_comemorativa['descricao'],
                        data_evento,
                        dias_ate_evento,
                        numero_notificacao,
                        total_notificacoes
                    )
                    
                    # Registra a notificação
                    cursor.execute("""
                        INSERT INTO calendario_notificacoes (calendario_id, numero_notificacao, vendedores_notificados)
                        VALUES (%s, %s, %s)
                    """, (data_comemorativa['id'], numero_notificacao, vendedores_notificados))
                    
                    notificacoes_enviadas += 1
                    detalhes.append({
                        "descricao": data_comemorativa['descricao'],
                        "dias_restantes": dias_ate_evento,
                        "notificacao": f"{numero_notificacao}/{total_notificacoes}",
                        "vendedores": vendedores_notificados
                    })
            
            # Atualiza última execução
            cursor.execute("""
                UPDATE calendario_config SET ultima_execucao = NOW()
            """)
            
            logger.info(f"[Calendario] Verificação concluída. {notificacoes_enviadas} notificação(ões) enviada(s)")
            
            return {
                "message": "Verificação concluída",
                "enviadas": notificacoes_enviadas,
                "detalhes": detalhes
            }
            
    except Exception as e:
        logger.error(f"[Calendario] Erro na verificação: {str(e)}")
        return {"message": f"Erro: {str(e)}", "enviadas": 0}


async def enviar_webhook_calendario(descricao: str, data_evento: date, dias_restantes: int, 
                                     numero_notificacao: int, total_notificacoes: int) -> int:
    """
    Envia webhook para todos os vendedores ativos sobre a data comemorativa.
    Usa o mesmo padrão do webhook-estoque.js
    """
    import requests
    
    logger.info(f"[Calendario] Enviando webhook para: {descricao}")
    
    try:
        with get_db_cursor() as cursor:
            # Busca URL do webhook nas configurações
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'webhook_url'")
            webhook_url_result = cursor.fetchone()
            
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'webhook_ativo'")
            webhook_ativo_result = cursor.fetchone()
            
            if not webhook_url_result or not webhook_ativo_result:
                logger.info("[Calendario] Webhook não configurado")
                return 0
            
            webhook_url = webhook_url_result['valor']
            webhook_ativo = webhook_ativo_result['valor'].lower() == 'true'
            
            if not webhook_ativo or not webhook_url:
                logger.info("[Calendario] Webhook desativado ou URL não configurada")
                return 0
            
            logger.info(f"[Calendario] Webhook URL: {webhook_url}")
            logger.info(f"[Calendario] Webhook Ativo: {webhook_ativo}")
            
            # Busca vendedores ativos com telefone
            cursor.execute("""
                SELECT id, nome, telefone
                FROM vendedores
                WHERE ativo = TRUE AND telefone IS NOT NULL AND telefone != ''
            """)
            vendedores = cursor.fetchall()
            
            if not vendedores:
                logger.info("[Calendario] Nenhum vendedor ativo com telefone")
                return 0
            
            logger.info(f"[Calendario] Encontrados {len(vendedores)} vendedor(es) para notificar")
            
            # Monta a mensagem
            data_formatada = data_evento.strftime('%d/%m/%Y')
            emoji = "📅" if dias_restantes > 7 else "🔔"
            
            mensagem = f"{emoji} *LEMBRETE DE DATA COMEMORATIVA*\n\n"
            mensagem += f"📌 *{descricao}*\n"
            mensagem += f"📆 *Data:* {data_formatada}\n"
            mensagem += f"⏰ *Faltam:* {dias_restantes} dia(s)\n"
            mensagem += f"🔢 *Notificação:* {numero_notificacao} de {total_notificacoes}\n\n"
            mensagem += "💡 *Prepare-se para esta data especial!*"
            
            # Envia para cada vendedor usando requests (síncrono)
            vendedores_notificados = 0
            
            for vendedor in vendedores:
                try:
                    payload = {
                        "telefone": vendedor['telefone'],
                        "mensagem": mensagem,
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    logger.info(f"[Calendario] Enviando para {vendedor['nome']} ({vendedor['telefone']})...")
                    
                    response = requests.post(
                        webhook_url,
                        json=payload,
                        headers={'Content-Type': 'application/json'},
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        vendedores_notificados += 1
                        logger.info(f"[Calendario] ✓ Enviado para {vendedor['nome']}")
                    else:
                        logger.warning(f"[Calendario] ✗ Falha ao enviar para {vendedor['nome']}: {response.status_code} - {response.text}")
                
                except Exception as e:
                    logger.error(f"[Calendario] ✗ Erro ao enviar para {vendedor['nome']}: {str(e)}")
            
            return vendedores_notificados
            
    except Exception as e:
        logger.error(f"[Calendario] Erro ao enviar webhook: {str(e)}")
        return 0


# ============================================
# Thread de Background
# ============================================

_thread_iniciada = False

def iniciar_thread_calendario():
    """Inicia a thread de verificação diária do calendário"""
    global _thread_iniciada
    
    if _thread_iniciada:
        logger.info("[Calendario] Thread já iniciada, ignorando...")
        return
    
    _thread_iniciada = True
    thread = threading.Thread(target=_rotina_verificacao_diaria, daemon=True)
    thread.start()
    logger.info("[Calendario] Thread de verificação diária iniciada")


def _rotina_verificacao_diaria():
    """Rotina que roda em background verificando o calendário diariamente"""
    import asyncio
    
    logger.info("[Calendario] Rotina diária iniciada. Aguardando horário de execução (08:00)...")
    
    while True:
        try:
            # Espera até a próxima verificação (a cada 24 horas)
            # Verifica às 8h da manhã
            agora = datetime.now()
            proxima_verificacao = agora.replace(hour=8, minute=0, second=0, microsecond=0)
            
            if agora >= proxima_verificacao:
                proxima_verificacao += timedelta(days=1)
            
            segundos_ate_proxima = (proxima_verificacao - agora).total_seconds()
            logger.info(
                f"[Calendario] Próxima verificação agendada para: "
                f"{proxima_verificacao.strftime('%d/%m/%Y às %H:%M:%S')} "
                f"(em {segundos_ate_proxima / 3600:.1f} horas)"
            )
            
            time.sleep(segundos_ate_proxima)
            
            # Executa a verificação
            agora_execucao = datetime.now()
            logger.info("=" * 60)
            logger.info(f"[Calendario] INICIANDO VERIFICAÇÃO DIÁRIA - {agora_execucao.strftime('%d/%m/%Y %H:%M:%S')}")
            logger.info("=" * 60)
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            resultado = loop.run_until_complete(verificar_e_enviar_notificacoes())
            loop.close()
            
            logger.info(
                f"[Calendario] VERIFICAÇÃO CONCLUÍDA - "
                f"Notificações enviadas: {resultado.get('enviadas', 0)} - "
                f"Mensagem: {resultado.get('message', 'N/A')}"
            )
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error(f"[Calendario] Erro na rotina diária: {str(e)}")
            # Espera 1 hora antes de tentar novamente em caso de erro
            time.sleep(3600)
