# Skin Switching Design

**Date:** 2026-05-21  
**Branch:** master (merges bruce branch functionality)

## Goal

Allow users to switch the pet's spritesheet at runtime via the system tray right-click menu, with instant visual feedback and no restart required.

## Skin Directory Structure

Two sources of skins:

1. **Built-in skins** — bundled in `src/assets/pets/<id>/` (e.g. `pidan`, `bruce`)
2. **User skins** — placed in `%APPDATA%\pidan\skins\<id>/`

Each skin folder must contain:
- `spritesheet.webp` — 8×9 animation atlas (same format as pidan/bruce)
- `pet.json` (optional) — `{ "id", "displayName", "description", "spritesheetPath" }`. If absent, folder name is used as display name.

## Backend (Rust)

### New: `list_skins` Tauri command

Scans both built-in and user skin directories. Returns `Vec<SkinInfo>`:

```rust
struct SkinInfo {
    id: String,
    display_name: String,
    spritesheet_path: String, // absolute path
}
```

### New: `set_skin(id: String)` Tauri command

1. Resolves the spritesheet absolute path for the given skin id
2. Saves `config.skin = id` via existing `config::save()`
3. Emits `pidan://skin-changed` event with the absolute path as payload
4. Rebuilds the tray menu to update the `✓` indicator

### Tray menu changes (`tray.rs`)

Add a "切换皮肤" submenu. Built on startup and rebuilt after each `set_skin` call.

- Each item: `display_name`, with `✓` prefix if it matches `config.skin`
- If no skins found: one disabled item "暂无可用皮肤"
- Clicking an item calls `set_skin`

## Frontend (main.ts)

Listen for `pidan://skin-changed` event. On receipt:

```ts
listen<string>("pidan://skin-changed", (e) => {
  sheet.src = convertFileSrc(e.payload);
});
```

`sheet.onload` already triggers `drawFrame()` — no additional logic needed.

On startup, load the skin from config (resolved via `list_skins` or a new `get_active_skin` command) instead of the hardcoded path.

## Config

`config.skin` already exists (type `String`, default `"emoji"`). Change default to `"pidan"`.

## What is NOT in scope

- Custom frame counts per skin (all skins must use the same 8×9 atlas layout as pidan)
- Skin deletion or management UI
- Live reload of user skins directory (requires restart to pick up newly added skins)
