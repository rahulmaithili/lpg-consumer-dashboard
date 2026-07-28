@echo off
title LPG Consumer Portal Server
cd /d "%~dp0"
echo ==========================================================
echo Starting LPG Consumer Portal Server...
echo The app will run locally and automatically open in browser.
echo Access URL: http://localhost:3000
echo ==========================================================
echo.
npx -y lite-server --baseDir="."
pause
