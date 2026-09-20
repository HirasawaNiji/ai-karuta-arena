# 来源、需求与验收映射

## 来源和解释规则

- 来源快照：[初始化 Prompt 修订版](sources/initialization-prompt-v1.md)，2026-09-20 版本，保留四十九章和修订记录。
- 快照 SHA-256：`458e8ad200080cdda3d568fe4cf44dfc11e76fc937f36eef8091a87a0402a63d`；本次导入与工作目录中的修订稿逐字节一致。
- [需求规格](requirements.md)把来源转为稳定 REQ 编号；[验收矩阵](acceptance.md)将行为映射为 AC 场景。
- 不将来源中的代码片段或初始化命令视为本次已实现内容。来源保持冻结，后续改需求需关联 Issue/PR 并更新此表，不能悄悄修改历史快照。
- 本次结构性收敛：减少首期包数、以 CLI Mock 为首个可运行入口；React/服务端在实际需要时增加。原 Prompt 允许优化目录和避免空模板，这些建议见架构文档。
- 原 Prompt 分散的失败处理、门槛和状态约束已合并；本规格对未知数据、确认版本、题组长度等口径做显式说明。未经过真实数据校准的权重和阈值仍标为试验值。

## 四十九章完整映射

| 源章节 | 需求 | 验收 |
| --- | --- | --- |
| 1. 一、项目背景 | REQ-01 | AC-01、AC-19 |
| 2. 二、现有核心游戏 | REQ-14 | AC-17、AC-18 |
| 3. 三、核心产品逻辑 | REQ-01、REQ-11、REQ-16 | AC-18、AC-19 |
| 4. 四、AI 的职责 | REQ-13、REQ-14 | AC-17 |
| 5. 五、音乐画像的核心原则 | REQ-06 | AC-03、AC-04 |
| 6. 六、PlayerMusicProfile | REQ-03 | AC-01、AC-02 |
| 7. 七、音乐画像维度 | REQ-02 | AC-01 |
| 8. 八、语言维度 | REQ-02 | AC-01 |
| 9. 九、地区维度 | REQ-02 | AC-01 |
| 10. 十、年代维度 | REQ-02、REQ-03 | AC-01 |
| 11. 十一、Culture / Scene | REQ-02 | AC-01 |
| 12. 十二、Franchise / IP | REQ-02、REQ-03 | AC-01 |
| 13. 十三、Artist | REQ-02、REQ-03 | AC-01、AC-02 |
| 14. 十四、SongProfile | REQ-03 | AC-01 |
| 15. 十五、用户音乐数据来源 | REQ-04 | AC-02 |
| 16. 十六、QQ 音乐接入 | REQ-04、REQ-19 | AC-02、AC-20 |
| 17. 十七、Evidence 系统 | REQ-05 | AC-02、AC-04 |
| 18. 十八、收藏与播放次数 | REQ-05、REQ-06 | AC-03、AC-04 |
| 19. 十九、播放次数非线性 | REQ-06 | AC-03 |
| 20. 二十、Familiarity Matrix | REQ-07 | AC-04、AC-05 |
| 21. 二十一、公平选曲算法 | REQ-08 | AC-07、AC-08 |
| 22. 二十二、Fairness | REQ-09、REQ-12 | AC-05、AC-06、AC-09、AC-10、AC-12、AC-13、AC-14、AC-16 |
| 23. 二十三、Diversity | REQ-10 | AC-11 |
| 24. 二十四、Competition | REQ-10 | AC-09、AC-11 |
| 25. 二十五、Personal Home Ground | REQ-10 | AC-09、AC-10、AC-11 |
| 26. 二十六、Exploration | REQ-10 | AC-07、AC-11 |
| 27. 二十七、Party Context | REQ-11 | AC-18 |
| 28. 二十八、AI Party Host | REQ-13 | AC-17 |
| 29. 二十九、Host Action | REQ-13 | AC-17 |
| 30. 三十、PartyState | REQ-03、REQ-12 | AC-13、AC-14、AC-15、AC-16 |
| 31. 三十一、游戏抽象 | REQ-14 | AC-17、AC-18 |
| 32. 三十二、统一游戏事件 | REQ-14 | AC-18 |
| 33. 三十三、建议 Monorepo 架构 | REQ-17 | AC-20 |
| 34. 三十四、推荐技术栈 | REQ-17 | AC-20 |
| 35. 三十五、Mock 数据必须足够多元 | REQ-15 | AC-19 |
| 36. 三十六、Mock 玩家 | REQ-15 | AC-19 |
| 37. 三十七、必须测试跨圈层派对 | REQ-15 | AC-09、AC-10、AC-11、AC-19 |
| 38. 三十八、Demo 输出 | REQ-16 | AC-19、AC-20 |
| 39. 三十九、算法可解释性 | REQ-13 | AC-08、AC-13、AC-17 |
| 40. 四十、测试 | REQ-17 | AC-01、AC-03、AC-04、AC-05、AC-06、AC-07、AC-08、AC-09、AC-10、AC-11、AC-12、AC-13、AC-14、AC-15、AC-16、AC-17、AC-18、AC-19、AC-20 |
| 41. 四十一、README | REQ-18 | AC-20 |
| 42. 四十二、docs | REQ-18 | AC-20 |
| 43. 四十三、music-taxonomy.md | REQ-02、REQ-18 | AC-01、AC-20 |
| 44. 四十四、QQ Music Integration | REQ-04、REQ-18、REQ-19 | AC-02、AC-20 |
| 45. 四十五、环境变量 | REQ-18、REQ-19 | AC-20 |
| 46. 四十六、第一阶段明确不要做 | REQ-19 | AC-20 |
| 47. 四十七、第一阶段验收目标 | REQ-16、REQ-17 | AC-13、AC-14、AC-18、AC-19、AC-20 |
| 48. 四十八、设计原则 | REQ-01、REQ-02、REQ-04、REQ-14 | AC-01、AC-02、AC-18 |
| 49. 四十九、执行顺序 | REQ-17、REQ-18 | AC-20 |

架构对比、依赖方向和包归属参见 [architecture.md](architecture.md)，阶段任务与领取条件参见 [development-roadmap.md](development-roadmap.md)。
