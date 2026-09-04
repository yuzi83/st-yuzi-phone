const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createMemoryStorage() {
    const values = new Map();

    return {
        async get(key) {
            return values.get(key);
        },
        async set(key, value) {
            values.set(key, value);
        },
        async delete(key) {
            return values.delete(key);
        },
        values() {
            return [...values.values()];
        },
    };
}

function containsString(value, expected, visited = new Set()) {
    if (value === expected) return true;
    if (!value || typeof value !== 'object' || visited.has(value)) return false;

    visited.add(value);
    if (Array.isArray(value)) {
        return value.some((item) => containsString(item, expected, visited));
    }

    return Object.values(value).some((item) => containsString(item, expected, visited));
}

/**
 * Public resource seam under test:
 * createQQV2ResourceService({ storage, cryptoApi })
 * - regular API preset reads and exports never expose apiKey;
 * - plaintext secrets live in a dedicated storage bucket;
 * - legacy AES-GCM records migrate only at the request boundary.
 */
async function testApiPresetKeepsKeySeparateAndHiddenFromNormalReads() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const { API_KEY_SECRETS_STORAGE_KEY } = await importModule('modules/qq-v2/resources/api-key-store.js');
    const storage = createMemoryStorage();
    const resources = createQQV2ResourceService({ storage, cryptoApi: {} });
    const apiKey = 'qq-v2-test-secret';

    const saved = await resources.saveApiPreset({
        name: 'Primary',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey,
    });

    assert.equal(saved.hasApiKey, true);
    assert.equal('apiKey' in saved, false);
    assert.equal('apiKey' in await resources.getApiPreset(saved.id), false);
    assert.equal(containsString(await storage.get('qq-v2.resources.api-presets'), apiKey), false);
    assert.equal((await storage.get(API_KEY_SECRETS_STORAGE_KEY))[saved.id], apiKey);
    assert.equal(JSON.stringify(await resources.exportAllPromptPresets()).includes(apiKey), false);
    assert.equal((await resources.getApiPresetForRequest(saved.id)).apiKey, apiKey);
}

async function testResourceServiceWorksWithoutWebCrypto() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({ storage: createMemoryStorage(), cryptoApi: {} });

    const apiPreset = await resources.saveApiPreset({
        name: 'LAN HTTP',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey: 'lan-http-key',
    });
    const promptPreset = await resources.savePromptPreset({
        name: 'LAN prompt',
        messages: [{ role: 'system', content: 'Works without WebCrypto.' }],
    });
    const sticker = await resources.saveSticker({
        description: 'LAN sticker',
        blob: new Blob(['lan'], { type: 'image/png' }),
    });

    assert.match(apiPreset.id, /.+/);
    assert.match(promptPreset.id, /.+/);
    assert.match(sticker.id, /.+/);
    assert.equal((await resources.getApiPresetForRequest(apiPreset.id)).apiKey, 'lan-http-key');
}

async function testLegacyEncryptedApiKeyMigratesAtRequestBoundary() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const {
        API_KEY_SECRETS_STORAGE_KEY,
        LEGACY_API_KEY_STORAGE_KEY,
    } = await importModule('modules/qq-v2/resources/api-key-store.js');
    const storage = createMemoryStorage();
    const encryptionKey = await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        new TextEncoder().encode('legacy-secret'),
    );
    await storage.set(LEGACY_API_KEY_STORAGE_KEY, encryptionKey);
    await storage.set('qq-v2.resources.api-presets', {
        presets: [{
            id: 'legacy-api',
            name: 'Legacy API',
            endpoint: 'https://api.example.test/v1',
            model: 'gpt-test',
            temperature: 1,
            maxOutput: 4096,
            hasApiKey: true,
            iv: iv.buffer,
            ciphertext,
        }],
    });
    const resources = createQQV2ResourceService({ storage, cryptoApi: webcrypto });

    assert.equal((await resources.getApiPresetForRequest('legacy-api')).apiKey, 'legacy-secret');
    assert.equal((await storage.get(API_KEY_SECRETS_STORAGE_KEY))['legacy-api'], 'legacy-secret');
    const migrated = (await storage.get('qq-v2.resources.api-presets')).presets[0];
    assert.equal('iv' in migrated, false);
    assert.equal('ciphertext' in migrated, false);
}

async function testLegacyEncryptedApiKeyDoesNotBlockHttpStartup() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const storage = createMemoryStorage();
    await storage.set('qq-v2.resources.api-presets', {
        presets: [{
            id: 'legacy-api',
            name: 'Legacy API',
            endpoint: 'https://api.example.test/v1',
            model: 'gpt-test',
            temperature: 1,
            maxOutput: 4096,
            hasApiKey: true,
            iv: new Uint8Array(12).buffer,
            ciphertext: new Uint8Array([1, 2, 3]).buffer,
        }],
    });
    const resources = createQQV2ResourceService({ storage, cryptoApi: {} });

    assert.equal((await resources.listApiPresets())[0].hasApiKey, true);
    await assert.rejects(
        resources.getApiPresetForRequest('legacy-api'),
        (error) => error?.code === 'api_key_reentry_required',
    );
    await resources.saveApiPreset({
        id: 'legacy-api',
        apiKey: 'replacement-secret',
    });
    assert.equal((await resources.getApiPresetForRequest('legacy-api')).apiKey, 'replacement-secret');
}

