/**
 * 从游戏原文件抽取待翻译文本，与已有译文合并后回写 locales/<id>/。
 * 游戏更新后重跑：新增的串补 null，删除的串移除，已有译文保留。
 *
 * 用法：bun run extract -- --game "<解包目录>"
 */
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { MUSIC_LIST_KEY, SKIP_KEY_PATTERN } from '#/config';
import { JAPANESE_PATTERN, PATH_PATTERN } from '#/core/text';

/** 语言代码，与 locales/<id>/ 对应。 */
const LOCALE = 'zh';

const BEDROOM_LINES = ['alicia', 'emma', 'melvie', 'mimi', 'olivia', 'tara'];

/** 游戏原文件 → 词条文件（扩展名换成 .json，路径保持一致）。 */
const SOURCES: {
  file: string;
  out: string;
  extract: (path: string) => string[];
}[] = [
  {
    file: 'Assets/GameData.js',
    out: 'Assets/GameData.json',
    extract: fromGameData,
  },
  { file: 'GameMain.html', out: 'GameMain.json', extract: fromHtml },
  {
    file: 'bedroom_loop_prototype.html',
    out: 'bedroom_loop_prototype.json',
    extract: fromHtml,
  },
  // 源文件名带 _v2 后缀，词条文件名去掉。
  ...BEDROOM_LINES.map(name => ({
    file: `Assets/GameData/BedroomLines/${name}_bedroom_lines_v2.js`,
    out: `Assets/GameData/BedroomLines/${name}_bedroom_lines.json`,
    extract: fromScript,
  })),
];

/** 资源标识符，同样不是显示文本。 */
const SKIP_VALUE = /^(?:m:|bgm_|se_|v\d)/;

const root = resolve(import.meta.dir, '..');

function parseArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.findIndex(arg => arg === name);
  return index >= 0 ? args[index + 1] : undefined;
}

function isText(value: string): boolean {
  if (!value || value.length > 20000) {
    return false;
  }
  if (value.startsWith('data:') || SKIP_VALUE.test(value)) {
    return false;
  }
  if (PATH_PATTERN.test(value)) {
    return false;
  }
  if (value.includes('Assets/') || value.includes('Assets\\')) {
    return false;
  }
  return JAPANESE_PATTERN.test(value);
}

function push(out: string[], seen: Set<string>, value: string): void {
  if (!isText(value) || seen.has(value)) {
    return;
  }
  seen.add(value);
  out.push(value);
}

/** 还原 JS 字符串字面量里的转义。 */
function unescape(literal: string): string {
  return literal
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** 匹配双引号、单引号或反引号字符串，反引号分支保留 ${...} 占位 */
const LITERAL_RE =
  /"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** 反引号里嵌着的代码字面量也要抽（游戏有些补丁就是这么注入的）。 */
function eachNestedLiteral(
  text: string,
  depth: number,
  onLiteral: (raw: string, template: boolean) => void,
): void {
  if (depth > 4) {
    return;
  }

  const re = new RegExp(LITERAL_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[3] !== undefined) {
      onLiteral(match[3], true);
      eachNestedLiteral(match[3], depth + 1, onLiteral);
    } else {
      onLiteral(match[1] ?? match[2] ?? '', false);
    }
  }
}

function eachLiteral(
  path: string,
  onLiteral: (raw: string, template: boolean) => void,
): void {
  const raw = readFileSync(path, 'utf8');
  LITERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LITERAL_RE.exec(raw))) {
    if (match[3] !== undefined) {
      onLiteral(match[3], true);
      eachNestedLiteral(match[3], 0, onLiteral);
    } else {
      onLiteral(match[1] ?? match[2] ?? '', false);
    }
  }
}

export function fromScript(path: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  eachLiteral(path, literal => push(out, seen, unescape(literal)));
  return out;
}

