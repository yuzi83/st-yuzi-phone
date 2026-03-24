import { Logger } from '../../error-handler.js';
import { getDB } from '../db-bridge.js';

export function getApiPresets() {
    const api = getDB();
    if (!api || typeof api.getApiPresets !== 'function') {
        return [];
    }
    try {
        return api.getApiPresets() || [];
    } catch (error) {
        Logger.warn('[玉子的手机] getApiPresets 调用失败:', error);
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
        Logger.warn('[玉子的手机] getTableApiPreset 调用失败:', error);
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
        Logger.warn('[玉子的手机] setTableApiPreset 调用失败:', error);
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
        Logger.warn('[玉子的手机] getPlotApiPreset 调用失败:', error);
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
        Logger.warn('[玉子的手机] setPlotApiPreset 调用失败:', error);
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
        Logger.warn('[玉子的手机] loadApiPreset 调用失败:', error);
        return false;
    }
}
