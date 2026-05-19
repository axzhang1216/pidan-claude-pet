# 皮蛋 (Pidan) v0.1.0

Windows 桌面悬浮桌宠，为 Claude Code 提供实时任务状态提醒。

## 状态语义

| 表情 | 状态 | 含义 |
|------|------|------|
| 😺 | idle | 闲置 |
| 🐱💻 | working | 正在运行 |
| 😾 | waiting | 等你回复（最高优先级，抖动+金光） |
| 😸✨ | done | 跑完了 |
| 🙀 | failed | 失败 |

皮蛋只显示最紧急会话的状态。右键皮蛋查看所有活跃会话列表。

## 快速开始

### 1. 开发模式

```bash
cd D:/vib-coding-pet
npm install
npm run tauri dev
```

首次编译约需 3-5 分钟（需要 CARGO_HOME=D:\.cargo RUSTUP_HOME=D:\.rustup）。

### 2. 接入 Claude Code

```bash
mkdir -p "$APPDATA/pidan/hooks"
cp hooks/pidan-hook.sh "$APPDATA/pidan/hooks/"
```

然后把 hooks/README.md 中的 JSON 合并到 ~/.claude/settings.json。

### 3. 构建安装包

```bash
npm run tauri build
# 输出: src-tauri/target/release/bundle/nsis/Pidan_0.1.0_x64-setup.exe
```

## 手动 E2E 验收

启动 tauri dev 后，另一个终端：

```bash
python tests/e2e/test_v1.py
```

## 架构

Claude Code Hook -> pidan-hook.sh -> POST /event (axum 127.0.0.1:19514)
                                          -> AppState 状态机
                                          -> Tauri event: pidan://snapshot
                                          -> 前端 emoji 渲染 + 气泡
                                          -> Windows Toast
