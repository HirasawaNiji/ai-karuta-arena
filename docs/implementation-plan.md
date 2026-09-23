# 首期实施工作单与交接约定

本工作单将 Issue #4 的 M1–M5 拆为可顺序执行的小步骤，不另建阶段 Issue。前提是[实现架构](implementation-architecture.md)、[算法规格](algorithm-spec.md)、[运行规格](party-runtime-spec.md)已接受。当前文档交付不代表下面任何一步已实现；实时完成状态只记录在 Issue #4 和对应 PR。

2026-09-24 初赛方向补充见[可玩 Demo 架构](preliminary-demo.md)。先做 D0 的现有引擎/素材核对，独立的 M1 配置可在等待外部资料时推进；M1.5 定稿前核对接口。M1–M5 仍是核心基础，之后按 D1 手动入场、D2 真实 1v1、D3 多人、D4 单淘汰推进；D5 循环赛为初赛后扩展。暂不接大模型，不以 M5 CLI 演示替代真人游玩验收。

## 1. 新开发者开始方式

1. 读取 AGENTS、project-state、Issue #4 最新 Checkpoint 和未合并 PR，确认当前分支和未提交修改。
2. 按实现架构第一节的顺序读规格；检查前一阶段是否已人工接受并合并。
3. 先检查初赛补充 D0 的引擎核对状态，再从下表最早未完成且依赖满足的步骤开始；独立配置可先行，外部接口不能猜测。已有阶段分支则恢复，不能另起重复实现。
4. 一个阶段可以拆成若干提交，原则上一个可独立验收 PR；若必须拆 PR，记录子范围和剩余步骤。所有 PR 使用 `Refs #4`，不得写 `Closes #4`，直到整个里程碑接受。
5. 实现时同时写对应行为测试；运行该阶段检查，更新文档和 PR 证据，等待人工接受后进入下一阶段。

不需要再次选择单仓库/多仓库或框架。不得以“先把 UI 跑起来”为由绕过评分、补缺、告警与确认流程。可以优化内部组织，但改变公开约定前必须更新对应设计与测试。

## 2. M1：工作区与公共契约

依赖：需求/架构文档接受。建议分支 `feat/4-m1-workspace-contracts`。交付重点是可验证的基础和统一模型，不生成未来模块的空实现。

| 顺序 | 文件/模块 | 工作内容 | 完成证据 |
| --- | --- | --- | --- |
| M1.1 | 根 package.json、pnpm-workspace.yaml、版本文件、lockfile | 固定 Node 24/pnpm 10 补丁，建立 ESM 工作区，仅先创建 core | 冻结安装成功，版本可核对 |
| M1.2 | tsconfig、Vitest、ESLint、Prettier | project references、严格类型、真实测试、包依赖限制、格式范围 | 构建、类型检查、测试、lint 成功，错误导入能被检查识别 |
| M1.3 | core/ids、taxonomy、song、player、question | 开放标签注册/层级校验，歌曲/艺人/八维偏好与 Recording/Question/Card 基础契约；不实现素材服务 | AC-01：新增标签无需改枚举、语言地区分离、无 IP、早于 1960 年代；曲目与片段可分开引用 |
| M1.4 | core/evidence、familiarity、config | 标准证据联合、评分解释、完整矩阵、配置验证 | 非法范围/时间/重复 ID 拒绝；未知与缺项不同 |
| M1.5 | core/selection、party、game、ports | 选曲/评估/状态/版本/命令/事件/来源/主持/游戏接口 | 类型与边界测试，不实现假业务返回值 |
| M1.6 | CI、README | 添加已存在命令、双系统策略、保持 Python 检查 | 清洁 checkout 的 M1 CI 通过；说明 demo 尚未提供 |

退出条件：core 契约可导入、无业务算法假实现，AC-01 和 AC-02 契约部分通过，build/typecheck/test/lint/Python/diff 检查通过。M1 不声称选曲或完整游戏可用。

## 3. M2：模拟来源、证据、画像与矩阵

依赖：M1 接受。建议分支 `feat/4-m2-profile-matrix`。新增 music-profile、adapters 的来源与 fixture 实现。

| 顺序 | 文件/模块 | 工作内容 | 完成证据 |
| --- | --- | --- | --- |
| M2.1 | adapters/fixtures、sources/mock | 84 首合成歌曲、开放 taxonomy、至少六个不同玩家的原始证据；manifest 统计覆盖；来源接口实现 | 数据 ID/引用/分布检查，明确合成；无音频与账号依赖 |
| M2.2 | normalize-evidence | 去重、最新快照、次数取最大、事件和时间校验、不支持字段诊断 | 重复导入幂等；相同 ID 冲突拒绝；不重复累加累计次数 |
| M2.3 | build-profile、defaults | 按算法规格生成八维连续偏好与 provenance | 新增正面证据不意外压低既有推断；无固定用户类别 |
| M2.4 | score-familiarity | 实现特征、时效、权重、限幅、识别反馈、逐歌可信度和解释 | AC-03/04；手算值、单调/饱和、未知、正误与未作答分别验证 |
| M2.5 | build-matrix、gameplay-evidence | 完整 ID 索引矩阵；标准 ANSWER 事件转证据的纯函数；保留可选 question/recording/segment 范围以供 D1 v2 使用 | 同输入稳定；不漏 cell；无动作不生成 game_wrong；标准化不丢失识别范围 |
| M2.6 | fixtures 压力变体、算法说明 | 六比一可行/缺库、直接小矩阵 fixture 与证据型 fixture 分开；补实例 | AC-02–06 数据/评分部分、AC-19 数据部分；不宣称选曲验收通过 |

