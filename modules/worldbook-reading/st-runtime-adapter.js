function globalValue(name) {
    try {
        return typeof globalThis !== 'undefined' ? globalThis[name] : undefined;
    } catch {
        return undefined;
    }
}

function readContextFromHost() {
    try {
        const direct = globalValue('getContext');
        if (typeof direct === 'function') return direct();
        const sillyTavern = globalValue('SillyTavern');
        return typeof sillyTavern?.getContext === 'function' ? sillyTavern.getContext() : null;
    } catch {
        return null;
    }
}

function latestMessageId(request, getContext) {
    const hostMessages = Array.isArray(request?.hostMessages) ? request.hostMessages : [];
    const lastHostMessage = hostMessages.at(-1);
    if (Number.isInteger(lastHostMessage?.messageId)) return lastHostMessage.messageId;
    const chat = getContext()?.chat;
    if (Array.isArray(chat) && chat.length > 0) return chat.length - 1;
    return hostMessages.length > 0 ? hostMessages.length - 1 : -1;
}

function messagePlotContent(message) {
    const direct = typeof message?.qrf_plot === 'string' ? message.qrf_plot.trim() : '';
    if (direct) return direct;
    const tasks = message?.qrf_plot_tasks;
    if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return '';
    return Object.entries(tasks)
        .map(([taskId, content]) => {
            const text = typeof content === 'string' ? content.trim() : '';
            return text ? `【${taskId}】\n${text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
}

function latestPlotContent(getContext) {
    const chat = getContext()?.chat;
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const content = messagePlotContent(chat[index]);
        if (content) return content;
    }
    return '';
}

export function createSillyTavernWorldbookReadingRuntimes(overrides = {}) {
    const deps = {
        getEjsTemplate: () => globalValue('EjsTemplate'),
        getMvu: () => globalValue('Mvu'),
        getAutoCardUpdaterApi: () => globalValue('AutoCardUpdaterAPI'),
        getContext: readContextFromHost,
        ...overrides,
    };

    const templateRuntime = Object.freeze({
        async prepareContext() {
            const api = deps.getEjsTemplate();
            if (typeof api?.prepareContext !== 'function') {
                throw new Error('EJS template runtime unavailable');
            }
            return api.prepareContext({}, -1);
        },
        async evalTemplate(template, context) {
            const api = deps.getEjsTemplate();
            if (typeof api?.evalTemplate !== 'function') {
                throw new Error('EJS template runtime unavailable');
            }
            return api.evalTemplate(String(template ?? ''), context);
        },
    });

    const mvuRuntime = Object.freeze({
        async readLatestStatData(request = {}) {
            const api = deps.getMvu();
            if (typeof api?.getMvuData !== 'function') return null;
            const messageId = latestMessageId(request, deps.getContext);
            if (messageId < 0) return null;
            const data = api.getMvuData({ type: 'message', message_id: messageId });
            return data?.stat_data && typeof data.stat_data === 'object'
                ? data.stat_data
                : null;
        },
    });

    const shujukuRuntime = () => {
        const api = deps.getAutoCardUpdaterApi();
        const querySql = api?.querySql;
        const exportTableAsJson = api?.exportTableAsJson;
        const runtime = {
            plotContent: latestPlotContent(deps.getContext),
        };
        if (typeof querySql === 'function') {
            runtime.querySql = (sql, params) => Reflect.apply(querySql, api, [sql, params]);
        }
        if (typeof exportTableAsJson === 'function') {
            runtime.exportTableAsJson = () => Reflect.apply(exportTableAsJson, api, []);
        }
        return runtime;
    };

    return Object.freeze({ templateRuntime, mvuRuntime, shujukuRuntime });
}

export const sillyTavernWorldbookReadingRuntimes = createSillyTavernWorldbookReadingRuntimes();
