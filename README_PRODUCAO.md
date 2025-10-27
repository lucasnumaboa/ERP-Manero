# Guia de Deploy em Produção - ERP-MANEIRO

Este guia descreve como configurar o sistema ERP-MANEIRO para um ambiente de produção, permitindo o acesso à API através de uma rede externa.

## Índice

1. [Requisitos](#requisitos)
2. [Configuração do Backend](#configuração-do-backend)
3. [Configuração do Frontend](#configuração-do-frontend)
4. [Instalação como Serviço do Windows](#instalação-como-serviço-do-windows)
5. [Configuração de Firewall e Rede](#configuração-de-firewall-e-rede)
6. [Verificação e Testes](#verificação-e-testes)

## Requisitos

- Python 3.8 ou superior
- MySQL 5.7 ou superior
- Servidor web para hospedar o frontend (opcional)
- Acesso de administrador ao servidor Windows

## Configuração do Backend

### 1. Configurar a URL da API no Banco de Dados

Execute o script SQL `configurar_api_producao.sql` para adicionar as configurações necessárias no banco de dados:

```bash
mysql -u root -p erp_maneiro < configurar_api_producao.sql
```

**Importante:** Edite o arquivo SQL antes de executá-lo para substituir `seu-dominio-ou-ip` pelo endereço IP ou domínio real do seu servidor.

### 2. Usar o Script de Configuração Python

Alternativamente, você pode usar o script Python para configurar a API:

```bash
cd backend
python configurar_api_producao.py --url http://seu-dominio-ou-ip:8000 --porta 8000 --ambiente production --origens "http://seu-dominio.com,https://seu-dominio.com"
```

Substitua os valores pelos apropriados para o seu ambiente.

### 3. Iniciar o Backend em Modo Produção

Para iniciar o backend manualmente:

```bash
cd backend
python start_production.py
```

## Configuração do Frontend

### 1. Acessar a Página de Configuração da API

Após implantar o frontend, acesse a página de configuração da API através do link "Configurar API" na tela de login ou diretamente pelo URL:

```
http://seu-dominio-frontend/config_api.html
```

### 2. Configurar a URL da API

Na página de configuração, insira a URL completa da API:

```
http://seu-dominio-ou-ip:8000
```

Clique em "Testar Conexão" para verificar se a API está acessível e depois em "Salvar Configuração".

## Instalação como Serviço do Windows

Para instalar o backend como um serviço do Windows (requer privilégios de administrador):

```bash
python instalar_servico.py
```

Opções disponíveis:

- `--nome`: Nome do serviço (padrão: ERP-Maneiro-API)
- `--python`: Caminho para o executável Python
- `--script`: Caminho para o script de inicialização

**Nota:** Este script requer o NSSM (Non-Sucking Service Manager) para funcionar. Se não estiver instalado, o script fornecerá instruções para instalá-lo.

## Configuração de Firewall e Rede

### 1. Abrir Porta no Firewall do Windows

```bash
netsh advfirewall firewall add rule name="ERP-Maneiro API" dir=in action=allow protocol=TCP localport=8000
```

### 2. Configurar Roteador/Firewall Externo

Se você deseja que a API seja acessível pela internet:

1. Configure o encaminhamento de porta no seu roteador para a porta 8000
2. Considere usar um certificado SSL para conexões seguras
3. Restrinja o acesso apenas aos IPs necessários

## Verificação e Testes

### 1. Verificar Status da API

```bash
curl http://seu-dominio-ou-ip:8000
```

Você deve receber uma resposta como:

```json
{"message": "Bem-vindo à API do ERP Maneiro"}
```

### 2. Verificar Configurações no Banco de Dados

```sql
SELECT chave, valor FROM configuracoes WHERE chave IN ('link_api', 'api_port', 'environment', 'allowed_origins');
```

### 3. Testar Autenticação

Tente fazer login no sistema usando a nova URL da API para verificar se a autenticação está funcionando corretamente.

## Solução de Problemas

### API não está acessível externamente

1. Verifique se o servidor está escutando em todas as interfaces de rede (`0.0.0.0`)
2. Verifique as regras de firewall
3. Verifique se a porta está aberta no roteador/firewall

### Erro de CORS

1. Verifique se o domínio do frontend está incluído na lista de origens permitidas
2. Reinicie o backend após alterar as configurações

### Serviço não inicia automaticamente

1. Verifique os logs do serviço no Visualizador de Eventos do Windows
2. Verifique se o caminho para o Python e o script estão corretos

---

Para mais informações ou suporte, consulte a documentação completa ou entre em contato com a equipe de suporte.
