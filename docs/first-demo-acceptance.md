# 第一版 Demo 完成度审计

审计日期：2026-09-25，运行基线为 PR #56 合并后的 e3a8781。按 [初赛范围](preliminary-demo.md) 的 PRE-01–08 / PAD-01–10 核对，不以 Mock 或自动点击替代真人要求。手动入场、双人、多人和单淘汰的可玩流程已实现并有自动验证；**产品尚未完成**：选曲解释页面、观战交互与 UI 迭代仍由 #33 的指定前端特化模型处理，真人/真机体验另有未执行项。它们单独记录，不阻塞已获授权的独立工程工作。实时状态见 #14；队战语义 #30 保持 Idle，Agent 暂不处理，当前单淘汰实现不代表队战问题已确认。

| 条目 | 现有证据 | 结论与剩余项 |
| --- | --- | --- |
| PRE-01 / PAD-01：无 Key 手动画像，标签/歌曲独立输入，跳过保留未知 | ManualPreferenceSource、手动画像/大厅测试；[D1 浏览器](evidence/d1-browser.json) | 已实现并自动验证；QQ 官方导入仍非首版必需 |
| PRE-02 / PAD-03：歌曲/录音/片段/卡牌分离、可玩性过滤 | core 目录契约、reviewed-materials 测试；[素材人工确认](material-review-confirmation.md)与哈希清单 | 105 首启用；PJSK-184-A 继续待消歧，无母带/生成脚本不改写已确认事实 |
| PRE-03 / PAD-02：范围证据、手动 v2 与旧 v1 回归 | manual-profile、profile-contracts、music-profile 测试；D2/D3/D4 反馈版本证据 | 自动验证通过；自报、实测与未答保持区分 |
| PRE-04 / PAD-04：在线/准备/公平门槛与旧版本失效 | duel/multiplayer-preparation/server、browser/lifecycle 测试；[静音回归](browser-regression.md) | 自动验证通过；音频确认针对实际共享音箱，成员/画像/规则变更必须重新准备 |
| PRE-04 / PAD-05：题组冻结、同种子重放、不重复 | [双人引擎测试](../tests/duel-engine.test.ts)的固定种子洗牌及两种局长、[多人引擎测试](../tests/multiplayer-engine.test.ts)的完整 12 题 | 题序从冻结题组生成；种子与未来答案不交给客户端。自动结果不证明互联网延迟公平 |
| PRE-04 / PAD-06：多人抢牌、错抢锁定、并列与身份 | multiplayer-engine/preparation/server 测试；[三客户端 12 题](evidence/d3-browser-validation.json) | 自动验证通过；服务端拥有身份与计分，共享音箱为现场模式 |
| PRE-05 / PAD-07：真实 10/15 张 1v1、BAN 后重评、独立手机 UI | duel-engine/preparation/server；[双浏览器两种局长](evidence/d2-browser-validation.json)；PR #56 的晚加入权限回归 | 规则与自动操作通过；UI 仍需 #33 迭代，双人观战按钮/比分尚待适配；真人听辨和手机触屏未执行 |
| PRE-06 / PAD-08：4 人淘汰与 8 人推进、冲突/平局/弃权 | tournament/preparation/server；[四浏览器三场](evidence/d4-browser-validation.json)；[浏览器测试](../tests/browser/party.spec.mjs)的四人/八人完整赛程 | 4 人真实素材自动闭环、8 人七场合成音浏览器回归已通过，后者已随 PR #43 合并并在基线 CI 继续通过；规格要求的 4 人真人半决赛/决赛仍待现场验收 |
| PRE-07 / PAD-09：赛前画像、曝光排除、短库/补库版本 | 赛事与素材补库回归、四端冻结/反馈版本、最新补库 UI 证据 | 自动验证通过，补库不替换旧录音，允许重复需明确决定 |
| PRE-08：包边界、可信服务与独立 Web | dependencies 测试、仓库 CI、无 Key CLI 进程检查 | 架构及可玩接入已实现；进程内房间无重启恢复，QQ/LLM/生产账号不属于已交付能力 |
| PRE-08：系统主持、选曲理由及诚实文案 | PR #54 的 [selectionExplanation 契约](d3-multiplayer.md#选曲解释-api前端交接)、控制器手算样例与 REST/SSE 三端一致回归 | **部分完成**：实际逐首贡献 API 已交付，页面未呈现；规则主持的页面入口与开场/告警/结果表达由 #33 收尾。CLI 主持及接口通过不等于页面完成 |
| PAD-10：真人完整游玩、可解释中断、诚实宿主标识 | D2/D3 播放失败中断、界面显示浏览器演示、[演示手册](demo-walkthrough.md) | **部分通过**：自动浏览器证据充分，真人听辨、真实前后台行为及 QQ WebView 真机未验收 |
| 现场入场分享 | [普通 HTTP 与复制权限验证](evidence/lan-sharing-browser.json) | HTTP 缺 API/权限拒绝可手动复制，正常权限写入实际房间码；360/390/430px 自动验证通过 |

