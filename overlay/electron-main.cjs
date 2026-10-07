const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const {
  GAME_WIDTH,
  GAME_HEIGHT,
  MINIMUM_WINDOW_WIDTH,
  MINIMUM_WINDOW_HEIGHT,
  calculateContentZoom,
  calculateWindowLayout
} = require('./electron-window-layout.cjs');

const APP_TITLE = 'ビタースイートエンドロール ～Bitter Sweets／The End～';

// 体験版ビルドかどうか。判定はレンダラと同じ Assets/BuildFlags.js を正とし、ここではテキストとして読む
// （asar 内でも fs で読める）。体験版はセーブ領域を分け、ウィンドウタイトルに体験版表記を足す。
const IS_TRIAL = (() => {
  try {
    const raw = require('node:fs').readFileSync(path.join(__dirname, 'Assets', 'BuildFlags.js'), 'utf8');
    // コメントを落としてから判定する。以前コメント中の文言に正規表現が一致し、
    // 製品版が体験版として起動した（タイトルに（体験版）が出て保存先も分かれた）。
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    return /trial\s*:\s*true/.test(code);
  } catch (_) {
    return false;
  }
})();
const WINDOW_TITLE = IS_TRIAL ? APP_TITLE + '（体験版）' : APP_TITLE;
const START_SPLASH_SCRIPT = `(() => {
  document.title = 'ビタースイートエンドロール ～Bitter Sweets／The End～';
  document.documentElement.classList.add('electron-player-mode');
  if (!document.getElementById('electron-player-mode-style')) {
    const playerStyle = document.createElement('style');
    playerStyle.id = 'electron-player-mode-style';
    playerStyle.textContent = [
      'html.electron-player-mode,html.electron-player-mode body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}',
      'html.electron-player-mode body>header{display:none!important}',
      'html.electron-player-mode body>main{width:100%;height:100%;margin:0;padding:0!important}',
      'html.electron-player-mode #settings{display:none!important}',
      'html.electron-player-mode #preview.view{display:flex!important;align-items:center;justify-content:center;width:100%;height:100%;max-width:none!important;margin:0!important;background:#000}',
      'html.electron-player-mode #preview>.wrap{display:flex!important;align-items:center;justify-content:center;width:100%;height:100%;margin:0!important;padding:0!important;border:0!important}',
      'html.electron-player-mode #stage.stage{flex:0 0 auto;width:1024px!important;height:830px!important;margin:0!important;aspect-ratio:auto!important;outline:0!important}',
      'html.electron-player-mode #preview>.card{display:none!important}'
    ].join('');
    document.head.appendChild(playerStyle);
  }
  // タイトルの「終了」→アプリ終了。
  // ページ側(GameMain.html v352)が終了確認モーダルを持つ場合は、そちらが「終了する」を
  // 選ばれた時に window.electronApp.quit() を呼ぶので、ここでは何もしない。
  // ここで捕まえると確認を出す前に落ちてしまう（誤クリックで即終了する原因だった）。
  if (!window.__electronExitButtonBound && !window.__v352ExitConfirm) {
    window.__electronExitButtonBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target;
      const exitButton = target instanceof Element
        ? target.closest('[data-v271-tt="exit"]')
        : null;
      if (exitButton && window.electronApp?.quit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.electronApp.quit();
      }
    }, true);
  }
  let startedFromBootButton = false;
  try {
    const bootButton = document.getElementById('v293BootDbg');
    if (bootButton) {
      bootButton.click();
      startedFromBootButton = true;
    }
  } catch (_) {}
  if (!startedFromBootButton) {
    try {
      document.getElementById('tabP')?.click();
    } catch (_) {}
    try {
      if (typeof window.v293PlaySplash === 'function') {
        window.v293PlaySplash();
      }
    } catch (_) {}
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        window.electronApp?.reveal();
      } catch (_) {}
      resolve();
    }));
  });
})()`;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setName(WINDOW_TITLE);
// 製品名を変更しても、既存のlocalStorage・設定・セーブ領域を引き継ぐ。
// %APPDATA% は全アプリ共通の置き場なので、フォルダー名は本作固有のものにする。
// 以前は GameMain / GameMainTrial だったが、一般名詞すぎて他アプリと衝突しうるうえ、
// 利用者がフォルダーを見ても何のソフトか分からなかった。exe名と揃えてある。
app.setPath('userData', path.join(app.getPath('appData'), IS_TRIAL ? 'BitterSweetEndroll_Trial' : 'BitterSweetEndroll'));

