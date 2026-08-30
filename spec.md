# Spec — Novas features ERP Maneiro (2026-08-28)

Solicitado pelo usuário em 2026-08-28. Este documento registra o pedido original, a análise técnica do sistema existente e a decisão de implementação para cada item. Serve como referência do que foi (ou será) alterado no banco `erp_maneiro` e no código de `backend/` e `frontend/`.

## Pedido original (resumo)

1. Criar este arquivo de spec com tudo o que foi pedido. Se precisar criar/alterar tabela no MySQL (credenciais em `.env`), fazer backup antes de alterar qualquer coisa, e validar (sem erros) depois de cada alteração.
2. No topo do programa, mostrar um contador regressivo do tempo até o usuário ser desconectado por inatividade (o sistema já tem um campo que controla esse tempo).
3. Em `produtos.html`: permitir anexar 1 vídeo do produto (além das imagens); aumentar o limite de imagens de 3 para 5. Em `estoque.html`: permitir baixar o vídeo do produto, do mesmo jeito que já é possível baixar as imagens.
4. Criar cadastro de "depósitos" na área de produtos. Em `estoque.html`, adicionar uma coluna mostrando em qual depósito está o estoque de cada produto — só o dono do produto pode editar essa coluna. Ao cadastrar um produto, se nenhum depósito for indicado, ele deve apontar para um depósito padrão.

## Levantamento técnico

- Backend: FastAPI (`backend/main.py`), MySQL via `mysql.connector` (`backend/database.py`), auth JWT (`backend/auth.py`).
- Sessão/timeout: `backend/timeout_manager.py` roda em thread e desconecta (`usuarios.connected = FALSE`) quem ficar sem `last_access` por mais que `configuracoes.chave = 'timeout_time'` minutos (valor atual: 15). `get_current_user` (auth.py) atualiza `usuarios.last_access = NOW()` a cada requisição autenticada bem-sucedida.
- Produtos: tabela `produtos`, coluna `caminho_imagem` (TEXT) guarda até 3 caminhos separados por vírgula. Upload em `backend/routers/produtos.py` (`POST /api/produtos` e `POST /api/produtos/{id}/upload`), download em `GET /api/produtos/imagem/{filename}`.
- Estoque: `backend/routers/estoque.py` (`GET /api/estoque/produtos`) já retorna `usuario_id` do produto para o frontend decidir se o usuário logado é o "dono" (`estoque.js` compara `produto.usuario_id == currentUserId`) — é assim que o botão "Adicionar Movimentação" já é restrito hoje (checagem só no frontend, sem checagem equivalente no backend). Vamos seguir a mesma convenção para a edição do depósito.
- Não existe hoje nenhuma tabela de depósitos/almoxarifados. O estoque é um valor único por produto (`produtos.estoque_atual`), não dividido por local — por isso "onde o estoque está" será implementado como um único campo apontando o depósito do produto (`produtos.deposito_id`), e não como saldo por depósito.

## Alterações de banco de dados (erp_maneiro)

Todas as alterações são aditivas (novas tabelas/colunas nullable) — nenhuma coluna existente é removida ou alterada, nenhum dado existente é apagado.

1. Nova tabela `depositos`:
   ```sql
   CREATE TABLE depositos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nome VARCHAR(100) NOT NULL UNIQUE,
       descricao TEXT,
       padrao BOOLEAN DEFAULT FALSE,
       ativo BOOLEAN DEFAULT TRUE,
       data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```
   Insere a linha padrão: `('Depósito Padrão', 'Depósito padrão do sistema', TRUE, TRUE)`.

2. `produtos.deposito_id INT NULL` (FK → `depositos.id`). Produtos existentes são preenchidos com o id do depósito padrão (`UPDATE produtos SET deposito_id = <id padrão> WHERE deposito_id IS NULL`).

3. `produtos.caminho_video VARCHAR(255) NULL` — caminho relativo do vídeo do produto (padrão `uploads/produtos/videos/<uuid>.<ext>`), mesma lógica de `caminho_imagem` mas para um único arquivo.

Migração feita por script idempotente (`ALTER TABLE ... IF NOT EXISTS` / checagem via `information_schema` antes de alterar), para poder rodar mais de uma vez sem erro.

## Backup

Antes de qualquer `CREATE TABLE`/`ALTER TABLE`, é gerado em `backup/YYYYMMDD_HHMMSS/`:
- Dump completo do banco `erp_maneiro` (schema + dados).
- Cópia dos arquivos de código que serão alterados (backend e frontend).

## Item 2 — Contador de sessão

