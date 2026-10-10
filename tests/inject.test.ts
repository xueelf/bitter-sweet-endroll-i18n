import { describe, expect, test } from 'bun:test';

import { type Injection, injectOverlay } from '~/utils/inject';

const base: Injection = {
  anchor: '</title>',
  marker: '__BSE_APP_DIR__',
  snippet: '<script>/* __BSE_APP_DIR__ */</script>',
};

const i18n: Injection = {
  anchor: 'tara_bedroom_lines_v2.js"></script>',
  marker: '"Assets/i18n/bse-i18n.js"',
  snippet: '<script>/* "Assets/i18n/bse-i18n.js" */</script>',
};

describe('injectOverlay', () => {
  test('按锚点插入片段', () => {
    const html =
      '<title>T</title><script src="a/tara_bedroom_lines_v2.js"></script><header></header>';
    const out = injectOverlay(html, [base, i18n]);
    expect(out).toBe(
      '<title>T</title><script>/* __BSE_APP_DIR__ */</script>' +
        '<script src="a/tara_bedroom_lines_v2.js"></script><script>/* "Assets/i18n/bse-i18n.js" */</script><header></header>',
    );
  });

  test('幂等：已注入则不变', () => {
    const html =
      '<title>T</title><script>/* __BSE_APP_DIR__ */</script>' +
      '<script>/* "Assets/i18n/bse-i18n.js" */</script>';
    expect(injectOverlay(html, [base, i18n])).toBe(html);
  });

  test('缺少锚点时抛错', () => {
    expect(() => injectOverlay('<html></html>', [base])).toThrow();
  });
});
