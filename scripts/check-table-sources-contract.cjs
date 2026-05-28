const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const TABLE_SOURCE_SCRIPT = path.join(ROOT, 'scripts', 'table-source.cjs');
const SOURCE_DIR = path.join(ROOT, 'tables', 'sources', '小剧场2.1');
const GENERATED_JSON = path.join(ROOT, 'tables', 'generated', '小剧场2.1.json');

const REQUIRED_SCENE_SHEETS = [
    {
        uid: 'sheet_square_posts',
        name: '广场表',
        requiredHeaders: ['图片描述', '视频描述', '评论串'],
        forbiddenSnippets: ['广场主贴表', '广场精选评论表', '广场普通评论分栏表'],
    },
    {
        uid: 'sheet_forum_threads',
        name: '论坛表',
        requiredHeaders: ['评论串'],
        forbiddenSnippets: ['论坛主贴表', '论坛精选回应表', '论坛小组侧栏表'],
    },
    {
        uid: 'sheet_livestream_rooms',
        name: '直播表',
        requiredHeaders: ['弹幕串'],
        forbiddenSnippets: ['直播间主表', '直播间弹幕分栏表'],
    },
];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
    return String(value || '');
}

function hasAny(text, snippets) {
    return snippets.some(snippet => normalizeText(text).includes(snippet));
}

function getSheetContentHeaders(sheet) {
    return Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : [];
}

function toRelative(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function runTableSourceCheck() {
    return spawnSync(process.execPath, [TABLE_SOURCE_SCRIPT, 'check', SOURCE_DIR], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
    });
}

function fail(message, details = '') {
    console.error(`[table-sources-contract] ${message}`);
    if (details) {
        console.error(details.trim());
    }
    process.exitCode = 1;
}

function validateGeneratedSceneSheets(generated) {
    REQUIRED_SCENE_SHEETS.forEach((definition) => {
        const sheet = generated?.[definition.uid];
        assert(sheet && typeof sheet === 'object', `合成产物缺少 ${definition.uid}`);
        assert(sheet.uid === definition.uid, `${definition.uid} 的 uid 不匹配`);
        assert(sheet.name === definition.name, `${definition.uid} 的表名必须为 ${definition.name}`);
        const headers = getSheetContentHeaders(sheet);
        definition.requiredHeaders.forEach((header) => {
            assert(headers.includes(header), `${definition.uid} 缺少字段 ${header}`);
        });
        const serializedSheet = JSON.stringify(sheet);
        assert(!hasAny(serializedSheet, definition.forbiddenSnippets), `${definition.uid} 仍残留旧多表片段`);
    });
}

function validateSourceMarkdownFiles() {
    const markdownFiles = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map(entry => entry.name);

    REQUIRED_SCENE_SHEETS.forEach((definition) => {
        const fileName = markdownFiles.find(name => name.endsWith(`${definition.name}.md`));
        assert(fileName, `事实源目录缺少 ${definition.name}.md`);
        const content = fs.readFileSync(path.join(SOURCE_DIR, fileName), 'utf8');
        assert(content.includes(`uid: ${definition.uid}`), `${fileName} 缺少 uid: ${definition.uid}`);
        assert(content.includes(`name: ${definition.name}`), `${fileName} 缺少 name: ${definition.name}`);
        definition.requiredHeaders.forEach((header) => {
            assert(content.includes(header), `${fileName} 缺少字段 ${header}`);
        });
        assert(!hasAny(content, definition.forbiddenSnippets), `${fileName} 仍残留旧多表片段`);
    });
}

function main() {
    if (!fs.existsSync(TABLE_SOURCE_SCRIPT)) {
        fail(`缺少表格事实源工具：${toRelative(TABLE_SOURCE_SCRIPT)}`);
        return;
    }
    if (!fs.existsSync(SOURCE_DIR) || !fs.statSync(SOURCE_DIR).isDirectory()) {
        fail(`缺少表格 Markdown 事实源目录：${toRelative(SOURCE_DIR)}`);
        return;
    }

    const result = runTableSourceCheck();
    if (result.status !== 0) {
        fail('表格 Markdown 事实源校验失败', `${result.stdout || ''}\n${result.stderr || ''}`);
        return;
    }

    if (!fs.existsSync(GENERATED_JSON)) {
        fail(`缺少合成产物：${toRelative(GENERATED_JSON)}，请运行 npm run tables:build`);
        return;
    }

    let generated;
    try {
        generated = readJson(GENERATED_JSON);
    } catch (error) {
        fail(`合成产物不是合法 JSON：${toRelative(GENERATED_JSON)}`, error.message);
        return;
    }

    try {
        validateSourceMarkdownFiles();
        validateGeneratedSceneSheets(generated);
    } catch (error) {
        fail('表源契约检查失败', error.message);
        return;
    }

    console.log('[table-sources-contract] 检查通过');
    console.log(result.stdout.trim());
    console.log(`- OK | ${toRelative(SOURCE_DIR)} | Markdown 事实源可解析且结构有效`);
    console.log(`- OK | ${toRelative(GENERATED_JSON)} | 合成 JSON 可解析`);
    console.log('- OK | 内置 square/forum/live 表源保持单表 uid / 表名 / 字段契约，且无旧副表残留');
}

main();
