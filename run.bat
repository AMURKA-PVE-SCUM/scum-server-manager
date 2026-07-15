@echo off
cd /d "%~dp0"
call npx tsc -p src/main/tsconfig.json
if %errorlevel% neq 0 pause && exit /b %errorlevel%
call npx vite build --logLevel error
if %errorlevel% neq 0 pause && exit /b %errorlevel%
npx electron dist/main/index.js
pause