const isAllowedExternalUrl = (url) => /^https?:\/\//i.test(url);

function workAreaSizeFor(display) {
  const testSize = /^(\d+)x(\d+)$/i.exec(
    String(process.env.BSE_TEST_WORK_AREA || '').trim()
  );
  if (testSize) {
    return {
      width: Number(testSize[1]),
      height: Number(testSize[2])
    };
  }
  return display.workAreaSize;
}

function applyResponsiveZoom(window) {
  if (!window || window.isDestroyed()) {
    return;
  }
  const [contentWidth, contentHeight] = window.getContentSize();
  const zoomFactor = calculateContentZoom({
    width: contentWidth,
    height: contentHeight
  });
  if (Math.abs(window.webContents.getZoomFactor() - zoomFactor) > 0.0001) {
    window.webContents.setZoomFactor(zoomFactor);
  }
}

function createMainWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const layout = calculateWindowLayout(workAreaSizeFor(display));
  const window = new BrowserWindow({
    title: WINDOW_TITLE,
    icon: path.join(__dirname, 'Assets', 'AppIcon.ico'),
    width: layout.contentWidth,
    height: layout.contentHeight,
    useContentSize: true,
    minWidth: MINIMUM_WINDOW_WIDTH,
    minHeight: MINIMUM_WINDOW_HEIGHT,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: layout.zoomFactor,
      preload: path.join(__dirname, 'electron-preload.cjs')
    }
  });
  window.center();

  const applySettledWindowZoom = () => {
    if (window.isDestroyed()) {
      return;
    }
    applyResponsiveZoom(window);
  };
  window.on('resized', applySettledWindowZoom);
  window.on('maximize', applySettledWindowZoom);
  window.on('unmaximize', applySettledWindowZoom);

  window.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(WINDOW_TITLE);
  });

  // 整页重载后 preload 会重新盖上遮罩，每次加载完补一次 reveal（幂等）。
  window.webContents.on('did-finish-load', () => {
    void window.webContents
      .executeJavaScript('window.electronApp && window.electronApp.reveal()', true)
      .catch(() => {});
  });

  window.webContents.once('did-finish-load', () => {
    applyResponsiveZoom(window);
    void window.webContents
      .executeJavaScript(START_SPLASH_SCRIPT, true)
      .finally(() => {
        if (!window.isDestroyed()) {
          window.show();
        }
      });
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  void window.loadFile(path.join(__dirname, 'GameMain.html'));

  // BSE overlay 自检：BSE_OVERLAY_DEBUG=1 写状态日志。
  // BSE_OVERLAY_TESTZH=1 依次验证热切换、语言行不累积、序章文本。
  if (process.env.BSE_OVERLAY_DEBUG || process.env.BSE_OVERLAY_TESTZH) {
    const testZh = !!process.env.BSE_OVERLAY_TESTZH;
    let step = 0;
    const probe = "[location.href, document.title, !!window.__GAME_DATA__, typeof window.BSE_I18N, " +
      "window.BSE_I18N && window.BSE_I18N.locale, !!window.__BSE_I18N_APPLIED__, " +
      "(document.querySelector('base') || {}).href, " +
      "((window.BSE_I18N && window.BSE_I18N.locales() || []).map(function(l){return l.id + '=' + l.label;}).join(',')), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].encounter.title), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].encounter.text || '').slice(0,28), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].talkFlow && window.__GAME_DATA__.characters[0].talkFlow.bands[0].relationName), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].talkFlow && window.__GAME_DATA__.characters[0].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].talkFlow && (window.__GAME_DATA__.characters[0].talkFlow.bands[1]||{}).relationName), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[0].talkFlow && window.__GAME_DATA__.characters[0].talkFlow.bands[1].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[1].talkFlow && window.__GAME_DATA__.characters[1].talkFlow.bands[0].relationName), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[1].talkFlow && window.__GAME_DATA__.characters[1].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[2].talkFlow && window.__GAME_DATA__.characters[2].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[3].talkFlow && window.__GAME_DATA__.characters[3].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[4].talkFlow && window.__GAME_DATA__.characters[4].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(window.__GAME_DATA__ && window.__GAME_DATA__.characters && window.__GAME_DATA__.characters[5].talkFlow && window.__GAME_DATA__.characters[5].talkFlow.bands[0].startText || '').slice(0,24), " +
      "(document.querySelector('[data-v271-tt=\"new\"] .jp') || {}).textContent, " +
      "(document.getElementById('tabS') || {}).textContent, " +
      "(document.querySelector('h1') || {}).textContent, " +
      "(getComputedStyle(document.body).fontFamily || '').split(',')[0], " +
      "document.fonts.check('16px \"BSE Serif\"')].join(' | ')";
    const logPath = path.join(require('node:os').tmpdir(), 'bse_overlay_debug.log');
    const write = (line) => {
      try { require('node:fs').appendFileSync(logPath, new Date().toISOString() + ' ' + line + '\n'); } catch (_) {}
    };
    window.webContents.on('console-message', (...args) => {
      const details = args.find(
        (arg) => arg && typeof arg === 'object' && typeof arg.message === 'string',
      );
      if (details) {
        const where =
          (details.sourceId || '') +
          ':' +
          (details.lineNumber ?? '') +
          ':' +
          (details.columnNumber ?? '');
        write('CONSOLE ' + details.message + ' @ ' + where);
        return;
      }
      write('CONSOLE ' + args.slice(1).join(' '));
    });
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const run = code => window.webContents.executeJavaScript(code);
    const handler = () => {
      run('(() => ' + probe + ')()')
        .then(s => {
          write(String(s));
          step += 1;
          if (!testZh) {
            return undefined;
          }
          if (step === 1) {
            // 固定用日文载入，才能验证「就地切到中文」
            return run(
              "try{localStorage.setItem('bse_locale','ja');}catch(e){} location.reload();",
            );
          }
          if (step === 2) {
            // 验证一：就地 ja → zh，文字与字体都要跟上（不是只有字体变）
            return run("try{window.BSE_I18N.setLocale('zh');}catch(e){}")
              .then(() => wait(900))
              .then(() => run('(() => ' + probe + ')()'))
              .then(s2 => write('ZH-INPLACE ' + s2))
              // 验证二：语言切换器的语言行/分割线不累积（用替身弹窗驱动同一套逻辑）
              .then(() =>
                run(
                  "(function(){var host=document.getElementById('v267OptsOv');if(!host){host=document.createElement('div');host.id='v267OptsOv';document.getElementById('stage').appendChild(host);}host.innerHTML='<div class=\"mwin\"><div class=\"mw-body\"></div></div>';return 1;})()",
                ),
              )
              .then(() => wait(400))
              .then(() =>
                run("document.querySelectorAll('.bse-lang-tabs .mtab').length"),
              )
              .then(n => write('TABS ' + n))
              .then(() =>
                run(
                  "(function(){var t=document.querySelectorAll('.bse-lang-tabs .mtab');if(t[0])t[0].click();return 1;})()",
                ),
              )
              .then(() => wait(200))
              .then(() =>
                run(
                  "(function(){var t=document.querySelectorAll('.bse-lang-tabs .mtab');if(t[1])t[1].click();return 1;})()",
                ),
              )
              .then(() => wait(200))
              .then(() =>
                run("document.querySelectorAll('[data-bse-i18n-lang]').length"),
              )
              .then(count => write('SEP-COUNT ' + count))
              // 验证三：序章台词渲染进 DOM 后要被翻掉（黑底文本走的就是这条通道）
              .then(() =>
                run(
                  "(function(){var d=document.createElement('div');d.className='bse-probe';d.innerHTML='――王都に、朝を告げる鐘が鳴る。<br>市場では店が開き、';document.getElementById('stage').appendChild(d);return 1;})()",
                ),
              )
              .then(() => wait(400))
              .then(() =>
                run(
                  "String((document.querySelector('.bse-probe')||{}).textContent||'')",
                ),
              )
              .then(text => write('PROLOGUE ' + text))
              // 验证四：同源 iframe（寝室场景）里的文本也要被翻译
              .then(() =>
                run(
                  "(function(){var f=document.createElement('iframe');f.id='bse-frame-probe';f.srcdoc='<p id=\"bseProbeP\">ふれあい</p>';document.getElementById('stage').appendChild(f);return 1;})()",
                ),
              )
              .then(() => wait(700))
              .then(() =>
                run(
                  "(function(){var f=document.getElementById('bse-frame-probe');try{var p=f&&f.contentDocument&&f.contentDocument.getElementById('bseProbeP');return p?p.textContent:'(none)';}catch(e){return 'ERR '+e.message;}})()",
                ),
              )
              .then(t => write('FRAME ' + t))
              // 验证五：iframe 里的数据也要被替换（打字机逐字取的就是这份数据）
              .then(() =>
                run(
                  "(function(){var f=document.createElement('iframe');f.id='bse-frame-data-probe';f.srcdoc='<script>const EMMA_BEDROOM_V2 = { actLines: { probe: { f: [\"鑑賞\"] } } };<\/script>';document.getElementById('stage').appendChild(f);return 1;})()",
                ),
              )
              .then(() => wait(700))
              .then(() =>
                run(
                  "(function(){var f=document.getElementById('bse-frame-data-probe');try{return String(f.contentWindow.eval('typeof EMMA_BEDROOM_V2 !== \"undefined\" ? EMMA_BEDROOM_V2.actLines.probe.f[0] : \"(none)\"'));}catch(e){return 'ERR '+e.message;}})()",
                ),
              )
              .then(t => write('FRAME-DATA ' + t))
              // 验证六：模板串（采集委托说明文）——直接调用与 DOM 渲染两条路径
              .then(() =>
                run(
                  "(function(){var s='鉱石をできるだけ集めてください。色違いの鉱石は高価です。ストップウォッチは残り時間を3秒増やします。魔物に触れると依頼は打ち切りになります。';var d=document.createElement('div');d.id='bse-tpl-probe';d.textContent=s;document.getElementById('stage').appendChild(d);return String(window.BSE_I18N.t(s));})()",
                ),
              )
              .then(t => write('TPL-DIRECT ' + t))
              .then(() => wait(500))
              .then(() =>
                run(
                  "String((document.getElementById('bse-tpl-probe')||{}).textContent||'')",
                ),
              )
              .then(t => write('TPL-DOM ' + t));
          }
          return undefined;
        })
        .catch(e => write('ERR ' + (e && e.message)));
    };
    if (testZh) window.webContents.on('did-finish-load', handler);
    else window.webContents.once('did-finish-load', handler);
  }
}

ipcMain.on('app:quit', (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (ownerWindow && !ownerWindow.isDestroyed()) {
    ownerWindow.close();
    return;
  }
  app.quit();
});

app.whenReady().then(() => {
  // package.json / electron-builder.trial.json の appId と揃える。
  // 製品版と体験版で別IDにして、タスクバーで別アプリとして扱われるようにする。
  app.setAppUserModelId(IS_TRIAL ? 'local.bittersweetendroll.game.trial' : 'local.bittersweetendroll.game');
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
