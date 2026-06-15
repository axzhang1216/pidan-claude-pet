# 皮蛋 (Pidan) · 项目背景文档

**最后更新：** 2026-05-21
**当前分支：** `bruce`（已包含 bruce 皮肤；尚未合回 `master`）
**仓库根：** `D:\vib-coding-pet`
**远端：** https://github.com/axzhang1216/pidan-claude-pet

本文件给"接手这个项目的任何 agent/人"用：一口气知道现在到了哪、为什么这么做、下一步该读什么、外部素材在哪。**这是索引，不是教程。** 真正的设计细节、状态机定义、Hook payload schema 都在 `docs/superpowers/specs/` 里。

---

## 1. 一句话定位

一个 Windows 桌面悬浮桌宠（Tauri 2 / Rust + Vanilla TS），把多个 AI 编程 agent（Claude Code、Codex、未来通过 multica 管理的 agent…）的会话状态统一展示在屏幕一角，跑完/等输入时弹气泡 + Windows Toast。

**核心价值：** 多 agent 并行时不再来回切窗口看"它跑完没/它在等我没"。

---

## 2. 当前进展（v1 已基本闭环，正在向多 agent 扩展）

### 2.1 已完成（按时间倒序）

| 阶段 | 提交 | 内容 |
|---|---|---|
| 皮肤切换设计 | `8771220` | spec：托盘菜单切换 spritesheet，配置驱动（详见 §6） |
| Bruce 皮肤 | `0a30803` | 新增 bruce 角色 spritesheet，默认皮肤切到 bruce |
| 性能/打包 | `9673679 fb2d2fd b1985a7` | Hook 延迟从 1750ms 降到 200ms；端口自愈；GitHub release 流程 |
| UI 修复 | `f8dd4fe 2f250bf b1c996a` | 帧数修正止闪烁；Canvas spritesheet 渲染；气泡持久化 |
| v1 完成 | `8802bc5` | 前端 + 托盘 + 配置 + 通知 + Hooks + e2e 测试 |
| 后端基建 | `6ac60a6 24c4bd6 3baa0f3 ffdf582 a64ad7d 630582c 3478a08` | axum HTTP server / 端口握手 / 状态机 / Hook 事件类型 / Session 类型 / 路径助手 |
| 脚手架 | `f86f9fd a2410d6` | Tauri 2 + Vite vanilla-ts 引导，依赖装齐 |

### 2.2 已交付的能力

- **数据源：** Claude Code Hook → PowerShell/Bash 脚本 → `POST /event` → Rust axum
- **状态机：** `Working / Waiting / Done / Failed / Idle`，优先级 Waiting > Failed > Done > Working > Idle
- **会话模型：** `Session { id, source, agent, project, title, state, last_msg, last_change, last_seen }`，Hook 来源 id 前缀 `cc:`；multica 来源 `mc:` 已留位但未连
- **UI：** 无边框透明置顶窗口，Canvas 渲染 8×9 spritesheet，气泡组件，托盘菜单（显示/隐藏、配置、退出），右键面板列出所有活跃会话
- **通知：** 跨入 Done/Failed 触发 Windows Toast（可配置关闭）
- **端口握手：** 19514–19524 自动选择，端口号写到 `%APPDATA%\pidan\port`
- **位置持久化：** 拖动后位置写 `%APPDATA%\pidan\config.toml`，重启恢复（出屏自动回到右下）
- **打包：** NSIS 安装器，可选自动 patch `~/.claude/settings.json` 写 hooks
- **测试：** Rust 单测覆盖状态机/Hook 解析/types；`tests/e2e/test_v1.py` 端到端注入事件

### 2.3 尚未完成（按 spec/plan 排序）

1. **multica CLI 轮询器**（spec §3.3 的 v2 部分）— 完全没动；目前是 `Source::Multica` 枚举值占位
2. **Codex 集成** — 项目目标里写的"connecting multica/claude/codex"，但 Codex 没有 Claude Code 那种 hook，需另设计（见 §4 风险）
3. **多源会话去重** — spec 明确 v3 才考虑
4. **皮肤切换菜单上线** — design 写好了（`docs/superpowers/specs/2026-05-21-skin-switching-design.md`），代码未实现（无 `list_skins` / `set_skin` 命令，托盘菜单也没有"切换皮肤"项）
5. **配置面板的"开机自启 / 声音开关"** — DTO 字段存在，但 NSIS 安装器和运行时实际生效路径未完整验证

---

## 3. 代码结构速查

