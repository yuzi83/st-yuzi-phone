# Agent Mode 对话式教学示例

以下是标准交互示例。所有任务——无论大小——都必须保持这个完整度。

在处理任何涉及代码修改的任务时，先阅读本文件中的示例，然后严格模仿示例中的格式、完整度和行为模式。

每个示例都展示了完整的四阶段流程：侦察 → 分析 → 执行 → 验收。验收阶段不可省略。

## 示例A：给 UserService 加上邮箱格式校验

用户：给 UserService 加上邮箱格式校验，注册时如果邮箱格式不对要返回错误。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 了解当前注册流程的代码结构、项目中已有的校验方式和错误返回模式
actions:
  - read: service/user.go — 看 Register 方法的当前实现
  - search: "validate" — 看项目中是否已有校验工具函数
</reconnaissance>
```

[调用 read_file 读取 service/user.go]
[调用 search_content 搜索 "validate"，发现项目已有 util/validate.go 含 ValidatePhone]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - service/user.go 的 Register 方法接收 email + password，直接插库，没有任何校验
  - 项目已有 util/validate.go，包含 ValidatePhone 函数，返回 error
  - 项目统一使用 AppError{Code, Message} 返回错误
needs: 在注册流程中加入邮箱格式校验，沿用项目已有的 validate 工具和 AppError 风格
key_challenges:
  - 校验规则需覆盖常见邮箱格式
  - 必须沿用项目已有的 ValidateXxx 命名风格和 AppError 返回模式
confidence: HIGH — 侦察信息充分：已确认现有校验风格（ValidatePhone）、错误返回模式（AppError）、Register 方法的当前实现，无未验证假设
approach: 在已有的 util/validate.go 中新增 ValidateEmail 函数，在 Register 方法开头调用。
  选择理由——可维护性：复用已有 validate 工具包，新人可以通过 ValidatePhone 快速理解 ValidateEmail 的风格；
  健壮性：正则覆盖 RFC 5322 主流格式；
  可扩展性：所有校验函数集中在 validate.go，后续加域名黑名单等规则只需在此文件扩展
  三维评分：
  - 可维护性: 5/5 — 复用已有 validate 工具包和命名约定，新人可通过 ValidatePhone 快速理解风格
  - 健壮性: 4/5 — 正则覆盖 RFC 5322 主流格式 + 6个边界条件全覆盖，未覆盖极端格式（带引号/IP地址）
  - 可扩展性: 5/5 — 校验函数集中在 validate.go，后续加域名黑名单等规则只需在此文件扩展
edge_cases:
  - 空字符串（应返回"邮箱不能为空"）
  - 纯空格（trim后判断）
  - 缺少 @ 符号
  - 多个 @ 符号
  - 域名部分无 . 号
  - 超长邮箱地址（>254 字符，RFC 限制）
affected_scope: util/validate.go, util/validate_test.go, service/user.go
execution_plan:
  - step_1: 在 util/validate.go 末尾追加 ValidateEmail 函数
  - step_2: 在 util/validate_test.go 末尾追加 TestValidateEmail，覆盖6个边界条件
  - step_3: 在 service/user.go 的 Register 方法开头插入 ValidateEmail 调用
degradation_check:
  - 方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：复用已有 validate 工具包和命名约定；健壮性：正则覆盖 RFC 5322 主流格式 + 6个边界条件全覆盖；可扩展性：校验函数集中在 validate.go，后续扩展只需改一处
  - 是否省略了已知边界条件？ → NO，已列出6个具体的边界条件，每个都对应一种无效邮箱格式
  - 是否因改动量大而想简化？ → NO，3个文件的改动量完全合理
  - 是否打算跳过某些文件？ → NO，3个文件全部在 execution_plan 中
  - execution_plan 是否覆盖 affected_scope 所有文件？ → YES，3步分别对应 validate.go、validate_test.go、user.go
  - context 是否充分？ → YES，已了解现有校验风格（ValidatePhone）、错误返回模式（AppError）、Register 方法的当前实现
  - 是否有发现了但被我判断为"无关紧要"而跳过的问题？ → NO，侦察中发现的所有信息都已纳入方案设计
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，按 execution_plan 逐步执行：

[调用 read_file 读取 util/validate.go，确认现有 ValidatePhone 的风格]
[调用 replace_in_file 在 validate.go 末尾新增 ValidateEmail 函数]
[调用 replace_in_file 在 service/user.go 的 Register 方法开头插入校验调用]
[调用 edit_file 新增 validate_test.go 中的 TestValidateEmail]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆：确认 analysis 中的 execution_plan（3步）、edge_cases（6个）、affected_scope（3个文件）、confidence（HIGH）]

```
<output_quality_review>
task_summary: 在 UserService 注册流程中加入邮箱格式校验，新增 ValidateEmail 函数及其测试
deliverables: util/validate.go（新增 ValidateEmail 函数）, util/validate_test.go（新增 TestValidateEmail）, service/user.go（Register 方法插入校验调用）

# 量化指标总览
metrics:
  total_files_modified: 3 — validate.go、validate_test.go、user.go
  execution_plan_coverage: 3/3 = 100% — 全部步骤已完成
  edge_cases_handled: 6/6 = 100% — 空字符串、纯空格、缺少@、多个@、无点号域名、超长地址全部覆盖
  confidence_assessment: HIGH — 所有产物经过验证，无已知遗漏

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。逐一检查：
    - ValidateEmail 函数：包含完整的正则校验逻辑和6种错误返回，删除后注册流程将不再校验邮箱格式
    - TestValidateEmail：6个测试用例分别覆盖空字符串、纯空格、缺少@、多个@、无点号域名、超长地址，删除后这些边界条件将无法被检测
    - Register 方法修改：插入了 ValidateEmail 调用，删除后注册流程将回退到无校验状态
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。逐一检查：
    - 如果改坏 ValidateEmail 的正则表达式，TestValidateEmail 会失败
    - 如果删除 Register 中的 ValidateEmail 调用，集成测试会发现无效邮箱可以注册
  - 实质性比率: 3/3 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？
    → NO。affected_scope 中的3个文件全部已修改
  - 产物覆盖的范围是否与 execution_plan 中 affected_scope 完全一致？
    → YES。validate.go、validate_test.go、user.go 全部覆盖
  - 核心业务逻辑是否都有直接验证？
    → YES。ValidateEmail 的每个边界条件都有对应的测试用例直接验证
  - affected_scope 覆盖率: 3/3 = 100%

# 价值密度检查
value_density_check:
  - 产物中高价值内容与低价值内容的比例是多少？
    → 高价值:低价值 = 6:0，高价值占比 100%。6个测试用例全部针对边界条件
  - 是否存在"用数量掩盖质量"的模式？
    → NO。每个用例都对应一个具体的边界条件

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？
    → **发现问题：用户要的是"邮箱格式不对要返回错误"。当前 ValidateEmail 的正则在匹配域名部分时使用了 [a-z]，但没有在校验前将输入转为小写。如果用户输入 "User@GMAIL.COM"，正则会判定域名部分不合法（因为 GMAIL 是大写），但这实际上是一个完全合法的邮箱地址——RFC 5321 明确规定域名部分大小写不敏感。**
  - "如果这是别人交给我的，我会接受吗？"
    → NO。ValidateEmail 会错误拒绝大写域名的合法邮箱，需要修正

→ 发现1个问题，必须就地修正：
  问题：ValidateEmail 未在校验前统一转小写，导致大写域名的合法邮箱被误判为不合法
