// Сборка приложения для Android (.apk).
// Запуск: node build-apk.mjs
//
// Генерирует полностью готовый и подписанный Android APK (MIR.apk),
// который можно сразу передать на телефон (Telegram, WhatsApp, USB)
// и установить в один клик. Работает автономно без Android SDK.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { build } from 'vite';

// 1. Убеждаемся, что собраны mir.html и иконки
console.log('--- Сборка MIR для Android (.apk) ---');

await build({ logLevel: 'warn' });

// Собираем однофайловый HTML для встраивания в APK
let html = readFileSync(join('dist', 'index.html'), 'utf8');
html = html.replace(
  /<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"><\/script>/,
  (match, path) => {
    const js = readFileSync(join('dist', path), 'utf8').replaceAll('</script', '<\\/script');
    return `<script type="module">\n${js}\n    </script>`;
  },
);
html = html.replace(
  /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)" ?\/?>/,
  (match, path) => `<style>\n${readFileSync(join('dist', path), 'utf8')}\n    </style>`,
);
writeFileSync('mir.html', html);

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Вспомогательные функции для DEX и AXML
function uleb128(val) {
  const res = [];
  while (true) {
    let b = val & 0x7f;
    val >>= 7;
    if (val !== 0) b |= 0x80;
    res.push(b);
    if (val === 0) break;
  }
  return Buffer.from(res);
}

