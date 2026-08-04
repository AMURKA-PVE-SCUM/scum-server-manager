@echo off
cd /d "%~dp0"

setlocal enabledelayedexpansion

echo === Building SCUM Server Manager (portable) v%npm_package_version% ===

:: 1) Build JS/TS (main + renderer)
call npm run build
if !errorlevel! neq 0 (
  echo Build failed!
  pause
  exit /b !errorlevel!
)

:: 2) Build portable via electron-builder
::    Output: release/* (electron-builder)
echo [1/3] Running electron-builder portable...
call npx electron-builder --win --config.win.target=portable
if !errorlevel! neq 0 (
  echo electron-builder failed!
  pause
  exit /b !errorlevel!
)

:: 3) Move/copy the portable artifact(s) into release_portable/
echo [2/3] Preparing release_portable/...
if not exist "release_portable" mkdir "release_portable" >nul

:: Clean previous portable artifacts (keep directory)
del /q "release_portable\*" >nul 2>&1

:: Copy everything from electron-builder's release/ output to release_portable/
:: (electron-builder names can vary: win-unpacked/win-portable, etc.)
for /d %%D in ("release\*") do (
  xcopy /E /I /Y "%%~fD" "release_portable\%%~nxD" >nul
)
for %%F in ("release\*.*") do (
  copy /Y "%%~fF" "release_portable\" >nul
)

echo [3/3] Done!
echo Portable artifacts are in:
echo %~dp0release_portable

:: Show exe if present
for /r "release_portable" %%I in (*.exe) do (
  echo Found EXE: %%~fI
  goto :done
)
goto :eof
:done

pause

