import { normalizeTableContentReplacementSettings } from '../../table-content-replacement/config.js';
import { buildTableContentReplacementPageHtml } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';

function asText(value) {
    return String(value ?? '');
}

function asId(value) {
    return asText(value).trim();
}

function cloneConfig(value) {
    return normalizeTableContentReplacementSettings(value);
}

function createUniqueId(prefix, usedIds = new Set()) {
    const safePrefix = asId(prefix) || 'item';
    let candidate = '';
    try {
        candidate = `${safePrefix}_${globalThis.crypto?.randomUUID?.() || ''}`.replace(/_$/u, '');
    } catch {
        candidate = '';
    }
    if (!candidate) candidate = `${safePrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let index = 1;
    const original = candidate;
    while (usedIds.has(candidate)) {
        candidate = `${original}_${index}`;
        index += 1;
    }
    return candidate;
}

function createNewRule(prefix, existingRules = []) {
    const usedIds = new Set(existingRules.map(rule => asId(rule?.id)).filter(Boolean));
    return {
        id: createUniqueId(prefix, usedIds),
        source: '',
        target: '',
    };
}

function createNewMapping(table, existingMappings = []) {
    const usedIds = new Set(existingMappings.map(mapping => asId(mapping?.mappingId)).filter(Boolean));
    return {
        mappingId: createUniqueId('mapping', usedIds),
        sheetKey: asId(table?.sheetKey),
        tableNameSnapshot: asText(table?.tableName || table?.name).trim(),
        enabled: false,
        rules: [],
    };
}

function findTableRule(config, mappingId) {
    const safeMappingId = asId(mappingId);
    return config.tableRules.find(area => asId(area?.mappingId) === safeMappingId) || null;
}

function getRuleList(config, scope, mappingId) {
    if (scope === 'table') return findTableRule(config, mappingId)?.rules || null;
    return config.global.rules;
}

function findRule(config, scope, mappingId, ruleId) {
    const rules = getRuleList(config, scope, mappingId);
    if (!rules) return null;
    return rules.find(rule => asId(rule?.id) === asId(ruleId)) || null;
}

function clearScopeError(errors, scope, mappingId) {
    const next = {
        ...errors,
        global: scope === 'global' ? [] : errors.global,
        mappings: { ...(errors.mappings || {}) },
    };
    if (scope === 'table') delete next.mappings[asId(mappingId)];
    return next;
}

function mergeSavedScope(draft, savedConfig, kind, mappingId) {
    const next = cloneConfig(draft);
    const saved = cloneConfig(savedConfig);
    if (kind === 'global') {
        next.global = saved.global;
        return next;
    }
    const safeMappingId = asId(mappingId);
    const savedArea = findTableRule(saved, safeMappingId);
    const index = next.tableRules.findIndex(area => asId(area?.mappingId) === safeMappingId);
    if (savedArea && index >= 0) next.tableRules[index] = savedArea;
    else if (savedArea && index < 0) next.tableRules.push(savedArea);
    return next;
}

function getTargetEmptyRuleCount(area) {
    return Array.isArray(area?.rules)
        ? area.rules.filter(rule => asText(rule?.source).length > 0 && asText(rule?.target).length === 0).length
        : 0;
}

function getResultErrorMessage(result, fallback) {
    const code = asId(result?.code);
    if (code === 'settings_save_failed') return '设置保存失败，请稍后重试。';
    if (code === 'mapping_missing') return '找不到要保存的单表区域。';
    if (code === 'apply_failed' || code === 'table_data_unavailable') return '规则已保存，但当前表格暂时无法应用。';
    return asText(result?.message).trim() || fallback;
}

function buildInitialPageState(service) {
    const config = typeof service?.readConfig === 'function'
        ? service.readConfig()
        : normalizeTableContentReplacementSettings(null);
    return {
        status: 'loading',
        error: null,
        tables: [],
        tableRules: [],
        activeConfig: cloneConfig(config),
        draft: cloneConfig(config),
        errors: { global: [], mappings: {} },
        busy: false,
    };
}

export function createTableContentReplacementPage(ctx) {
    const service = ctx.tableContentReplacementSettingsService;
    const state = buildInitialPageState(service);
    let active = false;
    let generation = 0;
    let detachEvents = () => {};

    const isActive = token => active && (token === undefined || token === generation);
    const notify = (message, isError = false) => {
        ctx.showToast?.(ctx.container, message, isError, ctx.pageRuntime);
    };

    const buildViewModel = () => ({
        status: state.status,
        error: state.error,
        config: state.draft,
        activeConfig: state.activeConfig,
        tables: state.tables,
        tableRules: state.tableRules,
        errors: state.errors,
        busy: state.busy,
    });

    const paint = () => {
        if (!isActive()) return;
        detachEvents();
        ctx.container.innerHTML = buildTableContentReplacementPageHtml(buildViewModel());
        attachEvents();
    };

    const repaint = () => {
        if (typeof ctx.rerenderTableContentReplacementKeepScroll === 'function') {
            ctx.rerenderTableContentReplacementKeepScroll();
            return;
        }
        paint();
    };

    const updateRule = (scope, mappingId, ruleId, field, value) => {
        if (field !== 'source' && field !== 'target') return;
        const rule = findRule(state.draft, scope, mappingId, ruleId);
        if (!rule) return;
        rule[field] = asText(value);
        state.errors = clearScopeError(state.errors, scope, mappingId);
    };

    const moveRule = (scope, mappingId, ruleId, direction) => {
        const rules = getRuleList(state.draft, scope, mappingId);
        if (!rules) return;
        const index = rules.findIndex(rule => asId(rule?.id) === asId(ruleId));
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || nextIndex < 0 || nextIndex >= rules.length) return;
        [rules[index], rules[nextIndex]] = [rules[nextIndex], rules[index]];
        state.errors = clearScopeError(state.errors, scope, mappingId);
        repaint();
    };

    const addRule = (scope, mappingId) => {
        const rules = getRuleList(state.draft, scope, mappingId);
        if (!rules) return;
        rules.push(createNewRule(scope === 'table' ? 'table_rule' : 'global_rule', rules));
        state.errors = clearScopeError(state.errors, scope, mappingId);
        repaint();
    };

    const deleteRule = (scope, mappingId, ruleId) => {
        const rules = getRuleList(state.draft, scope, mappingId);
        if (!rules) return;
        const index = rules.findIndex(rule => asId(rule?.id) === asId(ruleId));
        if (index < 0) return;
        rules.splice(index, 1);
        state.errors = clearScopeError(state.errors, scope, mappingId);
        repaint();
    };

    const toggleArea = (scope, mappingId, enabled) => {
        if (scope === 'global') {
            state.draft.global.enabled = enabled === true;
            return;
        }
        const area = findTableRule(state.draft, mappingId);
        if (area) area.enabled = enabled === true;
    };

    const addTable = () => {
        const select = ctx.container.querySelector('#phone-table-content-replacement-table-select');
        const sheetKey = asId(select?.value);
        if (!sheetKey) return;
        if (state.draft.tableRules.some(area => asId(area?.sheetKey) === sheetKey)) return;
        const table = state.tables.find(item => asId(item?.sheetKey) === sheetKey);
        if (!table) return;
        state.draft.tableRules.push(createNewMapping(table, state.draft.tableRules));
        repaint();
    };

    const saveArea = async (kind, mappingId = '') => {
        if (!isActive() || state.busy) return;
        const area = kind === 'global' ? state.draft.global : findTableRule(state.draft, mappingId);
        if (!area) return;

        state.busy = true;
        repaint();
        const draftSnapshot = cloneConfig(state.draft);
        let result;
        try {
            result = await service.saveArea({ kind, mappingId, config: draftSnapshot });
        } catch {
            result = { ok: false, code: 'settings_save_failed', errors: [] };
        }
        if (!isActive()) return;

        state.busy = false;
        if (result?.config) {
            state.activeConfig = mergeSavedScope(state.activeConfig, result.config, kind, mappingId);
            state.draft = mergeSavedScope(state.draft, result.config, kind, mappingId);
        }
        if (result?.ok === true) {
            state.errors = clearScopeError(state.errors, kind === 'global' ? 'global' : 'table', mappingId);
            repaint();
            const changedCellCount = Number(result.changedCellCount) || 0;
            if (changedCellCount > 0) notify(`已替换 ${changedCellCount} 个单元格`);
            return;
        }

        if (result?.code === 'validation_failed') {
            const validationErrors = Array.isArray(result.errors) ? result.errors : [];
            if (kind === 'global') state.errors = { ...state.errors, global: validationErrors };
            else state.errors = {
                ...state.errors,
                mappings: { ...(state.errors.mappings || {}), [asId(mappingId)]: { rules: validationErrors } },
            };
            repaint();
            return;
        }

        repaint();
        notify(getResultErrorMessage(result, '保存表格内容替换规则失败。'), true);
    };

    const requestSave = (kind, mappingId = '') => {
        const area = kind === 'global' ? state.draft.global : findTableRule(state.draft, mappingId);
        if (!area) return;
        const emptyTargetCount = getTargetEmptyRuleCount(area);
        if (emptyTargetCount <= 0) {
            void saveArea(kind, mappingId);
            return;
        }

        showConfirmDialog(
            ctx.container,
            '确认删除匹配文本？',
            `本区域有 ${emptyTargetCount} 条规则的“替换为”为空，保存后会删除匹配到的文字。是否继续？`,
            () => { void saveArea(kind, mappingId); },
            '继续保存',
            '取消',
            ctx.pageRuntime,
        );
    };

    const deleteTable = (mappingId) => {
        if (state.busy) return;
        const area = findTableRule(state.draft, mappingId);
        if (!area) return;
        showConfirmDialog(
            ctx.container,
            '删除单表替换区域？',
            `将删除“${asText(area.tableNameSnapshot).trim() || asId(area.sheetKey) || '此表'}”的替换配置，不会回滚已经写入表格的数据。`,
            async () => {
                if (!isActive() || state.busy) return;
                const nextDraft = cloneConfig(state.draft);
                nextDraft.tableRules = nextDraft.tableRules.filter(item => asId(item?.mappingId) !== asId(mappingId));
                state.busy = true;
                repaint();
                let result;
                try {
                    result = await service.deleteArea({ mappingId, config: nextDraft });
                } catch {
                    result = { ok: false, code: 'settings_save_failed' };
                }
                if (!isActive()) return;
                state.busy = false;
                if (result?.ok === true) {
                    if (result?.config) state.activeConfig = cloneConfig(result.config);
                    else {
                        const nextActiveConfig = cloneConfig(state.activeConfig);
                        nextActiveConfig.tableRules = nextActiveConfig.tableRules.filter(
                            item => asId(item?.mappingId) !== asId(mappingId),
                        );
                        state.activeConfig = nextActiveConfig;
                    }
                    state.draft = nextDraft;
                    state.tableRules = state.tableRules.filter(item => asId(item?.mappingId) !== asId(mappingId));
                    state.errors = {
                        ...state.errors,
                        mappings: Object.fromEntries(
                            Object.entries(state.errors.mappings || {}).filter(([key]) => key !== asId(mappingId)),
                        ),
                    };
                    repaint();
                    notify('单表替换区域已删除');
                    return;
                }
                repaint();
                notify(getResultErrorMessage(result, '删除单表替换区域失败。'), true);
            },
            '确认删除',
            '取消',
            ctx.pageRuntime,
        );
    };

    const handleClick = (event) => {
        const target = event?.target;
        if (!target || typeof target.closest !== 'function') return;
        if (target.closest('.phone-nav-back')) {
            ctx.navigateBack?.();
            return;
        }
        const control = target.closest('[data-action]');
        if (!control) return;
        const action = asId(control.dataset?.action);
        const scope = control.dataset?.areaScope === 'table' ? 'table' : 'global';
        const mappingId = asId(control.dataset?.mappingId);
        const ruleId = asId(control.dataset?.ruleId);
        if (action === 'add-global-rule') return addRule('global', '');
        if (action === 'add-table-rule') return addRule('table', mappingId);
        if (action === 'delete-rule') return deleteRule(scope, mappingId, ruleId);
        if (action === 'move-rule-up') return moveRule(scope, mappingId, ruleId, 'up');
        if (action === 'move-rule-down') return moveRule(scope, mappingId, ruleId, 'down');
        if (action === 'add-table') return addTable();
        if (action === 'delete-table') return deleteTable(mappingId);
        if (action === 'save-global') return requestSave('global', '');
        if (action === 'save-table') return requestSave('table', mappingId);
    };

    const handleInput = (event) => {
        const target = event?.target;
        if (!target || typeof target.closest !== 'function') return;
        const control = target.closest('[data-action="update-rule"]');
        if (!control) return;
        updateRule(
            control.dataset?.areaScope === 'table' ? 'table' : 'global',
            asId(control.dataset?.mappingId),
            asId(control.dataset?.ruleId),
            asId(control.dataset?.field),
            target.value,
        );
    };

    const handleChange = (event) => {
        const target = event?.target;
        if (!target || typeof target.closest !== 'function') return;
        const action = asId(target.dataset?.action);
        if (action === 'toggle-global') toggleArea('global', '', target.checked === true);
        if (action === 'toggle-table') toggleArea('table', asId(target.dataset?.mappingId), target.checked === true);
    };

    function attachEvents() {
        const cleanups = [];
        const add = (target, type, listener) => {
            if (ctx.pageRuntime?.addEventListener) {
                const cleanup = ctx.pageRuntime.addEventListener(target, type, listener);
                if (typeof cleanup === 'function') cleanups.push(cleanup);
                return;
            }
            if (!target?.addEventListener) return;
            target.addEventListener(type, listener);
            cleanups.push(() => target.removeEventListener(type, listener));
        };
        add(ctx.container, 'click', handleClick);
        add(ctx.container, 'input', handleInput);
        add(ctx.container, 'change', handleChange);
        detachEvents = () => {
            while (cleanups.length > 0) cleanups.pop()?.();
        };
    }

    async function load() {
        const token = ++generation;
        state.status = 'loading';
        state.error = null;
        repaint();
        let viewModel;
        try {
            viewModel = await service.loadViewModel();
        } catch (error) {
            viewModel = {
                status: 'error',
                error,
                config: state.draft,
                tables: [],
                tableRules: [],
                errors: {},
            };
        }
        if (!isActive(token)) return;
        state.status = asId(viewModel?.status) || 'error';
        state.error = viewModel?.error || null;
        state.tables = Array.isArray(viewModel?.tables) ? viewModel.tables : [];
        state.tableRules = Array.isArray(viewModel?.tableRules) ? viewModel.tableRules : [];
        state.activeConfig = cloneConfig(viewModel?.config || state.activeConfig);
        state.draft = cloneConfig(state.activeConfig);
        state.errors = { global: [], mappings: {} };
        repaint();
    }

    return {
        mount() {
            active = true;
            paint();
            void load();
        },
        update() {
            paint();
        },
        dispose() {
            active = false;
            generation += 1;
            detachEvents();
            detachEvents = () => {};
        },
    };
}

export function renderTableContentReplacementPage(ctx) {
    const page = createTableContentReplacementPage(ctx);
    page.mount();
    ctx.pageRuntime?.registerCleanup?.(() => page.dispose());
}
