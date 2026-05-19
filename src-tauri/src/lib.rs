pub mod paths;
pub mod types;
pub mod hook_event;
pub mod state_machine;
pub mod port;
pub mod http_server;

use http_server::{HttpDeps, SharedState};
use state_machine::AppState;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{broadcast, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .manage(state.clone() as SharedState)
        .invoke_handler(tauri::generate_handler![get_snapshot])
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
                    let payload = SnapshotPayload {
                        main_state: snap.main_state(),
                        sessions: snap.sessions(),
                        last_change: Some(change),
                    };
                    drop(snap);
                    let _ = handle.emit("pidan://snapshot", &payload);
                }
            });
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
