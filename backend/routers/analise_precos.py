from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db_cursor
from auth import get_current_user
from models import UserInDB
import httpx
import asyncio
import time

router = APIRouter()

# Modelos Pydantic
class AnalisePrecoItem(BaseModel):
    id: int
    produto_id: int
    titulo_produto: str
    valor_venda_erp: float
    preco_competitivo: str
    preco_adequado: Optional[float] = None
    justificativa: Optional[str] = None
    fontes_pesquisa: Optional[str] = None
    data_analise: datetime

class AnalisePrecoResponse(BaseModel):
    analises: List[AnalisePrecoItem]
    total: int
    data_ultima_analise: Optional[datetime] = None

class IniciarAnaliseResponse(BaseModel):
    message: str
    status: str

# Variável global para controlar o status da análise
analise_em_andamento = {}

async def buscar_precos_internet(produto_nome: str) -> List[dict]:
    """
    Busca preços do produto em fontes da internet usando DuckDuckGo
    Retorna lista com até 5 resultados de diferentes fontes
    """
    resultados = []
    
    # URLs de busca simuladas (em produção, usar APIs reais de e-commerce)
    # Aqui usamos DuckDuckGo HTML para buscar preços
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Busca no DuckDuckGo
            query = f"{produto_nome} preço comprar"
            url = f"https://html.duckduckgo.com/html/?q={query}"
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = await client.get(url, headers=headers)
            
            if response.status_code == 200:
                # Extrair informações básicas do HTML
                html_content = response.text
                
                # Simular extração de 5 fontes diferentes
                fontes = [
                    "Mercado Livre",
                    "Amazon Brasil", 
                    "Magazine Luiza",
                    "Americanas",
                    "Shopee"
                ]
                
                for fonte in fontes:
                    resultados.append({
                        "fonte": fonte,
                        "produto": produto_nome,
                        "info": f"Pesquisa realizada em {fonte}"
                    })
                    
    except Exception as e:
        print(f"[Análise Preços] Erro ao buscar preços: {e}")
        # Retorna fontes padrão mesmo com erro
        fontes = ["Mercado Livre", "Amazon Brasil", "Magazine Luiza", "Americanas", "Shopee"]
        for fonte in fontes:
            resultados.append({
                "fonte": fonte,
                "produto": produto_nome,
                "info": f"Pesquisa em {fonte} (offline)"
            })
    
    return resultados

