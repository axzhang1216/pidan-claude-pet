use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    dirs::data_dir().expect("data_dir").join("pidan")
}

pub fn config_path() -> PathBuf { data_dir().join("config.toml") }
pub fn port_path() -> PathBuf { data_dir().join("port") }
pub fn log_path() -> PathBuf { data_dir().join("pidan.log") }
pub fn skins_dir() -> PathBuf { data_dir().join("skins") }

pub fn ensure_data_dir() -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_ends_with_pidan() {
        assert_eq!(data_dir().file_name().unwrap(), "pidan");
    }

    #[test]
    fn subpaths_are_under_data_dir() {
        let d = data_dir();
        assert!(config_path().starts_with(&d));
        assert!(port_path().starts_with(&d));
        assert!(log_path().starts_with(&d));
    }

    #[test]
    fn ensure_creates_dir() {
        ensure_data_dir().unwrap();
        assert!(data_dir().exists());
    }
}
