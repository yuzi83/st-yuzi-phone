export function extractSheets(template) {
    if (!template || typeof template !== 'object') return [];
    return Object.keys(template)
        .filter(k => k.startsWith('sheet_'))
        .map(k => ({
            key: k,
            name: template[k]?.name || k,
            cols: Array.isArray(template[k]?.content?.[0]) ? template[k].content[0].length : 0,
        }))
        .sort((a, b) => {
            const ao = template[a.key]?.orderNo ?? Infinity;
            const bo = template[b.key]?.orderNo ?? Infinity;
            return ao - bo;
        });
}

export function pickJsonFile(callback, onError, runtime = null) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, handler, options) => {
            target.addEventListener(type, handler, options);
            return () => target.removeEventListener(type, handler, options);
        };
    const setManagedTimeout = runtime?.setTimeout
        ? (...args) => runtime.setTimeout(...args)
        : (...args) => window.setTimeout(...args);

    const cleanupInput = () => {
        if (input.parentNode) {
            input.remove();
        }
    };
    runtime?.registerCleanup?.(cleanupInput);

    const handleWindowFocus = () => {
        setManagedTimeout(() => {
            if (!input.files?.length) {
                cleanupInput();
            }
        }, 300);
    };

    addListener(window, 'focus', handleWindowFocus, { once: true });

    addListener(input, 'change', () => {
        const file = input.files?.[0];
        if (!file) {
            cleanupInput();
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = typeof reader.result === 'string' ? reader.result : '';
                const obj = JSON.parse(text);
                callback(obj, file.name);
            } catch (error) {
                onError?.(`模板文件解析失败：${file.name}`, error);
            } finally {
                cleanupInput();
            }
        };

        reader.onerror = () => {
            onError?.(`模板文件读取失败：${file.name}`, reader.error || null);
            cleanupInput();
        };

        reader.readAsText(file);
    }, { once: true });

    input.click();
}
