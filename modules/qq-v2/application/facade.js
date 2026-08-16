function asText(value, maxLength = 1024) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function exactContactName(value) {
    const name = String(value ?? '').slice(0, 120);
    return name.trim() ? name : '';
}

function cloneContext(context) {
    const source = asObject(context);
    const user = asObject(source.user);
    return Object.freeze({
        scopeId: asText(source.scopeId, 512),
        user: Object.freeze({
            name: asText(user.name, 256),
            avatar: asText(user.avatar, 1024),
        }),
        storyTime: asText(source.storyTime, 128),
    });
}

function cloneGlobalSettings(settings) {
    const source = asObject(settings);
    return Object.freeze({
        activeApiPresetId: asText(source.activeApiPresetId, 256),
        privateReplyPresetId: asText(source.privateReplyPresetId, 256),
        privateProactivePresetId: asText(source.privateProactivePresetId, 256),
        hostContextTurns: Number.isInteger(Number(source.hostContextTurns)) ? Number(source.hostContextTurns) : 3,
        conversationHistoryLimit: Number.isInteger(Number(source.conversationHistoryLimit))
            ? Number(source.conversationHistoryLimit)
            : 100,
        worldbook: cloneWorldbookSettings(source.worldbook),
        proactive: cloneProactiveSettings(source.proactive),
    });
}

function cloneWorldbookSettings(settings) {
    const source = asObject(settings);
    const timeWindow = asObject(source.timeWindow);
    const all = timeWindow.mode === 'all';
    return Object.freeze({
        enabled: source.enabled === true,
        bookName: asText(source.bookName, 256),
        timeWindow: Object.freeze(all
            ? { mode: 'all' }
            : {
                mode: 'relative',
                value: Number.isInteger(Number(timeWindow.value)) && Number(timeWindow.value) > 0
                    ? Number(timeWindow.value)
                    : 1,
                unit: ['hour', 'day', 'month', 'year'].includes(timeWindow.unit) ? timeWindow.unit : 'month',
            }),
        light: source.light === 'green' ? 'green' : 'blue',
        depth: Number.isInteger(Number(source.depth)) ? Number(source.depth) : 999,
        keywords: Object.freeze(asArray(source.keywords).map((item) => asText(item, 160)).filter(Boolean)),
    });
}

function cloneProactiveSettings(settings) {
    const source = asObject(settings);
    const everyTurns = Number(source.everyTurns);
    return Object.freeze({
        enabled: source.enabled === true,
        everyTurns: Number.isInteger(everyTurns) && everyTurns > 0 ? everyTurns : 5,
    });
}

function unavailable(capability) {
    return Object.freeze({
        ok: false,
        status: 'unavailable',
        reason: 'capability-unavailable',
        capability,
    });
}

function disabled(capability) {
    return Object.freeze({
        ok: false,
        status: 'disabled',
        reason: 'private-only',
        capability,
    });
}

function groupsAreDisabled() {
    return true;
}

function failed(error) {
    if (error?.code === 'private_only') return disabled('group');
    return Object.freeze({
        ok: false,
        status: 'failed',
        error: Object.freeze({
            code: asText(error?.code, 128) || 'runtime-failed',
            message: asText(error?.message, 1000) || 'QQ runtime request failed',
        }),
    });
}

function cloneApiPreset(preset) {
    const source = asObject(preset);
    return Object.freeze({
        presetId: asText(source.presetId || source.id, 256),
        name: asText(source.name, 256),
        endpoint: asText(source.endpoint || source.baseUrl, 2048),
        model: asText(source.model, 256),
        temperature: asNumber(source.temperature, 1),
        maxOutput: asNumber(source.maxOutput ?? source.maxTokens, 4096),
        hasApiKey: source.hasApiKey === true,
    });
}

function cloneModelLoadDraft(draft) {
    const source = asObject(draft);
    return Object.freeze({
        endpoint: asText(source.endpoint, 2048),
        apiKey: asText(source.apiKey, 8192),
        model: asText(source.model, 240),
        temperature: asNumber(source.temperature, 1),
        maxOutput: asNumber(source.maxOutput, 4096),
    });
}

function clonePromptMessage(message) {
    const source = asObject(message);
    return Object.freeze({
        id: asText(source.id, 256),
        name: asText(source.name, 256),
        role: asText(source.role, 32),
        content: String(source.content ?? ''),
    });
}

function clonePromptPreset(preset) {
    const source = asObject(preset);
    return Object.freeze({
        presetId: asText(source.presetId || source.id, 256),
        name: asText(source.name, 256),
        isBuiltIn: source.isBuiltIn === true,
        messages: Object.freeze(asArray(source.messages).map(clonePromptMessage)),
    });
}

function cloneSticker(sticker) {
    const source = asObject(sticker);
    return Object.freeze({
        stickerId: asText(source.stickerId || source.id, 256),
        description: asText(source.description, 4000),
        mimeType: asText(source.mimeType, 128),
        size: asNumber(source.size),
        order: asNumber(source.order),
    });
}

function cloneInjection(injection) {
    const source = asObject(injection);
    const projection = asObject(source.projection);
    const entryUid = projection.entryUid;
    const hasExplicitOverrides = Object.hasOwn(source, 'useConversationLight') || Object.hasOwn(source, 'useConversationDepth');
    const useConversationLight = source.useConversationLight === true || (!hasExplicitOverrides && source.followGlobal === false);
    const useConversationDepth = source.useConversationDepth === true || (!hasExplicitOverrides && source.followGlobal === false);
    return Object.freeze({
        enabled: source.enabled === true,
        followGlobal: !(useConversationLight || useConversationDepth),
        useConversationLight,
        useConversationDepth,
        light: source.light === 'green' ? 'green' : 'blue',
        depth: Number.isInteger(Number(source.depth)) ? Number(source.depth) : 999,
        keywords: Object.freeze(asArray(source.keywords).map((item) => asText(item, 160)).filter(Boolean)),
        selectedMessageIds: Object.freeze(asArray(source.selectedMessageIds).map((item) => asText(item, 256)).filter(Boolean)),
        projection: Object.freeze({
            bookName: asText(projection.bookName, 256),
            entryUid: entryUid === undefined ? null : entryUid,
            pending: projection.pending === true,
        }),
    });
}

