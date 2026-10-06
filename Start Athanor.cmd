@echo off
rem Athanor web edition: serves this folder to this computer only (127.0.0.1) and opens your browser.
rem Keep the window open while you use Athanor; close it to stop. (Made by tools\build_web.ps1.)
title Athanor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\serve.ps1" -Port 8788 -Edition temple
if errorlevel 1 pause
