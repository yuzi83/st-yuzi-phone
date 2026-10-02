import { createAssistantPromptPreset } from '../prompt/assistant-preset.js';
import { createChatPromptPresets } from '../prompt/chat-presets.js';
import { normalizeQQV2OpenAIBaseUrl } from '../api-endpoint-policy.js';
import { createQQV2ApiKeyStore } from './api-key-store.js';
import { QQ_VOICE_API_KEY_ID } from '../voice/settings.js';
import {
    QQ_VOICE_LIBRARY_STORAGE_KEY,
    findQQVoiceRole,
    mergeQQVoiceLibrary,
    mergeQQVoiceRoles,
    normalizeQQVoiceEntry,
    normalizeQQVoiceLibrary,
    normalizeQQVoiceRoles,
} from '../voice/library.js';

const API_PRESETS_STORAGE_KEY = 'qq-v2.resources.api-presets';
const PROMPT_PRESETS_STORAGE_KEY = 'qq-v2.resources.prompt-presets-v3';
const STICKERS_STORAGE_KEY = 'qq-v2.resources.stickers';
const IMAGE_GENERATION_PRESETS_STORAGE_KEY = 'qq-v2.resources.image-generation-presets';
const VOICE_ROLES_STORAGE_KEY = 'qq-v2.resources.voice-roles';
const PROMPT_MESSAGE_ROLES = new Set(['system', 'user', 'assistant']);
const IMAGE_GENERATION_PRESET_KEYS = new Set(['entries']);
const IMAGE_GENERATION_ENTRY_KEYS = new Set([
    'id',
    'name',
    'role',
    'content',
    'enabled',
    'triggerMode',
    'triggerWords',
    'andTriggerWords',
]);

const QQ_XML_PROTOCOL = String.raw`
【QQ XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

所有标签和属性均大小写敏感，只能使用本协议列出的标签与属性；不能嵌套节点，不能添加 url、status 等未列出的属性。文本中的 &、<、> 必须转义为 XML 实体；属性中的引号也必须转义。

本次资料会提供临时引用。手动回复中，P1 或 G1 是当前会话，N1、N2……是 NPC 人物；私聊主动中，P1、P2……同时是该私聊的会话与 NPC 人物引用；群聊主动中，G1、G2……是群会话，N1、N2……是群成员。消息为 M1、M2……或 P1-M1、G1-M1……。只能使用本次实际提供的引用，禁止猜造或跨会话使用。__self__ 仅代表当前用户，不能作为 message 的 sender；只有确实以用户为目标时才可写入 recipient 或 group 的 target。

1. 发送消息
<message conversation="会话引用" sender="人物引用" type="类型" quote="消息引用" mentions="N1,N2" all="true|false" sticker="表情ID" amount="金额" recipient="人物引用或__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- quote 只能引用同一群聊中本次实际提供的消息；不引用时不要输出 quote 属性。
- mentions 用英文逗号分隔群成员；all 只能为 true 或 false，只有群主或管理员的群消息能使用 true。
- sticker 只用于 sticker，且必须是 {{可用表情}} 中真实存在的 ID；正文写表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填；正文写自然语言说明。
- text 写 QQ 文字；voice 写语音文字内容；image、video 写自然语言描述。不要提供 URL、时长或媒体地址。
- voice 正文可以放 FAS2 声音控制标签（英文方括号，例如 [happy]、[sad]、[angry]、[sigh]、[whispering]、[shouting]、[long pause]），放在它影响的词前面，每条语音最多 10 个；场景没有依据就不要加。

示例：
<qq>
  <message conversation="P1" sender="N1" type="text">好，我知道了。</message>
</qq>

2. 已读不回
<read conversation="P1" />

只允许私聊，没有文本内容，也没有其他属性。私聊回复场景中，read 不能与 message 或 transfer 同时出现。

3. 本轮无动作
<none />

没有属性和文本内容。只允许私聊主动、群聊回复、群聊主动三种场景，且必须是整个 <qq> 中唯一的动作。

4. 新建私聊
<create-private id="P新引用" name="人物名字" />

只允许私聊主动场景。id 是本次新会话的临时引用，不能与已有引用重复；创建后必须在同一批 XML 中、排在它后面，向该会话发送首条合法消息；这条首消息的 conversation 和 sender 都使用同一个 P新引用。

5. 新建群聊
<create-group id="G新引用" name="群名称" owner="群主人物引用" members="N1,N2" />

只允许群聊主动场景。members 至少两名本次提供、已经存在的私聊好友；owner 必须在 members 中。新群必须在同一批 XML 中、排在创建动作后，发送首条合法群消息。

6. 群管理
<group conversation="G1" action="动作" actor="操作者人物引用" target="目标人物引用或__self__" value="值" duration="时长" />

没有文本内容。action 可以是 rename、add、remove、kick、appoint-admin、revoke-admin、mute、unmute、leave、reinvite、transfer-owner、dissolve。
- rename 需要 value；add、remove、kick、appoint-admin、revoke-admin、unmute、transfer-owner 需要 target。
- mute 需要 target 与 duration；时长只能是 10 分钟、1 小时、1 天、7 天、永久。
- leave 不需要 target，表示 actor 主动退出；群主必须先转让群主或解散。reinvite 的 target 必须是 __self__；dissolve 不需要 target。
- 群主和管理员权限、成员身份、禁言及群状态以本次资料的真实状态为准；成功后的群系统消息由系统自动生成。

7. 处理用户发出的待收款转账
<transfer conversation="会话引用" message="消息引用" actor="收款人人物引用" action="accept|reject" />

没有文本内容。只能处理本次实际可见、由用户发出、当前仍待收款且收款人正是 actor 的转账。

场景限制：
- 私聊回复：只能对当前 P1 发送私聊消息、处理转账，或使用 read；不允许 none、新建会话或群管理。
- 私聊主动：可向本次提供的 P1/P2……发送消息、处理转账、使用 read、新建私聊，或单独输出 none；不允许新建群聊或群管理。
- 群聊回复：只能对当前 G1 发送群消息、处理转账、执行群管理，或单独输出 none；不允许 read、新建私聊或新建群聊。
- 群聊主动：可向本次提供的 G1/G2……发送群消息、处理转账、执行群管理、新建群聊，或单独输出 none；不允许 read 或新建私聊。

同一批动作按出现顺序执行。新建会话必须排在使用该新引用的消息之前；任一标签、引用、权限、成员资格、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝，不会只保存其中一部分。`.trim();

