/* Разбор готового APK обратно: ZIP, AndroidManifest.xml (AXML),
   resources.arsc, classes.dex и подписи v1/v2.

   Зачем отдельный модуль: сборщик (`build-apk.mjs`) после записи файла
   читает его этими же функциями и пишет в журнал то, что реально попало в
   архив, а не то, что он собирался записать. А `apk-doctor.mjs` теми же
   функциями разбирает любой уже существующий .apk — хоть собранный год
   назад, хоть присланный с телефона. Один разбор, два потребителя:
   расхождений между «сборщик считает, что всё хорошо» и «проверяльщик
   смотрит на файл» быть не может.

   Всё без зависимостей: только node:zlib и node:crypto.
*/

import zlib from 'node:zlib';
import crypto from 'node:crypto';

/* ============================================================
   ZIP
   ============================================================ */

/**
 * Разбирает ZIP-контейнер APK: центральный каталог + локальные заголовки.
 * Возвращает список записей с данными и всеми полями, которые важны
 * Android: метод сжатия, выравнивание данных, CRC, смещения.
 */
export function readZip(buf) {
  const problems = [];

  /* EOCD ищем с конца: комментарий архива нам не нужен, но файл может
     быть «дописан» чем-то лишним — тогда об этом честно сообщаем. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: не найден End Of Central Directory — файл обрезан или это не ZIP/APK');
  if (eocd !== buf.length - 22) {
    problems.push(`после конца архива ещё ${buf.length - 22 - eocd} байт мусора (архив дописан после сборки)`);
  }

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const commentLen = buf.readUInt16LE(eocd + 20);

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`ZIP: битая запись №${i + 1} в центральном каталоге`);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    const entry = { index: i, name, method, crc, compSize, size, flags, localOffset };

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      problems.push(`${name}: локальный заголовок не на месте (смещение ${localOffset})`);
    } else {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const lName = buf.subarray(localOffset + 30, localOffset + 30 + lNameLen).toString('utf8');
      entry.localMethod = buf.readUInt16LE(localOffset + 8);
      entry.localCrc = buf.readUInt32LE(localOffset + 14);
      entry.localCompSize = buf.readUInt32LE(localOffset + 18);
      entry.localSize = buf.readUInt32LE(localOffset + 22);
      entry.extraLen = lExtraLen;
      entry.dataOffset = localOffset + 30 + lNameLen + lExtraLen;
      entry.raw = buf.subarray(entry.dataOffset, entry.dataOffset + compSize);

      if (lName !== name) problems.push(`${name}: имя в локальном заголовке другое (${lName})`);
      if (entry.localMethod !== method) problems.push(`${name}: метод сжатия в заголовках не совпадает`);
      if (entry.localCrc !== crc) problems.push(`${name}: CRC в заголовках не совпадает`);
      if (entry.localCompSize !== compSize) problems.push(`${name}: сжатый размер в заголовках не совпадает`);
      if (entry.localSize !== size) problems.push(`${name}: исходный размер в заголовках не совпадает`);
    }

    try {
      entry.data = method === 0 ? Buffer.from(entry.raw) : zlib.inflateRawSync(entry.raw);
    } catch (err) {
      entry.data = Buffer.alloc(0);
      problems.push(`${name}: не распаковывается (${err.message})`);
    }
    entry.aligned = entry.dataOffset !== undefined ? entry.dataOffset % 4 === 0 : false;
    entry.align4k = entry.dataOffset !== undefined ? entry.dataOffset % 4096 === 0 : false;
    entry.crcOk = crc32(entry.data) === crc;
    if (!entry.crcOk) problems.push(`${name}: контрольная сумма содержимого не сходится`);
    if (entry.data.length !== size) problems.push(`${name}: распакованный размер ${entry.data.length} ≠ ${size}`);

    entries.push(entry);
    p += 46 + nameLen + extraLen + commentLength;
  }

  const names = entries.map((e) => e.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  for (const d of new Set(dupes)) problems.push(`в архиве два файла с именем ${d} — Android отвергает такие пакеты`);

  return {
    entries,
    byName: new Map(entries.map((e) => [e.name, e])),
    cdOffset,
    cdSize,
    eocdOffset: eocd,
    commentLen,
    problems,
  };
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

export function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/* ============================================================
   Пул строк ресурсов (общий для AXML и ARSC)
   ============================================================ */

function readStringPool(buf, off) {
  const type = buf.readUInt16LE(off);
  if (type !== 0x0001) throw new Error(`пул строк: ожидался тип 0x0001, получен 0x${type.toString(16)}`);
  const headerSize = buf.readUInt16LE(off + 2);
  const count = buf.readUInt32LE(off + 8);
  const flags = buf.readUInt32LE(off + 16);
  const stringsStart = buf.readUInt32LE(off + 20);
  const utf8 = (flags & (1 << 8)) !== 0;

  const strings = [];
  for (let i = 0; i < count; i++) {
    const strOff = off + stringsStart + buf.readUInt32LE(off + headerSize + i * 4);
    if (utf8) {
      let p = strOff;
      const skip = () => {
        let v = buf[p++];
        if (v & 0x80) v = ((v & 0x7f) << 8) | buf[p++];
        return v;
      };
      skip(); // длина в символах
      const bytes = skip(); // длина в байтах
      strings.push(buf.subarray(p, p + bytes).toString('utf8'));
    } else {
      let p = strOff;
      let len = buf.readUInt16LE(p);
      p += 2;
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p);
        p += 2;
      }
      strings.push(buf.subarray(p, p + len * 2).toString('utf16le'));
    }
  }
  return { strings, utf8, size: buf.readUInt32LE(off + 4) };
}

