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

  test('同一对象重复套用不会二次翻译', () => {
    catalog.registerLocales([{ id: 'test-data-twice', label: '测试' }]);
    catalog.mergeMap('test-data-twice', { 設定: '本日', 本日: '今天' });
    setLocale('test-data-twice');

    const target = { text: '設定' };
    applyToData(target);
    expect(target.text).toBe('本日');

    applyToData(target);
    expect(target.text).toBe('本日');

    revertData();
    expect(target.text).toBe('設定');
    setLocale('ja');
  });

  test('只读属性不会被替换', () => {
    catalog.registerLocales([{ id: 'test-data-readonly', label: '测试' }]);
    catalog.mergeMap('test-data-readonly', { 設定: '设置' });
    setLocale('test-data-readonly');

    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'text', {
      value: '設定',
      enumerable: true,
      writable: false,
    });
    applyToData(target);

    expect(target.text).toBe('設定');

    revertData();
    setLocale('ja');
  });
});
