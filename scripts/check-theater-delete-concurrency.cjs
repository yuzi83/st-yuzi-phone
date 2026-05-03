const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    deleteService: 'modules/phone-theater/delete-service.js',
    squareScene: 'modules/phone-theater/scenes/square.js',
    forumScene: 'modules/phone-theater/scenes/forum.js',
    liveScene: 'modules/phone-theater/scenes/live.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name} 函数`);

    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        index += 1;
    }

    assert(depth === 0, `${name} 函数体括号不平衡`);
    return source.slice(match.index, index);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    for (const token of tokens) {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    }
}

const sources = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const deleteService = sources.deleteService;

assert(
    deleteService.includes("import { getTableData, saveTableData } from '../phone-core/data-api.js';"),
    'delete-service 必须同时引入 getTableData 与 saveTableData，删除保存前要重读最新数据',
);
assert(!deleteService.includes('scene.id ==='), 'delete-service 不能重新引入 sceneId 分支');
assert(!deleteService.includes('resolveForumSidebarIdentity'), 'delete-service 不能硬编码 forum sidebar helper');

const deleteBody = extractFunctionBody(
    deleteService,
    'deleteTheaterEntities',
    /export\s+async\s+function\s+deleteTheaterEntities\s*\([^)]*\)\s*{/
);
assert(deleteBody.includes('void rawData;'), '兼容参数 rawData 必须被显式废弃，避免误用旧快照');
assert(!deleteBody.includes('cloneRawData(rawData)'), '删除服务不能以调用方传入的旧 rawData 作为保存基准');
assert(deleteBody.includes('const latestRawData = getTableData();'), '删除服务必须在执行删除前读取最新 rawData');
assert(deleteBody.includes("message: '删除失败：无法读取最新数据，请刷新后重试'"), '最新数据不可用时必须明确拒绝保存');
assertOrdered(deleteBody, [
    'const latestRawData = getTableData();',
    'const nextRawData = cloneRawData(latestRawData);',
    'const validation = validateSelectedTargets(scene, tables, selectedSet);',
    'const deletion = scene.deleteEntities(',
    'const saved = await saveTableData(nextRawData);',
], 'deleteTheaterEntities');

const validateBody = extractFunctionBody(
    deleteService,
    'validateSelectedTargets',
    /function\s+validateSelectedTargets\s*\([^)]*\)\s*{/
);
assert(validateBody.includes('parseSelectedTargets(selectedSet)'), '并发校验必须解析 typed delete key');
assert(validateBody.includes('buildDeleteRoleMappings(scene, selectedSet)'), '并发校验必须建立 deleteRole 到 tableRole 的映射');
assert(validateBody.includes('mappings.get(target.role)'), '并发校验必须按 deleteRole 查映射');
assert(validateBody.includes('mappedTableRoles.length !== 1'), 'deleteRole 映射失败或多重匹配时必须拒绝删除');
assert(validateBody.includes('const tableRole = mappedTableRoles[0];'), '并发校验必须显式区分 tableRole');
assert(validateBody.includes('const table = tables[tableRole];'), '并发校验必须用 tableRole 定位当前表');
assert(validateBody.includes('const row = table.rows[target.rowIndex];'), '并发校验必须按最新表的 rowIndex 取当前行');
assert(validateBody.includes('resolveTargetIdentity(scene, target.role, tableRole, table, row, target.rowIndex)'), '并发校验必须用 deleteRole + tableRole 解析当前 identity');
assert(validateBody.includes('hasDeleteTarget([target], target.rowIndex, currentIdentity)'), '并发校验必须复用 rowIndex + identity 精确匹配');
assert(!validateBody.includes('for (const role of sceneRoles)'), '并发校验不能把 delete key role 当成 scene table role');

const mappingsBody = extractFunctionBody(
    deleteService,
    'buildDeleteRoleMappings',
    /function\s+buildDeleteRoleMappings\s*\([^)]*\)\s*{/
);
assert(mappingsBody.includes('getSceneTableRoles(scene)'), 'role 映射必须从 scene table roles 派生');
assert(mappingsBody.includes('getDeleteRoleCandidates(tableRole)'), 'role 映射必须生成 deleteRole 候选');
assert(mappingsBody.includes('buildDeleteTargets(selectedSet, deleteRole)'), 'role 映射必须使用 deleteRole 读取 selected targets');
assert(mappingsBody.includes('mappings.get(deleteRole).push(tableRole)'), 'role 映射必须保留 deleteRole 到 tableRole 的映射关系');

const candidatesBody = extractFunctionBody(
    deleteService,
    'getDeleteRoleCandidates',
    /function\s+getDeleteRoleCandidates\s*\([^)]*\)\s*{/
);
assert(candidatesBody.includes('singularizeRole(normalizedRole)'), 'deleteRole 候选必须支持 tableRole 单数化');
assert(candidatesBody.includes('new Set'), 'deleteRole 候选必须去重，避免同名 role 多重匹配');

const singularBody = extractFunctionBody(
    deleteService,
    'singularizeRole',
    /function\s+singularizeRole\s*\([^)]*\)\s*{/
);
assert(singularBody.includes("text.endsWith('ies')"), 'role 单数化必须支持 entities -> entity');
assert(singularBody.includes("text.endsWith('s')"), 'role 单数化必须支持 posts/threads/rooms -> post/thread/room');

const compositeBody = extractFunctionBody(
    deleteService,
    'resolveCompositeIdentity',
    /function\s+resolveCompositeIdentity\s*\([^)]*\)\s*{/
);
assert(compositeBody.includes("identitySpec.split('|')"), '组合 identity 必须按 | 拆分字段');
assert(compositeBody.includes('getCellByHeader(table, row, header)'), '组合 identity 必须逐字段读取当前行');
assert(compositeBody.includes(".join('|')"), '组合 identity 必须按现有 sidebar 协议重新拼接');

const identityBody = extractFunctionBody(
    deleteService,
    'resolveTargetIdentity',
    /function\s+resolveTargetIdentity\s*\([^)]*\)\s*{/
);
assertOrdered(identityBody, [
    'const identitySpec = getIdentitySpec(scene, tableRole);',
    'const compositeIdentity = identitySpec ? resolveCompositeIdentity(table, row, identitySpec) : null;',
    'return resolveRowIdentity(table, row, identityHeader, `${deleteRole}_`, rowIndex);',
], 'resolveTargetIdentity');

assert(sources.squareScene.includes("buildTheaterDeleteKey('post'"), 'square scene 必须继续使用 post deleteRole');
assert(sources.squareScene.includes("primaryTableRole: 'posts'"), 'square scene 表 role 必须仍为 posts');
assert(sources.forumScene.includes("buildTheaterDeleteKey('thread'"), 'forum scene 必须继续使用 thread deleteRole');
assert(sources.forumScene.includes("buildTheaterDeleteKey('sidebar'"), 'forum scene 必须继续使用 sidebar deleteRole');
assert(sources.forumScene.includes("primaryTableRole: 'threads'"), 'forum scene 主表 role 必须仍为 threads');
assert(
    sources.forumScene.includes("sidebar: Object.freeze({ identity: '分区/版面名|栏目类型|栏目标题|时间文本|状态标签' })"),
    'forum sidebar 必须保留组合 identity schema，专项校验必须覆盖它',
);
assert(sources.liveScene.includes("buildTheaterDeleteKey('room'"), 'live scene 必须继续使用 room deleteRole');
assert(sources.liveScene.includes("primaryTableRole: 'rooms'"), 'live scene 表 role 必须仍为 rooms');

console.log('check-theater-delete-concurrency: ok');
