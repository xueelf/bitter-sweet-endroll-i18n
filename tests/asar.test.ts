import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findOriginalAsar } from '~/utils/asar';

let root = '';

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = '';
  }
});

describe('findOriginalAsar', () => {
  test('--game 指向游戏根目录时能找到 Data/resources/app.asar', () => {
    root = mkdtempSync(join(tmpdir(), 'bse-asar-'));
    const game = join(root, 'game');
    const resources = join(game, 'Data', 'resources');
    mkdirSync(resources, { recursive: true });
    const asar = join(resources, 'app.asar');
    writeFileSync(asar, '');

    const argv = process.argv;
    process.argv = [argv[0]!, argv[1]!, '--game', game];
    try {
      expect(findOriginalAsar(join(root, 'repo'))).toBe(asar);
    } finally {
      process.argv = argv;
    }
  });
});
