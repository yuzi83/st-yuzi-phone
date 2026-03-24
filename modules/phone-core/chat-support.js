import { Logger } from '../error-handler.js';
import { getCharacterData, getCurrentCharacterWorldbooks, getWorldbook } from '../integration.js';
import { getPhoneSettings, savePhoneSettingsPatch } from '../settings.js';
import { normalizeWorldbookSelection, resolveEntrySelectionState } from '../settings-app/services/worldbook-selection.js';
import { callApiWithTimeout, clampNonNegativeInteger, clampPositiveInteger, getDB } from './db-bridge.js';
import { deleteTableRowViaApi, getTableData, insertTableRow, saveTableData, updateTableRow } from './data-api.js';

const PROMPT_TEMPLATES_KEY = 'yuzi_phone_prompt_templates';

const PHONE_CHAT_DEFAULT_SETTINGS = Object.freeze({
    useStoryContext: true,
    storyContextTurns: 3,
    promptTemplateName: '',
    apiPresetName: '',
    lastSelectedTarget: '',
    lastSelectedPromptTemplateName: '',
});

const PHONE_MESSAGE_HEADER_CANDIDATES = Object.freeze({
    threadId: ['会话ID', '会话Id', '会话编号', '对话ID'],
    threadTitle: ['会话标题', '会话名称', '群聊标题', '标题'],
    sender: ['发送者', '发言者', '作者'],
    senderRole: ['发送者身份', '角色', '身份'],
    chatTarget: ['聊天对象', '对话目标'],
    content: ['消息内容', '三人消息内容', '文案', '正文'],
    sentAt: ['消息发送时间', '发送时间', '时间'],
    messageStatus: ['消息状态', '状态'],
    imageDesc: ['图片描述'],
    videoDesc: ['视频描述'],
    requestId: ['请求ID', '请求Id', '请求编号'],
    replyToMessageId: ['回复到消息ID', '回复消息ID', '回复到'],
});

export function getPromptTemplates() {
    try {
        const raw = localStorage.getItem(PROMPT_TEMPLATES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        Logger.warn('[玉子的手机] 读取提示词模板失败:', error);
        return [];
    }
}

export function savePromptTemplate(template) {
    if (!template || typeof template !== 'object' || !template.name) {
        return false;
    }
    const templates = getPromptTemplates();
    const index = templates.findIndex((item) => item.name === template.name);
    if (index >= 0) {
        templates[index] = { name: template.name, content: template.content || '' };
    } else {
        templates.push({ name: template.name, content: template.content || '' });
    }

    try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
        return true;
    } catch (error) {
        Logger.warn('[玉子的手机] 保存提示词模板失败:', error);
        return false;
    }
}

export function deletePromptTemplate(name) {
    if (!name) return false;
    const templates = getPromptTemplates();
    const filtered = templates.filter((item) => item.name !== name);
    if (filtered.length === templates.length) {
        return false;
    }
    try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(filtered));
        return true;
    } catch (error) {
        Logger.warn('[玉子的手机] 删除提示词模板失败:', error);
        return false;
    }
}

export function getPromptTemplate(name) {
    if (!name) return null;
    const templates = getPromptTemplates();
    return templates.find((item) => item.name === name) || null;
}

function normalizePhoneChatSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        useStoryContext: src.useStoryContext !== false,
        storyContextTurns: Math.max(0, Math.min(20, clampNonNegativeInteger(src.storyContextTurns, PHONE_CHAT_DEFAULT_SETTINGS.storyContextTurns))),
        promptTemplateName: String(src.promptTemplateName || '').trim(),
        apiPresetName: String(src.apiPresetName || '').trim(),
        lastSelectedTarget: String(src.lastSelectedTarget || '').trim(),
        lastSelectedPromptTemplateName: String(src.lastSelectedPromptTemplateName || '').trim(),
    };
}

function normalizePhoneWorldbookSettings(raw) {
    return normalizeWorldbookSelection(raw);
}

function dedupeTextList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [list])
        .map((item) => String(item || '').trim())
        .filter(Boolean)));
}

