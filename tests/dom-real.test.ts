import { afterAll, describe, expect, test } from 'bun:test';

import { Window } from 'happy-dom';

import { installCompat } from '#/adapter/compat';
import { applyToData, revertData } from '#/adapter/data';
import {
  applyLocaleCss,
  originalTextOf,
  startObserver,
  translateTree,
} from '#/adapter/dom';
import { CANCEL_LABEL_PATTERN } from '#/config';
import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';
import {
  clearMissingTranslations,
  missingTranslations,
} from '#/core/translate';

function useDom(): Window {
  const window = new Window();
  const global = globalThis as unknown as Record<string, unknown>;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.MutationObserver = window.MutationObserver;
  global.Element = window.Element;
  global.MouseEvent = window.MouseEvent;
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

  test('刷新地图按钮切回时用译文替换', () => {
    useDom();
    catalog.registerLocales([
      { id: 'test-real-update-controls', label: '测试' },
    ]);
    catalog.mergeMap('test-real-update-controls', {
      マップを更新: '刷新地图',
      マップへ: '前往地图',
    });
    setLocale('test-real-update-controls');

    const win = window as unknown as Record<string, unknown>;
    win.updateControls = () => {
      const reset = document.getElementById('reset');
      if (reset) {
        reset.style.display = '';
        reset.textContent = 'マップを更新';
      }
    };
    installCompat();

    document.body.innerHTML = '<button id="reset"></button>';
    (win.updateControls as () => void)();

    expect(document.getElementById('reset')!.textContent).toBe('前往地图');
  });

  test('地图设施译文点击后重放游戏原本的自宅处理', () => {
    useDom();
    catalog.registerLocales([
      { id: 'test-real-facility-replay', label: '测试' },
    ]);
    catalog.mergeMap('test-real-facility-replay', { 自宅: '住处' });
    setLocale('test-real-facility-replay');

    let opened = 0;
    document.addEventListener(
      'click',
      event => {
        const chip = (event.target as Element | null)?.closest?.(
          '.lch.special',
        );
        if (!chip) {
          return;
        }
        const plate = chip.querySelector('.plate');
        if (String(plate?.textContent ?? '').includes('自宅')) {
          opened += 1;
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    installCompat();

    document.body.innerHTML =
      '<button class="lch special"><span class="plate">◆自宅</span></button>';
    translateTree(document.body);
    const chip = document.querySelector('.lch.special')!;
    expect(chip.querySelector('.plate')!.textContent).toBe('◆住处');

    chip.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(opened).toBe(1);
  });

  test('CSS content 标题按当前语言切换', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-css', label: '测试' }]);
    catalog.mergeMap('test-real-css', {
      ギルド調査依頼: '公会调查委托',
      ギルド採取依頼: '公会采集委托',
    });
    setLocale('test-real-css');
    applyLocaleCss();

    expect(
      document.documentElement.style.getPropertyValue(
        '--bse-guild-explore-kicker',
      ),
    ).toBe('"公会调查委托"');
    expect(
      document.documentElement.style.getPropertyValue(
        '--bse-guild-gather-kicker',
      ),
    ).toBe('"公会采集委托"');
  });

  test('内置编辑器子树不翻译也不记录 missing', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-editor', label: '测试' }]);
    setLocale('test-real-editor');
    clearMissingTranslations();

    document.body.innerHTML =
      '<div id="settings"><button>JSON書出</button><p>場面用立ち絵画像</p></div>';
    translateTree(document.body);

    expect(document.querySelector('#settings button')!.textContent).toBe(
      'JSON書出',
    );
    expect(missingTranslations()).toEqual([]);

    clearMissingTranslations();
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

  test('数据层先翻译再渲染的文本，切回日文时还原', () => {
    useDom();
    catalog.registerLocales([{ id: 'test-real-data-switch', label: '测试' }]);
    catalog.mergeMap('test-real-data-switch', {
      'ギルドの依頼を選びます。': '请选择公会委托。',
      'ダンジョン調査 / 体力 -{cost} / 1区画 {reward}G{boostText}':
        '迷宫调查 / 体力 -{cost} / 1区格 {reward}G{boostText}',
    });
    setLocale('test-real-data-switch');

    const data = {
      note: 'ギルドの依頼を選びます。',
      line: 'ダンジョン調査 / 体力 -{cost} / 1区画 {reward}G{boostText}',
    };
    applyToData(data);
    document.body.innerHTML =
      `<p id="note">${data.note}</p>` +
      `<p id="line">${data.line
        .replaceAll('{cost}', '20')
        .replaceAll('{reward}', '15')
        .replaceAll('{boostText}', ' / 仕事量x2')}</p>`;
    translateTree(document.body);

    const note = document.getElementById('note')!;
    const line = document.getElementById('line')!;
    expect(note.textContent).toBe('请选择公会委托。');
    expect(line.textContent).toBe('迷宫调查 / 体力 -20 / 1区格 15G / 仕事量x2');
    expect(originalTextOf(note)).toBe('ギルドの依頼を選びます。');

    setLocale('ja');
    translateTree(document.body);
    expect(note.textContent).toBe('ギルドの依頼を選びます。');
    expect(line.textContent).toBe(
      'ダンジョン調査 / 体力 -20 / 1区画 15G / 仕事量x2',
    );

    setLocale('test-real-data-switch');
    translateTree(document.body);
    expect(note.textContent).toBe('请选择公会委托。');
    expect(line.textContent).toBe('迷宫调查 / 体力 -20 / 1区格 15G / 仕事量x2');

    // 日文状态下重新渲染出来的填充串，也要能切回中文。
    setLocale('ja');
    document.body.innerHTML =
      '<p id="note">ギルドの依頼を選びます。</p>' +
      '<p id="line">ダンジョン調査 / 体力 -20 / 1区画 15G / 仕事量x2</p>';
    translateTree(document.body);
    expect(document.getElementById('note')!.textContent).toBe(
      'ギルドの依頼を選びます。',
    );
    setLocale('test-real-data-switch');
    translateTree(document.body);
    expect(document.getElementById('note')!.textContent).toBe(
      '请选择公会委托。',
    );
    expect(document.getElementById('line')!.textContent).toBe(
      '迷宫调查 / 体力 -20 / 1区格 15G / 仕事量x2',
    );

    revertData();
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
