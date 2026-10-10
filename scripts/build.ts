/* 构建入口：从原版归档提取文件，叠加 overlay 与 locales，打包 release/app.asar。 */
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createPackage } from '@electron/asar';

import { extractOriginals, findOriginalAsar } from '~/utils/asar';
import { type Injection, injectOverlay } from '~/utils/inject';
import {
  loadLocales,
  prepareLocaleData,
  writeLocaleIndex,
} from '~/utils/locales';
import { patchPreload } from '~/utils/preload';
import { assertVersions } from '~/utils/version';

const root = resolve(import.meta.dir, '..');
const localesDir = join(root, 'locales');
const overlayDir = join(root, 'overlay');
const releaseAsar = join(root, 'release', 'app.asar');

/** 把 src/ 下的 TS 打成一个经典脚本。 */
async function buildFramework(i18nDir: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(root, 'src', 'index.ts')],
    outdir: i18nDir,
    naming: 'bse-i18n.js',
    target: 'browser',
    format: 'iife',
  });

  if (!result.success) {
    throw new Error(`框架构建失败。\n${result.logs.map(String).join('\n')}`);
  }
}

async function main(): Promise<void> {
  const asarPath = findOriginalAsar(root);
  const workDir = await mkdtemp(join(tmpdir(), 'bse-build-'));
  const appDir = join(workDir, 'app');
  const i18nDir = join(appDir, 'Assets', 'i18n');
  const appLocalesDir = join(i18nDir, 'locales');

  try {
    await mkdir(i18nDir, { recursive: true });
    await extractOriginals(asarPath, appDir);
    await copyFile(
      join(overlayDir, 'electron-main.cjs'),
      join(appDir, 'electron-main.cjs'),
    );
    // 内置字体统一替换游戏字体，许可随字体分发。
    await mkdir(join(i18nDir, 'fonts'), { recursive: true });
    await copyFile(
      join(root, 'fonts', 'NotoSerifSC-VF.otf'),
      join(i18nDir, 'fonts', 'NotoSerifSC-VF.otf'),
    );
    await copyFile(
      join(root, 'fonts', 'LICENSE.txt'),
      join(i18nDir, 'fonts', 'LICENSE.txt'),
    );

    const locales = await loadLocales(localesDir);
    await patchPreload(appDir, locales, overlayDir);
    await buildFramework(i18nDir);
    const shipped = await prepareLocaleData(localesDir, locales, appLocalesDir);
    await writeLocaleIndex(locales, appLocalesDir, shipped);

    const snippets: Injection[] = [
      {
        anchor: '</title>',
        marker: '__BSE_APP_DIR__',
        snippet: await readFile(
          join(overlayDir, 'game-main-base.html'),
          'utf8',
        ),
      },
      {
        anchor: 'BedroomLines/tara_bedroom_lines_v2.js"></script>',
        marker: '"Assets/i18n/bse-i18n.js"',
        snippet: await readFile(
          join(overlayDir, 'game-main-i18n.html'),
          'utf8',
        ),
      },
    ];

    const gameMainPath = join(appDir, 'GameMain.html');
    const html = await readFile(gameMainPath, 'utf8');
    await writeFile(gameMainPath, injectOverlay(html, snippets), 'utf8');

    await assertVersions(root, appDir);

    await mkdir(dirname(releaseAsar), { recursive: true });
    await createPackage(appDir, releaseAsar);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log('release/app.asar');
}

await main();
