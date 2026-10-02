/**
 * QQ 音色库：名称 → 音色 ID 的本地清单，外加「一键导入」用的解析器。
 * 解析器同时认识 QQ 自己的配置包和 FISH 对话音声导出的音色库 / 音声预设，
 * 这样从 FISH 迁过来的用户不需要手抄音色 ID。
 */
export const QQ_VOICE_LIBRARY_STORAGE_KEY = 'qq-v2.resources.voice-library';
export const QQ_VOICE_PACK_TYPE = 'yuzi_qq_voice_pack';
export const QQ_VOICE_PACK_VERSION = 1;

export const QQ_VOICE_CATEGORIES = Object.freeze({ zh: '中文', ja: '日语', en: '英语' });
export const QQ_VOICE_CATEGORY_KEYS = Object.freeze(Object.keys(QQ_VOICE_CATEGORIES));

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function createId() {
    return typeof globalThis.crypto?.randomUUID === 'function'
        ? `voice-entry-${globalThis.crypto.randomUUID()}`
        : `voice-entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** 与 FISH 一致的说话人归一化：全角/半角、大小写与空白都不影响匹配。 */
export function normalizeQQVoiceSpeakerName(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u00A0\u200B-\u200F\uFEFF]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase();
}

/** 一条音色库记录：名称 + 音色 ID，分类与备注可选。 */
export function normalizeQQVoiceEntry(value) {
    const source = asObject(value);
    const voiceId = asText(source.voiceId ?? source.id, 256);
    const name = asText(source.name, 120);
    if (!voiceId) return null;
    const category = QQ_VOICE_CATEGORY_KEYS.includes(asText(source.category, 8))
        ? asText(source.category, 8)
        : '';
    return {
        entryId: asText(source.entryId, 256) || createId(),
        name: name || voiceId,
        voiceId,
        category,
        note: asText(source.note ?? source.sub, 120),
    };
}

export function normalizeQQVoiceLibrary(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const raw = Array.isArray(value) ? value : asArray(source.entries);
    const seen = new Set();
    const entries = [];
    raw.forEach((item) => {
        const entry = normalizeQQVoiceEntry(item);
        if (!entry || seen.has(entry.voiceId)) return;
        seen.add(entry.voiceId);
        entries.push(entry);
    });
    return { entries };
}

/** 合并导入：同音色 ID 覆盖名称/分类，其余追加。 */
export function mergeQQVoiceLibrary(current, incoming) {
    const base = normalizeQQVoiceLibrary(current);
    const entries = base.entries.map((entry) => ({ ...entry }));
    const byVoiceId = new Map(entries.map((entry) => [entry.voiceId, entry]));
    let added = 0;
    let updated = 0;
    normalizeQQVoiceLibrary({ entries: incoming }).entries.forEach((entry) => {
        const existing = byVoiceId.get(entry.voiceId);
        if (!existing) {
            byVoiceId.set(entry.voiceId, entry);
            entries.push(entry);
            added += 1;
            return;
        }
        existing.name = entry.name;
        existing.category = entry.category;
        existing.note = entry.note;
        updated += 1;
    });
    return { entries, added, updated };
}

/** 角色音色：按角色名（归一化后）记住一个音色，跨聊天生效。 */
export function normalizeQQVoiceRole(value) {
    const source = asObject(value);
    const name = asText(source.name, 120);
    const voiceId = asText(source.voiceId, 256);
    if (!name || !voiceId) return null;
    return { name, voiceId };
}

export function normalizeQQVoiceRoles(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const raw = Array.isArray(value) ? value : asArray(source.roles);
    const byName = new Map();
    raw.forEach((item) => {
        const role = normalizeQQVoiceRole(item);
        if (!role) return;
        byName.set(normalizeQQVoiceSpeakerName(role.name), role);
    });
    return { roles: [...byName.values()] };
}

export function findQQVoiceRole(roles, name) {
    const key = normalizeQQVoiceSpeakerName(name);
    if (!key) return null;
    return normalizeQQVoiceRoles(roles).roles
        .find((role) => normalizeQQVoiceSpeakerName(role.name) === key) || null;
}

export function mergeQQVoiceRoles(current, incoming) {
    const base = normalizeQQVoiceRoles(current);
    const byName = new Map(base.roles.map((role) => [normalizeQQVoiceSpeakerName(role.name), { ...role }]));
    const roles = [...byName.values()];
    let added = 0;
    let updated = 0;
    normalizeQQVoiceRoles({ roles: incoming }).roles.forEach((role) => {
        const key = normalizeQQVoiceSpeakerName(role.name);
        const existing = byName.get(key);
        if (!existing) {
            byName.set(key, role);
            roles.push(role);
            added += 1;
            return;
        }
        existing.voiceId = role.voiceId;
        existing.name = role.name;
        updated += 1;
    });
    return { roles, added, updated };
}

/** FISH 的角色绑定支持字符串、`{default, forms}` 与按语言的对象。 */
export function flattenFishVoiceBindings(voices) {
    const source = asObject(voices);
    const bindings = [];
    Object.entries(source).forEach(([name, value]) => {
        const speaker = asText(name, 120);
        if (!speaker) return;
        if (typeof value === 'string') {
            const voiceId = asText(value, 256);
            if (voiceId) bindings.push({ name: speaker, voiceId });
            return;
        }
        const row = asObject(value);
        Object.entries(asObject(row.forms)).forEach(([form, formValue]) => {
            const voiceId = asText(typeof formValue === 'string' ? formValue : formValue?.voice, 256);
            if (voiceId) bindings.push({ name: `${speaker}(${asText(form, 60)})`, voiceId });
        });
        const fallback = asText(row.default, 256)
            || asText(row.zh, 256)
            || asText(row.ja, 256)
            || asText(row.en, 256);
        if (fallback) bindings.push({ name: speaker, voiceId: fallback });
    });
    return bindings;
}

function entriesFromFishLibrary(voices) {
    return asArray(voices).map((entry) => normalizeQQVoiceEntry({
        voiceId: entry?.id,
        name: entry?.name,
        category: entry?.category,
        note: entry?.sub,
    })).filter(Boolean);
}

function bindingsFromFishPresets(presets) {
    return Object.values(asObject(presets)).flatMap((preset) => flattenFishVoiceBindings(asObject(preset).voices));
}

function settingsFromVoiceConfig(config) {
    const source = asObject(config);
    const voice = asObject(source.voice);
    const settings = {};
    if (asText(source.baseUrl, 2048)) settings.baseUrl = asText(source.baseUrl, 2048);
    if (asText(source.model, 120)) settings.model = asText(source.model, 120);
    if (asText(voice.baseUrl, 2048)) settings.baseUrl = asText(voice.baseUrl, 2048);
    if (asText(voice.model, 120)) settings.model = asText(voice.model, 120);
    if (asText(voice.defaultVoiceId, 256)) settings.defaultVoiceId = asText(voice.defaultVoiceId, 256);
    if (typeof voice.enabled === 'boolean') settings.enabled = voice.enabled;
    if (typeof voice.speakSelf === 'boolean') settings.speakSelf = voice.speakSelf;
    if (typeof voice.emotionTags === 'boolean') settings.emotionTags = voice.emotionTags;
    if (typeof voice.directFetch === 'boolean') settings.directFetch = voice.directFetch;
    return settings;
}

/**
 * 识别一份导入来源。支持 QQ 配置包、FISH 音色库导出、FISH 音声预设导出
 * （单条或全部）、裸音色数组，以及 FISH 扩展设置对象本身。
 */
export function parseQQVoiceImportSource(value) {
    const source = value && typeof value === 'object' ? value : null;
    const empty = { format: '', entries: [], bindings: [], settings: {} };
    if (!source) return empty;

    if (Array.isArray(source)) {
        return { ...empty, format: 'entries', entries: normalizeQQVoiceLibrary({ entries: source }).entries };
    }

    const type = asText(source.type, 64);
    if (type === QQ_VOICE_PACK_TYPE) {
        const library = normalizeQQVoiceLibrary(source.library ?? source.entries);
        return {
            format: 'qq-pack',
            entries: library.entries,
            bindings: asArray(source.bindings)
                .map((binding) => ({
                    name: asText(binding?.name, 120),
                    voiceId: asText(binding?.voiceId, 256),
                }))
                .filter((binding) => binding.name && binding.voiceId),
            settings: settingsFromVoiceConfig({ voice: source.settings, baseUrl: source.settings?.baseUrl, model: source.settings?.model }),
        };
    }

    if (type === 'fish_dialogue_voice_library') {
        return { ...empty, format: 'fish-library', entries: entriesFromFishLibrary(source.voices) };
    }
    if (type === 'fish_dialogue_voice_preset') {
        return {
            format: 'fish-preset',
            entries: [],
            bindings: flattenFishVoiceBindings(source.voices),
            settings: asText(source.defaultVoice, 256) ? { defaultVoiceId: asText(source.defaultVoice, 256) } : {},
        };
    }

    // FISH 扩展设置对象：voiceLibrary + voices + baseUrl/model。
    if (Object.hasOwn(source, 'voiceLibrary') || Object.hasOwn(source, 'voices')) {
        return {
            format: 'fish-settings',
            entries: entriesFromFishLibrary(source.voiceLibrary),
            bindings: flattenFishVoiceBindings(source.voices),
            settings: settingsFromVoiceConfig({
                baseUrl: source.baseUrl,
                model: source.model,
                voice: { defaultVoiceId: source.defaultVoice, emotionTags: source.emotionTags, directFetch: source.directFetch },
            }),
        };
    }

    // FISH 全部音声预设导出。
    const presets = asObject(source.presets);
    if (Object.keys(presets).length > 0) {
        const first = asObject(Object.values(presets)[0]);
        return {
            format: 'fish-presets',
            entries: [],
            bindings: bindingsFromFishPresets(presets),
            settings: asText(first.defaultVoice, 256) ? { defaultVoiceId: asText(first.defaultVoice, 256) } : {},
        };
    }

    const library = normalizeQQVoiceLibrary(source.voiceLibrary ?? source.library ?? source.entries);
    if (library.entries.length > 0) {
        return { ...empty, format: 'library', entries: library.entries };
    }
    return empty;
}