async function testApiPresetEndpointPolicyAndDefaults() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });

    const remote = await resources.saveApiPreset({
        name: 'Remote',
        endpoint: 'HTTPS://API.EXAMPLE.TEST/v1',
        model: 'gpt-test',
        apiKey: 'remote-key',
    });
    const loopback = await resources.saveApiPreset({
        name: 'Local',
        endpoint: 'http://[::1]:11434/v1',
        model: 'local-model',
        apiKey: 'local-key',
    });
    const namedLoopback = await resources.saveApiPreset({
        name: 'Named local',
        endpoint: 'http://localhost:11434/v1',
        model: 'local-model',
        apiKey: 'named-local-key',
    });
    const ipv4Loopback = await resources.saveApiPreset({
        name: 'IPv4 local',
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'local-model',
        apiKey: 'ipv4-local-key',
    });
    const ipv4LoopbackRange = await resources.saveApiPreset({
        name: 'IPv4 loopback range',
        endpoint: 'http://127.4.5.6:11434/v1',
        model: 'local-model',
        apiKey: 'ipv4-loopback-range-key',
    });
    const privateTen = await resources.saveApiPreset({
        name: 'Private ten',
        endpoint: 'http://10.20.30.40:8000/v1/chat/completions',
        model: 'local-model',
        apiKey: 'private-ten-key',
    });
    const private172 = await resources.saveApiPreset({
        name: 'Private 172',
        endpoint: 'http://172.16.1.50:8000/v1',
        model: 'local-model',
        apiKey: 'private-172-key',
    });
    const private192 = await resources.saveApiPreset({
        name: 'Private 192',
        endpoint: 'http://192.168.1.50:8000/v1/models',
        model: 'local-model',
        apiKey: 'private-192-key',
    });
    const completionUrl = await resources.saveApiPreset({
        name: 'Completion URL',
        endpoint: 'https://api.example.test/v1/chat/completions',
        model: 'gpt-test',
        apiKey: 'completion-key',
    });
    const modelUrl = await resources.saveApiPreset({
        name: 'Model URL',
        endpoint: 'https://api.example.test/models',
        model: 'gpt-test',
        apiKey: 'models-key',
    });

    assert.equal(remote.endpoint, 'https://api.example.test/v1');
    assert.equal(remote.temperature, 1);
    assert.equal(remote.maxOutput, 4096);
    assert.equal(loopback.endpoint, 'http://[::1]:11434/v1');
    assert.equal(namedLoopback.endpoint, 'http://localhost:11434/v1');
    assert.equal(ipv4Loopback.endpoint, 'http://127.0.0.1:11434/v1');
    assert.equal(ipv4LoopbackRange.endpoint, 'http://127.4.5.6:11434/v1');
    assert.equal(privateTen.endpoint, 'http://10.20.30.40:8000/v1');
    assert.equal(private172.endpoint, 'http://172.16.1.50:8000/v1');
    assert.equal(private192.endpoint, 'http://192.168.1.50:8000/v1');
    assert.equal(completionUrl.endpoint, 'https://api.example.test/v1');
    assert.equal(modelUrl.endpoint, 'https://api.example.test/v1');
    await assert.rejects(
        resources.saveApiPreset({
            name: 'Insecure remote',
            endpoint: 'http://api.example.test/v1',
            model: 'gpt-test',
            apiKey: 'nope',
        }),
        (error) => error?.code === 'invalid_api_endpoint',
    );
    await assert.rejects(
        resources.saveApiPreset({
            name: 'Endpoint credential',
            endpoint: 'https://api.example.test/v1?api_key=plaintext-secret',
            model: 'gpt-test',
            apiKey: 'encrypted-key',
        }),
        (error) => error?.code === 'invalid_api_endpoint',
    );
}

async function testApiPresetExposesKeyOnlyForRequestAssembly() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const saved = await resources.saveApiPreset({
        name: 'Request only',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey: 'request-boundary-key',
    });

    const requestPreset = await resources.getApiPresetForRequest(saved.id);

    assert.equal(requestPreset.id, saved.id);
    assert.equal(requestPreset.apiKey, 'request-boundary-key');
    assert.equal('apiKey' in await resources.getApiPreset(saved.id), false);
}

