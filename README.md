# ai-karuta-arena

AI Music Party / AI 音乐派对：根据参与者的音乐画像、证据与游戏反馈，生成兼顾熟悉覆盖、竞争性和多样性的游戏题组。Karuta 是首个游戏适配目标，QQ 音乐是可能的数据来源；领域模型不绑定某个平台、语言或音乐文化。

当前已完成 M1–M5 核心与可运行的无密钥 CLI Demo：画像、选曲、禁歌/房主确认、Mock 游戏与反馈都可实际演示。D1 入场和 D2 双人真实对局已实现并完成自动浏览器验收，D3 多人与 D4 单淘汰已接入，完整启动和演示步骤见 [演示手册](docs/demo-walkthrough.md)。初赛目标是玩家通过标签和熟悉歌曲建立画像，体验多人抢牌、经典 1v1 和简单淘汰赛；暂不接大模型，QQ 授权也不作为游玩前提。核心先完成无需 API Key 的本地 Mock 验证，再接现有歌牌引擎与真人房间。熟悉度采用规则评分，ban 后重评，覆盖不足时等待房主选择。产品主线见 [真人 Demo #14](https://github.com/HirasawaNiji/ai-karuta-arena/issues/14)，核心进度见 [Issue #4](https://github.com/HirasawaNiji/ai-karuta-arena/issues/4)。周杰伦专场 #12 是 P3 副线，不是通用 Demo 的前置条件。

## 需求与架构入口

| 文档 | 内容 |
| --- | --- |
| [需求规格](docs/requirements.md) | 19 项编号需求、接口边界、公平配置与首期范围 |
| [初赛可玩 Demo 架构补充](docs/preliminary-demo.md) | 最新产品范围：三种画像来源、题目/音源/卡牌、多人/1v1/赛事、无 LLM 的初赛顺序 |
| [仓库与架构方案](docs/architecture.md) | 单应用、轻量 Monorepo、多仓库比较；推荐方案与依赖方向 |
| [详细实现架构](docs/implementation-architecture.md) | 开发主入口：包职责、目标文件、数据契约、工程与依赖约定 |
| [算法规格](docs/algorithm-spec.md) | 证据归并、画像、熟悉度/可信度、逐首选曲公式与手算例 |
| [派对运行规格](docs/party-runtime-spec.md) | 状态、命令权限、禁歌、版本确认、游戏事件与反馈结算 |
| [实施工作单](docs/implementation-plan.md) | M1–M5 的逐项步骤、产出、测试映射与交接约定 |
| [验收矩阵](docs/acceptance.md) | 20 组算法、状态和集成场景；区分计划测试与执行证据 |
| [来源映射](docs/source-map.md) | 修订 Prompt 四十九章到需求和验收的完整追溯 |
| [开发路线图](docs/development-roadmap.md) | 分阶段任务、依赖与领取条件 |

采用 pnpm TypeScript 轻量 Monorepo：先核对现有引擎接口，以单进程 CLI 验证画像、选曲、主持与 Mock 游戏反馈，再接 Web/单个服务端和现有 Karuta。已建立 core、music-profile、playlist-engine、party-runtime 和 adapters 工作区；来源到选曲、禁歌/确认、Mock 游戏结算和固定 CLI 场景已有业务测试，按 D0–D4 的依赖继续推进，小组循环赛为后续扩展。

## 开始工作

使用 Node **24.21.0**（`.node-version`）与 pnpm **10.34.5**（`packageManager`）。请用已有版本管理器选择 Node；pnpm 可通过 `npm install -g pnpm@10.34.5` 安装。依赖锁定并提交 lockfile；安装需联网，核心契约测试无需 API Key。

```sh
git clone https://github.com/HirasawaNiji/ai-karuta-arena.git
cd ai-karuta-arena
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm demo
pnpm demo -- --scenario feedback --format json
pnpm demo:check
```

`@amp/core` 公共出口指向构建产物；typecheck/test 会先构建，不依赖遗留 dist。已提供稳定 ID、开放分类、歌曲/艺人/玩家偏好、录音/题目/卡牌与目录引用校验；已补齐完整画像/证据/矩阵与配置的结构和引用校验；已补齐选曲/评估、派对状态/命令和游戏事件/接口；M2 已实现证据归并、画像和 score-v1 计算；M3 已实现逐首补缺、独立公平评估和解释；M4 已实现运行时、Mock 主持/游戏和原子反馈；M5 已实现四个固定场景及同源文本/JSON 输出。M2 使用与验证见[画像计算](docs/m2-profile-matrix.md)，M3 见[公平选曲](docs/m3-fair-selection.md)，M4 见[运行时与反馈](docs/m4-party-runtime.md)，M5 命令与结果见[Demo 使用说明](docs/m5-demo.md)。完整 M1 验证范围见[契约验收](docs/m1-runtime-contracts.md)，前序记录见[基础验收](docs/m1-foundation.md)和[M1.4](docs/m1-evidence-contracts.md)。

```sh
python scripts/check_repository.py
```

Python 文本检查仅需要 Python 3.11 或更新版本，无第三方依赖；它不能替代上面的 TypeScript 检查。

开始开发前阅读 [AGENTS.md](AGENTS.md) 和 [贡献指南](CONTRIBUTING.md)，在 [Issues](https://github.com/HirasawaNiji/ai-karuta-arena/issues) 中优先恢复已有任务，再选择可执行的 Pending 任务。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `.github/ISSUE_TEMPLATE/` | Feature、Bug、Task、Research 表单 |
| `.github/labels.json` | 生命周期、类型、优先级和 Agent 标签定义 |
| `.github/workflows/` | 基础仓库检查 |
| `docs/` | 项目状态、任务流程与 Checkpoint 模板 |
| `scripts/` | 不依赖业务技术栈的仓库检查 |
| `packages/core/` | 公共领域契约、边界 schema、目录引用校验 |
| `packages/music-profile/` | 证据归并、八维画像、评分/矩阵、游戏反馈转换 |
| `packages/playlist-engine/` | 独立公平评估、候选过滤、逐首补缺选曲及解释 |
| `packages/party-runtime/` | 派对状态、权限、禁歌/确认、开局检查和反馈结算 |
| `packages/adapters/` | Mock 来源、主持、游戏及合成数据、覆盖清单 |
| `apps/demo/` | 无密钥固定场景、文本/JSON 报告和命令行入口 |
| `tests/` | 契约边界、公式、运行时与 Demo 回归、包依赖与类型检查 |

## 当前范围

M1–M5 的核心 Mock 已实现，`install / build / typecheck / test / lint / demo` 可用。`pnpm demo` 默认运行 mixed、stress、ban、feedback；也可用 `--scenario` 单选。合成数据不含音频，无任何平台/LLM Key 也能运行。JSON 模式保留实际告警和明确的模拟房主动作；支持 `pnpm demo:check` 进行进程级验证。

可信房间身份、手动画像界面、105 首前奏素材和真实 1v1 已接入。多人及 4/8 人淘汰赛已接入；现场真人听辨仍待验收。QQ 官方能力与替代路径见[适配器状态](docs/adapter-status.md)。现有引擎的实际差异见 [D0 核对](docs/karuta-engine-audit.md)，新增周杰伦专场方向见[艺人专场](docs/artist-party.md)。详见 [项目状态](docs/project-state.md)。

仓库未选择许可证；引入外部代码、音频或图片时，须先确认其许可和使用范围。

## 浏览器派对（D1–D4）

依次运行 `pnpm build`、`pnpm start`，打开 http://127.0.0.1:3210 。已实现创建/加入、手动偏好、大厅准备、选曲预评估与房主素材试听；默认 10 对 10，可选 15 对 15。已接入选歌、BAN、最终重评、10/15 张真实裁决和共享音箱；素材目录配置与完整操作见 [D2 说明](docs/d2-duel.md)。105 首管理员核验的前奏可按清单加载，待核验素材不会被当成可玩题目。D2 两种局长已通过双浏览器真实素材结算；多人模式支持 2–8 人、12 题、BAN 后补齐重评与并列排名，见 [多人说明](docs/d3-multiplayer.md)；4/8 人淘汰赛见 [赛事说明](docs/d4-tournament.md)。QQ WebView 与现场真人听辨尚未验收。

## 静音浏览器回归

执行 `pnpm exec playwright install chromium` 后运行 `pnpm test:browser`，自动验证双人两种局长、多人及四人淘汰完整流程。测试强制静音，使用明确标注的合成测试音，说明见 [浏览器回归](docs/browser-regression.md)。
