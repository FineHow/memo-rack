param([string]$DistributionDirectory,[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $DistributionDirectory){$DistributionDirectory=Join-Path $projectRoot 'desktop\dist'}
$dist=[IO.Path]::GetFullPath($DistributionDirectory)
$logRoot=Join-Path $projectRoot 'outputs\companion-upgrade-20261121\final-verification'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$oldExe=$env:CLOTHESLINE_TEST_EXE
$oldWeb=$env:CLOTHESLINE_WEB_ROOT
$env:CLOTHESLINE_TEST_EXE=Join-Path $dist 'Clothesline.exe'
$env:CLOTHESLINE_WEB_ROOT=Join-Path $dist 'web'
$checks=[Collections.Generic.List[object]]::new()
@{status='running';distribution=$dist} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'result.json') -Encoding UTF8
function Run-Check([string]$name,[scriptblock]$action){
  Write-Output "Checking: $name"
  $started=[DateTime]::UtcNow
  $previousPreference=$ErrorActionPreference
  try{
    $ErrorActionPreference='Continue'
    & $action 2>&1 | ForEach-Object {"$_"} | Set-Content -LiteralPath (Join-Path $logRoot ($name+'.txt')) -Encoding UTF8
    $code=$LASTEXITCODE
  }catch{
    $_ | Out-String | Add-Content -LiteralPath (Join-Path $logRoot ($name+'.txt')) -Encoding UTF8
    $code=1
  }finally{$ErrorActionPreference=$previousPreference}
  $checks.Add([pscustomobject]@{name=$name;exitCode=$code;seconds=[Math]::Round(([DateTime]::UtcNow-$started).TotalSeconds,2)})
  $checks | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'checks.json') -Encoding UTF8
  if($code -ne 0){Get-Content -LiteralPath (Join-Path $logRoot ($name+'.txt')) -Tail 18;throw "Check failed: $name (exit $code)"}
}
Push-Location $projectRoot
try{
  if(-not $SkipBuild){Run-Check 'build' {& (Join-Path $projectRoot 'desktop\build.ps1') -OutputDirectory $dist}}
  Run-Check 'unit' {& npm.cmd test}
  Run-Check 'typecheck' {& npm.cmd run typecheck}
  Run-Check 'lint' {& npm.cmd run lint}
  Run-Check 'native-api' {& npm.cmd run desktop:test}
  Run-Check 'web' {& node scripts/test-web.mjs}
  Run-Check 'companion' {& node scripts/test-companion.mjs}
  Run-Check 'native-gestures' {& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-native-gestures.ps1 -DistributionDirectory $dist}
  Run-Check 'native-migration' {& node scripts/test-native-migration.mjs}
  Run-Check 'browser-storage' {& node scripts/test-browser-storage.mjs}
  Run-Check 'native-reconnect' {& node scripts/test-native-reconnect.mjs}
  Run-Check 'photo-selection' {& node scripts/test-photo-selection.mjs}
  Run-Check 'photo-quality' {& node scripts/test-photo-quality.mjs}
  $hash=(Get-FileHash -LiteralPath $env:CLOTHESLINE_TEST_EXE -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{distribution=$dist;exeSHA256=$hash;passed=$checks.Count;checks=$checks} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $logRoot 'result.json') -Encoding UTF8
  Write-Output "PASS: all $($checks.Count) release checks against $dist"
}finally{
  $env:CLOTHESLINE_TEST_EXE=$oldExe
  $env:CLOTHESLINE_WEB_ROOT=$oldWeb
  Pop-Location
}
