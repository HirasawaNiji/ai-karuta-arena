你是一名资深全栈工程师、软件架构师与推荐系统工程师。请帮助我从零初始化一个可持续开发、结构清晰、方便后续接入真实音乐平台 API，并且不会被某一种音乐文化、语言或地区限制的项目仓库。

# 一、项目背景

项目暂定名为：

**AI Music Party / AI 音乐派对**

这是一个面向朋友聚会、宿舍娱乐、社团活动、家庭聚会、线下派对以及线上音乐互动场景的 AI 音乐产品。

产品的核心目标不是做普通的音乐推荐器，而是：

> 根据派对中每位参与者不同的音乐偏好、文化背景、歌曲熟悉度以及游戏过程中的实际表现，动态生成兼顾公平性、音乐覆盖度、竞争性和娱乐性的游戏曲库，并由 AI 主持整个音乐派对。

用户可能来自完全不同的音乐背景，例如：

```text
华语流行
粤语流行
欧美流行
日韩流行
Hip-Hop / Rap
Rock / Metal
R&B / Soul
Electronic / EDM
Classical
Jazz
Folk
Country
Indie
Latin
K-Pop
J-Pop
AniSong
Vocaloid
Game Music
影视原声
怀旧老歌
网络音乐
地下音乐
地方音乐
世界音乐
```

以上只是示例。

**禁止把产品默认设计成面向日本音乐、动漫音乐或二次元音乐用户。**

AniSong、Vocaloid、J-Pop、游戏音乐等只是整个音乐空间中的普通子类别之一。

系统设计必须保证：

```text
华语用户
英语音乐用户
日韩音乐用户
欧美摇滚用户
Hip-Hop 用户
古典音乐用户
电子音乐用户
怀旧音乐用户
跨语言杂食用户
小众音乐用户
```

都能够使用同一套数据模型和算法。

---

# 二、现有核心游戏

现阶段最核心的音乐游戏是我们已经开发的「歌牌 Karuta」。

它是一种音乐识别与抢牌游戏：

- 系统播放歌曲片段；
- 玩家根据音乐判断对应作品、歌曲或卡牌；
- 玩家进行抢牌；
- 服务端执行判定、计分和回合控制；
- 后续将扩展多人派对模式。

已有项目主要使用：

```text
React
TypeScript
Node.js
WebSocket
```

AI Music Party 会将歌牌作为首个重点游戏。

但是：

> 整个 AI Music Party 的领域模型不能绑定 Karuta，也不能绑定二次元歌曲。

未来应允许加入：

```text
猜歌
听前奏识曲
年代竞猜
歌手竞猜
歌词竞猜
音乐默契投票
音乐接龙
曲风竞猜
地区音乐竞猜
派对投票
合作型音乐游戏
```

因此需要建立通用的 MusicGame 抽象。

---

# 三、核心产品逻辑

整个系统围绕：

```text
玩家加入派对
        ↓
获取玩家音乐数据
        ↓
生成 PlayerMusicProfile
        ↓
估计玩家对于候选歌曲的熟悉程度
        ↓
Player × Song Familiarity Matrix
        ↓
根据
公平性
+
音乐覆盖度
+
竞争性
+
探索性
+
派对当前状态
        ↓
自动生成游戏曲库
        ↓
进行音乐游戏
        ↓
记录玩家表现
        ↓
持续修正 PlayerMusicProfile
        ↓
下一轮重新选曲
```

系统必须支持：

> 玩家音乐画像随着派对进行动态更新。

AI 不只是开局生成一次推荐。

---

# 四、AI 的职责

AI 主要负责：

1. 理解玩家音乐画像；
2. 理解派对当前状态；
3. 判断当前适合什么音乐活动；
4. 调用确定性的选曲算法；
5. 解释为什么选择这些歌曲；
6. 主持开场、局间、结算；
7. 判断下一轮是否需要调整难度；
8. 根据玩家参与情况建议改变音乐覆盖范围；
9. 帮助不同音乐背景的玩家都有参与感。

AI 不负责：

```text
抢牌判定
实时计分
网络公平裁决
游戏状态真值
核心安全规则
```

这些必须由确定性的程序实现。

---

# 五、音乐画像的核心原则

禁止把音乐画像简化为：

```text
二次元用户
欧美用户
华语用户
摇滚用户
```

这些最多只能是最终展示层的摘要。

系统真正需要解决的是：

> 现有证据支持玩家 u 对歌曲 s 有多高的熟悉程度？

核心目标：

```text
familiarityScore(player, song) ∈ [0, 1]
```

因此画像系统应该是：

```text
多维度
连续值
可组合
可动态更新
```

而不是简单把用户强制分类进某一个音乐群体。

第一版的 `familiarityScore` 是可解释的规则评分，不是经过校准的概率。`0.8` 不能解释为“有 80% 的概率认识”。后续只有在定义识别任务、收集真实标注并完成独立概率校准与验证后，才能另行提供概率输出。

必须区分熟悉度评分、证据可信度与实际游戏胜率。没有记录表示未知，不能直接断言玩家不认识；熟悉覆盖通过检查，也不保证反应速度、网络条件或最终得分公平。

---

# 六、PlayerMusicProfile

设计通用：