const QQ_PRIVATE_REPLY_XML_PROTOCOL = String.raw`
【QQ 私聊回复 XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

本次只操作一个已有私聊：P1 是当前私聊会话，N1 是当前私聊人物。发送消息时 conversation 必须是 P1，sender 必须是 N1。只能使用本次实际提供的消息和表情引用，禁止猜造引用。

允许的动作只有：

1. 发送私聊消息
<message conversation="P1" sender="N1" type="类型" sticker="表情短编号" amount="金额" recipient="__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- 私聊消息不得添加 quote、mentions 或 all 属性。
- text 写真实 QQ 文字；voice 写角色实际说出的语音文字；image、video 写简短自然的画面描述，不提供 URL、时长或媒体地址。
- voice 正文可以放 FAS2 声音控制标签（英文方括号，例如 [happy]、[sad]、[angry]、[sigh]、[whispering]、[shouting]、[long pause]），放在它影响的词前面，每条语音最多 10 个；场景没有依据就不要加。
- sticker 只用于 sticker，且必须填写 {{可用表情}} 中真实存在的 S1、S2……短编号；正文写该表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填，recipient 只能是 __self__；正文写自然语言说明。
- 每种消息只使用上方列出的对应属性，不添加其他属性。

2. 处理用户发出的待收款转账
<transfer conversation="P1" message="M1" actor="N1" action="accept|reject" />

只能处理本次实际可见、由用户发出、仍待收款且收款人正是 N1 的转账。

3. 已读不回
<read conversation="P1" />

read 没有文本内容和其他属性，且不能与 message 或 transfer 同时出现。

只使用上述三类动作。任一动作、引用、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝。`.trim();

