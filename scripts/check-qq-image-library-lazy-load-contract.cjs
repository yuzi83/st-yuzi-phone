const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function nextTurn() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
    const appUrl = pathToFileURL(path.join(ROOT, 'modules/qq-v2/ui/app.js')).href;
    const { __test__ } = await import(`${appUrl}?contract=${Date.now()}`);
    const queue = __test__.createBoundedTaskQueue(4);
    const releases = [];
    let active = 0;
    let maximumActive = 0;
    let started = 0;

    for (let index = 0; index < 6; index += 1) {
        queue.add(async () => {
            started += 1;
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise((resolve) => releases.push(resolve));
            active -= 1;
        });
    }
    await nextTurn();
    assert.equal(started, 4, '图片资料初次最多同时启动四个媒体任务');
    assert.equal(maximumActive, 4);
    releases.shift()();
    await nextTurn();
    assert.equal(started, 5, '一个媒体任务完成后才启动下一个');
    queue.dispose();
    releases.splice(0).forEach((resolve) => resolve());
    await nextTurn();
    assert.equal(started, 5, '离开图片资料页后必须丢弃尚未开始的媒体任务');

    const source = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(source, /import \{ createLazyLoader \} from '\.\.\/\.\.\/utils\/observers\.js';/u,
        '图片资料页必须复用共享 IntersectionObserver 懒加载工具');
    assert.match(source, /createBoundedTaskQueue\(4\)/u);
    assert.match(source, /rootMargin:\s*'180px 0px'/u, '图片应在接近可见区时才预加载');
    assert.match(source, /image\.decoding = 'async'/u, '图片解码不得阻塞主渲染路径');
    assert.match(source, /disposeImageLibraryLazyLoading\(\)[\s\S]*const token = \+\+renderEpoch/u,
        '每轮 QQ 渲染前必须断开上一轮图片资料观察器');
    assert.doesNotMatch(
        source.slice(source.indexOf('const renderImageLibrary'), source.indexOf('const renderSettingsDetail')),
        /void mediaSession\?\.load/u,
        '图片资料页不得在创建全部网格项时立即读取所有媒体',
    );

    console.log('[qq-image-library-lazy-load-contract] passed');
}

main().catch((error) => {
    console.error('[qq-image-library-lazy-load-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