```ts
interface PlayerMusicProfile {
  genres: PreferenceDimension;
  artists: PreferenceDimension;
  languages: PreferenceDimension;
  regions: PreferenceDimension;
  eras: PreferenceDimension;
  cultures: PreferenceDimension;
  franchises: PreferenceDimension;
  scenes: PreferenceDimension;

  songEvidence: SongEvidence[];
  artistEvidence: ArtistEvidence[];

  explorationScore?: number;
  mainstreamScore?: number;

  confidence: number;
}
```

具体结构可以优化。

---

# 七、音乐画像维度

## Genre

Genre 不能使用几个固定枚举写死。

允许层级化标签，例如：

```text
Pop
├── Mandopop
├── Cantopop
├── K-Pop
├── J-Pop
├── Europop
└── Indie Pop

Rock
├── Alternative Rock
├── Hard Rock
├── Punk
├── Metal
├── Post-Rock
├── Math Rock
├── Shoegaze
└── Indie Rock

Electronic
├── EDM
├── House
├── Techno
├── Trance
├── Future Bass
├── Drum & Bass
└── Ambient

Hip-Hop
├── Chinese Hip-Hop
├── US Hip-Hop
├── Trap
├── Boom Bap
└── Alternative Hip-Hop

Classical

Jazz

R&B / Soul

Folk

Country

Reggae

Latin

World Music

Soundtrack
```

标签体系必须支持后续扩展。

不要在 TypeScript 中写一个不可扩展的巨大固定 enum。

---

# 八、语言维度

语言必须成为一等公民。

例如：

```text
Mandarin Chinese
Cantonese
English
Japanese
Korean
Spanish
French
German
Italian
Portuguese
Russian
Thai
Vietnamese
Arabic
Instrumental
Multilingual
Other
```

语言不等于地区。

例如：

```text
新加坡歌手唱中文
日本歌手唱英语
中国歌手唱粤语
韩国组合发行日语歌曲
```

数据结构必须允许：

```text
language
region
artistOrigin
```

分别存在。

---

# 九、地区维度

支持例如：

```text
Mainland China
Hong Kong
Taiwan
Japan
South Korea
United States
United Kingdom
Canada
France
Germany
Latin America
Southeast Asia
Europe
Other
```

地区标签不能直接决定用户音乐偏好。

只是用于歌曲和画像描述。

---

# 十、年代维度

必须支持：

```text
1960s
1970s
1980s
1990s
2000s
2010s
2020s
```

以及更精确的：

```text
releaseYear
```

因为一个派对中可能存在：

```text
80 后经典华语偏好
00 年代欧美流行
2010s EDM
2020s 网络热歌
经典摇滚
近期新歌
```

等完全不同的熟悉区域。

---

# 十一、Culture / Scene

Culture 或 Scene 用于描述：

> 音乐属于什么文化场景，而不是纯音乐学 Genre。

例如：

```text
Mainstream Pop
Internet Music
Anime Music
Game Music
Vocaloid
Doujin
Idol
Film Soundtrack
TV Soundtrack
Musical
Club Music
Festival Music
Underground
Indie Scene
Classic Hits
Campus Folk
Livehouse
DJ Culture
Hip-Hop Culture
```

禁止假设所有 Culture 都与二次元相关。

---

# 十二、Franchise / IP

Franchise 是可选字段。

它适合：

```text
影视
动画
游戏
音乐企划
音乐剧
系列作品
```

例如：

```text
某电影
某电视剧
某游戏
某动画
某音乐企划
```

但：

> 普通流行音乐不能被强制要求存在 Franchise。

因此：

```ts
franchises?: string[];
```

应当是可选信息。

---

# 十三、Artist

Artist 是非常重要的一层画像。

用户可能存在：

```text
强歌手偏好
弱 Genre 偏好
```

例如某个人可能跨风格听同一歌手。

因此不要简单通过 Genre 代替 Artist。

需要支持：

```text
artist preference
artist familiarity
artist concentration
```

---

# 十四、SongProfile

建立通用：

```ts
interface SongProfile {
  id: string;

  title: string;

  artists: string[];

  genres: string[];

  languages: string[];

  regions?: string[];

  cultures?: string[];

  franchises?: string[];

  releaseYear?: number;

  popularity?: number;

  source?: {
    platform: string;
    externalId?: string;
  };
}
```

未来可以增加：

```text
BPM
Energy
Valence
Danceability
Acousticness
RecognitionDifficulty
Popularity
ReleaseYear
ChartPerformance
```

但是第一版不要过度设计。

---

# 十五、用户音乐数据来源

音乐画像入口必须使用：

```text
Adapter / Provider
```

模式。

定义统一接口，例如：

```ts
interface MusicProfileSource {
  getUserMusicData(
    userId: string
  ): Promise<RawUserMusicData>;
}
```

未来至少可能存在：

```text
QQMusicOfficialSource

PublicPlaylistSource

SpotifySource

AppleMusicSource

LastFmSource

PartyWarmupSource

GameplaySource

ManualPreferenceSource

MockMusicSource
```

即使此次比赛主要围绕 QQ 音乐：

> 核心领域模型也不能出现 QQ 音乐独占的数据结构。

---

# 十六、QQ 音乐接入

目前比赛方是否开放完整 QQ 音乐第三方授权能力仍待确认。

未来希望接入：

