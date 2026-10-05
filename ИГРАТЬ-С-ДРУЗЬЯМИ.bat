@echo off
chcp 65001 >nul
title MIR — сервер для друзей
cd /d "%~dp0"

:start_menu
cls
echo ============================================================
echo   MIR — The civilization of the sages
echo   Запуск игры и сервера для друзей
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
echo Собираю свежую версию игры...
call npm run build
if errorlevel 1 goto :fail

echo.
echo Как будете звать друзей?
echo.
echo   [1] Рядом — та же сеть Wi-Fi (самый стабильный способ, без интернета).
echo   [2] Из любой точки интернета (публичная ссылка с автозащитой).
echo   [3] Диагностика и проверка связи (Doctor / Логи).
echo.
choice /c 123 /n /m "Нажмите 1, 2 или 3: "
if errorlevel 3 goto :doctor
if errorlevel 2 goto :public
if errorlevel 1 goto :local

:local
echo.
echo ------------------------------------------------------------
echo  Сервер запускается, игра сама откроется в браузере.
echo  Ссылку для друзей скопируйте из этого окна чуть ниже.
echo.
echo  ВНИМАНИЕ: НЕ ЗАКРЫВАЙТЕ ЭТО ОКНО!
echo  Пока окно открыто — игра и хаб работают.
echo  Вы можете просто свернуть его.
echo ------------------------------------------------------------
echo.
node serve.mjs --open
goto :stopped

:public
echo.
echo ------------------------------------------------------------
echo  Сервер с публичной ссылкой запускается...
echo  Игра сама откроется в браузере через 3 секунды.
echo.
echo  ============================================================
echo   ВАЖНО: НЕ ЗАКРЫВАЙТЕ ЭТО ОКНО ВО ВРЕМЯ ИГРЫ!
echo   При закрытии окна ссылка для друзей мгновенно перестаёт
echo   работать (Error 1033).
echo   Окно должно оставаться открытым (можно свернуть в трей/панель).
echo  ============================================================
echo.
echo  Ссылка появится ниже и автоматически скопируется в буфер (Ctrl+V).
echo  Перед этим сервер проверит DNS: если ссылку поднять нельзя из-за
echo  VPN или прокси, он прямо об этом напишет и подскажет, что сделать.
echo ------------------------------------------------------------
echo.
node serve.mjs --public --open
goto :stopped

:doctor
echo.
call "ЛОГИ-И-ДИАГНОСТИКА.bat"
goto :start_menu

:stopped
echo.
echo ============================================================
echo   Сервер остановлен.
echo ============================================================
echo.
echo Что сделать дальше?
echo   [1] Запустить сервер снова
echo   [2] Открыть диагностику и журнал логов
echo   [3] Выйти
echo.
choice /c 123 /n /m "Нажмите 1, 2 или 3: "
if errorlevel 3 goto :exit_app
if errorlevel 2 goto :doctor
if errorlevel 1 goto :start_menu

:exit_app
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
echo   ОШИБКА: не получилось собрать игру.
echo   Посмотрите сообщения выше или запустите СБОРКА.bat
echo.
pause
exit /b 1
