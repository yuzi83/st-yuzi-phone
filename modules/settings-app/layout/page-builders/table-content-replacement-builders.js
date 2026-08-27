import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import { validateReplacementRules } from '../../../table-content-replacement/rules.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asText(value) {
    return String(value ?? '');
}

function asId(value, fallback = '') {
    const normalized = asText(value).trim();
    return normalized || fallback;
}

function isChecked(value) {
    return value === true ? ' checked' : '';
}

function isDisabled(value) {
    return value ? ' disabled' : '';
}

function getRunnableRules(rules) {
    const safeRules = asArray(rules);
    const invalidIndexes = new Set(validateReplacementRules(safeRules).map(error => Number(error?.index)));
    return safeRules.filter((_, index) => !invalidIndexes.has(index));
}

function formatRunningRuleValue(value) {
    const text = asText(value);
    if (text.length === 0) return '（空白）';
    return text
        .replace(/\r\n|\r|\n/gu, '↵')
        .replace(/\t/gu, '⇥')
        .replace(/ /gu, '·');
}

function buildRunningRuleGroupHtml({ scope = 'global', mappingId = '', label = '', rules = [] } = {}) {
    const safeRules = asArray(rules);
    const mappingAttr = scope === 'table' ? ` data-mapping-id="${escapeHtmlAttr(mappingId)}"` : '';
    return `
        <div class="phone-table-content-replacement-running-group" data-running-rule-scope="${escapeHtmlAttr(scope)}"${mappingAttr}>
            <div class="phone-table-content-replacement-running-group-head">
                <span class="phone-table-content-replacement-running-group-title">${escapeHtml(label)}</span>
                <span class="phone-table-content-replacement-running-group-count">${safeRules.length} 条</span>
            </div>
            <ol class="phone-table-content-replacement-running-list">
                ${safeRules.map((rule, index) => `
                    <li class="phone-table-content-replacement-running-item">
                        <span class="phone-table-content-replacement-running-index">${index + 1}</span>
                        <code class="phone-table-content-replacement-running-value">${escapeHtml(formatRunningRuleValue(rule?.source))}</code>
                        <span class="phone-table-content-replacement-running-arrow" aria-hidden="true">→</span>
                        <code class="phone-table-content-replacement-running-value">${escapeHtml(formatRunningRuleValue(rule?.target))}</code>
                    </li>
                `).join('')}
            </ol>
        </div>
    `;
}

function buildRunningRulesSummaryHtml({ config = {}, resolvedTableRules = [] } = {}) {
    const safeConfig = config && typeof config === 'object' ? config : {};
    const groups = [];
    const global = safeConfig.global && typeof safeConfig.global === 'object' ? safeConfig.global : {};
    const globalRules = global.enabled === true ? getRunnableRules(global.rules) : [];
    if (globalRules.length > 0) {
        groups.push({ scope: 'global', label: '全局替换', rules: globalRules });
    }

    asArray(safeConfig.tableRules).forEach((area) => {
        if (area?.enabled !== true) return;
        const rules = getRunnableRules(area.rules);
        if (rules.length === 0) return;
        const resolved = asArray(resolvedTableRules).find(
            item => asId(item?.mappingId) === asId(area?.mappingId),
        );
        const label = asText(
            resolved?.tableName
            || area.tableNameSnapshot
            || area.sheetKey
            || '未命名表格',
        ).trim() || '未命名表格';
        groups.push({
            scope: 'table',
            mappingId: asId(area.mappingId),
            label,
            rules,
        });
    });

    const totalRuleCount = groups.reduce((total, group) => total + group.rules.length, 0);
    const bodyHtml = groups.length > 0
        ? groups.map(buildRunningRuleGroupHtml).join('')
        : '<p class="phone-table-content-replacement-running-empty">当前没有正在运行的替换规则。</p>';

    return `
        <section class="phone-table-content-replacement-running-summary">
            <div class="phone-table-content-replacement-running-summary-head">
                <div>
                    <h2 class="phone-table-content-replacement-running-summary-title">当前运行规则</h2>
                    <p class="phone-table-content-replacement-running-summary-meta">共 ${totalRuleCount} 条；仅显示已保存且已启用的规则。</p>
                </div>
            </div>
            <div class="phone-table-content-replacement-running-groups">${bodyHtml}</div>
        </section>
    `;
}

function buildRuleErrorHtml(error) {
    if (Array.isArray(error)) {
        return error.map(buildRuleErrorHtml).join('');
    }
    const message = asText(error?.message || error?.text).trim();
    return message ? `<div class="phone-table-content-replacement-error">${escapeHtml(message)}</div>` : '';
}

