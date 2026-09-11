import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildBundle, hash, serializeBundle } from './lib.mjs';
import { assertProjectRelease } from './check-preset.mjs';

const WINDOWS_TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function readOutputStat(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRegularOutput(stat, file) {
  if (stat && !stat.isFile()) throw new Error(`输出目标不是普通文件，拒绝替换：${file}`);
}

function normalizeComparisonPath(file) {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSameOrInside(root, candidate) {
  const normalizedRoot = normalizeComparisonPath(root);
  const normalizedCandidate = normalizeComparisonPath(candidate);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function resolveCanonicalDestination(file) {
  const missingSegments = [];
  let current = path.resolve(file);
  let reachedFilesystemRoot = false;
  let rootMissingError = null;
  while (!reachedFilesystemRoot) {
    try {
      const existingRealPath = await fs.realpath(current);
      return path.resolve(existingRealPath, ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) {
        reachedFilesystemRoot = true;
        rootMissingError = error;
        continue;
      }
      missingSegments.push(path.basename(current));
      current = parent;
    }
  }
  throw rootMissingError;
}

async function assertOutputOutsideProject(projectRoot, outputFile) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOutput = path.resolve(outputFile);
  const reject = () => {
    throw new Error(`输出目标不能覆盖源码项目合同文件或项目内源码；Bundle 必须位于源码项目目录之外：${resolvedOutput}`);
  };
  if (isSameOrInside(resolvedRoot, resolvedOutput)) reject();

  const [realRoot, realOutput] = await Promise.all([
    fs.realpath(resolvedRoot),
    resolveCanonicalDestination(resolvedOutput),
  ]);
  if (isSameOrInside(realRoot, realOutput)) reject();
}

async function renameWithRetry(source, destination, { attempts = 6, baseDelayMs = 20 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      const transient = process.platform === 'win32' && WINDOWS_TRANSIENT_RENAME_ERRORS.has(error?.code);
      if (!transient || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
}

async function writeBundle(outputFile, content, { overwrite }) {
  const directory = path.dirname(outputFile);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(outputFile)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    const current = await readOutputStat(outputFile);
    assertRegularOutput(current, outputFile);
    if (!overwrite) {
      try {
        await fs.copyFile(temporary, outputFile, fsConstants.COPYFILE_EXCL);
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error(`输出已存在，拒绝覆盖；如需替换请显式使用 --overwrite：${outputFile}`);
        throw error;
      }
      return;
    }

    if (!current) {
      await renameWithRetry(temporary, outputFile);
      return;
    }

    const backup = path.join(directory, `.${path.basename(outputFile)}.${process.pid}.${crypto.randomUUID()}.backup`);
    await renameWithRetry(outputFile, backup);
    try {
      await renameWithRetry(temporary, outputFile);
    } catch (installError) {
      try {
        await renameWithRetry(backup, outputFile);
      } catch (restoreError) {
        throw new AggregateError(
          [installError, restoreError],
          `替换 Bundle 失败，且原文件自动恢复失败；原文件保留在：${backup}`,
        );
      }
      throw installError;
    }
    await fs.rm(backup, { force: true });
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function parsePackArguments(argv) {
  const flags = new Set();
  const positional = [];
  for (const token of argv) {
    if (token === '--overwrite' || token === '--dry-run') {
      if (flags.has(token)) throw new Error(`参数重复：${token}`);
      flags.add(token);
    } else if (token.startsWith('--')) {
      throw new Error(`未知参数：${token}`);
    } else {
      positional.push(token);
    }
  }
  if (positional.length !== 2) {
    throw new Error('用法：node tools/pack-preset.mjs <project.json> <output.json> [--dry-run] [--overwrite]');
  }
  return {
    projectFile: positional[0],
    outputFile: positional[1],
    dryRun: flags.has('--dry-run'),
    overwrite: flags.has('--overwrite'),
  };
}

export async function packPreset({ projectFile, outputFile, dryRun = false, overwrite = false } = {}) {
  if (!projectFile || !outputFile) throw new Error('源码项目和输出文件不能为空');
  const release = await assertProjectRelease(projectFile);
  const outputPath = path.resolve(outputFile);
  await assertOutputOutsideProject(release.projectRoot, outputPath);

  const bundle = await buildBundle(projectFile);
  const serialized = serializeBundle(bundle);
  const existing = await readOutputStat(outputPath);
  assertRegularOutput(existing, outputPath);
  if (existing && !overwrite) {
    throw new Error(`输出已存在，拒绝覆盖；如需替换请显式使用 --overwrite：${outputPath}`);
  }

  const result = {
    ok: true,
    dryRun: Boolean(dryRun),
    outputFile: outputPath,
    wouldOverwrite: Boolean(existing),
    presetId: bundle.manifest.id,
    itemCount: bundle.manifest.items.length,
    displayCount: (bundle.manifest.displays || []).length,
    serializedBytes: Buffer.byteLength(serialized, 'utf8'),
    bundleSha256: hash(Buffer.from(serialized, 'utf8')),
  };
  if (dryRun) return result;

  await writeBundle(outputPath, serialized, { overwrite: Boolean(overwrite) });
  return result;
}

async function main() {
  const options = parsePackArguments(process.argv.slice(2));
  const result = await packPreset(options);
  if (result.dryRun) {
    console.log(`[pack-preset] dry-run 通过，未写入文件：${result.outputFile}`);
    return;
  }
  console.log(`[pack-preset] 已输出：${result.outputFile}`);
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.error(`[pack-preset] 失败：${error.message}`);
    process.exitCode = 1;
  }
}
