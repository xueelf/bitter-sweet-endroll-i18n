import {
  BEDROOM_GLOBALS,
  CHARS_GLOBAL,
  FRAME_DATA_GLOBALS,
  MUSIC_LIST_KEY,
  SKIP_KEY_PATTERN,
} from '#/config';
import { map } from '#/core/locale';
import { rememberDataTranslation, trData } from '#/core/translate';

/** 防止异常深或循环引用的数据把遍历拖死。 */
const MAX_DEPTH = 60;

/** 只允许读取配置里的全大写全局名，避免 eval 拼进意外内容。 */
const GLOBAL_NAME = /^[A-Z][A-Z0-9_]*$/;

/** 记录被替换过的位置，切换语言时先按原文还原。 */
interface Replacement {
  /** 把原文写回去。 */
  restore: () => void;
}

const replacements: Replacement[] = [];

/** 本次套用中已经替换过的位置，避免同一对象被多个全局引用时二次翻译。 */
let replaced = new WeakMap<object, Set<string | number>>();

/** 按名字间接求值取顶层 const（名字来自固定常量）。 */
function evalGlobal(scope: { eval: typeof eval }, name: string): unknown {
  if (!GLOBAL_NAME.test(name)) {
    return null;
  }
  try {
    return (0, scope.eval)(`typeof ${name} !== 'undefined' ? ${name} : null`);
  } catch {
    return null;
  }
}

function readGlobal(name: string): unknown {
  return evalGlobal(globalThis, name);
}

function replace(container: object, key: string | number, value: string): void {
  let done = replaced.get(container);
  if (done?.has(key)) {
    return;
  }

  const translated = trData(value);
  if (translated === value) {
    return;
  }
  if (!Reflect.set(container, key, translated)) {
    return;
  }

  rememberDataTranslation(value, translated);

  if (!done) {
    done = new Set();
    replaced.set(container, done);
  }
  done.add(key);

  replacements.push({
    restore: () => {
      Reflect.set(container, key, value);
    },
  });
}

function walk(
  node: unknown,
  seen: Set<object>,
  depth: number,
  skipNames = false,
): void {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);

  if (Array.isArray(node)) {
    const list = node as unknown[];
    for (let i = 0; i < list.length; i++) {
      const value: unknown = list[i];
      if (typeof value === 'string') {
        replace(list, i, value);
      } else if (value && typeof value === 'object') {
        walk(value, seen, depth + 1, skipNames);
      }
    }
    return;
  }

  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string') {
      if (!(skipNames && key === 'name') && !SKIP_KEY_PATTERN.test(key)) {
        replace(record, key, value);
      }
    } else if (value && typeof value === 'object') {
      walk(value, seen, depth + 1, key === MUSIC_LIST_KEY);
    }
  }
}

/** 把上一次替换全部还原成日文原文。 */
export function revertData(): void {
  for (const { restore } of replacements) {
    restore();
  }
  replacements.length = 0;
  replaced = new WeakMap();
}

/** 就地替换一个数据对象里的整句，返回同一个对象。 */
export function applyToData(target: unknown): unknown {
  if (!target || typeof target !== 'object' || !map()) {
    return target;
  }
  try {
    walk(target, new Set(), 0);
  } catch (error) {
    console.warn('[BSE i18n] 数据替换失败', error);
  }
  return target;
}

/** 取同源 iframe 的 window，跨域或异常时返回 null。 */
function frameWindow(
  frame: HTMLIFrameElement,
): (Window & typeof globalThis) | null {
  try {
    return frame.contentWindow as (Window & typeof globalThis) | null;
  } catch {
    return null;
  }
}

/** 同源 iframe（寝室页）里另有一份数据，按同样的规则就地替换。 */
export function patchFrameData(frame: HTMLIFrameElement): void {
  if (!map()) {
    return;
  }

  const win = frameWindow(frame);
  if (!win) {
    return;
  }

  for (const name of [
    ...BEDROOM_GLOBALS,
    CHARS_GLOBAL,
    ...FRAME_DATA_GLOBALS,
  ]) {
    const ref = evalGlobal(win, name);
    if (ref) {
      applyToData(ref);
    }
  }
}

/** 套用剧情数据：先还原上次替换，再按当前语言替换，界面初始化完成后调用。 */
export function patchGameData(): void {
  revertData();

  if (!map()) {
    return;
  }

  applyToData(window.__GAME_DATA__);

  for (const name of [...BEDROOM_GLOBALS, CHARS_GLOBAL]) {
    const ref = readGlobal(name);
    if (ref) {
      applyToData(ref);
    }
  }

  // 同源 iframe（寝室页）里也有一份数据，切换语言时一并重算。
  for (const frame of document.querySelectorAll('iframe')) {
    patchFrameData(frame);
  }

  window.__BSE_I18N_APPLIED__ = true;
}
