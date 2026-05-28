import {
    APPEARANCE_FONT_LIBRARY_DEFAULTS,
    APPEARANCE_FONT_LIBRARY_LIMITS,
    computeAppearanceFontHash,
    getPhoneSettings,
    normalizeAppearanceFontFamilyName,
    normalizeAppearanceFontLibrarySettings,
    savePhoneSetting,
} from '../../../settings.js';
import { fileToDataUrl, estimateBase64Bytes } from '../media-upload.js';

const FONT_STYLE_ELEMENT_ID = 'yuzi-phone-font-library-style';
const FONT_CONTAINER_ID = 'yuzi-phone-standalone';
const DEFAULT_FONT_ID = APPEARANCE_FONT_LIBRARY_DEFAULTS.activeFontId;

const BUILTIN_FONTS = Object.freeze([
    Object.freeze({
        id: 'builtin.system-ui',
        name: '系统清晰',
        family: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", "HarmonyOS Sans", "Noto Sans CJK SC", sans-serif',
        previewText: '玉子手机 · 清晰耐看的系统界面字体',
    }),
    Object.freeze({
        id: 'builtin.modern-sans',
        name: '现代黑体',
        family: '"Helvetica Neue", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
        previewText: '玉子手机 · 干净利落的现代黑体观感',
    }),
    Object.freeze({
        id: 'builtin.chill-round',
        name: '寒蝉圆体',
        family: '"YuziPhoneChillRoundF", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
        previewText: '玉子手机 · 柔和圆润的内置中文圆体',
        fontFaces: Object.freeze([
            Object.freeze({
                family: 'YuziPhoneChillRoundF',
                file: 'assets/fonts/chill-round-f/ChillRoundFRegular.otf',
                format: 'opentype',
                weight: '400',
                style: 'normal',
            }),
            Object.freeze({
                family: 'YuziPhoneChillRoundF',
                file: 'assets/fonts/chill-round-f/ChillRoundFBold.otf',
                format: 'opentype',
                weight: '700',
                style: 'normal',
            }),
        ]),
    }),
    Object.freeze({
        id: 'builtin.basic-sans',
        name: '基础无衬线',
        family: 'sans-serif',
        previewText: '玉子手机 · 使用浏览器基础无衬线字体',
    }),
]);

const FONT_FORMATS = Object.freeze({
    woff2: Object.freeze({ mime: 'font/woff2', cssFormat: 'woff2' }),
    woff: Object.freeze({ mime: 'font/woff', cssFormat: 'woff' }),
    ttf: Object.freeze({ mime: 'font/ttf', cssFormat: 'truetype' }),
    otf: Object.freeze({ mime: 'font/otf', cssFormat: 'opentype' }),
});

const FONT_MIME_ALIASES = Object.freeze({
    'font/woff2': 'woff2',
    'application/font-woff2': 'woff2',
    'application/x-font-woff2': 'woff2',
    'font/woff': 'woff',
    'application/font-woff': 'woff',
    'application/x-font-woff': 'woff',
    'font/ttf': 'ttf',
    'font/truetype': 'ttf',
    'application/x-font-ttf': 'ttf',
    'application/x-font-truetype': 'ttf',
    'font/otf': 'otf',
    'font/opentype': 'otf',
    'application/x-font-otf': 'otf',
});

function clone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function normalizeString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
}

function getBuiltinFontById(id) {
    return BUILTIN_FONTS.find((font) => font.id === id) || BUILTIN_FONTS[0];
}

function getFileExtension(file) {
    const name = normalizeString(file?.name).toLowerCase();
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match?.[1] || '';
}

function getDataUrlMime(dataUrl) {
    const match = normalizeString(dataUrl).match(/^data:([^;,]+)[;,]/i);
    return match?.[1] ? String(match[1]).trim().toLowerCase() : '';
}

function detectFontFormat(file, dataUrl = '') {
    const ext = getFileExtension(file);
    if (FONT_FORMATS[ext]) return ext;

    const mime = normalizeString(file?.type || getDataUrlMime(dataUrl)).toLowerCase();
    return FONT_MIME_ALIASES[mime] || '';
}

function normalizeFontDataUrl(dataUrl, format) {
    const normalizedFormat = FONT_FORMATS[format] ? format : '';
    if (!normalizedFormat) return '';
    const mime = FONT_FORMATS[normalizedFormat].mime;
    const source = normalizeString(dataUrl);
    if (!source.startsWith('data:')) return '';
    return source.replace(/^data:([^;,]+)([;,])/i, `data:${mime}$2`);
}

function cssString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n|\r|\f/g, ' ');
}

