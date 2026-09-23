# ai-karuta-arena

AI Music Party / AI 音乐派对：根据参与者的音乐画像、证据与游戏反馈，生成兼顾熟悉覆盖、竞争性和多样性的游戏题组。Karuta 是首个游戏适配目标，QQ 音乐是可能的数据来源；领域模型不绑定某个平台、语言或音乐文化。

当前包含协作基础、需求规格与架构基线，**尚无可运行的业务应用**。初赛目标是玩家通过标签和熟悉歌曲建立画像，体验多人抢牌、经典 1v1 和简单淘汰赛；暂不接大模型，QQ 授权也不作为游玩前提。核心先完成无需 API Key 的本地 Mock 验证，再接现有歌牌引擎与真人房间。熟悉度采用规则评分，ban 后重评，覆盖不足时等待房主选择。核心开发进度见 [Issue #4](https://github.com/HirasawaNiji/ai-karuta-arena/issues/4)。

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

采用 pnpm TypeScript 轻量 Monorepo：先核对现有引擎接口，以单进程 CLI 验证画像、选曲、主持与 Mock 游戏反馈，再接 Web/单个服务端和现有 Karuta。技术栈尚未安装；架构接受后按 D0、M1–M5、D1–D4 的依赖推进，小组循环赛为后续扩展。文档规定的公式与流程尚未通过业务实现验证。

## 开始工作

```sh
git clone https://github.com/HirasawaNiji/ai-karuta-arena.git
cd ai-karuta-arena
python scripts/check_repository.py
```

基础检查仅需要 Python 3.11 或更新版本，无第三方依赖。

开始开发前阅读 [AGENTS.md](AGENTS.md) 和 [贡献指南](CONTRIBUTING.md)，在 [Issues](https://github.com/HirasawaNiji/ai-karuta-arena/issues) 中优先恢复已有任务，再选择可执行的 Pending 任务。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `.github/ISSUE_TEMPLATE/` | Feature、Bug、Task、Research 表单 |
| `.github/labels.json` | 生命周期、类型、优先级和 Agent 标签定义 |
| `.github/workflows/` | 基础仓库检查 |
| `docs/` | 项目状态、任务流程与 Checkpoint 模板 |
| `scripts/` | 不依赖业务技术栈的仓库检查 |

## 当前范围

当前已有修订需求与详细架构评审材料，不把方案文档当作功能实现。`pnpm install / build / test / lint / demo` 是后续 Mock 交付的目标命令，目前尚不可用；当前可执行检查仍是上面的 Python 命令。详见 [项目状态](docs/project-state.md)。

仓库未选择许可证；引入外部代码、音频或图片时，须先确认其许可和使用范围。
