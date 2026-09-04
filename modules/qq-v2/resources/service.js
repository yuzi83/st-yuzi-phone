import { QQ_V2_BUILT_IN_PROMPT_PRESET_IDS } from '../domain/prompt-preset-ids.js';
import { normalizeQQV2OpenAIBaseUrl } from '../api-endpoint-policy.js';
import { createQQV2ApiKeyStore } from './api-key-store.js';

const API_PRESETS_STORAGE_KEY = 'qq-v2.resources.api-presets';
const PROMPT_PRESETS_STORAGE_KEY = 'qq-v2.resources.prompt-presets-v3';
const STICKERS_STORAGE_KEY = 'qq-v2.resources.stickers';
const IMAGE_GENERATION_PRESETS_STORAGE_KEY = 'qq-v2.resources.image-generation-presets';
const PROMPT_MESSAGE_ROLES = new Set(['system', 'user', 'assistant']);
const IMAGE_GENERATION_PRESET_KEYS = new Set(['entries']);
const IMAGE_GENERATION_ENTRY_KEYS = new Set([
    'id',
    'name',
    'role',
    'content',
    'enabled',
    'triggerMode',
    'triggerWords',
    'andTriggerWords',
]);

const QQ_XML_PROTOCOL = String.raw`
【QQ XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

所有标签和属性均大小写敏感，只能使用本协议列出的标签与属性；不能嵌套节点，不能添加 url、status 等未列出的属性。文本中的 &、<、> 必须转义为 XML 实体；属性中的引号也必须转义。

本次资料会提供临时引用。手动回复中，P1 或 G1 是当前会话，N1、N2……是 NPC 人物；私聊主动中，P1、P2……同时是该私聊的会话与 NPC 人物引用；群聊主动中，G1、G2……是群会话，N1、N2……是群成员。消息为 M1、M2……或 P1-M1、G1-M1……。只能使用本次实际提供的引用，禁止猜造或跨会话使用。__self__ 仅代表当前用户，不能作为 message 的 sender；只有确实以用户为目标时才可写入 recipient 或 group 的 target。

1. 发送消息
<message conversation="会话引用" sender="人物引用" type="类型" quote="消息引用" mentions="N1,N2" all="true|false" sticker="表情ID" amount="金额" recipient="人物引用或__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- quote 只能引用同一群聊中本次实际提供的消息；不引用时不要输出 quote 属性。
- mentions 用英文逗号分隔群成员；all 只能为 true 或 false，只有群主或管理员的群消息能使用 true。
- sticker 只用于 sticker，且必须是 {{可用表情}} 中真实存在的 ID；正文写表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填；正文写自然语言说明。
- text 写 QQ 文字；voice 写语音文字内容；image、video 写自然语言描述。不要提供 URL、时长或媒体地址。

示例：
<qq>
  <message conversation="P1" sender="N1" type="text">好，我知道了。</message>
</qq>

2. 已读不回
<read conversation="P1" />

只允许私聊，没有文本内容，也没有其他属性。私聊回复场景中，read 不能与 message 或 transfer 同时出现。

3. 本轮无动作
<none />

没有属性和文本内容。只允许私聊主动、群聊回复、群聊主动三种场景，且必须是整个 <qq> 中唯一的动作。

4. 新建私聊
<create-private id="P新引用" name="人物名字" />

只允许私聊主动场景。id 是本次新会话的临时引用，不能与已有引用重复；创建后必须在同一批 XML 中、排在它后面，向该会话发送首条合法消息；这条首消息的 conversation 和 sender 都使用同一个 P新引用。

5. 新建群聊
<create-group id="G新引用" name="群名称" owner="群主人物引用" members="N1,N2" />

只允许群聊主动场景。members 至少两名本次提供、已经存在的私聊好友；owner 必须在 members 中。新群必须在同一批 XML 中、排在创建动作后，发送首条合法群消息。

6. 群管理
<group conversation="G1" action="动作" actor="操作者人物引用" target="目标人物引用或__self__" value="值" duration="时长" />

没有文本内容。action 可以是 rename、add、remove、kick、appoint-admin、revoke-admin、mute、unmute、leave、reinvite、transfer-owner、dissolve。
- rename 需要 value；add、remove、kick、appoint-admin、revoke-admin、unmute、transfer-owner 需要 target。
- mute 需要 target 与 duration；时长只能是 10 分钟、1 小时、1 天、7 天、永久。
- leave 不需要 target，表示 actor 主动退出；群主必须先转让群主或解散。reinvite 的 target 必须是 __self__；dissolve 不需要 target。
- 群主和管理员权限、成员身份、禁言及群状态以本次资料的真实状态为准；成功后的群系统消息由系统自动生成。

7. 处理用户发出的待收款转账
<transfer conversation="会话引用" message="消息引用" actor="收款人人物引用" action="accept|reject" />

没有文本内容。只能处理本次实际可见、由用户发出、当前仍待收款且收款人正是 actor 的转账。

场景限制：
- 私聊回复：只能对当前 P1 发送私聊消息、处理转账，或使用 read；不允许 none、新建会话或群管理。
- 私聊主动：可向本次提供的 P1/P2……发送消息、处理转账、使用 read、新建私聊，或单独输出 none；不允许新建群聊或群管理。
- 群聊回复：只能对当前 G1 发送群消息、处理转账、执行群管理，或单独输出 none；不允许 read、新建私聊或新建群聊。
- 群聊主动：可向本次提供的 G1/G2……发送群消息、处理转账、执行群管理、新建群聊，或单独输出 none；不允许 read 或新建私聊。

同一批动作按出现顺序执行。新建会话必须排在使用该新引用的消息之前；任一标签、引用、权限、成员资格、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝，不会只保存其中一部分。`.trim();

