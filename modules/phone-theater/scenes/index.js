import { squareScene } from './square.js';
import { forumScene } from './forum.js';
import { liveScene } from './live.js';

export const THEATER_ROUTE_PREFIX = 'theater:';

const RAW_THEATER_SCENES = Object.freeze([
    squareScene,
    forumScene,
    liveScene,
]);

function normalizeText(value) {
    return String(value ?? '').trim();
}

export function normalizeTheaterSceneId(sceneId) {
    const text = normalizeText(sceneId);
    return text.startsWith(THEATER_ROUTE_PREFIX)
        ? text.slice(THEATER_ROUTE_PREFIX.length).trim()
        : text;
}

export function buildTheaterRoute(sceneId) {
    const safeSceneId = normalizeTheaterSceneId(sceneId);
    return safeSceneId ? `${THEATER_ROUTE_PREFIX}${safeSceneId}` : '';
}

export function isTheaterRoute(route) {
    return normalizeText(route).startsWith(THEATER_ROUTE_PREFIX);
}

function assertUnique(map, key, label, sceneId) {
    if (!key) {
        throw new Error(`[YuziPhone] Theater scene "${sceneId || 'unknown'}" missing ${label}`);
    }
    const existing = map.get(key);
    if (existing) {
        throw new Error(`[YuziPhone] Theater scene ${label} collision: "${key}" used by "${existing}" and "${sceneId}"`);
    }
    map.set(key, sceneId);
}

function normalizeSceneDefinition(scene) {
    const id = normalizeTheaterSceneId(scene?.id);
    const appKey = normalizeText(scene?.appKey);
    const route = normalizeText(scene?.route) || buildTheaterRoute(id);
    const tables = Object.freeze({ ...(scene?.tables || {}) });
    const primaryTableRole = normalizeText(scene?.primaryTableRole);
    const primaryTableName = normalizeText(tables[primaryTableRole]);
    const childTableRoles = Object.freeze(Object.keys(tables));
    const childTableNames = Object.freeze(Object.values(tables).map(normalizeText).filter(Boolean));

    if (!id) throw new Error('[YuziPhone] Theater scene missing id');
    if (!appKey) throw new Error(`[YuziPhone] Theater scene "${id}" missing appKey`);
    if (!route) throw new Error(`[YuziPhone] Theater scene "${id}" missing route`);
    if (!primaryTableRole) throw new Error(`[YuziPhone] Theater scene "${id}" missing primaryTableRole`);
    if (!primaryTableName) throw new Error(`[YuziPhone] Theater scene "${id}" primary table role "${primaryTableRole}" is not declared in tables`);
    if (childTableNames.length <= 0) throw new Error(`[YuziPhone] Theater scene "${id}" missing tables`);
    if (typeof scene.buildViewModel !== 'function') throw new Error(`[YuziPhone] Theater scene "${id}" missing buildViewModel hook`);
    if (typeof scene.renderContent !== 'function') throw new Error(`[YuziPhone] Theater scene "${id}" missing renderContent hook`);
    if (typeof scene.collectDeletableKeys !== 'function') throw new Error(`[YuziPhone] Theater scene "${id}" missing collectDeletableKeys hook`);
    if (typeof scene.deleteEntities !== 'function') throw new Error(`[YuziPhone] Theater scene "${id}" missing deleteEntities hook`);

    return Object.freeze({
        ...scene,
        id,
        appKey,
        route,
        name: normalizeText(scene.name) || id,
        title: normalizeText(scene.title) || normalizeText(scene.name) || id,
        subtitle: normalizeText(scene.subtitle),
        emptyText: normalizeText(scene.emptyText) || '暂无内容',
        iconText: normalizeText(scene.iconText) || [...(normalizeText(scene.name) || id)][0] || '剧',
        iconColors: Array.isArray(scene.iconColors) && scene.iconColors.length >= 2
            ? Object.freeze([scene.iconColors[0], scene.iconColors[1]])
            : Object.freeze(['#8E8E93', '#636366']),
        orderNo: Number.isFinite(Number(scene.orderNo)) ? Number(scene.orderNo) : 999,
        styleScope: normalizeText(scene.styleScope) || id,
        primaryTableRole,
        primaryTableName,
        tables,
        tableNames: tables,
        childTableRoles,
        childTableNames,
    });
}

function buildRegistry(rawScenes) {
    const scenes = rawScenes.map(normalizeSceneDefinition);
    const ids = new Map();
    const appKeys = new Map();
    const routes = new Map();
    const tableNames = new Map();

    scenes.forEach((scene) => {
        assertUnique(ids, scene.id, 'id', scene.id);
        assertUnique(appKeys, scene.appKey, 'appKey', scene.id);
        assertUnique(routes, scene.route, 'route', scene.id);
        scene.childTableNames.forEach((tableName) => {
            assertUnique(tableNames, tableName, 'tableName', scene.id);
        });
    });

    return Object.freeze({
        scenes: Object.freeze([...scenes].sort((a, b) => a.orderNo - b.orderNo)),
        sceneById: new Map(scenes.map(scene => [scene.id, scene])),
        sceneByAppKey: new Map(scenes.map(scene => [scene.appKey, scene])),
        sceneByRoute: new Map(scenes.map(scene => [scene.route, scene])),
        sceneByTableName: new Map(scenes.flatMap(scene => scene.childTableNames.map(tableName => [tableName, scene]))),
    });
}

const REGISTRY = buildRegistry(RAW_THEATER_SCENES);

export const THEATER_SCENES = REGISTRY.scenes;

export const THEATER_SCENE_IDS = Object.freeze(Object.fromEntries(
    THEATER_SCENES.map(scene => [scene.id, scene.id])
));

export const THEATER_APP_KEYS = Object.freeze(Object.fromEntries(
    THEATER_SCENES.map(scene => [scene.id, scene.appKey])
));

export function getTheaterSceneDefinition(sceneId) {
    const safeSceneId = normalizeTheaterSceneId(sceneId);
    return REGISTRY.sceneById.get(safeSceneId) || null;
}

export function getTheaterSceneDefinitionByAppKey(appKey) {
    return REGISTRY.sceneByAppKey.get(normalizeText(appKey)) || null;
}

export function getTheaterSceneDefinitionByRoute(route) {
    return REGISTRY.sceneByRoute.get(normalizeText(route)) || null;
}

export function getTheaterSceneDefinitionByTableName(tableName) {
    return REGISTRY.sceneByTableName.get(normalizeText(tableName)) || null;
}

export function getTheaterChildTableNames() {
    return Array.from(REGISTRY.sceneByTableName.keys());
}

export function getTheaterSceneDefinitions() {
    return THEATER_SCENES.map(scene => ({
        ...scene,
        iconColors: [...scene.iconColors],
        tables: { ...scene.tables },
        tableNames: { ...scene.tableNames },
        childTableRoles: [...scene.childTableRoles],
        childTableNames: [...scene.childTableNames],
    }));
}
