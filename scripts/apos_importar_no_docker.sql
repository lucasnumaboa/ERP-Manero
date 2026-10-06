-- Ajustes para uma CÓPIA do banco de produção rodando em outro PC (Docker).
-- Rode depois de importar o .sql exportado da produção (passo a passo em docs/clonar-e-rodar-no-docker.md).

-- 1) A tela passa a usar a API deste PC (sem isso o frontend lê o link_api do banco e vai para a produção).
UPDATE configuracoes SET valor = 'http://localhost:8000' WHERE chave = 'link_api';

-- 2) Desliga tudo o que manda mensagem para fora: notificações de estoque e datas comemorativas para os
--    vendedores (WhatsApp via n8n), alertas do sistema e o webhook do OLX Finder. Senão a cópia avisa as
--    pessoas de verdade sobre movimentações que só aconteceram no teste.
UPDATE configuracoes SET valor = 'false' WHERE chave = 'webhook_ativo';
UPDATE configuracoes SET valor = '' WHERE chave IN ('alerta_telefones', 'olx_webhook_url');

-- 3) Opcional: tire o comentário para a cópia NÃO usar a chave paga da IA (cada pergunta ao assistente
--    ou descrição gerada é cobrada na conta do OpenRouter da produção).
-- UPDATE configuracoes SET valor = '' WHERE chave = 'apikey_openrouter';

SELECT chave, valor FROM configuracoes WHERE chave IN ('link_api', 'webhook_ativo', 'alerta_telefones', 'olx_webhook_url');
