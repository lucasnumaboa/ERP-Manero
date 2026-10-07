# Instala (ou atualiza só o banco de) uma cópia do ERP Maneiro no Docker deste PC.
# Uso: dois cliques em INSTALAR.bat  (ou ATUALIZAR_BANCO.bat para trocar só o banco pelo .sql mais novo da pasta banco\)
param([switch]$SoBanco)

$raiz = $PSScriptRoot
$erp = Join-Path $raiz 'erp'
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

Write-Host '=============================================' -ForegroundColor Cyan
if ($SoBanco) { Write-Host ' ERP Maneiro - atualizar o banco da cópia' -ForegroundColor Cyan }
else { Write-Host ' ERP Maneiro - instalar cópia no Docker' -ForegroundColor Cyan }
Write-Host '=============================================' -ForegroundColor Cyan

# ---------- conferências ----------
docker info *> $null
if ($LASTEXITCODE -ne 0) { Falhar 'O Docker não está rodando. Abra o Docker Desktop, espere ele ficar pronto e rode de novo.' }
if (-not (Test-Path (Join-Path $erp 'docker-compose.yml'))) { Falhar "Não achei a pasta erp\ ao lado deste script ($erp)." }
if (-not (Test-Path (Join-Path $erp '.env'))) { Falhar 'Falta o arquivo erp\.env (o gerador do pacote cria ele).' }

$sql = Get-ChildItem (Join-Path $raiz 'banco') -Filter '*.sql' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $sql) { Falhar 'Não achei nenhum .sql na pasta banco\.' }

$jaInstalado = ContainerExiste $banco
if (-not $SoBanco -and -not (ContainerExiste 'erp-maneiro-frontend')) {
    foreach ($porta in 3000, 8000) {
        if (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue) {
            Falhar "A porta $porta já está em uso neste PC (outro programa). Feche esse programa e rode de novo."
        }
    }
}

Write-Host ''
Write-Host "Banco que será importado: $($sql.Name)  ($([math]::Round($sql.Length / 1MB, 1)) MB)"
if ($jaInstalado) {
    Write-Host 'ATENÇÃO: já existe uma cópia instalada. O banco dela será SUBSTITUÍDO por este arquivo' -ForegroundColor Yellow
    Write-Host '(o que foi feito na cópia até agora será perdido).' -ForegroundColor Yellow
    $resposta = Read-Host 'Digite S para continuar'
    if ($resposta -notmatch '^[sS]') { Write-Host 'Cancelado.'; exit 0 }
}

Push-Location $erp
try {
    # ---------- 1. banco ----------
    Passo 'Subindo o banco (MySQL)...'
    docker compose up -d db
    if ($LASTEXITCODE -ne 0) { Falhar 'Não foi possível subir o banco (veja a mensagem acima).' }

    Passo 'Esperando o banco ficar pronto (na primeira vez leva 1 ou 2 minutos)...'
    $pronto = $false
    for ($i = 0; $i -lt 120; $i++) {
        # via 127.0.0.1 (TCP): só responde quando o MySQL terminou de inicializar de verdade
        docker exec $banco sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysqladmin ping -h 127.0.0.1 -uroot --silent' *> $null
        if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $pronto) { Falhar 'O banco não ficou pronto. Veja o log com:  docker compose logs db' }
    Ok 'Banco pronto.'

    # ---------- 2. importação ----------
    Passo "Importando $($sql.Name)..."
    docker cp $sql.FullName "${banco}:/tmp/erp_maneiro.sql"
    docker exec $banco sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot erp_maneiro < /tmp/erp_maneiro.sql'
    if ($LASTEXITCODE -ne 0) { Falhar 'A importação falhou (veja a mensagem acima).' }
    docker exec $banco rm -f /tmp/erp_maneiro.sql
    Ok 'Banco importado.'

    Passo 'Ajustando o banco para ser uma cópia (API local, WhatsApp desligado)...'
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
        Passo 'Montando e subindo o ERP (na primeira vez baixa as imagens: pode levar alguns minutos)...'
        docker compose up -d --build
        if ($LASTEXITCODE -ne 0) { Falhar 'Não foi possível subir o ERP (veja a mensagem acima).' }

        Passo 'Esperando a API responder...'
        $apiOk = $false
        for ($i = 0; $i -lt 90; $i++) {
            try {
                Invoke-WebRequest 'http://localhost:8000/docs' -UseBasicParsing -TimeoutSec 3 | Out-Null
                $apiOk = $true; break
            } catch { Start-Sleep -Seconds 2 }
        }
        if (-not $apiOk) { Falhar 'A API não respondeu. Veja o log com:  docker compose logs backend' }
        Ok 'API no ar.'

        # ---------- 4. fotos ----------
        $uploads = Join-Path $raiz 'uploads'
        if (Test-Path $uploads) {
            Passo 'Copiando fotos e vídeos dos produtos (pode levar alguns minutos)...'
            docker cp "$uploads\." "${backend}:/app/frontend/uploads/"
            if ($LASTEXITCODE -eq 0) { Ok 'Fotos copiadas.' } else { Write-Host '    Não consegui copiar as fotos; o ERP funciona sem elas.' -ForegroundColor Yellow }
        }
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host ' Pronto! Abra http://localhost:3000' -ForegroundColor Green
Write-Host ' Entre com os mesmos e-mails e senhas da produção.' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green
if (-not $SoBanco) { Start-Process 'http://localhost:3000' }
