/* 构建期：按锚点把覆盖层脚本注入 GameMain.html。 */

export interface Injection {
  /** 插入位置，在该文本之后插入。 */
  anchor: string;
  /** 幂等标记，页面已包含时跳过。 */
  marker: string;
  /** 要插入的片段。 */
  snippet: string;
}

/** 依次注入片段，已含标记的跳过，找不到锚点直接抛错。 */
export function injectOverlay(
  html: string,
  injections: readonly Injection[],
): string {
  let out = html;

  for (const { anchor, marker, snippet } of injections) {
    if (out.includes(marker)) {
      continue;
    }

    const at = out.indexOf(anchor);
    if (at < 0) {
      throw new Error(`GameMain.html 中找不到注入锚点：${anchor}`);
    }

    const position = at + anchor.length;
    out = out.slice(0, position) + snippet + out.slice(position);
  }

  return out;
}