function buildRuleHtml({ rule = {}, index = 0, scope = 'global', mappingId = '', disabled = false, error = null } = {}) {
    const safeScope = scope === 'table' ? 'table' : 'global';
    const ruleId = asId(rule.id, `rule_${index + 1}`);
    const actionScope = safeScope === 'table'
        ? ` data-area-scope="table" data-mapping-id="${escapeHtmlAttr(mappingId)}"`
        : '';
    const moveUpDisabled = disabled || index <= 0;
    const moveDownDisabled = disabled;

    return `
        <article class="phone-table-content-replacement-rule" data-rule-id="${escapeHtmlAttr(ruleId)}" data-rule-index="${index}" data-rule-scope="${safeScope}">
            <div class="phone-table-content-replacement-rule-head">
                <span class="phone-table-content-replacement-rule-index">规则 ${index + 1}</span>
                <div class="phone-table-content-replacement-rule-actions">
                    <button type="button" class="phone-settings-btn phone-settings-btn-ghost phone-table-content-replacement-rule-move" data-action="move-rule-up" data-rule-id="${escapeHtmlAttr(ruleId)}"${actionScope}${isDisabled(moveUpDisabled)} aria-label="上移规则">↑</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-ghost phone-table-content-replacement-rule-move" data-action="move-rule-down" data-rule-id="${escapeHtmlAttr(ruleId)}"${actionScope}${isDisabled(moveDownDisabled)} aria-label="下移规则">↓</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger phone-table-content-replacement-rule-delete" data-action="delete-rule" data-rule-id="${escapeHtmlAttr(ruleId)}"${actionScope}${isDisabled(disabled)}>删除</button>
                </div>
            </div>
            <div class="phone-table-content-replacement-rule-fields">
                <label class="phone-table-content-replacement-field">
                    <span>原词</span>
                    <textarea class="phone-settings-textarea phone-table-content-replacement-textarea" rows="2" data-action="update-rule" data-field="source" data-rule-id="${escapeHtmlAttr(ruleId)}"${actionScope}${isDisabled(disabled)}>${escapeHtml(asText(rule.source))}</textarea>
                </label>
                <label class="phone-table-content-replacement-field">
                    <span>替换为</span>
                    <textarea class="phone-settings-textarea phone-table-content-replacement-textarea" rows="2" data-action="update-rule" data-field="target" data-rule-id="${escapeHtmlAttr(ruleId)}"${actionScope}${isDisabled(disabled)}>${escapeHtml(asText(rule.target))}</textarea>
                </label>
            </div>
            ${buildRuleErrorHtml(error)}
        </article>
    `;
}

function buildRulesEditorHtml({ rules = [], scope = 'global', mappingId = '', errors = [], disabled = false } = {}) {
    const safeRules = asArray(rules);
    const safeErrors = asArray(errors);
    const errorByIndex = new Map(safeErrors.map((error) => [Number(error?.index), error]));
    const rulesHtml = safeRules.length > 0
        ? safeRules.map((rule, index) => buildRuleHtml({
            rule,
            index,
            scope,
            mappingId,
            disabled,
            error: errorByIndex.get(index),
        })).join('')
        : '<div class="phone-settings-note phone-table-content-replacement-empty-rules">还没有替换规则，点击“添加规则”开始设置。</div>';
    const addAction = scope === 'table' ? 'add-table-rule' : 'add-global-rule';
    const scopeAttr = scope === 'table'
        ? ` data-area-scope="table" data-mapping-id="${escapeHtmlAttr(mappingId)}"`
        : '';

    return `
        <div class="phone-table-content-replacement-rules" data-rules-scope="${scope}">
            ${rulesHtml}
            <div class="phone-settings-action phone-table-content-replacement-add-rule-action">
                <button type="button" class="phone-settings-btn phone-settings-btn-ghost" data-action="${addAction}"${scopeAttr}${isDisabled(disabled)}>添加规则</button>
            </div>
        </div>
    `;
}

