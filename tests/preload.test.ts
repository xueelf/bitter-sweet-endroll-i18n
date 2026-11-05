import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { patchPreload } from '~/utils/preload';

function fixture(): { appDir: string; overlayDir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'bse-preload-'));
  const appDir = join(root, 'app');
  const overlayDir = join(root, 'overlay');
  mkdirSync(appDir, { recursive: true });
  mkdirSync(overlayDir, { recursive: true });

  writeFileSync(
    join(appDir, 'electron-preload.cjs'),
    [
      'const startupCoverKey = webFrame.insertCSS(`',
      "  html::after { content: '起動中…'; }",
      '`);',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(overlayDir, 'electron-preload-patch.js'),
    [
      'const BSE_LOCALES = __LOCALES_JSON__;',
      'const key = __LOCALE_STORAGE_KEY__;',
      'const fallback = __DEFAULT_LOCALE__;',
      '',
    ].join('\n'),
  );

  return { appDir, overlayDir, root };
}

describe('patchPreload', () => {
  test('替换语言清单、存储键与默认语言，并保留运行期模板', async () => {
    const { appDir, overlayDir, root } = fixture();
    try {
      await patchPreload(
        appDir,
        [
          {
            id: 'zh',
            label: '中文',
            messages: { startup: '启动中…' },
          },
        ],
        overlayDir,
      );

      const patched = readFileSync(
        join(appDir, 'electron-preload.cjs'),
        'utf8',
      );
      expect(patched).toContain(
        'const BSE_LOCALES = {"zh":{"startup":"启动中…"}};',
      );
      expect(patched).toContain('const key = "bse_locale";');
      expect(patched).toContain('const fallback = "ja";');
      expect(patched).toContain(
        'content: ${JSON.stringify(bseMeta.startup || "起動中…")};',
      );
      expect(patched).not.toContain('__LOCALES_JSON__');
      expect(patched).not.toContain('__LOCALE_STORAGE_KEY__');
      expect(patched).not.toContain('__DEFAULT_LOCALE__');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('启动文案里的美元符号不会被替换成捕获组', async () => {
    const { appDir, overlayDir, root } = fixture();
    try {
      await patchPreload(
        appDir,
        [
          {
            id: 'zh',
            label: '中文',
            messages: { startup: '启动 $& $1' },
          },
        ],
        overlayDir,
      );

      const patched = readFileSync(
        join(appDir, 'electron-preload.cjs'),
        'utf8',
      );
      expect(patched).toContain(
        'const BSE_LOCALES = {"zh":{"startup":"启动 $& $1"}};',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('找不到启动遮罩时抛错', async () => {
    const { appDir, overlayDir, root } = fixture();
    try {
      writeFileSync(join(appDir, 'electron-preload.cjs'), 'nothing here');
      await expect(patchPreload(appDir, [], overlayDir)).rejects.toThrow(
        '找不到启动遮罩',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
