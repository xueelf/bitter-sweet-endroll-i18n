import { CANCEL_LABEL_PATTERN, MAP_FACILITY_ALIASES } from '#/config';
import { trUI } from '#/core/translate';

import { originalTextOf, revertTree, translateTree } from './dom';

/** 地点标签/按钮两端的装饰符号。 */
const MAP_DECORATION = /[◆⌂]/g;

/** 打过补丁的游戏函数，避免重复包装。 */
interface Wrapped {
  __bseWrapped?: boolean;
}

function isWrapped(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as Wrapped).__bseWrapped === true;
}

/** 包装游戏函数：不存在或已包过时返回 undefined，调用方自行写回 window。 */
export function wrapOnce<T extends (...args: never[]) => unknown>(
  current: T | undefined,
  make: (base: T) => T,
): T | undefined {
  if (typeof current !== 'function' || isWrapped(current)) {
    return undefined;
  }
  const wrapped = make(current);
  (wrapped as T & Wrapped).__bseWrapped = true;
  return wrapped;
}

/** 界面判定读的是 DOM 文本，翻译后会落空，这里按中文再认一遍。 */
export function installCompat(): void {
  installCancelAction();
  installMapButtons();
  installUpdateControls();
  installDayLabel();
  installLocationChips();
  installLogPlaceholder();
}

/**
 * addDayToTop 用 textContent 里有没有「日目」判重，翻译后判定失效会重复插入日期。
 * 调用前把顶栏还原成原文，跑完再翻译回去。
 */
function installDayLabel(): void {
  const wrapped = wrapOnce(
    window.addDayToTop,
    base =>
      (...args: unknown[]): unknown => {
        const top = document.getElementById('top');
        if (!top) {
          return base(...args);
        }
        revertTree(top);
        try {
          return base(...args);
        } finally {
          translateTree(top);
        }
      },
  );
  if (wrapped) {
    window.addDayToTop = wrapped;
  }
}

/** 顶栏地点标签：按日文原文识别设施，避免依赖译文。 */
function installLocationChips(): void {
  let replaying = false;

  document.addEventListener(
    'click',
    event => {
      if (replaying) {
        return;
      }

      const chip = (event.target as Element | null)?.closest?.('.lch.special');
      if (!chip) {
        return;
      }
      const plate = chip.querySelector('.plate');
      const name = (originalTextOf(chip) || String(plate?.textContent ?? ''))
        .replace(MAP_DECORATION, '')
        .trim();
      const kind = Object.entries(MAP_FACILITY_ALIASES).find(([alias]) =>
        name.includes(alias),
      )?.[1];
      const action =
        kind === 'home'
          ? window.openHome
          : kind === 'shop'
            ? window.openShop
            : kind === 'guild'
              ? window.openGuild
              : undefined;

      if (!action && !kind) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (action) {
        action();
        return;
      }

      // 游戏自己的点击处理按日文牌名匹配；译文牌名会匹配失败，临时换回日文重放一次。
      const japanese =
        kind === 'home'
          ? '自宅'
          : kind === 'shop'
            ? 'ショップ'
            : '冒険者ギルド';
      replaying = true;
      try {
        if (plate) {
          plate.textContent = japanese;
        }
        chip.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
      } finally {
        replaying = false;
        translateTree(chip);
      }
    },
    true,
  );
}

/**
 * 日志面板的空状态文案翻译后，log() 里的清空判定会落空，
 * 第一条日志会把「暂无日志。」一起带进去，这里先清掉。
 */
function installLogPlaceholder(): void {
  const wrapped = wrapOnce(
    window.log,
    base =>
      (...args: unknown[]): unknown => {
        try {
          const el = document.getElementById('log');
          if (el && originalTextOf(el) === 'ログはまだありません。') {
            el.textContent = '';
          }
        } catch {
          /* 日志还没渲染时忽略 */
        }
        return base(...args);
      },
  );
  if (wrapped) {
    window.log = wrapped;
  }
}

function installCancelAction(): void {
  const wrapped = wrapOnce(
    window.isCancelAction,
    base =>
      (element: Element | null): boolean => {
        try {
          if (base(element)) {
            return true;
          }
          if (!element) {
            return false;
          }
          const text = originalTextOf(element)
            .replace(/\s+/g, '')
            .replace(/^[✕×❮←]+/, '');
          return CANCEL_LABEL_PATTERN.test(text);
        } catch {
          return false;
        }
      },
  );
  if (wrapped) {
    window.isCancelAction = wrapped;
  }
}

function installMapButtons(): void {
  const wrapped = wrapOnce(
    window.markPermanentMapButtons,
    base =>
      (...args: unknown[]): unknown => {
        try {
          for (const button of document.querySelectorAll('.v2PointBtn')) {
            const text = (
              originalTextOf(button) || String(button.textContent ?? '')
            )
              .replace(MAP_DECORATION, '')
              .trim();
            const kind = MAP_FACILITY_ALIASES[text];
            if (kind) {
              button.classList.add(
                'v14FacilityMapBtn',
                `v14Map${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
              );
            }
          }
        } catch {
          /* 地图还没渲染时忽略 */
        }
        return base(...args);
      },
  );
  if (wrapped) {
    window.markPermanentMapButtons = wrapped;
  }
}

/** 游戏的 updateControls 用日文文本判断「マップを更新」；译文会让判断失效。 */
function installUpdateControls(): void {
  const api = window as Window & {
    updateControls?: (...args: unknown[]) => unknown;
  };
  const wrapped = wrapOnce(
    api.updateControls,
    base =>
      (...args: unknown[]): unknown => {
        const result = base(...args);
        try {
          const reset = document.getElementById('reset');
          if (reset && reset.style.display !== 'none') {
            const refresh = trUI('マップを更新');
            const toMap = trUI('マップへ');
            if (
              reset.textContent === 'マップを更新' ||
              reset.textContent === refresh
            ) {
              reset.textContent = toMap || 'マップへ';
            }
          }
        } catch {
          /* 控件还没渲染时忽略 */
        }
        return result;
      },
  );
  if (wrapped) {
    api.updateControls = wrapped;
  }
}
