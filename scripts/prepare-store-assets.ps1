param(
  [string]$Source = 'store-assets/mochinote-promo-source.png'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Export-CroppedImage {
  param(
    [System.Drawing.Image]$SourceImage,
    [string]$Destination,
    [int]$Width,
    [int]$Height
  )

  $sourceRatio = $SourceImage.Width / $SourceImage.Height
  $targetRatio = $Width / $Height
  if ($sourceRatio -gt $targetRatio) {
    $cropHeight = $SourceImage.Height
    $cropWidth = [int][Math]::Round($cropHeight * $targetRatio)
    $cropX = [int][Math]::Floor(($SourceImage.Width - $cropWidth) / 2)
    $cropY = 0
  } else {
    $cropWidth = $SourceImage.Width
    $cropHeight = [int][Math]::Round($cropWidth / $targetRatio)
    $cropX = 0
    $cropY = [int][Math]::Floor(($SourceImage.Height - $cropHeight) / 2)
  }

  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage(
      $SourceImage,
      [System.Drawing.Rectangle]::new(0, 0, $Width, $Height),
      [System.Drawing.Rectangle]::new($cropX, $cropY, $cropWidth, $cropHeight),
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$sourcePath = Resolve-Path -LiteralPath $Source
$outputDirectory = Join-Path (Split-Path -Parent $sourcePath) 'generated'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  Export-CroppedImage $sourceImage (Join-Path $outputDirectory 'mochinote-screenshot-1280x800.png') 1280 800
  Export-CroppedImage $sourceImage (Join-Path $outputDirectory 'mochinote-promo-440x280.png') 440 280
} finally {
  $sourceImage.Dispose()
}

Write-Output "Store assets prepared in $outputDirectory"