function pickExistingHeader(headers, candidates = []) {
    const available = new Set((Array.isArray(headers) ? headers : []).map((item) => String(item || '').trim()).filter(Boolean));
    for (const candidate of candidates) {
        const key = String(candidate || '').trim();
        if (key && available.has(key)) {
            return key;
        }
    }
    return '';
}

function assignMessageField(payload, headers, candidateHeaders, value) {
    const header = pickExistingHeader(headers, candidateHeaders);
    if (!header || value === undefined) return;
    payload[header] = value === null ? '' : String(value);
}

function sanitizePhoneChatMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
        .map((message) => ({
            role: ['system', 'assistant', 'user'].includes(String(message?.role || '').trim())
                ? String(message.role).trim()
                : 'user',
            content: String(message?.content || '').trim(),
        }))
        .filter((message) => message.content);
}

function formatPhoneChatWorldbookEntries(entries, { maxEntries = 24, maxChars = 6000 } = {}) {
    const list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) return '';

    const picked = list.slice(0, Math.max(1, maxEntries)).map((entry) => {
        const worldbookName = String(entry?.__worldbookName || '').trim();
        const entryName = String(entry?.name || entry?.comment || `条目 ${entry?.uid ?? ''}`).trim();
        const content = String(entry?.content || '').trim();
        const title = worldbookName ? `[${worldbookName}] ${entryName}` : entryName;
        return `- ${title}\n${content}`.trim();
    }).filter(Boolean);

    let text = picked.join('\n\n');
    if (text.length > maxChars) {
        text = `${text.slice(0, maxChars).trim()}\n\n（世界书内容已截断）`;
    }
    if (list.length > picked.length) {
        text += `\n\n（另有 ${list.length - picked.length} 条世界书条目未展开）`;
    }
    return text;
}

export function getPhoneChatSettings() {
    return normalizePhoneChatSettings(getPhoneSettings()?.phoneChat);
}

export function getPhoneChatLastSelectedTarget() {
    return getPhoneChatSettings().lastSelectedTarget;
}

export function setPhoneChatLastSelectedTarget(name) {
    const settings = getPhoneSettings();
    if (!settings) return;
    const nextSettings = normalizePhoneChatSettings(settings.phoneChat);
    nextSettings.lastSelectedTarget = String(name || '').trim();
    savePhoneSettingsPatch({ phoneChat: nextSettings });
}

export function getPhoneChatLastSelectedPromptTemplateName() {
    return getPhoneChatSettings().lastSelectedPromptTemplateName;
}

export function setPhoneChatLastSelectedPromptTemplateName(name) {
    const settings = getPhoneSettings();
    if (!settings) return;
    const nextSettings = normalizePhoneChatSettings(settings.phoneChat);
    nextSettings.lastSelectedPromptTemplateName = String(name || '').trim();
    savePhoneSettingsPatch({ phoneChat: nextSettings });
}

export function getPhoneWorldbookSelectionSettings() {
    return normalizePhoneWorldbookSettings(getPhoneSettings()?.worldbookSelection);
}

export function getPhoneChatPromptTemplateContent(templateName = '') {
    const phoneChatSettings = getPhoneChatSettings();
    const safeName = String(templateName || phoneChatSettings.lastSelectedPromptTemplateName || '').trim();
    if (!safeName) return '';
    return String(getPromptTemplate(safeName)?.content || '').trim();
}

export function getCurrentCharacterDisplayName(fallback = '对方') {
    const safeFallback = String(fallback || '对方').trim() || '对方';
    try {
        const character = getCharacterData('current', true);
        const name = String(character?.name || character?.data?.name || '').trim();
        return name || safeFallback;
    } catch (error) {
        Logger.warn('[玉子的手机] 获取当前角色名称失败:', error);
        return safeFallback;
    }
}

function cloneRawTableData(rawData, label = '表格数据') {
    if (!rawData || typeof rawData !== 'object') return null;

    try {
        return JSON.parse(JSON.stringify(rawData));
    } catch (error) {
        Logger.warn(`[玉子的手机] ${label}深拷贝失败:`, error);
        return null;
    }
}

