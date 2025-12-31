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
| **Produtos** | Cadastro, categorias, controle de estoque |
| **Vendas** | Pedidos, múltiplos itens, formas de pagamento, comissões |
| **Compras** | Pedidos para fornecedores, aprovação, recebimento |
| **Estoque** | Movimentações, alertas de estoque mínimo |
| **Financeiro** | Contas a pagar/receber, caixa, fluxo financeiro |
| **Propostas** | Orçamentos com validade e conversão em pedidos |
| **Postagens** | Rastreio de entregas por transportadora |
| **Relatórios** | Vendas, estoque, financeiro (Excel/PDF) |
| **Metas** | Definição e acompanhamento de metas de vendedores |
| **Vendedores** | Cadastro, comissões, performance |
| **Parceiros** | Gestão de fornecedores e parceiros |

### Autenticação

- JWT Tokens com expiração configurável
- Senhas criptografadas com Bcrypt
- Níveis: Admin, Vendedor, Comprador, Financeiro

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
cp .env.example .env
# Edite o .env com suas credenciais do MySQL
```

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

---

## Estrutura do Projeto

```
ERP-Maneiro/
├── backend/
│   ├── routers/          # Endpoints da API
│   ├── main.py           # App FastAPI
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
├── database/             # Scripts SQL
├── .env.example          # Template de configuração
├── init_db.py            # Setup do banco
├── requirements.txt      # Dependências Python
└── start_erp.bat         # Script de inicialização
```

---

## Licença

MIT - Veja [LICENSE](LICENSE) para detalhes.
