/* Где в исходниках Azgaar живёт текст интерфейса.
 *
 * Upstream не знает про словари: подписи, подсказки и заголовки написаны прямо в
 * шаблонах и в конфигах диалогов. Поэтому перевод — это подстановка по месту: мы
 * находим строки в строго определённых контекстах (атрибут data-tip, текстовый узел
 * разметки, поле label/tip/title/… у конфига) и подменяем только их.
 *
 * Один и тот же разбор читает extract.mjs (составляет список строк, которые надо
 * перевести) и plugin.mjs (переводит при сборке) — так «что подлежит переводу»
 * описано ровно один раз, и инвентарь не разъезжается с переводом.
 */

const HTML_ATTR = "attr";
const TEXT_NODE = "text";
const JS_STRING = "js";

/** Текст между `>` и `<` в исходнике может быть кодом, поэтому он проходит отбор строже */
const TEXT_LIKE = "text";

export const PATTERNS = [
	{
		name: "data-tip",
		context: HTML_ATTR,
		// data-tip="…" — подсказка в нижней строке
		re: /(\bdata-tip=")([^"\n]{1,700})(")/g,
	},
	{
		name: "attr",
		context: HTML_ATTR,
		// title="…" placeholder="…" aria-label="…" alt="…"
		re: /(\b(?:title|placeholder|aria-label|alt)=")([^"\n]{1,400})(")/g,
	},
	{
		name: "field",
		context: JS_STRING,
		// подписи и сообщения в конфигах: { label: "…", tip: "…", title: "…", message: "…" }
		// и значения по умолчанию функций: message = "…", title = "…"
		re: /(\b(?:label|tip|title|message|description|prompt|placeholder|help|hint|legend|caption|confirmText|cancelText|confirm|cancel|inText|outText)\s*[:=]\s*(?:\/\* html \*\/\s*)?")([^"\n]{1,900})(")/g,
	},
	{
		name: "call",
		context: JS_STRING,
		// tip("…"), alert("…"), prompt("…", …), confirm("…")
		re: /(\b(?:tip|alert|prompt|confirm)\(\s*")([^"\n]{2,700})(")/g,
	},
	{
		name: "ternary",
		context: JS_STRING,
		// cond ? "Да" : "Нет" — обе ветки подписи, их тоже надо переводить
		re: /(\?\s*")([^"\n]{1,200})("\s*:\s*")([^"\n]{1,200})(")/g,
		keys: [2, 4],
	},
	{
		name: "tooltip-return",
		context: JS_STRING,
		// map-tooltip возвращает подпись подсказки строкой: if (!burg) return "Click to edit the Burg"
		files: /[/\\]components[/\\]map-tooltip\.ts$/,
		re: /(\breturn\s*")([^"\n]{4,300})(")/g,
	},
	{
		name: "data-label",
		context: JS_STRING,
		// списки { key: "Label" } — их показывают в выпадающих списках стиля и настроек
		files:
			/[/\\]data[/\\](?:style-choices|textures|ocean-patterns|grid-types)\.ts$/,
		re: /(:\s*")([^"\n]{1,120})(")/g,
	},
	{
		name: "command-name",
		context: JS_STRING,
		// name: "…" у команд омнибара и у шаблонов рельефа — только отображаемые подписи
		files: /[/\\](?:map-commands|heightmap-templates)\.ts$/,
		re: /(\bname:\s*")([^"\n]{1,200})(")/g,
	},
	{
		name: "dialog-button",
		context: JS_STRING,
		// кнопки jQuery UI диалога берут подпись из имени свойства: buttons: { OK: function … }
		re: /^(\s{4,})([A-Z][A-Za-z .’…-]{1,24}):\s*function\b/gm,
	},
	{
		name: "text-node",
		context: TEXT_NODE,
		// >Текст< — всё, что пользователь видит текстом в разметке
		re: /(>)([^<>]{1,300})(<)/g,
	},
];

/** Файлы, где текст интерфейсу не принадлежит: промпты ассистента модель читает сама */
const NOT_UI_FILES = /[/\\]services[/\\]assistant[/\\]provider[/\\]/;

/** Интерфейсные файлы: здесь и строчные подписи вроде blank или machine — настоящие надписи */
const UI_FILES = /[/\\](?:components|controllers|services)[/\\]|index\.html$/;

function patternsFor(file) {
	return NOT_UI_FILES.test(file)
		? []
		: PATTERNS.filter((p) => !p.files || p.files.test(file));
}

/** Ключ словаря: пробелы и переводы строк сворачиваем в один пробел */
export function normalize(text) {
	return text.replace(/\s+/g, " ").trim();
}

/** Разметка внутри строки: перевод обязан сохранить те же теги в том же порядке */
export function tags(text) {
	return (text.match(/<\/?[a-zA-Z][^<>]*>/g) || [])
		.map((tag) => tag.replace(/\s+/g, " "))
		.sort();
}

/** Вставки ${…}: перевод может менять их местами, но не терять и не добавлять */
export function placeholders(text) {
	return (text.match(/\$\{[^{}]*\}/g) || []).slice().sort();
}

/** Простая подстановка вида ${name} ещё можно перевести; ${a ? b : c} — уже нет */
const SIMPLE_INTERPOLATION =
	/\$\{[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])*}/g;

