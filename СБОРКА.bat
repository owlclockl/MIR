@echo off
chcp 65001 >nul
title MIR — сборка
cd /d "%~dp0"

echo ============================================================
echo   MIR — The civilization of the sages
echo   Сборка игры
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist node_modules goto :deps

echo [1/3] Первый запуск: устанавливаю зависимости, это пару минут...
call npm install
if errorlevel 1 goto :fail
goto :build

:deps
echo [1/3] Зависимости уже установлены.

:build
echo.
echo [2/3] Собираю сайт в папку dist\ ...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [3/3] Собираю однофайловую версию mir.html ...
call npm run single
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   Готово!
echo     dist\      — собранный сайт, его раздаёт сервер
echo     mir.html   — один файл, можно отправить другу
echo   Дальше запустите ИГРАТЬ-С-ДРУЗЬЯМИ.bat
echo ============================================================
echo.
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
echo   ОШИБКА: сборка не получилась. Посмотрите сообщения выше.
echo.
pause
exit /b 1
