# M2 画像与熟悉度计算

范围是 Issue #4 的 M2.1–M2.6。现在可以从内存来源取得原始证据，归并后生成八维画像，再计算完整熟悉度矩阵。实现入口为 `@amp/music-profile`、`@amp/adapters` 和公开数据出口 `@amp/adapters/fixtures`。选曲器、派对运行时、最终 CLI 和真人产品仍分别在 M3–M5 / D0–D4；本阶段不提供 `pnpm demo`。

## 真实调用链

先运行 `pnpm build`。以下代码使用公开出口，不访问包内源码；同一调用链已在 `tests/music-profile.test.ts` 执行。

```ts
import { MockMusicSource } from '@amp/adapters';
import {
  createMixedFixture, MOCK_SOURCE_ID, MOCK_REFERENCE_TIME,
} from '@amp/adapters/fixtures';
import {
  DEFAULT_SCORING_CONFIG, normalizeEvidence,
  buildPlayerProfile, buildFamiliarityMatrix,
} from '@amp/music-profile';

const { catalog, manifest } = createMixedFixture();
const source = new MockMusicSource(MOCK_SOURCE_ID, createMixedFixture().rawData);
const rawData = await Promise.all(
  catalog.players.map(({ player }) => source.getUserMusicData(player.id)),
);
// Importers retain these diagnostics rather than presenting window counts as cumulative.
const normalized = normalizeEvidence(
  rawData.flatMap(raw => raw.evidence), catalog, MOCK_REFERENCE_TIME,
);
const input = {
  catalog, rawData, referenceTime: MOCK_REFERENCE_TIME,
  scoringConfig: DEFAULT_SCORING_CONFIG,
};
const profiles = catalog.players.map(({ player }) =>
  buildPlayerProfile(input, player.id),
);
const matrix = buildFamiliarityMatrix({
  catalog, profiles, referenceTime: MOCK_REFERENCE_TIME,
  scoringConfig: DEFAULT_SCORING_CONFIG, matrixVersion: 'mixed-matrix-v1',
});
// manifest, normalized.diagnostics and matrix are data, not a canned report.
```

纯函数拒绝非法输入并抛出边界/数据错误；未来 runtime 将这些错误转为其 Result。来源实现不联网，每次返回独立副本；未知用户不返回空画像伪装成功。业务包没有文件、网络、时钟或环境变量读取。

## 数据与覆盖

主 fixture 为 84 首明确命名为 Synthetic 的合成元数据、14 个生态分组、六名连续偏好不同的合成玩家。它不包含音频、卡牌、私人记录或平台账号。

| 语言标签 | 歌曲数 |
| --- | --- |
| zh | 18 |
| en | 30 |
| ja / ko / yue | 各 6 |
| instrumental | 12 |
| other | 6 |

生态包括华语流行/摇滚/说唱、英语流行/摇滚/R&B/电子/独立、日语、韩语、粤语、古典、爵士、拉丁/世界。manifest 从实际歌曲统计八维分布，包含数据版本与合成/无音频声明。开放标签和 Genre 父级由目录注册；新增 Genre/语言不需要修改评分源码。年代使用显式 `era:<十年>s` 注册键，例如 1896 → `era:1890s`；目录没有对应键时保持未知，不从标签展示名猜测。

独立 `createStressFixture` 提供六名音游参与者和一名古典参与者：可行变体有六首共同、三首音游、三首古典歌曲，通过正确识别证据计算后七人各熟悉九首；缺库变体同时移除古典玩家熟悉的共同曲和主场曲，只剩三首音游曲，古典覆盖数为零。这是评分/数据验收，不证明公平选择器已完成。禁歌和扩库后的评估在 M3/M4 实施。

`tests/fixtures/direct-matrix.ts` 是另行标明的两人三曲直接输入，用于后续选曲单测；不充当集成 Demo 的评分输出。

## 归并、画像与版本

