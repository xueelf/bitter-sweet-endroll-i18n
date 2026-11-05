import { catalogRevision, fragmentsFor, patternsFor } from './catalog';
import { id as currentId, isDefault, map, protectedStrings } from './locale';
import { JAPANESE_PATTERN, PATH_PATTERN } from './text';

function isJapanese(text: string): boolean {
  return JAPANESE_PATTERN.test(text);
}

function looksLikePath(text: string): boolean {
  return (
    PATH_PATTERN.test(text) ||
    text.includes('Assets/') ||
    text.includes('Assets\\')
  );
}

/** 运行期没命中 KV 的日文，供自检和补词条使用。 */
const missing = new Set<string>();
const MAX_MISSING_LENGTH = 500;
const RESOURCE_ID = /^(?:m:|bgm_|se_|v\d)/;

function recordMissing(text: string): void {
  if (!text || text.length > MAX_MISSING_LENGTH) {
    return;
  }
  if (!isJapanese(text) || looksLikePath(text) || RESOURCE_ID.test(text)) {
    return;
  }
  // 编辑器内嵌 HTML、受保护控制串和表情标签不是待翻译文本。
  if (/[<>]/.test(text)) {
    return;
  }
  if (
    protectedStrings().has(text) ||
    text === '地の文|' ||
    text === '主人公|'
  ) {
    return;
  }
  if (/^\[[^\]]*\]$/.test(text)) {
    return;
  }
  missing.add(text);
}

/** 当前会话里回退过原文的文本。 */
export function missingTranslations(): string[] {
  return [...missing].sort();
}

/** 清空缺失记录（自检/测试用）。 */
export function clearMissingTranslations(): void {
  missing.clear();
}

/** 整串查表。 */
function lookup(text: string): string | null {
  const table = map();
  if (!table) {
    return null;
  }
  const translated = table[text];
  return typeof translated === 'string' && translated ? translated : null;
}

/** 模板占位里带出来的值可能也是日文，先按词典/片段单独翻一遍。 */
function translateCapture(value: string): string {
  return lookup(value) ?? fragments(value) ?? value;
}

/** 展开编译模板里的 $1、$2 与转义后的 $$。 */
function expandReplacement(template: string, values: string[]): string {
  let out = '';
  for (let i = 0; i < template.length; i += 1) {
    const char = template[i]!;
    if (char !== '$') {
      out += char;
      continue;
    }

    const next = template[i + 1];
    if (next === '$') {
      out += '$';
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < template.length && /\d/.test(template[end]!)) {
      end += 1;
    }
    if (end > i + 1) {
      const index = Number(template.slice(i + 1, end)) - 1;
      out += values[index] ?? '';
      i = end - 1;
      continue;
    }

    out += char;
  }
  return out;
}

/** 整串查表没命中时按模板兜底，用于游戏运行期拼出来的串。 */
function template(text: string): string | null {
  for (const { re, to } of patternsFor(currentId())) {
    const match = re.exec(text);
    if (match) {
      return expandReplacement(
        to,
        match.slice(1).map(value => translateCapture(value ?? '')),
      );
    }
  }
  return null;
}

/** 界面标签两端的装饰符号（地图上的 ◆◇、列表前的 · 等）。 */
const DECORATION = /[\s◇◆■□●○◎★☆・※]/;

/** 剥掉两端的装饰（◇◆・※ 等）与空白再查表，查到后把装饰贴回去。 */
function decorated(text: string): string | null {
  const lead = /^[\s◇◆■□●○◎★☆・※]+/.exec(text)?.[0] ?? '';
  const rest = text.slice(lead.length);
  const tail = /[\s◇◆■□●○◎★☆・※]+$/.exec(rest)?.[0] ?? '';
  const core = rest.slice(0, rest.length - tail.length);
  if (!core || !DECORATION.test(text)) {
    return null;
  }

  const translated = lookup(core) ?? template(core);
  return translated ? lead + translated + tail : null;
}

/** 片段替换的收尾闸门：替换后仍残留假名，说明只替换了半句，整句放弃。 */
const KANA = /[\u3041-\u3096\u30a1-\u30fa\u30fc]/;

/** 含平假名的串可能是完整句子，不能拿词典里的短词做自动片段替换。 */
const HIRAGANA = /[\u3041-\u3096]/;

/** 片段替换没覆盖到的汉字说明只翻了半句，整句放弃。 */
const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff]/;

type FragmentIndex = Map<string, [string, string][]>;

interface FragmentTable {
  /** 词典片段 + 手工片段，用于不含平假名的标签。 */
  all: FragmentIndex;
  /** 只含手工片段，用于可能含平假名的完整句子。 */
  manual: FragmentIndex;
}

