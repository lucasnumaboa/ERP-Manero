-- Script de criação do banco de dados ERP Maneiro

-- Cria o banco de dados se não existir
CREATE DATABASE IF NOT EXISTS erp_maneiro;

-- Seleciona o banco de dados
USE erp_maneiro;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    nivel_acesso ENUM('admin', 'gerente', 'vendedor', 'estoquista') NOT NULL DEFAULT 'vendedor',
    ultimo_acesso DATETIME,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de categorias de produtos
CREATE TABLE IF NOT EXISTS categorias_produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    preco_custo DECIMAL(10, 2) NOT NULL,
    preco_venda DECIMAL(10, 2) NOT NULL,
    estoque_atual INT NOT NULL DEFAULT 0,
    estoque_minimo INT NOT NULL DEFAULT 5,
    categoria_id INT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_produtos(id)
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    telefone VARCHAR(20),
    cpf_cnpj VARCHAR(20) UNIQUE,
    tipo ENUM('pessoa_fisica', 'pessoa_juridica') NOT NULL,
    endereco VARCHAR(255),
    cidade VARCHAR(100),
    estado CHAR(2),
    cep VARCHAR(10),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    telefone VARCHAR(20),
    cnpj VARCHAR(20) UNIQUE,
    contato VARCHAR(100),
    endereco VARCHAR(255),
    cidade VARCHAR(100),
    estado CHAR(2),
    cep VARCHAR(10),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de vendas
CREATE TABLE IF NOT EXISTS vendas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT,
    usuario_id INT NOT NULL,
    data_venda DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor_total DECIMAL(10, 2) NOT NULL,
    desconto DECIMAL(10, 2) DEFAULT 0,
    forma_pagamento ENUM('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto') NOT NULL,
    status ENUM('pendente', 'concluida', 'cancelada') NOT NULL DEFAULT 'pendente',
    observacoes TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabela de itens de venda
CREATE TABLE IF NOT EXISTS itens_venda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venda_id INT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venda_id) REFERENCES vendas(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

-- Tabela de compras (de fornecedores)
CREATE TABLE IF NOT EXISTS compras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT NOT NULL,
    usuario_id INT NOT NULL,
    data_compra DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor_total DECIMAL(10, 2) NOT NULL,
    status ENUM('pendente', 'recebida', 'cancelada') NOT NULL DEFAULT 'pendente',
    observacoes TEXT,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabela de itens de compra
CREATE TABLE IF NOT EXISTS itens_compra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    compra_id INT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (compra_id) REFERENCES compras(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

-- Tabela de movimentações de estoque
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    tipo ENUM('entrada', 'saida', 'ajuste') NOT NULL,
    quantidade INT NOT NULL,
    motivo VARCHAR(100) NOT NULL,
    referencia_id INT,
    referencia_tipo VARCHAR(50),
    usuario_id INT NOT NULL,
    data_movimentacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Inserir um usuário administrador padrão
-- Senha: admin123 (bcrypt hash)
INSERT INTO usuarios (nome, email, senha, nivel_acesso)
VALUES ('Administrador', 'admin@erpmaneiro.com', '$2b$12$tPFxGBQbCjNKnYIbEZtW7.LCGO9JYZmqjMoFJ7Ek7DZfJy5Rnz5Oe', 'admin')
ON DUPLICATE KEY UPDATE id = id;

-- Inserir algumas categorias de produtos
INSERT INTO categorias_produtos (nome, descricao)
VALUES 
('Eletrônicos', 'Produtos eletrônicos como smartphones, notebooks, etc.'),
('Móveis', 'Móveis para casa e escritório'),
('Vestuário', 'Roupas e acessórios'),
('Alimentos', 'Produtos alimentícios')
ON DUPLICATE KEY UPDATE id = id;

-- Inserir alguns produtos de exemplo
INSERT INTO produtos (codigo, nome, descricao, preco_custo, preco_venda, estoque_atual, categoria_id)
VALUES 
('PROD001', 'Smartphone XYZ', 'Smartphone com 128GB de armazenamento', 1200.00, 1800.00, 15, 1),
('PROD002', 'Notebook ABC', 'Notebook com processador i5, 8GB RAM', 2500.00, 3500.00, 8, 1),
('PROD003', 'Mesa de Escritório', 'Mesa de escritório em L com gavetas', 350.00, 650.00, 5, 2),
('PROD004', 'Camiseta Básica', 'Camiseta básica de algodão', 20.00, 45.00, 50, 3),
('PROD005', 'Café Premium', 'Café premium torrado e moído 500g', 15.00, 28.00, 30, 4)
ON DUPLICATE KEY UPDATE id = id;
