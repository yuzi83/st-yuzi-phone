const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const MINIMAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function importModule(relativePath) {
    const modulePath = path.join(ROOT, relativePath);
    return import(`${pathToFileURL(modulePath).href}?behavior=${Date.now()}-${Math.random()}`);
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.tasks = new Map();
    }

    setTimeout(callback, delay) {
        const id = this.nextId;
        this.nextId += 1;
        this.tasks.set(id, {
            callback,
            at: this.now + delay,
        });
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    async tick(ms) {
        const target = this.now + ms;
        const dueTasks = [...this.tasks.entries()]
            .filter(([, task]) => task.at <= target)
            .sort((left, right) => left[1].at - right[1].at || left[0] - right[0]);

        for (const [id, task] of dueTasks) {
            if (!this.tasks.has(id)) continue;
            this.tasks.delete(id);
            this.now = task.at;
            task.callback();
            await Promise.resolve();
        }

        this.now = target;
        await Promise.resolve();
    }
}

async function flushAsyncWork() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
}

async function testChatu8BridgeRegistersBeforeRequestAndUsesNullDimensions() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const calls = [];
    let responseListener = null;
    const bridge = createChatu8ImageBridge({
        async onEvent(eventName, listener) {
            calls.push(['listen', eventName]);
            responseListener = listener;
            return () => {
                calls.push(['unlisten', eventName]);
            };
        },
        async triggerEvent(eventName, payload) {
            calls.push(['emit', eventName, payload]);
            responseListener({
                id: payload.id,
                success: true,
                imageData: 'data:image/png;base64,QUJD',
                format: 'png',
            });
        },
        setTimeoutImpl: setTimeout,
        clearTimeoutImpl: clearTimeout,
    });

    const result = await bridge.requestImage({
        id: 'request-001',
        prompt: 'portrait',
    }, {
        timeoutMs: 1000,
    });

    assert.deepStrictEqual(calls.slice(0, 2), [
        ['listen', 'generate-image-response'],
        ['emit', 'generate-image-request', {
            id: 'request-001',
            prompt: 'portrait',
            width: null,
            height: null,
        }],
    ]);
    assert.deepStrictEqual(result, {
        ok: true,
        status: 'generated',
        requestId: 'request-001',
        imageData: 'data:image/png;base64,QUJD',
        format: 'png',
        prompt: '',
        change: '',
        isVideo: false,
    });

    bridge.dispose();
}

