/** 与《ビタースイートエンドロール》强绑定的常量，换游戏移植时只改这里。 */

/** 没有安装任何词典时的语言，也就是游戏原文。 */
export const DEFAULT_LOCALE = 'ja';

/** 原文语言在切换器里的名字。 */
export const DEFAULT_LOCALE_LABEL = '日本語';

/** 记录当前语言的 localStorage 键。 */
export const LOCALE_STORAGE_KEY = 'bse_locale';

/** 切换器自身文案的兜底（原文语言）。各语言可在 index.js 里覆盖。 */
export const DEFAULT_MESSAGES: Readonly<Messages> = {
  language: '言語',
  startup: '起動中…',
};

/** 逻辑控制串：代码把它们当判定条件或键，翻译会破坏流程，整串命中时返回原文。 */
export const PROTECTED_STRINGS: readonly string[] = [
  '地の文',
  '親密度',
  '好感度',
  '清算待ち親密度',
  '清算待ち好感度',
  'ムード',
  'スキンシップ',
  'ふれあい',
  'プレゼント',
  '選択',
  '会話する',
  'プレゼントを渡す',
  '大事な話',
  '仲直り',
  'エッチに誘う',
];

/** 遍历时跳过的键（标识符、路径、文件名），抽取与运行期共用这一份。 */
export const SKIP_KEY_PATTERN =
  /^(id|key|img|src|path|url|color|col|font|size|type|group|faves|flag|flags|mode|expr|rating|moodrating|affinityrating|loopdisplaytype|loopanchor|looptype|unlockmode|requiredrank|giftcategory|usese|visibleif|flagupdates|filename|originalname|readingbgm|unlockstoryid|unlockbandid|charid|fragmentprice|bgmkey)$|(Id|Ids|Key|Keys|Path|Paths|File|Files|Icon|Icons|Img|Imgs|Src|Url)$/i;

/** 这个键下面装的是音乐列表，其中每项的 name 是曲名，不翻译。 */
export const MUSIC_LIST_KEY = 'music';

/** 卧室台词所在的顶层 const，不挂在 globalThis 上，只能按名字间接求值。 */
export const BEDROOM_GLOBALS: readonly string[] = [
  'ALICIA_BEDROOM_V2',
  'EMMA_BEDROOM_V2',
  'MELVIE_BEDROOM_V2',
  'MIMI_BEDROOM_V2',
  'OLIVIA_BEDROOM_V2',
  'TARA_BEDROOM_V2',
];

/** 角色表，同样需要遍历。 */
export const CHARS_GLOBAL = 'CHARS';

/** 寝室 iframe（原型页）里另有一份数据常量，按名字间接求值后同样替换。 */
export const FRAME_DATA_GLOBALS: readonly string[] = [
  'ACTIONS',
  'COSPLAY_RP',
  'FAILX',
  'FAM',
  'LOWBANDS',
  'LOWBANDMOD',
  'ORAL',
  'POSITIONS',
  'POS_INTRO',
];

/** 语言切换器挂载到的选项弹窗，由游戏设置界面创建。 */
export const OPTIONS_MODAL_ID = 'v267OptsOv';

/** 兼容层：取消类按钮，翻译后日文判定会失效，用中文兜底。 */
export const CANCEL_LABEL_PATTERN =
  /^(?:返回|关闭|取消|取消吧|否|退出|结束|前往地图|返回地图|前往标题|返回标题|结束对话)$/;

/** 兼容层：地图设施按钮的中文别名，补回被翻译掉的能力标记。 */
export const MAP_FACILITY_ALIASES: Readonly<Record<string, string>> = {
  住处: 'home',
  自宅: 'home',
  冒险者公会: 'guild',
  冒险者协会: 'guild',
  商店: 'shop',
};

/** 切换器文案。 */
export interface Messages {
  /** 设置界面里这一行的标题。 */
  language: string;
  /** 启动遮罩上的那行字。 */
  startup: string;
}
