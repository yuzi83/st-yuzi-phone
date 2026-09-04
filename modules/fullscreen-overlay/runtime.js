function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPlainRecord(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function safeCall(callback, fallback, onError, context) {
    if (typeof callback !== 'function') return fallback;
    try {
        return callback();
    } catch (error) {
        onError(error, context);
        return fallback;
    }
}

function attemptCall(callback, onError, context) {
    try {
        return {
            ok: true,
            value: callback(),
        };
    } catch (error) {
        onError(error, context);
        return {
            ok: false,
            error,
            value: undefined,
        };
    }
}

function cloneSourceSignatures(sourceSignatures) {
    return Object.fromEntries(sourceSignatures.entries());
}

function resolveReviewPlaybackKey(metadata) {
    const reviewResult = isRecord(metadata?.reviewResult) ? metadata.reviewResult : null;
    const sessionKey = String(reviewResult?.sessionKey || '').trim();
    if (!sessionKey) return '';
    return `${String(reviewResult?.chatKey || '').trim()}\u001f${sessionKey}`;
}

function resolveOverlaySettingsValue(value, settingKey) {
    if (!isRecord(value)) return value;
    if (Object.prototype.hasOwnProperty.call(value, settingKey)) {
        return value[settingKey];
    }
    return value;
}

function createSourceContext(snapshot, catalogEntry, rowSelection = null) {
    const sheetKey = String(catalogEntry?.sheetKey || '').trim();
    const sheet = snapshot?.[sheetKey];
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    return {
        ...catalogEntry,
        sheetKey,
        tableName: String(catalogEntry?.tableName || sheet?.name || '').trim(),
        sheet,
        headers: Array.isArray(content[0]) ? content[0] : [],
        rows: content.slice(1),
        rowSelection,
    };
}

function normalizeRendererRegistry(value) {
    if (value instanceof Map) return value;
    if (isRecord(value)) return new Map(Object.entries(value));
    return new Map();
}

function normalizeChangedSheetKeys(value) {
    if (value instanceof Set) {
        return new Set(
            [...value]
                .map(item => String(item || '').trim())
                .filter(Boolean),
        );
    }
    if (!Array.isArray(value)) return new Set();
    return new Set(
        value
            .map(item => String(item || '').trim())
            .filter(Boolean),
    );
}

function normalizeRowSelection(value) {
    const source = isRecord(value) ? value : {};
    const rawRowIndexes = source.rowIndexes instanceof Set
        ? [...source.rowIndexes]
        : (Array.isArray(source.rowIndexes) ? source.rowIndexes : []);
    const rawRowIds = source.rowIds instanceof Set
        ? [...source.rowIds]
        : (Array.isArray(source.rowIds) ? source.rowIds : []);
    return {
        rowIndexes: Array.from(new Set(
            rawRowIndexes
                .map(item => Number(item))
                .filter(item => Number.isInteger(item) && item >= 0),
        )).sort((a, b) => a - b),
        rowIds: Array.from(new Set(
            rawRowIds
                .map(item => String(item ?? '').trim())
                .filter(Boolean),
        )),
    };
}

function resolveChangedRowSelection(changedRowsBySheetKey, sheetKey) {
    const value = changedRowsBySheetKey instanceof Map
        ? changedRowsBySheetKey.get(sheetKey)
        : changedRowsBySheetKey?.[sheetKey];
    return normalizeRowSelection(value);
}

function hasExplicitChangedRowSelections(changedRowsBySheetKey, changedSheetKeys) {
    const isSelectionMap = changedRowsBySheetKey instanceof Map;
    if (!isSelectionMap && !isPlainRecord(changedRowsBySheetKey)) return false;

    return [...changedSheetKeys].every((sheetKey) => {
        const hasSelection = isSelectionMap
            ? changedRowsBySheetKey.has(sheetKey)
            : Object.prototype.hasOwnProperty.call(changedRowsBySheetKey, sheetKey);
        if (!hasSelection) return false;

        const selection = isSelectionMap
            ? changedRowsBySheetKey.get(sheetKey)
            : changedRowsBySheetKey[sheetKey];
        return isPlainRecord(selection);
    });
}

const DEFAULT_COORDINATOR_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 5000]);

function normalizeCoordinatorRetryDelays(value) {
    if (!Array.isArray(value)) return [...DEFAULT_COORDINATOR_RETRY_DELAYS_MS];
    const delays = value
        .map(delay => Number(delay))
        .filter(delay => Number.isFinite(delay) && delay >= 0)
        .map(delay => Math.round(delay));
    return delays.length > 0 ? delays : [...DEFAULT_COORDINATOR_RETRY_DELAYS_MS];
}

/**
 * 全屏浮层的扩展级公共运行时。
 *
 * 设置页只调用这里暴露的动作；透明层、填表订阅与队列不属于小手机窗口，
 * 因此隐藏小手机不会停止此运行时。
 */
