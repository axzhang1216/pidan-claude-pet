pub mod paths;
pub mod types;
pub mod hook_event;
pub mod state_machine;
pub mod port;
pub mod http_server;
pub mod config;
pub mod log;
pub mod tray;

use http_server::{HttpDeps, SharedState};
use state_machine::AppState;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::{broadcast, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    log::init();
    let _ = paths::ensure_data_dir();

    let (port, listener) = match port::select_and_persist() {
        Ok(v) => v,
        Err(e) => { eprintln!("pidan: failed to bind port: {e:?}"); return; }
    };
    eprintln!("pidan: listening on 127.0.0.1:{port}");

    let state: SharedState = Arc::new(Mutex::new(AppState::new()));
    let (change_tx, _change_rx) = broadcast::channel(64);
    let deps = HttpDeps { state: state.clone(), change_tx: change_tx.clone() };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state.clone() as SharedState)
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_config,
            set_config,
            reset_window_pos
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Moved(pos) = event {
                if window.label() == "pet" {
                    let mut cfg = config::load();
                    cfg.window_pos = Some((pos.x, pos.y));
                    let _ = config::save(&cfg);
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let state2 = state.clone();
            let mut rx = change_tx.subscribe();
            let deps_for_serve = deps.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = http_server::serve(listener, deps_for_serve).await {
                    tracing::error!(?e, "http server exited");
                }
            });

            tauri::async_runtime::spawn(async move {
                while let Ok(change) = rx.recv().await {
                    let snap = state2.lock().await;
                    let sessions = snap.sessions();
                    let main_state = snap.main_state();
                    drop(snap);

                    // Toast on key transitions
                    {
                        use state_machine::StateChange;
                        use types::State;
                        if let StateChange::Transitioned { ref id, to, .. } = change {
                            let proj = sessions.iter()
                                .find(|s| &s.id == id)
                                .map(|s| s.project.clone())
                                .unwrap_or_default();
                            let cfg = config::load();
                            if cfg.toast_enabled {
                                let maybe_msg: Option<(&str, String)> = match to {
                                    State::Done    => Some(("皮蛋", format!("✅ {} 跑完啦", proj))),
                                    State::Failed  => Some(("皮蛋", format!("❌ {} 出错了", proj))),
                                    _ => None,
                                };
                                if let Some((t, b)) = maybe_msg {
                                    use tauri_plugin_notification::NotificationExt;
                                    let _ = handle.notification().builder().title(t).body(b).show();
                                }
                            }
                        }
                    }

                    let payload = SnapshotPayload {
                        main_state,
                        sessions,
                        last_change: Some(change),
                    };
                    let _ = handle.emit("pidan://snapshot", &payload);
                }
            });

            // Restore window position
            let cfg = config::load();
            if let Some(pet) = app.get_webview_window("pet") {
                if let Some((x, y)) = cfg.window_pos {
                    if let Ok(monitors) = pet.available_monitors() {
                        let inside = monitors.iter().any(|m| {
                            let pos = m.position();
                            let sz = m.size();
                            x >= pos.x && x < pos.x + sz.width as i32
                                && y >= pos.y && y < pos.y + sz.height as i32
                        });
                        if inside {
                            let _ = pet.set_position(tauri::PhysicalPosition { x, y });
                        }
                    }
                } else if let Ok(Some(monitor)) = pet.current_monitor() {
                    let sz = monitor.size();
                    let pos = monitor.position();
                    let _ = pet.set_position(tauri::PhysicalPosition {
                        x: pos.x + sz.width as i32 - 170 - 16,
                        y: pos.y + sz.height as i32 - 400 - 60,
                    });
                }
            }

            if let Err(e) = tray::build(&app.handle()) {
                tracing::error!(?e, "tray build failed");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running pidan");
}

#[derive(serde::Serialize, Clone)]
pub struct SnapshotPayload {
    pub main_state: types::State,
    pub sessions: Vec<types::Session>,
    pub last_change: Option<state_machine::StateChange>,
}

#[tauri::command]
async fn get_snapshot(state: tauri::State<'_, SharedState>) -> Result<SnapshotPayload, String> {
    let s = state.lock().await;
    Ok(SnapshotPayload {
        main_state: s.main_state(),
        sessions: s.sessions(),
        last_change: None,
    })
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ConfigDto {
    toast_enabled: bool,
    sound_enabled: bool,
    autostart: bool,
    skin: String,
}

#[tauri::command]
fn get_config() -> ConfigDto {
    let c = config::load();
    ConfigDto { toast_enabled: c.toast_enabled, sound_enabled: c.sound_enabled, autostart: c.autostart, skin: c.skin }
}

#[tauri::command]
fn set_config(dto: ConfigDto) -> Result<(), String> {
    let mut c = config::load();
    c.toast_enabled = dto.toast_enabled;
    c.sound_enabled = dto.sound_enabled;
    c.autostart = dto.autostart;
    if dto.skin == "pidan" || dto.skin == "bruce" {
        c.skin = dto.skin;
    }
    config::save(&c).map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_window_pos(app: tauri::AppHandle) -> Result<(), String> {
    let mut c = config::load();
    c.window_pos = None;
    config::save(&c).map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("pet") {
        if let Ok(Some(monitor)) = w.current_monitor() {
            let sz = monitor.size();
            let pos = monitor.position();
            let _ = w.set_position(tauri::PhysicalPosition {
                x: pos.x + sz.width as i32 - 170 - 16,
                y: pos.y + sz.height as i32 - 400 - 60,
            });
        }
    }
    Ok(())
}
