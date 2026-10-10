# QR Code PIX (estático), como o ERP Maneiro gera

Como gerar um QR Code PIX e o "PIX copia e cola" **sem banco, sem API e sem servidor**: é só montar um texto num formato padrão (BR Code, que segue o EMV QRCPS-MPM do Banco Central) e desenhar esse texto como QR Code. Qualquer app de banco lê.

No ERP isso fica na tela de Vendas, no botão **Comis** (PIX da comissão do vendedor): `frontend/js/vendas.js`, funções `gerarPixQRCode` e `gerarPayloadPix`.

---

## 1. A ideia em 3 passos

1. **Montar o texto (payload)** com a chave PIX, nome, cidade, valor e um identificador.
2. **Calcular o CRC16** do texto e colocar no fim (são os 4 últimos caracteres).
3. **Desenhar o texto como QR Code** com qualquer biblioteca. O mesmo texto é o "PIX copia e cola".

Exemplo de payload pronto (chave CPF, R$ 150,00):

```
00020126330014BR.GOV.BCB.PIX0111123456789095204000053039865406150.005802BR5918JOAO DA SILVA LTDA6005SALTO62130509PEDIDO12363043FFD
```

---

## 2. O formato: campos "ID + tamanho + valor"

Cada campo é escrito como **ID (2 dígitos) + tamanho do valor (2 dígitos) + valor**. Ex.: `5802BR` = campo `58`, tamanho `02`, valor `BR`.

| ID | O que é | Valor | Observação |
|----|---------|-------|------------|
| `00` | Versão do formato | `01` | sempre `000201` |
| `26` | Conta de quem recebe | campos internos abaixo | |
| `26.00` | Identificador do PIX | `BR.GOV.BCB.PIX` | fixo |
| `26.01` | **Chave PIX** | a chave, já normalizada (ver item 4) | até 77 caracteres |
| `26.02` | Descrição (opcional) | texto curto | aparece para quem paga em alguns bancos |
| `52` | Categoria do comerciante | `0000` | "não informado" |
| `53` | Moeda | `986` | real |
| `54` | **Valor** (opcional) | `150.00` | ponto como decimal; **sem esse campo, quem paga digita o valor** |
| `58` | País | `BR` | |
| `59` | **Nome de quem recebe** | até 25 caracteres | sem acento, maiúsculo |
| `60` | **Cidade** | até 15 caracteres | sem acento, maiúsculo |
| `62` | Dados adicionais | campo interno abaixo | |
| `62.05` | Identificador (txid) | `***` ou até 25 letras/números | `***` = sem identificador |
| `63` | **CRC16** | 4 caracteres hexadecimais | calculado sobre tudo antes dele, **incluindo o `6304`** |

Os campos `26` e `62` têm campos dentro, no mesmo formato: o tamanho do `26` é o tamanho de tudo o que vai dentro dele.

---

## 3. O CRC16

É o **CRC16-CCITT-FALSE**: polinômio `0x1021`, valor inicial `0xFFFF`, sem inversões. É calculado sobre o payload inteiro **terminando em `6304`**, e o resultado (4 dígitos hexadecimais, maiúsculos) é colocado no final.

Para conferir sua implementação: o CRC de `"123456789"` tem que dar **`29B1`**. Em Python, `binascii.crc_hqx(texto.encode(), 0xFFFF)` calcula o mesmo valor (bom para testes).

---

## 4. Cuidados que fazem o banco recusar o QR

- **Chave de telefone** vai como **`+55` + DDD + número**, só dígitos: `+5511987654321`. Sem o `+55` o banco não acha a chave.
- **CPF e CNPJ** vão **só com números**: `12345678909`, não `123.456.789-09`.
- **E-mail** em minúsculas; **chave aleatória** do jeito que o banco gerou (com os hífens).
- **CPF × celular**: os dois podem ter 11 dígitos. O código abaixo valida os dígitos do CPF; se não for CPF válido, trata como celular. Melhor ainda: guarde o telefone já com `+55`.
- **Nome e cidade** sem acento e sem símbolos, cortados em 25 e 15 caracteres.
- **Tamanhos contam caracteres**: se sobrar acento ou emoji, o tamanho e o CRC saem errados. Por isso o texto é limpo antes (função `textoPix`).
- **Valor** com 2 casas e ponto: `150.00`. Para "quem paga digita o valor", não mande o campo `54`.

---

## 5. Código pronto: JavaScript (navegador ou Node)