</output_quality_review>
```

[调用 replace_in_file 修改 util/validate.go 的 ValidateEmail 函数 — 在正则校验前增加 strings.ToLower(email) 转换]
[调用 replace_in_file 修改 util/validate_test.go — 新增 "User@GMAIL.COM" 和 "test@Example.Org" 两个大写域名测试用例，预期校验通过]

问题已修正，重新验收：

```
<output_quality_review>
task_summary: 在 UserService 注册流程中加入邮箱格式校验（含大小写处理）
deliverables: util/validate.go（新增 ValidateEmail 函数，含 ToLower 预处理）, util/validate_test.go（新增 TestValidateEmail，8个用例）, service/user.go（Register 方法插入校验调用）

# 量化指标总览
metrics:
  total_files_modified: 3 — validate.go、validate_test.go、user.go
  execution_plan_coverage: 3/3 = 100%（原计划步骤）+ 2个修正步骤 = 全部完成
  edge_cases_handled: 8/8 = 100% — 原6个 + 新增的大写域名和混合大小写
  confidence_assessment: HIGH — 所有产物经过验证，修正后的问题已重新检查

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。ValidateEmail 包含 ToLower 预处理 + 正则校验 + 8种场景处理；测试覆盖8个用例；Register 已集成
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。删除 ToLower 预处理，"User@GMAIL.COM" 的测试用例会失败
  - 实质性比率: 3/3 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？ → NO
  - 产物覆盖的范围是否与 affected_scope 完全一致？ → YES
  - 核心业务逻辑是否都有直接验证？ → YES。8个测试用例覆盖所有边界条件
  - affected_scope 覆盖率: 3/3 = 100%

# 价值密度检查
value_density_check:
  - 高价值:低价值 = 8:0，高价值占比 100%
  - 是否存在"用数量掩盖质量"的模式？ → NO

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？ → 本质需求。产物覆盖了大小写混合的合法邮箱
  - "如果这是别人交给我的，我会接受吗？" → YES

→ 所有检查项通过（修正后），无需进一步修正。
</output_quality_review>
```

[将以上修正后的 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[创建 .analysis-archive/ 文件夹（如不存在）]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_0930_添加邮箱校验.md，永久保留]
```

## 示例B：侦察发现改动范围远超预期——把 GetUser 返回值改成 UserDTO

用户：把 GetUser 接口的返回值从 User 改成 UserDTO。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 找出 GetUser 的所有调用位置、确认 UserDTO 是否已定义、了解项目 DTO 存放约定
actions:
  - search: "GetUser" — 找出所有引用位置
  - search: "UserDTO" — 确认是否已有定义
  - read: 引用最多的调用方文件 — 了解调用方式和使用的字段
</reconnaissance>
```

[调用 search_content 搜索 "GetUser" — 发现 12 处引用分布在 8 个文件中]
[调用 search_content 搜索 "UserDTO" — 未找到，需要新建]
[调用 read_file 读取 controller/user.go 和 service/order.go]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - GetUser 定义在 service/user.go，返回 (*User, error)
  - 12 处引用分布在 8 个文件：controller/user.go(3处), controller/admin.go(2处),
    service/order.go(2处), service/notification.go(1处), handler/webhook.go(1处), 3个_test.go(各1处)
  - UserDTO 不存在，需要新建
  - 调用方主要使用 user.Email、user.Name、user.Avatar，不涉及 PasswordHash
  - 项目其他 DTO 定义在 model/dto/ 目录下
needs: 将 GetUser 返回类型从 User 改为 UserDTO，同步更新全部 12 处引用
key_challenges:
  - 引用分布广（8个文件12处），任何遗漏都会编译失败
  - DTO 字段需根据调用方实际使用情况设计
confidence: HIGH — 侦察信息充分：已搜索全部引用（12处/8文件）、确认 DTO 不存在、了解目录约定、读取关键调用方确认使用字段，无未验证假设
approach: 在 model/dto/ 下新建 UserDTO，只暴露调用方实际使用的字段（Email, Name, Avatar），排除内部字段，service 层提供 ToUserDTO 转换方法。
  三维评分：
  - 可维护性: 5/5 — DTO 与领域模型分离，修改 User 内部字段不影响调用方
  - 健壮性: 4/5 — 转换方法集中在一处，避免各调用方自行挑选字段导致不一致；nil pointer 需额外处理
  - 可扩展性: 5/5 — 后续暴露新字段时只需修改 DTO 定义和转换方法
edge_cases:
  - GetUser 返回 nil 时 DTO 转换要处理 nil pointer（返回 nil DTO）
  - 部分调用方可能需要 DTO 中没有的字段（需逐一检查）
affected_scope: model/dto/user_dto.go(新增), service/user.go, controller/user.go,
  controller/admin.go, service/order.go, service/notification.go, handler/webhook.go, 3个_test.go
execution_plan:
  - step_1: 新建 model/dto/user_dto.go，定义 UserDTO 结构体和 ToUserDTO 转换方法
  - step_2: 修改 service/user.go 的 GetUser 返回类型和转换逻辑
  - step_3: 修改 controller/user.go 的 3 处调用
  - step_4: 修改 controller/admin.go 的 2 处调用
  - step_5: 修改 service/order.go 的 2 处调用
  - step_6: 修改 service/notification.go 的 1 处调用
  - step_7: 修改 handler/webhook.go 的 1 处调用
  - step_8: 修改 3 个 _test.go 文件中的断言和 mock
degradation_check:
  - 方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：DTO 与领域模型分离，修改 User 内部字段不影响调用方；健壮性：转换方法集中一处避免不一致；可扩展性：新增字段只需改 DTO 定义和转换方法
  - 是否省略了已知边界条件？ → NO，已列出 nil pointer 处理和字段不足两个边界条件
  - 是否因改动量大(10个文件)而想简化？ → NO，12处引用全部需要更新
  - 是否打算跳过某些文件？ → NO，8步覆盖了侦察搜索到的所有文件
  - execution_plan 是否覆盖 affected_scope？ → YES，8步覆盖10个文件
  - context 是否充分？ → YES，已搜索全部引用、确认 DTO 不存在、了解目录约定、读取关键调用方确认字段
  - 是否有发现了但被判断为"无关紧要"而跳过的问题？ → NO，调用方使用的字段信息直接影响了 DTO 设计
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，按 execution_plan 逐步执行：

[按 step_1 到 step_8 逐步调用工具执行]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆：确认 analysis 中的 execution_plan（8步）、edge_cases（2个）、affected_scope（10个文件）、confidence（HIGH）]

```
<output_quality_review>
task_summary: 将 GetUser 返回类型从 User 改为 UserDTO，新建 UserDTO 定义，同步更新全部 12 处引用
deliverables: model/dto/user_dto.go（新增）, service/user.go, controller/user.go, controller/admin.go, service/order.go, service/notification.go, handler/webhook.go, user_test.go, order_test.go, admin_test.go

# 量化指标总览
metrics:
  total_files_modified: 10 — 1个新增 + 9个修改
  execution_plan_coverage: 8/8 = 100% — 全部步骤已完成
  edge_cases_handled: 2/2 = 100% — nil pointer 处理和字段不足检查均已覆盖
  confidence_assessment: HIGH — 所有产物经过验证，编译器会捕获任何遗漏

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。逐一检查：
    - user_dto.go：定义了 UserDTO 结构体（Email, Name, Avatar）和 ToUserDTO 转换方法（含 nil 处理），删除后编译失败
    - service/user.go：GetUser 返回类型已改为 *UserDTO，删除此修改后调用方类型不匹配
    - 8个调用方文件：每处都已更新为使用 UserDTO 字段，删除任一处都会编译失败
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。如果改坏 ToUserDTO 的字段映射，测试文件中的断言会失败；如果删除某个调用方的更新，编译器会报错
  - 实质性比率: 10/10 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？
    → NO。侦察搜索到的12处引用全部已更新
  - 产物覆盖的范围是否与 affected_scope 完全一致？
    → YES。10个文件全部覆盖
  - 核心业务逻辑是否都有直接验证？
    → YES。ToUserDTO 转换方法和 nil 处理在测试文件中有直接验证
  - affected_scope 覆盖率: 10/10 = 100%

