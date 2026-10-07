// Сборка Android-приложения (MIR.apk) без Android SDK, Java и интернета.
// Запуск: npm run build:apk
//
// Что внутри APK:
//   AndroidManifest.xml — бинарный AXML (minSdk 21, targetSdk 34);
//   classes.dex         — одна активность: полноэкранный WebView;
//   resources.arsc      — таблица ресурсов с иконкой запуска;
//   assets/mir.html     — сама игра одним файлом.
//
// Почему так, а не «просто zip»: Android отказывается ставить пакет, если
//   • не объявлен targetSdkVersion ≥ 23 (Android 14) / ≥ 24 (Android 15);
//   • пакет подписан только по схеме v1, а targetSdk ≥ 30 (Android 11+);
//   • resources.arsc сжат или не выровнен по 4 байта (Android 11+).
// Поэтому ниже руками собираются корректный DEX, AXML, ARSC, выравнивание
// и две подписи сразу: v1 (JAR) и v2 (APK Signature Scheme v2).
//
// Ключ подписи сохраняется в data/apk-signing-key.json и переиспользуется:
// иначе каждая сборка подписывалась бы новым ключом и обновление поверх уже
// установленной игры падало бы с «Приложение не установлено».
//
// Логи. Каждый запуск пишет подробный протокол в logs/apk-build.log: что
// собиралось, какие получились размеры, смещения и хеши, какие проверки
// прошли и чем именно закончилась неудачная. Предыдущий протокол остаётся
// рядом как apk-build.prev.log. Собранный файл дополнительно разбирается
// обратно (ZIP → манифест → DEX → ARSC → подписи) — в журнал попадает не
// замысел сборщика, а то, что реально лежит в APK.
//
// Если APK не запускается на телефоне, разбор того же файла в любой момент
// повторяет `npm run apk:doctor`, а сама игра внутри APK при падении
// показывает стек ошибки прямо на экране и пишет его в logcat под тегом MIR.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import './lib/root.mjs';
import { buildSingleHtml } from './lib/build.mjs';
import { createLogger, human, sha256 } from './lib/log.mjs';
import { ANDROID_THEMES } from './lib/apk-read.mjs';
import { auditApk } from './lib/apk-audit.mjs';
import { injectDiagnostics } from './lib/web-diagnostics.mjs';

const log = createLogger('apk-build', { title: 'Сборка Android-приложения MIR.apk' });

const PACKAGE = 'com.mir.game';
const LABEL = 'MIR';
/* Тег в системном журнале Android: `adb logcat -s MIR` покажет только нас. */
const LOG_TAG = 'MIR';
const MIN_SDK = 21;
const TARGET_SDK = 34;
const KEY_FILE = join('data', 'apk-signing-key.json');

const pkgJson = JSON.parse(readFileSync('package.json', 'utf8'));
const VERSION_NAME = pkgJson.version ?? '0.0.0';
const VERSION_CODE = VERSION_NAME.split('.')
  .map((n) => Number.parseInt(n, 10) || 0)
  .reduce((acc, n) => acc * 100 + n, 0) || 1;

/* ============================================================
   Мелкие помощники
   ============================================================ */

const u32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
};

const pad4 = (len) => (4 - (len % 4)) % 4;

function uleb128(value) {
  const out = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return Buffer.from(out);
}

/** Знаковый leb128 — нужен в списке обработчиков исключений DEX. */
function sleb128(value) {
  const out = [];
  let v = value | 0;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    const done = (v === 0 && !(byte & 0x40)) || (v === -1 && byte & 0x40);
    out.push(done ? byte : byte | 0x80);
    if (done) break;
  }
  return Buffer.from(out);
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/* ============================================================
   1. classes.dex
   ------------------------------------------------------------
   Генерируем ровно один класс. Он не просто открывает WebView, но и
   рассказывает о себе в системный журнал (logcat, тег MIR), а любую
   ошибку запуска показывает прямо на экране телефона — иначе Android
   покажет «Приложение остановлено» и настоящая причина останется
   только в logcat, до которого без компьютера не добраться.

     package com.mir.game;
     public class MainActivity extends android.app.Activity {
       public MainActivity() { super(); }
       protected void onCreate(Bundle b) {
         Log.i("MIR", "onCreate: старт, версия и код сборки");
         try {
           super.onCreate(b);
           WebView w = new WebView(this);
           WebSettings s = w.getSettings();
           s.setJavaScriptEnabled(true);
           s.setDomStorageEnabled(true);
           s.setAllowFileAccess(true);
           w.setWebViewClient(new WebViewClient());
           setContentView(w);
           w.loadUrl("file:///android_asset/mir.html");
           Log.i("MIR", "onCreate: WebView создан, загружаю mir.html");
         } catch (Throwable t) {
           String trace = Log.getStackTraceString(t);
           Log.e("MIR", trace);
           TextView tv = new TextView(this);
           tv.setTextIsSelectable(true);
           tv.setText("MIR не запустился. Покажите этот текст разработчику:\n\n" + trace);
           setContentView(tv);
         }
       }
     }
   ============================================================ */