```js
function campoPix(id, valor) {
    return id + String(valor.length).padStart(2, '0') + valor;
}

// Só A-Z, 0-9 e espaço, sem acento e cortado no tamanho máximo do campo
function textoPix(texto, maximo) {
    return String(texto || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
        .slice(0, maximo);
}

function cpfValido(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    const dv = (base) => {
        let soma = 0;
        for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
        return (soma * 10) % 11 % 10;
    };
    return dv(cpf.slice(0, 9)) === Number(cpf[9]) && dv(cpf.slice(0, 10)) === Number(cpf[10]);
}

// A chave vai no código exatamente como o banco a registrou
function normalizarChavePix(chave) {
    const c = String(chave || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase(); // aleatória
    if (c.includes('@')) return c.toLowerCase();                                                          // e-mail
    const digitos = c.replace(/\D/g, '');
    if (c.startsWith('+')) return '+' + digitos;                        // telefone já com DDI
    if (digitos.length === 14) return digitos;                          // CNPJ
    if (digitos.length === 11 && cpfValido(digitos)) return digitos;    // CPF
    if (digitos.length === 10 || digitos.length === 11) return '+55' + digitos; // telefone sem DDI
    throw new Error('Chave PIX não reconhecida: ' + chave);
}

// CRC16-CCITT-FALSE (polinômio 0x1021, início 0xFFFF), sobre os bytes UTF-8
function crc16Pix(texto) {
    let crc = 0xFFFF;
    for (const byte of new TextEncoder().encode(texto)) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPayloadPix({ chave, nome, cidade = 'SAO PAULO', valor = null, txid = '***', descricao = '' }) {
    const contaRecebedor =
        campoPix('00', 'BR.GOV.BCB.PIX') +
        campoPix('01', normalizarChavePix(chave)) +
        (descricao ? campoPix('02', textoPix(descricao, 40)) : '');
    const txidLimpo = txid === '***' ? '***' : String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

    let payload =
        campoPix('00', '01') +                       // versão do formato
        campoPix('26', contaRecebedor) +             // quem recebe (identificador do PIX + chave)
        campoPix('52', '0000') +                     // categoria do comerciante (0000 = não informado)
        campoPix('53', '986');                       // moeda: real
    if (valor !== null && valor !== undefined && Number(valor) > 0) {
        payload += campoPix('54', Number(valor).toFixed(2)); // valor (sem ele, quem paga digita)
    }
    payload +=
        campoPix('58', 'BR') +
        campoPix('59', textoPix(nome, 25) || 'RECEBEDOR') +
        campoPix('60', textoPix(cidade, 15) || 'SAO PAULO') +
        campoPix('62', campoPix('05', txidLimpo)) +  // identificador da cobrança
        '6304';                                      // o CRC entra aqui, calculado sobre tudo até "6304"
    return payload + crc16Pix(payload);
}
```

### Desenhando o QR Code (navegador)

