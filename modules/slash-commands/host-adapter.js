import { Logger } from '../error-handler.js';

const FALLBACK_COMMANDS_KEY = 'yuziPhoneCommands';

const HOST_FUNCTION_POLICY = Object.freeze({
    registerSlashCommand: {
        description: 'SillyTavern Slash 注册函数',
        stableSources: ['sillyTavernContext'],
        compatSources: [],
    },
    unregisterSlashCommand: {
        description: 'SlashCommandParser 注册表清理包装器',
        stableSources: ['slashCommandParserRegistry'],
        compatSources: [],
    },
});

function getSlashCommandContextRoot() {
    try {
        if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
            return window.SillyTavern.getContext();
        }

        if (typeof getContext === 'function') {
            return getContext();
        }

        if (typeof window !== 'undefined' && typeof window.getContext === 'function') {
            return window.getContext();
        }
    } catch (error) {
        Logger.debug('获取 Slash 上下文失败:', error);
    }

    return null;
}

function getSlashCommandParserRegistry() {
    const context = getSlashCommandContextRoot();
    const parser = context?.SlashCommandParser;
    if (!parser || typeof parser !== 'object' || !parser.commands || typeof parser.commands !== 'object') {
        return null;
    }

    return parser.commands;
}

function getSlashCommandRegistryUnregistrar() {
    const registry = getSlashCommandParserRegistry();
    if (!registry) {
        return null;
    }

    return (commandName) => {
        delete registry[commandName];
    };
}

function getHostSourceRoot(sourceName) {
    const globalRoot = typeof globalThis !== 'undefined' ? globalThis : null;

    if (sourceName === 'sillyTavernContext') {
        return getSlashCommandContextRoot();
    }

    if (sourceName === 'slashCommandParserRegistry') {
        const unregister = getSlashCommandRegistryUnregistrar();
        return unregister ? { unregisterSlashCommand: unregister } : null;
    }

    if (sourceName === 'globalThis') {
        return globalRoot;
    }

    if (sourceName === 'window') {
        if (typeof window === 'undefined') {
            return null;
        }
        return window === globalRoot ? null : window;
    }

    return null;
}

function formatHostFunctionBoundary(name) {
    const policy = HOST_FUNCTION_POLICY[name];
    if (!policy) {
        return `仅检查 globalThis.${name}`;
    }

    const stable = policy.stableSources.length
        ? policy.stableSources.map(source => `${source}.${name}`).join(' / ')
        : '无';
    const compat = policy.compatSources.length
        ? `；兼容回退：${policy.compatSources.map(source => `${source}.${name}`).join(' / ')}`
        : '';

    return `稳定来源：${stable}${compat}`;
}

function resolveGlobalFunction(name) {
    const policy = HOST_FUNCTION_POLICY[name] || {
        stableSources: ['globalThis'],
        compatSources: ['window'],
    };

    const candidates = [
        ...policy.stableSources.map(source => ({ source, level: 'stable' })),
        ...policy.compatSources.map(source => ({ source, level: 'compat' })),
    ];

    for (const candidate of candidates) {
        const root = getHostSourceRoot(candidate.source);
        if (!root || typeof root[name] !== 'function') {
            continue;
        }

        return {
            fn: root[name].bind(root),
            source: candidate.source,
            level: candidate.level,
        };
    }

    return null;
}

export function getSillyTavernSlashCommandRegistrar() {
    try {
        const resolved = resolveGlobalFunction('registerSlashCommand');
        if (resolved) {
            return resolved.fn;
        }

        Logger.warn(`未检测到稳定的 registerSlashCommand 接口；${formatHostFunctionBoundary('registerSlashCommand')}。将使用本地降级命令方案`);
        return null;
    } catch (error) {
        Logger.debug('获取 Slash 命令注册函数失败:', error);
        return null;
    }
}

export function getSillyTavernSlashCommandUnregistrar() {
    try {
        const resolved = resolveGlobalFunction('unregisterSlashCommand');
        if (resolved) {
            return resolved.fn;
        }

        Logger.debug(`未检测到 Slash 注册表清理接口；${formatHostFunctionBoundary('unregisterSlashCommand')}`);
        return null;
    } catch (error) {
        Logger.debug('获取 Slash 命令注销函数失败:', error);
        return null;
    }
}

function getFallbackCommandHost() {
    if (typeof window === 'undefined') {
        return null;
    }

    return window;
}

export function registerFallbackSlashCommands(fallbackCommands) {
    const host = getFallbackCommandHost();
    if (!host) {
        return false;
    }

    host[FALLBACK_COMMANDS_KEY] = fallbackCommands;
    return true;
}

export function clearFallbackSlashCommands() {
    const host = getFallbackCommandHost();
    if (host && host[FALLBACK_COMMANDS_KEY]) {
        delete host[FALLBACK_COMMANDS_KEY];
    }
}

export function hasFallbackSlashCommands() {
    const host = getFallbackCommandHost();
    return !!(host && host[FALLBACK_COMMANDS_KEY]);
}
