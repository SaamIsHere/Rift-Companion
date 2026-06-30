//! Minimal authenticated REST client for the LCU.
//!
//! The LCU serves HTTPS with a self-signed certificate on 127.0.0.1, secured by
//! HTTP Basic auth (`riot:<password>` from the lockfile). For a local prototype
//! we accept the self-signed cert; production code should pin Riot's root CA.

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::lcu::lockfile::Lockfile;

pub fn auth_header(lock: &Lockfile) -> String {
    let token = STANDARD.encode(format!("riot:{}", lock.password));
    format!("Basic {token}")
}

fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()?)
}

/// Fetch the current champ-select session, if any (404 → not in champ select).
pub async fn get_session(lock: &Lockfile) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-champ-select/v1/session",
        lock.port
    );
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if resp.status().is_success() {
        Ok(Some(resp.json().await?))
    } else {
        Ok(None)
    }
}
