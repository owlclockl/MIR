/* ===========================================================
   Синхронизация скиллов ИИ-агентов с GitHub.

   Скиллы — это инструкции (Markdown), по которым ИИ-агент работает с
   проектом: у Cloudflare — про хостинг и Workers, у Anthropic — про
   интерфейс, темы и проверку веб-приложений. Они лежат в репозитории
   (.agents/skills и .claude/skills — одинаковые копии), а этот скрипт
   приводит их к источнику и пишет замок.

   Что делает:
   • скачивает каждый скилл из списка источников (api.github.com);
   • кладёт файлы в .agents/skills/<имя>/ и .claude/skills/<имя>/;
   • пересобирает skills-lock.json: sha256 файла SKILL.md на момент
     установки — по нему видно, что источник изменился.

   Запуск:
     node scripts/skills-sync.mjs          # скачать и обновить всё
     node scripts/skills-sync.mjs --check  # только сверить хеши
   =========================================================== */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = join(ROOT, 'skills-lock.json');
const AGENTS_DIR = join(ROOT, '.agents', 'skills');
const CLAUDE_DIR = join(ROOT, '.claude', 'skills');

/* Пропускаем: тяжёлые витрины и картинки не несут инструкций агенту. */
const SKIP = (name) => name.endsWith('.pdf') || name.endsWith('.png') || name.endsWith('.jpg');

/* Источники. path — каталог скилла внутри репозитория. */
const SOURCES = [
  // cloudflare/skills: хаб, Workers, Durable Objects, производительность
  ...[
    'agents-sdk',
    'basin',
    'cloudflare',
    'cloudflare-email-service',
    'cloudflare-one',
    'cloudflare-one-migrations',
    'durable-objects',
    'k2',
    'nextjs-on-cloudflare',
    'sandbox-migrate-to-next',
    'sandbox-next',
    'sandbox-stable',
    'turnstile-spin',
    'web-perf',
    'workers-best-practices',
    'wrangler',
  ].map((name) => ({ name, repo: 'cloudflare/skills', path: `skills/${name}` })),
  // anthropics/skills: интерфейс, темы оформления и проверка веб-приложений
  { name: 'frontend-design', repo: 'anthropics/skills', path: 'skills/frontend-design' },
  { name: 'theme-factory', repo: 'anthropics/skills', path: 'skills/theme-factory' },
  { name: 'webapp-testing', repo: 'anthropics/skills', path: 'skills/webapp-testing' },
  { name: 'web-artifacts-builder', repo: 'anthropics/skills', path: 'skills/web-artifacts-builder' },
];

const GITHUB_API = 'https://api.github.com';
const HEADERS = ['User-Agent: mir-skills-sync', 'Accept: application/vnd.github.raw'];

/* Транспорт — curl, а не fetch: часть сред (корпоративный прокси) подменяет
   TLS-цепочку, которую системный curl принимает, а Node — нет. */
const curl = (args) =>
  execFileSync(
    'curl',
    ['-sSL', '--fail', '-m', '60', '-H', 'User-Agent: mir-skills-sync', ...args],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );

const fetchRaw = async (repo, path) => curl(['-H', 'Accept: application/vnd.github.raw', `${GITHUB_API}/repos/${repo}/contents/${path}`]);

const listDir = async (repo, path) =>
  JSON.parse(
    curl(['-H', 'Accept: application/vnd.github+json', `${GITHUB_API}/repos/${repo}/contents/${path}`]).toString('utf8'),
  );

/* Каталог скилла скачивается рекурсивно; файлы — как есть. */
const downloadTree = async (repo, remotePath, localPath) => {
  const entries = await listDir(repo, remotePath);
  for (const entry of entries) {
    if (SKIP(entry.name)) continue;
    const target = join(localPath, entry.name);
    if (entry.type === 'dir') {
      mkdirSync(target, { recursive: true });
      await downloadTree(repo, `${remotePath}/${entry.name}`, target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, await fetchRaw(repo, `${remotePath}/${entry.name}`));
    }
  }
};

const dirFiles = (dir, base = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? dirFiles(join(dir, entry.name), rel) : [rel];
  });

const check = process.argv.includes('--check');
const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
const skills = {};
let changed = 0;
let drifted = 0;

for (const source of SOURCES) {
  const local = join(AGENTS_DIR, source.name);
  if (check) {
    const skillFile = join(local, 'SKILL.md');
    const actual = createHash('sha256').update(readFileSync(skillFile)).digest('hex');
    const recorded = lock.skills?.[source.name]?.computedHash;
    const same = actual === recorded;
    if (!same) drifted += 1;
    console.log(`  ${same ? '•' : '!'} ${source.name} ${same ? 'совпадает' : 'источник изменился'}`);
    skills[source.name] = { ...lock.skills?.[source.name] };
    continue;
  }
  process.stdout.write(`  ↓ ${source.name} (${source.repo})… `);
  rmSync(local, { recursive: true, force: true });
  mkdirSync(local, { recursive: true });
  await downloadTree(source.repo, source.path, local);
  /* Вторая копия — для другого раннера агентов: каталоги одинаковые. */
  const claudeCopy = join(CLAUDE_DIR, source.name);
  rmSync(claudeCopy, { recursive: true, force: true });
  mkdirSync(dirname(claudeCopy), { recursive: true });
  for (const rel of dirFiles(local)) {
    const target = join(claudeCopy, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(local, rel)));
  }
  const hash = createHash('sha256').update(readFileSync(join(local, 'SKILL.md'))).digest('hex');
  const previous = lock.skills?.[source.name]?.computedHash;
  if (previous !== hash) changed += 1;
  skills[source.name] = { source: source.repo, sourceType: 'github', skillPath: `${source.path}/SKILL.md`, computedHash: hash };
  console.log(`${dirFiles(local).length} файлов, sha256 ${hash.slice(0, 12)}…`);
}

if (!check) {
  const ordered = Object.fromEntries(Object.keys(skills).sort().map((name) => [name, skills[name]]));
  writeFileSync(LOCK_FILE, `${JSON.stringify({ version: 1, skills: ordered }, null, 2)}\n`);
  console.log(`\nГотово: скиллов ${Object.keys(ordered).length}, обновлено ${changed}. Замок записан.`);
} else {
  console.log(`\nПроверка: скиллов ${Object.keys(skills).length}, у ${drifted} источник ушёл вперёд.`);
  if (drifted > 0) process.exitCode = 1;
}
