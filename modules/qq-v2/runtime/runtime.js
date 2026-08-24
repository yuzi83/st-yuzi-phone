import { createQQV2ScopeCoordinator } from './scope-coordinator.js';

function cloneScope(scope) {
    return scope ? { ...scope } : null;
}

function asText(value, maxLength = 1024) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function cloneStoryMessages(messages) {
    if (!Array.isArray(messages)) return Object.freeze([]);
    return Object.freeze(messages.map(message => ({ ...message })));
}

/**
 * v2 生命周期壳：后续领域服务只通过它取得当前作用域，避免旧作用域结果落入新聊天。
 */
export function createQQV2Runtime(options = {}) {
    const host = options.host;
    if (!host || typeof host.readScope !== 'function') {
        throw new TypeError('QQ v2 runtime 需要有效的 host adapter');
    }

    const onScopeChanged = typeof options.onScopeChanged === 'function'
        ? options.onScopeChanged
        : () => {};
    const onScopeReady = typeof options.onScopeReady === 'function'
        ? options.onScopeReady
        : () => {};
    const onUnavailable = typeof options.onUnavailable === 'function'
        ? options.onUnavailable
        : () => {};
    const onDestroy = typeof options.onDestroy === 'function'
        ? options.onDestroy
        : () => {};
    const onCharacterMessageRendered = typeof options.onCharacterMessageRendered === 'function'
        ? options.onCharacterMessageRendered
        : () => {};
    const onMessageReceived = typeof options.onMessageReceived === 'function'
        ? options.onMessageReceived
        : () => {};
    const coordinator = createQQV2ScopeCoordinator({
        readScope: () => host.readScope(),
        async onTransition({ previous, current }) {
            await onScopeChanged(cloneScope(current.scope), current.generation, current, previous);
        },
        onReady: onScopeReady,
        async onUnavailable(details) {
            await onUnavailable(details);
        },
        onDestroy(details) {
            return onDestroy(details);
        },
    });

    const refreshScope = async () => {
        const scopeSession = await coordinator.refresh();
        if (!scopeSession?.isReady()) return null;
        return cloneScope(scopeSession?.scope);
    };

    const captureReadyScopeSession = (expectedScopeId) => {
        const scopeSession = coordinator.capture(expectedScopeId);
        return scopeSession?.isReady() ? scopeSession : null;
    };

    return Object.freeze({
        async initialize() {
            if (coordinator.getStatus().phase === 'destroyed') {
                throw new Error('已销毁的 QQ v2 runtime 不能再次初始化');
            }
            return refreshScope();
        },
        async handleChatChanged() {
            return refreshScope();
        },
        async handleCharacterMessageRendered(messageId, generationType) {
            const scopeSession = captureReadyScopeSession();
            if (!scopeSession) return null;
            const facts = Object.freeze({
                scope: cloneScope(scopeSession.scope),
                scopeSession,
                messageId: asText(messageId, 180),
                generationType: asText(generationType, 80),
                storyTime: typeof host.readStoryTime === 'function' ? asText(host.readStoryTime(), 512) : '',
                storyMessages: cloneStoryMessages(
                    typeof host.readStoryMessages === 'function' ? host.readStoryMessages() : [],
                ),
            });
            await onCharacterMessageRendered(facts);
            return facts;
        },
        async handleMessageReceived(messageId, generationType) {
            const scopeSession = captureReadyScopeSession();
            if (!scopeSession) return null;
            const facts = Object.freeze({
                scope: cloneScope(scopeSession.scope),
                scopeSession,
                messageId: asText(messageId, 180),
                generationType: asText(generationType, 80),
                storyTime: typeof host.readStoryTime === 'function' ? asText(host.readStoryTime(), 512) : '',
                storyMessages: cloneStoryMessages(
                    typeof host.readStoryMessages === 'function' ? host.readStoryMessages() : [],
                ),
            });
            await onMessageReceived(facts);
            return facts;
        },
        getActiveScope() {
            return cloneScope(coordinator.getCurrentSession()?.scope);
        },
        captureScopeSession(expectedScopeId) {
            return coordinator.capture(expectedScopeId);
        },
        runHostMutation(operation) {
            return coordinator.runHostMutation(operation);
        },
        getStatus() {
            const status = coordinator.getStatus();
            return Object.freeze({
                phase: status.phase,
                scopeId: status.scopeId,
                epoch: status.generation,
            });
        },
        destroy() {
            coordinator.destroy();
        },
    });
}