function normalizeCssFontUrlInput(value) {
    const source = normalizeString(value);
    if (!source) return '';
    try {
        const url = new URL(source);
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function cssUrl(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n|\r|\f/g, '');
}

function buildInternalFamily(hash) {
    return normalizeAppearanceFontFamilyName(`YuziPhoneUserFont_${normalizeString(hash).replace(/[^a-zA-Z0-9_-]/g, '_')}`);
}

function getNormalizedFontLibrary() {
    return normalizeAppearanceFontLibrarySettings(getPhoneSettings().appearanceFontLibrary);
}

function saveFontLibrary(library) {
    const normalized = normalizeAppearanceFontLibrarySettings(library);
    const saved = savePhoneSetting('appearanceFontLibrary', normalized);
    if (saved) {
        applyAppearanceFontLibrary();
    }
    return saved;
}

function createResult(success, message, extra = {}) {
    return {
        success,
        message,
        ...extra,
    };
}

function getExtensionRootUrl() {
    const moduleUrl = String(import.meta.url || '');
    return moduleUrl.includes('/dist/')
        ? new URL('../', moduleUrl)
        : new URL('../../../../', moduleUrl);
}

function resolveExtensionAssetUrl(assetPath) {
    return new URL(assetPath, getExtensionRootUrl()).href;
}

function buildFontImportCss(font) {
    if (font?.sourceType !== 'css-url') return '';
    const url = normalizeCssFontUrlInput(font.cssUrl);
    if (!url || !font.family) return '';
    return `@import url("${cssUrl(url)}");`;
}

function buildFontFaceCss(font) {
    if (font?.sourceType === 'css-url') return '';
    const formatConfig = FONT_FORMATS[font.format];
    if (!formatConfig || !font.family || !font.dataUrl) return '';
    return `@font-face { font-family: "${cssString(font.family)}"; src: url("${cssUrl(font.dataUrl)}") format("${formatConfig.cssFormat}"); font-display: swap; }`;
}

function buildUserFontCssFamily(font) {
    return `"${cssString(font?.family)}", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
}

function buildBuiltinFontFaceCss(font) {
    if (!font || !Array.isArray(font.fontFaces)) return '';

    return font.fontFaces.map((face) => {
        const family = cssString(face?.family);
        const file = normalizeString(face?.file);
        if (!family || !file) return '';

        const url = resolveExtensionAssetUrl(file);
        const format = cssString(face?.format || 'opentype');
        const weight = cssString(face?.weight || '400');
        const style = cssString(face?.style || 'normal');

        return `@font-face { font-family: "${family}"; src: url("${cssUrl(url)}") format("${format}"); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`;
    }).filter(Boolean).join('\n');
}

function buildScopedFontOverrideCss(activeFont) {
    const cssFamily = activeFont?.cssFamily ? String(activeFont.cssFamily) : getBuiltinFontById(DEFAULT_FONT_ID).family;
    const selector = [
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id]`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-shell`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-page`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-app-page`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-settings-page`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-home`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-home *:not(svg):not(svg *):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.monospace):not(.phone-monospace):not(code):not(pre):not(kbd):not(samp):not(input):not(textarea):not(select)`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-settings-page *:not(svg):not(svg *):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.monospace):not(.phone-monospace):not(code):not(pre):not(kbd):not(samp):not(input):not(textarea):not(select)`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-table-page *:not(svg):not(svg *):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.monospace):not(.phone-monospace):not(code):not(pre):not(kbd):not(samp):not(input):not(textarea):not(select)`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-special-template-scope *:not(svg):not(svg *):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.monospace):not(.phone-monospace):not(code):not(pre):not(kbd):not(samp):not(input):not(textarea):not(select)`,
        `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-generic-template-scope *:not(svg):not(svg *):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.monospace):not(.phone-monospace):not(code):not(pre):not(kbd):not(samp):not(input):not(textarea):not(select)`,
    ].join(',\n');

    return `${selector} { font-family: ${cssFamily} !important; }\n`
        + `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-dock-text-icon,\n`
        + `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-app-label,\n`
        + `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-status-time,\n`
        + `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-settings-font-preview,\n`
        + `#${FONT_CONTAINER_ID}[data-yuzi-phone-font-id] .phone-settings-font-preview * { font-family: ${cssFamily} !important; }`;
}

function getStyleElement() {
    if (typeof document === 'undefined') return null;
    let style = document.getElementById(FONT_STYLE_ELEMENT_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = FONT_STYLE_ELEMENT_ID;
        style.setAttribute('data-yuzi-phone-font-library', 'true');
        document.head.appendChild(style);
    }
    return style;
}