const QQ_PRIVATE_PROACTIVE_XML_PROTOCOL = String.raw`
【QQ 私聊主动 XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

本次资料中的 P1、P2……分别代表一个已有私聊，并同时作为该私聊人物的引用。向 Pi 发送消息时，conversation 和 sender 必须使用同一个 Pi。消息引用形如 P1-M1。只能使用本次实际提供的引用，禁止猜造或跨会话使用。

允许的动作只有：

1. 向已有私聊发送消息
<message conversation="P1" sender="P1" type="类型" sticker="表情短编号" amount="金额" recipient="__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- 私聊消息不得添加 quote、mentions 或 all 属性。
- text 写真实 QQ 文字；voice 写角色实际说出的语音文字；image、video 写简短自然的画面描述，不提供 URL、时长或媒体地址。
- voice 正文可以放 FAS2 声音控制标签（英文方括号，例如 [happy]、[sad]、[angry]、[sigh]、[whispering]、[shouting]、[long pause]），放在它影响的词前面，每条语音最多 10 个；场景没有依据就不要加。
- sticker 只用于 sticker，且必须填写 {{可用表情}} 中真实存在的 S1、S2……短编号；正文写该表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填，recipient 只能是 __self__；正文写自然语言说明。
- 每种消息只使用上方列出的对应属性，不添加其他属性。

2. 处理用户发出的待收款转账
<transfer conversation="P1" message="P1-M1" actor="P1" action="accept|reject" />

只能处理本次实际可见、由用户发出、仍待收款且收款人正是 actor 的转账；conversation、message 和 actor 必须属于同一个私聊。

3. 已读不回
<read conversation="P1" />

read 没有文本内容和其他属性；同一私聊使用 read 时，不要再为它发送消息或处理转账。

4. 新建私聊并发送首条消息
<create-private id="P新引用" name="人物名字" />

id 是本次新会话的临时引用，不能与已有引用重复。创建后必须在同一批 XML 中、紧随其后向该会话发送首条合法消息；首条消息的 conversation 和 sender 都使用这个 P新引用。

5. 本轮无动作
<none />

none 没有属性和文本内容，且必须是整个 <qq> 中唯一的动作。

只使用上述五类动作。同一批动作按出现顺序执行；任一动作、引用、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝。`.trim();

const QQ_GROUP_PROACTIVE_XML_PROTOCOL = `${QQ_XML_PROTOCOL}

新建群聊时，owner 只能填写 members 中的 N 人物引用，例如 N1；绝不能填写 __self__。当前用户会由系统自动加入新群，不需要写入 members，也不能作为 AI 新建群的群主。`;

/** 内置预设的文案在 prompt/ 下按场景组装；这里只负责注入各场景的输出协议。 */
const BUILT_IN_PROMPT_PRESETS = Object.freeze([
    ...createChatPromptPresets({
        privateReply: QQ_PRIVATE_REPLY_XML_PROTOCOL,
        privateProactive: QQ_PRIVATE_PROACTIVE_XML_PROTOCOL,
        groupReply: QQ_XML_PROTOCOL,
        groupProactive: QQ_GROUP_PROACTIVE_XML_PROTOCOL,
    }),
    createAssistantPromptPreset(QQ_PRIVATE_REPLY_XML_PROTOCOL),
]);

function resourceError(code, message) {
    const error = new Error(message);
    error.name = 'QQV2ResourceError';
    error.code = code;
    return error;
}

function clonePromptMessages(messages) {
    if (!Array.isArray(messages)) {
        throw resourceError('invalid_prompt_messages', 'Prompt preset messages must be an array');
    }

    return messages.map((block) => {
        const role = String(block?.role ?? '').trim();
        if (!PROMPT_MESSAGE_ROLES.has(role)) {
            throw resourceError('invalid_prompt_message_role', 'Prompt message role is not supported');
        }
        return {
            id: String(block?.id ?? ''),
            name: String(block?.name ?? ''),
            role,
            content: String(block?.content ?? ''),
        };
    });
}

function requireStorage(storage) {
    if (!storage
        || typeof storage.get !== 'function'
        || typeof storage.set !== 'function'
        || typeof storage.delete !== 'function') {
        throw new TypeError('QQ v2 resource service needs async get, set, and delete storage methods');
    }
    return storage;
}

