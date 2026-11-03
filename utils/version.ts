import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 校对版本：本仓库与游戏本体必须一致；安装器版本由 package.json 注入。 */
export async function assertVersions(
  root: string,
  appDir: string,
): Promise<void> {
  const own = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  ) as {
    version?: string;
  };
  const game = JSON.parse(
    await readFile(join(appDir, 'package.json'), 'utf8'),
  ) as {
    version?: string;
  };

  const versions: Record<string, string> = {
    'package.json': own.version ?? '',
    游戏本体: game.version ?? '',
  };

  if (
    new Set(Object.values(versions)).size !== 1 ||
    !versions['package.json']
  ) {
    const detail = Object.entries(versions)
      .map(([name, value]) => `${name}=${value || '（缺失）'}`)
      .join('，');
    throw new Error(`版本不一致：${detail}。`);
  }
}