function buildSheetDataSnapshot(rawData, sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey || !rawData || typeof rawData !== 'object') return null;

    const sheet = rawData?.[safeSheetKey];
    if (!sheet?.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        return null;
    }

    const headers = Array.isArray(sheet.content[0])
        ? sheet.content[0].map((header, index) => String(header || '').trim() || `列${index + 1}`)
        : [];

    return {
        sheetKey: safeSheetKey,
        tableName: String(sheet.name || safeSheetKey),
        headers,
        rows: sheet.content.slice(1),
    };
}

export function getSheetDataByKey(sheetKey) {
    const rawData = getTableData();
    return buildSheetDataSnapshot(rawData, sheetKey);
}

export function buildPhoneMessagePayload(sheetKey, message = {}) {
    const snapshot = getSheetDataByKey(sheetKey);
    if (!snapshot) {
        return null;
    }

    const headers = snapshot.headers;
    const payload = {};
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.threadId, message.threadId);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.threadTitle, message.threadTitle);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.sender, message.sender);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.senderRole, message.senderRole);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.chatTarget, message.chatTarget);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.content, message.content);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.sentAt, message.sentAt);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.messageStatus, message.messageStatus);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.imageDesc, message.imageDesc);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.videoDesc, message.videoDesc);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.requestId, message.requestId);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.replyToMessageId, message.replyToMessageId);

    return {
        tableName: snapshot.tableName,
        headers,
        payload,
    };
}

export async function insertPhoneMessageRecord(sheetKey, message = {}) {
    const built = buildPhoneMessagePayload(sheetKey, message);
    if (!built) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到消息记录表',
        };
    }

    const result = await insertTableRow(built.tableName, built.payload);
    return {
        ...result,
        tableName: built.tableName,
        payload: built.payload,
    };
}

export async function updatePhoneMessageRecord(sheetKey, rowIndex, message = {}) {
    const built = buildPhoneMessagePayload(sheetKey, message);
    if (!built) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到消息记录表',
        };
    }

    return updateTableRow(built.tableName, rowIndex, built.payload);
}

export async function refreshPhoneTableProjection() {
    const api = getDB();
    if (!api || typeof api.refreshDataAndWorldbook !== 'function') {
        return false;
    }

    try {
        const result = await callApiWithTimeout(
            () => api.refreshDataAndWorldbook(),
            12000,
            'refreshPhoneTableProjection',
        );
        return !!result;
    } catch (error) {
        Logger.warn('[玉子的手机] refreshDataAndWorldbook 调用失败:', error);
        return false;
    }
}

export async function refreshPhoneMessageProjection() {
    return refreshPhoneTableProjection();
}

export function dispatchPhoneTableUpdated(sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey) return false;

    window.dispatchEvent(new CustomEvent('yuzi-phone-table-updated', {
        detail: {
            sheetKey: safeSheetKey,
            data: getTableData(),
            version: `manual_${Date.now()}`,
        },
    }));
    return true;
}

