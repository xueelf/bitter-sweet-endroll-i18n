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

    for (const rel of await listLocaleFiles(sourceDir)) {
      const map = (await Bun.file(join(sourceDir, rel)).json()) as Record<
        string,
        string | null
      >;
      const kept = Object.fromEntries(
        Object.entries(map).filter(([, value]) => value),
      );
      if (Object.keys(kept).length === 0) {
        continue;
      }

      // 模板占位数量对不上会漏替换，点出来。
      const placeholderCount = (text: string): number =>
        new Set([...text.matchAll(/\$\{[^}]*\}/g)].map(match => match[0])).size;
      const mismatch: string[] = [];
      for (const [key, value] of Object.entries(kept) as [string, string][]) {
        if (!key.includes('${')) {
          continue;
        }
        const need = placeholderCount(key);
        const got = placeholderCount(value);
        if (need !== got) {
          mismatch.push(`${JSON.stringify(key)}（${need} → ${got}）`);
        }
      }
      if (mismatch.length) {
        console.warn(
          `警告：${rel} 有 ${mismatch.length} 条模板占位数量不一致，切换语言时会漏替换：${mismatch
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
