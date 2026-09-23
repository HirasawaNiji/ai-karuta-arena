# 画像、熟悉度与选曲算法 v1

依赖[需求规格](requirements.md)和[实现架构](implementation-architecture.md)。下列新增公式是首期可复现的工程默认值，随文档 PR 接受后采用；并非已训练、校准或验证的真实用户模型。M2/M3 必须用测试验证公式及其局限，修改公式须同步本文、配置版本与算例。

## 1. 配置与数值约定

评分配置 `score-v1`、选曲配置 `selection-v1`、公平配置 `fairness-v1` 各自独立。配置包含 schemaVersion、version 以及全部参数；版本不能替代实际内容比较。runtime 接收内容变化时必须更新上下文版本，即便调用者忘记修改配置名。

边界使用有限 IEEE-754 number，输出不提前四舍五入。公平判定使用 `SCALE = 1_000_000` 的固定精度：评分和可信度比较前 `round(value * SCALE)`，配置阈值要求可用六位小数表达。报告同时保存原评分和量化比较值。覆盖比较使用整数交叉乘法：`K*SCALE >= ceil(M*ratioInt/SCALE)*SCALE`；覆盖差告警为 `(maxK-minK)*SCALE > M*gapInt`；低可信度比例告警为 `lowCount*SCALE > M*lowRatioInt`。乘积必须在安全整数范围，否则拒绝输入。量化前后门槛边界需测试，显示值不能反过来作为计算输入。

综合增益比较先保留完整分数，再转 `round(gain * 1e12)` 整数键，防止浮点微小噪声改变并列选择。该键超出安全整数范围则报错。补缺收益本身是整数，优先比较，不混入加权分。

## 2. 证据归并

| 类型 | 有效载荷 | v1 归并规则 |
| --- | --- | --- |
| favorite、playlist、top_song | songId、active:boolean | 同来源/类型/歌曲采用最新快照；跨来源取任何 active=true，不按歌单数量累加 |
| play_count | songId、count、periodStart/periodEnd | 首期支持来源累计计数；每来源取最新快照，跨来源取最大而非相加；有窗口但非累计的数据暂不纳入次数特征，返回诊断 |
| recent_play | songId、occurredAt | 取最新有效播放时间；未来时间拒绝 |
| top_artist | artistId、active:boolean | 每来源最新，跨来源 any；不假设知道该艺人的所有歌 |
| self_report | songId、familiarity:[0,1] | 使用最新自报；缺失不当作零熟悉证据 |
| warmup_correct / warmup_wrong | songId、eventId、occurredAt | 确定性游戏事件，按 eventId 去重，保留历史 |
| game_correct / game_wrong | songId、eventId、occurredAt | 同上；未抢到、未作答没有此类证据 |

evidenceId 全局去重；同 ID 不同内容拒绝。时间相同按稳定 evidenceId 升序决胜，取最后一项作为最新。sourceId、playerId、songId/artistId 必须有效。观测时间晚于 referenceTime 的输入拒绝。相同批次重复导入不得增加分数或 profileVersion。

`normalizeEvidence` 返回规范证据、去重计数和不支持字段诊断，不默默吞掉畸形输入。历史快照的 inactive 可以撤销同来源的兴趣证据；快照刷新不同于“新增正面证据”，单调性测试必须保持其他输入不变。

## 3. 画像构建

输入由标准证据、明确申报的连续偏好和 catalog 构成。申报偏好需自带 confidence。已知歌曲的正面兴趣强度定义为：

`a(s) = max(favorite ? 1 : 0, playlist ? 0.4 : 0, top_song ? 0.8 : 0, playScore)`。

对每个维度标签 t：`inferredWeight(t) = min(1, sum(a(s) / tagCount(s, dimension)) / 3)`，只对拥有该标签的歌曲求和；艺人按 artistIds，年代按 releaseYear 映射。缺失维度不参与，不生成未知/Other 伪标签。派生置信度 `min(0.7, supportingSongCount / 10)`；top_artist 可另给该艺人 weight=0.8、confidence=0.6 的候选值。