```text
用户收藏歌曲

用户创建歌单

用户收藏歌单

近期播放记录

逐歌曲播放次数

Top Songs

Top Artists

Genre Distribution

近期偏好

QQ音乐画像
```

当前阶段：

**禁止使用未经确认的私有接口作为核心依赖。**

第一版全部通过：

```text
MockMusicSource
```

模拟。

QQ Music 只是：

```text
MusicProfileSource
```

的一种实现。

---

# 十七、Evidence 系统

音乐熟悉度必须基于 Evidence，而不是单一标签。

例如：

```ts
type FamiliarityEvidenceType =
  | "favorite"
  | "playlist"
  | "play_count"
  | "recent_play"
  | "top_song"
  | "top_artist"
  | "self_report"
  | "warmup_correct"
  | "warmup_wrong"
  | "game_correct"
  | "game_wrong";
```

支持：

```text
收藏
播放
最近播放
用户歌单
歌手偏好
现场测试
实际游戏行为
```

等不同证据来源。

---

# 十八、收藏与播放次数

必须明确区分：

```text
喜欢
听过
熟悉
能够快速识别
```

例如：

```text
收藏
→ 强兴趣证据

高播放次数
→ 熟悉度证据

近期重复播放
→ 很强熟悉度证据

历史收藏但长期未播放
→ 中等证据

游戏实际识别正确
→ 极强识别证据

没有抢到
→ 不能直接视为不认识
```

熟悉度第一版采用：

```text
规则
+
权重
+
可解释评分
```

不要一开始训练机器学习模型。

例如：

```text
Familiarity =
FavoriteScore
+
PlayCountScore
+
RecencyScore
+
ArtistAffinity
+
GenreAffinity
+
LanguageAffinity
+
GameplayScore
```

## 第一版评分输出

对各输入特征先做必要的非线性变换，再使用配置化权重组合并归一化到 `[0, 1]`。这是规则驱动的加权模型，不应笼统称为原始特征上的线性概率模型。

```ts
interface FamiliarityEstimate {
  familiarityScore: number; // [0, 1]，熟悉度评分
  confidence: number;       // [0, 1]，证据可信度评分，不是统计概率
  reasons: string[];        // 实际证据、特征变换及其评分贡献
}
```

保留数值矩阵供选曲计算，同时提供逐玩家、逐歌曲的可信度与证据解释。`PlayerMusicProfile.confidence` 不能替代这层逐歌曲可信度。

无记录时允许使用可解释的低可信度先验，但必须标明“证据不足”，不能将先验伪装成实际识别证据。可信度规则与权重应在 `familiarity-model.md` 中记录并配置；不得按画像来源数量简单冒充统计置信度。

---

# 十九、播放次数非线性

禁止简单：

```text
100 次播放
=
10 次播放的 10 倍熟悉度
```

可以使用：

```text
log
sigmoid
piecewise function
```

例如：

```ts
playScore =
  Math.min(
    1,
    Math.log1p(playCount) /
      Math.log1p(50)
  );
```

实际函数必须独立封装并测试。

---

# 二十、Familiarity Matrix

实现：

```text
Player × Song Familiarity Matrix
```

例如：

```text
                  A       B       C       D

华语 Song A      .91     .72     .11     .35

English Song B  .16     .88     .62     .48

Korean Song C   .32     .76     .84     .27

Rock Song D     .78     .54     .66     .81

Jazz Song E     .21     .33     .67     .59
```

必须保证系统对所有音乐类型一视同仁。

不要让矩阵逻辑出现：

```text
AniSong 特殊逻辑
J-Pop 特殊逻辑
```

除非未来明确有游戏规则需要。

矩阵中的 `.91`、`.72` 等均是熟悉度评分示例，不是识别概率。

统一展示与统计口径：

- “熟悉歌曲数”：评分达到配置门槛的歌曲数量，是基于评分规则的估计，不是真实认识情况的保证。
- “熟悉覆盖率”：熟悉歌曲数除以当前完整可玩题组的歌曲数。
- “熟悉覆盖分”：评分之和，仅用于连续增益比较，不称为“预计认识歌曲数”。
- 可信度单独展示、单独检查，低可信度不能在汇总时被隐藏。

---

# 二十一、公平选曲算法

核心目标：

```text
SelectionScore =
α Fairness
+
β Diversity
+
γ Competition
+
δ Exploration
```

## 逐首更新的选曲过程

第一版使用可复现的贪心选曲：从空题组开始，每加入一首歌，都更新所有玩家的熟悉覆盖，并重新计算剩余候选歌曲对整个题组的边际增益。禁止预先为歌曲计算一个静态分数后一次排序取前 N 首。

1. 先应用可用性、ban 列表、已选歌曲及明确的历史歌曲排除条件；ban 歌曲不得通过重新生成自动回到本轮。
2. 选曲时以请求题组长度 `N` 计算最低目标 `ceil(N × minCoverageRatio)`，不得因题组尚未选满而降低目标。
3. 定义玩家缺口 `d_u = max(0, 目标熟悉歌曲数 - 当前熟悉歌曲数)`。歌曲的补缺收益为加入前后 `sum(d_u²)` 的下降量，使同样补一首时优先改善缺口更大的成员。
4. 当有候选歌曲能减少缺口时，先最大化补缺收益；收益相同时，再比较原有公平、多样性、竞争性、探索性的配置化综合边际增益。
5. 当没有候选歌曲能减少缺口时，按综合边际增益继续选择，并记录尚未满足的覆盖需求。多样性必须依赖参与者与候选库，不能奖励无理由添加无人熟悉的类别。
6. 所有比较仍同分时，按稳定歌曲 ID 的代码单元顺序升序选择；不放回，直到达到请求长度或候选耗尽。
7. 完成后对最终可玩曲库执行独立公平评估，不能根据选曲过程直接宣称公平。

