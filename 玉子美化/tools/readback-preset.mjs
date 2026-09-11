import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildBundle, fileBytes, hash, serializeBundle, validateBundle } from './lib.mjs';
import { assertProjectRelease } from './check-preset.mjs';

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export async function readbackPreset({ projectFile, file } = {}) {
  if (!projectFile || !file) throw new Error('源码项目和待回读 Bundle 文件不能为空');
  await assertProjectRelease(projectFile);

  const raw = await fs.readFile(file, 'utf8');
  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Bundle JSON 解析失败：${error.message}`);
  }
  const result = validateBundle(bundle, { strict: true });
  if (!result.ok) throw new Error(`Bundle 严格检查失败：\n${result.errors.join('\n')}`);

  const expected = await buildBundle(projectFile);
  const expectedRaw = serializeBundle(expected);
  if (raw !== expectedRaw) {
    const expectedNames = Object.keys(expected.files);
    const actualNames = Object.keys(bundle.files);
    const details = [...new Set([...expectedNames, ...actualNames])].map((name) => {
      const wanted = expected.files[name];
      const actual = bundle.files[name];
      return {
        name,
        expected: wanted ? { encoding: wanted.encoding, mimeType: wanted.mimeType, sha256: hash(fileBytes(wanted)) } : null,
        actual: actual ? { encoding: actual.encoding, mimeType: actual.mimeType, sha256: hash(fileBytes(actual)) } : null,
      };
    });
    throw new Error(`回读与 project/source 不一致：\n${JSON.stringify(details, null, 2)}`);
  }

  const files = Object.entries(bundle.files).map(([name, entry]) => {
    const bytes = fileBytes(entry);
    return {
      name,
      encoding: entry.encoding,
      mimeType: entry.mimeType,
      byteLength: bytes.length,
      sha256: hash(bytes),
    };
  });
  return {
    presetId: bundle.manifest.id,
    itemCount: bundle.manifest.items.length,
    displayCount: (bundle.manifest.displays || []).length,
    bundleSha256: hash(Buffer.from(raw, 'utf8')),
    serializedBytesEqual: true,
    files,
  };
}

async function main() {
  const [projectFile, file, ...extra] = process.argv.slice(2);
  if (!projectFile || !file || extra.length > 0) {
    throw new Error('用法：node tools/readback-preset.mjs <project.json> <preset.json>');
  }
  const report = await readbackPreset({ projectFile, file });
  console.log(JSON.stringify(report, null, 2));
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.error(`[readback-preset] 失败：${error.message}`);
    process.exitCode = 1;
  }
}
