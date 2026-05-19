use crate::hook_event::{HookEvent, HookEventType};
use crate::types::{Session, Source, State, state_priority};
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Default)]
pub struct AppState {
    sessions: HashMap<String, Session>,
}

impl AppState {
    pub fn new() -> Self { Self::default() }

    pub fn sessions(&self) -> Vec<Session> {
        let mut v: Vec<Session> = self.sessions.values().cloned().collect();
        v.sort_by(|a, b| b.last_change.cmp(&a.last_change));
        v
    }

    pub fn main_state(&self) -> State {
        self.sessions.values()
            .map(|s| s.state)
            .max_by_key(|s| state_priority(*s))
            .unwrap_or(State::Idle)
    }

    pub fn ingest_hook(&mut self, evt: HookEvent) -> Vec<StateChange> {
        let id = format!("cc:{}", evt.session_id);
        let now = Utc::now();
        let project = evt.project.clone()
            .or_else(|| evt.cwd.as_deref().and_then(project_from_path))
            .unwrap_or_else(|| "unknown".into());

        match evt.event_type {
            HookEventType::SessionStart => {
                let session = Session {
                    id: id.clone(),
                    source: Source::ClaudeCodeHook,
                    agent: "claude-code".into(),
                    project,
                    title: evt.prompt.clone(),
                    state: State::Working,
                    last_msg: evt.msg.clone(),
                    last_change: now,
                    last_seen: now,
                };
                self.sessions.insert(id.clone(), session);
                vec![StateChange::Created(id)]
            }
            HookEventType::UserPromptSubmit => self.transition(&id, State::Working, now, evt.prompt, evt.msg),
            HookEventType::Stop => self.transition(&id, State::Done, now, None, evt.msg),
            HookEventType::Notification => self.transition(&id, State::Waiting, now, None, evt.msg),
            HookEventType::SessionEnd => {
                if self.sessions.remove(&id).is_some() {
                    vec![StateChange::Removed(id)]
                } else {
                    vec![]
                }
            }
        }
    }

    fn transition(&mut self, id: &str, new: State, now: chrono::DateTime<Utc>, title: Option<String>, msg: String) -> Vec<StateChange> {
        if let Some(s) = self.sessions.get_mut(id) {
            let from = s.state;
            if from != new {
                s.state = new;
                s.last_change = now;
                s.last_seen = now;
                if title.is_some() { s.title = title; }
                if !msg.is_empty() { s.last_msg = msg.clone(); }
                return vec![StateChange::Transitioned { id: id.into(), from, to: new, msg }];
            } else {
                s.last_seen = now;
                if !msg.is_empty() { s.last_msg = msg; }
                return vec![];
            }
        }
        let session = Session {
            id: id.into(),
            source: Source::ClaudeCodeHook,
            agent: "claude-code".into(),
            project: "unknown".into(),
            title,
            state: new,
            last_msg: msg.clone(),
            last_change: now,
            last_seen: now,
        };
        self.sessions.insert(id.into(), session);
        vec![StateChange::Created(id.into())]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StateChange {
    Created(String),
    Transitioned { id: String, from: State, to: State, msg: String },
    Removed(String),
}

fn project_from_path(p: &str) -> Option<String> {
    Path::new(p).file_name().and_then(|s| s.to_str()).map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn evt(et: HookEventType, sid: &str) -> HookEvent {
        HookEvent {
            event_type: et,
            session_id: sid.into(),
            cwd: Some("D:/proj/foo".into()),
            project: None,
            prompt: None,
            msg: String::new(),
            raw: serde_json::Value::Null,
        }
    }

    #[test]
    fn session_start_creates_session_in_working() {
        let mut s = AppState::new();
        let changes = s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        assert_eq!(changes.len(), 1);
        assert_eq!(s.sessions.len(), 1);
        let session = s.sessions.values().next().unwrap();
        assert_eq!(session.state, State::Working);
        assert_eq!(session.project, "foo");
    }

    #[test]
    fn notification_transitions_to_waiting() {
        let mut s = AppState::new();
        s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        let changes = s.ingest_hook(evt(HookEventType::Notification, "a"));
        assert_eq!(changes.len(), 1);
        assert!(matches!(&changes[0], StateChange::Transitioned { to: State::Waiting, .. }));
    }

    #[test]
    fn stop_transitions_to_done() {
        let mut s = AppState::new();
        s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        s.ingest_hook(evt(HookEventType::Stop, "a"));
        assert_eq!(s.sessions.values().next().unwrap().state, State::Done);
    }

    #[test]
    fn session_end_removes_session() {
        let mut s = AppState::new();
        s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        let changes = s.ingest_hook(evt(HookEventType::SessionEnd, "a"));
        assert!(matches!(&changes[0], StateChange::Removed(_)));
        assert!(s.sessions.is_empty());
    }

    #[test]
    fn main_state_picks_highest_priority() {
        let mut s = AppState::new();
        s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        s.ingest_hook(evt(HookEventType::SessionStart, "b"));
        s.ingest_hook(evt(HookEventType::Notification, "b"));
        assert_eq!(s.main_state(), State::Waiting);
    }

    #[test]
    fn duplicate_event_no_change() {
        let mut s = AppState::new();
        s.ingest_hook(evt(HookEventType::SessionStart, "a"));
        let changes = s.ingest_hook(evt(HookEventType::UserPromptSubmit, "a"));
        assert!(changes.is_empty(), "Working -> Working should not emit change");
    }

    #[test]
    fn unknown_session_event_creates_session() {
        let mut s = AppState::new();
        let changes = s.ingest_hook(evt(HookEventType::Notification, "ghost"));
        assert_eq!(changes.len(), 1);
        assert_eq!(s.sessions.values().next().unwrap().state, State::Waiting);
    }
}
