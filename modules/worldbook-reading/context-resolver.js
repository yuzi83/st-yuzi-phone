import { renderShujukuTemplate } from './shujuku-template-renderer.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isDisabled(entry) {
    return entry?.disable === true || entry?.enabled === false;
}

function isQQProjection(entry) {
    return entry?.extensions?.yuziPhoneQQV2?.version === 2
        || String(entry?.comment ?? '').startsWith('YuziQQ｜');
}

function normalizeWorldbookEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;

    const strategy = asObject(entry.strategy);
    const secondaryStrategy = asObject(strategy.keys_secondary);
    const position = asObject(entry.position);
    const recursion = asObject(entry.recursion);
    const normalized = { ...entry };

    if (normalized.constant === undefined && strategy.type !== undefined) {
        normalized.constant = strategy.type === 'constant';
    }
    if (normalized.selective === undefined && strategy.type !== undefined) {
        normalized.selective = strategy.type === 'selective';
    }
    if (normalized.key === undefined && normalized.keys === undefined && strategy.keys !== undefined) {
        normalized.key = strategy.keys;
    }
    if (normalized.keysecondary === undefined
        && normalized.secondary_keys === undefined
        && normalized.filters === undefined
        && secondaryStrategy.keys !== undefined) {
        normalized.keysecondary = secondaryStrategy.keys;
    }
    if (normalized.logic === undefined && secondaryStrategy.logic !== undefined) {
        normalized.logic = secondaryStrategy.logic;
    }
    if (normalized.depth === undefined && position.depth !== undefined) {
        normalized.depth = position.depth;
    }
    if (normalized.role === undefined && position.role !== undefined) {
        normalized.role = position.role;
    }
    if (normalized.excludeRecursion === undefined
        && normalized.exclude_recursion === undefined
        && recursion.prevent_incoming !== undefined) {
        normalized.excludeRecursion = recursion.prevent_incoming;
    }
    if (normalized.preventRecursion === undefined
        && normalized.prevent_recursion === undefined
        && recursion.prevent_outgoing !== undefined) {
        normalized.preventRecursion = recursion.prevent_outgoing;
    }

    return normalized;
}

function isSelected(selection, bookName, uid) {
    const bookSelection = asObject(asObject(selection)[bookName]);
    return bookSelection[String(uid)] !== false;
}

function entryKeys(entry) {
    return asArray(entry?.key ?? entry?.keys)
        .map((key) => String(key ?? '').trim())
        .filter(Boolean);
}

function secondaryEntryKeys(entry) {
    return asArray(entry?.keysecondary ?? entry?.secondary_keys ?? entry?.filters)
        .map((key) => String(key ?? '').trim())
        .filter(Boolean);
}

function selectiveLogic(entry) {
    const namedLogic = String(entry?.logic ?? '').trim().toLocaleLowerCase();
    const namedValues = {
        and_any: 0,
        not_all: 1,
        not_any: 2,
        and_all: 3,
    };
    return Object.hasOwn(namedValues, namedLogic)
        ? namedValues[namedLogic]
        : Number(entry?.selectiveLogic ?? 0);
}

function isSelectiveEntry(entry) {
    return entry?.selective === true || entry?.type === 'selective';
}

function isConstantEntry(entry) {
    return entry?.constant === true || entry?.type === 'constant';
}