共同熟悉歌曲与个人主场歌曲参与同一轮候选比较，不先按交集固定占用题组名额。解释必须来自本次计算，记录覆盖变化、补缺收益及其他实际贡献，不得由主持人事后编造理由。

贪心算法不保证全局最优。只能报告“本次未找到达标题组”；仅凭贪心失败不能断言“数学上不存在公平方案”。候选库缺少某人的熟悉内容时，应明确指出数据或可用内容的不足。

---

# 二十二、Fairness

Fairness 不是：

```text
所有歌曲所有人都认识
```

而是：

> 一个完整题组中，每个玩家都应该获得合理数量的熟悉内容。

例如：

```text
GOOD

Player A   6
Player B   5
Player C   6
Player D   5
```

而：

```text
BAD

Player A   9
Player B   8
Player C   2
Player D   1
```

必须被显著惩罚。

## 最低覆盖、差距与可信度检查

第一版使用以下可配置试验默认值：

| 配置 | Mock 默认值 | 含义 |
| --- | --- | --- |
| `familiarityThreshold` | `0.6` | 评分大于等于门槛即计为熟悉歌曲 |
| `minCoverageRatio` | `0.25` | 每人至少有 `ceil(M × 0.25)` 首熟悉歌曲 |
| `maxCoverageGap` | `0.40` | 最高与最低熟悉覆盖率之差不得超过 40 个百分点 |
| `lowConfidenceThreshold` | `0.5` | 低于该值视为低可信度估计 |
| `maxLowConfidenceRatio` | `0.5` | 任一成员低可信度曲目比例超过一半即证据不足 |

`M` 是评估时最终可玩题组的实际曲目数。门槛相等算通过；低可信度定义使用严格小于，低可信度占比告警使用严格大于。覆盖、差距、可信度分别检查，任何一项未通过都进入等待房主选择。

这些数值只用于 Mock Demo 与边界测试，未经真实玩家验证，必须集中配置并在输出中标明版本。后续通过场景试验和真实反馈调整，不能宣传为科学确定的公平界限。

所有人覆盖都低时，即使差距为零，也不能通过最低覆盖检查。即使覆盖与差距达标，证据不足时也必须单独提示。不能仅根据曲风、语言标签或“六比一”的人数构成判定是否适合游戏。

## ban 后及成员变化后的处理

在初次生成、ban 曲结束、换曲、重新生成、成员变化后，对最终可玩题组重新评估；评分依据或评估配置变化也必须使旧评估失效。ban 进行中不得用旧评估启动游戏。

检查未通过时保留 ban 结果，暂停开局，向房主展示：每人熟悉歌曲数与覆盖率、最大差距、证据不足情况，以及具体未通过的检查。措辞应说明“当前曲库可能无法提供均衡参与机会”，不将结果归咎于少数成员。

房主必须明确选择：

- 扩大或更换可用候选库后重新生成，并再次评估；只有新增内容能覆盖不足成员时，扩库才可能有效。
- 调整玩法；首期仅提供建议，修改当前玩法需重新评估，不在本任务实现其他真实游戏。
- 结束本次游戏。
- 阅读告警后知情继续，保留评估结果与确认记录；不得把此选择显示为“已恢复公平”。

默认不自动补曲、不撤销 ban、不自动继续。知情继续仅适用于当前成员、曲库、玩法、评分依据与评估配置的版本；任一变化后旧确认失效。该确认只是游戏体验风险选择，不能越过基础数据和游戏有效性要求。

没有玩家或最终曲库为空时禁止开局，知情继续也不能绕过。候选耗尽导致曲目少于请求长度时，明确显示请求数量与实际数量并等待房主选择；非空且被确认的缩短题组可按实际长度开始，不得静默声称已满足原请求。

---

# 二十三、Diversity

Diversity 必须同时考虑多个维度：

```text
Genre
Language
Region
Artist
Era
Culture
Franchise
```

但是：

> Diversity 不等于机械平均。

例如如果一个派对所有人都主要听华语音乐：

```text
强行加入大量完全无人熟悉的欧洲小语种音乐
```

并不会更公平。

因此 Diversity 应根据：

```text
Player Profiles
+
Candidate Pool
+
Party Context
```

动态计算。

---

# 二十四、Competition

一些歌曲应该：

> 同时被多个玩家熟悉。

例如：

```text
P1 = .81
P2 = .77
P3 = .65
P4 = .73
```

这种歌曲非常适合抢答型游戏。

Competition Score 应鼓励：

```text
多人有机会识别
```

而不是：

```text
只有一个玩家必然知道
```

---

# 二十五、Personal Home Ground

在候选内容支持的情况下，应努力实现：

> 不同玩家能够获得自己的优势领域；无法满足时必须明确报告覆盖不足。

例如派对成员：

