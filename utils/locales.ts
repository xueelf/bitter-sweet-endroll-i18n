import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { LocaleMeta } from '#/core/catalog';

/** 读取各语言的 index.js，语言代码取自文件夹名。 */
export async function loadLocales(localesDir: string): Promise<LocaleMeta[]> {
  const files: string[] = [];
  for (const file of new Bun.Glob('*/index.js').scanSync({
    cwd: localesDir,
    onlyFiles: true,
  })) {
    files.push(file);
  }
  files.sort();

  if (files.length === 0) {
    throw new Error(`没有找到任何语言，检查 ${localesDir}/*/index.js。`);
  }

  const locales: LocaleMeta[] = [];
  for (const file of files) {
    const module = (await import(
      pathToFileURL(join(localesDir, file)).href
    )) as {
      default?: {
        label?: string;
        messages?: Record<string, string>;
        templates?: { from: string; to: string }[];
        fragments?: Record<string, string>;
      };
    };
    const meta = module.default;
    if (!meta || typeof meta.label !== 'string' || !meta.label) {
      throw new Error(`${file} 没有导出有效的 label。`);
    }
    locales.push({
      id: dirname(file),
      label: meta.label,
      messages: meta.messages,
      templates: meta.templates,
      fragments: meta.fragments,
    });
  }

  return locales;
}

/** 收集某语言下的词条文件，返回相对语言目录的路径。 */
async function listLocaleFiles(localeDir: string): Promise<string[]> {
  const out: string[] = [];
  const glob = new Bun.Glob('**/*.json');

  for await (const rel of glob.scan({ cwd: localeDir, onlyFiles: true })) {
    out.push(rel.split(sep).join('/'));
  }

  return out.sort();
}

/** 占位符结构：同名占位复用编号，用来校验 from/to 是否能一一对应。 */
function placeholderShape(text: string): number[] {
  const seen = new Map<string, number>();
  const shape: number[] = [];
  for (const match of text.matchAll(/\$\{[^}]*\}/g)) {
    const name = match[0];
    let index = seen.get(name);
    if (index === undefined) {
      index = seen.size;
      seen.set(name, index);
    }
    shape.push(index);
  }
  return shape;
}

/** 运行期按序号替换的 {0}/{1}：去掉 ${...} 后再取，顺序和数量都要保留。 */
function runtimeShape(text: string): string[] {
  return [...text.replace(/\$\{[^}]*\}/g, '').matchAll(/\{[0-9]+\}/g)].map(
    match => match[0],
  );
}

/** 返回占位结构差异，结构一致时返回 null。 */
function placeholderMismatch(key: string, value: string): string | null {
  const need = placeholderShape(key);
  const got = placeholderShape(value);
  if (
    need.length !== got.length ||
    need.some((index, position) => index !== got[position])
  ) {
    return `${need.join(',')} → ${got.join(',')}`;
  }

  const needRuntime = runtimeShape(key);
  const gotRuntime = runtimeShape(value);
  if (needRuntime.join() !== gotRuntime.join()) {
    return `${needRuntime.join('')} → ${gotRuntime.join('')}`;
  }

  return null;
}

/** 词条打进补丁：去掉未翻译条目，包成经典脚本，全空的文件跳过。 */
export async function prepareLocaleData(
  localesDir: string,
  locales: LocaleMeta[],
  appLocalesDir: string,
): Promise<Record<string, string[]>> {
  const shipped: Record<string, string[]> = {};

  for (const { id } of locales) {
    const sourceDir = join(localesDir, id);
    const targetDir = join(appLocalesDir, id);
    const list: string[] = [];
    let untranslated = 0;

    for (const rel of await listLocaleFiles(sourceDir)) {
      const map = (await Bun.file(join(sourceDir, rel)).json()) as Record<
        string,
        string | null
      >;
      const kept = Object.fromEntries(
        Object.entries(map).filter(([, value]) => value),
      );
      const keptCount = Object.keys(kept).length;
      untranslated += Object.keys(map).length - keptCount;
      if (keptCount === 0) {
        continue;
      }

      // 模板占位结构对不上会漏替换/错位，点出来。
      const mismatch: string[] = [];
      for (const [key, value] of Object.entries(kept) as [string, string][]) {
        if (!key.includes('${') && !/\{[0-9]+\}/.test(key)) {
          continue;
        }
        const detail = placeholderMismatch(key, value);
        if (detail) {
          mismatch.push(`${JSON.stringify(key)}（${detail}）`);
        }
      }
      if (mismatch.length) {
        throw new Error(
          `${rel} 有 ${mismatch.length} 条模板占位结构不一致，切换语言时会漏替换：${mismatch
            .slice(0, 3)
            .join('、')}`,
        );
      }

      // Assets/GameData.json -> Assets/GameData.js
      const out = rel.replace(/\.json$/, '.js');
      const target = join(targetDir, out);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        `window.BSE_I18N.registerMap(${JSON.stringify(id)}, ${JSON.stringify(kept)});\n`,
        'utf8',
      );
      list.push(out);
    }

    if (untranslated > 0) {
      console.log(`[i18n] ${id}: 未翻译 ${untranslated} 条，将回退原文`);
    }

    shipped[id] = list;
  }

  return shipped;
}

/** 生成运行期语言清单：页面加载时把所有语言的词条一并读进来。 */
export async function writeLocaleIndex(
  locales: LocaleMeta[],
  appLocalesDir: string,
  files: Record<string, string[]>,
): Promise<void> {
  const source = [
    '/* 自动生成，请勿手改：由 scripts/build.ts 汇总各语言的 meta.js 得到 */',
    '(function () {',
    '  "use strict";',
    '',
    `  var FILES = ${JSON.stringify(files)};`,
    `  window.BSE_I18N.registerLocales(${JSON.stringify(
      locales.map(({ id, label, messages, templates, fragments }) => ({
        id,
        label,
        messages,
        templates,
        fragments,
      })),
    )});`,
    '',
    '  var fallback = location.href.replace(/[?#].*$/, "");',
    '  var dir = window.__BSE_APP_DIR__ || fallback.slice(0, fallback.lastIndexOf("/") + 1);',
    '  var html = "";',
    '  for (var locale in FILES) {',
    '    var list = FILES[locale] || [];',
    '    for (var i = 0; i < list.length; i++) {',
    '      html += "<scr" + "ipt src=\\"" + dir + "Assets/i18n/locales/" + locale + "/" + list[i] + "\\"></scr" + "ipt>";',
    '    }',
    '  }',
    '  html += "<scr" + "ipt>window.BSE_I18N.boot()</scr" + "ipt>";',
    '  document.write(html);',
    '})();',
    '',
  ].join('\n');

  await mkdir(appLocalesDir, { recursive: true });
  await writeFile(join(appLocalesDir, 'index.js'), source, 'utf8');
}
