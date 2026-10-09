import { CANCEL_LABEL_PATTERN, MAP_FACILITY_ALIASES } from '#/config';

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