export function createFullscreenOverlayRuntime(deps = {}) {
    const settingKey = String(deps.settingKey || 'fullscreenOverlay');
    const normalizeSettings = typeof deps.normalizeSettings === 'function'
        ? deps.normalizeSettings
        : value => (isRecord(value) ? value : {});
    const coordinatorRetryDelaysMs = normalizeCoordinatorRetryDelays(
        deps.coordinatorRetryDelaysMs,
    );
    const setTimeoutFn = typeof deps.setTimeoutFn === 'function'
        ? deps.setTimeoutFn
        : (...args) => globalThis.setTimeout(...args);
    const clearTimeoutFn = typeof deps.clearTimeoutFn === 'function'
        ? deps.clearTimeoutFn
        : (...args) => globalThis.clearTimeout(...args);
    const onError = (error, context = {}) => {
        try {
            deps.logger?.warn?.({
                action: context.action || 'runtime.error',
                message: context.message || '全屏浮层运行时旁路操作失败',
                context,
                error,
            });
        } catch {
            // 浮层与日志均为旁路能力，异常不得向宿主生命周期反向传播。
        }
    };

    let settings = normalizeSettings(
        resolveOverlaySettingsValue(
            safeCall(deps.getSettings, {}, onError, { action: 'settings.read' }),
            settingKey,
        ),
    );
    let started = false;
    let suspended = false;
    let generation = 0;
    let layerRuntime = null;
    let rendererRegistry = new Map();
    let scheduler = null;
    let coordinator = null;
    let coordinatorStarted = false;
    let coordinatorBaselineReady = false;
    let coordinatorRetryTimer = null;
    let coordinatorRetryAttempt = 0;
    let nextCoordinatorRetryDelayMs = null;
    let baselineSyncRetryTimer = null;
    let baselineSyncRetryAttempt = 0;
    let nextBaselineSyncRetryDelayMs = null;
    let awaitingExternalChatResume = false;
    let baselinePromise = null;
    let nextConfirmationToken = 0;
    const sourceSignatures = new Map();
    const pendingBatchConfirmations = new Map();
    const failedBatchConfirmations = new Set();
    const sourceDisposers = new Set();
    let activeReviewPlaybackKey = '';
    const scheduledReviewSheetKeys = new Set();

    function resetReviewPlaybackState() {
        activeReviewPlaybackKey = '';
        scheduledReviewSheetKeys.clear();
    }

    function getRenderer(rendererId) {
        return rendererRegistry.get(String(rendererId || '').trim()) || null;
    }

    function stopRendererLoops(rendererIds, action) {
        for (const rendererId of new Set(rendererIds)) {
            const normalizedRendererId = String(rendererId || '').trim();
            if (!normalizedRendererId) continue;
            safeCall(
                () => getRenderer(normalizedRendererId)?.stopLoop?.(),
                undefined,
                onError,
                { action, rendererId: normalizedRendererId },
            );
        }
    }

    function stopAllRendererLoops(action) {
        stopRendererLoops(rendererRegistry.keys(), action);
    }

    function stopScheduledRendererLoops(batches, action) {
        stopRendererLoops(
            Array.isArray(batches) ? batches.map(batch => batch?.rendererId) : [],
            action,
        );
    }

    function hasEternalLoopEnabled() {
        const models = isRecord(settings?.models) ? settings.models : {};
        return Object.values(models).some(model => (
            isRecord(model) && model.eternalEnabled === true
        ));
    }

    function refreshSettings(value) {
        const wasEnabled = settings.enabled === true;
        const rawValue = arguments.length > 0
            ? value
            : safeCall(deps.getSettings, {}, onError, { action: 'settings.read' });
        settings = normalizeSettings(resolveOverlaySettingsValue(rawValue, settingKey));

        for (const renderer of rendererRegistry.values()) {
            safeCall(
                typeof renderer?.refreshSettings === 'function'
                    ? () => renderer.refreshSettings(settings)
                    : null,
                undefined,
                onError,
                { action: 'renderer.settings.refresh' },
            );
        }

        if (started && wasEnabled !== (settings.enabled === true)) {
            if (settings.enabled === true) {
                activateAutomaticRuntime('settings-enabled');
            } else {
                deactivateAutomaticRuntime('settings-disabled');
            }
        }
        return settings;
    }

    function buildCatalog(snapshot, currentSettings = settings) {
        const result = attemptCall(
            () => deps.buildSourceCatalog?.(snapshot, currentSettings, deps.registry),
            onError,
            { action: 'source-catalog.build' },
        );
        if (!result.ok) {
            return {
                ok: false,
                catalog: [],
            };
        }
        if (!Array.isArray(result.value)) {
            onError(
                new TypeError('全屏浮层来源目录必须返回数组'),
                { action: 'source-catalog.invalid-result' },
            );
            return {
                ok: false,
                catalog: [],
            };
        }
        return {
            ok: true,
            catalog: result.value,
        };
    }

    function resolveAdapter(entry) {
        const result = attemptCall(
            () => deps.registry?.get?.(entry?.sourceId),
            onError,
            {
                action: 'source-adapter.resolve',
                sheetKey: entry?.sheetKey,
                sourceId: entry?.sourceId,
            },
        );
        if (!result.ok || !result.value) {
            if (result.ok) {
                onError(
                    new Error(`未找到全屏浮层来源 Adapter: ${entry?.sourceId || ''}`),
                    {
                        action: 'source-adapter.missing',
                        sheetKey: entry?.sheetKey,
                        sourceId: entry?.sourceId,
                    },
                );
            }
            return {
                ok: false,
                adapter: null,
            };
        }
        return {
            ok: true,
            adapter: result.value,
        };
    }

    function getSourceSignature(adapter, context) {
        if (typeof adapter?.getSignature !== 'function') {
            const error = new TypeError(`来源 Adapter 缺少 getSignature(): ${adapter?.id || ''}`);
            onError(error, {
                action: 'source.signature.missing',
                sheetKey: context.sheetKey,
                sourceId: adapter?.id,
            });
            return {
                ok: false,
                error,
                signature: undefined,
            };
        }
        const result = attemptCall(
            () => adapter.getSignature(context),
            onError,
            {
                action: 'source.signature',
                sheetKey: context.sheetKey,
                sourceId: adapter?.id,
            },
        );
        return {
            ok: result.ok,
            error: result.error,
            signature: result.value,
        };
    }

    function replaceSourceBaseline(snapshot) {
        const catalogResult = buildCatalog(snapshot);
        if (!catalogResult.ok) return false;

        const nextSignatures = new Map();
        for (const entry of catalogResult.catalog) {
            if (!entry?.supported) continue;
            const adapterResult = resolveAdapter(entry);
            if (!adapterResult.ok) return false;
            const context = createSourceContext(snapshot, entry);
            const signatureResult = getSourceSignature(adapterResult.adapter, context);
            if (!signatureResult.ok) return false;
            nextSignatures.set(entry.sheetKey, signatureResult.signature);
        }
        sourceSignatures.clear();
        for (const [sheetKey, signature] of nextSignatures) {
            sourceSignatures.set(sheetKey, signature);
        }
        return true;
    }

    function readSourceEvents(adapter, entry, context) {
        if (typeof adapter?.readEvents !== 'function') {
            const error = new TypeError(`来源 Adapter 缺少 readEvents(): ${adapter?.id || ''}`);
            onError(error, {
                action: 'source.events.missing',
                sheetKey: entry.sheetKey,
                sourceId: entry.sourceId,
            });
            return {
                ok: false,
                error,
                items: [],
            };
        }
        const result = attemptCall(
            () => adapter.readEvents(context),
            onError,
            {
                action: 'source.events.read',
                sheetKey: entry.sheetKey,
                sourceId: entry.sourceId,
            },
        );
        if (!result.ok) {
            return {
                ok: false,
                error: result.error,
                items: [],
            };
        }
        if (!Array.isArray(result.value)) {
            const error = new TypeError('来源 Adapter 的 readEvents() 必须返回数组');
            onError(error, {
                action: 'source.events.invalid-result',
                sheetKey: entry.sheetKey,
                sourceId: entry.sourceId,
            });
            return {
                ok: false,
                error,
                items: [],
            };
        }
        return {
            ok: true,
            items: result.value,
        };
    }

    function createBatch(
        adapter,
        entry,
        context,
        currentSettings = settings,
        confirmation = null,
    ) {
        const eventsResult = readSourceEvents(adapter, entry, context);
        if (!eventsResult.ok) {
            return {
                ok: false,
                batch: null,
            };
        }
        if (eventsResult.items.length === 0) {
            return {
                ok: true,
                batch: null,
            };
        }

        const rendererResult = attemptCall(
            () => String(
                currentSettings?.sourceModelBySheetKey?.[entry.sheetKey]
                || entry.modelId
                || adapter?.modelId
                || '',
            ).trim(),
            onError,
            {
                action: 'source.renderer.resolve',
                sheetKey: entry.sheetKey,
                sourceId: entry.sourceId,
            },
        );
        const rendererId = rendererResult.ok ? rendererResult.value : '';
        if (!rendererResult.ok || !rendererId || !getRenderer(rendererId)) {
            if (rendererResult.ok) {
                onError(
                    new Error(`未找到来源绑定的浮层模型: ${rendererId || '(empty)'}`),
                    {
                        action: 'source.renderer.missing',
                        sheetKey: entry.sheetKey,
                        sourceId: entry.sourceId,
                        rendererId,
                    },
                );
            }
            return {
                ok: false,
                batch: null,
            };
        }

        const modelSettings = currentSettings?.models?.[rendererId] || {};
        const sourceId = String(entry.sourceId || adapter?.id || '').trim();
        if (!sourceId) {
            onError(
                new Error('全屏浮层来源批次缺少 sourceId'),
                {
                    action: 'source.batch.missing-id',
                    sheetKey: entry.sheetKey,
                },
            );
            return {
                ok: false,
                batch: null,
            };
        }
        const batch = {
            sourceId: String(entry.sourceId || adapter?.id || '').trim(),
            sheetKey: entry.sheetKey,
            tableName: context.tableName,
            rendererId,
            items: [...eventsResult.items],
            modelSettings,
            settings: modelSettings,
        };
        if (confirmation) {
            Object.assign(batch, confirmation);
        }
        return {
            ok: true,
            batch,
        };
    }

    async function enqueueExternalSourceEvents(sourceId, events) {
        if (!started
            || awaitingExternalChatResume
            || settings.enabled !== true
            || !Array.isArray(events)
            || events.length === 0) {
            return false;
        }
        refreshSettings();
        if (!started || awaitingExternalChatResume || settings.enabled !== true) return false;
        const catalogResult = buildCatalog({});
        if (!catalogResult.ok) return false;
        const entry = catalogResult.catalog.find(candidate => (
            candidate?.sourceId === sourceId && candidate?.enabled === true
        ));
        if (!entry) return false;
        const adapterResult = resolveAdapter(entry);
        if (!adapterResult.ok) return false;
        const context = {
            ...createSourceContext({}, entry),
            events,
        };
        const batchResult = createBatch(adapterResult.adapter, entry, context);
        if (!batchResult.ok || !batchResult.batch) return false;
        return appendScheduledBatches(
            [batchResult.batch],
            'scheduler.append-external-source',
        );
    }

    function subscribeExternalSources() {
        const adapters = safeCall(
            () => deps.registry?.list?.(),
            [],
            onError,
            { action: 'source-subscriptions.list' },
        );
        for (const adapter of Array.isArray(adapters) ? adapters : []) {
            if (typeof adapter?.subscribe !== 'function') continue;
            const result = attemptCall(
                () => adapter.subscribe(events => enqueueExternalSourceEvents(adapter.id, events)),
                onError,
                {
                    action: 'source-subscription.start',
                    sourceId: adapter.id,
                },
            );
            if (typeof result.value === 'function') sourceDisposers.add(result.value);
        }
    }

    function stopExternalSources() {
        for (const dispose of [...sourceDisposers]) {
            sourceDisposers.delete(dispose);
            safeCall(dispose, undefined, onError, { action: 'source-subscription.stop' });
        }
    }

    function collectSelectedSourceBatches(snapshot, {
        changedOnly = false,
        changedSheetKeys = null,
        changedRowsBySheetKey = null,
        includeBatches = true,
        confirmFailures = false,
        stableGeneration = generation,
        sourceEventsBySheetKey = null,
    } = {}) {
        const hasChangedSheetFilter = changedSheetKeys instanceof Set
            || Array.isArray(changedSheetKeys);
        const changedSheetKeySet = hasChangedSheetFilter
            ? normalizeChangedSheetKeys(changedSheetKeys)
            : null;
        const hasChangedRowScope = changedRowsBySheetKey instanceof Map
            || isRecord(changedRowsBySheetKey);
        const catalogResult = buildCatalog(snapshot);
        if (!catalogResult.ok) {
            return {
                ok: false,
                batches: [],
                nextSignatures: new Map(),
                matchedChangedSourceCount: 0,
                hasEligibleChangedSource: false,
            };
        }

        const nextSignatures = new Map();
        const batches = [];
        let matchedChangedSourceCount = 0;

        for (const entry of catalogResult.catalog) {
            if (!entry?.supported) continue;
            const adapterResult = resolveAdapter(entry);
            if (!adapterResult.ok) {
                if (entry.enabled) {
                    return {
                        ok: false,
                        batches: [],
                        nextSignatures: new Map(),
                        matchedChangedSourceCount,
                        hasEligibleChangedSource: matchedChangedSourceCount > 0,
                    };
                }
                continue;
            }

            const context = createSourceContext(
                snapshot,
                entry,
                hasChangedRowScope
                    ? resolveChangedRowSelection(changedRowsBySheetKey, entry.sheetKey)
                    : null,
            );
            const sourceEvents = sourceEventsBySheetKey instanceof Map
                ? sourceEventsBySheetKey.get(entry.sheetKey)
                : sourceEventsBySheetKey?.[entry.sheetKey];
            if (Array.isArray(sourceEvents)) context.events = sourceEvents;
            const signatureResult = getSourceSignature(adapterResult.adapter, context);
            if (!signatureResult.ok) {
                if (entry.enabled) {
                    return {
                        ok: false,
                        batches: [],
                        nextSignatures: new Map(),
                        matchedChangedSourceCount,
                        hasEligibleChangedSource: matchedChangedSourceCount > 0,
                    };
                }
                continue;
            }
            const signature = signatureResult.signature;
            nextSignatures.set(entry.sheetKey, signature);

            const changed = !sourceSignatures.has(entry.sheetKey)
                || !Object.is(sourceSignatures.get(entry.sheetKey), signature);
            const reviewChanged = changedSheetKeySet === null
                || changedSheetKeySet.has(entry.sheetKey);
            if (hasChangedSheetFilter && entry.enabled && reviewChanged) {
                matchedChangedSourceCount += 1;
            }
            if (!includeBatches
                || !entry.enabled
                || !reviewChanged
                || (changedOnly && !changed)) {
                continue;
            }

            const confirmation = confirmFailures
                ? {
                    sourceSignature: signature,
                    runtimeGeneration: stableGeneration,
                    confirmationToken: ++nextConfirmationToken,
                }
                : null;
            const batchResult = createBatch(
                adapterResult.adapter,
                entry,
                context,
                settings,
                confirmation,
            );
            if (!batchResult.ok) {
                return {
                    ok: false,
                    batches: [],
                    nextSignatures: new Map(),
                    matchedChangedSourceCount,
                    hasEligibleChangedSource: matchedChangedSourceCount > 0,
                };
            }
            if (batchResult.batch) batches.push(batchResult.batch);
        }

        return {
            ok: true,
            batches,
            nextSignatures,
            matchedChangedSourceCount,
            hasEligibleChangedSource: matchedChangedSourceCount > 0,
        };
    }

    function commitSourceSignatures(nextSignatures) {
        sourceSignatures.clear();
        for (const [sheetKey, signature] of nextSignatures) {
            sourceSignatures.set(sheetKey, signature);
        }
    }

    function buildSelectedSourceBatches(snapshot, options = {}) {
        const result = collectSelectedSourceBatches(snapshot, options);
        return result.ok ? result.batches : [];
    }

    async function readTestSourceEvents(snapshot) {
        const catalogResult = buildCatalog(snapshot);
        if (!catalogResult.ok) return new Map();
        const eventsBySheetKey = new Map();
        for (const entry of catalogResult.catalog) {
            if (!entry?.enabled) continue;
            const adapterResult = resolveAdapter(entry);
            if (!adapterResult.ok || typeof adapterResult.adapter?.readTestEvents !== 'function') continue;
            try {
                const events = await adapterResult.adapter.readTestEvents();
                if (Array.isArray(events) && events.length > 0) {
                    eventsBySheetKey.set(entry.sheetKey, events);
                }
            } catch (error) {
                onError(error, {
                    action: 'source.test-events.read',
                    sheetKey: entry.sheetKey,
                    sourceId: entry.sourceId,
                });
            }
        }
        return eventsBySheetKey;
    }

    function clearBatchConfirmations() {
        pendingBatchConfirmations.clear();
        failedBatchConfirmations.clear();
    }

    function registerBatchConfirmations(batches) {
        for (const batch of batches) {
            if (batch?.confirmationToken === undefined) continue;
            pendingBatchConfirmations.set(batch.confirmationToken, {
                sheetKey: batch.sheetKey,
                sourceSignature: batch.sourceSignature,
                runtimeGeneration: batch.runtimeGeneration,
            });
        }
    }

    function releaseBatchConfirmations(batches) {
        for (const batch of batches) {
            if (batch?.confirmationToken === undefined) continue;
            pendingBatchConfirmations.delete(batch.confirmationToken);
            failedBatchConfirmations.delete(batch.confirmationToken);
        }
    }

    function invalidateCoordinatorBaseline(batch, context = {}) {
        safeCall(
            () => coordinator?.invalidateBaseline?.(),
            false,
            onError,
            {
                action: 'coordinator.invalidate-batch-failure',
                sheetKey: batch?.sheetKey,
                sourceId: batch?.sourceId,
                rendererId: batch?.rendererId,
                ...context,
            },
        );
    }

    function handleBatchFailure(_error, batch, context = {}) {
        if (!started
            || suspended
            || batch?.runtimeGeneration !== generation
            || batch?.confirmationToken === undefined) {
            return false;
        }

        const pending = pendingBatchConfirmations.get(batch.confirmationToken);
        const pendingMatches = Boolean(
            pending
            && pending.runtimeGeneration === generation
            && pending.sheetKey === batch.sheetKey
            && Object.is(pending.sourceSignature, batch.sourceSignature),
        );
        const currentMatches = sourceSignatures.has(batch.sheetKey)
            && Object.is(
                sourceSignatures.get(batch.sheetKey),
                batch.sourceSignature,
            );
        if (!pendingMatches && !currentMatches) return false;

        if (pendingMatches) {
            failedBatchConfirmations.add(batch.confirmationToken);
        }
        if (currentMatches) {
            sourceSignatures.delete(batch.sheetKey);
        }
        if (batch?.reviewPlaybackKey
            && batch.reviewPlaybackKey === activeReviewPlaybackKey) {
            scheduledReviewSheetKeys.delete(batch.sheetKey);
        }
        invalidateCoordinatorBaseline(batch, context);
        return true;
    }

    function commitAcceptedSourceSignatures(nextSignatures, batches) {
        commitSourceSignatures(nextSignatures);
        let hasImmediateFailure = false;
        for (const batch of batches) {
            if (!failedBatchConfirmations.has(batch.confirmationToken)) continue;
            hasImmediateFailure = true;
            if (batch.runtimeGeneration === generation
                && sourceSignatures.has(batch.sheetKey)
                && Object.is(
                    sourceSignatures.get(batch.sheetKey),
                    batch.sourceSignature,
                )) {
                sourceSignatures.delete(batch.sheetKey);
            }
        }
        releaseBatchConfirmations(batches);
        return !hasImmediateFailure;
    }

    async function replaceScheduledBatches(batches, action) {
        stopScheduledRendererLoops(batches, action);
        try {
            return await scheduler?.replace?.(batches);
        } catch (error) {
            onError(error, { action });
            return false;
        }
    }

    async function appendScheduledBatches(batches, action) {
        try {
            if (typeof scheduler?.append === 'function') {
                return await scheduler.append(batches);
            }
            return await scheduler?.replace?.(batches);
        } catch (error) {
            onError(error, { action });
            return false;
        }
    }

    async function handleStableSnapshot(snapshot, metadata = {}) {
        if (!started || suspended) return false;
        const stableGeneration = generation;
        const normalizedMetadata = isRecord(metadata) ? metadata : {};
        const hasReviewChangedSheetKeys = Object.prototype.hasOwnProperty.call(
            normalizedMetadata,
            'changedSheetKeys',
        );
        const changedSheetKeys = hasReviewChangedSheetKeys
            ? normalizeChangedSheetKeys(normalizedMetadata.changedSheetKeys)
            : null;
        const changedRowsBySheetKey = Object.prototype.hasOwnProperty.call(
            normalizedMetadata,
            'changedRowsBySheetKey',
        )
            ? normalizedMetadata.changedRowsBySheetKey
            : null;
        const reviewPlaybackKey = hasReviewChangedSheetKeys
            ? resolveReviewPlaybackKey(normalizedMetadata)
            : '';
        const sameReviewFloor = Boolean(
            reviewPlaybackKey
            && reviewPlaybackKey === activeReviewPlaybackKey,
        );
        if (hasReviewChangedSheetKeys
            && !hasExplicitChangedRowSelections(
                changedRowsBySheetKey,
                changedSheetKeys,
            )) {
            return false;
        }
        refreshSettings();
        const collection = collectSelectedSourceBatches(snapshot, {
            changedOnly: !hasReviewChangedSheetKeys,
            changedSheetKeys,
            changedRowsBySheetKey,
            includeBatches: settings.enabled === true,
            confirmFailures: settings.enabled === true,
            stableGeneration,
        });
        if (!collection.ok) return false;
        const {
            batches,
            nextSignatures,
            hasEligibleChangedSource,
        } = collection;

        if (hasReviewChangedSheetKeys && !hasEligibleChangedSource) {
            commitSourceSignatures(nextSignatures);
            return true;
        }

        // 审核已确认表格变化但 Adapter 没有可播文本时，保留现有永恒循环与首轮。
        if (batches.length === 0 && hasEternalLoopEnabled()) {
            commitSourceSignatures(nextSignatures);
            return true;
        }

        const schedulableBatches = sameReviewFloor
            ? batches.filter(batch => !scheduledReviewSheetKeys.has(batch.sheetKey))
            : batches;
        if (sameReviewFloor && schedulableBatches.length === 0) {
            commitSourceSignatures(nextSignatures);
            return true;
        }
        const playbackBatches = reviewPlaybackKey
            ? schedulableBatches.map(batch => ({
                ...batch,
                reviewPlaybackKey,
            }))
            : schedulableBatches;

        if (settings.enabled !== true) {
            const accepted = await replaceScheduledBatches(
                [],
                'scheduler.auto-disabled',
            );
            if (accepted !== true
                || !started
                || suspended
                || stableGeneration !== generation) {
                return false;
            }
            commitSourceSignatures(nextSignatures);
            return true;
        }

        registerBatchConfirmations(playbackBatches);
        const accepted = sameReviewFloor
            ? await appendScheduledBatches(
                playbackBatches,
                'scheduler.append-stable',
            )
            : await replaceScheduledBatches(
                playbackBatches,
                'scheduler.replace-stable',
            );
        if (accepted !== true
            || !started
            || suspended
            || stableGeneration !== generation) {
            releaseBatchConfirmations(playbackBatches);
            return false;
        }
        const committed = commitAcceptedSourceSignatures(
            nextSignatures,
            playbackBatches,
        );
        if (committed && reviewPlaybackKey) {
            if (!sameReviewFloor) {
                activeReviewPlaybackKey = reviewPlaybackKey;
                scheduledReviewSheetKeys.clear();
            }
            playbackBatches.forEach((batch) => {
                scheduledReviewSheetKeys.add(batch.sheetKey);
            });
        }
        return committed;
    }

    function createComponents() {
        layerRuntime = safeCall(
            () => deps.createLayerRuntime?.({
                getSettings: () => settings,
                onError,
            }),
            null,
            onError,
            { action: 'layer.create' },
        );
        rendererRegistry = normalizeRendererRegistry(safeCall(
            () => deps.createRendererRegistry?.({
                layerRuntime,
                getSettings: () => settings,
                onError,
            }),
            new Map(),
            onError,
            { action: 'renderer-registry.create' },
        ));
        scheduler = safeCall(
            () => deps.createScheduler?.({
                resolveRenderer: getRenderer,
                onError,
                onBatchFailure: handleBatchFailure,
            }),
            null,
            onError,
            { action: 'scheduler.create' },
        );
        coordinator = safeCall(
            () => deps.createCoordinator?.({
                onStableSnapshot: handleStableSnapshot,
            }),
            null,
            onError,
            { action: 'coordinator.create' },
        );
        subscribeExternalSources();
    }

    function clearCoordinatorRetryTimer() {
        const timerId = coordinatorRetryTimer;
        coordinatorRetryTimer = null;
        nextCoordinatorRetryDelayMs = null;
        if (timerId === null) return;
        safeCall(
            () => clearTimeoutFn(timerId),
            undefined,
            onError,
            { action: 'coordinator.retry.clear' },
        );
    }

    function clearBaselineSyncRetryTimer() {
        const timerId = baselineSyncRetryTimer;
        baselineSyncRetryTimer = null;
        nextBaselineSyncRetryDelayMs = null;
        if (timerId === null) return;
        safeCall(
            () => clearTimeoutFn(timerId),
            undefined,
            onError,
            { action: 'baseline-sync.retry.clear' },
        );
    }

    function scheduleBaselineSyncRetry(reason) {
        if (!started
            || settings.enabled !== true
            || awaitingExternalChatResume
            || baselineSyncRetryTimer !== null) {
            return false;
        }

        const delayIndex = Math.min(
            baselineSyncRetryAttempt,
            coordinatorRetryDelaysMs.length - 1,
        );
        const delayMs = coordinatorRetryDelaysMs[delayIndex];
        baselineSyncRetryAttempt += 1;
        nextBaselineSyncRetryDelayMs = delayMs;

        const timerResult = attemptCall(
            () => setTimeoutFn(() => {
                baselineSyncRetryTimer = null;
                nextBaselineSyncRetryDelayMs = null;
                if (!started
                    || settings.enabled !== true
                    || awaitingExternalChatResume) return;
                void synchronizeBaseline('baseline-retry');
            }, delayMs),
            onError,
            {
                action: 'baseline-sync.retry.schedule',
                reason,
                attempt: baselineSyncRetryAttempt,
                delayMs,
            },
        );
        if (!timerResult.ok) {
            nextBaselineSyncRetryDelayMs = null;
            return false;
        }
        baselineSyncRetryTimer = timerResult.value;
        return true;
    }

    function synchronizeBaseline(reason, snapshot, hasSnapshot = false) {
        if (!started
            || settings.enabled !== true
            || awaitingExternalChatResume) {
            return Promise.resolve(false);
        }

        clearBaselineSyncRetryTimer();
        const syncGeneration = ++generation;
        suspended = true;
        clearBatchConfirmations();
        refreshSettings();
        if (!started
            || settings.enabled !== true
            || awaitingExternalChatResume
            || syncGeneration !== generation) {
            return Promise.resolve(false);
        }
        if (coordinatorStarted) {
            coordinatorBaselineReady = false;
        }

        const pending = (async () => {
            try {
                const baselineSnapshot = hasSnapshot
                    ? await snapshot
                    : await deps.readSnapshot?.();
                if (!started
                    || settings.enabled !== true
                    || awaitingExternalChatResume
                    || syncGeneration !== generation) {
                    return false;
                }

                if (!isPlainRecord(baselineSnapshot)) return false;
                if (!replaceSourceBaseline(baselineSnapshot)) return false;
                if (coordinatorStarted
                    && typeof coordinator?.resumeWithBaseline === 'function') {
                    const resumed = await coordinator.resumeWithBaseline(baselineSnapshot);
                    if (!started
                        || settings.enabled !== true
                        || awaitingExternalChatResume
                        || syncGeneration !== generation
                        || resumed === false) {
                        return false;
                    }
                }

                if (coordinatorStarted) {
                    coordinatorBaselineReady = true;
                }
                baselineSyncRetryAttempt = 0;
                suspended = false;
                return true;
            } catch (error) {
                onError(error, { action: 'baseline-sync.run', reason });
                return false;
            }
        })();

        const tracked = pending
            .then((synchronized) => {
                if (!synchronized
                    && started
                    && settings.enabled === true
                    && !awaitingExternalChatResume
                    && syncGeneration === generation) {
                    scheduleBaselineSyncRetry(reason);
                }
                return synchronized;
            })
            .finally(() => {
                if (baselinePromise === tracked) {
                    baselinePromise = null;
                }
            });
        baselinePromise = tracked;
        return tracked;
    }

    function scheduleCoordinatorRetry(reason) {
        if (!started
            || settings.enabled !== true
            || coordinatorStarted
            || coordinatorRetryTimer !== null
            || !coordinator) {
            return false;
        }

        const delayIndex = Math.min(
            coordinatorRetryAttempt,
            coordinatorRetryDelaysMs.length - 1,
        );
        const delayMs = coordinatorRetryDelaysMs[delayIndex];
        coordinatorRetryAttempt += 1;
        nextCoordinatorRetryDelayMs = delayMs;

        const timerResult = attemptCall(
            () => setTimeoutFn(() => {
                coordinatorRetryTimer = null;
                nextCoordinatorRetryDelayMs = null;
                if (!started
                    || settings.enabled !== true
                    || coordinatorStarted) return;
                const recovered = attemptCoordinatorStart('availability-retry');
                if (recovered && !awaitingExternalChatResume) {
                    void synchronizeBaseline('coordinator-recovered');
                }
            }, delayMs),
            onError,
            {
                action: 'coordinator.retry.schedule',
                reason,
                attempt: coordinatorRetryAttempt,
                delayMs,
            },
        );
        if (!timerResult.ok) {
            nextCoordinatorRetryDelayMs = null;
            return false;
        }
        coordinatorRetryTimer = timerResult.value;
        return true;
    }

    function attemptCoordinatorStart(reason) {
        if (!started
            || settings.enabled !== true
            || coordinatorStarted) {
            return coordinatorStarted;
        }
        coordinatorStarted = safeCall(
            () => coordinator?.start?.(),
            false,
            onError,
            { action: 'coordinator.start', reason },
        ) === true;
        if (!coordinatorStarted) {
            scheduleCoordinatorRetry(reason);
            return false;
        }

        clearCoordinatorRetryTimer();
        coordinatorBaselineReady = false;
        safeCall(
            () => coordinator?.suspendForChatChange?.(),
            false,
            onError,
            { action: 'coordinator.initial-baseline', reason },
        );
        return true;
    }

    function activateAutomaticRuntime(reason) {
        if (!started || settings.enabled !== true) return false;
        resetReviewPlaybackState();
        awaitingExternalChatResume = false;
        suspended = true;
        coordinatorBaselineReady = false;
        coordinatorRetryAttempt = 0;
        baselineSyncRetryAttempt = 0;
        clearCoordinatorRetryTimer();
        clearBaselineSyncRetryTimer();
        attemptCoordinatorStart(reason);
        void synchronizeBaseline(reason);
        return true;
    }

    function deactivateAutomaticRuntime(reason) {
        clearCoordinatorRetryTimer();
        clearBaselineSyncRetryTimer();
        generation += 1;
        suspended = false;
        awaitingExternalChatResume = false;
        coordinatorBaselineReady = false;
        baselinePromise = null;
        sourceSignatures.clear();
        clearBatchConfirmations();
        resetReviewPlaybackState();
        coordinatorRetryAttempt = 0;
        baselineSyncRetryAttempt = 0;
        stopAllRendererLoops('settings-disabled');
        safeCall(
            () => coordinator?.stop?.(),
            undefined,
            onError,
            { action: 'coordinator.stop-disabled', reason },
        );
        coordinatorStarted = false;
        void replaceScheduledBatches([], 'scheduler.disable-auto');
        return true;
    }

    function resumeAfterChatChange(snapshot) {
        if (!started) return Promise.resolve(false);
        if (settings.enabled !== true) {
            awaitingExternalChatResume = false;
            suspended = false;
            return Promise.resolve(true);
        }
        awaitingExternalChatResume = false;
        baselineSyncRetryAttempt = 0;
        clearBaselineSyncRetryTimer();
        return synchronizeBaseline(
            'chat-change.resume',
            snapshot,
            arguments.length > 0,
        );
    }

    function start(reason = 'enabled') {
        if (started) return true;
        refreshSettings();
        started = true;
        suspended = settings.enabled === true;
        generation += 1;
        sourceSignatures.clear();
        clearBatchConfirmations();
        resetReviewPlaybackState();
        createComponents();

        awaitingExternalChatResume = false;
        coordinatorBaselineReady = false;
        coordinatorRetryAttempt = 0;
        baselineSyncRetryAttempt = 0;
        if (settings.enabled === true) {
            activateAutomaticRuntime(reason);
        }
        return true;
    }

    function suspendForChatChange(chatId = null) {
        if (!started) return false;
        stopAllRendererLoops('chat-change-suspend');
        resetReviewPlaybackState();
        if (settings.enabled !== true) {
            awaitingExternalChatResume = false;
            suspended = false;
            return true;
        }
        clearBaselineSyncRetryTimer();
        baselineSyncRetryAttempt = 0;
        baselinePromise = null;
        awaitingExternalChatResume = true;
        coordinatorBaselineReady = false;
        generation += 1;
        suspended = true;
        sourceSignatures.clear();
        clearBatchConfirmations();

        safeCall(
            () => coordinator?.suspendForChatChange?.(chatId),
            false,
            onError,
            { action: 'chat-change.suspend', chatId },
        );
        // replace([]) 只终止当前来源继续发射并清掉未开始来源；
        // 它不调用 renderer.clear，因此屏幕上已出现的内容可自然结束。
        safeCall(
            () => scheduler?.replace?.([]),
            false,
            onError,
            { action: 'scheduler.chat-change-suspend', chatId },
        );
        return true;
    }

    async function testSelectedSources(snapshot) {
        if (!started) {
            return {
                ok: false,
                reason: 'not-started',
                sourceCount: 0,
                itemCount: 0,
            };
        }

        refreshSettings();
        try {
            const currentSnapshot = arguments.length > 0
                ? await snapshot
                : await deps.readSnapshot?.();
            if (!started) {
                return {
                    ok: false,
                    reason: 'stopped',
                    sourceCount: 0,
                    itemCount: 0,
                };
            }
            const batches = buildSelectedSourceBatches(currentSnapshot, {
                changedOnly: false,
                sourceEventsBySheetKey: await readTestSourceEvents(currentSnapshot),
            });
            if (batches.length === 0) {
                return {
                    ok: false,
                    reason: 'no-selected-supported-source',
                    sourceCount: 0,
                    itemCount: 0,
                };
            }

            const accepted = await replaceScheduledBatches(
                batches,
                'scheduler.test-selected',
            );
            return {
                ok: accepted !== false,
                sourceCount: batches.length,
                itemCount: batches.reduce((total, batch) => total + batch.items.length, 0),
            };
        } catch (error) {
            onError(error, { action: 'test-selected-sources' });
            return {
                ok: false,
                reason: 'snapshot-unavailable',
                sourceCount: 0,
                itemCount: 0,
            };
        }
    }

    function clear() {
        stopAllRendererLoops('clear');
        safeCall(
            () => scheduler?.clear?.(),
            undefined,
            onError,
            { action: 'scheduler.clear' },
        );
        safeCall(
            () => layerRuntime?.clear?.(),
            undefined,
            onError,
            { action: 'layer.clear' },
        );
        return true;
    }

    function stop(reason = 'disabled') {
        clearCoordinatorRetryTimer();
        clearBaselineSyncRetryTimer();
        stopExternalSources();
        if (!started && !coordinator && !scheduler && !layerRuntime) return true;
        started = false;
        suspended = false;
        awaitingExternalChatResume = false;
        generation += 1;
        sourceSignatures.clear();
        clearBatchConfirmations();
        resetReviewPlaybackState();
        baselinePromise = null;
        stopAllRendererLoops('stop');

        safeCall(
            () => coordinator?.stop?.(),
            undefined,
            onError,
            { action: 'coordinator.stop', reason },
        );
        safeCall(
            () => scheduler?.dispose?.(),
            undefined,
            onError,
            { action: 'scheduler.dispose', reason },
        );
        safeCall(
            () => layerRuntime?.dispose?.(),
            undefined,
            onError,
            { action: 'layer.dispose', reason },
        );

        coordinatorStarted = false;
        coordinatorBaselineReady = false;
        coordinatorRetryAttempt = 0;
        baselineSyncRetryAttempt = 0;
        coordinator = null;
        scheduler = null;
        rendererRegistry = new Map();
        layerRuntime = null;
        return true;
    }

    function getState() {
        const disabled = started && settings.enabled !== true;
        return {
            started,
            disabled,
            suspended,
            generation,
            settings,
            sourceSignatures: cloneSourceSignatures(sourceSignatures),
            hasPendingBaseline: Boolean(baselinePromise),
            coordinatorStarted,
            coordinatorBaselineReady,
            coordinatorStatus: !started
                ? 'stopped'
                : (disabled
                    ? 'disabled'
                    : (awaitingExternalChatResume
                    ? 'suspended'
                    : (!coordinatorStarted
                        ? 'waiting'
                        : (coordinatorBaselineReady && !suspended
                            ? 'ready'
                            : 'synchronizing')))),
            coordinatorRetryAttempt,
            hasCoordinatorRetryTimer: coordinatorRetryTimer !== null,
            nextCoordinatorRetryDelayMs,
            awaitingExternalChatResume,
            baselineSyncRetryAttempt,
            hasBaselineSyncRetryTimer: baselineSyncRetryTimer !== null,
            nextBaselineSyncRetryDelayMs,
            coordinator: coordinator?.getState?.() || null,
            scheduler: scheduler?.getState?.() || null,
            layer: layerRuntime?.getState?.()
                || {
                    mounted: Boolean(layerRuntime?.isMounted?.()),
                    disposed: Boolean(layerRuntime?.isDisposed?.()),
                },
        };
    }

    return Object.freeze({
        start,
        stop,
        suspendForChatChange,
        resumeAfterChatChange,
        refreshSettings,
        testSelectedSources,
        clear,
        getState,
    });
}
