use crate::hook_event::HookEvent;
use crate::state_machine::{AppState, StateChange};
use anyhow::Result;
use axum::{extract::State, routing::post, Json, Router};
use std::net::TcpListener;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

pub type SharedState = Arc<Mutex<AppState>>;

#[derive(Clone)]
pub struct HttpDeps {
    pub state: SharedState,
    pub change_tx: broadcast::Sender<StateChange>,
}

pub fn router(deps: HttpDeps) -> Router {
    Router::new()
        .route("/event", post(handle_event))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .with_state(deps)
}

async fn handle_event(
    State(deps): State<HttpDeps>,
    Json(evt): Json<HookEvent>,
) -> &'static str {
    let mut s = deps.state.lock().await;
    let changes = s.ingest_hook(evt);
    drop(s);
    for c in changes {
        let _ = deps.change_tx.send(c);
    }
    "ok"
}

pub async fn serve(listener: TcpListener, deps: HttpDeps) -> Result<()> {
    listener.set_nonblocking(true)?;
    let tokio_listener = tokio::net::TcpListener::from_std(listener)?;
    tracing::info!("http server listening on {}", tokio_listener.local_addr()?);
    axum::serve(tokio_listener, router(deps)).await?;
    Ok(())
}
