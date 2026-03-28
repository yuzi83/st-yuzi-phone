import { Logger } from '../../error-handler.js';
import { getDB } from '../db-bridge.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/preset-repository', feature: 'db-api' });

export function getApiPresets() {
    const api = getDB();
    if (!api || typeof api.getApiPresets !== 'function') {
        return [];
    }
    try {
        return api.getApiPresets() || [];
    } catch (error) {
        logger.warn({
            action: 'api-presets.get',
            message: 'getApiPresets 调用失败',
            error,
        });
        return [];
    }
}

export function getTableApiPreset() {
    const api = getDB();
    if (!api || typeof api.getTableApiPreset !== 'function') {
        return '';
    }
    try {
        return api.getTableApiPreset() || '';
    } catch (error) {
        logger.warn({
            action: 'table-api-preset.get',
            message: 'getTableApiPreset 调用失败',
            error,
        });
        return '';
    }
}

export function setTableApiPreset(presetName) {
    const api = getDB();
    if (!api || typeof api.setTableApiPreset !== 'function') {
        return false;
    }
    try {
        return !!api.setTableApiPreset(presetName);
    } catch (error) {
        logger.warn({
            action: 'table-api-preset.set',
            message: 'setTableApiPreset 调用失败',
            context: { presetName },
            error,
        });
        return false;
    }
}

export function getPlotApiPreset() {
    const api = getDB();
    if (!api || typeof api.getPlotApiPreset !== 'function') {
        return '';
    }
    try {
        return api.getPlotApiPreset() || '';
    } catch (error) {
        logger.warn({
            action: 'plot-api-preset.get',
            message: 'getPlotApiPreset 调用失败',
            error,
        });
        return '';
    }
}

export function setPlotApiPreset(presetName) {
    const api = getDB();
    if (!api || typeof api.setPlotApiPreset !== 'function') {
        return false;
    }
    try {
        return !!api.setPlotApiPreset(presetName);
    } catch (error) {
        logger.warn({
            action: 'plot-api-preset.set',
            message: 'setPlotApiPreset 调用失败',
            context: { presetName },
            error,
        });
        return false;
    }
}

export function loadApiPreset(presetName) {
    const api = getDB();
    if (!api || typeof api.loadApiPreset !== 'function') {
        return false;
    }
    try {
        return !!api.loadApiPreset(presetName);
    } catch (error) {
        logger.warn({
            action: 'api-preset.load',
            message: 'loadApiPreset 调用失败',
            context: { presetName },
            error,
        });
        return false;
    }
}
