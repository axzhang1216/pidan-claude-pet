import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

interface ConfigDto {
    toast_enabled: boolean;
    sound_enabled: boolean;
    autostart: boolean;
    skin: string;
}

interface UpdateResult {
    status: "up_to_date" | "update_available";
    version?: string;
}

const $el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $cb = (id: string) => $el<HTMLInputElement>(id);
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
    const btn = $el<HTMLButtonElement>("save");
    btn.textContent = "已保存 ✓";
    setTimeout(() => { btn.textContent = "保存"; }, 1500);
});

$cb("reset-pos").addEventListener("click", () => invoke("reset_window_pos"));

$el<HTMLButtonElement>("check-update").addEventListener("click", async () => {
    const btn = $el<HTMLButtonElement>("check-update");
    const originalText = "检查更新";

    btn.disabled = true;
    btn.textContent = "检查中…";

    try {
        const result = await invoke<UpdateResult>("check_update");
        if (result.status === "up_to_date") {
            btn.textContent = "已是最新版 ✓";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 1500);
            return;
        }

        btn.textContent = `发现新版本 ${result.version ?? ""}，安装中…`;
    } catch (error) {
        btn.textContent = "检查失败，请重试";
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
        console.error("check_update failed", error);
    }
});

load();
