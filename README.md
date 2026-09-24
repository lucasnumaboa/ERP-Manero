# ERP Maneiro

<div align="center">
  <img src="erp-manero.gif" alt="ERP Maneiro" width="500" height="250">
</div>

Sistema ERP completo para pequenas e médias empresas, com cliente desktop para automação de postagens no Facebook Marketplace.

![Demo do Sistema](demo.JPG)

---

## Tecnologias

| Backend | Frontend |
|---------|----------|
| FastAPI + Uvicorn | HTML5/CSS3/JavaScript |
| MySQL 8.0+ | Chart.js |
| JWT + Bcrypt | Design Responsivo |

---

## Funcionalidades

### Módulos do ERP

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | KPIs, gráficos de vendas, produtos mais vendidos |
| **Clientes** | Cadastro PF/PJ, histórico de compras |
| **Produtos** | Cadastro, categorias, controle de estoque, até 5 imagens + 1 vídeo, miniaturas automáticas, taxa de armazenagem |
| **Produtos 3D** | Catálogo de peças/modelos 3D com paginação |
| **Filamentos 3D** | Controle de estoque de filamentos por cor/material |
| **Depósitos** | Cadastro de locais de estoque, com depósito padrão e coluna de localização no estoque |
| **Vendas** | Pedidos, múltiplos itens, formas de pagamento, comissões, cobrança opcional da taxa de armazenagem por item |
| **Compras** | Pedidos para fornecedores, aprovação, recebimento |
| **Estoque** | Movimentações, alertas de estoque mínimo, download de imagens/vídeo do produto |
| **Financeiro** | Contas a pagar/receber e condições de pagamento |
| **Controle Financeiro** | Visão consolidada de entradas e saídas |
| **Orçamentos** | Orçamentos com desconto por quantidade, adicional por período, custo de entrega por km, itens avulsos e campos livres configuráveis |
| **Propostas** | Propostas comerciais com validade e conversão em pedidos |
| **Postagens** | Rastreio de entregas por transportadora |
| **Relatórios** | Vendas, estoque, financeiro (Excel/PDF) |
| **Metas** | Definição e acompanhamento de metas de vendedores |
| **Vendedores** | Cadastro, comissões, performance |
| **Parceiros** | Gestão de fornecedores e parceiros |
| **Calendário** | Agenda de compromissos e eventos |
| **Chat IA por Produto** | Widget flutuante para vendedores tirarem dúvidas sobre um produto com IA, com ditado por voz offline |
| **Busca OLX** | Localização e avaliação de anúncios/concorrentes na OLX |
| **Softwares** | Catálogo de softwares/downloads internos |

### Autenticação

- JWT Tokens com expiração configurável, com contador de sessão exibido no topo do sistema
- Senhas criptografadas com Bcrypt
- Níveis: Admin, Vendedor, Comprador, Financeiro
- Permissões granulares por grupo de usuário (visualizar/editar) para cada módulo, aplicadas também na API (não só nas telas)
- Regras de dono do produto (movimentar estoque, trocar depósito) validadas no servidor

---

## Novidades

