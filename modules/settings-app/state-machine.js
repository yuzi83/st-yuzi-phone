// modules/settings-app/state-machine.js
/**
 * 玉子的手机 - 设置 App 状态机
 *
 * 提供 createSettingsAppState() 工厂方法，返回一份与 [`types.SettingsAppState`](types.d.ts:1) 对齐的初值。
 *
 * 22 字段 state 对象不再以匿名 inline 形式散落在 renderSettings()，
 * 在这里集中维护更便于：
 *   1. 新增字段时只动一个文件
 *   2. 文档化每个字段的含义与初值
 *   3. 单元测试可以直接断言字段集
 */

/**
 * 创建设置 App 默认 state。
 * @returns {import('../../types').SettingsAppState}
 */
export function createSettingsAppState() {
    return {
        // 当前页面：home | appearance | database | beautify | button_style | ai_instruction_presets | api_prompt_config | prompt_editor
        mode: 'home',

        // 各页面的滚动位置（home 页对应 homeScrollTop 在 createScrollPreserver 内部维护）
        databaseScrollTop: 0,
        appearanceScrollTop: 0,
        beautifyScrollTop: 0,
        buttonStyleScrollTop: 0,
        apiPromptConfigScrollTop: 0,

        // 提示词编辑器状态
        promptEditorName: '',
        promptEditorContent: '',
        promptEditorIsNew: true,
        promptEditorOriginalName: '',
        promptEditorMediaMarkers: null,

        // AI 指令预设页状态
        aiInstructionSelectedPresetName: '',
        aiInstructionDraftName: '',
        aiInstructionDraftOriginalName: '',
        aiInstructionDraftImagePrefix: '',
        aiInstructionDraftVideoPrefix: '',
        aiInstructionDraftPromptGroup: [],

        // API Prompt 与世界书工作台状态
        worldbookLoading: false,
        worldbookError: null,
        worldbookList: [],          // 所有世界书名称列表
        currentWorldbook: '',       // 当前选中的世界书名称
        worldbookSourceMode: 'manual',
        boundWorldbookNames: [],
        worldbookEntries: [],       // 当前世界书的条目列表
        worldbookSearchQuery: '',   // 搜索关键词
    };
}

/**
 * 把 intent patch 合并到 state 上（就地修改）。
 * @param {import('../../types').SettingsAppState} state
 * @param {Record<string, unknown> | null} patch
 */
export function applyStatePatch(state, patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(state, patch);
}