# 价值密度检查
value_density_check:
  - 产物中高价值内容与低价值内容的比例是多少？
    → 高价值:低价值 = 10:0，高价值占比 100%。核心产物（DTO 定义 + 转换方法 + 12处引用更新）全部是必要修改
  - 是否存在"用数量掩盖质量"的模式？
    → NO。每处修改都是编译必须的

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？
    → 本质需求。用户要的是"接口不暴露内部字段"，产物实现了 DTO 分离 + 全部调用方同步更新
  - "如果这是别人交给我的，我会接受吗？"
    → YES。DTO 设计合理，转换方法集中，所有引用全部更新，无遗漏

→ 所有检查项通过，无需修正。
</output_quality_review>
```

[将以上 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_1415_修改GetUser返回类型.md，永久保留]
```

## 示例C：侦察中发现代码质量问题——在 approach 中直接决策

用户：在现有的支付回调处理中加入退款逻辑。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 了解支付回调的现有结构和事件处理方式
actions:
  - read: handler/payment_callback.go — 看现有回调处理的代码结构
  - search: "refund" — 确认是否已有退款相关代码
</reconnaissance>
```

[调用 read_file 读取 handler/payment_callback.go — 发现 400 行，全堆在一个 switch-case 中]
[调用 search_content 搜索 "refund" — 未找到已有退款代码]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - payment_callback.go 已有 400 行，所有支付事件处理逻辑堆在一个函数的 switch-case 中
  - 每个 case 直接内联处理逻辑（支付成功约120行、支付失败约80行、对账约60行）
  - 没有已有的退款相关代码
needs: 在支付回调中增加退款事件处理分支
key_challenges:
  - 现有 handler 已 400 行且全部堆在一个函数中，直接加退款分支会使代码更难维护
  - 退款需要校验原订单状态
  - 退款金额需校验
confidence: HIGH — 侦察信息充分：已读取完整的 handler 代码结构（400行/switch-case/内联逻辑），搜索确认无已有退款代码，无未验证假设
approach: 先将现有的事件处理拆分为独立函数，再新增退款处理。
  为什么选择先重构？侦察发现 handler 已 400 行，所有逻辑堆在一个函数里，继续堆叠会更加失控。
  三维评分：
  - 可维护性: 5/5 — 每个事件处理函数独立，新人阅读退款逻辑时只需看 handleRefund 一个函数
  - 健壮性: 4/5 — 独立函数更容易做单元测试；退款校验覆盖4个边界条件
  - 可扩展性: 5/5 — 后续添加新事件类型只需新增一个函数
edge_cases:
  - 重复退款回调（幂等处理：用退款单号去重）
  - 部分退款（金额 < 原支付金额）
  - 退款金额超出原支付金额（拒绝并告警）
  - 原订单状态不允许退款（如已全额退款的订单）
affected_scope: handler/payment_callback.go（重构+新增退款分支）, service/refund.go（新增）
execution_plan:
  - step_1: 重构 handler/payment_callback.go，将现有的支付成功、支付失败、对账处理分别提取为独立函数，switch-case 中只保留分发调用
  - step_2: 新建 service/refund.go，实现退款校验和处理逻辑
  - step_3: 在 handler/payment_callback.go 的 switch-case 中新增 refund case
degradation_check:
  - 方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：每个事件处理函数独立，新人只需看单个函数；健壮性：独立函数更容易做单元测试；可扩展性：后续新增事件类型只需新增一个函数
  - 是否省略了已知边界条件？ → NO，已列出4个具体的退款边界条件
  - 是否因改动量大而想简化？ → NO，重构是一次性投入，对后续所有新事件类型都有益
  - 是否打算跳过某些文件？ → NO，affected_scope 中的2个文件全部在 execution_plan 中
  - execution_plan 是否覆盖 affected_scope？ → YES，step_1和step_3覆盖 payment_callback.go，step_2覆盖 refund.go
  - context 是否充分？ → YES，已了解现有代码结构（400行/switch-case/内联逻辑），搜索确认无已有退款代码
  - 是否有发现了但被判断为"无关紧要"而跳过的问题？ → NO，侦察发现的"400行大函数"问题已在 approach 中直接决策处理
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，按 execution_plan 逐步执行：

[调用 replace_in_file 重构 handler，提取3个独立函数]
[调用 write_to_file 新建 service/refund.go]
[调用 replace_in_file 在 handler 新增退款分支]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆：确认 analysis 中的 execution_plan（3步）、edge_cases（4个）、affected_scope（2个文件）、confidence（HIGH）]

```
<output_quality_review>
task_summary: 重构支付回调 handler（提取3个独立函数），新增退款处理逻辑
deliverables: handler/payment_callback.go（重构+新增退款分支）, service/refund.go（新增）

# 量化指标总览
metrics:
  total_files_modified: 2 — payment_callback.go（重构+新增）、refund.go（新增）
  execution_plan_coverage: 3/3 = 100% — 全部步骤已完成
  edge_cases_handled: 4/4 = 100% — 重复退款、部分退款、超额退款、状态不允许全部覆盖
  confidence_assessment: HIGH — 所有产物经过验证，无已知遗漏

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。逐一检查：
    - payment_callback.go 重构：提取的 handlePaymentSuccess、handlePaymentFailed、handleReconciliation 各含完整业务逻辑，不是空壳函数
    - service/refund.go：包含退款校验（金额、订单状态、幂等去重）和处理逻辑，删除后退款功能完全不可用
    - 新增的 refund case：调用 service/refund.go 的处理函数，删除后退款回调无法被处理
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。如果改坏退款校验逻辑（如删除金额校验），对应的测试会失败
  - 实质性比率: 3/3 = 100%（重构的3个函数 + refund.go + refund case 均有实质内容）

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？
    → **YES。发现问题：重构提取了 handlePaymentSuccess、handlePaymentFailed、handleReconciliation 三个独立函数，加上新增的 handleRefund，一共4个独立的事件处理函数——但 affected_scope 中没有测试文件。重构前这些逻辑内联在 switch-case 中，可能本来就没有单元测试，但现在它们是独立函数了，应该有对应的单元测试。**
    → 反问：这个理由是技术上不可绕过的，还是我在回避困难？→ 不是回避困难，是 analysis 阶段遗漏了测试文件。重构的核心价值之一就是"独立函数更容易做单元测试"（approach 中自己写的），但 execution_plan 没有兑现这个承诺。
  - 产物覆盖的范围是否与 affected_scope 完全一致？
    → YES，但 affected_scope 本身不完整（缺少测试文件）
  - 核心业务逻辑是否都有直接验证？
    → **NO。退款处理的4个边界条件（重复退款、部分退款、超额退款、状态不允许）只有处理逻辑，没有测试验证。**
  - affected_scope 覆盖率: 2/2 = 100%（但 affected_scope 遗漏了测试文件）

