import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildSettingsPageFrame, buildSettingsSectionHtml } from '../layout/primitives.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';

function asText(value) {
    return String(value || '').trim();
}

function isReadOnlyPreset(preset) {
    return preset?.readOnly === true;
}

function createDraft(preset = {}) {
    return {
        presetId: asText(preset.presetId),
        name: asText(preset.name),
        endpoint: asText(preset.endpoint),
        apiKey: '',
        model: asText(preset.model),
        temperature: Number.isFinite(Number(preset.temperature)) ? Number(preset.temperature) : 1,
        maxOutput: Number.isFinite(Number(preset.maxOutput)) ? Number(preset.maxOutput) : 4096,
        hasApiKey: preset.hasApiKey === true,
        readOnly: isReadOnlyPreset(preset),
    };
}

function createNewDraft() {
    return createDraft({
        name: '新建 API 预设',
        temperature: 1,
        maxOutput: 4096,
    });
}

function getErrorMessage(result, fallback) {
    return asText(result?.error?.message)
        || asText(typeof result?.error === 'string' ? result.error : '')
        || asText(result?.message)
        || fallback;
}

function buildPresetOptions(presets, selectedPresetId) {
    const selectedId = asText(selectedPresetId);
    return [
        `<option value="" ${selectedId ? '' : 'selected'}>请选择 API 预设</option>`,
        ...(Array.isArray(presets) ? presets : []).map((preset) => {
            const presetId = asText(preset?.presetId);
            const readOnly = isReadOnlyPreset(preset);
            const label = `${preset?.name || '未命名预设'}${readOnly ? '（只读）' : ''}`;
            return `<option value="${escapeHtmlAttr(presetId)}" ${presetId === selectedId ? 'selected' : ''} ${readOnly ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
        }),
    ].join('');
}

function buildModelOptions(models, selectedModel) {
    const availableModels = (Array.isArray(models) ? models : []).map(asText).filter(Boolean);
    const selected = asText(selectedModel);
    const hasSelectedModel = availableModels.includes(selected);
    return [
        `<option value="" ${hasSelectedModel ? '' : 'selected'}>请选择模型</option>`,
        ...availableModels.map(model => `<option value="${escapeHtmlAttr(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(model)}</option>`),
    ].join('');
}

function buildApiPresetsPageHtml(pageState) {
    const draft = pageState.draft || createNewDraft();
    const models = Array.isArray(pageState.models) ? pageState.models : [];
    const disabled = pageState.loading || pageState.busy ? 'disabled' : '';
    const editorDisabled = pageState.loading || pageState.busy || draft.readOnly ? 'disabled' : '';
    const canEditDraft = !pageState.loading && !pageState.busy && !draft.readOnly;
    const status = pageState.error
        ? `<div class="phone-settings-inline-status is-danger"><span class="phone-settings-inline-status-text">${escapeHtml(pageState.error)}</span></div>`
        : pageState.loading
            ? '<div class="phone-settings-note">正在读取 API 预设...</div>'
            : '';
    const modelStatus = pageState.modelError
        ? `<div class="phone-settings-inline-status is-danger"><span class="phone-settings-inline-status-text">${escapeHtml(pageState.modelError)}</span></div>`
        : pageState.modelLoading
            ? '<div class="phone-settings-note">正在加载模型...</div>'
            : pageState.modelsLoaded
                ? `<div class="phone-settings-note">${models.length ? `已加载 ${models.length} 个模型` : '未识别到可用模型'}</div>`
                : '';
    const presetSection = buildSettingsSectionHtml({
        title: 'API 预设',
        bodyHtml: `
            ${status}
            <label class="phone-ai-preset-segment-field">
                <span>选择预设</span>
                <select id="phone-api-preset-select" class="phone-settings-select" ${disabled}>${buildPresetOptions(pageState.presets, pageState.selectedPresetId)}</select>
            </label>
            <div class="phone-settings-action-row">
                <button type="button" class="phone-settings-btn" id="phone-api-preset-new-btn" ${disabled}>新建 API 预设</button>
            </div>
        `,
    });
    const editorSection = buildSettingsSectionHtml({
        title: draft.presetId ? '编辑 API 预设' : '新建 API 预设',
        bodyHtml: `
            <div class="phone-ai-preset-toolbar">
                <label class="phone-ai-preset-segment-field"><span>名称</span><input id="phone-api-preset-name" class="phone-settings-input" maxlength="120" value="${escapeHtmlAttr(draft.name)}" ${editorDisabled}></label>
                <label class="phone-ai-preset-segment-field"><span>API 地址</span><input id="phone-api-preset-endpoint" class="phone-settings-input" maxlength="2048" value="${escapeHtmlAttr(draft.endpoint)}" placeholder="https://api.example.com/v1" ${editorDisabled}></label>
                <div class="phone-settings-note">支持 OpenAI 兼容接口；本机示例：<code>http://127.0.0.1:端口/v1</code>，局域网示例：<code>http://192.168.1.50:端口/v1</code>。局域网 HTTP 仅限受信任网络。</div>
                <label class="phone-ai-preset-segment-field"><span>API 密钥${draft.hasApiKey ? '（留空保持已有密钥）' : ''}</span><input id="phone-api-preset-key" type="password" class="phone-settings-input" autocomplete="off" ${editorDisabled}></label>
                <label class="phone-ai-preset-segment-field"><span>手写模型</span><input id="phone-api-preset-model" class="phone-settings-input" maxlength="256" value="${escapeHtmlAttr(draft.model)}" ${editorDisabled}></label>
                ${models.length ? `<label class="phone-ai-preset-segment-field"><span>模型列表</span><select id="phone-api-preset-model-list" class="phone-settings-select" ${editorDisabled}>${buildModelOptions(models, draft.model)}</select></label>` : ''}
                ${modelStatus}
                <label class="phone-ai-preset-segment-field"><span>温度</span><input id="phone-api-preset-temperature" type="number" class="phone-settings-input" min="0" max="2" step="0.01" value="${escapeHtmlAttr(draft.temperature)}" ${editorDisabled}></label>
                <label class="phone-ai-preset-segment-field"><span>最大输出</span><input id="phone-api-preset-max-output" type="number" class="phone-settings-input" min="1" step="1" value="${escapeHtmlAttr(draft.maxOutput)}" ${editorDisabled}></label>
            </div>
            <div class="phone-settings-action-row">
                <button type="button" class="phone-settings-btn" id="phone-api-preset-load-models-btn" ${editorDisabled}>加载模型</button>
                <button type="button" class="phone-settings-btn phone-settings-btn-primary" id="phone-api-preset-save-btn" ${editorDisabled}>保存预设</button>
                <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-api-preset-delete-btn" ${draft.presetId && canEditDraft ? '' : 'disabled'}>删除预设</button>
            </div>
        `,
    });
    return buildSettingsPageFrame({
        title: 'API 预设',
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml: `${presetSection}${editorSection}`,
    });
}

function createApiPresetSession(ctx) {
    const state = {
        loading: true,
        busy: false,
        error: '',
        presets: [],
        selectedPresetId: '',
        draft: createNewDraft(),
        models: [],
        modelLoading: false,
        modelsLoaded: false,
        modelError: '',
    };
    let active = false;
    let generation = 0;
    const isCurrent = token => active && token === generation;
    const repaint = () => {
        if (!active) return;
        if (typeof ctx.rerenderApiPresetsKeepScroll === 'function') {
            ctx.rerenderApiPresetsKeepScroll();
            return;
        }
        ctx.render?.();
    };
    const notify = (message, isError = false) => ctx.showToast?.(ctx.container, message, isError, ctx.pageRuntime);
    const findPreset = id => state.presets.find(preset => asText(preset?.presetId) === asText(id)) || null;

    const load = async (selectedPresetId = state.selectedPresetId, repaintLoading = true) => {
        const token = ++generation;
        state.loading = true;
        state.error = '';
        state.models = [];
        state.modelLoading = false;
        state.modelsLoaded = false;
        state.modelError = '';
        if (repaintLoading) repaint();
        const result = await ctx.qqV2PresetService.readSharedResources();
        if (!isCurrent(token)) return false;
        state.loading = false;
        if (result?.ok !== true) {
            state.error = getErrorMessage(result, '读取 API 预设失败');
            repaint();
            return false;
        }
        state.presets = Array.isArray(result.apiPresets) ? result.apiPresets : [];
        const selected = findPreset(selectedPresetId) || findPreset(state.selectedPresetId);
        state.selectedPresetId = asText(selected?.presetId);
        state.draft = selected ? createDraft(selected) : createNewDraft();
        repaint();
        return true;
    };

    const select = (presetId) => {
        if (state.busy) return;
        const preset = findPreset(presetId);
        if (isReadOnlyPreset(preset)) return false;
        state.selectedPresetId = asText(preset?.presetId);
        state.draft = preset ? createDraft(preset) : createNewDraft();
        state.models = [];
        state.modelLoading = false;
        state.modelsLoaded = false;
        state.modelError = '';
        repaint();
        return true;
    };

    const save = async (draft) => {
        if (!active || state.busy || state.draft.readOnly || draft?.readOnly === true) return false;
        state.busy = true;
        state.draft = { ...state.draft, ...draft };
        const preset = {
            ...(state.draft.presetId ? { id: state.draft.presetId } : {}),
            name: asText(state.draft.name),
            endpoint: asText(state.draft.endpoint),
            model: asText(state.draft.model),
            temperature: Number(state.draft.temperature),
            maxOutput: Number(state.draft.maxOutput),
            ...(asText(state.draft.apiKey) ? { apiKey: asText(state.draft.apiKey) } : {}),
        };
        const result = await ctx.qqV2PresetService.saveApiPreset({ preset });
        if (!active) return false;
        state.busy = false;
        if (result?.ok !== true) {
            notify(getErrorMessage(result, '保存 API 预设失败'), true);
            repaint();
            return false;
        }
        notify('API 预设已保存');
        return load(result.apiPreset?.presetId, false);
    };

    const remove = async () => {
        if (!active || state.busy || state.draft.readOnly || !state.draft.presetId) return false;
        state.busy = true;
        const result = await ctx.qqV2PresetService.deleteApiPreset({ apiPresetId: state.draft.presetId });
        if (!active) return false;
        state.busy = false;
        if (result?.ok !== true) {
            notify(getErrorMessage(result, '删除 API 预设失败'), true);
            repaint();
            return false;
        }
        notify('API 预设已删除');
        return load('', false);
    };

    const loadModels = async (draft) => {
        if (!active || state.busy || state.draft.readOnly || draft?.readOnly === true) return false;
        state.draft = { ...state.draft, ...draft };
        state.busy = true;
        state.models = [];
        state.modelLoading = true;
        state.modelsLoaded = false;
        state.modelError = '';
        repaint();
        const result = await ctx.qqV2PresetService.loadModels({
            apiPresetId: state.draft.presetId,
            draft: state.draft,
        });
        if (!active) return false;
        state.busy = false;
        state.modelLoading = false;
        if (result?.ok !== true || result.modelState?.ok !== true) {
            state.modelError = getErrorMessage(result?.modelState, getErrorMessage(result, '加载模型失败'));
            notify(state.modelError, true);
            repaint();
            return false;
        }
        state.models = [...new Set((Array.isArray(result.modelState.models) ? result.modelState.models : [])
            .map(asText)
            .filter(Boolean))];
        if (!state.draft.model && result.modelState.manualModel) state.draft.model = result.modelState.manualModel;
        state.modelsLoaded = true;
        notify(state.models.length ? `已加载 ${state.models.length} 个模型` : '未识别到可用模型');
        repaint();
        return true;
    };

    return {
        state,
        activate() { active = true; },
        deactivate() { active = false; generation += 1; },
        load,
        select,
        newPreset() {
            if (state.busy) return;
            state.selectedPresetId = '';
            state.draft = createNewDraft();
            state.models = [];
            state.modelLoading = false;
            state.modelsLoaded = false;
            state.modelError = '';
            repaint();
        },
        save,
        remove,
        loadModels,
    };
}

function bindApiPresetInteractions(ctx, session) {
    const { container, state, render, pageRuntime } = ctx;
    const addListener = (target, type, listener) => pageRuntime?.addEventListener?.(target, type, listener);
    const readDraft = () => ({
        ...session.state.draft,
        name: asText(container.querySelector('#phone-api-preset-name')?.value),
        endpoint: asText(container.querySelector('#phone-api-preset-endpoint')?.value),
        apiKey: String(container.querySelector('#phone-api-preset-key')?.value || session.state.draft.apiKey || ''),
        model: asText(container.querySelector('#phone-api-preset-model')?.value),
        temperature: Number(container.querySelector('#phone-api-preset-temperature')?.value),
        maxOutput: Number(container.querySelector('#phone-api-preset-max-output')?.value),
    });

    addListener(container.querySelector('.phone-nav-back'), 'click', () => { state.mode = 'home'; render(); });
    addListener(container.querySelector('#phone-api-preset-select'), 'change', (event) => session.select(event.currentTarget?.value));
    addListener(container.querySelector('#phone-api-preset-new-btn'), 'click', () => session.newPreset());
    addListener(container.querySelector('#phone-api-preset-save-btn'), 'click', () => { void session.save(readDraft()); });
    addListener(container.querySelector('#phone-api-preset-load-models-btn'), 'click', () => { void session.loadModels(readDraft()); });
    addListener(container.querySelector('#phone-api-preset-key'), 'input', (event) => {
        session.state.draft.apiKey = String(event.currentTarget?.value || '');
    });
    addListener(container.querySelector('#phone-api-preset-model-list'), 'change', (event) => {
        const model = asText(event.currentTarget?.value);
        if (!model) return;
        const modelInput = container.querySelector('#phone-api-preset-model');
        if (modelInput) modelInput.value = model;
        session.state.draft.model = model;
    });
    addListener(container.querySelector('#phone-api-preset-delete-btn'), 'click', () => {
        const name = asText(session.state.draft.name) || '当前 API 预设';
        showConfirmDialog(container, '删除 API 预设', `确定删除「${name}」吗？`, () => { void session.remove(); }, '删除', '取消', pageRuntime);
    });
}

export function createApiPresetsPage(ctx) {
    const session = createApiPresetSession(ctx);
    const paint = () => {
        ctx.container.innerHTML = buildApiPresetsPageHtml(session.state);
        bindApiPresetInteractions(ctx, session);
    };
    return {
        mount() {
            session.activate();
            paint();
            void session.load('', false);
        },
        update() { paint(); },
        dispose() { session.deactivate(); },
    };
}

export function renderApiPresetsPage(ctx) {
    createApiPresetsPage(ctx).mount();
}
