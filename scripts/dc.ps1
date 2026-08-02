# =============================================================================
# One entry point for both Docker stacks, so switching never means editing files.
#
#   .\scripts\dc.ps1 dev  up -d          # start the dev stack (hot reload)
#   .\scripts\dc.ps1 dev  logs -f api    # follow the API logs
#   .\scripts\dc.ps1 dev  down           # stop it (data volumes are kept)
#   .\scripts\dc.ps1 prod up -d          # the production stack, same syntax
#
# Everything after the stack name is passed straight through to `docker compose`,
# so any compose subcommand/flag works exactly as documented upstream.
#
#   dev  -> docker-compose.dev.yml   (project: growasy-dev)
#   prod -> docker-compose.yml       (project: growasy, reads .env)
#
# The two projects are fully independent — containers, networks and volumes are
# namespaced per project, so both can exist on one machine at the same time.
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('dev', 'prod')]
    [string]$Stack,

    # Any docker compose subcommand + flags, e.g. `up -d`, `logs -f api`, `ps`.
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

# Always operate from the repo root (the directory holding the compose files),
# no matter where the script is invoked from.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker not found on PATH. Install Docker Desktop and make sure it's running."
}

if (-not $Rest -or $Rest.Count -eq 0) {
    Write-Host "Usage: .\scripts\dc.ps1 <dev|prod> <docker compose args...>" -ForegroundColor Yellow
    Write-Host "  e.g. .\scripts\dc.ps1 dev up -d"
    Write-Host "       .\scripts\dc.ps1 dev logs -f api"
    Write-Host "       .\scripts\dc.ps1 prod ps"
    exit 1
}

if ($Stack -eq 'dev') {
    $composeFile = 'docker-compose.dev.yml'
}
else {
    $composeFile = 'docker-compose.yml'
    if (-not (Test-Path '.env')) {
        Write-Error "prod stack needs .env — run: Copy-Item .env.example .env  (then edit it)"
    }
}

Write-Host "▸ [$Stack] docker compose -f $composeFile $($Rest -join ' ')" -ForegroundColor Cyan
& docker compose -f $composeFile @Rest
exit $LASTEXITCODE
