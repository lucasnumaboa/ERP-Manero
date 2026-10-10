# Instala (ou atualiza so o banco de) uma copia do ERP Maneiro no Docker deste PC.
# Uso: dois cliques em INSTALAR.bat  (ou ATUALIZAR_BANCO.bat para trocar so o banco pelo .sql mais novo)
# Mensagens sem acento de proposito: o script funciona mesmo se a copia do arquivo mudar a codificacao.
param([switch]$SoBanco)

$raiz = $PSScriptRoot
$banco = 'erp-maneiro-db'
$backend = 'erp-maneiro-backend'

function Passo($texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "    $texto" -ForegroundColor Green }
function Falhar($texto) {
    Write-Host ''
    Write-Host "ERRO: $texto" -ForegroundColor Red
    exit 1
}
function ContainerExiste($nome) {
    return [bool](docker ps -a --filter "name=^$nome$" --format '{{.Names}}')
}

# Acha a pasta do codigo (a que tem docker-compose.yml + docker-entrypoint.sh) ao lado deste script ou
# ate 3 niveis abaixo: copias por zip/Google Drive as vezes criam uma pasta a mais (deploy\deploy\erp).
function EncontrarErp {
    $direto = Join-Path $raiz 'erp'
    if (Test-Path (Join-Path $direto 'docker-compose.yml')) { return $direto }
    $achado = Get-ChildItem $raiz -Recurse -Depth 3 -Filter 'docker-compose.yml' -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.DirectoryName 'docker-entrypoint.sh') } | Select-Object -First 1
    if ($achado) { return $achado.DirectoryName }
    return $null
}

function MostrarConteudoEFalhar($faltando) {
    Write-Host ''
    Write-Host "ERRO: nao achei $faltando dentro de $raiz" -ForegroundColor Red
    Write-Host ''
    Write-Host 'O que tem nesta pasta:' -ForegroundColor Yellow
    Get-ChildItem $raiz -ErrorAction SilentlyContinue | ForEach-Object {
        $tipo = if ($_.PSIsContainer) { '[pasta]  ' } else { '         ' }
        Write-Host "    $tipo$($_.Name)"
    }
    Write-Host ''
    Write-Host 'A pasta deploy precisa ter: erp\  banco\  uploads\  INSTALAR.bat  instalar.ps1' -ForegroundColor Yellow
    Write-Host 'A copia parece incompleta. Confira:' -ForegroundColor Yellow
    Write-Host '  - se a copia/extracao terminou (a pasta toda tem cerca de 1,2 GB);'
    Write-Host '  - se baixou pelo Google Drive: ele divide em varios .zip (...-001.zip, -002.zip...).'
    Write-Host '    Extraia TODOS na mesma pasta;'
    Write-Host '  - se usou zip: extraia o zip inteiro antes de rodar (nao rode de dentro do zip).'
    exit 1
}

Write-Host '=============================================' -ForegroundColor Cyan
if ($SoBanco) { Write-Host ' ERP Maneiro - atualizar o banco da copia' -ForegroundColor Cyan }
else { Write-Host ' ERP Maneiro - instalar copia no Docker' -ForegroundColor Cyan }
Write-Host '=============================================' -ForegroundColor Cyan

# ---------- conferencias ----------
$erp = EncontrarErp
if (-not $erp) { MostrarConteudoEFalhar 'a pasta erp\ (com o docker-compose.yml)' }
if ($erp -ne (Join-Path $raiz 'erp')) { Write-Host "Usando o codigo em: $erp" -ForegroundColor Yellow }
if (-not (Test-Path (Join-Path $erp '.env'))) {
    MostrarConteudoEFalhar 'o arquivo erp\.env (arquivos que comecam com ponto as vezes ficam para tras na copia)'
}

$sql = Get-ChildItem $raiz -Recurse -Depth 3 -Filter 'erp_maneiro_*.sql' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $sql) { MostrarConteudoEFalhar 'o banco exportado (banco\erp_maneiro_....sql)' }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Falhar 'O Docker nao esta rodando. Abra o Docker Desktop, espere ele ficar pronto e rode de novo.' }

# Imagens prontas (pasta imagens\ do pacote): carrega sem internet e sobe sem montar nada
$imagensNecessarias = @('mysql:8.0', 'erp-maneiro-backend:latest', 'erp-maneiro-frontend:latest', 'erp-maneiro-atualizador:latest')
$pacoteImagens = Get-ChildItem $raiz -Recurse -Depth 2 -Filter 'erp-imagens*.tar*' -ErrorAction SilentlyContinue | Select-Object -First 1
$usarImagensProntas = $false
if ($pacoteImagens) {
    $faltando = $imagensNecessarias | Where-Object { docker image inspect $_ *> $null; $LASTEXITCODE -ne 0 }
    if ($faltando) {
        Passo "Carregando as imagens do pacote, sem internet ($([math]::Round($pacoteImagens.Length / 1MB)) MB, 1 a 3 minutos)..."
        docker load -i $pacoteImagens.FullName
        if ($LASTEXITCODE -ne 0) { Falhar 'Nao consegui carregar as imagens (o arquivo pode ter vindo incompleto na copia).' }
        Ok 'Imagens carregadas.'
    }
    $usarImagensProntas = $true
}

