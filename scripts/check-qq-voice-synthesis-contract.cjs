// QQ 语音合成契约：纯逻辑层（Fish 请求 / 情感标签 / 设置归一）、
// 领域层（语音素材生命周期、音色绑定）和 Facade 边界。
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function audio(label) {
    return new Blob([label], { type: 'audio/mpeg' });
}

async function testFishClient() {
    const client = await importModule('modules/qq-v2/voice/fish-client.js');
    const {
        buildQQVoiceSynthesisRequest,
        detectQQVoiceAudioMimeType,
        normalizeQQVoiceBaseUrl,
        synthesizeQQVoice,
        QQV2VoiceError,
    } = client;

    assert.equal(normalizeQQVoiceBaseUrl('https://api.fish.audio'), 'https://api.fish.audio/v1');
    assert.equal(normalizeQQVoiceBaseUrl('https://api.fish.audio/v1/'), 'https://api.fish.audio/v1');
    assert.equal(normalizeQQVoiceBaseUrl('https://api.fish.audio/v1/tts/'), 'https://api.fish.audio/v1');
    assert.equal(normalizeQQVoiceBaseUrl('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
    assert.throws(() => normalizeQQVoiceBaseUrl('ftp://api.fish.audio'), (error) => error.code === 'voice_endpoint_invalid');

    const direct = buildQQVoiceSynthesisRequest({
        apiKey: 'k-1',
        voiceId: 'v-1',
        text: '你好',
        baseUrl: 'https://api.fish.audio',
        model: 's2.1-pro-free',
    });
    assert.equal(direct.url, 'https://api.fish.audio/v1/tts');
    assert.equal(direct.options.headers.Authorization, 'Bearer k-1');
    assert.equal(direct.options.headers.model, 's2.1-pro-free');
    assert.equal(JSON.parse(direct.options.body).reference_id, 'v-1');
    const proxied = buildQQVoiceSynthesisRequest({ apiKey: 'k', voiceId: 'v', text: '你好', directFetch: false });
    assert.equal(proxied.url, '/proxy/https://api.fish.audio/v1/tts');
    assert.throws(
        () => buildQQVoiceSynthesisRequest({ apiKey: 'k', voiceId: '', text: '你好' }),
        (error) => error.code === 'voice_id_missing',
    );
    assert.throws(
        () => buildQQVoiceSynthesisRequest({ apiKey: 'k', voiceId: 'v', text: '[happy]', model: 'nope' }),
        (error) => error.code === 'voice_model_invalid',
    );
    assert.throws(
        () => buildQQVoiceSynthesisRequest({ apiKey: 'k', voiceId: 'v', text: 'x'.repeat(2001) }),
        (error) => error.code === 'voice_text_too_long',
    );

    assert.equal(detectQQVoiceAudioMimeType(new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])), 'audio/mpeg');
    assert.equal(
        detectQQVoiceAudioMimeType(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])),
        'audio/wav',
    );
    assert.equal(detectQQVoiceAudioMimeType(new Uint8Array([60, 104, 116, 109, 108, 62])), '');

    const bytes = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
    const synthesized = await synthesizeQQVoice({
        apiKey: 'k',
        voiceId: 'v',
        text: '你好',
        fetchImpl: async (url, init) => {
            assert.equal(url, 'https://api.fish.audio/v1/tts');
            assert.equal(Boolean(init.signal), true);
            return new Response(bytes, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
        },
    });
    assert.equal(synthesized.mimeType, 'audio/mpeg');
    assert.equal(synthesized.byteLength, bytes.length);

    await assert.rejects(
        synthesizeQQVoice({ apiKey: 'k', voiceId: 'v', text: '你好', fetchImpl: async () => new Response('x', { status: 401 }) }),
        (error) => error instanceof QQV2VoiceError && error.code === 'voice_http_error',
    );
    await assert.rejects(
        synthesizeQQVoice({
            apiKey: 'k',
            voiceId: 'v',
            text: '你好',
            fetchImpl: async () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
        }),
        (error) => error.code === 'voice_audio_unrecognized',
    );

    const service = await importModule('modules/qq-v2/voice/service.js');
    assert.equal(service.resolveQQVoiceId({ settings: { defaultVoiceId: 'd' }, personVoiceId: 'p' }), 'p');
    assert.equal(service.resolveQQVoiceId({ settings: { defaultVoiceId: 'd' }, personVoiceId: '' }), 'd');
    assert.equal(service.resolveQQVoiceId({ settings: { defaultVoiceId: 'd', speakSelf: false }, senderType: 'self' }), '');
    assert.equal(
        service.resolveQQVoiceId({ settings: { defaultVoiceId: 'd', speakSelf: true }, personVoiceId: 'me', senderType: 'self' }),
        'me',
    );
    assert.equal(service.prepareQQVoiceText('[happy]你好', { emotionTags: true }).text, '[happy]你好');
    assert.equal(service.prepareQQVoiceText('[happy]你好', { emotionTags: false }).text, '你好');
    assert.throws(() => service.prepareQQVoiceText('[happy][sad]', { emotionTags: true }), (error) => error.code === 'voice_text_empty');
    assert.equal(await service.measureQQVoiceDurationMs('not-a-blob'), 0);
}

