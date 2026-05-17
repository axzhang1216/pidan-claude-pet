# 皮蛋 (Pidan) — 多 AI Agent 桌宠设计文档

**日期：** 2026-05-17
**状态：** 设计已确认，待编写实现计划
**作者：** brainstormed via Claude Code superpowers:brainstorming

---

## 1. 总览与范围

**皮蛋（Pidan）** 是一个 Windows 桌面悬浮桌宠，为多个 AI 编程 agent（Claude Code、Codex、OpenClaw 等）提供统一的"任务状态提醒"，避免在多个并行会话间反复切窗口检查。

**核心价值：** 屏幕角落一只皮蛋，任何 agent 跑完 / 等用户回复时，通过动画 + 气泡 + Windows Toast 提醒；点击它可展开所有活跃会话的列表。

### 1.1 交付分两期

| 版本 | 数据源 | 覆盖范围 | 视觉 |
|---|---|---|---|
| **v1** | Claude Code Hook → 本地 HTTP | 仅 Claude Code | emoji 占位皮肤 |
| **v2** | v1 + multica CLI 轮询 | 所有 multica 管理的 agent | 接入皮蛋 spritesheet |

v1 与 v2 是增量关系，v2 不推翻 v1，只是多一个数据源 + 替皮肤。

### 1.2 明确不做的（YAGNI）

- 主动给 agent 派任务（multica 自己干，皮蛋只读）
- 跨机器同步（皮蛋纯本地，单机单用户）
- 聊天 / 对话 UI（皮蛋只是状态展示，不是会话客户端）
- 自定义脚本 / 插件系统（先不开放扩展点）
- Hook 来源与 multica 来源的会话去重（v3 再考虑）

### 1.3 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 形态 | 桌面悬浮窗 | 用户偏好 |
| 技术栈 | Tauri (Rust + Web) | 体积/内存优势，用户其他项目也会用 |
| 字符 | 皮蛋（复用现有 spritesheet） | 已有素材；初版可先用 emoji |
| 多会话 UI | 单只皮蛋 + 气泡 + 点击展开列表 | 屏幕干净 + 主动提醒 + 可查全 |
| 数据源 | Hook（v1） + multica CLI 轮询（v2） | 解耦实现风险，先稳后扩 |
| 通信 | 本地 HTTP 127.0.0.1（端口握手文件） | 跨语言、调试友好、Windows 自带 curl |
| 窗口 | 始终置顶 + 可拖动 + 托盘菜单 | 用户偏好 (A+C) |
| 提醒 | 视觉 + Windows Toast（声音可选默认关） | 用户偏好 (B) |
| 安装位置 | D 盘，安装时可选开机自启 | C 盘空间紧 |
| 项目名 | 皮蛋 / Pidan | 用户偏好 |
| Rust 工具链 | 装 D 盘（CARGO_HOME / RUSTUP_HOME） | C 盘空间紧 |

---

## 2. 架构与组件

```
┌─────────────────────────────────────────────────────────────┐
│                       Pidan (Tauri app)                      │
│                                                              │
│  ┌────────────────────┐         ┌──────────────────────┐    │
│  │  Frontend (Web)    │◄───IPC──┤  Backend (Rust)      │    │
│  │  HTML/CSS/Canvas   │         │                      │    │
│  │  - 皮蛋窗口         │         │  - 事件接收 HTTP      │    │
│  │  - 气泡组件         │         │  - 状态机             │    │
│  │  - 会话列表面板     │         │  - multica 轮询器     │    │
│  │  - 托盘菜单         │         │  - Windows Toast      │    │
│  └────────────────────┘         │  - 配置/持久化         │    │
│                                  └──────────┬───────────┘    │
└──────────────────────────────────────────────┼──────────────┘
                                               │
        ┌──────────────────────────────────────┼─────┐
        │                                      │     │
        ▼                                      ▼     ▼
  ┌──────────────┐                 ┌─────────────┐ ┌──────────────┐
  │ Claude Code  │                 │  multica    │ │  Tray icon   │
  │ Hook 脚本     │                 │  CLI        │ │  (Win shell) │
  │ (curl POST)  │                 │  (子进程)    │ │              │
  └──────────────┘                 └─────────────┘ └──────────────┘
        │                                 │
        ▼                                 ▼
   POST /event                  multica issue list
   到 Pidan 后端                   --output json
   127.0.0.1:<port>            （每 5 秒拉一次）
```

