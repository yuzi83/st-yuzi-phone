const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
    const {
        createComposerAutoHeightController,
        normalizeComposerSubmission,
        shouldSubmitComposerKey,
    } = await import('../modules/qq-v2/ui/composer.js');

    assert.deepEqual(normalizeComposerSubmission('  '), {
        ok: false,
        reason: 'empty',
        content: '',
    });
    assert.deepEqual(normalizeComposerSubmission('  keep surrounding spaces  '), {
        ok: true,
        reason: '',
        content: '  keep surrounding spaces  ',
    });

    assert.equal(shouldSubmitComposerKey({ key: 'Enter', shiftKey: false, isComposing: false }), true);
    assert.equal(shouldSubmitComposerKey({ key: 'Enter', shiftKey: true, isComposing: false }), false);
    assert.equal(shouldSubmitComposerKey({ key: 'Enter', shiftKey: false, isComposing: true }), false);
    assert.equal(shouldSubmitComposerKey({ key: 'a', shiftKey: false, isComposing: false }), false);

    const scheduledFrames = new Map();
    const cancelledFrames = [];
    let nextFrameId = 0;
    let measureCount = 0;
    const input = {
        isConnected: true,
        style: {},
        value: 'draft',
    };
    const autoHeight = createComposerAutoHeightController({
        requestFrame(callback) {
            const frameId = ++nextFrameId;
            scheduledFrames.set(frameId, callback);
            return frameId;
        },
        cancelFrame(frameId) {
            cancelledFrames.push(frameId);
            scheduledFrames.delete(frameId);
        },
        getComputedStyle() {
            return {
                height: '40px',
                minHeight: '40px',
                maxHeight: '160px',
                overflowY: 'hidden',
            };
        },
        measureContentHeight() {
            measureCount += 1;
            return 40;
        },
    });

    assert.equal(autoHeight.schedule(input), true);
    assert.equal(autoHeight.schedule(input), false, 'same-frame input must reuse the pending animation frame');
    assert.equal(scheduledFrames.size, 1);
    const firstFrame = [...scheduledFrames.values()][0];
    scheduledFrames.clear();
    firstFrame();
    assert.equal(measureCount, 1, 'one animation frame must perform one height measurement');

    assert.equal(autoHeight.schedule(input), true);
    const pendingFrameId = [...scheduledFrames.keys()][0];
    autoHeight.dispose();
    assert.deepEqual(cancelledFrames, [pendingFrameId], 'disposing the composer must cancel pending height work');
    assert.equal(autoHeight.schedule(input), false, 'disposed height controllers must reject future work');

    const layoutFrames = [];
    const heightWrites = [];
    const overflowWrites = [];
    const layoutState = {
        contentHeight: 220,
        height: 40,
        overflowY: 'hidden',
    };
    const layoutInput = {
        isConnected: true,
        style: {
            set height(value) {
                heightWrites.push(value);
                layoutState.height = Number.parseFloat(value);
            },
            set overflowY(value) {
                overflowWrites.push(value);
                layoutState.overflowY = value;
            },
        },
    };
    const layoutController = createComposerAutoHeightController({
        requestFrame(callback) {
            layoutFrames.push(callback);
            return layoutFrames.length;
        },
        cancelFrame() {},
        getComputedStyle() {
            return {
                height: `${layoutState.height}px`,
                minHeight: '40px',
                maxHeight: '160px',
                overflowY: layoutState.overflowY,
            };
        },
        measureContentHeight() {
            return layoutState.contentHeight;
        },
    });
    const flushLayout = () => {
        layoutController.schedule(layoutInput);
        layoutFrames.shift()();
    };

    flushLayout();
    assert.deepEqual(heightWrites, ['160px'], 'content height must clamp to the computed CSS max-height');
    assert.deepEqual(overflowWrites, ['auto'], 'overflowing drafts must scroll inside the textarea');

    flushLayout();
    assert.deepEqual(heightWrites, ['160px'], 'unchanged height must not write a duplicate inline style');
    assert.deepEqual(overflowWrites, ['auto'], 'unchanged overflow mode must not write a duplicate inline style');

    layoutState.contentHeight = 82;
    flushLayout();
    assert.deepEqual(heightWrites, ['160px', '82px'], 'shorter drafts must shrink without a client-height multiplier');
    assert.deepEqual(overflowWrites, ['auto', 'hidden'], 'non-overflowing drafts must hide the internal scrollbar');
    layoutController.dispose();

    const mirrorFrames = [];
    const mirrorHeightWrites = [];
    let mirrorMounted = 0;
    let mirrorRemoved = 0;
    const mirror = {
        scrollHeight: 84,
        style: {},
        setAttribute() {},
        remove() {
            mirrorRemoved += 1;
        },
    };
    const ownerDocument = {
        body: {
            append(element) {
                assert.equal(element, mirror);
                mirrorMounted += 1;
            },
        },
        createElement(tagName) {
            assert.equal(tagName, 'textarea');
            return mirror;
        },
    };
    const measuredInput = {
        isConnected: true,
        ownerDocument,
        scrollHeight: 40,
        value: 'two visual lines',
        getBoundingClientRect() {
            return { width: 300 };
        },
        style: {
            set height(value) {
                mirrorHeightWrites.push(value);
            },
            set overflowY(_value) {},
        },
    };
    const mirrorController = createComposerAutoHeightController({
        requestFrame(callback) {
            mirrorFrames.push(callback);
            return mirrorFrames.length;
        },
        cancelFrame() {},
        getComputedStyle() {
            return {
                height: '40px',
                minHeight: '40px',
                maxHeight: '160px',
                overflowY: 'hidden',
                boxSizing: 'border-box',
                width: '300px',
                paddingBlockStart: '9px',
                paddingBlockEnd: '9px',
                paddingInlineStart: '12px',
                paddingInlineEnd: '12px',
                borderBlockStartWidth: '0px',
                borderBlockEndWidth: '0px',
                borderInlineStartWidth: '0px',
                borderInlineEndWidth: '0px',
                font: '16px / 21px sans-serif',
                lineHeight: '21px',
                letterSpacing: 'normal',
                tabSize: '8',
                textIndent: '0px',
                textTransform: 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
            };
        },
    });
    mirrorController.schedule(measuredInput);
    mirrorFrames.shift()();
    assert.equal(mirrorMounted, 1, 'default measurement must use one off-screen textarea mirror');
    assert.deepEqual(
        mirrorHeightWrites,
        ['84px'],
        'default measurement must not write an intermediate auto height to the live input',
    );
    mirrorController.dispose();
    assert.equal(mirrorRemoved, 1, 'disposing the controller must remove its measurement textarea');

    const source = await fs.readFile(path.join(__dirname, '../modules/qq-v2/ui/app.js'), 'utf8');
    assert.match(source, /normalizeComposerSubmission\(value\)/, 'text submission must preserve non-empty source text');
    assert.match(source, /facade\.intent\.sendMessage\(/, 'text must use the existing single-message contract');
    assert.doesNotMatch(source, /composerSendPlan|pendingAttachments/, 'Q49-1 forbids a combined attachment draft');
    assert.match(
        source,
        /createComposerAutoHeightController\(\)/,
        'the QQ App must own one composer height scheduler',
    );
    assert.match(
        source.slice(
            source.indexOf('const renderComposer ='),
            source.indexOf('const renderEmojiPanel ='),
        ),
        /input\.addEventListener\('input',\s*\(\)\s*=>\s*\{\s*drafts\.set\([^;]+;\s*composerAutoHeight\.schedule\(input\);\s*syncMentionPanel\(\);\s*\}\);/s,
        'input events update the draft, schedule height work, then refresh the group mention panel',
    );
    assert.doesNotMatch(source, /input\.style\.height\s*=|input\.scrollHeight|input\.clientHeight\s*\*\s*4/, 'input events must not force synchronous layout');
    assert.match(source, /const render = async[^]*?composerAutoHeight\.cancel\(\);/, 'rerender must clear stale pending height work');
    assert.match(
        source,
        /viewport\.replaceChildren\(content\);[^]*?composerAutoHeight\.schedule\(\s*viewport\.querySelector\('\.yuzi-qq-composer-input'\)\s*\);/,
        'rendered drafts must receive one deferred initial height measurement',
    );
    assert.match(source, /destroy\(\)\s*\{[^]*?composerAutoHeight\.dispose\(\);/, 'destroy must cancel RAF work and release the measurement node');

    const tokenSource = await fs.readFile(path.join(__dirname, '../styles/phone-base/00-phone-tokens.css'), 'utf8');
    const styleSource = await fs.readFile(path.join(__dirname, '../styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(
        tokenSource,
        /--yuzi-qq-composer-input-padding-block:\s*9px;/,
        'the 40px composer needs a dedicated vertical centering token',
    );
    assert.match(
        styleSource,
        /\.yuzi-qq-composer-input\s*\{[^}]*padding-block:\s*var\(--yuzi-qq-composer-input-padding-block\);/s,
        'the composer input must consume its dedicated vertical padding',
    );
    assert.match(
        styleSource,
        /\.yuzi-qq-composer-input\s*\{[^}]*max-height:\s*var\(--yuzi-qq-composer-input-max-height\);/s,
        'the composer must expose a stable physical max-height to computed styles',
    );
    assert.doesNotMatch(
        styleSource,
        /\.yuzi-qq-composer-input\s*\{[^}]*padding-block:\s*var\(--yuzi-qq-square-radius\);/s,
        'the square container radius must not collapse textarea vertical padding',
    );

    console.log('[qq-private-text-input-contract] passed');
}

main().catch((error) => {
    console.error('[qq-private-text-input-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
