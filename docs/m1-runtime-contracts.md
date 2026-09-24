# M1 完整公共契约与验收

范围：补齐 M1.5 的选曲、评估、派对、游戏和接口，沿用已有双系统 CI 完成 M1.6。前序基础见 [M1.1–M1.3](m1-foundation.md) 与 [M1.4](m1-evidence-contracts.md)。实时验收记录在 [Issue #4](https://github.com/HirasawaNiji/ai-karuta-arena/issues/4) 和本阶段 PR。

## 交付与模块边界

| 模块 | 实际内容 |
| --- | --- |
| selection | 候选/可用性/矩阵一致的请求；独立评估输入；实际长度、四项指标、原因、版本；连续的逐首步骤和结果 |
| party | 初始化输入、操作者、17 类带 commandId/expectedVersion 的命令；评估上下文、房主确认、完整只读快照、开局检查返回类型 |
| game | 冻结会话、8 类标准事件、单事件上下文、判定/结果/未结束状态、游戏实例与工厂接口 |
| ports/result | 来源、主持建议、派对运行接口；结构化成功/错误联合，公共错误码及受限诊断字段 |

core 只提供契约和边界校验。没有来源实现、画像计算、选曲器、派对状态机、canStart 或游戏适配器实现；未建立空业务包，也没有 pnpm demo。

## 数据布局

SelectionRequest 的 `profileContext` 复用 M1.4 的已校验 catalog/profiles/matrix/referenceTime/scoringConfig；`candidateSongIds` 指向目录里的完整歌曲。矩阵列与候选和 availability 的键必须一致。不可用候选在请求中保留原因，M3 负责过滤；ban/历史 ID 可以保留已不在当前目录的歌曲，避免刷新目录后自动遗忘禁歌。

AssessmentInput 独立于选曲步骤。FairnessAssessment 记录玩家和最终有序歌曲、请求/实际长度、配置与版本、四项指标和原因；空数据的比例为 null。边界验证长度、指标分母、空数据/短局原因、原因引用与显示值、passed 与告警的关系。**它不重新计算矩阵阈值或证明公平结论**，M3 必须从实际矩阵独立生成评估。

SelectionResult 保存真实选曲步骤的输入版本和配置。边界检查步骤从空覆盖/零目标值连续开始、一次只能增加一首熟悉歌曲、最终目标摘要一致。公式、补缺优先、量化决胜和安全整数乘积由 M3 实现及验证。

PartyConfig 把 scoring/selection/fairness 三份配置集中为不可变快照。EvaluationContext 保存版本、房主/成员/完整画像、目录与矩阵版本、候选/实际题组、数量、玩法/轮次、ban/历史、可用性、时间、完整配置及实际派对偏好。集合用代码单元排序，实际出题组顺序保留。相同版本名下更改配置内容同样使旧上下文失效。

## 命令、确认与状态

- actor 与 command 分开。host/player 必须带 PlayerId，system 不携带用户身份；命令不能塞入 actor 或“已通过”的开局令牌。类型校验不证明权限，M4 验证真实操作者与当前状态，D1 再提供可信服务器会话身份。
- INITIALIZE 的 expectedVersion 为 0；其他命令携带非负当前版本。GENERATE/REGENERATE/START_NEXT_ROUND/恢复/刷新及输入更新显式携带 referenceTime。UPDATE_CONFIG 提供完整配置、请求数量和历史偏好；UPDATE_CATALOG 提供完整目录、候选及可用性。不支持 UNBAN。
- PartyState 的 matrix 可以在初始加载前或结算后为 null。存在矩阵时必须与当前成员、候选、画像版本、参考时间和评分配置一致。
- hostState=ready 只用于 prepared 且 ban closed、当前有效评估通过或已获当前房主确认、无活动局的快照。进入 starting 后取消显示 readiness；它始终不能代替 M4 的统一 canStart。
- 知情继续保存当前版本、正确房主、确认时间及原告警，不能把 passed=false 改为 true。ban open、error、ended、finished 等不可直接开局的状态清除可用评估与确认。
- 旧 selectionResult 可以作为历史保留，ban 后不得篡改旧步骤伪造“重新选择”。更新排除集时先清理当前题组并失效评估，历史结果另存。
- activeGameSession 属于当前派对、版本、成员、玩法、轮次与有序题组；starting/playing/settling 必须存在。error/ended 可保留停止失败的活动局用于诊断，但不能恢复开局权限。
- 待结算证据只能来自当前题组/成员且已记录 eventId 的 game_correct/game_wrong。同一游戏会话不得重复写历史，也不能同时是活动局和已结算历史。

以上检查是快照内部一致性，**不是可执行的命令授权、幂等缓存或状态迁移**。M4 仍需测试 BUSY、旧异步结果、同 commandId 内容冲突、统一开局检查、事件队列和原子反馈。

## Mock 与真实引擎

GameFactory 用完整 GameSessionInput 和 onEvent 创建实例。MusicGame.start/stop 返回 Promise<void>；getState 返回只读状态；getResult 明确区分 not_finished 和 finished。PartyRuntime 暴露 dispatch/getSnapshot/drainEvents，事件回调只入队，drainEvents 用于场景等待排空。

GameEventContext 校验单事件的派对/会话/版本/时间、冻结玩家/歌曲及结束结果归属；**跨事件连续 sequence、回合顺序、action/judgement 关联、重送冲突和与最终结果对账由 M4 实现**，本阶段没有事件流处理器。

Mock 结果才执行“正确 +1”、每人每歌最多一次、回合与歌曲一一对应及完成整组歌曲的规则；中途结束显式标 aborted，不用 GAME_FINISHED 伪装正常完成。游戏类型 ID 可扩展，类型通过不代表 GameFactory 支持该玩法。

[D0](karuta-engine-audit.md) 已明确经典 1v1 的 60 张候选、选牌/空牌、清空手牌获胜及协议缺口。本契约没有真实端点、winner/Match/Tournament 或题目片段事件映射。D2 需扩展具体判定和结果契约并实测，不能把当前 GameResult 的分数最大者当经典胜者。

## 验证与下一步

M1 验证：固定 Node 24.21.0/pnpm 10.34.5；冻结安装、build、typecheck、Vitest、类型感知 ESLint/Prettier、Python 文本检查和差异检查。已有 CI 在 Ubuntu/Windows 的清洁 checkout 执行同组命令，确切提交与结果见本阶段 PR。

本轮测试含正常 setup/prepared/ban/playing/finished 快照、短局确认、逐项陈旧上下文、假 readiness、跨局事件、重复结果、未结束/中止、解释链及接口只读/判别联合的编译反例。AC-01 与 AC-02 **契约部分**覆盖，不把它们当作 M2–M5 的运行验收。

全 M1 经检查、审核和合并后，#4 只勾选 M1；继续 M2 的 84 首合成元数据、六名多元玩家、MockMusicSource、证据归并、画像、评分与矩阵计算。真人产品仍由 #14 跟踪，周杰伦 #12 继续为 P3 副线。
