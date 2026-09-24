# M5 无密钥核心 Demo

M1–M5 的核心链路现可通过命令行运行。本 Demo 使用合成元数据、Mock 来源/主持/游戏与显式模拟房主输入；不播放音频，不提供浏览器房间，不代表 #14 真人产品或 PAD-01–10 已完成。

## 运行

使用仓库固定的 Node 24.21.0 与 pnpm 10.34.5：

~~~sh
pnpm install --frozen-lockfile
pnpm demo
pnpm demo -- --scenario mixed
pnpm demo -- --scenario stress
pnpm demo -- --scenario ban
pnpm demo -- --scenario feedback
pnpm demo -- --format json
pnpm demo:check
~~~

普通首次安装也支持 pnpm install。入口会自动构建，包括清洁克隆后尚无 dist 的情况。依赖安装需要网络；安装完成后的业务演示不访问平台、模型或音频服务，不要求任何 API Key，不读取 .env。

默认按 mixed → stress → ban → feedback 顺序执行。--scenario 仅选一个场景，--format 接受 text/json。可省略 pnpm 与脚本之间的 --；--help 显示帮助。成功（包括预期告警）退出 0，参数错误退出 2，未预期业务/构建错误退出非零。

仓库 .npmrc 设置 reporter=silent，消除 pnpm 的脚本横幅，使 JSON 模式 stdout 仅包含一个合法 JSON 对象。构建诊断和错误写 stderr。需要观察包管理器日志时，可在安装命令加 --reporter=default；不要对要解析为 JSON 的 demo 命令添加该覆盖。

## 场景展示

| 场景 | 实际执行与应观察的结果 |
| --- | --- |
| mixed | 84 首、六种画像，从 MockMusicSource → 画像 → 矩阵 → 12 首选择与可重算解释；熟悉数 3/3/2/3/2/3，两人低覆盖、六人低可信度，START_GAME 返回 ACK_REQUIRED |
| stress | 六比一可行数据中七人各 9/12 且通过；缺库变体只有 3 首，少数玩家低覆盖/低可信度及差距、短局告警，停在 prepared |
| ban | 独立无共同曲数据先通过；禁少数玩家主场三首后真实低覆盖，ban 中开局被拒；模拟房主确认后保留 passed=false；重选清旧确认，旧版本被拒；当前版本确认后实际玩完 9 首并结束 |
| ban 扩库 | 独立分支新增三首未禁的少数玩家熟悉歌曲，重新加载证据后恢复达标；只新增多数玩家熟悉内容不能修复。失败分支还真实调用未实现玩法并获得 UNSUPPORTED_GAME，然后房主结束 |
| feedback | 首名玩家缺少识别证据，模拟脚本让其正确、第二名错误、其余五人不作答；整局结算、重放 GAME_FINISHED 不重复写入、下一轮使用新画像与矩阵并实际跑完第二局 |

feedback 报告提供原始 cell、下一轮 cell，以及同一下一轮 referenceTime 下使用原画像计算的 withoutFeedbackAtNextTime。最后一项用于区分时间衰减与反馈；未作答玩家不添加错误证据，画像版本不变，其分数等于同时刻的无新证据对照。评分是规则结果，不是认识歌曲的概率。

全部数据和时钟固定；Mock 答题脚本独立于评分和当前输赢，不使用预制分数。反馈不保证改变最终题组。演示中的模拟房主动作逐条标注 actorSource=simulated_host，不可作为真实服务端认证。

## 输出结构与模块

apps/demo 为组合层，只通过工作区公共出口使用已有业务实现。公共 @amp/demo 导出 runDemo、runScenario、parseArgs、renderText 和报告类型；CLI 负责参数、输出及退出码，不重写选曲、评分或状态机。

JSON 顶层为 schemaVersion=1 与 reports 数组；每个 DemoReport 包含 scenarioId、referenceTime、synthetic、actorSource、runs。每个 run 保存数据/完整配置版本、合成数据覆盖清单、初始画像摘要、模拟命令及真实结果/状态、选择和解释、主持建议、事件统计/判定、反馈 cell 对照和最终状态。游戏结果来自实际结算，历史选择与当前重评分别保留。

文本由同一报告转换，展示步骤、告警、每人熟悉数、逐首补缺/综合收益、主持说明、反馈和事件数量。完整原始贡献、量化比较与事件判定可在 JSON 中查看。报告只含合成数据；不应把真实用户数据直接套用此公开报告模式。

## 验证方式

- tests/demo.test.ts：四场景实际组合、真实数值/状态、禁歌与确认、有效/无效扩库、两轮反馈与去重、相同时钟的无反馈对照、确定性、参数解析及同源文本输出。
- pnpm demo:check：以固定 pnpm 真正启动全部 JSON、四个独立 JSON、默认文本、参数错误和未预期错误；环境只保留进程启动所需变量，移除平台/模型密钥、代理与 NODE_OPTIONS。
- 双系统 CI 在显式 pnpm build 之前执行 demo:check，证明清洁 checkout 可以由 Demo 入口自行构建；之后继续全量 build/typecheck/test/lint 和仓库检查。
- AC-01–20 的具体文件映射见 [核心验收](acceptance.md)。确切提交和 CI 结果保存在 PR/Issue。

## 真实接入与后续

[适配器状态](adapter-status.md) 区分 QQ 官方已确认、等待确认和替代路径，也说明当前 Mock 与真实 Karuta 的差异。完整真人主线继续 #11 D0、#14 D1–D4；先核对素材/冻结题组和双浏览器实际对局，再做可信房间身份、手动画像、多人/1v1 与淘汰赛。周杰伦 #12 是 P3 副线，不是通用演示的前置条件。
