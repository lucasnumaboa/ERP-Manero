from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
import httpx
import json
import re

router = APIRouter()


# ============================================
# MODELOS PYDANTIC
# ============================================

class ChatConfigUpdate(BaseModel):
    endereco_origem: str = ''
    custo_por_km: float = 3.00
    regras_incremento: list = []
    regras_produtos: str = ''
    instrucoes_adicionais: str = ''


class ChatConfigResponse(BaseModel):
    id: Optional[int] = None
    endereco_origem: str = ''
    custo_por_km: float = 3.00
    regras_incremento: list = []
    regras_produtos: str = ''
    instrucoes_adicionais: str = ''


class ChatMessage(BaseModel):
    conteudo: str


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    conteudo: str
    data_envio: datetime


# ============================================
# CÁLCULO DE CUSTO DE ENTREGA
# ============================================


def calcular_custo_entrega(distancia_km: float, custo_por_km: float,
                           regras_incremento: list, dia_semana: str = '',
                           horario_pico: bool = False) -> dict:
    """
    Calcula o custo de entrega baseado na distância e regras de incremento.
    """
    custo_base = distancia_km * custo_por_km
    incrementos = []
    total_incremento = 0.0
    
    for regra in regras_incremento:
        tipo = regra.get('tipo', '')
        valor = float(regra.get('valor', 0))
        
        if tipo == 'horario_pico' and horario_pico:
            incrementos.append(f"Horário de pico: +R${valor:.2f}")
            total_incremento += valor
        
        elif tipo == 'dia_semana':
            dias_regra = regra.get('dias', '').lower()
            if dia_semana.lower() in dias_regra:
                incrementos.append(f"Dia da semana ({dia_semana}): +R${valor:.2f}")
                total_incremento += valor
        
        elif tipo == 'distancia':
            a_cada_km = float(regra.get('a_cada_km', 0))
            if a_cada_km > 0 and distancia_km >= a_cada_km:
                vezes = int(distancia_km / a_cada_km)
                inc = vezes * valor
                incrementos.append(f"A cada {a_cada_km}km: {vezes}x R${valor:.2f} = +R${inc:.2f}")
                total_incremento += inc
    
    custo_total = custo_base + total_incremento
    
    return {
        'distancia_km': distancia_km,
        'custo_base': round(custo_base, 2),
        'custo_por_km': custo_por_km,
        'incrementos': incrementos,
        'total_incremento': round(total_incremento, 2),
        'custo_total': round(custo_total, 2)
    }

# ============================================
# VERIFICAÇÃO DE HORÁRIO DE PICO
# ============================================

def verificar_horario_pico(dia_semana: str, horario_str: str) -> bool:
    """
    Verifica se o horário de entrega é horário de pico.
    Horário de pico: segunda a sexta das 7h às 8h e das 17h às 18:30.
    """
    # Normalizar dia da semana (remover acentos)
    dia = dia_semana.lower().strip()
    dias_uteis = ['segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta']
    
    # Se não for dia útil, não é pico
    if not any(d in dia for d in dias_uteis):
        return False
    
    # Extrair hora e minuto do horário
    try:
        # Aceita formatos: "14:00", "14h", "14h30", "14:30", "7h", "07:00"
        horario_clean = horario_str.strip().lower().replace('h', ':').replace('::', ':')
        if horario_clean.endswith(':'):
            horario_clean += '00'
        
        parts = horario_clean.split(':')
        hora = int(parts[0])
        minuto = int(parts[1]) if len(parts) > 1 else 0
        
        tempo_minutos = hora * 60 + minuto
        
        # Pico manhã: 7:00 - 8:00 (420 - 480 minutos)
        if 420 <= tempo_minutos <= 480:
            return True
        
        # Pico tarde: 17:00 - 18:30 (1020 - 1110 minutos)
        if 1020 <= tempo_minutos <= 1110:
            return True
        
        return False
        
    except (ValueError, IndexError):
        print(f"[Chat] Não foi possível parsear horário: '{horario_str}'")
        return False


# ============================================
# FUNÇÕES DE IA
# ============================================

