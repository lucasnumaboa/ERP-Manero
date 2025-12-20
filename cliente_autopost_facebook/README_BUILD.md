# Como criar o executável (.exe)

## Pré-requisitos

1. Python 3.x instalado
2. Todas as dependências instaladas (`pip install -r requirements.txt`)

## Passos para criar o .exe

### 1. Execute o script de build

```bash
build.bat
```

Ou manualmente:

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --icon=icon.png --name="ERP AutoPost Facebook" --add-data "icon.png;." gui.py
```

### 2. Baixe o ChromeDriver

1. Verifique sua versão do Chrome: `chrome://version/`
2. Baixe o ChromeDriver compatível em: https://googlechromelabs.github.io/chrome-for-testing/
3. Extraia o `chromedriver.exe`

### 3. Monte a pasta de distribuição

Copie os seguintes arquivos para a pasta de distribuição:

```
dist/
├── ERP AutoPost Facebook.exe
├── chromedriver.exe          <- OBRIGATÓRIO
├── icon.png                   <- Opcional (para o ícone)
└── cookies/                   <- Será criada automaticamente
```

## Notas importantes

- O `chromedriver.exe` DEVE estar na mesma pasta do executável
- A versão do ChromeDriver deve ser compatível com a versão do Chrome instalada na máquina
- O programa criará uma pasta `cookies/` automaticamente para salvar os cookies de login

## Distribuição

Para distribuir o programa, basta copiar a pasta `dist/` completa para outras máquinas.
As máquinas de destino precisam ter:
- Google Chrome instalado (mesma versão do ChromeDriver)
