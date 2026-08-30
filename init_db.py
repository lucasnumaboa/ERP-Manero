import os
import mysql.connector
from dotenv import load_dotenv
from passlib.context import CryptContext

# Configuração do contexto de senha para bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password):
    """Cria um hash bcrypt para a senha fornecida"""
    return pwd_context.hash(password)

# Carrega as variáveis do arquivo .env
load_dotenv()

# Obtém as configurações do banco de dados
db_config = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT')
}

# Conecta ao servidor MySQL (sem especificar o banco de dados)
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# Cria o banco de dados se não existir
db_name = os.getenv('DB_NAME')
cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
cursor.execute(f"USE {db_name}")

# Tabelas do sistema
tables = {
    # Tabela de clientes
    "clientes": """
        CREATE TABLE IF NOT EXISTS clientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            cpf_cnpj VARCHAR(20),
            email VARCHAR(100),
            telefone VARCHAR(20),
            endereco VARCHAR(255),
            cidade VARCHAR(100),
            estado VARCHAR(2),
            cep VARCHAR(10),
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de grupos de usuários
    "grupo_usuario": """
        CREATE TABLE IF NOT EXISTS grupo_usuario (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL UNIQUE,
            descricao TEXT,
            dashboard_visualizar BOOLEAN DEFAULT FALSE,
            dashboard_editar BOOLEAN DEFAULT FALSE,
            produtos_visualizar BOOLEAN DEFAULT FALSE,
            produtos_editar BOOLEAN DEFAULT FALSE,
            clientes_visualizar BOOLEAN DEFAULT FALSE,
            clientes_editar BOOLEAN DEFAULT FALSE,
            vendas_visualizar BOOLEAN DEFAULT FALSE,
            vendas_editar BOOLEAN DEFAULT FALSE,
            vendedores_visualizar BOOLEAN DEFAULT FALSE,
            vendedores_editar BOOLEAN DEFAULT FALSE,
            compras_visualizar BOOLEAN DEFAULT FALSE,
            compras_editar BOOLEAN DEFAULT FALSE,
            fornecedores_visualizar BOOLEAN DEFAULT FALSE,
            fornecedores_editar BOOLEAN DEFAULT FALSE,
            estoque_visualizar BOOLEAN DEFAULT FALSE,
            estoque_editar BOOLEAN DEFAULT FALSE,
            depositos_visualizar BOOLEAN DEFAULT FALSE,
            depositos_editar BOOLEAN DEFAULT FALSE,
            configuracoes_visualizar BOOLEAN DEFAULT FALSE,
            configuracoes_editar BOOLEAN DEFAULT FALSE,
            financeiro_visualizar BOOLEAN DEFAULT FALSE,
            financeiro_editar BOOLEAN DEFAULT FALSE,
            metas_visualizar BOOLEAN DEFAULT FALSE,
            metas_editar BOOLEAN DEFAULT FALSE,
            em_uso BOOLEAN DEFAULT FALSE,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de usuários
    "usuarios": """
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            senha VARCHAR(255) NOT NULL,
            nivel_acesso ENUM('admin', 'usuario') NOT NULL,
            grupo_id INT,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ultimo_acesso TIMESTAMP NULL,
            last_access TIMESTAMP NULL,
            connected BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (grupo_id) REFERENCES grupo_usuario(id)
        )
    """,
    
    # Tabela de categorias de produtos
    "categorias_produtos": """
        CREATE TABLE IF NOT EXISTS categorias_produtos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            descricao TEXT,
            ativo BOOLEAN DEFAULT TRUE
        )
    """,
    
# Tabela de depósitos
"depositos": """
    CREATE TABLE IF NOT EXISTS depositos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL UNIQUE,
        descricao TEXT,
        padrao BOOLEAN DEFAULT FALSE,
        ativo BOOLEAN DEFAULT TRUE,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""",

# Tabela de produtos
"produtos": """
    CREATE TABLE IF NOT EXISTS produtos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        preco_custo DECIMAL(10, 2) NOT NULL,
        preco_venda DECIMAL(10, 2) NOT NULL,
        estoque_atual INT DEFAULT 0,
        estoque_minimo INT DEFAULT 5,
        categoria_id INT,
        tipo_produto ENUM('comprado', 'fabricado') DEFAULT 'comprado',
        comissao DECIMAL(4, 0) DEFAULT 0,
        caminho_imagem TEXT,
        caminho_video VARCHAR(255),
        faturavel BOOLEAN DEFAULT TRUE,
        post_olx BOOLEAN DEFAULT FALSE,
        post_facebook BOOLEAN DEFAULT FALSE,
        ativo BOOLEAN DEFAULT TRUE,
        usuario_id INT,
        deposito_id INT,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias_produtos(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (deposito_id) REFERENCES depositos(id)
    )
""",

    # Tabela de consumo de produtos (Bill of Materials)
    # Permite vincular produtos componentes a um produto fabricado
    "produtos_consumo": """
        CREATE TABLE IF NOT EXISTS produtos_consumo (
            id INT AUTO_INCREMENT PRIMARY KEY,
            produto_id INT NOT NULL COMMENT 'ID do produto pai (fabricado)',
            consumo_produto_id INT NOT NULL COMMENT 'ID do produto componente',
            quantidade DECIMAL(10, 2) NOT NULL DEFAULT 1 COMMENT 'Quantidade necessária por unidade do produto pai',
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
            FOREIGN KEY (consumo_produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
            UNIQUE KEY unique_produto_consumo (produto_id, consumo_produto_id)
        )
    """,

    
    # Tabela de clientes e fornecedores
    "parceiros": """
        CREATE TABLE IF NOT EXISTS parceiros (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tipo ENUM('cliente', 'fornecedor', 'ambos') NOT NULL,
            nome VARCHAR(100) NOT NULL,
            documento VARCHAR(20),
            email VARCHAR(100),
            telefone VARCHAR(20),
            endereco VARCHAR(255),
            cidade VARCHAR(100),
            estado VARCHAR(2),
            cep VARCHAR(10),
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de vendedores
    "vendedores": """
        CREATE TABLE IF NOT EXISTS vendedores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100),
            telefone VARCHAR(20),
            comissao_percentual DECIMAL(5, 2) DEFAULT 0,
            usuario_id INT,
            ativo BOOLEAN DEFAULT TRUE,
            banco VARCHAR(100),
            agencia VARCHAR(20),
            conta VARCHAR(20),
            pix VARCHAR(255),
            nome_destinatario VARCHAR(100),
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de pedidos de compra
    "pedidos_compra": """
        CREATE TABLE IF NOT EXISTS pedidos_compra (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) NOT NULL,
            fornecedor_id INT NOT NULL,
            data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_previsao DATE,
            status ENUM('pendente', 'aprovado', 'recebido', 'cancelado') DEFAULT 'pendente',
            valor_total DECIMAL(10, 2) DEFAULT 0,
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (fornecedor_id) REFERENCES parceiros(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de itens de pedido de compra
    "itens_pedido_compra": """
        CREATE TABLE IF NOT EXISTS itens_pedido_compra (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pedido_id INT NOT NULL,
            produto_id INT NOT NULL,
            quantidade INT NOT NULL,
            preco_unitario DECIMAL(10, 2) NOT NULL,
            subtotal DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        )
    """,
    
    # Tabela de movimentação de estoque
    "movimentacao_estoque": """
        CREATE TABLE IF NOT EXISTS movimentacao_estoque (
            id INT AUTO_INCREMENT PRIMARY KEY,
            produto_id INT NOT NULL,
            tipo ENUM('entrada', 'saida', 'ajuste') NOT NULL,
            quantidade INT NOT NULL,
            motivo VARCHAR(100),
            documento_referencia VARCHAR(50),
            data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_id INT,
            valor_unitario DECIMAL(10, 2) NULL COMMENT 'Valor unitário do produto na entrada (para cálculo de preço médio ponderado)',
            FOREIGN KEY (produto_id) REFERENCES produtos(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de condição de pagamento
    "condicoes_pagamento": """
        CREATE TABLE IF NOT EXISTS condicoes_pagamento (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) NOT NULL UNIQUE,
            nome VARCHAR(100) NOT NULL,
            prazo_dias INT NOT NULL,
            numero_parcelas INT NOT NULL,
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de plataformas de venda (Método de Venda)
    "plataformas_venda": """
        CREATE TABLE IF NOT EXISTS plataformas_venda (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            descricao TEXT,
            url VARCHAR(255),
            taxa_percentual DECIMAL(5, 2) DEFAULT 0,
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de pedidos de venda
    "pedidos_venda": """
        CREATE TABLE IF NOT EXISTS pedidos_venda (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) NOT NULL,
            cliente_id INT NOT NULL,
            vendedor_id INT,
            condicao_pagamento_id INT,
            plataforma_id INT,
            data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_entrega DATE,
            status ENUM('Pendente', 'Finalizada', 'Cancelada') DEFAULT 'Pendente',
            valor_produtos DECIMAL(10, 2) DEFAULT 0,
            valor_frete DECIMAL(10, 2) DEFAULT 0,
            valor_desconto DECIMAL(10, 2) DEFAULT 0,
            valor_total DECIMAL(10, 2) DEFAULT 0,
            custo_produto DECIMAL(10, 2) DEFAULT 0,
            comissao_total DECIMAL(10, 2) DEFAULT 0,
            forma_pagamento ENUM('dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'pix', 'transferencia') DEFAULT 'dinheiro',
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (cliente_id) REFERENCES parceiros(id),
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
            FOREIGN KEY (condicao_pagamento_id) REFERENCES condicoes_pagamento(id),
            FOREIGN KEY (plataforma_id) REFERENCES plataformas_venda(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de itens de pedido de venda
    "itens_pedido_venda": """
        CREATE TABLE IF NOT EXISTS itens_pedido_venda (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pedido_id INT NOT NULL,
            produto_id INT NOT NULL,
            quantidade INT NOT NULL,
            preco_unitario DECIMAL(10, 2) NOT NULL,
            desconto DECIMAL(10, 2) DEFAULT 0,
            subtotal DECIMAL(10, 2) NOT NULL,
            comissao_item DECIMAL(10, 2) DEFAULT 0,
            custo_item DECIMAL(10, 2) NULL COMMENT 'Custo do produto no momento da venda (para cálculo histórico de lucro)',
            FOREIGN KEY (pedido_id) REFERENCES pedidos_venda(id),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        )
    """,
    
    # Tabela de objetos de postagem
    "objetos_postagem": """
        CREATE TABLE IF NOT EXISTS objetos_postagem (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pedido_id INT NOT NULL,
            codigo_rastreio VARCHAR(50),
            transportadora VARCHAR(100),
            data_postagem TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('postado', 'em_transito', 'entregue', 'devolvido') DEFAULT 'postado',
            observacoes TEXT,
            FOREIGN KEY (pedido_id) REFERENCES pedidos_venda(id)
        )
    """,
    
    # Tabela de propostas comerciais
    "propostas_comerciais": """
        CREATE TABLE IF NOT EXISTS propostas_comerciais (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) NOT NULL,
            cliente_id INT NOT NULL,
            vendedor_id INT,
            data_proposta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            validade DATE NOT NULL,
            status ENUM('aberta', 'aprovada', 'recusada', 'vencida') DEFAULT 'aberta',
            valor_total DECIMAL(10, 2) DEFAULT 0,
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (cliente_id) REFERENCES parceiros(id),
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de itens de proposta comercial
    "itens_proposta_comercial": """
        CREATE TABLE IF NOT EXISTS itens_proposta_comercial (
            id INT AUTO_INCREMENT PRIMARY KEY,
            proposta_id INT NOT NULL,
            produto_id INT NOT NULL,
            quantidade INT NOT NULL,
            preco_unitario DECIMAL(10, 2) NOT NULL,
            desconto DECIMAL(10, 2) DEFAULT 0,
            subtotal DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (proposta_id) REFERENCES propostas_comerciais(id),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        )
    """,
    
    # Tabela de caixas e bancos
    "contas_bancarias": """
        CREATE TABLE IF NOT EXISTS contas_bancarias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            tipo ENUM('caixa', 'conta_corrente', 'poupanca', 'investimento') NOT NULL,
            banco VARCHAR(100),
            agencia VARCHAR(20),
            conta VARCHAR(20),
            pix VARCHAR(255),
            nome_destinatario VARCHAR(100),
            saldo_inicial DECIMAL(10, 2) DEFAULT 0,
            saldo_atual DECIMAL(10, 2) DEFAULT 0,
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de contas a pagar
    "contas_pagar": """
        CREATE TABLE IF NOT EXISTS contas_pagar (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20),
            descricao VARCHAR(255) NOT NULL,
            fornecedor_id INT,
            vendedor_id INT,
            valor DECIMAL(10, 2) NOT NULL,
            data_emissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_vencimento DATE NOT NULL,
            data_pagamento DATE,
            status ENUM('pendente', 'pago', 'cancelado') DEFAULT 'pendente',
            forma_pagamento ENUM('dinheiro', 'cartao', 'boleto', 'pix', 'transferencia'),
            conta_bancaria_id INT,
            pedido_venda_id INT,
            documento_referencia VARCHAR(50),
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (fornecedor_id) REFERENCES parceiros(id),
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
            FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id),
            FOREIGN KEY (pedido_venda_id) REFERENCES pedidos_venda(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de contas a receber
    "contas_receber": """
        CREATE TABLE IF NOT EXISTS contas_receber (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20),
            descricao VARCHAR(255) NOT NULL,
            cliente_id INT,
            valor DECIMAL(10, 2) NOT NULL,
            data_emissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_vencimento DATE NOT NULL,
            data_recebimento DATE,
            status ENUM('pendente', 'recebido', 'cancelado') DEFAULT 'pendente',
            forma_recebimento ENUM('dinheiro', 'cartao', 'boleto', 'pix', 'transferencia'),
            conta_bancaria_id INT,
            pedido_venda_id INT,
            documento_referencia VARCHAR(50),
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (cliente_id) REFERENCES parceiros(id),
            FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id),
            FOREIGN KEY (pedido_venda_id) REFERENCES pedidos_venda(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de movimentação de caixa
    "movimentacao_caixa": """
        CREATE TABLE IF NOT EXISTS movimentacao_caixa (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conta_bancaria_id INT NOT NULL,
            tipo ENUM('entrada', 'saida', 'transferencia') NOT NULL,
            valor DECIMAL(10, 2) NOT NULL,
            data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            descricao VARCHAR(255) NOT NULL,
            documento_referencia VARCHAR(50),
            conta_destino_id INT,
            usuario_id INT,
            FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id),
            FOREIGN KEY (conta_destino_id) REFERENCES contas_bancarias(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de configurações do sistema
    "configuracoes": """
        CREATE TABLE IF NOT EXISTS configuracoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave VARCHAR(100) NOT NULL UNIQUE,
            valor TEXT,
            descricao TEXT,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de metas de vendedores
    "metas_vendedores": """
        CREATE TABLE IF NOT EXISTS metas_vendedores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendedor_id INT NOT NULL,
            mes INT NOT NULL,
            ano INT NOT NULL,
            meta_valor DECIMAL(12, 2) DEFAULT 0,
            meta_quantidade INT DEFAULT 0,
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
            UNIQUE KEY unique_vendedor_mes_ano (vendedor_id, mes, ano)
        )
    """,
    
    # Tabela de faixas de premiação
    "faixas_premiacao": """
        CREATE TABLE IF NOT EXISTS faixas_premiacao (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            tipo_meta ENUM('valor', 'quantidade', 'percentual') NOT NULL DEFAULT 'valor',
            valor_minimo DECIMAL(12, 2) NOT NULL,
            valor_maximo DECIMAL(12, 2),
            bonus_percentual DECIMAL(5, 2) NOT NULL DEFAULT 0,
            bonus_fixo DECIMAL(10, 2) DEFAULT 0,
            descricao TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            ordem INT DEFAULT 0,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de premiações realizadas
    "premiacoes_realizadas": """
        CREATE TABLE IF NOT EXISTS premiacoes_realizadas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendedor_id INT NOT NULL,
            faixa_premiacao_id INT NOT NULL,
            mes INT NOT NULL,
            ano INT NOT NULL,
            valor_vendido DECIMAL(12, 2) NOT NULL,
            quantidade_vendida INT NOT NULL,
            valor_bonus DECIMAL(10, 2) NOT NULL,
            status ENUM('pendente', 'pago', 'cancelado') DEFAULT 'pendente',
            data_pagamento DATE,
            observacoes TEXT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
            FOREIGN KEY (faixa_premiacao_id) REFERENCES faixas_premiacao(id)
        )
    """,
    
    # Tabela de análise de preços
    "analise_precos": """
        CREATE TABLE IF NOT EXISTS analise_precos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            produto_id INT NOT NULL,
            titulo_produto VARCHAR(255) NOT NULL,
            valor_venda_erp DECIMAL(10, 2) NOT NULL,
            preco_competitivo ENUM('sim', 'nao') NOT NULL,
            preco_adequado DECIMAL(10, 2),
            justificativa TEXT,
            fontes_pesquisa TEXT,
            usuario_id INT,
            data_analise TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (produto_id) REFERENCES produtos(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # ============================================
    # TABELAS DO OLX FINDER
    # ============================================
    
    # Tabela de categorias OLX
    "olx_categorias": """
        CREATE TABLE IF NOT EXISTS olx_categorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            parent_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES olx_categorias(id) ON DELETE CASCADE,
            UNIQUE KEY unique_olx_category (nome, parent_id)
        )
    """,
    
    # Tabela de flags de pesquisa OLX
    "olx_flags": """
        CREATE TABLE IF NOT EXISTS olx_flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            incluir BOOLEAN NOT NULL DEFAULT TRUE,
            palavras_chave TEXT NOT NULL,
            usuario_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    """,
    
    # Tabela de pesquisas OLX
    "olx_pesquisas": """
        CREATE TABLE IF NOT EXISTS olx_pesquisas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome_produto VARCHAR(255) NOT NULL,
            preco_maximo DECIMAL(10, 2) NOT NULL,
            instrucoes TEXT,
            usuario_id INT NOT NULL,
            categoria_id INT NULL,
            subcategoria_id INT NULL,
            flags TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (categoria_id) REFERENCES olx_categorias(id),
            FOREIGN KEY (subcategoria_id) REFERENCES olx_categorias(id)
        )
    """,
    
    # Tabela de produtos encontrados OLX
    "olx_produtos": """
        CREATE TABLE IF NOT EXISTS olx_produtos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            pesquisa_id INT,
            link VARCHAR(500) NOT NULL,
            titulo VARCHAR(255) NOT NULL,
            imagem VARCHAR(500),
            data_publicacao DATETIME,
            preco DECIMAL(10, 2),
            descricao TEXT,
            visivel BOOLEAN NOT NULL DEFAULT FALSE,
            avaliado BOOLEAN NOT NULL DEFAULT FALSE,
            enviado INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (pesquisa_id) REFERENCES olx_pesquisas(id) ON DELETE SET NULL,
            UNIQUE KEY unique_olx_product (link, usuario_id)
        )
    """,
    
    # ============================================
    # TABELAS DE GERENCIAMENTO DE SOFTWARES
    # ============================================
    
    # Tabela principal de softwares
    "softwares": """
        CREATE TABLE IF NOT EXISTS softwares (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome_arquivo VARCHAR(255) NOT NULL UNIQUE,
            descricao TEXT,
            versao INT DEFAULT 1,
            tamanho BIGINT,
            usuario_id INT,
            data_upload TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de histórico de versões de softwares
    "softwares_historico": """
        CREATE TABLE IF NOT EXISTS softwares_historico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            software_id INT NOT NULL,
            versao INT NOT NULL,
            alteracoes TEXT NOT NULL,
            usuario_id INT,
            data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (software_id) REFERENCES softwares(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # ============================================
    # TABELAS DE PRODUTOS 3D
    # ============================================
    
    # Tabela de categorias de produtos 3D
    "categorias_3d": """
        CREATE TABLE IF NOT EXISTS categorias_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL UNIQUE,
            descricao TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de subcategorias de produtos 3D (vinculada a uma categoria)
    "subcategorias_3d": """
        CREATE TABLE IF NOT EXISTS subcategorias_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            descricao TEXT,
            categoria_id INT NOT NULL,
            ativo BOOLEAN DEFAULT TRUE,
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias_3d(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
            UNIQUE KEY unique_subcategoria_por_categoria (nome, categoria_id)
        )
    """,
    
    # Tabela de produtos 3D
    "produtos_3d": """
        CREATE TABLE IF NOT EXISTS produtos_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            descricao TEXT,
            categoria_id INT NOT NULL,
            subcategoria_id INT,
            usuario_id INT,
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias_3d(id),
            FOREIGN KEY (subcategoria_id) REFERENCES subcategorias_3d(id) ON DELETE SET NULL,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de arquivos de produtos 3D (imagens, vídeos, STL)
    "arquivos_produto_3d": """
        CREATE TABLE IF NOT EXISTS arquivos_produto_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            produto_id INT NOT NULL,
            tipo ENUM('imagem', 'video', 'stl', 'gif') NOT NULL,
            nome_arquivo VARCHAR(255) NOT NULL,
            caminho VARCHAR(500) NOT NULL,
            tamanho BIGINT,
            ordem INT DEFAULT 0,
            data_upload TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (produto_id) REFERENCES produtos_3d(id) ON DELETE CASCADE
        )
    """,
    
    # Tabela de relacionamento N:N entre produtos 3D e categorias (múltiplas categorias por produto)
    "produtos_3d_categorias": """
        CREATE TABLE IF NOT EXISTS produtos_3d_categorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            produto_id INT NOT NULL,
            categoria_id INT NOT NULL,
            data_vinculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (produto_id) REFERENCES produtos_3d(id) ON DELETE CASCADE,
            FOREIGN KEY (categoria_id) REFERENCES categorias_3d(id) ON DELETE CASCADE,
            UNIQUE KEY unique_produto_categoria (produto_id, categoria_id)
        )
    """,

    
    # ============================================
    # TABELAS DE CALENDÁRIO DE DATAS COMEMORATIVAS
    # ============================================
    
    # Tabela de calendário de datas comemorativas
    "calendario": """
        CREATE TABLE IF NOT EXISTS calendario (
            id INT AUTO_INCREMENT PRIMARY KEY,
            data DATE NOT NULL,
            descricao VARCHAR(255) NOT NULL,
            notifica BOOLEAN DEFAULT TRUE COMMENT 'Se deve enviar notificação para esta data',
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
            UNIQUE KEY unique_data_descricao (data, descricao)
        )
    """,
    
    # Tabela de configuração de notificações do calendário
    "calendario_config": """
        CREATE TABLE IF NOT EXISTS calendario_config (
            id INT AUTO_INCREMENT PRIMARY KEY,
            notifica_ativo BOOLEAN DEFAULT FALSE COMMENT 'Se o sistema de notificação está ativo',
            total_notificacoes INT DEFAULT 3 COMMENT 'Quantidade de notificações a enviar antes da data',
            dias_antes INT DEFAULT 30 COMMENT 'Quantos dias antes da data começar a notificar',
            ultima_execucao TIMESTAMP NULL COMMENT 'Última vez que a rotina de verificação foi executada',
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """,
    
    # Tabela de histórico de notificações enviadas
    "calendario_notificacoes": """
        CREATE TABLE IF NOT EXISTS calendario_notificacoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            calendario_id INT NOT NULL,
            data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            numero_notificacao INT NOT NULL COMMENT 'Qual notificação foi (1, 2, 3...)',
            vendedores_notificados INT DEFAULT 0,
            FOREIGN KEY (calendario_id) REFERENCES calendario(id) ON DELETE CASCADE
        )
    """,

    # ============================================
    # TABELAS DE CONTROLE FINANCEIRO
    # ============================================

    # Tabela de categorias de controle (lucro / desconto)
    "controle_categorias": """
        CREATE TABLE IF NOT EXISTS controle_categorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            tipo ENUM('lucro', 'desconto') NOT NULL,
            descricao TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    """,

    # Tabela de lançamentos de controle financeiro
    "controle_lancamentos": """
        CREATE TABLE IF NOT EXISTS controle_lancamentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            categoria_id INT,
            data DATE NOT NULL COMMENT 'Data de referência do lançamento',
            tipo ENUM('lucro', 'desconto') NOT NULL COMMENT 'Lucro adiciona, desconto subtrai do lucro total',
            descricao VARCHAR(255) NOT NULL,
            valor DECIMAL(10, 2) NOT NULL,
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES controle_categorias(id) ON DELETE SET NULL,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    """,

    # ============================================
    # TABELAS DE FILAMENTOS 3D
    # ============================================

    # Tabela de filamentos (cadastro de materiais)
    "filamentos_3d": """
        CREATE TABLE IF NOT EXISTS filamentos_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            material VARCHAR(50) NOT NULL COMMENT 'Tipo do material (PLA, PETG, ABS, TPU, etc)',
            cor VARCHAR(100) NOT NULL COMMENT 'Cor do filamento',
            peso_gramas DECIMAL(10, 2) NOT NULL DEFAULT 1000 COMMENT 'Peso total do rolo em gramas',
            estoque_gramas DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Estoque disponível em gramas',
            descricao VARCHAR(255) COMMENT 'Descrição completa do filamento',
            preco_referencia DECIMAL(10, 2) DEFAULT 0 COMMENT 'Último preço de compra de referência',
            ativo BOOLEAN DEFAULT TRUE,
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    """,

    # Tabela de compras de filamento
    "compras_filamento_3d": """
        CREATE TABLE IF NOT EXISTS compras_filamento_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filamento_id INT NOT NULL,
            fornecedor_id INT COMMENT 'Fornecedor da compra (tabela parceiros)',
            quantidade INT NOT NULL DEFAULT 1 COMMENT 'Quantidade de rolos comprados',
            valor_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Valor unitário por rolo',
            valor_total DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Valor total da compra',
            observacoes TEXT,
            usuario_id INT,
            data_compra TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (filamento_id) REFERENCES filamentos_3d(id) ON DELETE CASCADE,
            FOREIGN KEY (fornecedor_id) REFERENCES parceiros(id) ON DELETE SET NULL,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    """,

    # Tabela de custo por hora da impressora 3D
    "custo_hora_3d": """
        CREATE TABLE IF NOT EXISTS custo_hora_3d (
            id INT AUTO_INCREMENT PRIMARY KEY,
            valor_hora DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Custo por hora de impressão',
            descricao VARCHAR(255) DEFAULT 'Custo padrão por hora',
            usuario_id INT,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    """
}

# Cria todas as tabelas
for table_name, table_sql in tables.items():
    print(f"Criando tabela {table_name}...")
    cursor.execute(table_sql)

# Ajusta coluna tipo da tabela clientes para VARCHAR(20)
try:
    cursor.execute("ALTER TABLE clientes MODIFY tipo VARCHAR(20) NOT NULL")
    conn.commit()
    print("Coluna tipo de clientes ajustada para VARCHAR(20)")
except mysql.connector.Error as err:
    print(f"Ignorado erro ao alterar tipo de clientes: {err}")

# Insere um usuário administrador padrão (senha: admin123)
try:
    # Criptografa a senha antes de inserir
    hashed_password = hash_password("admin123")
    cursor.execute("""
        INSERT INTO usuarios (nome, email, senha, nivel_acesso)
        VALUES ('Administrador', 'admin@erpmaneiro.com', %s, 'admin')
    """, (hashed_password,))
    conn.commit()
    print("Usuário administrador criado com sucesso!")
except mysql.connector.Error as err:
    if err.errno == 1062:  # Código de erro para chave duplicada
        print("Usuário administrador já existe.")
    else:
        print(f"Erro ao criar usuário administrador: {err}")

# Insere algumas categorias de produtos
try:
    categorias = [
        ('Eletrônicos', 'Produtos eletrônicos em geral'),
        ('Informática', 'Produtos de informática'),
        ('Móveis', 'Móveis para escritório e residência'),
        ('Papelaria', 'Material de escritório e papelaria')
    ]
    
    cursor.executemany("""
        INSERT INTO categorias_produtos (nome, descricao)
        VALUES (%s, %s)
    """, categorias)
    conn.commit()
    print("Categorias de produtos criadas com sucesso!")
except mysql.connector.Error as err:
    pass

# Insere o depósito padrão
try:
    cursor.execute("""
        INSERT INTO depositos (nome, descricao, padrao, ativo)
        VALUES ('Depósito Padrão', 'Depósito padrão do sistema', TRUE, TRUE)
    """)
    conn.commit()
    print("Depósito padrão criado com sucesso!")
except mysql.connector.Error as err:
    if err.errno == 1062:
        print("Depósito padrão já existe.")
    else:
        print(f"Erro ao criar depósito padrão: {err}")

# Insere configuração de timeout padrão
try:
    cursor.execute("""
        INSERT INTO configuracoes (chave, valor, descricao)
        VALUES ('timeout_time', '15', 'Tempo limite de inatividade do usuário em minutos')
        ON DUPLICATE KEY UPDATE valor = VALUES(valor), descricao = VALUES(descricao)
    """)
    conn.commit()
    print("Configuração de timeout criada/atualizada com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar configuração de timeout: {err}")

# Insere configurações de API de produção
try:
    configuracoes_producao = [
        ('link_api', 'http://localhost:8000', 'URL da API'),
        ('api_port', '8000', 'Porta da API'),
        ('environment', 'production', 'Ambiente de execução da aplicação'),
        ('allowed_origins', 'https://erpmaneiro.com,https://www.erpmaneiro.com', 'Origens permitidas para CORS em produção'),
        ('apikey_openrouter', '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', 'Chave de API do OpenRouter'),
        ('model_openrouter', 'openai/gpt-oss-20b:free', 'Modelo de IA do OpenRouter para gerar relatórios'),
        ('descricao_produto_dados_fixos', '- 30 dias de garantia\n- Entrego em Salto SP\n- Somente venda', 'Dados fixos obrigatórios incluídos nas descrições geradas por IA')
    ]
    
    # Configurações de providers de IA adicionais
    configuracoes_ia = [
        ('ia_provider', 'openrouter', 'Provider de IA ativo (openrouter / ollama / lmstudio)'),
        ('ia_think', 'on', 'Nível de raciocínio da IA: off | low | medium | high | on. Use "off" para desabilitar o thinking.'),
        ('ia_think_tokens', '0', 'Budget máximo de tokens para raciocínio (0 = sem limite). Aplicado nas descrições de produtos.'),
        ('ollama_model', 'llama3', 'Modelo do Ollama'),
        ('ollama_url', 'http://localhost:11434', 'URL base do Ollama'),
        ('ollama_apikey', '', 'Chave de API do Ollama (se necessário)'),
        ('lmstudio_model', 'default', 'Modelo do LM Studio'),
        ('lmstudio_url', 'http://localhost:1234', 'URL base do LM Studio'),
        ('lmstudio_apikey', '', 'Chave de API do LM Studio (se necessário)')
    ]
    configuracoes_producao.extend(configuracoes_ia)
    
    for chave, valor, descricao in configuracoes_producao:
        cursor.execute("""
            INSERT INTO configuracoes (chave, valor, descricao)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE valor = VALUES(valor), descricao = VALUES(descricao)
        """, (chave, valor, descricao))
    
    conn.commit()
    print("Configurações de API de produção criadas/atualizadas com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar configurações de produção: {err}")

# Cria grupos de usuários padrão
try:
    # Grupo Admin (acesso total)
    cursor.execute("""
        INSERT INTO grupo_usuario (
            nome, descricao, 
            dashboard_visualizar, dashboard_editar,
            produtos_visualizar, produtos_editar,
            clientes_visualizar, clientes_editar,
            vendas_visualizar, vendas_editar,
            vendedores_visualizar, vendedores_editar,
            compras_visualizar, compras_editar,
            fornecedores_visualizar, fornecedores_editar,
            estoque_visualizar, estoque_editar,
            depositos_visualizar, depositos_editar,
            configuracoes_visualizar, configuracoes_editar,
            financeiro_visualizar, financeiro_editar,
            metas_visualizar, metas_editar,
            em_uso
        )
        VALUES (
            'Administrador', 'Grupo com acesso total ao sistema',
            TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE
        )
        ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    """)
    admin_grupo_id = cursor.lastrowid
    
    # Grupo Vendedores
    cursor.execute("""
        INSERT INTO grupo_usuario (
            nome, descricao, 
            dashboard_visualizar, dashboard_editar,
            produtos_visualizar, produtos_editar,
            clientes_visualizar, clientes_editar,
            vendas_visualizar, vendas_editar,
            vendedores_visualizar, vendedores_editar,
            estoque_visualizar, estoque_editar,
            metas_visualizar, metas_editar
        )
        VALUES (
            'Vendedores', 'Grupo com acesso às funcionalidades de vendas',
            TRUE, FALSE, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, 
            TRUE, FALSE, TRUE, FALSE, TRUE, FALSE
        )
        ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    """)
    
    # Grupo Comprador
    cursor.execute("""
        INSERT INTO grupo_usuario (
            nome, descricao, 
            dashboard_visualizar, dashboard_editar,
            produtos_visualizar, produtos_editar,
            compras_visualizar, compras_editar,
            fornecedores_visualizar, fornecedores_editar,
            estoque_visualizar, estoque_editar
        )
        VALUES (
            'Comprador', 'Grupo com acesso às funcionalidades de compras',
            TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, 
            TRUE, TRUE, TRUE, TRUE
        )
        ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    """)
    
    # Grupo Financeiro
    cursor.execute("""
        INSERT INTO grupo_usuario (
            nome, descricao, 
            dashboard_visualizar, dashboard_editar,
            financeiro_visualizar, financeiro_editar,
            vendas_visualizar, vendas_editar
        )
        VALUES (
            'Financeiro', 'Grupo com acesso às funcionalidades financeiras',
            TRUE, FALSE, TRUE, TRUE, TRUE, FALSE
        )
        ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    """)
    
    conn.commit()
    print("Grupos de usuários padrão criados com sucesso!")
    
    # Atualiza o usuário administrador para usar o grupo admin
    if admin_grupo_id:
        cursor.execute("""
            UPDATE usuarios SET grupo_id = %s WHERE nivel_acesso = 'admin'
        """, (admin_grupo_id,))
        conn.commit()
        print("Usuário administrador vinculado ao grupo Administrador!")
    
except mysql.connector.Error as err:
    print(f"Erro ao criar grupos de usuários: {err}")

# Insere condições de pagamento padrão
try:
    condicoes_pagamento = [
        ('CP001', 'À Vista', 0, 1),
        ('CP002', '30 dias', 30, 1),
        ('CP003', '2x 30 dias', 30, 2),
        ('CP004', '3x 30 dias', 30, 3),
        ('CP005', '45 dias', 45, 1),
        ('CP006', '2x 45 dias', 45, 2),
        ('CP007', '60 dias', 60, 1),
        ('CP008', '90 dias', 90, 1),
    ]
    
    for codigo, nome, prazo_dias, numero_parcelas in condicoes_pagamento:
        cursor.execute("""
            INSERT INTO condicoes_pagamento (codigo, nome, prazo_dias, numero_parcelas)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE nome = VALUES(nome), prazo_dias = VALUES(prazo_dias), numero_parcelas = VALUES(numero_parcelas)
        """, (codigo, nome, prazo_dias, numero_parcelas))
    
    conn.commit()
    print("Condições de pagamento padrão criadas com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar condições de pagamento: {err}")

# Inserir configurações de webhook
try:
    webhook_configs = [
        ('webhook_url', '', 'URL do webhook para notificação de movimentação de estoque'),
        ('webhook_ativo', 'false', 'Ativa/desativa o envio de notificações via webhook (true/false)'),
    ]
    
    for chave, valor, descricao in webhook_configs:
        cursor.execute("""
            INSERT INTO configuracoes (chave, valor, descricao)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)
        """, (chave, valor, descricao))
    
    conn.commit()
    print("Configurações de webhook criadas com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar configurações de webhook: {err}")

# Inserir faixas de premiação padrão
try:
    faixas_premiacao = [
        ('Bronze', 'valor', 5000.00, 9999.99, 1.0, 0, 'Vendas entre R$ 5.000 e R$ 9.999,99 - Bônus de 1%', 1),
        ('Prata', 'valor', 10000.00, 19999.99, 2.0, 0, 'Vendas entre R$ 10.000 e R$ 19.999,99 - Bônus de 2%', 2),
        ('Ouro', 'valor', 20000.00, 49999.99, 3.0, 100, 'Vendas entre R$ 20.000 e R$ 49.999,99 - Bônus de 3% + R$ 100', 3),
        ('Platina', 'valor', 50000.00, 99999.99, 4.0, 250, 'Vendas entre R$ 50.000 e R$ 99.999,99 - Bônus de 4% + R$ 250', 4),
        ('Diamante', 'valor', 100000.00, None, 5.0, 500, 'Vendas acima de R$ 100.000 - Bônus de 5% + R$ 500', 5),
        ('Meta 100%', 'percentual', 100.00, 119.99, 2.0, 0, 'Atingiu 100% da meta - Bônus de 2%', 6),
        ('Meta 120%', 'percentual', 120.00, 149.99, 3.5, 150, 'Atingiu 120% da meta - Bônus de 3.5% + R$ 150', 7),
        ('Meta 150%', 'percentual', 150.00, None, 5.0, 300, 'Atingiu 150% ou mais da meta - Bônus de 5% + R$ 300', 8),
    ]
    
    for nome, tipo_meta, valor_min, valor_max, bonus_pct, bonus_fixo, descricao, ordem in faixas_premiacao:
        cursor.execute("""
            INSERT INTO faixas_premiacao (nome, tipo_meta, valor_minimo, valor_maximo, bonus_percentual, bonus_fixo, descricao, ordem)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                tipo_meta = VALUES(tipo_meta),
                valor_minimo = VALUES(valor_minimo),
                valor_maximo = VALUES(valor_maximo),
                bonus_percentual = VALUES(bonus_percentual),
                bonus_fixo = VALUES(bonus_fixo),
                descricao = VALUES(descricao),
                ordem = VALUES(ordem)
        """, (nome, tipo_meta, valor_min, valor_max, bonus_pct, bonus_fixo, descricao, ordem))
    
    conn.commit()
    print("Faixas de premiação padrão criadas com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar faixas de premiação: {err}")

# ============================================
# CONFIGURAÇÕES E DADOS DO OLX FINDER
# ============================================

# Inserir configurações do OLX Finder
try:
    olx_configs = [
        ('olx_intervalo_minutos', '20', 'Intervalo em minutos entre execuções de pesquisa OLX'),
        ('olx_modo_execucao', 'loop', 'Modo de execução: "intervalo" (a cada X minutos) ou "loop" (execução contínua)'),
        ('olx_webhook_url', '', 'URL do webhook para notificações de novos produtos OLX'),
        ('olx_ativo', 'false', 'Ativa/desativa o sistema de pesquisa OLX'),
    ]
    
    for chave, valor, descricao in olx_configs:
        cursor.execute("""
            INSERT INTO configuracoes (chave, valor, descricao)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)
        """, (chave, valor, descricao))
    
    conn.commit()
    print("Configurações do OLX Finder criadas com sucesso!")
except mysql.connector.Error as err:
    print(f"Erro ao criar configurações do OLX Finder: {err}")

# Inserir categorias OLX padrão
try:
    # Verificar se já existem categorias OLX
    cursor.execute("SELECT COUNT(*) FROM olx_categorias")
    olx_category_count = cursor.fetchone()[0]
    
    if olx_category_count == 0:
        print("Criando categorias OLX padrão...")
        
        # Inserir categoria principal: informatica
        cursor.execute("INSERT INTO olx_categorias (nome, parent_id) VALUES ('informatica', NULL)")
        conn.commit()
        cursor.execute("SELECT id FROM olx_categorias WHERE nome = 'informatica' AND parent_id IS NULL")
        informatica_id = cursor.fetchone()[0]
        
        # Inserir subcategorias de informatica
        subcategories_informatica = [
            'perifericos-e-acessorios-de-computador',
            'notebooks',
            'computadores-e-desktops',
            'pecas-de-hardware',
            'conectividade-e-dispositivos-de-rede',
            'monitores',
            'tablets-e-e-readers',
            'armazenamento',
            'memoria-ram',
            'placas-de-video',
            'processadores'
        ]
        
        for subcategory in subcategories_informatica:
            cursor.execute("INSERT INTO olx_categorias (nome, parent_id) VALUES (%s, %s)", (subcategory, informatica_id))
        
        # Inserir categoria principal: games
        cursor.execute("INSERT INTO olx_categorias (nome, parent_id) VALUES ('games', NULL)")
        conn.commit()
        cursor.execute("SELECT id FROM olx_categorias WHERE nome = 'games' AND parent_id IS NULL")
        games_id = cursor.fetchone()[0]
        
        # Inserir subcategorias de games
        subcategories_games = [
            'jogos-de-video-game',
            'consoles-de-video-game',
            'acessorios-de-video-game'
        ]
        
        for subcategory in subcategories_games:
            cursor.execute("INSERT INTO olx_categorias (nome, parent_id) VALUES (%s, %s)", (subcategory, games_id))
        
        conn.commit()
        print("Categorias OLX padrão criadas com sucesso!")
    else:
        print(f"Já existem {olx_category_count} categorias OLX no banco de dados.")
        
except mysql.connector.Error as err:
    print(f"Erro ao criar categorias OLX: {err}")

# Inserir flags OLX padrão para o usuário admin
try:
    # Verificar se existem flags OLX
    cursor.execute("SELECT COUNT(*) FROM olx_flags")
    olx_flags_count = cursor.fetchone()[0]
    
    if olx_flags_count == 0:
        # Buscar o ID do usuário admin
        cursor.execute("SELECT id FROM usuarios WHERE nivel_acesso = 'admin' LIMIT 1")
        admin_user = cursor.fetchone()
        
        if admin_user:
            admin_id = admin_user[0]
            default_flags = [
                ('Defeito', False, 'com defeito, não funciona, tela preta, queimado, com problema, danificado, sem funcionar'),
                ('Retirada peças', False, 'retirada de peça, para retirada de peças, somente peças, aproveitamento de peças, para sucata, sucata, quebrado'),
            ]
            
            for nome, incluir, palavras in default_flags:
                cursor.execute("""
                    INSERT INTO olx_flags (nome, incluir, palavras_chave, usuario_id)
                    VALUES (%s, %s, %s, %s)
                """, (nome, incluir, palavras, admin_id))
            
            conn.commit()
            print("Flags OLX padrão criadas para o usuário admin!")
except mysql.connector.Error as err:
    print(f"Erro ao criar flags OLX padrão: {err}")

print("Inicialização do banco de dados concluída com sucesso! ✅")

# Fecha a conexão
cursor.close()
conn.close()
