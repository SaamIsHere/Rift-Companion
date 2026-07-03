//! Discovery + parsing of the League Client `lockfile`.
//!
//! The running client writes a `lockfile` into its install directory containing
//! `LeagueClient:<pid>:<port>:<password>:<protocol>`. We locate it by finding the
//! `LeagueClientUx` process and reading the file next to its executable.

use anyhow::{anyhow, Result};
use std::path::PathBuf;
use sysinfo::{ProcessesToUpdate, System};

#[derive(Debug, Clone)]
pub struct Lockfile {
    pub port: u16,
    pub password: String,
    #[allow(dead_code)]
    pub protocol: String,
}

/// Returns the lockfile if the League client is currently running.
pub fn find() -> Option<Lockfile> {
    let path = locate_path()?;
    let raw = std::fs::read_to_string(path).ok()?;
    parse(&raw).ok()
}

fn parse(raw: &str) -> Result<Lockfile> {
    // Format: LeagueClient:PID:PORT:PASSWORD:PROTOCOL
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 5 {
        return Err(anyhow!("malformed lockfile: {raw:?}"));
    }
    Ok(Lockfile {
        port: parts[2].parse()?,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

fn locate_path() -> Option<PathBuf> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    // More than one "leagueclientux*" process can be alive at once (e.g. a
    // leftover instance that never exited cleanly from a previous session).
    // Collect every match instead of returning on the first hit, so a stale
    // process pinned to a now-dead port can't win over the real, currently
    // starting one just because of process-list iteration order.
    let mut candidates: Vec<(&sysinfo::Process, PathBuf)> = Vec::new();

    for proc in sys.processes().values() {
        let name = proc.name().to_string_lossy().to_lowercase();
        if !name.starts_with("leagueclientux") {
            continue;
        }

        // Preferred: lockfile sits next to the executable.
        if let Some(exe) = proc.exe() {
            if let Some(dir) = exe.parent() {
                let candidate = dir.join("lockfile");
                if candidate.exists() {
                    candidates.push((proc, candidate));
                    continue;
                }
            }
        }

        // Fallback: parse the --install-directory launch argument.
        for arg in proc.cmd() {
            let arg = arg.to_string_lossy();
            if let Some(dir) = arg.strip_prefix("--install-directory=") {
                let candidate = PathBuf::from(dir.trim_matches('"')).join("lockfile");
                if candidate.exists() {
                    candidates.push((proc, candidate));
                    break;
                }
            }
        }
    }

    if candidates.len() > 1 {
        tracing::info!(
            count = candidates.len(),
            "multiple LeagueClientUx-like processes found; picking the most recently started"
        );
    }

    let (proc, path) = candidates.into_iter().max_by_key(|(proc, _)| proc.start_time())?;
    tracing::info!(pid = %proc.pid(), exe = ?proc.exe(), path = %path.display(), "resolved LCU lockfile");
    Some(path)
}
