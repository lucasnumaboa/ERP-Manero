# ERP Maneiro: backup completo e como levar para outro PC

Esta pasta é atualizada **todo dia às 2h** pelo `scripts/backup_banco.py` (tarefa "ERP Maneiro - Backup
diario do banco"). Sozinha, ela basta para montar o ERP em outro computador.

| Pasta | O que tem |
|---|---|
| `projeto\` | cópia do `C:\ERP` inteiro: código, histórico do git, fotos (`frontend\uploads`), `.env`, logs, o `ERP AutoPost.exe` (`autopost\dist`) e o pacote Docker (`deploy\`). Ficam de fora só os ambientes Python (`.venv`) e caches, que se recriam. |
| `banco\` | os bancos de cada dia (`erp_maneiro_*.sql.gz` e `product_search_db_*.sql.gz`, do olx-porta3306), guardados por 30 dias |
| `uploads\` | fotos e vídeos dos produtos. Nada é apagado daqui, então uma foto apagada do ERP por engano ainda está aqui. |
| `config\` | os arquivos `.env` (senha do banco, chave do sistema, chave da IA) e o `last_api_url.json`. Eles já estão dentro de `projeto\`, e esta é uma cópia extra à mão. `backend__.env` é o `backend\.env`. |

> **Cuidado:** esta pasta tem senhas, chaves e os dados dos clientes. Não suba para o GitHub nem compartilhe.

---

## Levar a produção para outro PC (Windows, igual ao de hoje)

1. **Instale no PC novo:**
   - Python 3.11, marcando "Add python.exe to PATH";
   - MySQL Server 8 ou 9; anote a senha do root;
   - Node.js LTS (o frontend sobe com `npx http-server`);
   - Google Chrome (para o ERP AutoPost).
2. **Copie** a pasta `projeto` para **`C:\ERP`**. Tem que ser esse caminho: as tarefas e os scripts usam `C:\ERP`.
3. **Confira os `.env`.** Eles já vêm dentro de `projeto`. Se faltar algum, copie de `config\`: `backend__.env` vira `C:\ERP\backend\.env` e `.env` vira `C:\ERP\.env`. Em `backend\.env`:
   - ajuste `MYSQLDUMP_PATH` se o MySQL for de outra versão, por exemplo `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe`;
   - ajuste `BACKUP_COPIA_DIR` para um disco do PC novo, de preferência outro disco ou uma pasta do Google Drive/OneDrive.
4. **Instale as dependências** (Prompt de Comando, dentro de `C:\ERP`):
   ```bat
   python -m pip install -r requirements.txt
   ```
5. **Restaure os bancos.** O script pede a senha do root do MySQL, cria o usuário do ERP com a mesma senha do `.env` e importa o backup mais novo de cada banco:
   ```bat
   python scripts\restaurar_backup.py "<esta pasta>\banco"
   ```
6. **Suba o ERP** com `start_erp.bat` e confira em http://localhost:3000, entrando com os mesmos e-mails e senhas de sempre.
7. **Início automático e backup diário:**
   ```bat
   python instalar_inicio_automatico.py
   schtasks /create /f /tn "ERP Maneiro - Backup diario do banco" /sc daily /st 02:00 /tr "\"C:\Path\do\python.exe\" \"C:\ERP\scripts\backup_banco.py\""
   ```
   Em `/tr`, troque o caminho pelo do Python, que o comando `where python` mostra.
8. **Endereço público (Cloudflare).** O túnel **não está nesta pasta**: ele roda como serviço do Windows, com um token próprio.
   1. No painel da Cloudflare, abra **Zero Trust › Networks › Tunnels**, escolha o túnel do ERP e use **Add a connector**. Instale o `cloudflared` e rode no PC novo o comando que aparece (`cloudflared service install <token>`).
   2. **No PC antigo**, desligue o túnel com `cloudflared service uninstall` (Prompt como administrador). Se os dois ficarem ligados, a Cloudflare divide os acessos entre os dois PCs, e o antigo fica com dados velhos.
   3. Pare também o ERP no PC antigo (as tarefas "ERP Maneiro - Vigia" e o backup) para ninguém lançar venda lá.
9. **Faça a mudança com o ERP parado.** Logo antes de desligar o PC antigo, rode um backup novo para pegar as últimas vendas:
   ```bat
   python scripts\backup_banco.py
   ```
   No PC novo, restaure com `--substituir`.

## Ou: só uma cópia para testar (Docker)

Em `projeto\deploy\` está o pacote de instalação no Docker, que funciona sem internet e tem o próprio `LEIA-ME.md`.
- Ele usa o banco de quando o pacote foi gerado.
- Para usar o mais novo, descompacte o `.sql.gz` de `banco\` (com o 7-Zip) para dentro de `deploy\banco\` e dê dois cliques em `ATUALIZAR_BANCO.bat`.
- Essa cópia é separada da produção e não tem o endereço público.
