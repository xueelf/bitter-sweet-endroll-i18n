import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareLocaleData } from '~/utils/locales';

async function run(map: Record<string, string | null>) {
  const root = mkdtempSync(join(tmpdir(), 'bse-locales-'));
  try {
    const localesDir = join(root, 'locales');
    const appLocalesDir = join(root, 'app');
    mkdirSync(join(localesDir, 'zh'), { recursive: true });
    writeFileSync(
      join(localesDir, 'zh', 'Test.json'),
      `${JSON.stringify(map, null, 2)}\n`,
    );
    return await prepareLocaleData(
      localesDir,
      [{ id: 'zh', label: '中文' }],
      appLocalesDir,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('prepareLocaleData', () => {
  test('占位符结构一致时通过', async () => {
    await expect(
      run({ '${a}${b}${a}': '${x}${y}${x}' }),
    ).resolves.toBeDefined();
  });

  test('占位符数量相同但重复结构不同时报错', async () => {
    await expect(run({ '${a}${a}': '${x}${y}' })).rejects.toThrow(
      '占位结构不一致',
    );
  });

  test('占位符数量不同时报错', async () => {
    await expect(run({ '${a}${b}': '${x}' })).rejects.toThrow('占位结构不一致');
  });

  test('运行期序号占位顺序一致时通过', async () => {
    await expect(
      run({ '第{0}天，共{1}天': '第{0}天，共{1}天' }),
    ).resolves.toBeDefined();
  });

  test('运行期序号占位顺序变化时报错', async () => {
    await expect(
      run({ '第{0}天，共{1}天': '共{1}天，第{0}天' }),
    ).rejects.toThrow('占位结构不一致');
  });

  test('运行期序号占位缺失时报错', async () => {
    await expect(run({ '第{0}天': '第天' })).rejects.toThrow('占位结构不一致');
  });
});
