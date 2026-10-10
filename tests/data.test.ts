import { describe, expect, test } from 'bun:test';

import { applyToData, revertData } from '#/adapter/data';
import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';

describe('data', () => {
  test('遍历时跳过音乐列表的 name（曲名不翻译）', () => {
    catalog.registerLocales([{ id: 'test-data', label: '测试' }]);
    catalog.mergeMap('test-data', { 曲名: '曲名译', 普通文本: '普通译文' });
    setLocale('test-data');

    const target = {
      music: [{ name: '曲名', cap: '共通背景' }],
      text: '普通文本',
    };
    applyToData(target);

    expect((target.music[0] as { name: string }).name).toBe('曲名');
    expect(target.text).toBe('普通译文');

    revertData();
    setLocale('ja');
  });
});
