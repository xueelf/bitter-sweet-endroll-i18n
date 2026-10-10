import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 校对版本：本仓库、游戏本体、安装器三处必须一致。 */
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
  const installer = await readFile(join(root, 'release', 'patch.bat'), 'utf8');
  const installerMatch = /set\s+"?GAME_VERSION=([0-9][^"\r\n]*)"?/i.exec(
    installer,
  );

  const versions: Record<string, string> = {
    'package.json': own.version ?? '',
    游戏本体: game.version ?? '',
    'patch.bat': installerMatch?.[1] ?? '',
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
