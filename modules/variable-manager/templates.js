/**
 * 变量管理器 - HTML 模板
 * 使用项目现有的 phone-nav-bar / phone-app-page / phone-app-body 结构
 */

import { escapeHtml } from '../utils.js';

/**
 * 变量管理器页面主模板
 */
export function buildVariableManagerPageHtml(messageId, isMvu) {
    const floorLabel = messageId >= 0 ? `第${messageId}楼` : '无数据';
    const mvuBadge = isMvu ? '<span class="vm-mvu-badge">MVU</span>' : '';

    return `
        <div class="phone-app-page vm-page">
            <div class="phone-nav-bar vm-navbar">
                <button type="button" class="phone-nav-back vm-nav-back" aria-label="返回">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M15 19l-7-7 7-7"/></svg>
                    <span>返回</span>
                </button>
                <div class="phone-nav-title vm-nav-title">变量管理器 ${mvuBadge}</div>
                <div class="vm-nav-right-group">
                    <span class="vm-floor-label">${escapeHtml(floorLabel)}</span>
                    <button type="button" class="vm-nav-refresh" aria-label="刷新">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16">
                            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="phone-app-body vm-body">
                <div class="vm-content"></div>
            </div>
            <div class="vm-footer">
                <button type="button" class="vm-add-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>添加变量</span>
                </button>
            </div>
            <div class="vm-delete-bar vm-delete-bar-hidden">
                <button type="button" class="vm-delete-cancel-btn">完成</button>
                <button type="button" class="vm-delete-confirm-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    <span>删除选中 (<span class="vm-delete-count">0</span>)</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * 编辑态卡片 HTML — 文字全部显示，不省略
 */
export function buildEditCardHtml(path, key, displayValue, valueType) {
    return `
        <div class="vm-card vm-card-editing" data-var-path="${escapeHtml(path)}" data-var-type="${escapeHtml(valueType)}">
            <div class="vm-card-edit-inner">
                <div class="vm-card-edit-label">${escapeHtml(key)}</div>
                <textarea class="vm-edit-input" rows="2" autocomplete="off" spellcheck="false">${escapeHtml(displayValue)}</textarea>
                <div class="vm-edit-actions">
                    <button type="button" class="vm-edit-cancel">取消</button>
                    <button type="button" class="vm-edit-save">保存</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 添加变量弹窗 HTML
 */
export function buildAddVariableDialogHtml() {
    return `
        <div class="vm-dialog-overlay">
            <div class="vm-dialog">
                <div class="vm-dialog-title">添加变量</div>
                <div class="vm-dialog-body">
                    <div class="vm-dialog-field">
                        <label class="vm-dialog-label">变量路径</label>
                        <input type="text" class="vm-dialog-input vm-add-path-input" placeholder="例如: 角色.络络.好感度" autocomplete="off" spellcheck="false">
                        <div class="vm-dialog-hint">使用 . 分隔层级</div>
                    </div>
                    <div class="vm-dialog-field">
                        <label class="vm-dialog-label">变量值</label>
                        <input type="text" class="vm-dialog-input vm-add-value-input" placeholder="例如: 30" autocomplete="off" spellcheck="false">
                        <div class="vm-dialog-hint">数字、字符串、true/false、null、JSON数组/对象</div>
                    </div>
                </div>
                <div class="vm-dialog-buttons">
                    <button type="button" class="vm-dialog-btn vm-dialog-cancel">取消</button>
                    <button type="button" class="vm-dialog-btn vm-dialog-confirm">添加</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 确认弹窗 HTML
 */
export function buildConfirmDialogHtml(title, bodyHtml, confirmText = '确认', confirmClass = '') {
    return `
        <div class="vm-dialog-overlay">
            <div class="vm-dialog">
                <div class="vm-dialog-title">${escapeHtml(title)}</div>
                <div class="vm-dialog-body vm-dialog-body-confirm">${bodyHtml}</div>
                <div class="vm-dialog-buttons">
                    <button type="button" class="vm-dialog-btn vm-dialog-cancel">取消</button>
                    <button type="button" class="vm-dialog-btn vm-dialog-confirm ${confirmClass}">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        </div>
    `;
}
