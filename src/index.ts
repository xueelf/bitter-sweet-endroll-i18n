import { installCompat } from './adapter/compat';
import { patchGameData } from './adapter/data';
import { refreshDom, startObserver } from './adapter/dom';
import * as catalog from './core/catalog';
import * as locale from './core/locale';
import { trUI } from './core/translate';
import {
  ensureLanguageRowInModal,
  syncLanguageRow,
  wrapOptionsOpen,
} from './ui/switcher';

let booted = false;
let domReady = false;
let originalTitle = '';

function onMutate(): void {
  ensureLanguageRowInModal();
}

/** 语言变化后就地重套：数据层与界面层都按原文重算，不重载。 */
function applyLocale(): void {
  patchGameData();
  refreshDom();
  if (originalTitle) {
    document.title = trUI(originalTitle) || originalTitle;
  }
  syncLanguageRow();
}

function bootDom(): void {
  if (domReady) {
    return;
  }
  domReady = true;

  // 游戏初始化会浅拷贝重建部分数据，替换放在其后才能一并记录。
  // 先替换再刷新，遮罩撤掉前不会闪出原文。
  patchGameData();

  originalTitle = document.title;
  try {
    document.title = trUI(originalTitle) || originalTitle;
  } catch {
    /* 标题不重要 */
  }

  refreshDom();
  startObserver(onMutate);
  ensureLanguageRowInModal();
  wrapOptionsOpen();
  installCompat();
}

/** 词典加载完后进入游戏：先重算当前语言并登记订阅，数据替换见 bootDom。 */
function boot(): void {
  if (booted) {
    return;
  }
  booted = true;

  locale.refresh();
  locale.onChange(applyLocale);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDom, { once: true });
  } else {
    bootDom();
  }
}

window.BSE_I18N = {
  get locale() {
    return locale.id();
  },
  locales: () => catalog.locales(),
  registerLocales: list => catalog.registerLocales(list),
  registerMap: (code, map) => catalog.mergeMap(code, map),
  boot,
  setLocale: code => locale.setLocale(code),
  t: trUI,
};