function buildDex() {
  const CLASS = 'Lcom/mir/game/MainActivity;';
  const SUPER = 'Landroid/app/Activity;';
  const WEBVIEW = 'Landroid/webkit/WebView;';
  const SETTINGS = 'Landroid/webkit/WebSettings;';
  const CLIENT = 'Landroid/webkit/WebViewClient;';
  const LOG = 'Landroid/util/Log;';
  const TEXTVIEW = 'Landroid/widget/TextView;';
  const THROWABLE = 'Ljava/lang/Throwable;';
  const STRING = 'Ljava/lang/String;';
  const CHARSEQ = 'Ljava/lang/CharSequence;';
  const SOURCE_FILE = 'MainActivity.java';
  const START_URL = 'file:///android_asset/mir.html';
  const BOOT_MSG = `onCreate: start, MIR ${VERSION_NAME} (${VERSION_CODE})`;
  const READY_MSG = 'onCreate: WebView created, loading assets/mir.html';
  const CRASH_PREFIX = 'MIR не запустился. Покажите этот экран разработчику:\n\n';

  const ref = (cls, name, params, ret) => ({ cls, name, params, ret });

  const M = {
    superInit: ref(SUPER, '<init>', [], 'V'),
    superOnCreate: ref(SUPER, 'onCreate', ['Landroid/os/Bundle;'], 'V'),
    setContentView: ref(SUPER, 'setContentView', ['Landroid/view/View;'], 'V'),
    wvInit: ref(WEBVIEW, '<init>', ['Landroid/content/Context;'], 'V'),
    wvGetSettings: ref(WEBVIEW, 'getSettings', [], SETTINGS),
    wvSetClient: ref(WEBVIEW, 'setWebViewClient', [CLIENT], 'V'),
    wvLoadUrl: ref(WEBVIEW, 'loadUrl', [STRING], 'V'),
    setJs: ref(SETTINGS, 'setJavaScriptEnabled', ['Z'], 'V'),
    setDom: ref(SETTINGS, 'setDomStorageEnabled', ['Z'], 'V'),
    setFiles: ref(SETTINGS, 'setAllowFileAccess', ['Z'], 'V'),
    clientInit: ref(CLIENT, '<init>', [], 'V'),
    logI: ref(LOG, 'i', [STRING, STRING], 'I'),
    logE: ref(LOG, 'e', [STRING, STRING], 'I'),
    logTrace: ref(LOG, 'getStackTraceString', [THROWABLE], STRING),
    strConcat: ref(STRING, 'concat', [STRING], STRING),
    tvInit: ref(TEXTVIEW, '<init>', ['Landroid/content/Context;'], 'V'),
    tvSetText: ref(TEXTVIEW, 'setText', [CHARSEQ], 'V'),
    tvSelectable: ref(TEXTVIEW, 'setTextIsSelectable', ['Z'], 'V'),
    ownInit: ref(CLASS, '<init>', [], 'V'),
    ownOnCreate: ref(CLASS, 'onCreate', ['Landroid/os/Bundle;'], 'V'),
  };
  const methodRefs = Object.values(M);

  /* --- пул типов ------------------------------------------------ */
  const typeSet = new Set([CLASS, SUPER, 'Ljava/lang/Object;']);
  for (const m of methodRefs) {
    typeSet.add(m.cls);
    typeSet.add(m.ret);
    for (const p of m.params) typeSet.add(p);
  }
  for (const t of [WEBVIEW, CLIENT, TEXTVIEW, THROWABLE, STRING, CHARSEQ, LOG]) typeSet.add(t);
  const types = [...typeSet].sort();
  const typeIdx = new Map(types.map((t, i) => [t, i]));

  /* --- пул строк ------------------------------------------------- */
  const shortyChar = (t) => (t.startsWith('L') || t.startsWith('[') ? 'L' : t);
  const shortyOf = (m) => shortyChar(m.ret) + m.params.map(shortyChar).join('');

  const stringSet = new Set([...types, SOURCE_FILE, START_URL, LOG_TAG, BOOT_MSG, READY_MSG, CRASH_PREFIX]);
  for (const m of methodRefs) {
    stringSet.add(m.name);
    stringSet.add(shortyOf(m));
  }
  const strings = [...stringSet].sort();
  const strIdx = new Map(strings.map((s, i) => [s, i]));

  /* --- прототипы ------------------------------------------------- */
  const protoKey = (m) => `${m.ret}|${m.params.join(',')}`;
  const protoMapRaw = new Map();
  for (const m of methodRefs) {
    if (!protoMapRaw.has(protoKey(m)))
      protoMapRaw.set(protoKey(m), { ret: m.ret, params: m.params, shorty: shortyOf(m) });
  }
  const protos = [...protoMapRaw.values()].sort((a, b) => {
    if (typeIdx.get(a.ret) !== typeIdx.get(b.ret)) return typeIdx.get(a.ret) - typeIdx.get(b.ret);
    const len = Math.min(a.params.length, b.params.length);
    for (let i = 0; i < len; i++) {
      if (typeIdx.get(a.params[i]) !== typeIdx.get(b.params[i]))
        return typeIdx.get(a.params[i]) - typeIdx.get(b.params[i]);
    }
    return a.params.length - b.params.length;
  });
  const protoIdx = new Map(protos.map((p, i) => [`${p.ret}|${p.params.join(',')}`, i]));

  /* --- методы ----------------------------------------------------- */
  const methods = methodRefs
    .map((m) => ({
      ...m,
      classIdx: typeIdx.get(m.cls),
      nameIdx: strIdx.get(m.name),
      protoIdx: protoIdx.get(protoKey(m)),
    }))
    .sort((a, b) => a.classIdx - b.classIdx || a.nameIdx - b.nameIdx || a.protoIdx - b.protoIdx);
  const methodIdx = new Map(
    methods.map((m, i) => [`${m.cls}|${m.name}|${protoKey(m)}`, i]),
  );
  const mi = (m) => methodIdx.get(`${m.cls}|${m.name}|${protoKey(m)}`);

  /* --- байт-код ---------------------------------------------------- */
  const OP = {
    constString: 0x1a,
    const4: 0x12,
    newInstance: 0x22,
    moveResultObject: 0x0c,
    moveException: 0x0d,
    goto: 0x28,
    returnVoid: 0x0e,
    invokeVirtual: 0x6e,
    invokeSuper: 0x6f,
    invokeDirect: 0x70,
    invokeStatic: 0x71,
  };

  const invoke = (op, method, regs) => {
    const a = regs.length;
    const g = a === 5 ? regs[4] : 0;
    return [
      (a << 12) | (g << 8) | op,
      mi(method),
      ((regs[3] ?? 0) << 12) | ((regs[2] ?? 0) << 8) | ((regs[1] ?? 0) << 4) | (regs[0] ?? 0),
    ];
  };

  // MainActivity(): registers=1 (p0 = v0), super()
  const initCode = [...invoke(OP.invokeDirect, M.superInit, [0]), OP.returnVoid];

  // onCreate(Bundle): registers=7, ins=2 → p0 = v5 (this), p1 = v6 (bundle)
  const THIS = 5;
  const BUNDLE = 6;

  /* Перед try: отметка в logcat, что активность вообще стартовала.
     Если в журнале телефона нет этой строки — Android не дошёл даже до
     запуска активности (не установилось, не распознался манифест). */
  const prologue = [
    (0 << 8) | OP.constString, strIdx.get(LOG_TAG),            // const-string v0, "MIR"
    (1 << 8) | OP.constString, strIdx.get(BOOT_MSG),           // const-string v1, "onCreate: start…"
    ...invoke(OP.invokeStatic, M.logI, [0, 1]),                // Log.i(v0, v1)
  ];

  const guarded = [
    ...invoke(OP.invokeSuper, M.superOnCreate, [THIS, BUNDLE]),
    (0 << 8) | OP.newInstance, typeIdx.get(WEBVIEW),            // new-instance v0, WebView
    ...invoke(OP.invokeDirect, M.wvInit, [0, THIS]),            // new WebView(this)
    ...invoke(OP.invokeVirtual, M.wvGetSettings, [0]),          // w.getSettings()
    (1 << 8) | OP.moveResultObject,                             // move-result-object v1
    (1 << 12) | (2 << 8) | OP.const4,                           // const/4 v2, 1
    ...invoke(OP.invokeVirtual, M.setJs, [1, 2]),
    ...invoke(OP.invokeVirtual, M.setDom, [1, 2]),
    ...invoke(OP.invokeVirtual, M.setFiles, [1, 2]),
    (3 << 8) | OP.newInstance, typeIdx.get(CLIENT),             // new-instance v3, WebViewClient
    ...invoke(OP.invokeDirect, M.clientInit, [3]),
    ...invoke(OP.invokeVirtual, M.wvSetClient, [0, 3]),
    ...invoke(OP.invokeVirtual, M.setContentView, [THIS, 0]),
    (4 << 8) | OP.constString, strIdx.get(START_URL),           // const-string v4, url
    ...invoke(OP.invokeVirtual, M.wvLoadUrl, [0, 4]),
    (0 << 8) | OP.constString, strIdx.get(LOG_TAG),             // const-string v0, "MIR"
    (1 << 8) | OP.constString, strIdx.get(READY_MSG),           // const-string v1, "…created"
    ...invoke(OP.invokeStatic, M.logI, [0, 1]),                 // Log.i(v0, v1)
  ];

  /* Обработчик: стек ошибки уходит и в logcat, и на экран телефона. */
  const handler = [
    (0 << 8) | OP.moveException,                                // move-exception v0
    ...invoke(OP.invokeStatic, M.logTrace, [0]),                // Log.getStackTraceString(v0)
    (1 << 8) | OP.moveResultObject,                             // move-result-object v1 (текст стека)
    (2 << 8) | OP.constString, strIdx.get(LOG_TAG),             // const-string v2, "MIR"
    ...invoke(OP.invokeStatic, M.logE, [2, 1]),                 // Log.e("MIR", стек)
    (2 << 8) | OP.constString, strIdx.get(CRASH_PREFIX),        // const-string v2, пояснение
    ...invoke(OP.invokeVirtual, M.strConcat, [2, 1]),           // пояснение + стек
    (1 << 8) | OP.moveResultObject,                             // move-result-object v1
    (3 << 8) | OP.newInstance, typeIdx.get(TEXTVIEW),           // new-instance v3, TextView
    ...invoke(OP.invokeDirect, M.tvInit, [3, THIS]),            // new TextView(this)
    (1 << 12) | (4 << 8) | OP.const4,                           // const/4 v4, 1
    ...invoke(OP.invokeVirtual, M.tvSelectable, [3, 4]),        // текст можно выделить и скопировать
    ...invoke(OP.invokeVirtual, M.tvSetText, [3, 1]),           // tv.setText(пояснение + стек)
    ...invoke(OP.invokeVirtual, M.setContentView, [THIS, 3]),   // показать вместо игры
  ];

  /* Раскладка: пролог, try-блок, goto через обработчик, обработчик, return. */
  const tryStart = prologue.length;
  const tryLength = guarded.length;
  const gotoAddr = tryStart + tryLength;
  const handlerAddr = gotoAddr + 1;
  const doneAddr = handlerAddr + handler.length;
  const gotoDelta = doneAddr - gotoAddr;
  if (gotoDelta > 127) throw new Error('build-apk: обработчик ошибки не помещается в короткий goto');

  const onCreateCode = [
    ...prologue,
    ...guarded,
    (gotoDelta << 8) | OP.goto,
    ...handler,
    OP.returnVoid,
  ];

  /* try_item + encoded_catch_handler_list: один обработчик на Throwable. */
  const catchList = Buffer.concat([
    uleb128(1), // размер списка
    Buffer.concat([sleb128(1), uleb128(typeIdx.get(THROWABLE)), uleb128(handlerAddr)]),
  ]);
  const tryItem = Buffer.alloc(8);
  tryItem.writeUInt32LE(tryStart, 0);
  tryItem.writeUInt16LE(tryLength, 4);
  tryItem.writeUInt16LE(1, 6); // смещение обработчика внутри списка (после uleb размера)

  function codeItem(registers, ins, outs, units, tries = null) {
    const head = Buffer.alloc(16 + units.length * 2);
    head.writeUInt16LE(registers, 0);
    head.writeUInt16LE(ins, 2);
    head.writeUInt16LE(outs, 4);
    head.writeUInt16LE(tries ? 1 : 0, 6);
    head.writeUInt32LE(0, 8); // debug_info_off
    head.writeUInt32LE(units.length, 12);
    units.forEach((unit, i) => head.writeUInt16LE(unit & 0xffff, 16 + i * 2));
    if (!tries) return head;
    /* try_item-ы должны начинаться с чётного смещения внутри code_item. */
    const padding = units.length % 2 ? Buffer.alloc(2) : Buffer.alloc(0);
    return Buffer.concat([head, padding, tries.item, tries.list]);
  }

  const codeInit = codeItem(1, 1, 1, initCode);
  const codeOnCreate = codeItem(7, 2, 2, onCreateCode, { item: tryItem, list: catchList });

  /* Сведения для журнала сборки: по ним видно, что именно попало в DEX. */
  const report = {
    types,
    strings,
    methods: methods.map((m) => `${m.cls}->${m.name}(${m.params.join('')})${m.ret}`),
    onCreateUnits: onCreateCode.length,
    tryStart,
    tryLength,
    handlerAddr,
    doneAddr,
  };

  /* --- список типов для прототипов с параметрами ------------------- */
  const typeListChunks = [];
  const protoParamOff = new Array(protos.length).fill(0);
  let typeListsLen = 0;
  protos.forEach((p, i) => {
    if (p.params.length === 0) return;
    const padding = pad4(typeListsLen);
    if (padding) {
      typeListChunks.push(Buffer.alloc(padding));
      typeListsLen += padding;
    }
    protoParamOff[i] = typeListsLen; // смещение внутри секции type_list
    const buf = Buffer.alloc(4 + p.params.length * 2);
    buf.writeUInt32LE(p.params.length, 0);
    p.params.forEach((t, k) => buf.writeUInt16LE(typeIdx.get(t), 4 + k * 2));
    typeListChunks.push(buf);
    typeListsLen += buf.length;
  });
  const typeListCount = protoParamOff.filter((_, i) => protos[i].params.length > 0).length;
  const typeListsBuf = Buffer.concat(typeListChunks);

  /* --- строковые данные --------------------------------------------- */
  const stringDataOff = [];
  const stringDataChunks = [];
  let stringDataLen = 0;
  for (const s of strings) {
    stringDataOff.push(stringDataLen);
    const bytes = Buffer.from(s, 'utf8');
    const chunk = Buffer.concat([uleb128(s.length), bytes, Buffer.from([0])]);
    stringDataChunks.push(chunk);
    stringDataLen += chunk.length;
  }
  const stringDataBuf = Buffer.concat(stringDataChunks);

  /* --- раскладка файла ---------------------------------------------- */
  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + types.length * 4;
  const methodIdsOff = protoIdsOff + protos.length * 12;
  const classDefsOff = methodIdsOff + methods.length * 8;
  const dataOff = classDefsOff + 32;

  let cursor = dataOff;
  const typeListsOff = cursor;
  cursor += typeListsBuf.length;

  cursor += pad4(cursor);
  const codeInitOff = cursor;
  cursor += codeInit.length;
  cursor += pad4(cursor);
  const codeOnCreateOff = cursor;
  cursor += codeOnCreate.length;

  const stringDataStart = cursor;
  cursor += stringDataBuf.length;

  const classDataOff = cursor;
  const classDataBuf = Buffer.concat([
    uleb128(0), // static_fields_size
    uleb128(0), // instance_fields_size
    uleb128(1), // direct_methods_size
    uleb128(1), // virtual_methods_size
    uleb128(mi(M.ownInit)),
    uleb128(0x10001), // ACC_PUBLIC | ACC_CONSTRUCTOR
    uleb128(codeInitOff),
    uleb128(mi(M.ownOnCreate)),
    uleb128(0x0004), // ACC_PROTECTED
    uleb128(codeOnCreateOff),
  ]);
  cursor += classDataBuf.length;

  cursor += pad4(cursor);
  const mapOff = cursor;

  const mapItems = [
    { type: 0x0000, size: 1, off: 0 },
    { type: 0x0001, size: strings.length, off: stringIdsOff },
    { type: 0x0002, size: types.length, off: typeIdsOff },
    { type: 0x0003, size: protos.length, off: protoIdsOff },
    { type: 0x0005, size: methods.length, off: methodIdsOff },
    { type: 0x0006, size: 1, off: classDefsOff },
    { type: 0x1001, size: typeListCount, off: typeListsOff },
    { type: 0x2001, size: 2, off: codeInitOff },
    { type: 0x2002, size: strings.length, off: stringDataStart },
    { type: 0x2000, size: 1, off: classDataOff },
    { type: 0x1000, size: 1, off: mapOff },
  ].filter((item) => item.size > 0);
  mapItems.sort((a, b) => a.off - b.off);

  const mapBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((item, i) => {
    mapBuf.writeUInt16LE(item.type, 4 + i * 12);
    mapBuf.writeUInt16LE(0, 6 + i * 12);
    mapBuf.writeUInt32LE(item.size, 8 + i * 12);
    mapBuf.writeUInt32LE(item.off, 12 + i * 12);
  });
  cursor += mapBuf.length;

  const fileSize = cursor;
  const dex = Buffer.alloc(fileSize);

  /* --- таблицы индексов --------------------------------------------- */
  strings.forEach((_, i) => dex.writeUInt32LE(stringDataStart + stringDataOff[i], stringIdsOff + i * 4));
  types.forEach((t, i) => dex.writeUInt32LE(strIdx.get(t), typeIdsOff + i * 4));
  protos.forEach((p, i) => {
    dex.writeUInt32LE(strIdx.get(p.shorty), protoIdsOff + i * 12);
    dex.writeUInt32LE(typeIdx.get(p.ret), protoIdsOff + i * 12 + 4);
    dex.writeUInt32LE(p.params.length ? typeListsOff + protoParamOff[i] : 0, protoIdsOff + i * 12 + 8);
  });
  methods.forEach((m, i) => {
    dex.writeUInt16LE(m.classIdx, methodIdsOff + i * 8);
    dex.writeUInt16LE(m.protoIdx, methodIdsOff + i * 8 + 2);
    dex.writeUInt32LE(m.nameIdx, methodIdsOff + i * 8 + 4);
  });

  /* --- class_def_item ------------------------------------------------ */
  dex.writeUInt32LE(typeIdx.get(CLASS), classDefsOff);
  dex.writeUInt32LE(0x0001, classDefsOff + 4); // ACC_PUBLIC
  dex.writeUInt32LE(typeIdx.get(SUPER), classDefsOff + 8);
  dex.writeUInt32LE(0, classDefsOff + 12); // interfaces_off
  dex.writeUInt32LE(strIdx.get(SOURCE_FILE), classDefsOff + 16);
  dex.writeUInt32LE(0, classDefsOff + 20); // annotations_off
  dex.writeUInt32LE(classDataOff, classDefsOff + 24);
  dex.writeUInt32LE(0, classDefsOff + 28); // static_values_off

  /* --- секция данных -------------------------------------------------- */
  typeListsBuf.copy(dex, typeListsOff);
  codeInit.copy(dex, codeInitOff);
  codeOnCreate.copy(dex, codeOnCreateOff);
  stringDataBuf.copy(dex, stringDataStart);
  classDataBuf.copy(dex, classDataOff);
  mapBuf.copy(dex, mapOff);

  /* --- заголовок ------------------------------------------------------- */
  dex.write('dex\n035\0', 0, 8, 'binary');
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(headerSize, 36);
  dex.writeUInt32LE(0x12345678, 40); // endian_tag
  dex.writeUInt32LE(0, 44); // link_size
  dex.writeUInt32LE(0, 48); // link_off
  dex.writeUInt32LE(mapOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(types.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(0, 80); // field_ids_size
  dex.writeUInt32LE(0, 84); // field_ids_off (0, если размер 0)
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(1, 96);
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(fileSize - dataOff, 104);
  dex.writeUInt32LE(dataOff, 108);

  crypto.createHash('sha1').update(dex.subarray(32)).digest().copy(dex, 12);
  dex.writeUInt32LE(adler32(dex.subarray(12)), 8);

  report.layout = {
    headerSize,
    stringIdsOff,
    typeIdsOff,
    protoIdsOff,
    methodIdsOff,
    classDefsOff,
    dataOff,
    typeListsOff,
    codeInitOff,
    codeOnCreateOff,
    stringDataStart,
    classDataOff,
    mapOff,
    fileSize,
  };
  report.mapItems = mapItems;

  return { dex, report };
}

/* ============================================================
   2. Пул строк формата resources (используется в AXML и ARSC)
   ============================================================ */

function stringPool(strings) {
  const offsets = [];
  const chunks = [];
  let len = 0;
  for (const s of strings) {
    offsets.push(len);
    const body = Buffer.from(s, 'utf16le');
    const head = Buffer.alloc(2);
    head.writeUInt16LE(s.length, 0);
    const chunk = Buffer.concat([head, body, Buffer.from([0, 0])]);
    chunks.push(chunk);
    len += chunk.length;
  }
  let data = Buffer.concat(chunks);
  const padding = pad4(data.length);
  if (padding) data = Buffer.concat([data, Buffer.alloc(padding)]);

  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const size = stringsStart + data.length;

  const chunk = Buffer.alloc(size);
  chunk.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  chunk.writeUInt16LE(headerSize, 2);
  chunk.writeUInt32LE(size, 4);
  chunk.writeUInt32LE(strings.length, 8);
  chunk.writeUInt32LE(0, 12); // styleCount
  chunk.writeUInt32LE(0, 16); // flags: UTF-16, не сортирован
  chunk.writeUInt32LE(stringsStart, 20);
  chunk.writeUInt32LE(0, 24); // stylesStart
  offsets.forEach((off, i) => chunk.writeUInt32LE(off, headerSize + i * 4));
  data.copy(chunk, stringsStart);
  return chunk;
}

/* ============================================================
   3. AndroidManifest.xml (бинарный AXML)
   ============================================================ */

const ATTR = {
  theme: 0x01010000,
  label: 0x01010001,
  icon: 0x01010002,
  name: 0x01010003,
  exported: 0x01010010,
  launchMode: 0x0101001d,
  configChanges: 0x0101001f,
  minSdkVersion: 0x0101020c,
  versionCode: 0x0101021b,
  versionName: 0x0101021c,
  windowSoftInputMode: 0x0101022b,
  targetSdkVersion: 0x01010270,
  allowBackup: 0x01010280,
  hardwareAccelerated: 0x010102d3,
  supportsRtl: 0x010103af,
  usesCleartextTraffic: 0x010104ec,
};

const VAL = {
  reference: 0x01,
  string: 0x03,
  int: 0x10,
  hex: 0x11,
  boolean: 0x12,
};

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const ICON_RES_ID = 0x7f010000; // @mipmap/ic_launcher (см. generateArsc)
const THEME_RES_ID = 0x0103022e; // @android:style/Theme.Material.NoActionBar

function buildManifest() {
  const str = (name, value) => ({ name, type: VAL.string, value });
  const bool = (name, value) => ({ name, type: VAL.boolean, value: value ? 0xffffffff : 0 });
  const int = (name, value) => ({ name, type: VAL.int, value });
  const hex = (name, value) => ({ name, type: VAL.hex, value });
  const refer = (name, value) => ({ name, type: VAL.reference, value });

  // configChanges: keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize
  const CONFIG_CHANGES = 0x10 | 0x20 | 0x80 | 0x400 | 0x0800 | 0x0200 | 0x2000;

  const tree = {
    tag: 'manifest',
    plain: { package: PACKAGE },
    attrs: [int('versionCode', VERSION_CODE), str('versionName', VERSION_NAME)],
    children: [
      { tag: 'uses-sdk', attrs: [int('minSdkVersion', MIN_SDK), int('targetSdkVersion', TARGET_SDK)] },
      { tag: 'uses-permission', attrs: [str('name', 'android.permission.INTERNET')] },
      { tag: 'uses-permission', attrs: [str('name', 'android.permission.ACCESS_NETWORK_STATE')] },
      {
        tag: 'application',
        attrs: [
          refer('theme', THEME_RES_ID),
          str('label', LABEL),
          refer('icon', ICON_RES_ID),
          bool('allowBackup', true),
          bool('hardwareAccelerated', true),
          bool('supportsRtl', true),
          bool('usesCleartextTraffic', true),
        ],
        children: [
          {
            tag: 'activity',
            attrs: [
              refer('theme', THEME_RES_ID),
              str('name', `${PACKAGE}.MainActivity`),
              bool('exported', true),
              hex('launchMode', 1), // singleTop
              hex('configChanges', CONFIG_CHANGES),
              hex('windowSoftInputMode', 0x10), // adjustResize
            ],
            children: [
              {
                tag: 'intent-filter',
                attrs: [],
                children: [
                  { tag: 'action', attrs: [str('name', 'android.intent.action.MAIN')] },
                  { tag: 'category', attrs: [str('name', 'android.intent.category.LAUNCHER')] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  /* --- собираем пул строк: сначала имена атрибутов (в порядке resId) --- */
  const attrNames = new Set();
  const otherStrings = new Set();

  const walk = (node) => {
    for (const a of node.attrs ?? []) attrNames.add(a.name);
    otherStrings.add(node.tag);
    for (const [k, v] of Object.entries(node.plain ?? {})) {
      otherStrings.add(k);
      otherStrings.add(v);
    }
    for (const a of node.attrs ?? []) {
      if (a.type === VAL.string) otherStrings.add(a.value);
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);

  const attrList = [...attrNames].sort((a, b) => ATTR[a] - ATTR[b]);
  for (const a of attrList) {
    if (ATTR[a] === undefined) throw new Error(`build-apk: неизвестный атрибут ${a}`);
  }

  const strings = [...attrList, 'android', ANDROID_NS, ...[...otherStrings].filter((s) => !attrList.includes(s))];
  const uniqueStrings = [...new Set(strings)];
  const sIdx = new Map(uniqueStrings.map((s, i) => [s, i]));

  const poolChunk = stringPool(uniqueStrings);

  const resMapChunk = Buffer.alloc(8 + attrList.length * 4);
  resMapChunk.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunk.length, 4);
  attrList.forEach((name, i) => resMapChunk.writeUInt32LE(ATTR[name], 8 + i * 4));

  /* --- узлы дерева --------------------------------------------------- */
  const nsIdx = sIdx.get(ANDROID_NS);
  const nodes = [];

  const nsChunk = (type) => {
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(type, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(1, 8); // lineNumber
    buf.writeUInt32LE(0xffffffff, 12); // comment
    buf.writeUInt32LE(sIdx.get('android'), 16);
    buf.writeUInt32LE(nsIdx, 20);
    return buf;
  };

  const emitElement = (node) => {
    const plainAttrs = Object.entries(node.plain ?? {}).map(([k, v]) => ({
      ns: 0xffffffff,
      name: sIdx.get(k),
      rawValue: sIdx.get(v),
      type: VAL.string,
      data: sIdx.get(v),
    }));
    const nsAttrs = (node.attrs ?? []).map((a) => ({
      ns: nsIdx,
      name: sIdx.get(a.name),
      rawValue: a.type === VAL.string ? sIdx.get(a.value) : 0xffffffff,
      type: a.type,
      data: a.type === VAL.string ? sIdx.get(a.value) : a.value,
    }));
    const attrs = [...plainAttrs, ...nsAttrs];

    const start = Buffer.alloc(36 + attrs.length * 20);
    start.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    start.writeUInt16LE(16, 2);
    start.writeUInt32LE(start.length, 4);
    start.writeUInt32LE(1, 8); // lineNumber
    start.writeUInt32LE(0xffffffff, 12); // comment
    start.writeUInt32LE(0xffffffff, 16); // ns
    start.writeUInt32LE(sIdx.get(node.tag), 20);
    start.writeUInt16LE(20, 24); // attributeStart
    start.writeUInt16LE(20, 26); // attributeSize
    start.writeUInt16LE(attrs.length, 28);
    start.writeUInt16LE(0, 30); // idIndex
    start.writeUInt16LE(0, 32); // classIndex
    start.writeUInt16LE(0, 34); // styleIndex
    attrs.forEach((a, i) => {
      const o = 36 + i * 20;
      start.writeUInt32LE(a.ns, o);
      start.writeUInt32LE(a.name, o + 4);
      start.writeUInt32LE(a.rawValue, o + 8);
      start.writeUInt16LE(8, o + 12); // size Res_value
      start.writeUInt8(0, o + 14); // res0
      start.writeUInt8(a.type, o + 15);
      start.writeUInt32LE(a.data >>> 0, o + 16);
    });
    nodes.push(start);

    for (const child of node.children ?? []) emitElement(child);

    const end = Buffer.alloc(24);
    end.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    end.writeUInt16LE(16, 2);
    end.writeUInt32LE(24, 4);
    end.writeUInt32LE(1, 8);
    end.writeUInt32LE(0xffffffff, 12);
    end.writeUInt32LE(0xffffffff, 16);
    end.writeUInt32LE(sIdx.get(node.tag), 20);
    nodes.push(end);
  };

  nodes.push(nsChunk(0x0100)); // START_NAMESPACE
  emitElement(tree);
  nodes.push(nsChunk(0x0101)); // END_NAMESPACE

  const body = Buffer.concat([poolChunk, resMapChunk, ...nodes]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

/* ============================================================
   4. resources.arsc — одна иконка @mipmap/ic_launcher (0x7f010000)
   ============================================================ */

function buildArsc(iconPath) {
  const globalPool = stringPool([iconPath]);
  const typePool = stringPool(['mipmap']);
  const keyPool = stringPool(['ic_launcher']);

  // ResTable_typeSpec
  const typeSpec = Buffer.alloc(16 + 4);
  typeSpec.writeUInt16LE(0x0202, 0);
  typeSpec.writeUInt16LE(16, 2);
  typeSpec.writeUInt32LE(typeSpec.length, 4);
  typeSpec.writeUInt8(1, 8); // typeId = 1 → mipmap
  typeSpec.writeUInt8(0, 9);
  typeSpec.writeUInt16LE(0, 10);
  typeSpec.writeUInt32LE(1, 12); // entryCount
  typeSpec.writeUInt32LE(0, 16); // флаги конфигурации записи

  // ResTable_type (конфигурация по умолчанию)
  const configSize = 64;
  const typeHeaderSize = 20 + configSize;
  const entry = Buffer.alloc(16);
  entry.writeUInt16LE(8, 0); // size ResTable_entry
  entry.writeUInt16LE(0, 2); // flags
  entry.writeUInt32LE(0, 4); // key = "ic_launcher"
  entry.writeUInt16LE(8, 8); // size Res_value
  entry.writeUInt8(0, 10);
  entry.writeUInt8(VAL.string, 11);
  entry.writeUInt32LE(0, 12); // индекс строки в глобальном пуле

  const entriesStart = typeHeaderSize + 4;
  const typeChunk = Buffer.alloc(entriesStart + entry.length);
  typeChunk.writeUInt16LE(0x0201, 0);
  typeChunk.writeUInt16LE(typeHeaderSize, 2);
  typeChunk.writeUInt32LE(typeChunk.length, 4);
  typeChunk.writeUInt8(1, 8); // typeId
  typeChunk.writeUInt8(0, 9); // flags
  typeChunk.writeUInt16LE(0, 10); // reserved
  typeChunk.writeUInt32LE(1, 12); // entryCount
  typeChunk.writeUInt32LE(entriesStart, 16);
  typeChunk.writeUInt32LE(configSize, 20); // ResTable_config.size, остальное — нули
  typeChunk.writeUInt32LE(0, typeHeaderSize); // смещение единственной записи
  entry.copy(typeChunk, entriesStart);

  const pkgHeaderSize = 288;
  const pkgBody = Buffer.concat([typePool, keyPool, typeSpec, typeChunk]);
  const pkgChunk = Buffer.alloc(pkgHeaderSize + pkgBody.length);
  pkgChunk.writeUInt16LE(0x0200, 0);
  pkgChunk.writeUInt16LE(pkgHeaderSize, 2);
  pkgChunk.writeUInt32LE(pkgChunk.length, 4);
  pkgChunk.writeUInt32LE(0x7f, 8); // id пакета
  Buffer.from(PACKAGE, 'utf16le').copy(pkgChunk, 12); // name[128]
  pkgChunk.writeUInt32LE(pkgHeaderSize, 268); // typeStrings
  pkgChunk.writeUInt32LE(0, 272); // lastPublicType
  pkgChunk.writeUInt32LE(pkgHeaderSize + typePool.length, 276); // keyStrings
  pkgChunk.writeUInt32LE(0, 280); // lastPublicKey
  pkgChunk.writeUInt32LE(0, 284); // typeIdOffset
  pkgBody.copy(pkgChunk, pkgHeaderSize);

  const header = Buffer.alloc(12);
  header.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  header.writeUInt16LE(12, 2);
  header.writeUInt32LE(12 + globalPool.length + pkgChunk.length, 4);
  header.writeUInt32LE(1, 8); // packageCount

  return Buffer.concat([header, globalPool, pkgChunk]);
}

/* ============================================================
   5. Ключ подписи (создаётся один раз и живёт в data/)
   ============================================================ */

function derLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let v = len;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const der = (tag, content) => Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
const derSeq = (...items) => der(0x30, Buffer.concat(items));
const derSet = (...items) => der(0x31, Buffer.concat(items));
const derInt = (buf) => der(0x02, Buffer.isBuffer(buf) ? buf : Buffer.from([buf]));
const derNull = () => der(0x05, Buffer.alloc(0));
const derUtf8 = (s) => der(0x0c, Buffer.from(s, 'utf8'));
const derUtcTime = (s) => der(0x17, Buffer.from(s, 'ascii'));

function derOid(oid) {
  const parts = oid.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const enc = [v & 0x7f];
    v >>>= 7;
    while (v > 0) {
      enc.unshift(0x80 | (v & 0x7f));
      v >>>= 7;
    }
    bytes.push(...enc);
  }
  return der(0x06, Buffer.from(bytes));
}

const OID_SHA256 = derSeq(derOid('2.16.840.1.101.3.4.2.1'), derNull());
const OID_SHA256_RSA = derSeq(derOid('1.2.840.113549.1.1.11'), derNull());

/* Серийный номер сертификата: положительное целое в минимальной записи DER.

   Здесь легко промахнуться, и промах стоит дорого. Раньше номер собирался
   как `[0x00, ...8 случайных байт]`. Ведущий ноль в DER допустим только
   тогда, когда без него старший бит сделал бы число отрицательным. Если
   первый случайный байт оказывался меньше 0x80 (а это половина сборок),
   получалась запрещённая «не минимальная» запись. Такой сертификат
   спокойно читают нестрогие разборщики (androguard, apksigtool), но
   отвергают строгие — OpenSSL, Rust-овый cryptography и, что важнее всего,
   BoringSSL внутри Android. Телефон при установке отвечал «Приложение не
   установлено» / INSTALL_PARSE_FAILED_NO_CERTIFICATES, а сборщик при этом
   рапортовал об успехе. */
function serialNumber() {
  const bytes = crypto.randomBytes(8);
  bytes[0] &= 0x7f; // положительное число — ведущий ноль не нужен
  if (bytes[0] === 0) bytes[0] = 1; // и не нулевой, иначе запись снова не минимальна
  return derInt(bytes);
}

function makeCertificate(keys) {
  const rdn = (oid, value) => derSet(derSeq(derOid(oid), derUtf8(value)));
  const name = derSeq(rdn('2.5.4.6', 'RU'), rdn('2.5.4.10', 'MIR'), rdn('2.5.4.3', 'The civilization of the sages'));
  const serial = serialNumber();
  const validity = derSeq(derUtcTime('200101000000Z'), derUtcTime('491231235959Z'));
  const spki = keys.publicKey.export({ type: 'spki', format: 'der' });

  const tbs = derSeq(
    der(0xa0, derInt(Buffer.from([2]))), // version v3
    serial,
    OID_SHA256_RSA,
    name,
    validity,
    name,
    spki,
  );
  const signature = crypto.sign('sha256', tbs, keys.privateKey);
  return derSeq(tbs, OID_SHA256_RSA, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
}

/** Сохраняет ключ и сертификат в data/apk-signing-key.json. */
function saveKey(privateKey, certificate) {
  mkdirSync('data', { recursive: true });
  writeFileSync(
    KEY_FILE,
    JSON.stringify(
      {
        note: 'Ключ подписи MIR.apk. Не удаляйте: без него обновление поверх установленной игры не поставится.',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        certificate: certificate.toString('base64'),
      },
      null,
      2,
    ),
  );
}

/**
 * Берёт сохранённый ключ подписи или создаёт новый.
 *
 * Сохранённый сертификат обязательно проверяется строгим разборщиком X.509:
 * ключи, созданные прежними версиями сборщика, содержали неминимальный
 * серийный номер, и Android отказывался ставить такой пакет. Если
 * сертификат не читается — он перевыпускается тем же ключом, а сборка
 * честно пишет об этом в журнал.
 */
function loadOrCreateKey() {
  if (existsSync(KEY_FILE)) {
    const saved = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    const privateKey = crypto.createPrivateKey(saved.privateKey);
    const certificate = Buffer.from(saved.certificate, 'base64');
    try {
      /* Строгий разбор: тот же путь, которым идёт Android при установке. */
      const parsed = new crypto.X509Certificate(certificate);
      if (!parsed.publicKey.equals(crypto.createPublicKey(privateKey)))
        throw new Error('открытый ключ в сертификате не совпадает с закрытым');
      return { privateKey, certificate, fresh: false, renewed: false };
    } catch (err) {
      const renewedCert = makeCertificate({ privateKey, publicKey: crypto.createPublicKey(privateKey) });
      saveKey(privateKey, renewedCert);
      return { privateKey, certificate: renewedCert, fresh: false, renewed: true, reason: err.message };
    }
  }

  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = makeCertificate(keys);
  saveKey(keys.privateKey, certificate);
  return { privateKey: keys.privateKey, certificate, fresh: true, renewed: false };
}

/* ============================================================
   6. Подпись v1 (JAR) — META-INF/*
   ============================================================ */

function buildV1Signature(files, key) {
  let manifestMf = 'Manifest-Version: 1.0\r\nCreated-By: MIR build-apk.mjs\r\n\r\n';
  const sections = new Map();
  for (const file of files) {
    const digest = crypto.createHash('sha256').update(file.data).digest('base64');
    const section = `Name: ${file.path}\r\nSHA-256-Digest: ${digest}\r\n\r\n`;
    sections.set(file.path, section);
    manifestMf += section;
  }
  const manifestBuf = Buffer.from(manifestMf, 'utf8');

  let certSf = 'Signature-Version: 1.0\r\n';
  certSf += 'Created-By: MIR build-apk.mjs\r\n';
  /* Защита от отката на v1: см. «APK signature scheme v2 / Rollback protections». */
  certSf += 'X-Android-APK-Signed: 2\r\n';
  certSf += `SHA-256-Digest-Manifest: ${crypto.createHash('sha256').update(manifestBuf).digest('base64')}\r\n\r\n`;
  for (const file of files) {
    const sectionDigest = crypto
      .createHash('sha256')
      .update(Buffer.from(sections.get(file.path), 'utf8'))
      .digest('base64');
    certSf += `Name: ${file.path}\r\nSHA-256-Digest: ${sectionDigest}\r\n\r\n`;
  }
  const sfBuf = Buffer.from(certSf, 'utf8');

  /* PKCS#7 SignedData (detached) над CERT.SF */
  const issuerAndSerial = (() => {
    /* Берём issuer и serial прямо из сертификата, чтобы они совпадали байт в байт. */
    const certBody = parseDerChildren(key.certificate)[0].content; // tbs + algo + signature
    const tbsBody = parseDerChildren(certBody)[0].content;
    const tbs = parseDerChildren(tbsBody);
    // tbs: [0] version, serial, sigAlg, issuer, validity, subject, spki...
    const serial = tbs[1].raw;
    const issuer = tbs[3].raw;
    return derSeq(issuer, serial);
  })();

  const signerInfo = derSeq(
    derInt(Buffer.from([1])),
    issuerAndSerial,
    OID_SHA256,
    OID_SHA256_RSA,
    der(0x04, crypto.sign('sha256', sfBuf, key.privateKey)),
  );

  const signedData = derSeq(
    derInt(Buffer.from([1])),
    derSet(OID_SHA256),
    derSeq(derOid('1.2.840.113549.1.7.1')),
    der(0xa0, key.certificate),
    derSet(signerInfo),
  );

  const pkcs7 = derSeq(derOid('1.2.840.113549.1.7.2'), der(0xa0, signedData));

  return [
    { path: 'META-INF/MANIFEST.MF', data: manifestBuf },
    { path: 'META-INF/CERT.SF', data: sfBuf },
    { path: 'META-INF/CERT.RSA', data: pkcs7 },
  ];
}

/** Разбирает DER-последовательность на элементы верхнего уровня. */
function parseDerChildren(buf) {
  /* Если передали целиком SEQUENCE — разбираем его содержимое. */
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const start = i;
    const tag = buf[i++];
    let len = buf[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | buf[i++];
    }
    const content = buf.subarray(i, i + len);
    out.push({ tag, content, raw: buf.subarray(start, i + len) });
    i += len;
  }
  return out;
}

/* ============================================================
   7. ZIP + выравнивание + подпись v2
   ============================================================ */

const DOS_TIME = (() => {
  const d = new Date();
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
})();

function buildZip(entries) {
  const body = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.path, 'utf8');
    const stored = Boolean(entry.stored);
    const data = stored ? entry.data : zlib.deflateRawSync(entry.data, { level: 9 });
    const method = stored ? 0 : 8;

    /* zipalign: данные несжатых файлов должны начинаться с границы 4 байт. */
    let extra = Buffer.alloc(0);
    if (stored) {
      const dataStart = offset + 30 + nameBuf.length;
      const padding = pad4(dataStart);
      if (padding) extra = Buffer.alloc(padding);
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME.time, 10);
    local.writeUInt16LE(DOS_TIME.date, 12);
    local.writeUInt32LE(crc32(entry.data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(extra.length, 28);

    body.push(local, nameBuf, extra, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME.time, 12);
    cd.writeUInt16LE(DOS_TIME.date, 14);
    cd.writeUInt32LE(crc32(entry.data), 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + extra.length + data.length;
  }

  const bodyBuf = Buffer.concat(body);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(bodyBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return { body: bodyBuf, central: centralBuf, eocd };
}

/** Двухуровневый дайджест APK по схеме v2 (чанки по 1 МиБ). */
function apkDigest(sections) {
  const CHUNK = 1024 * 1024;
  const chunkDigests = [];
  let count = 0;

  for (const section of sections) {
    for (let off = 0; off < section.length; off += CHUNK) {
      const chunk = section.subarray(off, Math.min(off + CHUNK, section.length));
      const h = crypto.createHash('sha256');
      h.update(Buffer.from([0xa5]));
      h.update(u32(chunk.length));
      h.update(chunk);
      chunkDigests.push(h.digest());
      count++;
    }
  }

  const top = crypto.createHash('sha256');
  top.update(Buffer.from([0x5a]));
  top.update(u32(count));
  for (const d of chunkDigests) top.update(d);
  return top.digest();
}

const lenPrefixed = (buf) => Buffer.concat([u32(buf.length), buf]);

function signV2({ body, central, eocd }, key) {
  /* EOCD для дайджеста: смещение центрального каталога = начало блока подписи. */
  const eocdForDigest = Buffer.from(eocd);
  eocdForDigest.writeUInt32LE(body.length, 16);

  const digest = apkDigest([body, central, eocdForDigest]);

  const SIG_ALGO_SHA256_RSA_PKCS1 = 0x0103;
  const digests = lenPrefixed(
    lenPrefixed(Buffer.concat([u32(SIG_ALGO_SHA256_RSA_PKCS1), lenPrefixed(digest)])),
  );
  const certificates = lenPrefixed(lenPrefixed(key.certificate));
  const additionalAttributes = lenPrefixed(Buffer.alloc(0));
  const signedData = Buffer.concat([digests, certificates, additionalAttributes]);

  const signature = crypto.sign('sha256', signedData, key.privateKey);
  const signatures = lenPrefixed(
    lenPrefixed(Buffer.concat([u32(SIG_ALGO_SHA256_RSA_PKCS1), lenPrefixed(signature)])),
  );
  const publicKey = lenPrefixed(
    crypto.createPublicKey(key.privateKey).export({ type: 'spki', format: 'der' }),
  );

  const signer = Buffer.concat([lenPrefixed(signedData), signatures, publicKey]);
  const v2Block = lenPrefixed(lenPrefixed(signer));

  /* APK Signing Block: [size][pairs...][size]["APK Sig Block 42"] */
  const pair = Buffer.concat([u32(v2Block.length + 4), Buffer.alloc(4), v2Block]);
  pair.writeUInt32LE(0x7109871a, 8); // ID блока v2
  const pairs = Buffer.concat([u32(v2Block.length + 4), Buffer.alloc(4)]);
  pairs.writeUInt32LE(0, 4);

  const idValue = Buffer.concat([
    Buffer.alloc(8), // uint64 длина пары
    u32(0x7109871a),
    v2Block,
  ]);
  idValue.writeBigUInt64LE(BigInt(4 + v2Block.length), 0);

  /* Выравниваем начало центрального каталога на 4096 не требуется, но сам
     блок должен быть кратен 8 байтам — добавляем «пустую» пару-заполнитель. */
  let payload = idValue;
  const unpaddedSize = 8 + payload.length + 8 + 16; // size + pairs + size + magic
  const padding = (4096 - (unpaddedSize % 4096)) % 4096;
  if (padding >= 12) {
    const filler = Buffer.alloc(padding);
    filler.writeBigUInt64LE(BigInt(padding - 8), 0);
    filler.writeUInt32LE(0x42726577, 8); // «padding» ID из apksigner
    payload = Buffer.concat([payload, filler]);
  }

  const blockSize = BigInt(payload.length + 8 + 16);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeBigUInt64LE(blockSize, 0);
  const signingBlock = Buffer.concat([sizeBuf, payload, sizeBuf, Buffer.from('APK Sig Block 42', 'ascii')]);

  const eocdFinal = Buffer.from(eocd);
  eocdFinal.writeUInt32LE(body.length + signingBlock.length, 16);

  return Buffer.concat([body, signingBlock, central, eocdFinal]);
}

/* ============================================================
   8. Самопроверка готового APK
   ============================================================ */

/** Проверяет инварианты DEX, которые проверяет и верификатор ART. */
function verifyDex(dex) {
  const problems = [];
  if (dex.subarray(0, 4).toString('binary') !== 'dex\n') problems.push('dex: неверная сигнатура');
  if (dex.readUInt32LE(32) !== dex.length) problems.push('dex: file_size не совпадает с длиной');
  if (dex.readUInt32LE(40) !== 0x12345678) problems.push('dex: неверный endian_tag');

  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  if (!sha1.equals(dex.subarray(12, 32))) problems.push('dex: неверная SHA-1 подпись заголовка');
  if (adler32(dex.subarray(12)) !== dex.readUInt32LE(8)) problems.push('dex: неверная контрольная сумма');

  const strCount = dex.readUInt32LE(56);
  const strOff = dex.readUInt32LE(60);
  const readString = (i) => {
    let p = dex.readUInt32LE(strOff + i * 4);
    while (dex[p] & 0x80) p++; // uleb128 длины
    p++;
    const end = dex.indexOf(0, p);
    return dex.subarray(p, end).toString('utf8');
  };
  const list = [];
  for (let i = 0; i < strCount; i++) list.push(readString(i));
  for (let i = 1; i < list.length; i++) {
    if (list[i - 1] >= list[i]) problems.push(`dex: string_ids не отсортированы (${list[i - 1]} / ${list[i]})`);
  }

  const typeCount = dex.readUInt32LE(64);
  const typeOff = dex.readUInt32LE(68);
  for (let i = 1; i < typeCount; i++) {
    if (dex.readUInt32LE(typeOff + (i - 1) * 4) >= dex.readUInt32LE(typeOff + i * 4))
      problems.push('dex: type_ids не отсортированы');
  }

  const methodCount = dex.readUInt32LE(88);
  const methodOff = dex.readUInt32LE(92);
  let prev = [-1, -1, -1];
  for (let i = 0; i < methodCount; i++) {
    const cur = [
      dex.readUInt16LE(methodOff + i * 8),
      dex.readUInt32LE(methodOff + i * 8 + 4),
      dex.readUInt16LE(methodOff + i * 8 + 2),
    ];
    if (cur[0] < prev[0] || (cur[0] === prev[0] && cur[1] < prev[1]))
      problems.push('dex: method_ids не отсортированы');
    prev = cur;
  }

  const mapOff = dex.readUInt32LE(52);
  const mapSize = dex.readUInt32LE(mapOff);
  let prevOff = -1;
  for (let i = 0; i < mapSize; i++) {
    const off = dex.readUInt32LE(mapOff + 4 + i * 12 + 8);
    if (off < prevOff) problems.push('dex: map_list не отсортирован по смещению');
    if (off > dex.length) problems.push('dex: смещение в map_list за пределами файла');
    prevOff = off;
  }
  return problems;
}

function verifyApk(apk) {
  const problems = [];

  /* --- EOCD и центральный каталог --- */
  const eocdOff = apk.length - 22;
  if (apk.readUInt32LE(eocdOff) !== 0x06054b50) problems.push('не найден EOCD в конце файла');
  const cdOffset = apk.readUInt32LE(eocdOff + 16);
  const cdSize = apk.readUInt32LE(eocdOff + 12);
  if (cdOffset + cdSize !== eocdOff) problems.push('центральный каталог не примыкает к EOCD');

  /* --- блок подписи --- */
  const magic = apk.subarray(cdOffset - 16, cdOffset).toString('ascii');
  if (magic !== 'APK Sig Block 42') problems.push('нет APK Signing Block (подпись v2)');
  const blockSizeTail = Number(apk.readBigUInt64LE(cdOffset - 24));
  const blockStart = cdOffset - blockSizeTail - 8;
  const blockSizeHead = Number(apk.readBigUInt64LE(blockStart));
  if (blockSizeHead !== blockSizeTail) problems.push('размеры блока подписи не совпадают');

  /* --- разбор пар ID-value и проверка подписи v2 --- */
  let cursor = blockStart + 8;
  let v2 = null;
  while (cursor < cdOffset - 24) {
    const pairLen = Number(apk.readBigUInt64LE(cursor));
    const id = apk.readUInt32LE(cursor + 8);
    const value = apk.subarray(cursor + 12, cursor + 8 + pairLen);
    if (id === 0x7109871a) v2 = value;
    cursor += 8 + pairLen;
  }
  if (!v2) problems.push('в блоке подписи нет секции 0x7109871a');

  if (v2) {
    const readLP = (buf, off) => {
      const len = buf.readUInt32LE(off);
      return { value: buf.subarray(off + 4, off + 4 + len), next: off + 4 + len };
    };
    const signers = readLP(v2, 0).value;
    const signer = readLP(signers, 0).value;
    const signedData = readLP(signer, 0);
    const signatures = readLP(signer, signedData.next);
    const publicKeyDer = readLP(signer, signatures.next).value;

    const sigBlock = readLP(signatures.value, 0).value;
    const sigAlgo = sigBlock.readUInt32LE(0);
    const signature = readLP(sigBlock, 4).value;

    const publicKey = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
    if (sigAlgo !== 0x0103) problems.push(`неожиданный алгоритм подписи 0x${sigAlgo.toString(16)}`);
    if (!crypto.verify('sha256', signedData.value, publicKey, signature))
      problems.push('подпись v2 не проходит проверку');

    /* дайджест содержимого */
    const digestsBlock = readLP(signedData.value, 0).value;
    const digestEntry = readLP(digestsBlock, 0).value;
    const storedDigest = readLP(digestEntry, 4).value;

    const eocdForDigest = Buffer.from(apk.subarray(eocdOff));
    eocdForDigest.writeUInt32LE(blockStart, 16);
    const actual = apkDigest([
      apk.subarray(0, blockStart),
      apk.subarray(cdOffset, eocdOff),
      eocdForDigest,
    ]);
    if (!actual.equals(storedDigest)) problems.push('дайджест содержимого не совпадает с подписанным');
  }

  /* --- подпись v1: сверяем MANIFEST.MF с содержимым --- */
  const entries = readZipEntries(apk, cdOffset, cdSize);
  const manifest = entries.get('META-INF/MANIFEST.MF');
  if (!manifest) problems.push('нет META-INF/MANIFEST.MF (подпись v1)');
  else {
    const text = manifest.toString('utf8');
    for (const [name, data] of entries) {
      if (name.startsWith('META-INF/')) continue;
      const digest = crypto.createHash('sha256').update(data).digest('base64');
      if (!text.includes(`Name: ${name}\r\nSHA-256-Digest: ${digest}\r\n`))
        problems.push(`в MANIFEST.MF нет верного дайджеста для ${name}`);
    }
  }

  /* --- требования Android 11+ к resources.arsc --- */
  const arscEntry = findLocalEntry(apk, 'resources.arsc');
  if (!arscEntry) problems.push('нет resources.arsc');
  else {
    if (arscEntry.method !== 0) problems.push('resources.arsc сжат (Android 11+ такое не ставит)');
    if (arscEntry.dataOffset % 4 !== 0) problems.push('resources.arsc не выровнен по 4 байта');
  }

  return problems;
}

function readZipEntries(apk, cdOffset, cdSize) {
  const map = new Map();
  let p = cdOffset;
  const end = cdOffset + cdSize;
  while (p < end) {
    const nameLen = apk.readUInt16LE(p + 28);
    const extraLen = apk.readUInt16LE(p + 30);
    const commentLen = apk.readUInt16LE(p + 32);
    const localOff = apk.readUInt32LE(p + 42);
    const name = apk.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const method = apk.readUInt16LE(p + 10);
    const compSize = apk.readUInt32LE(p + 20);

    const lNameLen = apk.readUInt16LE(localOff + 26);
    const lExtraLen = apk.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = apk.subarray(dataStart, dataStart + compSize);
    map.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

function findLocalEntry(apk, wanted) {
  let p = 0;
  while (p + 30 < apk.length && apk.readUInt32LE(p) === 0x04034b50) {
    const method = apk.readUInt16LE(p + 8);
    const compSize = apk.readUInt32LE(p + 18);
    const nameLen = apk.readUInt16LE(p + 26);
    const extraLen = apk.readUInt16LE(p + 28);
    const name = apk.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    const dataOffset = p + 30 + nameLen + extraLen;
    if (name === wanted) return { method, dataOffset, compSize };
    p = dataOffset + compSize;
  }
  return null;
}

/* ============================================================
   9. Сборка: каждый шаг с протоколом в logs/apk-build.log
   ============================================================ */

console.log('============================================================');
console.log('  MIR — сборка Android-приложения (.apk)');
console.log('============================================================');

const BUILT_AT = new Date().toISOString().replace('T', ' ').slice(0, 19);

try {
  /* --- 1. Исходники ------------------------------------------------ */
  log.section('1. Окружение и исходники');
  log.detail('Node', process.version);
  log.detail('Платформа', `${process.platform} ${process.arch}`);
  log.detail('Версия игры', `${VERSION_NAME} (код ${VERSION_CODE})`);
  for (const file of ['index.html', 'src/main.js', 'package.json', 'public/icons/icon-512.png']) {
    log.check(existsSync(file), `на месте ${file}`, { fail: 'без этого файла сборка не имеет смысла' });
  }

  log.step('Собираю однофайловую версию игры (vite build + инлайн)');
  const startSingle = Date.now();
  const rawHtml = await buildSingleHtml();
  log.ok(`mir.html собран за ${((Date.now() - startSingle) / 1000).toFixed(1)} с — ${human(Buffer.byteLength(rawHtml))}`);
  log.check(rawHtml.includes('<script'), 'в mir.html есть код игры', { fail: 'в WebView будет пустая страница' });
  log.check(!rawHtml.includes('<script type="module"'), 'скрипт не модульный', {
    fail: 'модульные скрипты не работают по file:// — WebView покажет чёрный экран',
  });

  log.step('Встраиваю экранный журнал ошибок для телефона');
  const diag = injectDiagnostics(rawHtml, { version: VERSION_NAME, built: BUILT_AT });
  log.check(diag.inserted, 'диагностика встроена в <body>', {
    fail: diag.reason ?? 'ошибку внутри WebView будет не увидеть',
  });
  const html = diag.html;
  log.detail('Размер страницы с диагностикой', human(Buffer.byteLength(html)));

  const iconFile = existsSync('public/icons/icon-512.png') ? 'public/icons/icon-512.png' : 'public/icons/icon-192.png';
  const icon = readFileSync(iconFile);
  log.detail('Иконка', `${iconFile}, ${human(icon.length)}`);

  /* --- 2. classes.dex ---------------------------------------------- */
  log.section('2. Байт-код classes.dex');
  const { dex, report } = buildDex();
  log.detail('Размер DEX', human(dex.length));
  log.detail('Типов', report.types.length);
  log.detail('Строк', report.strings.length);
  log.detail('Методов', report.methods.length);
  log.raw(`Типы: ${report.types.join(', ')}`);
  log.raw(`Методы:\n  ${report.methods.join('\n  ')}`);
  log.raw(`Строки: ${report.strings.map((s) => JSON.stringify(s)).join(', ')}`);
  log.raw(`Раскладка файла: ${JSON.stringify(report.layout, null, 2)}`);
  log.raw(
    `onCreate: ${report.onCreateUnits} 16-битных слов, try с ${report.tryStart} по ${report.tryStart + report.tryLength}, ` +
      `обработчик на ${report.handlerAddr}, выход на ${report.doneAddr}`,
  );
  log.blob('classes.dex', dex);

  const dexProblems = verifyDex(dex);
  for (const problem of dexProblems) log.fail(problem, 'это же проверяет верификатор ART при установке');
  log.check(dexProblems.length === 0, 'самопроверка DEX пройдена', {
    fail: 'собирать APK дальше нельзя: приложение упадёт при запуске',
  });
  if (dexProblems.length) throw new Error('DEX собран неверно — подробности выше');

  /* --- 3. AndroidManifest.xml -------------------------------------- */
  log.section('3. AndroidManifest.xml');
  const manifestBin = buildManifest();
  log.blob('AndroidManifest.xml', manifestBin);
  log.detail('minSdk / targetSdk', `${MIN_SDK} / ${TARGET_SDK}`);
  log.detail('Тема', `0x${THEME_RES_ID.toString(16)} (${ANDROID_THEMES[THEME_RES_ID] ?? 'неизвестная'})`);
  log.check(Boolean(ANDROID_THEMES[THEME_RES_ID]), 'тема активности — известный системный стиль', {
    fail: 'ссылка на несуществующий стиль роняет активность при запуске',
  });

  /* --- 4. resources.arsc ------------------------------------------- */
  log.section('4. Таблица ресурсов');
  const ICON_PATH = 'res/mipmap/ic_launcher.png';
  const arscBin = buildArsc(ICON_PATH);
  log.blob('resources.arsc', arscBin);
  log.detail('Иконка', `@mipmap/ic_launcher = 0x${ICON_RES_ID.toString(16)} → ${ICON_PATH}`);

  /* --- 5. Ключ подписи --------------------------------------------- */
  log.section('5. Ключ подписи');
  const key = loadOrCreateKey();
  log.detail('Файл ключа', KEY_FILE);
  log.info(key.fresh ? `создан новый ключ (${KEY_FILE}) — не удаляйте его` : `использую сохранённый ключ из ${KEY_FILE}`);
  if (key.fresh) {
    log.warn(
      'ключ создан заново',
      'если игра уже стоит на телефоне, обновление поверх не встанет — сначала удалите старую версию',
    );
  }
  if (key.renewed) {
    log.warn(
      `сохранённый сертификат был некорректным (${key.reason}) и перевыпущен тем же ключом`,
      'такой пакет Android ставить отказывался; если старая версия всё же стоит на телефоне — удалите её перед установкой',
    );
  }

  /* Сертификат обязан читаться строгим разборщиком: на телефоне его
     разбирает BoringSSL, и он не прощает вольностей в DER. */
  let certOk = false;
  try {
    const x509 = new crypto.X509Certificate(key.certificate);
    certOk = true;
    log.detail('Сертификат', x509.subject.replace(/\n/g, ', '));
    log.detail('Серийный номер', x509.serialNumber);
    log.detail('Действителен', `${x509.validFrom} — ${x509.validTo}`);
    log.detail('Отпечаток SHA-256', sha256(key.certificate));
    log.check(
      x509.publicKey.equals(crypto.createPublicKey(key.privateKey)),
      'открытый ключ сертификата совпадает с ключом подписи',
      { fail: 'apksigner и Android ответят «public key mismatch» — пакет не установится' },
    );
    log.check(Date.parse(x509.validTo) > Date.now(), 'сертификат не просрочен', {
      fail: 'просроченный сертификат = «Приложение не установлено»',
    });
  } catch (err) {
    log.fail(
      `сертификат не разбирается строгим X.509: ${err.message}`,
      'ровно так его читает Android при установке — пакет будет отвергнут с INSTALL_PARSE_FAILED_NO_CERTIFICATES',
    );
  }
  log.check(certOk, 'сертификат подписи корректен по DER', {
    fail: 'удалите data/apk-signing-key.json и соберите заново',
  });

  /* --- 6. Упаковка -------------------------------------------------- */
  log.section('6. Упаковка и подпись');
  const payload = [
    { path: 'AndroidManifest.xml', data: manifestBin },
    { path: 'classes.dex', data: dex },
    { path: 'resources.arsc', data: arscBin, stored: true },
    { path: ICON_PATH, data: icon, stored: true },
    { path: 'assets/mir.html', data: Buffer.from(html, 'utf8') },
  ];
  log.table(
    payload.map((p) => ({ 'файл': p.path, 'размер': human(p.data.length), 'сжатие': p.stored ? 'нет (STORED)' : 'deflate' })),
  );

  log.step('Считаю дайджесты для подписи v1 (JAR)');
  const signatureFiles = buildV1Signature(payload, key);
  for (const file of signatureFiles) log.detail(file.path, human(file.data.length));

  log.step('Собираю ZIP с выравниванием несжатых файлов');
  const zipParts = buildZip([...payload, ...signatureFiles]);
  log.detail('Тело архива', human(zipParts.body.length));
  log.detail('Центральный каталог', human(zipParts.central.length));

  log.step('Подписываю по схеме v2 (APK Signature Scheme v2)');
  const apk = signV2(zipParts, key);
  log.detail('Итоговый размер', human(apk.length));

  const problems = verifyApk(apk);
  for (const problem of problems) log.fail(problem, 'пакет в таком виде Android не примет');
  log.check(problems.length === 0, 'быстрая самопроверка APK пройдена', { fail: 'файл не записан' });
  if (problems.length) throw new Error('APK собран неверно — подробности выше');

  /* --- 7. Запись ---------------------------------------------------- */
  log.section('7. Запись файлов');
  if (!existsSync('dist-app')) mkdirSync('dist-app', { recursive: true });
  writeFileSync(join('dist-app', 'MIR.apk'), apk);
  writeFileSync('MIR.apk', apk);
  log.ok(`MIR.apk записан (${human(apk.length)}), копия в dist-app/MIR.apk`);
  log.detail('SHA-256 файла', sha256(apk));

  /* --- 8. Полный разбор того, что реально записалось ---------------- */
  log.section('8. Проверка записанного файла');
  log.info('Файл читается с диска заново и разбирается так же, как его читает Android.');
  const written = readFileSync('MIR.apk');
  log.check(written.equals(apk), 'записанный файл побайтово совпадает с собранным', {
    fail: 'диск или антивирус испортили файл при записи',
  });
  const info = auditApk(written, log, { prefix: '8.' });

  /* --- Итог --------------------------------------------------------- */
  const ok = log.problems.length === 0;
  console.log('');
  console.log('============================================================');
  if (ok) {
    console.log('  ✓ Android-приложение собрано, подписано и проверено');
    console.log(`     MIR.apk — ${human(apk.length)}, версия ${info.versionName} (${info.versionCode})`);
    console.log(`     Пакет ${info.package}, minSdk ${info.minSdk}, targetSdk ${info.targetSdk}`);
    console.log(`     Подпись: v1 + v2, ключ ${info.signature?.keyType ?? '?'} ${info.signature?.keyBits ?? ''} бит`);
    console.log('');
    console.log('  Установка: перекиньте MIR.apk на телефон (Telegram, USB, диск),');
    console.log('  откройте и разрешите установку из этого источника.');
    console.log('');
    console.log('  Если на телефоне что-то пойдёт не так — ошибка будет видна:');
    console.log('    • падение приложения показывается прямо на экране телефона;');
    console.log('    • чёрный экран через 6 секунд сам превращается в отчёт;');
    console.log('    • разбор этого же файла повторяет команда npm run apk:doctor.');
  } else {
    console.log('  ✗ Сборка APK завершилась с ошибками — файл использовать нельзя');
  }
  console.log('============================================================');

  log.finish();
  process.exit(ok ? 0 : 1);
} catch (err) {
  log.error(err, 'сборка APK');
  console.log('');
  console.log('============================================================');
  console.log('  ✗ СБОРКА APK НЕ УДАЛАСЬ');
  console.log('  Причина записана выше и целиком — в журнале.');
  console.log('============================================================');
  log.finish();
  process.exit(1);
}
