import { invoke } from "@tauri-apps/api/core";

interface ConfigDto {
    toast_enabled: boolean;
    sound_enabled: boolean;
    autostart: boolean;
}

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

async function load() {
    const c = await invoke<ConfigDto>("get_config");
    $("toast").checked = c.toast_enabled;
    $("sound").checked = c.sound_enabled;
    $("autostart").checked = c.autostart;
}

$("save").addEventListener("click", async () => {
    await invoke("set_config", { dto: {
        toast_enabled: $("toast").checked,
        sound_enabled: $("sound").checked,
        autostart: $("autostart").checked,
    }});
    const btn = $("save") as unknown as HTMLButtonElement;
    btn.textContent = "已保存 ✓";
    setTimeout(() => { btn.textContent = "保存"; }, 1500);
});

$("reset-pos").addEventListener("click", () => invoke("reset_window_pos"));

load();