// Генератор classes.dex (Dalvik Activity + Fullscreen WebView)
function generateDex() {
  const strings = [
    '<init>',
    'Activity',
    'Bundle',
    'Context',
    'I',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/view/Window;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/mir/game/MainActivity;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'MainActivity.java',
    'V',
    'VI',
    'VII',
    'VL',
    'VLandroid/content/Context;',
    'VLandroid/os/Bundle;',
    'VLandroid/view/View;',
    'VLandroid/webkit/WebViewClient;',
    'VLjava/lang/String;',
    'VZ',
    'Z',
    'ZI',
    'file:///android_asset/mir.html',
    'getSettings',
    'getWindow',
    'loadUrl',
    'onCreate',
    'requestWindowFeature',
    'setAllowFileAccess',
    'setContentView',
    'setDatabaseEnabled',
    'setDomStorageEnabled',
    'setFlags',
    'setJavaScriptEnabled',
    'setWebViewClient',
  ].sort();

  const strMap = new Map(strings.map((s, i) => [s, i]));

  const types = [
    'I',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/view/Window;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/mir/game/MainActivity;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'V',
    'Z',
  ].sort();

  const typeMap = new Map(types.map((t, i) => [t, i]));

  const rawProtos = [
    { shorty: 'V', ret: 'V', params: [] },
    { shorty: 'V', ret: 'V', params: ['Landroid/content/Context;'] },
    { shorty: 'V', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { shorty: 'V', ret: 'V', params: ['Landroid/view/View;'] },
    { shorty: 'V', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { shorty: 'V', ret: 'V', params: ['Ljava/lang/String;'] },
    { shorty: 'V', ret: 'V', params: ['Z'] },
    { shorty: 'VII', ret: 'V', params: ['I', 'I'] },
    { shorty: 'ZI', ret: 'Z', params: ['I'] },
    { shorty: 'VL', ret: 'Landroid/view/Window;', params: [] },
    { shorty: 'VL', ret: 'Landroid/webkit/WebSettings;', params: [] },
  ];

  const protos = rawProtos.map((p) => ({
    shortyIdx: strMap.get(p.shorty),
    returnTypeIdx: typeMap.get(p.ret),
    params: p.params.map((t) => typeMap.get(t)),
  })).sort((a, b) => a.returnTypeIdx - b.returnTypeIdx || a.params.length - b.params.length);

  const protoMap = new Map(protos.map((p, i) => [`${p.returnTypeIdx}:${p.params.join(',')}`, i]));

  const rawMethods = [
    { cls: 'Landroid/app/Activity;', ret: 'V', params: [], name: '<init>' },
    { cls: 'Landroid/app/Activity;', ret: 'V', params: ['Landroid/os/Bundle;'], name: 'onCreate' },
    { cls: 'Landroid/app/Activity;', ret: 'Z', params: ['I'], name: 'requestWindowFeature' },
    { cls: 'Landroid/app/Activity;', ret: 'Landroid/view/Window;', params: [], name: 'getWindow' },
    { cls: 'Landroid/app/Activity;', ret: 'V', params: ['Landroid/view/View;'], name: 'setContentView' },
    { cls: 'Landroid/view/Window;', ret: 'V', params: ['I', 'I'], name: 'setFlags' },
    { cls: 'Landroid/webkit/WebView;', ret: 'V', params: ['Landroid/content/Context;'], name: '<init>' },
    { cls: 'Landroid/webkit/WebView;', ret: 'Landroid/webkit/WebSettings;', params: [], name: 'getSettings' },
    { cls: 'Landroid/webkit/WebView;', ret: 'V', params: ['Landroid/webkit/WebViewClient;'], name: 'setWebViewClient' },
    { cls: 'Landroid/webkit/WebView;', ret: 'V', params: ['Ljava/lang/String;'], name: 'loadUrl' },
    { cls: 'Landroid/webkit/WebSettings;', ret: 'V', params: ['Z'], name: 'setJavaScriptEnabled' },
    { cls: 'Landroid/webkit/WebSettings;', ret: 'V', params: ['Z'], name: 'setDomStorageEnabled' },
    { cls: 'Landroid/webkit/WebSettings;', ret: 'V', params: ['Z'], name: 'setDatabaseEnabled' },
    { cls: 'Landroid/webkit/WebSettings;', ret: 'V', params: ['Z'], name: 'setAllowFileAccess' },
    { cls: 'Landroid/webkit/WebViewClient;', ret: 'V', params: [], name: '<init>' },
    { cls: 'Lcom/mir/game/MainActivity;', ret: 'V', params: [], name: '<init>' },
    { cls: 'Lcom/mir/game/MainActivity;', ret: 'V', params: ['Landroid/os/Bundle;'], name: 'onCreate' },
  ];

  const methods = rawMethods.map((m) => {
    const pKey = `${typeMap.get(m.ret)}:${m.params.map((t) => typeMap.get(t)).join(',')}`;
    return {
      classIdx: typeMap.get(m.cls),
      protoIdx: protoMap.get(pKey),
      nameIdx: strMap.get(m.name),
      cls: m.cls,
      name: m.name,
      pKey,
    };
  }).sort((a, b) => a.classIdx - b.classIdx || a.nameIdx - b.nameIdx || a.protoIdx - b.protoIdx);

  function getMethodIdx(cls, name, ret, params) {
    const pKey = `${typeMap.get(ret)}:${params.map((t) => typeMap.get(t)).join(',')}`;
    return methods.findIndex((m) => m.cls === cls && m.name === name && m.pKey === pKey);
  }

  // Сборка Data-секции
  const typeLists = [];
  const protoParamOffs = [];
  let typeListBuf = Buffer.alloc(0);

  for (const p of protos) {
    if (p.params.length === 0) {
      protoParamOffs.push(0);
    } else {
      const pad = (4 - (typeListBuf.length % 4)) % 4;
      if (pad > 0) typeListBuf = Buffer.concat([typeListBuf, Buffer.alloc(pad)]);
      protoParamOffs.push(typeListBuf.length);
      const b = Buffer.alloc(4 + p.params.length * 2);
      b.writeUInt32LE(p.params.length, 0);
      p.params.forEach((paramT, idx) => b.writeUInt16LE(paramT, 4 + idx * 2));
      typeListBuf = Buffer.concat([typeListBuf, b]);
    }
  }
  const padTL = (4 - (typeListBuf.length % 4)) % 4;
  if (padTL > 0) typeListBuf = Buffer.concat([typeListBuf, Buffer.alloc(padTL)]);

  // Строковые данные
  const strDataOffs = [];
  let strDataBuf = Buffer.alloc(0);
  for (const s of strings) {
    strDataOffs.push(strDataBuf.length);
    const uleb = uleb128(s.length);
    const sBuf = Buffer.from(s, 'utf8');
    strDataBuf = Buffer.concat([strDataBuf, uleb, sBuf, Buffer.from([0])]);
  }
  const padSD = (4 - (strDataBuf.length % 4)) % 4;
  if (padSD > 0) strDataBuf = Buffer.concat([strDataBuf, Buffer.alloc(padSD)]);

  // Инструкции Dalvik
  const mActInit = getMethodIdx('Landroid/app/Activity;', '<init>', 'V', []);
  const insnsInit = Buffer.alloc(8);
  insnsInit.writeUInt16LE(0x1070, 0);
  insnsInit.writeUInt16LE(mActInit, 2);
  insnsInit.writeUInt16LE(0x0000, 4);
  insnsInit.writeUInt16LE(0x000e, 6);

  let codeInit = Buffer.alloc(16);
  codeInit.writeUInt16LE(1, 0); // registers
  codeInit.writeUInt16LE(1, 2); // ins
  codeInit.writeUInt16LE(1, 4); // outs
  codeInit.writeUInt16LE(0, 6); // tries
  codeInit.writeUInt32LE(0, 8); // debug_info_off
  codeInit.writeUInt32LE(insnsInit.length / 2, 12);
  codeInit = Buffer.concat([codeInit, insnsInit]);
  const padCI = (4 - (codeInit.length % 4)) % 4;
  if (padCI > 0) codeInit = Buffer.concat([codeInit, Buffer.alloc(padCI)]);

  const mActOnCreate = getMethodIdx('Landroid/app/Activity;', 'onCreate', 'V', ['Landroid/os/Bundle;']);
  const mActReqFeat = getMethodIdx('Landroid/app/Activity;', 'requestWindowFeature', 'Z', ['I']);
  const mActGetWin = getMethodIdx('Landroid/app/Activity;', 'getWindow', 'Landroid/view/Window;', []);
  const mWinSetFlags = getMethodIdx('Landroid/view/Window;', 'setFlags', 'V', ['I', 'I']);
  const tWebView = typeMap.get('Landroid/webkit/WebView;');
  const mWvInit = getMethodIdx('Landroid/webkit/WebView;', '<init>', 'V', ['Landroid/content/Context;']);
  const mWvGetSet = getMethodIdx('Landroid/webkit/WebView;', 'getSettings', 'Landroid/webkit/WebSettings;', []);
  const mWsJs = getMethodIdx('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']);
  const mWsDom = getMethodIdx('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']);
  const mWsDb = getMethodIdx('Landroid/webkit/WebSettings;', 'setDatabaseEnabled', 'V', ['Z']);
  const mWsFile = getMethodIdx('Landroid/webkit/WebSettings;', 'setAllowFileAccess', 'V', ['Z']);
  const tWvClient = typeMap.get('Landroid/webkit/WebViewClient;');
  const mWvcInit = getMethodIdx('Landroid/webkit/WebViewClient;', '<init>', 'V', []);
  const mWvSetClient = getMethodIdx('Landroid/webkit/WebViewClient;', '<init>', 'V', []);
  const mWvSetClientActual = getMethodIdx('Landroid/webkit/WebView;', 'setWebViewClient', 'V', ['Landroid/webkit/WebViewClient;']);
  const mActSetView = getMethodIdx('Landroid/app/Activity;', 'setContentView', 'V', ['Landroid/view/View;']);
  const sUrl = strMap.get('file:///android_asset/mir.html');
  const mWvLoadUrl = getMethodIdx('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']);

  const ocList = [
    [0x206f, mActOnCreate, 0x0043],
    [0x1012],
    [0x206e, mActReqFeat, 0x0003],
    [0x0013, 0x0400],
    [0x106e, mActGetWin, 0x0003],
    [0x010c],
    [0x306e, mWinSetFlags, 0x0001],
    [0x0022, tWebView],
    [0x2070, mWvInit, 0x0030],
    [0x106e, mWvGetSet, 0x0000],
    [0x010c],
    [0x1212],
    [0x206e, mWsJs, 0x0021],
    [0x206e, mWsDom, 0x0021],
    [0x206e, mWsDb, 0x0021],
    [0x206e, mWsFile, 0x0021],
    [0x0222, tWvClient],
    [0x1070, mWvcInit, 0x0002],
    [0x206e, mWvSetClientActual, 0x0020],
    [0x206e, mActSetView, 0x0003],
    [0x011a, sUrl],
    [0x206e, mWvLoadUrl, 0x0010],
    [0x000e],
  ];

  const insnsOcBuf = Buffer.alloc(ocList.reduce((acc, row) => acc + row.length * 2, 0));
  let insnsOcOff = 0;
  for (const row of ocList) {
    for (const val of row) {
      insnsOcBuf.writeUInt16LE(val, insnsOcOff);
      insnsOcOff += 2;
    }
  }

  let codeOc = Buffer.alloc(16);
  codeOc.writeUInt16LE(5, 0); // registers (v0..v2, p0=v3, p1=v4)
  codeOc.writeUInt16LE(2, 2); // ins (p0, p1)
  codeOc.writeUInt16LE(3, 4); // outs
  codeOc.writeUInt16LE(0, 6); // tries
  codeOc.writeUInt32LE(0, 8); // debug_info_off
  codeOc.writeUInt32LE(insnsOcBuf.length / 2, 12);
  codeOc = Buffer.concat([codeOc, insnsOcBuf]);
  const padCO = (4 - (codeOc.length % 4)) % 4;
  if (padCO > 0) codeOc = Buffer.concat([codeOc, Buffer.alloc(padCO)]);

  // Заголовки и смещения
  const headerSize = 0x70;
  const strIdsOff = headerSize;
  const strIdsSize = strings.length;
  const typeIdsOff = strIdsOff + strIdsSize * 4;
  const typeIdsSize = types.length;
  const protoIdsOff = typeIdsOff + typeIdsSize * 4;
  const protoIdsSize = protos.length;
  const fieldIdsOff = protoIdsOff + protoIdsSize * 12;
  const fieldIdsSize = 0;
  const methodIdsOff = fieldIdsOff;
  const methodIdsSize = methods.length;
  const classDefsOff = methodIdsOff + methodIdsSize * 8;
  const classDefsSize = 1;
  const dataOff = classDefsOff + classDefsSize * 32;

  const tlStart = dataOff;
  const strDataStart = tlStart + typeListBuf.length;
  const codeInitStart = strDataStart + strDataBuf.length;
  const codeOcStart = codeInitStart + codeInit.length;
  const classDataStart = codeOcStart + codeOc.length;

  const mMainInit = getMethodIdx('Lcom/mir/game/MainActivity;', '<init>', 'V', []);
  const mMainOc = getMethodIdx('Lcom/mir/game/MainActivity;', 'onCreate', 'V', ['Landroid/os/Bundle;']);

  let classData = Buffer.concat([
    uleb128(0), // static fields
    uleb128(0), // instance fields
    uleb128(1), // direct methods
    uleb128(1), // virtual methods
    uleb128(mMainInit),
    uleb128(0x10001), // ACC_PUBLIC | ACC_CONSTRUCTOR
    uleb128(codeInitStart),
    uleb128(mMainOc),
    uleb128(0x0004), // ACC_PROTECTED
    uleb128(codeOcStart),
  ]);
  const padCD = (4 - (classData.length % 4)) % 4;
  if (padCD > 0) classData = Buffer.concat([classData, Buffer.alloc(padCD)]);

  const mapListStart = classDataStart + classData.length;

  const mapItems = [
    { type: 0x0000, size: 1, off: 0 },
    { type: 0x0001, size: strIdsSize, off: strIdsOff },
    { type: 0x0002, size: typeIdsSize, off: typeIdsOff },
    { type: 0x0003, size: protoIdsSize, off: protoIdsOff },
    { type: 0x0005, size: methodIdsSize, off: methodIdsOff },
    { type: 0x0006, size: classDefsSize, off: classDefsOff },
    { type: 0x1001, size: protoParamOffs.filter((p) => p !== 0).length, off: tlStart },
    { type: 0x2002, size: strIdsSize, off: strDataStart },
    { type: 0x2001, size: 2, off: codeInitStart },
    { type: 0x2000, size: 1, off: classDataStart },
    { type: 0x1000, size: 1, off: mapListStart },
  ];

  const mapListBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapListBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((item, idx) => {
    mapListBuf.writeUInt16LE(item.type, 4 + idx * 12);
    mapListBuf.writeUInt16LE(0, 4 + idx * 12 + 2);
    mapListBuf.writeUInt32LE(item.size, 4 + idx * 12 + 4);
    mapListBuf.writeUInt32LE(item.off, 4 + idx * 12 + 8);
  });

  const totalDataSize = mapListStart + mapListBuf.length - dataOff;
  const totalFileSize = dataOff + totalDataSize;

  const dex = Buffer.alloc(totalFileSize);

  // Таблицы ID
  strDataOffs.forEach((off, i) => dex.writeUInt32LE(strDataStart + off, strIdsOff + i * 4));
  types.forEach((t, i) => dex.writeUInt32LE(strMap.get(t), typeIdsOff + i * 4));
  protos.forEach((p, i) => {
    const pOff = protoParamOffs[i] ? tlStart + protoParamOffs[i] : 0;
    dex.writeUInt32LE(p.shortyIdx, protoIdsOff + i * 12);
    dex.writeUInt32LE(p.returnTypeIdx, protoIdsOff + i * 12 + 4);
    dex.writeUInt32LE(pOff, protoIdsOff + i * 12 + 8);
  });
  methods.forEach((m, i) => {
    dex.writeUInt16LE(m.classIdx, methodIdsOff + i * 8);
    dex.writeUInt16LE(m.protoIdx, methodIdsOff + i * 8 + 2);
    dex.writeUInt32LE(m.nameIdx, methodIdsOff + i * 8 + 4);
  });

  // Class Def
  const tMain = typeMap.get('Lcom/mir/game/MainActivity;');
  const tAct = typeMap.get('Landroid/app/Activity;');
  const sSource = strMap.get('MainActivity.java');
  dex.writeUInt32LE(tMain, classDefsOff);
  dex.writeUInt32LE(0x0001, classDefsOff + 4);
  dex.writeUInt32LE(tAct, classDefsOff + 8);
  dex.writeUInt32LE(0, classDefsOff + 12);
  dex.writeUInt32LE(sSource, classDefsOff + 16);
  dex.writeUInt32LE(0, classDefsOff + 20);
  dex.writeUInt32LE(classDataStart, classDefsOff + 24);
  dex.writeUInt32LE(0, classDefsOff + 28);

  // Данные
  typeListBuf.copy(dex, tlStart);
  strDataBuf.copy(dex, strDataStart);
  codeInit.copy(dex, codeInitStart);
  codeOc.copy(dex, codeOcStart);
  classData.copy(dex, classDataStart);
  mapListBuf.copy(dex, mapListStart);

  // Заголовок
  dex.write('dex\n035\0', 0, 8, 'ascii');
  dex.writeUInt32LE(totalFileSize, 32);
  dex.writeUInt32LE(headerSize, 36);
  dex.writeUInt32LE(0x12345678, 40);
  dex.writeUInt32LE(mapListStart, 52);
  dex.writeUInt32LE(strIdsSize, 56);
  dex.writeUInt32LE(strIdsOff, 60);
  dex.writeUInt32LE(typeIdsSize, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protoIdsSize, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(fieldIdsSize, 80);
  dex.writeUInt32LE(fieldIdsOff, 84);
  dex.writeUInt32LE(methodIdsSize, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(classDefsSize, 96);
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(totalDataSize, 104);
  dex.writeUInt32LE(dataOff, 108);

  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);

  const adler = adler32(dex.subarray(12));
  dex.writeUInt32LE(adler >>> 0, 8);

  return dex;
}