- **Contador de sessão**: barra no topo do sistema mostra quanto tempo falta até o usuário ser desconectado por inatividade.
- **Vídeo de produto**: além de até 5 imagens, cada produto pode ter 1 vídeo anexado, com download disponível em Estoque.
- **Depósitos**: cadastro de locais físicos de estoque, com um depósito padrão (usado quando o produto não aponta nenhum) e edição rápida via modal na tela de Estoque (restrita ao dono do produto).
- **Miniaturas automáticas**: imagens de produto geram thumbnails para carregamento mais rápido nas listagens.
- **Paginação em Produtos 3D**: listagem paginada (20 itens por página).
- **Instruções e Dúvidas + Chat IA**: campo de texto livre por produto usado como base de conhecimento para um widget de chat com IA, disponível em todas as telas, onde vendedores tiram dúvidas sobre um produto específico (com filtro "somente produto com estoque").
- **Assistente de produtos (IA com acesso ao banco)**: o chat flutuante já abre pronto para perguntar, por texto ou áudio (a pergunta gravada é enviada sozinha) — ex.: "tem placa rx580 disponível?". A IA usa ferramentas de consulta (`backend/ferramentas_ia.py`: buscar produtos, detalhes do produto, categorias — só leitura, sem preço de custo), no mesmo conceito das ferramentas MCP, via function calling do provedor (`conversar_com_ferramentas` em `routers/ia.py`, OpenRouter/LM Studio/Ollama). Os produtos consultados aparecem como atalhos para focar a conversa em um deles.
- **Ditado por voz offline**: transcrição de áudio local (sem depender de serviços externos) via NVIDIA Parakeet/sherpa-onnx, usada no chat de IA e nos campos de Descrição e Instruções/Dúvidas do produto.
- **Filtro "apenas com estoque"** na listagem de Produtos.
- **Limpeza de sidebar**: simplificação dos scripts de menu lateral, mantendo apenas o necessário.
- **Taxa de armazenagem**: cada produto pode ter uma taxa (valor fixo por unidade ou % sobre o preço da venda), exibida em Estoque; na venda, marcando "cobrar taxa de armazenagem" no item, o valor entra no custo e já desconta do lucro nos relatórios.
- **Orçamentos**: nova tela em Vendas › Orçamentos para vendedores montarem orçamentos; configurações (preço/km, períodos, itens avulsos, campos, descontos) ficam com o admin.

### Segurança e confiabilidade

- **Permissões na API**: as permissões dos grupos passaram a ser verificadas pelo servidor em cada módulo (`backend/permissoes.py`).
- **Chave de assinatura obrigatória**: o backend não inicia sem uma `SECRET_KEY` própria (mínimo 32 caracteres).
- **Proteção contra XSS**: textos vindos de usuários são escapados antes de ir para a tela (`escapeHtml` em `frontend/js/auth.js`).
- **"Lembrar e-mail"**: o login não guarda mais a senha no navegador.
- **Estoque sem venda dupla**: a baixa só acontece se houver saldo no momento da gravação, mesmo com vendas simultâneas.
- **Códigos sem repetição**: pedidos, compras, contas e orçamentos usam o maior número + 1 com trava, e o banco recusa código repetido.
- **IA pelo servidor**: descrição de produto, Produtos 3D e demais telas pedem o texto ao backend (`/api/ia/gerar`); a chave do provedor não vai mais para o navegador, e em Configurações ela aparece mascarada (deixar o campo vazio mantém a salva).
- **Sessão renovada enquanto o usuário usa o sistema**: o token é trocado por um novo (`/token/renovar`) quando faltam menos de 10 minutos; a desconexão por inatividade continua valendo.
- **Limite de tentativas no login**: 5 senhas erradas para o mesmo e-mail (ou 20 de um mesmo IP) em 15 minutos bloqueiam novas tentativas por 15 minutos (`backend/limite_login.py`).
- **Senhas com `bcrypt` direto**: saiu a `passlib`, que não é mais mantida e escrevia erro no log a cada login; as senhas já cadastradas continuam valendo.
- **Início automático**: o ERP volta sozinho quando o PC reinicia ou quando um processo cai (veja *Início automático* abaixo).

### Desempenho

- **Pool de conexões MySQL**: respostas até 3,6× mais rápidas.
- **Logo do login em WebP animado**: 1,2 MB em vez de 7 MB.
- **Cache no frontend**: o servidor (`start_frontend.bat`, `-c0`) faz o navegador conferir cada arquivo e baixar só o que mudou; trocar de tela caiu de ~470 KB para ~7 KB.
- **Endereço da API consultado uma vez por sessão**, em vez de antes de cada requisição.
- **Versão nos endereços de CSS/JS** (`versionar_frontend.py`, roda no fim do `change_api_link.py`): a Cloudflare manda o navegador guardar CSS/JS por 4 horas; com `?v=<impressão do conteúdo>` nos HTML, o que mudou é baixado na hora. Depois de editar CSS/JS com o ERP no ar: `python versionar_frontend.py`.
- **Dashboard**: 8 pedidos ao servidor, todos ao mesmo tempo (antes 15, um depois do outro): carrega em ~0,5 s em vez de ~1,6 s.
- **Miniaturas em Produtos 3D**: o card mostra um JPEG leve (primeiro quadro, no caso do GIF) e a animação só é baixada ao passar o mouse; uma página caiu de ~7,7 MB para ~0,45 MB. `python scripts/gerar_miniaturas_3d.py` cria as que faltarem.

