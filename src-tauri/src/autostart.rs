//! Safe, antivirus-friendly autostart management.
//!
//! Instead of writing directly to sensitive Windows Registry keys (HKCU\...\Run
//! and StartupApproved\Run), which regularly triggers Defender/AV heuristic false
//! positives on unsigned binaries, this module manages a standard Windows
//! shell link (.lnk) in the user's Startup folder:
//! `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Rift Companion.lnk`.
//!
//! It also cleans up any legacy registry keys written by older versions.

use anyhow::{Context, Result};
use std::path::PathBuf;

const SHORTCUT_NAME: &str = "Rift Companion.lnk";

/// Returns the user's Startup directory.
#[cfg(windows)]
fn get_startup_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|appdata| {
        PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs\Startup")
    })
}

#[cfg(not(windows))]
fn get_startup_dir() -> Option<PathBuf> {
    None
}

/// Returns the path to the startup shortcut.
pub fn get_startup_shortcut_path() -> Option<PathBuf> {
    get_startup_dir().map(|dir| dir.join(SHORTCUT_NAME))
}

/// Checks whether autostart is currently enabled via the startup shortcut.
pub fn is_autostart_enabled() -> bool {
    get_startup_shortcut_path().map_or(false, |p| p.exists())
}

/// Enables or disables autostart.
pub fn set_autostart(enabled: bool) -> Result<()> {
    #[cfg(windows)]
    cleanup_legacy_registry_entries();

    let shortcut_path = match get_startup_shortcut_path() {
        Some(p) => p,
        None => return Ok(()),
    };

    if enabled {
        let current_exe = std::env::current_exe().context("failed to get current_exe")?;

        if let Some(parent) = shortcut_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        #[cfg(windows)]
        {
            let mut sl = mslnk::ShellLink::new(&current_exe)
                .map_err(|e| anyhow::anyhow!("failed to create ShellLink: {e}"))?;
            if let Some(parent_dir) = current_exe.parent() {
                sl.set_working_dir(Some(parent_dir.to_string_lossy().into_owned()));
            }
            sl.set_arguments(Some("--autostart".to_string()));
            sl.create_lnk(&shortcut_path)
                .map_err(|e| anyhow::anyhow!("failed to write .lnk file: {e}"))?;
        }
        tracing::info!(path = %shortcut_path.display(), "startup shortcut created");
    } else {
        if shortcut_path.exists() {
            let _ = std::fs::remove_file(&shortcut_path);
            tracing::info!(path = %shortcut_path.display(), "startup shortcut removed");
        }
    }

    Ok(())
}

/// Cleans up any legacy registry entries created by auto-launch / tauri-plugin-autostart
/// in older versions so they don't linger and trigger AV scanners.
#[cfg(windows)]
pub fn cleanup_legacy_registry_entries() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_SET_VALUE) {
        let _ = run_key.delete_value("Rift Companion");
        let _ = run_key.delete_value("rift-companion");
    }
    if let Ok(appr_key) = hkcu.open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", KEY_SET_VALUE) {
        let _ = appr_key.delete_value("Rift Companion");
        let _ = appr_key.delete_value("rift-companion");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_startup_shortcut_path() {
        let path = get_startup_shortcut_path();
        #[cfg(windows)]
        {
            assert!(path.is_some());
            let p = path.unwrap();
            assert!(p.to_string_lossy().ends_with(SHORTCUT_NAME));
        }
    }
}
