import type { LocaleMeta } from './core/catalog';

/** 公开在 window 上的接口，供注入脚本与生成的清单调用。 */
export interface BseI18nApi {
  /** 当前语言代码。 */
  readonly locale: string;
  /** 当前可用的语言。 */
  locales: () => { id: string; label: string }[];
  /** 登记各语言的元信息，由生成的清单调用。 */
  registerLocales: (list: LocaleMeta[]) => void;
  /** 合并某个语言的词条，由构建包出来的词条脚本调用。 */
  registerMap: (code: string, map: Record<string, string | null>) => void;
  /** 词条加载完之后调用，替换数据并接管界面。 */
  boot: () => void;
  /** 就地切换语言并写入记录。 */
  setLocale: (code: string) => void;
  /** 界面层查表。 */
  t: (text: string) => string;
}

declare global {
  interface Window {
    /** 游戏把全部剧情数据挂在 window 上。 */
    __GAME_DATA__?: Record<string, unknown>;
    /** 数据替换完成的标记，自检用。 */
    __BSE_I18N_APPLIED__?: boolean;
    /** 本地化层的公开入口。 */
    BSE_I18N?: BseI18nApi;
    /** 注入脚本记下的本应用目录（app.asar 所在目录）。 */
    __BSE_APP_DIR__?: string;
    /** 游戏：判断点击的是不是取消类按钮。 */
    isCancelAction?: (element: Element | null) => boolean;
    /** 游戏：给地图上的常驻设施按钮补能力标记。 */
    markPermanentMapButtons?: (...args: unknown[]) => unknown;
    /** 游戏：打开设置弹窗。 */
    openOpts?: (...args: unknown[]) => unknown;
    /** 游戏：把日期补进顶栏。 */
    addDayToTop?: (...args: unknown[]) => unknown;
  }
}

export {};