合并偏好使用最大 weight；来自相同最大值的候选取最高 confidence。申报不应被推断覆盖成更低值。保留 provenance 供排查。总体 profile.confidence 是已有偏好键 confidence 的平均，无键时为 0，明确仅作摘要。

Genre 允许树状层级；评分亲和度对歌曲直接标签及祖先取最大匹配值，不额外累加祖先；其他维度精确匹配。分类注册表检测环，父子不能跨维度。多标签匹配取最大，避免标签多的歌曲天然加分。v1 不做同义词猜测，来源标准化时显式映射。

游戏正确/错误只影响对应歌曲证据，不自动增强或削弱其整个 Genre/语言。profileVersion 由 runtime 在规范化有效内容发生变化时递增；初始构建为 1。更新时间、派生结果和输入指纹保留用于复现，重复同内容不递增。

## 4. 单歌曲熟悉度

定义 `clamp01(x)=min(1,max(0,x))`，时间差以 UTC 毫秒除以一天计算，非负。

| 特征 | 变换 | 权重 |
| --- | --- | --- |
| prior | 常量 1，无记录也保留未知标记 | 0.05 |
| favorite | active 为 1，否则 0 | 0.15 |
| playlist | active 为 1，否则 0 | 0.05 |
| playCount | `min(1, log1p(count)/log1p(50))` | 0.30 |
| recency | 有 recent_play 时 `2^(-ageDays/180)`，否则 0 | 0.15 |
| topSong | active 为 1，否则 0 | 0.10 |
| selfReport | 自报值，无记录为 0 | 0.35 |
| artistAffinity | 已合并艺人偏好的最大 weight | 0.10 |
| genreAffinity | 直接/祖先 Genre 偏好的最大 weight | 0.05 |
| languageAffinity | 语言偏好的最大 weight | 0.05 |

先计算 `base = clamp01(sum(weight * feature))`。这是固定权重加和后限幅，不按“当前有几项证据”重新归一化，否则增加收藏可能反而降分。单项偏好只提供弱先验，地区、文化、IP 不直接决定熟悉度。八维画像仍用于展示和多样性。

识别反馈：对该歌曲所有正确事件取 `correctStrength=max(2^(-ageDays/365))`，无则为 0；`withCorrect=max(base, 0.9 * correctStrength)`。若最新有答题结果的事件是错误，则 `wrongPenalty=0.15 * 2^(-ageDays/90)`，否则 0。最终 `score=clamp01(withCorrect-wrongPenalty)`。新正确事件取消最新错误惩罚并提高正确下限；饱和时可保持不变。错误是相关歌曲的新证据，不能从未参与推断。

逐歌曲 confidence 取以下已存在依据的最大值：favorite 0.5、playlist 0.3、play_count `0.4+0.4*playScore`、recent_play `0.4+0.4*recency`、top_song 0.6、self_report 0.6、任一识别结果 `0.5+0.45*2^(-ageDays/365)`、艺人/Genre/语言偏好 `0.25*对应偏好confidence`；无依据为 0。它衡量规则证据支持，不是模型正确概率；错误可提高证据支持但降低熟悉评分。先计算各依据，取 max，不能拿来源数量直接当置信度。

`evidenceStatus` 在没有有效依据或 confidence < 0.5 时为 insufficient。解释记录所有输入贡献、限幅、正确下限带来的增量、错误惩罚以及 confidence 的胜出依据。收藏/播放增加不降分、近期高于久远等测试使用未饱和且无其他限制主导的例子，另验证饱和边界。

## 5. 矩阵

每次画像/评分配置/referenceTime/catalog 有效内容变化，重新计算所需完整矩阵。首期规模小，采用 O(玩家×歌曲) 全量计算，不引入缓存失效框架。相同输入先按稳定 ID 排序，再固定求和顺序，输出可复现。

矩阵缺项是无效输入；“未知”是存在且低 confidence 的 cell。测试“高评分、低可信度”时可以直接构造合法矩阵，以证明评估器不会把评分当可信度，不要求默认评分公式恰好生成所有边界。

## 6. 选曲主循环

