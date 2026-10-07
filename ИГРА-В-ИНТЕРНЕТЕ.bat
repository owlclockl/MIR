@echo off
chcp 65001 >nul
title MIR — игра в интернете (бесплатный хостинг)
cd /d "%~dp0"

:start_menu
cls
echo ============================================================
echo   MIR — The civilization of the sages
echo   Игра в интернете: постоянная ссылка на бесплатном хостинге
echo ============================================================
echo.
echo  Что это. Игра и общий хаб аккаунтов уезжают на Cloudflare —
echo  бесплатно, без карты. Получается адрес вида
echo  https://mir.ВАШЕ-ИМЯ.workers.dev, который работает всегда:
echo  компьютер можно выключить, туннель больше не нужен.
echo.
echo  Что потребуется один раз:
echo    1. Аккаунт Cloudflare (почта и пароль, бесплатно).
echo    2. Разрешить вход — откроется окно браузера.
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist node_modules goto :menu

echo Первый запуск: устанавливаю зависимости, это пару минут...
call npm install
if errorlevel 1 goto :fail

:menu
echo Что делаем?
echo.
echo   [1] Выложить игру в интернет (сборка и публикация).
echo   [2] Войти в Cloudflare (нужно один раз, перед первой публикацией).
echo   [3] Проверить уже выложенный хаб (полный разбор по адресу).
echo   [4] Посмотреть живой журнал хостинга.
echo   [5] Выход.
echo.
choice /c 12345 /n /m "Нажмите 1-5: "
if errorlevel 5 goto :exit_app
if errorlevel 4 goto :logs
if errorlevel 3 goto :check
if errorlevel 2 goto :login
if errorlevel 1 goto :deploy

:login
echo.
echo ------------------------------------------------------------
echo  Сейчас откроется браузер. Войдите в Cloudflare (или создайте
echo  бесплатный аккаунт) и нажмите «Allow» — это разрешение
echo  выкладывать игру с этого компьютера.
echo ------------------------------------------------------------
echo.
call npm run host:login
echo.
pause
goto :start_menu

:deploy
echo.
echo ------------------------------------------------------------
echo  Собираю игру и выкладываю её в интернет...
echo  Если попросит войти — выберите пункт [2] в меню.
echo ------------------------------------------------------------
echo.
call npm run host
if errorlevel 1 goto :faildeploy
echo.
echo ============================================================
echo   Готово. Ссылка напечатана выше — строка со словом
echo   workers.dev. Отправьте её друзьям: по ней открывается
echo   игра, там же общие аккаунты и друзья.
echo.
echo   Телефон: откройте ссылку в Chrome или Safari и выберите
echo   «Установить приложение» — игра встанет как обычное.
echo ============================================================
echo.
pause
goto :start_menu

:check
echo.
set "HUBURL="
set /p HUBURL=Вставьте адрес хаба (https://...): 
if "%HUBURL%"=="" goto :start_menu
echo.
call npm run test:hub -- "%HUBURL%"
echo.
pause
goto :start_menu

:logs
echo.
echo ------------------------------------------------------------
echo  Живой журнал хостинга: видно каждый запрос к игре и хабу.
echo  Ctrl+C — выйти из журнала.
echo ------------------------------------------------------------
echo.
call npm run host:logs
echo.
pause
goto :start_menu

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
echo   ОШИБКА: не удалось установить зависимости.
echo   Проверьте интернет и запустите файл ещё раз.
echo.
pause
exit /b 1

:faildeploy
echo.
echo   Выложить не получилось. Самые частые причины:
echo     - не выполнен вход: пункт [2] в меню;
echo     - нет интернета или его режет VPN/прокси — выключите и повторите;
echo     - имя уже занято: откройте wrangler.toml и поменяйте строку name.
echo.
echo   Полный текст ошибки — выше в этом окне.
echo.
pause
goto :start_menu
