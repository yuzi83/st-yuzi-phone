const TAG_NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_.:-]*$/u;
const TAG_SEPARATOR_PATTERN = /[\s,，、;；]+/u;
const TAG_TOKEN_PATTERN = /<\s*(\/?)\s*([^\s/>]+)(?:\s+[^<>]*?)?\s*>/gu;

function asText(value) {
    return String(value ?? '').trim();
}

/**
 * 将用户输入的标签名规范化为不带尖括号的裸名称。
 * 允许输入 content、<content> 或 </content>，运行时统一按裸名称比较。
 */
export function normalizeQQV2TagName(value) {
    let text = asText(value);
    const wrapped = text.match(/^<\s*\/?\s*([^<>\s/]+)\s*\/?\s*>$/u);
    if (wrapped) text = wrapped[1];
    return TAG_NAME_PATTERN.test(text) ? text : '';
}

/**
 * 解析设置页中的标签输入，支持中文顿号、逗号、英文逗号、分号和换行分隔。
 */
export function parseQQV2TagInput(value) {
    const parts = (Array.isArray(value) ? value : [value])
        .flatMap((item) => asText(item).split(TAG_SEPARATOR_PATTERN))
        .filter(Boolean);
    const tags = [];
    const invalid = [];
    const seen = new Set();
    for (const part of parts) {
        const tag = normalizeQQV2TagName(part);
        if (!tag) {
            invalid.push(part);
            continue;
        }
        const key = tag.toLocaleLowerCase('zh-CN');
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }
    return Object.freeze({
        tags: Object.freeze(tags),
        invalid: Object.freeze(invalid),
    });
}

export function normalizeQQV2TagNames(value) {
    return parseQQV2TagInput(value).tags;
}

function tokenizeTags(source) {
    const tokens = [];
    for (const match of source.matchAll(TAG_TOKEN_PATTERN)) {
        const raw = match[0];
        const name = normalizeQQV2TagName(match[2]);
        if (!name) continue;
        tokens.push({
            start: match.index,
            end: match.index + raw.length,
            name: name.toLocaleLowerCase('zh-CN'),
            closing: Boolean(match[1]),
            selfClosing: !match[1] && /\/\s*>$/u.test(raw),
        });
    }
    return tokens;
}

function collectTagBlocks(source, targetName) {
    const target = normalizeQQV2TagName(targetName).toLocaleLowerCase('zh-CN');
    if (!target) return [];
    const stack = [];
    const blocks = [];
    for (const token of tokenizeTags(source)) {
        if (token.selfClosing) {
            if (token.name === target) {
                blocks.push({
                    start: token.start,
                    contentStart: token.end,
                    contentEnd: token.end,
                    end: token.end,
                });
            }
            continue;
        }
        if (!token.closing) {
            stack.push(token);
            continue;
        }
        let openingIndex = -1;
        for (let index = stack.length - 1; index >= 0; index -= 1) {
            if (stack[index].name === token.name) {
                openingIndex = index;
                break;
            }
        }
        if (openingIndex < 0) continue;
        const opening = stack[openingIndex];
        stack.length = openingIndex;
        if (opening.name === target) {
            blocks.push({
                start: opening.start,
                contentStart: opening.end,
                contentEnd: token.start,
                end: token.end,
            });
        }
    }
    const sorted = blocks.sort((left, right) => (
        left.start - right.start || right.end - left.end
    ));
    return sorted.filter((block, index) => !sorted.some((other, otherIndex) => (
        index !== otherIndex
        && other.start <= block.start
        && other.end >= block.end
        && (other.start < block.start || other.end > block.end)
    )));
}

function removeTagBlocks(source, tagNames) {
    const blocks = [...new Set(normalizeQQV2TagNames(tagNames).map((tag) => tag.toLocaleLowerCase('zh-CN')))]
        .flatMap((tag) => collectTagBlocks(source, tag));
    if (blocks.length === 0) return source;
    blocks.sort((left, right) => left.start - right.start || right.end - left.end);
    const merged = [];
    for (const block of blocks) {
        const previous = merged[merged.length - 1];
        if (!previous || block.start > previous.end) {
            merged.push({ start: block.start, end: block.end });
        } else {
            previous.end = Math.max(previous.end, block.end);
        }
    }
    return merged
        .sort((left, right) => right.start - left.start)
        .reduce((result, block) => result.slice(0, block.start) + result.slice(block.end), source);
}

/**
 * 对一条宿主 AI 楼层正文执行标签提取和标签排除。
 * 提取标签不存在时保留原正文，避免升级后丢失未使用标签的旧内容。
 */
export function filterQQV2StoryContent(value, { extractTag = '', excludeTags = [] } = {}) {
    const source = String(value ?? '').trim();
    if (!source) return '';
    const normalizedExtractTag = normalizeQQV2TagName(extractTag);
    let selected = source;
    if (normalizedExtractTag) {
        const blocks = collectTagBlocks(source, normalizedExtractTag);
        if (blocks.length > 0) {
            selected = blocks.map((block) => source.slice(block.contentStart, block.contentEnd)).join('\n\n');
        }
    }
    return removeTagBlocks(selected, excludeTags).trim();
}
