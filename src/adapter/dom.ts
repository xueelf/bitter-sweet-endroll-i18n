import { trHTML, trUI } from '#/core/translate';

import { patchFrameData } from './data';

/** 这些标签里的文字不是玩家看的，跳过。 */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'CODE',
  'PRE',
]);

/** 需要顺带翻译的属性。 */
const TRANSLATED_ATTRS = ['title', 'placeholder', 'aria-label'];

/** 每个文本节点的日文原文，切换语言时按它重新查表。 */
const textOriginals = new WeakMap<Text, string>();

/** 每个文本节点最后一次写入的译文，用来区分游戏更新与自身写入。 */
const textOutputs = new WeakMap<Text, string>();

/** 每个元素上被翻译过的属性原文。 */
const attrOriginals = new WeakMap<Element, Map<string, string>>();

/** 每个元素属性最后一次写入的译文。 */
const attrOutputs = new WeakMap<Element, Map<string, string>>();

/** 行内 HTML 容器的日文原文，切换语言时按它重算。 */
const htmlOriginals = new WeakMap<Element, string>();

/** 行内 HTML 容器最后一次写入的译文，用来识别游戏改写。 */
const htmlOutputs = new WeakMap<Element, string>();

function originalText(node: Text): string {
  let original = textOriginals.get(node);
  if (original === undefined) {
    original = node.nodeValue ?? '';
    textOriginals.set(node, original);
  }
  return original;
}

function skipElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (SKIP_TAGS.has(element.tagName)) {
    return true;
  }
  if ((element as HTMLElement).isContentEditable) {
    return true;
  }
  // 标记在容器上时，整棵子树都跳过。
  return (
    typeof element.closest === 'function' &&
    element.closest('[data-bse-no-i18n]') !== null
  );
}

function eachTextNode(root: Node, visit: (node: Text) => void): void {
  // 用节点自己的文档建遍历器：同源 iframe 里的节点也走这里。
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node =>
      skipElement(node.parentElement)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    visit(node as Text);
  }
}

/** 翻译整段文本，保留首尾空白；空串或纯空白原样返回。 */
function translatePreservingSpace(original: string): string {
  const trimmed = original.trim();
  if (!trimmed) {
    return original;
  }
  const at = original.indexOf(trimmed);
  return (
    original.slice(0, at) + trUI(trimmed) + original.slice(at + trimmed.length)
  );
}

function translateTextNode(node: Text): void {
  if (skipElement(node.parentElement)) {
    return;
  }

  const original = originalText(node);
  if (!original) {
    return;
  }

  const next = translatePreservingSpace(original);
  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
  textOutputs.set(node, next);
}

function translateAttributes(element: Element): void {
  for (const name of TRANSLATED_ATTRS) {
    const current = element.getAttribute(name);
    if (!current) {
      continue;
    }

    let saved = attrOriginals.get(element);
    if (!saved) {
      saved = new Map();
      attrOriginals.set(element, saved);
    }
    if (!saved.has(name)) {
      saved.set(name, current);
    }

    const original = saved.get(name)!;
    const next = translatePreservingSpace(original);
    if (element.getAttribute(name) !== next) {
      element.setAttribute(name, next);
    }
    let outputs = attrOutputs.get(element);
    if (!outputs) {
      outputs = new Map();
      attrOutputs.set(element, outputs);
    }
    outputs.set(name, next);
  }
}

/** 只含文字和这些行内格式标签的元素，可以安全地按整段 HTML 翻译。 */
const INLINE_FORMATTING = new Set([
  'B',
  'I',
  'EM',
  'STRONG',
  'SMALL',
  'U',
  'S',
]);

/**
 * 游戏会把提示拆成「文字 + <b>数字</b> + 文字」。
 * 这类元素按整段 HTML 走带标签的模板，避免逐文本节点翻译后留下日文和空格。
 */
export function translateInlineHtml(element: Element): boolean {
  if (skipElement(element)) {
    return false;
  }
  if (element.children.length === 0) {
    return false;
  }
  for (const child of element.children) {
    if (!INLINE_FORMATTING.has(child.tagName) || child.attributes.length > 0) {
      return false;
    }
  }

  const current = element.innerHTML;
  const last = htmlOutputs.get(element);
  if (last !== undefined && current !== last) {
    // 游戏改写了容器内容，当前内容才是新的原文。
    htmlOriginals.set(element, current);
  }
  let original = htmlOriginals.get(element);
  if (original === undefined) {
    original = current;
    htmlOriginals.set(element, original);
  }

  const translated = trHTML(original);
  if (translated === current) {
    htmlOutputs.set(element, current);
    return false;
  }

  element.innerHTML = translated;
  htmlOutputs.set(element, translated);
  return true;
}

function translateElement(element: Element): void {
  if (skipElement(element)) {
    return;
  }

  translateAttributes(element);
  if (translateInlineHtml(element)) {
    return;
  }

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      translateTextNode(child as Text);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      translateElement(child as Element);
    }
  }
}

/** 翻译一棵子树。文本节点始终按原文重算，所以可以反复调用。 */
export function translateTree(root: Node | null): void {
  if (!root) {
    return;
  }

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElement(root as Element);
  }
}

/** 取元素当前对应的日文原文，供兼容层判定使用。 */
export function originalTextOf(element: Element): string {
  let out = '';
  eachTextNode(element, node => {
    out += textOriginals.get(node) ?? node.nodeValue ?? '';
  });
  return out;
}

