-- Tabelas do módulo de Orçamentos (backend: backend/routers/orcamentos.py)
-- Horários guardados como texto 'HH:MM:SS': o cálculo compara horários como texto
-- e a API devolve o valor sem conversão.

CREATE TABLE IF NOT EXISTS orcamento_config (
    id INT PRIMARY KEY,
    preco_por_km DECIMAL(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orcamento_config_periodos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    hora_inicio VARCHAR(8) NOT NULL DEFAULT '00:00:00',
    hora_fim VARCHAR(8) NOT NULL DEFAULT '23:59:59',
    valor_adicional DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    usuario_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orcamento_config_produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    usuario_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orcamento_config_campos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rotulo VARCHAR(100) NOT NULL,
    tipo ENUM('texto', 'numero', 'opcoes') NOT NULL DEFAULT 'texto',
    opcoes TEXT,
    obrigatorio BOOLEAN DEFAULT FALSE,
    ordem INT DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    usuario_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orcamento_config_descontos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quantidade_minima INT NOT NULL,
    percentual_desconto DECIMAL(5, 2) NOT NULL,
    descricao VARCHAR(255),
    ativo BOOLEAN DEFAULT TRUE,
    usuario_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orcamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    vendedor_id INT NULL,
    tipo_entrega ENUM('retira', 'entrega') NOT NULL DEFAULT 'retira',
    km_entrega DECIMAL(10, 2) DEFAULT 0,
    periodo_id INT NULL,
    valor_adicional_periodo DECIMAL(10, 2) DEFAULT 0,
    preco_por_km_usado DECIMAL(10, 2) DEFAULT 0,
    valor_km DECIMAL(10, 2) DEFAULT 0,
    valor_produtos DECIMAL(12, 2) DEFAULT 0,
    desconto_percentual DECIMAL(5, 2) DEFAULT 0,
    desconto_aplicado DECIMAL(12, 2) DEFAULT 0,
    campos_livres TEXT,
    valor_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    calculo_detalhado TEXT,
    observacoes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    usuario_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_orcamentos_vendedor (vendedor_id),
    INDEX idx_orcamentos_usuario (usuario_id)
);

CREATE TABLE IF NOT EXISTS orcamento_itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orcamento_id INT NOT NULL,
    produto_id INT NULL,
    config_produto_id INT NULL,
    nome_produto VARCHAR(150) NOT NULL,
    quantidade INT NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,
    FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
);

INSERT IGNORE INTO orcamento_config (id, preco_por_km) VALUES (1, 0);
