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
    
    # Tabela de usuários
    "usuarios": """
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            senha VARCHAR(255) NOT NULL,
            nivel_acesso ENUM('admin', 'vendedor', 'comprador', 'financeiro') NOT NULL,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ultimo_acesso TIMESTAMP NULL,
            last_access TIMESTAMP NULL,
            connected BOOLEAN DEFAULT FALSE
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
            ativo BOOLEAN DEFAULT TRUE,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias_produtos(id)
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
            FOREIGN KEY (produto_id) REFERENCES produtos(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de pedidos de venda
    "pedidos_venda": """
        CREATE TABLE IF NOT EXISTS pedidos_venda (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) NOT NULL,
            cliente_id INT NOT NULL,
            vendedor_id INT,
            data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_entrega DATE,
            status ENUM('Pendente', 'Finalizada', 'Cancelada') DEFAULT 'Pendente',
            valor_produtos DECIMAL(10, 2) DEFAULT 0,
            valor_frete DECIMAL(10, 2) DEFAULT 0,
            valor_desconto DECIMAL(10, 2) DEFAULT 0,
            valor_total DECIMAL(10, 2) DEFAULT 0,
            custo_produto DECIMAL(10, 2) DEFAULT 0,
            forma_pagamento ENUM('dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'pix', 'transferencia') DEFAULT 'dinheiro',
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (cliente_id) REFERENCES parceiros(id),
            FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
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
            descricao VARCHAR(255) NOT NULL,
            fornecedor_id INT,
            valor DECIMAL(10, 2) NOT NULL,
            data_emissao DATE NOT NULL,
            data_vencimento DATE NOT NULL,
            data_pagamento DATE,
            status ENUM('aberto', 'pago', 'cancelado') DEFAULT 'aberto',
            forma_pagamento ENUM('dinheiro', 'cartao', 'boleto', 'pix', 'transferencia'),
            conta_bancaria_id INT,
            documento_referencia VARCHAR(50),
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (fornecedor_id) REFERENCES parceiros(id),
            FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """,
    
    # Tabela de contas a receber
    "contas_receber": """
        CREATE TABLE IF NOT EXISTS contas_receber (
            id INT AUTO_INCREMENT PRIMARY KEY,
            descricao VARCHAR(255) NOT NULL,
            cliente_id INT,
            valor DECIMAL(10, 2) NOT NULL,
            data_emissao DATE NOT NULL,
            data_vencimento DATE NOT NULL,
            data_recebimento DATE,
            status ENUM('aberto', 'recebido', 'cancelado') DEFAULT 'aberto',
            forma_recebimento ENUM('dinheiro', 'cartao', 'boleto', 'pix', 'transferencia'),
            conta_bancaria_id INT,
            documento_referencia VARCHAR(50),
            observacoes TEXT,
            usuario_id INT,
            FOREIGN KEY (cliente_id) REFERENCES parceiros(id),
            FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id),
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
    print(f"Erro ao criar categorias: {err}")

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
        ('allowed_origins', 'https://erpmaneiro.com,https://www.erpmaneiro.com', 'Origens permitidas para CORS em produção')
    ]
    
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

print("Inicialização do banco de dados concluída com sucesso! ✅")

# Fecha a conexão
cursor.close()
conn.close()
