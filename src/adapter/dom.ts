import { trUI } from '#/core/translate';

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

/** 每个元素上被翻译过的属性原文。 */
const attrOriginals = new WeakMap<Element, Map<string, string>>();

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
  return element.hasAttribute('data-bse-no-i18n');
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

function translateTextNode(node: Text): void {
  const original = originalText(node);
  if (!original) {
    return;
  }

  const trimmed = original.trim();
  if (!trimmed) {
    return;
  }

  const translated = trUI(trimmed);
  const at = original.indexOf(trimmed);
  const next =
    original.slice(0, at) + translated + original.slice(at + trimmed.length);
  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
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
    const trimmed = original.trim();
    const next = original.replace(trimmed, trUI(trimmed));
    if (element.getAttribute(name) !== next) {
      element.setAttribute(name, next);
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

  if (root.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = root as Element;
  if (skipElement(element)) {
    return;
  }

  translateAttributes(element);
  eachTextNode(root, translateTextNode);
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
    }
  });
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
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          translateTree(added);
          watchFrames(added);
        }
      }
    }).observe(doc.body, { childList: true, subtree: true });
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
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        translateTree(added);
        watchFrames(added);
      }
    }
    onMutate();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
