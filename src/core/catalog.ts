import {
  type Messages,
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_LABEL,
  DEFAULT_MESSAGES,
} from '#/config';

/** 只能手写的运行期模板（源文件里没有整行可抄的拼接串）。 */
export interface Template {
  from: string;
  to: string;
}

/** 一种语言的元信息，由构建从 locales/<id>/index.js 汇总而来。 */
export interface LocaleMeta {
  /** 语言代码，取文件夹名。 */
  id: string;
  /** 显示名。 */
  label: string;
  /** 覆盖层自身界面的文案。 */
  messages?: Partial<Messages>;
  /** 手写的运行期模板。 */
  templates?: readonly Template[];
  /** 手工短语表：词典里查不到、由代码拼出来的标签，供显示层片段替换。 */
  fragments?: Readonly<Record<string, string>>;
}

/** 对外暴露的语言信息。 */
export interface LocaleInfo {
  id: string;
  label: string;
}

/** 编译好的模板：整串匹配，占位按出现顺序回填。 */
export interface CompiledTemplate {
  re: RegExp;
  to: string;
}

interface Slot {
  id: string;
  label: string;
  messages: Partial<Messages> | null;
  fragments: Record<string, string>;
  map: Record<string, string>;
  patterns: CompiledTemplate[];
}

const slots = new Map<string, Slot>();

/** 词条或模板里的 ${...} 占位，整段作为占位名。 */
const PLACEHOLDER = /\$\{[^}]*\}/g;

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 把 from/to 编译成整串正则：from 的占位依次成捕获组，to 按占位顺序回填。 */
function compileTemplate(from: string, to: string): CompiledTemplate | null {
  const names: string[] = [];
  let source = '';
  let last = 0;

  for (const match of from.matchAll(PLACEHOLDER)) {
    source += escapeRegExp(from.slice(last, match.index));
    const index = names.indexOf(match[0]);
    if (index < 0) {
      names.push(match[0]);
      source += '(.+?)';
    } else {
      source += `\\${index + 1}`;
    }
    last = match.index + match[0].length;
  }
  source += escapeRegExp(from.slice(last));

  if (!names.length) {
    return null;
  }

  // 占位符之外没有实义文字的模板是恒等替换，只会挡住后面的模板，直接拒绝。
  if (!from.replace(PLACEHOLDER, '').trim()) {
    return null;
  }

  const targets = [...to.matchAll(PLACEHOLDER)].map(match => match[0]);
  const replacement = to.replace(PLACEHOLDER, placeholder => {
    const index = targets.indexOf(placeholder);
    return index >= 0 && index < names.length ? `$${index + 1}` : placeholder;
  });

  return { re: new RegExp(`^${source}$`), to: replacement };
}

function compileTemplates(templates: readonly Template[]): CompiledTemplate[] {
  const compiled: CompiledTemplate[] = [];
  for (const { from, to } of templates) {
    const pattern = compileTemplate(from, to);
    if (pattern) {
      compiled.push(pattern);
    }
  }
  return compiled;
}

/** 含 ${...} 的词条是运行期拼装串，进模板，其余进对照表。 */
const hasPlaceholder = (text: string): boolean => /\$\{[^}]*\}/.test(text);

function slotFor(id: string): Slot {
  let slot = slots.get(id);
  if (!slot) {
    slot = {
      id,
      label: id,
      messages: null,
      fragments: {},
      map: {},
      patterns: [],
    };
    slots.set(id, slot);
  }
  return slot;
}

/** 登记各语言的元信息。 */
export function registerLocales(list: readonly LocaleMeta[]): void {
  for (const meta of list) {
    if (!meta || typeof meta.id !== 'string' || !meta.id) {
      continue;
    }
    const slot = slotFor(meta.id);
    if (meta.label) {
      slot.label = meta.label;
    }
    if (meta.messages) {
      slot.messages = { ...slot.messages, ...meta.messages };
    }
    if (meta.fragments) {
      slot.fragments = { ...slot.fragments, ...meta.fragments };
    }
    if (meta.templates?.length) {
      slot.patterns.push(...compileTemplates(meta.templates));
    }
  }
}

/** 合并一份词条，未翻译（null 或空串）的条目直接跳过。 */
export function mergeMap(id: string, map: Record<string, string | null>): void {
  if (id === DEFAULT_LOCALE) {
    return;
  }
  const slot = slotFor(id);
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string' || !value) {
      continue;
    }
    if (hasPlaceholder(key)) {
      const pattern = compileTemplate(key, value);
      if (pattern) {
        slot.patterns.push(pattern);
      }
      continue;
    }
    slot.map[key] = value;
  }
}

/** 当前可用的语言，原文排在最前。 */
export function locales(): LocaleInfo[] {
  const list: LocaleInfo[] = [
    { id: DEFAULT_LOCALE, label: DEFAULT_LOCALE_LABEL },
  ];
  for (const slot of slots.values()) {
    list.push({ id: slot.id, label: slot.label });
  }
  return list;
}

/** 该语言是否已登记。 */
export function has(id: string): boolean {
  return slots.has(id);
}

/** 该语言的对照表，未登记时为 null。 */
export function mapFor(id: string): Record<string, string> | null {
  return slots.get(id)?.map ?? null;
}

/** 切换器与启动遮罩的文案：该语言声明的覆盖叠在默认值上。 */
export function messages(id: string): Messages {
  return { ...DEFAULT_MESSAGES, ...slots.get(id)?.messages };
}

/** 该语言的运行期模板（含词条里带占位的那部分）。 */
export function patternsFor(id: string): readonly CompiledTemplate[] {
  return slots.get(id)?.patterns ?? [];
}

/** 该语言的手工短语表，供显示层片段替换。 */
export function fragmentsFor(id: string): Readonly<Record<string, string>> {
  return slots.get(id)?.fragments ?? {};
}
