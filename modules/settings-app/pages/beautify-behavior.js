function runAnimationFrame(callback, requestAnimationFrameImpl) {
    if (typeof requestAnimationFrameImpl === 'function') {
        return requestAnimationFrameImpl(callback);
    }
    if (typeof callback === 'function') {
        callback();
    }
    return 0;
}

function getScrollTop(element) {
    return element ? Math.max(0, Number(element.scrollTop) || 0) : 0;
}

function clampScrollTop(element, rawTop) {
    const maxTop = Math.max(0, (Number(element?.scrollHeight) || 0) - (Number(element?.clientHeight) || 0));
    return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
}

export function createBeautifyPageBehavior(params = {}, deps = {}) {
    const {
        container,
        ctx,
        getTemplateById,
        renderPage,
    } = params;

    const {
        captureScroll = () => {},
        restoreScroll = () => {},
    } = ctx || {};

    const {
        setActiveBeautifyTemplateIdByType,
        importPhoneBeautifyPackFromData,
        exportPhoneBeautifyPack,
        deletePhoneBeautifyUserTemplate,
        downloadTextFile,
        showConfirmDialog,
        showToast,
        requestAnimationFrameImpl,
        createFileReader,
        annotatedExportMode = 'annotated',
    } = deps;

    const notify = (message, isError = false) => {
        if (typeof showToast === 'function') {
            showToast(container, message, isError);
        }
    };

    const rerenderBeautifyKeepScroll = () => {
        captureScroll('beautifyScrollTop');

        const specialList = container?.querySelector?.('#phone-beautify-list-special') || null;
        const genericList = container?.querySelector?.('#phone-beautify-list-generic') || null;
        const specialListScrollTop = getScrollTop(specialList);
        const genericListScrollTop = getScrollTop(genericList);

        if (typeof renderPage === 'function') {
            renderPage(ctx);
        }
        restoreScroll('beautifyScrollTop');

        runAnimationFrame(() => {
            runAnimationFrame(() => {
                const nextSpecialList = container?.querySelector?.('#phone-beautify-list-special') || null;
                const nextGenericList = container?.querySelector?.('#phone-beautify-list-generic') || null;

                if (nextSpecialList) {
                    nextSpecialList.scrollTop = clampScrollTop(nextSpecialList, specialListScrollTop);
                }

                if (nextGenericList) {
                    nextGenericList.scrollTop = clampScrollTop(nextGenericList, genericListScrollTop);
                }
            }, requestAnimationFrameImpl);
        }, requestAnimationFrameImpl);
    };

    const handleTemplateActivation = ({ templateId, templateType }) => {
        const safeTemplateId = String(templateId || '').trim();
        const safeTemplateType = String(templateType || '').trim();
        const result = typeof setActiveBeautifyTemplateIdByType === 'function'
            ? setActiveBeautifyTemplateIdByType(safeTemplateType, safeTemplateId)
            : { success: false, message: '启用模板失败' };

        if (!result.success) {
            notify(result.message || '启用模板失败', true);
            rerenderBeautifyKeepScroll();
            return result;
        }

        notify(result.message || '模板已启用');
        rerenderBeautifyKeepScroll();
        return result;
    };

    const triggerExport = (options, filename, successTip) => {
        const result = typeof exportPhoneBeautifyPack === 'function'
            ? exportPhoneBeautifyPack(options)
            : { success: false, pack: null, count: 0 };

        if (!result.success || !result.pack || result.count <= 0) {
            notify('没有可导出的模板', true);
            return result;
        }

        try {
            if (typeof downloadTextFile === 'function') {
                downloadTextFile(filename, JSON.stringify(result.pack, null, 2), 'application/json');
            }
            const modeText = result?.pack?.packMeta?.exportMode || annotatedExportMode;
            notify(`${successTip}（${result.count}项 / ${modeText}）`);
        } catch (error) {
            notify(`导出失败：${error?.message || '未知错误'}`, true);
        }

        return result;
    };

    const handleImportText = ({ text, templateType, labelText }) => {
        const imported = typeof importPhoneBeautifyPackFromData === 'function'
            ? importPhoneBeautifyPackFromData(String(text || ''), {
                templateTypeFilter: templateType,
                overwrite: false,
            })
            : { success: false, errors: ['导入失败'], imported: 0, warnings: [] };

        if (!imported.success) {
            const detail = imported.errors?.[0] || imported.message || '导入失败';
            notify(`${labelText}导入失败：${detail}`, true);
            return imported;
        }

        const warningText = imported.warnings?.length > 0
            ? `（含${imported.warnings.length}条警告）`
            : '';
        notify(`${labelText}导入成功：${imported.imported}项${warningText}`);
        rerenderBeautifyKeepScroll();
        return imported;
    };

    const bindImportByType = (triggerSelector, inputSelector, templateType, labelText) => {
        const trigger = container?.querySelector?.(triggerSelector);
        const input = container?.querySelector?.(inputSelector);
        if (!trigger || !input || typeof trigger.addEventListener !== 'function' || typeof input.addEventListener !== 'function') {
            return;
        }

        trigger.addEventListener('click', () => {
            input.value = '';
            if (typeof input.click === 'function') {
                input.click();
            }
        });

        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;

            const reader = typeof createFileReader === 'function' ? createFileReader() : null;
            if (!reader || typeof reader.readAsText !== 'function') {
                notify(`${labelText}导入失败：文件读取异常`, true);
                return;
            }

            reader.onload = () => {
                handleImportText({
                    text: String(reader.result || ''),
                    templateType,
                    labelText,
                });
            };

            reader.onerror = () => {
                notify(`${labelText}导入失败：文件读取异常`, true);
            };

            reader.readAsText(file, 'utf-8');
        });
    };

    const handleSingleTemplateExport = (templateId) => {
        const safeTemplateId = String(templateId || '').trim();
        if (!safeTemplateId) return null;

        const result = typeof exportPhoneBeautifyPack === 'function'
            ? exportPhoneBeautifyPack({
                templateIds: [safeTemplateId],
                packName: `单模板导出-${safeTemplateId}`,
                exportMode: annotatedExportMode,
            })
            : { success: false, count: 0, pack: null };

        if (!result.success || result.count <= 0 || !result.pack) {
            notify('导出失败：模板不存在', true);
            return result;
        }

        const fileName = `yuzi_phone_template_${safeTemplateId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;
        if (typeof downloadTextFile === 'function') {
            downloadTextFile(fileName, JSON.stringify(result.pack, null, 2), 'application/json');
        }
        notify('模板已导出');
        return result;
    };

    const handleDeleteTemplate = (templateId) => {
        const safeTemplateId = String(templateId || '').trim();
        if (!safeTemplateId) return null;

        const target = typeof getTemplateById === 'function' ? getTemplateById(safeTemplateId) : null;
        const displayName = target?.name || safeTemplateId;

        if (typeof showConfirmDialog === 'function') {
            showConfirmDialog(
                container,
                '确认删除',
                `确定删除模板「${displayName}」吗？此操作无法撤销。`,
                () => {
                    const result = typeof deletePhoneBeautifyUserTemplate === 'function'
                        ? deletePhoneBeautifyUserTemplate(safeTemplateId)
                        : { success: false, message: '删除失败' };
                    if (!result.success) {
                        notify(result.message || '删除失败', true);
                        return result;
                    }

                    notify(`模板「${displayName}」已删除`);
                    rerenderBeautifyKeepScroll();
                    return result;
                },
                '删除',
                '取消'
            );
        }

        return {
            templateId: safeTemplateId,
            displayName,
        };
    };

    return {
        rerenderBeautifyKeepScroll,
        handleTemplateActivation,
        triggerExport,
        handleImportText,
        bindImportByType,
        handleSingleTemplateExport,
        handleDeleteTemplate,
    };
}
