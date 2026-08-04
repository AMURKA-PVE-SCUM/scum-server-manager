@echo off
cd /d "%~dp0"
call npm run dist:win
pause
