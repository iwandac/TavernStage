# 2026-09-05 分支清理恢复记录

本次用户授权把 TavernStage 整理为仅 main 长期演化、直接 fetch 官方上游的仓库。清理前 GitHub API 核对 14 个远端分支、没有开放 PR；main 与 codex/roleplay-runtime 同为 df0d6840cd3b8684e6252833f7cd9854ee505928。保留 main，以下 13 个目标先创建并验证远端归档标签，再按原 SHA 条件删除分支。归档标签不是软件发行或长期开发分支，不创建 GitHub Release。

## 恢复点

每条分支对应标签前缀 `archive/branch-cleanup-2026-09-05/` 加原分支全名。标签固定完整提交及其可达历史，不只保存文本 SHA；官方仓库不在删除范围。

| 原分支 | 归档提交 |
| --- | --- |
| `codex/roleplay-runtime` | `df0d6840cd3b8684e6252833f7cd9854ee505928` |
| `copilot/fix-chat-reset-issue` | `5da9808a4d2c43813d586c37b140984848458745` |
| `copilot/fix-tool-calls-in-assistant-messages` | `91f20bdfa9d7ae334e4e0983f8ecb718974d9ecf` |
| `feat/auto-clamp-number-inputs` | `207bb8239e7dd305fb520e9de7d3e696b30a3d6e` |
| `feat/claude-5-models` | `3ae68237dad1efd1fdc81e2ffb352f92fff81a62` |
| `feat/gemini-tts-models` | `da30ec815545ce221c6ec6fab95f3fa00f2f4bd1` |
| `feat/sanitize-existing-character-files` | `360abf80d31c9b44242a31c8f614a596a8cd64cb` |
| `feat/secret-data-encrypt` | `0887658ac0b8aa3552c209481e0444891846aa72` |
| `feat/wi-character-filter-improvements` | `28669f49859e1626fe7df1e679f3c19a3aa4a2b2` |
| `fix/nested-emphasis-markdown` | `7ee041c11da6ebe2ce4abc9191f53c092b68d57a` |
| `stats-2.0` | `51a43d1ff0b19096a130fd07f61377a54cc247eb` |
| `upstream/stable` | `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8` |
| `upstream/staging` | `4613abc26e5d00791e02038f6a9940da52c7d0e2` |

## 必要时恢复

以原 `feat/claude-5-models` 为例，在 TavernStage 子仓库执行：

```sh
git fetch origin refs/tags/archive/branch-cleanup-2026-09-05/feat/claude-5-models:refs/tags/archive/branch-cleanup-2026-09-05/feat/claude-5-models
git push origin refs/tags/archive/branch-cleanup-2026-09-05/feat/claude-5-models:refs/heads/feat/claude-5-models
```

先检查同名分支是否已被重新使用；不得强推覆盖后续工作。其它目标使用各自原分支名。当前分支状态以远端 heads 为准，本记录保留清理时的恢复点，不随之后开发改写。
