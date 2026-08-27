import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { showImageViewerDialog } from '../services/image-viewer-dialog.js';
import { downloadTextFile } from '../services/media-upload/download.js';
import { buildSettingsPageFrame, buildSettingsSectionHtml } from '../layout/primitives.js';
import { showAlertDialog, showConfirmDialog } from '../ui/confirm-dialog.js';
import { normalizeImagePromptOutputFilterSettings } from '../../image-generation/prompt-output-filter.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asText(value) {
    return String(value ?? '').trim();
}

function getErrorMessage(result, fallback) {
    return asText(result?.error?.message) || fallback;
}

function filenamePart(value) {
    return asText(value).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-').slice(0, 80) || 'preset';
}

function presetIdOf(preset) {
    return asText(preset?.presetId || preset?.id);
}

function presetNameOf(preset) {
    return asText(preset?.name) || '未命名预设';
}

function isUsableImageGenerationPreset(preset) {
    return !!presetIdOf(preset)
        && asArray(preset?.entries).some((entry) => (
            entry
            && entry.enabled !== false
            && asText(entry.content)
        ));
}

function getPresetService(ctx) {
    return ctx?.qqV2PresetService
        || ctx?.qqV2Presets
        || ctx?.imageGenerationSettingsService?.qqV2PresetService
        || null;
}

function clonePresetResources(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        status: asText(source.status) || 'unavailable',
        error: asText(source.error),
        apiPresets: asArray(source.apiPresets).map((preset) => ({ ...preset })),
        imageGenerationPresets: asArray(source.imageGenerationPresets).map((preset) => ({
            ...preset,
            entries: asArray(preset?.entries).map((entry) => ({ ...entry })),
        })),
    };
}

const GENERATED_IMAGE_PATH_PREFIX = 'user/images/yuzi-phone-generated/';