function resolveActiveFont(library = getNormalizedFontLibrary()) {
    const userFont = library.userFonts.find((font) => font.id === library.activeFontId);
    if (userFont) {
        return {
            ...userFont,
            builtin: false,
            cssFamily: buildUserFontCssFamily(userFont),
            previewText: `玉子手机 · ${userFont.name}`,
        };
    }

    const builtin = getBuiltinFontById(library.activeFontId);
    return {
        ...builtin,
        builtin: true,
        cssFamily: builtin.family,
    };
}

export function getAppearanceBuiltinFonts() {
    return BUILTIN_FONTS.map((font) => ({ ...font, builtin: true }));
}

export function getAppearanceFontLibraryViewModel() {
    const library = getNormalizedFontLibrary();
    const activeFont = resolveActiveFont(library);
    const totalBytes = library.userFonts.reduce((sum, font) => sum + Math.max(0, Number(font.bytes) || 0), 0);
    const options = [
        ...getAppearanceBuiltinFonts(),
        ...library.userFonts.map((font) => ({ ...font, builtin: false })),
    ];

    return {
        activeFontId: library.activeFontId,
        activeFont,
        options,
        userFonts: clone(library.userFonts),
        limits: {
            maxFonts: APPEARANCE_FONT_LIBRARY_LIMITS.userFonts,
            singleFontBytes: APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes,
            totalFontBytes: APPEARANCE_FONT_LIBRARY_LIMITS.totalFontBytes,
        },
        stats: {
            userFontCount: library.userFonts.length,
            totalBytes,
        },
    };
}

export function importAppearanceFontCssUrl({ name, cssUrl, family } = {}) {
    const normalizedUrl = normalizeCssFontUrlInput(cssUrl);
    if (!normalizedUrl) {
        return createResult(false, '导入失败：字体 CSS URL 必须是 https:// 完整地址');
    }

    const normalizedFamily = normalizeAppearanceFontFamilyName(family);
    if (!normalizedFamily) {
        return createResult(false, '导入失败：字体族名不能为空');
    }

    const library = getNormalizedFontLibrary();
    if (library.userFonts.length >= APPEARANCE_FONT_LIBRARY_LIMITS.userFonts) {
        return createResult(false, `导入失败：最多只能保存 ${APPEARANCE_FONT_LIBRARY_LIMITS.userFonts} 个用户字体`);
    }

    const hash = computeAppearanceFontHash(`${normalizedUrl}#${normalizedFamily}`);
    const duplicate = library.userFonts.find((font) => font.hash === hash);
    if (duplicate) {
        return createResult(false, `字体已存在：${duplicate.name}`, { duplicateId: duplicate.id });
    }

    const normalizedName = normalizeString(name, normalizedFamily).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.nameLength) || normalizedFamily;
    const font = {
        id: `user_font_css_url_${hash.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.idLength),
        name: normalizedName,
        family: normalizedFamily,
        format: 'css',
        cssUrl: normalizedUrl,
        hash,
        bytes: 0,
        source: 'user',
        sourceType: 'css-url',
        createdAt: Date.now(),
    };

    const nextLibrary = normalizeAppearanceFontLibrarySettings({
        activeFontId: font.id,
        userFonts: [...library.userFonts, font],
    });
    const saved = saveFontLibrary(nextLibrary);
    return saved
        ? createResult(true, `已导入并应用字体：${font.name}`, { font: nextLibrary.userFonts.find((item) => item.id === font.id) || font })
        : createResult(false, '导入失败：设置保存失败');
}

export async function importAppearanceFontFile(file) {
    if (!file) {
        return createResult(false, '导入失败：没有选择字体文件');
    }

    const size = Number(file.size) || 0;
    if (size <= 0) {
        return createResult(false, '导入失败：字体文件为空');
    }
    if (size > APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes) {
        return createResult(false, `导入失败：单个字体不能超过 ${Math.round(APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes / 1024 / 1024)}MB`);
    }

    let rawDataUrl = '';
    try {
        rawDataUrl = await fileToDataUrl(file);
    } catch {
        return createResult(false, '导入失败：无法读取字体文件');
    }

    const format = detectFontFormat(file, rawDataUrl);
    if (!format || !FONT_FORMATS[format]) {
        return createResult(false, '导入失败：仅支持 woff2、woff、ttf、otf 字体');
    }

    const dataUrl = normalizeFontDataUrl(rawDataUrl, format);
    const bytes = estimateBase64Bytes(dataUrl);
    if (!dataUrl || bytes <= 0) {
        return createResult(false, '导入失败：字体数据无效');
    }
    if (bytes > APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes) {
        return createResult(false, `导入失败：字体编码后超过 ${Math.round(APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes / 1024 / 1024)}MB`);
    }

    const library = getNormalizedFontLibrary();
    if (library.userFonts.length >= APPEARANCE_FONT_LIBRARY_LIMITS.userFonts) {
        return createResult(false, `导入失败：最多只能保存 ${APPEARANCE_FONT_LIBRARY_LIMITS.userFonts} 个用户字体`);
    }

    const totalBytes = library.userFonts.reduce((sum, font) => sum + Math.max(0, Number(font.bytes) || 0), 0);
    if (totalBytes + bytes > APPEARANCE_FONT_LIBRARY_LIMITS.totalFontBytes) {
        return createResult(false, `导入失败：字体库总容量不能超过 ${Math.round(APPEARANCE_FONT_LIBRARY_LIMITS.totalFontBytes / 1024 / 1024)}MB`);
    }

    const hash = computeAppearanceFontHash(dataUrl);
    const duplicate = library.userFonts.find((font) => font.hash === hash);
    if (duplicate) {
        return createResult(false, `字体已存在：${duplicate.name}`, { duplicateId: duplicate.id });
    }

    const rawName = normalizeString(file.name).replace(/\.[a-z0-9]+$/i, '') || `用户字体 ${library.userFonts.length + 1}`;
    const font = {
        id: `user_font_${hash.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.idLength),
        name: rawName.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.nameLength),
        family: buildInternalFamily(hash),
        mime: FONT_FORMATS[format].mime,
        format,
        dataUrl,
        hash,
        sourceType: 'data-url',
        bytes,
        source: 'user',
        createdAt: Date.now(),
    };

    const nextLibrary = normalizeAppearanceFontLibrarySettings({
        activeFontId: font.id,
        userFonts: [...library.userFonts, font],
    });
    const saved = saveFontLibrary(nextLibrary);
    return saved
        ? createResult(true, `已导入并应用字体：${font.name}`, { font: nextLibrary.userFonts.find((item) => item.id === font.id) || font })
        : createResult(false, '导入失败：设置保存失败');
}

