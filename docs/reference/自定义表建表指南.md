# 自定义表建表指南（对照内置表照葫芦画瓢）

> 本指南面向：**想自己建一张表，让 AI 在每轮剧情中自动帮你填/改的人**。  
> 核心原则：**填得像内置表，AI 就会按你的预期操作；填得糊弄，AI 就会糊弄你**。

---

## 目录

- [一、先把机制搞清楚：你在 UI 上填的 5 个框，AI 最终看到什么](#一先把机制搞清楚你在-ui-上填的-5-个框ai-最终看到什么)
- [二、建表前必须想清楚的 5 件事](#二建表前必须想清楚的-5-件事)
- [三、UI 上 6 个字段逐个讲](#三ui-上-6-个字段逐个讲)
  - [字段1：表名](#字段1表名)
  - [字段2：DDL（仅 SQLite 模式）](#字段2ddl仅-sqlite-模式)
  - [字段3：表格说明 Note](#字段3表格说明-note)
  - [字段4：初始化触发 Init](#字段4初始化触发-init)
  - [字段5：新增触发 Insert](#字段5新增触发-insert)
  - [字段6：更新触发 Update](#字段6更新触发-update)
  - [字段7：删除触发 Delete](#字段7删除触发-delete)
- [四、完整实战：从零建一张《阵营关系表》](#四完整实战从零建一张阵营关系表)
- [五、常见坑与排雷](#五常见坑与排雷)

---

## 一、先把机制搞清楚：你在 UI 上填的 5 个框，AI 最终看到什么

你在表格配置页面填的这些字段，**不是给你自己看的，是喂给填表 AI 的提示词**。  
每轮触发填表时，系统把所有表拼成一段长文本发给 AI，AI 再根据这段文本判断"这轮要不要动这张表、怎么动"。

### 1.1 原生模式（DSL 模式）下 AI 看到的格式

假设你有一张「背包物品表」（内置表，用来对照学习），当它有数据时，AI 看到的是这样：

```
[4:背包物品表]
  Columns: [0:物品名称], [1:数量], [2:描述/效果], [3:类别]
  - Note: 记录主角拥有的所有物品、装备。
- 列0: 物品名称 - 物品的名称。
- 列1: 数量 - 拥有的数量。
- 列2: 描述/效果 - 物品的功能或背景描述。
- 列3: 类别 - 物品的类别（如："武器"、"消耗品"、"杂物"）。
  - Insert Trigger: 主角获得背包中没有的全新物品时添加。...
  - Update Trigger: 获得已有的物品，使其数量增加时更新，已有物品状态变化时更新。...
  - Delete Trigger: 物品被完全消耗、丢弃或摧毁时删除。...
  [0] 铁剑, 3, 锋利的铁制长剑, 武器
  [1] 治疗药水, 10, 恢复30点生命, 消耗品
```

**关键点**：
- `[4:背包物品表]` → 表 ID 4、表名「背包物品表」
- `Columns: [0:物品名称], ...` → 列序号 0、1、2、3（AI 用这个编号来 `insertRow`/`updateRow`）
- `Note / Insert Trigger / Update Trigger / Delete Trigger` → **全部来自你在 UI 填的那 4 个框**，一字不漏拼进去

### 1.2 SQLite 模式下 AI 看到的格式

```sql
CREATE TABLE inventory ( -- 背包物品表
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0), -- 数量
  description TEXT, -- 描述/效果
  category TEXT NOT NULL -- 类别
);
-- Note: 记录主角拥有的所有物品、装备。
-- 列0: 物品名称 - ...
-- INSERT: 主角获得背包中没有的全新物品时添加。
-- SQL示例: INSERT INTO inventory (row_id, item_name, quantity, description, category) VALUES ((SELECT MAX(row_id)+1 FROM inventory), '新物品', 1, '物品描述', '杂物');
-- UPDATE: 获得已有的物品，使其数量增加时更新...
-- DELETE: 物品被完全消耗、丢弃或摧毁时删除。...

-- 当前数据 (2 rows)
-- | row_id | 物品名称 | 数量 | 描述/效果 | 类别 |
-- | 1 | 铁剑 | 3 | 锋利的铁制长剑 | 武器 |
-- | 2 | 治疗药水 | 10 | 恢复30点生命 | 消耗品 |
```

**关键点**：
- DDL 原样输出，**注释里的中文名（`-- 物品名称`）就是 AI 识别中文列的关键**，不能丢
- `-- Note:`、`-- INSERT:`、`-- UPDATE:`、`-- DELETE:` 对应你 UI 上填的 4 个框，每行用 SQL 注释格式

**结论：UI 上那 4 个 Trigger 框 + Note 框，本质是提示词工程。AI 按不按你的意图干活，全看你怎么写。**

---

## 二、建表前必须想清楚的 5 件事

别急着点"新建表"。先回答自己这 5 个问题：

| # | 问题 | 为什么重要 |
|---|------|-----------|
| 1 | 这张表**记什么实体**？一行代表什么？ | 一行一实体，不能混。例如"角色表"一行一个角色，不能一行塞多个角色 |
| 2 | 这张表是**单行表**（只能有 1 行，用 UPDATE）还是**多行表**（可以不断 INSERT）？ | 决定 Insert/Update 触发怎么写。内置 `global_state`/`protagonist_info`/`options` 是单行表，禁止 INSERT |
| 3 | 哪一列是**业务主键**？AI 定位一行时靠什么判断"是同一行"？ | 决定 DDL 里哪列该加 `UNIQUE`，决定 `UPDATE ... WHERE` 用什么列 |
| 4 | 哪些列有**枚举值**？（比如类别只能是"武器/防具/饰品"这几种） | 决定 DDL 里要不要加 `CHECK(xx IN (...))`，不加 AI 会瞎编值 |
| 5 | AI 在**什么剧情条件下**该 INSERT / UPDATE / DELETE？ | 这就是 4 个触发框的内容，写不清楚 AI 就不会动你的表 |

想不清楚上面 5 个问题，别建表。先在纸上画清楚再来。

---

## 三、UI 上 6 个字段逐个讲

打开表格配置页面，你会看到以下字段（SQLite 模式多一个 DDL 框）：

```
[表名]                        ← 表的显示名称
---
AI提示词指令 (Source Data)
  [表格说明 (Note)]            ← 这张表是干什么的 + 每列的说明
  [初始化触发 (Init)]          ← 游戏开始时要不要初始化这张表？
  [新增触发 (Insert)]          ← 什么时候 INSERT 新行？
  [更新触发 (Update)]          ← 什么时候 UPDATE 已有行？
  [删除触发 (Delete)]          ← 什么时候 DELETE 行？
---
[DDL 定义]                    ← SQLite 模式才有，定义列结构
```

一个一个讲：

---

### 字段1：表名

**作用**：给 AI 和你自己看的中文标识。

**怎么填**：
- 用**名词短语**，结尾加"表"字。例如：`重要角色表`、`背包物品表`、`任务与事件表`
- 不要用动词（"打怪表" ❌）、不要用形容词（"酷炫的表" ❌）
- 同一个聊天里**不能重名**

**内置表参考**：

| 内置表名 | 说明 |
|---------|------|
| 全局数据表 | 单行全局状态 |
| 主角信息表 | 单行主角档案 |
| 重要角色表 | 多行 NPC 档案 |
| 主角技能表 | 多行技能清单 |
| 背包物品表 | 多行物品清单 |
| 任务与事件表 | 多行任务列表 |
| 纪要表 | 多行日志流水 |
| 选项表 | 单行选项配置 |

---

### 字段2：DDL（仅 SQLite 模式）

**作用**：定义表的列结构、类型、约束。是 AI 生成 SQL 语句的唯一依据。

**强制规则**（不遵守就报错）：
1. **第一列必须是** `row_id INTEGER PRIMARY KEY, -- 行号`
2. 表名用**英文小写 + 下划线**，不能用中文（SQLite 对中文表名支持差）
3. 每列**必须带中文注释** `-- 中文列名`，这是 AI 识别中文列的唯一依据
4. **没有中文注释的列，AI 完全不知道它对应 content 里哪一列，直接建表失败**

**模板框架**：

```sql
CREATE TABLE 英文表名 ( -- 中文表名
  row_id INTEGER PRIMARY KEY, -- 行号
  英文列名1 类型 [约束], -- 中文列名1
  英文列名2 类型 [约束], -- 中文列名2
  ...
  英文列名N 类型 [约束] -- 中文列名N（最后一列不加逗号）
);
```

**从内置表扒约束怎么写**：

| 想要的效果 | 抄内置表哪一列 | 具体写法 |
|-----------|--------------|---------|
| 这列不能为空 | `important_characters.name` | `name TEXT NOT NULL` |
| 这列不能重复（业务主键） | `inventory.item_name` | `item_name TEXT NOT NULL UNIQUE` |
| 这列有默认值 | `inventory.quantity` | `quantity INTEGER NOT NULL DEFAULT 1` |
| 这列必须 > 0 | `inventory.quantity` | `CHECK(quantity > 0)` |
| 这列只能是枚举的几种值 | `protagonist_skills.skill_type` | `CHECK(skill_type IN ('被动', '主动'))` |
| 这列可空，但填了就必须是某格式 | `global_state.prev_scene_time` | `CHECK(prev_scene_time IS NULL OR prev_scene_time GLOB '????-??-?? ??:??')` |
| 这列有长度上限 | `important_characters.brief_intro` | `CHECK(brief_intro IS NULL OR LENGTH(brief_intro) <= 20)` |
| 这列是"是/否"开关 | `important_characters.is_absent` | `is_absent TEXT NOT NULL DEFAULT '否' CHECK(is_absent IN ('是', '否'))` |
| 这列是时间戳 `YYYY-MM-DD HH:MM` | `global_state.cur_time` | `cur_time TEXT NOT NULL CHECK(cur_time GLOB '????-??-?? ??:??')` |
| 这列是格式化编号 `AM0001` | `chronicle.code_index` | `code_index TEXT NOT NULL UNIQUE CHECK(code_index GLOB 'AM[0-9][0-9][0-9][0-9]')` |

**举例：假设你要建一张「据点表」**

```sql
CREATE TABLE strongholds ( -- 据点表
  row_id INTEGER PRIMARY KEY, -- 行号
  stronghold_name TEXT NOT NULL UNIQUE, -- 据点名称
  faction TEXT NOT NULL CHECK(faction IN ('主角', '盟友', '敌方', '中立')), -- 所属阵营
  location TEXT NOT NULL, -- 所在地点
  defense_level INTEGER NOT NULL DEFAULT 1 CHECK(defense_level >= 1 AND defense_level <= 10), -- 防御等级
  is_discovered TEXT NOT NULL DEFAULT '否' CHECK(is_discovered IN ('是', '否')), -- 是否已发现
  description TEXT -- 描述
);
```

**每一行的理由**：
- `stronghold_name UNIQUE` → 据点名是业务主键，AI `UPDATE WHERE stronghold_name = 'xxx'` 定位唯一一行
- `faction CHECK IN (...)` → 阵营是枚举，防止 AI 瞎编"邪恶阵营"之类
- `defense_level CHECK 1-10` → 防御等级约束范围，AI 不会给你写个 -5 或 999
- `is_discovered` 模仿 `important_characters.is_absent` 的"是/否"开关写法
- 最后一行 `description` 不加逗号

**校验工具**：填完 DDL 别忘了点 UI 上的「校验 DDL」按钮，它会检查：
- DDL 能否被 SQLite 解析
- 列数是否和 content 表头对得上
- 每列是否有中文注释，注释是否和表头中文名一致

校验不过就建表失败，AI 会收到警告但不会写入数据。

---

### 字段3：表格说明 Note

**作用**：告诉 AI"这张表是干嘛的，每列代表什么"。

**AI 最终看到的格式**（原生模式）：
```
  - Note: <你填的内容>
```

**写法铁律**：
1. **第一段**：一句话说清这张表记什么。带上**关键约束**（单行/多行/每轮必更新/...）
2. **第二段**：逐列解释。格式必须是：`- 列N: 列名 - 列的含义（+ 可选的取值范围/约定）`

**从内置表扒格式**：

#### 模板 A：多行数据表（`inventory`）

```
记录主角拥有的所有物品、装备。
- 列0: 物品名称 - 物品的名称。
- 列1: 数量 - 拥有的数量。
- 列2: 描述/效果 - 物品的功能或背景描述。
- 列3: 类别 - 物品的类别（如："武器"、"消耗品"、"杂物"）。
```

**学什么**：
- 第一句点明"记录所有xxx"，一行代表一个物品
- 每列说明简洁，**有枚举值的列（列3）在括号里列出来**，AI 就知道不能瞎编

#### 模板 B：单行配置表（`global_state`）

```
记录当前主角所在地点及时间相关参数。此表有且仅有一行。
- 列0: 主角当前所在地点 - 主角当前所在的具体场景名称。
- 列1: 当前时间 - 游戏世界的当前时间。格式："YYYY-MM-DD HH:MM"，初始化时如果剧情没有明确具体的日期和时间，则必须根据世界观和设定自行设定一个明确的日期时间。
- 列2: 上轮场景时间 - 上一轮交互结束时的时间。
- 列3: 经过的时间 - 根据当前与上轮时间计算得出的文本描述（如："几分钟"）。
```

**学什么**：
- `此表有且仅有一行` → **这句话是单行表的咒语**，写了 AI 才不会乱 INSERT
- 列1 的描述很长，**解释了格式要求 + 没明确时该怎么办**。这就是把规则提前告诉 AI，比事后纠正强 10 倍
- 列3 的括号举例子（"几分钟"），AI 抄格式就行

#### 模板 C：带强约束的表（`important_characters`）

```
记录所有关键NPC的详细信息和动态状态。
- 列0: 姓名 - NPC的名字。
- 列1: 性别/年龄 - NPC的生理性别和年龄。
- 列2: 一句话介绍 – 用不超过15字概括角色身份背景，不含主观评价。
- 列3: 外貌特征 - 对NPC外貌和当前衣着的详细描述，对女性角色可包含身材描写；对男性角色无需描写。
- 列4: 持有的重要物品 - NPC拥有的关键重要物品列表，用分号分隔。
- 列5: 是否离场 - 判断该角色是否能直接与主角互动，填写"是"或"否"。
- 列6: 过往经历 - 记录角色背景与关键事件，随剧情增量更新，不超过300字，超过时需压缩。
```

**学什么**：
- 列2 `不超过15字` + 列6 `不超过300字，超过时需压缩` → **字数上限 + 越界处理方式**都写清楚，这是高质量提示词的标志
- 列4 `用分号分隔` → 列存多值时，**分隔符必须明确说明**，否则 AI 每次都用不同分隔符
- 列5 `填写"是"或"否"` → 即使 DDL 有 CHECK 约束，Note 里再强调一遍，双保险
- 列6 `增量更新` → 告诉 AI "这列不是覆盖写，要在旧内容后追加"

**你写 Note 的自检清单**：

- [ ] 第一段有没有说清"一行记什么"？
- [ ] 单行表有没有写 `此表有且仅有一行`？
- [ ] 每列格式有没有 `- 列N: 列名 - 含义`？
- [ ] 有枚举值的列有没有列出所有可选值？
- [ ] 有字数/长度限制的列有没有明确上限？
- [ ] 存多值的列（用分号/逗号分隔）有没有声明分隔符？
- [ ] 有特殊格式的列（时间/编号）有没有给出示例？

---

### 字段4：初始化触发 Init

**作用**：游戏/剧情初始化时，这张表要不要建一些初始数据？

**AI 最终看到的格式**：
- 表为空时 → `- Init Trigger: <你填的内容>`（用来提示 AI 初始化）
- 表已有数据 → 不会展示这个字段

**三种典型写法**：

#### 类型1：允许初始化（多行表）

抄 `inventory.initNode`：
```
游戏初始化时，根据剧情与设定添加主角的初始携带物品。
```

- 抄 `quests_events.initNode`：
```
游戏初始化时，根据剧情与设定添加一条主线剧情。
```

**写法**：`游戏初始化时，根据剧情/设定，<做什么>。`

#### 类型2：必须初始化（单行表）

抄 `global_state.initNode`：
```
插入一条关于当前世界状态的记录。
```

抄 `protagonist_info.initNode`：
```
游戏初始化时，插入主角的唯一条目。
```

**写法**：对于单行表，这里是**唯一能写入数据的机会**（后续都是 UPDATE），所以必须强制初始化。用"插入一条..."、"插入...的唯一条目"。

#### 类型3：固定格式初始化（纪要类）

抄 `chronicle.initNode`：
```
故事初始化时，插入一条新记录用于记录初始化剧情。
```

**你写 Init 的模板**：

```
<时机>，<做什么>。<特殊要求（可选）>。
```

例子：
- `游戏初始化时，根据主角的阵营在本表中添加 1~3 个初始据点。`
- `故事开始时，插入一条记录表示主角的出生地点。`

---

### 字段5：新增触发 Insert

**作用**：**最重要的字段之一**。告诉 AI"什么剧情条件下该 INSERT 新行"。

**AI 最终看到的格式**：
- 原生模式：`- Insert Trigger: <你填的内容>`
- SQLite 模式：`-- INSERT: <你填的内容>`

**核心公式**：
```
<触发剧情条件>时添加。
SQL示例: <一条完整的 INSERT 语句（SQLite 模式必填）>
```

**对照内置表学**：

#### 学 `inventory.insertNode`：

```
主角获得背包中没有的全新物品时添加。
SQL示例: INSERT INTO inventory (row_id, item_name, quantity, description, category) VALUES ((SELECT MAX(row_id)+1 FROM inventory), '新物品', 1, '物品描述', '杂物');
```

**拆解**：
1. **触发条件明确**：`主角获得背包中没有的全新物品时` —— 不是"有东西就插入"，而是"**背包中没有的** + **全新物品**"。防止 AI 把已有物品再 INSERT 一遍
2. **SQL 示例覆盖所有列**：`row_id, item_name, quantity, description, category` 五列全列出
3. **row_id 用子查询自增**：`(SELECT MAX(row_id)+1 FROM inventory)` —— **所有多行表都用这个套路**，AI 就不会忘记 row_id 怎么算

#### 学 `important_characters.insertNode`：

```
剧情中有未记录的重要人物登场时添加。
SQL示例: INSERT INTO important_characters (row_id, name, gender_age, brief_intro, appearance, key_items, is_absent, past_experience) VALUES ((SELECT MAX(row_id)+1 FROM important_characters), '角色名', '女/20', '简介', '外貌描述', '物品', '否', '经历');
```

**拆解**：
- `未记录的` → 防止同一个角色被 INSERT 两次
- `重要人物` → 不是所有登场角色都插入，过滤"重要"
- 示例值的具体：`'女/20'`（性别/年龄格式）、`'否'`（是否离场默认值）—— **值的形式让 AI 照抄**

#### 学单行表 `options.insertNode`：

```
禁止操作。
```

**对。就两个字。** 单行表不允许 INSERT，所以直接写"禁止操作"。简单粗暴有效。

`global_state.insertNode` / `protagonist_info.insertNode` 也是这么写的。

**你写 Insert 的模板**：

**多行表**：
```
<筛选条件：什么情况才插入，什么情况不插入>时添加。
SQL示例: INSERT INTO <英文表名> (row_id, <英文列1>, <英文列2>, ...) VALUES ((SELECT MAX(row_id)+1 FROM <英文表名>), '<示例值1>', '<示例值2>', ...);
```

**单行表**：
```
禁止操作。
```

**举例：据点表的 Insert**

```
剧情中出现一个之前未出现过的据点、营地或要塞时添加。仅添加具有战略意义或与剧情相关的据点。
SQL示例: INSERT INTO strongholds (row_id, stronghold_name, faction, location, defense_level, is_discovered, description) VALUES ((SELECT MAX(row_id)+1 FROM strongholds), '北境前哨', '盟友', '北境·雪原', 5, '是', '盟友在北境设立的侦察前哨');
```

---

### 字段6：更新触发 Update

**作用**：告诉 AI"什么剧情条件下该 UPDATE 已有行"。

**AI 最终看到的格式**：
- 原生模式：`- Update Trigger: <你填的内容>`
- SQLite 模式：`-- UPDATE: <你填的内容>`

**核心公式**：
```
<触发剧情条件>时更新。
SQL示例: <UPDATE 语句，必须带 WHERE>
SQL示例(多列): <更新多列的语句（可选）>
SQL示例(批量): <批量更新语句（可选）>
```

**对照内置表学**：

#### 学 `inventory.updateNode`（多种更新场景）：

```
获得已有的物品，使其数量增加时更新，已有物品状态变化时更新。
SQL示例: UPDATE inventory SET quantity = quantity + 3 WHERE item_name = '治疗药水';
SQL示例(多列): UPDATE inventory SET quantity = quantity - 1, description = '已损坏' WHERE item_name = '铁剑';
```

**拆解**：
1. **触发条件列了 2 种**：`已有物品数量增加` + `已有物品状态变化`。AI 会套用任意一种剧情
2. **示例用表达式更新**：`quantity = quantity + 3` —— **这是关键！** 告诉 AI 数量变化用加减运算，不是先读再写
3. **多列示例**：一条 UPDATE 同时改 quantity 和 description，AI 学会合并操作

#### 学 `global_state.updateNode`（单行表每轮必更新）：

```
当主角从当前所在区域离开时，更新所在地点。每轮必须更新时间。
SQL示例: UPDATE global_state SET current_location = '新地点', prev_scene_time = cur_time, cur_time = '2024-03-15 16:00', elapsed_time = '约1小时' WHERE row_id = 1;
```

**拆解**：
- `每轮必须更新时间` → **强制性语言**，AI 每轮都会改时间
- `prev_scene_time = cur_time` → **列间赋值**，AI 看到就会学：更新前先把旧时间存到上轮字段
- `WHERE row_id = 1` → **单行表定位方式**：用 row_id = 1，不用业务主键

#### 学 `important_characters.updateNode`（带特殊标记）：

```
已有角色的状态、关系、想法或经历变化时更新；若角色死亡需在姓名旁标注（已死亡）。
SQL示例: UPDATE important_characters SET is_absent = '是', past_experience = '新增经历...' WHERE name = '角色名';
```

**拆解**：
- `若角色死亡需在姓名旁标注（已死亡）` → **特殊业务规则直接写进提示词**，AI 会照做
- `past_experience = '新增经历...'` —— 但这里有个**隐藏坑**：Note 里说"增量更新"，但 SQL 示例没体现。实际 AI 可能会全量覆盖。如果你要严格增量，示例就要写成 `past_experience = past_experience || ';新增经历'`

**你写 Update 的模板**：

**多行表**（用业务主键定位）：
```
<场景A>时更新，<场景B>时更新。
SQL示例: UPDATE <表名> SET <列> = <新值> WHERE <业务主键> = '<值>';
SQL示例(多列): UPDATE <表名> SET <列1> = <值1>, <列2> = <值2> WHERE <业务主键> = '<值>';
```

**单行表**（用 row_id = 1 定位）：
```
<触发条件>时更新。<强制性要求（可选）>。
SQL示例: UPDATE <表名> SET <列> = '<值>' WHERE row_id = 1;
```

**举例：据点表的 Update**

```
据点的防御等级、发现状态、阵营归属发生变化时更新。
SQL示例: UPDATE strongholds SET defense_level = defense_level + 2, description = '防御设施升级完成' WHERE stronghold_name = '北境前哨';
SQL示例(阵营易手): UPDATE strongholds SET faction = '敌方' WHERE stronghold_name = '北境前哨';
```

---

### 字段7：删除触发 Delete

**作用**：告诉 AI"什么剧情条件下该 DELETE 行"。

**AI 最终看到的格式**：
- 原生模式：`- Delete Trigger: <你填的内容>`
- SQLite 模式：`-- DELETE: <你填的内容>`

**对照内置表学**：

#### 类型1：允许删除（抄 `inventory.deleteNode`）

```
物品被完全消耗、丢弃或摧毁时删除。
SQL示例: DELETE FROM inventory WHERE item_name = '已消耗物品';
SQL示例(批量): DELETE FROM inventory WHERE quantity <= 0;
```

**拆解**：
- `完全消耗、丢弃或摧毁` → **三种场景并列**，AI 会套用任意一种
- 批量示例 `WHERE quantity <= 0` → 告诉 AI 可以用条件批量删，**不用一条条删**

#### 类型2：禁止删除（抄任何禁止表）

```
禁止删除。
```

**对。四个字。** `global_state` / `protagonist_info` / `important_characters` / `chronicle` / `options` 的 deleteNode 全是这四个字。

**选择依据**：

| 这张表的性质 | Delete 怎么写 |
|------------|--------------|
| 日志/历史记录（只增不删） | `禁止删除。` |
| 档案类（角色信息、主角信息） | `禁止删除。`（角色死亡用 UPDATE 标记） |
| 状态/配置类（全局状态、选项） | `禁止删除。` |
| 物品/资源类（可消耗） | 写明销毁条件 + SQL 示例 |
| 任务/事件类（可完成/失败） | 写明完成/失败后删除的条件 |

**举例：据点表的 Delete**

```
据点被彻底摧毁或废弃时删除。仅在剧情中明确销毁时才删除，临时失守不删除（用 UPDATE 改阵营即可）。
SQL示例: DELETE FROM strongholds WHERE stronghold_name = '已被摧毁的据点';
```

注意那句 `临时失守不删除（用 UPDATE 改阵营即可）` —— **显式排除一种场景**，防止 AI 一看到"失守"就删除。这是高阶写法。

---

## 四、完整实战：从零建一张《阵营关系表》

**需求**：记录主角所在阵营和其他阵营的关系状态（友好/敌对/中立）、好感度数值。

### 第1步：想清楚 5 个问题

| # | 问题 | 答案 |
|---|------|-----|
| 1 | 一行代表什么？ | 一个"对方阵营"与"主角阵营"的关系 |
| 2 | 单行还是多行？ | 多行（可能有多个阵营） |
| 3 | 业务主键是什么？ | 对方阵营名（唯一） |
| 4 | 哪些列有枚举值？ | 关系状态（友好/敌对/中立/同盟） |
| 5 | 什么时候 I/U/D？ | I：新阵营登场；U：关系变化或好感度变化；D：阵营被消灭 |

### 第2步：定列

| 列序号 | 中文列名 | 英文列名 | 类型 | 约束 | 说明 |
|-------|---------|---------|------|------|------|
| 0 | row_id | row_id | INTEGER | PRIMARY KEY | 行号 |
| 1 | 阵营名称 | faction_name | TEXT | NOT NULL UNIQUE | 业务主键 |
| 2 | 关系状态 | relation_status | TEXT | NOT NULL CHECK IN (...) | 枚举 |
| 3 | 好感度 | favor_level | INTEGER | DEFAULT 0 CHECK(-100 <= x <= 100) | 数值范围 |
| 4 | 首领姓名 | leader_name | TEXT | | 可空 |
| 5 | 大致实力 | power_level | TEXT | CHECK IN (...) | 枚举 |
| 6 | 备注 | note | TEXT | | 可空 |

### 第3步：填 UI（直接抄下面内容）

**表名**：
```
阵营关系表
```

**DDL**：
```sql
CREATE TABLE faction_relations ( -- 阵营关系表
  row_id INTEGER PRIMARY KEY, -- 行号
  faction_name TEXT NOT NULL UNIQUE, -- 阵营名称
  relation_status TEXT NOT NULL CHECK(relation_status IN ('友好', '敌对', '中立', '同盟')), -- 关系状态
  favor_level INTEGER NOT NULL DEFAULT 0 CHECK(favor_level >= -100 AND favor_level <= 100), -- 好感度
  leader_name TEXT, -- 首领姓名
  power_level TEXT NOT NULL DEFAULT '未知' CHECK(power_level IN ('弱小', '一般', '强大', '未知')), -- 大致实力
  note TEXT -- 备注
);
```

**表格说明 (Note)**：
```
记录主角/主角所在阵营与其他已知阵营之间的关系状态。每个阵营占一行。
- 列0: 阵营名称 - 对方阵营的正式名称，必须唯一。
- 列1: 关系状态 - 当前的关系，填写"友好"、"敌对"、"中立"或"同盟"之一。
- 列2: 好感度 - 数值型关系度，范围 -100 到 100，-100 为死敌，0 为中立，100 为盟友。
- 列3: 首领姓名 - 该阵营当前的首领或代表人物名称，未知时留空。
- 列4: 大致实力 - 填写"弱小"、"一般"、"强大"或"未知"之一。
- 列5: 备注 - 该阵营的补充信息（如特殊历史、关键约定等），不超过150字。
```

**初始化触发 (Init)**：
```
游戏初始化时，根据世界观和开场剧情，添加 2~5 个已经与主角有过接触或主角已知的阵营。
```

**新增触发 (Insert)**：
```
剧情中出现一个之前未记录、且与主角/主角所在阵营产生了明确互动或信息交换的新阵营时添加。仅记录有剧情相关性的阵营。
SQL示例: INSERT INTO faction_relations (row_id, faction_name, relation_status, favor_level, leader_name, power_level, note) VALUES ((SELECT MAX(row_id)+1 FROM faction_relations), '月影佣兵团', '中立', 0, '佚名', '一般', '以雇佣合约闻名的中立佣兵组织');
```

**更新触发 (Update)**：
```
已有阵营的关系状态、好感度、首领或实力发生变化时更新。好感度变化用加减运算表达本次变化幅度。
SQL示例: UPDATE faction_relations SET favor_level = favor_level + 15, note = '因救援行动而改善关系' WHERE faction_name = '月影佣兵团';
SQL示例(关系突变): UPDATE faction_relations SET relation_status = '敌对', favor_level = favor_level - 50 WHERE faction_name = '月影佣兵团';
SQL示例(首领更替): UPDATE faction_relations SET leader_name = '新首领名', note = '原首领阵亡，新首领上位' WHERE faction_name = '月影佣兵团';
```

**删除触发 (Delete)**：
```
阵营被彻底消灭或主动解散时删除。阵营只是暂时失势、潜伏或被征服但未消亡时，用 UPDATE 调整 relation_status 和 power_level 即可，不要删除。
SQL示例: DELETE FROM faction_relations WHERE faction_name = '已被消灭的阵营';
```

### 第4步：保存，点"校验 DDL"

确认校验通过。然后下一轮剧情触发填表，AI 就会按你写的规则开始操作这张表了。

### 第5步：AI 实际生成的 SQL（示例）

假设剧情里出现"主角救了月影佣兵团的人"，AI 会生成：

```sql
<tableEdit>
UPDATE faction_relations SET favor_level = favor_level + 20, note = '救援佣兵团成员后关系显著改善' WHERE faction_name = '月影佣兵团';
</tableEdit>
```

—— 因为你的 Update 提示词里明确说了"用加减运算表达变化幅度"。

---

## 五、常见坑与排雷

### 坑1：DDL 列的中文注释和 Note 里的列名对不上

**表现**：AI 生成的 SQL 完全乱套，列值张冠李戴。

**原因**：AI 通过 DDL 注释 `-- 物品名称` 识别"这列对应中文的'物品名称'"。如果 DDL 写 `-- 物品名字`，Note 里写"列0: 物品名称"，AI 就懵了。

**解法**：**DDL 注释的中文 = Note 里列名 = content 表头**，三者完全一致。

### 坑2：多行表忘了加 `UNIQUE`

**表现**：AI 反复 INSERT 同一个实体（同一个物品/角色被插入多次）。

**原因**：没有 UNIQUE 约束，AI 找不到"应该用 UPDATE 还是 INSERT"的判断依据。

**解法**：业务主键列（物品名/角色名/据点名）必须加 `NOT NULL UNIQUE`。

### 坑3：单行表 Insert 写了 SQL 示例

**表现**：AI 每轮都 INSERT 新行，单行表变成了多行。

**原因**：你给了 INSERT 示例，AI 就会照抄。

**解法**：单行表的 insertNode **只写"禁止操作"四个字**。不要 SQL 示例，不要解释。

### 坑4：枚举列没写 CHECK 约束

**表现**：AI 给你写"极为友好"、"有点敌对"之类的自创值。

**原因**：Note 里说了枚举，但 DDL 没约束。AI 看心情。

**解法**：**Note 和 DDL 双保险**。Note 里列出所有枚举值，DDL 里加 `CHECK(xxx IN ('A', 'B', 'C'))`。

### 坑5：Update 示例没带 WHERE

**表现**：AI 生成 `UPDATE xxx SET ... ;` 把整张表全改了。

**原因**：你示例里没写 WHERE，或者示例 WHERE 条件不明确。

**解法**：**所有 UPDATE/DELETE 示例必须带 WHERE**，单行表用 `WHERE row_id = 1`，多行表用 `WHERE <业务主键> = 'xxx'`。

### 坑6：列数太多（> 10 列）

**表现**：AI 填表时漏列、乱填、甚至直接跳过这张表。

**原因**：列太多 AI 难以兼顾，提示词也会被截断。

**解法**：单表**最多 7~8 列**。超过就拆表。内置表里列最多的是 `important_characters`（8 列），这已经是上限了。

### 坑7：提示词字段留空

**表现**：AI 不知道什么时候该操作这张表，要么永远不动，要么乱动。

**原因**：4 个 Trigger 框里有空的。

**解法**：**4 个 Trigger 框一个都不能空**。不允许的操作写"禁止操作"/"禁止删除"。允许的操作必须写触发条件 + SQL 示例。

### 坑8：Note 里没写"每轮必须"类强制语言

**表现**：某些本该每轮更新的字段，AI 偶尔更新偶尔不更新。

**原因**：提示词用词太温和。"可以更新"、"建议更新"这些词 AI 执行率不高。

**解法**：关键更新用强制词 —— `每轮必须更新`、`禁止`、`必须`、`不得`。参考 `global_state.updateNode` 的 `每轮必须更新时间`。

---

## 附录：内置 8 张表速查对照

| 表名 | 类型 | 业务主键 | Init | Insert | Update | Delete |
|------|------|---------|------|--------|--------|--------|
| global_state（全局数据表）| 单行 | row_id=1 | ✅强制 | ❌禁止 | ✅每轮必更 | ❌禁止 |
| protagonist_info（主角信息表）| 单行 | row_id=1 | ✅强制 | ❌禁止 | ✅变化时更 | ❌禁止 |
| important_characters（重要角色表）| 多行 | name UNIQUE | ❌不强制 | ✅新人物登场 | ✅状态变化 | ❌禁止 |
| protagonist_skills（主角技能表）| 多行 | skill_name UNIQUE | ✅初始技能 | ✅获得新技能 | ✅技能升级 | ✅技能剥夺 |
| inventory（背包物品表）| 多行 | item_name UNIQUE | ✅初始物品 | ✅获得新物品 | ✅数量/状态变化 | ✅消耗/丢弃 |
| quests_events（任务与事件表）| 多行 | quest_name UNIQUE | ✅初始主线 | ✅接取新任务 | ✅任务进展 | ✅完成/失败 |
| chronicle（纪要表）| 多行(日志) | code_index UNIQUE | ✅开场记录 | ✅每轮必插 | ❌禁止 | ❌禁止 |
| options（选项表）| 单行 | row_id=1 | ✅生成初始 | ❌禁止 | ✅每轮必更 | ❌禁止 |

**对着这张表选你的自定义表属于哪种类型，然后去抄对应内置表的提示词写法。**