async function testApiPresetEditsPreserveOrReplaceTheKey() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const initial = await resources.saveApiPreset({
        name: 'Editable',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey: 'first-key',
    });

    const preserved = await resources.saveApiPreset({
        id: initial.id,
        name: 'Renamed',
        endpoint: 'https://api.example.test/v2',
        model: 'gpt-next',
        temperature: 0.4,
        maxOutput: 2048,
        apiKey: '   ',
    });
    assert.equal(preserved.id, initial.id);
    assert.equal(preserved.name, 'Renamed');
    assert.equal((await resources.getApiPresetForRequest(initial.id)).apiKey, 'first-key');

    const replaced = await resources.saveApiPreset({
        id: initial.id,
        name: 'Renamed again',
        endpoint: 'https://api.example.test/v3',
        model: 'gpt-final',
        apiKey: 'second-key',
    });
    assert.equal(replaced.id, initial.id);
    assert.equal((await resources.getApiPresetForRequest(initial.id)).apiKey, 'second-key');

    await resources.saveApiPreset({
        id: initial.id,
        name: 'Omitted key',
        endpoint: 'https://api.example.test/v4',
        model: 'gpt-final',
    });
    assert.equal((await resources.getApiPresetForRequest(initial.id)).apiKey, 'second-key');
}

async function testInvalidApiPresetEditDoesNotReplaceTheStoredKey() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const saved = await resources.saveApiPreset({
        name: 'Stable',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey: 'stable-key',
    });

    await assert.rejects(
        resources.saveApiPreset({
            id: saved.id,
            endpoint: 'http://api.example.test/v1',
            apiKey: 'should-not-stick',
        }),
        (error) => error?.code === 'invalid_api_endpoint',
    );
    assert.equal((await resources.getApiPresetForRequest(saved.id)).apiKey, 'stable-key');
}

async function testDeletingApiPresetLeavesItsStableIdUnresolved() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const deleted = await resources.saveApiPreset({
        name: 'Delete me',
        endpoint: 'https://delete.example.test/v1',
        model: 'gpt-test',
        apiKey: 'delete-key',
    });
    const remaining = await resources.saveApiPreset({
        name: 'Keep me',
        endpoint: 'https://keep.example.test/v1',
        model: 'gpt-test',
        apiKey: 'keep-key',
    });

    assert.equal(await resources.deleteApiPreset(deleted.id), true);
    assert.equal(await resources.getApiPreset(deleted.id), null);
    assert.equal(await resources.getApiPresetForRequest(deleted.id), null);
    assert.deepEqual(
        (await resources.listApiPresets()).map((preset) => preset.id),
        [remaining.id],
    );
}

async function testFourBuiltInPromptPresetsAreAvailableAsEditableLibraryEntries() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });

    const presets = await resources.listPromptPresets();

    assert.deepEqual(
        presets.map((preset) => ({
            id: preset.id,
            isBuiltIn: preset.isBuiltIn,
        })),
        [
            { id: 'builtin-private-reply', isBuiltIn: true },
            { id: 'builtin-private-proactive', isBuiltIn: true },
            { id: 'builtin-group-reply', isBuiltIn: true },
            { id: 'builtin-group-proactive', isBuiltIn: true },
        ],
    );
    for (const preset of presets) {
        assert.equal('kind' in preset, false, 'AI 指令预设库不能绑定运行场景');
        assert.ok(preset.messages.length > 0);
    assert.deepEqual(
        preset.messages.slice(-2).map((block) => [block.name, block.role]),
        [['输出格式', 'system'], ['玉子执行确认', 'assistant']],
    );
        assert.equal(
            preset.messages.some((block) => block.id.endsWith('-output-preparation')),
            false,
            `${preset.id} should end with Yuzi's assistant confirmation instead of a user preparation block`,
        );
        assert.equal(
            preset.messages.some((block) => block.name === '玉子互动框架'),
            false,
            `${preset.id} should not include the removed Yuzi framework block`,
        );
        assert.equal(
            preset.messages.some((block) => block.name === '玉子框架确认'),
            false,
            `${preset.id} should not include the removed Yuzi framework acknowledgement`,
        );
        assert.equal(
            preset.messages.some((block) => block.id.endsWith('-framework') || block.id.endsWith('-framework-ack')),
            false,
            `${preset.id} should not retain removed Yuzi framework message ids`,
        );
        assert.equal(
            preset.messages.map((block) => block.content).join('\n').split('{{可用表情}}').length - 1,
            1,
            `${preset.id} should expose the sticker placeholder exactly once`,
        );
        assert.ok(preset.messages.every((block) => ['system', 'user', 'assistant'].includes(block.role)));
    }
}

async function testNewYuziDefaultLibraryDoesNotReadSupersededDevelopmentPresetStorage() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const storage = createMemoryStorage();
    await storage.set('qq-v2.resources.prompt-presets-v2', {
        presets: [{
            id: 'builtin-private-reply',
            name: '过期研发默认预设',
            isBuiltIn: true,
            messages: [{ id: 'old-output', name: '输出格式', role: 'system', content: '旧格式' }],
        }],
    });
    const resources = createQQV2ResourceService({ storage, cryptoApi: webcrypto });

    const presets = await resources.listPromptPresets();

    assert.equal(presets.length, 4);
    assert.match(presets[0].messages[0].content, /你是玉子/);
    assert.equal(presets[0].messages.at(-1).name, '玉子执行确认');
}