### 2.1 组件清单

| 组件 | 语言 | 职责 |
|---|---|---|
| **Frontend** | HTML/CSS/JS（Vanilla 起步，不用 React） | 渲染皮蛋窗口、气泡、面板；接收后端事件并播相应动画 |
| **HTTP 接收器** | Rust（`axum`） | 监听 `127.0.0.1:<port>/event`，接受 Hook 投递的 JSON |
| **状态机** | Rust | 把多个原始事件聚合成"每个会话当前的状态"；决定皮蛋此刻显示哪种情绪 |
| **multica 轮询器** | Rust（v2 加） | 后台 tokio task 每 5 秒调用 `multica issue list --output json`，diff 出变化 |
| **Toast 通知** | Rust（`winrt-notification` crate 或 Tauri notification） | 关键事件触发 Windows Toast |
| **托盘** | Rust（Tauri 自带 tray 模块） | 显示/隐藏窗口、退出、打开配置、查看 multica 连接状态 |
| **配置** | TOML 文件 `%APPDATA%\pidan\config.toml` | 端口、声音开关、皮肤路径等 |
| **端口握手文件** | 启动时写 `%APPDATA%\pidan\port`（纯文本端口号） | Hook 脚本读它取端口 |

### 2.2 关键设计选择

1. **前端不用框架**：v1 就一只猫 + 一个气泡 + 一个面板，上 React/Vue 是浪费。Vanilla JS + 一个轻量的 Canvas 动画循环（`requestAnimationFrame`）就够。以后真复杂了再迁移。
2. **状态机放在 Rust 后端**：前端只负责"被动渲染当前状态"，不持有业务逻辑。这样后端重启时（比如配置热重载）前端是无状态的，刷一下就同步好；也方便以后加任何"非 GUI 触发"的状态变化（定时器、网络断线）。
3. **进程模型：单进程**（Tauri 默认），后端是主进程的一部分。不需要分离的 daemon 进程——pet 自己就是 daemon。

---

## 3. 数据流与状态机

### 3.1 Session 模型

皮蛋内部用统一的 `Session` 抽象表示任何 agent 的一个会话/任务，不管它来自 Hook 还是 multica：

```rust
struct Session {
    id: String,              // 稳定唯一 ID（见下）
    source: Source,          // ClaudeCodeHook | Multica
    agent: String,           // "claude-code" | "codex" | "openclaw" | ...
    project: String,         // 项目名 / 仓库名 / cwd basename
    title: Option<String>,   // 任务/issue 标题（multica 有，Hook 用首条 prompt）
    state: State,            // 见 §3.2
    last_change: DateTime,
    last_seen: DateTime,     // 用于过期清理
}
```

**ID 生成（状态合并的关键）：**

- **Claude Code Hook 来源：** 使用 Claude Code Hook payload 中的 `session_id`，前缀 `cc:` → `cc:abc123...`
- **multica 来源：** 使用 `multica issue list` 返回的 `issue.id`，前缀 `mc:` → `mc:xxx...`
- **不去重 Hook 与 multica 之间**：即使通过 multica 启动 Claude Code，皮蛋会同时记两条 Session（一条 `cc:`、一条 `mc:`）。理由：现阶段没有可靠方式确认它们是同一回事，强行合并容易错；信息冗余比信息丢失安全。v3 再考虑去重。

### 3.2 状态枚举

