# M1.4：证据、画像与矩阵契约

对应 [Issue #4](https://github.com/HirasawaNiji/ai-karuta-arena/issues/4)。本阶段只完成可验证的数据边界；评分、画像构建、去重归并与 Demo 仍由后续阶段实现。

## 已交付

- `evidence.ts`：标准证据判别联合、来源快照、规范证据集合；区分兴趣、自报、累计/窗口播放、正确/错误识别，不以收藏或胜负冒充识别。
- `profile.ts`：只读完整画像、正整数版本、八维偏好、按歌曲/艺人的证据索引、来源解释、输入指纹及更新时间。
- `familiarity.ts`：贡献、修正和可信度依据；完整玩家 × 歌曲矩阵，明确保留未知单元格，拒绝缺项、额外身份、重复身份和非规范排序。
- `config.ts`：评分、画像推断、选曲和公平的完整参数与版本校验。生产默认值留给 M2/M3；测试 fixture 对照算法规格，core 不提供评分或选曲实现。
- `profile-input.ts`：带目录与固定参考时间的入口，核验玩家/歌曲/艺人/标签、来源时间、画像版本、矩阵配置快照和解释证据归属。

## 边界选择

时间支持 UTC ISO 的整秒及 1–3 位小数，拒绝本地时间、偏移时区和超过毫秒精度的输入，避免 JavaScript 截断更细的时间。事件发生时间不得晚于观测；播放区间满足 start ≤ end ≤ observed；入口观测/画像时间不得晚于注入的 referenceTime。不读取当前系统时间。

RawUserMusicData.userId 是来源已映射的 PlayerId。每个快照只包含该玩家、该来源的证据。原始导入可以重复，M2 负责幂等归并与冲突判定；EvidenceCollection 及画像中的规范证据拒绝重复 evidenceId 或识别 eventId。窗口播放数据可保留，但 M2 不得当累计次数计分，需返回不支持诊断。

PlayerMusicProfile 的 provenance 必须覆盖已有偏好键；推断来源必须引用本画像中的证据。缺省 explorationScore/mainstreamScore 仍表示未知。画像/矩阵 schema 验证结构和引用，不证明推断结果符合算法；M2 必须另外验证公式。

矩阵 ID 使用代码单元升序，行列与 profileVersions 的键完全匹配。catalog 可以包含未参加本局的玩家和未入候选的歌曲，但矩阵每个身份必须存在于目录，profiles 必须与矩阵玩家一一对应。空轴合法，后续评估仍须禁止空局开场。

矩阵同时保存 scoringConfigVersion 和完整 scoringConfig 快照；外部上下文即使沿用版本名，只要参数内容改变也拒绝旧矩阵。配置快照不是已经计算正确的证明；实际计算由 M2 完成，运行时仍需维护有效上下文。单元格解释验证贡献乘积、修正连续性/方向、最终分数和可信度依据；不把结构校验称为模型校准。

公平阈值必须可用六位小数表达；目标函数四权重和、软比例和为 1，半衰期/除数为正、所有参数有限。数量交叉乘积和目标增益的安全整数检查属于 M3 的实际计算入口。

## 验证与后续

测试覆盖来源混入、未来/无效时间、重复证据、非法引用、画像/矩阵身份、未知与缺项、陈旧版本、同名配置变化、解释不连续、配置范围和只读公共类型。执行命令仍为 README 的 build/typecheck/test/lint 与 Python 仓库检查；确切结果以对应 PR 与 CI 为准。

后续 [M1.5/M1.6](m1-runtime-contracts.md) 已补齐选曲/评估、派对状态、命令/事件及来源/主持/游戏端口与全阶段检查范围，按 [D0 核对](karuta-engine-audit.md) 保留真实引擎差异。全 M1 审核合并后进入 M2；尚无 pnpm demo。

产品主线为 [真人 Demo #14](https://github.com/HirasawaNiji/ai-karuta-arena/issues/14)，覆盖核心 #4、D0 #11 与 D1–D4。周杰伦专场 #12 为 P3 副线，不是核心或通用 Demo 的前置条件。