async function testBuiltInPromptPresetsRetainYuziBlocksAndEditableXmlOutput() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const presets = new Map((await resources.listPromptPresets()).map((preset) => [preset.id, preset]));
    const contentOf = (id) => presets.get(id).messages.map((block) => block.content).join('\n');

    for (const id of ['builtin-private-reply', 'builtin-private-proactive', 'builtin-group-reply', 'builtin-group-proactive']) {
        const preset = presets.get(id);
        assert.match(preset.messages[0].content, /你是玉子/,
            `${id} should preserve the Yuzi guide block`);
        assert.ok(preset.messages.some((block) => block.name.includes('确认')),
            `${id} should retain editable confirmation blocks`);
    }

    for (const id of ['builtin-private-reply', 'builtin-private-proactive']) {
        const preset = presets.get(id);
        assert.match(preset.messages[0].content, /软糯可爱、温柔细心、会认真偏爱用户/,
            `${id} should preserve Yuzi's existing personality`);
        for (const suffix of [
            'character-excavation-ack',
            'conversation-ack',
            'story-context-ack',
            'guard-ack',
        ]) {
            assert.ok(preset.messages.some((block) => block.id === `${id}-${suffix}`),
                `${id} should preserve ${suffix}`);
        }
        assert.ok(preset.messages.some((block) => block.content.startsWith('收到呀')),
            `${id} should preserve Yuzi's warm confirmation tone`);
        assert.ok(preset.messages.some((block) => block.content.startsWith('嗯嗯')),
            `${id} should preserve Yuzi's closing confirmation tone`);
    }

    for (const id of ['builtin-private-reply', 'builtin-private-proactive']) {
        const preset = presets.get(id);
        const [outputFormat, finalAck] = preset.messages.slice(-2);
        assert.deepEqual(
            [outputFormat.name, outputFormat.role, finalAck.name, finalAck.role],
            ['输出格式', 'system', '玉子执行确认', 'assistant'],
        );
        assert.match(outputFormat.content, /<qq>/);
        assert.match(outputFormat.content, /<message/);
        assert.match(outputFormat.content, /<read conversation=/);
        assert.match(outputFormat.content, /<transfer conversation=/);
        assert.match(outputFormat.content, /不得添加 quote/);
        assert.doesNotMatch(outputFormat.content, /<message[^>]*\squote=|create-group|<group conversation=/);
    }
    for (const id of ['builtin-private-reply', 'builtin-private-proactive', 'builtin-group-reply', 'builtin-group-proactive']) {
        assert.match(contentOf(id), /不把人设关键词当成固定模板/,
            `${id} should include the shared human-like character rule`);
        assert.match(contentOf(id), /只能使用人物合理知道的信息/,
            `${id} should include the shared knowledge-boundary rule`);
        assert.match(contentOf(id), /人物资料与明确世界观设定/,
            `${id} should include the shared source-priority rule`);
        assert.match(contentOf(id), /普通事情保持普通反应/,
            `${id} should include the shared emotional calibration rule`);
        assert.match(contentOf(id), /习惯、口头禅、特殊称呼和表情只在合适时偶尔出现/,
            `${id} should include the shared anti-repetition rule`);
        assert.match(contentOf(id), /没有明确设定时，不擅自发明特殊自称、方言、口头禅或职业术语/,
            `${id} should include the shared anti-invention rule`);
        assert.match(contentOf(id), /人物的能力、职业和身份不是万能能力，也不是固定修辞库/,
            `${id} should include the shared ability-boundary rule`);
    }

    const privateReplyOutput = presets.get('builtin-private-reply').messages.at(-2).content;
    assert.match(privateReplyOutput, /P1 是当前私聊会话，N1 是当前私聊人物/);
    assert.doesNotMatch(privateReplyOutput, /<none \/>|<create-private/);

    const privateProactiveOutput = presets.get('builtin-private-proactive').messages.at(-2).content;
    assert.match(privateProactiveOutput, /P1、P2……分别代表一个已有私聊，并同时作为该私聊人物的引用/);
    assert.match(privateProactiveOutput, /<none \/>/);
    assert.match(privateProactiveOutput, /<create-private/);

    for (const id of ['builtin-group-reply', 'builtin-group-proactive']) {
        const preset = presets.get(id);
        const outputFormat = preset.messages.at(-2).content;
        assert.equal(preset.messages.at(-1).name, '玉子执行确认',
            `${id} should end with Yuzi's assistant confirmation`);
        assert.match(outputFormat, /<qq>/,
            `${id} should retain an editable XML output block`);
        assert.match(outputFormat, /<message/,
            `${id} should expose XML message syntax in the editable output block`);
        assert.match(outputFormat, /quote="消息引用"/,
            `${id} should expose structured group-message quoting`);
        assert.match(outputFormat, /quote 只能引用同一群聊中本次实际提供的消息/,
            `${id} should constrain quote references to the current visible group history`);
        assert.match(outputFormat, /action 可以是[^。]*leave/,
            `${id} should expose the leave group action`);
        assert.match(outputFormat, /leave 不需要 target/,
            `${id} should explain that leave does not use a target`);
        for (const protocolPart of [
            '【QQ XML 输出协议】',
            '<read conversation=',
            '<none />',
            '<create-private',
            '<create-group',
            '<group conversation=',
            '<transfer conversation=',
            '私聊回复：',
            '私聊主动：',
            'P1、P2……同时是该私聊的会话与 NPC 人物引用',
            '群聊回复：',
            '群聊主动：',
        ]) {
            assert.ok(outputFormat.includes(protocolPart), `${id} should expose ${protocolPart} in its editable XML block`);
        }
    }
    for (const marker of ['{{私聊人物}}', '{{正文上下文}}', '{{世界书内容}}', '{{故事时间}}', '{{可用表情}}']) {
        assert.ok(contentOf('builtin-private-reply').includes(marker), `private reply should include ${marker}`);
    }
    assert.equal(contentOf('builtin-private-reply').includes('{{私聊记录}}'), false,
        'private reply should append real role history once instead of duplicating its history placeholder');
    for (const marker of ['{{群聊成员}}', '{{正文上下文}}', '{{世界书内容}}', '{{故事时间}}', '{{可用表情}}']) {
        assert.ok(contentOf('builtin-group-reply').includes(marker), `group reply should include ${marker}`);
    }
    assert.equal(contentOf('builtin-group-reply').includes('{{群聊记录}}'), false,
        'group reply should use the appended current history instead of duplicating its history placeholder');
    assert.equal(contentOf('builtin-group-reply').includes('群聊当成有自己温度和秩序的场域'), false,
        'group reply should not keep the removed duplicated conversation guidance block');
    assert.equal(
        presets.get('builtin-group-reply').messages.some((message) => message.id === 'builtin-group-reply-conversation-ack'),
        false,
        'group reply should not keep the acknowledgement for the removed conversation-history block',
    );
    assert.match(contentOf('builtin-group-reply'), /不要强行让所有成员发言/,
        'group reply should preserve the natural multi-speaker rule');
    assert.match(contentOf('builtin-group-proactive'), /没有自然动机时不要为了活跃而发送/,
        'group proactive should preserve the natural activity rule');
    for (const marker of ['{{私聊主动人物}}', '{{私聊主动记录}}', '{{正文上下文}}', '{{世界书内容}}', '{{故事时间}}', '{{可用表情}}']) {
        assert.ok(contentOf('builtin-private-proactive').includes(marker), `private proactive should include ${marker}`);
    }
    assert.equal(contentOf('builtin-private-proactive').includes('{{私聊人物}}'), false);
    assert.equal(contentOf('builtin-private-proactive').includes('{{私聊记录}}'), false);
    for (const marker of ['{{群聊成员}}', '{{群聊记录}}', '{{正文上下文}}', '{{世界书内容}}', '{{故事时间}}', '{{可用表情}}']) {
        assert.ok(contentOf('builtin-group-proactive').includes(marker), `group proactive should include ${marker}`);
    }

    for (const [presetId, promptId, ackId, placeholder] of [
        [
            'builtin-private-reply',
            'builtin-private-reply-group-memory-prompt',
            'builtin-private-reply-group-memory-ack',
            '{{群聊记忆}}',
        ],
        [
            'builtin-private-proactive',
            'builtin-private-proactive-group-memory-prompt',
            'builtin-private-proactive-group-memory-ack',
            '{{主动群聊记忆}}',
        ],
        [
            'builtin-group-reply',
            'builtin-group-reply-private-memory-prompt',
            'builtin-group-reply-private-memory-ack',
            '{{私聊记忆}}',
        ],
        [
            'builtin-group-proactive',
            'builtin-group-proactive-private-memory-prompt',
            'builtin-group-proactive-private-memory-ack',
            '{{主动私聊记忆}}',
        ],
    ]) {
        const messages = presets.get(presetId).messages;
        const promptIndex = messages.findIndex((message) => message.id === promptId);
        assert.ok(promptIndex >= 0, `${presetId} should include its cross-conversation memory prompt`);
        assert.deepEqual(
            messages.slice(promptIndex, promptIndex + 2).map((message) => [message.id, message.role]),
            [[promptId, 'user'], [ackId, 'assistant']],
            `${presetId} should keep the memory prompt and acknowledgement adjacent`,
        );
        assert.match(messages[promptIndex].content, new RegExp(placeholder.replace(/[{}]/g, '\\$&')));
    }
    assert.match(
        contentOf('builtin-group-reply'),
        /每个人只能使用属于自己的私聊分区，不能知道其他成员的私聊历史/,
    );
    assert.match(
        contentOf('builtin-group-proactive'),
        /每个人只能使用属于自己的私聊分区，不能知道其他成员的私聊历史/,
    );
}

