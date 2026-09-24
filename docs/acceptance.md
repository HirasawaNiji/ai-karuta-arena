# 首期验收矩阵

状态：M1–M5 已实现，AC-01–20 已有契约、计算、状态和实际 CLI 的分层验证；证据映射见本文末节及 [M5 Demo](m5-demo.md)。需求定义见 [requirements.md](requirements.md)，任务依赖见 [development-roadmap.md](development-roadmap.md)。受控 Mock 通过不代表真实派对公平性、真实音乐平台或正式联网游戏已验证。

实施级测试归属与顺序见[工作单](implementation-plan.md)；手算公式、精度与数据变体见[算法规格](algorithm-spec.md)，权限/版本/事件不变量见[运行规格](party-runtime-spec.md)。这些细化补充原 AC；实际执行范围和限制以本文证据表、关联 PR 的准确提交及 CI 结果为准。

AC-01–20 验收 M1–M5 核心 Mock。[初赛补充中的 PAD-01–10](preliminary-demo.md)另外验收手动画像、可播放题目、真实多人/1v1 和淘汰赛；两组不能互相冒充。初赛暂停 LLM 接入，QQ 不可用时必须仍能完成真人演示。score-v1 保留核心回归，score-v2-manual 按新增识别范围和自报规则验证。

## 验收场景

| 编号 | 对应需求 | 输入/场景 | 必须观察到的结果 |
| --- | --- | --- | --- |
| AC-01 | REQ-01、REQ-02、REQ-03 | 增加新 Genre 层级、Instrumental、跨语言艺人、无 Franchise 歌曲 | 无需修改封闭枚举即可表达；语言/地区独立；无默认文化分支 |
| AC-02 | REQ-04、REQ-05 | Mock 来源、收藏/播放/近期记录、标准游戏事件 | 数据经来源契约进入画像；可追踪证据；不需要真实账号或密钥 |
| AC-03 | REQ-06 | 保持其他特征相同，增加播放次数/调整时间/新增正确识别 | 分数单调且饱和；近期高于久远；正确识别提升；输出贡献可核算 |
| AC-04 | REQ-05、REQ-06、REQ-07 | 无记录、高评分低可信度、未作答、未抢到 | 无记录标未知；可信度独立；未作答/未抢到不生成 game_wrong，不自动降低评分 |
| AC-05 | REQ-07、REQ-09 | 12 首，某玩家 3 首分数 ≥0.6；低可信度恰好 6 首 | 覆盖率 25%，最低覆盖通过；低可信度比例恰好 50% 不触发“超过一半” |
| AC-06 | REQ-09 | 分数 0.6、可信度 0.5、差距恰好 0.40，以及各自门槛两侧；5 首题组 | 等号边界按定义；5 首最低数为 2；以稳定构造避开无关舍入误差，比较精度策略在实现中说明 |
| AC-07 | REQ-08 | 明确预期步骤的小矩阵；第一次加入后玩家缺口顺序改变 | 第二首根据更新后的边际增益选择；补缺先于软目标；无静态一次排序 |
| AC-08 | REQ-08、REQ-10 | 候选综合收益同分、候选输入顺序打乱；固定时间/配置 | 按稳定 ID 决胜，相同完整输入可复现；不重复歌曲；输出真实增益 |
| AC-09 | REQ-08、REQ-09、REQ-15 | 六名音游玩家和一名古典玩家，12 首目标；有可达标候选 | 可用 6 首共同熟悉、3 首音游主场、3 首古典主场构造：六人各 9 首、古典玩家 9 首，可信度充足；补缺过程及最终检查均通过 |
| AC-10 | REQ-08、REQ-09、REQ-12 | 同场景移除古典玩家可识别候选 | 如实报告低覆盖或差距并暂停；不能固定输出通过或把贪心失败称为无解 |
| AC-11 | REQ-10 | 全员画像高度一致；另一个场景完全没有共同交集 | 前者允许自然集中；后者尝试个人主场并独立检查，不强行凑共同区比例 |
| AC-12 | REQ-09 | 所有人都只熟悉 0–1 首的 12 首题组，差距很小 | 最低覆盖失败；相同低覆盖不算公平通过 |
| AC-13 | REQ-12、REQ-13 | 初始通过，ban 掉少数成员可识别歌曲 | ban 中不能开局；ban 后对实际题组重算，等待房主；重选不恢复被 ban 歌曲 |
| AC-14 | REQ-12 | 房主对告警选择继续，再改成员/歌曲/玩法/评分依据/配置 | 首次有效确认允许非空题组启动且保留告警；每种相关变化都使旧确认失效 |
| AC-15 | REQ-12、REQ-13 | 房主选择扩库重选、调整玩法、结束 | 扩库重新评估而非默认保证通过；玩法变化失效旧评估；结束不再启动；Mock 不冒充真实新增玩法 |
| AC-16 | REQ-07、REQ-09、REQ-12 | 无玩家、空题组、候选不足、非法请求长度 | 无玩家/空题组不可确认绕过；非法输入拒绝；候选不足如实输出数量并等待确认缩短题组，不能重复凑数 |
| AC-17 | REQ-13、REQ-14 | Agent 输出 START_GAME/START_NEXT_ROUND 或未知动作，评估过期或仍待选择 | 白名单及程序侧开局检查生效；Agent 不能替房主确认，也不能用文案修改计分 |
| AC-18 | REQ-05、REQ-11、REQ-14 | Mock 游戏产生正确/错误/无动作后开始下一轮 | 统一事件可被适配，相关画像更新，下次矩阵重新计算；不依赖 Karuta 私有协议 |
| AC-19 | REQ-15、REQ-16 | 多元主 Demo 与独立压力 Demo | 60–100 首，多语言多生态、至少六种画像；两种场景都运行，数值来自计算，模拟输入清晰标记 |
| AC-20 | REQ-16、REQ-17、REQ-18、REQ-19 | 清洁环境，无任何平台/LLM Key | install/build/test/lint/demo 成功，无真实平台依赖；README 命令可执行，报告已知限制 |

