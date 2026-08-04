@echo off
setlocal enabledelayedexpansion
title URAI
cd /d "%~dp0"

echo.
echo   URAI
echo   ----
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node fehlt noch.
  echo   Hol es bei https://nodejs.org - Version 22 oder neuer.
  echo   Danach diese Datei nochmal doppelklicken.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% lss 22 (
  echo   Deine Node-Version ist zu alt - URAI braucht 22 oder neuer.
  echo   Neue Version bei https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   Einmalig: Bausteine werden geladen. Das dauert ein, zwei Minuten ...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Das Laden ging schief. Steht oben, woran es lag?
    echo.
    pause
    exit /b 1
  )
)

start "" /min cmd /c "for /l %%i in (1,1,40) do (curl -s -o nul http://localhost:3017 && start http://localhost:3017 && exit /b) & timeout /t 1 /nobreak >nul"

echo   Startet auf http://localhost:3017
echo   Dieses Fenster offen lassen. Zum Beenden: Strg+C
echo.
call npm start
