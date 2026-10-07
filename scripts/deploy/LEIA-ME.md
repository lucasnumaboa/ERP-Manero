# Pacote de instalação do ERP Maneiro (cópia no Docker)

Tudo o que precisa para rodar uma cópia do ERP, com o banco da produção, em outro PC.

## Como instalar

1. Copie esta pasta inteira (`deploy`) para o outro PC (pendrive, HD externo, Google Drive...).
2. No outro PC, instale o **Docker Desktop** (https://www.docker.com/products/docker-desktop/), abra e espere ficar pronto.
3. Dê dois cliques em **`INSTALAR.bat`**.
4. No fim ele abre **http://localhost:3000**. Entre com os **mesmos e-mails e senhas da produção**.

Com a pasta `imagens\` no pacote, a instalação **não precisa de internet**: os programas (MySQL, API e tela do ERP) já vão prontos. Sem ela, o Docker baixa e monta tudo na primeira vez (alguns minutos, com internet).

## O que tem aqui

| Item | O que é |
|------|---------|
| `INSTALAR.bat` | instala tudo: sobe o banco, importa, ajusta, sobe o ERP e copia as fotos |
| `ATUALIZAR_BANCO.bat` | troca só o banco da cópia pelo `.sql` mais novo da pasta `banco\` |
| `erp\` | o código do ERP, já configurado para este tipo de cópia (`.env` pronto e tela apontando para `http://localhost:8000`) |
| `banco\` | o banco exportado da produção (`.sql`) |
| `uploads\` | fotos e vídeos dos produtos |
| `imagens\` | os programas prontos para o Docker (MySQL 8.0, API e tela do ERP), carregados sem internet |
| `instalar.ps1` | o script que os `.bat` chamam |

## Bom saber

- **É uma cópia**: nada do que for feito aqui vai para a produção, e vice-versa.
- **WhatsApp desligado**: a instalação desliga os avisos (estoque, datas comemorativas, alertas), senão a cópia mandaria mensagem para os vendedores de verdade.
- **A IA usa a chave paga da produção.** Para não usar, depois de instalar entre em Configurações e apague a chave do OpenRouter.
- **Dados sensíveis**: `banco\` tem as senhas (criptografadas) dos usuários, a chave da IA e os dados dos clientes, e `erp\.env` tem as senhas do banco da cópia. Não suba esta pasta para o GitHub nem compartilhe.
- Portas usadas: 3000 (tela), 8000 (API) e 3307 (MySQL, para acessar de fora com um programa como DBeaver/Workbench; usuário e senha no `erp\.env`).

## Comandos úteis (PowerShell, dentro da pasta `erp`)

| Para... | Comando |
|---------|---------|
| Parar o ERP | `docker compose stop` |
| Ligar de novo | `docker compose start` |
| Ver o log da API | `docker compose logs -f backend` |
| **Apagar a cópia inteira** (banco e fotos) | `docker compose down -v` |

## Atualizar a cópia com dados mais novos

No PC da produção, rode `python scripts\gerar_pacote_deploy.py --imagens` (pasta `C:\ERP`): ele gera esta pasta de novo com o banco do momento. Copie a pasta `banco\` nova para o outro PC e dê dois cliques em `ATUALIZAR_BANCO.bat`.