async function testStoredBuiltInPromptIsOnlyUpgradedByExplicitRestore() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const storage = createMemoryStorage();
    await storage.set('qq-v2.resources.prompt-presets-v3', {
        presets: [{
            id: 'builtin-private-reply',
            name: '用户保留的旧默认私聊回复',
            isBuiltIn: true,
            messages: [{
                id: 'old-user-kept-block',
                name: '旧内容',
                role: 'system',
                content: '保持不变，直到用户手动恢复默认。',
            }],
        }],
    });
    const resources = createQQV2ResourceService({ storage, cryptoApi: webcrypto });

    assert.equal(
        (await resources.getPromptPreset('builtin-private-reply')).messages[0].id,
        'old-user-kept-block',
        'startup must not replace a stored built-in preset',
    );
    assert.equal(
        (await resources.restoreBuiltInPromptPreset('builtin-private-reply')).messages
            .some((message) => message.id === 'builtin-private-reply-group-memory-prompt'),
        true,
        'explicit restore upgrades the selected built-in preset',
    );
}

async function testBuiltInPromptPresetIsEditableAndPreservesUnknownPlaceholders() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });

    const saved = await resources.savePromptPreset({
        id: 'builtin-private-reply',
        name: 'Edited private reply',
        messages: [
            {
                id: 'first-block',
                name: 'First',
                role: 'assistant',
                content: 'Keep {{future_placeholder}} exactly as written.',
            },
            {
                id: 'second-block',
                name: 'Second',
                role: 'system',
                content: 'Second block.',
            },
        ],
    });

    assert.equal(saved.isBuiltIn, true);
    assert.deepEqual(saved.messages.map((block) => block.id), ['first-block', 'second-block']);
    assert.equal(saved.messages[0].content, 'Keep {{future_placeholder}} exactly as written.');
    assert.deepEqual(await resources.getPromptPreset(saved.id), saved);
}

