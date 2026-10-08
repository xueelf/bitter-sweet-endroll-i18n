import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  PROTECTED_STRINGS,
} from '#/config';

import * as catalog from './catalog';

/** 当前语言及其派生的查表数据。 */
interface Active {
  id: string;
  map: Record<string, string> | null;
  protected: ReadonlySet<string>;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let active = derive(resolveInitial());

/** 订阅语言变化，数据层与界面层据此按原文重新套一遍译文。 */
export function onChange(listener: Listener): void {
  listeners.add(listener);
}

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 读记录的语言，词典还没登记时先落回原文语言，boot 时会重算。 */
function resolveInitial(): string {
  const stored = readStored();
  return stored && catalog.has(stored) ? stored : DEFAULT_LOCALE;
}

function derive(id: string): Active {
  if (id === DEFAULT_LOCALE) {
    return { id, map: null, protected: new Set() };
  }

  return {
    id,
    map: catalog.mapFor(id),
    protected: new Set<string>(PROTECTED_STRINGS),
  };
}

/** 当前语言代码。 */
export function id(): string {
  return active.id;
}

/** 原文语言不翻译。 */
export function isDefault(): boolean {
  return active.id === DEFAULT_LOCALE;
}

/** 当前语言的对照表，原文语言为 null。 */
export function map(): Record<string, string> | null {
  return active.map;
}

/** 当前语言需要保护、不翻译的整串。 */
export function protectedStrings(): ReadonlySet<string> {
  return active.protected;
}

/** boot 时重算当前语言，接上 localStorage 里记的选择。 */
export function refresh(): void {
  active = derive(resolveInitial());
}

/** 切换语言：记入 localStorage，换词典与模板，通知订阅者就地重套。 */
export function setLocale(code: string): void {
  if (code === active.id) {
    return;
  }
  if (code !== DEFAULT_LOCALE && !catalog.has(code)) {
    return;
  }

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    /* 存不了就只在本次会话生效 */
  }

  active = derive(code);
  for (const listener of listeners) {
    listener();
  }
}