```text
A
华语流行 / 经典老歌

B
欧美流行 / Rock

C
Hip-Hop / R&B

D
K-Pop / Electronic

E
J-Pop / Game Music
```

最终题组不能只追求最大交集。

应该适度加入：

```text
A 熟悉的歌曲
B 熟悉的歌曲
C 熟悉的歌曲
D 熟悉的歌曲
E 熟悉的歌曲
```

以增加不同音乐背景玩家的参与机会；实际是否达到覆盖要求仍由最终公平评估判断。

---

# 二十六、Exploration

允许少量：

```text
玩家没有那么熟悉
```

但具有：

```text
代表性
热门度
跨文化价值
新鲜感
```

的歌曲。

第一版可以尝试：

```text
50% 共同熟悉区

30% 玩家主场区

20% 探索区
```

但所有比例必须：

```text
configurable
```

不能硬编码。

上述 `50% / 30% / 20%` 是可配置的软目标，不是强制配额。它们不能压过最低覆盖需求，也不能要求在没有交集或没有足够主场歌曲时凑齐数量。第一版不预留固定交集名额；若覆盖需求导致比例偏离，输出真实比例及偏离原因。

---

# 二十七、Party Context

选曲不仅依赖画像。

还要考虑：

```text
party size

party duration

game type

current difficulty

round number

previous songs

player performance

player fatigue

requested mood
```

例如：

```text
刚开场
→ 更多共同熟悉歌曲

中段
→ 更多个人主场

高潮阶段
→ 更多竞争性歌曲

尾声
→ 可加入代表性强或情绪统一的歌曲
```

第一版可以简单实现，但数据结构要预留。

第一版同时传递请求题组长度、当前 ban 列表和评估配置。明确区分“可供选择的候选库”和“实际将播放的最终题组”；扩大候选库不等于自动增加本局长度。成员、题组或玩法变化必须更新评估版本。

---

# 二十八、AI Party Host

建立：

```text
PartyHostAgent
```

第一版：

```text
MockPartyHostAgent
```

不要立即连接外部 LLM。

输入：

```text
PartyState

PlayerMusicProfiles

GameResult

SelectionResult
```

输出：

```ts
interface HostDecision {
  action: HostAction;
  reason: string;
  message: string;
}
```

公平结论由确定性评估器提供。Mock 主持人只根据结构化结果组织说明、提出补救建议，不自行推测公平门槛、不伪造缺失的音乐数据、不替房主作出知情继续决定。

首期用 Mock 状态转换与 Demo 演示等待房主选择的流程，无需真实 LLM 或完整房间 UI。以后即使接入 GPT，也只用于主持话术或辅助构造场景；选曲、指标计算、公平判定和开局权限仍由程序控制。

---

# 二十九、Host Action

建立白名单，例如：

```text
START_GAME

START_WARMUP

GENERATE_PLAYLIST

REGENERATE_PLAYLIST

CHANGE_DIFFICULTY

START_NEXT_ROUND

SHOW_RESULT

END_PARTY
```

不要允许 LLM 任意输出系统命令。

补充 `REQUEST_HOST_CHOICE`，用于请求房主处理公平告警。`START_GAME` 和 `START_NEXT_ROUND` 必须经过程序侧开局检查，不能仅因 Agent 输出该动作就执行。

程序必须验证：基础有效性通过，当前成员和最终曲库等输入与评估版本一致，并且评估通过，或房主已对该版本作出有效的知情继续确认。未完成 ban、缺少当前评估、仍在等待选择时不得启动。

---

# 三十、PartyState

至少包含：

```text
partyId

players

playerProfiles

currentGame

currentRound

currentPlaylist

gameHistory

difficulty

hostState

partyPreferences
```

PartyState 是：

```text
AI Host
Playlist Engine
Game Adapter
```

之间的重要共享状态。

为首期公平闭环补充最小状态：

```text
bannedSongIds
selectionVersion
fairnessAssessment
hostState = ready | awaiting_host_choice | ended
hostAcknowledgement（可选，包含确认版本与确认动作）
```

以上是相关状态的最小扩展，可与现有游戏阶段并存。`selectionVersion` 表示成员、题组、玩法、评分依据和评估配置构成的评估上下文版本；上下文改变时必须更新、清除旧确认并重新评估。ban 尚未结束时独立阻止开局。

评估通过后可进入 ready；检查未通过则进入 awaiting_host_choice；有效知情继续可使非空有效题组进入 ready，但原始告警仍保留。选择结束进入 ended。确认操作来自房主，不得由主持 Agent 自动生成。

---

# 三十一、游戏抽象

建立：

```ts
interface MusicGame {
  start(): Promise<void>;

  getState(): GameState;

  getResult(): GameResult;

  stop(): Promise<void>;
}
```

第一版：

```text
MockKarutaGameAdapter
```

未来接入现有 Karuta。

---

# 三十二、统一游戏事件

定义：

```text
GAME_STARTED

ROUND_STARTED

SONG_STARTED

PLAYER_ACTION

ANSWER_CORRECT

ANSWER_WRONG

ROUND_FINISHED

GAME_FINISHED
```

Karuta 自己的 WebSocket 事件通过 Adapter 转换。

Party Host 不直接依赖 Karuta 底层协议。

---

# 三十三、建议 Monorepo 架构

使用 TypeScript。

建议：