def obter_configuracoes_ia():
    """Obtém configurações de IA do banco de dados."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT chave, valor FROM configuracoes 
            WHERE chave IN (
                'ia_provider', 'apikey_openrouter', 'model_openrouter',
                'ollama_model', 'ollama_url', 'ollama_apikey',
                'lmstudio_model', 'lmstudio_url', 'lmstudio_apikey',
                'ia_think'
            )
        """)
        configs = cursor.fetchall()
    
    return {c['chave']: c['valor'] for c in configs}


def obter_configuracoes_chat():
    """Obtém configurações do chat do banco de dados."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM chat_config ORDER BY id DESC LIMIT 1")
        config = cursor.fetchone()
    
    if not config:
        return {
            'endereco_origem': '',
            'custo_por_km': 3.00,
            'regras_incremento': [],
            'regras_produtos': '',
            'instrucoes_adicionais': ''
        }
    
    regras = config.get('regras_incremento')
    if isinstance(regras, str):
        try:
            regras = json.loads(regras)
        except:
            regras = []
    elif regras is None:
        regras = []
    
    return {
        'endereco_origem': config.get('endereco_origem', ''),
        'custo_por_km': float(config.get('custo_por_km', 3.00)),
        'regras_incremento': regras,
        'regras_produtos': config.get('regras_produtos', ''),
        'instrucoes_adicionais': config.get('instrucoes_adicionais', '')
    }


def montar_prompt_sistema(chat_config: dict) -> str:
    """Monta o prompt de sistema para a IA com o contexto de configuração."""
    
    agora = datetime.now()
    horario_atual = agora.strftime('%H:%M')
    dia_atual = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'][agora.weekday()]
    data_atual = agora.strftime('%d/%m/%Y')
    
    regras_incremento_texto = ""
    for regra in chat_config.get('regras_incremento', []):
        tipo = regra.get('tipo', '')
        valor = regra.get('valor', 0)
        if tipo == 'horario_pico':
            regras_incremento_texto += f"\n- Incremento de R${valor} em horário de pico (segunda a sexta das 7h às 8h e das 17h às 18:30)"
        elif tipo == 'dia_semana':
            dias = regra.get('dias', '')
            regras_incremento_texto += f"\n- Incremento de R${valor} se a entrega for nos dias: {dias}"
        elif tipo == 'distancia':
            a_cada_km = regra.get('a_cada_km', 0)
            regras_incremento_texto += f"\n- A cada {a_cada_km}km, incremento de R${valor}"
    
    prompt = f"""Você é um assistente de vendas do ERP Maneiro. Responda de forma clara, objetiva e amigável em português brasileiro.

DATA E HORA ATUAL: {data_atual} ({dia_atual}), {horario_atual}

CONTEXTO DAS ENTREGAS:
- Custo base por KM: R${chat_config.get('custo_por_km', 3.00):.2f}
- Regras de incremento:{regras_incremento_texto if regras_incremento_texto else ' Nenhuma configurada'}
- Horários de pico: segunda a sexta das 7h às 8h e das 17h às 18:30

REGRAS DE PRODUTOS COMO PAGAMENTO:
{chat_config.get('regras_produtos', 'Nenhuma regra configurada')}

INSTRUÇÕES ADICIONAIS:
{chat_config.get('instrucoes_adicionais', 'Nenhuma instrução adicional')}

COMO RESPONDER SOBRE ENTREGAS:
Quando o usuário perguntar sobre custo de entrega:
1. Pergunte quantos KM tem a entrega (o usuário deve informar a distância).
2. Pergunte o dia da semana da entrega.
3. Pergunte o horário previsto da entrega.
4. Quando tiver os 3 dados (km, dia, horário), responda SOMENTE com o marcador abaixo, sem nenhum texto antes ou depois:
   [CALCULAR_ENTREGA]km|dia_semana|horario[/CALCULAR_ENTREGA]
   Onde km é um número, dia_semana é (segunda, terca, quarta, quinta, sexta, sabado, domingo) e horario é HH:MM.
   Exemplo: [CALCULAR_ENTREGA]15|segunda|14:00[/CALCULAR_ENTREGA]