/* ============================================================
   AndroidManifest.xml (AXML)
   ============================================================ */

/* Имена системных атрибутов по их resId — чтобы в отчёте было
   «android:targetSdkVersion», а не «0x01010270». */
export const ANDROID_ATTRS = {
  0x01010000: 'theme',
  0x01010001: 'label',
  0x01010002: 'icon',
  0x01010003: 'name',
  0x01010010: 'exported',
  0x0101001d: 'launchMode',
  0x0101001f: 'configChanges',
  0x0101020c: 'minSdkVersion',
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x0101022b: 'windowSoftInputMode',
  0x01010270: 'targetSdkVersion',
  0x01010280: 'allowBackup',
  0x010102d3: 'hardwareAccelerated',
  0x010103af: 'supportsRtl',
  0x010104ec: 'usesCleartextTraffic',
  0x01010640: 'roundIcon',
  0x0101048f: 'extractNativeLibs',
};

/** Известные системные темы — чтобы проверить, что ссылка не выдумана. */
export const ANDROID_THEMES = {
  0x01030224: 'Theme.Material',
  0x0103022e: 'Theme.Material.NoActionBar',
  0x0103022f: 'Theme.Material.NoActionBar.Fullscreen',
  0x01030237: 'Theme.Material.Light',
  0x01030241: 'Theme.Material.Light.NoActionBar',
  0x01030005: 'Theme.NoTitleBar',
  0x01030007: 'Theme.NoTitleBar.Fullscreen',
  0x01030128: 'Theme.Holo',
  0x0103000a: 'Theme.Black.NoTitleBar',
};

/**
 * Разбирает бинарный AndroidManifest.xml и возвращает дерево + текстовый XML.
 * Делает именно то, что делает PackageParser на телефоне: читает пул строк,
 * карту ресурсов и дерево элементов.
 */