```
D:\vib-coding-pet\
├── src-tauri/src/          Rust 后端
│   ├── lib.rs              入口：拉起 HTTP、状态广播 → Tauri event、窗口位置恢复、Toast、托盘
│   ├── http_server.rs      axum POST /event
│   ├── hook_event.rs       Claude Code Hook payload 类型
│   ├── state_machine.rs    AppState + ingest_hook + StateChange
│   ├── types.rs            Session / State / Source / state_priority
│   ├── config.rs           config.toml 读写
│   ├── paths.rs            %APPDATA%\pidan\ 解析
│   ├── port.rs             端口选择 + 握手文件
│   ├── tray.rs             托盘菜单 (toggle/config/quit)
│   └── log.rs              tracing 初始化
├── src/                    前端（vanilla TS）
│   ├── main.ts             皮蛋本体：Canvas spritesheet 播放 + Tauri event 订阅
│   ├── panel.ts            右键面板：会话列表
│   ├── config.ts           配置面板
│   └── assets/pets/        spritesheets（pidan, bruce）
├── hooks/                  Claude Code hook 脚本（pidan-hook.ps1 / .sh）
├── installer/              NSIS 自定义页：patch-claude-settings.ps1 / pidan-hooks.nsh
├── tests/e2e/test_v1.py    端到端测试
└── docs/                   ← 见 §5
```

入口阅读顺序（5 分钟上手）：`README.md` → `src-tauri/src/lib.rs` → `src-tauri/src/state_machine.rs` → `src/main.ts`。

---

## 4. 潜在问题与风险

### 4.1 架构与设计层

- **Codex 没有 Claude Code 同款 hook**。spec 写的是"Hook + multica 轮询器"两路数据源；要把 Codex 真正接进来，要么走 multica（前提：Codex 任务确实在 multica 里登记），要么读 Codex session rollout 文件（`~/.codex/sessions/2026/MM/DD/rollout-*.jsonl`，见 §5），后者需要文件 watcher + 状态推断，**目前两条路径都未落地**。
- **Hook 来源与 multica 来源的会话不去重**。spec 明确说 v3 再考虑，但用户实际跑起来很可能在同一 issue 上同时看到 `cc:` 和 `mc:` 两条记录，体验上需要解释清楚。
- **`bruce` 分支未合并回 `master`**。`master` 比 `bruce` 旧 4 个提交（性能优化、bruce 皮肤、皮肤切换 spec）。需要决定是直接 merge 还是先把"皮肤切换菜单"实现完一起 merge。

### 4.2 实现层

- **皮肤切换 spec 与现状脱节**。spec 默认皮肤是 `pidan`，代码默认是 `bruce`；spec 说"`config.skin` 已存在"，但配置 DTO 里没有 skin 字段；spec 假设的 `list_skins` / `set_skin` Tauri 命令尚未实现。落地前需要一次对齐 review。
- **Spritesheet 帧布局硬编码在前端**。`src/main.ts` 里 `ROW_FRAMES = [6,8,8,4,5,8,6,6,6]` 是按 bruce 测出来的；不同 spritesheet 帧数不一样的话就闪烁。设计文档里说要"配置驱动"（`skin.toml`），目前没做。
- **窗口尺寸 170×400**（`tauri.conf.json`）比 spec 里的 192×192 大很多，是因为要容纳气泡和 spritesheet display 115px，但没有文档说明，未来调整气泡布局时容易踩。
- **端口握手文件无锁**。两个 pidan 实例同时启动理论上会互相覆盖 `%APPDATA%\pidan\port`，需要 single-instance 守卫（Tauri 有插件，未启用）。
- **Hook 脚本依赖 PowerShell**（`pidan-hook.ps1`），WSL/Git Bash 用户走 `.sh`，但安装器 NSIS 默认只放 ps1 → 需要在 README 强调或在脚本里做兼容。
- **`SessionEnd` 立即移除 Session**，但用户可能希望"刚结束的会话"在面板里再停留几分钟。spec 5.1 提过 "保留 5 分钟后清理"，未实现。

### 4.3 工程与发布

- **没有 CI**（仓库根没看到 `.github/workflows/`）。Rust 单测和 e2e 都得本地手跑，release 流程仍依赖人工 `npm run tauri build`。
- **测试覆盖偏后端**。前端 Canvas / 气泡 / 面板几乎没有自动化测试，spec 5.5 也承认 v1 不写前端测试。
- **没有 telemetry/log 收集**。Toast 失败、Hook payload 异常、spritesheet 加载失败都只是 `tracing::warn`，远程难以诊断。

### 4.4 跨平台

- 全项目目前**只针对 Windows**（Tray 图标、Toast、安装器、Hook 脚本路径都假设 Windows）。macOS/Linux 用户即便能 cargo build 出来也用不了 hook 链路。spec 里默认了 Windows-only。

---

## 5. 外部素材与资源路径索引

> 注意：以下路径是 2026-05-21 时点的真实路径，未来 agent 工作目录可能变。先 `ls` 一下确认存在再依赖。

### 5.1 本仓库

