# TavernStage 开发与上游维护

## 项目边界

TavernStage 是 SillyTavern 的派生运行时项目，目标是保留完整 ST 生态、持续吸收上游更新，并承担适配自身需求所需的迁移成本。不是一次性拷贝，也不预先将范围缩减为少数核心模块。当前仍处于初始化阶段；角色卡、世界书、宏、提示词编排、模型适配、生成行为和扩展的支持，须逐项以可执行对照测试确认，不能把目标写成已经具备的能力。

继承的 `public/`、`src/`、`server.js` 及相关配置是原浏览器 + Node.js 宿主的源码。保留原路径便于追踪和合并，不进行全仓库品牌替换；这些目录的存在并不证明已具备无头运行时。新增运行时模块的位置与导出接口在抽取设计时确定，不提前发布空壳 SDK。

目标边界是“角色扮演逻辑 + 显式会话上下文 + 宿主端口”。宿主提供经过授权的输入、模型访问和必要存储；运行时不能自行扩大数据访问范围。Node.js 无头验证与 Cloudflare Workers 适配是两个不同的验收问题。

## 分支与版本

| 分支或标识 | 用途 | 接受本项目改动 |
| --- | --- | --- |
| `main` | TavernStage 自己的开发主线和默认分支 | 是，经审查与适用验收 |
| `codex/<topic>` | 从 `main` 创建的短期实现分支 | 是，完成后合入 `main` 并删除 |
| `codex/upstream-sync-<topic>` | 上游升级、冲突处理与对照验证 | 是，通过后合入 `main` 并删除 |
| `tavernstage-v*` | 未来 TavernStage 自身的发布标签 | 当前尚无运行时发布 |

`main` 是唯一长期分支。不保留继承的功能分支，也不另设 `upstream/stable`、`upstream/staging` 镜像分支。官方仍使用 `release` 与 `staging`；本地通过 fetch 保存为 `refs/remotes/upstream/release` 与 `refs/remotes/upstream/staging`。这些远程跟踪引用不是本项目的开发或发布分支，不需要切换到它们才能合并。`staging` 仅供候选变化预览或有明确理由的升级，不会自动合入 `main`。

本地 `main` 应跟踪自己的 `origin/main`，即 `branch.main.remote=origin`、`branch.main.merge=refs/heads/main`。`tavernstage.json` 中的 `upstream.branch: release` 表示升级候选来源，配合上游 SHA 记录实际采用点，不是本地 `main` 的跟踪设置。GitHub fork 页面显示官方 `release` 为比较基线或父仓库来源，也不代表本地跟踪、自动同步或覆盖；独立演化无需切断 fork 关系和共同祖先。

标签只保留未来 TavernStage 自身的 `tavernstage-v*` 发行标识。继承的 102 个上游标签及 13 个分支归档标签已按用户指令直接删除，不维护备份或恢复流程；见 [清理记录](branch-cleanup-2026-09-05.md)。上游来源版本和提交继续记录在清单中，不需要把官方标签重新发布到本仓库。

`origin` 应指向 `https://github.com/iwandac/TavernStage.git`，`upstream` 应指向 `https://github.com/SillyTavern/SillyTavern.git`。修改只推送至自己的仓库。

新克隆通常只有 `origin`；确认尚无 `upstream` 后执行 `git remote add upstream https://github.com/SillyTavern/SillyTavern.git`。若已存在则核对地址，不重复添加或未经检查覆盖它。

随后执行 `git config remote.upstream.tagOpt --no-tags`，让上游抓取默认不导入官方标签；下文命令仍显式使用 `--no-tags`。此设置仅针对官方远端，不禁用 `origin` 获取未来自有发行标签。发布标签时推送明确的目标引用，不使用 `git push --tags` 或 `--mirror` 把临时恢复标签、上游标签带回远端。

项目身份、阶段与采用的上游提交记录在根 `tavernstage.json`。根 `package.json` 暂保留继承宿主的 `1.18.0` 兼容性版本，不能用它宣称 TavernStage 已发布 `1.18.0`；未来运行时版本需与上游来源版本分别记录。

## 日常开发

从干净的 `main` 创建工作分支，先明确结果与验收，再实现完整工作包。`npm run check:tavernstage` 是无需安装依赖的初始化检查，只验证它实际覆盖的项目约定。更改原宿主代码时还需执行适用的原有 lint 和测试；更改抽取逻辑时须有固定输入下的上游行为对照。

根 `npm start` 仍是继承的交互式宿主入口，不是新服务的部署命令。不要使用原宿主的自动更新脚本维护 TavernStage 主线；升级遵循下节流程。

## 一次上游升级怎样完成

