const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testDefaultSelectedBlueEntryIsIncluded() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 7,
                    comment: '海棠花设定',
                    content: '林知夏一直记得院子里的海棠花。',
                    constant: true,
                    disable: false,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({
        hostMessages: [],
        people: [],
        conversations: [],
    });

    assert.equal(content, '林知夏一直记得院子里的海棠花。');
}

async function testWorldbookReadFailureProducesEmptyContextWithoutRejecting() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            throw new Error('fixture worldbook API unavailable');
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({ people: ['林知夏'] });

    assert.equal(content, '');
}

async function testPersonNameActivatesGreenEntry() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 8,
                    content: '林知夏习惯在紧张时捏住袖口。',
                    key: ['林知夏'],
                    constant: false,
                    disable: false,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({
        hostMessages: [],
        people: ['林知夏'],
        conversations: [],
    });

    assert.equal(content, '林知夏习惯在紧张时捏住袖口。');
}

async function testTavernHelperWorldbookShapeActivatesConstantAndSelectiveEntries() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    {
                        uid: 1,
                        enabled: true,
                        strategy: {
                            type: 'constant',
                            keys: [],
                            keys_secondary: { logic: 'and_any', keys: [] },
                            scan_depth: 'same_as_global',
                        },
                        content: 'TavernHelper 蓝灯条目',
                    },
                    {
                        uid: 2,
                        enabled: true,
                        strategy: {
                            type: 'selective',
                            keys: ['主词'],
                            keys_secondary: { logic: 'and_all', keys: ['红', '蓝'] },
                            scan_depth: 'same_as_global',
                        },
                        content: 'TavernHelper 正确绿灯条目',
                    },
                    {
                        uid: 3,
                        enabled: true,
                        strategy: {
                            type: 'selective',
                            keys: ['主词'],
                            keys_secondary: { logic: 'and_all', keys: ['红', '紫'] },
                            scan_depth: 'same_as_global',
                        },
                        content: 'TavernHelper 误命中条目',
                    },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({ people: ['主词 红 蓝'] });

    assert.equal(content, 'TavernHelper 蓝灯条目\n\nTavernHelper 正确绿灯条目');
}

async function testOnlyLatestTwoEligibleHostMessagesAreScanned() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '过期设定', key: ['旧钟楼'] },
                    { uid: 2, content: '当前设定', key: ['海棠花'] },
                    { uid: 3, content: '系统污染', key: ['系统暗号'] },
                    { uid: 4, content: '隐藏污染', key: ['隐藏暗号'] },
                    { uid: 5, content: '失败污染', key: ['失败暗号'] },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });
    const ignored = { role: 'assistant', content: 'ignore 暗号' };
    ignored[Symbol.for('ignore')] = true;

    const content = await resolver.resolve({
        hostMessages: [
            { role: 'assistant', content: '旧钟楼' },
            { role: 'system', content: '系统暗号' },
            { role: 'assistant', content: '隐藏暗号', isHidden: true },
            { role: 'assistant', content: '旁白暗号', extra: { type: 'narrator' } },
            ignored,
            { role: 'assistant', content: '失败暗号', isSuccessful: false },
            { role: 'user', content: '海棠花开了' },
            { role: 'assistant', content: '今晚会下雨' },
        ],
        people: [],
        conversations: [],
    });

    assert.equal(content, '当前设定');
}

async function testEachConversationContributesItsLatestThreeMessages() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '过期历史设定', key: ['旧钥匙'] },
                    { uid: 2, content: '当前历史设定', key: ['鸢尾花'] },
                    { uid: 3, content: '删除历史污染', key: ['删除暗号'] },
                    { uid: 4, content: '另一会话设定', key: ['白茶'] },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({
        hostMessages: [],
        people: ['林知夏', '顾言'],
        conversations: [
            {
                personName: '林知夏',
                messages: [
                    { content: '旧钥匙' },
                    { content: '第一条近期消息' },
                    { content: '鸢尾花' },
                    { content: '第三条近期消息' },
                    { content: '删除暗号', deleted: true },
                ],
            },
            {
                personName: '顾言',
                messages: [
                    { content: '白茶' },
                    { content: '今晚见' },
                    { content: '收到' },
                ],
            },
        ],
    });

    assert.equal(content, '当前历史设定\n\n另一会话设定');
}