/** 显示层兜底：按词条片段替换「代码常量 + 数据模板」拼出来的串。 */
function fragments(text: string): string | null {
  if (text.length < 2 || text.length > 80) {
    return null;
  }

  const table = fragmentTable();
  const index = HIRAGANA.test(text) ? table.manual : table.all;
  if (index.size === 0) {
    return null;
  }

  let out = '';
  let changed = false;
  let leftoverKanji = false;
  let at = 0;
  while (at < text.length) {
    let matched = 0;
    for (const [key, value] of index.get(text[at]!) ?? []) {
      if (key.length <= text.length - at && text.startsWith(key, at)) {
        out += value;
        at += key.length;
        matched = key.length;
        changed = true;
        break;
      }
    }
    if (!matched) {
      if (KANJI.test(text[at]!)) {
        leftoverKanji = true;
      }
      out += text[at];
      at += 1;
    }
  }
  return changed && !leftoverKanji && !KANA.test(out) ? out : null;
}

/** 片段替换用的词条索引：按首字符分组，长词条优先，换语言时重建。 */
let fragmentCache: FragmentTable | null = null;
let fragmentLocale = '';
let fragmentRevision = -1;

/** 带换行、占位符或分隔符的词条不是短语，跳过。 */
const FRAGMENT_SKIP = /\$\{|\{[A-Za-z_$][\w$]*\}|\{[0-9]+\}|\n|\|/;

function buildFragmentIndex(
  entries: [string, string][],
  allowIdentity = false,
): FragmentIndex {
  const index: FragmentIndex = new Map();
  for (const [key, value] of entries) {
    if (
      key.length === 0 ||
      (!allowIdentity && key === value) ||
      FRAGMENT_SKIP.test(key)
    ) {
      continue;
    }
    // 单字只允许汉字：像「朝」这种顶栏标签需要能参与拼接。
    if (key.length < 2 && !KANJI.test(key)) {
      continue;
    }
    const list = index.get(key[0]!);
    if (list) {
      list.push([key, value]);
    } else {
      index.set(key[0]!, [[key, value]]);
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => b[0].length - a[0].length);
  }
  return index;
}

function fragmentTable(): FragmentTable {
  if (
    fragmentCache &&
    fragmentLocale === currentId() &&
    fragmentRevision === catalogRevision()
  ) {
    return fragmentCache;
  }

  const manualEntries = Object.entries(fragmentsFor(currentId()));
  const autoEntries = Object.entries(map() ?? {});
  fragmentCache = {
    all: buildFragmentIndex([...manualEntries, ...autoEntries], true),
    manual: buildFragmentIndex(manualEntries, true),
  };
  fragmentLocale = currentId();
  fragmentRevision = catalogRevision();
  return fragmentCache;
}

/** 数据层译文到原文的反查表：DOM 从已翻译数据渲染后，切回原文时靠它还原。 */
const dataOriginals = new Map<string, string>();

/** 数据模板里的占位符：{0}、{cost}、${...}。 */
const DATA_TOKEN = /\$\{[^}]+\}|\{[A-Za-z_$][\w$]*\}|\{\d+\}/g;
const HAS_DATA_TOKEN = /\$\{[^}]+\}|\{[A-Za-z_$][\w$]*\}|\{\d+\}/;

interface CompiledDataTemplate {
  re: RegExp;
  tokens: string[];
}

interface DataPattern {
  locale: string;
  original: string;
  translated: string;
  /** 占位之外的固定文字长度，用于让更具体的模板先匹配。 */
  specificity: number;
  /** 运行期填过值的译文 → 带占位符的原文。 */
  reverse: CompiledDataTemplate;
  /** 运行期填过值的原文 → 带占位符的译文。 */
  forward: CompiledDataTemplate;
}

/** 带占位符的数据译文，运行期填值后仍要能双向重算。 */
const dataPatterns: DataPattern[] = [];
const dataPatternKeys = new Set<string>();

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileDataTemplate(template: string): CompiledDataTemplate | null {
  if (!HAS_DATA_TOKEN.test(template)) {
    return null;
  }

  let source = '^';
  let at = 0;
  const tokens: string[] = [];
  for (const match of template.matchAll(DATA_TOKEN)) {
    const index = match.index ?? 0;
    source += escapeRegExp(template.slice(at, index));
    // {0} 在数据模板里是数值；单独识别它，才能拆开相邻的 {1}{0}。
    source += match[0] === '{0}' ? '([-+]?\\d+(?:\\.\\d+)?)' : '([\\s\\S]*?)';
    tokens.push(match[0]);
    at = index + match[0].length;
  }
  source += escapeRegExp(template.slice(at)) + '$';
  return { re: new RegExp(source), tokens };
}

