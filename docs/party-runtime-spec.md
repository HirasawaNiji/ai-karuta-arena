# 派对运行、版本与游戏反馈 v1

依据 REQ-11–14；接口归属见[实现架构](implementation-architecture.md)，指标见[算法规格](algorithm-spec.md)。本文描述首期内存模拟流程，不代表已实现网络认证或正式 Karuta 协议。

本文的演员注入、模拟计分和单局事件约束属于 M4/M5。[初赛补充](preliminary-demo.md) PRE-04–08 规定服务器会话身份、全员准备、题组锁定后的随机出题、多人规则、真实 1v1 引擎和赛事；D 阶段需在本状态控制上增加这些条件，不以 Mock 的正确 +1 覆盖经典歌牌规则。

## 1. 状态唯一入口

`createPartyRuntime(dependencies, initialInput)` 返回 `dispatch(command, actor)` 和 `getSnapshot()`。来源、GameFactory、PartyHostAgent、固定时钟/ID 生成器通过依赖注入。只有 runtime 更新 PartyState；外部拿到深复制只读快照。首期逐条串行处理命令与事件，同一派对异步命令进行中返回 BUSY，不能并发读改同一状态。

| 状态字段 | 含义 |
| --- | --- |
| partyId、hostPlayerId、players、playerProfiles | 派对、房主、成员与当前画像 |
| currentGame、currentRound、difficulty、partyPreferences | 当前玩法、从 1 开始的派对轮次、预留上下文 |
| catalog、catalogVersion、candidateSongIds、requestedCount | 来源标准化后的目录、可供选择的候选库和目标局长 |
| currentPlaylist、selectionResult | 实际有序题组及最近选择记录；ban 后两者可以不同，需标注版本 |
| bannedSongIds、excludedHistorySongIds、banPhase | 本派对禁止歌曲、当前历史排除规则、`closed / open` |
| phase | `setup / selecting / prepared / starting / playing / settling / finished / ended / error` |
| hostState | `awaiting_host_choice / ready / ended`；setup/error 等不可启动状态始终为 awaiting_host_choice |
| selectionVersion、evaluationContext | 单调递增版本及完整依据快照 |
| fairnessAssessment、hostAcknowledgement | 当前评估、可选的当前版本房主确认 |
| activeGameSession、gameHistory | 正在运行的冻结局输入、已结算游戏记录 |
| processedEventIds、pendingGameplayEvidence | 当前事件去重和待结算证据 |

初始 selectionVersion=0、题组空、assessment=null、phase=setup、banPhase=closed。主流程为加载 → 选择 → prepared → starting → playing → settling → finished → 下一轮选择。ended 为终态。

## 2. 评估上下文与版本

evaluationContext 保存：成员 ID 集合与房主 ID、每人 profileVersion、catalogVersion、候选集合、最终题组顺序、请求数量、gameType、roundNumber、ban 集合、历史排除集合、referenceTime、矩阵版本、评分/选曲/公平配置的完整内容与版本，以及已实际用于计算的偏好。

集合按代码单元顺序规范化；题组顺序保留。首期使用规范化结构内容比较和 runtime 整数计数，不引入加密签名或分布式版本。任何以上输入变化都 `selectionVersion += 1`，清空 assessment 与 acknowledgement，禁止开局，再重新计算必要的矩阵/评估。配置名称相同但内容改变也会失效。

用户显式 REGENERATE 即便选出同一列表，也属于新评估尝试，递增版本。纯 getSnapshot、展示主持说明、重复相同数据刷新不递增。任何旧异步结果必须带提交时版本，版本已变则丢弃并返回 STALE_VERSION。

每次重评保存新 assessment.selectionVersion。选择完成过程在串行命令内提交，最终题组和对应评估必须原子可见。若来源、选曲或评估失败，保留最后一次历史快照用于诊断，但清空可用评估并禁止开局；不能退回旧 ready 状态。

## 3. 命令与权限

actor 是 `{role: host | player | system, playerId?}`；Mock 中由 demo 注入并标注模拟。runtime 验证 host 的 playerId 等于 hostPlayerId。真实服务端以后从认证会话产生 actor，不能直接信任浏览器字段。AI 主持是建议来源，不是 host actor。

