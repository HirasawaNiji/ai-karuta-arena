# ai-karuta-arena

项目仓库已建立基础协作配置，当前处于需求定义阶段。玩法、AI 接入方式、技术栈和部署目标尚未确定，仓库暂不包含可运行的应用。

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

本次初始化建立文档、编辑规范和 Issue 驱动的协作流程。后续应先通过 Research 或 Task Issue 明确最小玩法、验收标准和技术方案，再引入应用框架。详见 [项目状态](docs/project-state.md)。

仓库未选择许可证；引入外部代码、音频或图片时，须先确认其许可和使用范围。