function cloneRequestState(request) {
    const source = asObject(request);
    const phase = asText(source.phase, 32);
    return Object.freeze({
        phase: phase || 'idle',
        pendingUserMessageCount: Math.max(0, Math.trunc(asNumber(source.pendingUserMessageCount))),
        error: asText(source.error, 1000),
    });
}

function cloneMessagePreview(message) {
    if (!message || typeof message !== 'object') return null;
    const source = asObject(message);
    return Object.freeze({
        messageId: asText(source.messageId || source.id, 256),
        type: asText(source.type, 32),
        content: String(source.content ?? ''),
        senderId: asText(source.senderId, 256),
        senderType: asText(source.senderType, 32),
        storyTime: asText(source.storyTime, 128),
    });
}

function cloneGroup(group) {
    if (!group || typeof group !== 'object') return null;
    const source = asObject(group);
    const mutes = asObject(source.mutes);
    return Object.freeze({
        groupId: asText(source.groupId || source.id, 256),
        name: asText(source.name, 256),
        status: asText(source.status, 32) || 'active',
        ownerId: asText(source.ownerId, 256),
        adminIds: Object.freeze(asArray(source.adminIds).map((item) => asText(item, 256)).filter(Boolean)),
        memberIds: Object.freeze(asArray(source.memberIds).map((item) => asText(item, 256)).filter(Boolean)),
        selfRole: asText(source.selfRole, 32) || 'member',
        selfExited: source.selfExited === true,
        selfMuted: source.selfMuted === true || Boolean(mutes.__self__),
    });
}

function cloneConversation(conversation) {
    const source = asObject(conversation);
    const kind = source.kind === 'group' ? 'group' : 'private';
    const person = asObject(source.person);
    const group = cloneGroup(source.group);
    const status = asText(source.status, 32) || 'active';
    const muted = kind === 'group' && group?.selfMuted === true;
    const readOnly = status !== 'active'
        || (kind === 'group' && (group?.status !== 'active' || group?.selfExited === true));
    return Object.freeze({
        conversationId: asText(source.conversationId || source.id, 256),
        kind,
        status,
        formalName: kind === 'private' ? asText(source.formalName || person.formalName, 256) : '',
        title: asText(source.title || (kind === 'group' ? group?.name : source.remark || person.formalName), 256),
        personId: kind === 'private' ? asText(source.personId || person.personId, 256) : '',
        groupId: kind === 'group' ? asText(source.groupId || group?.groupId, 256) : '',
        avatarAssetId: asText(source.avatarAssetId || person.avatarAssetId, 256),
        backgroundAssetId: asText(source.backgroundAssetId, 256),
        remark: asText(source.remark, 120),
        profileBackgroundAssetId: asText(source.profileBackgroundAssetId || person.profileBackgroundAssetId, 256),
        signature: kind === 'private' ? asText(source.signature || person.signature, 1000) : '',
        gender: kind === 'private' ? asText(source.gender || person.gender, 120) : '',
        birthday: kind === 'private' ? asText(source.birthday || person.birthday, 120) : '',
        unreadCount: Math.max(0, Math.trunc(asNumber(source.unreadCount))),
        canSend: !readOnly && !muted,
        readOnly,
        muted,
        lastMessage: cloneMessagePreview(source.lastMessage),
        injection: cloneInjection(source.injection),
        request: cloneRequestState(source.request),
        group,
    });
}

function cloneQuote(quote) {
    if (!quote || typeof quote !== 'object') return null;
    const source = asObject(quote);
    return Object.freeze({
        status: asText(source.status, 32) || 'available',
        messageId: asText(source.messageId, 256),
        content: String(source.content ?? ''),
    });
}

function cloneTransfer(transfer) {
    if (!transfer || typeof transfer !== 'object') return null;
    const source = asObject(transfer);
    return Object.freeze({
        amount: asText(source.amount, 64),
        currency: asText(source.currency, 32),
        note: asText(source.note, 1000),
        status: asText(source.status, 32) || 'pending',
        recipientId: asText(source.recipientId, 256),
    });
}

function cloneMessage(message) {
    const source = asObject(message);
    const senderName = asText(source.senderName, 120);
    const senderAvatarAssetId = asText(source.senderAvatarAssetId, 256);
    return Object.freeze({
        messageId: asText(source.messageId || source.id, 256),
        conversationId: asText(source.conversationId, 256),
        sequence: Math.max(0, Math.trunc(asNumber(source.sequence))),
        senderId: asText(source.senderId, 256),
        senderType: asText(source.senderType, 32),
        ...(senderName ? { senderName } : {}),
        ...(senderAvatarAssetId ? { senderAvatarAssetId } : {}),
        type: asText(source.type, 32),
        content: String(source.content ?? ''),
        storyTime: asText(source.storyTime, 128),
        quote: cloneQuote(source.quote),
        mentionIds: Object.freeze(asArray(source.mentionIds).map((item) => asText(item, 256)).filter(Boolean)),
        mentionAll: source.mentionAll === true,
        transfer: cloneTransfer(source.transfer),
        stickerId: asText(source.stickerId, 256),
        assetId: asText(source.assetId, 256),
        selectedForInjection: source.selectedForInjection === true,
    });
}