async function testQQWorldbookProjectionIsNotReadBackIntoPrompt() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '正常蓝灯', constant: true },
                    {
                        uid: 2,
                        content: '不应重复注入的 QQ 投影',
                        constant: true,
                        extensions: { yuziPhoneQQV2: { version: 2 } },
                    },
                    {
                        uid: 3,
                        comment: 'YuziQQ｜私聊｜林知夏｜private-00000000-0000-4000-8000-000000000001',
                        content: 'marker 被外部刷新丢失后也不应读回的 QQ 投影',
                        constant: true,
                    },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '正常蓝灯');
}

async function testResolverConsumesCatalogSelectionPolicy() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const catalog = createWorldbookReadingCatalog({
        source: {
            async load() {
                return [{
                    name: '角色主书',
                    sourceRole: 'primary',
                    entries: [
                        { uid: 1, content: '保留条目', constant: true },
                        { uid: 2, content: '用户取消条目', constant: true },
                    ],
                }];
            },
        },
        preferences: {
            async read() {
                return { 角色主书: { 2: false } };
            },
            async write() {},
        },
    });
    const resolver = createWorldbookContextResolver({ catalog });

    const content = await resolver.resolve({});

    assert.equal(content, '保留条目');
}

async function testAllFourSelectiveKeywordModes() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: 'AND ANY 命中', key: ['主词'], selective: true, keysecondary: ['红', '紫'], selectiveLogic: 0 },
                    { uid: 2, content: 'AND ANY 不命中', key: ['主词'], selective: true, keysecondary: ['紫', '绿'], selectiveLogic: 0 },
                    { uid: 3, content: 'NOT ALL 命中', key: ['主词'], selective: true, keysecondary: ['红', '紫'], selectiveLogic: 1 },
                    { uid: 4, content: 'NOT ALL 不命中', key: ['主词'], selective: true, keysecondary: ['红', '蓝'], selectiveLogic: 1 },
                    { uid: 5, content: 'NOT ANY 命中', key: ['主词'], selective: true, keysecondary: ['紫', '绿'], selectiveLogic: 2 },
                    { uid: 6, content: 'NOT ANY 不命中', key: ['主词'], selective: true, keysecondary: ['红', '紫'], selectiveLogic: 2 },
                    { uid: 7, content: 'AND ALL 命中', key: ['主词'], selective: true, keysecondary: ['红', '蓝'], selectiveLogic: 3 },
                    { uid: 8, content: 'AND ALL 不命中', key: ['主词'], selective: true, keysecondary: ['红', '紫'], selectiveLogic: 3 },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({ people: ['主词 红 蓝'] });

    assert.equal(content, [
        'AND ANY 命中',
        'NOT ALL 命中',
        'NOT ANY 命中',
        'AND ALL 命中',
    ].join('\n\n'));
}

async function testRegexCaseSensitivityAndWholeWordMatching() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '正则命中', key: ['/海棠\\s+花/iu'] },
                    { uid: 2, content: '大小写敏感不命中', key: ['NPC'], caseSensitive: true },
                    { uid: 3, content: '大小写不敏感命中', key: ['NPC'], caseSensitive: false },
                    { uid: 4, content: '整词不命中子串', key: ['cat'], matchWholeWords: true },
                    { uid: 5, content: '整词命中', key: ['dog'], matchWholeWords: true },
                    { uid: 6, content: '蛇形大小写敏感不命中', key: ['NPC'], case_sensitive: true },
                    { uid: 7, content: '蛇形整词不命中子串', key: ['cat'], match_whole_words: true },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({ people: ['海棠   花 npc concatenate dog'] });

    assert.equal(content, [
        '正则命中',
        '大小写不敏感命中',
        '整词命中',
    ].join('\n\n'));
}

