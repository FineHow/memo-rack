param([switch]$SkipBuild,[string]$OutputDirectory,[string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distPath = if($OutputDirectory){[IO.Path]::GetFullPath($OutputDirectory)}else{Join-Path $projectRoot ('releases/Clothesline-Companion-'+(Get-Date -Format yyyyMMdd-HHmmss)+'/dist')}
$releasePath = Join-Path $projectRoot 'releases'
if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory $distPath
}
foreach ($relative in @('Clothesline.exe', 'web\index.html')) {
  if (-not (Test-Path -LiteralPath (Join-Path $distPath $relative))) {
    throw "Missing release file: $relative. Run desktop/build.ps1 first."
  }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.zh-CN.md') -Destination (Join-Path $distPath 'README.txt') -Force
New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
$archivePath = if($ArchivePath){[IO.Path]::GetFullPath($ArchivePath)}else{Join-Path $releasePath ((Split-Path (Split-Path $distPath -Parent) -Leaf)+'-Windows-x64.zip')}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pendingArchive = Join-Path ([IO.Path]::GetDirectoryName($archivePath)) ([Guid]::NewGuid().ToString('N')+'.zip')
try {
  [IO.Compression.ZipFile]::CreateFromDirectory($distPath, $pendingArchive, [IO.Compression.CompressionLevel]::Optimal, $true)
  if ([IO.File]::Exists($archivePath)) {
    [IO.File]::Replace($pendingArchive,$archivePath,[NullString]::Value)
  } else { [IO.File]::Move($pendingArchive,$archivePath) }
} finally {
  if ([IO.File]::Exists($pendingArchive)) { [IO.File]::Delete($pendingArchive) }
}
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($archivePath+'.sha256'), "$hash  $([IO.Path]::GetFileName($archivePath))`n", [Text.UTF8Encoding]::new($false))
Write-Output "Packaged: $archivePath"
