use crate::paths::config_path;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub window_pos: Option<(i32, i32)>,
    pub toast_enabled: bool,
    pub sound_enabled: bool,
    pub autostart: bool,
    pub skin: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            window_pos: None,
            toast_enabled: true,
            sound_enabled: false,
            autostart: false,
            skin: "pidan".into(),
        }
    }
}

fn normalize(mut c: Config) -> Config {
    if c.skin != "pidan" && c.skin != "bruce" {
        c.skin = "pidan".into();
    }
    c
}

pub fn load() -> Config {
    match std::fs::read_to_string(config_path()) {
        Ok(s) => match toml::from_str::<Config>(&s) {
            Ok(c) => normalize(c),
            Err(e) => {
                let bak = config_path().with_extension(
                    format!("toml.bak.{}", chrono::Utc::now().timestamp())
                );
                let _ = std::fs::rename(config_path(), &bak);
                tracing::warn!(?e, "config corrupt, backed up to {:?}", bak);
                Config::default()
            }
        },
        Err(_) => Config::default(),
    }
}

pub fn save(c: &Config) -> Result<()> {
    let s = toml::to_string_pretty(c)?;
    std::fs::write(config_path(), s)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let c = Config { window_pos: Some((100, 200)), toast_enabled: false, ..Default::default() };
        let s = toml::to_string_pretty(&c).unwrap();
        let back: Config = toml::from_str(&s).unwrap();
        assert_eq!(back.window_pos, Some((100, 200)));
        assert!(!back.toast_enabled);
    }

    #[test]
    fn corrupt_returns_default() {
        let p = config_path();
        let _ = std::fs::create_dir_all(p.parent().unwrap());
        std::fs::write(&p, "this is not toml @@@@").unwrap();
        let c = load();
        assert!(c.toast_enabled);
    }
}
