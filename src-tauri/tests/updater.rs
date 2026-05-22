use pidan::updater::{compare_versions, select_installer_asset_url};

#[test]
fn release_version_must_be_newer_than_current() {
    assert!(compare_versions("v0.2.0", "0.1.0"));
    assert!(!compare_versions("v0.1.0", "0.1.0"));
    assert!(!compare_versions("v0.1", "0.1.0"));
    assert!(!compare_versions("v0.0.9", "0.1.0"));
}

#[test]
fn selects_windows_setup_asset() {
    let assets = vec![
        ("pidan-arm64-setup.exe".to_string(), "https://example.com/arm64.exe".to_string()),
        ("pidan-x64-setup.exe".to_string(), "https://example.com/x64.exe".to_string()),
    ];

    let asset_url = select_installer_asset_url(&assets).expect("expected x64 installer asset");
    assert_eq!(asset_url, "https://example.com/x64.exe");
}
