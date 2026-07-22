[CmdletBinding()]
param(
    [switch]$Reset,
    [switch]$RunTests,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

function Read-SupabaseStatus {
    $previousErrorAction = $ErrorActionPreference
    try {
        # Supabase writes optional-service notices to stderr even when status succeeds.
        $ErrorActionPreference = 'Continue'
        $statusLines = & pnpm exec supabase status --output json 2>&1
        $statusExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($statusExitCode -ne 0) {
        throw 'Supabase local stack is not healthy. Run pnpm supabase:start and inspect its output.'
    }
    $rawStatus = $statusLines | Out-String

    # CLI warnings may appear before JSON on Windows, so parse only the JSON object.
    $jsonStart = $rawStatus.IndexOf('{')
    $jsonEnd = $rawStatus.LastIndexOf('}')
    if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) {
        throw 'Unable to parse Supabase local status output.'
    }
    return $rawStatus.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
}

Push-Location $repoRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI was not found. Install and start Docker Desktop first.'
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw 'pnpm was not found. Install the package manager declared in package.json first.'
    }

    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop is installed but the Docker engine is not running.'
    }

    Write-Host 'Starting Supabase local stack...'
    Invoke-CheckedCommand -Command 'pnpm' -Arguments @('exec', 'supabase', 'start')

    if ($Reset) {
        Write-Host 'Resetting local database and reapplying migrations...'
        Invoke-CheckedCommand -Command 'pnpm' -Arguments @('exec', 'supabase', 'db', 'reset', '--local', '--no-seed')
    }

    $status = Read-SupabaseStatus
    if (-not $status.API_URL -or -not $status.PUBLISHABLE_KEY) {
        throw 'Supabase status did not return API_URL and PUBLISHABLE_KEY.'
    }

    # Only public client configuration is written to disk. Secret/service keys remain in CLI output.
    $envContent = @(
        "WXT_PUBLIC_SUPABASE_URL=$($status.API_URL)"
        "WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$($status.PUBLISHABLE_KEY)"
        ''
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText(
        (Join-Path $repoRoot '.env.local'),
        $envContent,
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host 'Checking migration history and database advisors...'
    Invoke-CheckedCommand -Command 'pnpm' -Arguments @('exec', 'supabase', 'migration', 'list', '--local')
    Invoke-CheckedCommand -Command 'pnpm' -Arguments @('exec', 'supabase', 'db', 'advisors', '--local', '--type', 'security', '--level', 'warn', '--fail-on', 'error')
    Invoke-CheckedCommand -Command 'pnpm' -Arguments @('exec', 'supabase', 'db', 'advisors', '--local', '--type', 'performance', '--level', 'warn', '--fail-on', 'error')

    if ($RunTests) {
        Write-Host 'Running local Supabase Auth/RLS/LWW verification...'
        Invoke-CheckedCommand -Command 'node' -Arguments @('scripts/test-supabase-local.mjs')
    }

    if (-not $SkipBuild) {
        Write-Host 'Building MochiNote with local Supabase configuration...'
        Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'build')
    }

    Write-Host ''
    Write-Host 'Supabase local setup is ready.' -ForegroundColor Green
    Write-Host "API: $($status.API_URL)"
    Write-Host "Studio: $($status.STUDIO_URL)"
    Write-Host 'Extension: .output/chrome-mv3'
}
finally {
    Pop-Location
}
