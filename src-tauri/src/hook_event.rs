use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookEvent {
    pub event_type: HookEventType,
    pub session_id: String,
    pub cwd: Option<String>,
    pub project: Option<String>,
    pub prompt: Option<String>,
    #[serde(default)]
    pub msg: String,
    #[serde(default)]
    pub raw: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum HookEventType {
    SessionStart,
    UserPromptSubmit,
    Notification,
    Stop,
    SessionEnd,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_session_start() {
        let j = r#"{"event_type":"SessionStart","session_id":"abc","cwd":"D:/foo"}"#;
        let e: HookEvent = serde_json::from_str(j).unwrap();
        assert_eq!(e.event_type, HookEventType::SessionStart);
        assert_eq!(e.session_id, "abc");
        assert_eq!(e.cwd.as_deref(), Some("D:/foo"));
    }

    #[test]
    fn parse_minimal() {
        let j = r#"{"event_type":"Stop","session_id":"abc"}"#;
        let e: HookEvent = serde_json::from_str(j).unwrap();
        assert_eq!(e.event_type, HookEventType::Stop);
    }

    #[test]
    fn unknown_field_ignored() {
        let j = r#"{"event_type":"Notification","session_id":"x","weird_extra":42}"#;
        let e: HookEvent = serde_json::from_str(j).unwrap();
        assert_eq!(e.event_type, HookEventType::Notification);
    }
}