async function testEmotionTags() {
    const { parseQQVoiceText, tokenizeQQVoiceText, QQ_VOICE_TAG_LIMIT } = await importModule('modules/qq-v2/voice/emotion-tags.js');
    const line = '[A restrained and hurt tone]我没有怪你……[slight pause]我只是想知道，[crying]你为什么连告别都不肯说？';
    const parsed = parseQQVoiceText(line);
    assert.equal(parsed.tagCount, 3);
    assert.deepEqual([...parsed.unknownTags], ['A restrained and hurt tone']);
    assert.equal(parsed.ttsText, line);
    assert.equal(parsed.displayText, '我没有怪你……我只是想知道，你为什么连告别都不肯说？');
    assert.equal(parsed.speakable, true);
    assert.equal(parsed.overTagLimit, false);
    assert.deepEqual(
        tokenizeQQVoiceText('[happy]你好[long pause]再见').map((token) => token.type),
        ['tag', 'text', 'tag', 'text'],
    );
    assert.equal(parseQQVoiceText('[happy][sad]').speakable, false);
    assert.equal(parseQQVoiceText(`${'[happy]'.repeat(QQ_VOICE_TAG_LIMIT + 1)}在`).overTagLimit, true);
}

async function testVoiceSettings() {
    const { applyQQVoiceSettingsPatch, normalizeQQVoiceSettings } = await importModule('modules/qq-v2/voice/settings.js');
    const defaults = normalizeQQVoiceSettings({});
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.baseUrl, 'https://api.fish.audio/v1');
    assert.equal(defaults.emotionTags, true);
    assert.equal(defaults.directFetch, true);
    assert.equal(defaults.apiKeySaved, false);
    assert.equal(normalizeQQVoiceSettings({ baseUrl: 'not a url' }).baseUrl, 'https://api.fish.audio/v1');
    assert.equal(normalizeQQVoiceSettings({ defaultVoiceId: ' abc ' }).defaultVoiceId, 'abc');

    const patched = applyQQVoiceSettingsPatch(defaults, {
        enabled: true,
        defaultVoiceId: 'voice-9',
        timeoutMs: 60000,
        speakSelf: true,
    });
    assert.equal(patched.enabled, true);
    assert.equal(patched.defaultVoiceId, 'voice-9');
    assert.equal(patched.speakSelf, true);
    assert.equal(patched.timeoutMs, 60000);
    assert.throws(() => applyQQVoiceSettingsPatch(defaults, { timeoutMs: 10 }), RangeError);
    assert.throws(() => applyQQVoiceSettingsPatch(defaults, { baseUrl: 'javascript:alert(1)' }), RangeError);
    // 音色 ID 只作为字符串保存，不做 URL 解析。
    assert.equal(applyQQVoiceSettingsPatch(defaults, { defaultVoiceId: 'a/../../b' }).defaultVoiceId, 'a/../../b');
}

async function createRepository() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const stateStore = createMemoryQQV2StateStore();
    return { stateStore, repository: createQQV2Repository({ stateStore }) };
}