1. 保持工作区干净，记录当前 TavernStage 提交和采用的上游提交。若仓库是浅克隆，先取得比较和合并所需的上游历史，不能以缺失历史推断无差异。
2. 从官方仓库抓取更新，明确选定的提交及升级理由。官方稳定线是默认候选；采用开发线时记录原因与额外风险。
3. 在 `codex/upstream-sync-<topic>` 中合并选定提交，保留共同历史。上游集成及其 PR 不使用 squash、rebase 或 `merge -s ours`；不能只记录合并关系却丢弃上游变化。共享 `main` 不通过 reset 或强推重建，也不对它盲目使用 GitHub 的 **Sync fork**。
4. 检查受影响的抽取点、依赖、模型适配和数据格式。人工处理冲突，并审查上游自动化、README 与项目元数据，防止它们重新覆盖 TavernStage 的项目身份或启用上游发布流程。
5. 运行固定样本的差异测试、适用的隔离与恢复测试，解释预期差异。更新上游来源记录和兼容性说明；未通过的能力不能仅靠更新版本号放行。
6. 审查后合入 `main`。如需回退，恢复到已验证的 TavernStage 提交或用回退提交撤销升级，不重写已共享历史。消费方仅在候选提交已推送且验收通过后更新固定依赖。

fetch 更新远程跟踪引用不等于 TavernStage 已采用该版本：实际采用点以清单和合入主线的证据为准。官方历史若出现非快进变化，先调查，不以强推引用掩盖来源变化。

### 同一个本地仓库中的具体操作

以下 PowerShell 命令在 TavernStage 仓库目录执行；作为酒馆 submodule 使用时，是 `thirdparty/tavern-stage`，不是酒馆父仓库。无需第二份目录，也无需切换到官方分支。先提交或妥善保存已有工作，确认 `git status --short` 没有输出，再执行：

```powershell
git status --short
git remote -v

# 首次浅克隆补齐官方历史；普通更新仍使用相同的明确引用。
$stIsShallow = git rev-parse --is-shallow-repository
if ($stIsShallow -eq 'true') {
    git fetch --unshallow --no-tags upstream refs/heads/release:refs/remotes/upstream/release refs/heads/staging:refs/remotes/upstream/staging
} else {
    git fetch --no-tags upstream refs/heads/release:refs/remotes/upstream/release refs/heads/staging:refs/remotes/upstream/staging
}
```

检查命令成功后，更新自己的主线并创建一个尚未使用的升级分支名：

```powershell
git fetch origin refs/heads/main:refs/remotes/origin/main
git switch main
git merge --ff-only refs/remotes/origin/main
git switch -c codex/upstream-sync-001

# 固定候选 SHA，避免后续 fetch 改变本次验收目标。
$stCandidate = git rev-parse refs/remotes/upstream/release
git show --no-patch --format=fuller $stCandidate
git merge --no-ff --no-commit $stCandidate
```

每一步失败都应先处理原因，不继续执行后续命令。官方 `release` 是默认候选；如需采用 `staging`，先明确理由，再将候选引用改为 `refs/remotes/upstream/staging`。如果 Git 提示已包含目标提交，则无需制造空升级提交。

合并暂停后，人工解决冲突、检查暂存差异并执行适用测试。`npm run check:tavernstage` 只验证项目初始化约定，不能替代运行时行为与生态兼容性验收。更新来源与兼容性记录，按明确路径暂存修改，使用 `git commit` 完成合并提交；再将升级分支推送至 `origin`，向 `main` 提 PR，**使用保留合并历史的合并方式，不使用 squash 或 rebase**。验收合入后删除临时分支，消费方另行更新已验证的固定提交。放弃尚未提交的合并可执行 `git merge --abort`。

### 当结构差异很大时

合并冲突和运行环境分歧是需要支付的迁移成本，不自动构成放弃完整生态或停止上游更新的理由。仍以明确的上游提交作为升级目标，逐项迁移受影响行为、保留源文件与提交映射，并提供生成行为和扩展兼容性的验证证据。不能因为某段实现改成了新接口，就直接丢弃上游对应能力或以空合并宣称已经采用。

浏览器 UI 扩展可能需要保留独立交互宿主或提供适配器；完整生态目标不等于把任意扩展代码直接放到多租户服务端执行。未完成的适配必须显式记录为迁移债务与未覆盖项。成本或安全边界要求重大决策时，报告具体影响并请求决策，不自行把未覆盖能力变成永久排除项。

## 验收不是兼容性口号

先建立来源与行为对照，再抽取无头执行，随后验证会话隔离、取消和失败恢复；完成一次真实升级后再验收消费产品的真实体验。每个阶段记录“已实现、已验证、未覆盖”，而不是以总代码量或测试数量替代结果。

至少区分三类兼容性：内容格式能否读取、角色扮演行为是否一致、扩展是否能在新宿主执行。能导入角色卡不等于完整运行其世界书与宏；原浏览器扩展存在于源码中不等于它能在服务端安全运行。

在 Cosmic Tavern 中，运行时接收酒馆已授权的角色与会话输入。账户、收藏和角色卡权限、雅间的双人边界、活动与游戏事实仍由酒馆拥有；运行时通过既有智能体与宿主端口参与，不成为新的房间权威或额外真人座位。