async function testRecursiveActivationHonorsRecursionFlags() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '递归钥匙一', constant: true },
                    { uid: 2, content: '递归钥匙二', key: ['递归钥匙一'] },
                    { uid: 3, content: '递归链终点', key: ['递归钥匙二'] },
                    { uid: 4, content: '递归排除污染', key: ['递归钥匙一'], excludeRecursion: true },
                    { uid: 5, content: '阻断钥匙', constant: true, preventRecursion: true },
                    { uid: 6, content: '阻断失败污染', key: ['阻断钥匙'] },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, [
        '递归钥匙一',
        '阻断钥匙',
        '递归钥匙二',
        '递归链终点',
    ].join('\n\n'));
}

async function testRecursiveActivationStopsAfterTenRecursiveRounds() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 0, content: '链钥匙0', constant: true },
                    { uid: 1, content: '链钥匙1', key: ['链钥匙0'] },
                    { uid: 2, content: '链钥匙2', key: ['链钥匙1'] },
                    { uid: 3, content: '链钥匙3', key: ['链钥匙2'] },
                    { uid: 4, content: '链钥匙4', key: ['链钥匙3'] },
                    { uid: 5, content: '链钥匙5', key: ['链钥匙4'] },
                    { uid: 6, content: '链钥匙6', key: ['链钥匙5'] },
                    { uid: 7, content: '链钥匙7', key: ['链钥匙6'] },
                    { uid: 8, content: '链钥匙8', key: ['链钥匙7'] },
                    { uid: 9, content: '链钥匙9', key: ['链钥匙8'] },
                    { uid: 10, content: '链钥匙10', key: ['链钥匙9'] },
                    { uid: 11, content: '不应进入的第十一层', key: ['链钥匙10'] },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, [
        '链钥匙0',
        '链钥匙1',
        '链钥匙2',
        '链钥匙3',
        '链钥匙4',
        '链钥匙5',
        '链钥匙6',
        '链钥匙7',
        '链钥匙8',
        '链钥匙9',
        '链钥匙10',
    ].join('\n\n'));
}

async function testEntriesDeduplicateByWorldbookNameAndUid() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [
                { name: '角色主书', entries: [{ uid: 5, content: '主书首次条目', constant: true }] },
                { name: '角色主书', entries: [{ uid: 5, content: '主书重复条目', constant: true }] },
                { name: '角色附加书', entries: [{ uid: 5, content: '附加书同 UID 条目', constant: true }] },
            ];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '主书首次条目\n\n附加书同 UID 条目');
}

async function testEjsIfDecoratorFiltersEntriesBeforeActivation() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, content: '普通人设', constant: true },
                    { uid: 2, content: "@@if phase === 'early'\n早期人设", constant: true },
                    { uid: 3, content: "@@if phase === 'late'\n后期人设", constant: true },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                return { phase: 'late' };
            },
            async evalTemplate(template, context) {
                if (template.includes("phase === 'early'")) return String(context.phase === 'early');
                if (template.includes("phase === 'late'")) return String(context.phase === 'late');
                return template;
            },
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '普通人设\n\n后期人设');
}

async function testActivationDecoratorsAndSpecialEntriesAreAppliedBeforeScan() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    { uid: 1, comment: '普通条目', content: '普通蓝灯', constant: true },
                    { uid: 2, comment: '强制条目', content: '@@activate\n强制蓝灯' },
                    { uid: 3, comment: '强制排除', content: '@@dont_activate\n不应出现', constant: true },
                    { uid: 4, comment: '仅预载', content: '@@only_preload\n不应出现', constant: true },
                    { uid: 5, comment: '[InitialVariables]', content: '不应出现', constant: true },
                    { uid: 6, comment: '变量', content: '@@initial_variables\n不应出现', constant: true },
                    { uid: 7, comment: '@INJECT helper', content: '不应出现', constant: true },
                    { uid: 8, comment: '[GENERATE:BEFORE]', content: '不应出现', constant: true },
                    { uid: 9, comment: '[RENDER:AFTER]', content: '不应出现', constant: true },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '普通蓝灯\n\n强制蓝灯');
}

