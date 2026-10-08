/* Полная проверка собранного APK — по тем же правилам, по которым его
   принимает или отвергает Android.

   Каждая проверка пишет в журнал не только «сошлось / не сошлось», но и
   чем обернётся несовпадение на телефоне: отказом установщика с конкретным
   кодом (INSTALL_PARSE_FAILED_…), падением активности при запуске или
   чёрным экраном. Именно этого не хватало раньше: сборка говорила
   «✓ готово», телефон говорил «приложение не установлено», и связать одно
   с другим было нечем.

   Используется дважды: сразу после сборки (`build-apk.mjs`) и отдельно по
   требованию (`apk-doctor.mjs`) — для любого .apk, хоть чужого.
*/

import crypto from 'node:crypto';
import { readZip, decodeAxml, parseArsc, parseDex, checkV1, checkV2, ANDROID_THEMES } from './apk-read.mjs';
import { human, sha256 } from './log.mjs';

/**
 * Разбирает и проверяет APK.
 * @param {Buffer} buf содержимое .apk
 * @param {object} log журнал из lib/log.mjs
 * @returns {object} собранные сведения (package, версия, подпись и т. д.)
 */
export function auditApk(buf, log, { prefix = '' } = {}) {
  const info = { size: buf.length, sha256: sha256(buf) };
  /* prefix нужен, когда разбор идёт внутри нумерованной сборки: «8. ZIP…». */
  const section = (title) => log.section(prefix ? `${prefix} ${title}` : title);

  /* ---------------------------------------------------------------
     1. Контейнер ZIP
     --------------------------------------------------------------- */
  section('ZIP-контейнер');
  log.detail('Размер файла', human(buf.length));
  log.detail('SHA-256', info.sha256);

  log.check(
    buf.readUInt32LE(0) === 0x04034b50,
    'файл начинается с сигнатуры ZIP (PK\\x03\\x04)',
    { fail: 'это не APK: Android ответит «Проблема при синтаксическом анализе пакета»' },
  );

  const zip = readZip(buf);
  info.entries = zip.entries.length;
  log.detail('Записей в архиве', zip.entries.length);
  log.table(
    zip.entries.map((e) => ({
      'файл': e.name,
      'метод': e.method === 0 ? 'STORED' : 'DEFLATE',
      'в архиве': e.compSize,
      'размер': e.size,
      'смещение данных': e.dataOffset,
      'выравнивание 4': e.aligned ? 'да' : 'НЕТ',
      'CRC': e.crcOk ? 'ок' : 'БИТЫЙ',
    })),
  );

  for (const problem of zip.problems) {
    log.fail(`ZIP: ${problem}`, 'установщик Android читает архив тем же кодом и откажет');
  }
  log.check(zip.problems.length === 0, 'структура ZIP согласована (локальные заголовки = каталог, CRC сходятся)', {
    fail: 'повреждённый архив: «Проблема при синтаксическом анализе пакета»',
  });
  log.check(zip.commentLen === 0, 'в конце архива нет комментария', {
    fail: 'комментарий после EOCD ломает поиск блока подписи v2',
  });

  const need = ['AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/mir.html'];
  for (const name of need) {
    log.check(zip.byName.has(name), `в архиве есть ${name}`, {
      fail:
        name === 'classes.dex'
          ? 'без кода активность не запустится: ClassNotFoundException'
          : name === 'assets/mir.html'
            ? 'WebView покажет «net::ERR_FILE_NOT_FOUND» — чёрный экран'
            : 'пакет не распознаётся установщиком',
    });
  }

  const arscEntry = zip.byName.get('resources.arsc');
  if (arscEntry) {
    log.check(arscEntry.method === 0, 'resources.arsc хранится без сжатия', {
      fail: 'Android 11+ отвергает пакет: INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED',
      detail: `метод ${arscEntry.method}`,
    });
    log.check(arscEntry.aligned, 'resources.arsc выровнен на 4 байта', {
      fail: 'Android 11+ отвергает пакет: INSTALL_PARSE_FAILED_RESOURCES_ARSC_NOT_ALIGNED',
      detail: `данные начинаются с байта ${arscEntry.dataOffset}`,
    });
  }

  /* ---------------------------------------------------------------
     2. AndroidManifest.xml
     --------------------------------------------------------------- */
  section('AndroidManifest.xml');
  let manifest = null;
  try {
    manifest = decodeAxml(zip.byName.get('AndroidManifest.xml').data);
    log.ok('манифест разобран обратно в XML (так его читает PackageParser)');
    log.raw(manifest.xml);
  } catch (err) {
    log.fail(`манифест не разбирается: ${err.message}`, 'установщик ответит «Проблема при анализе пакета»');
  }

  if (manifest) {
    const root = manifest.root;
    const attr = (node, name) => manifest.attr(node, name);
    const pkg = attr(root, 'package')?.raw ?? null;
    const usesSdk = manifest.find(root, 'uses-sdk');
    const application = manifest.find(root, 'application');
    const activity = manifest.find(root, 'activity');
    const action = manifest.find(root, 'action');
    const category = manifest.find(root, 'category');

    info.package = pkg;
    info.versionName = attr(root, 'versionName')?.raw ?? null;
    info.versionCode = attr(root, 'versionCode')?.data ?? null;
    info.minSdk = usesSdk ? attr(usesSdk, 'minSdkVersion')?.data ?? null : null;
    info.targetSdk = usesSdk ? attr(usesSdk, 'targetSdkVersion')?.data ?? null : null;
    info.activity = activity ? attr(activity, 'name')?.raw ?? null : null;
    info.label = application ? attr(application, 'label')?.raw ?? null : null;

    log.detail('Пакет', info.package);
    log.detail('Версия', `${info.versionName} (код ${info.versionCode})`);
    log.detail('SDK', `min ${info.minSdk}, target ${info.targetSdk}`);
    log.detail('Активность', info.activity);

    log.check(Boolean(pkg) && /^[a-z][\w]*(\.[a-z][\w]*)+$/i.test(pkg ?? ''), 'имя пакета корректно', {
      fail: 'установщик откажет: INSTALL_PARSE_FAILED_MANIFEST_MALFORMED',
      detail: String(pkg),
    });
    log.check(Number(info.versionCode) > 0, 'versionCode больше нуля', {
      fail: 'без versionCode обновления и установка ведут себя непредсказуемо',
    });
    log.check(Boolean(usesSdk), 'в манифесте есть <uses-sdk>', {
      fail: 'без него Android 14 считает targetSdk равным 1 и отказывается ставить пакет',
    });
    log.check(Number(info.targetSdk) >= 23, 'targetSdkVersion ≥ 23', {
      fail: 'Android 14+ не ставит пакеты с targetSdk < 23 (INSTALL_FAILED_DEPRECATED_SDK_VERSION)',
      detail: `targetSdk ${info.targetSdk}`,
    });
    log.check(Number(info.targetSdk) >= 24, 'targetSdkVersion ≥ 24', {
      fail: 'Android 15+ не ставит пакеты с targetSdk < 24',
      detail: `targetSdk ${info.targetSdk}`,
    });
    log.check(Number(info.minSdk) >= 1 && Number(info.minSdk) <= Number(info.targetSdk), 'minSdk не больше targetSdk', {
      fail: 'противоречивые границы версий — пакет не пройдёт разбор',
    });
    log.check(Boolean(application), 'есть элемент <application>', { fail: 'нечего запускать' });
    log.check(Boolean(activity), 'есть хотя бы одна <activity>', {
      fail: 'приложение установится, но значка в меню не будет и запускать нечего',
    });
    log.check(
      action?.attrs?.some((a) => a.raw === 'android.intent.action.MAIN') === true,
      'у активности есть action MAIN',
      { fail: 'значок не появится в списке приложений' },
    );
    log.check(
      category?.attrs?.some((a) => a.raw === 'android.intent.category.LAUNCHER') === true,
      'у активности есть category LAUNCHER',
      { fail: 'значок не появится в списке приложений' },
    );
    if (activity) {
      const exported = attr(activity, 'exported');
      log.check(exported !== undefined && exported.data === 0xffffffff, 'у активности явно указан exported="true"', {
        fail: 'Android 12+ отказывается устанавливать пакет: активность с intent-filter обязана объявить exported',
      });
      const theme = attr(activity, 'theme');
      if (theme) {
        const id = theme.data >>> 0;
        const known = (id & 0xff000000) === 0x7f000000 || Boolean(ANDROID_THEMES[id]);
        log.check(known, `тема активности известна (${ANDROID_THEMES[id] ?? `0x${id.toString(16)}`})`, {
          fail: 'ссылка на несуществующий стиль: активность падает при запуске с «Resource ID #0x… not found»',
        });
      }
    }
  }

  /* ---------------------------------------------------------------
     3. resources.arsc
     --------------------------------------------------------------- */
  section('Таблица ресурсов resources.arsc');
  let arsc = null;
  try {
    arsc = parseArsc(zip.byName.get('resources.arsc').data);
    log.ok('таблица ресурсов разобрана');
    for (const pkg of arsc.packages) {
      log.detail('Пакет ресурсов', `0x${pkg.id.toString(16)} «${pkg.name}», типов ${pkg.types.length}`);
    }
    log.table(
      arsc.entries.map((e) => ({
        'id': `0x${e.id.toString(16).padStart(8, '0')}`,
        'тип': e.type,
        'имя': e.key,
        'значение': String(e.value),
      })),
    );
    log.check(
      arsc.packages.length === 1 && arsc.packages[0].id === 0x7f,
      'ровно один пакет ресурсов с id 0x7f',
      { fail: 'нестандартный id пакета ломает ссылки @mipmap/… из манифеста' },
    );
    if (info.package) {
      log.check(arsc.packages[0]?.name === info.package, 'имя пакета в таблице ресурсов совпадает с манифестом', {
        fail: 'ресурсы не найдутся: иконка не отобразится, тема может не примениться',
        detail: `${arsc.packages[0]?.name} против ${info.package}`,
      });
    }
  } catch (err) {
    log.fail(`resources.arsc не разбирается: ${err.message}`, 'установщик не сможет прочитать ресурсы пакета');
  }

  if (manifest && arsc) {
    const iconAttr = manifest.attr(manifest.find(manifest.root, 'application'), 'icon');
    if (iconAttr) {
      const res = arsc.resolve(iconAttr.data);
      log.check(Boolean(res), `иконка 0x${(iconAttr.data >>> 0).toString(16)} есть в таблице ресурсов`, {
        fail: 'значок приложения не нарисуется, а строгие прошивки отвергнут пакет',
      });
      if (res) {
        log.detail('Иконка', `${res.type}/${res.key} → ${res.value}`);
        log.check(zip.byName.has(String(res.value)), `файл иконки ${res.value} лежит в архиве`, {
          fail: 'ссылка на несуществующий файл: пустой значок в меню приложений',
        });
      }
    }
  }

  /* ---------------------------------------------------------------
     4. classes.dex
     --------------------------------------------------------------- */
  section('Байт-код classes.dex');
  let dex = null;
  try {
    dex = parseDex(zip.byName.get('classes.dex').data);
    log.ok(`DEX разобран: ${dex.header.magic}, строк ${dex.strings.length}, типов ${dex.types.length}, методов ${dex.methods.length}`);
    log.detail('Размер', human(zip.byName.get('classes.dex').data.length));
    log.detail('Смещения', JSON.stringify(dex.header));
    for (const problem of dex.problems) {
      log.fail(`DEX: ${problem}`, 'ART проверяет это при установке: пакет будет отвергнут или упадёт при запуске');
    }
    log.check(dex.problems.length === 0, 'заголовок DEX, контрольная сумма и SHA-1 сходятся', {
      fail: 'повреждённый classes.dex: «Приложение остановлено» сразу после запуска',
    });

    const sortedStrings = [...dex.strings].every(
      (s, i, arr) => i === 0 || arr[i - 1] < s,
    );
    log.check(sortedStrings, 'string_ids отсортированы', {
      fail: 'верификатор ART отвергает DEX с неотсортированным пулом строк',
    });

    const mapOk = dex.mapItems.every((m, i, arr) => i === 0 || arr[i - 1].offset <= m.offset);
    log.check(mapOk, 'map_list упорядочен по смещению', { fail: 'DEX не пройдёт верификацию ART' });

    log.raw('\nКлассы и методы:');
    for (const cls of dex.classes) {
      log.raw(`  ${cls.name} extends ${cls.superclass} (исходник ${cls.sourceFile})`);
      for (const m of cls.methods) {
        log.raw(`    ${m.kind} ${m.name}${m.proto ? `(${m.proto.params.join('')})${m.proto.ret}` : ''}` +
          (m.code ? ` — регистров ${m.code.registers}, входных ${m.code.ins}, исходящих ${m.code.outs}, инструкций ${m.code.insnsSize}, обработчиков ${m.code.tries}` : ' — без кода'));
        if (m.code) for (const line of m.code.lines) log.raw(line);
      }
    }

    const main = dex.classes.find((c) => c.name === `L${String(info.activity ?? '').replace(/\./g, '/')};`);
    log.check(Boolean(main), `класс активности ${info.activity} есть в classes.dex`, {
      fail: 'при запуске: java.lang.ClassNotFoundException → «Приложение остановлено»',
    });
    if (main) {
      log.check(main.superclass === 'Landroid/app/Activity;', 'класс наследует android.app.Activity', {
        fail: 'система не сможет запустить компонент: ClassCastException',
        detail: main.superclass,
      });
      const onCreate = main.methods.find((m) => m.name === 'onCreate');
      log.check(Boolean(onCreate), 'у активности есть onCreate(Bundle)', {
        fail: 'активность откроется пустым белым экраном',
      });
      log.check(Boolean(main.methods.find((m) => m.name === '<init>')), 'у активности есть конструктор по умолчанию', {
        fail: 'InstantiationException при запуске активности',
      });
      if (onCreate?.code) {
        log.check(onCreate.code.registers >= onCreate.code.ins, 'регистров не меньше, чем входных параметров', {
          fail: 'верификатор ART отвергнет метод',
        });
        log.check(onCreate.code.outs <= onCreate.code.registers, 'исходящих аргументов не больше, чем регистров', {
          fail: 'верификатор ART отвергнет метод',
        });
        log.check(onCreate.code.tries > 0, 'onCreate защищён обработчиком ошибок (стек покажется на экране телефона)', {
          fail: 'при падении пользователь увидит только «Приложение остановлено» без причины',
        });
      }

      /* Выбор файла в WebView: без WebChromeClient с onShowFileChooser
         Android молча игнорирует <input type="file"> — кнопка «Добавить
         аватарку» в APK не открывает ничего и ничего не говорит. */
      const code = (method) => method?.code?.lines?.join('\n') ?? '';
      const chrome = dex.classes.find((c) => c.superclass === 'Landroid/webkit/WebChromeClient;');
      log.check(Boolean(chrome), 'есть класс-наследник WebChromeClient', {
        fail: 'WebView не откроет системный выбор файла: загрузка аватарки в APK не работает',
      });
      const onShowFileChooser = chrome?.methods.find((m) => m.name === 'onShowFileChooser');
      log.check(Boolean(onShowFileChooser), 'в нём реализован onShowFileChooser(WebView, ValueCallback, FileChooserParams)', {
        fail: 'клик по «Добавить аватарку» не доходит до Android — выбора файла не будет',
      });
      log.check(
        Boolean(onShowFileChooser) && onShowFileChooser.access === 0x0001,
        'onShowFileChooser публичный (как в WebChromeClient)',
        { fail: 'ART отвергает переопределение с более строгим доступом: приложение не запустится' },
      );
      log.check(
        code(onShowFileChooser).includes('startActivityForResult'),
        'onShowFileChooser открывает системный выбор файла (startActivityForResult)',
        { fail: 'обещание WebView останется без ответа — страница будет ждать файл вечно' },
      );
      log.check(
        code(onCreate).includes('setWebChromeClient'),
        'onCreate ставит этот клиент в WebView (setWebChromeClient)',
        { fail: 'клиент есть, но WebView о нём не знает: выбор файла по-прежнему не откроется' },
      );
      const onResult = main.methods.find((m) => m.name === 'onActivityResult');
      log.check(Boolean(onResult), 'у активности есть onActivityResult(int, int, Intent)', {
        fail: 'выбранный файл некому передать обратно в WebView',
      });
      log.check(
        code(onResult).includes('onReceiveValue'),
        'onActivityResult отдаёт результат обещанию WebView (onReceiveValue)',
        { fail: 'файл выбран, но страница его не получает — аватарка не появляется' },
      );
      log.check(
        code(onResult).includes('parseResult'),
        'результат разбирается штатно (FileChooserParams.parseResult)',
        { fail: 'Uri из результата выбора не превратится в файл для WebView',
        },
      );
    }

    /* Ссылка на сам файл игры: если её нет в архиве — чёрный экран. */
    const assetUrl = dex.strings.find((s) => s.startsWith('file:///android_asset/'));
    if (assetUrl) {
      const assetPath = `assets/${assetUrl.replace('file:///android_asset/', '')}`;
      info.startUrl = assetUrl;
      log.check(zip.byName.has(assetPath), `WebView грузит ${assetUrl}, и этот файл есть в архиве (${assetPath})`, {
        fail: 'WebView покажет ERR_FILE_NOT_FOUND — чёрный экран вместо меню',
      });
    } else {
      log.warn('в DEX нет адреса file:///android_asset/… — непонятно, что именно грузит WebView');
    }
    const tag = dex.strings.includes('MIR');
    log.check(tag, 'в коде есть тег журнала MIR (adb logcat -s MIR)', {
      fail: 'на телефоне нечего будет искать в системном журнале',
    });
  } catch (err) {
    log.fail(`classes.dex не разбирается: ${err.message}`, 'установка завершится ошибкой разбора пакета');
  }

  /* ---------------------------------------------------------------
     5. Сама игра внутри APK
     --------------------------------------------------------------- */
  section('Игра внутри APK (assets/mir.html)');
  const htmlEntry = zip.byName.get('assets/mir.html');
  if (htmlEntry) {
    const html = htmlEntry.data.toString('utf8');
    info.htmlSize = htmlEntry.data.length;
    log.detail('Размер', human(htmlEntry.data.length));
    log.detail('SHA-256', sha256(htmlEntry.data));
    log.check(html.length > 10000, 'файл игры не пустой', { fail: 'в WebView откроется пустая страница' });
    log.check(/<script[\s>]/i.test(html), 'в HTML есть встроенный скрипт игры', {
      fail: 'меню не отрисуется: это просто разметка без кода',
    });
    log.check(!/<script[^>]*type="module"/i.test(html), 'скрипт не модульный', {
      fail: 'по file:// модульные скрипты запрещены — чёрный экран в WebView',
    });
    log.check(!html.includes('/assets/'), 'нет ссылок на внешние файлы сборки', {
      fail: 'внутри APK таких файлов нет: часть игры не загрузится',
    });
    log.check(html.includes('MIRDiag'), 'встроен экранный журнал ошибок', {
      fail: 'ошибку внутри WebView не увидеть без компьютера',
    });
    const external = [...new Set((html.match(/https?:\/\/[^"'\s)]+/g) ?? []).map((u) => u.split('/')[2]))];
    if (external.length) {
      log.warn(
        `игра ссылается на внешние адреса: ${external.join(', ')}`,
        'без интернета они не загрузятся; на вид игры это влиять не должно, но шрифты будут системными',
      );
    }
  }

  /* ---------------------------------------------------------------
     6. Подписи
     --------------------------------------------------------------- */
  section('Подписи пакета');
  const v1 = checkV1(zip);
  log.check(v1.present, 'есть подпись v1 (META-INF/MANIFEST.MF)', {
    fail: 'Android 6 и старше не поставят пакет без v1',
  });
  for (const problem of v1.problems) log.fail(`подпись v1: ${problem}`, 'установщик ответит «Ошибка сертификата»');
  log.check(v1.problems.length === 0, 'дайджесты всех файлов в MANIFEST.MF совпадают с содержимым', {
    fail: 'INSTALL_PARSE_FAILED_NO_CERTIFICATES или «Ошибка проверки подписи»',
  });
  log.check(v1.rollbackProtected === true, 'в CERT.SF есть X-Android-APK-Signed: 2', {
    fail: 'без этой строки возможен откат проверки на слабую схему v1',
  });

  const v2 = checkV2(buf, zip);
  info.signature = v2.info;
  log.check(v2.present, 'есть APK Signing Block (подпись v2)', {
    fail: 'Android 11+ не ставит пакеты с targetSdk ≥ 30 без подписи v2: INSTALL_PARSE_FAILED_NO_CERTIFICATES',
  });
  for (const problem of v2.problems) log.fail(`подпись v2: ${problem}`, 'установщик откажет на этапе проверки подписи');
  if (v2.present) {
    log.detail('Алгоритм', v2.info.algorithm);
    log.detail('Ключ', `${v2.info.keyType} ${v2.info.keyBits ?? '?'} бит`);
    log.detail('Сертификат', v2.info.subject);
    log.detail('Действителен', `${v2.info.validFrom} — ${v2.info.validTo}`);
    log.detail('Отпечаток сертификата (SHA-256)', v2.info.certSha256);
    log.check(v2.signatureValid === true, 'подпись v2 математически верна', {
      fail: 'пакет отвергнут: подпись не сходится с открытым ключом',
    });
    log.check(v2.digestValid === true, 'дайджест содержимого совпадает с подписанным', {
      fail: 'файл изменён после подписи (например, антивирусом или мессенджером) — установка невозможна',
    });
    log.check(v2.info.keyBits === undefined || v2.info.keyBits >= 2048, 'длина ключа не меньше 2048 бит', {
      fail: 'короткие ключи отвергаются современными Android',
    });
    if (v2.info.validTo) {
      const until = Date.parse(v2.info.validTo);
      log.check(Number.isNaN(until) || until > Date.now(), 'сертификат не просрочен', {
        fail: 'просроченный сертификат = «Приложение не установлено»',
        detail: v2.info.validTo,
      });
    }
    if (!v2.info.hasV3) {
      log.info('подписи v3 нет — это нормально: она нужна только для смены ключа без переустановки');
    }
  }

  /* ---------------------------------------------------------------
     7. Итог
     --------------------------------------------------------------- */
  info.problems = log.problems.length;
  info.warnings = log.warnings.length;
  return info;
}

/** Короткая справка, как снять логи с самого телефона. */
export const PHONE_LOG_HELP = [
  'Как получить логи с телефона, если игра не запускается:',
  '',
  '  1. Если на экране появился красный текст с ошибкой — это и есть лог.',
  '     Нажмите «Скопировать» или сфотографируйте экран.',
  '  2. Если телефон пишет «Приложение не установлено» — причина в пакете,',
  '     её показывает отчёт выше (подпись, манифест, выравнивание).',
  '  3. Если экран просто чёрный — подождите 6 секунд: встроенная',
  '     диагностика сама покажет отчёт о том, что не выполнилось.',
  '  4. Полный системный журнал (нужен компьютер и USB-отладка):',
  '       adb logcat -s MIR:V AndroidRuntime:E PackageManager:I',
  '     Строки «onCreate: start» и «WebView created» означают, что',
  '     приложение запустилось; их отсутствие — что система не дошла',
  '     даже до старта активности.',
].join('\n');

/** Отпечаток сертификата в привычном виде AA:BB:CC… */
export const fingerprint = (hex) => (hex ?? '').replace(/(.{2})(?=.)/g, '$1:').toUpperCase();