function renderDataTemplate(
  match: RegExpExecArray,
  compiled: CompiledDataTemplate,
  template: string,
): string | null {
  const values = new Map<string, string>();
  compiled.tokens.forEach((token, index) => {
    if (!values.has(token)) {
      values.set(token, match[index + 1] ?? '');
    }
  });

  let missing = false;
  const out = template.replace(DATA_TOKEN, token => {
    const value = values.get(token);
    if (value === undefined) {
      missing = true;
      return token;
    }
    return value;
  });
  return missing ? null : out;
}

/** 记录一条数据翻译，供 DOM 文本在切换语言时双向重算。 */
export function rememberDataTranslation(
  original: string,
  translated: string,
): void {
  if (!original || original === translated) {
    return;
  }

  dataOriginals.set(translated, original);

  const reverse = compileDataTemplate(translated);
  const forward = compileDataTemplate(original);
  if (!reverse || !forward) {
    return;
  }
  const key = `${currentId()}\u0000${original}\u0000${translated}`;
  if (!dataPatternKeys.has(key)) {
    dataPatternKeys.add(key);
    dataPatterns.push({
      locale: currentId(),
      original,
      translated,
      specificity:
        original.replace(DATA_TOKEN, '').length +
        translated.replace(DATA_TOKEN, '').length,
      reverse,
      forward,
    });
    dataPatterns.sort((a, b) => b.specificity - a.specificity);
  }
}

/** 把运行期填过值的数据译文还原成带占位符的原文。 */
function dataOriginal(text: string): string | null {
  const exact = dataOriginals.get(text);
  if (exact !== undefined) {
    return exact;
  }

  for (const pattern of dataPatterns) {
    const match = pattern.reverse.re.exec(text);
    if (!match) {
      continue;
    }
    const original = renderDataTemplate(
      match,
      pattern.reverse,
      pattern.original,
    );
    if (original !== null) {
      return original;
    }
  }

  return null;
}

/** 把运行期填过值的数据原文换成当前语言的译文。 */
function dataTranslated(text: string): string | null {
  const locale = currentId();
  for (const pattern of dataPatterns) {
    if (pattern.locale !== locale) {
      continue;
    }
    const match = pattern.forward.re.exec(text);
    if (!match) {
      continue;
    }
    const translated = renderDataTemplate(
      match,
      pattern.forward,
      pattern.translated,
    );
    if (translated !== null) {
      return translated;
    }
  }

  return null;
}

/** 取文本对应的日文原文：数据层译文能反查时先反查。 */
export function sourceText(text: string): string {
  return dataOriginal(text) ?? text;
}

/** 数据层查表：只替换词典里存在的整句，控制串与资源路径原样返回。 */
export function trData(text: string): string {
  if (!text) {
    return text;
  }
  if (isDefault() || protectedStrings().has(text)) {
    return text;
  }
  if (!isJapanese(text) || looksLikePath(text)) {
    return text;
  }

  const translated = lookup(text) ?? template(text);
  if (translated) {
    return translated;
  }
  recordMissing(text);
  return text;
}

/** 界面层查表：调用方负责 trim 和保留空白。 */
export function trUI(text: string): string {
  if (!text) {
    return text;
  }

  // 数据层先翻译、游戏再渲染时，DOM 里抓到的是译文；切回原文要先反查。
  const source = sourceText(text);
  if (isDefault()) {
    return source;
  }

  // 数据模板已经填过值时，整串查表命中不了，按占位符重新套当前语言。
  const localized = dataTranslated(source) ?? source;

  // KV 整串命中后直接返回，不再拿翻译结果做二次片段替换。
  const exact = lookup(localized);
  if (exact !== null) {
    return exact;
  }

  const templated = template(localized);
  if (templated !== null) {
    return templated;
  }

  const decoratedResult = decorated(localized);
  if (decoratedResult !== null) {
    return decoratedResult;
  }

  // 只有整串/模板都没命中时，才用 KV 短语补运行期拼出来的标签。
  const fragmented = fragments(localized);
  if (fragmented !== null) {
    return fragmented;
  }

  recordMissing(source);
  return localized;
}

/**
 * 整段 HTML 查表：游戏会把提示拆成「文字 + <b>数字</b> + 文字」，
 * 模板里直接带标签匹配，避免逐文本节点翻译后留下日文和多余空格。
 */
export function trHTML(html: string): string {
  if (!html) {
    return html;
  }

  const source = sourceText(html);
  if (isDefault()) {
    return source;
  }
  const localized = dataTranslated(source) ?? source;
  const translated = lookup(localized) ?? template(localized);
  if (translated !== null) {
    return translated;
  }
  recordMissing(source);
  return localized;
}