5. NÃO adicione NENHUM texto antes ou depois do marcador. SOMENTE o marcador.

COMO RESPONDER SOBRE PRODUTOS COMO PAGAMENTO:
Use as regras configuradas acima para informar valores de troca.

Seja sempre cordial e profissional. Use emojis com moderação."""

    return prompt


async def chamar_ia_chat(messages: list, ia_config: dict) -> str:
    """
    Chama a IA para responder no chat.
    Suporta OpenRouter, Ollama e LM Studio.
    """
    provider = ia_config.get('ia_provider', 'openrouter')
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if provider == 'openrouter':
                apikey = ia_config.get('apikey_openrouter', '')
                model = ia_config.get('model_openrouter', 'openai/gpt-4o-mini')
                
                if not apikey:
                    return "❌ API Key do OpenRouter não configurada. Peça ao administrador para configurar nas configurações do sistema."
                
                payload = {
                    'model': model,
                    'messages': messages,
                    'stream': False,
                    'temperature': 0.7,
                    'max_tokens': 1000
                }
                payload_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
                
                response = await client.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    headers={
                        'Content-Type': 'application/json; charset=utf-8',
                        'Authorization': f'Bearer {apikey}',
                        'HTTP-Referer': 'https://erpmaneiro.com',
                        'X-Title': 'ERP Maneiro Chat'
                    },
                    content=payload_bytes
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data['choices'][0]['message']['content']
                else:
                    print(f"[Chat] Erro OpenRouter: {response.status_code} - {response.text}")
                    return f"❌ Erro ao comunicar com a IA (OpenRouter: {response.status_code})"
            
            elif provider == 'ollama':
                ollama_url = ia_config.get('ollama_url', 'http://localhost:11434')
                ollama_model = ia_config.get('ollama_model', 'llama3')
                ollama_apikey = ia_config.get('ollama_apikey', '')
                
                payload = {
                    'model': ollama_model,
                    'messages': messages,
                    'stream': False
                }
                # Se think=no, desabilita o modo de raciocínio (ex: DeepSeek-R1)
                if ia_config.get('ia_think', 'yes') == 'no':
                    payload['think'] = False
                payload_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
                
                headers = {'Content-Type': 'application/json; charset=utf-8'}
                if ollama_apikey:
                    headers['Authorization'] = f'Bearer {ollama_apikey}'
                
                response = await client.post(
                    f'{ollama_url}/api/chat',
                    headers=headers,
                    content=payload_bytes
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get('message', {}).get('content', '')
                else:
                    print(f"[Chat] Erro Ollama: {response.status_code} - {response.text}")
                    return f"❌ Erro ao comunicar com a IA (Ollama: {response.status_code})"
            
            elif provider == 'lmstudio':
                lmstudio_url = ia_config.get('lmstudio_url', 'http://localhost:1234')
                lmstudio_model = ia_config.get('lmstudio_model', 'default')
                lmstudio_apikey = ia_config.get('lmstudio_apikey', '')
                
                payload = {
                    'model': lmstudio_model,
                    'messages': messages,
                    'stream': False,
                    'temperature': 0.7,
                    'max_tokens': 1000
                }
                payload_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
                
                headers = {'Content-Type': 'application/json; charset=utf-8'}
                if lmstudio_apikey:
                    headers['Authorization'] = f'Bearer {lmstudio_apikey}'
                
                response = await client.post(
                    f'{lmstudio_url}/v1/chat/completions',
                    headers=headers,
                    content=payload_bytes
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data['choices'][0]['message']['content']
                else:
                    print(f"[Chat] Erro LM Studio: {response.status_code} - {response.text}")
                    return f"❌ Erro ao comunicar com a IA (LM Studio: {response.status_code})"
            
            else:
                return f"❌ Provider de IA desconhecido: {provider}"
    
    except Exception as e:
        print(f"[Chat] Erro ao chamar IA: {e}")
        return f"❌ Erro ao comunicar com a IA: {str(e)}"


# ============================================
# UTILIDADES
# ============================================

def limpar_marcadores(texto: str) -> str:
    """Remove marcadores internos do texto para não mostrar ao usuário."""
    # Remove [CALCULAR_ENTREGA]...[/CALCULAR_ENTREGA] e qualquer texto ao redor
    texto = re.sub(r'\[CALCULAR_ENTREGA\].*?\[/CALCULAR_ENTREGA\]', '', texto, flags=re.DOTALL)
    # Remove marcadores soltos/incompletos
    texto = re.sub(r'\[/?CALCULAR_ENTREGA\]', '', texto)
    # Limpar espaços extras
    return texto.strip()


# ============================================
# ENDPOINTS DE CONFIGURAÇÃO (ADMIN ONLY)
# ============================================

@router.get("/config")
async def get_chat_config(current_user: UserInDB = Depends(get_current_user)):
    """Retorna a configuração atual do chat."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem acessar as configurações do chat."
        )
    
    config = obter_configuracoes_chat()
    return config


