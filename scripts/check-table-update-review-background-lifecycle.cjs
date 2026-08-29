const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function moduleUrl(relativePath) {
    return `${pathToFileURL(path.join(ROOT, relativePath)).href}?t=${Date.now()}-${Math.random()}`;
}

function createClock() {
    let now = 0;
    let nextId = 1;
    const tasks = new Map();

    return {
        setTimeout(callback, delay = 0) {
            const id = nextId++;
            tasks.set(id, {
                callback,
                dueAt: now + Math.max(0, Number(delay) || 0),
            });
            return id;
        },
        clearTimeout(id) {
            tasks.delete(id);
        },
        async tick(ms) {
            const target = now + ms;
            while (true) {
                const next = [...tasks.entries()]
                    .filter(([, task]) => task.dueAt <= target)
                    .sort((left, right) => (
                        left[1].dueAt - right[1].dueAt
                        || left[0] - right[0]
                    ))[0];
                if (!next) break;
                const [id, task] = next;
                tasks.delete(id);
                now = task.dueAt;
                await task.callback();
                await Promise.resolve();
            }
            now = target;
        },
    };
}

async function testReviewServiceBelongsToExtensionBackgroundLifecycle() {
    const mod = await import(moduleUrl('modules/phone-core/background-services.js'));
    const clock = createClock();
    const calls = [];
    const tableUpdateSubscribers = new Set();

    mod.__test__setPhoneBackgroundServiceDeps({
        startChronicle: () => true,
        stopChronicle: () => true,
        startSmallCalendar: () => true,
        stopSmallCalendar: () => true,
        startTableContentReplacement: () => true,
        stopTableContentReplacement: () => true,
        startFullscreenOverlay: () => true,
        stopFullscreenOverlay: () => true,
        suspendFullscreenOverlayForChatChange: () => true,
        resumeFullscreenOverlayAfterChatChange: () => true,
        startTableUpdateReview: () => {
            calls.push('review.start');
            return true;
        },
        stopTableUpdateReview: () => {
            calls.push('review.stop');
            return true;
        },
        subscribeTableUpdate(callback) {
            tableUpdateSubscribers.add(callback);
            return () => tableUpdateSubscribers.delete(callback);
        },
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        logger: { debug() {}, warn() {} },
    });

    assert.equal(mod.startPhoneBackgroundServices('enabled'), true);
    assert.equal(
        calls.filter(call => call === 'review.start').length,
        1,
        '扩展 enabled 后台生命周期必须启动审核服务，无需先打开小手机',
    );

    assert.equal(mod.handlePhoneBackgroundChatChanged('chat-next'), true);
    assert.equal(
        calls.includes('review.stop'),
        false,
        '聊天切换屏障不得停止审核服务，否则会错过用于恢复和审核的表格通知',
    );

    for (const callback of [...tableUpdateSubscribers]) callback();
    for (const callback of [...tableUpdateSubscribers]) callback();
    await clock.tick(250);

    assert.equal(
        calls.filter(call => call === 'review.start').length,
        1,
        '聊天切换后的派生服务恢复不应重复拥有审核服务生命周期',
    );

    mod.stopPhoneBackgroundServices('disabled');
    assert.equal(
        calls.filter(call => call === 'review.stop').length,
        1,
        '扩展 disabled 必须停止审核服务',
    );
    mod.__test__resetPhoneBackgroundServices();
}

function testStaticOwnership() {
    const background = read('modules/phone-core/background-services.js');
    const phoneLifecycle = read('modules/phone-core/lifecycle.js');
    const rootIndex = read('index.js');

    assert.match(
        background,
        /from '\.\.\/table-update-review\/service\.js'/u,
        '扩展后台生命周期必须直接拥有审核服务',
    );
    assert.match(background, /startTableUpdateReview/u);
    assert.match(background, /stopTableUpdateReview/u);
    assert.doesNotMatch(
        phoneLifecycle,
        /startTableUpdateReviewService|stopTableUpdateReviewService/u,
        '审核服务不得再归属于小手机 UI runtime',
    );
    assert.match(rootIndex, /startPhoneBackgroundServices\('initialize-enabled'\)/u);
    assert.match(rootIndex, /stopPhoneBackgroundServices\('extension-destroy'\)/u);
}

async function main() {
    await testReviewServiceBelongsToExtensionBackgroundLifecycle();
    testStaticOwnership();
    console.log('[通过] 审核服务归属于扩展后台生命周期');
}

main().catch((error) => {
    console.error('[失败] 审核服务后台生命周期契约');
    console.error(error);
    process.exitCode = 1;
});
