@echo off
title ColdFlow Unified 3D Digital Twin Launcher
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "Run-ColdFlow.ps1"
pause