async function testChatu8BridgeTimesOutAndIgnoresLateResponse() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    let responseListener = null;
    let markRequestTriggered;
    const requestTriggered = new Promise((resolve) => {
        markRequestTriggered = resolve;
    });
    const bridge = createChatu8ImageBridge({
        async onEvent(eventName, listener) {
            assert.strictEqual(eventName, 'generate-image-response');
            responseListener = listener;
            return () => {};
        },
        async triggerEvent() {
            markRequestTriggered();
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    const resultPromise = bridge.requestImage({
        id: 'request-timeout',
        prompt: 'late image',
    }, {
        timeoutMs: 250,
    });

    await requestTriggered;
    assert.strictEqual(clock.tasks.size, 1, '请求必须注册独立超时器');

    await clock.tick(250);
    assert.deepStrictEqual(await resultPromise, {
        ok: false,
        status: 'timeout',
        requestId: 'request-timeout',
        error: { code: 'generation-timeout' },
    });
    assert.strictEqual(clock.tasks.size, 0, '超时完成后不得残留计时器');

    responseListener({
        id: 'request-timeout',
        success: true,
        imageData: 'data:image/png;base64,TEFURQ==',
    });

    bridge.dispose();
}

async function testChatu8BridgeSeparatesConcurrentResponses() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    const emitted = [];
    let responseListener = null;
    let listenerRegistrations = 0;
    let markBothTriggered;
    const bothTriggered = new Promise((resolve) => {
        markBothTriggered = resolve;
    });
    const bridge = createChatu8ImageBridge({
        async onEvent(_eventName, listener) {
            listenerRegistrations += 1;
            responseListener = listener;
            return () => {};
        },
        async triggerEvent(_eventName, payload) {
            emitted.push(payload);
            if (emitted.length === 2) markBothTriggered();
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    let firstSettled = false;
    const firstPromise = bridge.requestImage({
        id: 'request-a',
        prompt: 'first',
    }, {
        timeoutMs: 1000,
    }).then((result) => {
        firstSettled = true;
        return result;
    });
    const secondPromise = bridge.requestImage({
        id: 'request-b',
        prompt: 'second',
    }, {
        timeoutMs: 1000,
    });

    await bothTriggered;
    assert.strictEqual(listenerRegistrations, 1, '所有并发请求必须共享一个响应监听器');

    responseListener({
        id: 'request-b',
        success: true,
        imageData: 'data:image/webp;base64,QkJC',
        format: 'webp',
        prompt: 'second-result',
        change: 'variant-b',
    });
    assert.deepStrictEqual(await secondPromise, {
        ok: true,
        status: 'generated',
        requestId: 'request-b',
        imageData: 'data:image/webp;base64,QkJC',
        format: 'webp',
        prompt: 'second-result',
        change: 'variant-b',
        isVideo: false,
    });
    assert.strictEqual(firstSettled, false, 'B 的响应不得提前结束 A');

    responseListener({
        id: 'request-a',
        success: false,
        error: 'provider failed',
    });
    assert.deepStrictEqual(await firstPromise, {
        ok: false,
        status: 'failed',
        requestId: 'request-a',
        error: {
            code: 'generation-failed',
            detail: 'provider failed',
        },
    });
    assert.strictEqual(clock.tasks.size, 0, '并发请求全部结束后不得残留超时器');

    bridge.dispose();
}

async function testChatu8BridgeRejectsEmptyRequestId() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    let listenerRegistrations = 0;
    let triggerCalls = 0;
    const bridge = createChatu8ImageBridge({
        async onEvent() {
            listenerRegistrations += 1;
            return () => {};
        },
        async triggerEvent() {
            triggerCalls += 1;
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    const resultPromise = bridge.requestImage({
        id: '   ',
        prompt: 'portrait',
    }, {
        timeoutMs: 0,
    });
    await flushAsyncWork();
    await clock.tick(0);

    assert.deepStrictEqual(await resultPromise, {
        ok: false,
        status: 'invalid-request',
        requestId: '',
        error: { code: 'invalid-request-id' },
    });
    assert.strictEqual(listenerRegistrations, 0, '空 requestId 不得注册响应监听器');
    assert.strictEqual(triggerCalls, 0, '空 requestId 不得发送生图请求');
    assert.strictEqual(clock.tasks.size, 0, '空 requestId 不得创建超时器');
    bridge.dispose();
}

async function testChatu8BridgeRejectsDuplicatePendingRequestId() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    const emitted = [];
    let responseListener = null;
    let releaseListener;
    const listenerGate = new Promise((resolve) => {
        releaseListener = resolve;
    });
    const bridge = createChatu8ImageBridge({
        async onEvent(_eventName, listener) {
            responseListener = listener;
            await listenerGate;
            return () => {};
        },
        async triggerEvent(_eventName, payload) {
            emitted.push(payload);
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    const firstPromise = bridge.requestImage({
        id: 'request-duplicate',
        prompt: 'first',
    }, {
        timeoutMs: 1000,
    });
    const duplicatePromise = bridge.requestImage({
        id: 'request-duplicate',
        prompt: 'second',
    }, {
        timeoutMs: 0,
    });
    await flushAsyncWork();
    releaseListener();
    await flushAsyncWork();

    assert.deepStrictEqual(await duplicatePromise, {
        ok: false,
        status: 'duplicate-request',
        requestId: 'request-duplicate',
        error: { code: 'duplicate-request-id' },
    });
    assert.strictEqual(emitted.length, 1, '重复 requestId 不得再次发送事件');
    assert.strictEqual(clock.tasks.size, 1, '重复 requestId 不得覆盖或新增 pending 超时器');

    responseListener({
        id: 'request-duplicate',
        success: true,
        imageData: 'data:image/png;base64,iVBORw0KGgo=',
    });
    assert.strictEqual((await firstPromise).ok, true, '原请求仍应正常收到响应');
    assert.strictEqual(clock.tasks.size, 0, '原请求完成后必须清理自己的超时器');
    bridge.dispose();
}

async function testChatu8BridgeUsesTimeoutWhenProductionStyleEventAdapterSilentlyNoops() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    let triggerCalls = 0;
    const bridge = createChatu8ImageBridge({
        async onEvent() {
            return () => {};
        },
        async triggerEvent() {
            triggerCalls += 1;
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    const resultPromise = bridge.requestImage({
        id: 'request-silent-noop',
        prompt: 'portrait',
    }, {
        timeoutMs: 250,
    });
    await flushAsyncWork();
    await clock.tick(250);

    assert.deepStrictEqual(await resultPromise, {
        ok: false,
        status: 'timeout',
        requestId: 'request-silent-noop',
        error: { code: 'generation-timeout' },
    });
    assert.strictEqual(triggerCalls, 1, '生产事件桥静默降级时仍会发出一次请求并等待超时');
    assert.strictEqual(clock.tasks.size, 0);
    bridge.dispose();
}

async function testChatu8BridgeValidatesResponsesAndDisposesPendingRequests() {
    const { createChatu8ImageBridge } = await importModule(
        'modules/integration/chatu8-image-bridge.js',
    );

    const clock = new FakeClock();
    let responseListener = null;
    let unsubscribeCalls = 0;
    const emitted = [];
    const bridge = createChatu8ImageBridge({
        async onEvent(_eventName, listener) {
            responseListener = listener;
            return () => {
                unsubscribeCalls += 1;
            };
        },
        async triggerEvent(_eventName, payload) {
            emitted.push(payload);
        },
        setTimeoutImpl: clock.setTimeout.bind(clock),
        clearTimeoutImpl: clock.clearTimeout.bind(clock),
    });

    const invalidPromise = bridge.requestImage({
        id: 'request-invalid',
        prompt: 'invalid',
    }, {
        timeoutMs: 1000,
    });
    await flushAsyncWork();
    responseListener({
        id: 'request-invalid',
        success: true,
        imageData: '',
    });
    assert.deepStrictEqual(await invalidPromise, {
        ok: false,
        status: 'invalid-response',
        requestId: 'request-invalid',
        error: { code: 'missing-image-data' },
    });

    const cancelledPromise = bridge.requestImage({
        id: 'request-cancelled',
        prompt: 'cancelled',
    }, {
        timeoutMs: 1000,
    });
    await flushAsyncWork();
    responseListener({
        id: 'request-cancelled',
        success: false,
        cancelled: true,
        error: 'cancelled upstream',
    });
    assert.deepStrictEqual(await cancelledPromise, {
        ok: false,
        status: 'cancelled',
        requestId: 'request-cancelled',
        error: {
            code: 'generation-cancelled',
            detail: 'cancelled upstream',
        },
    });

    const pendingPromise = bridge.requestImage({
        id: 'request-dispose',
        prompt: 'pending',
    }, {
        timeoutMs: 1000,
    });
    await flushAsyncWork();
    assert.strictEqual(emitted.length, 3);
    bridge.dispose();
    bridge.dispose();

    assert.deepStrictEqual(await pendingPromise, {
        ok: false,
        status: 'disposed',
        requestId: 'request-dispose',
        error: { code: 'bridge-disposed' },
    });
    assert.strictEqual(unsubscribeCalls, 1, 'dispose 必须只注销一次共享监听器');
    assert.strictEqual(clock.tasks.size, 0, 'dispose 必须清除所有 pending 超时器');

    assert.deepStrictEqual(await bridge.requestImage({
        id: 'request-after-dispose',
        prompt: 'ignored',
    }), {
        ok: false,
        status: 'disposed',
        requestId: 'request-after-dispose',
        error: { code: 'bridge-disposed' },
    });
    assert.strictEqual(emitted.length, 3, 'dispose 后不得继续发出请求');
}

async function testImageFileBridgeUploadsDataUrl() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const requests = [];
    let contextReads = 0;
    const bridge = createImageFileBridge({
        getContext() {
            contextReads += 1;
            return {
                getRequestHeaders() {
                    return {
                        'Content-Type': 'application/json',
                        'X-Test-Context': String(contextReads),
                    };
                },
            };
        },
        async fetchImpl(url, options) {
            requests.push({ url, options });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        path: 'user/images/yuzi-phone-generated/example.png',
                    };
                },
            };
        },
    });

    const result = await bridge.save({
        imageData: `data:image/png;base64,${MINIMAL_PNG_BASE64}`,
        folder: 'yuzi-phone-generated',
        filename: 'example',
        format: 'image',
    });

    assert.deepStrictEqual(result, {
        ok: true,
        status: 'stored',
        path: 'user/images/yuzi-phone-generated/example.png',
        format: 'png',
    });
    assert.strictEqual(contextReads, 1);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].url, '/api/images/upload');
    assert.strictEqual(requests[0].options.method, 'POST');
    assert.deepStrictEqual(requests[0].options.headers, {
        'Content-Type': 'application/json',
        'X-Test-Context': '1',
    });
    assert.deepStrictEqual(JSON.parse(requests[0].options.body), {
        image: MINIMAL_PNG_BASE64,
        format: 'png',
        ch_name: 'yuzi-phone-generated',
        filename: 'example',
    });
}

async function testImageFileBridgeSupportsPlainBase64AndDelete() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const requests = [];
    let contextReads = 0;
    const bridge = createImageFileBridge({
        getContext() {
            contextReads += 1;
            return {
                getRequestHeaders() {
                    return {
                        'Content-Type': 'application/json',
                        'X-Fresh-Context': String(contextReads),
                    };
                },
            };
        },
        async fetchImpl(url, options) {
            requests.push({ url, options });
            if (url === '/api/images/upload') {
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return {
                            path: 'user/images/yuzi-phone-generated/plain.png',
                        };
                    },
                };
            }
            return {
                ok: true,
                status: 200,
            };
        },
    });

    const stored = await bridge.save({
        imageData: MINIMAL_PNG_BASE64,
        folder: 'yuzi-phone-generated',
        filename: 'plain',
    });
    assert.deepStrictEqual(stored, {
        ok: true,
        status: 'stored',
        path: 'user/images/yuzi-phone-generated/plain.png',
        format: 'png',
    });

    const deleted = await bridge.delete({
        path: stored.path,
    });
    assert.deepStrictEqual(deleted, {
        ok: true,
        status: 'deleted',
        path: stored.path,
    });
    assert.strictEqual(contextReads, 2, '上传和删除必须分别读取 fresh context');
    assert.strictEqual(requests[1].url, '/api/images/delete');
    assert.strictEqual(requests[1].options.method, 'POST');
    assert.deepStrictEqual(requests[1].options.headers, {
        'Content-Type': 'application/json',
        'X-Fresh-Context': '2',
    });
    assert.deepStrictEqual(JSON.parse(requests[1].options.body), {
        path: 'user/images/yuzi-phone-generated/plain.png',
    });
}

async function testImageFileBridgeRejectsInvalidDataUrlWithoutNetworkRequest() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    let fetchCalls = 0;
    const bridge = createImageFileBridge({
        getContext() {
            return {
                getRequestHeaders() {
                    return { 'Content-Type': 'application/json' };
                },
            };
        },
        async fetchImpl() {
            fetchCalls += 1;
            throw new Error('invalid image data must not reach fetch');
        },
    });

    const result = await bridge.save({
        imageData: 'data:text/plain;base64,SGVsbG8=',
        folder: 'yuzi-phone-generated',
        filename: 'invalid',
    });

    assert.deepStrictEqual(result, {
        ok: false,
        status: 'invalid-image-data',
        error: { code: 'invalid-image-data' },
    });
    assert.strictEqual(fetchCalls, 0);
}

