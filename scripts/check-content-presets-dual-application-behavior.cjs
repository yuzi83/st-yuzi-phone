const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);
const waitForTurn = () => new Promise(resolve => setImmediate(resolve));

function select({ application, sheetKey, presetId = '', itemId = '', currentValue = '' }) {
    return {
        dataset: {
            contentPresetApplication: application,
            sheetKey,
            contentPresetCurrentValue: currentValue,
        },
        value: presetId ? (application === 'popup' ? presetId : `${presetId}:${itemId}`) : '',
        selectedOptions: presetId ? [{
            dataset: {
                presetId,
                ...(application === 'page' ? { itemId } : {}),
            },
        }] : [],
        disabled: false,
        isConnected: true,
    };
}

async function main() {
    const { createBeautifyPageBehavior } = await load('modules/settings-app/pages/beautify-behavior.js');
    const handlers = new Map();
    const calls = [];
    const container = {
        addEventListener(type, listener) { handlers.set(type, listener); },
        removeEventListener(type) { handlers.delete(type); },
    };
    const service = {
        setPageActive: async (...args) => calls.push(['set-page', ...args]),
        clearPageActive: async (...args) => calls.push(['clear-page', ...args]),
        setPopupActive: async (...args) => {
            calls.push(['set-popup', ...args]);
            if (String(args[1]).startsWith('popup-conflict') && args[2]?.replace !== true) {
                const error = new Error('组合展示会替换其他表的弹窗美化来源，需要确认');
                error.code = 'CONTENT_PRESET_POPUP_REPLACE_CONFIRMATION_REQUIRED';
                error.conflicts = [{ sheetKey: 'sheet-tasks', previousPresetId: 'other-preset' }];
                throw error;
            }
        },
        clearPopupActive: async (...args) => calls.push(['clear-popup', ...args]),
    };
    const messages = [];
    const confirmations = [];
    const behavior = createBeautifyPageBehavior({
        container,
        runtime: { isDisposed: () => false },
        waitForCommittedRefresh: async () => {},
    }, {
        contentPresetWorkshopService: service,
        showConfirmDialog: (_container, title, message, onConfirm, confirmText, _cancelText, _runtime, options) => confirmations.push({
            title, message, onConfirm, confirmText, onCancel: options?.onCancel,
        }),
        showToast: (_container, message, isError) => messages.push([message, isError]),
    });
    const detach = behavior.attachPageInteractions();

    assert.equal(typeof handlers.get('change'), 'function', '双应用下拉框必须注册 change 行为');

    handlers.get('change')({ target: select({
        application: 'page', sheetKey: 'sheet-square', presetId: 'page-preset', itemId: 'page-item',
    }) });
    await waitForTurn();
    await waitForTurn();
    assert.deepEqual(calls, [['set-page', 'sheet-square', 'page-preset', 'page-item']], '页面选择必须只调用页面应用入口');
    assert.deepEqual(messages, [['已设为当前页面美化', false]], '页面应用成功必须给出明确反馈');

    handlers.get('change')({ target: select({
        application: 'popup', sheetKey: 'sheet-square', presetId: 'popup-preset', itemId: 'popup-item',
    }) });
    await waitForTurn();
    await waitForTurn();
    assert.deepEqual(calls.at(-1), ['set-popup', 'sheet-square', 'popup-preset'], '弹窗选择只能绑定美化来源，且不能覆盖页面应用');
    assert.deepEqual(messages.at(-1), ['已设为当前弹窗美化', false]);

    handlers.get('change')({ target: select({ application: 'popup', sheetKey: 'sheet-square' }) });
    await waitForTurn();
    await waitForTurn();
    assert.deepEqual(calls.at(-1), ['clear-popup', 'sheet-square'], '清空弹窗选择只能撤销弹窗应用');
    assert.deepEqual(messages.at(-1), ['该表已恢复内置展示', false]);

    const toastCountBeforeConflict = messages.length;
    const conflictSelect = select({
        application: 'popup', sheetKey: 'sheet-people', presetId: 'popup-conflict',
        currentValue: 'popup-existing',
    });
    handlers.get('change')({ target: conflictSelect });
    await waitForTurn();
    await waitForTurn();
    assert.deepEqual(calls.at(-1), ['set-popup', 'sheet-people', 'popup-conflict'], '冲突检查必须先走正常来源应用入口');
    assert.equal(confirmations.length, 1, '组合来源抢占其他表时必须先请求用户确认');
    assert.match(confirmations[0].title, /组合|替换/, '确认标题必须让小白知道这是组合替换');
    assert.match(confirmations[0].message, /一起|关联|组合/, '确认说明必须解释为何会影响关联表');
    assert.equal(confirmations[0].confirmText, '确认一起替换', '确认按钮必须明确表示会整体替换');
    assert.equal(messages.length, toastCountBeforeConflict, '等待确认时不得错误显示失败 toast');

    confirmations[0].onCancel();
    assert.equal(conflictSelect.value, 'popup-existing', '取消组合替换后，弹窗应用下拉框必须恢复真实的原绑定');
    assert.deepEqual(
        calls.at(-1),
        ['set-popup', 'sheet-people', 'popup-conflict'],
        '取消组合替换不得写入整体替换绑定',
    );

    const confirmSelect = select({
        application: 'popup', sheetKey: 'sheet-people', presetId: 'popup-conflict-confirm',
        currentValue: 'popup-existing',
    });
    handlers.get('change')({ target: confirmSelect });
    await waitForTurn();
    await waitForTurn();
    assert.equal(confirmations.length, 2, '每次冲突选择都必须独立请求用户确认');

    await confirmations[1].onConfirm();
    await waitForTurn();
    await waitForTurn();
    assert.deepEqual(
        calls.at(-1),
        ['set-popup', 'sheet-people', 'popup-conflict-confirm', { replace: true }],
        '用户确认后必须以整体替换模式重新提交组合来源',
    );
    assert.deepEqual(messages.at(-1), ['已设为当前弹窗美化', false], '整体替换成功后必须给出成功反馈');

    detach();
    assert.equal(handlers.size, 0, '释放页面行为必须移除点击和下拉框监听');
    console.log('[content-presets-dual-application-behavior-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-dual-application-behavior-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