```
State = Working      // 正在跑
      | Waiting      // 等用户回复（最高优先级）
      | Done          // 刚完成（停留 N 分钟后自动转 Idle）
      | Failed        // 失败（停留直到用户点掉）
      | Idle          // 闲置
```

### 3.3 事件源 → 状态映射

#### Claude Code Hook

| Hook 事件 | 触发 |
|---|---|
| `SessionStart` | Session 创建，state=Working |
| `UserPromptSubmit` | state=Working |
| `Stop` | state=Done（正常回合结束） |
| `Notification` | state=Waiting（Claude Code 等用户输入/权限） |
| `SessionEnd` | 移除 Session |

具体 Hook 字段在 plan 阶段去 Claude Code 文档核对，但语义大致如上。

#### multica CLI 轮询

每 5 秒拉一次 `multica issue list --output json`，按 `issue.id` diff：

| multica 状态字段 | 映射 |
|---|---|
| `running` / `claimed` / `started` | Working |
| `awaiting_input` / `blocked` | Waiting |
| `done` / `completed` | Done |
| `failed` | Failed |
| 新出现的 issue | 新 Session |
| 消失的 issue | 移除 Session（或保留 5 分钟后清理） |

具体字段名以实际 JSON 输出为准；plan 阶段会先 `multica issue list --output json | head -50` 确认 schema。

### 3.4 皮蛋"主情绪"决策

屏幕上只有一只皮蛋，显示**最高优先级的 Session 状态**：

```
优先级: Waiting > Failed > Done > Working > Idle
```

只要有任何会话在等用户回复，皮蛋就显示 Waiting 动画（不管别的会话啥状态）。

### 3.5 气泡触发规则

气泡是**状态变化**的提醒，不是常驻显示：

| 状态迁移 | 气泡内容 | Toast |
|---|---|---|
| `* → Waiting` | "📨 项目 X 在等你回复" | 是 |
| `Working → Done` | "✅ 项目 X 跑完啦" | 是 |
| `* → Failed` | "❌ 项目 X 出错了" | 是 |
| `* → Working`（新会话） | 不弹气泡（避免噪音） | 否 |
| `Done → Idle`（自动） | 不弹 | 否 |

气泡同屏最多 3 个，超过则最旧的合并成 "还有 N 条…"。

### 3.6 完整事件链路（举例）

```
用户在终端开 claude → Hook SessionStart 触发
  └─→ curl POST http://127.0.0.1:PORT/event
        {type:"session_start", session_id:"abc", cwd:"D:/foo"}
       │
       ▼
  Rust HTTP 接收 → 反序列化 → 推给状态机
       │
       ▼
  状态机：create Session(id=cc:abc, state=Working, project="foo")
       │
       ▼
  广播到前端（Tauri event "session-update"）
       │
       ▼
  前端：皮蛋切到 Working 动画；新 Session 不弹气泡
```

---

## 4. 窗口、UI 与皮肤系统

### 4.1 窗口形态

**主窗口（皮蛋本体）：**
- 无边框（`decorations: false`）、透明背景（`transparent: true`）、始终置顶（`always_on_top: true`）
- 默认尺寸 `192×192`（皮蛋一帧的显示尺寸 + 周围气泡余地）
- 可拖动：整个皮蛋区域 `drag-region` 拖移
- 位置持久化：拖到哪记到哪，下次启动恢复（`config.toml` 里 `window_pos = [x, y]`）
- 默认初始位置：屏幕右下角，距任务栏 80px

**面板窗口（点击皮蛋展开的会话列表）：**
- 单独的 Tauri WebviewWindow，无边框 / 置顶 / 不在任务栏出现
- 出现位置：紧贴皮蛋窗口，朝屏幕中心方向（自动判断左/右弹出）
- 失焦自动关闭
- 内容：每个 Session 一行，显示 `[图标] 项目名 — 状态 — 时间`，鼠标悬停显示完整 title