$jaInstalado = ContainerExiste $banco
if (-not $SoBanco -and -not (ContainerExiste 'erp-maneiro-frontend')) {
    foreach ($porta in 3000, 8000) {
        if (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue) {
            Falhar "A porta $porta ja esta em uso neste PC (outro programa). Feche esse programa e rode de novo."
        }
    }
}

Write-Host ''
Write-Host "Banco que sera importado: $($sql.Name)  ($([math]::Round($sql.Length / 1MB, 1)) MB)"
if ($jaInstalado) {
    Write-Host 'ATENCAO: ja existe uma copia instalada. O banco dela sera SUBSTITUIDO por este arquivo' -ForegroundColor Yellow
    Write-Host '(o que foi feito na copia ate agora sera perdido).' -ForegroundColor Yellow
    $resposta = Read-Host 'Digite S para continuar'
    if ($resposta -notmatch '^[sS]') { Write-Host 'Cancelado.'; exit 0 }
}

Push-Location $erp
try {
    # ---------- 1. banco ----------
    Passo 'Subindo o banco (MySQL)...'
    docker compose up -d db
    if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel subir o banco (veja a mensagem acima).' }

    Passo 'Esperando o banco ficar pronto (na primeira vez leva 1 ou 2 minutos)...'
    $pronto = $false
    for ($i = 0; $i -lt 120; $i++) {
        # via 127.0.0.1 (TCP): so responde quando o MySQL terminou de inicializar de verdade
        docker exec $banco sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysqladmin ping -h 127.0.0.1 -uroot --silent' *> $null
        if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $pronto) { Falhar 'O banco nao ficou pronto. Veja o log com:  docker compose logs db' }
    Ok 'Banco pronto.'

    # ---------- 2. importacao ----------
    Passo "Importando $($sql.Name)..."
    docker cp $sql.FullName "${banco}:/tmp/erp_maneiro.sql"
    docker exec $banco sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro < /tmp/erp_maneiro.sql'
    if ($LASTEXITCODE -ne 0) { Falhar 'A importacao falhou (veja a mensagem acima).' }
    docker exec $banco rm -f /tmp/erp_maneiro.sql
    Ok 'Banco importado.'

    Passo 'Ajustando o banco para ser uma copia (API local, WhatsApp desligado)...'
    docker cp (Join-Path $erp 'scripts\apos_importar_no_docker.sql') "${banco}:/tmp/apos.sql"
    docker exec $banco sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro < /tmp/apos.sql'
    if ($LASTEXITCODE -ne 0) { Falhar 'Os ajustes falharam (veja a mensagem acima).' }

    if ($SoBanco) {
        if (ContainerExiste $backend) {
            Passo 'Reiniciando o backend...'
            docker compose restart backend
        }
    } else {
        # ---------- 3. ERP ----------
        if ($usarImagensProntas) {
            Passo 'Subindo o ERP (imagens prontas do pacote)...'
            docker image inspect 'erp-maneiro-atualizador:latest' *> $null
            if ($LASTEXITCODE -eq 0) {
                docker compose up -d --no-build
            } else {
                # pacote antigo, sem a imagem do atualizador: sobe o ERP e monta o atualizador (precisa de internet)
                docker compose up -d --no-build db backend frontend
                docker compose up -d --build atualizador
                if ($LASTEXITCODE -ne 0) { Write-Host 'Aviso: o atualizador (botao Atualizar em Configuracoes) nao subiu; sem internet ele fica para depois.' -ForegroundColor Yellow; $global:LASTEXITCODE = 0 }
            }
        } else {
            Passo 'Montando e subindo o ERP (sem a pasta imagens\ baixa tudo da internet: pode levar alguns minutos)...'
            docker compose up -d --build
        }
        if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel subir o ERP (veja a mensagem acima).' }

        Passo 'Esperando a API responder...'
        $apiOk = $false
        for ($i = 0; $i -lt 90; $i++) {
            try {
                Invoke-WebRequest 'http://localhost:8000/docs' -UseBasicParsing -TimeoutSec 3 | Out-Null
                $apiOk = $true; break
            } catch { Start-Sleep -Seconds 2 }
        }
        if (-not $apiOk) { Falhar 'A API nao respondeu. Veja o log com:  docker compose logs backend' }
        Ok 'API no ar.'

        # ---------- 4. fotos ----------
        $uploads = Join-Path $raiz 'uploads'
        if (-not (Test-Path $uploads)) {
            $achado = Get-ChildItem $raiz -Recurse -Depth 2 -Directory -Filter 'uploads' -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notlike "$erp*" } | Select-Object -First 1
            if ($achado) { $uploads = $achado.FullName }
        }
        if (Test-Path $uploads) {
            Passo 'Copiando fotos e videos dos produtos (pode levar alguns minutos)...'
            docker cp "$uploads\." "${backend}:/app/frontend/uploads/"
            if ($LASTEXITCODE -eq 0) { Ok 'Fotos copiadas.' } else { Write-Host '    Nao consegui copiar as fotos; o ERP funciona sem elas.' -ForegroundColor Yellow }
        } else {
            Write-Host ''
            Write-Host '    Pasta uploads\ nao encontrada: o ERP funciona, so sem as fotos dos produtos.' -ForegroundColor Yellow
        }
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host ' Pronto! Abra http://localhost:3000' -ForegroundColor Green
Write-Host ' Entre com os mesmos e-mails e senhas da producao.' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green
if (-not $SoBanco) { Start-Process 'http://localhost:3000' }