```text
ai-music-party/

apps/

  web/

  server/

packages/

  core/
    party/
    player/
    song/

  music-profile/
    profile/
    evidence/
    familiarity/

  music-taxonomy/
    genre/
    language/
    region/
    culture/

  music-sources/
    interface/
    mock/
    qqmusic/

  playlist-engine/
    fairness/
    diversity/
    competition/
    exploration/

  ai-host/
    agent/
    actions/
    prompts/
    mock/

  games/
    core/
    karuta/

  shared/
    types/
    config/
    utils/

docs/

scripts/

tests/
```

可以优化。

但必须保持：

```text
音乐数据来源
↓
音乐标准化
↓
画像
↓
熟悉度
↓
选曲
↓
AI Host
↓
游戏
```

之间低耦合。

---

# 三十四、推荐技术栈

优先：

```text
pnpm workspace

TypeScript

React

Vite

Node.js

REST

WebSocket

Zod

Vitest

ESLint

Prettier
```

不要过度工程化。

暂时不要：

```text
Kafka
Kubernetes
微服务
向量数据库
复杂 ML pipeline
```

比赛项目优先：

```text
稳定
简单
可展示
可解释
可迭代
```

---

# 三十五、Mock 数据必须足够多元

这是非常重要的要求。

**禁止创建一个主要由日语、动漫、游戏音乐组成的 Mock Dataset。**

Mock Songs 至少包含：

```text
60~100 首歌曲
```

并覆盖不同音乐生态。

例如：

### 华语

```text
Mandopop
Cantopop
Chinese Rock
Chinese Hip-Hop
Chinese Indie
华语经典老歌
网络音乐
```

### 英语音乐

```text
Pop
Rock
Hip-Hop
R&B
Electronic
Indie
Country
Jazz
```

### 日韩

```text
K-Pop
J-Pop
J-Rock
AniSong
Vocaloid
Game Music
```

### 其他

适量包含：

```text
Latin
French Pop
Classical
Jazz
World Music
Instrumental
Soundtrack
```

不要要求每一类数量完全一样。

保持接近现实世界的多样性即可。

---

# 三十六、Mock 玩家

至少建立 6 个明显不同的玩家。

例如：

```text
Alice

华语流行
粤语
经典老歌
部分欧美流行
```

```text
Bob

US Hip-Hop
R&B
English Pop
少量 Electronic
```

```text
Carol

Rock
Metal
Indie
英语 + 华语摇滚
```

```text
Dave

K-Pop
Electronic
Mainstream Pop
```

```text
Eve

J-Pop
Game Music
AniSong
Vocaloid
```

```text
Frank

跨语言杂食

Mandopop
English Pop
Rock
Jazz
Soundtrack
```

这些名字只是 Mock 数据。

不要让任何一种用户被当成系统默认用户。

---

# 三十七、必须测试跨圈层派对

Demo Party 不应只有：

```text
Anime Music 玩家
```

而应该模拟：

```text
A 华语

B 欧美

C Hip-Hop

D K-Pop

E 日韩 / 游戏音乐

F 杂食
```

然后测试系统是否能够找到：

```text
共同熟悉区域
个人优势区域
跨圈层竞争歌曲
探索歌曲
```

---

# 三十八、Demo 输出

执行：

```bash
pnpm demo
```

应该打印：

```text
Party created

Players loaded

Music profiles generated

Candidate songs loaded

Familiarity matrix generated

Selecting playlist...
```

然后输出：

```text
Selected songs: 12

Languages:
Mandarin 3
English 3
Korean 2
Japanese 2
Cantonese 1
Instrumental 1

Genres:
Pop
Rock
Hip-Hop
Electronic
R&B
Game Music
...

Familiar song counts (score >= 0.6; rule-based estimates):

Alice: 7
Bob: 6
Carol: 6
Dave: 6
Eve: 7
Frank: 7

Fairness Score
Diversity Score
Competition Score
Exploration Score
```

具体结果由算法决定。

不是要求机械满足上述比例。

在原有跨圈层 Demo 之外，再运行“六名音游玩家与一名古典玩家”的独立场景。不得把原有六人多元 Demo 替换成以音游为默认的主数据集。

输出必须补充：每人的熟悉歌曲数、覆盖率、熟悉覆盖分、低可信度曲目比例，评估配置与版本、具体告警，以及当前能否开局。示例数字由真实算法结果生成，不固定伪造。

演示完整流程：生成题组 → 初次评估 → ban 掉古典玩家主场内容 → 重新评估并暂停 → 展示补救选项 → 注入明确标注的“模拟房主知情继续”输入 → 验证可开局 → 再改变曲库或成员 → 验证原确认失效。另演示剩余候选仍有可用主场内容时，房主选择扩库重选后的再次评估。

Demo 的模拟输入仅用于展示，不可作为真实系统自动代表房主确认的实现。

---

# 三十九、算法可解释性

SelectionResult 必须能够解释：

```text
为什么选择这首歌？
```

例如：

```text
Song A

Reason:
3 名玩家具有较高熟悉度

同时覆盖 English Rock

该类别此前出现较少

因此提高 Competition 与 Diversity
```

或者：

```text
Song B

Reason:
这是 Player C 的高熟悉区域

用于补偿 Player C 在前几轮较低的熟悉覆盖
```

这种解释未来可以交给 AI Host 转换成自然语言。

