export const QQV2_DATABASE_CURRENT_API_PRESET_ID = 'qq-v2.database-current-api';
export const QQV2_DATABASE_CURRENT_API_PRESET_NAME = '数据库当前 API';

export function isQQV2DatabaseCurrentApiPresetId(value) {
    return String(value ?? '').trim() === QQV2_DATABASE_CURRENT_API_PRESET_ID;
}

export function createQQV2DatabaseCurrentApiPreset() {
    return Object.freeze({
        id: QQV2_DATABASE_CURRENT_API_PRESET_ID,
        name: QQV2_DATABASE_CURRENT_API_PRESET_NAME,
        endpoint: '',
        model: '',
        temperature: 1,
        maxOutput: 4096,
        hasApiKey: false,
        readOnly: true,
    });
}
