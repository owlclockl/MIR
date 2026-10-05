@echo off
chcp 65001 >nul
title MIR — Диагностика и логи
cd /d "%~dp0"

echo ============================================================
echo   MIR — The civilization of the sages
echo   Сбор диагностических данных и журнала логов
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

echo Запускаю самодиагностику системы, портов и сети...
echo.
node doctor.mjs
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   ОТЧЁТ УСПЕШНО СФОРМИРОВАН!
echo   1. Отчёт автоматически скопирован в буфер обмена.
echo   2. Файл отчёта: logs\diagnostic-report.txt
echo   3. Журнал логов: logs\mir-server.log
echo   
echo   Просто откройте чат с разработчиком и нажмите Ctrl+V!
echo ============================================================
echo.

if exist "logs\diagnostic-report.txt" (
    start notepad "logs\diagnostic-report.txt"
)

pause
exit /b 0

:nonode
echo.
echo   ОШИБКА: не найден Node.js.
echo   1. Скачайте LTS-версию с https://nodejs.org
echo   2. Установите её и запустите этот файл ещё раз.
echo.
pause
exit /b 1

:fail
echo.
echo   ОШИБКА при сборе диагностики.
echo.
pause
exit /b 1