### Interface

- **Menu lateral sem "piscar"**: é montado já filtrado pelas permissões do usuário (antes aparecia o menu completo por um instante).
- **Avisos e confirmações no visual do ERP** (`js/avisos.js`) no lugar dos pop-ups do navegador.
- **Botão de recolher o menu** e **nome do usuário** centralizados no `js/sidebar-template.js`.
- **Celular** (`css/celular.css`, último CSS de cada tela): menu em gaveta (botão ☰), conteúdo na largura da tela, tabelas largas rolam dentro do próprio quadro e as tabelas com `.tabela-cartoes` (Home, Vendas, Produtos, histórico de Orçamentos) viram cartões — o nome de cada coluna é preenchido pelo `sidebar-template.js`.
- **Instalável como app** (`manifest.webmanifest`, `sw.js`, ícones em `img/app/`): no celular aparece "Adicionar à tela inicial" e o ERP abre em tela cheia. O service worker não guarda telas em cache (atualizações chegam na hora); só mostra `offline.html` quando a internet cai.
- **Estilos de Relatórios e Produtos** saíram do HTML para `css/relatorios.css` e `css/produtos-tela.css` (visual conferido propriedade por propriedade, sem mudança).

---

## Cliente AutoPost Facebook

Aplicação desktop (`cliente_autopost_facebook/gui.py`) para automação de postagens no Facebook Marketplace.

### Funcionalidades

- **Login integrado** com a API do ERP
- **Seleção de produtos** por categoria (filtra ativos, com estoque e faturáveis)
- **Edição de preços** personalizados antes de postar
- **Automação Selenium** para publicar no Marketplace
- **Postagem em grupos** (até 20 grupos automaticamente)
- **Delay configurável** entre postagens (mínimo 15s)
- **Adicionar contato** na descrição automaticamente
- **Salva cookies** do Facebook para sessões futuras

### Requisitos

- Google Chrome instalado
- Dependências: `ttkbootstrap`, `selenium`, `requests`, `Pillow`, `pyperclip`

### Uso

```bash
cd cliente_autopost_facebook
python gui.py
```

1. Configure a URL da API do ERP
2. Faça login com suas credenciais
3. Selecione a categoria do Facebook (Videogames, Eletrônicos, Celulares)
4. Selecione os produtos desejados
5. Clique em "Executar" e faça login no Facebook quando solicitado

---

## Instalação com Docker (Recomendado)

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/ERP-Maneiro.git
cd ERP-Maneiro
```

### 2. Configure as variáveis de ambiente


```bash
cp .env.docker .env
# Preencha SECRET_KEY no .env (obrigatório):
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Inicie os containers

```bash
docker-compose up -d --build
```

### 4. Acesse o sistema

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Docs API | http://localhost:8000/docs |

### Credenciais padrão

| Campo | Valor |
|-------|-------|
| Email | `admin@erpmaneiro.com` |
| Senha | `admin123` |

> ⚠️ **Altere a senha após o primeiro acesso!**

### Comandos úteis

```bash
# Ver logs
docker-compose logs -f

# Parar containers
docker-compose down

# Parar e remover dados
docker-compose down -v
```

---

## Instalação Manual

### 1. Clone e instale dependências

```bash
git clone https://github.com/seu-usuario/ERP-Maneiro.git
cd ERP-Maneiro
pip install -r requirements.txt
```

### 2. Configure o ambiente

```bash
cp .env.example backend/.env
# Edite com suas credenciais do MySQL e gere a SECRET_KEY:
python -c "import secrets; print(secrets.token_hex(32))"
```

> O backend não inicia sem uma `SECRET_KEY` própria.

### 3. Inicialize o banco de dados

```bash
python init_db.py
```

### 4. Execute

```bash
start_erp.bat
```

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| API | http://localhost:8000 |
| Docs API | http://localhost:8000/docs |

### Credenciais padrão

- **Email:** `admin@erpmaneiro.com`
- **Senha:** `admin123`

