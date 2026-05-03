import {
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_TEMPLATE_TYPE_SPECIAL,
} from '../../phone-beautify-templates/shared.js';

const BEAUTIFY_ROOT_BINDING_KEY = '__yuziBeautifyRootBinding';

function getScrollTop(element) {
    return element ? Math.max(0, Number(element.scrollTop) || 0) : 0;
}

function clampScrollTop(element, rawTop) {
    const maxTop = Math.max(0, (Number(element?.scrollHeight) || 0) - (Number(element?.clientHeight) || 0));
    return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
}

export function createBeautifyImportLifecycleGuard(runtime) {
    const pageRuntime = runtime && typeof runtime === 'object' ? runtime : null;
    let importToken = 0;
    let disposed = false;

    const invalidate = () => {
        importToken += 1;
    };

    const dispose = () => {
        disposed = true;
        invalidate();
    };

    const createToken = () => {
        invalidate();
        return importToken;
    };

    const isRuntimeDisposed = () => !!(pageRuntime
        && typeof pageRuntime.isDisposed === 'function'
        && pageRuntime.isDisposed());

    const isActive = (token) => (
        Number.isInteger(token)
        && token === importToken
        && !disposed
        && !isRuntimeDisposed()
    );

    if (pageRuntime && typeof pageRuntime.registerCleanup === 'function') {
        pageRuntime.registerCleanup(dispose);
    }

    return {
        createToken,
        isActive,
        invalidate,
        dispose,
    };
}

