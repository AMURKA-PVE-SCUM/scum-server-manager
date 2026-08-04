@echo off
cd /d "%~dp0"
call npm run build
if %errorlevel% neq 0 (
  echo Build failed
  pause
  exit /b %errorlevel%
)
npx electron dist/main/index.js
pause