function createId(cryptoApi) {
    if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeApiEndpoint(value) {
    try {
        return normalizeQQV2OpenAIBaseUrl(value);
    } catch (error) {
        throw resourceError('invalid_api_endpoint', error?.message || 'API 地址无效');
    }
}

function numberOrDefault(value, fallback) {
    return value === undefined ? fallback : Number(value);
}

function suppliedApiKey(input) {
    if (input?.apiKey === undefined || input?.apiKey === null) return null;
    const value = String(input.apiKey);
    return value.trim() ? value : null;
}

function publicApiPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        endpoint: record.endpoint,
        model: record.model,
        temperature: record.temperature,
        maxOutput: record.maxOutput,
        hasApiKey: record.hasApiKey,
    });
}

function publicPromptPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: Object.freeze(record.messages.map((block) => Object.freeze({ ...block }))),
    });
}

function clonePromptPreset(record) {
    return {
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: record.messages.map((block) => ({ ...block })),
    };
}

function cloneImageGenerationEntry(entry) {
    return {
        id: String(entry?.id ?? ''),
        name: String(entry?.name ?? ''),
        role: String(entry?.role ?? ''),
        content: String(entry?.content ?? ''),
        enabled: entry?.enabled !== false,
        triggerMode: String(entry?.triggerMode ?? 'always'),
        triggerWords: String(entry?.triggerWords ?? ''),
        andTriggerWords: String(entry?.andTriggerWords ?? ''),
    };
}

function publicImageGenerationPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        entries: Object.freeze(record.entries.map(entry => Object.freeze(cloneImageGenerationEntry(entry))),
        ),
    });
}

function cloneImageGenerationPreset(record) {
    return {
        id: String(record?.id ?? ''),
        name: String(record?.name ?? ''),
        entries: Array.isArray(record?.entries)
            ? record.entries.map(cloneImageGenerationEntry)
            : [],
    };
}

function validateImageGenerationPresetSource(source) {
    if (!source
        || typeof source !== 'object'
        || Array.isArray(source)
        || Object.getPrototypeOf(source) !== Object.prototype) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入必须是 st-chatu8 顶层预设对象',
        );
    }

    const names = Object.keys(source);
    if (names.length === 0) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入至少需要一份预设',
        );
    }

    return names.map((name) => {
        const preset = source[name];
        const normalizedName = String(name ?? '').trim();
        if (!normalizedName || normalizedName === '__proto__'
            || normalizedName === 'constructor' || normalizedName === 'prototype'
            || !preset || typeof preset !== 'object'
            || Array.isArray(preset)
            || Object.getPrototypeOf(preset) !== Object.prototype
            || !Array.isArray(preset.entries)
            || Object.keys(preset).some(key => !IMAGE_GENERATION_PRESET_KEYS.has(key))) {
            throw resourceError(
                'invalid_image_generation_preset_import',
                '生图预设必须包含合法的 entries 数组',
            );
        }

        const entries = preset.entries.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块必须是对象',
                );
            }
            if (Object.getPrototypeOf(entry) !== Object.prototype
                || Object.keys(entry).some(key => !IMAGE_GENERATION_ENTRY_KEYS.has(key))) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块包含未知字段',
                );
            }
            const role = String(entry.role ?? '').trim();
            if (!PROMPT_MESSAGE_ROLES.has(role)
                || typeof entry.content !== 'string'
                || (entry.id !== undefined && typeof entry.id !== 'string')
                || (entry.name !== undefined && typeof entry.name !== 'string')
                || (entry.triggerMode !== undefined && typeof entry.triggerMode !== 'string')
                || (entry.triggerWords !== undefined && typeof entry.triggerWords !== 'string')
                || (entry.andTriggerWords !== undefined && typeof entry.andTriggerWords !== 'string')) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 role 或 content 无效',
                );
            }
            if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 enabled 必须是布尔值',
                );
            }
            return {
                id: String(entry.id ?? ''),
                name: String(entry.name ?? ''),
                role,
                content: entry.content,
                enabled: entry.enabled !== false,
                triggerMode: String(entry.triggerMode ?? 'always'),
                triggerWords: String(entry.triggerWords ?? ''),
                andTriggerWords: String(entry.andTriggerWords ?? ''),
            };
        });

        return { name: normalizedName, entries };
    });
}

function nextImageGenerationPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported image preset';
    const usedNames = new Set(presets.map(preset => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function nextPromptPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported preset';
    const usedNames = new Set(presets.map((preset) => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function uniquePromptPresetName(value, presets, ignoredId = '') {
    const name = String(value ?? '').trim();
    if (!name) {
        throw resourceError('prompt_preset_name_required', 'AI 指令预设名称不能为空');
    }
    const conflict = presets.some((preset) => (
        preset.id !== ignoredId
        && String(preset.name ?? '').trim() === name
    ));
    const reservedConflict = BUILT_IN_PROMPT_PRESETS.some((preset) => (
        preset.id !== ignoredId
        && preset.name === name
    ));
    if (conflict || reservedConflict) {
        throw resourceError('prompt_preset_name_conflict', '已经存在同名 AI 指令预设');
    }
    return name;
}

function publicSticker(record) {
    return Object.freeze({
        id: record.id,
        description: record.description,
        mimeType: record.mimeType,
        size: record.size,
        order: record.order,
    });
}

function isBlob(value) {
    return typeof globalThis.Blob === 'function' && value instanceof globalThis.Blob;
}

function orderedStickers(stickers) {
    return [...stickers].sort((left, right) => left.order - right.order);
}

/**
 * Extension-wide QQ v2 resources. Storage is intentionally injected so the
 * future IndexedDB adapter stays outside this domain service.
 */
export function createQQV2ResourceService(options = {}) {
    const storage = requireStorage(options.storage);
    const readMedia = typeof options.readMedia === 'function'
        ? options.readMedia
        : async () => null;
    const cryptoApi = options.cryptoApi ?? globalThis.crypto;
    const apiKeys = createQQV2ApiKeyStore({ storage, cryptoApi });

    const readApiState = async () => {
        const stored = await storage.get(API_PRESETS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.presets)
            ? { presets: [...stored.presets] }
            : { presets: [] };
    };

    const readVoiceApiKey = async () => {
        try {
            return await apiKeys.get(QQ_VOICE_API_KEY_ID);
        } catch (error) {
            // A missing key is a normal state, not a broken account setting.
            if (error?.code === 'api_key_reentry_required') return '';
            throw error;
        }
    };

    const readPromptState = async () => {
        const stored = await storage.get(PROMPT_PRESETS_STORAGE_KEY);
        if (stored && typeof stored === 'object' && Array.isArray(stored.presets)) {
            return { presets: stored.presets.map(clonePromptPreset) };
        }
        return { presets: BUILT_IN_PROMPT_PRESETS.map(clonePromptPreset) };
    };

    const readStickerState = async () => {
        const stored = await storage.get(STICKERS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.stickers)
            ? { stickers: stored.stickers.map((sticker) => ({ ...sticker })) }
            : { stickers: [] };
    };

    const deleteStickerRecords = async (ids) => {
        if (!Array.isArray(ids)) {
            throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
        }
        const requestedIds = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (requestedIds.length === 0) return { deletedStickerIds: [] };

        const state = await readStickerState();
        const existingIds = new Set(state.stickers.map((sticker) => sticker.id));
        const deletedStickerIds = requestedIds.filter((id) => existingIds.has(id));
        if (deletedStickerIds.length === 0) return { deletedStickerIds };

        const deleted = new Set(deletedStickerIds);
        state.stickers = orderedStickers(state.stickers.filter((sticker) => !deleted.has(sticker.id)))
            .map((sticker, order) => ({ ...sticker, order }));
        await storage.set(STICKERS_STORAGE_KEY, state);
        return { deletedStickerIds };
    };

    const readImageGenerationPresetState = async () => {
        const stored = await storage.get(IMAGE_GENERATION_PRESETS_STORAGE_KEY);
        if (!stored || typeof stored !== 'object' || !Array.isArray(stored.presets)) {
            return { presets: [] };
        }
        return {
            presets: stored.presets
                .filter(preset => preset && typeof preset === 'object')
                .map(cloneImageGenerationPreset),
        };
    };

    const saveStickerIntoState = (input, state) => {
        const requestedId = String(input?.id ?? '').trim();
        const existingIndex = requestedId
            ? state.stickers.findIndex((sticker) => sticker.id === requestedId)
            : -1;
        if (requestedId && existingIndex === -1) {
            throw resourceError('sticker_not_found', 'Sticker does not exist');
        }

        const existing = existingIndex === -1 ? null : state.stickers[existingIndex];
        const description = String(input?.description ?? existing?.description ?? '').trim();
        if (!description) {
            throw resourceError('sticker_description_required', 'Sticker description is required');
        }
        const blob = isBlob(input?.blob) ? input.blob : null;
        if (!blob && !existing?.mediaKey && !isBlob(existing?.blob)) {
            throw resourceError('invalid_sticker_blob', 'Sticker must contain a Blob');
        }
        const storedBlob = blob || (isBlob(existing?.blob) ? existing.blob : null);

        const record = {
            id: existing?.id ?? createId(cryptoApi),
            description,
            mimeType: storedBlob?.type || existing?.mimeType || '',
            size: Math.max(0, Number(storedBlob?.size ?? existing?.size) || 0),
            order: existing?.order ?? state.stickers.length,
            ...(existing?.mediaKey ? { mediaKey: existing.mediaKey } : {}),
            ...(storedBlob ? { blob: storedBlob } : {}),
        };
        if (existingIndex === -1) {
            state.stickers.push(record);
        } else {
            state.stickers[existingIndex] = record;
        }
        return record;
    };

    return Object.freeze({
        async listStickers() {
            const state = await readStickerState();
            return Object.freeze(orderedStickers(state.stickers).map(publicSticker));
        },
        async saveSticker(input) {
            const state = await readStickerState();
            const record = saveStickerIntoState(input, state);
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(record);
        },
        async saveStickers(inputs) {
            if (!Array.isArray(inputs)) {
                throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
            }

            const state = await readStickerState();
            const records = inputs.map((input) => saveStickerIntoState(input, state));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return Object.freeze(records.map(publicSticker));
        },
        async getStickerBlob(id) {
            const state = await readStickerState();
            const sticker = state.stickers.find((item) => item.id === id);
            if (!sticker) return null;
            if (isBlob(sticker.blob)) return sticker.blob;
            return readMedia(sticker.mediaKey);
        },
        async moveSticker(id, targetIndex) {
            const state = await readStickerState();
            const stickers = orderedStickers(state.stickers);
            const sourceIndex = stickers.findIndex((sticker) => sticker.id === id);
            if (sourceIndex === -1) return null;
            if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= stickers.length) {
                throw resourceError('invalid_sticker_order', 'Sticker target order is out of range');
            }

            const [moved] = stickers.splice(sourceIndex, 1);
            stickers.splice(targetIndex, 0, moved);
            state.stickers = stickers.map((sticker, order) => ({ ...sticker, order }));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(state.stickers[targetIndex]);
        },
        async deleteSticker(id) {
            const { deletedStickerIds } = await deleteStickerRecords([id]);
            return deletedStickerIds.length > 0;
        },
        async deleteStickers(ids) {
            return deleteStickerRecords(ids);
        },
        async listPromptPresets() {
            const state = await readPromptState();
            return Object.freeze(state.presets.map(publicPromptPreset));
        },
        async getPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async savePromptPreset(input) {
            const state = await readPromptState();
            const requestedId = String(input?.id ?? '').trim();
            const index = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && index === -1) {
                throw resourceError('prompt_preset_not_found', 'Prompt preset does not exist');
            }

            const existing = index === -1 ? null : state.presets[index];
            const name = uniquePromptPresetName(
                input?.name ?? existing?.name,
                state.presets,
                existing?.id,
            );
            const messages = Array.isArray(input?.messages)
                ? clonePromptMessages(input.messages)
                : existing?.messages.map((block) => ({ ...block })) ?? [];
            const record = {
                id: existing?.id ?? createId(cryptoApi),
                name,
                isBuiltIn: existing?.isBuiltIn ?? false,
                messages,
            };
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreBuiltInPromptPreset(id) {
            const factoryPreset = BUILT_IN_PROMPT_PRESETS.find((preset) => preset.id === id);
            if (!factoryPreset) {
                throw resourceError('built_in_prompt_preset_not_found', 'Built-in prompt preset does not exist');
            }

            const state = await readPromptState();
            uniquePromptPresetName(factoryPreset.name, state.presets, id);
            const record = clonePromptPreset(factoryPreset);
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreAllBuiltInPromptPresets() {
            const state = await readPromptState();
            const customPresets = state.presets.filter((preset) => !preset.isBuiltIn);
            const restoredPresets = BUILT_IN_PROMPT_PRESETS.map(clonePromptPreset);
            restoredPresets.forEach((preset) => uniquePromptPresetName(preset.name, customPresets, preset.id));
            state.presets = [...restoredPresets, ...customPresets];
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(restoredPresets.map(publicPromptPreset));
        },
        async importPromptPresets(source) {
            const importedSource = Array.isArray(source)
                ? source
                : Array.isArray(source?.presets) ? source.presets : null;
            if (!importedSource) {
                throw resourceError('invalid_prompt_import', 'Prompt preset import must contain presets');
            }

            const state = await readPromptState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextPromptPresetCopyName(preset?.name, state.presets),
                    isBuiltIn: false,
                    messages: Array.isArray(preset?.messages)
                        ? clonePromptMessages(preset.messages)
                        : [],
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicPromptPreset));
        },
        async exportPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async exportAllPromptPresets() {
            const state = await readPromptState();
            return Object.freeze(state.presets.map(publicPromptPreset));
        },
        async deletePromptPreset(id) {
            const state = await readPromptState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;
            if (state.presets[index].isBuiltIn) {
                throw resourceError('built_in_prompt_preset', 'Built-in prompt presets cannot be deleted');
            }

            state.presets.splice(index, 1);
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listImageGenerationPresets() {
            const state = await readImageGenerationPresetState();
            return Object.freeze(state.presets.map(publicImageGenerationPreset));
        },
        async getImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            return record ? publicImageGenerationPreset(record) : null;
        },
        async importImageGenerationPresets(source) {
            const importedSource = validateImageGenerationPresetSource(source);
            const state = await readImageGenerationPresetState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextImageGenerationPresetCopyName(preset.name, state.presets),
                    entries: preset.entries.map(cloneImageGenerationEntry),
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicImageGenerationPreset));
        },
        async exportImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            if (!record) return null;
            return {
                [record.name]: {
                    entries: record.entries.map(cloneImageGenerationEntry),
                },
            };
        },
        async deleteImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return false;
            const state = await readImageGenerationPresetState();
            const index = state.presets.findIndex(preset => preset.id === normalizedId);
            if (index === -1) return false;
            state.presets.splice(index, 1);
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listApiPresets() {
            const state = await readApiState();
            return Object.freeze(state.presets.map(publicApiPreset));
        },
        async saveApiPreset(input) {
            const state = await readApiState();
            const requestedId = String(input?.id ?? '').trim();
            const existingIndex = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && existingIndex === -1) {
                throw resourceError('api_preset_not_found', 'API preset does not exist');
            }

            const existing = existingIndex === -1 ? null : state.presets[existingIndex];
            const apiKey = suppliedApiKey(input);
            const id = existing?.id ?? createId(cryptoApi);
            const record = {
                id,
                name: String(input?.name ?? existing?.name ?? ''),
                endpoint: normalizeApiEndpoint(input?.endpoint ?? existing?.endpoint),
                model: String(input?.model ?? existing?.model ?? ''),
                temperature: numberOrDefault(input?.temperature, existing?.temperature ?? 1),
                maxOutput: numberOrDefault(input?.maxOutput, existing?.maxOutput ?? 4096),
                hasApiKey: apiKey !== null ? true : Boolean(existing?.hasApiKey),
                ...(apiKey === null && existing?.iv && existing?.ciphertext
                    ? { iv: existing.iv, ciphertext: existing.ciphertext }
                    : {}),
            };
            if (apiKey !== null) await apiKeys.set(id, apiKey);
            if (existingIndex === -1) {
                state.presets.push(record);
            } else {
                state.presets[existingIndex] = record;
            }
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            return publicApiPreset(record);
        },
        async getApiPreset(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicApiPreset(record) : null;
        },
        async getApiPresetForRequest(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            if (!record) return null;
            if (!record.hasApiKey) {
                return Object.freeze({
                    ...publicApiPreset(record),
                    apiKey: '',
                });
            }

            const apiKey = await apiKeys.get(record.id, record);
            if (record.iv || record.ciphertext) {
                delete record.iv;
                delete record.ciphertext;
                await storage.set(API_PRESETS_STORAGE_KEY, state);
            }
            return Object.freeze({
                ...publicApiPreset(record),
                apiKey,
            });
        },
        async deleteApiPreset(id) {
            const state = await readApiState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;

            state.presets.splice(index, 1);
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            await apiKeys.delete(id);
            return true;
        },
        /**
         * The voice API key never enters a preset record or an exportable
         * settings blob; it lives beside the API preset secrets.
         */
        async getVoiceApiKey() {
            return readVoiceApiKey();
        },
        async hasVoiceApiKey() {
            return Boolean(await readVoiceApiKey());
        },
        async setVoiceApiKey(apiKey) {
            const value = String(apiKey ?? '').trim();
            if (!value) {
                await apiKeys.delete(QQ_VOICE_API_KEY_ID);
                return false;
            }
            await apiKeys.set(QQ_VOICE_API_KEY_ID, value);
            return true;
        },
        async listVoiceEntries() {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            return Object.freeze(library.entries.map((entry) => Object.freeze({ ...entry })));
        },
        async saveVoiceEntry(input = {}) {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const entry = normalizeQQVoiceEntry(input);
            if (!entry) throw resourceError('voice_entry_invalid', '音色 ID 不能为空');
            const requestedId = String(input?.entryId ?? '').trim();
            const index = requestedId ? library.entries.findIndex((item) => item.entryId === requestedId) : -1;
            if (requestedId && index === -1) throw resourceError('voice_entry_not_found', '音色不存在');
            const duplicate = library.entries.findIndex((item) => item.voiceId === entry.voiceId && item.entryId !== requestedId);
            if (duplicate !== -1) {
                library.entries[duplicate] = { ...library.entries[duplicate], name: entry.name, category: entry.category, note: entry.note };
                await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, library);
                return Object.freeze({ ...library.entries[duplicate] });
            }
            if (index === -1) library.entries.push(entry);
            else library.entries[index] = { ...entry, entryId: library.entries[index].entryId };
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, library);
            return Object.freeze({ ...(index === -1 ? entry : library.entries[index]) });
        },
        async deleteVoiceEntry(entryId) {
            const id = String(entryId ?? '').trim();
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const next = library.entries.filter((entry) => entry.entryId !== id);
            if (next.length === library.entries.length) return false;
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, { entries: next });
            return true;
        },
        async mergeVoiceEntries(entries) {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const merged = mergeQQVoiceLibrary(library, entries);
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, { entries: merged.entries });
            return Object.freeze({
                entries: Object.freeze(merged.entries.map((entry) => Object.freeze({ ...entry }))),
                added: merged.added,
                updated: merged.updated,
            });
        },
        async listVoiceRoles() {
            const state = normalizeQQVoiceRoles(await storage.get(VOICE_ROLES_STORAGE_KEY));
            return Object.freeze(state.roles.map((role) => Object.freeze({ ...role })));
        },
        async getVoiceRole(name) {
            const state = normalizeQQVoiceRoles(await storage.get(VOICE_ROLES_STORAGE_KEY));
            const role = findQQVoiceRole(state, name);
            return role ? Object.freeze({ ...role }) : null;
        },
        /** 空 voiceId 视为解除该角色的绑定。 */
        async saveVoiceRole(input = {}) {
            const name = String(input?.name ?? '').trim();
            if (!name) throw resourceError('voice_role_name_required', '角色名不能为空');
            const state = normalizeQQVoiceRoles(await storage.get(VOICE_ROLES_STORAGE_KEY));
            const key = name.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
            const roles = state.roles.filter((role) => role.name.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase() !== key);
            const voiceId = String(input?.voiceId ?? '').trim().slice(0, 256);
            if (voiceId) roles.push({ name, voiceId });
            await storage.set(VOICE_ROLES_STORAGE_KEY, { roles });
            return Object.freeze({ name, voiceId });
        },
        async mergeVoiceRoles(roles) {
            const state = normalizeQQVoiceRoles(await storage.get(VOICE_ROLES_STORAGE_KEY));
            const merged = mergeQQVoiceRoles(state, roles);
            await storage.set(VOICE_ROLES_STORAGE_KEY, { roles: merged.roles });
            return Object.freeze({
                roles: Object.freeze(merged.roles.map((role) => Object.freeze({ ...role }))),
                added: merged.added,
                updated: merged.updated,
            });
        },
    });
}