// Генератор AndroidManifest.xml (AXML)
function generateAxml() {
  const strings = [
    'http://schemas.android.com/apk/res/android',
    'android',
    'manifest',
    'package',
    'versionCode',
    'versionName',
    'uses-permission',
    'name',
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'application',
    'label',
    'icon',
    'hardwareAccelerated',
    'allowBackup',
    'supportsRtl',
    'activity',
    'com.mir.game.MainActivity',
    'theme',
    'configChanges',
    'exported',
    'intent-filter',
    'action',
    'android.intent.action.MAIN',
    'category',
    'android.intent.category.LAUNCHER',
    'com.mir.game',
    '0.3.0',
    'MIR',
    '@mipmap/ic_launcher',
  ];
  const strMap = new Map(strings.map((s, i) => [s, i]));

  const resIds = new Array(strings.length).fill(0);
  resIds[strMap.get('label')] = 0x01010001;
  resIds[strMap.get('icon')] = 0x01010002;
  resIds[strMap.get('name')] = 0x01010003;
  resIds[strMap.get('theme')] = 0x01010000;
  resIds[strMap.get('configChanges')] = 0x0101001f;
  resIds[strMap.get('exported')] = 0x01010010;
  resIds[strMap.get('versionCode')] = 0x0101021b;
  resIds[strMap.get('versionName')] = 0x0101021c;
  resIds[strMap.get('hardwareAccelerated')] = 0x010102d3;
  resIds[strMap.get('allowBackup')] = 0x01010280;
  resIds[strMap.get('supportsRtl')] = 0x010103af;

  // Пул строк
  const offsets = [];
  let strData = Buffer.alloc(0);
  for (const s of strings) {
    offsets.push(strData.length);
    const sUtf16 = Buffer.from(s, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(s.length, 0);
    strData = Buffer.concat([strData, lenBuf, sUtf16, Buffer.from([0, 0])]);
  }
  const padSD = (4 - (strData.length % 4)) % 4;
  if (padSD > 0) strData = Buffer.concat([strData, Buffer.alloc(padSD)]);

  const spHeaderSize = 28;
  const spOffsetsSize = strings.length * 4;
  const spStringsStart = spHeaderSize + spOffsetsSize;
  const spChunkSize = spStringsStart + strData.length;

  const spChunk = Buffer.alloc(spChunkSize);
  spChunk.writeUInt16LE(0x0001, 0);
  spChunk.writeUInt16LE(spHeaderSize, 2);
  spChunk.writeUInt32LE(spChunkSize, 4);
  spChunk.writeUInt32LE(strings.length, 8);
  spChunk.writeUInt32LE(0, 12);
  spChunk.writeUInt32LE(0, 16);
  spChunk.writeUInt32LE(spStringsStart, 20);
  spChunk.writeUInt32LE(0, 24);

  offsets.forEach((off, i) => spChunk.writeUInt32LE(off, spHeaderSize + i * 4));
  strData.copy(spChunk, spStringsStart);

  // Таблица ресурсов
  const resMapChunk = Buffer.alloc(8 + resIds.length * 4);
  resMapChunk.writeUInt16LE(0x0180, 0);
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunk.length, 4);
  resIds.forEach((rid, i) => resMapChunk.writeUInt32LE(rid, 8 + i * 4));

  const nsUri = strMap.get('http://schemas.android.com/apk/res/android');
  const nsPrefix = strMap.get('android');

  let xmlBody = Buffer.alloc(24);
  xmlBody.writeUInt16LE(0x0100, 0);
  xmlBody.writeUInt16LE(16, 2);
  xmlBody.writeUInt32LE(24, 4);
  xmlBody.writeUInt32LE(1, 8);
  xmlBody.writeUInt32LE(0xffffffff, 12);
  xmlBody.writeUInt32LE(nsPrefix, 16);
  xmlBody.writeUInt32LE(nsUri, 20);

  function startElem(name, attrs) {
    const attrBytes = Buffer.alloc(attrs.length * 20);
    attrs.forEach((a, i) => {
      const off = i * 20;
      attrBytes.writeUInt32LE(a.ns, off);
      attrBytes.writeUInt32LE(a.name, off + 4);
      attrBytes.writeUInt32LE(a.raw, off + 8);
      attrBytes.writeUInt16LE(8, off + 12);
      attrBytes.writeUInt8(0, off + 14);
      attrBytes.writeUInt8(a.type, off + 15);
      attrBytes.writeUInt32LE(a.val, off + 16);
    });

    const chunkSize = 36 + attrBytes.length;
    const elem = Buffer.alloc(36);
    elem.writeUInt16LE(0x0102, 0);
    elem.writeUInt16LE(16, 2);
    elem.writeUInt32LE(chunkSize, 4);
    elem.writeUInt32LE(1, 8);
    elem.writeUInt32LE(0xffffffff, 12);
    elem.writeUInt32LE(0xffffffff, 16);
    elem.writeUInt32LE(strMap.get(name), 20);
    elem.writeUInt16LE(0x0014, 24);
    elem.writeUInt16LE(0x0014, 26);
    elem.writeUInt16LE(attrs.length, 28);
    elem.writeUInt16LE(0, 30);
    elem.writeUInt16LE(0, 32);
    elem.writeUInt16LE(0, 34);

    return Buffer.concat([elem, attrBytes]);
  }

  function endElem(name) {
    const elem = Buffer.alloc(24);
    elem.writeUInt16LE(0x0103, 0);
    elem.writeUInt16LE(16, 2);
    elem.writeUInt32LE(24, 4);
    elem.writeUInt32LE(1, 8);
    elem.writeUInt32LE(0xffffffff, 12);
    elem.writeUInt32LE(0xffffffff, 16);
    elem.writeUInt32LE(strMap.get(name), 20);
    return elem;
  }

  xmlBody = Buffer.concat([
    xmlBody,
    startElem('manifest', [
      { ns: 0xffffffff, name: strMap.get('package'), raw: strMap.get('com.mir.game'), type: 0x03, val: strMap.get('com.mir.game') },
      { ns: nsUri, name: strMap.get('versionCode'), raw: 0xffffffff, type: 0x10, val: 1 },
      { ns: nsUri, name: strMap.get('versionName'), raw: strMap.get('0.3.0'), type: 0x03, val: strMap.get('0.3.0') },
    ]),
    startElem('uses-permission', [
      { ns: nsUri, name: strMap.get('name'), raw: strMap.get('android.permission.INTERNET'), type: 0x03, val: strMap.get('android.permission.INTERNET') },
    ]),
    endElem('uses-permission'),
    startElem('uses-permission', [
      { ns: nsUri, name: strMap.get('name'), raw: strMap.get('android.permission.ACCESS_NETWORK_STATE'), type: 0x03, val: strMap.get('android.permission.ACCESS_NETWORK_STATE') },
    ]),
    endElem('uses-permission'),
    startElem('application', [
      { ns: nsUri, name: strMap.get('label'), raw: strMap.get('MIR'), type: 0x03, val: strMap.get('MIR') },
      { ns: nsUri, name: strMap.get('icon'), raw: strMap.get('@mipmap/ic_launcher'), type: 0x01, val: 0x7f020000 },
      { ns: nsUri, name: strMap.get('hardwareAccelerated'), raw: 0xffffffff, type: 0x12, val: 0xffffffff },
      { ns: nsUri, name: strMap.get('allowBackup'), raw: 0xffffffff, type: 0x12, val: 0xffffffff },
      { ns: nsUri, name: strMap.get('supportsRtl'), raw: 0xffffffff, type: 0x12, val: 0xffffffff },
    ]),
    startElem('activity', [
      { ns: nsUri, name: strMap.get('name'), raw: strMap.get('com.mir.game.MainActivity'), type: 0x03, val: strMap.get('com.mir.game.MainActivity') },
      { ns: nsUri, name: strMap.get('label'), raw: strMap.get('MIR'), type: 0x03, val: strMap.get('MIR') },
      { ns: nsUri, name: strMap.get('theme'), raw: 0xffffffff, type: 0x01, val: 0x01030007 },
      { ns: nsUri, name: strMap.get('configChanges'), raw: 0xffffffff, type: 0x11, val: 0x000004a0 },
      { ns: nsUri, name: strMap.get('exported'), raw: 0xffffffff, type: 0x12, val: 0xffffffff },
    ]),
    startElem('intent-filter', []),
    startElem('action', [
      { ns: nsUri, name: strMap.get('name'), raw: strMap.get('android.intent.action.MAIN'), type: 0x03, val: strMap.get('android.intent.action.MAIN') },
    ]),
    endElem('action'),
    startElem('category', [
      { ns: nsUri, name: strMap.get('name'), raw: strMap.get('android.intent.category.LAUNCHER'), type: 0x03, val: strMap.get('android.intent.category.LAUNCHER') },
    ]),
    endElem('category'),
    endElem('intent-filter'),
    endElem('activity'),
    endElem('application'),
    endElem('manifest'),
  ]);

  const endNs = Buffer.alloc(24);
  endNs.writeUInt16LE(0x0101, 0);
  endNs.writeUInt16LE(16, 2);
  endNs.writeUInt32LE(24, 4);
  endNs.writeUInt32LE(1, 8);
  endNs.writeUInt32LE(0xffffffff, 12);
  endNs.writeUInt32LE(nsPrefix, 16);
  endNs.writeUInt32LE(nsUri, 20);

  xmlBody = Buffer.concat([xmlBody, endNs]);

  const totalSize = 8 + spChunk.length + resMapChunk.length + xmlBody.length;
  const axml = Buffer.alloc(totalSize);
  axml.writeUInt16LE(0x0003, 0);
  axml.writeUInt16LE(8, 2);
  axml.writeUInt32LE(totalSize, 4);

  spChunk.copy(axml, 8);
  resMapChunk.copy(axml, 8 + spChunk.length);
  xmlBody.copy(axml, 8 + spChunk.length + resMapChunk.length);

  return axml;
}

