/* Словарь перевода Azgaar: английский текст интерфейса → русский. */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize } from "./patterns.mjs";

/** Значение в ru.tsv, означающее «переводить не нужно» */
export const NOT_TRANSLATABLE = "-";

/** @param {string} localeDir папка vendor/azgaar-fantasy-map-generator/locale */
export function loadDictionary(localeDir) {
	const en = readTsv(join(localeDir, "en.tsv"));
	const ru = readTsv(join(localeDir, "ru.tsv"));
	const dict = new Map();
	let skipped = 0;
	for (const [id, english] of en) {
		const value = ru.get(id);
		if (value === undefined) continue;
		if (value === NOT_TRANSLATABLE) {
			skipped++;
			continue;
		}
		dict.set(english, value);
	}
	return { dict, total: en.size, translated: dict.size, skipped };
}

function readTsv(file) {
	const map = new Map();
	if (!existsSync(file)) return map;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const text = line.replace(/\r$/, "");
		if (!text.trim() || text.startsWith("#")) continue;
		const tab = text.indexOf("\t");
		if (tab === -1) continue;
		map.set(text.slice(0, tab).trim(), normalize(text.slice(tab + 1)));
	}
	return map;
}
