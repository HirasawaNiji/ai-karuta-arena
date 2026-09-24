# 可重复静音浏览器回归

本套测试运行实际 React 构建、createApp HTTP/SSE 服务、WebAudio 解码及真实规则引擎。每位玩家使用独立 Chromium 上下文；全部浏览器强制 --mute-audio，并在操作前通过 CDP 核实实际启动参数。测试不会调整系统音量，也不需要 QQ/LLM Key。

## 运行

~~~sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:browser
~~~

Linux CI 安装浏览器时使用 pnpm exec playwright install --with-deps chromium。本机已有 Chrome 时可设置 PLAYWRIGHT_CHANNEL=chrome（PowerShell：$env:PLAYWRIGHT_CHANNEL = 'chrome'）。使用项目指定 Node 24/pnpm 10；测试独占 127.0.0.1:3299，端口冲突时直接失败，不复用未知服务。

测试输出在被 Git 忽略的 output/playwright/，含 HTML 报告、失败截图/trace 和成功结果附件。用 pnpm exec playwright show-report output/playwright/report 查看；报告可能包含测试会话，不提交仓库。CI 保存报告 7 天。每次运行的合成音写入独立的 output/playwright/audio-UUID 目录；正常结束或测试失败时由 runner 清理，Windows 无需依赖服务收到退出信号。若整个 runner 被外部强制终止，可能保留该忽略目录。

## 验证内容

- 10 对 10、15 对 15：页面选歌、BAN、告警确认、音箱手势、当前音频请求/解码、抢牌、交牌、清空手牌结算及双方一致。
- 三人同场：真实 BAN/重评、错抢锁定、12 题计分、同分并列和三端一致。
- 四人杯：两场半决赛及决赛、淘汰房主继续调度、赛前画像不变、曝光排除与四端同一冠军。
- 播放请求失败：双端中断、画像不增加识曲反馈。

所有对局使用真实时钟。机器人只依据已经返回的当前音频字节 SHA-256 匹配可见歌名，并点击页面按钮；不读取未来题序、不写入分数、不绕过准备 API。只读状态用于断言与等待。浏览器回归保护真实 UI 与服务联动；已有 519 项领域/HTTP 回归仍由 pnpm test 执行。

## 夹具边界

素材为 tests/browser/materials.mjs 当场生成的 84 段不同频率 PCM 测试音，名称明确为“合成测试音”，使用范围仅为仓库工程回归。它不是音乐库、不是真人识曲，也不是 PJSK 曲包的替代验收。实际素材的哈希和自动浏览器证据继续见 D2/D3/D4 文档；真人/QQ WebView 真机体验如实单列，不再用等待这些反馈阻塞工程迭代。

UI 特化模型可在 #33 迭代后用本套回归发现真实流程退化；需要更新定位器时保留原有业务断言。#30 队战语义仍待人工确认，不由本任务处理。
