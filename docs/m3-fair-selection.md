# M3 独立公平评估与逐首选曲

本阶段完成 Issue #4 的 M3.1–M3.6，实际实现位于 `@amp/playlist-engine`。它只依赖 core，并读取 M2 已计算的矩阵；没有来源 I/O、重新评分、房主确认或开局权限。运行时与完整演示仍属于 M4/M5，真人产品另由 #14 的 D0–D4 跟踪。

## 公开入口

| 函数 / 常量 | 返回内容 |
| --- | --- |
| DEFAULT_FAIRNESS_CONFIG / DEFAULT_SELECTION_CONFIG | 唯一生产默认配置 fairness-v1 / selection-v1 |
| assessPlaylist(AssessmentInput) | 独立的最终题组评估，可直接用于禁歌/换曲后重评 |
| filterCandidates(SelectionRequest) | 排序后的可用候选与按首个排除原因统计的数量 |
| evaluateObjective(SelectionRequest, selectedSongIds) | 固定候选上下文中的 F/D/C/E/Q 与综合目标值 |
| selectPlaylist(SelectionRequest) | 实际题组、连续步骤解释、排除/缺口、独立评估及输入版本快照 |
| explainAssessment(AssessmentInput) | 当前评估，加每格原始分数、可信度、六位量化值和比较结论 |
| explainSelection(SelectionRequest) | 真实选择结果，加逐曲熟悉玩家列表、报告分类及原始/量化比较依据 |

所有公共函数校验输入；缺 cell、重复 ID、未知引用、不安全整数和非有限值属于输入错误，不降级成零分或公平告警。纯计算错误沿用 M2 的抛错边界，M4 将其转为运行时 Result。公开报告从输入现算，不接受调用方传入的任意历史结果，避免解释与数据脱节。

先完成 `pnpm build`，下面的输入使用 core 已定义契约：

```ts
import { selectPlaylist, explainAssessment } from '@amp/playlist-engine';

const result = selectPlaylist(request);
const afterBan = result.selectedSongIds.filter(id => !bannedIds.has(id));
const report = explainAssessment({
  playerIds: request.profileContext.matrix.playerIds,
  selectedSongIds: afterBan,
  matrix: request.profileContext.matrix,
  requestedCount: request.requestedCount,
  fairnessConfig: request.fairnessConfig,
  selectionVersion: request.selectionVersion + 1,
});
```

这里保留原请求长度。片段只是纯函数调用示例；M4 负责真正保存 ban 集合、递增版本、失效旧确认和更新唯一状态，不能由 UI 自行改版本后直接开局。

## 数值与选择规则

实现沿用已接受的 [algorithm-spec](algorithm-spec.md) 第 6–10 节，没有更改权重或降低验收门槛。

- 分数/可信度先量化到 1,000,000 精度再与阈值比较；显示仍保留原数值。覆盖以实际题组 M 为分母，最低首数使用 ceil(M × ratio)。整数交叉乘法、缺口平方和及 1e12 增益比较键都检查安全范围；覆盖上取整在安全乘积上用整数除法避免浮点边界。
- 不可用 → ban → 明确历史，按首个命中原因排除；题组不放回，重新选曲也不恢复禁歌。
- 补缺目标使用原请求 N。每加一首重新计算每人缺口平方的下降量，优先补缺，再比较量化后的综合边际收益，最后按稳定 SongId 决胜。
- 多样性上下文固定为过滤后的完整候选 A，不随逐步选择缩小。Genre 只计直接标签，缺失维度不虚构标签；年代沿用 M2 的显式 era 键。标签相关性结合真实熟悉度与群体连续偏好；只对有效维度重分配权重。
- 竞争取所有无序玩家对的最低分均值；单人竞争为零。探索使用热度、新鲜度和群体探索偏好。共同/主场/探索比例仅是软目标，不是文化或玩家类别的硬配额。
- tieBreak.rule 为 deficit 时 tiedSongIds 只含唯一胜者；objective 时列出补缺相同的候选；song_id 时列出补缺与量化增益均相同的候选。步骤记录真实选择前后值，可以重算每个边际收益。

assessPlaylist 不读取旧步骤、不信任选择器的结论，也不接受房主确认参数。它同时报告 LOW_COVERAGE、COVERAGE_GAP、LOW_CONFIDENCE 和 SHORT_PLAYLIST；空题组/无玩家属于无效评估。短曲单即使按较小 M 已满足覆盖，仍会保留 SHORT_PLAYLIST。passed=false 表示本次未找到达标题组，不声称证明全局无解。

## 实际验证场景

三人四曲的规范例独立放在 `tests/fixtures/selection.ts`，不充当 M2 评分输出。首次 s1/s2 补缺均为 2，同分先选 s1；第二步 s3 补缺为 1，s2 为 0，因此第二首为 s3。最终覆盖为 0.5/0.5/0.25，差距 0.25。F/D/C/E/Q 均有独立手算断言；每步 J(after)−J(before) 逐项核对。

集成测试真正调用 MockMusicSource → 画像 → 矩阵 → 选曲 → 独立重评：

| 场景 | 观察结果 |
| --- | --- |
| 84 首多元目录，选 12 首 | 实际选满；六人熟悉首数为 3/3/2/3/2/3，保留两人的低覆盖及六人的低可信度告警 |
| 六名音游玩家 + 一名古典玩家，可行库 | 12 首题组，七人各熟悉 9 首，独立评估通过 |
| 缺掉古典玩家熟悉的共同及主场曲 | 只剩三首，多项覆盖/可信度/差距/数量告警同时保留 |
| 可行库禁掉三首古典主场 | 剩九首，古典覆盖 6/9；只有 SHORT_PLAYLIST，不虚报 LOW_COVERAGE |
| 少数玩家只熟悉三首主场的独立达标例 | 禁掉主场后真实 LOW_COVERAGE；增加三首未禁的少数玩家熟悉内容可修复，只加多数玩家熟悉内容不能修复 |

最后一个场景用明确自报零给不熟悉的歌曲提供证据支持，区分“已知不熟悉”与“没有证据”；不是把未知 confidence 设高来消除告警。所有题目仍是合成元数据，没有音频或真实抢牌。

还验证量化边界/等号/ceil、低可信度恰好一半、全员低覆盖、单人、同质画像、无交集、未知元数据、候选不足、乱序和标签/玩家重命名、配置内容保留、非法输入与安全整数溢出。包边界测试禁止 playlist-engine 导入 music-profile、adapters、runtime、Node I/O 或相对路径源码。

## 交接边界

M3 输出可直接供 M4 使用，仍不能启动游戏。M4 必须接上唯一状态写入、ban 后重评、当前版本房主确认、统一开局 guard、Mock 主持/游戏和反馈结算；M5 再提供无密钥 CLI 闭环。多元主场景的告警需通过这些真实流程处理，不可在 Demo 中隐藏或自行把 passed 改成 true。完整真人 Demo 与浏览器/音频验收仍未完成，周杰伦专场继续为 P3 副线。

本阶段检查命令为冻结安装、build/typecheck/test/lint、Python 仓库检查和 git diff 检查；最终提交与双系统 CI 结果记录于阶段 PR。#4 只在全部 M1–M5 接受后关闭。
