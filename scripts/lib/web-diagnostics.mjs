/* Экранный журнал ошибок для версии игры внутри APK.

   Зачем. Если WebView запустился, но игра не нарисовалась, пользователь
   видит просто чёрный экран: никакой консоли на телефоне нет. Поэтому в
   HTML, который кладётся в APK, первым же скриптом встраивается крошечный
   сборщик ошибок:

     • ловит window.onerror, отказы промисов, console.error/warn;
     • через 6 секунд после загрузки проверяет, появилось ли меню, и если
       нет — сам показывает отчёт;
     • показывает красную панель с текстом ошибки, снимком окружения
       (версия WebView, протокол, доступность localStorage, crypto.subtle,
       WebRTC) и кнопкой «Скопировать».

   Самое важное: скрипт написан на ES5 без стрелочных функций, шаблонных
   строк и прочего — он обязан выполниться даже в старом WebView, который
   не смог разобрать основной бандл игры. Именно этот случай («телефон
   старый, движок не понимает современный JS») иначе выглядит как чёрный
   экран без единого намёка на причину.
*/

const SCRIPT = String.raw`
<script>
/* MIR: экранный журнал ошибок. Встраивается сборщиком APK (scripts/lib/web-diagnostics.mjs). */
(function () {
  var VERSION = '__VERSION__';
  var BUILT = '__BUILT__';
  var entries = [];
  var panel = null;
  var badge = null;

  function now() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function add(kind, text) {
    entries.push({ time: now(), kind: kind, text: String(text) });
    if (entries.length > 200) entries.shift();
    if (kind === 'ОШИБКА') show();
    else if (badge) badge.style.display = 'block';
    try { if (window.console && console.log) console.log('[MIR ' + kind + '] ' + text); } catch (e) {}
  }

  function env() {
    var lines = [];
    lines.push('MIR ' + VERSION + ', сборка ' + BUILT);
    lines.push('адрес: ' + location.href);
    lines.push('браузер: ' + navigator.userAgent);
    lines.push('язык: ' + navigator.language + ', экран: ' + screen.width + 'x' + screen.height +
      ', окно: ' + window.innerWidth + 'x' + window.innerHeight + ', DPR: ' + (window.devicePixelRatio || 1));
    lines.push('онлайн: ' + navigator.onLine);
    var checks = [
      ['localStorage', function () { localStorage.setItem('mir-diag', '1'); localStorage.removeItem('mir-diag'); return true; }],
      ['crypto.subtle', function () { return !!(window.crypto && window.crypto.subtle); }],
      ['crypto.getRandomValues', function () { return !!(window.crypto && window.crypto.getRandomValues); }],
      ['TextEncoder', function () { return typeof TextEncoder !== 'undefined'; }],
      ['fetch', function () { return typeof fetch !== 'undefined'; }],
      ['Promise', function () { return typeof Promise !== 'undefined'; }],
      ['RTCPeerConnection', function () { return typeof RTCPeerConnection !== 'undefined'; }],
      ['CompressionStream', function () { return typeof CompressionStream !== 'undefined'; }],
      ['serviceWorker', function () { return 'serviceWorker' in navigator; }],
      ['isSecureContext', function () { return window.isSecureContext === true; }]
    ];
    for (var i = 0; i < checks.length; i++) {
      var mark;
      try { mark = checks[i][1]() ? 'есть' : 'НЕТ'; } catch (e) { mark = 'ЗАПРЕЩЕНО (' + e.message + ')'; }
      lines.push('  ' + checks[i][0] + ': ' + mark);
    }
    return lines.join('\n');
  }

  function report() {
    var out = ['=== MIR: отчёт об ошибке ===', env(), '', '--- события (' + entries.length + ') ---'];
    for (var i = 0; i < entries.length; i++) {
      out.push(entries[i].time + '  [' + entries[i].kind + '] ' + entries[i].text);
    }
    if (!entries.length) out.push('(ошибок не записано)');
    return out.join('\n');
  }

  function show() {
    if (!document.body) { setTimeout(show, 100); return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.setAttribute('style', 'position:fixed;inset:0;left:0;top:0;right:0;bottom:0;z-index:2147483647;' +
        'background:#0b0d10;color:#ffd7d7;font:12px/1.45 monospace;padding:12px;overflow:auto;' +
        '-webkit-user-select:text;user-select:text;white-space:pre-wrap;word-break:break-word');
      var bar = document.createElement('div');
      bar.setAttribute('style', 'display:flex;gap:8px;margin-bottom:10px;position:sticky;top:0;background:#0b0d10;padding-bottom:8px');
      bar.appendChild(button('Скопировать', function () { copy(report()); }));
      bar.appendChild(button('Закрыть', function () { panel.style.display = 'none'; if (badge) badge.style.display = 'block'; }));
      var text = document.createElement('div');
      text.id = 'mir-diag-text';
      panel.appendChild(bar);
      panel.appendChild(text);
      document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    var box = document.getElementById('mir-diag-text');
    if (box) box.textContent = report();
  }

  function button(label, onClick) {
    var b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', 'background:#1b1f26;color:#fff;border:1px solid #444;padding:8px 12px;font:12px monospace');
    b.onclick = onClick;
    return b;
  }

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); return; }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  window.onerror = function (message, source, line, column, error) {
    var where = (source || '?') + ':' + line + ':' + column;
    add('ОШИБКА', message + '  (' + where + ')' + (error && error.stack ? '\n' + error.stack : ''));
    return false;
  };

  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window && e.target.src !== undefined) {
      add('ОШИБКА', 'не загрузился ресурс: ' + (e.target.src || e.target.href));
    }
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    add('ОШИБКА', 'необработанный отказ промиса: ' + (r && r.stack ? r.stack : r));
  });

  if (window.console) {
    var realError = console.error;
    console.error = function () {
      add('ОШИБКА', Array.prototype.join.call(arguments, ' '));
      if (realError) try { realError.apply(console, arguments); } catch (e) {}
    };
    var realWarn = console.warn;
    console.warn = function () {
      add('внимание', Array.prototype.join.call(arguments, ' '));
      if (realWarn) try { realWarn.apply(console, arguments); } catch (e) {}
    };
  }

  /* Сторож: если через 6 секунд меню так и не отрисовалось, показываем
     отчёт сами — молчаливый чёрный экран хуже некрасивой простыни текста. */
  setTimeout(function () {
    var ready = document.querySelector('header') || document.querySelector('main') ||
      (document.body && document.body.children.length > 2);
    if (!ready) {
      add('ОШИБКА', 'Игра не отрисовалась за 6 секунд после запуска. ' +
        'Скорее всего встроенный браузер телефона (WebView) не смог выполнить код игры — ' +
        'обновите «Android System WebView» и Chrome в Google Play.');
    }
  }, 6000);

  /* Маленькая метка в углу: есть записи — можно открыть отчёт. */
  window.addEventListener('load', function () {
    if (!document.body) return;
    badge = document.createElement('button');
    badge.textContent = 'лог';
    badge.setAttribute('style', 'position:fixed;right:6px;bottom:6px;z-index:2147483646;display:none;' +
      'background:rgba(20,22,27,.85);color:#9aa3ad;border:1px solid rgba(255,255,255,.14);' +
      'padding:4px 8px;font:11px monospace');
    badge.onclick = show;
    document.body.appendChild(badge);
    if (entries.length) badge.style.display = 'block';
  });

  window.MIRDiag = { entries: entries, show: show, report: report, env: env, add: add };
  add('старт', 'диагностика подключена');
})();
</script>
`;

/**
 * Вставляет диагностический скрипт первым элементом внутрь <body>.
 * Возвращает новый HTML и сведения для журнала сборки.
 */
export function injectDiagnostics(html, { version = '0.0.0', built = new Date().toISOString() } = {}) {
  const script = SCRIPT.replace('__VERSION__', version).replace('__BUILT__', built);
  const match = html.match(/<body[^>]*>/i);
  if (!match) return { html, inserted: false, reason: 'в HTML нет тега <body>' };

  const at = match.index + match[0].length;
  const result = html.slice(0, at) + script + html.slice(at);
  return { html: result, inserted: true, bytes: script.length, at };
}
