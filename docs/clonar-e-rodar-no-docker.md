# Rodar uma cópia do ERP em outro PC (Docker) com o banco da produção

> **Jeito mais fácil:** no PC da produção rode `python scripts/gerar_pacote_deploy.py`. Ele monta a pasta `deploy/` com o código, o banco exportado na hora, as fotos, o `.env` pronto e um instalador: no outro PC é só copiar a pasta e dar dois cliques em `INSTALAR.bat` (veja o `LEIA-ME.md` dentro dela). O passo a passo abaixo é o mesmo processo feito à mão.

Passo a passo para clonar o repositório em outro computador, subir o ERP no Docker e importar uma cópia do banco de produção. A cópia é **independente**: o que for feito nela não volta para a produção.

O que você precisa levar deste PC para o outro (por pendrive, Google Drive etc., **nunca pelo GitHub**):

| O quê | Onde está neste PC | Obrigatório? |
|-------|--------------------|--------------|
| Banco exportado (`.sql`) | `C:\ERP\backup\exportacao\erp_maneiro_AAAAMMDD_HHMM.sql` | sim |
| Fotos e vídeos dos produtos | pasta `C:\ERP\frontend\uploads` (~1,2 GB) | só se quiser as imagens |

> O `.sql` tem as senhas (criptografadas) de todos os usuários, a chave paga da IA e dados de clientes. Por isso ele fica fora do git (pasta `backup/` está no `.gitignore`). Não suba esse arquivo para nenhum repositório.

Para gerar uma exportação nova (aqui no PC da produção), veja o item "Atualizar a cópia" no fim.

---

## No outro PC

Precisa ter instalado: **Git** e **Docker Desktop** (aberto e rodando). Os comandos abaixo são para o **PowerShell**, dentro da pasta onde você quer o projeto.

### 1. Clonar o repositório

```powershell
git clone https://github.com/lucasnumaboa/ERP-Manero.git
cd ERP-Manero
```

### 2. Criar o arquivo de configuração `.env`

```powershell
copy .env.docker .env
notepad .env
```

No `.env`, troque:

- `SECRET_KEY=` → uma chave nova com 64 caracteres. Para gerar no PowerShell:
  ```powershell
  [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  ```
- `MYSQL_ROOT_PASSWORD` e `DB_PASSWORD` → senhas suas (são só do banco dessa cópia).
- Se esse PC já tiver um MySQL instalado usando a porta 3306, mude `DB_PORT_EXTERNAL=3306` para `3307`.

### 3. Apontar a tela para a API desse PC

Abra `frontend\js\config.js` e troque a linha:

```js
const ERP_API_URL_PADRAO = 'https://erp-api-call.manerostream.com.br';
```

por:

```js
const ERP_API_URL_PADRAO = 'http://localhost:8000';
```

> Sem isso, a tela da cópia conversaria com a API de **produção**. **Não faça commit dessa alteração** (na produção o `change_api_link.py` grava o endereço certo de novo a cada início, mas é melhor não arriscar).

### 4. Subir só o banco

```powershell
docker compose up -d db
docker compose ps
```

Espere a coluna STATUS do `erp-maneiro-db` mostrar **`(healthy)`** (leva uns 30 a 60 segundos na primeira vez). Rode o `docker compose ps` de novo até aparecer.

### 5. Importar o banco

Copie o `.sql` exportado para a pasta do projeto (ex.: `erp_maneiro_20261005_2209.sql`) e rode, trocando o nome do arquivo:

```powershell
docker cp erp_maneiro_20261005_2209.sql erp-maneiro-db:/tmp/erp_maneiro.sql
docker exec erp-maneiro-db sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro < /tmp/erp_maneiro.sql'
```

Leva uns 15 segundos e não mostra nada quando dá certo.

### 6. Ajustar o banco para ser uma cópia

```powershell
docker cp scripts/apos_importar_no_docker.sql erp-maneiro-db:/tmp/apos.sql
docker exec erp-maneiro-db sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro < /tmp/apos.sql'
```

Isso faz duas coisas (o script mostra o resultado no final):

- `link_api` passa a ser `http://localhost:8000` (a API da cópia);
- **desliga os avisos por WhatsApp** (`webhook_ativo = false`): sem isso, a cópia mandaria mensagem de estoque e de datas comemorativas para os vendedores de verdade.

Se não quiser que a cópia use a chave **paga** da IA, abra `scripts/apos_importar_no_docker.sql` e tire o `--` da linha do `apikey_openrouter` antes de rodar.

### 7. Subir o ERP

```powershell
docker compose up -d --build
```

A primeira vez demora alguns minutos (baixa as imagens e instala as dependências). O backend roda o `init_db.py` a cada início: ele só cria o que estiver faltando e **não mexe** nos dados importados.

### 8. Fotos e vídeos dos produtos (opcional)

Copie a pasta `uploads` para a pasta do projeto e rode:

```powershell
docker cp .\uploads\. erp-maneiro-backend:/app/frontend/uploads/
```

### 9. Abrir

Acesse **http://localhost:3000** e entre com os **mesmos e-mails e senhas da produção** (o banco é uma cópia).

---

## Dia a dia

| Para... | Comando |
|---------|---------|
| Parar | `docker compose stop` |
| Ligar de novo | `docker compose start` |
| Ver o log do backend | `docker compose logs -f backend` |
| Atualizar o código (depois de `git pull`) | `docker compose up -d --build` |
| **Apagar tudo** (banco e fotos da cópia) | `docker compose down -v` |

### Atualizar a cópia com o banco mais recente

1. **No PC da produção**, gere uma exportação nova (pasta `C:\ERP`):
   ```powershell
   python scripts/backup_banco.py
   ```
   Ela sai compactada em `backup\automatico\erp_maneiro_AAAAMMDD_HHMMSS.sql.gz`.
2. **No outro PC**, repita os passos 5 e 6. A importação substitui todas as tabelas (o arquivo tem `DROP TABLE IF EXISTS`). Para o arquivo `.sql.gz`, troque o comando do passo 5 por:
   ```powershell
   docker cp erp_maneiro_AAAAMMDD_HHMMSS.sql.gz erp-maneiro-db:/tmp/erp_maneiro.sql.gz
   docker exec erp-maneiro-db sh -c 'gunzip < /tmp/erp_maneiro.sql.gz | MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro'
   ```
3. `docker compose restart backend`.

### Acessar de outro aparelho da rede (celular, outro PC)

Troque `localhost` pelo IP do PC (ex.: `192.168.0.10`) no `config.js` (passo 3) **e** no banco:

```powershell
docker exec erp-maneiro-db mysql -uroot -pSUA_SENHA_ROOT erp_maneiro -e "UPDATE configuracoes SET valor='http://192.168.0.10:8000' WHERE chave='link_api'"
docker compose up -d --build frontend
```

(troque `SUA_SENHA_ROOT` pelo `MYSQL_ROOT_PASSWORD` do `.env`)

---

## Problemas comuns

- **`port is already allocated` na porta 3306**: já tem MySQL nesse PC. Mude `DB_PORT_EXTERNAL` no `.env` (passo 2) e rode de novo.
- **A tela abre, mas mostra dados de produção ou "backend offline"**: faltou o passo 3 (`config.js`) ou o passo 6 (`link_api`). Depois de mudar o `config.js`, rode `docker compose up -d --build frontend` e recarregue a página com Ctrl+F5.
- **`erp-maneiro-backend` fica reiniciando**: veja `docker compose logs backend`. Se aparecer `SECRET_KEY`, faltou preencher no `.env`.
