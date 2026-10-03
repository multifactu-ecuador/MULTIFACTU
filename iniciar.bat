@echo off
cd /d "%~dp0"
if not exist package.json (echo Abre la carpeta del proyecto. & pause & exit /b 1)
if not exist client\.env copy client\.env.example client\.env >nul
call npm ci
if errorlevel 1 (pause & exit /b 1)
call npm run dev
pause
