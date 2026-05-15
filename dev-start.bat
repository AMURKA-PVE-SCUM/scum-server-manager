@echo off
set PATH=C:\nodejs\node-v20.18.3-win-x64;%PATH%
set NODE_ENV=development
start "" /B cmd /c "npx vite --config vite.config.ts"
echo Waiting for Vite...
timeout /t 5 /nobreak >nul
npx electron dist/main/index.js
