@echo off
chcp 65001 >nul
title MIR — сборка установщиков
cd /d "%~dp0"

echo ============================================================
echo   MIR — The civilization of the sages
echo   Сборка игры и установщиков
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist node_modules goto :deps

echo Первый запуск: устанавливаю зависимости, это пару минут...
call npm install
if errorlevel 1 goto :fail

:deps
echo.
echo Что вы хотите собрать?
echo.
echo   [1] Веб-версию (папка dist\ и один файл mir.html)
echo   [2] Windows-приложение (.exe установщик для ПК)
echo   [3] Android-приложение (.apk установщик для телефонов)
echo   [4] Всё сразу (Веб + .exe + .apk)
echo.
choice /c 1234 /n /m "Нажмите 1, 2, 3 или 4: "
if errorlevel 4 goto :opt_all
if errorlevel 3 goto :opt_apk
if errorlevel 2 goto :opt_exe
if errorlevel 1 goto :opt_web

:opt_web
echo.
echo Собираю веб-версию...
call npm run build
if errorlevel 1 goto :fail
call npm run single
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   Готово!
echo     dist\      — собранный сайт, его раздаёт сервер
echo     mir.html   — один файл, можно открыть в любом браузере
echo ============================================================
goto :done

:opt_exe
echo.
echo Собираю Windows .exe установщик...
call npm run build:exe
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   Готово!
echo     MIR-Setup.exe  — файл установщика для Windows
echo   Просто перекиньте файл другу (Telegram / Discord / флешка).
echo   При запуске создаст ярлыки на рабочем столе и в Пуск.
echo ============================================================
goto :done

:opt_apk
echo.
echo Собираю Android .apk установщик...
call npm run build:apk
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   Готово!
echo     MIR.apk  — файл приложения для Android
echo   Просто перекиньте файл на телефон и нажмите «Установить».
echo   Работает полностью автономно, в полноэкранном режиме.
echo ============================================================
goto :done

:opt_all
echo.
echo Собираю все форматы (Веб, Windows .exe, Android .apk)...
call npm run build:all
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   ВСЕ СБОРКИ ГОТОВЫ!
echo     • Windows:  MIR-Setup.exe  (или dist-app\MIR-Setup.exe)
echo     • Android:  MIR.apk        (или dist-app\MIR.apk)
echo     • Браузер:  mir.html       (или папка dist\)
echo   Файлами можно делиться просто перекидывая их друзьям!
echo ============================================================
goto :done

:done
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