async function testImageFileBridgeRejectsBase64ThatIsNotAnImage() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    let fetchCalls = 0;
    const bridge = createImageFileBridge({
        getContext() {
            return {
                getRequestHeaders() {
                    return { 'Content-Type': 'application/json' };
                },
            };
        },
        async fetchImpl() {
            fetchCalls += 1;
            return {
                ok: true,
                async json() {
                    return { path: 'user/images/yuzi-phone-generated/invalid.png' };
                },
            };
        },
    });

    assert.deepStrictEqual(await bridge.save({
        imageData: 'QUJD',
        format: 'png',
        folder: 'yuzi-phone-generated',
        filename: 'invalid',
    }), {
        ok: false,
        status: 'invalid-image-data',
        error: { code: 'invalid-image-data' },
    });
    assert.strictEqual(fetchCalls, 0, '只有合法 Base64 但没有真实图片魔数时不得上传');
}

async function testImageFileBridgeRestrictsStoredPathsToOwnedFolder() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const requests = [];
    const bridge = createImageFileBridge({
        getContext() {
            return {
                getRequestHeaders() {
                    return { 'Content-Type': 'application/json' };
                },
            };
        },
        async fetchImpl(url, options) {
            requests.push({ url, options });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        path: 'user/images/other-feature/not-owned.png',
                    };
                },
            };
        },
    });

    assert.deepStrictEqual(await bridge.save({
        imageData: MINIMAL_PNG_BASE64,
        folder: 'yuzi-phone-generated',
        filename: 'owned',
    }), {
        ok: false,
        status: 'invalid-response',
        error: { code: 'invalid-image-path' },
    });

    const unrelatedPath = 'user/images/other-feature/important.png';
    assert.deepStrictEqual(await bridge.delete({
        path: unrelatedPath,
    }), {
        ok: false,
        status: 'invalid-path',
        path: unrelatedPath,
        error: { code: 'invalid-image-path' },
    });
    assert.strictEqual(requests.length, 1, '非小手机生图目录的删除请求不得发往服务器');
}