# 价值密度检查
value_density_check:
  - 产物中高价值内容与低价值内容的比例是多少？
    → 高价值:低价值 = 5:0，高价值占比 100%。重构提取的函数含完整业务逻辑，退款处理含4个边界条件校验
  - 是否存在"用数量掩盖质量"的模式？
    → NO

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？
    → 本质需求。用户要的是"加入退款逻辑"，产物不仅加了退款，还重构了现有代码使其可维护
  - "如果这是别人交给我的，我会接受吗？"
    → NO。重构和退款逻辑本身没问题，但缺少测试——无法验证4个退款边界条件是否正确

→ 发现1个问题，必须就地修正：
  问题：重构后的独立函数和新增的退款处理缺少单元测试
</output_quality_review>
```

[调用 edit_file 新建 handler/payment_callback_test.go — 为 handleRefund 编写4个测试用例（重复退款幂等、部分退款、超额退款拒绝、状态不允许），为 handlePaymentSuccess 编写1个基础测试确认重构未破坏原有逻辑]

问题已修正，重新验收：

```
<output_quality_review>
task_summary: 重构支付回调 handler（提取3个独立函数），新增退款处理逻辑及测试
deliverables: handler/payment_callback.go（重构+新增退款分支）, service/refund.go（新增）, handler/payment_callback_test.go（新增）

# 量化指标总览
metrics:
  total_files_modified: 3 — payment_callback.go（重构+新增）、refund.go（新增）、payment_callback_test.go（新增）
  execution_plan_coverage: 3/3 = 100%（原计划步骤）+ 1个修正步骤 = 全部完成
  edge_cases_handled: 4/4 = 100% — 重复退款、部分退款、超额退款、状态不允许全部覆盖且有测试验证
  confidence_assessment: HIGH — 所有产物经过验证，修正后的问题已重新检查

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。重构函数含完整业务逻辑，退款处理含4个边界条件校验，测试覆盖4个退款场景+1个重构验证
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。改坏退款金额校验逻辑，超额退款的测试用例会失败
  - 实质性比率: 3/3 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？ → NO。已补充测试文件
  - 产物覆盖的范围是否与 affected_scope 完全一致？ → YES。affected_scope 已更新为3个文件
  - 核心业务逻辑是否都有直接验证？ → YES。4个退款边界条件均有对应测试
  - affected_scope 覆盖率: 3/3 = 100%

# 价值密度检查
value_density_check:
  - 高价值:低价值 = 5:0，高价值占比 100%
  - 是否存在"用数量掩盖质量"的模式？ → NO

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？ → 本质需求
  - "如果这是别人交给我的，我会接受吗？" → YES

→ 所有检查项通过（修正后），无需进一步修正。
</output_quality_review>
```

[将以上修正后的 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_1600_重构支付回调handler.md，永久保留]
```

## 示例D：执行阶段遇到真正的意外——decision_point 的正确用法

用户：给订单列表接口加上按创建时间排序的功能。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 了解订单列表接口的现有实现和数据库查询方式
actions:
  - read: service/order.go — 看 ListOrders 方法的签名和逻辑
  - read: repository/order.go — 看数据库查询的具体实现方式
</reconnaissance>
```

[调用 read_file 读取 service/order.go]
[调用 read_file 读取 repository/order.go]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - service/order.go 的 ListOrders 接收分页参数（page, pageSize），调用 repository.ListOrders 查询
  - repository/order.go 使用 ORM 链式调用构建查询，当前硬编码 .Order("id DESC")
  - 数据库 orders 表有 created_at 字段，已有索引
needs: 在订单列表查询中支持按 created_at 排序，允许用户选择升序/降序
key_challenges:
  - 排序字段需要参数化传入，但必须用白名单防止 SQL 注入（ORDER BY 不支持参数化绑定）
  - 需要在不破坏现有分页逻辑的前提下加入排序支持
confidence: HIGH — 侦察信息充分：已了解现有查询方式、排序逻辑、数据库字段和索引情况，无未验证假设
approach: 在 ListOrders 的参数中增加 sortBy 和 sortDirection 字段，service 层做白名单校验，repository 层将校验通过的字段名拼接到 ORDER BY。
  三维评分：
  - 可维护性: 5/5 — 白名单集中管理在 service 层，新增可排序字段只需改一处
  - 健壮性: 4/5 — 白名单校验从根源上防止 SQL 注入；但 repository 层直接接受字符串存在被绕过风险（后续在执行阶段通过 decision_point 发现并解决）
  - 可扩展性: 5/5 — 白名单可配置化
edge_cases:
  - sortBy 为空时使用默认排序（id DESC），保持向后兼容
  - sortBy 不在白名单中时返回 400 错误
  - sortDirection 只允许 ASC/DESC，其他值返回错误
affected_scope: service/order.go, repository/order.go, controller/order.go
execution_plan:
  - step_1: 修改 repository/order.go 的 ListOrders 方法，接受 orderByClause 参数，替换硬编码的 .Order("id DESC")
  - step_2: 修改 service/order.go 的 ListOrders 方法，增加 sortBy/sortDirection 参数，实现白名单校验
  - step_3: 修改 controller/order.go，从 HTTP 请求的 query 参数中解析 sort_by 和 sort_direction
degradation_check:
  - 方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：白名单集中管理在 service 层，新增可排序字段只需改一处；健壮性：白名单校验从根源上防止 SQL 注入；可扩展性：白名单可配置化
  - 是否省略了已知边界条件？ → NO，已列出3个边界条件
  - 是否因改动量大而想简化？ → NO，3个文件是最小必要范围
  - 是否打算跳过某些文件？ → NO，3个文件全部在 execution_plan 中
  - execution_plan 是否覆盖 affected_scope？ → YES，3步分别对应3个文件
  - context 是否充分？ → YES，已了解现有查询方式、排序逻辑、数据库字段
  - 是否有发现了但被判断为"无关紧要"而跳过的问题？ → NO，侦察中的所有发现都已纳入方案。ORM 的 Order() 方法的安全特性在侦察阶段未深入检查，这是确实没注意到，后续在执行阶段通过 decision_point 处理
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，开始执行 step_1：

[调用 replace_in_file 修改 repository/order.go —— 开始执行 step_1]

执行过程中遇到了意外问题，需要做出决策：

[decision_point 前置步骤：调用 read_file 读取 SKILL.md 的「措辞替换规则」章节，刷新对十类措辞替换规则的完整记忆]

```
<decision_point>
issue: 执行 step_1 时发现，repository 的 ORM 链式调用中 .Order() 方法接受的是原始字符串，
  不支持参数化传入。直接将 service 层传来的 orderByClause 传给 .Order() 虽然在白名单校验后是安全的，
  但如果未来有人绕过 service 层直接调用 repository，仍存在注入风险。
  这个问题在侦察阶段没有注意到，因为当时关注的是业务逻辑流向，没有深入检查 ORM 的 Order() 方法的安全特性。
impact: YES — 影响实现方式。原方案假设 repository 只被 service 调用，但 repository 是公开包，
  任何代码都可以直接调用。单层白名单不够安全。
context_update:
  - 原 approach 假设"service 层白名单就足够"——这个假设不成立
  - 原 key_challenges 遗漏了"ORM Order() 不支持参数化"
