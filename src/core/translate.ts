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

/** 整串查表。 */
function lookup(text: string): string | null {
  const table = map();
  if (!table) {
    return null;
  }
  const translated = table[text];
  return typeof translated === 'string' && translated ? translated : null;
}

/** 整串查表没命中时按模板兜底，用于游戏运行期拼出来的串。 */
function template(text: string): string | null {
  for (const { re, to } of patternsFor(currentId())) {
    if (re.test(text)) {
      return text.replace(re, to);
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
const FRAGMENT_SKIP = /\$\{|\{[0-9]+\}|\n|\|/;

function buildFragmentIndex(entries: [string, string][]): FragmentIndex {
  const index: FragmentIndex = new Map();
  for (const [key, value] of entries) {
    if (key.length === 0 || key === value || FRAGMENT_SKIP.test(key)) {
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
    all: buildFragmentIndex([...manualEntries, ...autoEntries]),
    manual: buildFragmentIndex(manualEntries),
  };
  fragmentLocale = currentId();
  fragmentRevision = catalogRevision();
  return fragmentCache;
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
  return lookup(text) ?? template(text) ?? text;
}

/** 界面层查表：调用方负责 trim 和保留空白。 */
export function trUI(text: string): string {
  if (!text || isDefault()) {
    return text;
  }
  // 片段替换放在最后：模板/装饰替换后的结果里还可能残留代码常量拼出来的日文。
  const done = lookup(text) ?? template(text) ?? decorated(text) ?? text;
  return fragments(done) ?? done;
}

/**
 * 整段 HTML 查表：游戏会把提示拆成「文字 + <b>数字</b> + 文字」，
 * 模板里直接带标签匹配，避免逐文本节点翻译后留下日文和多余空格。
 */
export function trHTML(html: string): string {
  if (!html || isDefault()) {
    return html;
  }
  return lookup(html) ?? template(html) ?? html;
}
