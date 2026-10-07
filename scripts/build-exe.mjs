// Сборка Windows-установщика MIR-Setup.exe.
// Запуск: npm run build:exe
//
// Как это работает:
//   1. собираем сайт (vite) и упаковываем папку dist/ во внутренний архив;
//   2. делаем app.ico из PNG-иконок;
//   3. компилируем scripts/win/MirSetup.cs штатным csc.exe из .NET Framework
//      (есть на любой Windows 10/11) и вшиваем архив + иконку как ресурсы;
//   4. проверяем, что получился настоящий PE-файл для Windows.
//
// Если компилятора нет — сборка честно падает с инструкцией. Раньше здесь был
// «запасной PE-генератор», который писал 8 КБ заголовков без кода: Windows на
// такой файл отвечает «Это приложение не может быть запущено на вашем ПК».
// Лучше понятная ошибка, чем сломанный exe.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import './lib/root.mjs';
import { buildSingleHtml } from './build-single.mjs';

const OUT_DIR = 'dist-app';
const CS_SOURCE = join('scripts', 'win', 'MirSetup.cs');

console.log('--- Сборка MIR для Windows (.exe) ---');

/* ---------- 1. свежая сборка сайта -------------------------------- */

await buildSingleHtml();

/* ---------- 2. архив с сайтом ------------------------------------- */

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, base));
    else out.push({ path: relative(base, full).split(sep).join('/'), data: readFileSync(full) });
  }
  return out;
}

if (!existsSync('dist')) throw new Error('build-exe: нет папки dist — сборка сайта не удалась.');

const siteFiles = collectFiles('dist');
if (!siteFiles.some((f) => f.path === 'index.html'))
  throw new Error('build-exe: в dist нет index.html.');

/* Формат: [uint32 count] { [uint16 len][path][uint32 raw][uint32 packed][deflate] } */
function packSite(files) {
  const chunks = [Buffer.alloc(4)];
  chunks[0].writeUInt32LE(files.length, 0);
  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const packed = zlib.deflateRawSync(file.data, { level: 9 });
    const head = Buffer.alloc(2 + name.length + 8);
    head.writeUInt16LE(name.length, 0);
    name.copy(head, 2);
    head.writeUInt32LE(file.data.length, 2 + name.length);
    head.writeUInt32LE(packed.length, 6 + name.length);
    chunks.push(head, packed);
  }
  return Buffer.concat(chunks);
}

mkdirSync(OUT_DIR, { recursive: true });
const sitePack = packSite(siteFiles);
const sitePackPath = join(OUT_DIR, 'site.mirpak');
writeFileSync(sitePackPath, sitePack);

/* ---------- 3. иконка приложения ----------------------------------- */

function makeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // тип 1 — иконка
  header.writeUInt16LE(entries.length, 4);

  let offset = header.length;
  entries.forEach((entry, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    header.writeUInt8(0, at + 2); // палитра
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4); // плоскости
    header.writeUInt16LE(32, at + 6); // бит на пиксель
    header.writeUInt32LE(entry.data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, ...entries.map((e) => e.data)]);
}

const iconEntries = [];
if (existsSync('public/icons/icon-192.png'))
  iconEntries.push({ size: 192, data: readFileSync('public/icons/icon-192.png') });
if (existsSync('public/icons/icon-512.png'))
  iconEntries.push({ size: 256, data: readFileSync('public/icons/icon-512.png') });

const icoPath = join(OUT_DIR, 'app.ico');
if (iconEntries.length) writeFileSync(icoPath, makeIco(iconEntries));

/* ---------- 4. компилятор C# ---------------------------------------- */

