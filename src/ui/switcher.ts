import { wrapOnce } from '#/adapter/compat';
import { OPTIONS_MODAL_ID } from '#/config';
import * as catalog from '#/core/catalog';
import * as locale from '#/core/locale';

function buildLanguageButton(target: string, label: string): HTMLButtonElement {
  /* 沿用游戏里背包/画廊的横向单选：.mw-tabs > .mtab，选中项加 .on */
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mtab' + (target === locale.id() ? ' on' : '');
  button.setAttribute('data-bse-no-i18n', '1');
  button.textContent = label;
  button.addEventListener('click', () => {
    // 切换后由 applyLocale 统一重建语言行，这里不自己刷新。
    locale.setLocale(target);
  });
  return button;
}

function buildLanguageRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'op-row';
  row.setAttribute('data-bse-i18n-lang', '1');
  row.setAttribute('data-bse-no-i18n', '1');

  const heading = document.createElement('div');
  heading.className = 'op-lb';
  heading.textContent = catalog.messages(locale.id()).language;

  const tabs = document.createElement('div');
  tabs.className = 'mw-tabs bse-lang-tabs';
  tabs.setAttribute('data-bse-no-i18n', '1');
  tabs.setAttribute('style', 'flex:1;padding:0;gap:8px');

  for (const info of catalog.locales()) {
    tabs.appendChild(buildLanguageButton(info.id, info.label));
  }

  row.append(heading, tabs);
  return row;
}

/** 把语言行插到设置弹窗底部，已经插过就跳过。 */
export function ensureLanguageRow(modal: Element | null): void {
  if (!modal || modal.querySelector('[data-bse-i18n-lang]')) {
    return;
  }

  const body = modal.querySelector('.mw-body') ?? modal;
  const row = buildLanguageRow();
  const separator = document.createElement('div');
  separator.className = 'op-sep';
  separator.setAttribute('data-bse-i18n-lang', '1');

  const back = body.querySelector('.op-back');
  if (back) {
    body.insertBefore(separator, back);
    body.insertBefore(row, back);
  } else {
    body.append(separator, row);
  }
}

/** 按弹窗 id 找设置界面再补语言行。 */
export function ensureLanguageRowInModal(): void {
  ensureLanguageRow(document.getElementById(OPTIONS_MODAL_ID));
}

/** 重建语言行：切换语言后标题文案与选中项都要跟着变。 */
export function syncLanguageRow(): void {
  for (const node of document.querySelectorAll('[data-bse-i18n-lang]')) {
    node.remove();
  }
  ensureLanguageRowInModal();
}

/** 包一层打开设置界面的入口，弹窗一打开就补语言行。 */
export function wrapOptionsOpen(): void {
  const wrapped = wrapOnce(
    window.openOpts,
    base =>
      (...args: unknown[]): unknown => {
        const result = base(...args);
        try {
          ensureLanguageRowInModal();
        } catch {
          /* 弹窗结构变了就交给监视器 */
        }
        return result;
      },
  );
  if (wrapped) {
    window.openOpts = wrapped;
  }
}
