use crate::paths::{data_dir, ensure_data_dir};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn init() {
    let _ = ensure_data_dir();
    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::NEVER)
        .filename_prefix("pidan")
        .filename_suffix("log")
        .max_log_files(3)
        .build(data_dir())
        .expect("file appender");

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,axum=warn")))
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(fmt::layer().with_writer(file_appender).with_ansi(false))
        .init();
}
