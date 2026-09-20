# Contributing

1. 新功能和修复应关联一个明确的 Issue，包含目标、背景、需求、约束、依赖和验收标准。
2. 优先恢复已有任务，领取前确认没有其他人正在执行。状态查询见 [任务流程](docs/task-workflow.md)。
3. 从默认分支建立工作分支，例如 `chore/1-repository-initialization`。保持一个 PR 对应一个可独立验证的任务。
4. 修改前阅读 [Agent 规则](AGENTS.md)，保留无关工作，不提交令牌、个人配置、依赖目录或生成产物。
5. 提交前运行 `python scripts/check_repository.py` 和 `git diff --check`。有业务代码后还应运行该模块约定的测试。
6. PR 描述写明问题、结果、验证情况及实际限制。没有运行的检查必须明确说明。
7. 完成后将 Issue 标为 Qualified，等待人工评审；正式接受并合并后才进入 Ranked。

未完成的工作必须留下 [Checkpoint](docs/checkpoint-template.md)。权限不足时明确记录本地路径、分支、提交和恢复命令，不要声称分支已经推送。
