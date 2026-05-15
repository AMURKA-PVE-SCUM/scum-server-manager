$env:Path = "C:\nodejs\node-v20.18.3-win-x64;" + $env:Path
$env:NODE_ENV = "development"

Write-Host "Starting Vite dev server..." -ForegroundColor Cyan
$vite = Start-Process -FilePath "npx.cmd" -ArgumentList "vite --config vite.config.ts" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 5

Write-Host "Starting Electron..." -ForegroundColor Green
npx electron dist/main/index.js
