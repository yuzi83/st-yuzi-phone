// modules/utils/object.js
/**
 * 玉子的手机 - 对象与数值通用工具
 *
 * - clampNumber：在多个 settings/page builder 里被用来限制数值范围
 * - deepMerge：合并设置默认值与用户值时使用
 * - generateUniqueId：生成 DOM id / runtime key 时使用
 *
 * 这些工具不依赖 DOM，可以在浏览器和测试环境通用。
 */

/**
 * 限制数值在指定范围内
 * @param {number} value - 要限制的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {number} fallback - 无效时的默认值
 * @returns {number} 限制后的值
 */
export function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {...Object} sources - 源对象列表
 * @returns {Object} 合并后的对象
 */
export function deepMerge(target, ...sources) {
    const output = { ...(target && typeof target === 'object' ? target : {}) };

    sources.forEach((source) => {
        if (!source || typeof source !== 'object') return;

        Object.keys(source).forEach((key) => {
            const sourceValue = source[key];
            const targetValue = output[key];

            if (
                sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
                && targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
            ) {
                output[key] = deepMerge(targetValue, sourceValue);
            } else if (Array.isArray(sourceValue)) {
                output[key] = [...sourceValue];
            } else {
                output[key] = sourceValue;
            }
        });
    });

    return output;
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀
 * @returns {string} 唯一 ID
 */
export function generateUniqueId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);
    return `${prefix}_${timestamp}_${random}`;
}