export function decodeAxml(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) throw new Error('AXML: неверный тип корневого чанка (это не AndroidManifest.xml)');
  const fileSize = buf.readUInt32LE(4);
  if (fileSize !== buf.length) throw new Error(`AXML: размер в заголовке ${fileSize} ≠ размеру файла ${buf.length}`);

  const pool = readStringPool(buf, 8);
  const str = (i) => (i === 0xffffffff || i === -1 ? null : pool.strings[i] ?? `<строка ${i}?>`);

  let p = 8 + pool.size;
  let resMap = [];
  const stack = [];
  let root = null;
  const lines = [];
  let depth = 0;

  const valueText = (type, data, rawIdx) => {
    switch (type) {
      case 0x03:
        return JSON.stringify(str(rawIdx) ?? '');
      case 0x10:
        return String(data | 0);
      case 0x11:
        return `0x${(data >>> 0).toString(16).padStart(8, '0')}`;
      case 0x12:
        return data === 0 ? 'false' : 'true';
      case 0x01: {
        const id = data >>> 0;
        if ((id & 0xff000000) === 0x01000000) return `@android:0x${id.toString(16)}${ANDROID_THEMES[id] ? ` (${ANDROID_THEMES[id]})` : ''}`;
        return `@0x${id.toString(16)}`;
      }
      default:
        return `тип 0x${type.toString(16)}: 0x${(data >>> 0).toString(16)}`;
    }
  };

  while (p + 8 <= buf.length) {
    const chunkType = buf.readUInt16LE(p);
    const chunkSize = buf.readUInt32LE(p + 4);
    if (chunkSize <= 0) throw new Error(`AXML: нулевой размер чанка на смещении ${p}`);

    if (chunkType === 0x0180) {
      resMap = [];
      for (let i = 0; i < (chunkSize - 8) / 4; i++) resMap.push(buf.readUInt32LE(p + 8 + i * 4));
    } else if (chunkType === 0x0102) {
      const tag = str(buf.readUInt32LE(p + 20));
      const attrStart = buf.readUInt16LE(p + 24);
      const attrSize = buf.readUInt16LE(p + 26);
      const attrCount = buf.readUInt16LE(p + 28);
      const attrs = [];
      for (let i = 0; i < attrCount; i++) {
        const o = p + 16 + attrStart + i * attrSize;
        const nsIdx = buf.readUInt32LE(o);
        const nameIdx = buf.readUInt32LE(o + 4);
        const rawIdx = buf.readUInt32LE(o + 8);
        const type = buf.readUInt8(o + 15);
        const data = buf.readUInt32LE(o + 16);
        const resId = resMap[nameIdx];
        const ns = nsIdx === 0xffffffff ? '' : 'android:';
        const name = str(nameIdx) || ANDROID_ATTRS[resId] || `attr0x${(resId ?? 0).toString(16)}`;
        attrs.push({ ns, name: `${ns}${name}`, resId, type, data, raw: str(rawIdx), text: valueText(type, data, rawIdx) });
      }
      const node = { tag, attrs, children: [], parent: stack[stack.length - 1] ?? null };
      if (stack.length) stack[stack.length - 1].children.push(node);
      else root = node;
      stack.push(node);
      lines.push(`${'  '.repeat(depth++)}<${tag}${attrs.map((a) => ` ${a.name}=${a.text}`).join('')}>`);
    } else if (chunkType === 0x0103) {
      const tag = str(buf.readUInt32LE(p + 20));
      stack.pop();
      lines.push(`${'  '.repeat(Math.max(0, --depth))}</${tag}>`);
    }
    p += chunkSize;
  }

  if (!root) throw new Error('AXML: в манифесте нет ни одного элемента');

  const find = (node, tag) => {
    if (node.tag === tag) return node;
    for (const child of node.children) {
      const hit = find(child, tag);
      if (hit) return hit;
    }
    return null;
  };
  const attr = (node, name) => node?.attrs.find((a) => a.name === name || a.name === `android:${name}`);

  return { root, xml: lines.join('\n'), strings: pool.strings, resMap, find, attr };
}

/* ============================================================
   resources.arsc
   ============================================================ */

