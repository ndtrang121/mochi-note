param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PnpmArgs
)

$ErrorActionPreference = 'Stop'
$env:CI = 'true'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
  $nodeBin = Join-Path $runtimeRoot 'node\bin'

  if (-not (Test-Path -LiteralPath (Join-Path $nodeBin 'node.exe'))) {
    throw 'Node.js is not installed and the bundled Codex runtime was not found.'
  }

  $env:Path = "$nodeBin;$env:Path"
}

$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue

if ($pnpmCommand) {
  $pnpmPath = $pnpmCommand.Source
} else {
  $pnpmPath = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'

  if (-not (Test-Path -LiteralPath $pnpmPath)) {
    throw 'pnpm is not installed and the bundled Codex runtime was not found.'
  }
}

& $pnpmPath @PnpmArgs
exit $LASTEXITCODE