**气泡（Bubble）：**
- 不是独立窗口，是主窗口里 Canvas 旁边的 DOM 层
- 从皮蛋边上向上漂浮，3 秒淡出（Waiting 类型保留到状态变化或点击）
- 同屏 ≤3 个

**托盘菜单：**
```
皮蛋 (Pidan)
─────────────────
📊 活跃会话: 3
🔌 multica: 已连接
─────────────────
显示/隐藏
配置...
─────────────────
退出
```

### 4.2 鼠标交互

选定窗口行为是 **A+C**（始终置顶可拖动 + 托盘可隐藏），不做穿透。皮蛋会"挡"在内容上面：

- 优点：随时点得到、能拖、有提醒一目了然
- 缺点：偶尔挡视线 → 用托盘菜单"显示/隐藏"或拖到角落解决

之后如果觉得挡得烦，加一个"空闲时半透明 + 鼠标接近时不透明"的渐变是几行 CSS 的事，但 v1 不做。

### 4.3 渲染层

#### v1（emoji 占位皮肤）

- Canvas 不是必须的，直接用一个大字号 emoji `<div>` 就行
- 状态映射：

  | State | Emoji | 简单 CSS 动画 |
  |---|---|---|
  | Idle | 😺 | 缓慢呼吸（scale 1.0 ↔ 1.03，4s 周期） |
  | Working | 🐱💻 | 轻微左右摇摆 |
  | Waiting | 😾 | 轻微抖动 + 黄色光晕脉冲 |
  | Done | 😸✨ | 跳一下（scale 1 → 1.2 → 1，500ms） |
  | Failed | 🙀 | 红色光晕 |

- 这一步**目的就是把"骨架 + Hook + 状态机 + 提醒链路"全部跑通**，视觉先难看着没关系

#### v2（皮蛋 spritesheet 皮肤）

- 切换到 Canvas 渲染，加载 `spritesheet.webp` 按帧布局采样
- 引入 **Skin 抽象**：

  ```toml
  # %APPDATA%\pidan\skins\pidan\skin.toml
  name = "皮蛋"
  spritesheet = "spritesheet.webp"
  frame_width = 384       # 例：1536 / 4 列
  frame_height = 468      # 例：1872 / 4 行

  [animations.idle]
  row = 0
  frames = [0, 1, 2, 1]
  fps = 4
  loop = true

  [animations.working]
  row = 1
  frames = [0, 1, 2, 3]
  fps = 6
  loop = true

  [animations.waiting]
  row = 2
  frames = [0, 1]
  fps = 8
  loop = true

  [animations.done]
  row = 3
  frames = [0, 1, 2]
  fps = 10
  loop = false

  [animations.failed]
  row = 3
  frames = [0]
  fps = 1
  loop = false
  ```

- 配置驱动 → 以后想换别的猫/换别的形象，丢一套 `skin.toml` + 图就行
- 帧布局的具体数值在 plan 阶段会**实际把 spritesheet 切出来肉眼对照**确定（可能是 4×4、4×6、3×8 之类，必要时让用户确认每行对应什么动作）

### 4.4 配置面板（v1 极简）

托盘 → 配置打开一个小窗口，内容只有：

- ✅ 开机自启
- ✅ 启用 Windows Toast
- ⬜ 启用猫叫声（默认关，v1 可以暂时不实现，先放个开关占位）
- 主题/皮肤选择（v1 只有 emoji，灰显；v2 加 pidan 选项）
- "重置位置"按钮（万一拖出屏幕外）

存到 `config.toml`，热加载。

---

## 5. 错误处理、构建/打包、目录结构、测试

### 5.1 错误处理

