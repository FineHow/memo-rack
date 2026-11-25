param([string]$DistributionDirectory=$env:CLOTHESLINE_TEST_DIST)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $DistributionDirectory){$DistributionDirectory=Join-Path $projectRoot 'desktop\dist'}
$dist=[IO.Path]::GetFullPath($DistributionDirectory)
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$references=@("/reference:$dist\Clothesline.exe","/reference:$framework\WPF\PresentationFramework.dll","/reference:$framework\WPF\PresentationCore.dll","/reference:$framework\WPF\WindowsBase.dll","/reference:$framework\System.Xaml.dll","/reference:$framework\System.Web.Extensions.dll")
foreach($name in @('ReminderChecks','MemoGestureChecks')){
  $output=Join-Path $dist ($name+'.exe')
  try{
    & "$framework\csc.exe" /nologo /target:exe /platform:x64 /codepage:65001 "/out:$output" @references (Join-Path $PSScriptRoot ($name+'.cs'))
    if($LASTEXITCODE -ne 0){throw "Compile failed: $name"}
    if($name -eq 'ReminderChecks'){
      & $output (Join-Path $projectRoot 'tests\reminder-contract.json') (Join-Path $projectRoot 'outputs\companion-upgrade-20261121\evidence')
    }else{& $output}
    if($LASTEXITCODE -ne 0){throw "Checks failed: $name"}
  }finally{if(Test-Path -LiteralPath $output){Remove-Item -LiteralPath $output}}
}
