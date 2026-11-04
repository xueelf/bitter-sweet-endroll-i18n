import { afterAll, describe, expect, test } from 'bun:test';

import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';
import { trHTML, trUI } from '#/core/translate';

describe('translate', () => {
  test('体力提示按纯文本模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-toast-text',
        label: '测试',
        templates: [
          { from: '体力を ${n} 消費しました', to: '消耗了 ${a} 点体力' },
          {
            from: '残り体力を ${n} 消費しました',
            to: '消耗了剩余 ${a} 点体力',
          },
          { from: '体力が ${n} 回復しました', to: '体力恢复了 ${a} 点' },
        ],
      },
    ]);
    setLocale('test-toast-text');

    expect(trUI('体力を 20 消費しました')).toBe('消耗了 20 点体力');
    expect(trUI('残り体力を 20 消費しました')).toBe('消耗了剩余 20 点体力');
    expect(trUI('体力が 20 回復しました')).toBe('体力恢复了 20 点');
  });

  test('体力提示按带 <b> 的 HTML 模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-toast-html',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
          {
            from: '残り体力を <b>${n}</b> 消費しました',
            to: '消耗了剩余 <b>${a}</b> 点体力',
          },
          {
            from: '体力が <b>${n}</b> 回復しました',
            to: '体力恢复了 <b>${a}</b> 点',
          },
        ],
      },
    ]);
    setLocale('test-toast-html');

    expect(trHTML('体力を <b>20</b> 消費しました')).toBe(
      '消耗了 <b>20</b> 点体力',
    );
    expect(trHTML('残り体力を <b>20</b> 消費しました')).toBe(
      '消耗了剩余 <b>20</b> 点体力',
    );
    expect(trHTML('体力が <b>20</b> 回復しました')).toBe(
      '体力恢复了 <b>20</b> 点',
    );
  });

  test('后注册词条会让片段缓存失效', () => {
    catalog.registerLocales([{ id: 'test-fragment-cache', label: '测试' }]);
    catalog.mergeMap('test-fragment-cache', { ABC: '甲' });
    setLocale('test-fragment-cache');

    expect(trUI('XYABC')).toBe('XY甲');

    catalog.mergeMap('test-fragment-cache', { XY: '乙' });
    expect(trUI('XYABC')).toBe('乙甲');
  });

  test('含平假名的句子不拿词典短词做自动片段替换', () => {
    catalog.registerLocales([
      {
        id: 'test-fragment-guard',
        label: '测试',
        fragments: { 手動で: '手动地' },
      },
    ]);
    catalog.mergeMap('test-fragment-guard', {
      体力: '体力',
      消費しました: '消耗了',
      未読: '未读',
    });
    setLocale('test-fragment-guard');

    expect(trUI('体力を20消費しました')).toBe('体力を20消費しました');
    expect(trUI('未読')).toBe('未读');
    expect(trUI('未読設定')).toBe('未読設定');
    expect(trUI('手動で')).toBe('手动地');
  });
});

afterAll(() => {
  setLocale('ja');
});
