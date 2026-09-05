# TavernStage · 角色舞台

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 演进的角色扮演智能体运行时项目。目标是保留完整的 ST 生态、持续吸收上游更新，并承担适配自身运行时所需的迁移成本；不是一次性拷贝，也不预先缩减为只维护少数核心功能。

TavernStage 由独立维护者开发，不是 SillyTavern 官方发行版。首个接入产品是 [Cosmic Tavern](https://github.com/iwandac/CosmicTavern)，但运行时边界不应依赖酒馆的页面或 Cloudflare 的具体服务。

## 当前状态

**源码引入与项目初始化阶段，尚无可供集成的无头运行时。** 当前保留 SillyTavern 的浏览器界面、Node.js 服务和完整源码，作为抽取、对照测试与后续合并上游的基础。

- 已有：可追溯的上游基线、独立项目说明与维护约定。
- 待实现与验证：无头调用接口、角色扮演逻辑抽取、会话隔离与恢复、完整生态的宿主适配，以及酒馆角色卡接入。
- 尚未验证：Cloudflare Workers 直接运行、扩展兼容性、生产可用性或高并发指标。完整生态是演进目标，不是当前已经实现的能力声明。

`npm start` 仍启动继承的 SillyTavern 浏览器 + Node.js 宿主，不是 TavernStage 运行时 API。根 `package.json` 的 `1.18.0` 保留为继承宿主的兼容性版本，**不是 TavernStage 发布版本**；本项目尚未发布运行时版本。

## 从哪里开始

使用 Git 与符合根 `package.json` 要求的 Node.js，取得本项目自己的开发主线：

```sh
git clone --branch main https://github.com/iwandac/TavernStage.git
cd TavernStage
npm run check:tavernstage
```

该检查无需安装依赖，仅验证项目初始化约定，不代表运行时、模型调用或上游宿主已通过验收。研究原宿主时请参考 [SillyTavern 文档](https://docs.sillytavern.app/)，并区分其功能与 TavernStage 尚待实现的接口。

- [开发与上游同步](docs/tavernstage/development.md)：分支、版本、源码边界和验收要求。
- [贡献指南](CONTRIBUTING.md)：如何提交本项目改动。
- [安全说明](SECURITY.md)：当前部署边界与问题报告。
- [项目清单](tavernstage.json)：项目身份、开发阶段和上游固定提交。

## 演进方向

1. 建立核心源码与行为的对应关系，确定对照样本。
2. 在保留上游语义的前提下，以显式会话上下文和宿主端口替代浏览器全局依赖，验证无头执行。
3. 验证多会话隔离、取消、失败恢复与受控的模型调用。
4. 完成一次真实上游升级，以差异测试验证持续维护路径。
5. 接入酒馆的已授权角色卡，完成真实对话与活动体验验收。

`main` 是本项目唯一长期开发分支；实现与升级使用短期 `codex/*` 分支。通过 `upstream` 远端直接获取官方 `release` / `staging`，不维护自己的上游镜像分支。上游升级保留合并历史；结构差异需要迁移时，保留来源与行为对照证据，不因合并困难自行放弃生态覆盖。具体操作见[开发与上游同步](docs/tavernstage/development.md)。

运行时负责角色扮演编排与生成；宿主负责账户、角色卡访问权限、数据生命周期和模型凭据。在酒馆中，房间与游戏事实仍由酒馆掌握，模型输出不能自行取得这些权限。

## 来源与许可

本项目保留 SillyTavern 的 Git 历史、贡献者归属与 [GNU AGPL-3.0 许可证](LICENSE)。初始上游基线为 `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`；后续采用的上游提交以项目清单为准。

角色卡、世界书、扩展和模型服务各自的许可及使用条款不因本仓库派生而改变。项目初始化不代表已完成对外部署所需的许可与安全审查。
