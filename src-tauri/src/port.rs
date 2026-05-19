use crate::paths::{ensure_data_dir, port_path};
use anyhow::{Context, Result};
use std::net::TcpListener;

pub fn select_and_persist() -> Result<(u16, TcpListener)> {
    ensure_data_dir().context("create data dir")?;
    for port in 19514u16..=19523 {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            listener.set_nonblocking(true).ok();
            std::fs::write(port_path(), port.to_string())
                .with_context(|| format!("write port file {}", port_path().display()))?;
            return Ok((port, listener));
        }
    }
    anyhow::bail!("no free port in 19514..=19523");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn select_returns_a_port() {
        let (p, _l) = select_and_persist().unwrap();
        assert!(p >= 19514 && p <= 19523);
        let written = std::fs::read_to_string(crate::paths::port_path()).unwrap();
        assert_eq!(written.trim(), p.to_string());
    }
}