function parseSlashRegex(value) {
    const match = String(value ?? '').match(/^\/((?:\\.|[^/])+)\/([dgimsuvy]*)$/u);
    if (!match) return null;
    try {
        return new RegExp(match[1], match[2]);
    } catch {
        return null;
    }
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKey(entry, key, scanText) {
    const keyRegex = parseSlashRegex(key);
    if (keyRegex) {
        keyRegex.lastIndex = 0;
        return keyRegex.test(scanText);
    }

    const caseSensitive = entry?.caseSensitive === true || entry?.case_sensitive === true;
    const haystack = caseSensitive ? scanText : scanText.toLocaleLowerCase();
    const needle = caseSensitive ? key : key.toLocaleLowerCase();
    const matchWholeWords = entry?.matchWholeWords === true || entry?.match_whole_words === true;
    if (!matchWholeWords || /\s/u.test(needle)) {
        return haystack.includes(needle);
    }
    return new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`, 'u').test(haystack);
}

function matchesAnyKey(entry, keys, scanText) {
    return keys.some((key) => matchesKey(entry, key, scanText));
}

function matchesEntryKeys(entry, scanText) {
    if (!matchesAnyKey(entry, entryKeys(entry), scanText)) return false;
    const secondaryKeys = secondaryEntryKeys(entry);
    if (!isSelectiveEntry(entry) || secondaryKeys.length === 0) return true;

    const matches = secondaryKeys.map((key) => matchesAnyKey(entry, [key], scanText));
    switch (selectiveLogic(entry)) {
        case 1:
            return !matches.every(Boolean);
        case 2:
            return !matches.some(Boolean);
        case 3:
            return matches.every(Boolean);
        case 0:
        default:
            return matches.some(Boolean);
    }
}

function hostMessageText(message) {
    return String(message?.content ?? message?.mes ?? '').trim();
}

function isEligibleHostMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (!hostMessageText(message)) return false;
    if (message.role === 'system' || message.isSystem === true || message.is_system === true) return false;
    if (message.isHidden === true || message.is_hidden === true) return false;
    if (message.extra?.type === 'narrator') return false;
    if (message[Symbol.for('ignore')] === true) return false;
    if (message.isSuccessful === false || message.is_successful === false) return false;
    return true;
}

function latestHostMessageTexts(messages) {
    return asArray(messages)
        .filter(isEligibleHostMessage)
        .slice(-2)
        .map(hostMessageText);
}

function conversationMessageText(message) {
    if (typeof message === 'string') return message.trim();
    return String(message?.content ?? message?.text ?? message?.mes ?? '').trim();
}

function isVisibleConversationMessage(message) {
    if (typeof message === 'string') return message.trim().length > 0;
    if (!message || typeof message !== 'object') return false;
    if (message.deleted === true || message.isDeleted === true || message.deletedAt) return false;
    return conversationMessageText(message).length > 0;
}

function latestConversationMessageTexts(conversations) {
    return asArray(conversations).flatMap((conversation) => asArray(conversation?.messages)
        .filter(isVisibleConversationMessage)
        .slice(-3)
        .map(conversationMessageText));
}

async function loadCandidateEntries({ catalog, loadWorldbooks, readSelection, request }) {
    if (catalog && typeof catalog.load === 'function') {
        const snapshot = await catalog.load(request);
        return asArray(snapshot?.entries)
            .filter((item) => item?.enabled === true && item?.selected === true)
            .map((item) => ({
                bookName: String(item?.ref?.bookName ?? '').trim(),
                entry: normalizeWorldbookEntry(item?.value),
            }));
    }

    const [worldbooks, selection] = await Promise.all([
        loadWorldbooks(request),
        readSelection(request),
    ]);
    return asArray(worldbooks).flatMap((worldbook) => {
        const bookName = String(worldbook?.name ?? '').trim();
        return asArray(worldbook?.entries)
            .filter((entry) => !isDisabled(entry) && isSelected(selection, bookName, entry?.uid))
            .map((entry) => ({ bookName, entry: normalizeWorldbookEntry(entry) }));
    });
}

function candidateDedupeKey(candidate) {
    const bookName = String(candidate?.bookName ?? '').trim();
    const uid = String(candidate?.entry?.uid ?? '').trim();
    return bookName && uid ? `${bookName}\u0000${uid}` : candidate;
}

const KNOWN_DECORATORS = new Set([
    '@@activate',
    '@@dont_activate',
    '@@only_preload',
    '@@preprocessing',
    '@@if',
    '@@private',
    '@@initial_variables',
    '@@generate_before',
    '@@generate_after',
    '@@render_before',
    '@@render_after',
]);

function parseEntryDecorators(content) {
    const text = String(content ?? '');
    const decorators = [];
    let cursor = 0;

    while (text.startsWith('@@', cursor) && !text.startsWith('@@@', cursor)) {
        const lineEnd = text.indexOf('\n', cursor);
        const end = lineEnd === -1 ? text.length : lineEnd;
        const line = text.slice(cursor, end).replace(/\r$/u, '');
        const space = line.indexOf(' ');
        const name = space === -1 ? line : line.slice(0, space);
        if (!KNOWN_DECORATORS.has(name)) break;
        decorators.push(Object.freeze({
            name,
            argument: space === -1 ? '' : line.slice(space + 1),
        }));
        cursor = lineEnd === -1 ? text.length : lineEnd + 1;
    }

    return Object.freeze({
        decorators: Object.freeze(decorators),
        content: text.slice(cursor),
    });
}

async function preprocessEntryCandidates(candidates, templateRuntime, mvuRuntime, request) {
    let contextPromise = null;
    const getContext = async () => {
        if (!contextPromise) {
            contextPromise = typeof templateRuntime?.prepareContext === 'function'
                ? Promise.resolve().then(async () => {
                    const context = await templateRuntime.prepareContext();
                    if (context && typeof context === 'object'
                        && typeof mvuRuntime?.readLatestStatData === 'function') {
                        try {
                            const statData = await mvuRuntime.readLatestStatData(request);
                            if (statData !== undefined && statData !== null) context.mvu = statData;
                        } catch {
                            // MVU is optional; ordinary EJS continues with its base context.
                        }
                    }
                    return context;
                })
                : Promise.reject(new Error('EJS context is unavailable'));
        }
        return contextPromise;
    };
    const result = [];

    for (const candidate of candidates) {
        const parsed = parseEntryDecorators(candidate?.entry?.content);
        const decoratorNames = new Set(parsed.decorators.map(({ name }) => name));
        const comment = String(candidate?.entry?.comment ?? '');
        const special = decoratorNames.has('@@initial_variables')
            || decoratorNames.has('@@only_preload')
            || decoratorNames.has('@@generate_before')
            || decoratorNames.has('@@generate_after')
            || decoratorNames.has('@@render_before')
            || decoratorNames.has('@@render_after')
            || comment.includes('[InitialVariables]')
            || comment.includes('@INJECT')
            || comment.includes('[GENERATE:')
            || comment.includes('[RENDER:');
        if (special || decoratorNames.has('@@dont_activate')) continue;
        const condition = parsed.decorators.find(({ name }) => name === '@@if');
        if (condition) {
            try {
                if (typeof templateRuntime?.evalTemplate !== 'function') continue;
                const context = await getContext();
                const evaluated = await templateRuntime.evalTemplate(
                    `<%- !!(${condition.argument}) %>`,
                    context,
                );
                if (String(evaluated ?? '').trim() !== 'true') continue;
            } catch {
                continue;
            }
        }
        let processedContent = parsed.content;
        let processedKeys = entryKeys(candidate.entry);
        let processedSecondaryKeys = secondaryEntryKeys(candidate.entry);
        if (decoratorNames.has('@@preprocessing')) {
            try {
                if (typeof templateRuntime?.evalTemplate !== 'function') continue;
                const context = await getContext();
                const rendered = await Promise.all([
                    templateRuntime.evalTemplate(processedContent, context),
                    ...processedKeys.map((key) => templateRuntime.evalTemplate(key, context)),
                    ...processedSecondaryKeys.map((key) => templateRuntime.evalTemplate(key, context)),
                ]);
                if (rendered.some((value) => value === null || value === undefined)) continue;
                processedContent = String(rendered[0]);
                processedKeys = rendered
                    .slice(1, 1 + processedKeys.length)
                    .map((value) => String(value));
                processedSecondaryKeys = rendered
                    .slice(1 + processedKeys.length)
                    .map((value) => String(value));
            } catch {
                continue;
            }
        }
        result.push({
            ...candidate,
            entry: {
                ...candidate.entry,
                content: processedContent,
                key: processedKeys,
                keysecondary: processedSecondaryKeys,
            },
            decorators: parsed.decorators,
            forceActivate: decoratorNames.has('@@activate'),
        });
    }

    return Object.freeze({
        candidates: result,
        async renderFinal(candidate) {
            const content = String(candidate?.entry?.content ?? '').trim();
            if (!content || typeof templateRuntime?.evalTemplate !== 'function') return content;
            try {
                const context = await getContext();
                const rendered = await templateRuntime.evalTemplate(content, context);
                return rendered === null || rendered === undefined
                    ? content
                    : String(rendered).trim();
            } catch {
                return content;
            }
        },
    });
}

export function createWorldbookContextResolver({
    catalog,
    loadWorldbooks,
    readSelection,
    templateRuntime,
    mvuRuntime,
    shujukuRuntime,
}) {
    return Object.freeze({
        async resolve(request = {}) {
            let loadedCandidates;
            try {
                loadedCandidates = await loadCandidateEntries({
                    catalog,
                    loadWorldbooks,
                    readSelection,
                    request,
                });
            } catch {
                return '';
            }
            const templateSession = await preprocessEntryCandidates(
                loadedCandidates,
                templateRuntime,
                mvuRuntime,
                request,
            );
            const candidates = templateSession.candidates;
            const scanText = [
                ...latestHostMessageTexts(request.hostMessages),
                ...asArray(request.people),
                ...latestConversationMessageTexts(request.conversations),
            ].join('\n');
            const activated = new Set();
            const activatedKeys = new Set();
            const activatedCandidates = [];
            let recursiveScanText = scanText;

            for (let round = 0; round <= 10; round += 1) {
                const newlyActivated = [];
                for (const candidate of candidates) {
                    if (activated.has(candidate)) continue;
                    const dedupeKey = candidateDedupeKey(candidate);
                    if (activatedKeys.has(dedupeKey)) continue;
                    const entry = candidate.entry;
                    if (isQQProjection(entry)) continue;
                    if (round > 0 && (entry?.excludeRecursion === true || entry?.exclude_recursion === true)) continue;
                    if (candidate.forceActivate !== true
                        && !isConstantEntry(entry)
                        && !matchesEntryKeys(entry, recursiveScanText)) continue;
                    activated.add(candidate);
                    activatedKeys.add(dedupeKey);
                    newlyActivated.push(candidate);
                    activatedCandidates.push(candidate);
                }

                if (newlyActivated.length === 0) break;
                const recursionTexts = newlyActivated
                    .filter(({ entry }) => entry?.preventRecursion !== true && entry?.prevent_recursion !== true)
                    .map(({ entry }) => String(entry?.content ?? '').trim())
                    .filter(Boolean);
                if (recursionTexts.length === 0) break;
                recursiveScanText = [recursiveScanText, ...recursionTexts].filter(Boolean).join('\n');
            }

            const ejsContents = [];
            for (const candidate of activatedCandidates) {
                const content = await templateSession.renderFinal(candidate);
                if (content) ejsContents.push(content);
            }
            if (ejsContents.length === 0) return '';

            const shujukuSession = typeof shujukuRuntime === 'function'
                ? await shujukuRuntime(request)
                : shujukuRuntime;
            const content = await renderShujukuTemplate(ejsContents.join('\n\n'), {
                ...asObject(shujukuSession),
                seedContent: scanText,
            });
            return String(content ?? '').trim();
        },
    });
}
