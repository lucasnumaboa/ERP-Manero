-- Script para atualizar os valores do ENUM de status na tabela pedidos_venda
USE erp_maneiro;

-- Alterar a coluna status para aceitar os valores usados no frontend
ALTER TABLE pedidos_venda 
MODIFY COLUMN status ENUM('pendente', 'aprovado', 'faturado', 'entregue', 'cancelado', 'finalizada', 'cancelada') DEFAULT 'pendente';

-- Atualizar os registros existentes se necessário
UPDATE pedidos_venda SET status = 'faturado' WHERE status = 'finalizada';
UPDATE pedidos_venda SET status = 'cancelado' WHERE status = 'cancelada';

-- Mostrar a estrutura atualizada da tabela
DESCRIBE pedidos_venda;
