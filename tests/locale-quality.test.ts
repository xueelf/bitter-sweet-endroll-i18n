import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 词条根目录，路径与游戏源文件一一对应。 */
const LOCALE_ROOT = join(import.meta.dir, '..', 'locales', 'zh');

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return jsonFiles(full);
    }
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

const count = (text: string, mark: string): number =>
  text.split(mark).length - 1;

interface LocaleFile {
  file: string;
  map: Record<string, string | null>;
}

/** 测试只读一次，三个检查共用同一份解析结果。 */
const localeFiles: LocaleFile[] = jsonFiles(LOCALE_ROOT).map(file => ({
  file,
  map: JSON.parse(readFileSync(file, 'utf8')) as Record<string, string | null>,
}));

/** 占位符里的 JS 可能带 |，结构校验前先去掉。 */
const stripPlaceholders = (text: string): string =>
  text.replace(/\$\{[^}]*\}/g, '');

/** 去掉占位符与 HTML 标签后再数标点，避免把代码里的符号算进去。 */
const stripMarkup = (text: string): string =>
  stripPlaceholders(text).replace(/<[^>]*>/g, '');

/** 引号允许换样式，但总数量不能变。 */
const QUOTE_CHARS = ['「', '」', '『', '』', '"', '“', '”', '‘', '’'];

function mappedCount(text: string, marks: readonly string[]): number {
  const stripped = stripMarkup(text);
  return marks.reduce((sum, mark) => sum + count(stripped, mark), 0);
}

function punctuationIssues(key: string, value: string): string[] {
  const issues: string[] = [];
  const comma = mappedCount(value, ['，', '、']);
  if (mappedCount(key, ['、']) !== comma) {
    issues.push(`、${mappedCount(key, ['、'])} → ，/、${comma}`);
  }
  for (const mark of ['。', '！', '？', '……']) {
    const source = mappedCount(key, [mark]);
    const target = mappedCount(value, [mark]);
    if (source !== target) {
      issues.push(`${mark}${source} → ${target}`);
    }
  }
  // 冒号、分号、括号允许全角/半角转换，但数量不能变。
  for (const [name, marks] of [
    ['：', ['：', ':']],
    ['；', ['；', ';']],
    ['（', ['（', '(']],
    ['）', ['）', ')']],
  ] as const) {
    const source = mappedCount(key, marks);
    const target = mappedCount(value, marks);
    if (source !== target) {
      issues.push(`${name}${source} → ${target}`);
    }
  }
  // 引号样式可以换，但总数量不能多也不能少。
  const sourceQuotes = mappedCount(key, QUOTE_CHARS);
  const targetQuotes = mappedCount(value, QUOTE_CHARS);
  if (sourceQuotes !== targetQuotes) {
    issues.push(`引号${sourceQuotes} → ${targetQuotes}`);
  }
  // 星号既用于分隔线，也用于 **强调**，数量必须保留。
  const sourceStars = mappedCount(key, ['*', '＊']);
  const targetStars = mappedCount(value, ['*', '＊']);
  if (sourceStars !== targetStars) {
    issues.push(`*${sourceStars} → ${targetStars}`);
  }
  if (value.includes('\uFFFD')) {
    issues.push('含替换字符 �');
  }
  // 除分隔线用的 ─ 外，不该出现制表符；这是乱码的典型残留。
  const box = /[\u2501-\u257F]/u.exec(value);
  if (box) {
    issues.push(`含异常制表符 ${box[0]}`);
  }
  if (value.includes('〜')) {
    issues.push('〜 应改为 ～');
  }
  return issues;
}

function structureIssues(key: string, value: string): string[] {
  const issues: string[] = [];
  for (const mark of ['\n', '---', '===', '選択肢:']) {
    if (count(key, mark) !== count(value, mark)) {
      issues.push(
        `${JSON.stringify(mark)} ${count(key, mark)} → ${count(value, mark)}`,
      );
    }
  }
  const sourcePipes = count(stripPlaceholders(key), '|');
  const targetPipes = count(stripPlaceholders(value), '|');
  if (sourcePipes !== targetPipes) {
    issues.push(`| ${sourcePipes} → ${targetPipes}`);
  }
  return issues;
}

/** 假名残留：说话者前缀、表情标签与选项权重是受保护串，先剥掉。 */
const KANA = /[\u3041-\u3096\u30a1-\u30fa\u30fc\uff66-\uff9f]/;

function kanaLeft(value: string): boolean {
  return KANA.test(
    value
      .replace(/地の文/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\|(?:良い|悪い|-?\d+)$/gm, ''),
  );
}

describe('locale quality', () => {
  test('标点数量与原文一致', () => {
    const failures: string[] = [];

    for (const { file, map } of localeFiles) {
      for (const [key, value] of Object.entries(map)) {
        if (typeof value !== 'string' || !value) {
          continue;
        }
        const issues = punctuationIssues(key, value);
        if (issues.length) {
          failures.push(
            `${relative(LOCALE_ROOT, file)}: ${JSON.stringify(key).slice(0, 80)}（${issues.join('，')}）`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('换行、分隔符、选项与说话者前缀数量与原文一致', () => {
    const failures: string[] = [];

    for (const { file, map } of localeFiles) {
      for (const [key, value] of Object.entries(map)) {
        if (typeof value !== 'string' || !value) {
          continue;
        }
        const issues = structureIssues(key, value);
        if (issues.length) {
          failures.push(
            `${relative(LOCALE_ROOT, file)}: ${JSON.stringify(key).slice(0, 80)}（${issues.join('，')}）`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('受保护串之外没有假名残留', () => {
    const failures: string[] = [];

    for (const { file, map } of localeFiles) {
      for (const [key, value] of Object.entries(map)) {
        if (typeof value !== 'string' || !value) {
          continue;
        }
        // 表情名、控制串等短标签允许与原文相同；长句相同则视为漏翻。
        if (
          value === key &&
          value.length <= 8 &&
          !/[。！？、，\n]/.test(value)
        ) {
          continue;
        }
        if (kanaLeft(value)) {
          failures.push(
            `${relative(LOCALE_ROOT, file)}: ${JSON.stringify(key).slice(0, 80)} → ${JSON.stringify(value).slice(0, 80)}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('引号、括号、冒号按总数校验，全半角可互换', () => {
    expect(punctuationIssues('あ「い」', 'あ“い”')).toEqual([]);
    expect(punctuationIssues('あ「い」', 'あい')).not.toEqual([]);
    expect(punctuationIssues('あ（い）', 'あ(い)')).toEqual([]);
    expect(punctuationIssues('あ：い', 'あ:い')).toEqual([]);
    expect(punctuationIssues('あ；い', 'あ;い')).toEqual([]);
    expect(punctuationIssues('あ**い**', 'あい')).not.toEqual([]);
    expect(punctuationIssues('あ**い**', 'あ**い**')).toEqual([]);
  });

  test('乱码制表符会被拦下', () => {
    expect(punctuationIssues('あ', 'あ╀')).not.toEqual([]);
  });

  test('统一使用“欸”，不出现“诶”', () => {
    const failures: string[] = [];

    for (const { file, map } of localeFiles) {
      for (const [key, value] of Object.entries(map)) {
        if (typeof value === 'string' && value.includes('诶')) {
          failures.push(
            `${relative(LOCALE_ROOT, file)}: ${JSON.stringify(key).slice(0, 80)}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
