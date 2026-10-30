@echo off
title Organizador de Disco E: (Servidor Remoto + Tunel Web)
cd /d "%~dp0"

echo ======================================================================
echo    SUITE DE DISCO E:\ - ACCESO REMOTO SEGURO DESDE CELULAR
echo ======================================================================
echo.
echo Iniciando servidor backend local...
start "Organizador Backend" /min python -m uvicorn app:app --host 127.0.0.1 --port 8765

timeout /t 2 /nobreak >nul

echo Conectando tunel publico cifrado con Cloudflare Tunnel...
echo.
echo Cuando aparezca el enlace "https://xxx.trycloudflare.com",
echo abrelo en el navegador de tu celular para consultar y ejecutar
echo tus 3 modulos (Folder Sizes, Beyond Compare y Thumbnails Studio).
echo ======================================================================
echo.

cloudflared.exe tunnel --url http://127.0.0.1:8765
pause