@router.put("/config")
async def update_chat_config(
    config_data: ChatConfigUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Atualiza a configuração do chat. Requer admin."""
    if current_user.nivel_acesso != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem alterar as configurações do chat."
        )
    
    regras_json = json.dumps(config_data.regras_incremento, ensure_ascii=False)
    
    with get_db_cursor(commit=True) as cursor:
        # Verifica se já existe uma configuração
        cursor.execute("SELECT id FROM chat_config LIMIT 1")
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE chat_config SET 
                    endereco_origem = %s,
                    custo_por_km = %s,
                    regras_incremento = %s,
                    regras_produtos = %s,
                    instrucoes_adicionais = %s,
                    usuario_id = %s
                WHERE id = %s
            """, (
                config_data.endereco_origem,
                config_data.custo_por_km,
                regras_json,
                config_data.regras_produtos,
                config_data.instrucoes_adicionais,
                current_user.id,
                existing['id']
            ))
        else:
            cursor.execute("""
                INSERT INTO chat_config 
                    (endereco_origem, custo_por_km, regras_incremento, regras_produtos, instrucoes_adicionais, usuario_id)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                config_data.endereco_origem,
                config_data.custo_por_km,
                regras_json,
                config_data.regras_produtos,
                config_data.instrucoes_adicionais,
                current_user.id
            ))
    
    return {"message": "Configuração do chat atualizada com sucesso"}


# ============================================
# ENDPOINTS DO CHAT
# ============================================

@router.get("/mensagens")
async def get_mensagens(current_user: UserInDB = Depends(get_current_user)):
    """Retorna o histórico de mensagens do chat do usuário."""
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, role, conteudo, data_envio 
            FROM chat_mensagens 
            WHERE usuario_id = %s 
            ORDER BY data_envio ASC
        """, (current_user.id,))
        mensagens = cursor.fetchall()
    
    return [
        {
            'id': m['id'],
            'role': m['role'],
            'conteudo': m['conteudo'],
            'data_envio': m['data_envio'].isoformat() if m['data_envio'] else None
        }
        for m in mensagens
    ]


