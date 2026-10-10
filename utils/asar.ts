import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { extractFile } from '@electron/asar';

/** 构建所需的原版文件从玩家自己的游戏提取。 */
const ORIGINAL_FILES = [
  'package.json',
  'electron-preload.cjs',
  'electron-window-layout.cjs',
  'GameMain.html',
  'Assets/AppIcon.ico',
  'Assets/BuildFlags.js',
];

function parseGameArg(): string | undefined {
  const args = process.argv.slice(2);
  const index = args.findIndex(arg => arg === '--game' || arg === '-g');
  return index >= 0 ? args[index + 1] : undefined;
}

/** 定位原版归档：装过补丁时原版已改名 base.asar，否则是 app.asar。 */
export function findOriginalAsar(root: string): string {
  const game = parseGameArg();
  const candidates: string[] = [];

  if (game) {
    const base = resolve(game);
    candidates.push(
      join(base, 'resources', 'base.asar'),
      join(base, 'resources', 'app.asar'),
      join(base, 'base.asar'),
      join(base, 'app.asar'),
    );
  }

  candidates.push(
    join(root, '..', 'Data', 'resources', 'base.asar'),
    join(root, '..', 'Data', 'resources', 'app.asar'),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    '找不到原版 app.asar / base.asar，用 --game <游戏根目录或 Data 目录> 指定。',
  );
}

/** 从原版归档里取出构建需要的那几个文件。 */
export async function extractOriginals(
  asarPath: string,
  appDir: string,
): Promise<void> {
  for (const file of ORIGINAL_FILES) {
    let buffer: Buffer;
    try {
      buffer = extractFile(asarPath, file);
    } catch {
      throw new Error(`原版归档里找不到 ${file}。`);
    }

    const target = join(appDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
  }
}
