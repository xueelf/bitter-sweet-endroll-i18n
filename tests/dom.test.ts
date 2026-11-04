import { afterAll, describe, expect, test } from 'bun:test';

import { applyMutation, translateInlineHtml } from '#/adapter/dom';
import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';

describe('dom adapter', () => {
  test('行内 HTML 容器按带标签的模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-dom-html',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
        ],
      },
    ]);
    setLocale('test-dom-html');

    const element = {
      children: [{ tagName: 'B', attributes: [] }],
      innerHTML: '体力を <b>20</b> 消費しました',
    } as unknown as Element;

    expect(translateInlineHtml(element)).toBe(true);
    expect(element.innerHTML).toBe('消耗了 <b>20</b> 点体力');
  });

  test('游戏更新已有文本节点后会重新翻译', () => {
    catalog.registerLocales([{ id: 'test-dom-text', label: '测试' }]);
    catalog.mergeMap('test-dom-text', { 設定: '设置', 終了: '结束' });
    setLocale('test-dom-text');

    const node = { nodeValue: '設定' } as unknown as Text;
    applyMutation({
      type: 'characterData',
      target: node,
    } as unknown as MutationRecord);
    expect(node.nodeValue).toBe('设置');

    node.nodeValue = '終了';
    applyMutation({
      type: 'characterData',
      target: node,
    } as unknown as MutationRecord);
    expect(node.nodeValue).toBe('结束');
  });

  test('游戏更新已有属性后会重新翻译', () => {
    catalog.registerLocales([{ id: 'test-dom-attr', label: '测试' }]);
    catalog.mergeMap('test-dom-attr', { 設定: '设置', 終了: '结束' });
    setLocale('test-dom-attr');

    const attrs = new Map<string, string>([['title', '設定']]);
    const element = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attrs.set(name, value);
      },
    } as unknown as Element;

    applyMutation({
      type: 'attributes',
      target: element,
      attributeName: 'title',
    } as unknown as MutationRecord);
    expect(attrs.get('title')).toBe('设置');

    attrs.set('title', '終了');
    applyMutation({
      type: 'attributes',
      target: element,
      attributeName: 'title',
    } as unknown as MutationRecord);
    expect(attrs.get('title')).toBe('结束');

    attrs.delete('title');
    applyMutation({
      type: 'attributes',
      target: element,
      attributeName: 'title',
    } as unknown as MutationRecord);
    expect(attrs.has('title')).toBe(false);
  });

  test('属性译文里的美元符号原样保留', () => {
    catalog.registerLocales([{ id: 'test-dom-attr-dollar', label: '测试' }]);
    catalog.mergeMap('test-dom-attr-dollar', { 価格: '价格 $1' });
    setLocale('test-dom-attr-dollar');

    const attrs = new Map<string, string>([['title', '価格']]);
    const element = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attrs.set(name, value);
      },
    } as unknown as Element;

    applyMutation({
      type: 'attributes',
      target: element,
      attributeName: 'title',
    } as unknown as MutationRecord);
    expect(attrs.get('title')).toBe('价格 $1');
  });
});

afterAll(() => {
  setLocale('ja');
});