先校验请求长度为正安全整数、ID 唯一、矩阵完整。合法无玩家/无候选返回空选择及无效评估，不能继续计算目标函数。过滤顺序为不可用 → ban → 明确排除的历史；按首次命中的原因统计，各计数不重复。选曲全过程的候选集记为 A。

```text
target = ceil(requestedCount * minCoverageRatio)
selected = []
K[player] = 0
while selected.length < requestedCount and remaining 非空:
    对每个 candidate:
        模拟加入后的每人 K
        deficitGain = sum(max(0,target-K_before)^2)
                    - sum(max(0,target-K_after)^2)
        objectiveGain = J(after) - J(before)
    按 deficitGain 降序、量化 objectiveGain 降序、songId 升序选一首
    记录真实贡献并更新 K、selected、remaining
对 selected 独立 assessPlaylist
```

deficitGain 都是 0 时仍按后两项排序。只用熟悉门槛判断补缺，可信度另行评估，不能在补缺中偷偷改成另一个门槛。选曲无回溯，不保证全局最优；失败文案只能说“本次未找到达标题组”。

## 7. 综合目标 J

`J(S)=0.4*F(S)+0.2*D(S)+0.3*C(S)+0.1*E(S)+0.02*Q(S)`。

前四项沿用公平、多样性、竞争性、探索性；Q 是既有共同区/主场/探索软比例的可配置辅助项，默认强度 0.02，可设为 0，不是硬配额。所有权重集中配置且非负，前四项和必须为 1。空 S 的各项定义为 0；N 始终是请求长度，不是当前已选长度。

### 7.1 公平 F

`F(S)=1-variance(K(u)/N)`，非空 S 使用该式。每人取值在 [0,1]，总体方差使用除以玩家数，不使用样本方差。它只作为补缺优先后的连续比较；所有人零覆盖也可能有高 F，最终最低覆盖检查不可省略。

### 7.2 上下文多样性 D

维度为 Genre、Language、Region、Artist、Era、Culture、Franchise，默认等权。每个维度的候选标签集合 T 只来自过滤后 A；缺失信息不作为新标签奖励。D 的 Genre 使用直接标签，避免层级深的歌曲重复贡献。

对候选歌曲 s，`relevance(s)=max_u f(u,s)`。对每个 t：`r(t)=max(max_{s含t} relevance(s), mean_u preferenceWeight(u,t))`，缺失偏好取 0 仅作这一奖励计算，不宣称不喜欢。这个公式同时依赖矩阵、画像和候选库。

`D_dimension(S)=sum_{t in T} r(t)*I(S覆盖t) / sum_{t in T} r(t)`；分母 0 的维度不参与，剩余维度权重重新归一；全部无效时 D=0。每曲多标签可覆盖多个标签，不奖励重复出现。相似画像自然允许集中；低相关类别奖励小，并且永远不能越过补缺优先级。

### 7.3 竞争 C

每曲 `c(s)=mean_{所有无序玩家对(u,v)} min(f(u,s),f(v,s))`。单玩家时 c=0。`C(S)=sum(c(s))/N`。使用评分而非获胜概率，不给独占识别歌曲高竞争分，但这种歌曲仍可通过补缺和主场价值入选。

### 7.4 探索 E

`e(s)=popularity(s)*(1-max_u f(u,s))*mean_u explorationScore(u)`，popularity 未知取 0，explorationScore 未指定取 0.5。`E(S)=sum(e(s))/N`。本版只声称使用热度和新鲜度，不能宣称已计算跨文化价值。人数更多的文化类别没有特殊奖励。

### 7.5 软比例 Q 与报告分类

每首按以下顺序赋唯一报告类别（这只是统计约定，不断言真实类别互斥）：至少两名玩家达到熟悉门槛 → common；否则一名达到 → home；否则 → exploration。单玩家没有 common。默认目标 common/home/exploration 为 0.5/0.3/0.2，总和为 1，可配置。

对非空 S：`Q(S)=1-0.5*sum_category(abs(count(category)/|S|-target(category)))`。无交集或补缺导致比例偏离时如实显示，不预留固定名额，不补造类别。解释同时保留原熟悉玩家列表，避免唯一报告分类隐藏多人主场。

