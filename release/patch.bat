@echo off
chcp 65001 >nul
setlocal
set "BSE_SELF=%~f0"
set "BSE_ARGS=%*"
set "GAME_VERSION=1.1.1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[IO.File]::ReadAllText($env:BSE_SELF); iex $c.Substring($c.LastIndexOf('##PS##')+6)"
set "RC=%errorlevel%"
exit /b %RC%
##PS##
# =============================================================================
# Bitter Sweet Endroll 多语言补丁（安装 / 卸载 二合一）
#   补丁放在游戏根目录，资源目录固定为「脚本所在目录 \Data」。
#   双击运行进入菜单，也支持命令行：patch.bat install / uninstall
# =============================================================================
$ErrorActionPreference = "Stop"

function Info([string]$m) { Write-Host "提示: $m" }
function Warn([string]$m) { Write-Host "警告: $m" }
function Fail([string]$m) { Write-Host "错误: $m" }

$Root     = Split-Path -Parent $env:BSE_SELF
$GameData = Join-Path $Root "Data"
$Res      = Join-Path $GameData "resources"
$AppAsar  = Join-Path $Res "app.asar"
$BaseAsar = Join-Path $Res "base.asar"
$Payload  = Join-Path $Root "app.asar"
$Exe      = Join-Path $GameData "BitterSweetEndroll.exe"
$ExeName  = "BitterSweetEndroll"
$Want     = $env:GAME_VERSION

function Get-GameVersion {
  if (-not (Test-Path -LiteralPath $Exe)) { return "" }
  try {
    $v = (Get-Item -LiteralPath $Exe).VersionInfo.FileVersion
    $parts = ($v -split '\.') | Where-Object { $_ -match '^\d+$' } | Select-Object -First 3
    return ($parts -join '.')
  } catch { return "" }
}

function Get-State {
  if (-not (Test-Path -LiteralPath $Res)) { return "未找到资源目录" }
  if (Test-Path -LiteralPath $BaseAsar) { return "已安装" }
  if (Test-Path -LiteralPath $AppAsar) { return "未安装" }
  return "缺少 app.asar"
}

function Get-Choice {
  while ($true) {
    Write-Host "> " -NoNewline
    if ([Console]::IsInputRedirected) { return (Read-Host).Trim() }
    try { $key = [Console]::ReadKey($true) } catch { return (Read-Host).Trim() }
    $ch = [string]$key.KeyChar
    if ($ch -in @("1", "2", "3")) {
      Write-Host $ch
      return $ch
    }
  }
}

function Show-Status {
  $found = Get-GameVersion
  Write-Host "当前状态："
  Write-Host ""
  Write-Host ("  游戏目录: {0}" -f $Root)
  Write-Host ("  游戏版本: {0}" -f $(if ($found) { $found } else { "未检测到" }))
  Write-Host ("  补丁版本: {0}" -f $Want)
  Write-Host ("  安装状态: {0}" -f (Get-State))
  Write-Host ""
}

function Show-Menu {
  Write-Host "1) 安装补丁"
  Write-Host "2) 卸载补丁（还原为原版）"
  Write-Host "3) 退出"
  Write-Host ""
}

function Test-Location {
  if (-not (Test-Path -LiteralPath $Res)) {
    Fail "未找到资源目录 .\Data"
    Write-Host "      本补丁必须放在游戏根目录，也就是与 Data 文件夹同级的位置。"
    Write-Host "      当前脚本所在目录："
    Write-Host "      $Root"
    Write-Host "      请把本补丁（含 app.asar）移到游戏根目录后重试。"
    return $false
  }
  return $true
}

function Test-Payload {
  if (-not (Test-Path -LiteralPath $Payload)) {
    Fail "补丁不完整，未找到 app.asar"
    Write-Host "      请确认 app.asar 与本脚本放在同一目录。"
    return $false
  }
  return $true
}

function Test-Running {
  if (Get-Process -Name $ExeName -ErrorAction SilentlyContinue) {
    Fail "检测到游戏正在运行，请先完全退出游戏。"
    return $false
  }
  return $true
}

function Check-GameVersion {
  if (-not $Want) { return }
  $found = Get-GameVersion
  if ($found -and $found -ne $Want) {
    Warn "检测到的游戏版本为 $found，本补丁针对 $Want 制作，可以继续。"
  }
}

function Do-Install {
  if (-not (Test-Location)) { return $false }
  if (-not (Test-Payload)) { return $false }
  if (-not (Test-Running)) { return $false }
  Check-GameVersion

  if (Test-Path -LiteralPath $BaseAsar) {
    Warn "检测到 base.asar，似乎已经安装过本补丁。"
    Write-Host "      如需重装，请先选择 2 卸载。"
    return $false
  }
  if (-not (Test-Path -LiteralPath $AppAsar)) {
    Fail "未找到原版 app.asar，无法安装。"
    return $false
  }

  Info "备份原版 app.asar -> base.asar"
  Move-Item -LiteralPath $AppAsar -Destination $BaseAsar

  try {
    Info "写入补丁 app.asar"
    Copy-Item -LiteralPath $Payload -Destination $AppAsar -Force
  } catch {
    Fail "写入失败：$($_.Exception.Message)"
    Warn "正在回滚 base.asar -> app.asar"
    try {
      if ((Test-Path -LiteralPath $BaseAsar) -and -not (Test-Path -LiteralPath $AppAsar)) {
        Move-Item -LiteralPath $BaseAsar -Destination $AppAsar
      }
    } catch {}
    return $false
  }

  Info "安装完成。启动游戏后，在标题画面或游戏内「设置」里选择「中文」。"
  return $true
}

function Do-Uninstall {
  if (-not (Test-Location)) { return $false }
  if (-not (Test-Running)) { return $false }

  if (-not (Test-Path -LiteralPath $BaseAsar)) {
    Warn "未找到 base.asar，可能本就未安装补丁。"
    return $false
  }

  if (Test-Path -LiteralPath $AppAsar) {
    Info "删除补丁 app.asar"
    Remove-Item -LiteralPath $AppAsar -Force
  }
  Info "还原 base.asar -> app.asar"
  Move-Item -LiteralPath $BaseAsar -Destination $AppAsar
  Info "卸载完成，游戏已还原为原版。"
  return $true
}

# ---- 非交互模式（自动化 / 高级用户）：patch.bat install | uninstall ----
$arg0 = ""
if ($env:BSE_ARGS) {
  $a = @([regex]::Matches($env:BSE_ARGS, '"[^"]*"|\S+') | ForEach-Object { $_.Value.Trim('"') })
  if ($a.Count -ge 1) { $arg0 = $a[0].ToLower() }
}
if ($arg0 -eq "install" -or $arg0 -eq "1")   { if (Do-Install)   { exit 0 } else { exit 1 } }
if ($arg0 -eq "uninstall" -or $arg0 -eq "2") { if (Do-Uninstall) { exit 0 } else { exit 1 } }

# ---- 交互菜单 ----
Write-Host ""
Write-Host "Bitter Sweet Endroll 多语言补丁"
Write-Host ""
Write-Host "为游戏追加中文，不改动任何原版文件，可随时卸载还原。"

while ($true) {
  Write-Host ""
  Show-Status
  Show-Menu
  $choice = Get-Choice
  Write-Host ""
  switch ($choice) {
    "1" { [void](Do-Install) }
    "2" { [void](Do-Uninstall) }
    "3" { exit 0 }
  }
}
