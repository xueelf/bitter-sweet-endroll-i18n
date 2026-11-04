import { afterAll, describe, expect, test } from 'bun:test';

import { Window } from 'happy-dom';

import { installCompat } from '#/adapter/compat';
import { originalTextOf, startObserver, translateTree } from '#/adapter/dom';
import { CANCEL_LABEL_PATTERN } from '#/config';
import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';

function useDom(): Window {
  const window = new Window();
  const global = globalThis as unknown as Record<string, unknown>;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.MutationObserver = window.MutationObserver;
  global.Element = window.Element;
  return window;
}

describe('real DOM', () => {
  test('嵌套的 toast 也能按整段 HTML 翻译', () => {
    useDom();
    catalog.registerLocales([
      {
        id: 'test-real-html',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
        ],
      },
    ]);
    setLocale('test-real-html');

    document.body.innerHTML =
      '<div id="v3ToastHost"><div class="v3Toast">体力を <b>20</b> 消費しました</div></div>';
    translateTree(document.body);

    const toast = document.querySelector('.v3Toast')!;
    expect(toast.innerHTML).toBe('消耗了 <b>20</b> 点体力');
  });

  test('toast 切换语言后会按日文原文重算', () => {
    useDom();
    catalog.registerLocales([
      {
        id: 'test-real-html-switch',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
        ],
      },
    ]);
    setLocale('test-real-html-switch');

    document.body.innerHTML =
      '<div class="v3Toast">体力を <b>20</b> 消費しました</div>';
    translateTree(document.body);

    const toast = document.querySelector('.v3Toast')!;
    expect(toast.innerHTML).toBe('消耗了 <b>20</b> 点体力');

    setLocale('ja');
    translateTree(document.body);
    expect(toast.innerHTML).toBe('体力を <b>20</b> 消費しました');

    setLocale('test-real-html-switch');
    translateTree(document.body);
    expect(toast.innerHTML).toBe('消耗了 <b>20</b> 点体力');
  });

  test('观察器能接住游戏对 toast 容器的整体改写', async () => {
    useDom();
    catalog.registerLocales([
      {
        id: 'test-real-html-update',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
          {
            from: '体力が <b>${n}</b> 回復しました',
            to: '体力恢复了 <b>${a}</b> 点',
          },
        ],
      },
    ]);
    setLocale('test-real-html-update');

    document.body.innerHTML =
      '<div id="host"><div class="v3Toast">体力を <b>20</b> 消費しました</div></div>';
    translateTree(document.body);
    startObserver(() => {});

    const toast = document.querySelector('.v3Toast')!;
    expect(toast.innerHTML).toBe('消耗了 <b>20</b> 点体力');

    toast.innerHTML = '体力が <b>20</b> 回復しました';
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(toast.innerHTML).toBe('体力恢复了 <b>20</b> 点');
  });

  test('data-bse-no-i18n 子树不会被观察器翻译', async () => {
    useDom();
    catalog.registerLocales([
      {
        id: 'test-real-skip',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
        ],
      },
    ]);
    setLocale('test-real-skip');

    document.body.innerHTML =
      '<div id="skip" data-bse-no-i18n="1"><span></span></div>';
    translateTree(document.body);
    startObserver(() => {});

    const span = document.querySelector('#skip span')!;
    span.innerHTML = '体力を <b>20</b> 消費しました';
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(span.innerHTML).toBe('体力を <b>20</b> 消費しました');
  });

  test('兼容层读取取消按钮的日文原文', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-cancel', label: '测试' }]);
    catalog.mergeMap('test-real-cancel', { 閉じる: '关闭' });
    setLocale('test-real-cancel');

    document.body.innerHTML = '<button id="cancel">閉じる</button>';
    translateTree(document.body);

    const button = document.getElementById('cancel')!;
    expect(button.textContent).toBe('关闭');

    const original = originalTextOf(button).replace(/\s+/g, '');
    expect(original).toBe('閉じる');
    expect(CANCEL_LABEL_PATTERN.test(original)).toBe(true);
  });

  test('兼容层用日文原文识别取消按钮与地图设施', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-compat', label: '测试' }]);
    catalog.mergeMap('test-real-compat', { 閉じる: '关闭', 自宅: '住处' });
    setLocale('test-real-compat');

    const win = window as unknown as Record<string, unknown>;
    win.isCancelAction = () => false;
    win.markPermanentMapButtons = () => {};
    installCompat();

    document.body.innerHTML =
      '<button id="cancel">閉じる</button><button class="v2PointBtn">自宅</button>';
    translateTree(document.body);

    const cancel = document.getElementById('cancel')!;
    expect((win.isCancelAction as (el: Element) => boolean)(cancel)).toBe(true);

    (win.markPermanentMapButtons as () => void)();
    const mapButton = document.querySelector('.v2PointBtn')!;
    expect(mapButton.classList.contains('v14FacilityMapBtn')).toBe(true);
    expect(mapButton.classList.contains('v14MapHome')).toBe(true);
  });

  test('日期插入前会临时还原顶栏原文', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-day', label: '测试' }]);
    catalog.mergeMap('test-real-day', {
      マップ: '地图',
      朝: '早上',
      '1日目': '第1天',
    });
    setLocale('test-real-day');

    const win = window as unknown as Record<string, unknown>;
    win.addDayToTop = () => {
      const top = document.getElementById('top');
      if (!top || !top.textContent || top.textContent.includes('日目')) {
        return;
      }
      const parts = top.textContent.split('｜');
      if (['マップ', '探索', '対面'].includes(parts[0]!)) {
        parts.splice(1, 0, '1日目');
        top.textContent = parts.join('｜');
      }
    };
    installCompat();

    document.body.innerHTML = '<div id="top">マップ｜朝</div>';
    translateTree(document.body);
    expect(document.getElementById('top')!.textContent).toBe('地图｜早上');

    (win.addDayToTop as () => void)();
    expect(document.getElementById('top')!.textContent).toBe(
      '地图｜第1天｜早上',
    );
  });

  test('日期函数抛错后顶栏仍保持翻译', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-day-throw', label: '测试' }]);
    catalog.mergeMap('test-real-day-throw', { マップ: '地图', 朝: '早上' });
    setLocale('test-real-day-throw');

    const win = window as unknown as Record<string, unknown>;
    win.addDayToTop = () => {
      throw new Error('boom');
    };
    installCompat();

    document.body.innerHTML = '<div id="top">マップ｜朝</div>';
    translateTree(document.body);
    expect(() => (win.addDayToTop as () => void)()).toThrow('boom');
    expect(document.getElementById('top')!.textContent).toBe('地图｜早上');
  });

  test('观察器能接住游戏对已有文本节点的更新', async () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-observer', label: '测试' }]);
    catalog.mergeMap('test-real-observer', { 設定: '设置', 終了: '结束' });
    setLocale('test-real-observer');

    document.body.innerHTML = '<div id="label">設定</div>';
    translateTree(document.body);
    const label = document.getElementById('label')!;
    expect(label.textContent).toBe('设置');

    startObserver(() => {});
    const text = label.firstChild as Text;
    text.nodeValue = '終了';
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(label.textContent).toBe('结束');
  });
});

afterAll(() => {
  setLocale('ja');
});
