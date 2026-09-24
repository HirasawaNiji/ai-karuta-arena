# 第一版 Demo 完成度审计

审计日期：2026-09-25。按 [初赛范围](preliminary-demo.md) 的 PRE-01–08 / PAD-01–10 核对，不以 Mock 或自动点击替代真人要求。当前浏览器实现已齐；真人/真机体验仍有未执行项，**按用户最新要求，它们单独记录，不再阻塞自主开发、测试与工程验收**。实时状态见 #14。队战语义 #30 保持 Idle，Agent 暂不处理；当前已交付的赛事为单淘汰赛。

| 条目 | 现有证据 | 结论与剩余项 |
| --- | --- | --- |
| PRE-01 / PAD-01：无 Key 手动画像，标签/歌曲独立输入，跳过保留未知 | ManualPreferenceSource、手动画像/大厅测试；[D1 浏览器](evidence/d1-browser.json) | 已实现并自动验证；QQ 官方导入仍非首版必需 |
| PRE-02 / PAD-03：歌曲/录音/片段/卡牌分离、可玩性过滤 | core 目录契约、reviewed-materials 测试；[素材人工确认](material-review-confirmation.md)与哈希清单 | 105 首启用；PJSK-184-A 继续待消歧，无母带/生成脚本不改写已确认事实 |
| PRE-03 / PAD-02：范围证据、手动 v2 与旧 v1 回归 | manual-profile、profile-contracts、music-profile 测试；D2/D3/D4 反馈版本证据 | 自动验证通过；自报、实测与未答保持区分 |
| PRE-04 / PAD-04–06：在线/准备/公平门槛、冻结题组、多人抢牌 | multiplayer-engine/preparation/server 测试；[三客户端 12 题](evidence/d3-browser-validation.json) | 自动验证完成；服务端拥有身份、计分和题序，共享音箱为现场模式 |
| PRE-05 / PAD-07：真实 10/15 张 1v1、BAN 后重评、独立手机 UI | duel-engine/preparation/server；[双浏览器两种局长](evidence/d2-browser-validation.json) | 真实素材与自动操作完成；真人听辨和手机触屏仍未执行 |
| PRE-06 / PAD-08：4 人淘汰与 8 人推进、冲突/平局/弃权 | tournament/preparation/server；[四浏览器三场](evidence/d4-browser-validation.json) | 4 浏览器自动闭环、8 人七场引擎回归通过；规格要求的 4 人真人半决赛/决赛仍待现场验收 |
| PRE-07 / PAD-09：赛前画像、曝光排除、短库/补库版本 | 赛事与素材补库回归、四端冻结/反馈版本、最新补库 UI 证据 | 自动验证通过，补库不替换旧录音，允许重复需明确决定 |
| PRE-08：包边界、可信服务与独立 Web | dependencies 测试、仓库 CI、无 Key CLI 进程检查 | 已实现；进程内房间无重启恢复，QQ/LLM/生产账号不属于已交付能力 |
| PAD-10：真人完整游玩、可解释中断、诚实宿主标识 | D2/D3 播放失败中断、界面显示浏览器演示、[演示手册](demo-walkthrough.md) | **部分通过**：自动浏览器证据充分，真人听辨、真实前后台行为及 QQ WebView 真机未验收 |
| 现场入场分享 | [普通 HTTP 与复制权限验证](evidence/lan-sharing-browser.json) | HTTP 缺 API/权限拒绝可手动复制，正常权限写入实际房间码；360/390/430px 自动验证通过 |

## 仍未执行的真人与真机体验

在方便的现场使用授权素材与共享音箱，按演示手册完成 1v1 与四人半决赛/决赛，记录设备、是否听清前奏、触屏抢牌/交牌、前后台切换及最终结果。发现异常时附实际步骤和可复现现象，再由 Agent 修复。自动验证继续保持浏览器静音，不用发声测试打扰用户其他音频工作。

QQ WebView 条件具备后记录宿主版本和真实设备行为；不能将桌面 390px 当成真机。官方登录、曲库及分享未接入，无 Key 手动 Demo 的功能验收与官方接入分开记录。周杰伦专场 #12 为可选 P3 副线，不阻塞本表。

[静音浏览器回归](browser-regression.md) 可在本机与 CI 重复验证真实界面/服务/规则联动，已增加画像保存/刷新/下调、准备失效、晚加入、真实页面关闭中断及重开结算。赛事 visibilitychange 用例为模拟事件，已复现并修复中断接口错误；不将它当作 QQ 真机后台证据。合成测试音不改变真实素材证据的边界。

## 可重复运行的工程检查

使用指定 Node/pnpm，执行 README 的 build、typecheck、test、lint、demo:check 及 Python 仓库检查。D4 已合并提交 776608c 的 PR #29 CI 在 Windows/Ubuntu 均 519/519 通过。后续提交以对应 PR CI 为准；本表不把旧提交检查当成新修改的验证。