async function testImageFileBridgeAlwaysUploadsIntoOwnedFolder() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const requests = [];
    const bridge = createImageFileBridge({
        getContext() {
            return {
                getRequestHeaders() {
                    return { 'Content-Type': 'application/json' };
                },
            };
        },
        async fetchImpl(url, options) {
            requests.push({ url, options });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        path: 'user/images/yuzi-phone-generated/default-folder.png',
                    };
                },
            };
        },
    });

    assert.strictEqual((await bridge.save({
        imageData: MINIMAL_PNG_BASE64,
        filename: 'default-folder',
    })).ok, true);
    assert.strictEqual(
        JSON.parse(requests[0].options.body).ch_name,
        'yuzi-phone-generated',
        '未传目录时也必须固定上传到小手机生图目录',
    );

    assert.deepStrictEqual(await bridge.save({
        imageData: MINIMAL_PNG_BASE64,
        folder: 'other-feature',
        filename: 'wrong-folder',
    }), {
        ok: false,
        status: 'invalid-destination',
        error: { code: 'invalid-image-folder' },
    });
    assert.strictEqual(requests.length, 1, '不得向其他用户图片目录发起上传');
}

async function testImageFileBridgeDownloadsHttpImageBeforeUpload() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const sourceUrl = 'https://images.example.test/generated.png';
    const pngBuffer = Buffer.from(MINIMAL_PNG_BASE64, 'base64');
    const requests = [];
    let contextReads = 0;
    const bridge = createImageFileBridge({
        getContext() {
            contextReads += 1;
            return {
                getRequestHeaders() {
                    return {
                        'Content-Type': 'application/json',
                        'X-Upload-Only': 'yes',
                    };
                },
            };
        },
        async fetchImpl(url, options) {
            requests.push({ url, options });
            if (url === sourceUrl) {
                return {
                    ok: true,
                    status: 200,
                    url: sourceUrl,
                    headers: {
                        get(name) {
                            return String(name).toLowerCase() === 'content-type'
                                ? 'image/png'
                                : null;
                        },
                    },
                    async arrayBuffer() {
                        return pngBuffer.buffer.slice(
                            pngBuffer.byteOffset,
                            pngBuffer.byteOffset + pngBuffer.byteLength,
                        );
                    },
                };
            }
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        path: 'user/images/yuzi-phone-generated/remote.png',
                    };
                },
            };
        },
    });

    assert.deepStrictEqual(await bridge.save({
        imageData: sourceUrl,
        folder: 'yuzi-phone-generated',
        filename: 'remote',
    }), {
        ok: true,
        status: 'stored',
        path: 'user/images/yuzi-phone-generated/remote.png',
        format: 'png',
    });
    assert.deepStrictEqual(requests[0], {
        url: sourceUrl,
        options: {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
        },
    });
    assert.strictEqual(contextReads, 1, '远程下载不得读取或携带 SillyTavern 请求头');
    assert.deepStrictEqual(JSON.parse(requests[1].options.body), {
        image: MINIMAL_PNG_BASE64,
        format: 'png',
        ch_name: 'yuzi-phone-generated',
        filename: 'remote',
    });
}