所有外部写命令携带 commandId 和 expectedVersion；仅 INITIALIZE 使用初始版本 0。先校验操作者身份，再以 partyId + commandId 查重：相同操作者与完整命令内容（包括 expectedVersion）重送返回已记录结果，不重复副作用，即使当前版本已经前进；同 ID 的操作者或内容不同则拒绝，不泄露原结果。仅未处理的新命令再验证期望版本及当前权限/状态。表中的“幂等”在上述查重后适用；新的确认或变更命令不得用旧版本。内部游戏事件使用会话版本，按事件规则单独校验。

| 命令 | 允许来源 / 前置条件 | 结果与失败行为 |
| --- | --- | --- |
| INITIALIZE | system，setup | 加载来源/目录、构建画像与矩阵；失败返回 SOURCE_FAILED/INVALID_INPUT |
| GENERATE / REGENERATE | host 或受控 system，setup/prepared/finished，ban closed | 保留 bans，更新版本，逐首选曲并独立评估，进入 prepared；告警则等待房主 |
| BEGIN_BAN | host，prepared，ban closed | ban open，清空确认与可用评估，版本递增，禁止启动 |
| BAN_SONG | 当前成员或 host，ban open | 歌曲须属于当前题组或候选；加入 bans，从题组移除，版本递增；不补曲。重复已 ban ID 为幂等成功 |
| FINISH_BAN | host，ban open | ban closed，对实际题组生成当前评估，更新 hostState；空题组仍不可继续 |
| REPLACE_SONG | host，prepared，ban closed | 新歌须在可用候选且未 ban/未重复；校验后换曲、更新版本并重评，绝不修改旧步骤解释 |
| UPDATE_MEMBERS | host，未启动，ban closed | 不允许移除房主；新成员先加载画像，再原子更新成员、矩阵与评估；失败不部分提交 |
| UPDATE_CATALOG / UPDATE_CONFIG / REFRESH_PROFILES | host/system，未启动，ban closed | 校验后更新上下文并重评；当前歌曲失效则移除并报告数量，不自动换曲 |
| CHANGE_GAME | host，未启动，ban closed | 保存明确玩法选择并更新版本/重评；缺少 GameFactory 实现则保持不可启动并返回 UNSUPPORTED_GAME，不冒充新玩法 |
| ACKNOWLEDGE_CONTINUE | host，prepared，ban closed，提交 expectedVersion | 当前有效非空评估有告警时保存确认及已展示 reasons；允许 ready，告警和 passed=false 保留 |
| START_GAME | host 或受控 system，prepared | 必须调用统一 canStart；先 starting，再创建实例/订阅/start，成功后 playing，失败 error 且清确认 |
| START_NEXT_ROUND | host 或受控 system，finished | 提升轮次、加入历史排除、应用反馈、重新选曲评估；只有 canStart 通过才启动，否则停在 prepared |
| REGENERATE_FROM_ERROR | host，error，活动实例已停止 | 清理未结算事件、保留已结算历史和 bans，转 setup 后按新版本重新生成；stop 未确认成功则拒绝恢复 |
| END_PARTY | host；或 system 执行已由房主选择的结束 | stop 活动游戏并进入 ended；记录停止失败，不再接受开局命令 |

“未启动”仅为 setup/prepared/finished；selecting/starting/playing/settling 中拒绝成员、题组、配置、ban 和玩法变更，避免运行局依据变化。首期不做中途加入和在线换配置。若未来需要，须新增规则与测试。

初次生成只计算并准备，不自动开始。START_NEXT_ROUND 内部可执行选择和启动，但仍经过相同 guard；没有当前确认时不能因上一轮已确认而继续。

## 4. 房主告警处理

告警时提供四类选择，不能预选后自动提交：

1. 扩库重选：显式 UPDATE_CATALOG + REGENERATE，保留本派对 bans；新增内容不保证修复，展示新评估。
2. 调整玩法：Mock 主持可提出建议；首期只有 mock-karuta 可执行。改变玩法会失效旧确认，未实现玩法不能开始。
3. 结束：END_PARTY。
4. 知情继续：ACKNOWLEDGE_CONTINUE 带 expectedVersion；保存 actor、版本、固定时钟时间、确认动作和当前原因快照。

确认不能改变 requestedCount 以隐藏短局；报告同时展示请求 N 和实际 M。非空缩短题组允许确认继续。无玩家、空题组、无效数据、未知玩法和游戏规则不合法不能通过确认豁免。已通过评估不需要确认；重复同版本确认幂等。