async function appendVoiceMessage(repository, conversation, person, content = '[happy]今晚见') {
    const [message] = await repository.appendMessages('scope-a', conversation.conversationId, [{
        senderId: person.personId,
        senderType: 'person',
        type: 'voice',
        content,
        storyTime: '',
    }]);
    return message;
}

async function testVoiceLifecycle() {
    const { stateStore, repository } = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const message = await appendVoiceMessage(repository, conversation, person);
    assert.equal(message.voice, undefined);

    const saved = await repository.saveMessageVoice('scope-a', conversation.conversationId, message.messageId, {
        blob: audio('voice-a'),
        mimeType: 'audio/mpeg',
        durationMs: 4200,
        voiceId: 'voice-lin',
        model: 's2.1-pro-free',
        generatedAt: 1700000000000,
    });
    assert.equal(saved.message.type, 'voice');
    assert.equal(saved.message.voice.assetId, saved.voiceAssetId);
    assert.equal(saved.message.voice.durationMs, 4200);
    assert.equal(saved.message.voice.voiceId, 'voice-lin');

    const state = await stateStore.read();
    const asset = state.scopes['scope-a'].voiceAssets[saved.voiceAssetId];
    assert.equal(Boolean(asset.mediaKey), true);
    assert.equal(asset.blob, undefined, '语音 Blob 不得留在 QQ 根状态里');
    assert.equal(await (await stateStore.readMedia(asset.mediaKey)).text(), 'voice-a');

    const read = await repository.getVoiceAsset('scope-a', saved.voiceAssetId);
    assert.equal(read.asset.durationMs, 4200);
    assert.equal(await read.blob.text(), 'voice-a');
    assert.equal(await repository.getVoiceAsset('scope-a', 'missing'), null);

    // 只有语音消息可以挂音频。
    const [textMessage] = await repository.appendMessages('scope-a', conversation.conversationId, [{
        senderId: person.personId,
        senderType: 'person',
        type: 'text',
        content: '文字',
        storyTime: '',
    }]);
    await assert.rejects(
        repository.saveMessageVoice('scope-a', conversation.conversationId, textMessage.messageId, {
            blob: audio('nope'),
            mimeType: 'audio/mpeg',
            generatedAt: 1700000000000,
        }),
        (error) => error.code === 'message_type_invalid',
    );
    await assert.rejects(
        repository.saveMessageVoice('scope-a', conversation.conversationId, message.messageId, {
            blob: null,
            mimeType: 'audio/mpeg',
            generatedAt: 1700000000000,
        }),
        (error) => error.code === 'voice_blob_required',
    );

    // 换一条音频：旧素材必须被释放。
    const replaced = await repository.saveMessageVoice('scope-a', conversation.conversationId, message.messageId, {
        blob: audio('voice-b'),
        mimeType: 'audio/mpeg',
        durationMs: 1000,
        voiceId: 'voice-lin',
        generatedAt: 1700000001000,
    });
    const afterReplace = await stateStore.read();
    assert.equal(afterReplace.scopes['scope-a'].voiceAssets[saved.voiceAssetId], undefined);
    assert.equal(await stateStore.readMedia(asset.mediaKey), null);
    assert.equal(await (await stateStore.readMedia(afterReplace.scopes['scope-a'].voiceAssets[replaced.voiceAssetId].mediaKey)).text(), 'voice-b');

    // 编辑文本会让旧音频失效。
    const edited = await repository.editMessage('scope-a', conversation.conversationId, message.messageId, '[sad]改口了');
    assert.equal(edited.message.voice, undefined);
    const afterEdit = await stateStore.read();
    assert.deepEqual(Object.keys(afterEdit.scopes['scope-a'].voiceAssets), []);

    // 删除消息释放媒体。
    const again = await repository.saveMessageVoice('scope-a', conversation.conversationId, message.messageId, {
        blob: audio('voice-c'),
        mimeType: 'audio/mpeg',
        durationMs: 2000,
        voiceId: 'voice-lin',
        generatedAt: 1700000002000,
    });
    const mediaKey = (await stateStore.read()).scopes['scope-a'].voiceAssets[again.voiceAssetId].mediaKey;
    await repository.deleteMessages('scope-a', conversation.conversationId, [message.messageId]);
    const afterDelete = await stateStore.read();
    assert.deepEqual(Object.keys(afterDelete.scopes['scope-a'].voiceAssets), []);
    assert.equal(await stateStore.readMedia(mediaKey), null);

    // 删除整段会话也不留素材。
    const second = await appendVoiceMessage(repository, conversation, person, '第二段');
    const third = await repository.saveMessageVoice('scope-a', conversation.conversationId, second.messageId, {
        blob: audio('voice-d'),
        mimeType: 'audio/mpeg',
        durationMs: 3000,
        generatedAt: 1700000003000,
    });
    const thirdKey = (await stateStore.read()).scopes['scope-a'].voiceAssets[third.voiceAssetId].mediaKey;
    await repository.deleteConversation('scope-a', conversation.conversationId);
    const afterConversation = await stateStore.read();
    assert.deepEqual(Object.keys(afterConversation.scopes['scope-a'].voiceAssets), []);
    assert.equal(await stateStore.readMedia(thirdKey), null);
}