- 输入是完整原始历史。先验证每条证据，包括将被淘汰的旧快照，再按 evidenceId 去重；同 ID 异内容拒绝。识别 eventId 可跨来源重送，事件业务载荷必须一致，保留稳定 ID 最小的证据封装；重送观测时间仍需有效。
- 收藏/歌单/热门歌/艺人保留每来源最新状态，跨来源取 any active；计数先取每来源最新累计值，再取跨来源最大；window 计数返回 `UNSUPPORTED_WINDOW_COUNT` 诊断，不参与评分。诊断由 normalizeEvidence 暴露，画像便捷函数仅返回画像，调用方应在导入边界保留诊断。
- 自报取最新观测；recent_play 取最新实际播放时间；识别历史保留，评分按 occurredAt 决定最新答案。同时间按 evidenceId 升序取最后值。缺失/空列表不产生负证据。
- 每来源最新原始快照提供申报偏好；目录中的玩家申报作为另一显式输入，按权重最大、同权重最高 confidence 合并。同来源同 snapshotId 异内容拒绝。推断仅用收藏、歌单、热门歌和累计播放的正面强度，识别反馈不扩散到整类风格。
- buildPlayerProfile 可接收 previous。相同规范有效内容返回相同版本及 updatedAt；变化递增一次，溢出拒绝。inputFingerprint 使用完整规范内容字符串，避免短哈希碰撞；它可能较长，不用作日志或展示 ID。未来 runtime 保存原始历史与 previous 并拥有更新事务，不应把已经归并、丢掉旧来源计数的数据当完整历史继续归并。
- 矩阵构建按 ID 排序，保留所有玩家 × 歌曲 cell、完整评分配置及 profileVersion。matrixVersion 由调用者/runtime 提供；更改时间、目录、画像或配置后调用方须重建并推进版本。同版本名改变参数也不会复用旧分数。

## 计算与解释

唯一生产默认值在 music-profile 的 defaults.ts，沿用已接受的 [score-v1 公式](algorithm-spec.md)。例如无证据且无偏好时分数 0.05、confidence 0、insufficient。只有一条收藏、歌曲只有一个艺人/Genre/语言且无申报时，三个推断权重各 1/3，总分为 `0.05 + 0.15 + 0.1/3 + 0.05/3 + 0.05/3 = 0.266666…`，confidence 为 0.5。

每个 cell 返回固定特征贡献、连续的 clamp/correctFloor/wrongPenalty 修正及胜出的 confidence 依据。得分不是识别概率；错误可提高证据支持，同时降低熟悉度。重复来源不会提高 confidence，Genre 祖先取最大而非相加，文化/地区/IP 不直接贡献熟悉度。

## 识别范围

core 新增可选 recognitionScope，供正确/错误证据、ANSWER 事件和最终 judgement 保留 questionId、recordingId 与 segment。segment 包含 startMs/durationMs/kind；至少提供题目或录音 ID。上下文校验确保题目/录音属于该歌曲，片段不越界；同时给出题目和片段时必须吻合。GameRecognitionContextSchema 也校验 GAME_FINISHED 中的 judgement 范围。

gameplayEvidence 只转换合法 ANSWER_CORRECT/ANSWER_WRONG；参与动作、回合结束等返回 null。它校验冻结会话与观测时间，不承担事件队列、授权、跨事件顺序和结算幂等。v1 保留范围但仍按歌曲计算；D1 的 v2 才使用范围区分识别级别，本阶段不能声称接入真实引擎。

## 验证范围

新增测试覆盖：来源隔离与未知玩家、84 首 manifest、重复/冲突/时间/引用、最新快照与最大计数、八维推断/申报优先、画像版本重放、公式手算/单调/饱和/时效、正误/无动作、完整矩阵及乱序确定性、开放分类、配置快照、六比一可行/缺库和识别范围。

运行固定 Node/pnpm 的 build、typecheck、Vitest、类型感知 ESLint、Prettier、Python 仓库检查和 git diff 检查；最终提交及双系统 CI 结果记录在本阶段 PR。M2 接受后只勾选 #4 的 M2，继续 M3 独立公平评估与逐首选曲。完整真人主线仍为 #14，周杰伦 #12 仍为 P3。
