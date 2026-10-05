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
node scripts\doctor.mjs
if errorlevel 1 goto :fail

if not exist "MIR.apk" goto :noapk
echo.
echo ============================================================
echo   Разбираю собранный MIR.apk
echo   (почему он может не ставиться или не запускаться)
echo ============================================================
echo.
node scripts\apk-doctor.mjs
if exist "logs\apk-report.txt" start notepad "logs\apk-report.txt"
goto :report

:noapk
echo.
echo   MIR.apk не найден — разбор Android-приложения пропущен.
echo   Собрать: СБОРКА.bat, пункт [3].

:report
echo.
echo ============================================================
echo   ОТЧЁТЫ СФОРМИРОВАНЫ!
echo     logs\diagnostic-report.txt  — система, сеть, порты
echo     logs\apk-report.txt         — разбор MIR.apk
echo     logs\apk-build.log          — протокол последней сборки APK
echo     logs\apk-doctor.log         — полный разбор APK по байтам
echo     logs\mir-server.log         — журнал сервера
echo.
echo   Последний отчёт уже в буфере обмена — Ctrl+V в чат разработчику.
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
