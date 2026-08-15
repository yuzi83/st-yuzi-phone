const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
    const { createViewSnapshotCache } = await import(pathToFileURL(
        path.resolve('modules/qq-v2/ui/view-snapshot-cache.js'),
    ).href);
    const evicted = [];
    const cache = createViewSnapshotCache({
        limit: 2,
        onEvict(snapshot) {
            evicted.push(snapshot.id);
        },
    });

    cache.store('messages', { id: 'messages-v1' });
    cache.store('chat:a', { id: 'chat-a-v1' });
    assert.equal(cache.take('messages').id, 'messages-v1', 'a stored view can be restored synchronously');
    assert.equal(cache.take('messages'), null, 'taking a view transfers ownership out of the cache');

    cache.store('messages', { id: 'messages-v2' });
    cache.store('settings:a', { id: 'settings-a-v1' });
    assert.deepEqual(evicted, ['chat-a-v1'], 'the least-recent stored view is evicted at the limit');
    cache.clear();
    assert.deepEqual(evicted, ['chat-a-v1', 'messages-v2', 'settings-a-v1'], 'clear releases every retained view');
    assert.equal(cache.take('settings:a'), null, 'cleared views cannot be restored');

    const appSource = fs.readFileSync(path.resolve('modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(appSource, /createViewSnapshotCache\(\{[\s\S]*?limit:\s*4/,
        'QQ keeps only a bounded set of recently visited view snapshots');
    assert.match(appSource, /const isBottomTabView = \(viewKey\) => viewKey\.startsWith\('tab:'\);/,
        'QQ identifies bottom-tab views separately from detail pages');
    assert.match(appSource, /const immediateSnapshot = prepareImmediateView\(targetViewKey, scrollSnapshot\);[\s\S]*?const content = await renderPage\(token\);/,
        'the immediate-view decision is made before asynchronous page reads');
    assert.match(appSource, /if \(isBottomTabView\(targetViewKey\) && displayedViewKey && !cached\) \{[\s\S]*?deferred: true/,
        'an uncached bottom-tab switch defers replacing the current complete view');
    assert.match(appSource, /if \(immediateSnapshot\.deferred[\s\S]*?\)\s*\{[\s\S]*?viewSnapshotCache\.store\(displayedViewKey,[\s\S]*?viewport\.replaceChildren\(content\);/,
        'a deferred switch stores the outgoing view only when the new page is ready');
    assert.match(appSource, /viewSnapshotCache\.clear\(\)/,
        'QQ clears retained view snapshots during lifecycle resets');

    console.log('[qq-view-snapshot-cache] passed');
}

main().catch((error) => {
    console.error('[qq-view-snapshot-cache] failed');
    console.error(error);
    process.exitCode = 1;
});
