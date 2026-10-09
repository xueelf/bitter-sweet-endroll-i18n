import { CANCEL_LABEL_PATTERN, MAP_FACILITY_ALIASES } from '#/config';
import { trUI } from '#/core/translate';

import { revertTree, translateTree } from './dom';

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
        if (top) {
          revertTree(top);
        }
        const result = base(...args);
        if (top) {
          translateTree(top);
        }
        return result;
      },
  );
  if (wrapped) {
    window.addDayToTop = wrapped;
  }
}

/** 顶栏地点标签：游戏按日文文本开面板，翻译后按中文文本接回来。 */
function installLocationChips(): void {
  document.addEventListener(
    'click',
    event => {
      const chip = (event.target as Element | null)?.closest?.('.lch.special');
      if (!chip) {
        return;
      }
      const plate = chip.querySelector('.plate');
      const name = String(plate?.textContent ?? '')
        .replace(/[◆⌂]/g, '')
        .trim();
      const action = name.includes('住处')
        ? window.openHome
        : name.includes('商店')
          ? window.openShop
          : name.includes('冒险者公会')
            ? window.openGuild
            : undefined;
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      action();
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
          if (el && el.textContent === trUI('ログはまだありません。')) {
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
          const text = String(element?.textContent ?? '')
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
            const kind =
              MAP_FACILITY_ALIASES[String(button.textContent ?? '').trim()];
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
