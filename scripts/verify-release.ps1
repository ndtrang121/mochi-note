param(
  [string]$OutputDirectory = '.output',
  [int64]$MaxPackageBytes = 2MB
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
$storeAssets = @(
  @{ Path = 'store-assets/generated/mochinote-screenshot-1280x800.png'; Width = 1280; Height = 800 },
  @{ Path = 'store-assets/generated/mochinote-promo-440x280.png'; Width = 440; Height = 280 }
)
foreach ($asset in $storeAssets) {
  if (-not (Test-Path -LiteralPath $asset.Path)) { throw "Missing store asset: $($asset.Path)" }
  $image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $asset.Path))
  try {
    if ($image.Width -ne $asset.Width -or $image.Height -ne $asset.Height) {
      throw "Invalid store asset dimensions for $($asset.Path): $($image.Width)x$($image.Height)"
    }
  } finally {
    $image.Dispose()
  }
}

$resolvedOutput = Resolve-Path -LiteralPath $OutputDirectory
$zip = Get-ChildItem -LiteralPath $resolvedOutput -Filter '*.zip' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $zip) {
  throw "No release zip found under $resolvedOutput. Run pnpm run zip first."
}
if ($zip.Length -gt $MaxPackageBytes) {
  throw "Release package exceeds the $MaxPackageBytes-byte budget: $($zip.Length) bytes."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
try {
  $manifestEntry = $archive.GetEntry('manifest.json')
  if (-not $manifestEntry) { throw 'Package is missing manifest.json.' }

  $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
  finally { $reader.Dispose() }

  if ($manifest.manifest_version -ne 3) { throw 'Manifest must use Manifest V3.' }
  if ($manifest.permissions -contains '<all_urls>') { throw 'Package must not request <all_urls>.' }
  if ($manifest.host_permissions -and @($manifest.host_permissions).Count -gt 0) {
    throw 'Package must not request host permissions; use activeTab for page-scoped capture.'
  }
  $forbiddenPermissions = @('tabs', 'history', 'cookies', 'identity', 'webRequest', 'webRequestBlocking')
  foreach ($permission in $forbiddenPermissions) {
    if ($manifest.permissions -contains $permission) {
      throw "Package requests a privacy-sensitive permission that is outside the MVP: $permission"
    }
  }

  $requiredPermissions = @('activeTab', 'alarms', 'contextMenus', 'notifications', 'scripting', 'sidePanel', 'storage')
  foreach ($permission in $requiredPermissions) {
    if ($manifest.permissions -notcontains $permission) {
      throw "Manifest is missing required permission: $permission"
    }
  }

  if (-not $manifest.background.service_worker) { throw 'Manifest is missing a background service worker.' }
  if (-not $manifest.side_panel.default_path) { throw 'Manifest is missing a side panel path.' }
  foreach ($requiredEntry in @($manifest.side_panel.default_path, 'popup.html', 'brand/mochi-mascot.png')) {
    if (-not $archive.GetEntry($requiredEntry)) { throw "Package is missing $requiredEntry." }
  }

  $sourceMaps = $archive.Entries | Where-Object { $_.FullName -like '*.map' }
  if ($sourceMaps) { throw 'Package must not contain source maps.' }
}
finally {
  $archive.Dispose()
}

$hash = Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256
Write-Output "Release package verified: $($zip.FullName)"
Write-Output "Bytes: $($zip.Length)"
Write-Output "SHA256: $($hash.Hash)"