`SelectionResult` 在已选歌曲和逐首解释之外，至少携带结构化 `fairnessAssessment`：

- 当前评估版本与使用的配置。
- 每位玩家的熟悉歌曲数、覆盖率、熟悉覆盖分与低可信度比例。
- 请求曲目数、实际曲目数、最大覆盖率差距。
- 检查结果与机器可读的原因：覆盖不足、差距过大、证据不足、候选不足、空曲库或无玩家。

原因列表允许多项同时出现，不能用单一综合公平分掩盖最低覆盖或证据不足。逐首解释需保留加入当时的覆盖变化；ban 后的整体评估需基于最终曲库重新计算。主持人不能将“有熟悉内容”扩写成“有相同获胜概率”。

---

# 四十、测试

## Familiarity

测试：

```text
播放次数增加
→ Familiarity 不应下降

近期播放
→ 应高于非常久以前的播放

收藏
→ 应提高 familiar evidence

game_correct
→ 明显提高熟悉度

没有参与抢答
→ 不应自动降低熟悉度
```

---

## Global Music Coverage

新增测试：

```text
算法不能假设 Japanese music 是默认音乐

算法不能假设 Chinese music 是默认音乐

算法不能假设 English music 是默认音乐

算法不能假设 Pop 是默认 Genre
```

测试数据中必须包含：

```text
中文
英语
日语
韩语
粤语
Instrumental
Other
```

---

## Playlist Selection

测试：

```text
有足够候选且算法找到达标组合时，每位玩家获得最低熟悉覆盖

未达到最低覆盖或成员差距过大时，准确报告并暂停等待房主选择

不同音乐背景按同一规则评估，不把无法补足的候选内容缺口隐藏为公平

不会无理由全部来自一种语言

不会无理由全部来自一种 Genre

不会无理由全部来自一个 Artist

不会无理由全部来自一个 Franchise
```

但：

> 如果所有玩家画像本来就高度一致，则允许结果自然集中。

不要为了 Diversity 强行加入无人喜欢的歌曲。

## 公平闭环与失败场景

必须新增以下可复现测试：

1. 六名音游玩家加一名古典玩家：构造有足够古典候选且能达标的样例，验证逐首补缺与最终检查；减少可用古典内容后，验证告警与等待状态。
2. ban 掉少数成员主场歌曲：验证使用 ban 后的题组重算、告警、暂停；重选不得重新加入已 ban 歌曲。
3. 房主知情继续后可启动有效的非空题组；曲库、成员、玩法、评分依据或配置变化后，旧确认失效，不能直接启动。
4. 所有人熟悉覆盖都低但差距很小：最低覆盖检查仍失败；高评分但证据不足也不能静默通过。
5. 无共同交集时仍尝试分配个人主场；画像高度一致时允许歌曲自然集中，不为多样性硬塞无人熟悉的内容。
6. 没有玩家、空曲库禁止启动；候选不足时数量如实输出并暂停，不重复歌曲凑数；房主确认缩短题组后按实际长度评估与运行。
7. 测试门槛相等、刚低于或高于门槛，以及 `ceil` 舍入；验证低可信度占比恰好一半不会触发“超过一半”。
8. 使用有明确预期顺序的小矩阵，验证加入每首后都会重算边际增益，补缺优先级、稳定同分排序和无重复歌曲成立；相同输入输出一致。
9. 验证评分解释、逐首增益、最终覆盖与真实计算一致；未知画像不能被描述为确定不认识；未抢到不能自动降低熟悉度。
10. Agent 请求开局不能绕过等待状态或版本校验；房主确认不会清除原告警，也不会变成公平通过记录。

这些是对受控输入的算法和流程验证，不构成真实玩家体验验证，也不证明贪心算法能找到所有可行解或保证长期胜率公平。

---

# 四十一、README

生成高质量：

```text
README.md
```

包含：

1. 项目介绍
2. 产品问题
3. 用户场景
4. 核心理念
5. 系统架构
6. Music Profile
7. Familiarity Matrix
8. Playlist Engine
9. AI Party Host
10. Game Adapter
11. QQ Music 接入状态
12. Demo
13. Roadmap

明确说明：

> 本系统不针对特定国家、语言、曲风或音乐亚文化。

说明第一版使用未校准的熟悉度评分、可配置试验门槛和逐首贪心选曲。展示公平检查的适用范围、ban 后重新评估、房主知情继续以及候选内容不足的限制。不要把 Mock 测试通过表述为真实派对公平性已经验证。

---

# 四十二、docs

创建：

```text
docs/

architecture.md

music-profile.md

music-taxonomy.md

familiarity-model.md

playlist-selection.md

party-host.md

karuta-integration.md

qqmusic-integration.md

development-roadmap.md
```

在现有文档内补充，不必为每个规则创建空文件：

- `familiarity-model.md`：评分与概率的区别、逐歌曲可信度、证据贡献、未知数据处理。
- `playlist-selection.md`：逐首补缺与边际增益、试验配置、最终评估、ban 约束、候选不足与贪心局限。
- `party-host.md`：告警话术依据、等待房主选择、版本绑定确认、开局校验及 Mock 演示边界。

---

# 四十三、music-taxonomy.md

需要专门说明：

音乐标签是：

```text
开放体系
```

而不是封闭枚举。