- Novo endpoint `GET /api/configuracoes/timeout-sessao` (autenticado, qualquer usuário — não só admin) retornando `{"timeout_minutos": N}` lido de `configuracoes.chave = 'timeout_time'`.
- `frontend/js/auth.js` ganha um contador que:
  - Busca o valor de `timeout_minutos` ao carregar a página (e a cada 5 min, para refletir mudança feita por um admin).
  - Mostra uma barra flutuante fixa no topo da tela ("Sessão expira em MM:SS"), fica laranja abaixo de 2 min e vermelha abaixo de 30s.
  - Reinicia a contagem sempre que uma chamada autenticada tem sucesso (`fetchWithAuth`), pois é exatamente quando o backend atualiza `last_access` — mantendo o contador sincronizado com a regra real de desconexão, sem precisar duplicar a lógica do `timeout_manager.py`.
  - Ao chegar a zero, mostra o modal de sessão expirada já existente (`showSessionExpiredModal`) e redireciona ao login.
- Não roda na página de login (`index.html`).

## Item 3 — Vídeo do produto + até 5 imagens

- Backend (`backend/routers/produtos.py`):
  - `criar_produto` e `upload_imagens_produto`: limite de imagens passa de 3 para 5; novo parâmetro opcional `video` (arquivo único, valida `content_type` iniciando com `video/`), salvo em `frontend/uploads/produtos/videos/`, caminho gravado em `produtos.caminho_video`. Ao editar sem enviar vídeo novo, mantém o vídeo já existente (mesmo comportamento hoje aplicado às imagens).
  - Novo endpoint `GET /api/produtos/video/{filename}` (mesmo padrão de `GET /api/produtos/imagem/{filename}`) para download.
- Frontend `produtos.html` / `js/produtos.js`:
  - Aba "Imagens" passa a aceitar até 5 imagens (texto e validação atualizados) e ganha um campo de upload de vídeo (1 arquivo, `accept="video/*"`) com preview e opção de remover antes de salvar.
  - Ao editar um produto existente, mostra o vídeo já cadastrado (com opção de assistir/baixar), igual ao que já acontece com imagens.
- Frontend `estoque.html` / `js/estoque.js`:
  - No modal de detalhes do produto, nova seção "Vídeo do Produto" com player e botão "Download" (mesmo padrão do botão de download de imagem já existente).

## Item 4 — Depósitos

- Backend: novo router `backend/routers/depositos.py` (`/api/depositos`), CRUD simples no mesmo padrão de `categorias.py`:
  - `GET /` lista depósitos (com contagem de produtos vinculados).
  - `POST /` cria depósito; se `padrao=true`, desmarca o depósito padrão anterior (garante um único padrão).
  - `PUT /{id}` atualiza; não permite tirar o `padrao` do depósito atual sem antes marcar outro como padrão.
  - `DELETE /{id}` bloqueia exclusão do depósito padrão ou de depósitos com produtos vinculados.
- `backend/routers/produtos.py`:
  - `ProdutoUpdate`/formulários de criação e upload ganham `deposito_id` opcional.
  - Ao criar produto sem `deposito_id`, resolve automaticamente para o depósito marcado como `padrao=true`.
  - `listar_produtos` e `GET /api/estoque/produtos` (`estoque.py`) passam a fazer `LEFT JOIN depositos` e retornar `deposito_nome`.
- Frontend `produtos.html` / `js/produtos.js`:
  - Novo campo "Depósito" (select) na aba "Dados", ao lado da Categoria, com botão "+" que abre modal "Novo Depósito" (mesmo padrão do modal "Nova Categoria" já existente).
- Frontend `estoque.html` / `js/estoque.js`:
  - Nova coluna "Depósito" na tabela de estoque (visão em lista). Se o usuário logado for o dono do produto (`produto.usuario_id == currentUserId` — mesma checagem já usada para o botão "Adicionar Movimentação"), a célula é um `<select>` editável que salva via `PUT /api/produtos/{id}`; caso contrário, mostra só o nome do depósito (texto, não editável). Igual à convenção já usada no restante da página, a restrição de dono é aplicada no frontend (não há checagem de dono no backend para outras ações de estoque hoje).

## Validação pós-alteração

- Migração: reconferir `DESCRIBE produtos`, `SELECT * FROM depositos`, contagem de produtos com `deposito_id` preenchido.
- Backend: iniciar o servidor (`python main.py` / processo já em execução recarregado) e checar ausência de erros de import/rota nos logs; chamar os novos endpoints (`/api/configuracoes/timeout-sessao`, `/api/depositos`) autenticado.
- Frontend: abrir `produtos.html` e `estoque.html` no navegador, cadastrar um depósito, cadastrar um produto com imagens/vídeo, conferir contador de sessão, conferir download de vídeo e edição do depósito no estoque.
