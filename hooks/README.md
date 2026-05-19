# Pidan ↔ Claude Code Hook 接入指南

把 `pidan-hook.sh` 复制到 `%APPDATA%\pidan\hooks\`，然后把以下内容 **合并** 到 `~/.claude/settings.json` 的 `hooks` 字段：

```jsonc
{
  "hooks": {
    "SessionStart":     [{"hooks":[{"type":"command","command":"bash \"%APPDATA%/pidan/hooks/pidan-hook.sh\" SessionStart"}]}],
    "Stop":             [{"hooks":[{"type":"command","command":"bash \"%APPDATA%/pidan/hooks/pidan-hook.sh\" Stop"}]}],
    "Notification":     [{"hooks":[{"type":"command","command":"bash \"%APPDATA%/pidan/hooks/pidan-hook.sh\" Notification"}]}],
    "UserPromptSubmit": [{"hooks":[{"type":"command","command":"bash \"%APPDATA%/pidan/hooks/pidan-hook.sh\" UserPromptSubmit"}]}],
    "SessionEnd":       [{"hooks":[{"type":"command","command":"bash \"%APPDATA%/pidan/hooks/pidan-hook.sh\" SessionEnd"}]}]
  }
}
```

脚本在 Pidan 没运行时会静默退出（exit 0），不影响 Claude Code 正常工作。

## 一键安装脚本

```bash
mkdir -p "$APPDATA/pidan/hooks"
cp hooks/pidan-hook.sh "$APPDATA/pidan/hooks/"
```