| 场景 | 行为 |
|---|---|
| HTTP 端口被占用 | 启动时尝试 19514 → 19515 → … → 19524（10 个候选），都失败则托盘弹气泡报错并退出。选中的端口写入 `%APPDATA%\pidan\port` |
| Hook 投递时 pet 没在跑 | curl 失败，Hook 脚本 `2>/dev/null \|\| true` 静默忽略（不阻塞 Claude Code） |
| Hook payload 格式异常 | 后端记 warn 日志，丢弃事件，不崩 |
| `multica` CLI 不存在 / 没登录 | 轮询器记一次 warn，进入"multica 离线"状态，每 30s 重试一次（不再每 5s，避免日志刷屏） |
| `multica issue list` JSON 解析失败 | 同上，离线状态 |
| multica 连续失败 ≥3 次 | 托盘菜单显示"🔌 multica: 离线"，不弹通知 |
| Spritesheet 加载失败 | 回退到 emoji 皮肤 + 日志记 warn |
| 配置文件损坏 | 用默认配置启动 + 备份坏文件为 `config.toml.bak.<timestamp>` |
| 窗口拖出屏幕外 | 启动时检测：若 `window_pos` 不在任何显示器矩形内，重置到右下默认位置 |

**日志：** `%APPDATA%\pidan\pidan.log`，自动滚动（>5MB 时重命名为 `.1`，保留 3 份）。Rust 端用 `tracing` + `tracing-appender`。

### 5.2 项目目录结构（`D:\vib-coding-pet`）

```
D:\vib-coding-pet\
├── README.md
├── .gitignore
├── package.json                  # 前端依赖（vite + 简单工具）
├── vite.config.ts
├── index.html                    # 主窗口入口
├── src/                          # 前端
│   ├── main.ts                   # 入口
│   ├── pet.ts                    # 皮蛋渲染逻辑（emoji v1 / canvas v2）
│   ├── bubble.ts                 # 气泡组件
│   ├── panel.html                # 会话列表面板入口
│   ├── panel.ts
│   ├── config.html               # 配置面板入口
│   ├── config.ts
│   ├── ipc.ts                    # 与 Rust 后端通信封装
│   └── styles.css
├── src-tauri/                    # 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                    # 应用图标（皮蛋头像）
│   └── src/
│       ├── main.rs               # 入口、Tauri 启动
│       ├── http_server.rs        # axum HTTP 接收 Hook
│       ├── state.rs              # Session/State 类型与状态机
│       ├── multica.rs            # CLI 轮询器（v2）
│       ├── toast.rs              # Windows Toast 包装
│       ├── tray.rs               # 托盘菜单
│       ├── config.rs             # config.toml 加载/保存
│       ├── port_handshake.rs     # 端口选择与写文件
│       └── log.rs
├── skins/                        # 内置皮肤（打包到资源）
│   ├── emoji/                    # v1 默认
│   │   └── skin.toml
│   └── pidan/                    # v2 接入
│       ├── skin.toml
│       └── spritesheet.webp      # 从 ~/.codex/pets/pidan/ 复制
├── hooks/                        # Hook 脚本模板（提供给用户安装）
│   ├── README.md                 # 怎么把它接到 ~/.claude/settings.json
│   └── pidan-hook.sh             # 单文件 curl 脚本（跨 hook 类型）
├── installer/                    # 打包配置
│   └── nsis-config.nsh           # Tauri 自带 NSIS 模板的覆盖（开机自启选项）
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-17-pidan-design.md   # 本设计文档
└── tests/
    ├── unit/                     # Rust 单测
    └── integration/              # 端到端：启服务 + curl 注入事件 + 断言前端状态
```

**运行时目录：**

```
%APPDATA%\pidan\                 (= C:\Users\Administrator\AppData\Roaming\pidan\)
├── config.toml
├── port                         # 单行端口号，给 Hook 脚本读
├── pidan.log
└── skins/                       # 用户自定义皮肤（覆盖内置）
```

### 5.3 Hook 脚本安装

`hooks/pidan-hook.sh` 是单一脚本，从环境变量 / 第一参数判断事件类型并 POST。安装文档教用户：

