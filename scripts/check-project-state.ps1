param(
  [ValidateSet('show', 'check')]
  [string]$Mode = 'show'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $root '.project\state.json'

if (-not (Test-Path -LiteralPath $statePath)) {
  throw "Missing project state: $statePath"
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$task = $state.activeTask

if ($Mode -eq 'show') {
  Write-Output "Phase: $($state.phase.id) - $($state.phase.name)"
  Write-Output "Task: $($task.id) - $($task.title)"
  Write-Output "Status: $($task.status)"
  Write-Output "Objective: $($task.objective)"
  Write-Output 'Read only:'
  $task.requiredDocs | ForEach-Object { Write-Output "  - $_" }
  Write-Output 'Scope:'
  $task.scope | ForEach-Object { Write-Output "  - $_" }
  Write-Output 'Checks:'
  $task.checks | ForEach-Object { Write-Output "  - $_" }
  Write-Output "Commit: $($task.commitMessage)"
  exit 0
}

$errors = [System.Collections.Generic.List[string]]::new()

if ($state.schemaVersion -ne 1) { $errors.Add('schemaVersion must equal 1') }
if ([string]::IsNullOrWhiteSpace($state.phase.id)) { $errors.Add('phase.id is required') }
if ([string]::IsNullOrWhiteSpace($task.id)) { $errors.Add('activeTask.id is required') }
if ($task.status -notin @('ready', 'in_progress', 'verify', 'blocked')) {
  $errors.Add("Invalid activeTask.status: $($task.status)")
}
if ($task.requiredDocs.Count -lt 1) { $errors.Add('activeTask.requiredDocs must not be empty') }
if ($task.scope.Count -lt 1) { $errors.Add('activeTask.scope must not be empty') }
if ($task.checks.Count -lt 1) { $errors.Add('activeTask.checks must not be empty') }
if ([string]::IsNullOrWhiteSpace($task.commitMessage)) { $errors.Add('activeTask.commitMessage is required') }

foreach ($doc in $task.requiredDocs) {
  $path = Join-Path $root $doc
  if (-not (Test-Path -LiteralPath $path)) {
    $errors.Add("Required document does not exist: $doc")
  }
}

$roadmapPath = Join-Path $root 'docs\ROADMAP.md'
if ((Test-Path -LiteralPath $roadmapPath) -and
    -not (Select-String -LiteralPath $roadmapPath -SimpleMatch "| $($task.id) |" -Quiet)) {
  $errors.Add("Active task is not declared in docs/ROADMAP.md: $($task.id)")
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Project state is valid for $($task.id) ($($task.status))."