async function testPromptPresetNamesMustBeUnique() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const saved = await resources.savePromptPreset({
        name: '唯一名称',
        messages: [{ id: 'first', name: '规则', role: 'system', content: '内容' }],
    });

    await assert.rejects(
        resources.savePromptPreset({
            name: ' 唯一名称 ',
            messages: [{ id: 'copy', name: '规则', role: 'system', content: '副本' }],
        }),
        (error) => error?.code === 'prompt_preset_name_conflict',
    );
    const renamed = await resources.savePromptPreset({
        id: saved.id,
        name: '唯一名称',
        messages: saved.messages,
    });
    assert.equal(renamed.id, saved.id, '保存当前预设时允许保留自己的名称');
}

async function testBuiltInPromptPresetCanBeRestored() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const original = await resources.getPromptPreset('builtin-group-reply');
    await resources.savePromptPreset({
        ...original,
        messages: [{
            id: 'changed-block',
            name: 'Changed',
            role: 'system',
            content: 'This is deliberately changed.',
        }],
    });

    const restored = await resources.restoreBuiltInPromptPreset('builtin-group-reply');

    assert.deepEqual(restored, original);
    assert.deepEqual(await resources.getPromptPreset('builtin-group-reply'), original);
}

async function testCustomPromptPresetsCanBeDeletedButBuiltInsCannot() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const custom = await resources.savePromptPreset({
        name: 'My custom preset',
        messages: [{
            id: 'custom-block',
            name: 'Custom',
            role: 'user',
            content: 'Custom content.',
        }],
    });

    assert.equal(custom.isBuiltIn, false);
    assert.notEqual(custom.id, 'builtin-group-proactive');
    assert.equal(await resources.deletePromptPreset(custom.id), true);
    assert.equal(await resources.getPromptPreset(custom.id), null);
    await assert.rejects(
        resources.deletePromptPreset('builtin-group-proactive'),
        (error) => error?.code === 'built_in_prompt_preset',
    );
}

async function testRestoringAllBuiltInPromptPresetsKeepsCustomPresets() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const originals = await resources.listPromptPresets();
    const custom = await resources.savePromptPreset({
        name: 'Keep this custom preset',
        messages: [{
            id: 'custom-keep-block',
            name: 'Custom',
            role: 'user',
            content: 'Keep me.',
        }],
    });
    for (const id of ['builtin-private-reply', 'builtin-group-proactive']) {
        const preset = await resources.getPromptPreset(id);
        await resources.savePromptPreset({
            ...preset,
            messages: [{
                id: `${id}-edited`,
                name: 'Edited',
                role: 'system',
                content: 'Edited.',
            }],
        });
    }

    const restored = await resources.restoreAllBuiltInPromptPresets();

    assert.deepEqual(restored, originals);
    assert.deepEqual(await resources.getPromptPreset(custom.id), custom);
}

async function testImportingPromptPresetsAlwaysCreatesNewCustomCopies() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const builtIn = await resources.getPromptPreset('builtin-private-reply');
    const existing = await resources.savePromptPreset({
        name: 'Imported preset',
        messages: [{
            id: 'existing-block',
            name: 'Existing',
            role: 'system',
            content: 'Existing custom preset.',
        }],
    });

    const [imported] = await resources.importPromptPresets([{
        id: 'builtin-private-reply',
        isBuiltIn: true,
        name: 'Imported preset',
        messages: [{
            id: 'source-block',
            name: 'Source',
            role: 'user',
            content: 'Imported {{external_marker}}.',
        }],
    }]);

    assert.equal(imported.isBuiltIn, false);
    assert.notEqual(imported.id, 'builtin-private-reply');
    assert.notEqual(imported.id, existing.id);
    assert.equal(imported.name, 'Imported preset (copy)');
    assert.equal(imported.messages[0].content, 'Imported {{external_marker}}.');
    assert.deepEqual(await resources.getPromptPreset('builtin-private-reply'), builtIn);
    assert.deepEqual(await resources.getPromptPreset(existing.id), existing);
}