- 源码： `D:\vib-coding-pet\`
- 设计 spec：
  - `D:\vib-coding-pet\docs\superpowers\specs\2026-05-17-pidan-design.md`（v1+v2 总设计）
  - `D:\vib-coding-pet\docs\superpowers\specs\2026-05-21-skin-switching-design.md`（皮肤切换）
- 实施 plan： `D:\vib-coding-pet\docs\superpowers\plans\2026-05-18-pidan-v1.md`（2478 行，checkbox 形式 task list）

### 5.2 运行时数据（Pidan 自己写的）

- 安装根（如默认 NSIS）：`D:\Program Files\Pidan\`（也可能在 `C:\Program Files\Pidan\`）
- 运行时目录：`%APPDATA%\pidan\` = `C:\Users\Administrator\AppData\Roaming\pidan\`
  - `config.toml` 配置（窗口位置、toast 开关、皮肤）
  - `port` 当前 HTTP 端口
  - `pidan.log` 日志（>5MB 滚动）
  - `hooks\pidan-hook.ps1` 安装器复制过去给 Claude Code 调
  - `skins\` 用户自定义皮肤（覆盖内置）
- Claude Code 配置（被 pidan 安装器 patch）：`C:\Users\Administrator\.claude\settings.json`

### 5.3 Spritesheet 原始素材

- 项目内置：`D:\vib-coding-pet\src\assets\pets\{pidan,bruce}\spritesheet.webp`
- Codex 用户素材库：`C:\Users\Administrator\.codex\pets\` — 这里有同款 `pidan`、`bruce` 目录及对应 `.rar` 原档，是设计文档里"复用现有 spritesheet"的来源

### 5.4 Claude Code 历史会话（排查/复盘用）

- 全部项目：`C:\Users\Administrator\.claude\projects\`
- 本项目相关：
  - `C:\Users\Administrator\.claude\projects\E--BaiduSyncdisk-ClaudeCode-Workspace-vib-coding-pet\`
  - 也可能落在 multica workdir 命名下：`C:\Users\Administrator\.claude\projects\C--Users-Administrator-multica-workspaces-2895a02e-7227-463c-8edc-719ba294d73d-*\`
- 文件格式：`<session-uuid>.jsonl`，每行一条事件
- 最近一次：`546b5b17-d9ca-4a74-9e6f-d6c3cc518c2f.jsonl`（2026-05-21 12:05）

### 5.5 Codex 历史会话

- 根目录：`C:\Users\Administrator\.codex\`
  - `AGENTS.md` — Codex 全局指令
  - `config.toml` — Codex 配置
  - `sessions\YYYY\MM\DD\rollout-<timestamp>-<uuid>.jsonl` — 按日期分目录的会话 rollout（**这是未来要做 Codex 集成时的关键数据源**）
  - `archived_sessions\*.jsonl` — 老格式归档
  - `session_index.jsonl` — 会话索引
  - `logs_2.sqlite` — 二进制日志库
  - `memories\` / `rules\` / `plugins\` — Codex 子系统

### 5.6 Multica 平台

- CLI 入口：`multica`（已在 PATH）
- 当前 workspace ID：`2895a02e-7227-463c-8edc-719ba294d73d`
- 项目（"vib-coding 通用 pet 设计"）ID：`d9254c91-eb6c-48fd-9a05-8a8a1c2227f5`
- 本 issue：`ZAR-18` / `f8202a2f-20ab-440a-97d2-7debebd27e96`
- Multica 项目工作目录（agent 跑出来的 workdir）：`C:\Users\Administrator\multica\workspaces\2895a02e-.../...workdir\`

### 5.7 GitHub

- Repo: https://github.com/axzhang1216/pidan-claude-pet
- 分支：`master`（主）、`bruce`（当前开发）
- Releases 是用户分发 `Pidan-Setup.exe` 的渠道

---

## 6. 下一步建议（给架构层面参考，不写代码）

按 ROI 排序：

1. **先合分支再开新坑**：把 `bruce` 上的性能修复 + bruce 皮肤合回 `master`，否则后续 PR 都得在两条线上 cherry-pick。
2. **实现皮肤切换菜单**：spec 已就绪，需补 `list_skins/set_skin` Tauri 命令、托盘子菜单、`config.skin` 字段、`pet.json` 解析。这是低风险纯前/后端联动，可以单独一个 issue 跟。
3. **决定 Codex 集成方案**：在动手前先开 brainstorm，选 (a) 走 multica，(b) 监听 `~/.codex/sessions/*.jsonl`，(c) Codex 增加 hook 机制。每种方案都有不同 spec，要先讨论再写 plan。
4. **multica 轮询器**：v2 spec 已写，落地难度中等，主要是 `multica issue list` schema 对齐 + diff 算法 + 失败降级。
5. **single-instance 守卫 + 关闭时延迟移除 Session**：两个小修，体验提升明显。
6. **加 CI**：至少 `cargo test` + `npm run build`，release 流程后续再说。

---

## 7. 给接手 agent 的最小阅读清单

按这个顺序读，30 分钟左右能上手：

1. 本文件（你正在读）
2. `README.md`（用户视角的功能/安装）
3. `docs/superpowers/specs/2026-05-17-pidan-design.md`（设计的全部 why）
4. `src-tauri/src/lib.rs`（Tauri 启动 + 事件总线）
5. `src-tauri/src/state_machine.rs`（核心业务）
6. `src/main.ts`（前端唯一关键文件）
7. `docs/superpowers/plans/2026-05-18-pidan-v1.md`（看哪些 task 还没勾）

读完之后再去碰具体修改。
