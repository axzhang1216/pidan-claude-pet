use anyhow::{anyhow, Context, Result};
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Deserialize;
use std::{path::PathBuf, process::Command, time::Duration};

const RELEASES_LATEST_URL: &str =
    "https://api.github.com/repos/axzhang1216/pidan-claude-pet/releases/latest";
const INSTALLER_NAME_HINT: &str = "x64-setup.exe";

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
pub struct UpdateResult {
    pub status: &'static str,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateResult> {
    let release = fetch_latest_release().await?;
    let current_version = env!("CARGO_PKG_VERSION");

    if !compare_versions(&release.tag_name, current_version) {
        return Ok(UpdateResult {
            status: "up_to_date",
            version: None,
        });
    }

    let assets = release
        .assets
        .iter()
        .map(|asset| (asset.name.clone(), asset.browser_download_url.clone()))
        .collect::<Vec<_>>();
    let installer_url = select_installer_asset_url(&assets)
        .ok_or_else(|| anyhow!("latest release does not contain an x64 installer"))?;
    let installer_path = download_installer(installer_url).await?;

    launch_installer(&installer_path)?;

    let app_to_exit = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        app_to_exit.exit(0);
    });

    Ok(UpdateResult {
        status: "update_available",
        version: Some(release.tag_name),
    })
}

async fn fetch_latest_release() -> Result<GithubRelease> {
    reqwest::Client::new()
        .get(RELEASES_LATEST_URL)
        .header(USER_AGENT, "pidan-updater")
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .context("failed to request latest release")?
        .error_for_status()
        .context("latest release request returned an error status")?
        .json::<GithubRelease>()
        .await
        .context("failed to decode latest release response")
}

async fn download_installer(url: &str) -> Result<PathBuf> {
    let bytes = reqwest::Client::new()
        .get(url)
        .header(USER_AGENT, "pidan-updater")
        .send()
        .await
        .with_context(|| format!("failed to download installer from {url}"))?
        .error_for_status()
        .context("installer download returned an error status")?
        .bytes()
        .await
        .context("failed to read installer payload")?;

    let installer_path = std::env::temp_dir().join("pidan-update.exe");
    std::fs::write(&installer_path, bytes).context("failed to write installer to temp directory")?;
    Ok(installer_path)
}

fn launch_installer(installer_path: &PathBuf) -> Result<()> {
    Command::new(installer_path)
        .spawn()
        .with_context(|| format!("failed to launch installer at {}", installer_path.display()))?;
    Ok(())
}

pub fn compare_versions(latest: &str, current: &str) -> bool {
    let mut latest = parse_version(latest);
    let mut current = parse_version(current);
    let len = latest.len().max(current.len());
    latest.resize(len, 0);
    current.resize(len, 0);
    latest > current
}

pub fn select_installer_asset_url(assets: &[(String, String)]) -> Option<&str> {
    assets
        .iter()
        .find(|(name, _)| name.to_ascii_lowercase().contains(INSTALLER_NAME_HINT))
        .map(|(_, url)| url.as_str())
}

fn parse_version(version: &str) -> Vec<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}
