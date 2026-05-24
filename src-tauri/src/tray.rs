use anyhow::Result;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, WebviewWindow, WebviewWindowBuilder,
};

pub fn build(app: &AppHandle) -> Result<TrayIcon> {
    let toggle = MenuItem::with_id(app, "toggle", "显示/隐藏", true, None::<&str>)?;
    let config = MenuItem::with_id(app, "config", "配置...", true, None::<&str>)?;
    let sep    = PredefinedMenuItem::separator(app)?;
    let quit   = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&toggle, &config, &sep, &quit])?;

    let tray = TrayIconBuilder::with_id("pidan-tray")
        .tooltip("皮蛋")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(tray)
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "toggle" => {
            if let Some(w) = app.get_webview_window("pet") {
                if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                else { let _ = w.show(); }
            }
        }
        "config" => {
            if let Err(err) = show_config_window(app) {
                tracing::error!(?err, "failed to open config window");
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn show_config_window(app: &AppHandle) -> Result<()> {
    let window = match app.get_webview_window("config") {
        Some(window) => window,
        None => {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "config")
                .ok_or_else(|| anyhow::anyhow!("missing config window definition"))?;

            WebviewWindowBuilder::from_config(app, config)?.build()?
        }
    };

    reveal_window(&window)
}

fn reveal_window(window: &WebviewWindow) -> Result<()> {
    let _ = window.unminimize();
    window.show()?;
    window.set_focus()?;
    Ok(())
}
