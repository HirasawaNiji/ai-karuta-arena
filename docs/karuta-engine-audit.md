# D0：现有 Karuta 引擎核对

调查日期：2026-09-24。任务：[Issue #11](https://github.com/HirasawaNiji/ai-karuta-arena/issues/11)。本轮在工作区外的原引擎保持只读，提取其已跟踪源码到独立验证目录并复制一份已授权 PJSK 包用于本机审计。未修改原项目、部署服务或把引擎 UI/音频归入本项目源码。

## 核对基线与验证

仓库：[HITsz-JLA/karuta-web](https://github.com/HITsz-JLA/karuta-web)，本机提交 `780c1c0230589caf43c4835dc046ad7555c85f0a`。以下引用固定该提交，不宣称是远端最新版本。

- 引擎已有依赖环境，Node 24.12.0 / Windows：`node --test server/onlineRooms.test.mjs server/packageCatalog.test.mjs server/zipAsset.test.mjs server/onlineAudioSession.test.mjs`，46 项通过，0 失败。
- 本轮重新运行上述 46 项测试，全部通过；隔离副本的 `tsc -b` 和 `vite build` 通过。使用现有依赖的副本，未声称验证了全新依赖安装。
- 隔离服务只监听回环地址 `127.0.0.1:18877`，独立数据目录，`GET /api/health` 返回 HTTP 200、`ok: true`。
- README 启动方式为 `npm ci`、`npm run server`、另启 `npm run dev -- --host 0.0.0.0`。本轮通过构建后的静态页面和独立 Chrome 会话核验浏览器操作，详见下文。

## 实际协议与接入差异

| 核对项 | 现有实现证据 | 对本项目的要求 |
| --- | --- | --- |
| 参与人数 | [onlineProtocol.ts](https://github.com/HITsz-JLA/karuta-web/blob/780c1c0230589caf43c4835dc046ad7555c85f0a/src/lib/onlineProtocol.ts) 将玩家固定为 A/B | D2 仅复用两人制；D3 独立多人适配，不能声称已有 n 人引擎 |
| 单场输入 | `createRoom` 接收 nickname/name/packageId/deckName/cardKeys；[onlineRooms.mjs](https://github.com/HITsz-JLA/karuta-web/blob/780c1c0230589caf43c4835dc046ad7555c85f0a/server/onlineRooms.mjs) 需要至少 60 张候选牌 | 没有接受冻结 SongId/QuestionId 题组的通用 start API；12 首 Mock 题组不可直接提交 |
| 选牌与题组 | 双方选 30、交换、各禁 5、各 25 张实牌，另抽 20 首空牌；使用内部随机选择 | 最终歌曲在引擎选牌后才确定。需导出最终题目清单、重评及暂停开局挂钩；注入并记录随机种子，禁止引擎再加入未经评估的歌曲 |
| 规则与胜负 | 换牌、错抢惩罚、空牌，清空手牌的一方获胜；`matchOver` 给 winner/scores/rounds | 保留经典规则；不能以 scores 最大代替实际 winner，不能改成多人 +1 排名 |
| 卡牌和音源 | [packageCatalog.mjs](https://github.com/HITsz-JLA/karuta-web/blob/780c1c0230589caf43c4835dc046ad7555c85f0a/server/packageCatalog.mjs) 支持根 CSV 或 meta/metadata.csv，作品卡可有多个 songs，key 由编号/图片路径/作品名组成 | 外部 key 不等于 SongId；需逐项映射 song/recording/question/card。歌名卡必须唯一对应歌曲；作品卡可对应多首歌，仍须明确每题答案和录音范围 |
| 开始及音频 | ready、selectCards、banCards、matchAudioReady、audioReady，roundPrepare/roundStart；网络门槛与临时音频凭证 | 引擎网络公平与本项目熟悉覆盖是两套独立检查；都需通过。共享音箱模式不能仅通过伪造其余玩家 audioReady 实现 |
| 判定和结果 | claimFeedback、roundResult、matchOver；当前 claim 无 actionId，事件无统一 eventId/selectionVersion/sequence | 不能把现有消息直接当 core GameEvent。需引擎端或受信适配层补充稳定身份、会话、去重、顺序、版本；重连快照不可重复生成识别证据 |
| 中断 | peer/恢复会话，leave 会重置；matchOver 没有独立 completed/aborted 字段 | 对断线、离房和无胜者结果显式转换；中断不晋级，不从输赢生成正误证据 |

已完成的 M1.5 固定了 Mock 端口，真实适配仍需上述扩展；不得用虚构的真实引擎端点填接口。D0 不重构引擎；用户允许 D2 在本项目复用操作流程和后端逻辑代码，但明确不复制 karuta-web UI。QQ 音乐内的移动端产品独立设计，默认 10 对 10，可选 15 对 15，详见 [PRE-05](preliminary-demo.md#6-pre-051v1-与现有引擎)。

## 使用依据与素材空间

用户于 2026-09-24 明确说明自己是 karuta-web 管理员，允许本项目使用 karuta-web 的所有内容。记录为本次项目复用授权，可以继续设计与实现适配；仓库未找到 LICENSE，不把管理员声明写成新增开源许可证，也不替其他来源补造许可。

用户同时明确：比赛官方提供的新项目卡牌，其使用范围尚不清楚，先保留空间。现有内容的复用授权与未来官方资源是两条记录；后者继续待核验，不要求当前停下纯核心开发。`AudioAsset.usage` 保留 pending/verified、来源、依据和允许范围；图片资源与真实可玩清单在 D1 同样需留来源记录。

本轮已检查下述具体包的文件与媒体映射；这只确认技术可读性，尚不替代逐曲听辨、录音版本和前奏范围确认。未通过语义核验的记录保留为诊断，不直接作为正式可玩题目。周杰伦专场与全曲库目标见[艺人专场](artist-party.md)。

## 真实素材核验

使用 `scripts/audit_karuta_package.py` 只读检查现有 `jla-muca-pjsk-lite.zip`。完整逐项结果见[素材证据](evidence/d0-pjsk-materials.json)，未提交音频或封面文件。

- ZIP：322,756,985 字节；SHA-256：`f9037d3d3835938e820d582bd59d85c65d100f4f017f2c6a0f052c2221ad73b4`。
- CSV：106 条、106 个 sourceTrackId；音频均存在且经 ffprobe / ffmpeg 完整解码，时长 29,989–30,000 ms。
- 105 条具有可解码卡面，对应 105 个唯一 engineCardKey；与实际 HTTP catalog 逐项一致。
- `PJSK-184-A`（化けの花）声明 MISSING_COVER，缺封面，被明确列为 excluded。与 `PJSK-090-A` 同名不证明同录音，不按标题合并。这是原引擎图卡入口的排除条件；D1 的文字歌牌不强制封面，核实录音/题目身份后可另建文字卡，不能把缺封面永久等同于不可播放。
- CSV 指向 `mp3_files/PJSK/...`，实际是 `mp3_files/seg_30/PJSK/...`。报告记录实际成员、字节数、内容哈希，不能把 CSV 的原音源大小当片段大小。
- 106 条 artist 都缺失；manifest 仅声明 lite 模式，没有原录音版本、切片起点或前奏语义证明。文件名含 seg_30 不能证明是前奏。
- 报告统一标记 `semanticReview: pending`、`segmentKind: unverified`、`productionEligible: false`。sourceTrackId 与 engineCardKey 是来源标识，不直接冒充 core 的 SongId/RecordingId/QuestionId。

复跑命令（Python 3.12、ffprobe/ffmpeg 7.0.2；路径由执行者提供）：

```text
python scripts/audit_karuta_package.py <jla-muca-pjsk-lite.zip> --output <audit.json> --ffprobe <ffprobe> --ffmpeg <ffmpeg>
```

该工具面向本次 JLA metadata/seg_30 导出格式，不是用户上传接口或通用生产导入器。读取 ZIP 成员而不按成员路径解压；重名成员、音频路径歧义、错误映射会失败或排除；输出不能覆盖原 ZIP。身份和片段语义需要另行确认，工具不会自动授权或发布资源。

## 原引擎浏览器验证

两个独立 Chrome 会话使用同一隔离服务和真实 PJSK 音频。通过页面创建/加入房间、启用音频、双方准备、各选 30、互换、各 BAN 5、开局准备，再完成整场。服务端源码、真实 20 秒开场/5 秒提前准备/10 秒作答时序未改动。

[脱敏结果](evidence/d0-browser-match.json)记录：

- 双方各收到 38 次 roundPrepare、38 次 roundStart、38 次 roundResult，22 次正确 claimFeedback、17 次 cardTransfer、1 次 matchOver。
- 最终双方一致：winner=A、scores={A:22,B:0}、rounds=38；手牌 A=0、B=23。胜负来自清空手牌，不重新按比分推断。
- 双方媒体 play 均成功 77 次，未捕获播放异常；抽样 timeupdate 观察到 40/38 次进度（包含休息音频，不声称逐曲人工听辨）。实际回合资源 Range 请求返回 206、Content-Range bytes 0-1023/1248523，正文 1024 字节。
- B 结束后刷新，恢复 over / round 38 / winner A 的房间快照，没有重发 matchOver。适配层不能仅靠某个客户端收到一次结束事件才能恢复结果，也不能把快照当成新一场结算。
- 原引擎截图保存在本地审计输出中，不作为本项目新 UI。原目录已有未跟踪工作保持不动，隔离服务和两个审计会话在取证后关闭。

后半场用 Playwright CLI 点击实际页面控件，答案来自本地服务端当前回合日志，目的是覆盖抢牌与交牌路径；不是根据听觉识别，也没有改分数或缩短服务器计时。原始日志/浏览器私有状态可能包含临时凭据，仓库仅存白名单字段的结果摘要。没有验证 QQ WebView、移动端新布局、真人听辨或正式平台接入。

第 4 回合暴露交牌超时卡死，下文给出复现探针；主动交牌后继续并最终完成。由此可确认技术可完成一局，但不能把这次结果称为原引擎无缺陷或新产品验收通过。

## D2 必须处理的实际差异

1. 规则参数化：每方 10/15 张、选牌 12/18、BAN 2/3，候选下限 24/36；服务端和 UI 同源。移除固定 25、30、60、3×11 及默认 20 首空牌的产品假设。
2. 选牌/互换/BAN 后先导出真实歌曲和题目列表，独立重评并暂停等待；最终题组、准备与房主确认绑定版本。随机只发生于冻结题组内。
3. `pendingTransfer.to` 表示交牌者、`pendingTransfer.from` 表示收牌者；但完成后的 `cardTransfer.from/to` 又是正常方向。适配层明确转换为 giver/recipient，不能照字段字面解释。
4. 已实测正确抢取对手牌后，交牌超时未自动推进：第 4 回合在 11:13:43 UTC 进入 pendingTransfer，40 秒期限后仍停留，到主动交牌才继续。源码 `resolveRound` 设置 opponent_card 分支后没有安排 `scheduleTransferFallback`。D2 复用前必须补定时回退及回归；不要把该卡死复制进新产品。可复跑的 `scripts/probe-karuta-transfer.mjs <engine-root> <isolated-package-dir>` 在真实目录/手牌上用模拟时钟推进 40,001ms，得到 `pendingAfterDeadline: true`、`roundAdvanced: false`。探针成功表示复现了已知缺陷，不表示引擎健康；它不是浏览器验收。
5. 稳定事件 envelope 由可信服务端生成，包含 match/session/rules/selection version、eventId、sequence、questionId；actionId 去重。`claimFeedback` 本身无 roundNo，必须在可信引擎边界绑定回合，不能让客户端声明正误。
6. 正确 claim 与抢牌赢家分开；timeout 和无操作不生成错误识别；错抢才生成该玩家的错误证据。`roundResult` 和重连重放不能再次结算同一事件。
7. matchOver 的 winner 是清空手牌规则结果，不从 scores 最大值重算。中断/断线/离房单独映射 aborted，不推进赛事。
8. 使用独立 QQ 音乐移动端界面，复用逻辑和操作语义；宿主播放、后台暂停、返回和分享走能力适配，尚未接通的 QQ 能力显式降级。

## 剩余验收与下一步

D0 的技术清单和浏览器基线是后续实现依据，不能代替新产品或真人识曲验收。继续补少量代表曲目的录音版本、真实片段起点、歌名/文字牌和听辨确认，形成 D1/D2 可使用的 verified Question 清单；其余曲目保留 pending，不必先做周杰伦全曲库。

D1 可先实施独立界面、手动画像和受信房间会话；真实音频开局需要上面的 verified Question 和 D2 改造。官方新卡牌及 QQ 平台正式能力保持待确认，不阻塞无 Key 的浏览器演示开发。