async function testVoiceBindings() {
    const { stateStore, repository } = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    await repository.updatePrivateProfile('scope-a', conversation.conversationId, { voiceId: 'voice-lin' });
    assert.equal((await repository.getPerson('scope-a', person.personId)).voiceId, 'voice-lin');
    await repository.updateCurrentProfile('scope-a', { voiceId: 'voice-me' });
    assert.equal((await repository.getCurrentProfile('scope-a')).voiceId, 'voice-me');
    await repository.updatePersonVoice('scope-a', person.personId, 'voice-lin-2');
    assert.equal((await repository.getPerson('scope-a', person.personId)).voiceId, 'voice-lin-2');
    assert.equal((await repository.getPerson('scope-a', person.personId)).signature, '');

    const settings = await importModule('modules/qq-v2/application/global-runtime-settings.js');
    const runtimeSettings = settings.createQQV2GlobalRuntimeSettings({ stateStore });
    const initial = await runtimeSettings.get('scope-a');
    assert.equal(initial.voice.enabled, false);
    assert.equal(initial.voice.baseUrl, 'https://api.fish.audio/v1');
    const updated = await runtimeSettings.update('scope-a', {
        voice: { enabled: true, defaultVoiceId: 'voice-default', emotionTags: false },
    });
    assert.equal(updated.settings.voice.enabled, true);
    assert.equal(updated.settings.voice.defaultVoiceId, 'voice-default');
    assert.equal(updated.settings.voice.emotionTags, false);
    assert.equal((await runtimeSettings.get('scope-a')).voice.defaultVoiceId, 'voice-default');
    await assert.rejects(
        runtimeSettings.update('scope-a', { voice: { timeoutMs: 1 } }),
        (error) => error instanceof RangeError,
    );
}

