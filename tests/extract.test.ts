import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fromGameData, fromHtml } from '~/scripts/extract';

const dir = mkdtempSync(join(tmpdir(), 'bse-extract-'));

describe('extract', () => {
  test('HTML 里的字面量按标签拆段，属性残片丢掉', () => {
    const file = join(dir, 'plain.html');
    writeFileSync(
      file,
      `<script>
var a = "設定";
var b = "市場では店が開き、<br>神殿へ";
var c = ' title="上へ">↑ 上へ';
</script>`,
    );

    expect(fromHtml(file)).toEqual([
      '設定',
      '市場では店が開き、',
      '神殿へ',
      '↑ 上へ',
    ]);
  });

  test('反引号模板里嵌着的代码字面量也要抽到', () => {
    const file = join(dir, 'template.html');
    writeFileSync(
      file,
      '<script>const PATCH = `var x = ["せりふ１", "せりふ２"];`;</script>',
    );

    const keys = fromHtml(file);
    expect(keys).toContain('せりふ１');
    expect(keys).toContain('せりふ２');
  });

  test('GameData 遍历跳过 music[].name（曲名不翻译）', () => {
    const data = {
      characters: [
        {
          name: 'エマ',
          music: [{ name: '片割れ', cap: 'ルートBGM' }],
        },
      ],
    };
    const file = join(dir, 'GameData.js');
    writeFileSync(file, `window.__GAME_DATA__ = ${JSON.stringify(data)};`);

    expect(fromGameData(file)).toEqual(['エマ', 'ルートBGM']);
  });
});