退出条件：真实来源接口输入到矩阵的链路能在测试中执行，数值由公式计算。manifest 覆盖所有指定生态与语言，权重只在 defaults 定义，文档引用版本。运行所有已存在检查；不提前创建最终 demo 的固定打印模板。

## 4. M3：独立公平评估与逐首选曲

依赖：M2 接受。建议分支 `feat/4-m3-fair-selection`。先完成评估器，再实现选择器，避免选择器给自己的结果直接盖章。

| 顺序 | 文件/模块 | 工作内容 | 完成证据 |
| --- | --- | --- | --- |
| M3.1 | assess-playlist、defaults | K/C/F/L、量化边界、多原因、N/M 区分、无玩家/空题组 | AC-05/06/12/16；等号、ceil、低可信度恰好一半、数量短缺 |
| M3.2 | filter-candidates | availability、bans、明确历史、去重校验与排除计数 | 重选不恢复 bans；不存在重复歌曲或静默跳过缺矩阵项 |
| M3.3 | objective | 明确 F/D/C/E/Q 的纯计算及配置校验 | 单项手算、全未知元数据、单玩家、同质画像与全无交集 |
| M3.4 | select-playlist | 动态补缺优先、综合边际增益、稳定 ID 决胜、不放回 | AC-07/08；小矩阵第二首必须为 s3，乱序输入不改变结果 |
| M3.5 | explain-selection | 保存每步贡献、前后覆盖、补缺收益与最终评估 | 可从结构重算；禁用与实际输入无关的解释 |
| M3.6 | integration/selection | 多元、六比一、缺库、单一偏好、无交集、内容不足 | AC-05–12/16 的评估部分；报告失败不等于证明无解 |

退出条件：SelectionResult 可独立解释，assessment 可直接重用于修改后的题组。对失败数据正确告警同样属于通过测试，不能篡改输入或门槛只求全部“公平通过”。保留全部已有回归检查。

## 5. M4：状态、主持、游戏和反馈结算

依赖：M2/M3 接受。建议分支 `feat/4-m4-party-runtime`。状态测试先于主持文案润色。

| 顺序 | 文件/模块 | 工作内容 | 完成证据 |
| --- | --- | --- | --- |
| M4.1 | create-runtime、commands、version | 状态唯一写入口、只读副本、串行操作、完整上下文失效 | 外部改快照不影响状态；配置同版本不同内容也失效 |
| M4.2 | ban/replace/update 命令 | 禁歌中阻止开局、结束重评、保留 bans、变更原子提交 | AC-13/14，全部变更逐项测试；失败不保留旧 ready |
| M4.3 | start-guard、确认命令 | 房主权限、当前版本确认、硬错误不可豁免、短局继续 | AC-14–17；确认不清告警、不改 passed |
| M4.4 | mock-party-host | 白名单、结构化原因转文案、不支持动作明确拒绝 | AI 不能生成房主确认，启动建议不能绕过 guard |
| M4.5 | adapters/games/mock-karuta | 固定独立行为脚本、标准事件、结果、停止 | 通用游戏接口可用；事件/总分一致；明确为模拟规则 |
| M4.6 | consume-game-event | ID 去重、sequence/会话/版本/载荷校验、结算时反馈归并 | AC-18；重复不加分/不重复证据；非法事件不污染画像 |
| M4.7 | integration/runtime | 开始失败、显式恢复、结束、中途停止、下一轮新矩阵 | AC-13–18；playing 时禁止改配置；旧确认下一轮不可复用 |

退出条件：从合法准备到游戏结算的全部路径受同一 guard 控制，告警选择闭环用模拟 actor 真实执行。模拟成功不代表真实联网、身份认证或网络抢牌公平。

## 6. M5：可运行 Demo 与完整验收

依赖：M1–M4 接受。建议分支 `feat/4-m5-demo-acceptance`。

| 顺序 | 文件/模块 | 工作内容 | 完成证据 |
| --- | --- | --- | --- |
| M5.1 | apps/demo/run-scenario | 注入所有真实 Mock 实现，固定时间与 ID；根 demo 命令 | 无 Key、无业务网络也能运行，清洁安装无 dist 前置依赖 |
| M5.2 | scenarios/mixed、stress | 主多元演示与六比一正/负场景 | AC-19，数据→画像→矩阵→选择链路未跳过 |
| M5.3 | scenarios/ban、feedback | 禁歌后确认/失效/扩库分支；完整反馈到下一轮 | AC-13–18，模拟输入标记明确，前后 cell 可核对 |
| M5.4 | reporters、CLI 参数 | 同一结构化报告转文本/JSON；错误码 | JSON 可解析，正常/预期告警退出 0，非预期错误非零 |
| M5.5 | README、接入说明、.env.example | 运行、产品限制、QQ 三种状态、Karuta 待核实契约 | 未确认 API 不写可用；预留环境变量非必填；无许可证不引入外部素材 |
| M5.6 | CI、acceptance 执行证据 | Windows/Linux 清洁安装、全链检查及 AC-01–20 对照 | 记录命令/提交/平台/结果/未运行项；只在全部人工接受后关闭 #4 |