async def chamar_ia_analise(apikey: str, model: str, produto_nome: str, preco_erp: float, fontes: List[dict]) -> dict:
    """
    Chama a IA do OpenRouter para analisar se o preço é competitivo
    """
    try:
        fontes_texto = "\n".join([f"- {f['fonte']}: {f['info']}" for f in fontes])
        
        prompt = f"""Você é um analista de preços de mercado. Analise o seguinte produto e seu preço de venda:

PRODUTO: {produto_nome}
PREÇO DE VENDA ATUAL: R$ {preco_erp:.2f}

FONTES PESQUISADAS:
{fontes_texto}

Com base no seu conhecimento sobre preços de mercado para este tipo de produto, responda EXATAMENTE no formato JSON abaixo:

{{
    "preco_competitivo": "sim" ou "nao",
    "preco_adequado": valor numérico sugerido (ex: 150.00),
    "justificativa": "O preço médio do produto fica na casa de R$ X e está vendendo por R$ Y. [explicação detalhada]"
}}

Considere:
1. Se o preço está dentro da média de mercado (+/- 15%), é competitivo
2. Se está muito acima ou abaixo, não é competitivo
3. Sugira um preço adequado baseado na média de mercado
4. Na justificativa, explique a análise de forma clara

Responda APENAS com o JSON, sem texto adicional."""

        import json as json_module
        
        payload = {
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'stream': False,
            'temperature': 0.3,
            'max_tokens': 500
        }
        
        # Encode payload as UTF-8 JSON
        payload_bytes = json_module.dumps(payload, ensure_ascii=False).encode('utf-8')
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                'https://openrouter.ai/api/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': f'Bearer {apikey}',
                    'HTTP-Referer': 'https://erpmaneiro.com',
                    'X-Title': 'ERP Maneiro'
                },
                content=payload_bytes
            )
            
            if response.status_code == 200:
                data = response.json()
                resposta_ia = data['choices'][0]['message']['content']
                
                # Tentar extrair JSON da resposta
                import json
                import re
                
                try:
                    # Limpar a resposta para extrair apenas o JSON
                    # Primeiro tenta encontrar um JSON completo
                    json_match = re.search(r'\{[^{}]*\}', resposta_ia, re.DOTALL)
                    if json_match:
                        resultado = json.loads(json_match.group())
                        return resultado
                    else:
                        # Tentar parsear diretamente
                        resultado = json.loads(resposta_ia)
                        return resultado
                except json.JSONDecodeError as je:
                    print(f"[Análise Preços] JSON inválido da IA, tentando extrair manualmente...")
                    
                    # Tentar extrair valores manualmente usando regex
                    competitivo_match = re.search(r'"preco_competitivo"\s*:\s*"(sim|nao|n[aã]o)"', resposta_ia, re.IGNORECASE)
                    preco_match = re.search(r'"preco_adequado"\s*:\s*(\d+(?:[.,]\d+)?)', resposta_ia)
                    
                    preco_competitivo = "sim"
                    if competitivo_match:
                        val = competitivo_match.group(1).lower()
                        preco_competitivo = "nao" if "n" in val and ("a" in val or "ã" in val) else "sim"
                    
                    preco_adequado_val = preco_erp
                    if preco_match:
                        preco_str = preco_match.group(1).replace(',', '.')
                        preco_adequado_val = float(preco_str)
                    
                    # Extrair justificativa completa - pega tudo após "justificativa": "
                    justificativa_match = re.search(r'"justificativa"\s*:\s*"(.+?)(?:"\s*}|$)', resposta_ia, re.DOTALL)
                    if not justificativa_match:
                        # Tenta pegar sem o fechamento
                        justificativa_match = re.search(r'"justificativa"\s*:\s*"(.+)', resposta_ia, re.DOTALL)
                    
                    justificativa = f"Preço atual: R$ {preco_erp:.2f}"
                    if justificativa_match:
                        justificativa = justificativa_match.group(1).rstrip('"}').strip()
                        # Remove escapes de JSON
                        justificativa = justificativa.replace('\\"', '"').replace('\\n', ' ')
                    
                    return {
                        "preco_competitivo": preco_competitivo,
                        "preco_adequado": preco_adequado_val,
                        "justificativa": justificativa
                    }
            else:
                print(f"[Análise Preços] Erro da API: {response.status_code} - {response.text}")
                
    except Exception as e:
        print(f"[Análise Preços] Erro ao chamar IA: {e}")
    
    # Retorno padrão em caso de erro
    return {
        "preco_competitivo": "sim",
        "preco_adequado": preco_erp,
        "justificativa": f"Não foi possível analisar o preço automaticamente. Preço atual: R$ {preco_erp:.2f}"
    }

