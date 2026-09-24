# M1 基础工作区与契约验收

范围：M1.1–M1.3，以及该子范围的 CI。对应 Issue #4，完整 M1 尚未完成。

## 实际交付

- Node 24.21.0、pnpm 10.34.5，ESM/TypeScript 6.0.2；严格类型、project references 和构建后的公共包出口。锁定依赖，冻结安装不重算 lockfile。
- 仅创建有实际代码的 `@amp/core`；没有空业务包或假 demo。
- Zod schema 推导只读类型；稳定且分开的 ID，开放分类及层级/维度验证，歌曲、艺人、八维偏好，歌曲/录音/题目/卡牌分离。
- 目录入口拒绝重复 ID、无效引用、跨维度标签、循环父标签、无效数值、越界片段和歌名卡对应多曲。作品卡允许多曲，保留真实引擎映射空间。
- schema 保存未知/空列表的区别，校验不等于可播放许可；pending 素材可作目录诊断，后续可玩库过滤必须另验证实际资源和使用范围。
- 输入解析返回隔离的只读对象/集合；核心没有网络、文件、环境变量依赖。ESLint 验证依赖方向，TypeScript 另验证品牌 ID 与只读类型。
- Windows/Linux CI 执行冻结安装、build、typecheck、test、lint、Python 文本检查与未提交差异检查。Markdown 不批量格式化。

## 验证方式

本机 Windows 使用缓存中的独立 Node 24.21.0/pnpm 10.34.5，没有覆盖全局 Node 24.12.0。命令通过 `npm exec --yes --package=node@24.21.0 --package=pnpm@10.34.5 -- pnpm <command>` 执行；日常按 README 选择相同 Node/pnpm 后直接运行 pnpm。

检查项：`install --frozen-lockfile`、`build`、`typecheck`、`test`、`lint`、`python scripts/check_repository.py`、`git diff --check`。实际执行结果和确切提交以本阶段 PR 的检查与评审记录为准，不把计划 CI 写成已经通过。

测试覆盖 AC-01 的开放模型和 M1.3 边界；不声称 AC-02 的来源/游戏事件契约或任一业务闭环已经通过。数据均为明确标注的合成元数据，没有真实音频。依赖限制测试调用实际 ESLint 配置；类型感知规则首次初始化较慢，仅该用例允许 30 秒，其他用例保持默认超时。

## 剩余工作

M1.4 已补齐，范围和边界见[证据契约验收](m1-evidence-contracts.md)。后续 [M1.5/M1.6](m1-runtime-contracts.md) 已补齐选曲/评估、派对状态、命令、事件及来源/主持/游戏端口与全阶段检查范围。全 M1 接受后进入 M2 评分与矩阵实现；当前不提供 `pnpm demo`。

M1.5 定稿前复核 [D0 引擎差异](karuta-engine-audit.md)，保留 Mock 与真实游戏事件的边界。新产品方向见[周杰伦专场](artist-party.md)，不把艺人筛选或真实音源服务塞入 core 基础契约。