解释区别：

```text
Genre
Language
Region
Culture
Franchise
Artist
Era
```

例如：

```text
Hip-Hop
```

是 Genre。

```text
English
```

是 Language。

```text
United States
```

是 Region。

```text
Anime Music
```

是 Culture。

```text
某游戏系列
```

是 Franchise。

这些不能混为一谈。

---

# 四十四、QQ Music Integration

记录未来希望获取：

```text
收藏歌曲

创建歌单

收藏歌单

近期播放

播放次数

Top Songs

Top Artists

Genre Distribution
```

并区分：

```text
Confirmed Official API

Awaiting Confirmation

Fallback
```

当前：

```text
Do not depend on unknown APIs.
```

---

# 四十五、环境变量

创建：

```text
.env.example
```

例如：

```env
PORT=

DATABASE_URL=

LLM_API_KEY=

QQMUSIC_API_KEY=
```

没有任何 API Key 时：

```text
项目必须完整运行 Mock Demo。
```

---

# 四十六、第一阶段明确不要做

暂时不要：

1. 调用未经确认的 QQ 音乐私有接口；
2. 真正连接 LLM；
3. 训练复杂音乐分类模型；
4. 建立固定用户类型分类器；
5. 重构整个 Karuta；
6. 做复杂账户系统；
7. 做生产级部署；
8. 做复杂管理后台。

尤其：

> 不要现在设计“华语型、欧美型、二次元型”等固定用户分类系统。

用户画像应该首先是：

```text
多维向量
```

而不是：

```text
单标签分类。
```

---

# 四十七、第一阶段验收目标

执行：

```bash
pnpm install

pnpm demo
```

能够完成：

```text
Mock Music Sources
        ↓
Player Profiles
        ↓
Familiarity Matrix
        ↓
Candidate Songs
        ↓
Fair Playlist Selection
        ↓
Selection Explanation
        ↓
Mock Party Host
```

首期验收还必须覆盖：

```text
首次生成并评估
        ↓
模拟 ban 曲后重新评估
        ↓
检查未通过 → 暂停并解释 → 等待房主选择
        ↓
有效知情继续 / 扩库重选并评估 / 结束
        ↓
成员或曲库等评估输入变化 → 旧确认失效
```

除 build / test / lint / demo 外，核对所有界面、文档和输出的术语：评分不等于概率，熟悉覆盖不等于胜率公平，贪心未达标不等于无解，扩库不保证解决内容不足。保持无 API Key 可运行，不新增真实 LLM、正式联网 ban 系统或其他真实游戏。

---

# 四十八、设计原则

整个工程始终遵守：

```text
Music Platform Agnostic

Language Agnostic

Region Agnostic

Genre Agnostic

Game Agnostic
```

QQ 音乐是：

```text
数据来源
```

Karuta 是：

```text
首个游戏
```

AniSong、华语、欧美、K-Pop 等是：

```text
音乐空间中的不同区域
```

它们都不应该成为底层系统默认前提。

最终目标是：

> 建立一个能够理解一群人不同音乐世界，并为他们找到公平、有趣交集的 AI 音乐派对系统。

---

# 四十九、执行顺序

现在按照：

1. 检查仓库状态；
2. 初始化 pnpm TypeScript Monorepo；
3. 创建目录；
4. 配置 TypeScript / ESLint / Prettier / Vitest；
5. 建立开放式 Music Taxonomy；
6. 建立 SongProfile；
7. 建立 PlayerMusicProfile；
8. 建立 Evidence Model；
9. 实现 MockMusicSource；
10. 实现 Familiarity Model；
11. 实现 Familiarity Matrix；
12. 实现 Playlist Selection；
13. 实现 MockPartyHost；
14. 实现 MockKarutaGameAdapter；
15. 建立全球化、多语言 Mock Dataset；
16. 创建跨音乐圈层 Demo Party；
17. 创建 `pnpm demo`；
18. 编写测试；
19. 编写 README；
20. 编写 docs；
21. 执行 build / test / lint / demo；
22. 修复明显问题；
23. 输出最终项目结构与完成状态。

不要生成大量没有实际使用价值的模板。

优先保证：

```text
领域模型没有文化偏置

音乐分类可以扩展

语言和地区不是写死的

Mock 数据足够多样

算法真正考虑多人公平

Demo 可以完整运行

未来容易接 QQ 音乐

未来容易接 Karuta

未来也容易增加其他音乐游戏
```

如果业务规则尚未确定：

```text
TODO
+
配置化
+
合理默认值
```

不要擅自写死。

最终代码保持清晰、简单、可测试、可解释，避免过度抽象和过度工程化。
## 本次修订记录（2026-09-20）

- 保留原有四十九个主章节、推荐技术栈、平台无关原则与 Mock 首期范围。
- 将未校准的“熟悉概率”改为熟悉度评分，分离逐歌曲证据可信度并修正 Demo 计数名称。
- 明确逐首重算、最低覆盖补缺优先、软比例目标与贪心算法局限。
- 增加初次生成及 ban 后评估、试验默认门槛、暂停等待房主、知情继续与版本失效规则。
- 补充结构化评估输出、主持人职责、失败场景、边界测试与文档验收。
- 原始 Prompt 保留不变；本文是后续初始化实现的修订输入，不表示业务系统已经实现。
