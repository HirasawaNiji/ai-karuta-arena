# Demo 歌单审阅稿 v0.2

对应 [Issue #65](https://github.com/HirasawaNiji/ai-karuta-arena/issues/65)。本表由 [候选数据](demo-candidates.json) 生成，供选曲和版本审阅。

共 **400 首候选**：**375 首**已在网易云网页精确到歌曲与专辑曲目表确认，**25 首**待定。16 个标签各列 30 首已确认候选，去重后为 **351 首**；其他已确认候选 24 首。

保留原稿 S001–S398 编号，新增 S399《フォニイ》和 S400《上弦の月》，用于分散虚拟歌手声库。歌曲可以属于多个标签。

## 阅读口径

- 核验日期：2026-10-03。证据为网易云官方网页专辑曲目表、歌曲链接、艺人署名和发行时间；从歌曲搜索未找到时进一步查询专辑。
- 年份是**所选网易云发行条目**的年份，可能为精选或再版年份。原稿的标题、歌手、专辑、年份、备注保存在 JSON 的 `originalProposal`，便于对照；它们不是已核验事实。
- 表内艺人采用平台署名。游戏原声有时列制作团队或作曲者，不能据此断言其本人演唱；原稿误署周深的《Da Capo》已改为 HOYO-MiX。
- 同版候选按网页版本标注、艺人和时长筛选；现场、混音、重录、TV Edit 和其他语种不自动替代。录音是否完全一致仍需后续试听确认。
- 单曲／EP优先；同专辑按平台 album ID 统计，不把不同 album ID 直接当成封面图片不同。封面的实际视觉辨识度留待卡牌审阅。
- 每个标签的30首推荐中，任一平台署名最多5首；合唱、制作团队和声库均保守计入，洛天依／洛天依Official 等别名归并。候选池中的备用曲另列，不宣称全池每个艺人都不超过5首。
- 标签沿用 WebUI 的 `onboarding-tags-v2`。语种按录音语言；影视指真人影视，动漫单列；真人演唱的虚构角色不标虚拟歌手。纯音乐和法语、虚构语言不强塞进现有语言标签。曲风是供审阅的编辑判断。
- 已确认收录只表示目录存在。本次不核验 VIP／下载资格，不下载或转换音频；未替换 PJSK 音频，也未接入运行时可玩题库。

## 总体组成

| 分组 | 标签 | 原稿及新增候选 | 已确认候选 | 推荐 | 推荐中最多同艺人 | 推荐涉及专辑 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 语言 | 国语 | 128 | 110 | 30 | 4 | 30 |
| 语言 | 粤语 | 30 | 30 | 30 | 4 | 30 |
| 语言 | 日语 | 77 | 77 | 30 | 3 | 30 |
| 语言 | 英语 | 120 | 118 | 30 | 3 | 30 |
| 语言 | 韩语 | 38 | 33 | 30 | 3 | 30 |
| 曲风 | 流行 | 249 | 233 | 30 | 4 | 30 |
| 曲风 | 摇滚 | 81 | 78 | 30 | 3 | 30 |
| 曲风 | 电子 | 80 | 77 | 30 | 3 | 30 |
| 曲风 | 民谣 | 43 | 42 | 30 | 2 | 30 |
| 曲风 | 说唱 | 39 | 34 | 30 | 2 | 30 |
| 曲风 | R&B | 54 | 51 | 30 | 5 | 29 |
| 曲风 | 国风／古风 | 44 | 37 | 30 | 3 | 27 |
| 内容与文化 | 动漫 | 36 | 35 | 30 | 2 | 30 |
| 内容与文化 | 游戏 | 33 | 32 | 30 | 5 | 30 |
| 内容与文化 | 虚拟歌手 | 32 | 32 | 30 | 5 | 30 |
| 内容与文化 | 影视 | 48 | 43 | 30 | 2 | 30 |

## 本轮重点修订

- 《当年情》改到《爱火》；《尘世闲游》改到《闪耀的群星》第一辑；《Grievous Lady》改到 Memories of Conflict。
- 《ヒビカセ》改为 No title＋ 的初音版本；《右肩の蝶》锁定镜音连；《普通DISCO》从原专辑页找回。
- 《LOVE SCENARIO》锁定 2018-01-25 韩语版 Return；DDU-DU DDU-DU、春日等检索时明确区分日语版和现场版。
- 《成都》《Yellow》《千本桜》《Shape of You》等优先采用独立发行；所有变化都可在 JSON 的 `originalProposal`、`revisionNote` 与来源链接中追溯。

## 待定曲目（不计入30首推荐）

没有定位到目标发行不等于平台全站不存在。这里保留原候选，不用同名翻唱或不同录音偷偷替换。

| 编号 | 歌曲 | 原拟艺人 | 原拟专辑 | 原因 |
| --- | --- | --- | --- | --- |
| S018 | 告白 | 气运联盟 | 告白（单曲） | 以歌名、歌手和专辑检索均未定位到气运联盟的目标发行；原稿曲名／署名需重审。 |
| S026 | 小幸运 | 田馥甄 | 小幸运（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S061 | Super Shy | NewJeans | Get Up | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S062 | Ditto | NewJeans | Ditto（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S064 | 봄날 (Spring Day) | BTS | You Never Walk Alone | 找到春日现场和翻唱；尚未定位原拟 You Never Walk Alone 中的原版。 |
| S070 | ANTIFRAGILE | LE SSERAFIM | ANTIFRAGILE | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S088 | Hype Boy | NewJeans | New Jeans | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S110 | 一无所有 | 崔健 | 新长征路上的摇滚 | 原拟专辑页面存在，但当前曲目表没有《一无所有》。 |
| S157 | 旅行的意义 | 陈绮贞 | 旅行的意义（单曲） | 找到《华丽的冒险》录音及 Guitar Ver.，与原拟单曲编曲是否一致未确认，暂不替换。 |
| S173 | God's Plan | Drake | Scary Hours | 检索出现时长 2:03 的同名条目，未当成原拟 Scary Hours 的原版。 |
| S184 | 孤独面店 | KEY.L刘聪 | KEY to L | KEY to L 专辑页面存在，但曲目表没有《孤独面店》；检索命中其他歌手版本，原稿署名需重审。 |
| S186 | 天干物燥 | GAI周延 | 天干物燥（单曲） | 检索主要命中现场版，未定位目标录音。 |
| S188 | 飘向北方 | 黄明志、王力宏 | 亚洲通车 | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S189 | 不用去猜 | Jony J | 不用去猜（单曲） | 《不用去猜》专辑下命中 Jazz Version，未擅自替代原拟版本。 |
| S195 | 爱错 | 王力宏 | 心中的日月 | 检索命中现场／翻唱，未定位原拟《心中的日月》录音。 |
| S196 | Forever Love | 王力宏 | 心中的日月 | 检索命中现场版本，未定位原拟《心中的日月》录音。 |
| S221 | 赤伶 | HITA | 赤伶（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S225 | 典狱司 | 音频怪物 | 典狱司（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S239 | 关山酒 | 等什么君 | 关山酒（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S242 | 辞九门回忆 | 等什么君 | 辞九门回忆（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S248 | 杀破狼 | JS | 仙剑奇侠传 电视原声带 | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S277 | 大鱼 | 周深 | 大鱼（单曲） | 找到《深的深》的“大鱼 (唱片版)”，与原拟单曲版本分开，等待选版。 |
| S295 | Melodies of Life (English Version) | 白鳥英美子 | Melodies of Life ～featured in FINAL FANTASY IX～ | 找到白鳥英美子在 FINAL FANTASY Vocal Collection 的同名歌曲，但网页未明确 English Version，暂不计入英语覆盖。 |
| S344 | 三寸天堂 | 严艺丹 | 三寸天堂（单曲） | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |
| S345 | 一直很安静 | 阿桑 | 寂寞在唱歌 | 歌曲及专辑检索未定位到目标原唱发行；不据此宣称网易云全站没有该曲，不采用同名翻唱替代。 |

## 共用专辑条目

以下只统计已确认候选；不同发行之间仍可能使用相同封面图片。

| 专辑 | 候选 |
| --- | --- |
| [安和桥北](https://music.163.com/#/album?id=2646285) | S140 安和桥、S143 斑马，斑马 |
| [如也](https://music.163.com/#/album?id=3098832) | S144 奇妙能力歌、S145 走马 |
| [之乎者也](https://music.163.com/#/album?id=10855) | S153 童年、S154 光阴的故事 |
| [David Tao](https://music.163.com/#/album?id=15199) | S191 爱很简单、S200 流沙 |
| [腐草为萤](https://music.163.com/#/album?id=2742059) | S223 棠梨煎雪、S224 锦鲤抄 |
| [人间不值得](https://music.163.com/#/album?id=75228515) | S230 九万字、S231 人间不值得 |
| [风起天阑](https://music.163.com/#/album?id=9896) | S234 不见长安、S235 风起天阑 |
| [悪ノ王国](https://music.163.com/#/album?id=45738) | S317 悪ノ娘、S319 悪ノ召使 |

## 语言

### 国语 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S001 | [晴天](https://music.163.com/#/song?id=186016) | 周杰伦 | [叶惠美](https://music.163.com/#/album?id=18905) | 2003 |
| S002 | [青花瓷](https://music.163.com/#/song?id=185811) | 周杰伦 | [我很忙](https://music.163.com/#/album?id=18886) | 2007 |
| S003 | [夜曲](https://music.163.com/#/song?id=185904) | 周杰伦 | [11月的萧邦](https://music.163.com/#/album?id=18896) | 2005 |
| S004 | [稻香](https://music.163.com/#/song?id=185709) | 周杰伦 | [魔杰座](https://music.163.com/#/album?id=18877) | 2008 |
| S005 | [江南](https://music.163.com/#/song?id=108914) | 林俊杰 | [第二天堂](https://music.163.com/#/album?id=10804) | 2004 |
| S007 | [修炼爱情](https://music.163.com/#/song?id=25727803) | 林俊杰 | [因你而在](https://music.163.com/#/album?id=2301158) | 2013 |
| S008 | [小酒窝](https://music.163.com/#/song?id=108468) | 林俊杰、蔡卓妍 | [JJ陆](https://music.163.com/#/album?id=10770) | 2008 |
| S009 | [十年](https://music.163.com/#/song?id=66842) | 陈奕迅 | [黑白灰](https://music.163.com/#/album?id=6548) | 2003 |
| S010 | [红豆](https://music.163.com/#/song?id=299936) | 王菲 | [唱游](https://music.163.com/#/album?id=29725) | 1998 |
| S011 | [后来](https://music.163.com/#/song?id=254574) | 刘若英 | [我等你](https://music.163.com/#/album?id=25437) | 2000 |
| S012 | [遇见](https://music.163.com/#/song?id=287319) | 孙燕姿 | [The Moment](https://music.163.com/#/album?id=28535) | 2003 |
| S013 | [倒带](https://music.163.com/#/song?id=209936) | 蔡依林 | [城堡](https://music.163.com/#/album?id=21343) | 2004 |
| S014 | [爱你](https://music.163.com/#/song?id=297839) | 王心凌 | [爱你](https://music.163.com/#/album?id=29562) | 2004 |
| S015 | [隐形的翅膀](https://music.163.com/#/song?id=327115) | 张韶涵 | [潘朵拉](https://music.163.com/#/album?id=32370) | 2006 |
| S016 | [童话](https://music.163.com/#/song?id=85580) | 光良 | [童话](https://music.163.com/#/album?id=8402) | 2005 |
| S017 | [知足](https://music.163.com/#/song?id=385965) | 五月天 | [知足 最真杰作选](https://music.163.com/#/album?id=38247) | 2005 |
| S019 | [情非得已](https://music.163.com/#/song?id=176999) | 庾澄庆 | [海啸](https://music.163.com/#/album?id=17918) | 2001 |
| S020 | [吻别](https://music.163.com/#/song?id=190449) | 张学友 | [吻别](https://music.163.com/#/album?id=19243) | 1993 |
| S021 | [演员](https://music.163.com/#/song?id=32507038) | 薛之谦 | [绅士](https://music.163.com/#/album?id=3154175) | 2015 |
| S022 | [年少有为](https://music.163.com/#/song?id=1293886117) | 李荣浩 | [耳朵](https://music.163.com/#/album?id=73914415) | 2018 |
| S023 | [起风了](https://music.163.com/#/song?id=1330348068) | 冯沁苑(买辣椒也用券) | [起风了](https://music.163.com/#/album?id=74715426) | 2018 |
| S024 | [有何不可](https://music.163.com/#/song?id=167876) | 许嵩 | [自定义](https://music.163.com/#/album?id=16953) | 2009 |
| S025 | [素颜](https://music.163.com/#/song?id=167827) | 许嵩、何曼婷 | [素颜](https://music.163.com/#/album?id=16949) | 2010 |
| S027 | [光年之外](https://music.163.com/#/song?id=449818741) | G.E.M.邓紫棋 | [光年之外](https://music.163.com/#/album?id=35093341) | 2016 |
| S028 | [如果可以](https://music.163.com/#/song?id=1890530891) | 韦礼安 | [如果可以](https://music.163.com/#/album?id=135391759) | 2021 |
| S029 | [想见你想见你想见你](https://music.163.com/#/song?id=1403215687) | 八三夭 | [想见你想见你想见你](https://music.163.com/#/album?id=83291813) | 2019 |
| S379 | [泡沫](https://music.163.com/#/song?id=233931) | G.E.M.邓紫棋 | [Xposed](https://music.163.com/#/album?id=23497) | 2012 |
| S382 | [小美满](https://music.163.com/#/song?id=2124381474) | 周深 | [小美满](https://music.163.com/#/album?id=185229004) | 2024 |
| S006 | [曹操](https://music.163.com/#/song?id=108795) | 林俊杰 | [曹操](https://music.163.com/#/album?id=10792) | 2006 |
| S030 | [乌梅子酱](https://music.163.com/#/song?id=1997438791) | 李荣浩 | [纵横四海](https://music.163.com/#/album?id=130148423) | 2022 |

### 粤语 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S031 | [海阔天空](https://music.163.com/#/song?id=347351) | Beyond | [乐与怒](https://music.163.com/#/album?id=34222) | 1993 |
| S032 | [光辉岁月](https://music.163.com/#/song?id=347639) | Beyond | [命运派对](https://music.163.com/#/album?id=34257) | 1990 |
| S033 | [喜欢你](https://music.163.com/#/song?id=347760) | Beyond | [秘密警察](https://music.163.com/#/album?id=34272) | 1988 |
| S034 | [K歌之王](https://music.163.com/#/song?id=67467) | 陈奕迅 | [打得火热](https://music.163.com/#/album?id=6595) | 2000 |
| S035 | [富士山下](https://music.163.com/#/song?id=65766) | 陈奕迅 | [What's Going On…?](https://music.163.com/#/album?id=6451) | 2006 |
| S036 | [浮夸](https://music.163.com/#/song?id=66282) | 陈奕迅 | [U87](https://music.163.com/#/album?id=6491) | 2005 |
| S037 | [陀飞轮](https://music.163.com/#/song?id=64638) | 陈奕迅 | [Time Flies](https://music.163.com/#/album?id=6375) | 2010 |
| S038 | [Monica](https://music.163.com/#/song?id=186372) | 张国荣 | [Leslie Cheung Four Seasons](https://music.163.com/#/album?id=18934) | 2011 |
| S039 | [当年情](https://music.163.com/#/song?id=28442679) | 张国荣 | [爱火](https://music.163.com/#/album?id=2794072) | 1986 |
| S040 | [追](https://music.163.com/#/song?id=188003) | 张国荣 | [宠爱](https://music.163.com/#/album?id=19045) | 1995 |
| S041 | [遥远的她](https://music.163.com/#/song?id=191232) | 张学友 | [遥远的她·Amour](https://music.163.com/#/album?id=19316) | 1986 |
| S042 | [李香兰](https://music.163.com/#/song?id=190741) | 张学友 | [梦中的你](https://music.163.com/#/album?id=19268) | 1990 |
| S043 | [饿狼传说](https://music.163.com/#/song?id=190270) | 张学友 | [饿狼传说](https://music.163.com/#/album?id=19226) | 1994 |
| S044 | [爱情陷阱](https://music.163.com/#/song?id=4871718) | 谭咏麟 | [爱情陷阱](https://music.163.com/#/album?id=489701) | 1985 |
| S045 | [一生中最爱](https://music.163.com/#/song?id=154627) | 谭咏麟 | [神话1991](https://music.163.com/#/album?id=15525) | 1991 |
| S046 | [容易受伤的女人](https://music.163.com/#/song?id=25769491) | 王菲 | [Coming Home](https://music.163.com/#/album?id=2302275) | 1992 |
| S047 | [暧昧](https://music.163.com/#/song?id=300197) | 王菲 | [Di-Dar](https://music.163.com/#/album?id=29752) | 1995 |
| S048 | [我的骄傲](https://music.163.com/#/song?id=288093) | 容祖儿 | [我的骄傲](https://music.163.com/#/album?id=28586) | 2003 |
| S049 | [处处吻](https://music.163.com/#/song?id=316752) | 杨千嬅 | [电光幻影](https://music.163.com/#/album?id=31370) | 2004 |
| S050 | [可惜我是水瓶座](https://music.163.com/#/song?id=317145) | 杨千嬅 | [Miriam's Music Box](https://music.163.com/#/album?id=31405) | 2002 |
| S051 | [终身美丽](https://music.163.com/#/song?id=328929) | 郑秀文 | [萤光粉红](https://music.163.com/#/album?id=32521) | 2001 |
| S052 | [花花宇宙](https://music.163.com/#/song?id=215239) | 陈慧琳 | [花花宇宙](https://music.163.com/#/album?id=21763) | 2000 |
| S053 | [相依为命](https://music.163.com/#/song?id=63886) | 陈小春 | [夜生活](https://music.163.com/#/album?id=6326) | 2004 |
| S054 | [友情岁月](https://music.163.com/#/song?id=193535) | 郑伊健 | [古惑仔II之猛龙过江](https://music.163.com/#/album?id=19519) | 1996 |
| S055 | [男儿当自强](https://music.163.com/#/song?id=116113) | 林子祥 | [林子祥精选之天长地久](https://music.163.com/#/album?id=11358) | 1993 |
| S056 | [祝福](https://music.163.com/#/song?id=318648) | 叶蒨文 | [祝福](https://music.163.com/#/album?id=31528) | 1988 |
| S057 | [沧海一声笑](https://music.163.com/#/song?id=171025) | 许冠杰 | ['90电影金曲精选](https://music.163.com/#/album?id=17190) | 1990 |
| S058 | [红日](https://music.163.com/#/song?id=115502) | 李克勤 | [红日](https://music.163.com/#/album?id=11307) | 1992 |
| S059 | [一生所爱](https://music.163.com/#/song?id=25707139) | 卢冠廷、莫文蔚 | [齐天周大圣之西游双记 电影歌乐游唱版](https://music.163.com/#/album?id=2286009) | 1995 |
| S060 | [囍帖街](https://music.163.com/#/song?id=308299) | 谢安琪 | [Binary](https://music.163.com/#/album?id=30609) | 2008 |

### 日语 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S353 | [Lemon](https://music.163.com/#/song?id=536622304) | 米津玄師 | [Lemon](https://music.163.com/#/album?id=37575103) | 2018 |
| S383 | [夜に駆ける](https://music.163.com/#/song?id=1409311773) | YOASOBI | [夜に駆ける](https://music.163.com/#/album?id=84072830) | 2019 |
| S384 | [群青](https://music.163.com/#/song?id=1472480890) | YOASOBI | [群青](https://music.163.com/#/album?id=94214994) | 2020 |
| S385 | [うっせぇわ](https://music.163.com/#/song?id=1489254523) | Ado | [うっせぇわ](https://music.163.com/#/album?id=97225639) | 2020 |
| S386 | [新時代](https://music.163.com/#/song?id=1954437911) | Ado | [新時代 (ウタ from ONE PIECE FILM RED)](https://music.163.com/#/album?id=146206367) | 2022 |
| S387 | [ドライフラワー](https://music.163.com/#/song?id=1485033549) | 優里 | [ドライフラワー](https://music.163.com/#/album?id=96440324) | 2020 |
| S388 | [怪獣の花唄](https://music.163.com/#/song?id=1447572611) | Vaundy | [strobo](https://music.163.com/#/album?id=89955472) | 2020 |
| S389 | [マリーゴールド](https://music.163.com/#/song?id=1293904824) | あいみょん | [マリーゴールド](https://music.163.com/#/album?id=71892557) | 2018 |
| S390 | [水平線](https://music.163.com/#/song?id=1869068541) | back number | [水平線](https://music.163.com/#/album?id=131721341) | 2021 |
| S391 | [Pretender](https://music.163.com/#/song?id=1365924378) | Official髭男dism | [Pretender](https://music.163.com/#/album?id=79193832) | 2019 |
| S392 | [白日](https://music.163.com/#/song?id=1347630432) | King Gnu | [白日](https://music.163.com/#/album?id=75662927) | 2019 |
| S393 | [死ぬのがいいわ](https://music.163.com/#/song?id=1449537106) | 藤井風 | [HELP EVER HURT NEVER](https://music.163.com/#/album?id=89709532) | 2020 |
| S354 | [First Love](https://music.163.com/#/song?id=22786083) | 宇多田ヒカル | [First Love](https://music.163.com/#/album?id=2093862) | 1999 |
| S394 | [One Last Kiss](https://music.163.com/#/song?id=1824020871) | 宇多田ヒカル | [One Last Kiss](https://music.163.com/#/album?id=123718729) | 2021 |
| S397 | [チェリー](https://music.163.com/#/song?id=817851) | スピッツ | [インディゴ地平線](https://music.163.com/#/album?id=81011) | 1996 |
| S398 | [歌うたいのバラッド](https://music.163.com/#/song?id=27090234) | 斉藤和義 | [歌うたいのバラッド](https://music.163.com/#/album?id=2569156) | 1997 |
| S117 | [Wherever you are](https://music.163.com/#/song?id=794134) | ONE OK ROCK | [Nicheシンドローム](https://music.163.com/#/album?id=78624) | 2010 |
| S137 | [ポリリズム](https://music.163.com/#/song?id=797328) | Perfume | [ポリリズム](https://music.163.com/#/album?id=79006) | 2007 |
| S249 | [残酷な天使のテーゼ](https://music.163.com/#/song?id=657666) | 高橋洋子 | [残酷な天使のテーゼ/FLY ME TO THE MOON](https://music.163.com/#/album?id=63263) | 1995 |
| S251 | [Butter-Fly](https://music.163.com/#/song?id=28850500) | 和田光司 | [Butter-Fly](https://music.163.com/#/album?id=2915091) | 1999 |
| S257 | [ブルーバード](https://music.163.com/#/song?id=718765) | いきものがかり | [ブルーバード](https://music.163.com/#/album?id=70331) | 2008 |
| S259 | [unravel](https://music.163.com/#/song?id=29017078) | TK from 凛として時雨 | [Fantastic Magic](https://music.163.com/#/album?id=2979005) | 2014 |
| S260 | [紅蓮華](https://music.163.com/#/song?id=1360592706) | LiSA | [紅蓮華](https://music.163.com/#/album?id=78702707) | 2019 |
| S262 | [残響散歌](https://music.163.com/#/song?id=1902315759) | Aimer | [残響散歌 / 朝が来る](https://music.163.com/#/album?id=137312763) | 2022 |
| S265 | [KICK BACK](https://music.163.com/#/song?id=1986803568) | 米津玄師 | [KICK BACK](https://music.163.com/#/album?id=152687983) | 2022 |
| S266 | [アイドル](https://music.163.com/#/song?id=2034742057) | YOASOBI | [アイドル](https://music.163.com/#/album?id=162749810) | 2023 |
| S274 | [前前前世 (movie ver.)](https://music.163.com/#/song?id=426881487) | RADWIMPS | [君の名は。](https://music.163.com/#/album?id=34841090) | 2016 |
| S276 | [打上花火](https://music.163.com/#/song?id=496869422) | Daoko、米津玄師 | [打上花火](https://music.163.com/#/album?id=35864443) | 2017 |
| S309 | [千本桜](https://music.163.com/#/song?id=26096272) | 黒うさP、初音ミク | [千本桜](https://music.163.com/#/album?id=2386546) | 2012 |
| S312 | [Tell Your World](https://music.163.com/#/song?id=22760363) | livetune、初音ミク | [Tell Your World EP](https://music.163.com/#/album?id=2090508) | 2012 |

### 英语 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S361 | [Love Story](https://music.163.com/#/song?id=19292984) | Taylor Swift | [Fearless](https://music.163.com/#/album?id=1770438) | 2008 |
| S362 | [Blank Space](https://music.163.com/#/song?id=1333151467) | Taylor Swift | [1989](https://music.163.com/#/album?id=74870322) | 2014 |
| S363 | [Cruel Summer](https://music.163.com/#/song?id=1382576173) | Taylor Swift | [Lover](https://music.163.com/#/album?id=80752440) | 2019 |
| S364 | [Rolling in the Deep](https://music.163.com/#/song?id=16435051) | Adele | [Rolling in the Deep](https://music.163.com/#/album?id=1515350) | 2011 |
| S365 | [Easy On Me](https://music.163.com/#/song?id=1887190390) | Adele | [30](https://music.163.com/#/album?id=135740501) | 2021 |
| S366 | [Shape of You](https://music.163.com/#/song?id=451703096) | Ed Sheeran | [Shape of You](https://music.163.com/#/album?id=35114127) | 2017 |
| S367 | [Photograph](https://music.163.com/#/song?id=28692519) | Ed Sheeran | [x (Deluxe Edition)](https://music.163.com/#/album?id=2840023) | 2014 |
| S368 | [Baby](https://music.163.com/#/song?id=18638057) | Justin Bieber、Ludacris | [Baby](https://music.163.com/#/album?id=1709614) | 2010 |
| S369 | [Love Yourself](https://music.163.com/#/song?id=1319395226) | Justin Bieber | [Purpose](https://music.163.com/#/album?id=74010988) | 2015 |
| S370 | [STAY](https://music.163.com/#/song?id=1859245776) | The Kid LAROI、Justin Bieber | [STAY](https://music.163.com/#/album?id=130016223) | 2021 |
| S371 | [Sugar](https://music.163.com/#/song?id=29019227) | Maroon 5 | [V](https://music.163.com/#/album?id=2980029) | 2014 |
| S372 | [Memories](https://music.163.com/#/song?id=1852069909) | Maroon 5 | [JORDI (Deluxe)](https://music.163.com/#/album?id=128749721) | 2021 |
| S373 | [Bad Romance](https://music.163.com/#/song?id=1386002735) | Lady Gaga | [The Fame Monster](https://music.163.com/#/album?id=81098777) | 2009 |
| S374 | [Firework](https://music.163.com/#/song?id=2871217) | Katy Perry | [Firework](https://music.163.com/#/album?id=289915) | 2010 |
| S375 | [bad guy](https://music.163.com/#/song?id=1355147933) | Billie Eilish | [WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?](https://music.163.com/#/album?id=78243642) | 2019 |
| S376 | [drivers license](https://music.163.com/#/song?id=1846473650) | Olivia Rodrigo | [SOUR](https://music.163.com/#/album?id=127725764) | 2021 |
| S377 | [Levitating](https://music.163.com/#/song?id=1433934518) | Dua Lipa | [Future Nostalgia](https://music.163.com/#/album?id=86827685) | 2020 |
| S378 | [Stay With Me](https://music.163.com/#/song?id=28531849) | Sam Smith | [Stay With Me](https://music.163.com/#/album?id=2822279) | 2014 |
| S201 | [Blinding Lights](https://music.163.com/#/song?id=1406633327) | The Weeknd | [Blinding Lights](https://music.163.com/#/album?id=83768303) | 2020 |
| S202 | [Save Your Tears](https://music.163.com/#/song?id=1432456852) | The Weeknd | [After Hours](https://music.163.com/#/album?id=86675621) | 2020 |
| S205 | [Talking to the Moon](https://music.163.com/#/song?id=25657283) | Bruno Mars | [Doo-Wops & Hooligans](https://music.163.com/#/album?id=2270045) | 2010 |
| S104 | [Yellow](https://music.163.com/#/song?id=17177324) | Coldplay | [Yellow](https://music.163.com/#/album?id=1582613) | 2000 |
| S118 | [Faded](https://music.163.com/#/song?id=36990266) | Alan Walker | [Faded](https://music.163.com/#/album?id=3406843) | 2015 |
| S120 | [Wake Me Up](https://music.163.com/#/song?id=27713920) | Avicii、Aloe Blacc | [True](https://music.163.com/#/album?id=2643040) | 2013 |
| S125 | [Closer](https://music.163.com/#/song?id=423228325) | The Chainsmokers、Halsey | [Closer](https://music.163.com/#/album?id=34796273) | 2016 |
| S171 | [See You Again](https://music.163.com/#/song?id=1313070401) | Wiz Khalifa、Charlie Puth | [Furious 7: Original Motion Picture Soundtrack](https://music.163.com/#/album?id=73645572) | 2015 |
| S346 | [My Heart Will Go On](https://music.163.com/#/song?id=1484889) | Céline Dion、James Horner | [Titanic: Music from the Motion Picture Soundtrack](https://music.163.com/#/album?id=151601) | 1997 |
| S162 | [Let Her Go](https://music.163.com/#/song?id=18161816) | Passenger | [All The Little Lights](https://music.163.com/#/album?id=1668243) | 2013 |
| S094 | [Bohemian Rhapsody](https://music.163.com/#/song?id=471969753) | Queen | [A Night At The Opera](https://music.163.com/#/album?id=35369179) | 1975 |
| S096 | [Hotel California](https://music.163.com/#/song?id=520521339) | Eagles | [Hotel California (40th Anniversary Expanded Edition)](https://music.163.com/#/album?id=36828631) | 2017 |

### 韩语 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S065 | [FAKE LOVE](https://music.163.com/#/song?id=557579695) | BTS (防弹少年团) | [LOVE YOURSELF 轉 'Tear'](https://music.163.com/#/album?id=38595209) | 2018 |
| S066 | [DDU-DU DDU-DU](https://music.163.com/#/song?id=573577071) | BLACKPINK | [SQUARE UP](https://music.163.com/#/album?id=39720022) | 2018 |
| S067 | [How You Like That](https://music.163.com/#/song?id=1458482960) | BLACKPINK | [How You Like That](https://music.163.com/#/album?id=91589723) | 2020 |
| S068 | [LOVE DIVE](https://music.163.com/#/song?id=1935324678) | IVE | [LOVE DIVE](https://music.163.com/#/album?id=143019035) | 2022 |
| S069 | [I AM](https://music.163.com/#/song?id=2037930593) | IVE | [I've IVE](https://music.163.com/#/album?id=163379998) | 2023 |
| S071 | [TOMBOY](https://music.163.com/#/song?id=1927421969) | i-dle | [I NEVER DIE](https://music.163.com/#/album?id=141688981) | 2022 |
| S072 | [Queencard](https://music.163.com/#/song?id=2046817456) | i-dle | [I feel](https://music.163.com/#/album?id=165382807) | 2023 |
| S073 | [Next Level](https://music.163.com/#/song?id=1845452960) | aespa | [Next Level](https://music.163.com/#/album?id=127491182) | 2021 |
| S075 | [Love Scenario](https://music.163.com/#/song?id=533017594) | iKON | [Return](https://music.163.com/#/album?id=37391213) | 2018 |
| S076 | [Really Really](https://music.163.com/#/song?id=469699065) | WINNER | [FATE NUMBER FOR](https://music.163.com/#/album?id=35326664) | 2017 |
| S077 | [Growl](https://music.163.com/#/song?id=27538357) | EXO | [`XOXO` Repackage Kiss Ver.](https://music.163.com/#/album?id=2630057) | 2013 |
| S089 | [Love Shot](https://music.163.com/#/song?id=1332662879) | EXO | [LOVE SHOT - The 5th Album Repackage](https://music.163.com/#/album?id=74794175) | 2018 |
| S078 | [Bad Boy](https://music.163.com/#/song?id=533455456) | Red Velvet | [The Perfect Red Velvet - The 2nd Album Repackage](https://music.163.com/#/album?id=37391373) | 2018 |
| S079 | [Psycho](https://music.163.com/#/song?id=1411586102) | Red Velvet | [‘The ReVe Festival’ Finale](https://music.163.com/#/album?id=84308261) | 2019 |
| S080 | [Feel Special](https://music.163.com/#/song?id=1392772737) | TWICE | [Feel Special](https://music.163.com/#/album?id=81856662) | 2019 |
| S081 | [What is Love?](https://music.163.com/#/song?id=551340976) | TWICE | [What is Love?](https://music.163.com/#/album?id=38276058) | 2018 |
| S082 | [Palette](https://music.163.com/#/song?id=473873431) | IU、G-DRAGON | [Palette](https://music.163.com/#/album?id=35377328) | 2017 |
| S083 | [밤편지 (Through the Night)](https://music.163.com/#/song?id=467590816) | IU | [밤편지](https://music.163.com/#/album?id=35306226) | 2017 |
| S084 | [눈, 코, 입 (Eyes, Nose, Lips)](https://music.163.com/#/song?id=28613217) | TAEYANG | [RISE](https://music.163.com/#/album?id=2857172) | 2014 |
| S085 | [Haru Haru](https://music.163.com/#/song?id=22673504) | BIGBANG | [Stand Up](https://music.163.com/#/album?id=2079736) | 2008 |
| S086 | [BANG BANG BANG](https://music.163.com/#/song?id=32408002) | BIGBANG | [A](https://music.163.com/#/album?id=3159550) | 2015 |
| S087 | [Gangnam Style](https://music.163.com/#/song?id=26552076) | PSY | [Gangnam Style (강남스타일)](https://music.163.com/#/album?id=2522390) | 2012 |
| S091 | [Gee](https://music.163.com/#/song?id=26082036) | 少女时代 | [Gee](https://music.163.com/#/album?id=2379005) | 2009 |
| S092 | [Nobody](https://music.163.com/#/song?id=22813728) | Wonder Girls | [The Wonder Years - Trilogy](https://music.163.com/#/album?id=2097195) | 2008 |
| S355 | [Stay With Me](https://music.163.com/#/song?id=444267925) | CHANYEOL、Punch | [도깨비 OST Part.1](https://music.163.com/#/album?id=35023453) | 2016 |
| S074 | [Drama](https://music.163.com/#/song?id=2098451525) | aespa | [Drama - The 4th Mini Album](https://music.163.com/#/album?id=178759177) | 2023 |
| S090 | [Sherlock (Clue + Note)](https://music.163.com/#/song?id=22761862) | SHINee | [‘Sherlock’ SHINee The 4th Mini Album](https://music.163.com/#/album?id=2090711) | 2012 |
| S281 | [POP/STARS](https://music.163.com/#/song?id=1321385655) | K/DA、Madison Beer、i-dle、Jaira Burns | [POP/STARS](https://music.163.com/#/album?id=74149887) | 2018 |
| S356 | [Beautiful](https://music.163.com/#/song?id=447280389) | Crush | [도깨비 OST Part.4](https://music.163.com/#/album?id=35064096) | 2016 |
| S357 | [Everytime](https://music.163.com/#/song?id=404184562) | CHEN、Punch | [태양의 후예 OST Part.2](https://music.163.com/#/album?id=34502213) | 2016 |


## 曲风

### 流行 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S001 | [晴天](https://music.163.com/#/song?id=186016) | 周杰伦 | [叶惠美](https://music.163.com/#/album?id=18905) | 2003 |
| S005 | [江南](https://music.163.com/#/song?id=108914) | 林俊杰 | [第二天堂](https://music.163.com/#/album?id=10804) | 2004 |
| S009 | [十年](https://music.163.com/#/song?id=66842) | 陈奕迅 | [黑白灰](https://music.163.com/#/album?id=6548) | 2003 |
| S010 | [红豆](https://music.163.com/#/song?id=299936) | 王菲 | [唱游](https://music.163.com/#/album?id=29725) | 1998 |
| S011 | [后来](https://music.163.com/#/song?id=254574) | 刘若英 | [我等你](https://music.163.com/#/album?id=25437) | 2000 |
| S012 | [遇见](https://music.163.com/#/song?id=287319) | 孙燕姿 | [The Moment](https://music.163.com/#/album?id=28535) | 2003 |
| S014 | [爱你](https://music.163.com/#/song?id=297839) | 王心凌 | [爱你](https://music.163.com/#/album?id=29562) | 2004 |
| S015 | [隐形的翅膀](https://music.163.com/#/song?id=327115) | 张韶涵 | [潘朵拉](https://music.163.com/#/album?id=32370) | 2006 |
| S021 | [演员](https://music.163.com/#/song?id=32507038) | 薛之谦 | [绅士](https://music.163.com/#/album?id=3154175) | 2015 |
| S027 | [光年之外](https://music.163.com/#/song?id=449818741) | G.E.M.邓紫棋 | [光年之外](https://music.163.com/#/album?id=35093341) | 2016 |
| S023 | [起风了](https://music.163.com/#/song?id=1330348068) | 冯沁苑(买辣椒也用券) | [起风了](https://music.163.com/#/album?id=74715426) | 2018 |
| S031 | [海阔天空](https://music.163.com/#/song?id=347351) | Beyond | [乐与怒](https://music.163.com/#/album?id=34222) | 1993 |
| S058 | [红日](https://music.163.com/#/song?id=115502) | 李克勤 | [红日](https://music.163.com/#/album?id=11307) | 1992 |
| S049 | [处处吻](https://music.163.com/#/song?id=316752) | 杨千嬅 | [电光幻影](https://music.163.com/#/album?id=31370) | 2004 |
| S353 | [Lemon](https://music.163.com/#/song?id=536622304) | 米津玄師 | [Lemon](https://music.163.com/#/album?id=37575103) | 2018 |
| S383 | [夜に駆ける](https://music.163.com/#/song?id=1409311773) | YOASOBI | [夜に駆ける](https://music.163.com/#/album?id=84072830) | 2019 |
| S354 | [First Love](https://music.163.com/#/song?id=22786083) | 宇多田ヒカル | [First Love](https://music.163.com/#/album?id=2093862) | 1999 |
| S361 | [Love Story](https://music.163.com/#/song?id=19292984) | Taylor Swift | [Fearless](https://music.163.com/#/album?id=1770438) | 2008 |
| S362 | [Blank Space](https://music.163.com/#/song?id=1333151467) | Taylor Swift | [1989](https://music.163.com/#/album?id=74870322) | 2014 |
| S366 | [Shape of You](https://music.163.com/#/song?id=451703096) | Ed Sheeran | [Shape of You](https://music.163.com/#/album?id=35114127) | 2017 |
| S368 | [Baby](https://music.163.com/#/song?id=18638057) | Justin Bieber、Ludacris | [Baby](https://music.163.com/#/album?id=1709614) | 2010 |
| S371 | [Sugar](https://music.163.com/#/song?id=29019227) | Maroon 5 | [V](https://music.163.com/#/album?id=2980029) | 2014 |
| S201 | [Blinding Lights](https://music.163.com/#/song?id=1406633327) | The Weeknd | [Blinding Lights](https://music.163.com/#/album?id=83768303) | 2020 |
| S364 | [Rolling in the Deep](https://music.163.com/#/song?id=16435051) | Adele | [Rolling in the Deep](https://music.163.com/#/album?id=1515350) | 2011 |
| S068 | [LOVE DIVE](https://music.163.com/#/song?id=1935324678) | IVE | [LOVE DIVE](https://music.163.com/#/album?id=143019035) | 2022 |
| S075 | [Love Scenario](https://music.163.com/#/song?id=533017594) | iKON | [Return](https://music.163.com/#/album?id=37391213) | 2018 |
| S091 | [Gee](https://music.163.com/#/song?id=26082036) | 少女时代 | [Gee](https://music.163.com/#/album?id=2379005) | 2009 |
| S002 | [青花瓷](https://music.163.com/#/song?id=185811) | 周杰伦 | [我很忙](https://music.163.com/#/album?id=18886) | 2007 |
| S003 | [夜曲](https://music.163.com/#/song?id=185904) | 周杰伦 | [11月的萧邦](https://music.163.com/#/album?id=18896) | 2005 |
| S004 | [稻香](https://music.163.com/#/song?id=185709) | 周杰伦 | [魔杰座](https://music.163.com/#/album?id=18877) | 2008 |

### 摇滚 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S031 | [海阔天空](https://music.163.com/#/song?id=347351) | Beyond | [乐与怒](https://music.163.com/#/album?id=34222) | 1993 |
| S032 | [光辉岁月](https://music.163.com/#/song?id=347639) | Beyond | [命运派对](https://music.163.com/#/album?id=34257) | 1990 |
| S033 | [喜欢你](https://music.163.com/#/song?id=347760) | Beyond | [秘密警察](https://music.163.com/#/album?id=34272) | 1988 |
| S116 | [倔强](https://music.163.com/#/song?id=386175) | 五月天 | [神的孩子都在跳舞](https://music.163.com/#/album?id=38259) | 2004 |
| S111 | [蓝莲花](https://music.163.com/#/song?id=168091) | 许巍 | [时光.漫步](https://music.163.com/#/album?id=16975) | 2002 |
| S109 | [无地自容](https://music.163.com/#/song?id=357279) | 黑豹乐队 | [黑豹](https://music.163.com/#/album?id=35273) | 1991 |
| S112 | [怒放的生命](https://music.163.com/#/song?id=155910) | 汪峰 | [怒放的生命](https://music.163.com/#/album?id=15701) | 2005 |
| S114 | [杀死那个石家庄人](https://music.163.com/#/song?id=386844) | 万能青年旅店 | [万能青年旅店 同名专辑](https://music.163.com/#/album?id=38306) | 2010 |
| S108 | [Last Dance](https://music.163.com/#/song?id=157276) | 伍佰 & China Blue | [爱情的尽头](https://music.163.com/#/album?id=15823) | 1996 |
| S093 | [Smells Like Teen Spirit](https://music.163.com/#/song?id=21303923) | Nirvana | [Nevermind](https://music.163.com/#/album?id=1967971) | 1991 |
| S094 | [Bohemian Rhapsody](https://music.163.com/#/song?id=471969753) | Queen | [A Night At The Opera](https://music.163.com/#/album?id=35369179) | 1975 |
| S095 | [Don't Stop Me Now](https://music.163.com/#/song?id=472045191) | Queen | [Jazz](https://music.163.com/#/album?id=35338705) | 1978 |
| S096 | [Hotel California](https://music.163.com/#/song?id=520521339) | Eagles | [Hotel California (40th Anniversary Expanded Edition)](https://music.163.com/#/album?id=36828631) | 2017 |
| S097 | [Sweet Child O' Mine](https://music.163.com/#/song?id=574922496) | Guns N' Roses | [Appetite For Destruction (Deluxe Edition)](https://music.163.com/#/album?id=39791256) | 1987 |
| S098 | [It's My Life](https://music.163.com/#/song?id=3950546) | Bon Jovi | [It's My Life](https://music.163.com/#/album?id=399653) | 2000 |
| S099 | [Numb](https://music.163.com/#/song?id=16686599) | Linkin Park | [Meteora](https://music.163.com/#/album?id=1537646) | 2003 |
| S100 | [In the End](https://music.163.com/#/song?id=1313303916) | Linkin Park | [Hybrid Theory](https://music.163.com/#/album?id=73668796) | 2000 |
| S101 | [Boulevard of Broken Dreams](https://music.163.com/#/song?id=2166812870) | Green Day | [Boulevard of Broken Dreams](https://music.163.com/#/album?id=199474794) | 2009 |
| S102 | [Seven Nation Army](https://music.163.com/#/song?id=21968164) | The White Stripes | [Seven Nation Army](https://music.163.com/#/album?id=2017933) | 2003 |
| S103 | [Don't Look Back in Anger](https://music.163.com/#/song?id=2702520366) | Oasis | [(What's The Story) Morning Glory?](https://music.163.com/#/album?id=271245586) | 1995 |
| S104 | [Yellow](https://music.163.com/#/song?id=17177324) | Coldplay | [Yellow](https://music.163.com/#/album?id=1582613) | 2000 |
| S107 | [Zombie](https://music.163.com/#/song?id=4330114) | The Cranberries | [Stars: The Best of 1992-2002](https://music.163.com/#/album?id=437570) | 2002 |
| S117 | [Wherever you are](https://music.163.com/#/song?id=794134) | ONE OK ROCK | [Nicheシンドローム](https://music.163.com/#/album?id=78624) | 2010 |
| S259 | [unravel](https://music.163.com/#/song?id=29017078) | TK from 凛として時雨 | [Fantastic Magic](https://music.163.com/#/album?id=2979005) | 2014 |
| S260 | [紅蓮華](https://music.163.com/#/song?id=1360592706) | LiSA | [紅蓮華](https://music.163.com/#/album?id=78702707) | 2019 |
| S265 | [KICK BACK](https://music.163.com/#/song?id=1986803568) | 米津玄師 | [KICK BACK](https://music.163.com/#/album?id=152687983) | 2022 |
| S251 | [Butter-Fly](https://music.163.com/#/song?id=28850500) | 和田光司 | [Butter-Fly](https://music.163.com/#/album?id=2915091) | 1999 |
| S071 | [TOMBOY](https://music.163.com/#/song?id=1927421969) | i-dle | [I NEVER DIE](https://music.163.com/#/album?id=141688981) | 2022 |
| S279 | [Legends Never Die](https://music.163.com/#/song?id=506196018) | 英雄联盟、Against the Current | [Legends Never Die](https://music.163.com/#/album?id=75816481) | 2017 |
| S001 | [晴天](https://music.163.com/#/song?id=186016) | 周杰伦 | [叶惠美](https://music.163.com/#/album?id=18905) | 2003 |

### 电子 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S118 | [Faded](https://music.163.com/#/song?id=36990266) | Alan Walker | [Faded](https://music.163.com/#/album?id=3406843) | 2015 |
| S119 | [Alone](https://music.163.com/#/song?id=444269135) | Alan Walker | [Alone](https://music.163.com/#/album?id=35023284) | 2016 |
| S120 | [Wake Me Up](https://music.163.com/#/song?id=27713920) | Avicii、Aloe Blacc | [True](https://music.163.com/#/album?id=2643040) | 2013 |
| S121 | [The Nights](https://music.163.com/#/song?id=29771146) | Avicii、Nicholas Furlong | [The Days / Nights (Remixes /EP)](https://music.163.com/#/album?id=3076168) | 2014 |
| S130 | [Levels](https://music.163.com/#/song?id=16345146) | Avicii | [Levels](https://music.163.com/#/album?id=1508300) | 2011 |
| S122 | [Titanium](https://music.163.com/#/song?id=17285338) | David Guetta、Sia | [Nothing but the Beat](https://music.163.com/#/album?id=1593522) | 2011 |
| S123 | [Don't You Worry Child](https://music.163.com/#/song?id=19196451) | Swedish House Mafia、John Martin | [Don't You Worry Child](https://music.163.com/#/album?id=1760516) | 2012 |
| S124 | [Something Just Like This](https://music.163.com/#/song?id=461347998) | The Chainsmokers、Coldplay | [Something Just Like This](https://music.163.com/#/album?id=35196287) | 2017 |
| S125 | [Closer](https://music.163.com/#/song?id=423228325) | The Chainsmokers、Halsey | [Closer](https://music.163.com/#/album?id=34796273) | 2016 |
| S126 | [Lean On](https://music.163.com/#/song?id=30854130) | Major Lazer、DJ Snake、MØ | [Lean On](https://music.163.com/#/album?id=3104652) | 2015 |
| S127 | [Stay](https://music.163.com/#/song?id=461518855) | Zedd、Alessia Cara | [Stay](https://music.163.com/#/album?id=35211172) | 2017 |
| S128 | [Clarity](https://music.163.com/#/song?id=19902364) | Zedd、Foxes | [Clarity](https://music.163.com/#/album?id=1836644) | 2012 |
| S129 | [Animals](https://music.163.com/#/song?id=26496942) | Martin Garrix | [Animals](https://music.163.com/#/album?id=2509498) | 2013 |
| S131 | [Get Lucky](https://music.163.com/#/song?id=26349642) | Daft Punk、Pharrell Williams、Nile Rodgers | [Random Access Memories](https://music.163.com/#/album?id=2462086) | 2013 |
| S132 | [One More Time](https://music.163.com/#/song?id=17455800) | Daft Punk | [Discovery](https://music.163.com/#/album?id=1609277) | 2001 |
| S133 | [We Found Love](https://music.163.com/#/song?id=21563189) | Rihanna、Calvin Harris | [We Found Love](https://music.163.com/#/album?id=1986952) | 2011 |
| S134 | [Summer](https://music.163.com/#/song?id=28306554) | Calvin Harris | [Summer](https://music.163.com/#/album?id=2771024) | 2014 |
| S135 | [Rather Be](https://music.163.com/#/song?id=33081037) | Clean Bandit、Jess Glynne | [Rather Be](https://music.163.com/#/album?id=3183005) | 2014 |
| S136 | [Shelter](https://music.163.com/#/song?id=425280053) | Porter Robinson、Madeon | [Shelter](https://music.163.com/#/album?id=34818014) | 2016 |
| S067 | [How You Like That](https://music.163.com/#/song?id=1458482960) | BLACKPINK | [How You Like That](https://music.163.com/#/album?id=91589723) | 2020 |
| S073 | [Next Level](https://music.163.com/#/song?id=1845452960) | aespa | [Next Level](https://music.163.com/#/album?id=127491182) | 2021 |
| S076 | [Really Really](https://music.163.com/#/song?id=469699065) | WINNER | [FATE NUMBER FOR](https://music.163.com/#/album?id=35326664) | 2017 |
| S087 | [Gangnam Style](https://music.163.com/#/song?id=26552076) | PSY | [Gangnam Style (강남스타일)](https://music.163.com/#/album?id=2522390) | 2012 |
| S201 | [Blinding Lights](https://music.163.com/#/song?id=1406633327) | The Weeknd | [Blinding Lights](https://music.163.com/#/album?id=83768303) | 2020 |
| S137 | [ポリリズム](https://music.163.com/#/song?id=797328) | Perfume | [ポリリズム](https://music.163.com/#/album?id=79006) | 2007 |
| S269 | [only my railgun](https://music.163.com/#/song?id=725692) | fripSide | [only my railgun](https://music.163.com/#/album?id=71074) | 2009 |
| S312 | [Tell Your World](https://music.163.com/#/song?id=22760363) | livetune、初音ミク | [Tell Your World EP](https://music.163.com/#/album?id=2090508) | 2012 |
| S333 | [普通DISCO](https://music.163.com/#/song?id=31140522) | ilem、洛天依Official、言和 | [普通DISCO](https://music.163.com/#/album?id=3111187) | 2016 |
| S229 | [芒种](https://music.163.com/#/song?id=1414858365) | 音阙诗听、赵方婧 | [芒种](https://music.163.com/#/album?id=84786022) | 2020 |
| S038 | [Monica](https://music.163.com/#/song?id=186372) | 张国荣 | [Leslie Cheung Four Seasons](https://music.163.com/#/album?id=18934) | 2011 |

### 民谣 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S138 | [成都](https://music.163.com/#/song?id=436514312) | 赵雷 | [成都](https://music.163.com/#/album?id=34930257) | 2016 |
| S139 | [南方姑娘](https://music.163.com/#/song?id=202373) | 赵雷 | [赵小雷](https://music.163.com/#/album?id=20339) | 2011 |
| S140 | [安和桥](https://music.163.com/#/song?id=27646205) | 宋冬野 | [安和桥北](https://music.163.com/#/album?id=2646285) | 2013 |
| S141 | [董小姐](https://music.163.com/#/song?id=25702068) | 宋冬野 | [摩登天空7](https://music.163.com/#/album?id=2282002) | 2012 |
| S142 | [南山南](https://music.163.com/#/song?id=29715551) | 马頔 | [孤岛](https://music.163.com/#/album?id=3064210) | 2014 |
| S144 | [奇妙能力歌](https://music.163.com/#/song?id=30431366) | 陈粒 | [如也](https://music.163.com/#/album?id=3098832) | 2015 |
| S146 | [我要你](https://music.163.com/#/song?id=2124660416) | 任素汐 | [我要你](https://music.163.com/#/album?id=185323621) | 2016 |
| S147 | [贝加尔湖畔](https://music.163.com/#/song?id=109998) | 李健 | [依然](https://music.163.com/#/album?id=10888) | 2011 |
| S148 | [传奇](https://music.163.com/#/song?id=110411) | 李健 | [似水流年](https://music.163.com/#/album?id=10921) | 2003 |
| S149 | [那些花儿](https://music.163.com/#/song?id=28996922) | 朴树 | [我去2000年](https://music.163.com/#/album?id=2975136) | 2003 |
| S150 | [平凡之路](https://music.163.com/#/song?id=28815250) | 朴树 | [猎户星座](https://music.163.com/#/album?id=35444067) | 2017 |
| S151 | [同桌的你](https://music.163.com/#/song?id=5281327) | 老狼 | [校园民谣 1](https://music.163.com/#/album?id=513675) | 1994 |
| S152 | [睡在我上铺的兄弟](https://music.163.com/#/song?id=519935280) | 老狼 | [恋恋风尘](https://music.163.com/#/album?id=10748) | 1995 |
| S153 | [童年](https://music.163.com/#/song?id=109530) | 罗大佑 | [之乎者也](https://music.163.com/#/album?id=10855) | 1982 |
| S155 | [橄榄树](https://music.163.com/#/song?id=285005) | 齐豫 | [橄榄树](https://music.163.com/#/album?id=28273) | 1979 |
| S156 | [外面的世界](https://music.163.com/#/song?id=143468) | 齐秦 | [冬雨](https://music.163.com/#/album?id=14305) | 1987 |
| S158 | [一生有你](https://music.163.com/#/song?id=376417) | 水木年华 | [一生有你](https://music.163.com/#/album?id=37243) | 2001 |
| S159 | [理想三旬](https://music.163.com/#/song?id=31445772) | 陈鸿宇 | [浓烟下的诗歌电台](https://music.163.com/#/album?id=3116882) | 2016 |
| S160 | [春风十里](https://music.163.com/#/song?id=38576323) | 鹿先森乐队 | [所有的酒，都不如你](https://music.163.com/#/album?id=34976129) | 2016 |
| S161 | [往后余生](https://music.163.com/#/song?id=557584888) | 马良 | [往后余生](https://music.163.com/#/album?id=95628100) | 2020 |
| S162 | [Let Her Go](https://music.163.com/#/song?id=18161816) | Passenger | [All The Little Lights](https://music.163.com/#/album?id=1668243) | 2013 |
| S163 | [The Sound of Silence](https://music.163.com/#/song?id=21598238) | Simon & Garfunkel | [Wednesday Morning, 3 A.M.](https://music.163.com/#/album?id=1989884) | 1964 |
| S164 | [Blowin' in the Wind](https://music.163.com/#/song?id=22088505) | Bob Dylan | [The Freewheelin' Bob Dylan](https://music.163.com/#/album?id=2031761) | 1963 |
| S165 | [Take Me Home, Country Roads](https://music.163.com/#/song?id=18650711) | John Denver | [Poems, Prayers & Promises](https://music.163.com/#/album?id=1711178) | 1971 |
| S166 | [Fast Car](https://music.163.com/#/song?id=21803396) | Tracy Chapman | [Tracy Chapman](https://music.163.com/#/album?id=2005729) | 1988 |
| S167 | [The A Team](https://music.163.com/#/song?id=1319866127) | Ed Sheeran | [+](https://music.163.com/#/album?id=74045710) | 2011 |
| S168 | [Vincent](https://music.163.com/#/song?id=17261598) | Don McLean | [American Pie](https://music.163.com/#/album?id=1590838) | 1971 |
| S389 | [マリーゴールド](https://music.163.com/#/song?id=1293904824) | あいみょん | [マリーゴールド](https://music.163.com/#/album?id=71892557) | 2018 |
| S083 | [밤편지 (Through the Night)](https://music.163.com/#/song?id=467590816) | IU | [밤편지](https://music.163.com/#/album?id=35306226) | 2017 |
| S120 | [Wake Me Up](https://music.163.com/#/song?id=27713920) | Avicii、Aloe Blacc | [True](https://music.163.com/#/album?id=2643040) | 2013 |

### 说唱 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S169 | [Lose Yourself](https://music.163.com/#/song?id=1916806812) | Eminem | [8 Mile (Music From And Inspired By The Motion Picture)](https://music.163.com/#/album?id=139746773) | 2002 |
| S170 | [Love the Way You Lie](https://music.163.com/#/song?id=17572247) | Eminem、Rihanna | [Recovery](https://music.163.com/#/album?id=1618490) | 2010 |
| S171 | [See You Again](https://music.163.com/#/song?id=1313070401) | Wiz Khalifa、Charlie Puth | [Furious 7: Original Motion Picture Soundtrack](https://music.163.com/#/album?id=73645572) | 2015 |
| S172 | [HUMBLE.](https://music.163.com/#/song?id=469104548) | Kendrick Lamar | [HUMBLE.](https://music.163.com/#/album?id=35297768) | 2017 |
| S174 | [Sunflower](https://music.163.com/#/song?id=1318733599) | Post Malone、Swae Lee | [Spider-Man: Into the Spider-Verse (Soundtrack From & Inspired by the Motion Picture)](https://music.163.com/#/album?id=74878945) | 2018 |
| S175 | [SICKO MODE](https://music.163.com/#/song?id=1298432425) | Travis Scott | [ASTROWORLD](https://music.163.com/#/album?id=72015396) | 2018 |
| S176 | [Old Town Road](https://music.163.com/#/song?id=1356795124) | Lil Nas X、Billy Ray Cyrus | [Old Town Road (Remix)](https://music.163.com/#/album?id=78339336) | 2019 |
| S177 | [Can't Hold Us](https://music.163.com/#/song?id=25677983) | Macklemore & Ryan Lewis、Ray Dalton | [The Heist](https://music.163.com/#/album?id=2273235) | 2012 |
| S178 | [In Da Club](https://music.163.com/#/song?id=16158605) | 50 Cent | [In Da Club](https://music.163.com/#/album?id=1490862) | 2004 |
| S179 | [Gangsta's Paradise](https://music.163.com/#/song?id=17112374) | Coolio、L.V. | [Gangsta's Paradise](https://music.163.com/#/album?id=1576482) | 1995 |
| S180 | [N.Y. State of Mind](https://music.163.com/#/song?id=21268933) | Nas | [Illmatic](https://music.163.com/#/album?id=1965317) | 1994 |
| S181 | [Empire State of Mind](https://music.163.com/#/song?id=18614153) | JAŸ-Z、Alicia Keys | [The Hits Collection Volume One [International Version (Explicit)]](https://music.163.com/#/album?id=1707459) | 2010 |
| S182 | [Changes](https://music.163.com/#/song?id=19375093) | 2Pac、Talent | [Greatest Hits](https://music.163.com/#/album?id=1781653) | 1998 |
| S183 | [Hey Ya!](https://music.163.com/#/song?id=17703803) | OutKast | [Speakerboxxx/The Love Below](https://music.163.com/#/album?id=1627847) | 2003 |
| S185 | [经济舱](https://music.163.com/#/song?id=1492049185) | KEY.L刘聪、KAFE.HU胡懿 | [经济舱](https://music.163.com/#/album?id=97722841) | 2020 |
| S187 | [阿司匹林](https://music.163.com/#/song?id=1396141677) | 王以太 | [演.说.家](https://music.163.com/#/album?id=82266485) | 2019 |
| S003 | [夜曲](https://music.163.com/#/song?id=185904) | 周杰伦 | [11月的萧邦](https://music.163.com/#/album?id=18896) | 2005 |
| S004 | [稻香](https://music.163.com/#/song?id=185709) | 周杰伦 | [魔杰座](https://music.163.com/#/album?id=18877) | 2008 |
| S065 | [FAKE LOVE](https://music.163.com/#/song?id=557579695) | BTS (防弹少年团) | [LOVE YOURSELF 轉 'Tear'](https://music.163.com/#/album?id=38595209) | 2018 |
| S066 | [DDU-DU DDU-DU](https://music.163.com/#/song?id=573577071) | BLACKPINK | [SQUARE UP](https://music.163.com/#/album?id=39720022) | 2018 |
| S075 | [Love Scenario](https://music.163.com/#/song?id=533017594) | iKON | [Return](https://music.163.com/#/album?id=37391213) | 2018 |
| S085 | [Haru Haru](https://music.163.com/#/song?id=22673504) | BIGBANG | [Stand Up](https://music.163.com/#/album?id=2079736) | 2008 |
| S086 | [BANG BANG BANG](https://music.163.com/#/song?id=32408002) | BIGBANG | [A](https://music.163.com/#/album?id=3159550) | 2015 |
| S082 | [Palette](https://music.163.com/#/song?id=473873431) | IU、G-DRAGON | [Palette](https://music.163.com/#/album?id=35377328) | 2017 |
| S281 | [POP/STARS](https://music.163.com/#/song?id=1321385655) | K/DA、Madison Beer、i-dle、Jaira Burns | [POP/STARS](https://music.163.com/#/album?id=74149887) | 2018 |
| S067 | [How You Like That](https://music.163.com/#/song?id=1458482960) | BLACKPINK | [How You Like That](https://music.163.com/#/album?id=91589723) | 2020 |
| S073 | [Next Level](https://music.163.com/#/song?id=1845452960) | aespa | [Next Level](https://music.163.com/#/album?id=127491182) | 2021 |
| S074 | [Drama](https://music.163.com/#/song?id=2098451525) | aespa | [Drama - The 4th Mini Album](https://music.163.com/#/album?id=178759177) | 2023 |
| S087 | [Gangnam Style](https://music.163.com/#/song?id=26552076) | PSY | [Gangnam Style (강남스타일)](https://music.163.com/#/album?id=2522390) | 2012 |
| S100 | [In the End](https://music.163.com/#/song?id=1313303916) | Linkin Park | [Hybrid Theory](https://music.163.com/#/album?id=73668796) | 2000 |

### R&B · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S191 | [爱很简单](https://music.163.com/#/song?id=150654) | 陶喆 | [David Tao](https://music.163.com/#/album?id=15199) | 1997 |
| S192 | [普通朋友](https://music.163.com/#/song?id=150623) | 陶喆 | [I'm OK](https://music.163.com/#/album?id=15196) | 1999 |
| S193 | [就是爱你](https://music.163.com/#/song?id=150430) | 陶喆 | [太平盛世](https://music.163.com/#/album?id=15185) | 2005 |
| S200 | [流沙](https://music.163.com/#/song?id=150667) | 陶喆 | [David Tao](https://music.163.com/#/album?id=15199) | 1997 |
| S197 | [黑色柳丁](https://music.163.com/#/song?id=150552) | 陶喆 | [黑色柳丁](https://music.163.com/#/album?id=15190) | 2002 |
| S194 | [唯一](https://music.163.com/#/song?id=27483167) | 王力宏 | [唯一](https://music.163.com/#/album?id=2569273) | 2001 |
| S005 | [江南](https://music.163.com/#/song?id=108914) | 林俊杰 | [第二天堂](https://music.163.com/#/album?id=10804) | 2004 |
| S007 | [修炼爱情](https://music.163.com/#/song?id=25727803) | 林俊杰 | [因你而在](https://music.163.com/#/album?id=2301158) | 2013 |
| S013 | [倒带](https://music.163.com/#/song?id=209936) | 蔡依林 | [城堡](https://music.163.com/#/album?id=21343) | 2004 |
| S190 | [凄美地](https://music.163.com/#/song?id=436346833) | 郭顶 | [飞行器的执行周期](https://music.163.com/#/album?id=35005583) | 2016 |
| S203 | [The Hills](https://music.163.com/#/song?id=32337668) | The Weeknd | [The Hills](https://music.163.com/#/album?id=3154642) | 2015 |
| S204 | [Leave the Door Open](https://music.163.com/#/song?id=1824927085) | Bruno Mars、Anderson .Paak、Silk Sonic | [An Evening With Silk Sonic](https://music.163.com/#/album?id=135905816) | 2021 |
| S205 | [Talking to the Moon](https://music.163.com/#/song?id=25657283) | Bruno Mars | [Doo-Wops & Hooligans](https://music.163.com/#/album?id=2270045) | 2010 |
| S206 | [That's What I Like](https://music.163.com/#/song?id=441120471) | Bruno Mars | [24K Magic](https://music.163.com/#/album?id=34898697) | 2016 |
| S207 | [If I Ain't Got You](https://music.163.com/#/song?id=16434100) | Alicia Keys | [If I Ain't Got You](https://music.163.com/#/album?id=1515264) | 2004 |
| S208 | [No One](https://music.163.com/#/song?id=16434089) | Alicia Keys | [No One](https://music.163.com/#/album?id=1515259) | 2007 |
| S209 | [We Belong Together](https://music.163.com/#/song?id=21234462) | Mariah Carey | [We Belong Together](https://music.163.com/#/album?id=1962395) | 2005 |
| S210 | [Halo](https://music.163.com/#/song?id=19550042) | Beyoncé | [I AM...SASHA FIERCE](https://music.163.com/#/album?id=1801258) | 2008 |
| S211 | [Say My Name](https://music.163.com/#/song?id=17380107) | Destiny's Child | [The Writing's On The Wall](https://music.163.com/#/album?id=1602167) | 1999 |
| S212 | [U Got It Bad](https://music.163.com/#/song?id=21974920) | Usher | [8701](https://music.163.com/#/album?id=2018573) | 2001 |
| S213 | [Dilemma](https://music.163.com/#/song?id=21273749) | Nelly、Kelly Rowland | [Dilemma](https://music.163.com/#/album?id=1965771) | 2002 |
| S214 | [So Sick](https://music.163.com/#/song?id=17470741) | Ne-Yo | [In My Own Words](https://music.163.com/#/album?id=1608586) | 2006 |
| S216 | [Kill Bill](https://music.163.com/#/song?id=2004562490) | SZA | [SOS](https://music.163.com/#/album?id=156059897) | 2022 |
| S218 | [Best Part](https://music.163.com/#/song?id=2109850345) | Daniel Caesar、H.E.R. | [Freudian](https://music.163.com/#/album?id=181396343) | 2017 |
| S077 | [Growl](https://music.163.com/#/song?id=27538357) | EXO | [`XOXO` Repackage Kiss Ver.](https://music.163.com/#/album?id=2630057) | 2013 |
| S078 | [Bad Boy](https://music.163.com/#/song?id=533455456) | Red Velvet | [The Perfect Red Velvet - The 2nd Album Repackage](https://music.163.com/#/album?id=37391373) | 2018 |
| S084 | [눈, 코, 입 (Eyes, Nose, Lips)](https://music.163.com/#/song?id=28613217) | TAEYANG | [RISE](https://music.163.com/#/album?id=2857172) | 2014 |
| S354 | [First Love](https://music.163.com/#/song?id=22786083) | 宇多田ヒカル | [First Love](https://music.163.com/#/album?id=2093862) | 1999 |
| S003 | [夜曲](https://music.163.com/#/song?id=185904) | 周杰伦 | [11月的萧邦](https://music.163.com/#/album?id=18896) | 2005 |
| S030 | [乌梅子酱](https://music.163.com/#/song?id=1997438791) | 李荣浩 | [纵横四海](https://music.163.com/#/album?id=130148423) | 2022 |

### 国风／古风 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S002 | [青花瓷](https://music.163.com/#/song?id=185811) | 周杰伦 | [我很忙](https://music.163.com/#/album?id=18886) | 2007 |
| S005 | [江南](https://music.163.com/#/song?id=108914) | 林俊杰 | [第二天堂](https://music.163.com/#/album?id=10804) | 2004 |
| S006 | [曹操](https://music.163.com/#/song?id=108795) | 林俊杰 | [曹操](https://music.163.com/#/album?id=10792) | 2006 |
| S222 | [牵丝戏](https://music.163.com/#/song?id=30352891) | 银临、Aki阿杰 | [牵丝戏](https://music.163.com/#/album?id=3098268) | 2015 |
| S223 | [棠梨煎雪](https://music.163.com/#/song?id=28188427) | 银临 | [腐草为萤](https://music.163.com/#/album?id=2742059) | 2013 |
| S224 | [锦鲤抄](https://music.163.com/#/song?id=28188434) | 银临、云之泣 | [腐草为萤](https://music.163.com/#/album?id=2742059) | 2013 |
| S226 | [琴师](https://music.163.com/#/song?id=184467) | 音频怪物 | [老妖的奇异之旅](https://music.163.com/#/album?id=18656) | 2011 |
| S227 | [上邪](https://music.163.com/#/song?id=28188382) | 小曲儿 | [曲倾天下](https://music.163.com/#/album?id=2742055) | 2012 |
| S228 | [红昭愿](https://music.163.com/#/song?id=452986458) | 音阙诗听 | [红昭愿](https://music.163.com/#/album?id=35114938) | 2017 |
| S229 | [芒种](https://music.163.com/#/song?id=1414858365) | 音阙诗听、赵方婧 | [芒种](https://music.163.com/#/album?id=84786022) | 2020 |
| S230 | [九万字](https://music.163.com/#/song?id=1335942780) | 黄诗扶 | [人间不值得](https://music.163.com/#/album?id=75228515) | 2019 |
| S231 | [人间不值得](https://music.163.com/#/song?id=1340543218) | 黄诗扶 | [人间不值得](https://music.163.com/#/album?id=75228515) | 2019 |
| S232 | [眉间雪](https://music.163.com/#/song?id=29567100) | HITA | [热门华语244](https://music.163.com/#/album?id=3029651) | 2014 |
| S233 | [倾尽天下](https://music.163.com/#/song?id=27571867) | 河图 | [倾尽天下](https://music.163.com/#/album?id=2639425) | 2013 |
| S235 | [风起天阑](https://music.163.com/#/song?id=101106) | 河图 | [风起天阑](https://music.163.com/#/album?id=9896) | 2010 |
| S236 | [山有木兮](https://music.163.com/#/song?id=455582652) | 伦桑 | [山有木兮-橙光游戏《人鱼传说之长生烛》主题曲](https://music.163.com/#/album?id=35148319) | 2017 |
| S237 | [吹梦到西洲](https://music.163.com/#/song?id=1376873330) | 恋恋故人难、黄诗扶、王敬轩（妖扬） | [吹梦到西洲](https://music.163.com/#/album?id=80292704) | 2019 |
| S238 | [琵琶行](https://music.163.com/#/song?id=476513774) | 奇然、沈谧仁 | [高考必背曲目](https://music.163.com/#/album?id=35453907) | 2017 |
| S240 | [踏山河](https://music.163.com/#/song?id=1804320463) | 七叔-叶泽浩 | [踏山河](https://music.163.com/#/album?id=120422780) | 2020 |
| S241 | [虞兮叹](https://music.163.com/#/song?id=1479526505) | 闻人听書_ | [虞兮叹](https://music.163.com/#/album?id=95455188) | 2020 |
| S243 | [盗将行](https://music.163.com/#/song?id=574566207) | 花粥、马雨阳 | [粥请客（二）](https://music.163.com/#/album?id=39752444) | 2018 |
| S246 | [半壶纱](https://music.163.com/#/song?id=28793140) | 刘珂矣 | [半壶纱](https://music.163.com/#/album?id=3286141) | 2016 |
| S335 | [权御天下](https://music.163.com/#/song?id=1404797306) | 洛天依Official | [Vsinger作品集-2](https://music.163.com/#/album?id=83523461) | 2019 |
| S337 | [霜雪千年](https://music.163.com/#/song?id=34923862) | 洛天依Official、乐正绫、COP | [洛天依作品集](https://music.163.com/#/album?id=3054014) | 2014 |
| S338 | [九九八十一](https://music.163.com/#/song?id=404543406) | 洛天依Official、乐正绫 | [九九八十一](https://music.163.com/#/album?id=34515080) | 2016 |
| S055 | [男儿当自强](https://music.163.com/#/song?id=116113) | 林子祥 | [林子祥精选之天长地久](https://music.163.com/#/album?id=11358) | 1993 |
| S057 | [沧海一声笑](https://music.163.com/#/song?id=171025) | 许冠杰 | ['90电影金曲精选](https://music.163.com/#/album?id=17190) | 1990 |
| S220 | [青丝](https://music.163.com/#/song?id=30500857) | 时光胶囊 | [记忆给他的礼物](https://music.163.com/#/album?id=3100556) | 2013 |
| S234 | [不见长安](https://music.163.com/#/song?id=101109) | 河图 | [风起天阑](https://music.163.com/#/album?id=9896) | 2010 |
| S244 | [出山](https://music.163.com/#/song?id=1313354324) | 花粥、王胜娚 | [粥请客（四）](https://music.163.com/#/album?id=73587275) | 2018 |


## 内容与文化

### 动漫 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S249 | [残酷な天使のテーゼ](https://music.163.com/#/song?id=657666) | 高橋洋子 | [残酷な天使のテーゼ/FLY ME TO THE MOON](https://music.163.com/#/album?id=63263) | 1995 |
| S250 | [魂のルフラン](https://music.163.com/#/song?id=25887756) | 高橋洋子 | [魂のルフラン](https://music.163.com/#/album?id=2339271) | 1997 |
| S251 | [Butter-Fly](https://music.163.com/#/song?id=28850500) | 和田光司 | [Butter-Fly](https://music.163.com/#/album?id=2915091) | 1999 |
| S252 | [brave heart](https://music.163.com/#/song?id=29816860) | 宮崎歩 | [brave heart](https://music.163.com/#/album?id=3081493) | 2000 |
| S253 | [めざせポケモンマスター](https://music.163.com/#/song?id=620282) | 松本梨香 | [めざせポケモンマスター](https://music.163.com/#/album?id=59123) | 1997 |
| S254 | [ウィーアー!](https://music.163.com/#/song?id=456063) | きただにひろし | [TVアニメ『ONE PIECE』オープニングテーマ「ウィーアー!」](https://music.163.com/#/album?id=44161) | 1999 |
| S255 | [GO!!!](https://music.163.com/#/song?id=725680) | FLOW | [GO!!!](https://music.163.com/#/album?id=71073) | 2013 |
| S256 | [COLORS](https://music.163.com/#/song?id=725273) | FLOW | [COLORS](https://music.163.com/#/album?id=71036) | 2013 |
| S257 | [ブルーバード](https://music.163.com/#/song?id=718765) | いきものがかり | [ブルーバード](https://music.163.com/#/album?id=70331) | 2008 |
| S258 | [リライト](https://music.163.com/#/song?id=679359) | ASIAN KUNG-FU GENERATION | [リライト](https://music.163.com/#/album?id=65640) | 2004 |
| S259 | [unravel](https://music.163.com/#/song?id=29017078) | TK from 凛として時雨 | [Fantastic Magic](https://music.163.com/#/album?id=2979005) | 2014 |
| S260 | [紅蓮華](https://music.163.com/#/song?id=1360592706) | LiSA | [紅蓮華](https://music.163.com/#/album?id=78702707) | 2019 |
| S261 | [炎](https://music.163.com/#/song?id=1482908655) | LiSA | [炎](https://music.163.com/#/album?id=96063833) | 2020 |
| S262 | [残響散歌](https://music.163.com/#/song?id=1902315759) | Aimer | [残響散歌 / 朝が来る](https://music.163.com/#/album?id=137312763) | 2022 |
| S263 | [Brave Shine](https://music.163.com/#/song?id=32364947) | Aimer | [Brave Shine](https://music.163.com/#/album?id=3140009) | 2015 |
| S264 | [廻廻奇譚](https://music.163.com/#/song?id=1500883816) | Eve | [廻廻奇譚 / 蒼のワルツ](https://music.163.com/#/album?id=99195838) | 2020 |
| S265 | [KICK BACK](https://music.163.com/#/song?id=1986803568) | 米津玄師 | [KICK BACK](https://music.163.com/#/album?id=152687983) | 2022 |
| S266 | [アイドル](https://music.163.com/#/song?id=2034742057) | YOASOBI | [アイドル](https://music.163.com/#/album?id=162749810) | 2023 |
| S267 | [勇者](https://music.163.com/#/song?id=2083182016) | YOASOBI | [勇者](https://music.163.com/#/album?id=175012713) | 2023 |
| S268 | [コネクト](https://music.163.com/#/song?id=705331) | ClariS | [コネクト](https://music.163.com/#/album?id=68710) | 2011 |
| S269 | [only my railgun](https://music.163.com/#/song?id=725692) | fripSide | [only my railgun](https://music.163.com/#/album?id=71074) | 2009 |
| S270 | [君の知らない物語](https://music.163.com/#/song?id=825665) | supercell | [君の知らない物語](https://music.163.com/#/album?id=81917) | 2009 |
| S271 | [Don't say "lazy"](https://music.163.com/#/song?id=1311347389) | 桜高軽音部 | [Don't say "lazy"](https://music.163.com/#/album?id=73467737) | 2009 |
| S272 | [プラチナ](https://music.163.com/#/song?id=643003) | 坂本真綾 | [プラチナ](https://music.163.com/#/album?id=61676) | 1999 |
| S273 | [鳥の詩](https://music.163.com/#/song?id=28151022) | Lia | [AIR ORIGINAL SOUNDTRACK](https://music.163.com/#/album?id=2735762) | 2002 |
| S274 | [前前前世 (movie ver.)](https://music.163.com/#/song?id=426881487) | RADWIMPS | [君の名は。](https://music.163.com/#/album?id=34841090) | 2016 |
| S275 | [ひまわりの約束](https://music.163.com/#/song?id=28884238) | 秦基博 | [ひまわりの約束](https://music.163.com/#/album?id=2923042) | 2014 |
| S276 | [打上花火](https://music.163.com/#/song?id=496869422) | Daoko、米津玄師 | [打上花火](https://music.163.com/#/album?id=35864443) | 2017 |
| S278 | [すずめ](https://music.163.com/#/song?id=1984758339) | RADWIMPS、十明 | [すずめ feat.十明](https://music.163.com/#/album?id=152281043) | 2022 |
| S136 | [Shelter](https://music.163.com/#/song?id=425280053) | Porter Robinson、Madeon | [Shelter](https://music.163.com/#/album?id=34818014) | 2016 |

### 游戏 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S279 | [Legends Never Die](https://music.163.com/#/song?id=506196018) | 英雄联盟、Against the Current | [Legends Never Die](https://music.163.com/#/album?id=75816481) | 2017 |
| S280 | [RISE](https://music.163.com/#/song?id=1313107065) | 英雄联盟、Mako、The Word Alive、The Glitch Mob | [RISE](https://music.163.com/#/album?id=73471912) | 2018 |
| S281 | [POP/STARS](https://music.163.com/#/song?id=1321385655) | K/DA、Madison Beer、i-dle、Jaira Burns | [POP/STARS](https://music.163.com/#/album?id=74149887) | 2018 |
| S282 | [Warriors](https://music.163.com/#/song?id=29401226) | Imagine Dragons | [Warriors (Official Anthem of League of Legends 2014 World Championship)](https://music.163.com/#/album?id=3017405) | 2014 |
| S283 | [GODS](https://music.163.com/#/song?id=2088507144) | NewJeans、英雄联盟 | [GODS](https://music.163.com/#/album?id=176384886) | 2023 |
| S284 | [神女劈观·唤情](https://music.163.com/#/song?id=1910911958) | HOYO-MiX | [「飞彩镌流年」游戏原声EP专辑](https://music.163.com/#/album?id=138671335) | 2022 |
| S285 | [轻涟 (La vaguelette)](https://music.163.com/#/song?id=2100334024) | HOYO-MiX | [原神-「轻涟 La vaguelette」游戏原声EP专辑](https://music.163.com/#/album?id=179193598) | 2023 |
| S286 | [璃月 (Liyue)](https://music.163.com/#/song?id=1492276411) | 陈致逸、HOYO-MiX | [原神-皎月云间之梦 Jade Moon Upon a Sea of Clouds](https://music.163.com/#/album?id=97767168) | 2020 |
| S287 | [尘世闲游 (Rex Incognito)](https://music.163.com/#/song?id=1817410059) | 陈致逸、HOYO-MiX | [原神-闪耀的群星 The Stellar Moments](https://music.163.com/#/album?id=122524667) | 2021 |
| S288 | [野火 (Wildfire)](https://music.163.com/#/song?id=2045806409) | HOYO-MiX、Jonathan Steingard | [崩坏星穹铁道-雪融于烬 Of Snow and Ember](https://music.163.com/#/album?id=165211433) | 2023 |
| S289 | [Rubia](https://music.163.com/#/song?id=1815684465) | 周深 | [Rubia](https://music.163.com/#/album?id=122254801) | 2021 |
| S291 | [Weight of the World / 壊レタ世界ノ歌](https://music.163.com/#/song?id=3434671084) | 岡部啓一、MONACA | [NieR: Automata Original Soundtrack](https://music.163.com/#/album?id=397550507) | 2017 |
| S292 | [カイネ / 救済](https://music.163.com/#/song?id=28921111) | 岡部啓一、石濱翔 | [NieR Replicant Mini Album "ウラギリノコエ"](https://music.163.com/#/album?id=2943167) | 2010 |
| S293 | [Eyes On Me](https://music.163.com/#/song?id=27735158) | 王菲 | [Separate Ways](https://music.163.com/#/album?id=2670014) | 2001 |
| S294 | [素敵だね](https://music.163.com/#/song?id=540418) | RIKKI | [FINAL FANTASY X Original Soundtrack](https://music.163.com/#/album?id=50612) | 2001 |
| S296 | [MEGALOVANIA](https://music.163.com/#/song?id=39224659) | Toby Fox | [UNDERTALE Soundtrack](https://music.163.com/#/album?id=3428868) | 2015 |
| S297 | [Sweden](https://music.163.com/#/song?id=4010229) | C418 | [Minecraft - Volume Alpha](https://music.163.com/#/album?id=405493) | 2011 |
| S298 | [Zombies on Your Lawn](https://music.163.com/#/song?id=3019706) | Laura Shigihara | [Plants Vs. Zombies (Original Video Game Soundtrack)](https://music.163.com/#/album?id=305492) | 2010 |
| S299 | [Still Alive](https://music.163.com/#/song?id=5044899) | Jonathan Coulton、GLaDOS | [The Orange Box](https://music.163.com/#/album?id=500858) | 2008 |
| S300 | [Want You Gone](https://music.163.com/#/song?id=3939121) | Aperture Science Psychoacoustics Laboratory | [Portal 2 (Songs to Test By) (Volume 3)](https://music.163.com/#/album?id=398399) | 2011 |
| S301 | [Rivers in the Desert](https://music.163.com/#/song?id=454231899) | Lyn、アトラスサウンドチーム | [『ペルソナ5』オリジナル・サウンドトラック](https://music.163.com/#/album?id=35123894) | 2017 |
| S302 | [Mass Destruction](https://music.163.com/#/song?id=403034) | Lotus Juice、川村ゆみ、アトラスサウンドチーム | [ペルソナ3 オリジナル･サウンドトラック](https://music.163.com/#/album?id=39841) | 2006 |
| S303 | [Bad Apple!! feat. nomico](https://music.163.com/#/song?id=479408927) | のみこ | [10th ANNIVERSARY Bad Apple!!](https://music.163.com/#/album?id=35543293) | 2017 |
| S304 | [ナイト・オブ・ナイツ](https://music.163.com/#/song?id=29164551) | ビートまりお | [東方インストライク](https://music.163.com/#/album?id=2995274) | 2012 |
| S305 | [Bury the Light](https://music.163.com/#/song?id=1814096316) | Casey Edwards、Victor Borba | [Bury the Light](https://music.163.com/#/album?id=123598770) | 2020 |
| S306 | [Devil Trigger](https://music.163.com/#/song?id=1351607470) | Ali Edwards | [Devil Trigger](https://music.163.com/#/album?id=75832986) | 2018 |
| S307 | [Never Fade Away](https://music.163.com/#/song?id=1810257000) | SAMURAI、Refused | [Never Fade Away](https://music.163.com/#/album?id=121336135) | 2019 |
| S308 | [Grievous Lady](https://music.163.com/#/song?id=1491210122) | Team Grimoire、Laur | [Arcaea Sound Collection: Memories of Conflict](https://music.163.com/#/album?id=97591587) | 2019 |
| S232 | [眉间雪](https://music.163.com/#/song?id=29567100) | HITA | [热门华语244](https://music.163.com/#/album?id=3029651) | 2014 |
| S236 | [山有木兮](https://music.163.com/#/song?id=455582652) | 伦桑 | [山有木兮-橙光游戏《人鱼传说之长生烛》主题曲](https://music.163.com/#/album?id=35148319) | 2017 |

### 虚拟歌手 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S309 | [千本桜](https://music.163.com/#/song?id=26096272) | 黒うさP、初音ミク | [千本桜](https://music.163.com/#/album?id=2386546) | 2012 |
| S310 | [ワールドイズマイン](https://music.163.com/#/song?id=22709632) | supercell、初音ミク | [Supercell](https://music.163.com/#/album?id=2084300) | 2009 |
| S311 | [みくみくにしてあげる♪【してやんよ】](https://music.163.com/#/song?id=22677434) | ika、初音ミク | [初音ミク 5thバースデーベスト ～impacts～](https://music.163.com/#/album?id=2080190) | 2012 |
| S312 | [Tell Your World](https://music.163.com/#/song?id=22760363) | livetune、初音ミク | [Tell Your World EP](https://music.163.com/#/album?id=2090508) | 2012 |
| S313 | [ヒビカセ](https://music.163.com/#/song?id=28996499) | Giga、初音ミク | [No title＋](https://music.163.com/#/album?id=2975073) | 2014 |
| S314 | [ロストワンの号哭](https://music.163.com/#/song?id=26124988) | Neru、鏡音リン | [世界征服](https://music.163.com/#/album?id=2393432) | 2013 |
| S315 | [ロキ](https://music.163.com/#/song?id=1333336761) | 鏡音リン、みきとP | [DAISAN WAVE](https://music.163.com/#/album?id=74878372) | 2018 |
| S316 | [天樂](https://music.163.com/#/song?id=548625) | ゆうゆ、鏡音リン | [四季彩の星](https://music.163.com/#/album?id=51157) | 2010 |
| S317 | [悪ノ娘](https://music.163.com/#/song?id=476435) | mothy、鏡音リン | [悪ノ王国](https://music.163.com/#/album?id=45738) | 2010 |
| S318 | [いーあるふぁんくらぶ](https://music.163.com/#/song?id=1417673643) | みきとP、GUMI、鏡音リン | [いーあるふぁんくらぶ](https://music.163.com/#/album?id=85072078) | 2019 |
| S320 | [右肩の蝶](https://music.163.com/#/song?id=4890900) | のりP、鏡音レン | [Butterfly](https://music.163.com/#/album?id=490999) | 2009 |
| S321 | [Fire◎Flower](https://music.163.com/#/song?id=4886152) | halyosy、鏡音レン | [VOCALOID BEST from ニコニコ动画 (あか)](https://music.163.com/#/album?id=490590) | 2011 |
| S322 | [パラジクロロベンゼン](https://music.163.com/#/song?id=4888613) | 鏡音レン、オワタP | [EXIT TUNES PRESENTS Vocalogenesis](https://music.163.com/#/album?id=490818) | 2010 |
| S323 | [Just Be Friends](https://music.163.com/#/song?id=26221022) | Dixie Flatline、巡音ルカ | [Just Be Friends](https://music.163.com/#/album?id=2427005) | 2009 |
| S324 | [ルカルカ★ナイトフィーバー](https://music.163.com/#/song?id=22640602) | samfree、巡音ルカ | [Fever](https://music.163.com/#/album?id=2075630) | 2011 |
| S325 | [ダブルラリアット](https://music.163.com/#/song?id=22716849) | アゴアニキ、巡音ルカ | [EXIT TUNES PRESENTS Megurhythm feat. Megurine Luka](https://music.163.com/#/album?id=2085193) | 2012 |
| S326 | [天ノ弱](https://music.163.com/#/song?id=4885597) | 164、GUMI | [EXIT TUNES PRESENTS GUMitive from Megpoid](https://music.163.com/#/album?id=490539) | 2011 |
| S327 | [モザイクロール](https://music.163.com/#/song?id=557579697) | DECO*27、GUMI | [愛迷エレジー +](https://music.163.com/#/album?id=2096974) | 2010 |
| S328 | [ECHO](https://music.163.com/#/song?id=29812004) | Crusher-P、GUMI | [CrusherP](https://music.163.com/#/album?id=3084002) | 2014 |
| S329 | [KING](https://music.163.com/#/song?id=1804888684) | kanaria、GUMI | [KING](https://music.163.com/#/album?id=120523239) | 2020 |
| S330 | [六兆年と一夜物語](https://music.163.com/#/song?id=36872348) | KEMU VOXX、IA | [PANDORA VOXX](https://music.163.com/#/album?id=3409167) | 2012 |
| S331 | [夜咄ディセイブ](https://music.163.com/#/song?id=26440333) | じん、IA | [メカクシティレコーズ](https://music.163.com/#/album?id=2500378) | 2013 |
| S332 | [アスノヨゾラ哨戒班](https://music.163.com/#/song?id=31830623) | Orangestar、IA | [未完成エイトビーツ](https://music.163.com/#/album?id=3139078) | 2015 |
| S333 | [普通DISCO](https://music.163.com/#/song?id=31140522) | ilem、洛天依Official、言和 | [普通DISCO](https://music.163.com/#/album?id=3111187) | 2016 |
| S334 | [达拉崩吧](https://music.163.com/#/song?id=521493845) | ilem、洛天依Official、言和 | [达拉崩吧](https://music.163.com/#/album?id=36875139) | 2017 |
| S335 | [权御天下](https://music.163.com/#/song?id=1404797306) | 洛天依Official | [Vsinger作品集-2](https://music.163.com/#/album?id=83523461) | 2019 |
| S336 | [东京不太热](https://music.163.com/#/song?id=1478965386) | Z新豪、洛天依Official | [Vocaloid作品集](https://music.163.com/#/album?id=95230607) | 2015 |
| S337 | [霜雪千年](https://music.163.com/#/song?id=34923862) | 洛天依Official、乐正绫、COP | [洛天依作品集](https://music.163.com/#/album?id=3054014) | 2014 |
| S399 | [フォニイ](https://music.163.com/#/song?id=3353203995) | 可不、ツミキ | [フォニイ](https://music.163.com/#/album?id=363579351) | 2021 |
| S400 | [上弦の月](https://music.163.com/#/song?id=1376067963) | 黒うさP、KAITO | [上弦の月](https://music.163.com/#/album?id=80233719) | 2015 |

### 影视 · 30 首

| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |
| --- | --- | --- | --- | ---: |
| S012 | [遇见](https://music.163.com/#/song?id=287319) | 孙燕姿 | [The Moment](https://music.163.com/#/album?id=28535) | 2003 |
| S019 | [情非得已](https://music.163.com/#/song?id=176999) | 庾澄庆 | [海啸](https://music.163.com/#/album?id=17918) | 2001 |
| S027 | [光年之外](https://music.163.com/#/song?id=449818741) | G.E.M.邓紫棋 | [光年之外](https://music.163.com/#/album?id=35093341) | 2016 |
| S028 | [如果可以](https://music.163.com/#/song?id=1890530891) | 韦礼安 | [如果可以](https://music.163.com/#/album?id=135391759) | 2021 |
| S029 | [想见你想见你想见你](https://music.163.com/#/song?id=1403215687) | 八三夭 | [想见你想见你想见你](https://music.163.com/#/album?id=83291813) | 2019 |
| S108 | [Last Dance](https://music.163.com/#/song?id=157276) | 伍佰 & China Blue | [爱情的尽头](https://music.163.com/#/album?id=15823) | 1996 |
| S339 | [那些年](https://music.163.com/#/song?id=97357) | 胡夏 | [那些年，我们一起追的女孩 电影原声带](https://music.163.com/#/album?id=9502) | 2011 |
| S340 | [如愿](https://music.163.com/#/song?id=1888381008) | 王菲 | [如愿](https://music.163.com/#/album?id=135011910) | 2021 |
| S341 | [无问](https://music.163.com/#/song?id=525278524) | 毛不易 | [无问](https://music.163.com/#/album?id=36997221) | 2017 |
| S342 | [不染](https://music.163.com/#/song?id=536099160) | 毛不易 | [香蜜沉沉烬如霜 电视原声音乐专辑](https://music.163.com/#/album?id=37548020) | 2018 |
| S343 | [凉凉](https://music.163.com/#/song?id=452601484) | 杨宗纬、张碧晨 | [三生三世十里桃花 电视剧原声带](https://music.163.com/#/album?id=35194088) | 2017 |
| S039 | [当年情](https://music.163.com/#/song?id=28442679) | 张国荣 | [爱火](https://music.163.com/#/album?id=2794072) | 1986 |
| S040 | [追](https://music.163.com/#/song?id=188003) | 张国荣 | [宠爱](https://music.163.com/#/album?id=19045) | 1995 |
| S051 | [终身美丽](https://music.163.com/#/song?id=328929) | 郑秀文 | [萤光粉红](https://music.163.com/#/album?id=32521) | 2001 |
| S054 | [友情岁月](https://music.163.com/#/song?id=193535) | 郑伊健 | [古惑仔II之猛龙过江](https://music.163.com/#/album?id=19519) | 1996 |
| S057 | [沧海一声笑](https://music.163.com/#/song?id=171025) | 许冠杰 | ['90电影金曲精选](https://music.163.com/#/album?id=17190) | 1990 |
| S059 | [一生所爱](https://music.163.com/#/song?id=25707139) | 卢冠廷、莫文蔚 | [齐天周大圣之西游双记 电影歌乐游唱版](https://music.163.com/#/album?id=2286009) | 1995 |
| S346 | [My Heart Will Go On](https://music.163.com/#/song?id=1484889) | Céline Dion、James Horner | [Titanic: Music from the Motion Picture Soundtrack](https://music.163.com/#/album?id=151601) | 1997 |
| S171 | [See You Again](https://music.163.com/#/song?id=1313070401) | Wiz Khalifa、Charlie Puth | [Furious 7: Original Motion Picture Soundtrack](https://music.163.com/#/album?id=73645572) | 2015 |
| S347 | [Skyfall](https://music.163.com/#/song?id=16435064) | Adele | [Skyfall (Full Length)](https://music.163.com/#/album?id=1515354) | 2012 |
| S348 | [Shallow](https://music.163.com/#/song?id=1313096578) | Lady Gaga、Bradley Cooper | [A Star Is Born Soundtrack](https://music.163.com/#/album?id=73781284) | 2018 |
| S350 | [A Thousand Years](https://music.163.com/#/song?id=2411634) | Christina Perri | [A Thousand Years](https://music.163.com/#/album?id=243354) | 2011 |
| S351 | [I Will Always Love You](https://music.163.com/#/song?id=3819561) | Whitney Houston | [I Will Always Love You](https://music.163.com/#/album?id=386374) | 1992 |
| S353 | [Lemon](https://music.163.com/#/song?id=536622304) | 米津玄師 | [Lemon](https://music.163.com/#/album?id=37575103) | 2018 |
| S354 | [First Love](https://music.163.com/#/song?id=22786083) | 宇多田ヒカル | [First Love](https://music.163.com/#/album?id=2093862) | 1999 |
| S355 | [Stay With Me](https://music.163.com/#/song?id=444267925) | CHANYEOL、Punch | [도깨비 OST Part.1](https://music.163.com/#/album?id=35023453) | 2016 |
| S359 | [My Destiny](https://music.163.com/#/song?id=28152930) | LYn | [별에서 온 그대 OST Part.1 (SBS 수목드라마)](https://music.163.com/#/album?id=2732546) | 2013 |
| S360 | [시작 (Start Over)](https://music.163.com/#/song?id=1420479167) | 가호(Gaho) | [이태원 클라쓰 OST Part.2](https://music.163.com/#/album?id=85410559) | 2020 |
| S045 | [一生中最爱](https://music.163.com/#/song?id=154627) | 谭咏麟 | [神话1991](https://music.163.com/#/album?id=15525) | 1991 |
| S055 | [男儿当自强](https://music.163.com/#/song?id=116113) | 林子祥 | [林子祥精选之天长地久](https://music.163.com/#/album?id=11358) | 1993 |

## 其他已确认候选

以下未进入本稿任一标签的30首首选，可用于调整。

| 编号 | 歌曲 | 艺人 | 专辑 | 年份 | 标签 |
| --- | --- | --- | --- | ---: | --- |
| S063 | [Dynamite](https://music.163.com/#/song?id=1471013297) | BTS (防弹少年团) | [Dynamite (DayTime Version)](https://music.163.com/#/album?id=93955070) | 2020 | 英语、流行、电子 |
| S105 | [Radioactive](https://music.163.com/#/song?id=19945726) | Imagine Dragons | [Continued Silence EP](https://music.163.com/#/album?id=1844255) | 2012 | 英语、摇滚、电子 |
| S106 | [Bring Me to Life](https://music.163.com/#/song?id=4049648) | Evanescence | [Bring Me to Life](https://music.163.com/#/album?id=409415) | 2003 | 英语、摇滚 |
| S113 | [New Boy](https://music.163.com/#/song?id=139371) | 朴树 | [我去2000年](https://music.163.com/#/album?id=13892) | 1999 | 国语、流行、摇滚、电子 |
| S115 | [没有理想的人不伤心](https://music.163.com/#/song?id=28009051) | 新裤子 | [生命因你而火热](https://music.163.com/#/album?id=34555329) | 2016 | 国语、流行、摇滚、电子 |
| S143 | [斑马，斑马](https://music.163.com/#/song?id=27646199) | 宋冬野 | [安和桥北](https://music.163.com/#/album?id=2646285) | 2013 | 国语、民谣 |
| S145 | [走马](https://music.163.com/#/song?id=30431367) | 陈粒 | [如也](https://music.163.com/#/album?id=3098832) | 2015 | 国语、民谣 |
| S154 | [光阴的故事](https://music.163.com/#/song?id=109545) | 罗大佑 | [之乎者也](https://music.163.com/#/album?id=10855) | 1982 | 国语、流行、民谣 |
| S198 | [红色高跟鞋](https://music.163.com/#/song?id=208902) | 蔡健雅 | [若你碰到他](https://music.163.com/#/album?id=21252) | 2009 | 国语、流行、R&B |
| S199 | [慢慢喜欢你](https://music.163.com/#/song?id=541687281) | 莫文蔚 | [我们在中场相遇](https://music.163.com/#/album?id=39355990) | 2018 | 国语、流行 |
| S215 | [Kiss Me More](https://music.163.com/#/song?id=1855285578) | Doja Cat、SZA | [Planet Her](https://music.163.com/#/album?id=129338347) | 2021 | 英语、流行、说唱、R&B |
| S217 | [Pink + White](https://music.163.com/#/song?id=426194883) | Frank Ocean | [Blonde](https://music.163.com/#/album?id=34818182) | 2016 | 英语、R&B |
| S219 | [Location](https://music.163.com/#/song?id=462895658) | Khalid | [American Teen](https://music.163.com/#/album?id=35196793) | 2017 | 英语、R&B |
| S245 | [故梦](https://music.163.com/#/song?id=27506597) | 橙翼 | [故梦](https://music.163.com/#/album?id=2621266) | 2013 | 国语、国风／古风 |
| S247 | [千年等一回](https://music.163.com/#/song?id=236387) | 高胜美 | [经典金选3 如果你是我的传说](https://music.163.com/#/album?id=23683) | 1992 | 国语、流行、国风／古风、影视 |
| S290 | [Da Capo](https://music.163.com/#/song?id=2026565329) | HOYO-MiX | [Da Capo](https://music.163.com/#/album?id=160968964) | 2023 | 英语、流行、游戏 |
| S319 | [悪ノ召使](https://music.163.com/#/song?id=476439) | 鏡音レン、mothy、鏡音リン | [悪ノ王国](https://music.163.com/#/album?id=45738) | 2010 | 日语、虚拟歌手 |
| S349 | [City of Stars](https://music.163.com/#/song?id=441612583) | Ryan Gosling、Emma Stone | [La La Land (Original Motion Picture Soundtrack)](https://music.163.com/#/album?id=35046112) | 2016 | 英语、流行、影视 |
| S352 | [Mystery of Love](https://music.163.com/#/song?id=516358164) | Sufjan Stevens | [Call Me By Your Name (Original Motion Picture Soundtrack)](https://music.163.com/#/album?id=36525952) | 2017 | 英语、民谣、影视 |
| S358 | [You Are My Everything](https://music.163.com/#/song?id=406086382) | Gummy | [태양의 후예 OST Part.4](https://music.163.com/#/album?id=34527701) | 2016 | 韩语、流行、R&B、影视 |
| S380 | [突然好想你](https://music.163.com/#/song?id=385781) | 五月天 | [后青春期的诗](https://music.163.com/#/album?id=38235) | 2008 | 国语、流行、摇滚 |
| S381 | [这，就是爱](https://music.163.com/#/song?id=191060) | 张杰 | [这，就是爱](https://music.163.com/#/album?id=19298) | 2010 | 国语、流行 |
| S395 | [crossing field](https://music.163.com/#/song?id=608290) | LiSA | [crossing field](https://music.163.com/#/album?id=57728) | 2012 | 日语、流行、摇滚、动漫 |
| S396 | [RPG](https://music.163.com/#/song?id=26291063) | SEKAI NO OWARI | [RPG](https://music.163.com/#/album?id=2447014) | 2013 | 日语、流行、动漫 |

## 修改与复核

编辑 JSON 后运行 `python scripts/check_playlist_catalog.py --write` 重建此表；不带 `--write` 时核验编号、标签、来源字段、年份、曲目去重、每标签30首、艺人上限和文档同步。该检查验证数据约束，不会重新联网验证网页或音频。
