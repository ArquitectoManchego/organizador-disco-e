@echo off
title Organizador de Disco E:
cd /d "%~dp0"

echo ======================================================
echo       ORGANIZADOR Y ETIQUETADOR DE DISCO E:\
echo ======================================================
echo.
echo Iniciando servidor local en http://localhost:8765 ...
echo.

start "" "http://localhost:8765"
python -m uvicorn app:app --host 127.0.0.1 --port 8765
pause
