@echo off
cd /d "%~dp0"
echo [build] Compiling TypeScript...
call npx tsc -p src/main/tsconfig.json
if %errorlevel% neq 0 pause && exit /b %errorlevel%
echo [build] Copying assets (HTML, etc.)...
call npx copyfiles -u 2 "src/main/*.html" dist/main/
if %errorlevel% neq 0 pause && exit /b %errorlevel%
echo [build] Building renderer...
call npx vite build --logLevel error
if %errorlevel% neq 0 pause && exit /b %errorlevel%
npx electron dist/main/index.js
pause
