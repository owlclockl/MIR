/* Vite-плагин: русский интерфейс Azgaar при сборке.
 *
 * Исходники upstream остаются английскими — править их нельзя, иначе следующая
 * синхронизация с Azgaar превратится в конфликт. Вместо этого перевод подставляется
 * в код на этапе сборки (контексты перевода описаны в locale/patterns.mjs).
 * Единственный файл, который пополняют руками, — locale/ru.tsv.
 */

import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDictionary } from "./dict.mjs";
import { applyTranslations } from "./patterns.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

const TRANSLATED = /\.(ts|html|js)$/;

export function russianLocale() {
	// Тесты upstream (vitest) читают исходники как есть и сверяют английские подписи,
	// а перевод — забота производственной сборки: в тестовом режиме плагин молчит.
	if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
		return { name: "fmg-russian-locale", enforce: "pre" };
	}
	if (!existsSync(join(here, "ru.tsv"))) {
		return {
			name: "fmg-russian-locale",
			config() {
				this.warn(
					"locale/ru.tsv не найден — интерфейс собирается на английском upstream",
				);
			},
		};
	}

	const { dict, total, translated } = loadDictionary(here);
	const stats = { replaced: 0, files: 0 };

	function translate(code, file) {
		const rel = relative(srcDir, file).split(sep).join("/");
		if (
			!rel ||
			rel.startsWith("..") ||
			rel.includes(".test.") ||
			!TRANSLATED.test(rel)
		)
			return null;
		const result = applyTranslations(code, dict, file);
		if (!result.count) return null;
		stats.replaced += result.count;
		stats.files++;
		// sourcemap не отдаём: замены внутри строковых литералов, колонки съезжают в пределах строки
		return { code: result.text, map: undefined };
	}

	return {
		name: "fmg-russian-locale",
		enforce: "pre",
		transform(code, id) {
			return translate(code, id.split("?")[0]);
		},
		// index.html проходит через transformIndexHtml, а не через transform
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				translate(html, join(srcDir, "index.html"));
				return html;
			},
		},
		buildEnd() {
			if (process.env.FMG_LOCALE_QUIET) return;
			console.log(
				`🌐 Русский интерфейс Azgaar: инвентарь ${total} строк, словарь ${translated}, подстановок ${stats.replaced} в ${stats.files} файлах`,
			);
		},
	};
}