@router.post("/enviar")
async def enviar_mensagem(
    msg: ChatMessage,
    current_user: UserInDB = Depends(get_current_user)
):
    """Envia uma mensagem no chat e obtém resposta da IA."""
    
    # Salvar mensagem do usuário
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO chat_mensagens (usuario_id, role, conteudo) 
            VALUES (%s, 'user', %s)
        """, (current_user.id, msg.conteudo))
    
    # Obter configurações
    chat_config = obter_configuracoes_chat()
    ia_config = obter_configuracoes_ia()
    
    # Montar histórico de mensagens para a IA
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT role, conteudo FROM chat_mensagens 
            WHERE usuario_id = %s 
            ORDER BY data_envio ASC
            LIMIT 20
        """, (current_user.id,))
        historico = cursor.fetchall()
    
    # Montar messages para a IA (limpar marcadores do histórico)
    prompt_sistema = montar_prompt_sistema(chat_config)
    messages = [{'role': 'system', 'content': prompt_sistema}]
    
    for h in historico:
        # Limpar marcadores vazados do histórico para não confundir a IA
        conteudo_limpo = limpar_marcadores(h['conteudo'])
        messages.append({'role': h['role'], 'content': conteudo_limpo})
    
    # Chamar a IA
    resposta_ia = await chamar_ia_chat(messages, ia_config)
    
    # Verificar se a resposta contém o marcador de cálculo de entrega
    resposta_final = resposta_ia
    
    try:
        calc_match = re.search(
            r'\[CALCULAR_ENTREGA\](.*?)\[/CALCULAR_ENTREGA\]',
            resposta_ia,
            re.DOTALL
        )
        
        if calc_match:
            calc_data = calc_match.group(1).strip()
            parts = calc_data.split('|')
            
            if len(parts) >= 3:
                km_str = parts[0].strip()
                dia_semana = parts[1].strip()
                horario_entrega_str = parts[2].strip()
                
                # Extrair KM (aceitar formatos: "15", "15km", "15.5")
                km_clean = re.sub(r'[^0-9.,]', '', km_str)
                km_clean = km_clean.replace(',', '.')
                distancia_km = float(km_clean) if km_clean else 0
                
                if distancia_km <= 0:
                    resposta_final = "❌ Distância inválida. Informe a quantidade de KM para o cálculo."
                else:
                    # Determinar se é horário de pico
                    horario_pico = verificar_horario_pico(dia_semana, horario_entrega_str)
                    
                    # Calcular custo
                    resultado_custo = calcular_custo_entrega(
                        distancia_km,
                        chat_config.get('custo_por_km', 3.00),
                        chat_config.get('regras_incremento', []),
                        dia_semana,
                        horario_pico
                    )
                    
                    # Montar resposta com os dados calculados
                    pico_texto = f" (horário de pico)" if horario_pico else ""
                    info_calculo = f"""Dados calculados:
- Distância: {resultado_custo['distancia_km']:.1f} km
- Dia: {dia_semana} às {horario_entrega_str}{pico_texto}
- Custo base ({resultado_custo['distancia_km']:.1f}km × R${resultado_custo['custo_por_km']:.2f}): R${resultado_custo['custo_base']:.2f}"""
                    
                    if resultado_custo['incrementos']:
                        info_calculo += "\n- Incrementos:"
                        for inc in resultado_custo['incrementos']:
                            info_calculo += f"\n  • {inc}"
                    
                    info_calculo += f"\n- **CUSTO TOTAL DA ENTREGA: R${resultado_custo['custo_total']:.2f}**"
                    
                    # Montar resposta formatada diretamente (sem segunda chamada de IA)
                    resposta_final = f"📦 **Cálculo de Entrega**\n\n{info_calculo}"
            else:
                resposta_final = "❌ Não consegui processar os dados. Informe: KM, dia da semana e horário da entrega."
    
    except Exception as e:
        print(f"[Chat] Erro ao processar cálculo de entrega: {e}")
        resposta_final = "❌ Ocorreu um erro ao calcular a entrega. Por favor, tente novamente."
    
    # SEMPRE limpar marcadores da resposta final (nunca mostrar ao usuário)
    resposta_final = limpar_marcadores(resposta_final)
    
    # Salvar resposta da IA
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("""
            INSERT INTO chat_mensagens (usuario_id, role, conteudo) 
            VALUES (%s, 'assistant', %s)
        """, (current_user.id, resposta_final))
        
        # Buscar ID da mensagem inserida
        cursor.execute("SELECT LAST_INSERT_ID() as id")
        msg_id = cursor.fetchone()['id']
    
    return {
        'id': msg_id,
        'role': 'assistant',
        'conteudo': resposta_final,
        'data_envio': datetime.now().isoformat()
    }


@router.delete("/mensagens")
async def limpar_mensagens(current_user: UserInDB = Depends(get_current_user)):
    """Limpa o histórico de mensagens do usuário."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM chat_mensagens WHERE usuario_id = %s",
            (current_user.id,)
        )
    
    return {"message": "Histórico de mensagens limpo com sucesso"}
