# 项目状态

## 初始化范围

- 仓库创建时为空，没有需要迁移的已有代码。
- 初始化交付：README、Agent 规则、贡献指南、Issue/PR 模板、标签定义、基础 CI 和格式检查。
- 当前已补齐 M1 工作区、core 领域/画像/选曲/派对/游戏公共契约，以及 M2 Mock 来源、画像和熟悉度矩阵及业务测试；M3 已补独立公平评估与逐首选曲；M4 已补派对运行时与 Mock 游戏反馈；M5 已补可运行 CLI 和固定场景。没有真人浏览器应用、服务或部署配置。

## 主线与副线

按 2026-09-24 用户最新方向，完整项目与可演示产品是主线：[Demo 总览 #14](https://github.com/HirasawaNiji/ai-karuta-arena/issues/14) 跟踪核心 #4、D0 #11 和 D1–D4。周杰伦专场 #12 为 P3 副线，不作为通用 Demo 的完成条件。主线优先，具体领取仍遵循依赖和最新 Checkpoint。

## 当前需求与架构基线

- 2026-09-24 最新产品修订：面向 QQ 音乐内场景独立设计移动端 UI，karuta-web 仅参考操作流程和可复用规则代码；1v1 默认 10 对 10，可选 15 对 15，不保留固定 25 对 25。具体 BAN、题组重评和宿主适配要求见 [PRE-05](preliminary-demo.md#6-pre-051v1-与现有引擎)。

- 2026-09-24 用户确认的[初赛范围补充](preliminary-demo.md)：标签/熟悉歌曲可独立建立画像，QQ 导入可选；可玩题目区分歌曲、录音、片段与卡牌；支持多人同场抢牌与复用现有引擎的 1v1，先单场再单淘汰，循环赛后续扩展。初赛不接大模型，系统主持用规则文案。本文档补充不表示实现已完成。

- [需求规格](requirements.md)：将修订后的 AI 音乐派对 Prompt 转为 19 项可追踪需求，保留平台/语言/文化/游戏无关原则。
- M1–M5 核心范围：多元 Mock 数据、画像/评分、矩阵、逐首选曲、公平评估、Mock 主持、Mock 游戏事件与反馈；无平台 Key、无真实 LLM。完整初赛还需 D0 引擎/素材核对与 D1–D4 可玩交付；M5 成功不等于真人 Demo 完成。
- 已明确的体验规则：评分不称概率；选曲逐首重算；ban 后重新评估；不足时等待房主选择；知情继续绑定评估版本且不抹除告警。
- [架构基线](architecture.md)：轻量 pnpm TypeScript Monorepo、首期单进程 Demo；后续再增加 React/Vite Web 与单个 Node 服务端。M1 契约、M2 music-profile/adapters、M3 playlist-engine 和 M4 party-runtime/Mock 游戏已实施；M5 CLI 已实施，真人应用尚未实施。
- [详细实现架构](implementation-architecture.md)补充模块/文件归属、公共数据契约与工程约定；[算法规格](algorithm-spec.md)固定首期可复现公式；[运行规格](party-runtime-spec.md)明确命令、版本和事件；[工作单](implementation-plan.md)拆解 M1–M5。文档补充是否已接受以关联 PR 为准，不能把写出规格算作 M1 完成。
- [验收矩阵](acceptance.md)定义业务测试要求，已进行 M1 契约、M2 画像/评分及 M3 选曲/重评业务检查；M4 状态、模拟游戏与反馈已有集成测试；M5 命令行场景、JSON/文本报告和无密钥进程检查已补齐；真人体验仍未验证。
- [来源映射](source-map.md)保留四十九章来源；[路线图](development-roadmap.md)关联后续任务。

## 后续外部边界

QQ 官方授权/API 能力仍待确认且不阻塞手动画像初赛。真实音频与卡牌许可、现有 Karuta 的事件接口和状态所有权在 D0 优先核对；服务器会话身份、准备和联机验证进入 D1–D4。未验证前不能声称真实接入完成。正式账户、数据库、部署和 LLM 供应商均不属于初赛必要选型。

仓库协作初始化与需求文档都遵守人工接受后再合并的流程；具体 PR 状态和依赖解除情况以 GitHub 为准，不在此长期保存易过时的分支进度。

## 状态来源

实时任务状态以 [Issues](https://github.com/HirasawaNiji/ai-karuta-arena/issues) 和关联 PR 为准。此文件保存稳定的项目范围；当前分支、权限阻塞和执行进展记录在 Issue Checkpoint 中。

标签定义在 `.github/labels.json`。标签和 Project 是远端配置，不会随着克隆或合并文件自动安装；设置方式见 [任务流程](task-workflow.md)。

## 本轮新增证据与范围

- [M1 基础验收](m1-foundation.md)：M1.1–M1.3 与子范围 CI，[M1.4](m1-evidence-contracts.md) 已补证据/画像/矩阵/配置契约，[M1.5/M1.6](m1-runtime-contracts.md) 补齐运行端口与全阶段契约验证，具体接受状态见 PR；[M2](m2-profile-matrix.md) 已补来源、归并、画像和矩阵计算；[M3](m3-fair-selection.md) 已补独立评估和逐首选曲；[M4](m4-party-runtime.md) 已补运行时、禁歌/确认与 Mock 游戏结算；[M5](m5-demo.md) 已补四个固定场景、实际 CLI、同源报告及核心验收映射；后续进入 D0–D4 真人产品。
- [D0 核对](karuta-engine-audit.md)：隔离构建/46 项测试通过，双浏览器完成原引擎 38 回合；106 段音频可解码、105 张卡面可用、1 条缺封面。发现交牌超时不推进并有复现探针。录音版本/前奏语义仍待确认，真实题组冻结和事件适配尚未实现。用户已授权复用现有内容，官方新卡牌范围仍待确认。
- [D1 工作单 #21](https://github.com/HirasawaNiji/ai-karuta-arena/issues/21)：下一步实施 QQ 音乐场景独立 UI、手动画像、可信房间与 10/15 张预设；D0 待核验素材不自动变为可玩。
- [周杰伦专场](artist-party.md)：按艺人限定候选，保留公平和禁歌；全曲库完整性与真实可播素材分别核验，不能将 QQ 版权背景视作素材分发授权。