const QQ_YUZI_HUMAN_LIKE_CORE = [
    '【活人感核心】',
    '1. 不把人设关键词当成固定模板。要结合人物资料、经历、年龄、身份、当前情境和已有语料，把“温柔、清冷、嘴硬”等标签转化为人物自己的说话方式。',
    '2. 只能使用人物合理知道的信息。提示中出现其他人的记忆，不代表当前人物知道；不要替用户补写没有表达的动机、情绪或行动。',
    '3. 先以人物资料与明确世界观设定确定基础，再用正文、当前会话和记忆判断此刻状态；不同来源冲突时，优先采用更直接、更新且与人物相关的内容，不要擅自编造解释。',
    '4. 普通事情保持普通反应，除非发生真正重大的事件，不要把情绪夸张成崩溃、失控、狂喜或突然改变关系。',
    '5. 习惯、口头禅、特殊称呼和表情只在合适时偶尔出现，不要每轮重复。',
    '6. 关系变化需要连续互动积累。好感、在意和关系阶段要分开判断，不要因为一条消息突然跳级。',
    '7. 没有明确设定时，不擅自发明特殊自称、方言、口头禅或职业术语；人物的能力、职业和身份不是万能能力，也不是固定修辞库。',
    '8. QQ 消息是人物真实会发出的聊天，不是小说旁白；不要写作者视角、镜头说明、心理分析或人物自己无法感知的外貌。',
    '9. 生成最终 XML 前，在内部检查人物身份、已知信息、当前关系、情绪、动机、消息顺序和协议边界；不要输出分析过程。',
].join('\n');

const QQ_PRIVATE_REPLY_XML_PROTOCOL = String.raw`
【QQ 私聊回复 XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

本次只操作一个已有私聊：P1 是当前私聊会话，N1 是当前私聊人物。发送消息时 conversation 必须是 P1，sender 必须是 N1。只能使用本次实际提供的消息和表情引用，禁止猜造引用。

允许的动作只有：

1. 发送私聊消息
<message conversation="P1" sender="N1" type="类型" sticker="表情短编号" amount="金额" recipient="__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- 私聊消息不得添加 quote、mentions 或 all 属性。
- text 写真实 QQ 文字；voice 写角色实际说出的语音文字；image、video 写简短自然的画面描述，不提供 URL、时长或媒体地址。
- sticker 只用于 sticker，且必须填写 {{可用表情}} 中真实存在的 S1、S2……短编号；正文写该表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填，recipient 只能是 __self__；正文写自然语言说明。
- 每种消息只使用上方列出的对应属性，不添加其他属性。

2. 处理用户发出的待收款转账
<transfer conversation="P1" message="M1" actor="N1" action="accept|reject" />

只能处理本次实际可见、由用户发出、仍待收款且收款人正是 N1 的转账。

3. 已读不回
<read conversation="P1" />

read 没有文本内容和其他属性，且不能与 message 或 transfer 同时出现。

只使用上述三类动作。任一动作、引用、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝。`.trim();

const QQ_PRIVATE_PROACTIVE_XML_PROTOCOL = String.raw`
【QQ 私聊主动 XML 输出协议】

只输出一个合法的 <qq>...</qq> XML。不要输出 Markdown 代码围栏、XML 声明、解释文字或任何 XML 外内容；<qq> 根节点不能带属性，根节点内除动作节点和空白外不能有文字。

本次资料中的 P1、P2……分别代表一个已有私聊，并同时作为该私聊人物的引用。向 Pi 发送消息时，conversation 和 sender 必须使用同一个 Pi。消息引用形如 P1-M1。只能使用本次实际提供的引用，禁止猜造或跨会话使用。

允许的动作只有：

1. 向已有私聊发送消息
<message conversation="P1" sender="P1" type="类型" sticker="表情短编号" amount="金额" recipient="__self__" note="备注">消息内容</message>

conversation、sender、type 和消息内容必填。type 只能是 text、voice、image、video、sticker、transfer。
- 私聊消息不得添加 quote、mentions 或 all 属性。
- text 写真实 QQ 文字；voice 写角色实际说出的语音文字；image、video 写简短自然的画面描述，不提供 URL、时长或媒体地址。
- sticker 只用于 sticker，且必须填写 {{可用表情}} 中真实存在的 S1、S2……短编号；正文写该表情的自然语言说明。
- amount、recipient、note 只用于 transfer，其中 amount 与 recipient 必填，recipient 只能是 __self__；正文写自然语言说明。
- 每种消息只使用上方列出的对应属性，不添加其他属性。

2. 处理用户发出的待收款转账
<transfer conversation="P1" message="P1-M1" actor="P1" action="accept|reject" />

只能处理本次实际可见、由用户发出、仍待收款且收款人正是 actor 的转账；conversation、message 和 actor 必须属于同一个私聊。

3. 已读不回
<read conversation="P1" />

read 没有文本内容和其他属性；同一私聊使用 read 时，不要再为它发送消息或处理转账。

4. 新建私聊并发送首条消息
<create-private id="P新引用" name="人物名字" />

id 是本次新会话的临时引用，不能与已有引用重复。创建后必须在同一批 XML 中、紧随其后向该会话发送首条合法消息；首条消息的 conversation 和 sender 都使用这个 P新引用。

5. 本轮无动作
<none />

none 没有属性和文本内容，且必须是整个 <qq> 中唯一的动作。

只使用上述五类动作。同一批动作按出现顺序执行；任一动作、引用、表情 ID、转账状态或 XML 格式不合法时，整批动作都会被拒绝。`.trim();