首期 ban 对当前派对后续重选和轮次持续有效，不提供自动清除或 UNBAN；新建派对可使用新 bans 集合。历史排除默认含此前已实际 SONG_STARTED 的歌曲，下一轮启用；如需关闭历史排除，须房主显式更新 partyPreferences 并重评。

## 5. 唯一开局检查

`canStart(snapshot, gameFactoryCapabilities)` 返回 `{allowed, blockers, acknowledgedWarnings}`，同时验证：

- phase=prepared，派对未 ended/error，banPhase=closed，无其他活动游戏。
- 玩家非空、题组非空、歌曲/玩家唯一且可用、题组没有 ban 或被规则排除的历史歌曲，游戏适配器支持当前玩法。
- 评估存在、基础 validity=true，assessment 的版本/矩阵/上下文与当前完整状态匹配。
- assessment.passed=true，或有当前版本、正确房主、明确 continue 动作的有效确认。

phase、有效性、版本和 ban 是硬条件。HostDecision、ready 字段或文案不能代替检查。任何 START_GAME/START_NEXT_ROUND 路径都调用同一 guard。getSnapshot 里的 ready 是显示结果，不是授权令牌。

初赛真人模式在同一个 guard 中追加：本场参赛者全部在线/ready、素材预加载完成、question/recording/card 映射有效、引擎支持本场模式、对阵前置结果已满足（如为赛事）。题目或其素材/规则变化同样失效旧评估与确认；一个 Match 冻结一份 GameSession 输入，局中不根据领先情况换题。

启动前先进入 starting 防重复调用。activeGameSession 保存通过检查的版本和输入副本；GameFactory/create/start 失败进入 error，清空确认和可开局评估。首期恢复方式是房主显式重新准备本局（REGENERATE_FROM_ERROR，仅在已 stop 且无活动实例后转 setup 再生成），不能自动重放可能已产生的游戏事件。

## 6. 主持动作支持表

| HostAction | v1 行为 |
| --- | --- |
| GENERATE_PLAYLIST / REGENERATE_PLAYLIST | 建议对应命令；由 demo/runtime 受控编排执行 |
| REQUEST_HOST_CHOICE | 返回真实告警及四类选择，不生成房主选择 |
| START_GAME / START_NEXT_ROUND | 建议开始；执行前调用 canStart/下一轮完整流程 |
| SHOW_RESULT | 展示来自游戏结果与当前结构化报告的内容 |
| END_PARTY | 建议结束；需已有房主结束意图或场景显式输入 |
| START_WARMUP / CHANGE_DIFFICULTY | 返回 UNSUPPORTED_ACTION；预留字段不构成功能实现 |

不在白名单中的动作直接拒绝。MockPartyHostAgent 无副作用；只把当前结构化原因组织为文案，不承诺胜率相同、不归咎少数玩家、不编造未使用的情绪/疲劳影响。`HostDecision {action, reason, message}` 可附结构化 reasonCodes，纯文本不作为状态依据。

## 7. 游戏事件与结算

GameEvent 使用 type 判别联合，共同 envelope：eventId、partyId、gameSessionId、selectionVersion、sequence（从 1 连续递增）、occurredAt。事件 payload 引用本局冻结的 ID。

| 事件 | 必要 payload / 顺序 |
| --- | --- |
| GAME_STARTED | gameType；每会话一次 |
| ROUND_STARTED | roundId；GAME_STARTED 后开启一次游戏内回合 |
| SONG_STARTED | roundId、songId；仅冻结题组中的歌 |
| PLAYER_ACTION | roundId、songId、playerId、actionId、actionType；不直接当正误 |
| ANSWER_CORRECT / ANSWER_WRONG | 上述 ID、actionId、judgementId；由游戏适配器判定 |
| ROUND_FINISHED | roundId；关闭已开启回合 |
| GAME_FINISHED | result；所有回合关闭后，只能一次 |

首期 Mock 每首歌对应一个游戏内回合；PartyState.currentRound 表示一整组歌曲的派对轮次，两者不得混用。每玩家每歌只脚本化一次有效答题；抢牌输赢、未作答不自动产生 ANSWER_WRONG。正确事件必须表示确实识别正确，而非只是先按下。