export function createBeautifyPageBehavior(params = {}, deps = {}) {
    const {
        container,
        ctx,
        getTemplateById,
        renderPage,
        runtime,
    } = params;

    const {
        captureScroll = () => {},
        restoreScroll = () => {},
        state,
        render,
        rerenderBeautifyKeepScroll: rerenderBeautifyKeepScrollHost,
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

    const addListener = typeof runtime?.addEventListener === 'function'
        ? runtime.addEventListener.bind(runtime)
        : (target, type, handler, options) => {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
                return () => {};
            }
            target.addEventListener(type, handler, options);
            return () => {
                try {
                    target.removeEventListener(type, handler, options);
                } catch {}
            };
        };

    const requestNextFrame = typeof requestAnimationFrameImpl === 'function'
        ? requestAnimationFrameImpl
        : (callback) => {
            if (typeof callback === 'function') {
                callback();
            }
            return 0;
        };

    const importLifecycle = createBeautifyImportLifecycleGuard(runtime);

    const buildTemplateTypeRefreshPlan = (templateType, extras = {}) => {
        const safeTemplateType = String(templateType || '').trim();
        const basePlan = {
            hero: false,
            summary: true,
            special: safeTemplateType === PHONE_TEMPLATE_TYPE_SPECIAL,
            generic: safeTemplateType === PHONE_TEMPLATE_TYPE_GENERIC,
        };

        if (!basePlan.special && !basePlan.generic) {
            basePlan.special = true;
            basePlan.generic = true;
        }

        return {
            ...basePlan,
            ...(extras && typeof extras === 'object' ? extras : {}),
        };
    };

    const triggerHostRerender = (options = {}) => {
        if (typeof renderPage === 'function') {
            renderPage(ctx, options);
            return;
        }

        if (typeof rerenderBeautifyKeepScrollHost === 'function') {
            rerenderBeautifyKeepScrollHost();
            return;
        }

        captureScroll('beautifyScrollTop');
        if (typeof render === 'function') {
            render();
        } else if (typeof renderPage === 'function') {
            renderPage(ctx, options);
        }
        restoreScroll('beautifyScrollTop');
    };

    const getRoot = () => container?.querySelector?.('.phone-settings-page') || container || null;

    const restoreListScrollFallback = ({ specialListScrollTop, genericListScrollTop }) => {
        requestNextFrame(() => {
            requestNextFrame(() => {
                const nextSpecialList = container?.querySelector?.('#phone-beautify-list-special') || null;
                const nextGenericList = container?.querySelector?.('#phone-beautify-list-generic') || null;

                if (nextSpecialList) {
                    nextSpecialList.scrollTop = clampScrollTop(nextSpecialList, specialListScrollTop);
                }

                if (nextGenericList) {
                    nextGenericList.scrollTop = clampScrollTop(nextGenericList, genericListScrollTop);
                }
            });
        });
    };

    const rerenderBeautifyKeepScroll = (options = {}) => {
        const specialList = container?.querySelector?.('#phone-beautify-list-special') || null;
        const genericList = container?.querySelector?.('#phone-beautify-list-generic') || null;
        const specialListScrollTop = getScrollTop(specialList);
        const genericListScrollTop = getScrollTop(genericList);
        const hasHostState = !!state && typeof state === 'object';

        if (hasHostState) {
            state.beautifyPendingSpecialListScrollTop = specialListScrollTop;
            state.beautifyPendingGenericListScrollTop = genericListScrollTop;
        }

        triggerHostRerender(options);

        if (!hasHostState) {
            restoreListScrollFallback({
                specialListScrollTop,
                genericListScrollTop,
            });
        }
    };

    const handleTemplateActivation = ({ templateId, templateType }) => {
        const safeTemplateId = String(templateId || '').trim();
        const safeTemplateType = String(templateType || '').trim();
        const result = typeof setActiveBeautifyTemplateIdByType === 'function'
            ? setActiveBeautifyTemplateIdByType(safeTemplateType, safeTemplateId)
            : { success: false, message: '启用模板失败' };

        const refreshPlan = buildTemplateTypeRefreshPlan(safeTemplateType);
        if (!result.success) {
            notify(result.message || '启用模板失败', true);
            rerenderBeautifyKeepScroll({ refreshPlan });
            return result;
        }

        notify(result.message || '模板已启用');
        rerenderBeautifyKeepScroll({ refreshPlan });
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
        rerenderBeautifyKeepScroll({
            refreshPlan: buildTemplateTypeRefreshPlan(templateType, {
                hero: true,
                summary: false,
            }),
        });
        return imported;
    };

    const readImportFile = (input, templateType, labelText) => {
        const file = input?.files?.[0];
        if (!file) return;

        const reader = typeof createFileReader === 'function' ? createFileReader() : null;
        if (!reader || typeof reader.readAsText !== 'function') {
            notify(`${labelText}导入失败：文件读取异常`, true);
            return;
        }

        const currentImportToken = importLifecycle.createToken();

        reader.onload = () => {
            if (!importLifecycle.isActive(currentImportToken)) return;
            handleImportText({
                text: String(reader.result || ''),
                templateType,
                labelText,
            });
        };

        reader.onerror = () => {
            if (!importLifecycle.isActive(currentImportToken)) return;
            notify(`${labelText}导入失败：文件读取异常`, true);
        };

        reader.readAsText(file, 'utf-8');
    };

    const bindImportByType = (triggerSelector, inputSelector, templateType, labelText) => {
        const trigger = container?.querySelector?.(triggerSelector);
        const input = container?.querySelector?.(inputSelector);
        if (!trigger || !input || typeof trigger.addEventListener !== 'function' || typeof input.addEventListener !== 'function') {
            return () => {};
        }

        const removeTriggerClick = addListener(trigger, 'click', () => {
            input.value = '';
            if (typeof input.click === 'function') {
                input.click();
            }
        });

        const removeInputChange = addListener(input, 'change', () => {
            readImportFile(input, templateType, labelText);
        });

        return () => {
            removeTriggerClick();
            removeInputChange();
        };
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
                    rerenderBeautifyKeepScroll({
                        refreshPlan: buildTemplateTypeRefreshPlan(result.templateType || target?.templateType, {
                            hero: true,
                            summary: true,
                        }),
                    });
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

    const attachPageInteractions = () => {
        const root = getRoot();
        if (!root || typeof root.addEventListener !== 'function') {
            return () => {};
        }

        const buildRootActions = () => ({
            navigateBack() {
                if (state && typeof state === 'object') {
                    state.mode = 'home';
                }
                if (typeof render === 'function') {
                    render();
                }
            },
            handleSingleTemplateExport,
            handleDeleteTemplate,
            handleTemplateActivation,
            triggerSpecialImportClick() {
                const input = root.querySelector('#phone-beautify-import-special-input');
                if (input instanceof HTMLInputElement) {
                    input.value = '';
                    input.click();
                }
            },
            triggerGenericImportClick() {
                const input = root.querySelector('#phone-beautify-import-generic-input');
                if (input instanceof HTMLInputElement) {
                    input.value = '';
                    input.click();
                }
            },
            triggerSpecialExport() {
                return triggerExport(
                    {
                        templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                        packName: '专属小剧场模板包',
                        exportMode: annotatedExportMode,
                    },
                    'yuzi_phone_special_templates.json',
                    '专属模板已导出',
                );
            },
            triggerSpecialBuiltinExport() {
                return triggerExport(
                    {
                        templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                        builtinOnly: true,
                        packName: '专属默认模板参考包',
                        exportMode: annotatedExportMode,
                    },
                    'yuzi_phone_special_builtin_templates.json',
                    '专属默认模板已导出',
                );
            },
            triggerGenericExport() {
                return triggerExport(
                    {
                        templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                        packName: '通用表格模板包',
                        exportMode: annotatedExportMode,
                    },
                    'yuzi_phone_generic_templates.json',
                    '通用模板已导出',
                );
            },
            triggerGenericBuiltinExport() {
                return triggerExport(
                    {
                        templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                        builtinOnly: true,
                        packName: '通用默认模板参考包',
                        exportMode: annotatedExportMode,
                    },
                    'yuzi_phone_generic_builtin_templates.json',
                    '通用默认模板已导出',
                );
            },
            readSpecialImport(input) {
                readImportFile(input, PHONE_TEMPLATE_TYPE_SPECIAL, '专属模板');
            },
            readGenericImport(input) {
                readImportFile(input, PHONE_TEMPLATE_TYPE_GENERIC, '通用模板');
            },
        });

        const existingBinding = root[BEAUTIFY_ROOT_BINDING_KEY];
        if (existingBinding && typeof existingBinding === 'object' && typeof existingBinding.updateActions === 'function') {
            existingBinding.updateActions(buildRootActions());
            return () => {};
        }

        const bindingState = {
            actions: buildRootActions(),
        };

        const handleClick = (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const actions = bindingState.actions || {};
            const navBack = target.closest('.phone-nav-back');
            if (navBack) {
                actions.navigateBack?.();
                return;
            }

            const button = target.closest('button');
            if (!(button instanceof HTMLButtonElement)) return;

            if (button.classList.contains('phone-beautify-export-one')) {
                const templateId = String(button.getAttribute('data-template-id') || '').trim();
                if (templateId) {
                    actions.handleSingleTemplateExport?.(templateId);
                }
                return;
            }

            if (button.classList.contains('phone-beautify-delete-one')) {
                const templateId = String(button.getAttribute('data-template-id') || '').trim();
                if (templateId) {
                    actions.handleDeleteTemplate?.(templateId);
                }
                return;
            }

            switch (button.id) {
                case 'phone-beautify-import-special-btn':
                    actions.triggerSpecialImportClick?.();
                    return;
                case 'phone-beautify-import-generic-btn':
                    actions.triggerGenericImportClick?.();
                    return;
                case 'phone-beautify-export-special-btn':
                    actions.triggerSpecialExport?.();
                    return;
                case 'phone-beautify-export-special-default-btn':
                    actions.triggerSpecialBuiltinExport?.();
                    return;
                case 'phone-beautify-export-generic-btn':
                    actions.triggerGenericExport?.();
                    return;
                case 'phone-beautify-export-generic-default-btn':
                    actions.triggerGenericBuiltinExport?.();
                    return;
            }
        };

        const handleChange = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const actions = bindingState.actions || {};
            if (target instanceof HTMLInputElement && target.classList.contains('phone-beautify-active-radio')) {
                if (!target.checked) return;
                const templateId = String(target.dataset.templateId || '').trim();
                const templateType = String(target.dataset.templateType || '').trim();
                actions.handleTemplateActivation?.({ templateId, templateType });
                return;
            }

            if (!(target instanceof HTMLInputElement)) return;

            if (target.id === 'phone-beautify-import-special-input') {
                actions.readSpecialImport?.(target);
                return;
            }

            if (target.id === 'phone-beautify-import-generic-input') {
                actions.readGenericImport?.(target);
            }
        };

        const removeClickListener = addListener(root, 'click', handleClick);
        const removeChangeListener = addListener(root, 'change', handleChange);
        const binding = {
            updateActions(nextActions) {
                bindingState.actions = nextActions && typeof nextActions === 'object'
                    ? nextActions
                    : buildRootActions();
            },
            dispose() {
                removeClickListener();
                removeChangeListener();
                if (root[BEAUTIFY_ROOT_BINDING_KEY] === binding) {
                    try {
                        delete root[BEAUTIFY_ROOT_BINDING_KEY];
                    } catch {
                        root[BEAUTIFY_ROOT_BINDING_KEY] = null;
                    }
                }
            },
        };

        root[BEAUTIFY_ROOT_BINDING_KEY] = binding;
        return () => {
            binding.dispose();
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
        attachPageInteractions,
    };
}