async function testPreprocessingRendersContentAndKeywordsOrExcludesFailedEntry() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    {
                        uid: 1,
                        content: '@@preprocessing\n<%= person %>的后期人设',
                        key: ['<%= trigger %>'],
                    },
                    {
                        uid: 2,
                        content: '@@preprocessing\n<%= broken %>',
                        key: ['晚期暗号'],
                    },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                return { person: '林知夏', trigger: '晚期暗号' };
            },
            async evalTemplate(template, context) {
                if (template.includes('broken')) throw new Error('fixture preprocessing failure');
                return template
                    .replace('<%= person %>', context.person)
                    .replace('<%= trigger %>', context.trigger);
            },
        },
    });

    const content = await resolver.resolve({ people: ['晚期暗号'] });

    assert.equal(content, '林知夏的后期人设');
}

async function testLatestMvuStatDataParticipatesInEntryCondition() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 1,
                    content: '@@if mvu.stage === 2\n第二阶段人设',
                    constant: true,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                return { base: true };
            },
            async evalTemplate(template, context) {
                if (template.includes('!!(')) return String(context.mvu?.stage === 2);
                return template;
            },
        },
        mvuRuntime: {
            async readLatestStatData() {
                return { stage: 2 };
            },
        },
    });

    const content = await resolver.resolve({ hostMessages: [{ content: '当前楼层' }] });

    assert.equal(content, '第二阶段人设');
}

async function testFinalEjsReusesRequestContextAndFallsBackToCleanOriginal() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    let prepared = false;
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    {
                        uid: 1,
                        content: "@@if phase === 'late'\n当前阶段：<%= phase %>",
                        constant: true,
                    },
                    {
                        uid: 2,
                        content: '@@private\n失败回退：<%= broken %>',
                        constant: true,
                    },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                if (prepared) throw new Error('context must be request-scoped');
                prepared = true;
                return { phase: 'late' };
            },
            async evalTemplate(template, context) {
                if (template.includes("!!(phase === 'late')")) return 'true';
                if (template.includes('broken')) throw new Error('fixture final render failure');
                return template.replace('<%= phase %>', context.phase);
            },
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '当前阶段：late\n\n失败回退：<%= broken %>');
}

async function testFinalEjsOutputThenRunsThroughShujukuTemplate() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 1,
                    content: '当前角色：<%= person %>，库存：{[sql "SELECT 4 AS count"]}',
                    constant: true,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                return { person: '林知夏' };
            },
            async evalTemplate(template, context) {
                return template.replace('<%= person %>', context.person);
            },
        },
        shujukuRuntime: {
            async querySql() {
                return { columns: ['count'], values: [[4]] };
            },
        },
    });

    const content = await resolver.resolve({});

    assert.equal(content, '当前角色：林知夏，库存：4');
}

async function testAllActivatedEntriesShareOneShujukuRequestScopeAfterFinalEjs() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const finalEjsInputs = [];
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [
                    {
                        uid: 1,
                        content: '<%= person %>库存查询{[sql "SELECT 9" as stock]}'
                            + '<random id="dice" min="5" max="5" />'
                            + '<calc id="boosted" expr="$random:dice + 2" />',
                        constant: true,
                    },
                    {
                        uid: 2,
                        content: '<%= person %>可用库存：$v:stock；掷骰：$random:dice；加成：$calc:boosted',
                        constant: true,
                    },
                ],
            }];
        },
        async readSelection() {
            return {};
        },
        templateRuntime: {
            async prepareContext() {
                return { person: '林知夏' };
            },
            async evalTemplate(template, context) {
                finalEjsInputs.push(template);
                return template.replace('<%= person %>', context.person);
            },
        },
        shujukuRuntime: {
            async querySql() {
                return { columns: ['stock'], values: [[9]] };
            },
        },
    });

    const content = await resolver.resolve({});

    assert.deepEqual(finalEjsInputs, [
        '<%= person %>库存查询{[sql "SELECT 9" as stock]}'
            + '<random id="dice" min="5" max="5" />'
            + '<calc id="boosted" expr="$random:dice + 2" />',
        '<%= person %>可用库存：$v:stock；掷骰：$random:dice；加成：$calc:boosted',
    ]);
    assert.equal(content, '林知夏库存查询\n\n林知夏可用库存：9；掷骰：5；加成：7');
}

