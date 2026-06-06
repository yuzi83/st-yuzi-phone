const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function normalize(value) {
    return String(value || '').replace(/\r\n/g, '\n');
}

function assertIncludes(source, snippet, message, failures) {
    if (!normalize(source).includes(normalize(snippet))) {
        failures.push(message);
    }
}

function main() {
    const failures = [];
    const addRowModal = read('modules/table-viewer/add-row-modal.js');
    const listRenderer = read('modules/table-viewer/list-page-renderer.js');
    const genericRuntime = read('modules/table-viewer/generic-runtime.js');
    const rowDelete = read('modules/table-viewer/row-delete-controller.js');
    const listController = read('modules/table-viewer/list-page-controller.js');
    const detailEdit = read('modules/table-viewer/detail-edit-controller.js');

    assertIncludes(addRowModal, 'function isRuntimeDisposed(runtime) {\n    return !!(runtime && typeof runtime.isDisposed === \'function\' && runtime.isDisposed());\n}', 'add-row-modal 暴露 runtime disposed helper', failures);
    assertIncludes(addRowModal, 'viewerRuntime: providedViewerRuntime,', 'add-row-modal 接收显式 viewerRuntime', failures);
    assertIncludes(addRowModal, 'const viewerRuntime = providedViewerRuntime && typeof providedViewerRuntime === \'object\'\n        ? providedViewerRuntime\n        : resolveViewerRuntime(container);', 'add-row-modal 优先使用显式 viewerRuntime，保留 DOM 反查 fallback', failures);
    assertIncludes(addRowModal, 'const result = await insertTableRow(tableName, newData);\n            if (!isViewerActive()) return;', 'add-row-modal insert await 后阻断旧 UI 回写', failures);
    assertIncludes(addRowModal, 'if (!isRuntimeActive(viewerRuntime)) {\n            return {\n                reachedExpected,\n                latestSummary,\n                aborted: true,\n            };\n        }', 'add-row-modal reconcile sleep 后检查 viewer lifecycle', failures);
    assertIncludes(addRowModal, 'await refreshPhoneTableProjection();\n            if (!isRuntimeActive(viewerRuntime)) {', 'add-row-modal reconcile projection await 后检查 viewer lifecycle', failures);
    assertIncludes(addRowModal, 'viewerRuntime,\n                })).catch((reconcileError) => {', 'add-row-modal 将 viewerRuntime 传入 reconcile', failures);
    assertIncludes(addRowModal, 'if (!isViewerActive()) return;\n            showInlineToast(container, `新增异常: ${err?.message || \'未知错误\'}`);', 'add-row-modal catch 分支 disposed 后不 toast/恢复旧按钮', failures);

    assertIncludes(listRenderer, 'refreshListAfterDataMutation,\n            viewerRuntime,\n        });', 'list-page-renderer 向新增弹窗显式传 viewerRuntime', failures);
    assertIncludes(genericRuntime, 'deletePhoneSheetRows,\n        showInlineToast,\n        viewerRuntime,\n    });', 'generic-runtime 向删除控制器传 viewerRuntime', failures);

    assertIncludes(rowDelete, 'function isRuntimeDisposed(runtime) {\n    return !!(runtime && typeof runtime.isDisposed === \'function\' && runtime.isDisposed());\n}', 'row-delete-controller 暴露 runtime disposed helper', failures);
    assertIncludes(rowDelete, 'viewerRuntime,\n    } = options;\n\n    const isViewerActive = () => isRuntimeActive(viewerRuntime);', 'row-delete-controller 接收 viewerRuntime 并建立 active helper', failures);
    assertIncludes(rowDelete, 'const result = await deletePhoneSheetRows(sheetKey, requestedRowIndexes, {\n            tableName: liveTableName,\n        });\n        const deletedRowIndexes = normalizeRowIndexes(result.deletedRowIndexes || []);\n        const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);\n        const fallbackNotDeletedRowIndexes = requestedRowIndexes.filter((rowIndex) => !deletedRowIndexes.includes(rowIndex));\n        const notDeletedRowIndexes = normalizeRowIndexes(result.notDeletedRowIndexes || fallbackNotDeletedRowIndexes);\n        const attemptedRowIndexes = normalizeRowIndexes(result.attemptedRowIndexes || [...deletedRowIndexes, ...failedRowIndexes]);\n        const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || notDeletedRowIndexes.filter((rowIndex) => !failedRowIndexes.includes(rowIndex)));\n        const hasDeletion = deletedRowIndexes.length > 0;\n        const failedViewRowIndexes = remapRemainingRowIndexes(failedRowIndexes, deletedRowIndexes);\n        const unattemptedViewRowIndexes = remapRemainingRowIndexes(unattemptedRowIndexes, deletedRowIndexes);\n        const notDeletedViewRowIndexes = remapRemainingRowIndexes(notDeletedRowIndexes, deletedRowIndexes);', 'row-delete-controller 批量删除 await 后解析部分成功结果', failures);
    assertIncludes(rowDelete, 'if (!result.ok && !hasDeletion) {\n            const message = result.message || \'删除失败\';\n            if (isViewerActive()) {\n                syncRowsFromSheet();\n                showInlineToast(container, message, true);\n            }\n            return createDeleteOutcome({', 'row-delete-controller 删除失败 await 后只在 active 时同步旧 UI', failures);
    assertIncludes(rowDelete, 'if (hasDeletion) {\n            applyLockStateAfterRowsDelete(sheetKey, deletedRowIndexes);\n        }\n        if (!isViewerActive()) {\n            return createDeleteOutcome({\n                ok: !!result.ok,\n                deleted: hasDeletion,', 'row-delete-controller 删除成功或部分成功后保留锁状态重排并阻断 inactive UI 回写', failures);
    assertIncludes(rowDelete, 'const synced = syncRowsFromSheet();\n        const message = result.message || (deletedRowIndexes.length > 1 ? `已删除 ${deletedRowIndexes.length} 条记录` : \'删除成功\');', 'row-delete-controller active 成功路径才同步当前视图', failures);

    assertIncludes(listController, 'function isRuntimeDisposed(runtime) {\n    return !!(runtime && typeof runtime.isDisposed === \'function\' && runtime.isDisposed());\n}\n\nfunction isGenericListContextActive(context) {', 'list-page-controller 暴露 context active helper', failures);
    assertIncludes(listController, 'deleteOutcome = normalizeDeleteOutcome(await context.deleteRowsFromList(rowIndexes));\n        if (deleteOutcome.deleted && isGenericListContextActive(context)) {', 'list-page-controller 批量 delete await 后 inactive 不 toast', failures);
    assertIncludes(listController, 'if (typeof nextContext.setSuppressExternalTableUpdate === \'function\') {\n            nextContext.setSuppressExternalTableUpdate(false);\n        }\n        if (!isGenericListContextActive(nextContext)) return;', 'list-page-controller finally 先恢复 suppress 再阻断旧 UI 回写', failures);

    assertIncludes(detailEdit, 'const isViewerActive = () => !(runtime && typeof runtime.isDisposed === \'function\' && runtime.isDisposed());', 'detail-edit-controller 建立 runtime active helper', failures);
    assertIncludes(detailEdit, 'const result = await updateTableRow(liveTableName, dataRowIndex, updateData);\n            if (!isViewerActive()) return;', 'detail-edit-controller updateRow await 后阻断旧 UI 回写', failures);
    assertIncludes(detailEdit, 'runtime.setSuppressExternalTableUpdate(true);\n                suppressExternalTableUpdate = true;', 'detail-edit-controller 保存前开启 external update suppress', failures);
    assertIncludes(detailEdit, 'if (suppressExternalTableUpdate && typeof runtime?.setSuppressExternalTableUpdate === \'function\') {\n                runtime.setSuppressExternalTableUpdate(false);\n            }\n            if (isViewerActive()) {', 'detail-edit-controller finally 先恢复 suppress 再判断 active', failures);
    assertIncludes(detailEdit, 'if (isViewerActive()) {\n                showInlineToast(container, `保存异常: ${err?.message || \'未知错误\'}`);\n            }\n        } finally {', 'detail-edit-controller catch 只在 active 时 toast', failures);
    assertIncludes(detailEdit, 'if (isViewerActive()) {\n                state.setSaving(false);\n                renderKeepScroll();\n                if (deferredToast) {', 'detail-edit-controller finally 只在 active 时恢复 saving、render 并消费延迟 toast', failures);
    assertIncludes(detailEdit, 'const refreshedFromSheet = typeof syncRowsFromSheet === \'function\' && syncRowsFromSheet();', 'detail-edit-controller 保存成功后从 sheet 对账', failures);

    if (failures.length > 0) {
        console.error('[generic-viewer-lifecycle-check] 检查失败：');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log('[generic-viewer-lifecycle-check] 检查通过');
    console.log('- OK | 新增链路 insert/reconcile await 后接入 viewer lifecycle guard');
    console.log('- OK | 批量删除链路区分锁状态重排副作用与旧 UI 回写');
    console.log('- OK | 删除外层 finally 先恢复 suppress，再阻断旧 UI 刷新');
    console.log('- OK | 保存链路 save await 与 catch/finally 接入 viewer lifecycle guard');
}

main();
