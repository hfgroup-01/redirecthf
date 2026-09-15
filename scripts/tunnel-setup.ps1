# ------------------------------------------------------------------
# HF — configura o Cloudflare Tunnel que expõe o servidor local.
#
#   npm run tunnel:setup                 (login -> cria túnel -> grava config)
#   npm run tunnel:setup -- -Service     (idem + instala como serviço do Windows; PowerShell como Admin)
#   npm run tunnel                       (roda o túnel no terminal)
#
# Depois, no HF: Configurações > alvo do DNS = CNAME <ID>.cfargotunnel.com
# ------------------------------------------------------------------
param(
  [string]$Nome = "hf",
  [int]$Porta = 3100,
  [switch]$Service
)

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cands = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
    "$env:ProgramFiles\Cloudflare\cloudflared.exe",
    "${env:ProgramFiles(x86)}\Cloudflare\cloudflared.exe"
  )
  foreach ($c in $cands) { if (Test-Path $c) { return $c } }
  Write-Host "cloudflared nao encontrado. Instale com:  winget install --id Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

$cf = Find-Cloudflared
$dir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force $dir | Out-Null
$cert = Join-Path $dir "cert.pem"

# ---- 1) login ------------------------------------------------------
if (-not (Test-Path $cert)) {
  Write-Host "1/4 Login na Cloudflare: vai abrir o navegador. Entre na conta e escolha QUALQUER domínio dela." -ForegroundColor Cyan
  & $cf tunnel login
  if (-not (Test-Path $cert)) {
    Write-Host "Login nao concluido (cert.pem nao apareceu). Rode de novo." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "1/4 Login ja feito (cert.pem existe)." -ForegroundColor Green
}

# ---- 2) tunel ------------------------------------------------------
function Get-Tunnel($nome) {
  $json = & $cf tunnel list -o json
  if (-not $json) { return $null }
  $lista = $json | ConvertFrom-Json
  return $lista | Where-Object { $_.name -eq $nome } | Select-Object -First 1
}

$tunel = Get-Tunnel $Nome
if (-not $tunel) {
  Write-Host "2/4 Criando tunel '$Nome'..." -ForegroundColor Cyan
  & $cf tunnel create $Nome
  $tunel = Get-Tunnel $Nome
  if (-not $tunel) {
    Write-Host "Nao consegui criar/achar o tunel '$Nome'." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "2/4 Tunel '$Nome' ja existe." -ForegroundColor Green
}
$id = $tunel.id
$cred = Join-Path $dir "$id.json"
if (-not (Test-Path $cred)) {
  Write-Host "O tunel existe mas as credenciais ($cred) nao estao nesta maquina." -ForegroundColor Red
  Write-Host "Apague e recrie:  cloudflared tunnel delete $Nome   e rode este script de novo." -ForegroundColor Yellow
  exit 1
}

# ---- 3) config com ingress catch-all --------------------------------
$config = Join-Path $dir "config.yml"
$yaml = @"
tunnel: $id
credentials-file: $cred
ingress:
  - service: http://localhost:$Porta
"@
Set-Content -Path $config -Value $yaml -Encoding ascii
Write-Host "3/4 Config gravada em $config (tudo que apontar para o tunel cai em localhost:$Porta)." -ForegroundColor Green

# ---- 4) servico (opcional) -----------------------------------------
if ($Service) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host "Para instalar como servico, abra o PowerShell como Administrador e rode:  npm run tunnel:setup -- -Service" -ForegroundColor Red
    exit 1
  }
  # O servico roda como LocalSystem e le a config desta pasta, nao da do usuario.
  $sysDir = Join-Path $env:SystemRoot "System32\config\systemprofile\.cloudflared"
  New-Item -ItemType Directory -Force $sysDir | Out-Null
  $sysCred = Join-Path $sysDir "$id.json"
  Copy-Item $cred $sysCred -Force
  $yamlSys = @"
tunnel: $id
credentials-file: $sysCred
ingress:
  - service: http://localhost:$Porta
"@
  Set-Content -Path (Join-Path $sysDir "config.yml") -Value $yamlSys -Encoding ascii
  & $cf service install
  Start-Service -Name cloudflared -ErrorAction SilentlyContinue
  $svc = Get-Service -Name cloudflared -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "4/4 Servico 'cloudflared' instalado. Status: $($svc.Status) (sobe junto com o Windows)." -ForegroundColor Green
  } else {
    Write-Host "4/4 'cloudflared service install' rodou, mas o servico nao apareceu. Veja o Visualizador de Eventos > Aplicativo." -ForegroundColor Yellow
  }
} else {
  Write-Host "4/4 Para rodar agora (deixe a janela aberta):   npm run tunnel" -ForegroundColor Cyan
  Write-Host "    Para subir com o Windows (PowerShell Admin): npm run tunnel:setup -- -Service" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "==> No HF (Configuracoes > 1. Para onde o DNS aponta):" -ForegroundColor Yellow
Write-Host "    Tipo:  CNAME"
Write-Host "    Alvo:  $id.cfargotunnel.com" -ForegroundColor White
Write-Host ""
Write-Host "    Depois adicione um dominio em Dominios e teste:  https://SEU-DOMINIO/hf/ping"