async function testFacadeBoundary() {
    const { createQQV2Facade } = await importModule('modules/qq-v2/application/facade.js');
    const calls = [];
    const stubMessage = {
        messageId: 'message-1',
        conversationId: 'private-1',
        type: 'voice',
        content: '[happy]今晚见',
        senderType: 'person',
        voice: { assetId: 'voice-asset-1', mimeType: 'audio/mpeg', size: 12, durationMs: 4200, voiceId: 'v', generatedAt: 1 },
    };
    const runtime = {
        getSnapshot: async () => ({
            phase: 'ready',
            context: { scopeId: 'scope-a', user: { name: '我' }, storyTime: '' },
            globalSettings: { voice: { enabled: true, defaultVoiceId: 'v' } },
        }),
        getConversation: async ({ conversationId }) => (conversationId === 'private-1' ? { conversationId, kind: 'private' } : null),
        synthesizeVoice: async (input) => {
            calls.push(['synthesizeVoice', input]);
            return { message: stubMessage, durationMs: 4200, voiceId: 'v' };
        },
        updatePersonVoice: async (input) => {
            calls.push(['updatePersonVoice', input]);
            return { person: { personId: input.personId, formalName: '林知夏', voiceId: input.voiceId } };
        },
        setVoiceApiKey: async ({ apiKey }) => {
            calls.push(['setVoiceApiKey', apiKey]);
            return { hasApiKey: Boolean(apiKey) };
        },
        acquireVoiceRender: async () => ({ assetId: 'voice-asset-1', leaseId: 'lease-1', url: 'blob:voice', durationMs: 4200 }),
        releaseVoiceRender: async () => true,
    };
    const facade = createQQV2Facade({ runtime });

    const bootstrap = await facade.query.bootstrap();
    assert.equal(bootstrap.ok, true);
    assert.equal(bootstrap.globalSettings.voice.defaultVoiceId, 'v');

    const missingConversation = await facade.intent.synthesizeVoice({ conversationId: '', messageId: 'm' });
    assert.equal(missingConversation.ok, false);
    assert.equal(missingConversation.reason, 'conversation-required');
    const missingMessage = await facade.intent.synthesizeVoice({ conversationId: 'private-1' });
    assert.equal(missingMessage.reason, 'message-required');
    const notFound = await facade.intent.synthesizeVoice({ conversationId: 'private-9', messageId: 'm' });
    assert.equal(notFound.status, 'not-found');

    const synthesized = await facade.intent.synthesizeVoice({ conversationId: 'private-1', messageId: 'message-1' });
    assert.equal(synthesized.ok, true);
    assert.equal(synthesized.result.durationMs, 4200);
    assert.equal(synthesized.result.message.voice.assetId, 'voice-asset-1');
    assert.equal(Object.isFrozen(synthesized.result.message.voice), true);
    assert.deepEqual(calls.at(-1), ['synthesizeVoice', {
        scopeId: 'scope-a',
        conversationId: 'private-1',
        messageId: 'message-1',
    }]);

    const render = await facade.query.voiceRender({ assetId: 'voice-asset-1' });
    assert.equal(render.ok, true);
    assert.equal(render.render.url, 'blob:voice');
    assert.equal(render.voice.durationMs, 4200);
    assert.equal((await facade.query.voiceRender({})).reason, 'asset-required');
    assert.equal((await facade.intent.releaseVoiceRender({ leaseId: 'lease-1' })).released, true);
    assert.equal((await facade.intent.releaseVoiceRender({})).reason, 'voice-render-required');

    const person = await facade.intent.updatePersonVoice({ personId: 'person-1', voiceId: 'voice-lin' });
    assert.equal(person.ok, true);
    assert.equal(person.person.voiceId, 'voice-lin');
    assert.equal((await facade.intent.updatePersonVoice({})).reason, 'person-required');

    const keySaved = await facade.intent.setVoiceApiKey({ apiKey: 'k' });
    assert.equal(keySaved.hasApiKey, true);
    assert.equal((await facade.intent.setVoiceApiKey({ apiKey: '' })).hasApiKey, false);
}

async function testVoiceTaskController() {
    const { __test__ } = await importModule('modules/qq-v2/ui/app.js');
    const { createVoiceSynthesisTaskController } = __test__;
    assert.equal(typeof createVoiceSynthesisTaskController, 'function');
    assert.throws(() => createVoiceSynthesisTaskController({}), TypeError);

    const tasks = new Map();
    const pages = new Map([['private-1', { items: [{ messageId: 'message-1', type: 'voice', content: '旧' }] }]]);
    let renders = 0;
    let failures = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const controller = createVoiceSynthesisTaskController({
        tasks,
        request: async ({ messageId }) => {
            await gate;
            return {
                ok: true,
                status: 'accepted',
                result: { message: { messageId, type: 'voice', content: '[happy]今晚见', voice: { assetId: 'voice-1', durationMs: 4200 } } },
            };
        },
        readPage: (conversationId) => pages.get(conversationId),
        writePage: (conversationId, page) => pages.set(conversationId, page),
        render: async () => { renders += 1; },
        notifyFailure: () => { failures += 1; },
        isConversationVisible: () => true,
    });

    const first = controller.synthesize({ conversationId: 'private-1', messageId: 'message-1' });
    assert.equal(controller.isLoading('message-1'), true);
    const duplicate = await controller.synthesize({ conversationId: 'private-1', messageId: 'message-1' });
    assert.equal(duplicate.status, 'busy');
    release();
    const completed = await first;
    assert.equal(completed.ok, true);
    assert.equal(controller.isLoading('message-1'), false);
    assert.equal(pages.get('private-1').items[0].voice.durationMs, 4200);
    assert.equal(failures, 0);
    assert.ok(renders >= 2, 'synthesis renders before and after the request');

    const failing = createVoiceSynthesisTaskController({
        tasks: new Map(),
        request: async () => ({ ok: false, status: 'failed', error: { code: 'voice_api_key_missing', message: '未保存密钥' } }),
        readPage: (conversationId) => pages.get(conversationId),
        writePage: (conversationId, page) => pages.set(conversationId, page),
        render: async () => {},
        notifyFailure: () => { failures += 1; },
    });
    const failed = await failing.synthesize({ conversationId: 'private-1', messageId: 'message-1' });
    assert.equal(failed.ok, false);
    assert.equal(failures, 1);
    assert.equal((await failing.synthesize({ conversationId: '', messageId: '' })).status, 'invalid');
    failing.clear();
}