AC-09 是可行输入的受控算例，不假定现实中的六名音游玩家一定与古典玩家共享六首歌。另设无交集、候选缺失和 ban 后失败样例，避免只用有利数据证明算法。

## 分层验证与交付证据

- 前期文档阶段：原 Prompt 四十九章完整映射、需求 ID 与验收关联、Markdown 链接存在、Python 仓库检查和 `git diff --check`；不执行或宣称应用测试。
- 领域/算法阶段：Vitest 单元测试，固定时钟、小矩阵与阈值边界；验证公开行为和可核算结果，避免只镜像实现代码。
- 状态阶段：版本变化、ban 流程、房主确认和开局的状态转换测试；不能只验证主持文案包含某句话。
- 集成阶段：真实调用所有 Mock 模块的 Demo 闭环；固定场景核对结构化输出，禁止把预制文本当集成通过。
- 未来真实接入：官方授权、平台数据契约、音频许可和浏览器/多人流程分别验收。Mock 成功不能替代这些证据。

实现任务在对应 Issue/PR 中记录执行命令、结果、提交号及未运行检查。证据只保存不含私人画像、密钥或凭据的输出；人工接受并合并后才将对应任务标为 Ranked。

## M1–M5 执行证据映射

以下为固定合成输入的核心验收，不包含 PAD 真人验收。路径均相对仓库；完整测试随 pnpm test 执行，进程层随 pnpm demo:check 执行。PR 记录确切 head 和 Windows/Linux CI；不从历史文档推断当前远端状态。

| AC | 可重复执行的证据 |
| --- | --- |
| 01 | tests/core.test.ts 的开放分类/艺人/语言/目录引用；tests/music-profile.test.ts 的任意分类 ID、地域与语言分离 |
| 02 | tests/music-profile.test.ts 的 Mock 来源到规范证据/画像/矩阵；tests/demo.test.ts 的六种真实计算画像及元数据 |
| 03 | tests/music-profile.test.ts 的手算、次数饱和、时间衰减、正确下限/错误惩罚；feedback CLI 的前后 cell 与同时刻无反馈对照 |
| 04 | tests/music-profile.test.ts 的未知/可信度独立与非答题事件；tests/party-events.test.ts 和 feedback CLI 的未作答不记错、版本不变 |
| 05 | tests/playlist-assessment.test.ts 的 3/12 覆盖和恰好一半低可信度 |
| 06 | 同一评估测试的等号、两侧量化、5 首向上取整及覆盖差距边界 |
| 07 | tests/playlist-selection.test.ts 的三人四曲手算：第二首必须 s3，逐步增益重新计算 |
| 08 | 同一选曲测试的乱序稳定性、量化收益/ID 决胜；tests/demo.test.ts 的完整报告逐字节确定性 |
| 09 | tests/playlist-integration.test.ts 和 stress:feasible CLI：七人都为 9/12 |
| 10 | 同一集成测试与 stress:missing-catalog CLI：少数玩家覆盖/可信度/差距与短局告警，START_GAME 暂停 |
| 11 | tests/playlist-selection.test.ts 的同质画像无强制配额；公共 createNoCommonFixture 和 ban CLI 的无共同曲输入 |
| 12 | tests/playlist-selection.test.ts 的零覆盖不能被高目标值掩盖；独立评估多玩家最低覆盖检查 |
| 13 | tests/party-runtime.test.ts 与 ban CLI：禁歌时拦截开局，禁掉少数主场后重评，重选仍保留 bans |
| 14 | tests/party-runtime.test.ts、party-updates.test.ts 的成员/歌曲/玩法/画像/时间及同名配置内容逐项失效；ban CLI 两次显式模拟房主确认与旧版本拒绝 |
| 15 | ban:expand-minority 和 ban:expand-majority 实际 UPDATE_CATALOG / REFRESH_PROFILES / REGENERATE；成功和失败各一支，另有未实现玩法拒绝及 END_PARTY |
| 16 | tests/runtime-contracts.test.ts、playlist-selection.test.ts、party-runtime.test.ts 的空轴/非法输入/空题组与缩短局；缺库 CLI 保留原 N 与实际 M |
| 17 | tests/party-runtime.test.ts 的主持白名单、system/非房主拒绝、过期确认和伪 ready；两种开局命令共用 runtime canStart |
| 18 | tests/party-events.test.ts 的顺序/ID/载荷/结果核对、错误不污染；feedback CLI 两局、新矩阵、结束事件重放幂等 |
| 19 | mixed 的 84 首、六种画像和覆盖 manifest；stress 正/负两种输入；输出明确 synthetic 与 simulated_host |
| 20 | scripts/check-demo.mjs 真正调用 pnpm demo，检查全部/单场景 JSON、文本、退出码和无凭据环境；双系统 CI 在显式 build 前执行，再运行完整工具链 |

真实 QQ、LLM、音频、联机抢牌与浏览器交互均未作为以上检查的一部分。后续产品必须执行 [PAD-01–10](preliminary-demo.md)，不能用此表替代。
