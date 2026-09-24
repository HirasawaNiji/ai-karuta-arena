# M4 派对运行与 Mock 游戏

本阶段实现 [Issue #4](https://github.com/HirasawaNiji/ai-karuta-arena/issues/4) 的 M4.1–M4.7，承接 [M2 画像](m2-profile-matrix.md) 与 [M3 选曲](m3-fair-selection.md)。实际验收依据见 [运行规格](party-runtime-spec.md) 和 [实施工作单](implementation-plan.md)。没有真实联网、浏览器房间或音频；M5 CLI 与 D0–D4 可玩产品仍待完成。

## 公共入口与所有权

- @amp/party-runtime 导出 createPartyRuntime、canStart、RuntimeDependencies、RuntimeController。只依赖 core/music-profile/playlist-engine，通过 core 端口注入来源、游戏和主持，不导入 adapters 或执行 I/O。
- @amp/adapters 新增 MockPartyHostAgent、MockGameFactory、MockKarutaGame、MockAnswer、MockGameOptions，继续只依赖 core。
- runtime 持有状态、原始来源历史、命令/事件去重表、活动实例和事件队列。快照深复制并递归冻结。来源完整历史用于撤销与重新归并；getDiagnostics() 保留不支持的 window 计数诊断。
- 矩阵先针对完整目录/证据验证，再投影至候选子集；不因候选缩小而丢失历史证据引用。

## 调用顺序

创建 runtime 时注入 sources / gameFactory / hostAgent / now / nextId，输入通过 PartySetupInputSchema 校验。时钟须为合法 UTC、不可早于已处理事件，游戏会话 ID 须唯一。

1. 明确允许的内部编排以 system 提交 INITIALIZE；加载来源、建立画像与矩阵。
2. 房主 GENERATE 生成并评估题组，停在 prepared。初次生成不自动开始。
3. 可 BEGIN_BAN → 成员 BAN_SONG → 房主 FINISH_BAN。ban 期间评估与确认失效，移除不补曲，bans 跨重选和下一轮保留。
4. 有告警时房主选择扩库重选、换玩法、结束，或 ACKNOWLEDGE_CONTINUE。确认只绑定当前版本和告警，passed 仍为 false。空题组、无效数据和无适配器玩法不能豁免。
5. START_GAME 经统一 canStart；成功后调用 drainEvents() 消费已排队的 GAME_STARTED。
6. 使用 MockGameFactory.latest.advance() 推进一首歌曲，再 await drainEvents()。start 不等待整局；回调只入队，不重入命令。
7. 完成最后一首后，结果必须与所有已接收判定、播放记录及适配器 getResult 一致。随后原子写回画像、历史、版本，清空旧矩阵和确认，进入 finished。
8. START_NEXT_ROUND 使用显式 referenceTime、新画像和历史排除重选，再经过同一 guard。告警返回 ACK_REQUIRED 并留在 prepared，需本轮房主确认。

每条命令携带 partyId、commandId、expectedVersion。身份检查在命令缓存之前；相同身份与完整命令重放返回原结果，即使版本已前进；同 ID 更换身份或载荷返回 COMMAND_CONFLICT。异步写入或事件消费期间其他写入返回 BUSY。调用方在每次 advance 后排空事件再观察或发后续命令。

allowSystem 默认关闭，只能由可信进程组合层显式开启。system 结束还需要 hasHostEndIntent 提供既有房主意图；这不是浏览器认证。房主 actor 仍属于 Mock 注入，真实服务端应从已认证会话生成。

## 失败和报告边界

- 成员、目录、完整配置内容、画像、时间、数量、偏好、玩法和题组变化均失效旧确认；相同数据刷新不递增，显式重选总是递增。
- 来源加载与画像计算先验证后提交；失败不部分替换成员，也不保留旧 ready。恢复准备仍需显式命令。
- 不支持的玩法保存为当前明确选择并返回 UNSUPPORTED_GAME。主持只提供建议与实际 reasonCodes；不支持动作返回 UNSUPPORTED_ACTION，不能制造房主确认。
- 事件严格校验连续序号、时间、冻结会话、回合/歌曲/动作/判定关系。相同 eventId/内容重放无副作用，改内容为 EVENT_CONFLICT。非法事件停止游戏并进入 error，不将待结算证据写入画像。
- REGENERATE_FROM_ERROR 只在实例已停止时允许。停止失败保持不可恢复状态，可 END_PARTY 结束并报告 STOP_FAILED；ended 为终态，迟到事件不能复活派对。
- 正常中途结束记录 aborted 结果，但不提交半局证据。Mock 正确 +1，错误/未作答 0；不是经典 Karuta 计分规则。
- selectionResult 是生成时的历史记录；ban/替换后看 currentPlaylist 和当前 fairnessAssessment，不修改旧步骤解释。
- 命令、事件与来源历史均在内存中保留，未实现持久化、重连、队列上限或网络会话授权。

## 验证

新增 tests/party-runtime.test.ts、party-events.test.ts、party-updates.test.ts，共 81 项运行时/集成测试，并增加运行时包依赖约束测试。保留全部 333 项既有测试。

验证覆盖权限/幂等/BUSY、逐项上下文失效、告警与硬错误、禁歌/替换/候选变化、完整结果核对、错误序列/重放、创建/启动/停止失败、错误恢复、结束、下一轮和原子反馈。真实多元场景仍会告警；六比一脚本中答错后的下一轮也可能新增告警，测试明确要求重新确认，不降低门槛。

固定 Node 24.21.0 / pnpm 10.34.5；运行冻结安装、build、typecheck、全量 test、ESLint/Prettier、Python 仓库文本检查、本地 Markdown 链接及 diff 检查。确切提交和 Windows/Linux CI 结果记录于关联 PR 和 Issue Checkpoint。

## 下一步

从本公开接口组合 M5 的 mixed/stress/ban/feedback 固定场景和文本/JSON 报告，显式标注 simulated_host。无需重写计算或游戏脚本。M5 验收通过后仍需 #11 的真实引擎与素材核验，以及 #14 的 D1–D4 房间、玩法和赛事体验；#12 周杰伦专场保持 P3 副线。