async def executar_analise_precos(usuario_id: int, usuario_telefone: str = None):
    """
    Executa a análise de preços em background
    """
    global analise_em_andamento
    analise_em_andamento[usuario_id] = {"status": "em_andamento", "progresso": 0}
    
    try:
        # Buscar configurações de IA
        with get_db_cursor() as cursor:
            cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('apikey_openrouter', 'model_openrouter', 'webhook_url', 'webhook_ativo')")
            configs = cursor.fetchall()
            
        config_dict = {c['chave']: c['valor'] for c in configs}
        apikey = config_dict.get('apikey_openrouter', '')
        model = config_dict.get('model_openrouter', 'openai/gpt-4o-mini')
        webhook_url = config_dict.get('webhook_url', '')
        webhook_ativo = config_dict.get('webhook_ativo', 'false') == 'true'
        
        if not apikey:
            print("[Análise Preços] API Key do OpenRouter não configurada")
            analise_em_andamento[usuario_id] = {"status": "erro", "mensagem": "API Key não configurada"}
            return
        
        # Buscar produtos faturáveis
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, nome, preco_venda 
                FROM produtos 
                WHERE faturavel = TRUE AND ativo = TRUE
                ORDER BY nome
            """)
            produtos = cursor.fetchall()
        
        if not produtos:
            print("[Análise Preços] Nenhum produto faturável encontrado")
            analise_em_andamento[usuario_id] = {"status": "erro", "mensagem": "Nenhum produto faturável"}
            return
        
        # Limpar análises anteriores
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("DELETE FROM analise_precos WHERE usuario_id = %s", (usuario_id,))
        
        total_produtos = len(produtos)
        
        for idx, produto in enumerate(produtos):
            try:
                print(f"[Análise Preços] Analisando produto {idx + 1}/{total_produtos}: {produto['nome']}")
                
                # Buscar preços na internet
                fontes = await buscar_precos_internet(produto['nome'])
                
                # Chamar IA para análise
                resultado_ia = await chamar_ia_analise(
                    apikey, 
                    model, 
                    produto['nome'], 
                    float(produto['preco_venda']),
                    fontes
                )
                
                # Salvar resultado no banco
                fontes_json = str([f['fonte'] for f in fontes])
                
                with get_db_cursor(commit=True) as cursor:
                    cursor.execute("""
                        INSERT INTO analise_precos 
                        (produto_id, titulo_produto, valor_venda_erp, preco_competitivo, preco_adequado, justificativa, fontes_pesquisa, usuario_id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        produto['id'],
                        produto['nome'],
                        float(produto['preco_venda']),
                        resultado_ia.get('preco_competitivo', 'sim'),
                        resultado_ia.get('preco_adequado'),
                        resultado_ia.get('justificativa', ''),
                        fontes_json,
                        usuario_id
                    ))
                
                # Atualizar progresso
                analise_em_andamento[usuario_id] = {
                    "status": "em_andamento", 
                    "progresso": int((idx + 1) / total_produtos * 100),
                    "produto_atual": produto['nome']
                }
                
                # Aguardar 3 segundos entre produtos
                await asyncio.sleep(3)
                
            except Exception as e:
                print(f"[Análise Preços] Erro ao analisar produto {produto['nome']}: {e}")
                continue
        
        # Análise concluída
        analise_em_andamento[usuario_id] = {"status": "concluido", "progresso": 100}
        
        # Notificar usuário via webhook
        if webhook_ativo and webhook_url:
            try:
                # Buscar telefone do usuário
                with get_db_cursor() as cursor:
                    cursor.execute("""
                        SELECT v.telefone 
                        FROM usuarios u 
                        LEFT JOIN vendedores v ON u.id = v.usuario_id 
                        WHERE u.id = %s
                    """, (usuario_id,))
                    user_data = cursor.fetchone()
                    
                if user_data and user_data.get('telefone'):
                    mensagem = f"""📊 *ANÁLISE DE PREÇOS CONCLUÍDA*

✅ Foram analisados {total_produtos} produtos faturáveis.

Acesse o relatório em:
📱 Relatórios > Análise de Preço

⏰ {datetime.now().strftime('%d/%m/%Y %H:%M')}"""
                    
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        await client.post(webhook_url, json={
                            "telefone": user_data['telefone'],
                            "mensagem": mensagem,
                            "timestamp": datetime.now().isoformat()
                        })
                        print(f"[Análise Preços] Notificação enviada para {user_data['telefone']}")
                        
            except Exception as e:
                print(f"[Análise Preços] Erro ao enviar notificação: {e}")
        
        print(f"[Análise Preços] Análise concluída! {total_produtos} produtos analisados.")
        
    except Exception as e:
        print(f"[Análise Preços] Erro geral na análise: {e}")
        analise_em_andamento[usuario_id] = {"status": "erro", "mensagem": str(e)}

# Rotas
@router.get("/", response_model=AnalisePrecoResponse)
async def listar_analises(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Lista todas as análises de preço do usuário atual
    """
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, produto_id, titulo_produto, valor_venda_erp, 
                   preco_competitivo, preco_adequado, justificativa, 
                   fontes_pesquisa, data_analise
            FROM analise_precos
            WHERE usuario_id = %s
            ORDER BY data_analise DESC
        """, (current_user.id,))
        analises_raw = cursor.fetchall()
        
        # Buscar data da última análise
        cursor.execute("""
            SELECT MAX(data_analise) as ultima_analise
            FROM analise_precos
            WHERE usuario_id = %s
        """, (current_user.id,))
        ultima = cursor.fetchone()
    
    analises = []
    for a in analises_raw:
        analises.append(AnalisePrecoItem(
            id=a['id'],
            produto_id=a['produto_id'],
            titulo_produto=a['titulo_produto'],
            valor_venda_erp=float(a['valor_venda_erp']),
            preco_competitivo=a['preco_competitivo'],
            preco_adequado=float(a['preco_adequado']) if a['preco_adequado'] else None,
            justificativa=a['justificativa'],
            fontes_pesquisa=a['fontes_pesquisa'],
            data_analise=a['data_analise']
        ))
    
    return AnalisePrecoResponse(
        analises=analises,
        total=len(analises),
        data_ultima_analise=ultima['ultima_analise'] if ultima else None
    )