> ⚠️ Altere a senha após o primeiro acesso.

### Início automático (sem administrador)

```bash
python instalar_inicio_automatico.py
```

Cria a tarefa agendada **ERP Maneiro - Vigia** (a cada 5 minutos) e um atalho na pasta Inicializar. As duas rodam o `vigia_erp.py`, sem janela: se a porta 8000 (backend) ou 3000 (frontend) não responder, ele sobe o `start_backend.bat` / `start_frontend.bat` (rodando o `change_api_link.py` antes do frontend) e grava em `log/vigia_<data>.log`. Assim o ERP volta sozinho depois de reiniciar o PC ou se algum processo cair. Para desfazer: `python instalar_inicio_automatico.py --remover`.

Funciona com o usuário logado no Windows. Para subir antes do login, use `instalar_servico.py` como administrador, com o NSSM instalado.

O vigia também:
- **avisa por WhatsApp** quando precisou religar algo, quando não conseguiu religar (uma vez, até voltar) e quando o disco passa de 95% (uma vez por dia). Usa o mesmo webhook das notificações de estoque; os números ficam em Configurações › Notificações › *Telefone(s) para alertas do sistema* (botão **Testar alerta**). Se o banco ou o webhook estiverem fora logo após o PC ligar, o aviso é tentado de novo nas rodadas seguintes;
- **apaga os logs com mais de 30 dias** (`log/*_AAAA-MM-DD.log`), uma vez por dia.

O administrador também vê um aviso ao entrar no ERP quando o disco do servidor passa de 95%.

---

## Endereço da API no frontend

O domínio da API fica **só** em `frontend/js/config.js` (`ERP_API_URL_PADRAO`). O `start_erp.bat` roda o `change_api_link.py`, que grava ali o `link_api` cadastrado no banco — assim um `localhost` vindo do PC de desenvolvimento vira o endereço publicado (Cloudflare) sem editar arquivo à mão.

---

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest
```

A suíte (`tests/`) cria um banco separado (`erp_maneiro_teste`) com o `init_db.py` — então também confere que uma instalação nova funciona — e testa segurança, estoque, vendas, orçamentos e regras do frontend. O banco de produção não é tocado.

Os testes rodam sozinhos antes de cada `git push` (gancho em `.githooks/pre-push`). Num clone novo, ative com:

```bash
git config core.hooksPath .githooks
```

---

## Backup do banco

`scripts/backup_banco.py` gera um dump compactado (`mysqldump`) em `backup/automatico/` e apaga os com mais de 30 dias. Em seguida copia as fotos e vídeos dos produtos (`frontend/uploads`) para `backup/uploads/`: só o que é novo ou mudou, e nada é apagado de lá quando some do ERP (dá para recuperar foto apagada por engano).

```bash
python scripts/backup_banco.py
```

Para rodar todo dia no Windows, agende esse comando no Agendador de Tarefas. Para ter uma cópia fora da máquina, defina `BACKUP_COPIA_DIR` no `backend/.env` apontando para uma pasta sincronizada (Google Drive, OneDrive etc.).

---

## Estrutura do Projeto

```
ERP-Maneiro/
├── backend/
│   ├── routers/          # Endpoints da API
│   ├── main.py           # App FastAPI
│   ├── permissoes.py     # Permissões dos grupos aplicadas na API
│   ├── auth.py           # Autenticação JWT
│   ├── database.py       # Conexão MySQL
│   └── config.py         # Configurações
├── frontend/
│   ├── css/              # Estilos
│   ├── js/               # Scripts
│   └── *.html            # Páginas
├── cliente_autopost_facebook/
│   ├── gui.py            # Interface desktop
│   └── helpers/          # Scraper Selenium
├── database/             # Scripts SQL (inclui tabelas de Orçamentos)
├── scripts/              # Rotinas de manutenção (backup do banco)
├── tests/                # Testes automáticos (pytest)
├── spec.md               # Especificação das features implementadas
├── .env.example          # Template de configuração
├── init_db.py            # Setup do banco
├── requirements.txt      # Dependências Python
└── start_erp.bat         # Script de inicialização
```

---

## Licença

MIT - Veja [LICENSE](LICENSE) para detalhes.
