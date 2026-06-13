@echo off
cd /d "%~dp0"
echo === Building SCUM Server Manager v2.1.0 ===

:: Step 1: Build the project
echo [1/4] Building...
call npm run build
if %errorlevel% neq 0 (
  echo Build failed!
  pause
  exit /b %errorlevel%
)

:: Step 2: (legacy) packaging via electron-packager
:: This repo now supports portable builds via electron-builder.
:: Keep this file for compatibility with old workflows.
set OUT_DIR=release_216
echo [2/4] Packaging into %OUT_DIR%...
npx electron-packager . "SCUM_Server_Manager" --platform=win32 --arch=x64 --out="%OUT_DIR%" --asar --prune=true --ignore="^/src$" --ignore="^/release$" --ignore="^/release_final$" --ignore="^/release_" --ignore="^/\.git$" --ignore="^/old$" --ignore="^/\.vscode$" --electron-version=27.1.3
if %errorlevel% neq 0 (
  echo Packaging failed!
  pause
  exit /b %errorlevel%
)

:: Step 3: Copy iditem.txt to resources/ for fallback path
echo [3/4] Copying resources...
copy "iditem.txt" "%OUT_DIR%\SCUM_Server_Manager-win32-x64\resources\iditem.txt" /Y >nul

:: Step 4: Display result
echo [4/4] Done!
echo ===============================
echo Release: %~dp0%OUT_DIR%\SCUM_Server_Manager-win32-x64\
for %%I in ("%OUT_DIR%\SCUM_Server_Manager-win32-x64\resources\app.asar") do @echo asar size: %%~zI bytes
echo ===============================
pause