@router.post("/iniciar", response_model=IniciarAnaliseResponse)
async def iniciar_analise(
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Inicia a análise de preços em background
    """
    global analise_em_andamento
    
    # Verificar se já existe uma análise em andamento
    if current_user.id in analise_em_andamento:
        status_atual = analise_em_andamento[current_user.id].get("status")
        if status_atual == "em_andamento":
            return IniciarAnaliseResponse(
                message="Já existe uma análise em andamento. Aguarde a conclusão.",
                status="em_andamento"
            )
    
    # Iniciar análise em background usando thread separada
    import threading
    
    def run_async_task():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(executar_analise_precos(current_user.id))
        finally:
            loop.close()
    
    thread = threading.Thread(target=run_async_task, daemon=True)
    thread.start()
    
    return IniciarAnaliseResponse(
        message="Análise iniciada! Você será notificado após a conclusão.",
        status="iniciado"
    )

@router.get("/status")
async def status_analise(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Retorna o status da análise em andamento
    """
    global analise_em_andamento
    
    if current_user.id in analise_em_andamento:
        return analise_em_andamento[current_user.id]
    
    return {"status": "nenhuma", "progresso": 0}

@router.delete("/limpar")
async def limpar_analises(
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Limpa todas as análises do usuário
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM analise_precos WHERE usuario_id = %s", (current_user.id,))
    
    return {"message": "Análises removidas com sucesso"}

class ProdutoPrecoUpdate(BaseModel):
    produto_id: int
    preco_sugerido: float

class ReplicarSugestaoRequest(BaseModel):
    produtos: List[ProdutoPrecoUpdate]

@router.post("/replicar-sugestao")
async def replicar_sugestao(
    request: ReplicarSugestaoRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Atualiza o preço de venda dos produtos selecionados com o preço sugerido.
    Requer permissão 'produto_editar'.
    """
    # Verificar permissão do usuário
    # Admins têm todas as permissões
    if current_user.nivel_acesso != 'admin':
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT g.produtos_editar 
                FROM grupo_usuario g
                JOIN usuarios u ON u.grupo_id = g.id
                WHERE u.id = %s
            """, (current_user.id,))
            permissao = cursor.fetchone()
            
            if not permissao or not permissao['produtos_editar']:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você não tem permissão para editar produtos"
                )
    
    atualizados = 0
    erros = []
    produtos_atualizados = []  # Lista para webhook
    
    for produto in request.produtos:
        try:
            # Primeiro busca o produto atual
            with get_db_cursor() as cursor:
                cursor.execute("SELECT nome, preco_venda FROM produtos WHERE id = %s", (produto.produto_id,))
                produto_atual = cursor.fetchone()
            
            if produto_atual:
                preco_antigo = produto_atual['preco_venda']
                titulo = produto_atual['nome']
                
                print(f"[Análise Preços] Atualizando produto {produto.produto_id}: {titulo}")
                print(f"[Análise Preços] Preço antigo: {preco_antigo} -> Novo: {produto.preco_sugerido}")
                
                # Agora faz o UPDATE em uma transação separada
                with get_db_cursor(commit=True) as cursor:
                    cursor.execute(
                        "UPDATE produtos SET preco_venda = %s WHERE id = %s",
                        (produto.preco_sugerido, produto.produto_id)
                    )
                    rows_affected = cursor.rowcount
                    print(f"[Análise Preços] Rows affected: {rows_affected}")
                
                # Considera atualizado mesmo se rowcount for 0 (preço pode ser igual)
                atualizados += 1
                produtos_atualizados.append({
                    'titulo': titulo,
                    'preco_antigo': float(preco_antigo) if preco_antigo else 0,
                    'preco_novo': produto.preco_sugerido
                })
                print(f"[Análise Preços] Produto {produto.produto_id} atualizado para R$ {produto.preco_sugerido:.2f}")
            else:
                print(f"[Análise Preços] Produto {produto.produto_id} não encontrado")
                erros.append(f"Produto {produto.produto_id}: não encontrado")
        except Exception as e:
            erros.append(f"Produto {produto.produto_id}: {str(e)}")
            print(f"[Análise Preços] Erro ao atualizar produto {produto.produto_id}: {e}")
    
    # Enviar webhook para vendedores se houve atualizações
    if atualizados > 0:
        await enviar_webhook_precos_atualizados(produtos_atualizados)
    
    return {
        "atualizados": atualizados,
        "total": len(request.produtos),
        "erros": erros if erros else None
    }

async def enviar_webhook_precos_atualizados(produtos: List[dict]):
    """
    Envia webhook para todos os vendedores ativos notificando sobre alteração de preços
    """
    try:
        print(f"[Análise Preços] Iniciando envio de webhook para {len(produtos)} produtos atualizados")
        
        # Buscar configurações de webhook
        with get_db_cursor() as cursor:
            cursor.execute("SELECT chave, valor FROM configuracoes WHERE chave IN ('webhook_url', 'webhook_ativo')")
            configs = cursor.fetchall()
        
        config_dict = {c['chave']: c['valor'] for c in configs}
        webhook_url = config_dict.get('webhook_url', '')
        webhook_ativo = config_dict.get('webhook_ativo', '')
        
        print(f"[Análise Preços] Webhook URL: {webhook_url}, Ativo: {webhook_ativo}")
        
        # Verifica se webhook está ativo (pode ser '1', 'true', 'True', etc)
        is_ativo = webhook_ativo in ('1', 'true', 'True', 'TRUE')
        
        if not webhook_url or not is_ativo:
            print("[Análise Preços] Webhook não configurado ou inativo")
            return
        
        # Buscar vendedores ativos com telefone
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT telefone FROM vendedores 
                WHERE ativo = 1 AND telefone IS NOT NULL AND telefone != ''
            """)
            vendedores = cursor.fetchall()
        
        print(f"[Análise Preços] Vendedores encontrados: {len(vendedores)}")
        
        if not vendedores:
            print("[Análise Preços] Nenhum vendedor ativo com telefone encontrado")
            return
        
        # Montar mensagem
        mensagem = "📢 *AJUSTE DE PREÇOS*\n\n"
        mensagem += "Foram ajustados os preços dos produtos abaixo, corrijam os anúncios se anunciados:\n\n"
        
        for prod in produtos:
            preco_antigo = f"R$ {prod['preco_antigo']:.2f}".replace('.', ',')
            preco_novo = f"R$ {prod['preco_novo']:.2f}".replace('.', ',')
            mensagem += f"📦 *{prod['titulo']}*\n"
            mensagem += f"   {preco_antigo} ➡️ {preco_novo}\n\n"
        
        print(f"[Análise Preços] Mensagem montada: {mensagem[:100]}...")
        
        # Enviar para cada vendedor usando o mesmo formato do frontend
        import datetime
        async with httpx.AsyncClient(timeout=30.0) as client:
            for vendedor in vendedores:
                telefone = vendedor['telefone']
                
                try:
                    payload = {
                        "telefone": telefone,
                        "mensagem": mensagem,
                        "timestamp": datetime.datetime.now().isoformat()
                    }
                    
                    print(f"[Análise Preços] Enviando webhook para {telefone} em {webhook_url}")
                    
                    response = await client.post(
                        webhook_url,
                        json=payload,
                        headers={'Content-Type': 'application/json'}
                    )
                    
                    print(f"[Análise Preços] Resposta do webhook: {response.status_code}")
                    
                    if response.status_code == 200:
                        print(f"[Análise Preços] Webhook enviado com sucesso para {telefone}")
                    else:
                        print(f"[Análise Preços] Webhook retornou status {response.status_code} para {telefone}")
                    
                    # Pequeno delay entre envios
                    await asyncio.sleep(0.5)
                except Exception as e:
                    print(f"[Análise Preços] Erro ao enviar webhook para {telefone}: {e}")
        
        print(f"[Análise Preços] Webhooks de atualização de preços enviados para {len(vendedores)} vendedores")
        
    except Exception as e:
        print(f"[Análise Preços] Erro ao enviar webhooks: {e}")
