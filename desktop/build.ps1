param([switch]$SkipWeb, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputPath = if ($OutputDirectory) { $OutputDirectory } else { Join-Path $PSScriptRoot 'dist' }
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path (Join-Path $framework 'csc.exe'))) { throw '.NET Framework 4.x compiler is required on Windows.' }
Push-Location $projectRoot
try {
  if (-not $SkipWeb) {
    & node --preserve-symlinks --preserve-symlinks-main node_modules/next/dist/bin/next build --webpack
    if ($LASTEXITCODE -ne 0) { throw 'Web dashboard build failed.' }
  }
  foreach($required in @('public/models/modnet.onnx','public/ort/ort.wasm.min.mjs','public/ort/ort-wasm-simd-threaded.mjs','public/ort/ort-wasm-simd-threaded.wasm','public/licenses/MODNet-LICENSE','public/licenses/onnxruntime-LICENSE')){if(-not(Test-Path -LiteralPath (Join-Path $projectRoot $required))){throw "Missing offline resource: $required"}}
  if((Get-FileHash -LiteralPath (Join-Path $projectRoot 'public/models/modnet.onnx') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9'){throw 'MODNet model checksum mismatch'}
  New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
  & (Join-Path $framework 'csc.exe') /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/win32icon:$projectRoot/public/brand/memo.ico" "/out:$outputPath\Clothesline.exe" "/reference:$framework\WPF\PresentationFramework.dll" "/reference:$framework\WPF\PresentationCore.dll" "/reference:$framework\WPF\WindowsBase.dll" "/reference:$framework\System.Xaml.dll" "/reference:$framework\System.Web.Extensions.dll" "/reference:$framework\System.Windows.Forms.dll" "/reference:$framework\System.Drawing.dll" (Join-Path $PSScriptRoot 'AssemblyInfo.cs') (Join-Path $PSScriptRoot 'Clothesline.cs') (Join-Path $PSScriptRoot 'RackScene.cs') (Join-Path $PSScriptRoot 'MemoGestures.cs') (Join-Path $PSScriptRoot 'WidgetAppearance.cs') (Join-Path $PSScriptRoot 'Companion.cs') (Join-Path $PSScriptRoot 'CompanionData.cs')
  if ($LASTEXITCODE -ne 0) { throw 'Native desktop build failed.' }
  if (Test-Path (Join-Path $projectRoot 'out\index.html')) {
    New-Item -ItemType Directory -Path (Join-Path $outputPath 'web') -Force | Out-Null
    Copy-Item -Path (Join-Path $projectRoot 'out\*') -Destination (Join-Path $outputPath 'web') -Recurse -Force
  } else { Write-Warning 'Web export is missing. The native rack works; build the dashboard before shipping.' }
  # A rebuild can copy into an older distribution; exclude the retired report there too.
  $retiredReport = Join-Path $outputPath 'web\reports\accounts.html'
  if (Test-Path -LiteralPath $retiredReport) { Remove-Item -LiteralPath $retiredReport }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README.zh-CN.md") -Destination (Join-Path $outputPath "README.txt") -Force
  $noticePath = Join-Path $outputPath 'web/licenses'
  New-Item -ItemType Directory -Path $noticePath -Force | Out-Null
  foreach ($name in @('react','react-dom','scheduler','next','lucide-react')) {
    $file = if ($name -eq 'next') { 'license.md' } else { 'LICENSE' }
    Copy-Item -LiteralPath (Join-Path $projectRoot "node_modules/$name/$file") -Destination (Join-Path $noticePath "$name-LICENSE.txt") -Force
  }
  Write-Output "Built: $outputPath\Clothesline.exe"
} finally { Pop-Location }