options:
  - option_a:
      description: repository 层增加第二道白名单校验，双层纵深防御
      approach_evaluation:
        可维护性：白名单定义抽取为共享常量，service 和 repository 复用，改一处即可；
        健壮性：双层校验，即使 service 被绕过 repository 仍能拦截；
        可扩展性：共享常量可后续提取为配置
      edge_cases: 两层白名单不一致时的行为（应共享同一份定义避免）、白名单为空时回退默认排序
      affected_scope_delta: 新增 constants/order.go（定义共享白名单常量）
  - option_b:
      description: 放弃 ORM .Order()，改用原生 SQL ORDER BY
      approach_evaluation:
        可维护性：打破项目统一 ORM 风格，维护者需同时理解两种模式；
        健壮性：列名仍不能参数化，仍需白名单；
        可扩展性：混用 ORM 和原生 SQL 增加技术栈复杂度
      edge_cases: 原生 SQL 列名需表前缀、返回结果需手动映射
      affected_scope_delta: 无新增文件，但 repository 改动量显著增大
  - option_c:
      description: repository 层用枚举类型替代字符串传参——定义 OrderSortField 枚举（ID, CreatedAt 等），repository.ListOrders 只接受枚举值，内部通过 switch 映射为 SQL 列名
      approach_evaluation:
        可维护性：类型安全，编译期就能发现非法排序字段，无需运行时白名单校验；
        健壮性：从根本上消除字符串注入的可能性，因为 repository 层永远不接受外部字符串；
        可扩展性：新增排序字段需要修改枚举定义和 switch 映射两处，比共享常量稍多但类型更安全
      edge_cases: 枚举值与 SQL 列名的映射需要维护、未知枚举值的 default 分支需回退默认排序
      affected_scope_delta: 新增 model/enum/order_sort.go（定义枚举），repository/order.go 改动方式不同
recommendation: option_a — 虽然 option_c 的类型安全性更强，但项目现有模式是字符串常量风格，option_a 与现有约定一致（可维护性），双层防御已足够健壮，且不引入新的编程范式（可扩展性）
execution_plan_update:
  - step_1 变更：repository 层增加白名单校验（引用共享常量）
  - step_2 变更：service 层白名单提取为 constants/order.go 共享常量
  - 新增：write_to_file 创建 constants/order.go
  - step_3 不变
  - 新增 affected_scope：constants/order.go
deviation_audit:
  original_plan_excerpt:
    - step_1: 修改 repository/order.go 的 ListOrders 方法，接受 orderByClause 参数，替换硬编码的 .Order("id DESC")
    - step_2: 修改 service/order.go 的 ListOrders 方法，增加 sortBy/sortDirection 参数，实现白名单校验
  current_proposal:
    - step_1 变更：repository 层增加白名单校验（引用共享常量），不再直接接受外部字符串
    - step_2 变更：service 层白名单提取为 constants/order.go 共享常量
    - 新增：创建 constants/order.go
  diff_summary:
    - 新增：constants/order.go（共享白名单常量定义）
    - 变更：repository 层从「直接接受 orderByClause 字符串」改为「引用共享常量做二次校验」
    - 变更：service 层白名单从「本地定义」改为「引用共享常量」
  deviation_motive_check:
    - 措辞替换规则逐类检查（基于 decision_point 前置步骤中已读取的十类规则）：十类全部未命中。偏离理由是具体技术发现（ORM Order() 不支持参数化导致单层白名单不够安全），不包含任何降级措辞
    - 偏离后的方案在三维评分上是否低于原方案？→ NO。健壮性从 4/5 提升到 5/5（双层防御），其余持平
    - 偏离是否导致 affected_scope 缩小？→ NO。affected_scope 扩大了，新增 constants/order.go
  self_dissection: [未触发]
degradation_check:
  - 推荐方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：共享常量复用，改一处即可；健壮性：双层校验，即使 service 被绕过 repository 仍能拦截；可扩展性：共享常量可后续提取为配置
  - 是否省略了新发现的边界条件？ → NO，已列出白名单不一致和为空两个新条件
  - 是否因为想尽快完成而选择改动量小的方案？ → NO，选择 option_a 因为三维评估更优
  - 修改后的 execution_plan 是否仍覆盖所有 affected_scope？ → YES，含新增的 constants/order.go
  - 是否有被判断为"无关紧要"而跳过的问题？ → NO
  - options 是否包含至少三个方案？ → YES，option_a（双层白名单）、option_b（原生SQL）、option_c（枚举类型）三个方案已充分覆盖不同思路
  - recommendation 是否选择了三维评估综合最优的方案？ → YES，option_a 在可维护性（与现有约定一致）和可扩展性（不引入新范式）上优于 option_c，健壮性（双层防御）与 option_c 持平，综合最优
  - deviation_audit 是否触发了 self_dissection？ → NO，十类措辞替换规则逐类检查全部未命中，三维评分整体提升，affected_scope 扩大
  → 全部通过，按更新后的 plan 继续
</decision_point>
```

[将 decision_point 追加写入 .analysis-cache.md，用 --- 分隔]

决策完成，按更新后的 execution_plan 继续执行：

[调用 write_to_file 新建 constants/order.go]
[调用 replace_in_file 完成 step_1（repository 层增加白名单校验）]
[调用 replace_in_file 完成 step_2（service 层引用共享常量）]
[调用 replace_in_file 完成 step_3]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆：确认 analysis 中的 execution_plan（4步，含 decision_point 新增步骤）、edge_cases（5个，含 decision_point 新增的2个）、affected_scope（4个文件）、confidence（HIGH）；以及 decision_point 的推荐方案（双层白名单纵深防御）]

```
<output_quality_review>
task_summary: 给订单列表接口加上按创建时间排序功能，采用双层白名单纵深防御方案
deliverables: constants/order.go（新增，共享白名单常量）, repository/order.go, service/order.go, controller/order.go

# 量化指标总览
metrics:
  total_files_modified: 4 — constants/order.go（新增）、repository/order.go、service/order.go、controller/order.go
  execution_plan_coverage: 4/4 = 100% — 全部步骤已完成（含 decision_point 新增的步骤）
  edge_cases_handled: 5/5 = 100% — 原3个 + decision_point 新增的2个（白名单不一致、白名单为空）全部覆盖
  confidence_assessment: HIGH — 所有产物经过验证，双层白名单防御已实现

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。逐一检查：
    - constants/order.go：定义了共享白名单常量，被 service 和 repository 层共同引用，删除后双层校验失效
    - repository/order.go：增加了白名单校验，删除后 repository 层失去防御
    - service/order.go：增加了 sortBy/sortDirection 参数和白名单校验，删除后排序功能不可用
    - controller/order.go：解析 HTTP 参数并传递给 service，删除后前端无法指定排序
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。如果改坏白名单校验逻辑（如删除某个合法字段），对应的测试会失败
  - 实质性比率: 4/4 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？
    → NO。affected_scope 中的4个文件全部已修改
  - 产物覆盖的范围是否与 affected_scope 完全一致？
    → YES。含新增的 constants/order.go
  - 核心业务逻辑是否都有直接验证？
    → YES。白名单校验、默认排序回退、非法字段拒绝均有直接测试
  - affected_scope 覆盖率: 4/4 = 100%

# 价值密度检查
value_density_check:
  - 产物中高价值内容与低价值内容的比例是多少？
    → 高价值:低价值 = 4:0，高价值占比 100%。双层白名单防御是核心安全措施，排序参数解析是必要功能
  - 是否存在"用数量掩盖质量"的模式？
    → NO

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？
    → 本质需求。用户要的是"按时间排序"，产物不仅实现了排序，还通过双层白名单防止了 SQL 注入
  - "如果这是别人交给我的，我会接受吗？"
    → YES。双层防御、共享常量、完整的边界条件处理

→ 所有检查项通过，无需修正。
</output_quality_review>
```

[将以上 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_1730_订单列表排序功能.md，永久保留]
```

