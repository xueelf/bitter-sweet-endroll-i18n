/* 构建入口：把 installer/app.asar 压缩后内嵌进安装器，并发布为单文件 exe。 */
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const root = resolve(import.meta.dir, '..');
const installerDir = join(root, 'installer');
const payloadDir = join(installerDir, 'payload');
const asarPath = join(root, 'installer', 'app.asar');
const releaseDir = join(root, 'release');
const outputName = 'BitterSweetEndroll-i18n.exe';

async function main(): Promise<void> {
  let asar: Buffer;
  try {
    asar = await readFile(asarPath);
  } catch {
    throw new Error('缺少 installer/app.asar，请先运行 bun run build。');
  }

  const payload = brotliCompressSync(asar, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: asar.length,
    },
  });
  const hash = createHash('sha256').update(asar).digest('hex');

  const packageJson = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  ) as { version?: string };
  const version = packageJson.version;
  if (!version) {
    throw new Error('package.json 缺少 version。');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'bse-setup-'));
  try {
    await mkdir(payloadDir, { recursive: true });
    await writeFile(join(payloadDir, 'app.asar.br'), payload);
    await writeFile(join(payloadDir, 'app.asar.sha256'), hash);

    console.log(
      `payload: ${(asar.length / 1048576).toFixed(1)} MB -> ${(payload.length / 1048576).toFixed(1)} MB`,
    );

    const publishDir = join(workDir, 'publish');
    const result = Bun.spawn(
      [
        'dotnet',
        'publish',
        join(installerDir, 'installer.csproj'),
        '-c',
        'Release',
        '-r',
        'win-x64',
        '--self-contained',
        'true',
        `-p:Version=${version}`,
        '-o',
        publishDir,
        '--nologo',
      ],
      {
        cwd: root,
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    const code = await result.exited;
    if (code !== 0) {
      throw new Error(`dotnet publish 失败（退出码 ${code}）。`);
    }

    await mkdir(releaseDir, { recursive: true });
    const outputPath = join(releaseDir, outputName);
    await copyFile(join(publishDir, outputName), outputPath);
    const info = await stat(outputPath);
    console.log(
      `release/${outputName}（${(info.size / 1048576).toFixed(1)} MB，SHA-256 ${hash.slice(0, 12)}…）`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(payloadDir, { recursive: true, force: true });
    await rm(join(installerDir, 'bin'), { recursive: true, force: true });
    await rm(join(installerDir, 'obj'), { recursive: true, force: true });
  }
}

await main();