## 前端模型可直接接手的未完成项

以下归入 [UI 迭代 #33](https://github.com/HirasawaNiji/ai-karuta-arena/issues/33)，当前 Agent 不领取或修改 UI。后端与规则有新缺陷时另建可复现任务，不以等待 UI 为由停止独立工程修复。

- 多人选曲解释：读取现有 selectionExplanation，校验非空与当前版本，区分提案/最终题组，重置或失效后清除旧内容。实际贡献可能为负，缺口改善不是熟悉歌数量，选择顺序不是播放顺序；整体公平仍以 assessment 为准。界面应将规则主持标为“系统主持”，不暗示 LLM 调用或保证胜率；手动双人选牌不冒称自动选曲。
- 双人观战：依据本场冻结身份区分两位选手和等待成员，只把真实选手列入本场比分。旁观者的抢牌、交牌、确认、中断及切后台中断均不应发起；房主重置释放等待后恢复下一局准备。PR #56 只证明服务端拒绝越权，未完成这些 UI 状态。赛事旁观与组织者调度分别处理。
- 产品适配：覆盖既有房间/偏好/准备/BAN/告警/对局/结果/赛事，独立设计 QQ 音乐场景，保留默认 10 对 10 与可选 15 对 15。验证 360/390/430px、桌面、长歌名、安全区、焦点、加载/错误/等待状态及复制降级；不复制 karuta-web 的界面。
- 交付证据：设计说明、关键页面前后对比、适用检查及静音真实浏览器流程；保留现有业务断言，分别记录已执行自动验证、真人听辨和 QQ 真机结果。只有接口数据或截图不能代替完整交互验收。

## 仍未执行的真人与真机体验

在方便的现场使用授权素材与共享音箱，按演示手册完成 1v1 与四人半决赛/决赛，记录设备、是否听清前奏、触屏抢牌/交牌、前后台切换及最终结果。发现异常时附实际步骤和可复现现象，再由 Agent 修复。自动验证继续保持浏览器静音，不用发声测试打扰用户其他音频工作。

QQ WebView 条件具备后记录宿主版本和真实设备行为；不能将桌面 390px 当成真机。官方登录、曲库及分享未接入，无 Key 手动 Demo 的功能验收与官方接入分开记录。周杰伦专场 #12 为可选 P3 副线，不阻塞本表。

[静音浏览器回归](browser-regression.md) 可在本机与 CI 重复验证真实界面/服务/规则联动，已增加画像保存/刷新/下调、准备失效、晚加入、真实页面关闭中断及重开结算。赛事 visibilitychange 用例为模拟事件，已复现并修复中断接口错误；不将它当作 QQ 真机后台证据。合成测试音不改变真实素材证据的边界。

## 可重复运行的工程检查

使用指定 Node/pnpm，执行 README 的 build、typecheck、test、lint、demo:check 及 Python 仓库检查；界面/流程变更还应运行 pnpm test:browser。本表为证据映射，不把阅读测试源码当作执行测试。

运行基线 [PR #56](https://github.com/HirasawaNiji/ai-karuta-arena/pull/56) 的 head 146d0a2 与合并 main e3a8781 内容一致：[核心 CI](https://github.com/HirasawaNiji/ai-karuta-arena/actions/runs/36084001243)在 Windows/Ubuntu 各 554/554，[静音浏览器 CI](https://github.com/HirasawaNiji/ai-karuta-arena/actions/runs/36084001246) 11/11；本机固定真实素材实例的双人/三人/四人赛事 3/3、52 次音频请求/解码/启动通过，脱敏交付见 #44。该实例不包含八人真实素材或真人听辨验收，CI 的八人流程使用合成音。

历史 D1/D2/D3/D4 文件保持其原提交及方法说明；后续修改应提供对应新提交的验证，不能把本表基线沿用为未来版本已通过。#39 的本机偶发建连问题仍未定位，#44 的工程交付与正式接受分开，#14 保持未完成。