/** Разбирает таблицу ресурсов и возвращает список записей с их id. */
export function parseArsc(buf) {
  if (buf.readUInt16LE(0) !== 0x0002) throw new Error('ARSC: неверный тип корневого чанка');
  const size = buf.readUInt32LE(4);
  if (size !== buf.length) throw new Error(`ARSC: размер в заголовке ${size} ≠ размеру файла ${buf.length}`);
  const headerSize = buf.readUInt16LE(2);
  const packageCount = buf.readUInt32LE(8);

  const globalPool = readStringPool(buf, headerSize);
  const packages = [];

  let p = headerSize + globalPool.size;
  for (let i = 0; i < packageCount && p < buf.length; i++) {
    const pkgType = buf.readUInt16LE(p);
    const pkgHeaderSize = buf.readUInt16LE(p + 2);
    const pkgSize = buf.readUInt32LE(p + 4);
    if (pkgType !== 0x0200) throw new Error(`ARSC: ожидался пакет, получен чанк 0x${pkgType.toString(16)}`);

    const id = buf.readUInt32LE(p + 8);
    const nameRaw = buf.subarray(p + 12, p + 12 + 256).toString('utf16le');
    const name = nameRaw.slice(0, nameRaw.indexOf('\0') === -1 ? undefined : nameRaw.indexOf('\0'));
    const typeStringsOff = buf.readUInt32LE(p + 268);
    const keyStringsOff = buf.readUInt32LE(p + 276);

    const typePool = readStringPool(buf, p + typeStringsOff);
    const keyPool = readStringPool(buf, p + keyStringsOff);

    const entries = [];
    let q = p + pkgHeaderSize;
    while (q < p + pkgSize) {
      const chunkType = buf.readUInt16LE(q);
      const chunkHeader = buf.readUInt16LE(q + 2);
      const chunkSize = buf.readUInt32LE(q + 4);
      if (chunkSize <= 0) break;
      if (chunkType === 0x0201) {
        const typeId = buf.readUInt8(q + 8);
        const entryCount = buf.readUInt32LE(q + 12);
        const entriesStart = buf.readUInt32LE(q + 16);
        for (let e = 0; e < entryCount; e++) {
          const offset = buf.readUInt32LE(q + chunkHeader + e * 4);
          if (offset === 0xffffffff) continue;
          const eo = q + entriesStart + offset;
          const keyIdx = buf.readUInt32LE(eo + 4);
          const valueType = buf.readUInt8(eo + 8 + 3);
          const valueData = buf.readUInt32LE(eo + 8 + 4);
          entries.push({
            id: (id << 24) | (typeId << 16) | e,
            type: typePool.strings[typeId - 1] ?? `тип${typeId}`,
            key: keyPool.strings[keyIdx] ?? `ключ${keyIdx}`,
            valueType,
            value: valueType === 0x03 ? globalPool.strings[valueData] : valueData,
          });
        }
      }
      q += chunkSize;
    }

    packages.push({ id, name, types: typePool.strings, keys: keyPool.strings, entries });
    p += pkgSize;
  }

  const all = packages.flatMap((pkg) => pkg.entries);
  return {
    packages,
    strings: globalPool.strings,
    entries: all,
    resolve: (resId) => all.find((e) => e.id === (resId >>> 0)) ?? null,
  };
}

/* ============================================================
   classes.dex
   ============================================================ */

const DEX_OPCODES = {
  0x00: 'nop',
  0x0c: 'move-result-object',
  0x0d: 'move-exception',
  0x0e: 'return-void',
  0x12: 'const/4',
  0x1a: 'const-string',
  0x22: 'new-instance',
  0x28: 'goto',
  0x6e: 'invoke-virtual',
  0x6f: 'invoke-super',
  0x70: 'invoke-direct',
  0x71: 'invoke-static',
  0x72: 'invoke-interface',
};