接收时先按 eventId 查重：相同内容重送幂等忽略，不受当前 phase 变化影响；相同 ID 内容不同则 EVENT_CONFLICT。新事件必须 session/版本匹配、sequence 正好为上次+1、玩家/歌曲属于冻结局、时间不倒退、事件顺序合法，否则 EVENT_INVALID 并停止当前游戏进入 error，不能部分增加分数或证据。首期不实现乱序缓冲/重连，未来网络适配器负责提供有序流或扩展协议。

onEvent 仅向 runtime 的内存事件队列追加事件，不在回调中重入 dispatch。适配器 start 负责启动并立即完成其 Promise，不能等待整局或等待事件被消费；runtime 在启动操作完成后按入队顺序消费事件。Mock 的独立脚本提供推进方法，由场景编排驱动；每次推进后等待 runtime 排空事件队列再读取状态。外部命令的 BUSY 规则不丢弃内部合法事件，避免同步发事件导致死锁或被错误拒绝。

ANSWER 先记录规范证据到 pendingGameplayEvidence。GAME_FINISHED 进入 settling，核对最终结果与已接收判定的一致性，原子归并证据、递增受影响玩家 profileVersion、记录 history 和已播放歌曲、清空旧确认及评估、提升 selectionVersion，然后进入 finished。不在 playing 中改变当前矩阵或题组。START_NEXT_ROUND 使用已结算画像，不再次合并同一批证据；下一次计算使用场景显式提供的新 referenceTime，必须不早于已处理事件的时间。

Mock 正确 +1、错误/未作答 0，说明只是适配测试规则，非现有 Karuta 规则。getResult 的结果包含会话/玩家、逐题已判动作和总分；结果与事件不一致拒绝结算。重复 GAME_FINISHED 不再次加分/更新画像。END_PARTY 中途结束不提交 pending 证据；记录 aborted，避免半局结算口径不明。

可玩初赛每个判定增加 questionId/recordingId/segmentKind 及对应 MatchId，避免把某个片段识别泛化到整首所有版本。多人依 PRE-04 按抢到牌数排名；1v1 依已核实的引擎规则提供 MatchResult，赛事组织器只消费结果一次并推进对阵。普通派对反馈用于下一局，赛事反馈写回个人记录但不改变该赛事冻结的选曲画像。

## 8. 固定场景执行与输出

M5 提供 `pnpm demo`（按固定顺序执行全部场景）、`pnpm demo -- --scenario mixed`、`pnpm demo -- --scenario ban`、`pnpm demo -- --scenario stress`、`pnpm demo -- --scenario feedback`，以及 `--format json`。默认 referenceTime 固定在 fixture 清单，非当前墙钟。参数错误非零退出。

| 场景 | 必须证明的实际调用 |
| --- | --- |
| mixed | 84 首、多元六人，从来源 → 画像 → 矩阵 → 12 首选择 → 真实分布/解释/评估 |
| stress | 六比一可行/缺库，正确通过或告警，不能只运行有利样例 |
| ban | 开始禁歌阻止启动 → 移除内容 → 结束重评 → 模拟房主确认 → canStart 允许 → 变更后旧确认拒绝；另分支扩库重选 |
| feedback | 独立脚本正误和无动作 → 完整结算 → 指定 cell 前后变化 → 下一轮使用新矩阵；不要求每次反馈都改变最终题组 |

ban 场景的确认输入必须显示 `actorSource: simulated_host`。生产接口未来不接受这个标记来代替认证。场景脚本可断言预期告警，但不能用固定文案/数值冒充计算结果。

报告对象 `DemoReport` 包含 schemaVersion、scenarioId、数据/配置版本、referenceTime、步骤、选择结果、评估、模拟命令、事件摘要、最终状态、前后 cell 对照。JSON 模式 stdout 只含合法 JSON，文本日志写 stderr；文本模式由同一报告转换。所有步骤符合预期时退出 0，预期的公平失败也是成功演示；未预期错误或断言失败退出非零。

## 9. 必测状态不变量

prepared+ready 仍不能绕过 guard；ban 中禁止开始；旧版本确认拒绝；成员/歌曲/玩法/画像/时间/配置变化逐项失效；无玩家/空题组不可确认；缩短局可明确确认；非房主拒绝；AI 不能确认；不支持动作/玩法拒绝；开始失败不留 ready；事件重复不重复结算；事件错误不污染画像；下一轮历史排除与 bans 保留；ended 永不再次开局。

测试直接检查结构化状态和返回结果，不能只断言文案出现“暂停”。详见[实施工作单](implementation-plan.md) M4/M5 与 AC-13–18。