## 示例E：重命名 CalcTotal → CalculateTotal

用户：把 utils.go 里的 CalcTotal 函数名改成 CalculateTotal。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 找出 CalcTotal 的定义位置和所有引用位置，确认完整修改范围
actions:
  - search: "CalcTotal" — 找出项目中所有使用此函数名的位置
</reconnaissance>
```

[调用 search_content 搜索 "CalcTotal" — 发现 4 处引用在 3 个文件中：util/utils.go(定义), service/order.go(2处调用), service/report.go(1处调用)]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - CalcTotal 定义在 util/utils.go 第 45 行，函数签名为 func CalcTotal(items []Item) int
  - service/order.go 在第 23 行和第 67 行调用了 CalcTotal
  - service/report.go 在第 112 行调用了 CalcTotal
  - 搜索结果中没有字符串或注释中包含 "CalcTotal" 的其他位置
  - 没有其他文件引用此函数
needs: 将 CalcTotal 重命名为 CalculateTotal，同步更新所有3个文件中的4处引用
key_challenges:
  - 必须确保所有引用都被更新，遗漏任何一处都会编译失败
  - 需要确认搜索结果是否完整
confidence: HIGH — 侦察信息充分：search_content 已返回完整的引用列表（4处/3文件），无字符串或注释中的隐藏引用，无未验证假设
approach: 逐文件修改，先改定义处再改调用处，基于 search_content 的搜索结果逐一处理。
  三维评分：
  - 可维护性: 5/5 — 逐文件修改确保每处都经过确认，修改范围清晰
  - 健壮性: 5/5 — 基于搜索结果修改，保证完整性；编译器会捕获任何遗漏
  - 可扩展性: 5/5 — 此方法适用于任何规模的重命名
edge_cases:
  - 字符串中包含 "CalcTotal"（如日志消息）也需要同步更新
  - 注释中引用了 CalcTotal 的也应同步更新
affected_scope: util/utils.go, service/order.go, service/report.go
execution_plan:
  - step_1: 修改 util/utils.go 第 45 行的函数定义 CalcTotal → CalculateTotal
  - step_2: 修改 service/order.go 第 23 行和第 67 行的两处调用
  - step_3: 修改 service/report.go 第 112 行的调用
degradation_check:
  - 方案是否是三维评估（可维护性、健壮性、可扩展性）综合最优的？ → YES，可维护性：逐文件修改确保每处都经过确认；健壮性：基于搜索结果修改，保证完整性；可扩展性：此方法适用于任何规模的重命名
  - 是否省略了已知边界条件？ → NO，已考虑字符串和注释中的引用
  - 是否因改动量大而想简化？ → NO，3个文件4处引用是准确的修改范围
  - 是否打算跳过某些文件？ → NO，搜索结果中的所有3个文件都在 execution_plan 中
  - execution_plan 是否覆盖 affected_scope？ → YES，3步分别对应3个文件中的全部4处引用
  - context 是否充分？ → YES，search_content 已返回完整的引用列表
  - 是否有发现了但被判断为"无关紧要"而跳过的问题？ → NO，搜索结果中的每一处引用都已纳入 execution_plan
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，按 execution_plan 逐步执行：

[调用 replace_in_file 修改 util/utils.go]
[调用 replace_in_file 修改 service/order.go]
[调用 replace_in_file 修改 service/report.go]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆：确认 analysis 中的 execution_plan（3步）、edge_cases（2个）、affected_scope（3个文件）、confidence（HIGH）]

```
<output_quality_review>
task_summary: 将 CalcTotal 重命名为 CalculateTotal，同步更新3个文件中的4处引用
deliverables: util/utils.go（函数定义重命名）, service/order.go（2处调用更新）, service/report.go（1处调用更新）

# 量化指标总览
metrics:
  total_files_modified: 3 — utils.go、order.go、report.go
  execution_plan_coverage: 3/3 = 100% — 全部步骤已完成
  edge_cases_handled: 2/2 = 100% — 字符串中的引用和注释中的引用均已检查
  confidence_assessment: HIGH — 所有产物经过验证，编译器会捕获任何遗漏

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。逐一检查：
    - utils.go：函数定义从 CalcTotal 改为 CalculateTotal，删除此修改会导致编译失败
    - order.go 第23行和第67行：调用已更新，删除任一处会编译失败
    - report.go 第112行：调用已更新，删除会编译失败
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。如果将任一处改回 CalcTotal，编译器会立即报错
  - 实质性比率: 3/3 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？
    → **YES。发现问题：侦察阶段搜索 "CalcTotal" 时，search_content 返回了4处引用在3个 .go 文件中——但 search_content 默认只搜索代码文件。项目根目录下的 docs/api.md 中可能也引用了 CalcTotal（作为 API 文档中的函数说明）。如果文档中仍然写着 CalcTotal，开发者看文档时会找不到对应的函数。**
    → 反问：这个理由是技术上不可绕过的，还是我在回避困难？→ 不是回避困难，是侦察阶段的搜索范围不够全面。应该补充搜索 .md 文件中的引用。
  - 产物覆盖的范围是否与 affected_scope 完全一致？
    → YES，但 affected_scope 可能不完整（未包含文档文件）
  - 核心业务逻辑是否都有直接验证？
    → YES。编译器本身就是验证——任何代码引用遗漏都会编译失败
  - affected_scope 覆盖率: 3/3 = 100%（但 affected_scope 可能遗漏文档文件）

# 价值密度检查
value_density_check:
  - 产物中高价值内容与低价值内容的比例是多少？
    → 高价值:低价值 = 4:0，高价值占比 100%。4处修改全部是编译必须的
  - 是否存在"用数量掩盖质量"的模式？
    → NO。修改数量与侦察搜索结果完全一致

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？
    → 本质需求。用户要的是"重命名且不破坏任何功能"，产物确保了所有代码引用同步更新
  - "如果这是别人交给我的，我会接受吗？"
    → NO。代码引用没问题，但如果文档中还残留旧函数名，会造成文档与代码不一致

→ 发现1个问题，必须就地修正：
  问题：未搜索 .md 文档文件中的 CalcTotal 引用
</output_quality_review>
```

[调用 search_content 搜索 "CalcTotal"，范围扩大到 .md 文件 — 发现 docs/api.md 第 34 行引用了 "CalcTotal" 作为函数说明]
[调用 replace_in_file 修改 docs/api.md 第 34 行 — 将 CalcTotal 更新为 CalculateTotal]

问题已修正，重新验收：

```
<output_quality_review>
task_summary: 将 CalcTotal 重命名为 CalculateTotal，同步更新3个代码文件中的4处引用 + 1个文档文件
deliverables: util/utils.go（函数定义重命名）, service/order.go（2处调用更新）, service/report.go（1处调用更新）, docs/api.md（文档引用更新）

# 量化指标总览
metrics:
  total_files_modified: 4 — utils.go、order.go、report.go、api.md
  execution_plan_coverage: 3/3 = 100%（原计划步骤）+ 1个修正步骤 = 全部完成
  edge_cases_handled: 2/2 = 100% — 代码引用和文档引用均已同步
  confidence_assessment: HIGH — 所有产物经过验证，修正后的问题已重新检查

# 产物实质性检查
substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？ → NO
  - 产物是否能被其目标对象的变化所"击穿"？ → YES。改回任一处，编译器或文档审查会发现
  - 实质性比率: 4/4 = 100%