/** Разбирает classes.dex: заголовок, пулы, классы, методы и байт-код. */
export function parseDex(buf) {
  const problems = [];
  const magic = buf.subarray(0, 8).toString('binary');
  if (!magic.startsWith('dex\n')) throw new Error('DEX: неверная сигнатура — это не classes.dex');

  const header = {
    magic: magic.replace(/\0/g, ''),
    checksum: buf.readUInt32LE(8),
    fileSize: buf.readUInt32LE(32),
    headerSize: buf.readUInt32LE(36),
    endianTag: buf.readUInt32LE(40),
    mapOff: buf.readUInt32LE(52),
    stringIdsSize: buf.readUInt32LE(56),
    stringIdsOff: buf.readUInt32LE(60),
    typeIdsSize: buf.readUInt32LE(64),
    typeIdsOff: buf.readUInt32LE(68),
    protoIdsSize: buf.readUInt32LE(72),
    protoIdsOff: buf.readUInt32LE(76),
    fieldIdsSize: buf.readUInt32LE(80),
    fieldIdsOff: buf.readUInt32LE(84),
    methodIdsSize: buf.readUInt32LE(88),
    methodIdsOff: buf.readUInt32LE(92),
    classDefsSize: buf.readUInt32LE(96),
    classDefsOff: buf.readUInt32LE(100),
    dataSize: buf.readUInt32LE(104),
    dataOff: buf.readUInt32LE(108),
  };

  if (header.fileSize !== buf.length) problems.push(`file_size ${header.fileSize} ≠ размеру файла ${buf.length}`);
  if (header.endianTag !== 0x12345678) problems.push('endian_tag не 0x12345678');
  const sha1 = crypto.createHash('sha1').update(buf.subarray(32)).digest();
  if (!sha1.equals(buf.subarray(12, 32))) problems.push('SHA-1 подпись в заголовке не совпадает с содержимым');
  if (adler32(buf.subarray(12)) !== header.checksum) problems.push('adler32 в заголовке не совпадает с содержимым');

  const readUleb = (off) => {
    let result = 0;
    let shift = 0;
    let p = off;
    for (;;) {
      const b = buf[p++];
      result |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return { value: result >>> 0, next: p };
  };

  const strings = [];
  for (let i = 0; i < header.stringIdsSize; i++) {
    const off = buf.readUInt32LE(header.stringIdsOff + i * 4);
    const { next } = readUleb(off);
    const end = buf.indexOf(0, next);
    strings.push(buf.subarray(next, end).toString('utf8'));
  }

  const types = [];
  for (let i = 0; i < header.typeIdsSize; i++) types.push(strings[buf.readUInt32LE(header.typeIdsOff + i * 4)]);

  const protos = [];
  for (let i = 0; i < header.protoIdsSize; i++) {
    const o = header.protoIdsOff + i * 12;
    const shorty = strings[buf.readUInt32LE(o)];
    const ret = types[buf.readUInt32LE(o + 4)];
    const paramsOff = buf.readUInt32LE(o + 8);
    const params = [];
    if (paramsOff) {
      const count = buf.readUInt32LE(paramsOff);
      for (let k = 0; k < count; k++) params.push(types[buf.readUInt16LE(paramsOff + 4 + k * 2)]);
    }
    protos.push({ shorty, ret, params });
  }

  const methods = [];
  for (let i = 0; i < header.methodIdsSize; i++) {
    const o = header.methodIdsOff + i * 8;
    const cls = types[buf.readUInt16LE(o)];
    const proto = protos[buf.readUInt16LE(o + 2)];
    const name = strings[buf.readUInt32LE(o + 4)];
    methods.push({ cls, name, proto, text: `${cls}->${name}(${proto.params.join('')})${proto.ret}` });
  }

  const disasm = (code, insnsOff, insnsSize) => {
    const lines = [];
    let i = 0;
    while (i < insnsSize) {
      const unit = buf.readUInt16LE(insnsOff + i * 2);
      const op = unit & 0xff;
      const hi = unit >> 8;
      const name = DEX_OPCODES[op] ?? `op0x${op.toString(16)}`;
      let text = name;
      let len = 1;
      if (op >= 0x6e && op <= 0x72) {
        const a = hi >> 4;
        const g = hi & 0xf;
        const midx = buf.readUInt16LE(insnsOff + (i + 1) * 2);
        const regsWord = buf.readUInt16LE(insnsOff + (i + 2) * 2);
        const regs = [regsWord & 0xf, (regsWord >> 4) & 0xf, (regsWord >> 8) & 0xf, (regsWord >> 12) & 0xf, g].slice(0, a);
        text = `${name} {${regs.map((r) => `v${r}`).join(', ')}}, ${methods[midx]?.text ?? `метод №${midx}`}`;
        len = 3;
      } else if (op === 0x1a) {
        const idx = buf.readUInt16LE(insnsOff + (i + 1) * 2);
        text = `${name} v${hi}, ${JSON.stringify(strings[idx] ?? '')}`;
        len = 2;
      } else if (op === 0x22) {
        const idx = buf.readUInt16LE(insnsOff + (i + 1) * 2);
        text = `${name} v${hi}, ${types[idx] ?? idx}`;
        len = 2;
      } else if (op === 0x12) {
        text = `${name} v${hi & 0xf}, ${hi >> 4}`;
      } else if (op === 0x0c || op === 0x0d) {
        text = `${name} v${hi}`;
      } else if (op === 0x28) {
        const delta = hi > 127 ? hi - 256 : hi;
        text = `${name} ${delta >= 0 ? '+' : ''}${delta} (на 0x${(i + delta).toString(16)})`;
      }
      lines.push(`    ${String(i).padStart(4, '0')}: ${text}`);
      i += len;
    }
    return lines;
  };

  const classes = [];
  for (let i = 0; i < header.classDefsSize; i++) {
    const o = header.classDefsOff + i * 32;
    const cls = {
      name: types[buf.readUInt32LE(o)],
      accessFlags: buf.readUInt32LE(o + 4),
      superclass: types[buf.readUInt32LE(o + 8)],
      sourceFile: strings[buf.readUInt32LE(o + 16)] ?? null,
      methods: [],
    };
    const classDataOff = buf.readUInt32LE(o + 24);
    if (classDataOff) {
      let p = classDataOff;
      const take = () => {
        const r = readUleb(p);
        p = r.next;
        return r.value;
      };
      const staticFields = take();
      const instanceFields = take();
      const directMethods = take();
      const virtualMethods = take();
      for (let f = 0; f < staticFields + instanceFields; f++) {
        take();
        take();
      }
      for (const [count, kind] of [
        [directMethods, 'direct'],
        [virtualMethods, 'virtual'],
      ]) {
        let idx = 0;
        for (let m = 0; m < count; m++) {
          idx += take();
          const access = take();
          const codeOff = take();
          const method = { kind, access, ...methods[idx], code: null };
          if (codeOff) {
            const registers = buf.readUInt16LE(codeOff);
            const ins = buf.readUInt16LE(codeOff + 2);
            const outs = buf.readUInt16LE(codeOff + 4);
            const tries = buf.readUInt16LE(codeOff + 6);
            const insnsSize = buf.readUInt32LE(codeOff + 12);
            method.code = {
              registers,
              ins,
              outs,
              tries,
              insnsSize,
              lines: disasm(codeOff, codeOff + 16, insnsSize),
              handlers: [],
            };
            if (tries) {
              const triesOff = codeOff + 16 + insnsSize * 2 + (insnsSize % 2 ? 2 : 0);
              for (let t = 0; t < tries; t++) {
                const to = triesOff + t * 8;
                method.code.handlers.push({
                  start: buf.readUInt32LE(to),
                  count: buf.readUInt16LE(to + 2),
                  handlerOff: buf.readUInt16LE(to + 4),
                });
              }
            }
          }
          cls.methods.push(method);
        }
      }
    }
    classes.push(cls);
  }

  const mapItems = [];
  if (header.mapOff) {
    const count = buf.readUInt32LE(header.mapOff);
    for (let i = 0; i < count; i++) {
      const o = header.mapOff + 4 + i * 12;
      mapItems.push({ type: buf.readUInt16LE(o), size: buf.readUInt32LE(o + 4), offset: buf.readUInt32LE(o + 8) });
    }
  }

  return { header, strings, types, protos, methods, classes, mapItems, problems };
}

export function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/* ============================================================
   Подписи
   ============================================================ */

/** Проверка подписи v1 (JAR): дайджесты MANIFEST.MF против содержимого. */
export function checkV1(zip) {
  const result = { present: false, problems: [], files: [], certificate: null };
  const manifest = zip.byName.get('META-INF/MANIFEST.MF');
  if (!manifest) {
    result.problems.push('нет META-INF/MANIFEST.MF');
    return result;
  }
  result.present = true;
  const text = manifest.data.toString('utf8');

  for (const entry of zip.entries) {
    if (entry.name.startsWith('META-INF/')) continue;
    const digest = crypto.createHash('sha256').update(entry.data).digest('base64');
    const ok = text.includes(`Name: ${entry.name}\r\nSHA-256-Digest: ${digest}\r\n`);
    result.files.push({ name: entry.name, ok, digest });
    if (!ok) result.problems.push(`в MANIFEST.MF нет верного SHA-256 для ${entry.name}`);
  }

  const sf = zip.byName.get('META-INF/CERT.SF');
  if (!sf) result.problems.push('нет META-INF/CERT.SF');
  else {
    const sfText = sf.data.toString('utf8');
    const manifestDigest = crypto.createHash('sha256').update(manifest.data).digest('base64');
    if (!sfText.includes(`SHA-256-Digest-Manifest: ${manifestDigest}`))
      result.problems.push('в CERT.SF дайджест MANIFEST.MF не совпадает');
    result.rollbackProtected = sfText.includes('X-Android-APK-Signed: 2');
  }
  if (!zip.byName.get('META-INF/CERT.RSA')) result.problems.push('нет META-INF/CERT.RSA (сам PKCS#7)');
  return result;
}

/** Разбор и настоящая проверка подписи APK Signature Scheme v2. */
export function checkV2(buf, zip) {
  const result = { present: false, problems: [], info: {} };
  const cd = zip.cdOffset;
  if (cd < 32) {
    result.problems.push('файл слишком мал для блока подписи');
    return result;
  }
  const magic = buf.subarray(cd - 16, cd).toString('ascii');
  if (magic !== 'APK Sig Block 42') {
    result.problems.push(
      'нет APK Signing Block: подпись только v1. Android 11+ не ставит такие пакеты с targetSdk ≥ 30',
    );
    return result;
  }
  result.present = true;

  const sizeTail = Number(buf.readBigUInt64LE(cd - 24));
  const blockStart = cd - sizeTail - 8;
  const sizeHead = Number(buf.readBigUInt64LE(blockStart));
  if (sizeHead !== sizeTail) result.problems.push(`размеры блока подписи не совпадают (${sizeHead} и ${sizeTail})`);
  result.info.blockStart = blockStart;
  result.info.blockSize = sizeTail + 8;

  const pairs = [];
  let cursor = blockStart + 8;
  while (cursor < cd - 24) {
    const pairLen = Number(buf.readBigUInt64LE(cursor));
    if (pairLen <= 4 || cursor + 8 + pairLen > cd) {
      result.problems.push('битая пара ID-значение в блоке подписи');
      break;
    }
    const id = buf.readUInt32LE(cursor + 8);
    pairs.push({ id, value: buf.subarray(cursor + 12, cursor + 8 + pairLen) });
    cursor += 8 + pairLen;
  }
  result.info.pairs = pairs.map((p) => `0x${p.id.toString(16)}`);

  const v2 = pairs.find((p) => p.id === 0x7109871a)?.value;
  const v3 = pairs.find((p) => p.id === 0xf05368c0)?.value;
  result.info.hasV3 = Boolean(v3);
  if (!v2) {
    result.problems.push('в блоке подписи нет секции 0x7109871a (схема v2)');
    return result;
  }

  const readLP = (b, off) => {
    const len = b.readUInt32LE(off);
    return { value: b.subarray(off + 4, off + 4 + len), next: off + 4 + len };
  };

  try {
    const signers = readLP(v2, 0).value;
    const signer = readLP(signers, 0).value;
    const signedData = readLP(signer, 0);
    const signatures = readLP(signer, signedData.next);
    const publicKeyDer = readLP(signer, signatures.next).value;

    const sigBlock = readLP(signatures.value, 0).value;
    const algo = sigBlock.readUInt32LE(0);
    const signature = readLP(sigBlock, 4).value;
    result.info.algorithm = `0x${algo.toString(16)}`;

    const publicKey = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
    result.info.keyType = publicKey.asymmetricKeyType;
    result.info.keyBits = publicKey.asymmetricKeyDetails?.modulusLength;

    const hash = algo === 0x0103 || algo === 0x0101 ? 'sha256' : 'sha512';
    result.signatureValid = crypto.verify(hash, signedData.value, publicKey, signature);
    if (!result.signatureValid) result.problems.push('подпись v2 не проходит проверку открытым ключом');

    /* Сертификат подписанта — его отпечаток должен совпадать у всех сборок,
       иначе обновление поверх установленного приложения не встанет. */
    const digestsBlock = readLP(signedData.value, 0);
    const certsBlock = readLP(signedData.value, digestsBlock.next).value;
    const cert = readLP(certsBlock, 0).value;
    result.info.certSha256 = crypto.createHash('sha256').update(cert).digest('hex');
    try {
      const x509 = new crypto.X509Certificate(Buffer.from(cert));
      result.info.subject = x509.subject.replace(/\n/g, ', ');
      result.info.validFrom = x509.validFrom;
      result.info.validTo = x509.validTo;
      result.info.serial = x509.serialNumber;
    } catch (err) {
      result.problems.push(`сертификат не разбирается: ${err.message}`);
    }

    /* Пересчёт дайджеста содержимого: три секции APK по схеме v2. */
    const digestEntry = readLP(digestsBlock.value, 0).value;
    const storedDigest = readLP(digestEntry, 4).value;
    const eocdForDigest = Buffer.from(buf.subarray(zip.eocdOffset));
    eocdForDigest.writeUInt32LE(blockStart, 16);
    const actual = apkDigest([buf.subarray(0, blockStart), buf.subarray(cd, zip.eocdOffset), eocdForDigest]);
    result.digestValid = actual.equals(storedDigest);
    result.info.digest = actual.toString('hex');
    if (!result.digestValid)
      result.problems.push('дайджест содержимого не совпадает с подписанным — файл изменили после подписи');
  } catch (err) {
    result.problems.push(`блок подписи v2 не разбирается: ${err.message}`);
  }
  return result;
}

/** Двухуровневый дайджест APK по схеме v2 (чанки по 1 МиБ). */
export function apkDigest(sections) {
  const CHUNK = 1024 * 1024;
  const chunkDigests = [];
  let count = 0;
  const u32 = (v) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    return b;
  };
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
