# 公网 Demo 与 30 秒前奏素材

对应 [Issue #67](https://github.com/HirasawaNiji/ai-karuta-arena/issues/67)。2026-10-04 的用户授权包括审查合并现有 PR、下载候选歌单、裁剪前奏、部署指定服务器、停掉旧应用服务及配置 SSH 免密登录。服务器地址、密钥、网易云会话和现场 Nginx 配置保留在主机管理范围，不提交仓库。

## 下载与来源

候选输入是 `docs/playlists/demo-candidates.json` 的 16 份推荐，去重 351 首。`scripts/download_playlist_intros.py` 复用当前 Windows 用户的网易云桌面会话，仅在内存中加载凭据，只向网易云发送登录 Cookie；媒体 CDN 下载不携带该 Cookie。请求协议参考 [PyNCM](https://github.com/zixing131/pyncm)，其许可证为 Apache-2.0；使用 Python `requests`、`cryptography` 和现有 ffmpeg/ffprobe，没有复制第三方项目代码。

脚本逐批核对歌曲 ID、专辑 ID、平台录音时长与非试听状态，拒绝中段试听、版本不符、未授权媒体主机和不完整录音。它从录音 0 秒裁剪 30 秒、编码 96 kbps MP3、删除曲名标签并检查时长及全片段解码。支持按已完成文件的 SHA-256 断点续传，随下载更新清单和缺失报告，输出不保存媒体临时地址或会话。

```powershell
python -m pip install -r scripts/requirements-download.txt
python scripts/download_playlist_intros.py --output .local/netease-intros
```

网易云成功 336 首。用户要求继续寻找其他平台原版后，另补入 YouTube 14 首、COP 的 5sing 作者原曲 1 首，总计 351 首、约 121 MiB。全部只存前 30 秒，初始网易云缺失并未被改写为网易云下载成功。

补充方案及逐首依据见 [`alternate-intro-sources.json`](playlists/alternate-intro-sources.json)。实际来源保留原艺人、声库、语种及版本信息：`Grievous Lady` 为 141 秒官方游戏原声而非 361 秒扩展版；`ダブルラリアット` 用作者上传的巡音ルカ原曲；`霜雪千年` 从 COP 的 2015 免费原作取得，未用 2024 重置版；《当年情》排除国语及现场版本。《FAKE LOVE》《当年情》《怒放的生命》的实际来源是原曲再收录/原声发行，清单明确实际专辑，未伪造候选网易云专辑 ID。

《晴天》《同桌的你》《悪ノ娘》来自社区上传，分别记录与官方 MV 的前奏对应、老狼校园民谣目录及 2010 `Evils Kingdom` 专辑版本依据，明确标为 `community-upload`，不声称是官方提供的音源或已真人听辨。其余 11 首 YouTube 来源为唱片公司/作者发布，另 1 首为 5sing 作者原作。所有音源均经过完整源时长、30 秒输出、无 ID3 及解码检查；元数据与波形对应不能代替真人听辨。全部曲目的原候选记录不变。

补充下载器使用 [yt-dlp](https://github.com/yt-dlp/yt-dlp)（Unlicense），锁定 2026.8.19；本机旧版 2026.3.17 返回媒体 403，更新后的普通公开客户端可正常下载。脚本核对已审阅源的频道 ID、标题、平台专辑和时长，拒绝变化的元数据；所有来源均从 0 秒截取，无登录 Cookie、他人 UIN 或会员绕过方案。作者 5sing 音源地址从页面正常播放取得，为临时输入，不写入清单。网易云脚本再次执行会按哈希保留已补充的其他平台录音。

```powershell
python -m pip install -r scripts/requirements-alternate-download.txt
python scripts/download_alternate_intros.py --source-cache .local/alternate-audio --author-media .local/author-media.json
```

`--source-cache` 可复用本机已下载的完整文件；不指定则用 yt-dlp 正常下载。`--author-media` 为私有 JSON（S 编号映射到作者页面正常播放获得的 HTTPS 地址），5sing 地址过期时需重新打开原作页面取得。不需要上传账号会话。输出及准确来源记录在 `.local/netease-intros/`。

## 运行时与时长

设置以下环境变量后运行已构建的服务：

```sh
AMP_MATERIAL_DIR=/path/to/netease-intros
AMP_DOWNLOADED_MATERIALS=/path/to/netease-intros/materials.json
AMP_AUDIO_CACHE=/path/to/question-cache
FFMPEG_PATH=/path/to/ffmpeg
HOST=127.0.0.1
PORT=3210
```

`netease-intros-v1` 兼容原下载；`downloaded-intros-v2` 明确区分网易云、YouTube、5sing 的来源 ID、作者/频道、实际专辑、版本依据与来源类别，不允许把其他平台伪装成网易云或采用非零起点试听。两种清单均为管理员可信输入。加载器验证来源字段、路径、字节数及 SHA-256，把原歌单的语种、曲风、文化标签接入领域目录。未标语种的纯音乐/其他语言保留 `lang:unknown`，不会发明语言偏好。下载来源自动核验与旧版人工前奏核验分开；此批素材未声称完成真人听辨。

服务器存储前 30 秒，但遵守现有 `DUEL_RULES.roundMs=10000`：每题从 0 秒生成 10 秒 MP3，题目契约、服务端计时与浏览器播放同段内容。浏览器不会接收整首歌或 30 秒作为一题。音频仅对当前播放选手开放，其他玩家不能通过题目令牌读取答案片段。不可变缓存以源哈希、题目时长、输出哈希绑定，重启复用前校验缓存，损坏时拒绝启动。

## 部署

先完成构建，再运行 `python scripts/package_runtime.py`。它只打包工作区的 `dist`、必要 `package.json`、运行时 zod 与 Linux 工作区链接，不上传开发依赖、下载会话或完整录音。音频包单独包含裁剪文件、来源清单和下载报告。

服务器使用校验发行 SHA-256 的 Node 24.21.0，非登录的 `musicparty` 系统用户、systemd 开机自启及异常重启。应用只监听回环，由 Nginx 终止现有 HTTPS 并反向代理；SSE 关闭缓冲，保留 Host 和长连接。音频源目录只读，仅问题缓存可写。停掉用户授权停用的旧服务及容器，保留旧数据与原站点配置，不清空磁盘。

冷启动首次生成题目音频；后续复用缓存。初始 336 首缓存重启约 2 秒；补入 15 首时仅生成新题目缓存。源片段约 121 MiB、题目缓存约 40 MiB。旧数据保留且仍占空间。房间状态仍在内存中，重启后用户需要重新创建房间。

## 验证

- 23 项新增加载器测试：30 秒来源生成 10 秒题目、标签/卡牌关联、不完整/试听来源拒绝、路径与字节变化拒绝、未知语言、缓存复用与损坏拒绝，以及其他平台来源、频道/作者、来源类别、起点、时长和旧清单伪装拒绝。
- 336 个服务器源文件和 336 个题目缓存逐个校验 SHA-256；实测源 MP3 30.041 秒，题目 MP3 10.031 秒，均无 ID3 曲名标签。MP3 编码填充不改变服务端 10 秒题目规则。
- 公网真实素材静音 Chrome 完成 10/15 张双人局与三人 12 题局，共 39 次真实音频响应；无人作答约 10 秒后推进、好友音频 403、交牌、所有客户端结算一致、360/390/430px 无横向溢出及退房通过。`scripts/check-public-browser.mjs` 可复现，输入 `AMP_PUBLIC_URL` 和服务器缓存标题/哈希索引 `AMP_AUDIO_INDEX`；结果存放 `output/playwright/public-intros/`，含房间会话的原始文件不提交。
- 全量核心 574/574 通过；构建、类型、ESLint、Prettier、仓库文本、候选校验与 diff 检查通过。首次全量运行与批量转码并发时有 2 项原用例超时，定向重验 42/42 及无转码负载的完整重跑通过，未修改原断言或超时限制。浏览器自动化不代替真人有声听辨或 QQ WebView 真机验收。
- 补充来源后全量核心 588/588，通过 23 项来源加载器边界测试；构建、类型、ESLint、Prettier、仓库、候选及 diff 检查通过。重新执行网易云脚本保持 351 首及其他平台来源，补充脚本重复执行复用已有片段。