async function testShujukuSeedConditionsUseTheSameUnifiedScanInput() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 1,
                    content: '<if seed="海棠">条件命中<else>条件失败</if>',
                    constant: true,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
        shujukuRuntime: {},
    });

    const content = await resolver.resolve({
        hostMessages: [{ role: 'assistant', content: '海棠花开了' }],
        people: [],
        conversations: [],
    });

    assert.equal(content, '条件命中');
}

async function testSillyTavernPluginAdaptersRenderEjsMvuSqlAndPlotData() {
    const { createWorldbookContextResolver } = await importModule(
        'modules/worldbook-reading/context-resolver.js',
    );
    const { createSillyTavernWorldbookReadingRuntimes } = await importModule(
        'modules/worldbook-reading/st-runtime-adapter.js',
    );
    const mvuReads = [];
    const runtimes = createSillyTavernWorldbookReadingRuntimes({
        getEjsTemplate() {
            return {
                async prepareContext() {
                    return { person: '林知夏' };
                },
                async evalTemplate(template, context) {
                    if (template.includes('!!(mvu.stage === 2)')) {
                        return String(context.mvu?.stage === 2);
                    }
                    return template.replace('<%= person %>', context.person);
                },
            };
        },
        getMvu() {
            return {
                getMvuData(options) {
                    mvuReads.push(options);
                    return { stat_data: { stage: 2 } };
                },
            };
        },
        getAutoCardUpdaterApi() {
            return {
                async querySql() {
                    return { columns: ['stock'], values: [[9]] };
                },
                exportTableAsJson() {
                    return {};
                },
            };
        },
        getContext() {
            return {
                chat: [{ qrf_plot_tasks: { phase: '推进信号' } }],
            };
        },
    });
    const resolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 1,
                    content: '@@if mvu.stage === 2\n<%= person %>库存{[sql "SELECT stock"]}<if seed="推进信号">·已推进</if>',
                    constant: true,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
        ...runtimes,
    });

    const content = await resolver.resolve({
        hostMessages: [{ messageId: 7, role: 'assistant', content: '普通正文' }],
    });

    assert.equal(content, '林知夏库存9·已推进');
    assert.deepEqual(mvuReads, [{ type: 'message', message_id: 7 }]);
}

async function testShujukuRuntimeSessionCapturesQuerySqlMethodAndReceiver() {
    const { createSillyTavernWorldbookReadingRuntimes } = await importModule(
        'modules/worldbook-reading/st-runtime-adapter.js',
    );
    const api = {
        querySql(sql, params) {
            assert.strictEqual(this, api);
            assert.equal(sql, 'SELECT captured');
            assert.deepEqual(params, ['会话']);
            return { columns: ['source'], values: [['captured']] };
        },
    };
    const runtimes = createSillyTavernWorldbookReadingRuntimes({
        getAutoCardUpdaterApi: () => api,
        getContext: () => ({ chat: [] }),
    });
    const session = runtimes.shujukuRuntime({ scopeId: 'scope-query-session' });
    api.querySql = () => ({ columns: ['source'], values: [['replacement']] });

    assert.deepEqual(await session.querySql('SELECT captured', ['会话']), {
        columns: ['source'],
        values: [['captured']],
    });
}

