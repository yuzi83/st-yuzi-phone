const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function main() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2GlobalRuntimeSettings } = await importModule(
        'modules/qq-v2/application/global-runtime-settings.js',
    );
    const baseStore = createMemoryQQV2StateStore();
    let reads = 0;
    let writes = 0;
    const stateStore = {
        async read() {
            reads += 1;
            return baseStore.read();
        },
        transact(mutator) {
            writes += 1;
            return baseStore.transact(mutator);
        },
    };
    const settings = createQQV2GlobalRuntimeSettings({ stateStore });
    await settings.get('scope-a');
    reads = 0;
    writes = 0;
    await settings.get('scope-a');
    assert.equal(reads, 1, '普通全局设置查询只读一次根状态');
    assert.equal(writes, 0, '已迁移的全局设置查询不得再写回整份根状态');

    const runtimeSource = fs.readFileSync(
        path.join(ROOT, 'modules/qq-v2/application/production-runtime.js'),
        'utf8',
    );
    assert.doesNotMatch(runtimeSource, /getExistingScope/u,
        'QQ 查询热路径不得保留“先确认 scope 再查询”的双读 helper');
    assert.match(runtimeSource, /const queryExistingScope = async[\s\S]*error\?\.code === 'scope_not_found'/u,
        '直接查询仍需保留 scope 不存在时的空结果语义');
    const querySlice = runtimeSource.slice(
        runtimeSource.indexOf('async listConversations({ scopeId })'),
        runtimeSource.indexOf('async releaseMediaRender({ scopeId, leaseId })'),
    );
    assert.doesNotMatch(querySlice, /repository\.getScope/u,
        '会话、资料和媒体查询不得额外读取一次完整 scope');
    assert.match(runtimeSource, /if \(snapshotReadPromise\) return snapshotReadPromise;/u,
        '同一轮 bootstrap 查询应复用正在进行的快照读取');
    assert.match(runtimeSource, /queueMicrotask\(\(\) => \{[\s\S]*snapshotReadPromise = null/u,
        '快照合并只能持续一个微任务，不得形成陈旧长期缓存');

    console.log('[qq-query-performance-contract] passed');
}

main().catch((error) => {
    console.error('[qq-query-performance-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
