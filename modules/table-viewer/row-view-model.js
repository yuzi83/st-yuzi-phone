const DEFAULT_GENERIC_FIELD_BINDINGS_BY_VIEWER = Object.freeze({
    summaryTitle: ['标题', '名称', '姓名', '主题', '会话标题', '发帖人', '发帖人网名'],
    summarySubtitle: ['副标题', '分类', '标签', '话题', '位置'],
    summaryStatus: ['状态', '进度', '类型', '审核状态'],
    summaryTime: ['时间', '更新时间', '创建时间', '消息发送时间', '发帖时间'],
    summaryPreview: ['描述', '内容', '备注', '简介', '文案', '消息内容', '正文'],
});

function normalizeGenericFieldBindingCandidatesForViewer(rawCandidates) {
    const source = Array.isArray(rawCandidates)
        ? rawCandidates
        : (rawCandidates === undefined || rawCandidates === null ? [] : [rawCandidates]);

    const result = [];
    const seen = new Set();
    source.forEach((item) => {
        const text = String(item ?? '').trim().slice(0, 80);
        if (!text || seen.has(text) || /[<>]/.test(text) || text.toLowerCase().includes('javascript:')) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

export function normalizeGenericFieldBindingsForViewer(rawFieldBindings) {
    const src = rawFieldBindings && typeof rawFieldBindings === 'object' && !Array.isArray(rawFieldBindings)
        ? rawFieldBindings
        : {};

    const merged = {};
    Object.keys(DEFAULT_GENERIC_FIELD_BINDINGS_BY_VIEWER).forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : DEFAULT_GENERIC_FIELD_BINDINGS_BY_VIEWER[fieldKey];
        const normalized = normalizeGenericFieldBindingCandidatesForViewer(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

function buildGenericHeaderIndexMap(headers = [], rawHeaders = []) {
    const map = new Map();
    headers.forEach((header, idx) => {
        const candidates = [rawHeaders[idx], header];
        candidates.forEach((candidate) => {
            const key = String(candidate || '').trim();
            if (!key) return;
            if (!map.has(key)) map.set(key, idx);
        });
    });
    return map;
}

function getCellByGenericHeaders(row, headerMap, headerNames = []) {
    if (!Array.isArray(row)) return '';
    for (const headerName of headerNames) {
        const idx = headerMap.get(String(headerName || '').trim());
        if (idx === undefined) continue;
        const value = row[idx];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text !== '') return text;
    }
    return '';
}

export function normalizeCellDisplayValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength = 48) {
    const text = normalizeCellDisplayValue(value);
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function isLikelyMetaField(header, value) {
    const headerText = String(header || '');
    const valueText = normalizeCellDisplayValue(value);

    return /(状态|时间|日期|编号|id|ID|次数|数量|锁定|创建|更新|删除|排序|索引|标签|分类|type|count|time|date|status|index)/i.test(headerText)
        || /^[\d\s:/_.-]+$/.test(valueText);
}

function countNonEmptyInRow(row, rawHeaders = []) {
    let count = 0;
    if (!Array.isArray(row)) return count;

    row.forEach((value, idx) => {
        const header = String(rawHeaders[idx] ?? '').trim();
        if (idx === 0 && header === '') return;
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            count++;
        }
    });

    return count;
}

function findFirstFieldByPattern(row, headers = [], rawHeaders = [], pattern) {
    if (!Array.isArray(row)) return null;

    for (let idx = 0; idx < row.length; idx++) {
        const header = String(rawHeaders[idx] ?? headers[idx] ?? '').trim();
        const text = normalizeCellDisplayValue(row[idx]);
        if (!text) continue;
        if (idx === 0 && header === '') continue;
        if (pattern.test(header)) {
            return {
                idx,
                header,
                value: text,
            };
        }
    }

    return null;
}

function buildSearchIndex(row, headers = [], rawHeaders = []) {
    if (!Array.isArray(row)) return '';

    return row
        .map((value, idx) => {
            const header = String(rawHeaders[idx] ?? headers[idx] ?? '').trim();
            const text = normalizeCellDisplayValue(value);
            if (!text && !header) return '';
            return `${header} ${text}`.trim();
        })
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function resolveStatusTone(value, locked = false) {
    const text = String(value || '').toLowerCase();
    if (locked) return 'warning';
    if (/失败|异常|禁用|停用|删除|error|fail|offline|off/.test(text)) return 'danger';
    if (/警告|待处理|待审|草稿|warning|pending|draft|queue/.test(text)) return 'warning';
    if (/启用|成功|完成|正常|online|active|ok|ready/.test(text)) return 'success';
    if (/进行中|同步|processing|info|running/.test(text)) return 'info';
    return 'neutral';
}

export function getRowEntryTitle(row, headers = [], rawHeaders = [], fieldBindings = {}) {
    if (!Array.isArray(row)) return '未命名';

    const headerMap = buildGenericHeaderIndexMap(headers, rawHeaders);
    const boundTitle = getCellByGenericHeaders(row, headerMap, fieldBindings.summaryTitle || []);
    if (boundTitle) return boundTitle;

    const candidates = row
        .map((value, idx) => {
            const text = normalizeCellDisplayValue(value);
            if (!text) return null;

            const header = String(rawHeaders[idx] ?? headers[idx] ?? '').trim();
            let score = idx === 1 ? 6 : 0;

            if (/(标题|名称|name|title|主题|会话|角色|昵称|主角|作者|发帖人|发送者|来源)/i.test(header)) {
                score += 10;
            }
            if (text.length <= 40) {
                score += 2;
            }
            if (!isLikelyMetaField(header, text)) {
                score += 2;
            }

            return { text, score, idx }; 
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.idx - b.idx || a.text.length - b.text.length);

    return candidates[0]?.text || '未命名';
}

export function shouldPreferFullRowField(pair) {
    const key = String(pair?.key || '');
    const rawValue = String(pair?.value ?? '');
    const valueText = normalizeCellDisplayValue(rawValue);
    if (!valueText) return false;

    const lineCount = rawValue.split(/\r?\n/).length;
    const isContentLikeKey = /(内容|文案|正文|描述|备注|回复|消息|提示|prompt|comment|summary|说明|简介|body|content|text|纪要|概览|剧情|记录)/i.test(key);

    if (lineCount >= 2) return true;
    if (isContentLikeKey && valueText.length >= 36) return true;
    if (valueText.length >= 90) return true;
    return false;
}

export function buildGenericRowViewModel(row, rowIndex, headers = [], rawHeaders = [], rowLocked = false, fieldBindings = {}) {
    const headerMap = buildGenericHeaderIndexMap(headers, rawHeaders);
    const title = getRowEntryTitle(row, headers, rawHeaders, fieldBindings);
    const nonEmptyCount = countNonEmptyInRow(row, rawHeaders);
    const boundStatus = getCellByGenericHeaders(row, headerMap, fieldBindings.summaryStatus || []);
    const boundTime = getCellByGenericHeaders(row, headerMap, fieldBindings.summaryTime || []);
    const boundSubtitle = getCellByGenericHeaders(row, headerMap, fieldBindings.summarySubtitle || []);
    const boundPreview = getCellByGenericHeaders(row, headerMap, fieldBindings.summaryPreview || []);
    const statusField = findFirstFieldByPattern(row, headers, rawHeaders, /(状态|审核|启用|锁定|流程|status|type)/i);
    const timeField = findFirstFieldByPattern(row, headers, rawHeaders, /(时间|日期|更新|修改|创建|发送|发帖|time|date|updated|created)/i);

    const previewParts = row
        .map((value, idx) => {
            const header = String(rawHeaders[idx] ?? headers[idx] ?? '').trim();
            const text = normalizeCellDisplayValue(value);
            if (!text) return '';
            if (idx === 0 && header === '') return '';
            if (text === title) return '';
            if (statusField && idx === statusField.idx) return '';
            if (timeField && idx === timeField.idx) return '';
            if (isLikelyMetaField(header, text)) return '';
            return truncateText(text, 30);
        })
        .filter(Boolean)
        .slice(0, 2);

    const preferredPreviewParts = [boundSubtitle, boundPreview]
        .map(value => normalizeCellDisplayValue(value))
        .filter(Boolean)
        .filter(value => value !== title)
        .map(value => truncateText(value, 30));

    return {
        rowIndex,
        title,
        nonEmptyCount,
        rowLocked,
        statusText: rowLocked ? '已锁定' : truncateText(boundStatus || statusField?.value || '', 14),
        statusTone: resolveStatusTone(boundStatus || statusField?.value || '', rowLocked),
        timeText: truncateText(boundTime || timeField?.value || '', 18),
        previewText: preferredPreviewParts.join(' · ') || previewParts.join(' · ') || '点击查看完整字段与详情信息',
        searchText: buildSearchIndex(row, headers, rawHeaders),
    };
}

function getDetailSectionMeta(sectionKey) {
    if (sectionKey === 'overview') {
        return {
            title: '基础信息',
            description: '用于快速确认条目身份、标题和核心属性。',
        };
    }
    if (sectionKey === 'status') {
        return {
            title: '状态与时间',
            description: '集中查看流程状态、时间节点与只读信息。',
        };
    }
    if (sectionKey === 'content') {
        return {
            title: '内容信息',
            description: '包含描述、正文、备注与可读性较强的字段内容。',
        };
    }
    return {
        title: '扩展信息',
        description: '承载补充字段、结构化配置与其他元数据。',
    };
}

function classifyDetailField(pair) {
    const key = String(pair?.key || '');

    if (/(状态|时间|日期|创建|更新|修改|启用|锁定|发布|流程|审核|deadline|status|time|date|created|updated)/i.test(key)) {
        return 'status';
    }
    if (/(内容|文案|正文|描述|备注|回复|消息|提示|prompt|comment|summary|说明|简介|body|content|text)/i.test(key)) {
        return 'content';
    }
    if (pair?.rawColIndex <= 2 || /(标题|名称|name|title|作者|角色|用户|ID|编号|类型|分类|标签|主题|来源|source|id)/i.test(key)) {
        return 'overview';
    }
    return 'extended';
}

export function createDetailSections(kvPairs = []) {
    const buckets = new Map();
    ['overview', 'status', 'content', 'extended'].forEach((key) => {
        buckets.set(key, []);
    });

    kvPairs.forEach((pair) => {
        const bucketKey = classifyDetailField(pair);
        buckets.get(bucketKey)?.push(pair);
    });

    return ['overview', 'status', 'content', 'extended']
        .map((key) => {
            const items = buckets.get(key) || [];
            if (!items.length) return null;
            const meta = getDetailSectionMeta(key);
            return {
                key,
                title: meta.title,
                description: meta.description,
                items,
            };
        })
        .filter(Boolean);
}