async function testImageFileBridgeNormalizesRequestHeaderFailures() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    let fetchCalls = 0;
    const bridge = createImageFileBridge({
        getContext() {
            return {
                getRequestHeaders() {
                    throw new Error('headers unavailable');
                },
            };
        },
        async fetchImpl() {
            fetchCalls += 1;
            throw new Error('must not fetch without headers');
        },
    });

    assert.deepStrictEqual(await bridge.save({
        imageData: MINIMAL_PNG_BASE64,
        folder: 'yuzi-phone-generated',
        filename: 'headers-failed',
    }), {
        ok: false,
        status: 'unavailable',
        error: { code: 'image-storage-unavailable' },
    });

    const storedPath = 'user/images/yuzi-phone-generated/headers-failed.png';
    assert.deepStrictEqual(await bridge.delete({
        path: storedPath,
    }), {
        ok: false,
        status: 'unavailable',
        path: storedPath,
        error: { code: 'image-storage-unavailable' },
    });
    assert.strictEqual(fetchCalls, 0, '请求头读取失败后不得发起上传或删除请求');
}

async function testImageFileBridgeReturnsStructuredRemoteImageFailures() {
    const { createImageFileBridge } = await importModule(
        'modules/integration/image-file-bridge.js',
    );

    const corsUrl = 'https://cross-origin.example.test/generated.png';
    let contextReads = 0;
    const corsBridge = createImageFileBridge({
        getContext() {
            contextReads += 1;
            throw new Error('remote download must not read ST context');
        },
        async fetchImpl() {
            throw new TypeError('Failed to fetch');
        },
    });
    assert.deepStrictEqual(await corsBridge.save({
        imageData: corsUrl,
        folder: 'yuzi-phone-generated',
        filename: 'cors',
    }), {
        ok: false,
        status: 'remote-fetch-failed',
        sourceUrl: corsUrl,
        error: {
            code: 'remote-image-fetch-failed',
            reason: 'cors-or-network',
        },
    });
    assert.strictEqual(contextReads, 0);

    const invalidContentTypeUrl = 'https://images.example.test/not-an-image';
    const invalidContentTypeBridge = createImageFileBridge({
        async fetchImpl() {
            return {
                ok: true,
                status: 200,
                url: invalidContentTypeUrl,
                headers: {
                    get() {
                        return 'text/html';
                    },
                },
            };
        },
    });
    assert.deepStrictEqual(await invalidContentTypeBridge.save({
        imageData: invalidContentTypeUrl,
    }), {
        ok: false,
        status: 'invalid-remote-image',
        sourceUrl: invalidContentTypeUrl,
        error: {
            code: 'invalid-image-content-type',
            contentType: 'text/html',
        },
    });

    const brokenHeadersUrl = 'https://images.example.test/broken-headers.png';
    const brokenHeadersBridge = createImageFileBridge({
        async fetchImpl() {
            return {
                ok: true,
                status: 200,
                url: brokenHeadersUrl,
                headers: {
                    get() {
                        throw new Error('broken headers');
                    },
                },
            };
        },
    });
    assert.deepStrictEqual(await brokenHeadersBridge.save({
        imageData: brokenHeadersUrl,
    }), {
        ok: false,
        status: 'invalid-remote-image',
        sourceUrl: brokenHeadersUrl,
        error: {
            code: 'invalid-image-content-type',
            contentType: '',
        },
    });

    const invalidMagicUrl = 'https://images.example.test/fake.png';
    const fakeImageBuffer = Buffer.from('not a real png', 'utf8');
    const invalidMagicBridge = createImageFileBridge({
        async fetchImpl() {
            return {
                ok: true,
                status: 200,
                url: invalidMagicUrl,
                headers: {
                    get() {
                        return 'image/png';
                    },
                },
                async arrayBuffer() {
                    return fakeImageBuffer.buffer.slice(
                        fakeImageBuffer.byteOffset,
                        fakeImageBuffer.byteOffset + fakeImageBuffer.byteLength,
                    );
                },
            };
        },
    });
    assert.deepStrictEqual(await invalidMagicBridge.save({
        imageData: invalidMagicUrl,
    }), {
        ok: false,
        status: 'invalid-remote-image',
        sourceUrl: invalidMagicUrl,
        error: { code: 'invalid-image-data' },
    });
}