export function selectAppearanceFont(fontId) {
    const library = getNormalizedFontLibrary();
    const nextLibrary = normalizeAppearanceFontLibrarySettings({
        ...library,
        activeFontId: fontId,
    });
    const saved = saveFontLibrary(nextLibrary);
    const activeFont = resolveActiveFont(nextLibrary);
    return saved
        ? createResult(true, `已应用字体：${activeFont.name}`, { activeFont })
        : createResult(false, '字体应用失败：设置保存失败');
}

export function deleteAppearanceFont(fontId) {
    const targetId = normalizeString(fontId);
    if (!targetId || targetId.startsWith('builtin.')) {
        return createResult(false, '内置字体不能删除');
    }

    const library = getNormalizedFontLibrary();
    const target = library.userFonts.find((font) => font.id === targetId);
    if (!target) {
        return createResult(false, '删除失败：字体不存在');
    }

    const nextFonts = library.userFonts.filter((font) => font.id !== targetId);
    const nextActiveFontId = library.activeFontId === targetId ? DEFAULT_FONT_ID : library.activeFontId;
    const saved = saveFontLibrary({
        activeFontId: nextActiveFontId,
        userFonts: nextFonts,
    });
    return saved
        ? createResult(true, `已删除字体：${target.name}`)
        : createResult(false, '删除失败：设置保存失败');
}

export function applyAppearanceFontLibrary(root = null) {
    if (typeof document === 'undefined') return false;

    const library = getNormalizedFontLibrary();
    const activeFont = resolveActiveFont(library);
    const style = getStyleElement();
    if (style) {
        const userFontImports = library.userFonts.map(buildFontImportCss).filter(Boolean);
        const userFontFaces = library.userFonts.map(buildFontFaceCss).filter(Boolean);
        style.textContent = [
            ...userFontImports,
            buildBuiltinFontFaceCss(activeFont),
            ...userFontFaces,
            buildScopedFontOverrideCss(activeFont),
        ].filter(Boolean).join('\n');
    }

    const container = root && typeof root.querySelector === 'function'
        ? (root.id === FONT_CONTAINER_ID ? root : root.querySelector(`#${FONT_CONTAINER_ID}`))
        : document.getElementById(FONT_CONTAINER_ID);

    if (container instanceof HTMLElement) {
        container.style.setProperty('--yuzi-phone-font-family', activeFont.cssFamily);
        container.setAttribute('data-yuzi-phone-font-id', activeFont.id);
        return true;
    }

    return false;
}
