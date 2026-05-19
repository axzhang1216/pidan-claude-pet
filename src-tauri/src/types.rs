use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum State { Working, Waiting, Done, Failed, Idle }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source { ClaudeCodeHook, Multica }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Session {
    pub id: String,
    pub source: Source,
    pub agent: String,
    pub project: String,
    pub title: Option<String>,
    pub state: State,
    pub last_msg: String,
    pub last_change: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

pub fn state_priority(s: State) -> u8 {
    match s {
        State::Waiting => 4,
        State::Failed  => 3,
        State::Done    => 2,
        State::Working => 1,
        State::Idle    => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_waiting_beats_done() {
        assert!(state_priority(State::Waiting) > state_priority(State::Done));
    }

    #[test]
    fn priority_failed_beats_working() {
        assert!(state_priority(State::Failed) > state_priority(State::Working));
    }

    #[test]
    fn state_serializes_to_snake_case() {
        let s = serde_json::to_string(&State::Working).unwrap();
        assert_eq!(s, "\"working\"");
    }

    #[test]
    fn session_round_trip() {
        let now = Utc::now();
        let session = Session {
            id: "cc:abc".into(),
            source: Source::ClaudeCodeHook,
            agent: "claude-code".into(),
            project: "foo".into(),
            title: None,
            state: State::Working,
            last_msg: String::new(),
            last_change: now,
            last_seen: now,
        };
        let j = serde_json::to_string(&session).unwrap();
        let back: Session = serde_json::from_str(&j).unwrap();
        assert_eq!(session, back);
    }
}
