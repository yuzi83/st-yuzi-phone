const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeTemplateFromSource } = require('./table-source.cjs');

const ROOT = process.cwd();
const TABLE_SOURCE_SCRIPT = path.join(ROOT, 'scripts', 'table-source.cjs');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const FORMAL_TABLE_SOURCES = [
    {
        label: '小剧场2.1',
        sourceDir: path.join(ROOT, 'tables', 'sources', '小剧场2.1'),
        generatedJson: path.join(ROOT, 'tables', 'generated', '小剧场2.1.json'),
        validateSceneContract: true,
    },
    {
        label: '纪要',
        sourceDir: path.join(ROOT, 'tables', 'sources', '纪要'),
        generatedJson: path.join(ROOT, 'tables', 'generated', '纪要.json'),
        validateSceneContract: false,
    },
];
const REFERENCE_TABLE_SOURCES = [
    { label: '恋爱特化参考', sourceDir: path.join(ROOT, 'tables', 'sources', '恋爱特化参考') },
];

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

function runTableSourceCheck(sourceDir) {
    return spawnSync(process.execPath, [TABLE_SOURCE_SCRIPT, 'check', sourceDir], {
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

function assertSourceDefinitions() {
    FORMAL_TABLE_SOURCES.forEach((definition) => {
        assert(fs.existsSync(definition.sourceDir) && fs.statSync(definition.sourceDir).isDirectory(), `正式事实源目录不存在：${toRelative(definition.sourceDir)}`);
        assert(fs.existsSync(definition.generatedJson), `正式事实源缺少 committed generated：${toRelative(definition.generatedJson)}`);
    });

    REFERENCE_TABLE_SOURCES.forEach((definition) => {
        const generatedJson = path.join(ROOT, 'tables', 'generated', `${definition.label}.json`);
        assert(fs.existsSync(definition.sourceDir) && fs.statSync(definition.sourceDir).isDirectory(), `参考事实源目录不存在：${toRelative(definition.sourceDir)}`);
        assert(!fs.existsSync(generatedJson), `参考事实源不应提交 generated：${toRelative(generatedJson)}。若要发布它，请加入 FORMAL_TABLE_SOURCES`);
    });
}

function assertPackageScriptsCoverFormalSources() {
    const packageJson = readJson(PACKAGE_JSON);
    const scripts = packageJson.scripts || {};
    const tablesCheck = String(scripts['tables:check'] || '');
    const tablesBuild = String(scripts['tables:build'] || '');
    FORMAL_TABLE_SOURCES.forEach((definition) => {
        const sourcePath = toRelative(definition.sourceDir);
        const generatedPath = toRelative(definition.generatedJson);
        assert(tablesCheck.includes(sourcePath), `package.json tables:check 未覆盖 ${sourcePath}`);
        assert(tablesBuild.includes(sourcePath) && tablesBuild.includes(generatedPath), `package.json tables:build 未覆盖 ${sourcePath} -> ${generatedPath}`);
    });
}

function assertGeneratedFreshness(definition, committedGenerated) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuzi-phone-table-sources-'));
    try {
        const tempJson = path.join(tempDir, `${definition.label}.json`);
        const rebuilt = writeTemplateFromSource(definition.sourceDir, tempJson);
        const committedString = JSON.stringify(committedGenerated);
        const rebuiltString = JSON.stringify(rebuilt);
        assert(
            committedString === rebuiltString,
            `${definition.label} 的 generated 与 source build 输出不一致，请运行 node scripts/table-source.cjs build ${toRelative(definition.sourceDir)} ${toRelative(definition.generatedJson)}`
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

function validateSourceMarkdownFiles(sourceDir) {
    const markdownFiles = fs.readdirSync(sourceDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map(entry => entry.name);

    REQUIRED_SCENE_SHEETS.forEach((definition) => {
        const fileName = markdownFiles.find(name => name.endsWith(`${definition.name}.md`));
        assert(fileName, `事实源目录缺少 ${definition.name}.md`);
        const content = fs.readFileSync(path.join(sourceDir, fileName), 'utf8');
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

    try {
        assertSourceDefinitions();
        assertPackageScriptsCoverFormalSources();
    } catch (error) {
        fail('表源清单边界检查失败', error.message);
        return;
    }

    const checked = [];
    for (const definition of FORMAL_TABLE_SOURCES) {
        const result = runTableSourceCheck(definition.sourceDir);
        if (result.status !== 0) {
            fail(`${definition.label} Markdown 事实源校验失败`, `${result.stdout || ''}\n${result.stderr || ''}`);
            return;
        }

        let generated;
        try {
            generated = readJson(definition.generatedJson);
        } catch (error) {
            fail(`${definition.label} 合成产物不是合法 JSON：${toRelative(definition.generatedJson)}`, error.message);
            return;
        }

        try {
            assertGeneratedFreshness(definition, generated);
            if (definition.validateSceneContract) {
                validateSourceMarkdownFiles(definition.sourceDir);
                validateGeneratedSceneSheets(generated);
            }
        } catch (error) {
            fail(`${definition.label} 表源契约检查失败`, error.message);
            return;
        }

        checked.push({ definition, stdout: String(result.stdout || '').trim() });
    }

    console.log('[table-sources-contract] 检查通过');
    checked.forEach(({ definition, stdout }) => {
        if (stdout) console.log(stdout);
        console.log(`- OK | ${toRelative(definition.sourceDir)} | Markdown 事实源可解析且结构有效`);
        console.log(`- OK | ${toRelative(definition.generatedJson)} | committed generated 可解析且与临时 build 深比较一致`);
    });
    REFERENCE_TABLE_SOURCES.forEach((definition) => {
        console.log(`- OK | ${toRelative(definition.sourceDir)} | 参考事实源明确不参与 generated/CI freshness`);
    });
    console.log('- OK | 内置 square/forum/live 表源保持单表 uid / 表名 / 字段契约，且无旧副表残留');
}

main();