/** 内联 HTML 按标签拆成可见片段，丢掉属性残片，${...} 原样保留。 */
function htmlSegments(literal: string, keepPlaceholders: boolean): string[] {
  return literal
    .split(/<[^>]*>/g)
    .map(part => (keepPlaceholders ? part : part.replace(/\$\{[^}]*\}/g, ' ')))
    .map(unescape)
    .map(part => {
      const end = part.lastIndexOf('>');
      return end >= 0 && part.slice(0, end).includes('="')
        ? part.slice(end + 1)
        : part;
    })
    .map(part => part.replace(/^(?:["']?\s*>+\s*)/, ''))
    .map(part => part.trim())
    .filter(Boolean);
}

export function fromHtml(path: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  eachLiteral(path, (literal, template) => {
    for (const segment of htmlSegments(literal, template)) {
      push(out, seen, segment);
    }
  });
  return out;
}

function walk(
  node: unknown,
  out: string[],
  seen: Set<string>,
  skipNames = false,
): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const value of node) {
      if (typeof value === 'string') {
        push(out, seen, value);
      } else {
        walk(value, out, seen, skipNames);
      }
    }
    return;
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    const value = (node as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      // 音乐列表里的 name 是曲名，作品名不翻译。
      if (!(skipNames && key === 'name') && !SKIP_KEY_PATTERN.test(key)) {
        push(out, seen, value);
      }
    } else if (value && typeof value === 'object') {
      walk(value, out, seen, key === MUSIC_LIST_KEY);
    }
  }
}

export function fromGameData(path: string): string[] {
  const raw = readFileSync(path, 'utf8');
  const json = raw
    .slice(raw.indexOf('=') + 1)
    .trim()
    .replace(/;\s*$/, '');
  const out: string[] = [];
  walk(JSON.parse(json), out, new Set());
  return out;
}

/** 读取既有译文，重跑时原样保留。 */
async function loadExisting(
  localeDir: string,
): Promise<Record<string, string>> {
  const dict: Record<string, string> = {};
  const glob = new Bun.Glob('**/*.json');

  for await (const rel of glob.scan({ cwd: localeDir, onlyFiles: true })) {
    const map = (await Bun.file(join(localeDir, rel)).json()) as Record<
      string,
      string | null
    >;
    for (const [key, value] of Object.entries(map)) {
      if (value) {
        dict[key] = value;
      }
    }
  }

  return dict;
}

/** 按源文件抽取顺序生成对照表，未翻译的值为 null。 */
function emit(strings: string[], dict: Record<string, string>): string {
  const map: Record<string, string | null> = {};
  for (const item of strings) {
    map[item] = dict[item] ?? null;
  }
  return JSON.stringify(map, null, 2) + '\n';
}

async function main(): Promise<void> {
  const gameArg = parseArg('--game');
  const gameDir = gameArg
    ? resolve(gameArg)
    : join(root, '..', 'Data', 'resources', 'unpacked_app');

  const localeDir = join(root, 'locales', LOCALE);
  const dict = await loadExisting(localeDir);

  for (const source of SOURCES) {
    const strings = source.extract(join(gameDir, source.file));
    const target = join(localeDir, source.out);
    await mkdir(dirname(target), { recursive: true });

    // 源文件里消失的串，译文也会丢，提示一下。
    const file = Bun.file(target);
    const previous = (await file.exists())
      ? ((await file.json()) as Record<string, string | null>)
      : {};
    const kept = new Set(strings);
    const lost = Object.keys(previous).filter(
      key => previous[key] && !kept.has(key),
    );

    await Bun.write(target, emit(strings, dict));

    const translated = strings.filter(item => dict[item]).length;
    console.log(
      `${relative(root, target)}: ${strings.length} 条，已翻译 ${translated}`,
    );
    if (lost.length) {
      const sample = lost
        .slice(0, 3)
        .map(key => JSON.stringify(key))
        .join('、');
      console.warn(
        `警告：${lost.length} 条已有译文不再出现在源文件里，会随之丢失，例如 ${sample}`,
      );
    }
  }
}

if (import.meta.main) {
  await main();
}