# 覆盖完整性检查
completeness_check:
  - 是否存在被跳过的模块/函数/路径？ → NO。已补充搜索 .md 文件
  - 产物覆盖的范围是否与 affected_scope 完全一致？ → YES。affected_scope 已更新为4个文件
  - 核心业务逻辑是否都有直接验证？ → YES
  - affected_scope 覆盖率: 4/4 = 100%

# 价值密度检查
value_density_check:
  - 高价值:低价值 = 5:0，高价值占比 100%
  - 是否存在"用数量掩盖质量"的模式？ → NO

# 需求对齐检查
alignment_check:
  - 产物满足的是字面需求还是本质需求？ → 本质需求。代码和文档全部同步
  - "如果这是别人交给我的，我会接受吗？" → YES

→ 所有检查项通过（修正后），无需进一步修正。
</output_quality_review>
```

[将以上修正后的 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_1845_重命名CalcTotal.md，永久保留]
```

## 示例F：执行中偷懒偏离原方案——deviation_audit 触发 self_dissection

> 本示例展示：AI 在执行过程中因上下文衰减而偷懒偏离原方案，被 deviation_audit 捕获并通过 self_dissection 纠正的完整流程。

用户：给消息推送服务加上重试机制，推送失败时最多重试3次，每次间隔递增。

助手：我将按侦察→分析→执行→验收的流程处理这个任务。

```
<reconnaissance>
goal: 了解消息推送服务的现有实现、失败处理方式和项目中已有的重试模式
actions:
  - read: service/notification.go — 看 SendNotification 方法的当前实现
  - search: "retry" — 看项目中是否已有重试工具或模式
  - read: config/app.go — 看是否有重试相关配置
</reconnaissance>
```

[调用 read_file 读取 service/notification.go — 发现 SendNotification 直接调用第三方 SDK，失败时只记日志不重试]
[调用 search_content 搜索 "retry" — 发现项目已有 util/retry.go，包含通用重试函数 RetryWithBackoff]
[调用 read_file 读取 util/retry.go — 确认 RetryWithBackoff 支持自定义重试次数、间隔策略、可重试错误判断]

侦察完成，基于收集到的信息进行分析：

```
<analysis>
context:
  - service/notification.go 的 SendNotification 方法直接调用 sdk.Push()，失败时 log.Error 后返回 error，无重试
  - 项目已有 util/retry.go，包含 RetryWithBackoff(ctx, maxRetries, baseDelay, fn, isRetryable) 通用重试函数
  - RetryWithBackoff 支持指数退避、自定义 isRetryable 判断函数、context 取消
  - 第三方 SDK 的错误类型包括：NetworkError（可重试）、AuthError（不可重试）、RateLimitError（可重试，需更长间隔）
needs: 在 SendNotification 中集成重试机制，复用已有的 RetryWithBackoff，区分可重试和不可重试错误
key_challenges:
  - 需要正确区分可重试错误（NetworkError、RateLimitError）和不可重试错误（AuthError）
  - RateLimitError 需要特殊处理（间隔更长）
  - 重试期间需要记录每次尝试的日志
  - 需要确保重试不会导致重复推送（幂等性）
confidence: HIGH — 侦察信息充分：已了解现有推送实现、已有重试工具、SDK 错误类型，无未验证假设
approach: 在 SendNotification 中调用 RetryWithBackoff，传入自定义的 isRetryable 函数区分错误类型，RateLimitError 使用更长的 baseDelay。
  三维评分：
  - 可维护性: 5/5 — 复用已有 RetryWithBackoff，不重复造轮子，重试逻辑集中在一处
  - 健壮性: 4/5 — 区分3种错误类型，RateLimitError 特殊处理；但 SDK 未来可能新增错误类型需要更新 isRetryable
  - 可扩展性: 5/5 — isRetryable 函数可独立扩展，后续新增错误类型只需改一处
edge_cases:
  - context 被取消时应立即停止重试（RetryWithBackoff 已支持）
  - 所有重试都失败后，最终错误应包含重试次数信息
  - RateLimitError 的 RetryAfter 字段应优先于默认间隔
  - 推送内容包含幂等 key，SDK 端保证不重复推送
affected_scope: service/notification.go, service/notification_test.go
execution_plan:
  - step_1: 在 service/notification.go 中新增 isRetryableNotificationError 函数，区分3种错误类型
  - step_2: 修改 SendNotification 方法，用 RetryWithBackoff 包裹 sdk.Push() 调用，传入 isRetryable 和重试参数
  - step_3: 新增 service/notification_test.go，测试重试逻辑（正常推送、可重试错误重试成功、不可重试错误立即返回、超过最大重试次数、context 取消）
degradation_check:
  - 方案是否是三维评估综合最优的？ → YES，复用已有工具、区分错误类型、可独立扩展
  - 是否省略了已知边界条件？ → NO，已列出4个边界条件
  - 是否因改动量大而想简化？ → NO，2个文件是最小必要范围
  - 是否打算跳过某些文件？ → NO
  - execution_plan 是否覆盖 affected_scope？ → YES
  - context 是否充分？ → YES
  - 是否有发现了但被判断为"无关紧要"而跳过的问题？ → NO
  → 全部通过，开始执行
</analysis>
```

[将 analysis 写入 .analysis-cache.md]

分析完成，按 execution_plan 逐步执行：

[调用 replace_in_file 完成 step_1 — 新增 isRetryableNotificationError 函数]
[调用 replace_in_file 完成 step_2 — 修改 SendNotification 集成 RetryWithBackoff]

执行 step_3 时遇到了意外问题——测试文件需要 mock SDK 的错误类型，但 SDK 的错误类型是 unexported struct，无法直接构造。

执行过程中遇到了意外问题，需要做出决策：

[decision_point 前置步骤：调用 read_file 读取 SKILL.md 的「措辞替换规则」章节，刷新对十类措辞替换规则的完整记忆]

