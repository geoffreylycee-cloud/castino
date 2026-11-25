@echo off
title CaSTIno - Envoi sur GitHub
echo ========================================================
echo   Envoi de CaSTIno vers GitHub (geoffreylycee-cloud)
echo ========================================================
git config http.sslBackend schannel
git add .
git commit -m "Update CaSTIno" 2>nul
git push -u origin main
echo.
echo Termine ! Tu peux fermer cette fenetre.
pause
