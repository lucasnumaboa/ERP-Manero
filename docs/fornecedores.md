# Documentação - Gerenciamento de Fornecedores no ERP-MANEIRO

## Visão Geral

O módulo de Fornecedores no ERP-MANEIRO permite o cadastro, edição, visualização e exclusão de fornecedores. Este módulo é integrado com o sistema de compras e utiliza a mesma estrutura de banco de dados dos parceiros (clientes e fornecedores).

## Estrutura do Sistema

### Backend

No backend, os fornecedores são gerenciados através da API de Parceiros (`/api/parceiros`). Não existe uma API separada para fornecedores, pois tanto clientes quanto fornecedores são armazenados na mesma tabela `parceiros` no banco de dados, diferenciados pelo campo `tipo`:

- `tipo = 'cliente'`: Apenas cliente
- `tipo = 'fornecedor'`: Apenas fornecedor
- `tipo = 'ambos'`: Atua como cliente e fornecedor

Ao buscar fornecedores, a API é chamada com o filtro `tipo=fornecedor,ambos` para retornar apenas registros que sejam fornecedores ou ambos.

### Frontend

O frontend possui uma página dedicada para gerenciamento de fornecedores (`fornecedores.html`) com as seguintes funcionalidades:

- Listagem de fornecedores com filtro por status (ativo/inativo)
- Cadastro de novos fornecedores
- Edição de fornecedores existentes
- Visualização detalhada de fornecedores
- Exclusão de fornecedores

## Endpoints da API

### Listar Fornecedores
```
GET /api/parceiros?tipo=fornecedor,ambos
```

Parâmetros opcionais:
- `ativo`: Filtrar por status (true/false)

### Obter Fornecedor Específico
```
GET /api/parceiros/{id}
```

### Criar Fornecedor
```
POST /api/parceiros
```

Corpo da requisição:
```json
{
  "tipo": "fornecedor",
  "nome": "Nome do Fornecedor",
  "documento": "CNPJ/CPF",
  "email": "email@fornecedor.com",
  "telefone": "(00) 0000-0000",
  "endereco": "Endereço do Fornecedor",
  "cidade": "Cidade",
  "estado": "UF",
  "cep": "00000-000",
  "ativo": true
}
```

### Atualizar Fornecedor
```
PUT /api/parceiros/{id}
```

Corpo da requisição: mesmo formato do endpoint de criação.

### Excluir Fornecedor
```
DELETE /api/parceiros/{id}
```

## Integração com o Módulo de Compras

O módulo de fornecedores está integrado com o módulo de compras, permitindo:

1. Selecionar fornecedores existentes ao criar uma nova compra
2. Cadastrar um novo fornecedor diretamente da tela de compras, através do botão "Novo" ao lado do seletor de fornecedores
3. Após cadastrar um fornecedor a partir da tela de compras, o sistema retorna automaticamente para o formulário de compra com o novo fornecedor já selecionado

## Modelo de Dados

Os fornecedores são armazenados na tabela `parceiros` com os seguintes campos:

- `id`: Identificador único
- `tipo`: Tipo do parceiro ('cliente', 'fornecedor' ou 'ambos')
- `nome`: Nome ou razão social
- `documento`: CPF ou CNPJ
- `email`: Email de contato
- `telefone`: Telefone de contato
- `endereco`: Endereço
- `cidade`: Cidade
- `estado`: UF
- `cep`: CEP
- `ativo`: Status (ativo/inativo)
- `data_cadastro`: Data de cadastro
- `data_atualizacao`: Data da última atualização

## Autenticação

Todas as operações no módulo de fornecedores requerem autenticação via token JWT. O token é obtido ao fazer login no sistema e deve ser enviado no cabeçalho de todas as requisições:

```
Authorization: Bearer {token}
```

## Tratamento de Erros

O sistema inclui tratamento de erros para lidar com situações como:
- Falha na autenticação
- Erros de validação
- Fornecedor não encontrado
- Erro ao salvar/atualizar/excluir fornecedor

## Considerações de Segurança

- Apenas usuários autenticados podem acessar o módulo de fornecedores
- As permissões de acesso são verificadas para cada operação
- Os dados são validados tanto no frontend quanto no backend antes de serem processados
