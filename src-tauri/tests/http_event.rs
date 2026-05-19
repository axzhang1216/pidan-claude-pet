use pidan::hook_event::{HookEvent, HookEventType};
use pidan::http_server::{router, HttpDeps, SharedState};
use pidan::state_machine::AppState;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

#[tokio::test]
async fn post_event_updates_state() {
    let state: SharedState = Arc::new(Mutex::new(AppState::new()));
    let (tx, _rx) = broadcast::channel(8);
    let deps = HttpDeps { state: state.clone(), change_tx: tx };

    let app = router(deps);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let evt = HookEvent {
        event_type: HookEventType::SessionStart,
        session_id: "test123".into(),
        cwd: Some("D:/x/y/foo".into()),
        project: None,
        prompt: None,
        raw: serde_json::Value::Null,
    };
    let resp = reqwest::Client::new()
        .post(format!("http://{}/event", addr))
        .json(&evt)
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let s = state.lock().await;
    assert_eq!(s.sessions().len(), 1);
    assert_eq!(s.sessions()[0].project, "foo");
}
