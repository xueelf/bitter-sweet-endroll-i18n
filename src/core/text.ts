/** 含假名或汉字的串才可能是日文原文。 */
export const JAPANESE_PATTERN =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;

/** 资源路径，不翻译。 */
export const PATH_PATTERN =
  /\.(?:png|jpe?g|webp|gif|bmp|svg|mp3|ogg|wav|m4a|webm|mp4|ico|js|json|html?|cjs|txt)\b/i;
