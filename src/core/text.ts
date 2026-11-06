/** 含假名或汉字的串才可能是日文原文。 */
export const JAPANESE_PATTERN =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;

/** 资源路径，不翻译。 */
export const PATH_PATTERN =
  /\.(?:png|jpe?g|webp|gif|bmp|svg|mp3|ogg|wav|m4a|webm|mp4|ico|js|json|html?|cjs|txt)\b/i;

/** 游戏数据里夹带的作者备注块（### + # 101-125 / ... + ###），不是正文。 */
const DEVELOPER_NOTE_BLOCK =
  /(?:^|\n)#{20,}\r?\n#\s*\d+\s*[-–−ー]\s*\d+[^\n]*\r?\n#{20,}(?=\r?\n|$)/g;

/** 去掉作者备注块；提取词条和显示文本都要先过这一层。 */
export function stripDeveloperNotes(text: string): string {
  return text.replace(DEVELOPER_NOTE_BLOCK, '');
}
