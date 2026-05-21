import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

interface ConfigDto {
    toast_enabled: boolean;
    sound_enabled: boolean;
    autostart: boolean;
    skin: string;
}

const $cb = (id: string) => document.getElementById(id) as HTMLInputElement;
const $sel = (id: string) => document.getElementById(id) as HTMLSelectElement;

async function load() {
    const c = await invoke<ConfigDto>("get_config");
    $cb("toast").checked = c.toast_enabled;
    $cb("sound").checked = c.sound_enabled;
    $cb("autostart").checked = c.autostart;
    $sel("skin").value = c.skin;
}

$cb("save").addEventListener("click", async () => {
    const skin = $sel("skin").value;
    await invoke("set_config", { dto: {
        toast_enabled: $cb("toast").checked,
        sound_enabled: $cb("sound").checked,
        autostart: $cb("autostart").checked,
        skin,
    }});
    await emit("pidan://skin-change", { skin });
    const btn = document.getElementById("save") as HTMLButtonElement;
    btn.textContent = "已保存 ✓";
    setTimeout(() => { btn.textContent = "保存"; }, 1500);
});

$cb("reset-pos").addEventListener("click", () => invoke("reset_window_pos"));

load();