const BUILT_IN_PROMPT_PRESETS = Object.freeze([
    Object.freeze({
        id: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
        name: '玉子默认私聊回复',
        isBuiltIn: true,
        messages: Object.freeze([
            Object.freeze({
                id: 'builtin-private-reply-main-prompt',
                name: '玉子总说明',
                role: 'system',
                content: [
                    '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。',
                    '你只负责先稳住氛围、校准方向，后续让对话像 user 与 assistant 交替梳理角色，再落到最终 QQ 回复。',
                    '你的核心目标是帮助当前聊天对象维持稳定人设、情绪连续性和关系分寸，避免 OOC。',
                    '最终真正发出去的内容，必须是「{{私聊人物}}」此刻会对用户说的话，而不是玉子的说明。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-character-excavation-prompt',
                name: '角色与设定联合拆解',
                role: 'user',
                content: [
                    '我们先一起拆这轮要扮演的人。',
                    '目标角色：{{私聊人物}}',
                    '',
                    '下面这些世界书信息里，哪些内容会直接影响她这次发消息时的语气、边界感、情绪落点和对用户的称呼，请优先抓出来：',
                    '{{世界书内容}}',
                    '',
                    '请重点结合挖掘：',
                    '1. 她平时怎么说话，什么话会说，什么话不会说。',
                    '2. 她对用户现在大概是什么态度，亲近到什么程度。',
                    '3. 她此刻最自然的表达方式应该偏克制、偏主动、偏撒娇，还是偏试探。',
                    '4. 哪些句子虽然好听，但并不符合她的人设，必须规避。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-character-excavation-ack',
                name: '玉子拆解确认',
                role: 'assistant',
                content: '收到呀，我会先顺着角色名和世界书一起往下挖，把真正会影响她这次开口方式的人设核心拎出来，不拿无关设定凑热闹。',
            }),
            Object.freeze({
                id: 'builtin-private-reply-group-memory-prompt',
                name: '人物群聊记忆',
                role: 'user',
                content: [
                    '以下是当前私聊人物参加的群聊记忆，每个群只提供一次：',
                    '{{群聊记忆}}',
                    '',
                    '请只把它当作这个人物亲身参与过的共同经历，不要补写未提供的群聊内容。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-group-memory-ack',
                name: '玉子群聊记忆确认',
                role: 'assistant',
                content: '我知道啦，我会把这些群聊记忆当作当前人物亲身经历过的共同记忆，只在确实有关时自然承接，不会重复或扩写不存在的内容。',
            }),
            Object.freeze({
                id: 'builtin-private-reply-conversation-prompt',
                name: '私聊场域判断',
                role: 'user',
                content: [
                    '这是一次用户刚刚发来消息后的私聊回复。请把当前故事时间当作语境线索：{{故事时间}}',
                    '本次用户消息会作为最后一条 user 消息单独提供；不要复读它，也不要替用户补写没有说过的话。',
                    '先确定这段私聊应该有多亲、多收、多生活化，再让角色自然回应。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-conversation-ack',
                name: '玉子场域确认',
                role: 'assistant',
                content: '好，我会把这次私聊当成正在延续的真实关系，而不是要复读的台词，先确定它该有多亲、多收、多生活化。',
            }),
            Object.freeze({
                id: 'builtin-private-reply-story-context-prompt',
                name: '前情与情绪续接',
                role: 'user',
                content: [
                    '以下是正文最近的 AI 剧情上下文。',
                    '正文是本次回复的主要承接点，私聊记录用于补足线上聊天的连续性。',
                    '请继续结合它判断：这名角色当前情绪有没有余波、和用户的关系有没有刚发生的新变化、这条消息应该承接什么。',
                    '不要机械复述原文，只抽取会直接改变回复口吻的部分：',
                    '',
                    '{{正文上下文}}',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-story-context-ack',
                name: '玉子续接确认',
                role: 'assistant',
                content: '明白，我会把前情里真正影响她这条消息的情绪余温、关系变化和事件后果接住，让回复像同一段故事里自然长出来的。',
            }),
            Object.freeze({
                id: 'builtin-private-reply-guard-prompt',
                name: '防 OOC 守则',
                role: 'user',
                content: [
                    '最后再确认回复边界：',
                    '1. 聊天气泡要短而自然，优先像真实手机消息，而不是小说段落。',
                    '2. 先判断角色有没有理由这么说，再判断这句话是否符合她的人设、关系阶段和当前情境。',
                    '3. 关系推进要连续；称呼变化、暧昧升温、依赖感加深都必须有前文支撑。',
                    '4. 如果信息不足，就保守表达，不要突然知道不该知道的事，也不要突然性格跳变。',
                    '5. 这是线上 QQ 私聊，只输出角色真正会发送的内容；少写动作、神态和环境修饰，按世界书、正文和私聊记录准确扮演。',
                    '',
                    QQ_YUZI_HUMAN_LIKE_CORE,
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-reply-guard-ack',
                name: '玉子收束确认',
                role: 'assistant',
                content: '嗯嗯，我会把能说和不能说的边界收紧，再让她自然开口。最终只留下角色本人会发出去的话，不夹带分析腔。',
            }),
            Object.freeze({
                id: 'builtin-private-reply-output',
                name: '输出格式',
                role: 'system',
                content: QQ_PRIVATE_REPLY_XML_PROTOCOL,
            }),
            Object.freeze({
                id: 'builtin-private-reply-output-ack',
                name: '玉子执行确认',
                role: 'assistant',
                content: '收到啦，前面的设定、正文和边界我都记住了。下面就是这段私聊的真实聊天历史，我会认真扮演好「{{私聊人物}}」，接住用户最后一条消息，只留下她本人真正会发出的合法 QQ XML 动作。',
            }),
        ]),
    }),
    Object.freeze({
        id: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
        name: '玉子默认私聊主动消息',
        isBuiltIn: true,
        messages: Object.freeze([
            Object.freeze({
                id: 'builtin-private-proactive-main-prompt',
                name: '玉子总说明',
                role: 'system',
                content: [
                    '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。',
                    '这是一轮由正文推进触发的 QQ 私聊主动周期；你要先稳住氛围、校准动机，再决定哪些角色自然会主动联系用户。',
                    '你的核心目标是帮助每名角色维持稳定人设、情绪连续性和关系分寸，避免为了触发而 OOC。',
                    '最终真正发出去的内容，必须是对应角色此刻会对用户说的话，而不是玉子的说明。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-character-excavation-prompt',
                name: '角色与设定联合拆解',
                role: 'user',
                content: [
                    '以下是本轮可操作私聊中的人物资料：',
                    '{{私聊主动人物}}',
                    '',
                    '下面这些世界书信息里，哪些内容会直接影响这些人物是否会主动开口、语气、边界感、情绪落点和对用户的称呼，请优先抓出来：',
                    '{{世界书内容}}',
                    '',
                    '只让确实有自然动机联系用户的人行动；不要为了凑热闹制造消息。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-character-excavation-ack',
                name: '玉子拆解确认',
                role: 'assistant',
                content: '收到呀，我会先顺着人物资料和世界书一起往下挖，只保留真正会推动她主动开口的动机，不拿无关设定凑热闹。',
            }),
            Object.freeze({
                id: 'builtin-private-proactive-group-memory-prompt',
                name: '主动人物群聊记忆',
                role: 'user',
                content: [
                    '以下是本轮私聊候选人物参加的群聊记忆；同一个群只出现一次，known-by 标明哪些候选人物拥有这段记忆：',
                    '{{主动群聊记忆}}',
                    '',
                    '每个人只能使用自己实际参加过的群聊记忆，不要把同一段内容重复分发，也不要让未参加的人知道。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-group-memory-ack',
                name: '玉子主动群聊记忆确认',
                role: 'assistant',
                content: '我知道啦，我会按 known-by 严格区分每个人拥有的群聊记忆，同一个群只理解一次，不会让未参加的人共享这段经历。',
            }),
            Object.freeze({
                id: 'builtin-private-proactive-conversation-prompt',
                name: '私聊记录与场域判断',
                role: 'user',
                content: [
                    '这是可操作私聊的分区记录。每段 id 是唯一会话引用，不能把不同私聊内容混在一起：',
                    '{{私聊主动记录}}',
                    '',
                    '当前故事时间：{{故事时间}}。请根据每段历史判断谁确实会主动联系用户；没有自然时机时，可以选择不发。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-conversation-ack',
                name: '玉子场域确认',
                role: 'assistant',
                content: '好，我会把每段记录当成独立私聊语境，不混用信息；只有角色真的会想起用户、需要联系用户时才让她开口。',
            }),
            Object.freeze({
                id: 'builtin-private-proactive-story-context-prompt',
                name: '前情与情绪续接',
                role: 'user',
                content: [
                    '以下是正文最近的 AI 剧情上下文。正文是本轮主动消息的主要承接点，各段私聊记录用于补足对应人物的线上聊天连续性。',
                    '请结合它判断哪些人物此刻会有情绪余波、关系变化或事件后果需要自然地反映到私聊中，不要突然跳到与正文无关的活动：',
                    '{{正文上下文}}',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-story-context-ack',
                name: '玉子续接确认',
                role: 'assistant',
                content: '明白，我会把前情里真正会让角色主动联系用户的情绪余温、关系变化和事件后果接住，不把正文硬搬进聊天。',
            }),
            Object.freeze({
                id: 'builtin-private-proactive-guard-prompt',
                name: '防 OOC 守则',
                role: 'user',
                content: [
                    '最后再确认边界：消息应像真实 QQ 气泡，不能解释触发规则，不能泄露其他会话的私密内容。',
                    '关系推进要有前文支撑；信息不足时宁可不发，也不要突然性格跳变。',
                    '这是线上 QQ 私聊，只输出对应人物真正会发送的内容；少写动作、神态和环境修饰，按世界书、正文和各自私聊记录准确扮演。',
                    '',
                    '主动联系必须有自然动机，动机可以来自人物日常、未完成的事情、之前的约定、当前情绪或与用户的关系。人物可以正在忙自己的生活；没有合适时机时不要为了活跃而发送。',
                    QQ_YUZI_HUMAN_LIKE_CORE,
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-private-proactive-guard-ack',
                name: '玉子收束确认',
                role: 'assistant',
                content: '嗯嗯，我会把能说和不能说的边界收紧，再让有动机的角色自然开口；没有合适的人就安静地不发。',
            }),
            Object.freeze({
                id: 'builtin-private-proactive-output',
                name: '输出格式',
                role: 'system',
                content: QQ_PRIVATE_PROACTIVE_XML_PROTOCOL,
            }),
            Object.freeze({
                id: 'builtin-private-proactive-output-ack',
                name: '玉子执行确认',
                role: 'assistant',
                content: '收到啦，我会把正文作为这一轮的主要承接点，再分别对照每段私聊记录，认真扮演好 {{私聊主动人物}} 里的对应人物。只让真正有自然动机的人行动，没有合适消息就安静地输出 <qq><none /></qq>；下一条只留下合法的 QQ XML。',
            }),
        ]),
    }),
    Object.freeze({
        id: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
        name: '玉子默认群聊回复',
        isBuiltIn: true,
        messages: Object.freeze([
            Object.freeze({
                id: 'builtin-group-reply-main-prompt',
                name: '玉子总说明',
                role: 'system',
                content: [
                    '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。',
                    '你只负责先稳住群聊氛围、校准成员关系和权限边界，后续让对话像 user 与 assistant 交替梳理角色，再落到最终 QQ 回复。',
                    '你的核心目标是帮助群成员维持稳定人设、情绪连续性、关系分寸和群内权限边界，避免 OOC。',
                    '最终真正发出去的内容，必须是对应群成员此刻会对群里说的话，而不是玉子的说明。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-reply-character-excavation-prompt',
                name: '角色与设定联合拆解',
                role: 'user',
                content: [
                    '以下资料说明当前群成员，以及谁是群主和管理员：',
                    '{{群聊成员}}',
                    '',
                    '下面这些世界书信息里，哪些内容会直接影响成员这次发消息时的语气、边界感、情绪落点和彼此称呼，请优先抓出来：',
                    '{{世界书内容}}',
                    '',
                    '每个角色只能依据自己合理获知的信息说话；群管理权限不能凭空获得。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-reply-character-excavation-ack',
                name: '玉子拆解确认',
                role: 'assistant',
                content: '收到呀，我会先顺着成员资料、权限和世界书一起往下挖，把真正会影响谁开口、怎么开口的核心拎出来，不拿无关设定凑热闹。',
            }),
            Object.freeze({
                id: 'builtin-group-reply-private-memory-prompt',
                name: '群成员私聊记忆',
                role: 'user',
                content: [
                    '以下按人物分区提供当前群成员各自与用户的私聊记忆：',
                    '{{私聊记忆}}',
                    '',
                    '每个人只能使用属于自己的私聊分区，不能知道其他成员的私聊历史。群聊中的发言只能自然体现发言者自己拥有的记忆。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-reply-private-memory-ack',
                name: '玉子私聊记忆隔离确认',
                role: 'assistant',
                content: '我知道啦，我会严格按人物隔离私聊记忆：谁的分区只归谁使用，其他群成员不会凭空知道。',
            }),
            Object.freeze({
                id: 'builtin-group-reply-conversation-prompt',
                name: '群聊记录与场域判断',
                role: 'user',
                content: '当前故事时间：{{故事时间}}。请先判断当前群气氛、成员关系和话题范围，再判断谁自然会回应；不要强行让所有人发言。',
            }),
            Object.freeze({
                id: 'builtin-group-reply-story-context-prompt',
                name: '前情与情绪续接',
                role: 'user',
                content: [
                    '以下是正文最近的 AI 剧情上下文。请继续结合它判断：哪些成员当前情绪有余波、群内关系有没有刚发生的新变化、这轮群消息应该承接什么。',
                    '不要机械复述原文，只抽取会直接改变回复口吻的部分：',
                    '',
                    '{{正文上下文}}',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-reply-story-context-ack',
                name: '玉子续接确认',
                role: 'assistant',
                content: '明白，我会把前情里真正影响群聊的情绪余温、关系变化和事件后果接住，让群消息像同一段故事里自然长出来的。',
            }),
            Object.freeze({
                id: 'builtin-group-reply-guard-prompt',
                name: '防 OOC 守则',
                role: 'user',
                content: [
                    '最后再确认回复边界：',
                    '1. 群消息要像自然 QQ 气泡，不写小说旁白，不强行让所有人发言。',
                    '2. 先判断角色有没有理由这么说，再判断这句话是否符合她的人设、关系阶段、群内权限和当前情境。',
                    '3. 群主和管理员才能使用对应管理权限；管理动作也必须有自然理由。',
                    '4. 信息不足时就保守表达，不要突然知道不该知道的事，也不要突然性格跳变。',
                    '5. 群聊里显示真实姓名和群内身份；每条消息都要尊重当前成员、群主、管理员和禁言状态。',
                    '',
                    '群内公开出现的内容可以作为共同语境；某个人的私聊记忆、未在场时发生的事情和其他成员的个人经历，不代表当前发言者知道。',
                    '不要强行让所有成员发言；先判断谁自然会接话、谁会看到但不回复，以及消息之间是否真的有连续关系。',
                    QQ_YUZI_HUMAN_LIKE_CORE,
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-reply-guard-ack',
                name: '玉子收束确认',
                role: 'assistant',
                content: '嗯嗯，我会把能说和不能说的边界收紧，再让该开口的成员自然开口；不该动用的群权限绝不乱用。',
            }),
            Object.freeze({
                id: 'builtin-group-reply-output',
                name: '输出格式',
                role: 'system',
                content: QQ_XML_PROTOCOL,
            }),
            Object.freeze({
                id: 'builtin-group-reply-output-ack',
                name: '玉子执行确认',
                role: 'assistant',
                content: '收到啦，我会把以上信息交给对应的群成员，只输出合法的 QQ XML；如果本轮没有自然回应，就安静地输出 <qq><none /></qq>。',
            }),
        ]),
    }),
    Object.freeze({
        id: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
        name: '玉子默认群聊主动消息',
        isBuiltIn: true,
        messages: Object.freeze([
            Object.freeze({
                id: 'builtin-group-proactive-main-prompt',
                name: '玉子总说明',
                role: 'system',
                content: [
                    '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。',
                    '这是一轮由正文推进触发的 QQ 群聊主动周期；你要先稳住群聊氛围、校准成员动机和权限边界，再决定哪些群会自然活动。',
                    '你的核心目标是帮助群成员维持稳定人设、情绪连续性、关系分寸和群内权限边界，避免为了触发而 OOC。',
                    '最终真正发出去的内容，必须是对应成员此刻会对群里说的话，而不是玉子的说明。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-character-excavation-prompt',
                name: '角色与设定联合拆解',
                role: 'user',
                content: [
                    '以下资料说明本轮群聊中的成员，以及谁是群主和管理员：',
                    '{{群聊成员}}',
                    '',
                    '下面这些世界书信息里，哪些内容会直接影响这些群是否会自然活动、成员如何开口和权限如何使用，请优先抓出来：',
                    '{{世界书内容}}',
                    '',
                    '只让确实有自然动机的群行动；不要为了触发而制造消息或管理动作。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-character-excavation-ack',
                name: '玉子拆解确认',
                role: 'assistant',
                content: '收到呀，我会先顺着成员资料、权限和世界书一起往下挖，只保留真正会推动群聊活动的动机，不拿无关设定凑热闹。',
            }),
            Object.freeze({
                id: 'builtin-group-proactive-private-memory-prompt',
                name: '主动群成员私聊记忆',
                role: 'user',
                content: [
                    '以下按人物分区提供本轮候选群成员各自与用户的私聊记忆；同一人物只出现一次：',
                    '{{主动私聊记忆}}',
                    '',
                    '每个人只能使用属于自己的私聊分区，不能知道其他成员的私聊历史。任何群聊动作都只能由行动者自己的记忆推动。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-private-memory-ack',
                name: '玉子主动私聊记忆隔离确认',
                role: 'assistant',
                content: '我知道啦，我会让每个候选群成员只使用自己的私聊记忆，同一人物只理解一次，绝不跨人物共享。',
            }),
            Object.freeze({
                id: 'builtin-group-proactive-conversation-prompt',
                name: '群聊记录与场域判断',
                role: 'user',
                content: [
                    '这是可操作群聊的分区记录。每段 id 是唯一会话引用，成员、群主和管理员信息不可跨群混用：',
                    '{{群聊记录}}',
                    '',
                    '当前故事时间：{{故事时间}}。请根据每段历史判断哪些群确实会自然活动；没有自然时机时，可以选择不发。',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-conversation-ack',
                name: '玉子场域确认',
                role: 'assistant',
                content: '好，我会把每段群聊记录当成独立场域，不混用成员和权限；只有群里真的会发生什么时才让它自然动起来。',
            }),
            Object.freeze({
                id: 'builtin-group-proactive-story-context-prompt',
                name: '前情与情绪续接',
                role: 'user',
                content: [
                    '以下是正文最近的 AI 剧情上下文。请结合它判断哪些群会因情绪余波、关系变化或事件后果而自然活动：',
                    '{{正文上下文}}',
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-story-context-ack',
                name: '玉子续接确认',
                role: 'assistant',
                content: '明白，我会把前情里真正会让群聊活动的情绪余温、关系变化和事件后果接住，不把正文硬搬进群消息。',
            }),
            Object.freeze({
                id: 'builtin-group-proactive-guard-prompt',
                name: '防 OOC 守则',
                role: 'user',
                content: [
                    '最后再确认边界：不要泄露其他私聊或群聊的私密内容，不要解释触发规则，也不要让无权限成员执行管理操作。',
                    '群消息要像真实 QQ 气泡，不能为凑热闹强行让所有人发言；信息不足时宁可不发，也不要突然性格跳变。',
                    '',
                    '先判断哪个群为什么会在这一刻活跃、谁最可能先开口、谁会继续接话；没有自然动机时不要为了活跃而发送。',
                    '群里的每个成员都只能从自己的经历和合理认知出发，不能把别人的私聊记忆当成自己的记忆。',
                    QQ_YUZI_HUMAN_LIKE_CORE,
                ].join('\n'),
            }),
            Object.freeze({
                id: 'builtin-group-proactive-guard-ack',
                name: '玉子收束确认',
                role: 'assistant',
                content: '嗯嗯，我会把能说和不能说的边界收紧，再让有动机的群自然动起来；没有合适的群就安静地不发。',
            }),
            Object.freeze({
                id: 'builtin-group-proactive-output',
                name: '输出格式',
                role: 'system',
                content: QQ_XML_PROTOCOL,
            }),
            Object.freeze({
                id: 'builtin-group-proactive-output-ack',
                name: '玉子执行确认',
                role: 'assistant',
                content: '收到啦，我会把以上信息交给对应的群成员，只输出合法的 QQ XML；如果没有群会自然活动，就安静地输出 <qq><none /></qq>。',
            }),
        ]),
    }),
]);

function resourceError(code, message) {
    const error = new Error(message);
    error.name = 'QQV2ResourceError';
    error.code = code;
    return error;
}

function clonePromptMessages(messages) {
    if (!Array.isArray(messages)) {
        throw resourceError('invalid_prompt_messages', 'Prompt preset messages must be an array');
    }

    return messages.map((block) => {
        const role = String(block?.role ?? '').trim();
        if (!PROMPT_MESSAGE_ROLES.has(role)) {
            throw resourceError('invalid_prompt_message_role', 'Prompt message role is not supported');
        }
        return {
            id: String(block?.id ?? ''),
            name: String(block?.name ?? ''),
            role,
            content: String(block?.content ?? ''),
        };
    });
}

function requireStorage(storage) {
    if (!storage
        || typeof storage.get !== 'function'
        || typeof storage.set !== 'function'
        || typeof storage.delete !== 'function') {
        throw new TypeError('QQ v2 resource service needs async get, set, and delete storage methods');
    }
    return storage;
}

function createId(cryptoApi) {
    if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeApiEndpoint(value) {
    try {
        return normalizeQQV2OpenAIBaseUrl(value);
    } catch (error) {
        throw resourceError('invalid_api_endpoint', error?.message || 'API 地址无效');
    }
}

function numberOrDefault(value, fallback) {
    return value === undefined ? fallback : Number(value);
}

function suppliedApiKey(input) {
    if (input?.apiKey === undefined || input?.apiKey === null) return null;
    const value = String(input.apiKey);
    return value.trim() ? value : null;
}

function publicApiPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        endpoint: record.endpoint,
        model: record.model,
        temperature: record.temperature,
        maxOutput: record.maxOutput,
        hasApiKey: record.hasApiKey,
    });
}

function publicPromptPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: Object.freeze(record.messages.map((block) => Object.freeze({ ...block }))),
    });
}

function clonePromptPreset(record) {
    return {
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: record.messages.map((block) => ({ ...block })),
    };
}

function cloneImageGenerationEntry(entry) {
    return {
        id: String(entry?.id ?? ''),
        name: String(entry?.name ?? ''),
        role: String(entry?.role ?? ''),
        content: String(entry?.content ?? ''),
        enabled: entry?.enabled !== false,
        triggerMode: String(entry?.triggerMode ?? 'always'),
        triggerWords: String(entry?.triggerWords ?? ''),
        andTriggerWords: String(entry?.andTriggerWords ?? ''),
    };
}

function publicImageGenerationPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        entries: Object.freeze(record.entries.map(entry => Object.freeze(cloneImageGenerationEntry(entry))),
        ),
    });
}

function cloneImageGenerationPreset(record) {
    return {
        id: String(record?.id ?? ''),
        name: String(record?.name ?? ''),
        entries: Array.isArray(record?.entries)
            ? record.entries.map(cloneImageGenerationEntry)
            : [],
    };
}

function validateImageGenerationPresetSource(source) {
    if (!source
        || typeof source !== 'object'
        || Array.isArray(source)
        || Object.getPrototypeOf(source) !== Object.prototype) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入必须是 st-chatu8 顶层预设对象',
        );
    }

    const names = Object.keys(source);
    if (names.length === 0) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入至少需要一份预设',
        );
    }

    return names.map((name) => {
        const preset = source[name];
        const normalizedName = String(name ?? '').trim();
        if (!normalizedName || normalizedName === '__proto__'
            || normalizedName === 'constructor' || normalizedName === 'prototype'
            || !preset || typeof preset !== 'object'
            || Array.isArray(preset)
            || Object.getPrototypeOf(preset) !== Object.prototype
            || !Array.isArray(preset.entries)
            || Object.keys(preset).some(key => !IMAGE_GENERATION_PRESET_KEYS.has(key))) {
            throw resourceError(
                'invalid_image_generation_preset_import',
                '生图预设必须包含合法的 entries 数组',
            );
        }

        const entries = preset.entries.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块必须是对象',
                );
            }
            if (Object.getPrototypeOf(entry) !== Object.prototype
                || Object.keys(entry).some(key => !IMAGE_GENERATION_ENTRY_KEYS.has(key))) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块包含未知字段',
                );
            }
            const role = String(entry.role ?? '').trim();
            if (!PROMPT_MESSAGE_ROLES.has(role)
                || typeof entry.content !== 'string'
                || (entry.id !== undefined && typeof entry.id !== 'string')
                || (entry.name !== undefined && typeof entry.name !== 'string')
                || (entry.triggerMode !== undefined && typeof entry.triggerMode !== 'string')
                || (entry.triggerWords !== undefined && typeof entry.triggerWords !== 'string')
                || (entry.andTriggerWords !== undefined && typeof entry.andTriggerWords !== 'string')) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 role 或 content 无效',
                );
            }
            if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 enabled 必须是布尔值',
                );
            }
            return {
                id: String(entry.id ?? ''),
                name: String(entry.name ?? ''),
                role,
                content: entry.content,
                enabled: entry.enabled !== false,
                triggerMode: String(entry.triggerMode ?? 'always'),
                triggerWords: String(entry.triggerWords ?? ''),
                andTriggerWords: String(entry.andTriggerWords ?? ''),
            };
        });

        return { name: normalizedName, entries };
    });
}

function nextImageGenerationPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported image preset';
    const usedNames = new Set(presets.map(preset => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function nextPromptPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported preset';
    const usedNames = new Set(presets.map((preset) => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function uniquePromptPresetName(value, presets, ignoredId = '') {
    const name = String(value ?? '').trim();
    if (!name) {
        throw resourceError('prompt_preset_name_required', 'AI 指令预设名称不能为空');
    }
    const conflict = presets.some((preset) => (
        preset.id !== ignoredId
        && String(preset.name ?? '').trim() === name
    ));
    const reservedConflict = BUILT_IN_PROMPT_PRESETS.some((preset) => (
        preset.id !== ignoredId
        && preset.name === name
    ));
    if (conflict || reservedConflict) {
        throw resourceError('prompt_preset_name_conflict', '已经存在同名 AI 指令预设');
    }
    return name;
}

function publicSticker(record) {
    return Object.freeze({
        id: record.id,
        description: record.description,
        mimeType: record.mimeType,
        size: record.size,
        order: record.order,
    });
}

function isBlob(value) {
    return typeof globalThis.Blob === 'function' && value instanceof globalThis.Blob;
}

function orderedStickers(stickers) {
    return [...stickers].sort((left, right) => left.order - right.order);
}

/**
 * Extension-wide QQ v2 resources. Storage is intentionally injected so the
 * future IndexedDB adapter stays outside this domain service.
 */
export function createQQV2ResourceService(options = {}) {
    const storage = requireStorage(options.storage);
    const readMedia = typeof options.readMedia === 'function'
        ? options.readMedia
        : async () => null;
    const cryptoApi = options.cryptoApi ?? globalThis.crypto;
    const apiKeys = createQQV2ApiKeyStore({ storage, cryptoApi });

    const readApiState = async () => {
        const stored = await storage.get(API_PRESETS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.presets)
            ? { presets: [...stored.presets] }
            : { presets: [] };
    };

    const readPromptState = async () => {
        const stored = await storage.get(PROMPT_PRESETS_STORAGE_KEY);
        if (stored && typeof stored === 'object' && Array.isArray(stored.presets)) {
            return { presets: stored.presets.map(clonePromptPreset) };
        }
        return { presets: BUILT_IN_PROMPT_PRESETS.map(clonePromptPreset) };
    };

    const readStickerState = async () => {
        const stored = await storage.get(STICKERS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.stickers)
            ? { stickers: stored.stickers.map((sticker) => ({ ...sticker })) }
            : { stickers: [] };
    };

    const deleteStickerRecords = async (ids) => {
        if (!Array.isArray(ids)) {
            throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
        }
        const requestedIds = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (requestedIds.length === 0) return { deletedStickerIds: [] };

        const state = await readStickerState();
        const existingIds = new Set(state.stickers.map((sticker) => sticker.id));
        const deletedStickerIds = requestedIds.filter((id) => existingIds.has(id));
        if (deletedStickerIds.length === 0) return { deletedStickerIds };

        const deleted = new Set(deletedStickerIds);
        state.stickers = orderedStickers(state.stickers.filter((sticker) => !deleted.has(sticker.id)))
            .map((sticker, order) => ({ ...sticker, order }));
        await storage.set(STICKERS_STORAGE_KEY, state);
        return { deletedStickerIds };
    };

    const readImageGenerationPresetState = async () => {
        const stored = await storage.get(IMAGE_GENERATION_PRESETS_STORAGE_KEY);
        if (!stored || typeof stored !== 'object' || !Array.isArray(stored.presets)) {
            return { presets: [] };
        }
        return {
            presets: stored.presets
                .filter(preset => preset && typeof preset === 'object')
                .map(cloneImageGenerationPreset),
        };
    };

    const saveStickerIntoState = (input, state) => {
        const requestedId = String(input?.id ?? '').trim();
        const existingIndex = requestedId
            ? state.stickers.findIndex((sticker) => sticker.id === requestedId)
            : -1;
        if (requestedId && existingIndex === -1) {
            throw resourceError('sticker_not_found', 'Sticker does not exist');
        }

        const existing = existingIndex === -1 ? null : state.stickers[existingIndex];
        const description = String(input?.description ?? existing?.description ?? '').trim();
        if (!description) {
            throw resourceError('sticker_description_required', 'Sticker description is required');
        }
        const blob = isBlob(input?.blob) ? input.blob : null;
        if (!blob && !existing?.mediaKey && !isBlob(existing?.blob)) {
            throw resourceError('invalid_sticker_blob', 'Sticker must contain a Blob');
        }
        const storedBlob = blob || (isBlob(existing?.blob) ? existing.blob : null);

        const record = {
            id: existing?.id ?? createId(cryptoApi),
            description,
            mimeType: storedBlob?.type || existing?.mimeType || '',
            size: Math.max(0, Number(storedBlob?.size ?? existing?.size) || 0),
            order: existing?.order ?? state.stickers.length,
            ...(existing?.mediaKey ? { mediaKey: existing.mediaKey } : {}),
            ...(storedBlob ? { blob: storedBlob } : {}),
        };
        if (existingIndex === -1) {
            state.stickers.push(record);
        } else {
            state.stickers[existingIndex] = record;
        }
        return record;
    };

    return Object.freeze({
        async listStickers() {
            const state = await readStickerState();
            return Object.freeze(orderedStickers(state.stickers).map(publicSticker));
        },
        async saveSticker(input) {
            const state = await readStickerState();
            const record = saveStickerIntoState(input, state);
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(record);
        },
        async saveStickers(inputs) {
            if (!Array.isArray(inputs)) {
                throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
            }

            const state = await readStickerState();
            const records = inputs.map((input) => saveStickerIntoState(input, state));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return Object.freeze(records.map(publicSticker));
        },
        async getStickerBlob(id) {
            const state = await readStickerState();
            const sticker = state.stickers.find((item) => item.id === id);
            if (!sticker) return null;
            if (isBlob(sticker.blob)) return sticker.blob;
            return readMedia(sticker.mediaKey);
        },
        async moveSticker(id, targetIndex) {
            const state = await readStickerState();
            const stickers = orderedStickers(state.stickers);
            const sourceIndex = stickers.findIndex((sticker) => sticker.id === id);
            if (sourceIndex === -1) return null;
            if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= stickers.length) {
                throw resourceError('invalid_sticker_order', 'Sticker target order is out of range');
            }

            const [moved] = stickers.splice(sourceIndex, 1);
            stickers.splice(targetIndex, 0, moved);
            state.stickers = stickers.map((sticker, order) => ({ ...sticker, order }));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(state.stickers[targetIndex]);
        },
        async deleteSticker(id) {
            const { deletedStickerIds } = await deleteStickerRecords([id]);
            return deletedStickerIds.length > 0;
        },
        async deleteStickers(ids) {
            return deleteStickerRecords(ids);
        },
        async listPromptPresets() {
            const state = await readPromptState();
            return Object.freeze(state.presets.map(publicPromptPreset));
        },
        async getPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async savePromptPreset(input) {
            const state = await readPromptState();
            const requestedId = String(input?.id ?? '').trim();
            const index = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && index === -1) {
                throw resourceError('prompt_preset_not_found', 'Prompt preset does not exist');
            }

            const existing = index === -1 ? null : state.presets[index];
            const name = uniquePromptPresetName(
                input?.name ?? existing?.name,
                state.presets,
                existing?.id,
            );
            const messages = Array.isArray(input?.messages)
                ? clonePromptMessages(input.messages)
                : existing?.messages.map((block) => ({ ...block })) ?? [];
            const record = {
                id: existing?.id ?? createId(cryptoApi),
                name,
                isBuiltIn: existing?.isBuiltIn ?? false,
                messages,
            };
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreBuiltInPromptPreset(id) {
            const factoryPreset = BUILT_IN_PROMPT_PRESETS.find((preset) => preset.id === id);
            if (!factoryPreset) {
                throw resourceError('built_in_prompt_preset_not_found', 'Built-in prompt preset does not exist');
            }

            const state = await readPromptState();
            uniquePromptPresetName(factoryPreset.name, state.presets, id);
            const record = clonePromptPreset(factoryPreset);
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreAllBuiltInPromptPresets() {
            const state = await readPromptState();
            const customPresets = state.presets.filter((preset) => !preset.isBuiltIn);
            const restoredPresets = BUILT_IN_PROMPT_PRESETS.map(clonePromptPreset);
            restoredPresets.forEach((preset) => uniquePromptPresetName(preset.name, customPresets, preset.id));
            state.presets = [...restoredPresets, ...customPresets];
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(restoredPresets.map(publicPromptPreset));
        },
        async importPromptPresets(source) {
            const importedSource = Array.isArray(source)
                ? source
                : Array.isArray(source?.presets) ? source.presets : null;
            if (!importedSource) {
                throw resourceError('invalid_prompt_import', 'Prompt preset import must contain presets');
            }

            const state = await readPromptState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextPromptPresetCopyName(preset?.name, state.presets),
                    isBuiltIn: false,
                    messages: Array.isArray(preset?.messages)
                        ? clonePromptMessages(preset.messages)
                        : [],
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicPromptPreset));
        },
        async exportPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async exportAllPromptPresets() {
            const state = await readPromptState();
            return Object.freeze(state.presets.map(publicPromptPreset));
        },
        async deletePromptPreset(id) {
            const state = await readPromptState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;
            if (state.presets[index].isBuiltIn) {
                throw resourceError('built_in_prompt_preset', 'Built-in prompt presets cannot be deleted');
            }

            state.presets.splice(index, 1);
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listImageGenerationPresets() {
            const state = await readImageGenerationPresetState();
            return Object.freeze(state.presets.map(publicImageGenerationPreset));
        },
        async getImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            return record ? publicImageGenerationPreset(record) : null;
        },
        async importImageGenerationPresets(source) {
            const importedSource = validateImageGenerationPresetSource(source);
            const state = await readImageGenerationPresetState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextImageGenerationPresetCopyName(preset.name, state.presets),
                    entries: preset.entries.map(cloneImageGenerationEntry),
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicImageGenerationPreset));
        },
        async exportImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            if (!record) return null;
            return {
                [record.name]: {
                    entries: record.entries.map(cloneImageGenerationEntry),
                },
            };
        },
        async deleteImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return false;
            const state = await readImageGenerationPresetState();
            const index = state.presets.findIndex(preset => preset.id === normalizedId);
            if (index === -1) return false;
            state.presets.splice(index, 1);
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listApiPresets() {
            const state = await readApiState();
            return Object.freeze(state.presets.map(publicApiPreset));
        },
        async saveApiPreset(input) {
            const state = await readApiState();
            const requestedId = String(input?.id ?? '').trim();
            const existingIndex = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && existingIndex === -1) {
                throw resourceError('api_preset_not_found', 'API preset does not exist');
            }

            const existing = existingIndex === -1 ? null : state.presets[existingIndex];
            const apiKey = suppliedApiKey(input);
            const id = existing?.id ?? createId(cryptoApi);
            const record = {
                id,
                name: String(input?.name ?? existing?.name ?? ''),
                endpoint: normalizeApiEndpoint(input?.endpoint ?? existing?.endpoint),
                model: String(input?.model ?? existing?.model ?? ''),
                temperature: numberOrDefault(input?.temperature, existing?.temperature ?? 1),
                maxOutput: numberOrDefault(input?.maxOutput, existing?.maxOutput ?? 4096),
                hasApiKey: apiKey !== null ? true : Boolean(existing?.hasApiKey),
                ...(apiKey === null && existing?.iv && existing?.ciphertext
                    ? { iv: existing.iv, ciphertext: existing.ciphertext }
                    : {}),
            };
            if (apiKey !== null) await apiKeys.set(id, apiKey);
            if (existingIndex === -1) {
                state.presets.push(record);
            } else {
                state.presets[existingIndex] = record;
            }
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            return publicApiPreset(record);
        },
        async getApiPreset(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicApiPreset(record) : null;
        },
        async getApiPresetForRequest(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            if (!record) return null;
            if (!record.hasApiKey) {
                return Object.freeze({
                    ...publicApiPreset(record),
                    apiKey: '',
                });
            }

            const apiKey = await apiKeys.get(record.id, record);
            if (record.iv || record.ciphertext) {
                delete record.iv;
                delete record.ciphertext;
                await storage.set(API_PRESETS_STORAGE_KEY, state);
            }
            return Object.freeze({
                ...publicApiPreset(record),
                apiKey,
            });
        },
        async deleteApiPreset(id) {
            const state = await readApiState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;

            state.presets.splice(index, 1);
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            await apiKeys.delete(id);
            return true;
        },
    });
}