async function testImageGenerationServiceGeneratesAndStores() {
    const { createImageGenerationService } = await importModule(
        'modules/image-generation/service.js',
    );

    const generationCalls = [];
    const storageCalls = [];
    const generator = {
        async requestImage(input, options) {
            generationCalls.push({ input, options });
            return {
                ok: true,
                status: 'generated',
                requestId: input.id,
                imageData: `data:image/png;base64,${MINIMAL_PNG_BASE64}`,
                format: 'png',
                prompt: input.prompt,
                change: input.change,
                isVideo: false,
            };
        },
        dispose() {},
    };
    const imageFiles = {
        async save(input) {
            storageCalls.push(input);
            return {
                ok: true,
                status: 'stored',
                path: 'user/images/yuzi-phone-generated/qq-message-1.png',
                format: 'png',
            };
        },
        async delete() {
            throw new Error('not used');
        },
    };
    const service = createImageGenerationService({
        generator,
        imageFiles,
        createRequestId: () => 'request-service-1',
        now: () => 1787517000000,
    });

    const result = await service.generateAndStore({
        prompt: '星野铃，银色长发，窗边自拍',
        negativePrompt: 'low quality',
        change: 'qq-message-1',
        timeoutMs: 1234,
        folder: 'yuzi-phone-generated',
        filename: 'qq-message-1',
    });

    assert.deepStrictEqual(generationCalls, [{
        input: {
            id: 'request-service-1',
            prompt: '星野铃，银色长发，窗边自拍',
            width: null,
            height: null,
            negative_prompt: 'low quality',
            change: 'qq-message-1',
        },
        options: {
            timeoutMs: 1234,
        },
    }]);
    assert.deepStrictEqual(storageCalls, [{
        imageData: `data:image/png;base64,${MINIMAL_PNG_BASE64}`,
        folder: 'yuzi-phone-generated',
        filename: 'qq-message-1',
        format: 'png',
    }]);
    assert.deepStrictEqual(result, {
        ok: true,
        status: 'stored',
        requestId: 'request-service-1',
        path: 'user/images/yuzi-phone-generated/qq-message-1.png',
        format: 'png',
        prompt: '星野铃，银色长发，窗边自拍',
        change: 'qq-message-1',
        generatedAt: 1787517000000,
    });

    service.dispose();
}