O ERP usa a biblioteca [qrcode-generator](https://www.npmjs.com/package/qrcode-generator):

```html
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<div id="pixQrcode"></div>
<script>
    const payload = gerarPayloadPix({ chave: '123.456.789-09', nome: 'João da Silva', cidade: 'Salto', valor: 150 });
    const qr = qrcode(0, 'M');   // 0 = tamanho automático; 'M' = correção de erro média
    qr.addData(payload);
    qr.make();
    document.getElementById('pixQrcode').innerHTML = qr.createImgTag(6, 2); // tamanho do quadradinho, margem
    // "PIX copia e cola": o próprio payload
    // navigator.clipboard.writeText(payload);
</script>
```

Qualquer outra biblioteca de QR serve (`qrcode` no npm, por exemplo): o que importa é o texto.

---

## 6. Código pronto: Python

```python
import re
import unicodedata


def campo_pix(id_: str, valor: str) -> str:
    return f"{id_}{len(valor):02d}{valor}"


def texto_pix(texto: str, maximo: int) -> str:
    """Só A-Z, 0-9 e espaço, sem acento e cortado no tamanho máximo do campo."""
    sem_acento = unicodedata.normalize("NFD", texto or "").encode("ascii", "ignore").decode()
    limpo = re.sub(r"[^A-Z0-9 ]", "", sem_acento.upper())
    return re.sub(r"\s+", " ", limpo).strip()[:maximo]


def cpf_valido(cpf: str) -> bool:
    if not re.fullmatch(r"\d{11}", cpf) or len(set(cpf)) == 1:
        return False
    def dv(base):
        soma = sum(int(d) * (len(base) + 1 - i) for i, d in enumerate(base))
        return soma * 10 % 11 % 10
    return dv(cpf[:9]) == int(cpf[9]) and dv(cpf[:10]) == int(cpf[10])


def normalizar_chave_pix(chave: str) -> str:
    """A chave vai no código exatamente como o banco a registrou."""
    c = (chave or "").strip()
    if re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", c):
        return c.lower()                       # aleatória
    if "@" in c:
        return c.lower()                       # e-mail
    digitos = re.sub(r"\D", "", c)
    if c.startswith("+"):
        return "+" + digitos                   # telefone já com DDI
    if len(digitos) == 14:
        return digitos                         # CNPJ
    if len(digitos) == 11 and cpf_valido(digitos):
        return digitos                         # CPF
    if len(digitos) in (10, 11):
        return "+55" + digitos                 # telefone sem DDI
    raise ValueError(f"Chave PIX não reconhecida: {chave}")


def crc16_pix(texto: str) -> str:
    """CRC16-CCITT-FALSE (polinômio 0x1021, início 0xFFFF), sobre os bytes UTF-8."""
    crc = 0xFFFF
    for byte in texto.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def gerar_payload_pix(chave, nome, cidade="SAO PAULO", valor=None, txid="***", descricao=""):
    conta = campo_pix("00", "BR.GOV.BCB.PIX") + campo_pix("01", normalizar_chave_pix(chave))
    if descricao:
        conta += campo_pix("02", texto_pix(descricao, 40))
    txid = "***" if txid == "***" else (re.sub(r"[^A-Za-z0-9]", "", str(txid))[:25] or "***")

    payload = campo_pix("00", "01") + campo_pix("26", conta) + campo_pix("52", "0000") + campo_pix("53", "986")
    if valor is not None and float(valor) > 0:
        payload += campo_pix("54", f"{float(valor):.2f}")
    payload += (campo_pix("58", "BR")
                + campo_pix("59", texto_pix(nome, 25) or "RECEBEDOR")
                + campo_pix("60", texto_pix(cidade, 15) or "SAO PAULO")
                + campo_pix("62", campo_pix("05", txid))
                + "6304")
    return payload + crc16_pix(payload)
```

Para virar imagem (`pip install qrcode[pil]`):

```python
import qrcode

payload = gerar_payload_pix("123.456.789-09", "João da Silva", "Salto", 150, "PEDIDO123")
qrcode.make(payload).save("pix.png")   # e o payload é o "copia e cola"
```

---

## 7. Como testar

- **CRC:** `crc16Pix('123456789')` / `crc16_pix("123456789")` tem que dar `29B1`.
- **Mesmo resultado nas duas linguagens:** com `chave='123.456.789-09'`, `nome='João da Silva Ltda'`, `cidade='Salto'`, `valor=150` e `txid='PEDIDO123'`, as duas versões geram exatamente o exemplo do item 1, terminando em `3FFD`.
- **De verdade:** gere um QR com a **sua** chave e valor de R$ 0,01 e leia no app do banco. O app tem que mostrar seu nome e o valor certos antes de confirmar.

---

## 8. O que muda em relação ao código do ERP

O código acima é a versão revisada. O que está hoje em `frontend/js/vendas.js` funciona para chave CPF/CNPJ só com números, e-mail e aleatória, mas:

- **Telefone sem `+55`** vai no código como foi digitado, e o banco recusa.
- **CPF/CNPJ com pontos e traços** também vão como foram digitados.
- A tabela `guiSizes` e a função `detectarTipoChave` não são usadas para nada (o tamanho é calculado na hora).
- O CRC usa `charCodeAt` (código do caractere) em vez dos bytes UTF-8. Só faz diferença se sobrar algum caractere fora do ASCII, o que a limpeza do nome já evita.
- A cidade é fixa em `SAO PAULO` e o txid é aleatório (10 caracteres); no código revisado os dois são parâmetros, e o padrão do txid é `***`.

Limitação dos dois: é **PIX estático**. Ele não avisa quando foi pago, e o mesmo QR pode ser pago mais de uma vez. Para cobrança com confirmação automática (QR dinâmico, webhook de pagamento) é preciso a API PIX de um banco ou de um intermediador (Mercado Pago, Asaas, Efí etc.).