export async function deletePhoneSheetRows(sheetKey, rowIndexes = [], options = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const rawDataBeforeDelete = cloneRawTableData(getTableData(), '删除基线快照');
    if (!rawDataBeforeDelete) {
        return {
            ok: false,
            code: 'baseline_clone_failed',
            message: '删除失败：无法创建删除基线快照',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const snapshot = buildSheetDataSnapshot(rawDataBeforeDelete, safeSheetKey);
    if (!snapshot) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到对应表格',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const tableName = String(options.tableName || snapshot.tableName || '').trim();
    if (!tableName) {
        return {
            ok: false,
            code: 'table_name_missing',
            message: '删除失败：缺少表格名称',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const normalizedRowIndexes = Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0 && value < snapshot.rows.length)))
        .sort((a, b) => b - a);

    if (normalizedRowIndexes.length === 0) {
        return {
            ok: false,
            code: 'empty_selection',
            message: '未选择可删除的条目',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const expectedRowCount = Math.max(0, snapshot.rows.length - normalizedRowIndexes.length);
    let deletedCount = 0;

    const cloneBaselineData = () => cloneRawTableData(rawDataBeforeDelete, '删除回退数据');

    const verifySnapshotUpdated = () => {
        const latestSnapshot = getSheetDataByKey(safeSheetKey);
        if (!latestSnapshot?.rows || !Array.isArray(latestSnapshot.rows)) {
            return false;
        }
        return latestSnapshot.rows.length === expectedRowCount;
    };

    const refreshProjection = async () => {
        if (options.refreshProjection === false) {
            return true;
        }
        return await refreshPhoneTableProjection();
    };

    const applyFallbackSave = async (reasonMessage = '') => {
        const fallbackRawData = cloneBaselineData();
        if (!fallbackRawData) {
            return {
                ok: false,
                code: 'fallback_data_missing',
                message: reasonMessage ? `${reasonMessage}，且无法创建整表回退数据` : '删除失败：无法创建整表回退数据',
                deletedCount,
                refreshed: false,
            };
        }

        const targetSheet = fallbackRawData?.[safeSheetKey];
        if (!targetSheet?.content || !Array.isArray(targetSheet.content)) {
            return {
                ok: false,
                code: 'fallback_sheet_missing',
                message: reasonMessage ? `${reasonMessage}，且整表回退时未找到目标表格` : '删除失败：整表回退时未找到目标表格',
                deletedCount,
                refreshed: false,
            };
        }

        for (const rowIndex of normalizedRowIndexes) {
            const realRowIndex = rowIndex + 1;
            if (!Array.isArray(targetSheet.content[realRowIndex])) {
                return {
                    ok: false,
                    code: 'fallback_row_missing',
                    message: reasonMessage ? `${reasonMessage}，且整表回退时目标行不存在` : '删除失败：整表回退时目标行不存在',
                    deletedCount,
                    refreshed: false,
                };
            }
            targetSheet.content.splice(realRowIndex, 1);
        }

        const saved = await saveTableData(fallbackRawData);
        if (!saved) {
            return {
                ok: false,
                code: 'fallback_save_failed',
                message: reasonMessage ? `${reasonMessage}，且整表回退保存失败` : '删除失败：整表回退保存失败',
                deletedCount,
                refreshed: false,
            };
        }

        const refreshed = await refreshProjection();
        if (!verifySnapshotUpdated()) {
            return {
                ok: false,
                code: 'snapshot_not_updated',
                message: reasonMessage
                    ? `${reasonMessage}，已尝试整表回退，但最新表格快照仍未更新`
                    : '删除失败：已尝试整表回退，但最新表格快照仍未更新',
                deletedCount: normalizedRowIndexes.length,
                refreshed,
            };
        }

        dispatchPhoneTableUpdated(safeSheetKey);

        return {
            ok: true,
            code: 'ok',
            message: refreshed ? '删除成功' : '删除成功，但刷新投影失败',
            deletedCount: normalizedRowIndexes.length,
            refreshed,
        };
    };

    for (const rowIndex of normalizedRowIndexes) {
        const apiRowIndex = rowIndex + 1;
        const result = await deleteTableRowViaApi(tableName, apiRowIndex);
        if (!result.ok) {
            return await applyFallbackSave(result.message || `删除第 ${apiRowIndex} 行失败`);
        }
        deletedCount += 1;
    }

    const refreshed = await refreshProjection();
    if (!verifySnapshotUpdated()) {
        return await applyFallbackSave('删除接口返回成功，但最新表格快照未变化');
    }

    dispatchPhoneTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: 'ok',
        message: refreshed ? '删除成功' : '删除成功，但刷新投影失败',
        deletedCount,
        refreshed,
    };
}

export async function getPhoneStoryContext(maxTurns = 3) {
    const api = getDB();
    if (!api || typeof api.getStoryContext !== 'function') {
        return '';
    }

    try {
        const result = await Promise.resolve(api.getStoryContext(clampNonNegativeInteger(maxTurns, PHONE_CHAT_DEFAULT_SETTINGS.storyContextTurns)));
        return String(result || '').trim();
    } catch (error) {
        Logger.warn('[玉子的手机] getStoryContext 调用失败:', error);
        return '';
    }
}

export async function getPhoneChatWorldbookContext() {
    const selection = getPhoneWorldbookSelectionSettings();
    if (selection.sourceMode === 'off') {
        return {
            mode: 'off',
            worldbooks: [],
            entries: [],
            text: '',
        };
    }

    let worldbooks = [];
    if (selection.sourceMode === 'character_bound') {
        const bound = await getCurrentCharacterWorldbooks();
        worldbooks = dedupeTextList([bound?.primary, ...(Array.isArray(bound?.additional) ? bound.additional : [])]);
    } else if (selection.selectedWorldbook) {
        worldbooks = [selection.selectedWorldbook];
    }

    if (worldbooks.length === 0) {
        return {
            mode: selection.sourceMode,
            worldbooks: [],
            entries: [],
            text: '',
        };
    }

    const mergedEntries = [];
    for (const worldbookName of worldbooks) {
        try {
            const worldbookEntries = await getWorldbook(worldbookName);
            const filteredEntries = (Array.isArray(worldbookEntries) ? worldbookEntries : [])
                .filter((entry) => entry && typeof entry === 'object' && entry.enabled !== false)
                .filter((entry) => {
                    if (selection.sourceMode === 'character_bound') {
                        return resolveEntrySelectionState(selection, worldbookName, entry.uid, selection.sourceMode);
                    }

                    const selectionMap = selection.entries?.[worldbookName] && typeof selection.entries[worldbookName] === 'object'
                        ? selection.entries[worldbookName]
                        : {};
                    const hasStoredSelection = Object.keys(selectionMap).length > 0;
                    return hasStoredSelection ? selectionMap[entry.uid] === true : true;
                })
                .map((entry) => ({
                    ...entry,
                    __worldbookName: worldbookName,
                }));

            mergedEntries.push(...filteredEntries);
        } catch (error) {
            Logger.warn(`[玉子的手机] 读取世界书失败: ${worldbookName}`, error);
        }
    }

    return {
        mode: selection.sourceMode,
        worldbooks,
        entries: mergedEntries,
        text: formatPhoneChatWorldbookEntries(mergedEntries),
    };
}

export async function callPhoneChatAI(messages, options = {}) {
    const api = getDB();
    if (!api || typeof api.callAI !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '数据库 AI 接口不可用',
            text: '',
        };
    }

    const safeMessages = sanitizePhoneChatMessages(messages);
    if (safeMessages.length === 0) {
        return {
            ok: false,
            code: 'invalid_messages',
            message: '未提供有效的 AI 消息数组',
            text: '',
        };
    }

    const requestedPresetName = String(options.apiPresetName || '').trim();

    try {
        if (requestedPresetName) {
            if (typeof api.loadApiPreset !== 'function') {
                return {
                    ok: false,
                    code: 'preset_api_unavailable',
                    message: '数据库未暴露 loadApiPreset，无法应用聊天API预设',
                    text: '',
                };
            }

            const presetLoaded = !!api.loadApiPreset(requestedPresetName);
            if (!presetLoaded) {
                return {
                    ok: false,
                    code: 'preset_load_failed',
                    message: `聊天API预设加载失败：${requestedPresetName}`,
                    text: '',
                };
            }
        }

        const maxTokensRaw = Number(options.maxTokens ?? options.max_tokens);
        const maxTokens = Number.isFinite(maxTokensRaw)
            ? Math.max(64, Math.min(4096, Math.round(maxTokensRaw)))
            : 800;

        const text = await callApiWithTimeout(
            () => api.callAI(safeMessages, { max_tokens: maxTokens }),
            Math.max(15000, clampPositiveInteger(options.timeout, 90000)),
            'callPhoneChatAI',
        );

        const safeText = String(text || '').trim();
        if (!safeText) {
            return {
                ok: false,
                code: 'empty',
                message: 'AI 未返回有效内容',
                text: '',
            };
        }

        return {
            ok: true,
            code: 'ok',
            message: 'AI 调用成功',
            text: safeText,
        };
    } catch (error) {
        return {
            ok: false,
            code: 'failed',
            message: error?.message || 'AI 调用失败',
            text: '',
        };
    }
}