async function testVoicePlaybackController() {
    const { __test__ } = await importModule('modules/qq-v2/ui/app.js');
    const { createVoicePlaybackController } = __test__;
    assert.equal(typeof createVoicePlaybackController, 'function');

    const instances = [];
    class FakeAudio {
        constructor() {
            this.paused = true;
            this.src = '';
            this.listeners = new Map();
            instances.push(this);
        }
        addEventListener(name, handler) {
            this.listeners.set(name, handler);
        }
        emit(name) {
            this.listeners.get(name)?.();
        }
        async play() {
            this.paused = false;
            this.emit('play');
        }
        pause() {
            this.paused = true;
            this.emit('pause');
        }
        removeAttribute(name) {
            if (name === 'src') this.src = '';
        }
    }

    const released = [];
    const controller = createVoicePlaybackController({ AudioCtor: FakeAudio, report: () => {} });
    await controller.play({ key: 'voice:a', url: 'blob:a', release: () => released.push('a') });
    assert.equal(controller.isPlaying('voice:a'), true);
    assert.equal(instances.length, 1, 'the controller owns exactly one audio element');

    // 同一个 key 再点一次是暂停，不重新建元素。
    await controller.play({ key: 'voice:a', url: 'blob:a', release: () => released.push('a') });
    assert.equal(controller.isPlaying('voice:a'), false);
    assert.equal(instances.length, 1);

    await controller.play({ key: 'voice:a', url: 'blob:a', release: () => released.push('a') });
    await controller.play({ key: 'voice:b', url: 'blob:b', release: () => released.push('b') });
    assert.deepEqual(released, ['a'], 'switching messages releases the previous render lease');
    assert.equal(controller.isPlaying('voice:b'), true);

    instances[0].emit('ended');
    assert.deepEqual(released, ['a', 'b'], 'a finished message releases its own lease');
    assert.equal(controller.isPlaying('voice:b'), false);
}