// Генератор resources.arsc
function generateArsc() {
  const globalStrings = [
    'MIR',
    'res/mipmap-mdpi/ic_launcher.png',
    'res/mipmap-hdpi/ic_launcher.png',
    'res/mipmap-xhdpi/ic_launcher.png',
    'res/mipmap-xxhdpi/ic_launcher.png',
    'res/mipmap-xxxhdpi/ic_launcher.png',
  ];

  function makeSp(strings) {
    const offsets = [];
    let strData = Buffer.alloc(0);
    for (const s of strings) {
      offsets.push(strData.length);
      const sUtf16 = Buffer.from(s, 'utf16le');
      const lenBuf = Buffer.alloc(2);
      lenBuf.writeUInt16LE(s.length, 0);
      strData = Buffer.concat([strData, lenBuf, sUtf16, Buffer.from([0, 0])]);
    }
    const pad = (4 - (strData.length % 4)) % 4;
    if (pad > 0) strData = Buffer.concat([strData, Buffer.alloc(pad)]);

    const spHeaderSize = 28;
    const spOffsetsSize = strings.length * 4;
    const spStringsStart = spHeaderSize + spOffsetsSize;
    const spChunkSize = spStringsStart + strData.length;

    const spChunk = Buffer.alloc(spChunkSize);
    spChunk.writeUInt16LE(0x0001, 0);
    spChunk.writeUInt16LE(spHeaderSize, 2);
    spChunk.writeUInt32LE(spChunkSize, 4);
    spChunk.writeUInt32LE(strings.length, 8);
    spChunk.writeUInt32LE(0, 12);
    spChunk.writeUInt32LE(0, 16);
    spChunk.writeUInt32LE(spStringsStart, 20);
    spChunk.writeUInt32LE(0, 24);

    offsets.forEach((off, i) => spChunk.writeUInt32LE(off, spHeaderSize + i * 4));
    strData.copy(spChunk, spStringsStart);
    return spChunk;
  }

  const globalSp = makeSp(globalStrings);
  const typeSp = makeSp(['attr', 'string', 'mipmap']);
  const keySp = makeSp(['app_name', 'ic_launcher']);

  const pkgNameBuf = Buffer.alloc(256);
  Buffer.from('com.mir.game', 'utf16le').copy(pkgNameBuf);

  const tsString = Buffer.alloc(24);
  tsString.writeUInt16LE(0x0202, 0);
  tsString.writeUInt16LE(16, 2);
  tsString.writeUInt32LE(24, 4);
  tsString.writeUInt8(2, 8); // id: 2 (string)
  tsString.writeUInt32LE(1, 12); // count: 1

  const tsMipmap = Buffer.alloc(24);
  tsMipmap.writeUInt16LE(0x0202, 0);
  tsMipmap.writeUInt16LE(16, 2);
  tsMipmap.writeUInt32LE(24, 4);
  tsMipmap.writeUInt8(3, 8); // id: 3 (mipmap)
  tsMipmap.writeUInt32LE(1, 12); // count: 1

  const config = Buffer.alloc(64);
  config.writeUInt32LE(64, 0);

  const entryStr = Buffer.alloc(16);
  entryStr.writeUInt16LE(8, 0); // size
  entryStr.writeUInt16LE(0, 2); // flags
  entryStr.writeUInt32LE(0, 4); // key (app_name)
  entryStr.writeUInt16LE(8, 8); // res_value size
  entryStr.writeUInt8(0, 10);
  entryStr.writeUInt8(0x03, 11); // STRING
  entryStr.writeUInt32LE(0, 12); // data (MIR)

  const typeStrHdrSize = 80;
  const typeStrEntriesStart = typeStrHdrSize + 4;
  const typeStrSize = typeStrEntriesStart + entryStr.length;

  let typeStrChunk = Buffer.alloc(typeStrHdrSize);
  typeStrChunk.writeUInt16LE(0x0201, 0);
  typeStrChunk.writeUInt16LE(typeStrHdrSize, 2);
  typeStrChunk.writeUInt32LE(typeStrSize, 4);
  typeStrChunk.writeUInt8(2, 8);
  typeStrChunk.writeUInt8(0, 9);
  typeStrChunk.writeUInt16LE(0, 10);
  typeStrChunk.writeUInt32LE(1, 12);
  typeStrChunk.writeUInt32LE(typeStrEntriesStart, 16);
  config.copy(typeStrChunk, 16);

  const typeStrOffs = Buffer.alloc(4);
  typeStrOffs.writeUInt32LE(0, 0);
  typeStrChunk = Buffer.concat([typeStrChunk, typeStrOffs, entryStr]);

  const entryMipmap = Buffer.alloc(16);
  entryMipmap.writeUInt16LE(8, 0);
  entryMipmap.writeUInt16LE(0, 2);
  entryMipmap.writeUInt32LE(1, 4); // key (ic_launcher)
  entryMipmap.writeUInt16LE(8, 8);
  entryMipmap.writeUInt8(0, 10);
  entryMipmap.writeUInt8(0x03, 11);
  entryMipmap.writeUInt32LE(4, 12); // data (index 4 = xxhdpi)

  const typeMipmapHdrSize = 80;
  const typeMipmapEntriesStart = typeMipmapHdrSize + 4;
  const typeMipmapSize = typeMipmapEntriesStart + entryMipmap.length;

  let typeMipmapChunk = Buffer.alloc(typeMipmapHdrSize);
  typeMipmapChunk.writeUInt16LE(0x0201, 0);
  typeMipmapChunk.writeUInt16LE(typeMipmapHdrSize, 2);
  typeMipmapChunk.writeUInt32LE(typeMipmapSize, 4);
  typeMipmapChunk.writeUInt8(3, 8);
  typeMipmapChunk.writeUInt8(0, 9);
  typeMipmapChunk.writeUInt16LE(0, 10);
  typeMipmapChunk.writeUInt32LE(1, 12);
  typeMipmapChunk.writeUInt32LE(typeMipmapEntriesStart, 16);
  config.copy(typeMipmapChunk, 16);

  const typeMipmapOffs = Buffer.alloc(4);
  typeMipmapOffs.writeUInt32LE(0, 0);
  typeMipmapChunk = Buffer.concat([typeMipmapChunk, typeMipmapOffs, entryMipmap]);

  const pkgHdrSize = 288;
  const typeSpOffset = pkgHdrSize;
  const keySpOffset = typeSpOffset + typeSp.length;

  const pkgBody = Buffer.concat([
    typeSp,
    keySp,
    tsString,
    typeStrChunk,
    tsMipmap,
    typeMipmapChunk,
  ]);

  const pkgSize = pkgHdrSize + pkgBody.length;
  const pkgChunkHdr = Buffer.alloc(pkgHdrSize);
  pkgChunkHdr.writeUInt16LE(0x0200, 0);
  pkgChunkHdr.writeUInt16LE(pkgHdrSize, 2);
  pkgChunkHdr.writeUInt32LE(pkgSize, 4);
  pkgChunkHdr.writeUInt32LE(0x7f, 8);
  pkgNameBuf.copy(pkgChunkHdr, 12);
  pkgChunkHdr.writeUInt32LE(typeSpOffset, 268);
  pkgChunkHdr.writeUInt32LE(3, 272);
  pkgChunkHdr.writeUInt32LE(keySpOffset, 276);
  pkgChunkHdr.writeUInt32LE(2, 280);

  const pkgChunk = Buffer.concat([pkgChunkHdr, pkgBody]);

  const tblHdrSize = 12;
  const tblSize = tblHdrSize + globalSp.length + pkgChunk.length;
  const tblHdr = Buffer.alloc(tblHdrSize);
  tblHdr.writeUInt16LE(0x0002, 0);
  tblHdr.writeUInt16LE(tblHdrSize, 2);
  tblHdr.writeUInt32LE(tblSize, 4);
  tblHdr.writeUInt32LE(1, 8);

  return Buffer.concat([tblHdr, globalSp, pkgChunk]);
}

