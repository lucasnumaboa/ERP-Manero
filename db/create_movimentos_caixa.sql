-- Criação da tabela de movimentos de caixa
CREATE TABLE IF NOT EXISTS movimentos_caixa (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('entrada', 'saida') NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    data_movimento DATE NOT NULL,
    data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    documento_referencia VARCHAR(50),
    observacoes TEXT,
    usuario_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para otimização de consultas
CREATE INDEX idx_movimentos_caixa_tipo ON movimentos_caixa(tipo);
CREATE INDEX idx_movimentos_caixa_data ON movimentos_caixa(data_movimento);
CREATE INDEX idx_movimentos_caixa_usuario ON movimentos_caixa(usuario_id);