function normalizeGeneratedImagePath(value) {
    const path = String(value ?? '').trim();
    if (!path.startsWith(GENERATED_IMAGE_PATH_PREFIX)) return '';
    if (/[\\?#\u0000-\u001f]/u.test(path)) return '';
    if (/%(?:2e|2f|5c)/iu.test(path)) return '';
    const suffix = path.slice(GENERATED_IMAGE_PATH_PREFIX.length);
    if (!suffix) return '';
    const segments = suffix.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) return '';
    return path;
}

function hasOwn(value, key) {
    return !!value
        && typeof value === 'object'
        && Object.prototype.hasOwnProperty.call(value, key);
}

function asColumnRef(value) {
    const columnIndex = Number(value?.columnIndex);
    if (!Number.isInteger(columnIndex) || columnIndex < 0) return null;
    return {
        columnIndex,
        headerSnapshot: asText(value?.headerSnapshot),
    };
}

function getConfig(viewModel = {}) {
    const config = viewModel?.config && typeof viewModel.config === 'object'
        ? viewModel.config
        : {};
    const promptOutputFilter = normalizeImagePromptOutputFilterSettings(config);
    return {
        enabled: config.enabled === true,
        timeoutMs: Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : 300000,
        roleMappings: asArray(config.roleMappings),
        promptTranslationEnabled: config.promptTranslationEnabled === true,
        promptTranslationApiPresetId: asText(config.promptTranslationApiPresetId),
        promptTranslationPresetId: asText(config.promptTranslationPresetId),
        promptTranslationExtractTag: promptOutputFilter.extractTag,
        promptTranslationExcludeTags: promptOutputFilter.excludeTags,
    };
}

function cloneConfig(config) {
    const normalized = getConfig({ config });
    try {
        return JSON.parse(JSON.stringify(normalized));
    } catch {
        return {
            ...normalized,
            roleMappings: [...normalized.roleMappings],
        };
    }
}

function getTable(viewModel, sheetKey) {
    return asArray(viewModel?.tables).find(table => asText(table?.sheetKey) === asText(sheetKey)) || null;
}

function getMappingHeaders(viewModel, mapping) {
    const table = getTable(viewModel, mapping?.sheetKey);
    return asArray(table?.headers)
        .map((header, index) => ({
            columnIndex: Number.isInteger(Number(header?.columnIndex)) ? Number(header.columnIndex) : index,
            rawName: String(header?.rawName ?? ''),
            displayName: asText(header?.displayName) || asText(header?.rawName) || `列${index + 1}`,
        }))
        .filter(header => header.columnIndex >= 0);
}

function getResolvedMapping(viewModel, mapping, mappingIndex) {
    const mappings = asArray(viewModel?.resolvedMappings);
    const mappingId = asText(mapping?.mappingId);
    if (mappingId) {
        const matched = mappings.find(item => asText(item?.mappingId) === mappingId);
        if (matched) return matched;
    }
    return Number.isInteger(mappingIndex) ? mappings[mappingIndex] || null : null;
}

function isResolvedColumnAvailable(resolvedColumn, savedColumn, header) {
    if (!savedColumn || !header || savedColumn.columnIndex !== header.columnIndex) return false;
    const resolvedMatchesSaved = resolvedColumn
        && Number(resolvedColumn.columnIndex) === savedColumn.columnIndex
        && asText(resolvedColumn.headerSnapshot) === savedColumn.headerSnapshot;
    if (resolvedMatchesSaved) {
        return resolvedColumn.status === 'available'
            && asText(resolvedColumn.currentHeader) === header.rawName;
    }
    return !savedColumn.headerSnapshot || savedColumn.headerSnapshot === header.rawName;
}

function isMappingCurrentlyUnavailable(viewModel, mapping, resolvedMapping) {
    const table = getTable(viewModel, mapping?.sheetKey);
    if (!table || (asText(table.status) && asText(table.status) !== 'available')) return true;
    const headers = getMappingHeaders(viewModel, mapping);
    const nameColumn = asColumnRef(mapping?.nameColumn);
    if (!nameColumn) return true;
    const nameHeader = headers.find(header => header.columnIndex === nameColumn.columnIndex) || null;
    if (!isResolvedColumnAvailable(resolvedMapping?.nameColumn, nameColumn, nameHeader)) return true;
    const resolvedPromptColumns = asArray(resolvedMapping?.promptColumns);
    return asArray(mapping?.promptColumns)
        .map(asColumnRef)
        .filter(Boolean)
        .some((column) => {
            const header = headers.find(item => item.columnIndex === column.columnIndex) || null;
            const resolved = resolvedPromptColumns.find(
                item => Number(item?.columnIndex) === column.columnIndex
                    && asText(item?.headerSnapshot) === column.headerSnapshot,
            );
            return !isResolvedColumnAvailable(resolved, column, header);
        });
}

function buildTableOptions(viewModel, mapping) {
    const selectedSheetKey = asText(mapping?.sheetKey);
    const tables = asArray(viewModel?.tables);
    const hasSelectedTable = tables.some(table => asText(table?.sheetKey) === selectedSheetKey);
    const options = ['<option value="">请选择表格</option>'];
    if (selectedSheetKey && !hasSelectedTable) {
        const snapshot = asText(mapping?.tableNameSnapshot) || selectedSheetKey;
        options.push(`<option value="${escapeHtmlAttr(selectedSheetKey)}" selected>${escapeHtml(`${snapshot}（当前不可用）`)}</option>`);
    }
    tables.forEach((table) => {
        const sheetKey = asText(table?.sheetKey);
        if (!sheetKey) return;
        const tableName = asText(table?.tableName) || sheetKey;
        const unavailable = asText(table?.status) && asText(table.status) !== 'available';
        options.push(`<option value="${escapeHtmlAttr(sheetKey)}" ${sheetKey === selectedSheetKey ? 'selected' : ''}>${escapeHtml(`${tableName}${unavailable ? '（当前不可用）' : ''}`)}</option>`);
    });
    return options.join('');
}

function buildNameColumnOptions(viewModel, mapping, resolvedMapping) {
    const selected = asColumnRef(mapping?.nameColumn);
    const headers = getMappingHeaders(viewModel, mapping);
    const selectedHeader = selected
        ? headers.find(header => header.columnIndex === selected.columnIndex) || null
        : null;
    const selectedExists = isResolvedColumnAvailable(
        resolvedMapping?.nameColumn,
        selected,
        selectedHeader,
    );
    const options = ['<option value="">请选择名字字段</option>'];
    if (selected && !selectedExists) {
        const snapshot = selected.headerSnapshot || `列${selected.columnIndex + 1}`;
        options.push(`<option value="missing:${selected.columnIndex}" selected disabled>${escapeHtml(`${snapshot}（当前不可用）`)}</option>`);
    }
    headers.forEach((header) => {
        const isSelected = selectedExists && selected?.columnIndex === header.columnIndex;
        options.push(`<option value="column:${header.columnIndex}" ${isSelected ? 'selected' : ''}>${escapeHtml(header.displayName)}</option>`);
    });
    return options.join('');
}

function buildPromptColumnOptions(viewModel, mapping, mappingIndex, resolvedMapping) {
    const nameColumn = asColumnRef(mapping?.nameColumn);
    const selectedColumns = asArray(mapping?.promptColumns).map(asColumnRef).filter(Boolean);
    const headers = getMappingHeaders(viewModel, mapping);
    const resolvedColumns = asArray(resolvedMapping?.promptColumns);
    const isSelectedColumnAvailable = (selected, header) => {
        const resolved = resolvedColumns.find(
            column => Number(column?.columnIndex) === selected.columnIndex
                && asText(column?.headerSnapshot) === selected.headerSnapshot,
        );
        return isResolvedColumnAvailable(resolved, selected, header);
    };
    const availableHtml = headers
        .filter(header => header.columnIndex !== nameColumn?.columnIndex)
        .map((header) => {
            const checked = selectedColumns.some(
                column => isSelectedColumnAvailable(column, header),
            );
            return `
                <label class="phone-appearance-check-item">
                    <span class="phone-appearance-check-main">${escapeHtml(header.displayName)}</span>
                    <input type="checkbox" class="phone-settings-switch phone-image-generation-prompt-column"
                        data-mapping-index="${mappingIndex}" data-column-state="available"
                        data-header-snapshot="${escapeHtmlAttr(header.rawName)}"
                        value="${header.columnIndex}" ${checked ? 'checked' : ''}>
                </label>
            `;
        }).join('');
    const missingHtml = selectedColumns
        .filter((column) => {
            if (column.columnIndex === nameColumn?.columnIndex) return false;
            const header = headers.find(item => item.columnIndex === column.columnIndex) || null;
            return !isSelectedColumnAvailable(column, header);
        })
        .map(column => `
            <label class="phone-appearance-check-item is-disabled">
                <span class="phone-appearance-check-main">${escapeHtml(`${column.headerSnapshot || `列${column.columnIndex + 1}`}（当前不可用）`)}</span>
                <input type="checkbox" class="phone-settings-switch phone-image-generation-prompt-column"
                    data-mapping-index="${mappingIndex}" data-column-state="missing"
                    data-header-snapshot="${escapeHtmlAttr(column.headerSnapshot)}"
                    value="${column.columnIndex}" checked disabled>
            </label>
        `).join('');
    return availableHtml || missingHtml
        ? `${availableHtml}${missingHtml}`
        : '<div class="phone-empty-msg">请先选择有表头的表格和名字字段</div>';
}

function buildMappingCardHtml(viewModel, mapping, index, total) {
    const mappingId = asText(mapping?.mappingId) || `mapping-${index + 1}`;
    const resolvedMapping = getResolvedMapping(viewModel, mapping, index);
    const unavailable = isMappingCurrentlyUnavailable(viewModel, mapping, resolvedMapping);
    return `
        <article class="phone-settings-card phone-image-generation-mapping-card"
            data-image-generation-mapping-id="${escapeHtmlAttr(mappingId)}" data-mapping-index="${index}">
            <div class="phone-settings-card-title">
                <span>映射 ${index + 1}${unavailable ? ' · 当前不可用' : ''}</span>
                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn phone-image-generation-mapping-up"
                        data-mapping-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button>
                    <button type="button" class="phone-settings-btn phone-image-generation-mapping-down"
                        data-mapping-index="${index}" ${index === total - 1 ? 'disabled' : ''}>下移</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger phone-image-generation-mapping-delete"
                        data-mapping-index="${index}">删除</button>
                </div>
            </div>
            <label class="phone-settings-field-inline">
                <span>人物资料表</span>
                <select class="phone-settings-select phone-image-generation-table" data-mapping-index="${index}">
                    ${buildTableOptions(viewModel, mapping)}
                </select>
            </label>
            <label class="phone-settings-field-inline">
                <span>名字匹配字段</span>
                <select class="phone-settings-select phone-image-generation-name-column" data-mapping-index="${index}">
                    ${buildNameColumnOptions(viewModel, mapping, resolvedMapping)}
                </select>
            </label>
            <div class="phone-settings-field-inline">
                <span>写入提示词的字段</span>
                <div class="phone-image-generation-prompt-columns">
                    ${buildPromptColumnOptions(viewModel, mapping, index, resolvedMapping)}
                </div>
            </div>
        </article>
    `;
}

function buildTestImagePreviewHtml(imagePath) {
    const normalizedPath = normalizeGeneratedImagePath(imagePath);
    if (!normalizedPath) return '';
    return `
        <button
            id="phone-image-generation-test-preview-button"
            type="button"
            class="phone-image-generation-test-preview-button"
            aria-label="点击放大查看测试生成图片"
            title="点击放大查看"
        >
            <img
                class="phone-image-generation-test-preview-image"
                src="${escapeHtmlAttr(normalizedPath)}"
                alt="测试生成图片"
            >
        </button>
    `;
}

function buildImageGenerationPresetOptions(presets, selectedPresetId) {
    const selectedId = asText(selectedPresetId);
    const list = asArray(presets);
    const selectedPreset = list.find((preset) => presetIdOf(preset) === selectedId) || null;
    const staleOption = selectedId && !selectedPreset
        ? `<option value="${escapeHtmlAttr(selectedId)}" selected disabled>当前预设不可用</option>`
        : '';
    return [
        `<option value="" ${selectedId ? '' : 'selected'}>请选择生图预设</option>`,
        staleOption,
        ...list.map((preset) => {
            const presetId = presetIdOf(preset);
            if (!presetId) return '';
            const empty = !isUsableImageGenerationPreset(preset);
            const suffix = empty ? '（空预设）' : '';
            return `<option value="${escapeHtmlAttr(presetId)}" ${presetId === selectedId ? 'selected' : ''}>${escapeHtml(`${presetNameOf(preset)}${suffix}`)}</option>`;
        }),
    ].join('');
}

function buildApiPresetOptions(presets, selectedPresetId) {
    const selectedId = asText(selectedPresetId);
    const list = asArray(presets);
    const selectedPreset = list.find((preset) => presetIdOf(preset) === selectedId) || null;
    const staleOption = selectedId && !selectedPreset
        ? `<option value="${escapeHtmlAttr(selectedId)}" selected disabled>当前中间模型 API 预设不可用</option>`
        : '';
    return [
        `<option value="" ${selectedId ? '' : 'selected'}>请选择中间模型 API 预设</option>`,
        staleOption,
        ...list.map((preset) => {
            const presetId = presetIdOf(preset);
            if (!presetId) return '';
            const suffix = preset?.readOnly === true ? '（只读）' : '';
            return `<option value="${escapeHtmlAttr(presetId)}" ${presetId === selectedId ? 'selected' : ''}>${escapeHtml(`${presetNameOf(preset)}${suffix}`)}</option>`;
        }),
    ].join('');
}

function buildPromptPreviewRowHtml({ id, label, value, placeholder = '', extraClass = '' }) {
    const resolvedValue = String(value ?? '');
    const className = `phone-image-generation-prompt-preview-row${extraClass ? ` ${escapeHtmlAttr(extraClass)}` : ''}`;
    return `
        <div class="${className}" ${resolvedValue ? '' : 'data-empty="true"'}>
            <span class="phone-image-generation-prompt-preview-label">${escapeHtml(label)}</span>
            <div id="${escapeHtmlAttr(id)}" class="phone-prompt-preview-content">${escapeHtml(resolvedValue || placeholder)}</div>
        </div>
    `;
}

function getTestInput(viewModel = {}) {
    const testInput = viewModel?.testInput && typeof viewModel.testInput === 'object'
        ? viewModel.testInput
        : {};
    return {
        names: String(testInput.names ?? ''),
        description: String(testInput.description ?? ''),
        finalPrompt: String(testInput.finalPrompt ?? viewModel?.finalPrompt ?? ''),
        aiOutput: String(
            testInput.aiOutput
            ?? testInput.translatedPrompt
            ?? testInput.translationOutput
            ?? viewModel?.aiOutput
            ?? viewModel?.translatedPrompt
            ?? '',
        ),
        imagePath: normalizeGeneratedImagePath(
            testInput.imagePath ?? viewModel?.testImagePath,
        ),
        statusText: String(testInput.statusText ?? ''),
        generating: testInput.generating === true,
    };
}

export function buildImageGenerationPageHtml(viewModel = {}) {
    const config = getConfig(viewModel);
    const testInput = getTestInput(viewModel);
    const mappings = config.roleMappings;
    const sharedResources = clonePresetResources(viewModel.sharedResources);
    const presetServiceAvailable = viewModel.presetServiceAvailable === true;
    const presetBusy = viewModel.presetBusy === true;
    const imageGenerationPresets = sharedResources.imageGenerationPresets;
    const apiPresets = sharedResources.apiPresets;
    const selectedImagePreset = imageGenerationPresets.find(
        (preset) => presetIdOf(preset) === config.promptTranslationPresetId,
    ) || null;
    const hasUsableImagePreset = imageGenerationPresets.some(isUsableImageGenerationPreset);
    const canUseTranslation = presetServiceAvailable && hasUsableImagePreset && !presetBusy;
    const resourceStatus = sharedResources.status === 'ready'
        ? (hasUsableImagePreset ? '' : '尚未导入有效的生图预设')
        : sharedResources.error || (presetServiceAvailable ? '生图预设读取中或暂不可用' : '生图预设接口尚未接入');
    const engineSection = buildSettingsSectionHtml({
        title: '智慧姬',
        desc: '小手机负责整理提示词、保存图片与显示结果；实际生图模式跟随智慧姬当前设置。测试图片和之后的 QQ 生图会保存到：user/images/yuzi-phone-generated/',
        bodyHtml: `
            <label class="phone-appearance-check-item">
                <span class="phone-appearance-check-main">启用 QQ 生图按钮</span>
                <input id="phone-image-generation-enabled" type="checkbox" class="phone-settings-switch" ${config.enabled ? 'checked' : ''}>
            </label>
        `,
    });
    const translationSection = buildSettingsSectionHtml({
        title: '中文提示词转换',
        desc: '开启后，先使用选中的 QQ API 预设读取生图预设，把当前中文提示词交给中间 AI；转换结果会原样继续发送给智慧姬。',
        extraClass: 'phone-image-generation-translation-section',
        bodyHtml: `
            <div class="phone-image-generation-translation-controls">
                <label class="phone-appearance-check-item phone-image-generation-translation-toggle">
                    <span class="phone-appearance-check-main">启用中文 → Tag 转换</span>
                    <input id="phone-image-generation-prompt-translation-enabled" type="checkbox"
                        class="phone-settings-switch"
                        ${config.promptTranslationEnabled ? 'checked' : ''}
                        ${canUseTranslation && !!selectedImagePreset && isUsableImageGenerationPreset(selectedImagePreset) ? '' : 'disabled'}>
                </label>
                <label class="phone-settings-field-inline phone-image-generation-preset-field">
                    <span>生图预设</span>
                    <select id="phone-image-generation-preset-select" class="phone-settings-select"
                        ${presetServiceAvailable && !presetBusy ? '' : 'disabled'}>
                        ${buildImageGenerationPresetOptions(
                            imageGenerationPresets,
                            config.promptTranslationPresetId,
                        )}
                    </select>
                </label>
                <label class="phone-settings-field-inline phone-image-generation-preset-field">
                    <span>中间模型 API 预设</span>
                    <select id="phone-image-generation-api-preset-select" class="phone-settings-select"
                        ${presetServiceAvailable && !presetBusy ? '' : 'disabled'}>
                        ${buildApiPresetOptions(apiPresets, config.promptTranslationApiPresetId)}
                    </select>
                </label>
                <label class="phone-settings-field-inline phone-image-generation-preset-field">
                    <span>标签提取</span>
                    <input id="phone-image-generation-prompt-translation-extract-tag"
                        class="phone-settings-input"
                        value="${escapeHtmlAttr(config.promptTranslationExtractTag)}"
                        placeholder="例如：content"
                        title="输入要提取的标签名，可不带尖括号。留空则保留 AI 全部输出。">
                </label>
                <label class="phone-settings-field-inline phone-image-generation-preset-field">
                    <span>标签排除</span>
                    <input id="phone-image-generation-prompt-translation-exclude-tags"
                        class="phone-settings-input"
                        value="${escapeHtmlAttr(config.promptTranslationExcludeTags.join('、'))}"
                        placeholder="例如：analysis、meta"
                        title="多个标签可用顿号、逗号、分号或空格分隔，可不带尖括号。">
                </label>
            </div>
            <div class="phone-image-generation-preset-status ${resourceStatus ? '' : 'is-empty'}">
                ${escapeHtml(resourceStatus || '已选择生图预设后，转换接口才会参与生图请求。')}
            </div>
            <div class="phone-settings-action phone-settings-action-wrap phone-image-generation-preset-actions">
                <button type="button" class="phone-settings-btn"
                    id="phone-image-generation-preset-import-btn"
                    ${presetServiceAvailable && !presetBusy ? '' : 'disabled'}>导入生图预设</button>
                <button type="button" class="phone-settings-btn"
                    id="phone-image-generation-preset-export-btn"
                    ${selectedImagePreset && presetServiceAvailable && !presetBusy ? '' : 'disabled'}>导出当前</button>
                <button type="button" class="phone-settings-btn phone-settings-btn-danger"
                    id="phone-image-generation-preset-delete-btn"
                    ${selectedImagePreset && presetServiceAvailable && !presetBusy ? '' : 'disabled'}>删除当前</button>
                <input type="file" id="phone-image-generation-preset-import-file"
                    accept="application/json,.json" hidden
                    ${presetServiceAvailable && !presetBusy ? '' : 'disabled'}>
            </div>
        `,
    });
    const testSection = buildSettingsSectionHtml({
        title: '测试生图',
        desc: '人物名字支持使用半角或全角分号分隔；中文提示词会按照当前角色资料映射生成。启用转换时，AI 输出会继续交给智慧姬。',
        bodyHtml: `
            <label class="phone-settings-field-inline">
                <span>人物名字</span>
                <input id="phone-image-generation-test-names" class="phone-settings-input"
                    value="${escapeHtmlAttr(testInput.names)}" placeholder="例如：星野铃；木下">
            </label>
            <label class="phone-settings-field-inline">
                <span>图片描述</span>
                <textarea id="phone-image-generation-test-description" class="phone-settings-textarea"
                    rows="4" placeholder="输入图片里发生的事情">${escapeHtml(testInput.description)}</textarea>
            </label>
            ${buildPromptPreviewRowHtml({
                id: 'phone-image-generation-prompt-preview',
                label: '中文提示词',
                value: testInput.finalPrompt,
                placeholder: '输入人物名字或图片描述后，这里会显示中文提示词。',
            })}
            ${testInput.aiOutput
                ? buildPromptPreviewRowHtml({
                    id: 'phone-image-generation-ai-output',
                    label: 'AI 输出',
                    value: testInput.aiOutput,
                    extraClass: 'phone-image-generation-ai-output-row',
                })
                : ''}
            <div class="phone-settings-action phone-settings-action-wrap">
                <button type="button" class="phone-settings-btn phone-settings-btn-primary"
                    id="phone-image-generation-test-generate" ${testInput.generating ? 'disabled' : ''}>${testInput.generating ? '生成中…' : '测试生成'}</button>
                <span id="phone-image-generation-test-status" class="phone-settings-desc">${escapeHtml(testInput.statusText)}</span>
            </div>
            <div id="phone-image-generation-test-preview" class="phone-settings-preview">
                ${buildTestImagePreviewHtml(testInput.imagePath)}
            </div>
        `,
    });
    const mappingsSection = buildSettingsSectionHtml({
        title: '角色资料映射',
        desc: '按映射顺序查找人物；命中第一条后停止。提示词字段始终按原表格列顺序拼接。',
        actionsHtml: '<button type="button" class="phone-settings-btn" id="phone-image-generation-add-mapping">添加映射</button>',
        bodyHtml: `
            <div id="phone-image-generation-mappings">
                ${mappings.length
                    ? mappings.map((mapping, index) => buildMappingCardHtml(viewModel, mapping, index, mappings.length)).join('')
                    : '<div class="phone-empty-msg">尚未配置角色资料表，仍可只使用名字和图片描述生图。</div>'}
            </div>
            <div class="phone-settings-action phone-settings-action-wrap">
                <button type="button" class="phone-settings-btn phone-settings-btn-danger"
                    id="phone-image-generation-clear-mappings" ${mappings.length ? '' : 'disabled'}>清空映射</button>
            </div>
        `,
    });
    const requestSection = buildSettingsSectionHtml({
        title: '请求设置',
        desc: '超时只表示小手机停止等待，不代表智慧姬后台任务已经取消。',
        bodyHtml: `
            <label class="phone-settings-field-inline">
                <span>等待超时（秒）</span>
                <input id="phone-image-generation-timeout" type="number" min="30" max="1800" step="30"
                    class="phone-settings-input" value="${escapeHtmlAttr(Math.round(config.timeoutMs / 1000))}">
            </label>
        `,
    });
    return buildSettingsPageFrame({
        title: '生图设置',
        bodyClass: 'phone-app-body phone-settings-scroll phone-image-generation-page',
        bodyHtml: `${engineSection}${translationSection}${testSection}${mappingsSection}${requestSection}`,
    });
}

function createMappingId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `mapping-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPromptFromViewModel(viewModel = {}) {
    return String(
        viewModel?.testInput?.finalPrompt
        ?? viewModel?.finalPrompt
        ?? viewModel?.prompt
        ?? '',
    );
}

function getAiOutputFromViewModel(viewModel = {}) {
    return String(
        viewModel?.testInput?.aiOutput
        ?? viewModel?.testInput?.translatedPrompt
        ?? viewModel?.testInput?.translationOutput
        ?? viewModel?.aiOutput
        ?? viewModel?.translatedPrompt
        ?? viewModel?.translationOutput
        ?? '',
    );
}

function getAiOutputFromResult(result = {}) {
    return String(
        result?.aiOutput
        ?? result?.translatedPrompt
        ?? result?.translationOutput
        ?? result?.promptTranslationOutput
        ?? result?.translatedTagPrompt
        ?? result?.tagPrompt
        ?? result?.promptTranslation?.content
        ?? '',
    );
}

function getGeneratedImagePath(result = {}) {
    return normalizeGeneratedImagePath(
        result?.path
        ?? result?.imagePath
        ?? result?.asset?.path
        ?? '',
    );
}

function clampTimeoutMs(seconds) {
    const parsed = Number(seconds);
    const safeSeconds = Number.isFinite(parsed) ? Math.min(1800, Math.max(30, parsed)) : 300;
    return Math.round(safeSeconds * 1000);
}

function findHeader(viewModel, sheetKey, columnIndex) {
    const table = getTable(viewModel, sheetKey);
    return getMappingHeaders({ tables: table ? [table] : [] }, { sheetKey })
        .find(header => header.columnIndex === Number(columnIndex)) || null;
}

function parseColumnSelection(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { columnIndex: -1, state: 'unselected' };
    const tagged = /^(column|missing):(\d+)$/u.exec(raw);
    if (tagged) {
        return {
            columnIndex: Number(tagged[2]),
            state: tagged[1] === 'missing' ? 'missing' : 'available',
        };
    }
    const columnIndex = Number(raw);
    return {
        columnIndex: Number.isInteger(columnIndex) && columnIndex >= 0 ? columnIndex : -1,
        state: 'available',
    };
}

function readMappingConfig(card, viewModel, fallbackMapping = {}) {
    const mappingIndex = Number(card?.dataset?.mappingIndex);
    const fallback = Number.isInteger(mappingIndex)
        ? getConfig(viewModel).roleMappings[mappingIndex] || fallbackMapping
        : fallbackMapping;
    const tableSelect = card?.querySelector?.('.phone-image-generation-table');
    const nameSelect = card?.querySelector?.('.phone-image-generation-name-column');
    const sheetKey = asText(tableSelect?.value ?? fallback?.sheetKey);
    const table = getTable(viewModel, sheetKey);
    const nameSelection = parseColumnSelection(nameSelect?.value);
    const nameColumnIndex = nameSelection.columnIndex;
    const nameHeader = Number.isInteger(nameColumnIndex)
        ? findHeader(viewModel, sheetKey, nameColumnIndex)
        : null;
    const nameColumn = Number.isInteger(nameColumnIndex)
        ? {
            columnIndex: nameColumnIndex,
            headerSnapshot: nameSelection.state === 'missing'
                ? asText(fallback?.nameColumn?.headerSnapshot)
                : nameHeader?.rawName
                    || nameHeader?.displayName
                    || asText(fallback?.nameColumn?.headerSnapshot),
        }
        : null;
    const promptColumnByIndex = new Map();
    Array.from(card?.querySelectorAll?.('.phone-image-generation-prompt-column') || [])
        .filter(input => input?.checked === true)
        .forEach((input) => {
            const columnIndex = Number(input?.value);
            if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex === nameColumn?.columnIndex) return;
            const header = findHeader(viewModel, sheetKey, columnIndex);
            const fallbackColumn = asArray(fallback?.promptColumns)
                .find(column => Number(column?.columnIndex) === columnIndex);
            const isMissing = input?.dataset?.columnState === 'missing' || input?.disabled === true;
            const nextColumn = {
                columnIndex,
                headerSnapshot: isMissing
                    ? asText(input?.dataset?.headerSnapshot) || asText(fallbackColumn?.headerSnapshot)
                    : header?.rawName
                        || header?.displayName
                        || asText(input?.dataset?.headerSnapshot)
                        || asText(fallbackColumn?.headerSnapshot),
            };
            if (!promptColumnByIndex.has(columnIndex) || !isMissing) {
                promptColumnByIndex.set(columnIndex, nextColumn);
            }
        });
    const promptColumns = [...promptColumnByIndex.values()]
        .sort((left, right) => left.columnIndex - right.columnIndex);
    return {
        mappingId: asText(card?.dataset?.imageGenerationMappingId) || asText(fallback?.mappingId) || createMappingId(),
        sheetKey,
        tableNameSnapshot: asText(table?.tableName) || asText(fallback?.tableNameSnapshot),
        nameColumn,
        promptColumns,
    };
}

function createImageGenerationPageSession(ctx) {
    const service = ctx?.imageGenerationSettingsService;
    if (!service
        || typeof service.loadViewModel !== 'function'
        || typeof service.saveConfig !== 'function'
        || typeof service.testGenerate !== 'function') {
        throw new TypeError('imageGenerationSettingsService 必须提供 loadViewModel/saveConfig/testGenerate');
    }
    const state = {
        active: false,
        requestVersion: 0,
        saveVersion: 0,
        committedSaveVersion: 0,
        failedSaveVersion: 0,
        committedConfig: {
            enabled: false,
            timeoutMs: 300000,
            roleMappings: [],
            promptTranslationEnabled: false,
            promptTranslationApiPresetId: '',
            promptTranslationPresetId: '',
        },
        viewModel: {
            config: {
                enabled: false,
                timeoutMs: 300000,
                roleMappings: [],
                promptTranslationEnabled: false,
                promptTranslationApiPresetId: '',
                promptTranslationPresetId: '',
                promptTranslationExtractTag: '',
                promptTranslationExcludeTags: [],
            },
            tables: [],
        },
        testInput: {
            names: '',
            description: '',
            finalPrompt: '',
            aiOutput: '',
            imagePath: '',
            statusText: '',
            generating: false,
        },
        sharedResources: {
            status: 'unavailable',
            error: '',
            apiPresets: [],
            imageGenerationPresets: [],
        },
        presetServiceAvailable: false,
        presetBusy: false,
        resourceRequestVersion: 0,
        cleanups: [],
    };
    const isActive = () => state.active && ctx?.pageRuntime?.isDisposed?.() !== true;
    const clearBindings = () => {
        state.cleanups.splice(0).forEach((cleanup) => {
            try {
                cleanup?.();
            } catch {
                // 页面销毁时继续清理剩余监听器。
            }
        });
    };
    const addListener = (target, type, listener, options) => {
        if (!target || typeof listener !== 'function') return;
        const cleanup = ctx?.pageRuntime?.addEventListener?.(target, type, listener, options);
        if (typeof cleanup === 'function') {
            state.cleanups.push(cleanup);
            return;
        }
        target.addEventListener?.(type, listener, options);
        state.cleanups.push(() => target.removeEventListener?.(type, listener, options));
    };
    const presetService = getPresetService(ctx);
    const notify = (message, isError = false) => {
        ctx.showToast?.(ctx.container, message, isError, ctx.pageRuntime);
    };
    const repaintKeepScroll = () => {
        if (!isActive()) return;
        if (typeof ctx.rerenderImageGenerationKeepScroll === 'function') {
            ctx.rerenderImageGenerationKeepScroll();
            return;
        }
        paint();
    };
    const selectedImagePreset = (config = getConfig(state.viewModel)) => (
        asArray(state.sharedResources.imageGenerationPresets).find(
            (preset) => presetIdOf(preset) === asText(config.promptTranslationPresetId),
        ) || null
    );
    const selectedImagePresetIsUsable = (config = getConfig(state.viewModel)) => (
        isUsableImageGenerationPreset(selectedImagePreset(config))
    );
    const clearInvalidTranslationSelection = async ({ notifyUser = false } = {}) => {
        const config = getConfig(state.viewModel);
        if (!config.promptTranslationEnabled || selectedImagePresetIsUsable(config)) return false;
        const saved = await saveConfig({
            ...config,
            promptTranslationEnabled: false,
        }, {
            rerender: false,
            refreshPreviewAfter: false,
        });
        if (saved && notifyUser) notify('当前没有有效的生图预设，已自动关闭中文转换。', true);
        return saved;
    };
    const applySharedResources = async (source, { autoDisable = true } = {}) => {
        state.sharedResources = clonePresetResources(source);
        if (autoDisable && state.sharedResources.status === 'ready') {
            await clearInvalidTranslationSelection({ notifyUser: false });
        }
        return state.sharedResources.status === 'ready';
    };
    const loadSharedResources = async ({ autoDisable = true, source } = {}) => {
        const resourceRequestVersion = ++state.resourceRequestVersion;
        if (source !== undefined) {
            state.presetServiceAvailable = Boolean(presetService);
            return applySharedResources(source, { autoDisable });
        }
        if (!presetService || typeof presetService.readSharedResources !== 'function') {
            state.presetServiceAvailable = false;
            state.sharedResources = {
                status: 'unavailable',
                error: '生图预设接口尚未接入',
                apiPresets: [],
                imageGenerationPresets: [],
            };
            return false;
        }

        state.presetServiceAvailable = true;
        try {
            const result = await presetService.readSharedResources();
            if (!isActive() || resourceRequestVersion !== state.resourceRequestVersion) return false;
            if (result?.ok === false) {
                state.sharedResources = {
                    status: asText(result.status) || 'failed',
                    error: getErrorMessage(result, '生图预设读取失败'),
                    apiPresets: [],
                    imageGenerationPresets: [],
                };
                return false;
            }
            return applySharedResources({
                status: 'ready',
                apiPresets: result?.apiPresets,
                imageGenerationPresets: result?.imageGenerationPresets,
            }, { autoDisable });
        } catch (error) {
            if (!isActive() || resourceRequestVersion !== state.resourceRequestVersion) return false;
            state.sharedResources = {
                status: 'failed',
                error: error?.message || '生图预设读取失败',
                apiPresets: [],
                imageGenerationPresets: [],
            };
            return false;
        }
    };
    const getTestInputFromDom = () => ({
        names: String(ctx.container.querySelector('#phone-image-generation-test-names')?.value ?? state.testInput.names),
        description: String(ctx.container.querySelector('#phone-image-generation-test-description')?.value ?? state.testInput.description),
    });
    const readConfigFromDom = () => {
        const current = getConfig(state.viewModel);
        const cards = Array.from(ctx.container.querySelectorAll('.phone-image-generation-mapping-card') || []);
        const translationToggle = ctx.container.querySelector('#phone-image-generation-prompt-translation-enabled');
        const imagePresetSelect = ctx.container.querySelector('#phone-image-generation-preset-select');
        const apiPresetSelect = ctx.container.querySelector('#phone-image-generation-api-preset-select');
        const extractTagInput = ctx.container.querySelector(
            '#phone-image-generation-prompt-translation-extract-tag',
        );
        const excludeTagsInput = ctx.container.querySelector(
            '#phone-image-generation-prompt-translation-exclude-tags',
        );
        return {
            enabled: ctx.container.querySelector('#phone-image-generation-enabled')?.checked === true,
            timeoutMs: clampTimeoutMs(ctx.container.querySelector('#phone-image-generation-timeout')?.value),
            roleMappings: cards.length > 0
                ? cards.map((card, index) => readMappingConfig(card, state.viewModel, current.roleMappings[index]))
                : current.roleMappings,
            promptTranslationEnabled: translationToggle
                ? translationToggle.checked === true
                : current.promptTranslationEnabled,
            promptTranslationApiPresetId: apiPresetSelect
                ? asText(apiPresetSelect.value)
                : current.promptTranslationApiPresetId,
            promptTranslationPresetId: imagePresetSelect
                ? asText(imagePresetSelect.value)
                : current.promptTranslationPresetId,
            promptTranslationExtractTag: extractTagInput
                ? asText(extractTagInput.value)
                : current.promptTranslationExtractTag,
            promptTranslationExcludeTags: excludeTagsInput
                ? String(excludeTagsInput.value ?? '')
                : current.promptTranslationExcludeTags,
        };
    };
    const setPromptPreview = (prompt) => {
        state.testInput.finalPrompt = String(prompt ?? '');
        const target = ctx.container.querySelector('#phone-image-generation-prompt-preview');
        if (target) {
            target.textContent = state.testInput.finalPrompt
                || '输入人物名字或图片描述后，这里会显示中文提示词。';
        }
    };
    const setAiOutput = (output) => {
        state.testInput.aiOutput = String(output ?? '');
        const existing = ctx.container.querySelector('#phone-image-generation-ai-output');
        if (existing) {
            const row = existing.closest('.phone-image-generation-prompt-preview-row');
            if (row) row.remove();
        }
        if (!state.testInput.aiOutput) return;
        const previewAnchor = ctx.container.querySelector('#phone-image-generation-prompt-preview');
        const previewRow = previewAnchor?.closest('.phone-image-generation-prompt-preview-row');
        if (!previewRow) return;
        const row = document.createElement('div');
        row.className = 'phone-image-generation-prompt-preview-row phone-image-generation-ai-output-row';
        const label = document.createElement('span');
        label.className = 'phone-image-generation-prompt-preview-label';
        label.textContent = 'AI 输出';
        const value = document.createElement('div');
        value.id = 'phone-image-generation-ai-output';
        value.className = 'phone-prompt-preview-content';
        value.textContent = state.testInput.aiOutput;
        row.append(label, value);
        previewRow.insertAdjacentElement('afterend', row);
    };
    const setTestStatus = ({ generating = false, statusText = '', imagePath } = {}) => {
        state.testInput.generating = generating;
        state.testInput.statusText = String(statusText ?? '');
        if (imagePath !== undefined) {
            state.testInput.imagePath = normalizeGeneratedImagePath(imagePath);
        }
        const button = ctx.container.querySelector('#phone-image-generation-test-generate');
        if (button) {
            button.disabled = generating;
            button.textContent = generating ? '生成中…' : '测试生成';
        }
        const status = ctx.container.querySelector('#phone-image-generation-test-status');
        if (status) status.textContent = state.testInput.statusText;
        const preview = ctx.container.querySelector('#phone-image-generation-test-preview');
        if (preview && imagePath !== undefined) {
            preview.innerHTML = buildTestImagePreviewHtml(state.testInput.imagePath);
        }
    };
    const refreshPreview = async () => {
        const requestVersion = ++state.requestVersion;
        const testInput = getTestInputFromDom();
        state.testInput = { ...state.testInput, ...testInput };
        try {
            const next = await service.loadViewModel({
                config: readConfigFromDom(),
                testInput,
            });
            if (!isActive() || requestVersion !== state.requestVersion) return;
            if (next && typeof next === 'object') {
                state.viewModel = {
                    ...state.viewModel,
                    ...next,
                    config: next.config || state.viewModel.config,
                    tables: hasOwn(next, 'tables') ? asArray(next.tables) : state.viewModel.tables,
                    resolvedMappings: hasOwn(next, 'resolvedMappings')
                        ? asArray(next.resolvedMappings)
                        : state.viewModel.resolvedMappings,
                };
            }
            if (hasOwn(next, 'sharedResources')) {
                await loadSharedResources({
                    source: next.sharedResources,
                    autoDisable: false,
                });
            }
            setPromptPreview(getPromptFromViewModel(next));
            setAiOutput(getAiOutputFromViewModel(next));
        } catch (error) {
            if (!isActive() || requestVersion !== state.requestVersion) return;
            setPromptPreview('');
            setAiOutput('');
            ctx.showToast?.(ctx.container, error?.message || '提示词预览失败', true);
        }
    };
    const restoreCommittedConfig = ({ notify = true } = {}) => {
        state.viewModel = {
            ...state.viewModel,
            config: cloneConfig(state.committedConfig),
        };
        if (notify) {
            ctx.showToast?.(ctx.container, '生图设置保存失败', true);
        }
        if (typeof ctx.rerenderImageGenerationKeepScroll === 'function') {
            ctx.rerenderImageGenerationKeepScroll();
        } else {
            paint();
        }
    };
    const saveConfig = async (nextConfig, { rerender = false, refreshPreviewAfter = true } = {}) => {
        state.requestVersion += 1;
        const saveVersion = ++state.saveVersion;
        try {
            const saved = await service.saveConfig(nextConfig);
            if (!isActive()) return false;
            if (saved?.ok !== true) {
                if (saveVersion === state.saveVersion) {
                    state.failedSaveVersion = saveVersion;
                    restoreCommittedConfig();
                }
                return false;
            }
            if (saveVersion > state.committedSaveVersion) {
                state.committedSaveVersion = saveVersion;
                state.committedConfig = cloneConfig(saved.config || nextConfig);
            }
            if (saveVersion !== state.saveVersion) {
                if (state.failedSaveVersion === state.saveVersion) {
                    restoreCommittedConfig({ notify: false });
                }
                return true;
            }
            state.failedSaveVersion = 0;
            state.viewModel = {
                ...state.viewModel,
                ...(saved && typeof saved === 'object' ? saved : {}),
                config: cloneConfig(state.committedConfig),
                tables: hasOwn(saved, 'tables') ? asArray(saved.tables) : state.viewModel.tables,
                resolvedMappings: hasOwn(saved, 'resolvedMappings')
                    ? asArray(saved.resolvedMappings)
                    : state.viewModel.resolvedMappings,
            };
            if (rerender) {
                ctx.rerenderImageGenerationKeepScroll?.();
            } else if (refreshPreviewAfter) {
                void refreshPreview();
            }
            return true;
        } catch (error) {
            if (isActive()) {
                restoreCommittedConfig();
            }
            return false;
        }
    };
    const load = async () => {
        const requestVersion = ++state.requestVersion;
        try {
            const loaded = await service.loadViewModel();
            if (!isActive() || requestVersion !== state.requestVersion) return;
            state.viewModel = loaded && typeof loaded === 'object'
                ? loaded
                : state.viewModel;
            state.committedConfig = cloneConfig(state.viewModel.config);
            const loadedTest = getTestInput(loaded);
            state.testInput = {
                ...state.testInput,
                ...loadedTest,
                names: loadedTest.names || state.testInput.names,
                description: loadedTest.description || state.testInput.description,
            };
            if (hasOwn(loaded, 'sharedResources')) {
                await loadSharedResources({
                    source: loaded.sharedResources,
                    autoDisable: true,
                });
            } else {
                await loadSharedResources({ autoDisable: true });
            }
            if (!isActive()) return;
            paint();
        } catch (error) {
            if (!isActive() || requestVersion !== state.requestVersion) return;
            ctx.showToast?.(ctx.container, error?.message || '生图设置读取失败', true);
            paint();
        }
    };
    const runTestGeneration = async () => {
        const testInput = getTestInputFromDom();
        state.testInput = { ...state.testInput, ...testInput };
        setAiOutput('');
        setTestStatus({ generating: true, statusText: '正在请求智慧姬…' });
        try {
            const result = await service.testGenerate({
                ...testInput,
                prompt: state.testInput.finalPrompt,
                config: readConfigFromDom(),
                timeoutMs: readConfigFromDom().timeoutMs,
            });
            if (!isActive()) return;
            if (result?.prompt !== undefined) setPromptPreview(result.prompt);
            setAiOutput(getAiOutputFromResult(result));
            if (result?.ok === false) {
                throw new Error(result?.error?.message || result?.message || '图片生成失败');
            }
            const imagePath = getGeneratedImagePath(result);
            if (!imagePath) throw new Error('智慧姬没有返回可显示的图片');
            setTestStatus({
                generating: false,
                statusText: '测试图片已生成并保存',
                imagePath,
            });
        } catch (error) {
            if (!isActive()) return;
            setTestStatus({ generating: false, statusText: '测试生成失败' });
            ctx.showToast?.(ctx.container, error?.message || '测试生成失败', true);
        }
    };
    const importImageGenerationPresetFile = async (file) => {
        if (!file) return;
        if (!presetService || typeof presetService.importImageGenerationPresets !== 'function') {
            showAlertDialog(
                ctx.container,
                '无法导入生图预设',
                '当前设置页还没有接入生图预设导入接口。',
                '知道了',
                ctx.pageRuntime,
            );
            return;
        }

        state.presetBusy = true;
        repaintKeepScroll();
        try {
            const source = JSON.parse(await file.text());
            const result = await presetService.importImageGenerationPresets({ source });
            if (result?.ok !== true) {
                throw new Error(getErrorMessage(result, '生图预设导入失败'));
            }

            const imported = asArray(result.imageGenerationPresets);
            await loadSharedResources({ autoDisable: false });
            const importedPresetId = presetIdOf(imported[0]);
            const current = getConfig(state.viewModel);
            const nextConfig = {
                ...current,
                ...(importedPresetId ? { promptTranslationPresetId: importedPresetId } : {}),
            };
            if (nextConfig.promptTranslationEnabled && !selectedImagePresetIsUsable(nextConfig)) {
                nextConfig.promptTranslationEnabled = false;
            }
            if (importedPresetId) {
                await saveConfig(nextConfig, {
                    rerender: false,
                    refreshPreviewAfter: false,
                });
            }
            notify(imported.length
                ? `已导入 ${imported.length} 个生图预设，并自动选中「${presetNameOf(imported[0])}」。`
                : '生图预设文件已导入，但没有可选择的预设。');
        } catch (error) {
            notify(error?.message || '生图预设导入失败', true);
        } finally {
            state.presetBusy = false;
            repaintKeepScroll();
        }
    };
    const exportCurrentImageGenerationPreset = async () => {
        const config = getConfig(state.viewModel);
        const preset = selectedImagePreset(config);
        const presetId = presetIdOf(preset);
        if (!presetId) {
            notify('请先选择要导出的生图预设。', true);
            return;
        }
        if (!presetService || typeof presetService.exportImageGenerationPreset !== 'function') {
            showAlertDialog(
                ctx.container,
                '无法导出生图预设',
                '当前设置页还没有接入生图预设导出接口。',
                '知道了',
                ctx.pageRuntime,
            );
            return;
        }

        state.presetBusy = true;
        repaintKeepScroll();
        try {
            const result = await presetService.exportImageGenerationPreset({
                imageGenerationPresetId: presetId,
            });
            if (result?.ok !== true || !result.source || typeof result.source !== 'object') {
                throw new Error(getErrorMessage(result, '生图预设导出失败'));
            }
            const filename = `yuzi-image-generation-${filenamePart(presetNameOf(preset))}.json`;
            downloadTextFile(filename, JSON.stringify(result.source, null, 2), 'application/json');
            notify(`已导出生图预设「${presetNameOf(preset)}」。`);
        } catch (error) {
            notify(error?.message || '生图预设导出失败', true);
        } finally {
            state.presetBusy = false;
            repaintKeepScroll();
        }
    };
    const deleteCurrentImageGenerationPreset = async () => {
        const config = getConfig(state.viewModel);
        const preset = selectedImagePreset(config);
        const presetId = presetIdOf(preset);
        if (!presetId) {
            notify('请先选择要删除的生图预设。', true);
            return;
        }
        if (!presetService || typeof presetService.deleteImageGenerationPreset !== 'function') {
            showAlertDialog(
                ctx.container,
                '无法删除生图预设',
                '当前设置页还没有接入生图预设删除接口。',
                '知道了',
                ctx.pageRuntime,
            );
            return;
        }

        state.presetBusy = true;
        repaintKeepScroll();
        try {
            const result = await presetService.deleteImageGenerationPreset({
                imageGenerationPresetId: presetId,
            });
            if (result?.ok !== true || result?.deleted !== true) {
                throw new Error(getErrorMessage(result, '生图预设删除失败'));
            }
            await saveConfig({
                ...config,
                promptTranslationEnabled: false,
                promptTranslationPresetId: '',
            }, {
                rerender: false,
                refreshPreviewAfter: false,
            });
            await loadSharedResources({ autoDisable: true });
            notify(`已删除生图预设「${presetNameOf(preset)}」。`);
        } catch (error) {
            notify(error?.message || '生图预设删除失败', true);
        } finally {
            state.presetBusy = false;
            repaintKeepScroll();
        }
    };
    const bind = () => {
        clearBindings();
        addListener(ctx.container.querySelector('.phone-nav-back'), 'click', () => {
            ctx.state.mode = 'home';
            ctx.render();
        });
        addListener(ctx.container.querySelector('#phone-image-generation-enabled'), 'change', () => {
            void saveConfig(readConfigFromDom(), { refreshPreviewAfter: false });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-prompt-translation-enabled'), 'change', () => {
            const config = readConfigFromDom();
            if (config.promptTranslationEnabled && !selectedImagePresetIsUsable(config)) {
                config.promptTranslationEnabled = false;
                notify('当前没有有效的生图预设，已自动关闭中文转换。', true);
            }
            void saveConfig(config, {
                rerender: true,
                refreshPreviewAfter: false,
            });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-preset-select'), 'change', () => {
            const config = readConfigFromDom();
            if (config.promptTranslationEnabled && !selectedImagePresetIsUsable(config)) {
                config.promptTranslationEnabled = false;
                notify('所选生图预设为空，已自动关闭中文转换。', true);
            }
            void saveConfig(config, {
                rerender: true,
                refreshPreviewAfter: false,
            });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-api-preset-select'), 'change', () => {
            void saveConfig(readConfigFromDom(), {
                rerender: true,
                refreshPreviewAfter: false,
            });
        });
        addListener(
            ctx.container.querySelector('#phone-image-generation-prompt-translation-extract-tag'),
            'change',
            () => {
                void saveConfig(readConfigFromDom(), {
                    rerender: true,
                    refreshPreviewAfter: false,
                });
            },
        );
        addListener(
            ctx.container.querySelector('#phone-image-generation-prompt-translation-exclude-tags'),
            'change',
            () => {
                void saveConfig(readConfigFromDom(), {
                    rerender: true,
                    refreshPreviewAfter: false,
                });
            },
        );
        const presetImportInput = ctx.container.querySelector('#phone-image-generation-preset-import-file');
        addListener(ctx.container.querySelector('#phone-image-generation-preset-import-btn'), 'click', () => {
            presetImportInput?.click();
        });
        addListener(presetImportInput, 'change', () => {
            const file = presetImportInput?.files?.[0];
            if (presetImportInput) presetImportInput.value = '';
            if (file) void importImageGenerationPresetFile(file);
        });
        addListener(ctx.container.querySelector('#phone-image-generation-preset-export-btn'), 'click', () => {
            void exportCurrentImageGenerationPreset();
        });
        addListener(ctx.container.querySelector('#phone-image-generation-preset-delete-btn'), 'click', () => {
            const preset = selectedImagePreset();
            const name = presetNameOf(preset);
            showConfirmDialog(
                ctx.container,
                '删除生图预设',
                `确定删除「${name}」吗？删除后无法恢复。`,
                () => { void deleteCurrentImageGenerationPreset(); },
                '删除',
                '取消',
                ctx.pageRuntime,
            );
        });
        const namesInput = ctx.container.querySelector('#phone-image-generation-test-names');
        const descriptionInput = ctx.container.querySelector('#phone-image-generation-test-description');
        addListener(namesInput, 'input', () => { void refreshPreview(); });
        addListener(descriptionInput, 'input', () => { void refreshPreview(); });
        addListener(ctx.container.querySelector('#phone-image-generation-test-generate'), 'click', () => {
            void runTestGeneration();
        });
        const testPreview = ctx.container.querySelector('#phone-image-generation-test-preview');
        addListener(testPreview, 'click', (event) => {
            const previewButton = event.target?.closest?.('#phone-image-generation-test-preview-button');
            if (!previewButton) return;
            if (typeof testPreview?.contains === 'function' && !testPreview.contains(previewButton)) return;
            const imagePath = normalizeGeneratedImagePath(state.testInput.imagePath);
            if (!imagePath) return;
            event.preventDefault?.();
            showImageViewerDialog({
                imagePath,
                altText: '测试生成图片',
                runtime: ctx.pageRuntime,
            });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-timeout'), 'change', () => {
            void saveConfig(readConfigFromDom(), { refreshPreviewAfter: false });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-add-mapping'), 'click', () => {
            const config = readConfigFromDom();
            void saveConfig({
                ...config,
                roleMappings: [
                    ...config.roleMappings,
                    {
                        mappingId: createMappingId(),
                        sheetKey: '',
                        tableNameSnapshot: '',
                        nameColumn: null,
                        promptColumns: [],
                    },
                ],
            }, { rerender: true, refreshPreviewAfter: false });
        });
        addListener(ctx.container.querySelector('#phone-image-generation-clear-mappings'), 'click', () => {
            const config = readConfigFromDom();
            void saveConfig({ ...config, roleMappings: [] }, { rerender: true, refreshPreviewAfter: false });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-table') || []).forEach((select) => {
            addListener(select, 'change', () => {
                const config = readConfigFromDom();
                const index = Number(select?.dataset?.mappingIndex);
                if (Number.isInteger(index) && config.roleMappings[index]) {
                    config.roleMappings[index] = {
                        ...config.roleMappings[index],
                        nameColumn: null,
                        promptColumns: [],
                    };
                }
                void saveConfig(config, { rerender: true, refreshPreviewAfter: false });
            });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-name-column') || []).forEach((select) => {
            addListener(select, 'change', () => {
                const config = readConfigFromDom();
                void saveConfig(config, { rerender: true, refreshPreviewAfter: false });
            });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-prompt-column') || []).forEach((checkbox) => {
            addListener(checkbox, 'change', () => {
                void saveConfig(readConfigFromDom());
            });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-mapping-up') || []).forEach((button) => {
            addListener(button, 'click', () => {
                const config = readConfigFromDom();
                const index = Number(button?.dataset?.mappingIndex);
                if (!Number.isInteger(index) || index <= 0 || index >= config.roleMappings.length) return;
                [config.roleMappings[index - 1], config.roleMappings[index]] = [
                    config.roleMappings[index],
                    config.roleMappings[index - 1],
                ];
                void saveConfig(config, { rerender: true, refreshPreviewAfter: false });
            });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-mapping-down') || []).forEach((button) => {
            addListener(button, 'click', () => {
                const config = readConfigFromDom();
                const index = Number(button?.dataset?.mappingIndex);
                if (!Number.isInteger(index) || index < 0 || index >= config.roleMappings.length - 1) return;
                [config.roleMappings[index], config.roleMappings[index + 1]] = [
                    config.roleMappings[index + 1],
                    config.roleMappings[index],
                ];
                void saveConfig(config, { rerender: true, refreshPreviewAfter: false });
            });
        });
        Array.from(ctx.container.querySelectorAll('.phone-image-generation-mapping-delete') || []).forEach((button) => {
            addListener(button, 'click', () => {
                const config = readConfigFromDom();
                const index = Number(button?.dataset?.mappingIndex);
                if (!Number.isInteger(index) || index < 0 || index >= config.roleMappings.length) return;
                config.roleMappings.splice(index, 1);
                void saveConfig(config, { rerender: true, refreshPreviewAfter: false });
            });
        });
    };
    const paint = () => {
        if (!isActive()) return;
        ctx.container.innerHTML = buildImageGenerationPageHtml({
            ...state.viewModel,
            config: getConfig(state.viewModel),
            testInput: state.testInput,
            sharedResources: state.sharedResources,
            presetServiceAvailable: state.presetServiceAvailable,
            presetBusy: state.presetBusy,
        });
        bind();
    };
    return {
        activate() {
            state.active = true;
            paint();
            void load();
        },
        update() {
            paint();
        },
        dispose() {
            state.active = false;
            state.requestVersion += 1;
            clearBindings();
        },
    };
}

export function createImageGenerationPage(ctx) {
    const session = createImageGenerationPageSession(ctx);
    return {
        mount() {
            session.activate();
        },
        update() {
            session.update();
        },
        dispose() {
            session.dispose();
        },
    };
}

export function renderImageGenerationPage(ctx) {
    return createImageGenerationPage(ctx).mount();
}
