import {
    filterQQV2StoryContent,
    normalizeQQV2TagName,
    normalizeQQV2TagNames,
} from '../qq-v2/domain/story-context-tags.js';

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

/**
 * 将生图提示词转换结果的标签过滤配置统一成运行时格式。
 *
 * 这里复用 QQ 正文上下文的标签语义，生图设置只负责提供配置，不复制
 * 标签解析、嵌套标签提取和标签块移除逻辑。
 */
export function normalizeImagePromptOutputFilterSettings(raw = {}) {
    const source = asObject(raw);
    return {
        extractTag: normalizeQQV2TagName(
            source.extractTag ?? source.promptTranslationExtractTag,
        ),
        excludeTags: normalizeQQV2TagNames(
            source.excludeTags ?? source.promptTranslationExcludeTags,
        ),
    };
}

/**
 * 对中间 AI 的输出执行生图专用标签提取和排除。
 *
 * 提取标签不存在时保留原输出；若提取后确实得到空内容，则按 QQ 既有
 * 语义保留空结果，不额外猜测或回退。
 */
export function filterImagePromptOutput(value, settings = {}) {
    return filterQQV2StoryContent(
        value,
        normalizeImagePromptOutputFilterSettings(settings),
    );
}
