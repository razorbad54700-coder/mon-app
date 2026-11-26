@echo off
chcp 65001 >nul
title MonApp - Serveur
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Telecharge la version LTS sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b
)
node server.js
echo.
echo Le serveur s'est arrete.
pause
