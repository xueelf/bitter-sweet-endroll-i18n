import { describe, expect, test } from 'bun:test';

import * as catalog from '#/core/catalog';

describe('catalog', () => {
  test('原文语言始终排在最前', () => {
    expect(catalog.locales()[0]?.id).toBe('ja');
  });

  test('同一语言的词条会合并，未翻译的条目跳过', () => {
    catalog.mergeMap('test-merge', { a: '1', b: '2' });
    catalog.mergeMap('test-merge', { b: '3', c: null });
    expect(catalog.mapFor('test-merge')).toEqual({ a: '1', b: '3' });
  });

  test('显示名以显式声明为准', () => {
    catalog.registerLocales([{ id: 'test-label', label: '正式名' }]);
    expect(
      catalog.locales().find(item => item.id === 'test-label')?.label,
    ).toBe('正式名');
  });

  test('id 为空的记录被忽略', () => {
    catalog.registerLocales([{ id: '', label: '空' }]);
    expect(catalog.has('')).toBe(false);
  });

  test('运行期模板按占位整串匹配', () => {
    catalog.registerLocales([
      {
        id: 'test-template',
        label: '测试',
        templates: [{ from: '${n}日目', to: '第${n}天' }],
      },
    ]);
    const [template] = catalog.patternsFor('test-template');
    expect(template).toBeDefined();
    expect(template!.re.test('12日目')).toBe(true);
    expect(template!.re.test('12日目です')).toBe(false);
    expect('12日目'.replace(template!.re, template!.to)).toBe('第12天');
  });

  test('词条里带占位的键会被当成模板', () => {
    catalog.mergeMap('test-inline', { '${name}|おはよう': '${n}|早上好' });
    expect(catalog.mapFor('test-inline')).toEqual({});
    const [pattern] = catalog.patternsFor('test-inline');
    expect('艾玛|おはよう'.replace(pattern!.re, pattern!.to)).toBe(
      '艾玛|早上好',
    );
  });

  test('重复出现的占位用反向引用，两次取值必须相同', () => {
    catalog.mergeMap('test-dup', { '${x}と${x}': '${a}与${a}' });
    const [pattern] = catalog.patternsFor('test-dup');
    expect('いぬといぬ'.replace(pattern!.re, pattern!.to)).toBe('いぬ与いぬ');
    expect(pattern!.re.test('いぬとねこ')).toBe(false);
  });

  test('译文占位比原文多时，多出来的原样保留（构建会警告）', () => {
    catalog.mergeMap('test-extra', { 'あ${x}い': '甲${p}乙${q}' });
    const [pattern] = catalog.patternsFor('test-extra');
    expect('あＸい'.replace(pattern!.re, pattern!.to)).toBe('甲Ｘ乙${q}');
  });

  test('纯占位符模板被拒绝，不遮挡后续模板', () => {
    catalog.mergeMap('test-catchall', { '${x}': '${a}' });
    catalog.mergeMap('test-catchall', { '前缀${x}后缀': '前${a}后' });
    const patterns = catalog.patternsFor('test-catchall');
    expect(patterns.length).toBe(1);
    expect('前缀123后缀'.replace(patterns[0]!.re, patterns[0]!.to)).toBe(
      '前123后',
    );
  });
});