function normalizeMessagePage(value) {
    if (Array.isArray(value)) {
        return Object.freeze({
            items: Object.freeze(value.map(cloneMessage)),
            hasMore: false,
            nextBeforeSequence: null,
        });
    }
    const source = asObject(value);
    const next = Number(source.nextBeforeSequence);
    return Object.freeze({
        items: Object.freeze(asArray(source.items || source.messages).map(cloneMessage)),
        hasMore: source.hasMore === true,
        nextBeforeSequence: Number.isInteger(next) && next >= 0 ? next : null,
    });
}

function clonePerson(person) {
    const source = asObject(person);
    return Object.freeze({
        personId: asText(source.personId || source.id, 256),
        formalName: asText(source.formalName || source.name, 256),
        avatarAssetId: asText(source.avatarAssetId, 256),
        signature: asText(source.signature, 1000),
        gender: asText(source.gender, 120),
        birthday: asText(source.birthday, 120),
        profileBackgroundAssetId: asText(source.profileBackgroundAssetId, 256),
    });
}
function cloneProfile(profile) {
    const source = asObject(profile);
    return Object.freeze({
        avatarAssetId: asText(source.avatarAssetId, 256),
        signature: asText(source.signature, 1000),
        gender: asText(source.gender, 120),
        birthday: asText(source.birthday, 120),
        profileBackgroundAssetId: asText(source.profileBackgroundAssetId, 256),
    });
}


function cloneMedia(media) {
    const source = asObject(media);
    return Object.freeze({
        assetId: asText(source.assetId || source.id, 256),
        conversationId: asText(source.conversationId, 256),
        kind: asText(source.kind, 32),
        mimeType: asText(source.mimeType, 128),
        size: Math.max(0, Math.trunc(asNumber(source.blob?.size ?? source.size))),
        library: asText(source.library, 64),
        createdAt: Math.max(0, Math.trunc(asNumber(source.createdAt))),
    });
}

function cloneMediaRender(render) {
    const source = asObject(render);
    return Object.freeze({
        leaseId: asText(source.leaseId, 256),
        url: asText(source.url, 4096),
    });
}

function cloneUnreadState(unread) {
    const source = asObject(unread);
    const counts = asObject(source.byConversationId);
    const byConversationId = Object.fromEntries(Object.entries(counts).map(([conversationId, count]) => [
        asText(conversationId, 256),
        Math.max(0, Math.trunc(asNumber(count))),
    ]).filter(([conversationId]) => conversationId));
    const total = Math.max(0, Math.trunc(asNumber(source.total)));
    return Object.freeze({
        total,
        display: total > 99 ? '99+' : String(total),
        byConversationId: Object.freeze(byConversationId),
    });
}

function cloneWorldbook(worldbook) {
    const source = asObject(worldbook);
    return Object.freeze({
        bookName: asText(source.bookName || source.name, 256),
        entryCount: Math.max(0, Math.trunc(asNumber(source.entryCount))),
    });
}

function cloneModelState(state) {
    const source = asObject(state);
    return Object.freeze({
        ok: source.ok === true,
        apiPresetId: asText(source.apiPresetId, 256),
        models: Object.freeze(asArray(source.models).map((model) => asText(model, 256)).filter(Boolean)),
        manualModel: asText(source.manualModel, 256),
        error: asText(source.error, 1000),
    });
}

function conversationNotFound() {
    return Object.freeze({ ok: false, status: 'not-found', reason: 'conversation-not-found' });
}

async function hasPrivateConversation(runtime, scopeId, conversationId) {
    const conversation = await runtime.getConversation({ scopeId, conversationId });
    return Boolean(conversation) && conversation.kind !== 'group';
}

/**
 * Stable application boundary for the future Figma QQ UI.
 * The runtime is intentionally injected: this module never reaches into IndexedDB,
 * SillyTavern host objects, or a previous QQ controller.
 */
