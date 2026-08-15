const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const { createRenderLeaseCoordinator } = await import('../modules/qq-v2/ui/render-lease-coordinator.js');
    let acquireCount = 0;
    const released = [];
    const coordinator = createRenderLeaseCoordinator({
        async acquire(key) {
            acquireCount += 1;
            return { leaseId: `lease-${acquireCount}`, url: `blob:${key}:${acquireCount}` };
        },
        async release(render) {
            released.push(render.leaseId);
        },
    });

    const first = coordinator.begin();
    const firstAvatar = await first.load('avatar-a');
    await first.commit();
    assert.equal(acquireCount, 1);
    assert.deepEqual(released, [], 'the mounted render retains its visible object URL');

    const second = coordinator.begin();
    assert.equal(second.peek('avatar-a'), firstAvatar, 'the next render reuses the mounted avatar synchronously');
    assert.deepEqual(released, [], 'the former DOM lease survives until the successor commits');
    await second.commit();
    assert.equal(acquireCount, 1, 'an unchanged asset does not acquire a second Blob URL');

    const stale = coordinator.begin();
    await stale.load('unused-background');
    await stale.abort();
    assert.deepEqual(released, ['lease-2'], 'an aborted render releases only its unmounted resources');

    const empty = coordinator.begin();
    await empty.commit();
    assert.deepEqual(released, ['lease-2', 'lease-1'], 'the old visible lease releases after a successor stops using it');

    await coordinator.dispose();

    acquireCount = 0;
    released.length = 0;
    const cachedCoordinator = createRenderLeaseCoordinator({
        cacheLimit: 2,
        async acquire(key) {
            acquireCount += 1;
            return { leaseId: `cached-${key}-${acquireCount}`, url: `blob:${key}:${acquireCount}` };
        },
        async release(render) {
            released.push(render.leaseId);
        },
    });
    const cachedFirst = cachedCoordinator.begin();
    const avatarA = await cachedFirst.load('avatar-a');
    await cachedFirst.commit();
    const cachedEmpty = cachedCoordinator.begin();
    await cachedEmpty.commit();
    const cachedReturn = cachedCoordinator.begin();
    assert.equal(cachedReturn.peek('avatar-a'), avatarA,
        'a bounded cache keeps a recently hidden avatar available for a synchronous return render');
    await cachedReturn.commit();
    const cachedNext = cachedCoordinator.begin();
    await cachedNext.load('avatar-b');
    await cachedNext.load('avatar-c');
    await cachedNext.commit();
    const cachedNextEmpty = cachedCoordinator.begin();
    await cachedNextEmpty.commit();
    assert.equal(released.includes(avatarA.leaseId), true, 'the least-recent idle avatar is released at the cache limit');
    await cachedCoordinator.invalidate(['avatar-b']);
    assert.equal(released.some((leaseId) => leaseId.startsWith('cached-avatar-b-')), true,
        'invalidating a deleted avatar releases its cached object URL immediately');
    await cachedCoordinator.dispose();

    const appSource = fs.readFileSync(path.resolve('modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(appSource, /const backgroundRenderLeases = createMediaRenderLeaseCoordinator\(facade, \{ cacheLimit: 8 \}\)/,
        'chat and profile backgrounds keep a small independent render cache');
    assert.match(appSource, /background:\s*backgroundRenderLeases\.begin\(\)/,
        'every QQ render session receives the background cache lease');
    assert.match(appSource, /leaseSessionFor\(token\)\?\.background/g,
        'chat and profile background surfaces consume the dedicated lease session');
    console.log('[qq-render-lease-coordinator] passed');
}

main().catch((error) => {
    console.error('[qq-render-lease-coordinator] failed');
    console.error(error);
    process.exitCode = 1;
});