```jsonc
// ~/.claude/settings.json
{
  "hooks": {
    "SessionStart":      [{"hooks":[{"type":"command","command":"bash %APPDATA%/pidan/hooks/pidan-hook.sh SessionStart"}]}],
    "Stop":              [{"hooks":[{"type":"command","command":"bash %APPDATA%/pidan/hooks/pidan-hook.sh Stop"}]}],
    "Notification":      [{"hooks":[{"type":"command","command":"bash %APPDATA%/pidan/hooks/pidan-hook.sh Notification"}]}],
    "UserPromptSubmit":  [{"hooks":[{"type":"command","command":"bash %APPDATA%/pidan/hooks/pidan-hook.sh UserPromptSubmit"}]}],
    "SessionEnd":        [{"hooks":[{"type":"command","command":"bash %APPDATA%/pidan/hooks/pidan-hook.sh SessionEnd"}]}]
  }
}
```

安装器把脚本复制到 `%APPDATA%\pidan\hooks\`，并提供一个 "一键写入 settings.json" 的小工具（merge 而不是覆盖）。**v1 也可以先让用户手动改**，工具留 v1.1。

### 5.4 构建 / 打包

- 开发：`npm run tauri dev` — 热重载前端，Rust 端 watch
- 生产：`npm run tauri build` → 产出 `target/release/pidan.exe` 和 NSIS 安装包 `pidan_0.1.0_x64-setup.exe`
- 安装包行为（NSIS 自定义页）：
  - 默认安装到 `D:\Program Files\Pidan\`
  - 复选框 "开机自启" — 勾选则在 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 写注册表项
  - 复选框 "自动配置 Claude Code Hook" — 勾选则修改 `%USERPROFILE%\.claude\settings.json`（merge），默认勾选
- Rust 工具链装在 D 盘：先在终端执行
  ```
  set CARGO_HOME=D:\.cargo
  set RUSTUP_HOME=D:\.rustup
  ```
  再跑 `rustup-init.exe`

### 5.5 测试策略

**单元测试（Rust，`cargo test`）：**
- `state.rs` 状态机：注入一序列事件，断言最终 sessions / 主情绪正确
- `config.rs`：损坏的 toml 不会 panic
- `multica.rs`：mock CLI 输出，diff 算法正确

**前端：**
- v1 不写自动化测试（UI 太轻量），用一个 dev-only 的"事件注入面板"手动验证：从托盘菜单 → 调试 → 注入测试事件 → 看皮蛋反应

**集成测试：**
- 一个 Python 脚本：启动 pidan.exe（headless 模式，加 `--no-window` flag），按顺序 POST 一系列 Hook 事件，再用 `--debug-state-dump` 命令读取当前 sessions JSON，断言匹配预期
- 必跑场景：单会话生命周期、并发多会话、Waiting 抢占主情绪、multica 离线降级

**手动验收清单（v1 完工标志）：**
1. 在终端开 `claude`，皮蛋立刻出现 Working 动画
2. Claude 跑完，皮蛋切 Done 动画 + 弹气泡 + 出 Toast
3. Claude 等输入，皮蛋切 Waiting + 抢占主情绪
4. 同时开两个 claude 窗口，点击皮蛋面板能看到 2 行
5. 关掉 pidan，再开 claude，pidan 后启动也能看到（不依赖启动顺序）→ Hook 失败安全降级
6. 拖动皮蛋到指定位置，重启后位置保持
7. 托盘 → 退出，进程干净退出

**v2 增量验收：**
- multica 启动一个 issue，pidan 看得到
- multica 离线，pidan 降级且托盘显示离线
- 接入 spritesheet，皮蛋有正确的猫咪动画

---

## 6. 后续步骤

1. 用户审阅本设计文档
2. 进入 writing-plans 阶段，把设计拆成可执行的实现计划（按 v1 → v2 顺序）
3. 安装 Rust 工具链到 D 盘
4. 按计划执行
