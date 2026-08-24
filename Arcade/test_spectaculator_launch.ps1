param(
    [string]$Game = "E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection\Games\J\Jetpac (1983)(Ultimate Play The Game).tzx"
)

$spectaculator = "E:\Emulation\Systems\Sinclair\Spectaculator\Spectaculator.exe"
$specStub = "E:\Emulation\Systems\Sinclair\Spectaculator\SpecStub.exe"
$workDir = "E:\Emulation\Systems\Sinclair\Spectaculator"

Write-Host "Game: $Game"
Write-Host "1. Direct Spectaculator.exe"
$p1 = Start-Process -FilePath $spectaculator -ArgumentList @($Game) -WorkingDirectory $workDir -WindowStyle Normal -PassThru
Write-Host "PID: $($p1.Id)"
Start-Sleep -Seconds 3

Write-Host "2. SpecStub.exe"
$p2 = Start-Process -FilePath $specStub -ArgumentList @($Game) -WorkingDirectory $workDir -WindowStyle Normal -PassThru
Write-Host "PID: $($p2.Id)"
Start-Sleep -Seconds 3

Write-Host "3. Windows file association"
Start-Process -FilePath $Game -WindowStyle Normal
Start-Sleep -Seconds 3

Get-Process -Name Spectaculator,SpecStub -ErrorAction SilentlyContinue |
    Select-Object Id,ProcessName,Responding,MainWindowTitle,Path |
    Format-Table -AutoSize
