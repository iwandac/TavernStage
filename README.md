# TavernStage · 角色舞台

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 演进的角色扮演智能体运行时项目。目标是保留完整的 ST 生态、持续吸收上游更新，并承担适配自身运行时所需的迁移成本；不是一次性拷贝，也不预先缩减为只维护少数核心功能。

TavernStage 由独立维护者开发，不是 SillyTavern 官方发行版。首个接入产品是 [Cosmic Tavern](https://github.com/iwandac/CosmicTavern)，但运行时边界不应依赖酒馆的页面或 Cloudflare 的具体服务。

## 当前状态

**G1：已有实验性 Node 无浏览器角色运行时，尚不是生产运行时。** 原 SillyTavern 浏览器宿主与 Node 入口实际使用同一份抽取核心；原界面、Node 服务与上游源码保留，继续作为生态适配和上游更新的基础。

- 已验证：公开社区 Sakana/Amy 角色在正常生成、重新生成、长历史预算截断中的请求与状态对照；另有明确标注的协议夹具覆盖递归世界书、变量宏、三位置正则和工具历史。默认新版宏引擎没有被关闭来通过验收。
- 真实模型：固定本地 Ollama Qwen3.6 的非流式文本回合；Node 直接生成并提交回复，不运行浏览器、jsdom 或简化提示词器。随机模型回复不要求逐字一致；协议与状态另用原版真实响应回放精确比较。
- 待实现与验证：流式输出、跨进程会话恢复、工具副作用回执、其它供应商的 Node 宿主适配、完整扩展生态，以及酒馆角色卡的产品接线。
- 尚未验证：Cloudflare Workers 直接运行、扩展兼容性、生产可用性或高并发指标。完整生态是演进目标，不是当前已经实现的能力声明。

`npm start` 仍启动继承的 SillyTavern 浏览器 + Node.js 宿主，不是 TavernStage 运行时 API。根 `package.json` 的 `1.18.0` 保留为继承宿主的兼容性版本，**不是 TavernStage 发布版本**；本项目尚未发布运行时版本。

## 从哪里开始

使用 Git 与符合根 `package.json` 要求的 Node.js，取得本项目自己的开发主线：

```sh
git clone --branch main https://github.com/iwandac/TavernStage.git
cd TavernStage
npm run check:tavernstage
```

身份检查无需安装依赖，不代替运行验证。安装和独立离线测试使用锁定依赖：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:extraction
npm run test:tavernstage
```

这些命令不下载模型或浏览器，不发送模型请求；真实角色资料与完整对话证据不随公共仓库再分发。本地 G1 实测使用 Node.js 26；CI 使用 Node.js 24，CI 的实际结果以运行记录为准。研究原宿主时请参考 [SillyTavern 文档](https://docs.sillytavern.app/)。

项目身份、开发阶段和上游固定提交见[项目清单](tavernstage.json)。

## 实验性运行接口

`src/tavernstage/runtime.js` 导出 `createSession`、`runTurn`、`readSession`、`disposeSession`。调用方显式提供导入后的 ST 角色投影、历史、元数据、世界书，以及含 `settings`、`powerUser`、`extensionSettings` 的 ST 配置投影；原始卡片 JSON 不能冒充已导入投影。宿主提供真实分词、模型传输、事件与获准扩展端口，核心不读取用户目录或安装插件。

`src/tavernstage/ollama-host.js` 提供本地 G1 适配器：必须指定字面 loopback 地址、`qwen3.6:latest` 和实际模型 digest；校验模型、拒绝重定向，并传递取消信号。它只适配非流式文本，不把未适配的媒体、schema、额外请求头或提示词后处理静默忽略。这里复用 ST 对该自定义模型的分词回退规则，不宣称这是 Qwen 的精确 token 数。

会话目前是内存状态，接口和配置投影尚未稳定；不具备重启恢复或生产权限边界。工具历史可保留，不代表模型可以执行外部业务动作；额外插件、自动化及媒体宿主仍是显式迁移债务。`continue`/`swipe` 代码保留，但不冒称本轮已完成验收。调用结束后应释放会话和模型宿主。

## 演进方向

1. 维护已建立的核心源码映射与原版对照样本。
2. 扩展显式会话上下文和宿主端口，继续迁移尚未适配的生态能力。
3. 验证多会话隔离、取消、失败恢复与受控的模型调用。
4. 先迁移一个真实历史修复验证维护路径；采用正式新版时再做完整升级验收，不把局部演练冒称完整升级。
5. 接入酒馆的已授权角色卡，完成真实对话与活动体验验收。

`main` 是本项目唯一长期开发分支，跟踪 `origin/main`；实现与升级使用短期 `codex/*` 分支。通过 `upstream` 远端获取官方 `release` / `staging`（不导入 tags），在升级分支合并选定提交、完成迁移与测试，再合回 `main` 并更新项目清单。上游升级保留合并历史，不维护自己的上游镜像分支，也不因合并困难自行放弃生态覆盖。

切换或更新工作树前运行 `node scripts/tavernstage/check-worktree.mjs`。它只读检查并拒绝暂存、未暂存和未跟踪改动，不自动 stash、覆盖、切分支或安装依赖；存在改动时先保留并审查，不跳过保护。此检查不替代合并审查和运行验收。

运行时负责角色扮演编排与生成；宿主负责账户、角色卡访问权限、数据生命周期和模型凭据。在酒馆中，房间与游戏事实仍由酒馆掌握，模型输出不能自行取得这些权限。

公共项目说明只维护本 README，能力声明须有实现与验证依据。设计草稿、研究记录和 AI 工作文档仅保留在本地 `doc/` 或 `docs/`，不提交；禁止提交未经验证的 AI 生成文档或无关说明。此限制不删除上游随代码附带的必要说明、许可证及归属信息。

## 来源与许可

本项目保留 SillyTavern 的 Git 历史、贡献者归属与 [GNU AGPL-3.0 许可证](LICENSE)。初始上游基线为 `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`；后续采用的上游提交以项目清单为准。

角色卡、世界书、扩展和模型服务各自的许可及使用条款不因本仓库派生而改变。项目初始化不代表已完成对外部署所需的许可与安全审查。
