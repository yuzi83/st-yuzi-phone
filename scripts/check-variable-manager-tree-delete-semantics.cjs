const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function findNodeByPath(nodes, pathValue) {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (node.path === pathValue) return node;
        if (node.kind === 'object') {
            const nested = findNodeByPath(node.children, pathValue);
            if (nested) return nested;
        }
    }
    return null;
}

function listLeafKeys(node) {
    if (!node || node.kind !== 'object' || !Array.isArray(node.children)) return [];
    return node.children.filter((child) => child?.kind === 'leaf').map((child) => child.key);
}

function assertIncludes(source, token, message) {
    assert.ok(source.includes(token), `${message} 缺少片段：${token}`);
}

function assertOrdered(source, tokens, message) {
    let cursor = -1;
    for (const token of tokens) {
        const next = source.indexOf(token, cursor + 1);
        assert.ok(next !== -1, `${message} 缺少片段：${token}`);
        assert.ok(next > cursor, `${message} 顺序错误：${token}`);
        cursor = next;
    }
}

async function main() {
    const { flattenToGroups, renderGroupsHtml } = await import(toModuleUrl('modules/variable-manager/flat-view.js'));
    const interactionsSource = read('modules/variable-manager/interactions.js');

    const data = {
        user: {
            战技: {
                微型苍拳: {
                    熟练度: 1,
                    描述: '将复杂小型尸骸聚合成大型战斗单位',
                },
            },
            生得术式: {
                名称: '死灵权柄（死冥操术）',
                属性: '尸骸重构/操控',
                熟练度: 0,
                描述: '颠覆生与死界限的绝对支配。',
            },
            扩展术式: {
                骸骨聚合: {
                    熟练度: 1,
                    描述: '将复数小型尸骸聚合成大型战斗单位',
                },
            },
            行囊: {},
            公开身份: ['咒术高专一年级学生'],
        },
    };

    const groups = flattenToGroups(data, { isMvu: false });
    assert.equal(groups.length, 1, '树状变量模型应保留顶层 user 分组');

    const userGroup = groups[0];
    assert.equal(userGroup.groupPath, 'user', 'user 分组路径必须保真');
    assert.equal(userGroup.groupName, 'user', 'user 分组名称必须保真');

    const battleNode = findNodeByPath(userGroup.nodes, 'user.战技');
    assert.ok(battleNode, '必须存在 user.战技 对象节点');
    assert.equal(battleNode.kind, 'object', 'user.战技 必须作为对象节点渲染');
    assert.equal(battleNode.depth, 0, '顶层对象节点深度必须是 0');

    const microNode = findNodeByPath(userGroup.nodes, 'user.战技.微型苍拳');
    assert.ok(microNode, '必须存在 user.战技.微型苍拳 对象节点');
    assert.equal(microNode.kind, 'object', '微型苍拳必须保留为对象节点而不是合成 badge');
    assert.equal(microNode.depth, 1, '嵌套对象节点深度必须递进');
    assert.deepEqual(listLeafKeys(microNode), ['熟练度', '描述'], '微型苍拳下面必须只渲染熟练度和描述两个叶子字段');

    const innateNode = findNodeByPath(userGroup.nodes, 'user.生得术式');
    assert.ok(innateNode, '必须存在 user.生得术式 对象节点');
    assert.equal(innateNode.kind, 'object', '生得术式必须作为对象节点渲染');
    assert.deepEqual(listLeafKeys(innateNode), ['名称', '属性', '熟练度', '描述'], '生得术式叶子字段必须完整保留');

    const aggregateNode = findNodeByPath(userGroup.nodes, 'user.扩展术式.骸骨聚合');
    assert.ok(aggregateNode, '必须存在 user.扩展术式.骸骨聚合 对象节点');
    assert.equal(aggregateNode.kind, 'object', '骸骨聚合必须作为对象节点渲染');
    assert.deepEqual(listLeafKeys(aggregateNode), ['熟练度', '描述'], '骸骨聚合叶子字段必须完整保留');

    const emptyBagNode = findNodeByPath(userGroup.nodes, 'user.行囊');
    assert.ok(emptyBagNode, '空对象节点不能在树状视图里消失');
    assert.equal(emptyBagNode.kind, 'leaf', '空对象当前以叶子卡片承载显示与删除语义');
    assert.equal(emptyBagNode.deleteKind, 'object', '空对象叶子卡片必须保留对象删除语义');
    assert.equal(emptyBagNode.valueType, 'object', '空对象叶子卡片必须保留 object 类型');

    const identityNode = findNodeByPath(userGroup.nodes, 'user.公开身份');
    assert.ok(identityNode, '数组字段不能在树状视图里消失');
    assert.equal(identityNode.kind, 'leaf', '数组字段必须继续作为叶子卡片渲染');
    assert.equal(identityNode.valueType, 'array', '数组字段不能被误判为对象节点');

    const html = renderGroupsHtml(groups, {
        deleteMode: true,
        selectedPaths: new Set(['user.战技.微型苍拳']),
    });

    assertIncludes(html, 'class="vm-object-title', '树状渲染必须输出对象标题节点');
    assertIncludes(html, 'data-delete-path="user.战技"', '删除态必须暴露战技对象路径');
    assertIncludes(html, 'data-delete-path="user.战技.微型苍拳"', '删除态必须暴露微型苍拳对象路径');
    assertIncludes(html, 'data-delete-kind="object"', '对象节点必须暴露 object 删除语义');
    assertIncludes(html, 'data-delete-kind="leaf"', '叶子节点必须暴露 leaf 删除语义');
    assertIncludes(html, 'data-delete-kind="group"', '顶层分组必须暴露 group 删除语义');
    assertIncludes(html, 'data-delete-label="微型苍拳"', '删除态必须暴露对象显示名称');
    assertIncludes(html, 'data-delete-leaf-count="2"', '删除态必须暴露对象子叶子数量');
    assertIncludes(html, 'style="--vm-node-indent: 12px;"', '树状渲染必须输出缩进变量而不是继续并排拼接路径 badge');

    assertIncludes(interactionsSource, "const SELECTABLE_DELETE_SELECTOR = '.vm-card[data-delete-path], .vm-group-header[data-delete-path], .vm-object-title[data-delete-path]'", '删除选择器必须显式区分对象标题');
    assertIncludes(interactionsSource, 'function getDeleteTarget(element)', '交互层必须读取结构化删除目标');
    assertIncludes(interactionsSource, 'function collectSelectedDeleteTargets(page)', '交互层必须收集结构化删除目标');
    assertIncludes(interactionsSource, 'function normalizeDeleteTargets(targets)', '交互层必须对删除目标做父子去重');
    assertIncludes(interactionsSource, 'return `确认删除${getDeleteTargetKindLabel(target.kind)}「${target.label}」？`;', '单目标确认标题必须暴露删除类型与名称');
    assertOrdered(interactionsSource, [
        'uniqueTargets.sort((a, b) => a.path.split(\'.\').length - b.path.split(\'.\').length || a.path.length - b.path.length);',
        'return uniqueTargets.filter((target, index) => {',
        'return !uniqueTargets.slice(0, index).some((parent) => target.path === parent.path || target.path.startsWith(`${parent.path}.`));',
    ], '删除目标父子去重必须先按路径层级排序再过滤子项');

    console.log('[variable-manager-tree-delete-semantics-check] 检查通过');
    console.log('- OK | user -> 战技 -> 微型苍拳 树状层级完整保留');
    console.log('- OK | user -> 生得术式 保持对象标题 + 叶子字段结构');
    console.log('- OK | 空对象与数组字段在树状视图中仍可见');
    console.log('- OK | 删除态输出 group/object/leaf 结构化元数据');
    console.log('- OK | 删除目标父子去重与确认标题契约已覆盖');
}

main().catch((error) => {
    console.error('[variable-manager-tree-delete-semantics-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
