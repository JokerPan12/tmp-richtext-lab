<#
  自检脚本：语法检查 + 三套测试。
  用法： powershell -ExecutionPolicy Bypass -File .\check.ps1
#>
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$fail = 0

Write-Host "== 1/4 语法检查 ==" -ForegroundColor Cyan
foreach ($f in @("lib.mjs", "compose.mjs", "app.js", "test-helpers.mjs", "selftest-compose.mjs", "selftest-lib.mjs", "selftest-pages.mjs")) {
  node --check (Join-Path $dir $f)
  if ($LASTEXITCODE -eq 0) { Write-Host ("  OK   " + $f) -ForegroundColor Green }
  else { Write-Host ("  FAIL " + $f) -ForegroundColor Red; $fail++ }
}

Write-Host "== 2/4 生成器测试（文字 + 样式 → 代码） ==" -ForegroundColor Cyan
node (Join-Path $dir "selftest-compose.mjs")
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host "== 3/4 解析/渲染层测试 ==" -ForegroundColor Cyan
node (Join-Path $dir "selftest-lib.mjs")
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host "== 4/4 页面测试（含 file:// 兼容性回归） ==" -ForegroundColor Cyan
node (Join-Path $dir "selftest-pages.mjs")
if ($LASTEXITCODE -ne 0) { $fail++ }

if ($fail -eq 0) { Write-Host "`n全部通过。" -ForegroundColor Green; exit 0 }
Write-Host "`n有 $fail 项失败。" -ForegroundColor Red; exit 1
