# ERP AutoPost

Um app só para anunciar os produtos do ERP no **Facebook Marketplace** e na **OLX**. Ele substitui os
dois programas antigos ("ERP AutoPost Facebook" e "ERP AutoPost OLX").

## Como usar

1. Abra o `ERP AutoPost.exe` e entre com o seu usuário do ERP.
2. **Contas**: na primeira vez, clique em "Abrir o Facebook para entrar" e faça login. Faça o mesmo na
   OLX. Depois clique em "Conferir login".
   - O app usa um Chrome próprio, e o login fica guardado nele.
   - Cada conta mostra se está logada e quando foi conferida. A conferência roda sozinha ao abrir a tela, se a última
     tiver mais de 2 horas, e também a cada postagem.
3. **Produtos**: aparecem os produtos com estoque. Cada um tem dois botões, Facebook e OLX.
   - Ligue em cada produto o site onde ele deve ser anunciado. A escolha é gravada no ERP, nos campos
     "postar no Facebook/OLX" do produto.
   - Clique no preço para usar outro valor só nos anúncios.
4. **Postar**: mostra a fila, que são os produtos ligados que ainda não estão no ar.
   - "Começar a postar" abre o Chrome e publica um anúncio por vez, com uma espera sorteada entre eles.
   - O andamento aparece ao vivo e o botão Parar interrompe a qualquer momento.
   - Se algum site pedir login, o app avisa e espera você entrar e clicar em Continuar.
5. **Anúncios**: lista tudo o que o app publicou, registrado no ERP em `/api/anuncios`.
   - Quando um produto vende (estoque zerado) ou é desativado, o anúncio dele vai para "Para tirar do ar".
   - "Tirar do ar os vendidos" exclui esses anúncios nos sites. O app acha cada um pelo título.
   - As abas **No Facebook** e **Na OLX** leem o que está de fato em cada site, incluindo anúncios que não foram
     feitos pelo app (aparecem como "não registrado no ERP").
   - Marque os anúncios e clique em "Excluir selecionados" para tirar do ar sem entrar no site; o registro no ERP
     é atualizado junto.
6. **Configurações**:
   - **Chrome escondido** (vem ligado): o Chrome trabalha fora da tela e aparece só quando precisa de login.
     Para ver o que ele está fazendo, use "Mostrar o Chrome" na tela Postar.
   - Espera entre anúncios.
   - Opção de anunciar também nos grupos do Facebook.
   - Contato no começo da descrição.
   - Categoria do Facebook para cada categoria do ERP.

## O que mudou em relação aos apps antigos

- Um app só, com tela nova. Para cada produto você escolhe em qual site ele vai.
- O ERP passa a saber o que está anunciado e onde (tabela `anuncios`). Isso evita anunciar duas vezes e
  permite tirar do ar só o que vendeu. Os apps antigos excluíam tudo.
- Chrome com perfil próprio e permanente: não precisa mais de arquivo de cookies nem de logar toda vez.
- Esperas por elemento em vez de pausas fixas, e o botão Parar funciona até no meio de uma espera.
- A senha do ERP só fica salva se você marcar "Lembrar", e mesmo assim criptografada pelo Windows (DPAPI).
- O passo a passo de cada publicação fica gravado em `%APPDATA%\ERP AutoPost\logs\`.

## Quando o robô trava

Os sites mudam as telas. Quando o mesmo passo com cara de problema ("ainda aguardando", "erro", "tentando de
novo"...) se repete **mais de 5 vezes**, quando a mesma linha se repete 6 vezes seguidas, ou quando um anúncio
passa de 10 minutos, o app:
1. para esse anúncio e segue para o próximo;
2. manda ao ERP o que estava tentando fazer, o passo a passo, a imagem da tela, a página em JSON (botões, campos
   e textos visíveis, com senhas mascaradas) e o HTML.

Falhas no site também vão. O admin vê tudo em **Configurações › AutoPost: travamentos para ajustar** (fila
pendente, com "Marcar como resolvido"). Se o ERP não receber, fica uma cópia em
`%APPDATA%\ERP AutoPost\diagnosticos\`.

## Onde ficam as coisas

| O quê | Onde |
|---|---|
| Configurações (endereço do ERP, espera, Facebook) | `%APPDATA%\ERP AutoPost\config.json` |
| Registro do dia | `%APPDATA%\ERP AutoPost\logs\AAAA-MM-DD.txt` |
| Perfil do Chrome (logins do Facebook e OLX) | `%LOCALAPPDATA%\ERP AutoPost\chrome-perfil` |
| Fotos baixadas para publicar | `%TEMP%\ERP AutoPost\imagens`, apagadas ao terminar |

## Para desenvolver

O app usa Python, [pywebview](https://pywebview.flowrl.com/) (janela com HTML/CSS/JS, WebView2 do Windows) e
Selenium com undetected-chromedriver.

```bat
cd autopost
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

`set AUTOPOST_DEBUG=1` antes de rodar abre as ferramentas de desenvolvedor da janela.

Para gerar o `.exe`, rode `build.bat`, que cria `dist\ERP AutoPost.exe`. Ele usa o `.venv` próprio, separado
do Python do ERP. Depois suba o `.exe` na página **Softwares** do ERP.

Atualização: ao abrir (e de 2 em 2 horas) o app consulta `/api/softwares/atualizacao/ERP%20AutoPost.exe`, sem
login. Se o exe publicado for outro e não for de versão anterior, ele avisa e, com "Atualizar agora", baixa,
confere o hash, troca o próprio arquivo e abre a versão nova (`atualizador.py`). A versão do programa
(`softwares.versao_app`) vem do construtor do servidor (`scripts/construtor_autopost.py`); um exe enviado à mão
pela página fica sem versão e o app só compara o arquivo.

Testes (com sites de mentira, sem abrir o Chrome): `python -m pytest tests/test_autopost.py` na raiz do repositório.

### Estrutura

| Arquivo | Papel |
|---|---|
| `app.py` | abre a janela |
| `api.py` | métodos que a tela chama (`window.pywebview.api.*`) |
| `tarefas.py` | postar e tirar do ar numa thread, com eventos para a tela (log, andamento, pedido de login) |
| `erp.py` | cliente da API do ERP (login, renovação do token, produtos, anúncios) |
| `navegador.py` | Chrome controlado (perfil próprio, undetected-chromedriver) |
| `plataformas/facebook.py`, `plataformas/olx.py` | publicar, ver se está logado e excluir pelo título |
| `config.py` | configuração local e senha protegida |
| `atualizador.py` | confere a versão publicada no ERP, baixa e troca o próprio exe |
| `ui/` | a tela (HTML, CSS e JS) |
| `legado/` | fontes dos apps antigos, só para consulta |

Quando o Facebook ou a OLX mudarem a página e a publicação parar de funcionar, o ajuste fica em
`plataformas/`. O registro em `logs\` mostra em que passo parou.