function findCompiler() {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || 'C:\\Windows';
    const candidates = [
      `${root}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`,
      `${root}\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe`,
    ];
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  }
  for (const name of ['csc', 'mcs']) {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

const compiler = findCompiler();
if (!compiler) {
  console.error('');
  console.error('✗ Не найден компилятор C# (csc.exe).');
  console.error('');
  console.error('  Он входит в .NET Framework и обычно уже есть в Windows 10/11:');
  console.error('    C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe');
  console.error('  Если файла нет — поставьте .NET Framework 4.8:');
  console.error('    https://dotnet.microsoft.com/download/dotnet-framework/net48');
  console.error('');
  console.error('  Веб-версия при этом уже собрана: dist\\ и mir.html.');
  console.error('');
  process.exit(1);
}

/* csc.exe определяет кодировку исходника по BOM: без него русские строки
   превратятся в кракозябры. Поэтому компилируем копию с BOM. */
const sourceWithBom = join(OUT_DIR, 'MirSetup.cs');
writeFileSync(sourceWithBom, '\uFEFF' + readFileSync(CS_SOURCE, 'utf8'), 'utf8');

/* Манифест: asInvoker — чтобы Windows не считала файл с «Setup» в имени
   установщиком и не просила права администратора (мы ставим игру в папку
   пользователя); dpiAware — чтобы окно не было размытым на HiDPI-экранах. */
const manifestPath = join(OUT_DIR, 'MirSetup.manifest');
writeFileSync(
  manifestPath,
  `<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="0.5.0.0" name="MIR.Setup" type="win32" />
  <description>MIR — The civilization of the sages</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
        <requestedExecutionLevel level="asInvoker" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />
      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}" />
      <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}" />
    </application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>
    </windowsSettings>
  </application>
</assembly>
`,
  'utf8',
);

const exePath = join(OUT_DIR, 'MIR-Setup.exe');
const args = [
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  `/out:${exePath}`,
  '/reference:System.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll',
  `/resource:${sitePackPath},mir.site`,
  `/win32manifest:${manifestPath}`,
];
if (existsSync(icoPath)) {
  args.push(`/resource:${icoPath},mir.icon`);
  args.push(`/win32icon:${icoPath}`);
}
args.push(sourceWithBom);

console.log(`Компилирую установщик: ${compiler}`);
const build = spawnSync(compiler, args, { encoding: 'utf8' });
const compilerOutput = `${build.stdout || ''}${build.stderr || ''}`.trim();
if (compilerOutput) console.log(compilerOutput);

if (build.status !== 0 || !existsSync(exePath)) {
  console.error('');
  console.error('✗ Компиляция установщика не удалась — смотрите сообщения компилятора выше.');
  process.exit(1);
}

/* ---------- 5. проверка результата ----------------------------------- */

const exe = readFileSync(exePath);
const problems = [];
if (exe.subarray(0, 2).toString('ascii') !== 'MZ') problems.push('нет сигнатуры MZ — это не Windows-приложение');
const peOffset = exe.readUInt32LE(0x3c);
if (exe.subarray(peOffset, peOffset + 4).toString('binary') !== 'PE\0\0') problems.push('нет заголовка PE');
if (exe.length < 20 * 1024) problems.push(`подозрительно маленький файл (${exe.length} байт)`);
if (!exe.includes(Buffer.from('mir.site', 'ascii'))) problems.push('в exe не видно ресурса с сайтом');

if (problems.length) {
  console.error('');
  console.error('✗ Самопроверка установщика не прошла:');
  for (const problem of problems) console.error(`    • ${problem}`);
  process.exit(1);
}

writeFileSync('MIR-Setup.exe', exe);

console.log('');
console.log('✓ Windows-установщик собран:');
console.log('    MIR-Setup.exe  (копия: dist-app/MIR-Setup.exe)');
console.log(`    Размер: ${(exe.length / 1024).toFixed(1)} КБ, внутри ${siteFiles.length} файлов игры`);
console.log('    Проверено: настоящий PE-файл, ресурсы на месте.');
console.log('');
console.log('    Файл можно просто переслать другу (Telegram, Discord, флешка).');
console.log('    При первом запуске Windows SmartScreen покажет синее окно:');
console.log('    «Подробнее» → «Выполнить в любом случае» — так бывает у любой');
console.log('    программы без платной цифровой подписи.');
console.log('');