async function testImageGenerationServiceCompensatesUploadCompletedAfterDispose() {
    const { createImageGenerationService } = await importModule(
        'modules/image-generation/service.js',
    );

    let resolveSave;
    let generatorDisposeCalls = 0;
    const deleteCalls = [];
    const service = createImageGenerationService({
        generator: {
            async requestImage(input) {
                return {
                    ok: true,
                    status: 'generated',
                    requestId: input.id,
                    imageData: `data:image/png;base64,${MINIMAL_PNG_BASE64}`,
                    format: 'png',
                };
            },
            dispose() {
                generatorDisposeCalls += 1;
            },
        },
        imageFiles: {
            async save() {
                return new Promise((resolve) => {
                    resolveSave = resolve;
                });
            },
            async delete(input) {
                deleteCalls.push(input);
                return {
                    ok: true,
                    status: 'deleted',
                    path: input.path,
                };
            },
        },
        createRequestId: () => 'request-dispose-upload',
    });

    const resultPromise = service.generateAndStore({
        prompt: 'dispose while uploading',
        folder: 'yuzi-phone-generated',
        filename: 'dispose-upload',
    });
    await flushAsyncWork();
    service.dispose();
    resolveSave({
        ok: true,
        status: 'stored',
        path: 'user/images/yuzi-phone-generated/dispose-upload.png',
        format: 'png',
    });

    assert.deepStrictEqual(await resultPromise, {
        ok: false,
        status: 'disposed',
        requestId: 'request-dispose-upload',
        error: { code: 'service-disposed' },
    });
    assert.deepStrictEqual(deleteCalls, [{
        path: 'user/images/yuzi-phone-generated/dispose-upload.png',
    }], 'dispose 后才完成的上传必须立即补偿删除');
    assert.strictEqual(generatorDisposeCalls, 1);
}

