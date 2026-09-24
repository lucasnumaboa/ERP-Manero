-- ============================================
-- Dados de Teste - Filamentos 3D
-- Execute este script após o init_db.py
-- ============================================

-- Custo hora padrão
INSERT INTO custo_hora_3d (valor_hora, descricao)
VALUES (5.00, 'Custo padrão por hora de impressão 3D')
ON DUPLICATE KEY UPDATE valor_hora = VALUES(valor_hora);

-- Filamentos de teste
INSERT INTO filamentos_3d (material, cor, peso_gramas, estoque_gramas, preco_referencia, descricao) VALUES
('PLA', 'Tri Color Bronze/Prata/Ouro', 1000, 1000, 94.63, 'Filamento PLA Tri Color Bronze/Prata/Ouro V-Silk High Speed Premium 1kg'),
('PETG', 'Verde Neon Translúcido', 1000, 1000, 73.58, 'Filamento PETG HF Verde Neon Translúcido High Fluidity Premium - 1Kg'),
('PETG', 'Rosa Cereja Neon Translúcido', 1000, 1000, 73.58, 'Filamento PETG HF Rosa Cereja Neon Translúcido High Fluidity Premium - 1Kg'),
('PLA', 'Duo Color Shadow Verde e Preto', 1000, 1000, 94.63, 'Filamento PLA Duo Color Shadow Verde e Preto V-Silk - 1kg'),
('PLA', 'Azul Macaron Velvet', 1000, 1000, 89.37, 'Filamento PLA Azul Macaron Velvet High Speed Premium - 1Kg'),
('PLA', 'Azul Titanium', 1000, 1000, 105.16, 'Filamento PLA Azul Titanium V-Silk High Speed Premium - 1Kg'),
('PLA', 'Roxo', 1000, 1000, 89.37, 'Filamento PLA Roxo High Speed Premium - 1Kg'),
('PLA', 'Cinza Claro Velvet', 1000, 1000, 83.05, 'Filamento PLA Cinza Claro Velvet High Speed Premium - 1Kg'),
('PLA', 'Tri Color Dourado/Rosa Choque/Verde', 1000, 1000, 94.63, 'Filamento PLA Tri Color Dourado / Rosa Choque / Verde V-Silk High Speed Premium - 1Kg'),
('PLA', 'Rosa Bebê Velvet', 1000, 1000, 83.05, 'Filamento PLA Rosa Bebê Velvet High Speed Premium - 1Kg'),
('PLA', 'Rosa Bebê', 1000, 1000, 89.37, 'Filamento PLA Rosa Bebê High Speed Premium - 1Kg'),
('PLA', 'Rosa', 1000, 1000, 89.37, 'Filamento PLA Rosa High Speed Premium - 1Kg');
