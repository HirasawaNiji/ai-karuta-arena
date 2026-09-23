# D0：现有 Karuta 引擎核对

调查日期：2026-09-24。任务：[Issue #11](https://github.com/HirasawaNiji/ai-karuta-arena/issues/11)。本轮只读核对引擎与运行隔离测试，没有迁移源码、素材或更改原项目。

## 核对基线与验证

仓库：[HITsz-JLA/karuta-web](https://github.com/HITsz-JLA/karuta-web)，本机提交 `780c1c0230589caf43c4835dc046ad7555c85f0a`。以下引用固定该提交，不宣称是远端最新版本。

- 引擎已有依赖环境，Node 24.12.0 / Windows：`node --test server/onlineRooms.test.mjs server/packageCatalog.test.mjs server/zipAsset.test.mjs server/onlineAudioSession.test.mjs`，46 项通过，0 失败。
- 用独立临时数据目录、回环地址及空闲端口启动 `node server/index.mjs`，`GET /api/health` 返回 HTTP 200、`ok: true`；验证后已关闭。
- README 启动方式为 `npm ci`、`npm run server`、另启 `npm run dev -- --host 0.0.0.0`。本轮没有重新安装该仓库、构建页面或执行双浏览器真实音频游玩，因此 D0 尚未完整验收。

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

M1.5 先固定 Mock 端口，保留未来适配扩展；不得用虚构的真实引擎端点填接口。本项目不复制引擎，也不在 D0 重构它。D2 前另明确必要改造的仓库、范围、验收与授权。

## 使用依据与素材空间

用户于 2026-09-24 明确说明自己是 karuta-web 管理员，允许本项目使用 karuta-web 的所有内容。记录为本次项目复用授权，可以继续设计与实现适配；仓库未找到 LICENSE，不把管理员声明写成新增开源许可证，也不替其他来源补造许可。

用户同时明确：比赛官方提供的新项目卡牌，其使用范围尚不清楚，先保留空间。现有内容的复用授权与未来官方资源是两条记录；后者继续待核验，不要求当前停下纯核心开发。`AudioAsset.usage` 保留 pending/verified、来源、依据和允许范围；图片资源与真实可玩清单在 D1 同样需留来源记录。

本轮未逐项检查某个完整真实题库的录音、片段、卡牌对应关系，没有复制任何音频。素材未核验时允许保存元数据诊断，不作为已就绪的可玩题目。周杰伦专场与全曲库目标见[艺人专场](artist-party.md)。

## 剩余验收与下一步

1. D1/D2 实施前选择一套用户已授权、确实可用的具体素材，核验片段边界、图片/卡牌与歌曲身份，不要求先得到官方卡牌。
2. 在现有引擎中运行两个浏览器的完整单场，补齐实际音频与结束证据；不重复部署线上服务。
3. 明确冻结题组/选牌后重评/空牌范围/种子/事件去重等改造，再定稿真实适配。M1 基础与 Mock 端口不应因此伪造接口。
4. 继续保留官方卡牌待确认状态；对实际素材清单分别记录使用依据。