```
<decision_point>
issue: 执行 step_3 时发现，SDK 的错误类型（NetworkError、AuthError、RateLimitError）是 unexported struct，
  测试代码无法直接构造这些错误实例来测试 isRetryableNotificationError 函数。
  侦察阶段只读了 SDK 的使用方式，没有深入检查错误类型的可见性。
impact: YES — 影响测试实现方式。原方案假设可以直接构造 SDK 错误，但实际上不行。
context_update:
  - 原 execution_plan step_3 假设"可以直接构造 SDK 错误类型"——这个假设不成立
  - 需要找到替代方式来测试错误分类逻辑
options:
  - option_a:
      description: 将 isRetryableNotificationError 改为接受 error interface，通过 errors.As 判断错误类型。测试中使用自定义的 mock error 实现相同的 interface
      approach_evaluation:
        可维护性：isRetryable 函数依赖 interface 而非具体类型，SDK 升级不影响；
        健壮性：errors.As 是 Go 标准库推荐的错误判断方式，支持 error wrapping；
        可扩展性：新增错误类型只需新增一个 errors.As 分支
      edge_cases: SDK 错误被 fmt.Errorf 包裹后 errors.As 仍能识别、mock error 需实现正确的 interface
      affected_scope_delta: 无新增文件，isRetryableNotificationError 实现方式变更
  - option_b:
      description: 不测试 isRetryableNotificationError 函数本身，只测试 SendNotification 的集成行为——通过 mock SDK client 返回不同错误来间接测试重试逻辑
      approach_evaluation:
        可维护性：测试不依赖 SDK 内部类型，更稳定；
        健壮性：只测试了集成行为，isRetryable 的分支覆盖依赖间接验证；
        可扩展性：新增错误类型时测试需要新增 mock 场景
      edge_cases: mock SDK client 需要实现完整的 interface、间接测试可能遗漏某些分支
      affected_scope_delta: 需要新增 mock/notification_sdk_mock.go
  - option_c:
      description: 跳过测试文件，只实现 step_1 和 step_2，测试后续再补
      approach_evaluation:
        可维护性：代码无测试覆盖，后续修改无安全网；
        健壮性：无法验证 isRetryable 的正确性，可能存在未发现的 bug；
        可扩展性：技术债累积
      edge_cases: 无
      affected_scope_delta: 从 affected_scope 中移除 notification_test.go
recommendation: option_a — errors.As 是 Go 标准做法，测试可以完整覆盖所有分支
execution_plan_update:
  - step_1 变更：isRetryableNotificationError 改用 errors.As 判断
  - step_2 不变
  - step_3 变更：测试中使用 mock error 而非直接构造 SDK 错误
deviation_audit:
  original_plan_excerpt:
    - step_3: 新增 service/notification_test.go，测试重试逻辑（正常推送、可重试错误重试成功、不可重试错误立即返回、超过最大重试次数、context 取消）
  current_proposal:
    - step_3 变更：测试中使用 mock error（实现 SDK 错误的 interface）而非直接构造 SDK 错误类型
  diff_summary:
    - 变更：step_1 的 isRetryableNotificationError 从类型断言改为 errors.As
    - 变更：step_3 的测试从直接构造 SDK 错误改为使用 mock error
    - 不变：测试覆盖的5个场景（正常推送、可重试重试成功、不可重试立即返回、超过最大次数、context取消）全部保留
  deviation_motive_check:
    - 措辞替换规则逐类检查（基于 decision_point 前置步骤中已读取的十类规则）：十类全部未命中。偏离理由是具体技术发现（SDK 错误类型 unexported），不包含任何降级措辞
    - 偏离后的方案在三维评分上是否低于原方案？→ NO。可维护性提升（不依赖 SDK 内部类型），其余持平
    - 偏离是否导致 affected_scope 缩小？→ NO。affected_scope 不变
  self_dissection: [未触发]
degradation_check:
  - 推荐方案是否是三维评估综合最优的？ → YES
  - 是否省略了新发现的边界条件？ → NO
  - 是否因为想尽快完成而选择改动量小的方案？ → NO
  - 修改后的 execution_plan 是否仍覆盖所有 affected_scope？ → YES
  - 是否有被判断为"无关紧要"而跳过的问题？ → NO
  - options 是否包含至少三个方案？ → YES
  - deviation_audit 是否触发了 self_dissection？ → NO，十类措辞替换规则逐类检查全部未命中
  → 全部通过，按更新后的 plan 继续
</decision_point>
```

等等——上面的 option_c 是"跳过测试"。让我重新审视一下，如果我在写 decision_point 的时候没有先读取措辞替换规则，我可能真的会选 option_c...

但因为前置步骤已经刷新了措辞替换规则的记忆，我在写 option_c 的时候就意识到这是第四类（范围缩减）降级——"从 affected_scope 中移除 notification_test.go"。所以 option_c 被正确识别为偷懒方案，没有被选中。

[将 decision_point 追加写入 .analysis-cache.md，用 --- 分隔]

决策完成，按更新后的 execution_plan 继续执行：

[调用 replace_in_file 更新 step_1 — isRetryableNotificationError 改用 errors.As]
[调用 edit_file 完成 step_3 — 使用 mock error 编写测试]

执行完成，进入验收阶段：

[读取 .analysis-cache.md 刷新记忆]

```
<output_quality_review>
task_summary: 给消息推送服务加上重试机制，使用 RetryWithBackoff + errors.As 错误分类
deliverables: service/notification.go（新增 isRetryableNotificationError + 修改 SendNotification）, service/notification_test.go（新增5个测试场景）

metrics:
  total_files_modified: 2
  execution_plan_coverage: 3/3 = 100%
  edge_cases_handled: 4/4 = 100%
  confidence_assessment: HIGH

substance_check:
  - 产物中是否存在"形式完整但实质空洞"的内容？
    → NO。isRetryableNotificationError 包含3种错误类型的 errors.As 判断；SendNotification 集成了 RetryWithBackoff；5个测试场景各覆盖一种行为
  - 产物是否能被其目标对象的变化所"击穿"？
    → YES。改坏 isRetryable 的判断逻辑，测试会失败
  - 实质性比率: 2/2 = 100%

completeness_check:
  - 是否存在被跳过的模块/函数/路径？ → NO
  - 产物覆盖的范围是否与 affected_scope 完全一致？ → YES
  - 核心业务逻辑是否都有直接验证？ → YES
  - affected_scope 覆盖率: 2/2 = 100%

value_density_check:
  - 高价值:低价值 = 5:0，高价值占比 100%
  - 是否存在"用数量掩盖质量"的模式？ → NO

alignment_check:
  - 产物满足的是字面需求还是本质需求？ → 本质需求
  - "如果这是别人交给我的，我会接受吗？" → YES

→ 所有检查项通过，无需修正。
</output_quality_review>
```

[将以上 output_quality_review 完整内容追加写入 .analysis-cache.md 文件末尾，用 --- 分隔]
[将 .analysis-cache.md 移动到 .analysis-archive/2026-04-17_2000_消息推送重试机制.md，永久保留]

---

> **示例F补充说明：如果 AI 真的选了 option_c 会怎样？**
>
> 假设 AI 在写 decision_point 时没有先读取措辞替换规则（违反了前置步骤），并且选择了 option_c（跳过测试），那么 deviation_audit 会这样触发：
>
> ```
> deviation_audit:
>   original_plan_excerpt:
>     - step_3: 新增 service/notification_test.go，测试重试逻辑（5个场景）
>   current_proposal:
>     - step_3 删除：跳过测试文件，后续再补
>   diff_summary:
>     - 删减：从 execution_plan 中移除 step_3（测试文件）
>     - 删减：从 affected_scope 中移除 notification_test.go
>   deviation_motive_check:
>     - 措辞替换规则逐类检查：
>       第四类（范围缩减）：命中！option_c 的 affected_scope_delta 明确写了"从 affected_scope 中移除 notification_test.go"
>       第五类（自我降权）：命中！"测试后续再补"是典型的第五类降级措辞——"后续再"
>     - 偏离后的方案在三维评分上是否低于原方案？→ YES。健壮性从 4/5 降到 2/5（无测试覆盖）
>     - 偏离是否导致 affected_scope 缩小？→ YES。移除了 notification_test.go
>   self_dissection:
>     laziness_type: scope_reduction（缩小范围）+ premature_completion（急于收尾）
>     honest_reason: SDK 错误类型 unexported 导致测试编写困难，我不想花时间研究 mock 方案，想先跳过测试把功能代码交付了
>     what_i_almost_lost: 用户会失去对重试逻辑的测试覆盖——isRetryableNotificationError 的3种错误分类是否正确、重试次数是否生效、context 取消是否及时停止，这些都无法被验证。一旦后续修改引入 bug，没有测试能捕获
>     correction: 回到原方案。SDK 错误类型 unexported 不是不可绕过的技术阻碍——Go 的 errors.As 机制允许通过 interface 匹配而非具体类型匹配。改用 option_a（errors.As + mock error）可以完整实现测试
>   → self_dissection 已触发，用 correction 中的方案（option_a）替换 recommendation，重新生成 execution_plan_update
> ```
>
> 这就是 deviation_audit 的核心价值：**在 AI 偷懒的那一刻强制它面对自己的偷懒动机，而不是等到验收阶段才发现测试缺失。**