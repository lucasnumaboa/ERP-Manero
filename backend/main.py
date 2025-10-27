from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta

# Importa as configurações centralizadas
from config import APP_NAME, APP_VERSION, APP_DESCRIPTION, ACCESS_TOKEN_EXPIRE_MINUTES

# Importa os modelos
from models import Token

# Importa o módulo de autenticação
from auth import create_access_token, verify_password, get_current_user

# Importa os módulos de rotas
import routers.usuarios as usuarios
import routers.produtos as produtos
import routers.categorias as categorias
import routers.parceiros as parceiros
import routers.vendedores as vendedores
import routers.pedidos_compra as pedidos_compra
import routers.estoque as estoque
import routers.pedidos_venda as pedidos_venda
import routers.objetos_postagem as objetos_postagem
import routers.propostas as propostas
import routers.contas_pagar as contas_pagar
import routers.contas_receber as contas_receber
import routers.caixa as caixa
import routers.relatorios as relatorios
import routers.clientes as clientes
import routers.dashboard as dashboard
import routers.configuracoes as configuracoes

# Importa o gerenciador de timeout
from timeout_manager import start_timeout_manager

# Configurações da aplicação
app = FastAPI(
    title=APP_NAME + " API",
    description=APP_DESCRIPTION,
    version=APP_VERSION
)

# Configuração do CORS
# Obter origens permitidas da configuração do banco de dados
def get_allowed_origins():
    from database import get_db_cursor
    
    # Lista de origens permitidas para desenvolvimento local
    local_origins = [
        "http://localhost",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
        "null"  # Para requisições de arquivo local (file://)
    ]
    
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'allowed_origins'")
            result = cursor.fetchone()
            if result and result['valor']:
                # Formato esperado: dominio1.com,dominio2.com
                db_origins = [origin.strip() for origin in result['valor'].split(',')]
                # Combinar origens do banco com origens locais
                return db_origins + local_origins
    except Exception as e:
        print(f"Erro ao obter origens permitidas: {e}")
    
    # Fallback para desenvolvimento
    return ["*"]

# Middleware personalizado para CORS dinâmico
@app.middleware("http")
async def dynamic_cors(request, call_next):
    # Obter origem da requisição
    origin = request.headers.get("origin")
    
    # Se não houver origem, continuar normalmente
    if not origin:
        return await call_next(request)
    
    # Verificar se a origem está na lista de permitidas
    allowed_origins = get_allowed_origins()
    
    # Para desenvolvimento, permitir todas as origens
    if "*" in allowed_origins or origin in allowed_origins:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response
    
    # Se a origem não estiver permitida, continuar sem adicionar headers CORS
    return await call_next(request)

# Configuração do CORS com origens permitidas do banco de dados
# Manter para compatibilidade, mas o middleware acima terá prioridade
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir todas as origens no middleware padrão
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Importações e configurações já definidas acima

# Rotas de autenticação
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    from database import get_db_cursor
    
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, nome, email, senha, nivel_acesso FROM usuarios WHERE email = %s",
            (form_data.username,)
        )
        user = cursor.fetchone()
    
    if not user or not verify_password(form_data.password, user["senha"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Atualiza o último acesso, last_access e connected
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE usuarios SET ultimo_acesso = NOW(), last_access = NOW(), connected = TRUE WHERE id = %s",
            (user["id"],)
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"], "nivel": user["nivel_acesso"]},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
# A função get_current_user foi movida para o módulo auth.py

# Incluir as rotas dos módulos
app.include_router(usuarios.router, prefix="/api/usuarios", tags=["Usuários"])
app.include_router(produtos.router, prefix="/api/produtos", tags=["Produtos"])
app.include_router(categorias.router, prefix="/api/categorias", tags=["Categorias"])
app.include_router(parceiros.router, prefix="/api/parceiros", tags=["Parceiros"])
app.include_router(vendedores.router, prefix="/api/vendedores", tags=["Vendedores"])
app.include_router(pedidos_compra.router, prefix="/api/compras", tags=["Compras"])
app.include_router(estoque.router, prefix="/api/estoque", tags=["Estoque"])
app.include_router(pedidos_venda.router, prefix="/api/vendas", tags=["Vendas"])
app.include_router(objetos_postagem.router, prefix="/api/postagens", tags=["Postagens"])
app.include_router(propostas.router, prefix="/api/propostas", tags=["Propostas"])
app.include_router(contas_pagar.router, prefix="/api/contas-pagar", tags=["Contas a Pagar"])
app.include_router(contas_receber.router, prefix="/api/contas-receber", tags=["Contas a Receber"])
app.include_router(caixa.router, prefix="/api/caixa", tags=["Caixa"])
app.include_router(relatorios.router, prefix="/api/relatorios", tags=["Relatórios"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["Clientes"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(configuracoes.router, prefix="/api/configuracoes", tags=["Configurações"])

@app.get("/")
async def root():
    return {"message": "Bem-vindo à API do ERP Maneiro"}

if __name__ == "__main__":
    import uvicorn
    from database import get_db_cursor
    
    # Obter porta do banco de dados, se disponível
    port = 8000
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'api_port'")
            result = cursor.fetchone()
            if result and result['valor']:
                port = int(result['valor'])
    except Exception as e:
        print(f"Erro ao obter porta da API: {e}")
    
    # Em produção, desabilitar o reload automático
    is_production = False
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT valor FROM configuracoes WHERE chave = 'environment'")
            result = cursor.fetchone()
            if result and result['valor'] == 'production':
                is_production = True
    except Exception as e:
        print(f"Erro ao verificar ambiente: {e}")

    # Inicializar o gerenciador de timeout
    print("Iniciando gerenciador de timeout...")
    start_timeout_manager()

    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=not is_production)
