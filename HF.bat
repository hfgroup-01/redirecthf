@echo off
title HF Redirects
cd /d "%~dp0"
node scripts\hf.mjs
echo.
echo HF encerrado. Pode fechar esta janela.
pause >nul