export function createQQV2Facade(options = {}) {
    const runtime = asObject(options.runtime);

    return Object.freeze({
        query: Object.freeze({
            async bootstrap() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                const snapshot = asObject(await runtime.getSnapshot());
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    context: cloneContext(snapshot.context),
                    globalSettings: cloneGlobalSettings(snapshot.globalSettings),
                });
            },
            async currentContext() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                const snapshot = asObject(await runtime.getSnapshot());
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    context: cloneContext(snapshot.context),
                });
            },
            async globalSettings() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                const snapshot = asObject(await runtime.getSnapshot());
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    settings: cloneGlobalSettings(snapshot.globalSettings),
                });
            },
            async currentProfile() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getCurrentProfile !== 'function') return unavailable('getCurrentProfile');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                if (!context.scopeId) return unavailable('currentScope');
                const profile = await runtime.getCurrentProfile({ scopeId: context.scopeId });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    profile: cloneProfile(profile),
                });
            },
            async imageLibrary(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.listImageLibraryAssets !== 'function') return unavailable('listImageLibraryAssets');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                const library = asText(input.library, 64);
                if (!context.scopeId) return unavailable('currentScope');
                if (!library) return Object.freeze({ ok: false, status: 'invalid', reason: 'image-library-required' });
                const assets = await runtime.listImageLibraryAssets({ scopeId: context.scopeId, library });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    assets: Object.freeze(asArray(assets).map(cloneMedia)),
                });
            },
            async imageLibraryPack() {
                if (typeof runtime.exportImageLibraryPack !== 'function') return unavailable('exportImageLibraryPack');
                try {
                    const pack = await runtime.exportImageLibraryPack();
                    return Object.freeze({ ok: true, status: 'ready', pack: Object.freeze(pack) });
                } catch (error) {
                    return failed(error);
                }
            },
            async sharedResources() {
                if (typeof runtime.listSharedResources !== 'function') return unavailable('listSharedResources');
                const resources = asObject(await runtime.listSharedResources());
                return Object.freeze({
                    ok: true,
                    status: 'ready',
                    apiPresets: Object.freeze(asArray(resources.apiPresets).map(cloneApiPreset)),
                    promptPresets: Object.freeze(asArray(resources.promptPresets).map(clonePromptPreset)),
                    stickers: Object.freeze(asArray(resources.stickers).map(cloneSticker)),
                });
            },
            async conversations() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.listConversations !== 'function') return unavailable('listConversations');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                if (!context.scopeId) return unavailable('currentScope');
                const conversations = await runtime.listConversations({ scopeId: context.scopeId });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    conversations: Object.freeze(asArray(conversations)
                        .map(cloneConversation)
                        .filter((conversation) => conversation.kind === 'private')),
                });
            },
            async messages(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.listMessages !== 'function') return unavailable('listMessages');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                const conversationId = asText(input.conversationId, 256);
                if (!context.scopeId) return unavailable('currentScope');
                if (!conversationId) return Object.freeze({
                    ok: false,
                    status: 'invalid',
                    reason: 'conversation-required',
                });
                const conversation = await runtime.getConversation({ scopeId: context.scopeId, conversationId });
                if (!conversation || conversation.kind === 'group') return conversationNotFound();
                const beforeSequence = Number(input.beforeSequence);
                const limit = Number(input.limit);
                const page = await runtime.listMessages({
                    scopeId: context.scopeId,
                    conversationId,
                    ...(Number.isInteger(beforeSequence) && beforeSequence >= 0 ? { beforeSequence } : {}),
                    ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
                });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    page: normalizeMessagePage(page),
                });
            },
            async conversation(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                const conversationId = asText(input.conversationId, 256);
                if (!context.scopeId) return unavailable('currentScope');
                if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                const conversation = await runtime.getConversation({ scopeId: context.scopeId, conversationId });
                if (!conversation || conversation.kind === 'group') return conversationNotFound();
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    conversation: cloneConversation(conversation),
                });
            },
            async person(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getPerson !== 'function') return unavailable('getPerson');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                const personId = asText(input.personId, 256);
                if (!context.scopeId) return unavailable('currentScope');
                if (!personId) return Object.freeze({ ok: false, status: 'invalid', reason: 'person-required' });
                const person = await runtime.getPerson({ scopeId: context.scopeId, personId });
                if (!person) return Object.freeze({ ok: false, status: 'not-found', reason: 'person-not-found' });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    person: clonePerson(person),
                });
            },
            async media(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getMedia !== 'function') return unavailable('getMedia');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                const assetId = asText(input.assetId, 256);
                if (!context.scopeId) return unavailable('currentScope');
                if (!assetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'asset-required' });
                const media = await runtime.getMedia({ scopeId: context.scopeId, assetId });
                if (!media) return Object.freeze({ ok: false, status: 'not-found', reason: 'media-not-found' });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    media: cloneMedia(media),
                });
            },
            async mediaRender(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.acquireMediaRender !== 'function') return unavailable('acquireMediaRender');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const assetId = asText(input.assetId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!assetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'asset-required' });
                    const result = asObject(await runtime.acquireMediaRender({
                        scopeId: context.scopeId,
                        assetId,
                    }));
                    const render = cloneMediaRender(result);
                    if (!render.leaseId || !render.url) {
                        return Object.freeze({ ok: false, status: 'not-found', reason: 'media-not-found' });
                    }
                    return Object.freeze({
                        ok: true,
                        status: asText(snapshot.phase, 32) || 'ready',
                        media: cloneMedia(result),
                        render,
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async stickerRender(input = {}) {
                if (typeof runtime.acquireStickerRender !== 'function') return unavailable('acquireStickerRender');
                try {
                    const stickerId = asText(input.stickerId, 256);
                    if (!stickerId) return Object.freeze({ ok: false, status: 'invalid', reason: 'sticker-required' });
                    const result = asObject(await runtime.acquireStickerRender({ stickerId }));
                    const render = cloneMediaRender(result);
                    if (!render.leaseId || !render.url) {
                        return Object.freeze({ ok: false, status: 'not-found', reason: 'sticker-not-found' });
                    }
                    return Object.freeze({
                        ok: true,
                        status: 'ready',
                        stickerId,
                        render,
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async requestState(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.getRequestState !== 'function') return unavailable('getRequestState');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const request = await runtime.getRequestState({ scopeId: context.scopeId, conversationId });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    request: cloneRequestState(request),
                });
            },
            async unread() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getUnreadState !== 'function') return unavailable('getUnreadState');
                if (typeof runtime.listConversations !== 'function') return unavailable('listConversations');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                if (!context.scopeId) return unavailable('currentScope');
                const [unread, conversations] = await Promise.all([
                    runtime.getUnreadState({ scopeId: context.scopeId }),
                    runtime.listConversations({ scopeId: context.scopeId }),
                ]);
                const privateIds = new Set(asArray(conversations)
                    .filter((conversation) => conversation?.kind !== 'group')
                    .map((conversation) => asText(conversation?.conversationId, 256))
                    .filter(Boolean));
                const byConversationId = Object.fromEntries(Object.entries(asObject(unread).byConversationId || {})
                    .filter(([conversationId]) => privateIds.has(asText(conversationId, 256))));
                const total = Object.values(byConversationId)
                    .reduce((sum, count) => sum + Math.max(0, Math.trunc(asNumber(count))), 0);
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    unread: cloneUnreadState({ total, byConversationId }),
                });
            },
            async worldbooks() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.listWorldbooks !== 'function') return unavailable('listWorldbooks');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                if (!context.scopeId) return unavailable('currentScope');
                const worldbooks = await runtime.listWorldbooks({ scopeId: context.scopeId });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    worldbooks: Object.freeze(asArray(worldbooks).map(cloneWorldbook)),
                });
            },
            async proactiveState() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getProactiveState !== 'function') return unavailable('getProactiveState');
                const snapshot = asObject(await runtime.getSnapshot());
                const context = cloneContext(snapshot.context);
                if (!context.scopeId) return unavailable('currentScope');
                const proactive = await runtime.getProactiveState({ scopeId: context.scopeId });
                return Object.freeze({
                    ok: true,
                    status: asText(snapshot.phase, 32) || 'ready',
                    proactive: cloneProactiveSettings(proactive),
                });
            },
        }),
        intent: Object.freeze({
            async importImageLibraryPack(input = {}) {
                if (typeof runtime.importImageLibraryPack !== 'function') return unavailable('importImageLibraryPack');
                const source = String(input.source ?? '');
                if (!source.trim()) return Object.freeze({ ok: false, status: 'invalid', reason: 'image-library-pack-required' });
                try {
                    const imported = asObject(await runtime.importImageLibraryPack({ source }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        imported: Object.freeze({
                            avatars: Math.max(0, Math.trunc(asNumber(imported.avatars))),
                            profileBackgrounds: Math.max(0, Math.trunc(asNumber(imported.profileBackgrounds))),
                            chatBackgrounds: Math.max(0, Math.trunc(asNumber(imported.chatBackgrounds))),
                            stickers: Math.max(0, Math.trunc(asNumber(imported.stickers))),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async exportAllPromptPresets() {
                if (typeof runtime.exportAllPromptPresets !== 'function') return unavailable('exportAllPromptPresets');
                try {
                    const promptPresets = await runtime.exportAllPromptPresets();
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        promptPresets: Object.freeze(asArray(promptPresets).map(clonePromptPreset)),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async exportPromptPreset(input = {}) {
                if (typeof runtime.exportPromptPreset !== 'function') return unavailable('exportPromptPreset');
                const promptPresetId = asText(input.promptPresetId || input.presetId, 256);
                if (!promptPresetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'prompt-preset-required' });
                try {
                    const promptPreset = await runtime.exportPromptPreset({ promptPresetId });
                    if (!promptPreset) return Object.freeze({ ok: false, status: 'not-found', reason: 'prompt-preset-not-found' });
                    return Object.freeze({ ok: true, status: 'accepted', promptPreset: clonePromptPreset(promptPreset) });
                } catch (error) {
                    return failed(error);
                }
            },
            async importPromptPresets(input = {}) {
                if (typeof runtime.importPromptPresets !== 'function') return unavailable('importPromptPresets');
                try {
                    const promptPresets = await runtime.importPromptPresets({ source: input.source });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        promptPresets: Object.freeze(asArray(promptPresets).map(clonePromptPreset)),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async restoreAllBuiltInPromptPresets() {
                if (typeof runtime.restoreAllBuiltInPromptPresets !== 'function') {
                    return unavailable('restoreAllBuiltInPromptPresets');
                }
                try {
                    const promptPresets = await runtime.restoreAllBuiltInPromptPresets();
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        promptPresets: Object.freeze(asArray(promptPresets).map(clonePromptPreset)),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async moveSticker(input = {}) {
                if (typeof runtime.moveSticker !== 'function') return unavailable('moveSticker');
                const stickerId = asText(input.stickerId, 256);
                const targetIndex = Number(input.targetIndex);
                if (!stickerId) return Object.freeze({ ok: false, status: 'invalid', reason: 'sticker-required' });
                if (!Number.isInteger(targetIndex) || targetIndex < 0) {
                    return Object.freeze({ ok: false, status: 'invalid', reason: 'sticker-index-invalid' });
                }
                try {
                    const sticker = await runtime.moveSticker({ stickerId, targetIndex });
                    return Object.freeze({ ok: true, status: 'accepted', sticker: cloneSticker(sticker) });
                } catch (error) {
                    return failed(error);
                }
            },
            async deleteSticker(input = {}) {
                if (typeof runtime.deleteSticker !== 'function') return unavailable('deleteSticker');
                const stickerId = asText(input.stickerId, 256);
                if (!stickerId) return Object.freeze({ ok: false, status: 'invalid', reason: 'sticker-required' });
                try {
                    const deleted = await runtime.deleteSticker({ stickerId });
                    return Object.freeze({ ok: true, status: 'accepted', deleted: deleted === true });
                } catch (error) {
                    return failed(error);
                }
            },
            async openConversation(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.openConversation !== 'function') return unavailable('openConversation');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.openConversation({ scopeId: context.scopeId, conversationId }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        unreadCount: Math.max(0, Math.trunc(asNumber(result.unreadCount))),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async closeConversation(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.closeConversation !== 'function') return unavailable('closeConversation');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    const result = asObject(await runtime.closeConversation({
                        scopeId: context.scopeId,
                        conversationId,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        conversationId: asText(result.conversationId || conversationId, 256),
                        closed: result.closed === true,
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async updateGroupProfile() {
                return disabled('updateGroupProfile');
            },
            async updateCurrentProfile(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.updateCurrentProfile !== 'function') return unavailable('updateCurrentProfile');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const profile = await runtime.updateCurrentProfile({
                        scopeId: context.scopeId,
                        profile: asObject(input.profile),
                    });
                    return Object.freeze({ ok: true, status: 'accepted', profile: cloneProfile(profile) });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveImageLibraryAsset(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.saveImageLibraryAsset !== 'function') return unavailable('saveImageLibraryAsset');
                const library = asText(input.library, 64);
                if (!library) return Object.freeze({ ok: false, status: 'invalid', reason: 'image-library-required' });
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const asset = await runtime.saveImageLibraryAsset({
                        scopeId: context.scopeId,
                        library,
                        blob: input.blob,
                        mimeType: asText(input.mimeType, 128),
                    });
                    return Object.freeze({ ok: true, status: 'accepted', asset: cloneMedia(asset) });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveImageLibraryAssets(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.saveImageLibraryAssets !== 'function') return unavailable('saveImageLibraryAssets');
                const assets = asArray(input.assets).map((asset) => ({
                    library: asText(asset?.library, 64),
                    blob: asset?.blob,
                    mimeType: asText(asset?.mimeType, 128),
                }));
                if (assets.length === 0 || assets.some((asset) => !asset.library)) {
                    return Object.freeze({ ok: false, status: 'invalid', reason: 'image-assets-required' });
                }
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const saved = await runtime.saveImageLibraryAssets({ scopeId: context.scopeId, assets });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        assets: Object.freeze(asArray(saved).map(cloneMedia)),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async deleteImageLibraryAssets(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.deleteImageLibraryAssets !== 'function') return unavailable('deleteImageLibraryAssets');
                const assetIds = [...new Set(asArray(input.assetIds).map((id) => asText(id, 256)).filter(Boolean))];
                if (assetIds.length === 0) return Object.freeze({ ok: false, status: 'invalid', reason: 'image-assets-required' });
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const result = asObject(await runtime.deleteImageLibraryAssets({ scopeId: context.scopeId, assetIds }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            deletedAssetIds: Object.freeze(asArray(result.deletedAssetIds).map((id) => asText(id, 256)).filter(Boolean)),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async updatePrivateProfile(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.updatePrivateProfile !== 'function') return unavailable('updatePrivateProfile');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.updatePrivateProfile({
                        scopeId: context.scopeId,
                        conversationId,
                        profile: asObject(input.profile),
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            person: clonePerson(result.person),
                            conversation: cloneConversation(result.conversation),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async removePrivateFriend(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.removePrivateFriend !== 'function') return unavailable('removePrivateFriend');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.removePrivateFriend({
                        scopeId: context.scopeId,
                        conversationId,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            removed: result.removed === true,
                            person: clonePerson(result.person),
                            conversation: cloneConversation(result.conversation),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async handleIncomingTransfer(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.handleIncomingTransfer !== 'function') return unavailable('handleIncomingTransfer');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    const messageId = asText(input.messageId, 256);
                    const action = asText(input.action, 32);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!messageId) return Object.freeze({ ok: false, status: 'invalid', reason: 'message-required' });
                    if (!['accept', 'return'].includes(action)) {
                        return Object.freeze({ ok: false, status: 'invalid', reason: 'transfer-action-invalid' });
                    }
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const message = await runtime.handleIncomingTransfer({
                        scopeId: context.scopeId,
                        conversationId,
                        messageId,
                        action,
                        storyTime: context.storyTime,
                    });
                    return Object.freeze({ ok: true, status: 'accepted', result: Object.freeze({ message: cloneMessage(message) }) });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveMedia(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.saveMedia !== 'function') return unavailable('saveMedia');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const media = await runtime.saveMedia({
                        scopeId: context.scopeId,
                        media: asObject(input.media),
                    });
                    return Object.freeze({ ok: true, status: 'accepted', media: cloneMedia(media) });
                } catch (error) {
                    return failed(error);
                }
            },
            async releaseMediaRender(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.releaseMediaRender !== 'function') return unavailable('releaseMediaRender');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const leaseId = asText(input.leaseId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!leaseId) return Object.freeze({ ok: false, status: 'invalid', reason: 'media-render-required' });
                    const released = await runtime.releaseMediaRender({ scopeId: context.scopeId, leaseId });
                    return Object.freeze({ ok: true, status: 'accepted', released: released === true });
                } catch (error) {
                    return failed(error);
                }
            },
            async releaseStickerRender(input = {}) {
                if (typeof runtime.releaseStickerRender !== 'function') return unavailable('releaseStickerRender');
                try {
                    const leaseId = asText(input.leaseId, 256);
                    if (!leaseId) return Object.freeze({ ok: false, status: 'invalid', reason: 'sticker-render-required' });
                    const released = await runtime.releaseStickerRender({ leaseId });
                    return Object.freeze({ ok: true, status: 'accepted', released: released === true });
                } catch (error) {
                    return failed(error);
                }
            },
            async manageGroup(input = {}) {
                if (groupsAreDisabled()) return disabled('manageGroup');
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.manageGroup !== 'function') return unavailable('manageGroup');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const groupId = asText(input.groupId, 256);
                    const action = asText(input.action, 64);
                    const targetPersonId = asText(input.targetPersonId, 256);
                    const duration = asText(input.duration, 64);
                    const value = asText(input.value, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!groupId) return Object.freeze({ ok: false, status: 'invalid', reason: 'group-required' });
                    if (!action) return Object.freeze({ ok: false, status: 'invalid', reason: 'group-action-required' });
                    const group = await runtime.manageGroup({
                        scopeId: context.scopeId,
                        groupId,
                        action,
                        ...(targetPersonId ? { targetPersonId } : {}),
                        ...(duration ? { duration } : {}),
                        ...(value ? { value } : {}),
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    });
                    return Object.freeze({ ok: true, status: 'accepted', group: cloneGroup(group) });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveSticker(input = {}) {
                if (typeof runtime.saveSticker !== 'function') return unavailable('saveSticker');
                try {
                    const sticker = await runtime.saveSticker({ sticker: asObject(input.sticker) });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        sticker: cloneSticker(sticker),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveStickers(input = {}) {
                if (typeof runtime.saveStickers !== 'function') return unavailable('saveStickers');
                const stickers = asArray(input.stickers).map(asObject);
                if (stickers.length === 0) {
                    return Object.freeze({ ok: false, status: 'invalid', reason: 'stickers-required' });
                }
                try {
                    const saved = await runtime.saveStickers({ stickers });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        stickers: Object.freeze(asArray(saved).map(cloneSticker)),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async restoreBuiltInPromptPreset(input = {}) {
                if (typeof runtime.restoreBuiltInPromptPreset !== 'function') {
                    return unavailable('restoreBuiltInPromptPreset');
                }
                const promptPresetId = asText(input.promptPresetId || input.presetId, 256);
                if (!promptPresetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'prompt-preset-required' });
                try {
                    const promptPreset = await runtime.restoreBuiltInPromptPreset({ promptPresetId });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        promptPreset: clonePromptPreset(promptPreset),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async deletePromptPreset(input = {}) {
                if (typeof runtime.deletePromptPreset !== 'function') return unavailable('deletePromptPreset');
                const promptPresetId = asText(input.promptPresetId || input.presetId, 256);
                if (!promptPresetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'prompt-preset-required' });
                try {
                    const deleted = await runtime.deletePromptPreset({ promptPresetId });
                    return Object.freeze({ ok: true, status: 'accepted', deleted: deleted === true });
                } catch (error) {
                    return failed(error);
                }
            },
            async savePromptPreset(input = {}) {
                if (typeof runtime.savePromptPreset !== 'function') return unavailable('savePromptPreset');
                try {
                    const promptPreset = await runtime.savePromptPreset({ preset: asObject(input.preset) });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        promptPreset: clonePromptPreset(promptPreset),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async deleteApiPreset(input = {}) {
                if (typeof runtime.deleteApiPreset !== 'function') return unavailable('deleteApiPreset');
                const apiPresetId = asText(input.apiPresetId || input.presetId, 256);
                if (!apiPresetId) return Object.freeze({ ok: false, status: 'invalid', reason: 'api-preset-required' });
                try {
                    const deleted = await runtime.deleteApiPreset({ apiPresetId });
                    return Object.freeze({ ok: true, status: 'accepted', deleted: deleted === true });
                } catch (error) {
                    return failed(error);
                }
            },
            async loadModels(input = {}) {
                if (typeof runtime.loadModels !== 'function') return unavailable('loadModels');
                const apiPresetId = asText(input.apiPresetId, 256);
                const hasDraft = input.draft !== undefined;
                if (!apiPresetId && !hasDraft) {
                    return Object.freeze({ ok: false, status: 'invalid', reason: 'api-preset-or-draft-required' });
                }
                try {
                    const modelState = await runtime.loadModels({
                        ...(apiPresetId ? { apiPresetId } : {}),
                        ...(hasDraft ? { draft: cloneModelLoadDraft(input.draft) } : {}),
                    });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        modelState: cloneModelState(modelState),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async saveApiPreset(input = {}) {
                if (typeof runtime.saveApiPreset !== 'function') return unavailable('saveApiPreset');
                try {
                    const apiPreset = await runtime.saveApiPreset({ preset: asObject(input.preset) });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        apiPreset: cloneApiPreset(apiPreset),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async configureProactive(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.configureProactive !== 'function') return unavailable('configureProactive');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const proactive = await runtime.configureProactive({
                        scopeId: context.scopeId,
                        settings: asObject(input),
                    });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        proactive: cloneProactiveSettings(proactive),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async retryPendingWorldbook() {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.retryPendingWorldbook !== 'function') return unavailable('retryPendingWorldbook');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const result = asObject(await runtime.retryPendingWorldbook({
                        scopeId: context.scopeId,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    const ids = (value) => Object.freeze(asArray(value).map((item) => asText(item, 256)).filter(Boolean));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            syncedConversationIds: ids(result.syncedConversationIds),
                            pendingConversationIds: ids(result.pendingConversationIds),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async setMessageInjection(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.setMessageSelectedForInjection !== 'function') {
                    return unavailable('setMessageSelectedForInjection');
                }
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    const messageId = asText(input.messageId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!messageId) return Object.freeze({ ok: false, status: 'invalid', reason: 'message-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.setMessageSelectedForInjection({
                        scopeId: context.scopeId,
                        conversationId,
                        messageId,
                        selected: input.selected === true,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            message: cloneMessage(result.message),
                            injection: cloneInjection(result.injection),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async setMessagesInjection(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.setMessagesSelectedForInjection !== 'function') {
                    return unavailable('setMessagesSelectedForInjection');
                }
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    const messageIds = [...new Set(asArray(input.messageIds)
                        .map((item) => asText(item, 256))
                        .filter(Boolean))];
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (messageIds.length === 0) return Object.freeze({ ok: false, status: 'invalid', reason: 'messages-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.setMessagesSelectedForInjection({
                        scopeId: context.scopeId,
                        conversationId,
                        messageIds,
                        selected: input.selected === true,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            messages: Object.freeze(asArray(result.messages).map(cloneMessage)),
                            injection: cloneInjection(result.injection),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async setConversationInjection(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.setConversationInjection !== 'function') return unavailable('setConversationInjection');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const injection = await runtime.setConversationInjection({
                        scopeId: context.scopeId,
                        conversationId,
                        injection: asObject(input.injection),
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        injection: cloneInjection(injection),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async updateGlobalSettings(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.updateGlobalSettings !== 'function') return unavailable('updateGlobalSettings');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    if (!context.scopeId) return unavailable('currentScope');
                    const expectedScopeId = asText(input.scopeId, 512);
                    if (expectedScopeId && expectedScopeId !== context.scopeId) {
                        return Object.freeze({ ok: false, status: 'stale', reason: 'scope-changed' });
                    }
                    const source = asObject(input.settings);
                    const settings = { ...source };
                    delete settings.groupReplyPresetId;
                    delete settings.groupProactivePresetId;
                    const next = await runtime.updateGlobalSettings({
                        scopeId: context.scopeId,
                        settings,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    });
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        settings: cloneGlobalSettings(next),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async deleteConversation(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.deleteConversation !== 'function') return unavailable('deleteConversation');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.deleteConversation({
                        scopeId: context.scopeId,
                        conversationId,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    if (result.deleted !== true) {
                        return failed({
                            code: result.mode === 'deleting' ? 'conversation_deleting' : 'conversation_delete_failed',
                            message: result.mode === 'deleting'
                                ? 'QQ conversation is being deleted'
                                : 'QQ conversation deletion failed',
                        });
                    }
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            deleted: result.deleted === true,
                            mode: asText(result.mode, 64),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async deleteMessages(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.deleteMessages !== 'function') return unavailable('deleteMessages');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    const messageIds = [...new Set(asArray(input.messageIds).map((item) => asText(item, 256)).filter(Boolean))];
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (messageIds.length === 0) return Object.freeze({ ok: false, status: 'invalid', reason: 'messages-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.deleteMessages({
                        scopeId: context.scopeId,
                        conversationId,
                        messageIds,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            deletedMessageIds: Object.freeze(asArray(result.deletedMessageIds)
                                .map((item) => asText(item, 256)).filter(Boolean)),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async retryRequest(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.retryManual !== 'function') return unavailable('retryManual');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.retryManual({
                        scopeId: context.scopeId,
                        conversationId,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            queued: result.queued === true,
                            pendingUserMessageCount: Math.max(0, Math.trunc(asNumber(result.pendingUserMessageCount))),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async cancelManualRequest(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.cancelManualRequest !== 'function') return unavailable('cancelManualRequest');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.cancelManualRequest({
                        scopeId: context.scopeId,
                        conversationId,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            cancelled: result.cancelled === true,
                            phase: asText(result.phase, 32) || 'idle',
                            pendingUserMessageCount: Math.max(0, Math.trunc(asNumber(result.pendingUserMessageCount))),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async createGroupConversation(input = {}) {
                if (groupsAreDisabled()) return disabled('createGroupConversation');
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.createGroupConversation !== 'function') return unavailable('createGroupConversation');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const name = asText(input.name, 120);
                    const memberIds = [...new Set(asArray(input.memberIds).map((item) => asText(item, 256)).filter(Boolean))];
                    const ownerId = asText(input.ownerId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!name) return Object.freeze({ ok: false, status: 'invalid', reason: 'name-required' });
                    const result = asObject(await runtime.createGroupConversation({
                        scopeId: context.scopeId,
                        name,
                        memberIds,
                        ...(ownerId ? { ownerId } : {}),
                    }));
                    const group = cloneGroup(result.group);
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            group,
                            conversation: cloneConversation({ ...asObject(result.conversation), group: result.group }),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async createPrivateConversation(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.createPrivateConversation !== 'function') return unavailable('createPrivateConversation');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const name = exactContactName(input.name);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!name) return Object.freeze({ ok: false, status: 'invalid', reason: 'name-required' });
                    const result = asObject(await runtime.createPrivateConversation({
                        scopeId: context.scopeId,
                        name,
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            created: result.created === true,
                            restored: result.restored === true,
                            person: clonePerson(result.person),
                            conversation: cloneConversation(result.conversation),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
            async sendMessage(input = {}) {
                if (typeof runtime.getSnapshot !== 'function') return unavailable('getSnapshot');
                if (typeof runtime.getConversation !== 'function') return unavailable('getConversation');
                if (typeof runtime.sendManual !== 'function') return unavailable('sendManual');
                try {
                    const snapshot = asObject(await runtime.getSnapshot());
                    const context = cloneContext(snapshot.context);
                    const conversationId = asText(input.conversationId, 256);
                    if (!context.scopeId) return unavailable('currentScope');
                    if (!conversationId) return Object.freeze({ ok: false, status: 'invalid', reason: 'conversation-required' });
                    if (!await hasPrivateConversation(runtime, context.scopeId, conversationId)) return conversationNotFound();
                    const result = asObject(await runtime.sendManual({
                        scopeId: context.scopeId,
                        conversationId,
                        message: asObject(input.message),
                        userName: context.user.name,
                        storyTime: context.storyTime,
                    }));
                    return Object.freeze({
                        ok: true,
                        status: 'accepted',
                        result: Object.freeze({
                            message: cloneMessage(result.message),
                        }),
                    });
                } catch (error) {
                    return failed(error);
                }
            },
        }),
        async subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            if (typeof runtime.getSnapshot !== 'function' || typeof runtime.subscribe !== 'function') return () => {};

            const initialSnapshot = asObject(await runtime.getSnapshot());
            const initialScopeId = cloneContext(initialSnapshot.context).scopeId;
            if (!initialScopeId) return () => {};

            let active = true;
            const notify = async (event) => {
                if (!active) return;
                let notifiedScopeId = asText(event?.scopeId, 512);
                if (!notifiedScopeId) {
                    const currentSnapshot = asObject(await runtime.getSnapshot());
                    notifiedScopeId = cloneContext(currentSnapshot.context).scopeId;
                }
                if (!active || notifiedScopeId !== initialScopeId) return;
                try {
                    const reason = asText(event?.reason, 64);
                    const conversationId = asText(event?.conversationId, 256);
                    listener(Object.freeze({
                        status: 'changed',
                        scopeId: initialScopeId,
                        ...(reason ? { reason } : {}),
                        ...(conversationId ? { conversationId } : {}),
                    }));
                } catch {
                    // Subscriber failures must not break the runtime notification path.
                }
            };
            const unsubscribeRuntime = runtime.subscribe(notify);
            return () => {
                if (!active) return;
                active = false;
                if (typeof unsubscribeRuntime === 'function') unsubscribeRuntime();
            };
        },
    });
}
