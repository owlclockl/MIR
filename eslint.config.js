/* Проверка кода: правила, которые ловят поломку до сборки.

   Зачем линтер в проекте, где всё и так проверяется. Проверки проекта
   смотрят на поведение: они поднимают собранный `mir.html` в jsdom и жмут
   кнопки. Это дорого и достаёт только то, до чего дошёл сценарий. Свободная
   переменная — вызов несуществующего имени — до сценария не доживает и
   выглядит как «где-то на этом экране всё падает»: сборщик такие имена не
   проверяет (для него неизвестное имя — просто глобальная переменная), а
   Node их видит только в момент вызова. Ровно это случилось при разделении
   панели админа на модуль: `p2p` остался в меню, панель его звала, и узналось
   об этом лишь из живой проверки интерфейса. `no-undef` ловит такое за
   секунду и указывает строку.

   Что включено и почему не больше. Здесь только правила, которые не спорят
   с оформлением: неизвестные имена, недостижимый код, дубли ключей и
   аргументов, пустые блоки. Форматирование (отступы, кавычки, длина строк)
   не проверяется намеренно: у проекта свой стиль, и он уже выдержан руками —
   линтер, который его переписывает, мешает больше, чем помогает. Порядок
   перечисления не важен: отчёт читают по файлам.

   Где какие имена видны. Игра (`src/`) живёт в браузере, `src/sw.js` — ещё и
   в service worker; серверные и сборочные файлы — в Node; воркер хостинга —
   в Cloudflare Workers. Наборы имён берутся из пакета `globals`, а не
   выписаны руками: браузерных имён сотни, и список «на память» устареет
   молча. Отдельно объявлены только метки, которые подставляет сборка
   (`__APP_VERSION__`, `__MIR_*`): до подстановки это действительно
   неизвестные имена, и линтер обязан знать, что их вставляет `vite.config.js`. */

import globals from 'globals';

/* Метки сборки: `vite.config.js` (define) и `scripts/lib/vite-mir.mjs`
   (служебный worker). */
const BUILD_GLOBALS = {
  __APP_VERSION__: 'readonly',
  __MIR_CACHE__: 'readonly',
  __MIR_PRECACHE__: 'readonly',
  __MIR_WARM__: 'readonly',
  __MIR_BUILD__: 'readonly',
  __MIR_VERSION__: 'readonly',
};

const SHARED_RULES = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-unreachable': 'error',
  'no-unsafe-negation': 'error',
  'no-sparse-arrays': 'error',
  /* Пустая метка `case`, за которой сразу идёт следующая, — приём проекта:
     у нескольких клавиш или видов рельефа одно тело. ESLint по умолчанию
     считает такую метку провалом; здесь это осознанный выбор, а настоящий
     провал со строками кода правило по-прежнему поймает. */
  'no-fallthrough': ['error', { allowEmptyCase: true }],
  'no-cond-assign': 'error',
  'no-self-compare': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  /* Пустой `catch {}` — намеренный приём проекта: сбой фоновой операции
     (звук, буфер, сердцебиение) не должен ломать экран, а объяснение
     стоит рядом комментарием. */
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-private-class-members': 'error',
};

export default [
  {
    ignores: [
      'dist/**',
      'dist-app/**',
      'node_modules/**',
      'logs/**',
      'data/**',
      'public/**',
      'vendor/**',
      'mir.html',
    ],
  },

  /* Игра: браузер и service worker. */
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, ...BUILD_GLOBALS },
    },
    rules: SHARED_RULES,
  },

  /* Сборка, сервер на ПК и проверки: Node. */
  {
    files: ['scripts/**/*.mjs', 'server/**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...BUILD_GLOBALS },
    },
    rules: SHARED_RULES,
  },

  /* Хаб на хостинге: Worker'ы Cloudflare (не Node). */
  {
    files: ['hosting/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      /* `WebSocketPair` — глобальное имя среды Workers: без него не поднять
         сокет лобби. В наборе `worker` его нет, потому что это не браузер. */
      globals: {
        ...globals.worker,
        ...globals.serviceworker,
        WebSocketPair: 'readonly',
        ...BUILD_GLOBALS,
      },
    },
    rules: SHARED_RULES,
  },
];
