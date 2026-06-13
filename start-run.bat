@echo off
cd /d "%~dp0"
npx electron dist/main/index.js
pause