async function testPromptPresetExportReturnsEditablePublicRecords() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const custom = await resources.savePromptPreset({
        name: 'Export me',
        messages: [{
            id: 'export-block',
            name: 'Export block',
            role: 'assistant',
            content: 'Export {{unchanged}}.',
        }],
    });

    assert.deepEqual(await resources.exportPromptPreset(custom.id), custom);
    assert.deepEqual(await resources.exportAllPromptPresets(), await resources.listPromptPresets());
}

async function testPromptPresetsAreNotBoundToKindsAndMessageRolesRemainConstrained() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });

    const reusable = await resources.savePromptPreset({
        name: 'Reusable prompt',
        kind: 'not-a-runtime-setting',
        messages: [{ id: 'valid-role', name: 'Valid', role: 'system', content: 'Content.' }],
    });
    assert.equal('kind' in reusable, false, '保存时不能把场景类型写进预设');
    await assert.rejects(
        resources.savePromptPreset({
            name: 'Wrong role',
            messages: [{ id: 'invalid-role', name: 'Invalid', role: 'tool', content: 'Content.' }],
        }),
        (error) => error?.code === 'invalid_prompt_message_role',
    );
    const edited = await resources.savePromptPreset({
        id: reusable.id,
        name: 'Still reusable',
        kind: 'group-reply',
    });
    assert.equal(edited.name, 'Still reusable');
    assert.equal('kind' in edited, false);
}

async function testStickerStoresMetadataAndOriginalBlobWithRequiredDescription() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const blob = new Blob(['GIF89a animated sticker'], { type: 'image/gif' });

    const saved = await resources.saveSticker({
        description: 'A character waves hello.',
        blob,
    });

    assert.equal(saved.description, 'A character waves hello.');
    assert.equal('name' in saved, false);
    assert.equal(saved.mimeType, 'image/gif');
    assert.equal(saved.order, 0);
    assert.equal('blob' in saved, false);
    assert.equal(await (await resources.getStickerBlob(saved.id)).text(), 'GIF89a animated sticker');
    await assert.rejects(
        resources.saveSticker({ description: '   ', blob }),
        (error) => error?.code === 'sticker_description_required',
    );
}

async function testStickersCanBeListedAndManuallyReordered() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const first = await resources.saveSticker({
        description: 'The first sticker.',
        blob: new Blob(['first'], { type: 'image/png' }),
    });
    const second = await resources.saveSticker({
        description: 'An animated WebP sticker.',
        blob: new Blob(['animated webp'], { type: 'image/webp' }),
    });

    assert.deepEqual(
        (await resources.listStickers()).map((sticker) => ({ id: sticker.id, order: sticker.order })),
        [{ id: first.id, order: 0 }, { id: second.id, order: 1 }],
    );
    await resources.moveSticker(second.id, 0);
    assert.deepEqual(
        (await resources.listStickers()).map((sticker) => ({ id: sticker.id, order: sticker.order })),
        [{ id: second.id, order: 0 }, { id: first.id, order: 1 }],
    );
    assert.equal(await (await resources.getStickerBlob(second.id)).text(), 'animated webp');
}

async function testDeletingStickerRemovesItsBlobAndAvailability() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const sticker = await resources.saveSticker({
        description: 'A removable sticker.',
        blob: new Blob(['delete'], { type: 'image/png' }),
    });

    assert.equal(await resources.deleteSticker(sticker.id), true);
    assert.deepEqual(await resources.listStickers(), []);
    assert.equal(await resources.getStickerBlob(sticker.id), null);
    assert.equal(await resources.deleteSticker(sticker.id), false);
}

async function testDeletingMultipleStickersInOneBatch() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const stickers = await resources.saveStickers([
        {
            description: 'First batch deletion sticker.',
            blob: new Blob(['batch delete first'], { type: 'image/png' }),
        },
        {
            description: 'Second batch deletion sticker.',
            blob: new Blob(['batch delete second'], { type: 'image/png' }),
        },
        {
            description: 'Third batch deletion sticker.',
            blob: new Blob(['batch delete third'], { type: 'image/png' }),
        },
    ]);

    const result = await resources.deleteStickers(stickers.map((sticker) => sticker.id));

    assert.deepEqual(result, { deletedStickerIds: stickers.map((sticker) => sticker.id) });
    assert.deepEqual(await resources.listStickers(), []);
    for (const sticker of stickers) {
        assert.equal(await resources.getStickerBlob(sticker.id), null);
    }
}

