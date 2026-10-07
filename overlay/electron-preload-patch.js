// BSE overlay: 启动遮罩文案与统一字体。
// 构建时原样插进 electron-preload.cjs（启动遮罩的 insertCSS 之前），
// 并把下面占位里的内容替换成各语言文案的 JSON。
const BSE_LOCALES = __LOCALES_JSON__;
const bseMeta = (() => {
  try {
    return BSE_LOCALES[localStorage.getItem('bse_locale') || 'ja'] || {};
  } catch (_) {
    return {};
  }
})();
// 页面本身从补丁的 app.asar 加载，相对它就能解出内置字体的绝对地址。
// （沙箱化的 preload 里没有 path / __dirname，这里只能用 location。）
const bseFontUrl = new URL(
  'Assets/i18n/fonts/NotoSerifSC-VF.otf',
  location.href.replace(/[?#].*$/, ''),
).href;
webFrame.insertCSS(
  '@font-face{font-family:"BSE Serif";src:url("' +
    bseFontUrl +
    '") format("opentype");font-weight:200 900;font-display:block}' +
    'body{font-family:"BSE Serif","Yu Mincho","Hiragino Mincho ProN",serif!important}' +
    '#stage{--serif:"BSE Serif","Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif!important}' +
    'html::after{font-family:"BSE Serif","Yu Mincho","Hiragino Mincho ProN",serif!important}',
);
