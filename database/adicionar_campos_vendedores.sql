-- ============================================
-- Script SQL para adicionar campos à tabela vendedores
-- Executa apenas se a tabela já existir
-- ============================================

-- Verifica se a tabela vendedores existe e adiciona os campos que faltam
-- Este script é seguro para executar múltiplas vezes (idempotente)

DELIMITER //

-- Procedimento para adicionar campos à tabela vendedores
DROP PROCEDURE IF EXISTS adicionar_campos_vendedores//

CREATE PROCEDURE adicionar_campos_vendedores()
BEGIN
    DECLARE tabela_existe INT DEFAULT 0;
    
    -- Verifica se a tabela vendedores existe
    SELECT COUNT(*) INTO tabela_existe 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = 'vendedores';
    
    IF tabela_existe > 0 THEN
        -- Adiciona campo 'email' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'email'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN email VARCHAR(100) AFTER nome;
            SELECT 'Campo email adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'telefone' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'telefone'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN telefone VARCHAR(20) AFTER email;
            SELECT 'Campo telefone adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'comissao_percentual' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'comissao_percentual'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN comissao_percentual DECIMAL(5, 2) DEFAULT 0 AFTER telefone;
            SELECT 'Campo comissao_percentual adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'usuario_id' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'usuario_id'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN usuario_id INT AFTER comissao_percentual;
            SELECT 'Campo usuario_id adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'ativo' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'ativo'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN ativo BOOLEAN DEFAULT TRUE AFTER usuario_id;
            SELECT 'Campo ativo adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'banco' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'banco'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN banco VARCHAR(100) AFTER ativo;
            SELECT 'Campo banco adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'agencia' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'agencia'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN agencia VARCHAR(20) AFTER banco;
            SELECT 'Campo agencia adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'conta' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'conta'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN conta VARCHAR(20) AFTER agencia;
            SELECT 'Campo conta adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'pix' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'pix'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN pix VARCHAR(255) AFTER conta;
            SELECT 'Campo pix adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'nome_destinatario' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'nome_destinatario'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN nome_destinatario VARCHAR(100) AFTER pix;
            SELECT 'Campo nome_destinatario adicionado' AS resultado;
        END IF;
        
        -- Adiciona campo 'data_cadastro' se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND column_name = 'data_cadastro'
        ) THEN
            ALTER TABLE vendedores ADD COLUMN data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER nome_destinatario;
            SELECT 'Campo data_cadastro adicionado' AS resultado;
        END IF;
        
        -- Adiciona FOREIGN KEY para usuario_id se não existir
        IF NOT EXISTS (
            SELECT * FROM information_schema.table_constraints 
            WHERE table_schema = DATABASE() 
            AND table_name = 'vendedores' 
            AND constraint_name = 'fk_vendedores_usuario'
        ) THEN
            -- Verifica se a tabela usuarios existe antes de criar a FK
            IF EXISTS (
                SELECT * FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'usuarios'
            ) THEN
                ALTER TABLE vendedores 
                ADD CONSTRAINT fk_vendedores_usuario 
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
                SELECT 'Foreign Key fk_vendedores_usuario adicionada' AS resultado;
            END IF;
        END IF;
        
        SELECT 'Tabela vendedores atualizada com sucesso!' AS resultado;
    ELSE
        SELECT 'Tabela vendedores não existe. Execute o init_db.py primeiro.' AS resultado;
    END IF;
END//

DELIMITER ;

-- Executa o procedimento
CALL adicionar_campos_vendedores();

-- Remove o procedimento após execução
DROP PROCEDURE IF EXISTS adicionar_campos_vendedores;

-- Mostra a estrutura final da tabela
DESCRIBE vendedores;