async function testStickerMetadataCanBeEditedWithoutReplacingItsBlob() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });
    const saved = await resources.saveSticker({
        description: 'Original description.',
        blob: new Blob(['original sticker'], { type: 'image/webp' }),
    });

    const edited = await resources.saveSticker({
        id: saved.id,
        description: 'Edited description.',
    });

    assert.equal(edited.id, saved.id);
    assert.equal(edited.description, 'Edited description.');
    assert.equal('name' in edited, false);
    assert.equal(edited.order, 0);
    assert.equal(await (await resources.getStickerBlob(saved.id)).text(), 'original sticker');
}

async function testResourcesAreSharedAcrossServiceInstances() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const storage = createMemoryStorage();
    const writer = createQQV2ResourceService({ storage, cryptoApi: webcrypto });
    const reader = createQQV2ResourceService({ storage, cryptoApi: webcrypto });
    const apiPreset = await writer.saveApiPreset({
        name: 'Shared API',
        endpoint: 'https://api.example.test/v1',
        model: 'gpt-test',
        apiKey: 'shared-key',
    });
    const promptPreset = await writer.savePromptPreset({
        name: 'Shared prompt',
        messages: [{
            id: 'shared-prompt-block',
            name: 'Shared',
            role: 'system',
            content: 'Shared {{placeholder}}.',
        }],
    });
    const sticker = await writer.saveSticker({
        description: 'A shared sticker.',
        blob: new Blob(['shared blob'], { type: 'image/png' }),
    });

    assert.equal((await reader.getApiPresetForRequest(apiPreset.id)).apiKey, 'shared-key');
    assert.deepEqual(await reader.getPromptPreset(promptPreset.id), promptPreset);
    assert.deepEqual((await reader.listStickers()).map((item) => item.id), [sticker.id]);
    assert.equal(await (await reader.getStickerBlob(sticker.id)).text(), 'shared blob');
}

async function testStickersCanBeAddedInOneBatch() {
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({
        storage: createMemoryStorage(),
        cryptoApi: webcrypto,
    });

    const saved = await resources.saveStickers([
        {
            description: 'The first batch sticker.',
            blob: new Blob(['batch first'], { type: 'image/png' }),
        },
        {
            description: 'The second batch sticker.',
            blob: new Blob(['batch second'], { type: 'image/gif' }),
        },
    ]);

    assert.deepEqual(saved.map((sticker) => ({ description: sticker.description, order: sticker.order })), [
        { description: 'The first batch sticker.', order: 0 },
        { description: 'The second batch sticker.', order: 1 },
    ]);
    assert.equal(await (await resources.getStickerBlob(saved[1].id)).text(), 'batch second');

    await assert.rejects(
        resources.saveStickers([
            { description: 'This must roll back.', blob: new Blob(['never written'], { type: 'image/png' }) },
            { description: '', blob: new Blob(['invalid'], { type: 'image/png' }) },
        ]),
        (error) => error?.code === 'sticker_description_required',
    );
    assert.deepEqual(
        (await resources.listStickers()).map((sticker) => sticker.description),
        ['The first batch sticker.', 'The second batch sticker.'],
        'one invalid sticker must roll back the complete batch',
    );
}

async function main() {
    await testApiPresetKeepsKeySeparateAndHiddenFromNormalReads();
    await testResourceServiceWorksWithoutWebCrypto();
    await testLegacyEncryptedApiKeyMigratesAtRequestBoundary();
    await testLegacyEncryptedApiKeyDoesNotBlockHttpStartup();
    await testApiPresetEndpointPolicyAndDefaults();
    await testApiPresetExposesKeyOnlyForRequestAssembly();
    await testApiPresetEditsPreserveOrReplaceTheKey();
    await testInvalidApiPresetEditDoesNotReplaceTheStoredKey();
    await testDeletingApiPresetLeavesItsStableIdUnresolved();
    await testFourBuiltInPromptPresetsAreAvailableAsEditableLibraryEntries();
    await testNewYuziDefaultLibraryDoesNotReadSupersededDevelopmentPresetStorage();
    await testBuiltInPromptPresetsRetainYuziBlocksAndEditableXmlOutput();
    await testStoredBuiltInPromptIsOnlyUpgradedByExplicitRestore();
    await testBuiltInPromptPresetIsEditableAndPreservesUnknownPlaceholders();
    await testPromptPresetNamesMustBeUnique();
    await testBuiltInPromptPresetCanBeRestored();
    await testCustomPromptPresetsCanBeDeletedButBuiltInsCannot();
    await testRestoringAllBuiltInPromptPresetsKeepsCustomPresets();
    await testImportingPromptPresetsAlwaysCreatesNewCustomCopies();
    await testPromptPresetExportReturnsEditablePublicRecords();
    await testPromptPresetsAreNotBoundToKindsAndMessageRolesRemainConstrained();
    await testStickerStoresMetadataAndOriginalBlobWithRequiredDescription();
    await testStickersCanBeListedAndManuallyReordered();
    await testDeletingStickerRemovesItsBlobAndAvailability();
    await testDeletingMultipleStickersInOneBatch();
    await testStickerMetadataCanBeEditedWithoutReplacingItsBlob();
    await testResourcesAreSharedAcrossServiceInstances();
    await testStickersCanBeAddedInOneBatch();
    console.log('[qq-v2-resources-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-resources-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