function buildAreaSwitchHtml({ id, enabled, scope, mappingId = '', disabled = false } = {}) {
    const safeScope = scope === 'table' ? 'table' : 'global';
    const action = safeScope === 'table' ? 'toggle-table' : 'toggle-global';
    const label = safeScope === 'table' ? '启用此表替换' : '启用全局替换';
    const scopeAttr = safeScope === 'table'
        ? ` data-area-scope="table" data-mapping-id="${escapeHtmlAttr(mappingId)}"`
        : '';
    return `
        <label class="phone-table-content-replacement-switch"${id ? ` for="${escapeHtmlAttr(id)}"` : ''}>
            <input type="checkbox" id="${escapeHtmlAttr(id || `${safeScope}-enabled`)}" class="${safeScope === 'table' ? 'phone-table-content-replacement-mapping-enabled' : 'phone-table-content-replacement-global-enabled'}" data-action="${action}"${scopeAttr}${isChecked(enabled)}${isDisabled(disabled)}>
            <span class="phone-table-content-replacement-switch-track" aria-hidden="true"></span>
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

function buildTableOptionsHtml(tables, selectedSheetKey = '') {
    const safeSelected = asId(selectedSheetKey);
    return asArray(tables)
        .filter(table => asId(table?.sheetKey))
        .map((table) => {
            const sheetKey = asId(table.sheetKey);
            const tableName = asText(table.tableName || table.name || sheetKey).trim() || sheetKey;
            const status = asId(table.status, 'available');
            const available = status === 'available';
            return `<option value="${escapeHtmlAttr(sheetKey)}"${sheetKey === safeSelected ? ' selected' : ''}${available ? '' : ' disabled'}>${escapeHtml(tableName)}${available ? '' : '（当前不可用）'}</option>`;
        })
        .join('');
}

function buildTableAreaHtml({ area = {}, table = null, errors = {}, busy = false } = {}) {
    const mappingId = asId(area.mappingId, 'mapping_1');
    const tableNameSnapshot = asText(area.tableNameSnapshot || area.tableName).trim();
    const tableName = asText(table?.tableName || table?.name || tableNameSnapshot || area.sheetKey || '未命名表格').trim();
    const status = asId(table?.status, table ? 'available' : 'missing');
    const unavailable = status !== 'available';
    const title = asText(table?.tableName).trim() || tableNameSnapshot || tableName || '未命名表格';
    const errorList = asArray(errors?.rules);
    const areaClass = unavailable ? ' is-unavailable' : '';
    const disabled = busy;

    return `
        <article class="phone-table-content-replacement-area phone-table-content-replacement-table-area${areaClass}" data-mapping-id="${escapeHtmlAttr(mappingId)}">
            <div class="phone-table-content-replacement-area-head">
                <div class="phone-table-content-replacement-area-heading">
                    <div class="phone-table-content-replacement-area-title-row">
                        <h3 class="phone-table-content-replacement-area-title">${escapeHtml(title)}</h3>
                        ${unavailable ? '<span class="phone-settings-badge is-warning">当前不可用</span>' : '<span class="phone-settings-badge is-success">可用</span>'}
                    </div>
                    <p class="phone-table-content-replacement-area-meta">按稳定表格映射保存 · sheetKey：${escapeHtml(asId(area.sheetKey) || '未绑定')}</p>
                </div>
                <div class="phone-table-content-replacement-area-actions">
                    ${buildAreaSwitchHtml({
                        id: `phone-table-content-replacement-mapping-enabled-${mappingId}`,
                        enabled: area.enabled === true,
                        scope: 'table',
                        mappingId,
                    })}
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" data-action="delete-table" data-mapping-id="${escapeHtmlAttr(mappingId)}"${isDisabled(busy)}>删除表格区域</button>
                </div>
            </div>
            ${unavailable ? '<div class="phone-settings-note phone-table-content-replacement-unavailable-note">表格当前不存在或数据库暂不可用；规则会保留，表格恢复后继续使用。</div>' : ''}
            ${buildRulesEditorHtml({ rules: area.rules, scope: 'table', mappingId, errors: errorList, disabled })}
            <div class="phone-settings-action phone-table-content-replacement-save-action">
                <button type="button" class="phone-settings-btn phone-settings-btn-primary" data-action="save-table" data-mapping-id="${escapeHtmlAttr(mappingId)}"${isDisabled(busy)}>保存并应用</button>
            </div>
        </article>
    `;
}

export function buildTableContentReplacementPageHtml(viewModel = {}) {
    const config = viewModel?.config && typeof viewModel.config === 'object' ? viewModel.config : {};
    const activeConfig = viewModel?.activeConfig && typeof viewModel.activeConfig === 'object'
        ? viewModel.activeConfig
        : config;
    const global = config.global && typeof config.global === 'object' ? config.global : {};
    const tables = asArray(viewModel.tables);
    const configuredTableRules = asArray(config.tableRules);
    const resolvedTableRules = asArray(viewModel.tableRules);
    const tableRules = configuredTableRules.map((area) => {
        const resolved = resolvedTableRules.find(item => asId(item?.mappingId) === asId(area?.mappingId));
        return resolved
            ? {
                ...area,
                tableName: resolved.tableName,
                status: resolved.status,
                headers: resolved.headers,
                rowCount: resolved.rowCount,
            }
            : area;
    });
    const errors = viewModel?.errors && typeof viewModel.errors === 'object' ? viewModel.errors : {};
    const busy = viewModel.busy === true;
    const status = asId(viewModel.status, 'ready');
    const mappedSheetKeys = new Set(tableRules.map(area => asId(area?.sheetKey)).filter(Boolean));
    const availableTables = tables.filter(table => !mappedSheetKeys.has(asId(table?.sheetKey)));
    const tableAreasHtml = tableRules.length > 0
        ? tableRules.map((area) => buildTableAreaHtml({
            area,
            table: tables.find(table => asId(table?.sheetKey) === asId(area?.sheetKey)) || null,
            errors: errors.mappings?.[area.mappingId] || {},
            busy,
        })).join('')
        : '<div class="phone-settings-note">还没有单表替换区域。可以为某一张表单独添加规则。</div>';
    const statusHtml = status === 'loading'
        ? '<div class="phone-settings-note">正在读取表格目录…</div>'
        : status === 'error'
            ? '<div class="phone-settings-note">当前无法读取表格目录；已保存的规则仍会保留。</div>'
            : '';
    const selectDisabled = availableTables.length === 0;
    const globalErrors = Array.isArray(errors.global) ? errors.global : [];
    const globalErrorHtml = buildRuleErrorHtml(
        globalErrors.filter(error => !Number.isInteger(Number(error?.index))),
    );
    const globalBodyHtml = `
        <article class="phone-table-content-replacement-area phone-table-content-replacement-global-area">
            <div class="phone-table-content-replacement-area-head">
                <div class="phone-table-content-replacement-area-heading">
                    <h3 class="phone-table-content-replacement-area-title">全局替换</h3>
                    <p class="phone-table-content-replacement-area-meta">作用于当前与以后可用的普通用户数据表。</p>
                </div>
                ${buildAreaSwitchHtml({ id: 'phone-table-content-replacement-global-enabled', enabled: global.enabled === true, scope: 'global', disabled: busy })}
            </div>
            <p class="phone-table-content-replacement-helper">第一版使用普通文字替换，支持符号、空格、换行和替换为空；输入内容只会先保存在页面草稿中。</p>
            ${globalErrorHtml}
            ${buildRulesEditorHtml({ rules: global.rules, scope: 'global', errors: globalErrors, disabled: busy })}
            <div class="phone-settings-action phone-table-content-replacement-save-action">
                <button type="button" class="phone-settings-btn phone-settings-btn-primary" data-action="save-global"${isDisabled(busy)}>保存并应用</button>
            </div>
        </article>
    `;
    const addTableHtml = `
        <div class="phone-table-content-replacement-add-table">
            <label for="phone-table-content-replacement-table-select">选择要配置的表格</label>
            <div class="phone-table-content-replacement-add-table-controls">
                <select id="phone-table-content-replacement-table-select" class="phone-settings-select phone-table-content-replacement-table-select"${isDisabled(selectDisabled)}>
                    <option value="">${selectDisabled ? '没有可添加的表格' : '请选择一张表'}</option>
                    ${buildTableOptionsHtml(availableTables)}
                </select>
                <button type="button" class="phone-settings-btn" data-action="add-table"${isDisabled(selectDisabled || busy)}>添加表格区域</button>
            </div>
        </div>
    `;
    const runningRulesSummaryHtml = buildRunningRulesSummaryHtml({
        config: activeConfig,
        resolvedTableRules,
    });
    const bodyHtml = `${statusHtml}
        ${runningRulesSummaryHtml}
        ${buildSettingsSectionHtml({
            id: 'phone-table-content-replacement-global-section',
            title: '全局替换',
            desc: '一组规则覆盖所有普通用户数据表；单表规则会在全局规则之后执行。',
            bodyHtml: globalBodyHtml,
        })}
        ${buildSettingsSectionHtml({
            id: 'phone-table-content-replacement-table-section',
            title: '单表替换',
            desc: '为指定表格配置独立规则；表格暂时不存在时，规则仍会按表名与稳定映射保留。',
            actionsHtml: addTableHtml,
            bodyHtml: `<div class="phone-table-content-replacement-table-areas">${tableAreasHtml}</div>`,
        })}`;

    return buildSettingsPageFrame({
        title: '表格内容词汇替换',
        heroHtml: buildSettingsHeroHtml({
            eyebrow: '表格内容词汇替换',
            title: '表格内容词汇替换',
            description: '把表格中的普通文字稳定地替换成你希望的词汇。低优先级后台处理会安静等待表格更新信号。',
            chips: [
                { text: '普通文字', tone: 'soft' },
                { text: '按区域保存', tone: 'soft' },
                { text: '静默后台', tone: 'soft' },
            ],
        }),
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open phone-table-content-replacement-page',
        bodyHtml,
    });
}