## 8. 手工可核对的小矩阵

请求 N=4，最低覆盖比例 0.25，因此 target=1，熟悉门槛 0.6。除下表外无候选；confidence 均为 0.9。s1/s2 的元数据、热度和所有软目标特征相同。

| 玩家 | s1 | s2 | s3 | s4 |
| --- | --- | --- | --- | --- |
| A | 0.9 | 0.9 | 0.1 | 0.1 |
| B | 0.9 | 0.9 | 0.1 | 0.1 |
| C | 0.1 | 0.1 | 0.9 | 0.1 |

初始缺口 [1,1,1]，s1/s2 补缺收益都为 2，软增益相同，ID 决胜先选 s1。此时缺口 [0,0,1]，s2 收益降为 0，s3 收益为 1，因此第二首必须选 s3。静态排序可能先取 s1/s2，这正是 AC-07 要识别的错误。选满后 K=[2,2,1]，覆盖=[0.5,0.5,0.25]，差距 0.25，通过最低覆盖、差距和证据检查。

M3 测试还要断言每项 objectiveGain 等于相同输入上 `J(after)-J(before)`，并用手算单项例子验证 F/D/C/E/Q，不能只快照最终文案。

## 9. 独立最终评估

按 REQ-07/09 对实际题组长度 M 计算 K/C/F/L；此处指标 F 是熟悉覆盖分 `sum(f)`，与目标函数 F(S) 分别命名为 `familiaritySum` / `fairnessObjective`，代码不可混用。

1. 无玩家或 M=0：validity=false、passed=false，比例 null，禁止任何确认绕过。
2. 每人 K 小于 `ceil(M*0.25)`：LOW_COVERAGE。
3. 最大覆盖差大于 0.40：COVERAGE_GAP。
4. 任一玩家 confidence<0.5 的曲目比例大于 0.5：LOW_CONFIDENCE。
5. M<N：SHORT_PLAYLIST，不因实际分母降低就假装满足原请求；M>N 是非法题组输入。
6. 汇总所有原因，不短路隐藏其他告警。基础有效且无告警才 passed=true。

上述数值从配置读取。房主确认仅由 runtime 保存，不作为评估器参数；确认不能将 passed 改为 true。此函数用于初次选择、禁歌结束、换曲和任何上下文变化后的当前题组检查。

## 10. 数据与验证场景

Mock 主 catalog 默认制作 84 首合成歌曲元数据，必须在 60–100 范围；至少六名连续偏好不同的玩家。名称/元数据明确为合成，无需音频。manifest 记录各语言/维度分布，含中文、英语、日语、韩语、粤语、纯器乐、Other；场景覆盖原 REQ-15 的音乐生态，不能为了达标结果把所有玩家都设成熟悉所有歌曲。

测试层分开：小矩阵直接验证选曲；评分测试用证据；集成 Demo 从证据生成矩阵，不能跳过评分。独立压力场景保留六名音游玩家加一名古典玩家，包含可行、缺库、禁歌失败三个变体。AC-09 可行例有六首所有人共同熟悉、三首音游主场、三首古典主场，七人各熟悉九首。缺库变体必须去掉古典玩家熟悉的共同曲及主场曲，不能只去三首主场后错误期待低覆盖。

禁歌告警例可从上述 12 首中移除三首古典主场：实际 M=9，六人覆盖 1，古典玩家覆盖 6/9，差距仍通过但 SHORT_PLAYLIST 告警必须出现。另设少数玩家只有三首主场且无共同曲的达标起点，ban 后产生真正 LOW_COVERAGE，确保不是只验证数量告警。扩库场景添加未被 ban 且能覆盖不足玩家的新内容；另测试只添加多数人熟悉歌曲并不能保证修复。

准确性测试之外增加：输入候选乱序结果一致；标签/玩家 ID 一一重命名且无同分时结果等价；新增非已有语言/Genre 不改源码；无动作不产生负证据；重复事件不重复更新；公平门槛等号和量化边界；全员低覆盖、同质画像、完全无交集、候选不足、未知证据。依据 [AC-01–20](acceptance.md) 与工作单分阶段交付。