运行命令为 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm demo`、JSON 场景检查、`python scripts/check_repository.py`、`git diff --check`。`pnpm install` 也需可供正常首次使用；CI 使用冻结模式。

## 7. 测试文件与验收映射

| 测试归属（实施时创建） | 验收 | 必测要点 |
| --- | --- | --- |
| core/taxonomy.test.ts、schemas.test.ts | AC-01/02 | 开放分类、跨语言、合法边界、非法引用 |
| music-profile/evidence.test.ts、familiarity.test.ts、matrix.test.ts | AC-02–06 | 去重、次数/时效/识别、未知/可信度、量化比较 |
| playlist-engine/assessment.test.ts | AC-05/06/10/12/16 | 所有告警同时保留、分母、门槛与空输入 |
| playlist-engine/objective.test.ts、selection.test.ts | AC-07–11 | 动态补缺、四项目标/软比例、同分和同质场景 |
| party-runtime/commands.test.ts、start-guard.test.ts | AC-13–17 | actor、版本、禁歌、硬错误、旧确认与动作白名单 |
| adapters/mock-karuta.test.ts、party-runtime/events.test.ts | AC-18 | 事件序列、重复、判定与分数、结果一致性 |
| tests/integration/demo.test.ts | AC-01–20 集成回归 | 真正调用包、全场景、无 Key、结构化输出和退出码 |

不能只用字符串快照替代数值/状态断言。公式测试至少包含一个独立手算期望；状态测试对开始是否真的发生、证据是否真的改变做断言。文档阶段只跑文档检查，不填写上述业务通过记录。

## 8. 阶段 PR 与可恢复进度

PR 说明须包含：本阶段范围和步骤 ID、对用户可观察行为、规格变更（如有）、实际命令与结果、对应 AC、尚未实现的下一步。不要复制全部需求到 Issue。

Issue #4 始终追踪整个 Mock 里程碑。阶段 PR 待审时可在 Checkpoint 写“本阶段待审，后续未开始”；不能因为文档或单阶段完成就将整个 Issue 标为 Qualified/Ranked。文档补充/阶段工作暂停后，tracker 保持 Pending + resume，明确等待哪个 PR 接受；整个 M5 实现并检查完成才按生命周期进入 Qualified + review，全部接受后才 Ranked/关闭。

每次交接记录：已完成步骤、未完成步骤、分支/PR/精确提交、已执行检查、尚未执行检查、偏离规格及原因、下一条可执行工作。链接到规格而非重新口述另一套方案。若无法推送，写明本地提交与阻塞；若无业务变更则不声称已完成任何 M 阶段。

## 9. 哪些决定已收敛，哪些仍待外部证据

| 决定 | 首期执行方式 |
| --- | --- |
| 包数/运行方式/构建 | 按实现架构执行，不再另选微服务或构建平台 |
| 熟悉度/选曲公式、默认权重 | 按 algorithm-spec v1；可基于测试提出修订，但改动必须可审查且版本化 |
| ban/确认/事件/结算 | 按 party-runtime-spec v1；不得通过实现细节改变硬限制 |
| 工具补丁版本 | M1 锁定并记录；不需为常规兼容补丁再次做架构选型 |
| Mock 歌名与玩家名 | M2 可自由编写合成内容；覆盖要求和固定可复现场景不能降低 |
| Karuta、音频、房间与赛事 | 已纳入初赛 D0–D4，先核对契约和素材；循环赛为 D5 扩展 |
| 真实 QQ、LLM、账户、数据库 | QQ 不阻塞初赛；LLM 明确暂不接；完整账户/数据库均非初赛必要项 |
| 真实识别与公平阈值 | v1 不宣称验证；后续研究需实际数据和独立验证 |

架构文件使开发顺序和可观察行为一致，不要求不同开发者写出逐字相同的内部代码。若规格仍存在无法唯一判断的行为，在当前 PR 补一个小算例或状态测试并修订规格，避免把隐含决策只留在聊天中。

## M1 子范围交付

M1.1–M1.3 与该子范围 CI 的实现和检查见[基础验收](m1-foundation.md)。M1 拆为基础契约与完整业务契约两次可审查交付；M1.4–M1.5 尚未实现，M1.6 的完整检查需随后覆盖全部契约。Issue #4 第一项在完整 M1 接受前保持未勾选。D0 发现与用户素材授权见[引擎核对](karuta-engine-audit.md)，真实适配不可用 Mock 接口代替。