// Генератор подписи APK (PKCS#7 / JAR Signature Scheme v1)
function createSignedApk(files) {
  // files: array of { path: string, data: Buffer, uncompressed?: boolean }
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

  // 1. MANIFEST.MF
  let manifestMf = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (MIR Game Studio)\r\n\r\n';
  const fileDigests = new Map();

  for (const file of files) {
    const hash = crypto.createHash('sha256').update(file.data).digest('base64');
    fileDigests.set(file.path, hash);
    manifestMf += `Name: ${file.path}\r\nSHA-256-Digest: ${hash}\r\n\r\n`;
  }
  const manifestMfBuf = Buffer.from(manifestMf, 'utf8');

  // 2. CERT.SF
  const manifestHash = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');
  let certSf = 'Signature-Version: 1.0\r\nCreated-By: 1.0 (MIR Game Studio)\r\n';
  certSf += `SHA-256-Digest-Manifest: ${manifestHash}\r\n\r\n`;

  for (const file of files) {
    const entryData = `Name: ${file.path}\r\nSHA-256-Digest: ${fileDigests.get(file.path)}\r\n\r\n`;
    const entryHash = crypto.createHash('sha256').update(Buffer.from(entryData, 'utf8')).digest('base64');
    certSf += `Name: ${file.path}\r\nSHA-256-Digest: ${entryHash}\r\n\r\n`;
  }
  const certSfBuf = Buffer.from(certSf, 'utf8');

  // 3. CERT.RSA (PKCS#7 SignedData)
  function derLength(len) {
    if (len < 128) return Buffer.from([len]);
    const bytes = [];
    let temp = len;
    while (temp > 0) {
      bytes.unshift(temp & 0xff);
      temp >>= 8;
    }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }
  function derTag(tag, content) {
    return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
  }
  function derSeq(...items) { return derTag(0x30, Buffer.concat(items)); }
  function derSet(...items) { return derTag(0x31, Buffer.concat(items)); }
  function derInt(val) {
    if (typeof val === 'number') {
      const buf = Buffer.alloc(val > 127 ? 2 : 1);
      if (val > 127) { buf[0] = 0; buf[1] = val; }
      else { buf[0] = val; }
      return derTag(0x02, buf);
    }
    return derTag(0x02, val);
  }
  function derOctetString(buf) { return derTag(0x04, buf); }
  function derPrintableString(str) { return derTag(0x13, Buffer.from(str, 'ascii')); }
  function derUtcTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const s = String(date.getUTCFullYear()).slice(2) + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
    return derTag(0x17, Buffer.from(s, 'ascii'));
  }
  function derOid(oidStr) {
    const parts = oidStr.split('.').map(Number);
    const bytes = [parts[0] * 40 + parts[1]];
    for (let i = 2; i < parts.length; i++) {
      let v = parts[i];
      const enc = [v & 0x7f];
      v >>= 7;
      while (v > 0) {
        enc.unshift(0x80 | (v & 0x7f));
        v >>= 7;
      }
      bytes.push(...enc);
    }
    return derTag(0x06, Buffer.from(bytes));
  }

  const sha256Oid = derOid('2.16.840.1.101.3.4.2.1');
  const sha256WithRsa = derSeq(derOid('1.2.840.1.113549.1.1.11'), derTag(0x05, Buffer.alloc(0)));
  const nullParam = derTag(0x05, Buffer.alloc(0));

  const nameSeq = derSeq(
    derSet(derSeq(derOid('2.5.4.6'), derPrintableString('RU'))),
    derSet(derSeq(derOid('2.5.4.10'), derPrintableString('MIR Game'))),
    derSet(derSeq(derOid('2.5.4.3'), derPrintableString('MIR'))),
  );

  const spkiDer = keys.publicKey.export({ type: 'spki', format: 'der' });
  const serial = derInt(Buffer.from([0x01, 0x23, 0x45, 0x67]));
  const validity = derSeq(derUtcTime(new Date(2025, 0, 1)), derUtcTime(new Date(2050, 0, 1)));

  const tbsCert = derSeq(
    derTag(0xa0, derInt(2)),
    serial,
    sha256WithRsa,
    nameSeq,
    validity,
    nameSeq,
    spkiDer,
  );

  const certSig = crypto.sign('SHA256', tbsCert, keys.privateKey);
  const certSigBits = derTag(0x03, Buffer.concat([Buffer.from([0x00]), certSig]));
  const x509Cert = derSeq(tbsCert, sha256WithRsa, certSigBits);

  const signerInfo = derSeq(
    derInt(1),
    derSeq(nameSeq, serial),
    derSeq(sha256Oid, nullParam),
    sha256WithRsa,
    derOctetString(crypto.sign('SHA256', certSfBuf, keys.privateKey)),
  );

  const signedData = derSeq(
    derInt(1),
    derSet(derSeq(sha256Oid, nullParam)),
    derSeq(derOid('1.2.840.1.113549.1.7.1')),
    derTag(0xa0, x509Cert),
    derSet(signerInfo),
  );

  const pkcs7 = derSeq(
    derOid('1.2.840.1.113549.1.7.2'),
    derTag(0xa0, signedData),
  );

  // Добавляем служебные файлы подписи
  const allFiles = [
    ...files,
    { path: 'META-INF/MANIFEST.MF', data: manifestMfBuf },
    { path: 'META-INF/CERT.SF', data: certSfBuf },
    { path: 'META-INF/CERT.RSA', data: pkcs7 },
  ];

  // 4. Сборка ZIP архива с выравниванием (Zipalign 4-byte)
  let zipBody = Buffer.alloc(0);
  const cdEntries = [];

  // CRC-32 таблица
  function crc32(buf) {
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }
  const crcTable = (() => {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();

  for (const file of allFiles) {
    const nameBuf = Buffer.from(file.path, 'utf8');
    const isStored = file.uncompressed || file.path.endsWith('.arsc') || file.path.endsWith('.png');

    let compData;
    let method;
    if (isStored) {
      compData = file.data;
      method = 0; // Stored
    } else {
      compData = zlib.deflateRawSync(file.data);
      method = 8; // Deflate
    }

    const fileCrc = crc32(file.data);
    const uncompressedSize = file.data.length;
    const compressedSize = compData.length;

    // Выравнивание для uncompressed файлов (4 байта)
    let extra = Buffer.alloc(0);
    if (isStored) {
      const headerLen = 30 + nameBuf.length;
      const currentOffset = zipBody.length;
      const dataOffset = currentOffset + headerLen;
      const pad = (4 - (dataOffset % 4)) % 4;
      if (pad > 0) extra = Buffer.alloc(pad);
    }

    const localHdrOffset = zipBody.length;
    const localHdr = Buffer.alloc(30);
    localHdr.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0, 6); // flags
    localHdr.writeUInt16LE(method, 8);
    localHdr.writeUInt16LE(0, 10); // time
    localHdr.writeUInt16LE(0, 12); // date
    localHdr.writeUInt32LE(fileCrc, 14);
    localHdr.writeUInt32LE(compressedSize, 18);
    localHdr.writeUInt32LE(uncompressedSize, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(extra.length, 28);

    zipBody = Buffer.concat([zipBody, localHdr, nameBuf, extra, compData]);

    // Central Directory Entry
    const cdEntry = Buffer.alloc(46);
    cdEntry.writeUInt32LE(0x02014b50, 0); // CD header signature
    cdEntry.writeUInt16LE(20, 4); // version made by
    cdEntry.writeUInt16LE(20, 6); // version needed
    cdEntry.writeUInt16LE(0, 8); // flags
    cdEntry.writeUInt16LE(method, 10);
    cdEntry.writeUInt16LE(0, 12); // time
    cdEntry.writeUInt16LE(0, 14); // date
    cdEntry.writeUInt32LE(fileCrc, 16);
    cdEntry.writeUInt32LE(compressedSize, 20);
    cdEntry.writeUInt32LE(uncompressedSize, 24);
    cdEntry.writeUInt16LE(nameBuf.length, 28);
    cdEntry.writeUInt16LE(0, 30); // extra length
    cdEntry.writeUInt16LE(0, 32); // comment length
    cdEntry.writeUInt16LE(0, 34); // disk number
    cdEntry.writeUInt16LE(0, 36); // internal attr
    cdEntry.writeUInt32LE(0, 38); // external attr
    cdEntry.writeUInt32LE(localHdrOffset, 42);

    cdEntries.push(Buffer.concat([cdEntry, nameBuf]));
  }

  const cdStart = zipBody.length;
  const cdData = Buffer.concat(cdEntries);
  const cdSize = cdData.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD
  eocd.writeUInt16LE(allFiles.length, 8); // total entries on disk
  eocd.writeUInt16LE(allFiles.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([zipBody, cdData, eocd]);
}

// Загрузка иконок
const icon192 = existsSync('public/icons/icon-192.png') ? readFileSync('public/icons/icon-192.png') : Buffer.alloc(0);
const icon512 = existsSync('public/icons/icon-512.png') ? readFileSync('public/icons/icon-512.png') : icon192;

const apkFiles = [
  { path: 'AndroidManifest.xml', data: generateAxml(), uncompressed: false },
  { path: 'classes.dex', data: generateDex(), uncompressed: false },
  { path: 'resources.arsc', data: generateArsc(), uncompressed: true },
  { path: 'res/mipmap-mdpi/ic_launcher.png', data: icon192, uncompressed: true },
  { path: 'res/mipmap-hdpi/ic_launcher.png', data: icon192, uncompressed: true },
  { path: 'res/mipmap-xhdpi/ic_launcher.png', data: icon192, uncompressed: true },
  { path: 'res/mipmap-xxhdpi/ic_launcher.png', data: icon192, uncompressed: true },
  { path: 'res/mipmap-xxxhdpi/ic_launcher.png', data: icon512, uncompressed: true },
  { path: 'assets/mir.html', data: readFileSync('mir.html'), uncompressed: false },
];

if (!existsSync('dist-app')) mkdirSync('dist-app', { recursive: true });

const apkBuffer = createSignedApk(apkFiles);
writeFileSync('dist-app/MIR.apk', apkBuffer);
writeFileSync('MIR.apk', apkBuffer);

console.log('');
console.log('✓ Android APK успешно собран и подписан:');
console.log('    dist-app/MIR.apk  (и копия в корне: MIR.apk)');
console.log(`    Размер: ${(apkBuffer.length / 1024).toFixed(1)} КБ`);
console.log('    Установка: отправьте MIR.apk на телефон через Telegram/диск и нажмите Установить.');
console.log('');
