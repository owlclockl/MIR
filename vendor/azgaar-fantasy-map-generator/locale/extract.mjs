#!/usr/bin/env node
/* Инвентарь строк интерфейса Azgaar и проверка перевода.
 *
 *   node locale/extract.mjs            — сводка: сколько строк и сколько переведено
 *   node locale/extract.mjs --write    — пересобрать locale/en.tsv (что надо перевести)
 *   node locale/extract.mjs --seed     — перенести переводы в ru.tsv на новые id
 *   node locale/extract.mjs --check    — строгая проверка (её зовёт сборка MIR)
 *
 * en.tsv (id → английский текст) генерируется из исходников, руками его не правят;
 * ru.tsv (id → русский текст) — единственный файл, который пополняет переводчик.
 * Значение «-» в ru.tsv означает «эта строка остаётся на английском осознанно»:
 * имена файлов, форматы выгрузки и прочий текст, который не является подписью.
 */

import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_TRANSLATABLE } from "./dict.mjs";
import { candidates, normalize, validateTranslation } from "./patterns.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, "..");
const srcDir = join(vendor, "src");
const enFile = join(here, "en.tsv");
const ruFile = join(here, "ru.tsv");

const argv = process.argv.slice(2);
const MODE = argv.includes("--write")
	? "write"
	: argv.includes("--seed")
		? "seed"
		: argv.includes("--check")
			? "check"
			: "report";

function sourceFiles(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const file = join(dir, name);
		if (statSync(file).isDirectory()) out.push(...sourceFiles(file));
		else if (/\.(ts|html)$/.test(name) && !name.includes(".test."))
			out.push(file);
	}
	return out.sort();
}

/** Все строки интерфейса: английский текст → где встречается */
function scan() {
	const found = new Map();
	for (const file of sourceFiles(srcDir)) {
		const rel = relative(vendor, file).split(sep).join("/");
		for (const item of candidates(readFileSync(file, "utf8"), file)) {
			const key = normalize(item.key);
			const entry = found.get(key) || { patterns: new Set(), files: new Set() };
			entry.patterns.add(item.pattern);
			entry.files.add(rel);
			found.set(key, entry);
		}
	}
	return found;
}

/** id присваиваются по алфавиту, чтобы не прыгали между запусками */
function inventory() {
	const found = scan();
	const keys = [...found.keys()].sort((a, b) => a.localeCompare(b, "en"));
	return keys.map((key, index) => ({
		id: String(index + 1).padStart(4, "0"),
		key,
		patterns: [...found.get(key).patterns].sort().join(","),
		files: [...found.get(key).files].sort(),
	}));
}

function readTsv(file) {
	const map = new Map();
	if (!existsSync(file)) return map;
	readFileSync(file, "utf8")
		.split("\n")
		.forEach((line, index) => {
			const text = line.replace(/\r$/, "");
			if (!text.trim() || text.startsWith("#")) return;
			const tab = text.indexOf("\t");
			if (tab === -1)
				throw new Error(
					`${relative(vendor, file)}:${index + 1}: ожидаются два столбца через табуляцию`,
				);
			map.set(text.slice(0, tab).trim(), normalize(text.slice(tab + 1)));
		});
	return map;
}

const rows = inventory();

// переводы переносятся по английскому тексту, а не по id: строки в инвентаре
// могут добавляться и удаляться вместе с исходниками, а перевод привязан к тексту
const oldEn = readTsv(enFile);
const oldRu = readTsv(ruFile);
const translatedByEnglish = new Map();
for (const [id, value] of oldRu) {
	const english = oldEn.get(id);
	if (english && !(MODE === "write" && value === english))
		translatedByEnglish.set(english, value);
}

if (MODE === "write") {
	const head =
		"# Строки интерфейса Azgaar. Создается командой: node locale/extract.mjs --write\n";
	writeFileSync(
		enFile,
		`${head + rows.map((row) => `${row.id}\t${row.key}`).join("\n")}\n`,
	);
	console.log(`Записано ${relative(vendor, enFile)}: строк ${rows.length}`);
	if (!argv.includes("--seed")) process.exit(0);
}

if (MODE === "seed" || MODE === "write") {
	const lines = rows.map(
		(row) => `${row.id}\t${translatedByEnglish.get(row.key) ?? row.key}`,
	);
	const ruHead =
		"# Перевод интерфейса Azgaar на русский. id соответствуют locale/en.tsv, значение «-» — строка осознанно остаётся английской.\n";
	writeFileSync(ruFile, `${ruHead + lines.join("\n")}\n`);
	const carried = lines.filter((_, index) =>
		translatedByEnglish.has(rows[index].key),
	).length;
	console.log(
		`ru.tsv: id обновлено, перенесено переводов ${carried} из ${rows.length}`,
	);
	process.exit(0);
}

const byId = new Map(rows.map((row) => [row.id, row]));
const missing = rows.filter((row) => !oldRu.has(row.id));
const skipped = rows.filter((row) => oldRu.get(row.id) === NOT_TRANSLATABLE);
const stale = [...oldRu.keys()].filter((id) => !byId.has(id));
const outdated = [...translatedByEnglish.keys()].filter(
	(english) => !rows.some((row) => row.key === english),
);
const broken = [];
let done = 0;
for (const row of rows) {
	const value = oldRu.get(row.id);
	if (value === undefined || value === NOT_TRANSLATABLE) continue;
	const problems = validateTranslation(row.key, value);
	if (!problems.length && value === row.key && /[A-Za-z]{3}/.test(value))
		problems.push("совпадает с английским");
	if (problems.length)
		broken.push(
			`${row.id}  ${row.key.slice(0, 70)}\n       → ${problems.join("; ")}`,
		);
	else done++;
}

const percent = rows.length
	? Math.round(((done + skipped.length) / rows.length) * 100)
	: 0;
console.log(
	`Строк интерфейса: ${rows.length} · переведено ${done} · оставлено на английском ${skipped.length} · без перевода ${missing.length} · покрытие ${percent}%`,
);
if (broken.length) console.log(`С ошибками: ${broken.length}`);
if (stale.length) console.log(`Устаревших id в ru.tsv: ${stale.length}`);
if (outdated.length)
	console.log(
		`Переводов для пропавших строк: ${outdated.length} (выполните --seed)`,
	);

if (argv.includes("--list-missing"))
	for (const row of missing)
		console.log(
			`${row.id}\t${row.key}\t[${row.patterns}]\t${row.files.join(",")}`,
		);
if (argv.includes("--list-broken"))
	for (const line of broken) console.log(line);

if (MODE === "check") {
	if (broken.length) {
		console.error(`\n${broken.length} строк перевода сломаны, первые:`);
		for (const line of broken.slice(0, 10)) console.error(`  ${line}`);
		console.error(
			`\nПочините vendor/azgaar-fantasy-map-generator/locale/ru.tsv.`,
		);
		process.exit(1);
	}
	if (stale.length) {
		console.error(
			"\nВ ru.tsv есть id несуществующих строк: выполните node locale/extract.mjs --write --seed.",
		);
		process.exit(1);
	}
	if (missing.length)
		console.log(
			`По-английски осталось ${missing.length} строк — сборка продолжается.`,
		);
	process.exit(0);
}
process.exit(missing.length || broken.length ? 1 : 0);
