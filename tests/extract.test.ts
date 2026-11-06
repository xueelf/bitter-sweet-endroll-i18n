import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fromGameData, fromHtml } from '~/scripts/extract';

const dir = mkdtempSync(join(tmpdir(), 'bse-extract-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

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

  test('半截 HTML 标签字面量不作为独立文案', () => {
    const file = join(dir, 'fragment.html');
    writeFileSync(
      file,
      `<script>var a = "を <b>"; var b = "</b> 消費しました"; var c = "<b>設定</b>";</script>`,
    );

    expect(fromHtml(file)).toEqual(['設定']);
  });

  test('GameData 赋值前的注释里有等号也能解析', () => {
    const file = join(dir, 'GameDataComment.js');
    writeFileSync(file, `// a = b\nwindow.__GAME_DATA__ = {"text":"設定"};\n`);

    expect(fromGameData(file)).toEqual(['設定']);
  });

  test('GameData 里的开发备注块不会进入词条', () => {
    const note = [
      '############################################################',
      '# 101-125 ／ 备注',
      '############################################################',
    ].join('\n');
    const data = { text: `正文。\n${note}` };
    const file = join(dir, 'GameDataNote.js');
    writeFileSync(file, `window.__GAME_DATA__ = ${JSON.stringify(data)};`);

    expect(fromGameData(file)).toEqual(['正文。']);
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
