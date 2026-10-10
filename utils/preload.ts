import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LocaleMeta } from '#/core/catalog';

/**
 * 启动遮罩文案与统一字体：遮罩是 preload 用 CSS content 画的，DOM 碰不到，
 * 文案得烘焙进 preload，字体也在这里统一替换。
 * 注入代码在 overlay/electron-preload-patch.js，文案用 JSON.stringify 拼。
 */
export async function patchPreload(
  appDir: string,
  locales: LocaleMeta[],
  overlayDir: string,
): Promise<void> {
  const file = join(appDir, 'electron-preload.cjs');
  const source = await readFile(file, 'utf8');

  const insertAt = 'const startupCoverKey = webFrame.insertCSS(`';
  const coverText = "content: '起動中…';";
  if (!source.includes(insertAt) || !source.includes(coverText)) {
    throw new Error('electron-preload.cjs 结构变了，找不到启动遮罩。');
  }

  const meta: Record<string, { startup?: string }> = {};
  for (const locale of locales) {
    const startup = locale.messages?.startup;
    if (startup) {
      meta[locale.id] = { startup };
    }
  }

  const extra = (
    await readFile(join(overlayDir, 'electron-preload-patch.js'), 'utf8')
  ).replaceAll('__LOCALES_JSON__', JSON.stringify(meta));

  const patched = source
    .replace(insertAt, () => `${extra}\n${insertAt}`)
    .replace(
      coverText,
      () => "content: ${JSON.stringify(bseMeta.startup || '起動中…')};",
    );

  await writeFile(file, patched, 'utf8');
}
