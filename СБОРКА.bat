@echo off
chcp 65001 >nul
title The civilization of the sages — сборка установщиков
cd /d "%~dp0"

echo ============================================================
echo   The civilization of the sages
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
echo   При запуске создаст ярлыки на рабочем столе и в Пуск,
echo   права администратора не нужны.
echo.
echo   Первый запуск: Windows покажет синее окно SmartScreen —
echo   «Подробнее» и «Выполнить в любом случае». Так бывает у любой
echo   программы без платной цифровой подписи.
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
echo     MIR.apk  — файл приложения для Android 5.0 и новее
echo   Просто перекиньте файл на телефон и нажмите «Установить».
echo   Телефон спросит разрешение на установку из этого источника —
echo   разрешите, подпись у файла своя, магазин для неё не нужен.
echo   Игра работает полностью автономно, в полноэкранном режиме.
echo.
echo   Если на телефоне что-то пойдёт не так:
echo     • подробный протокол сборки — logs\apk-build.log;
echo     • разбор готового файла — ЛОГИ-И-ДИАГНОСТИКА.bat
echo       (или команда npm run apk:doctor);
echo     • ошибку запуска приложение покажет прямо на экране телефона.
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
echo   ОШИБКА: сборка не получилась. Причина написана выше.
echo.
echo   Частые случаи:
echo     • для .exe нужен компилятор C# из .NET Framework
echo       (C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe);
echo     • первый запуск без интернета — не скачались зависимости npm.
echo.
echo   Полные протоколы сборки лежат в папке logs:
echo     logs\apk-build.log   — Android, каждый шаг и каждая проверка
echo     logs\apk-doctor.log  — разбор готового MIR.apk
echo.
pause
exit /b 1