async function testShujukuRuntimeSessionCapturesTableExportMethodAndReceiver() {
    const { createSillyTavernWorldbookReadingRuntimes } = await importModule(
        'modules/worldbook-reading/st-runtime-adapter.js',
    );
    const api = {
        exportTableAsJson() {
            assert.strictEqual(this, api);
            return { source: 'captured' };
        },
    };
    const runtimes = createSillyTavernWorldbookReadingRuntimes({
        getAutoCardUpdaterApi: () => api,
        getContext: () => ({ chat: [] }),
    });
    const session = runtimes.shujukuRuntime({ scopeId: 'scope-table-session' });
    api.exportTableAsJson = () => ({ source: 'replacement' });

    assert.deepEqual(session.exportTableAsJson(), { source: 'captured' });
}

async function testShujukuRuntimeSessionDoesNotGainCapabilitiesAfterOpening() {
    const { createSillyTavernWorldbookReadingRuntimes } = await importModule(
        'modules/worldbook-reading/st-runtime-adapter.js',
    );
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const api = {};
    const runtimes = createSillyTavernWorldbookReadingRuntimes({
        getAutoCardUpdaterApi: () => api,
        getContext: () => ({ chat: [] }),
    });
    const session = runtimes.shujukuRuntime({ scopeId: 'scope-missing-capabilities' });
    api.querySql = async () => ({ columns: ['value'], values: [[1]] });
    api.exportTableAsJson = () => ({ 角色属性表: [] });
    const sqlSource = '库存：{[sql "SELECT 1"]}';
    const cellSource = '<if cell="角色属性表/勇者/攻击 > 20">命中<else>未命中</if>';

    assert.equal(session.querySql, undefined);
    assert.equal(session.exportTableAsJson, undefined);
    assert.equal(await renderShujukuTemplate(sqlSource, session), sqlSource);
    assert.equal(await renderShujukuTemplate(cellSource, session), cellSource);
}

async function main() {
    await testDefaultSelectedBlueEntryIsIncluded();
    await testWorldbookReadFailureProducesEmptyContextWithoutRejecting();
    await testPersonNameActivatesGreenEntry();
    await testTavernHelperWorldbookShapeActivatesConstantAndSelectiveEntries();
    await testOnlyLatestTwoEligibleHostMessagesAreScanned();
    await testEachConversationContributesItsLatestThreeMessages();
    await testQQWorldbookProjectionIsNotReadBackIntoPrompt();
    await testResolverConsumesCatalogSelectionPolicy();
    await testAllFourSelectiveKeywordModes();
    await testRegexCaseSensitivityAndWholeWordMatching();
    await testRecursiveActivationHonorsRecursionFlags();
    await testRecursiveActivationStopsAfterTenRecursiveRounds();
    await testEntriesDeduplicateByWorldbookNameAndUid();
    await testEjsIfDecoratorFiltersEntriesBeforeActivation();
    await testActivationDecoratorsAndSpecialEntriesAreAppliedBeforeScan();
    await testPreprocessingRendersContentAndKeywordsOrExcludesFailedEntry();
    await testLatestMvuStatDataParticipatesInEntryCondition();
    await testFinalEjsReusesRequestContextAndFallsBackToCleanOriginal();
    await testFinalEjsOutputThenRunsThroughShujukuTemplate();
    await testAllActivatedEntriesShareOneShujukuRequestScopeAfterFinalEjs();
    await testShujukuSeedConditionsUseTheSameUnifiedScanInput();
    await testSillyTavernPluginAdaptersRenderEjsMvuSqlAndPlotData();
    await testShujukuRuntimeSessionCapturesQuerySqlMethodAndReceiver();
    await testShujukuRuntimeSessionCapturesTableExportMethodAndReceiver();
    await testShujukuRuntimeSessionDoesNotGainCapabilitiesAfterOpening();
    console.log('[worldbook-context-resolver-contract] passed');
}

main().catch((error) => {
    console.error('[worldbook-context-resolver-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