async function testImageGenerationServiceStopsOnFailureAndDelegatesDelete() {
    const { createImageGenerationService } = await importModule(
        'modules/image-generation/service.js',
    );

    let saveCalls = 0;
    let generatorDisposeCalls = 0;
    const deleteCalls = [];
    const service = createImageGenerationService({
        generator: {
            async requestImage(input) {
                return {
                    ok: false,
                    status: 'failed',
                    requestId: input.id,
                    error: { code: 'generation-failed' },
                };
            },
            dispose() {
                generatorDisposeCalls += 1;
            },
        },
        imageFiles: {
            async save() {
                saveCalls += 1;
                return {
                    ok: true,
                    status: 'stored',
                    path: 'must-not-exist.png',
                    format: 'png',
                };
            },
            async delete(input) {
                deleteCalls.push(input);
                return {
                    ok: true,
                    status: 'deleted',
                    path: input.path,
                };
            },
        },
        createRequestId: () => 'request-failed',
    });

    assert.deepStrictEqual(await service.generateAndStore({
        prompt: 'failed prompt',
        folder: 'yuzi-phone-generated',
        filename: 'failed',
    }), {
        ok: false,
        status: 'failed',
        requestId: 'request-failed',
        error: { code: 'generation-failed' },
    });
    assert.strictEqual(saveCalls, 0, '生成失败后不得上传图片');

    assert.deepStrictEqual(await service.deleteStoredImage({
        path: 'user/images/yuzi-phone-generated/old.png',
    }), {
        ok: true,
        status: 'deleted',
        path: 'user/images/yuzi-phone-generated/old.png',
    });
    assert.deepStrictEqual(deleteCalls, [{
        path: 'user/images/yuzi-phone-generated/old.png',
    }]);

    service.dispose();
    service.dispose();
    assert.strictEqual(generatorDisposeCalls, 1, '组合服务 dispose 必须幂等');
}

async function main() {
    await testChatu8BridgeRegistersBeforeRequestAndUsesNullDimensions();
    await testChatu8BridgeTimesOutAndIgnoresLateResponse();
    await testChatu8BridgeSeparatesConcurrentResponses();
    await testChatu8BridgeRejectsEmptyRequestId();
    await testChatu8BridgeRejectsDuplicatePendingRequestId();
    await testChatu8BridgeUsesTimeoutWhenProductionStyleEventAdapterSilentlyNoops();
    await testChatu8BridgeValidatesResponsesAndDisposesPendingRequests();
    await testImageFileBridgeUploadsDataUrl();
    await testImageFileBridgeSupportsPlainBase64AndDelete();
    await testImageFileBridgeRejectsInvalidDataUrlWithoutNetworkRequest();
    await testImageFileBridgeRejectsBase64ThatIsNotAnImage();
    await testImageFileBridgeRestrictsStoredPathsToOwnedFolder();
    await testImageFileBridgeAlwaysUploadsIntoOwnedFolder();
    await testImageFileBridgeDownloadsHttpImageBeforeUpload();
    await testImageFileBridgeNormalizesRequestHeaderFailures();
    await testImageFileBridgeReturnsStructuredRemoteImageFailures();
    await testImageGenerationServiceGeneratesAndStores();
    await testImageGenerationServiceCompensatesUploadCompletedAfterDispose();
    await testImageGenerationServiceStopsOnFailureAndDelegatesDelete();
    console.log('[通过] 生图行为：智慧姬请求、图片文件与生成保存组合服务');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