async function testVoiceUiWiring() {
    const fs = await import('node:fs');
    const app = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/ui/app.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'styles/phone-base/12-qq-app.css'), 'utf8');
    const tokens = fs.readFileSync(path.join(ROOT, 'styles/phone-base/00-phone-tokens.css'), 'utf8');
    const docs = fs.readFileSync(path.join(ROOT, 'docs/phone-ui-variables.md'), 'utf8');

    assert.match(app, /voiceId: Object\.freeze\(\{ label: t\("音色 ID"\), maxLength: 256 \}\)/,
        'the profile editor whitelists the voice id field');
    assert.match(app, /profileEditRow\(\{ field: 'voiceId'/, 'the profile editor renders the voice id row');
    assert.match(app, /transcriptToggle\.dataset\.qqVoiceTranscript/, 'the bubble exposes a transcript control');
    assert.match(app, /data-qq-voice-key-save/, 'the settings page exposes the key save control');
    assert.match(app, /data-qq-voice-preview/, 'the settings page exposes the preview control');
    assert.match(app, /facade\.query\.voiceRender\(\{ assetId \}\)/, 'playback resolves audio through the facade');
    assert.match(app, /facade\.intent\.releaseVoiceRender\(\{ leaseId \}\)/, 'playback releases its render lease');
    assert.match(app, /kind === 'voice'/, 'the settings detail page renders the voice group');

    ['yuzi-qq-voice-play', 'yuzi-qq-voice-state', 'yuzi-qq-voice-transcript-toggle', 'yuzi-qq-voice-tag'].forEach((selector) => {
        assert.match(css, new RegExp(`\\.${selector}`), `12-qq-app.css must style .${selector}`);
    });
    ['--yuzi-qq-private-voice-tag-radius', '--yuzi-qq-private-voice-transcript-size'].forEach((token) => {
        assert.match(tokens, new RegExp(`${token}:`), `00-phone-tokens.css must define ${token}`);
        assert.match(docs, new RegExp(token), `docs/phone-ui-variables.md must register ${token}`);
    });
}

async function testVoiceSettingsPage() {
    const { __test__ } = await importModule('modules/qq-v2/ui/app.js');
    const { loadQQSettingsModel, saveQQSettings } = __test__;
    const saved = [];
    const facade = {
        query: {
            bootstrap: async () => ({
                ok: true,
                status: 'ready',
                context: { scopeId: 'scope-a' },
                globalSettings: {
                    voice: {
                        enabled: true,
                        baseUrl: 'https://api.fish.audio/v1',
                        model: 's2.1-pro-free',
                        defaultVoiceId: 'voice-default',
                        speakSelf: true,
                        emotionTags: false,
                        directFetch: true,
                        apiKeySaved: true,
                        timeoutMs: 60000,
                    },
                },
            }),
            currentContext: async () => ({ ok: true, context: { scopeId: 'scope-a' } }),
        },
        intent: {
            updateGlobalSettings: async (input) => {
                saved.push(input);
                return { ok: true, status: 'accepted', settings: {} };
            },
        },
    };

    const model = await loadQQSettingsModel(facade);
    assert.equal(model.ok, true);
    assert.equal(model.settings.voice.defaultVoiceId, 'voice-default');
    assert.equal(model.settings.voice.emotionTags, false);
    assert.equal(model.settings.voice.apiKeySaved, true);
    assert.ok(model.groups.some((group) => group.kind === 'voice'), 'the settings model exposes the voice group');

    await saveQQSettings(facade, {
        scopeId: 'scope-a',
        kind: 'voice',
        field: '',
        values: {
            enabled: true,
            baseUrl: 'https://api.fish.audio',
            model: 's2.1-pro',
            defaultVoiceId: 'voice-x',
            speakSelf: false,
            emotionTags: true,
            directFetch: false,
            timeoutMs: '90000',
        },
    });
    assert.deepEqual(saved.at(-1), {
        scopeId: 'scope-a',
        settings: {
            voice: {
                enabled: true,
                baseUrl: 'https://api.fish.audio',
                model: 's2.1-pro',
                defaultVoiceId: 'voice-x',
                speakSelf: false,
                emotionTags: true,
                directFetch: false,
                timeoutMs: 90000,
            },
        },
    }, 'the voice settings page saves one voice patch');

    await saveQQSettings(facade, {
        scopeId: 'scope-a',
        kind: 'voice',
        field: 'defaultVoiceId',
        values: { defaultVoiceId: 'voice-y' },
    });
    assert.deepEqual(saved.at(-1).settings, { voice: { defaultVoiceId: 'voice-y' } },
        'a single field change only patches that field');
    const invalid = await saveQQSettings(facade, { scopeId: '', kind: 'voice', values: {} });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 'invalid');
}

async function main() {
    await testFishClient();
    await testEmotionTags();
    await testVoiceSettings();
    await testVoiceLifecycle();
    await testVoiceBindings();
    await testFacadeBoundary();
    await testVoiceSettingsPage();
    await testVoiceTaskController();
    await testVoicePlaybackController();
    await testVoiceUiWiring();
    console.log('QQ 语音合成契约通过：Fish 请求、情感标签、设置归一、素材生命周期、音色绑定、Facade 边界、设置页映射、任务与播放控制器、UI 接线');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
