@echo off
title CaSTIno - Serveur Temps Reel & Client Web
set NODE_OPTIONS=--use-system-ca
echo ========================================================
echo   Demarrage de CaSTIno (http://localhost:5173)
echo ========================================================
call npm.cmd run dev
pause