/** Любая подстановка без вложенных фигурных скобок */
const ANY_INTERPOLATION = /\$\{[^{}]*\}/g;

/**
 * Подстановка, которую переводчик не выразит перестановкой: вызов или ветвление.
 * Такие строки переводим только в html-атрибутах и только с сохранением порядка вставок.
 */
export function hasComplexInterpolation(text) {
	return /\$\{[^{}]*\}/.test(text.replace(SIMPLE_INTERPOLATION, ""));
}

/**
 * Годится ли строка в словарь. Отсекаем код, CSS, имена файлов и всё, что перевод
 * подстановкой по месту испортит.
 */
export function isTranslatable(key, kind, file) {
	if (!key || key.length > 900) return false;
	if (!/[A-Za-zА-Яа-я]/.test(key)) return false;
	// одиночные подстановки ${name} допускаются: перевод обязан вернуть их же (validateTranslation)
	const complex = hasComplexInterpolation(key);
	// составные вставки (${fn(x)}, ${a ? b : c}) переводим лишь в html-подсказках
	if (complex && kind !== HTML_ATTR) return false;
	const noInterpolation = key
		.replace(complex ? ANY_INTERPOLATION : SIMPLE_INTERPOLATION, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (/[\]{}\\`|]/.test(noInterpolation)) return false;
	// голая подстановка или emoji-вывеска — не подпись: «${area}», «: ${cellId}», «📖 ${link}»
	if (noInterpolation !== key && !/[A-Za-zА-Яа-я]{3}/.test(noInterpolation))
		return false;
	// в html-атрибутах же это проза: «export map data», «Save …; Shift-click …» — настоящие подсказки
	if (
		kind !== HTML_ATTR &&
		/;|\.\.\.|=>|&&|\|\||\?\?|\b(?:function|const|let|var|return|await|import|export|typeof|instanceof|interface)\b/.test(
			key,
		)
	)
		return false;
	// вызов функции и дженерик выдают код за подпись — но только в текстовых узлах разметки,
	// где между > и < что угодно; в атрибутах и полях конфига скобки — часть фразы
	if (
		kind === TEXT_LIKE &&
		(/[A-Za-z0-9_]\s*\(/.test(key) || /[A-Za-z]\w*<[A-Za-z]/.test(key))
	)
		return false;
	if (
		kind === TEXT_LIKE &&
		(/\s+as\s+[A-Z]/.test(key) || /\bnew\s+[A-Z]/.test(key))
	)
		return false; // приведения типов
	// подстановки, которые переводчиком не выражаются: ${a ? b : c}, ${fn(x)}
	if (/\$\{/.test(noInterpolation)) return false;
	if (
		kind !== TEXT_LIKE &&
		/^[,;:.!?+*/\\~^%$#&@=<>-]/.test(key) &&
		!/^<[^>]+>\S/.test(key)
	)
		return false;
	if (kind === TEXT_LIKE) {
		if (/^[A-Za-z_$][\w$]*\s*:/.test(key)) return false; // аннотация типа
		if (/^\.?[a-z0-9_]+(?:-[a-z0-9_.]+)*$/.test(key)) return false; // .svg, tiles, cells, kebab-case
		if (/^[A-Za-z][A-Za-z0-9]*$/.test(key) && /[a-z][A-Z]/.test(key))
			return false; // AbortSignal
		if (/^[\d\s.,:%/-]+$/.test(key)) return false;
		if (
			!/^[A-ZА-Я0-9]/.test(key) &&
			!/\s/.test(key) &&
			!UI_FILES.test(file ?? "")
		)
			return false; // одиночные строчные слова вне интерфейса — не подписи
		if (
			/^(?:svg|path|g|div|span|use|defs|button|input|option|style|class|href|src|title)$/i.test(
				key,
			)
		)
			return false;
		return true;
	}
	if (/^["'»«([\])]/.test(key)) return false; // обрывки фраз, а не строка целиком
	return true;
}

/** Перевод подставляется дословно, поэтому ограничения жёсткие и общие для всех контекстов */
export function validateTranslation(key, value) {
	const problems = [];
	if (/["\\]/.test(value)) problems.push('нельзя " и \\');
	if (/[\n\r]/.test(value)) problems.push("нельзя перенос строки");
	if (/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/i.test(value))
		problems.push("& только как HTML-сущность");
	const openValue = value.match(/</g)?.length ?? 0;
	const closeValue = value.match(/>/g)?.length ?? 0;
	if (openValue !== closeValue) problems.push("неразметленная пара тегов");
	if (tags(key).join() !== tags(value).join())
		problems.push(`теги расходятся: ${tags(key).join(" ")}`);
	const from = placeholders(key);
	const to = placeholders(value);
	if (from.join() !== to.join())
		problems.push(
			`вставки \${…} расходятся: ${from.join(" ") || "нет"} ≠ ${to.join(" ") || "нет"}`,
		);
	// составные вставки перевод не переставляет: только тот же порядок, что и в оригинале
	if (hasComplexInterpolation(key)) {
		const ordered = (text) => (text.match(/\$\{[^{}]*\}/g) || []).join(" ");
		if (ordered(key) !== ordered(value))
			problems.push("порядок составных вставок должен совпадать с оригиналом");
	}
	return problems;
}

/**
 * Все кандидаты перевода в тексте исходника: [{pattern, start, end, key}].
 * Разбор идёт в порядке PATTERNS: находка более важного контекста (data-tip, поле
 * конфига) имеет приоритет, а не то, что начинается раньше, — иначе текстовый узел
 * разметки, захвативший код между > и <, перекрывал бы подписи целого файла.
 */
export function candidates(text, file) {
	const found = [];
	const taken = [];
	for (const pattern of patternsFor(file)) {
		pattern.re.lastIndex = 0;
		const groups = pattern.keys ?? [2];
		for (const match of text.matchAll(pattern.re)) {
			const kind =
				pattern.context === TEXT_NODE
					? TEXT_LIKE
					: pattern.context === HTML_ATTR
						? HTML_ATTR
						: "field";
			for (const group of groups) {
				const raw = match[group];
				if (raw === undefined) continue;
				// во всех паттернах группы идут подряд, поэтому сдвиг — это сумма предыдущих
				let offset = 0;
				for (let i = 1; i < group; i++) offset += match[i].length;
				const key = normalize(raw);
				if (!isTranslatable(key, kind, file)) continue;
				// пробелы по краям исходного текста — часть вёрстки, их сохраняем за кадром
				const before = raw.match(/^\s*/)[0];
				const start = match.index + offset + before.length;
				const end = start + raw.trim().length;
				if (taken.some((range) => start < range.end && end > range.start))
					continue;
				taken.push({ start, end });
				found.push({ pattern: pattern.name, start, end, key });
			}
		}
	}

	return found.sort((a, b) => a.start - b.start);
}

/** Подставляет переводы в текст исходника */
export function applyTranslations(text, dict, file) {
	let out = "";
	let cursor = 0;
	let count = 0;
	for (const item of candidates(text, file)) {
		const value = dict.get(item.key);
		if (!value || value === item.key) continue;
		const problems = validateTranslation(item.key, value);
		if (problems.length)
			throw new Error(
				`locale/ru.tsv: «${item.key.slice(0, 60)}» — ${problems.join("; ")}; почините перевод или уберите строку из словаря`,
			);
		out += text.slice(cursor, item.start) + value;
		cursor = item.end;
		count++;
	}
	out += text.slice(cursor);
	return { text: out, count };
}