/** 把子树里的文本还原成日文原文，不改语言，只给需要看原文的判定用。 */
export function revertTree(root: Node | null): void {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  eachTextNode(root, node => {
    const original = textOriginals.get(node);
    if (original !== undefined && node.nodeValue !== original) {
      node.nodeValue = original;
      textOutputs.set(node, original);
    }
  });
}

/** 处理游戏对已有文本/属性的更新；忽略自己写入产生的 mutation。 */
export function applyMutation(mutation: MutationRecord): void {
  if (mutation.type === 'characterData') {
    const node = mutation.target as Text;
    if (skipElement(node.parentElement)) {
      return;
    }
    if (textOutputs.get(node) === node.nodeValue) {
      return;
    }
    textOriginals.set(node, node.nodeValue ?? '');
    textOutputs.delete(node);
    translateTextNode(node);
    return;
  }

  if (mutation.type !== 'attributes') {
    return;
  }
  const element = mutation.target as Element;
  if (skipElement(element)) {
    return;
  }
  const name = mutation.attributeName;
  if (!name || !TRANSLATED_ATTRS.includes(name)) {
    return;
  }

  const current = element.getAttribute(name) ?? '';
  if (attrOutputs.get(element)?.get(name) === current) {
    return;
  }
  if (!current) {
    attrOriginals.get(element)?.delete(name);
    attrOutputs.get(element)?.delete(name);
    return;
  }

  let originals = attrOriginals.get(element);
  if (!originals) {
    originals = new Map();
    attrOriginals.set(element, originals);
  }
  originals.set(name, current);
  attrOutputs.get(element)?.delete(name);
  translateAttributes(element);
}

/** 主页面与 iframe 共用的观察选项。 */
const MUTATION_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: TRANSLATED_ATTRS,
};

function handleMutations(
  mutations: MutationRecord[],
  onMutate?: () => void,
): void {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // 容器被整体改写时按整段 HTML 重算，避免只翻到拆开的文本节点。
      const target = mutation.target;
      if (target.nodeType === Node.ELEMENT_NODE) {
        const element = target as Element;
        if (translateInlineHtml(element)) {
          continue;
        }
        // 内容正是自己刚写入的译文，这次变化由翻译本身引起。
        if (htmlOutputs.get(element) === element.innerHTML) {
          continue;
        }
      }
      for (const added of mutation.addedNodes) {
        translateTree(added);
        watchFrames(added);
      }
    } else {
      applyMutation(mutation);
    }
  }
  onMutate?.();
}

/** 同源 iframe 文档已接上的监听，按文档去重。 */
const watchedFrames = new WeakSet<Document>();

/** 已挂过 load 监听的 iframe 元素。 */
const trackedFrames = new WeakSet<HTMLIFrameElement>();

/** 注入到 iframe 里的字体样式标记，避免重复插入。 */
const FRAME_FONT_ID = 'bse-frame-font';

/** 本应用目录（注入脚本写在 window 上），取不到就退回当前页面所在目录。 */
function appDir(): string {
  const dir = window.__BSE_APP_DIR__;
  if (typeof dir === 'string' && dir) {
    return dir;
  }
  const here = location.href.replace(/[?#].*$/, '');
  return here.slice(0, here.lastIndexOf('/') + 1);
}

/** 内置字体也要套进 iframe，不然寝室场景的中文会用日文字形。 */
function applyFrameFont(doc: Document): void {
  if (doc.getElementById(FRAME_FONT_ID)) {
    return;
  }
  const fontUrl = new URL('Assets/i18n/fonts/NotoSerifSC-VF.otf', appDir())
    .href;
  const style = doc.createElement('style');
  style.id = FRAME_FONT_ID;
  style.textContent =
    `@font-face{font-family:"BSE Serif";src:url("${fontUrl}") format("opentype");font-weight:200 900;font-display:block}` +
    'body{font-family:"BSE Serif","Yu Mincho","Hiragino Mincho ProN",serif!important}';
  (doc.head ?? doc.documentElement).appendChild(style);
}

function frameDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

/** 翻译 iframe 文档，并让它之后插入的内容也跟上。 */
function translateFrame(frame: HTMLIFrameElement): void {
  const doc = frameDocument(frame);
  if (!doc || !doc.body) {
    return;
  }

  applyFrameFont(doc);
  patchFrameData(frame);

  if (!watchedFrames.has(doc)) {
    watchedFrames.add(doc);
    new MutationObserver(mutations => handleMutations(mutations)).observe(
      doc.body,
      MUTATION_OPTIONS,
    );
  }

  translateTree(doc.body);
}

/** 给子树里的同源 iframe 接上翻译：加载完翻一遍，之后跟随其内部变化。 */
function watchFrames(root: Node | null): void {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = root as Element;
  const frames: HTMLIFrameElement[] = [];
  if (element.tagName === 'IFRAME') {
    frames.push(element as HTMLIFrameElement);
  }
  for (const frame of element.querySelectorAll('iframe')) {
    frames.push(frame as HTMLIFrameElement);
  }

  for (const frame of frames) {
    if (!trackedFrames.has(frame)) {
      trackedFrames.add(frame);
      frame.addEventListener('load', () => translateFrame(frame));
    }
    translateFrame(frame);
  }
}

/** 按当前语言重新翻译整个界面（含同源 iframe）。原文语言会还原成日文。 */
export function refreshDom(): void {
  translateTree(document.body);
  watchFrames(document.body);
}

/** 监视 DOM 变化，翻译后插入的内容，onMutate 做与翻译无关的维护。 */
export function startObserver(onMutate: () => void): void {
  new MutationObserver(mutations =>
    handleMutations(mutations, onMutate),
  ).observe(document.body, MUTATION_OPTIONS);
}
