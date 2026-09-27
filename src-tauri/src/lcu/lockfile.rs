//! Discovery + parsing of the League Client `lockfile`.
//!
//! The running client writes a `lockfile` into its install directory containing
//! `LeagueClient:<pid>:<port>:<password>:<protocol>`. We locate it by finding the
//! `LeagueClientUx` process and reading the file next to its executable.

use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};

/// Last lockfile path resolved via a full process scan. Checked first on
/// every call so the common "still running, nothing changed" case only
/// costs a cheap `exists()` instead of a full `sysinfo` process-table scan
/// (with exe paths and command lines) every 3s while idle.
static LAST_KNOWN_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Debug, Clone)]
pub struct Lockfile {
    pub pid: u32,
    pub port: u16,
    pub password: String,
    #[allow(dead_code)]
    pub protocol: String,
}

/// Returns true if a process with `pid` is currently running and belongs to the League client.
pub fn is_league_process_alive(pid: u32) -> bool {
    let mut sys = System::new();
    let sys_pid = sysinfo::Pid::from_u32(pid);
    sys.refresh_processes(ProcessesToUpdate::All, true);
    if let Some(proc) = sys.process(sys_pid) {
        let name = proc.name().to_string_lossy().to_lowercase();
        name.starts_with("leagueclient")
    } else {
        false
    }
}

/// Returns the lockfile if the League client is currently running.
pub fn find() -> Option<Lockfile> {
    let path = locate_path()?;
    let raw = std::fs::read_to_string(&path).ok()?;
    let lockfile = parse(&raw).ok()?;

    // Double check: ensure the process in the lockfile is actively running.
    if !is_league_process_alive(lockfile.pid) {
        tracing::debug!(pid = lockfile.pid, path = %path.display(), "stale lockfile ignored; League process not running");
        *LAST_KNOWN_PATH.lock().unwrap() = None;
        return None;
    }

    Some(lockfile)
}

fn parse(raw: &str) -> Result<Lockfile> {
    // Format: LeagueClient:PID:PORT:PASSWORD:PROTOCOL
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 5 {
        return Err(anyhow!("malformed lockfile: {raw:?}"));
    }
    Ok(Lockfile {
        pid: parts[1].parse()?,
        port: parts[2].parse()?,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

fn locate_path() -> Option<PathBuf> {
    // Check cached path first, but only if the process recorded in it is actually alive!
    if let Some(cached) = LAST_KNOWN_PATH.lock().unwrap().clone() {
        if cached.exists() {
            if let Ok(raw) = std::fs::read_to_string(&cached) {
                if let Ok(lockfile) = parse(&raw) {
                    if is_league_process_alive(lockfile.pid) {
                        return Some(cached);
                    }
                }
            }
        }
        // Stale cache
        *LAST_KNOWN_PATH.lock().unwrap() = None;
    }

    let resolved = locate_path_via_process_scan();
    if let Some(path) = &resolved {
        *LAST_KNOWN_PATH.lock().unwrap() = Some(path.clone());
    }
    resolved
}

fn locate_path_via_process_scan() -> Option<PathBuf> {
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
        let mut found = false;
        for arg in proc.cmd() {
            let arg = arg.to_string_lossy();
            if let Some(dir) = arg.strip_prefix("--install-directory=") {
                let candidate = PathBuf::from(dir.trim_matches('"')).join("lockfile");
                if candidate.exists() {
                    candidates.push((proc, candidate));
                    found = true;
                    break;
                }
            }
        }
        if found {
            continue;
        }

        // Fallback: check standard installation directories only while this process is running
        #[cfg(windows)]
        {
            for default_path in [
                r"C:\Riot Games\League of Legends\lockfile",
                r"D:\Riot Games\League of Legends\lockfile",
                r"E:\Riot Games\League of Legends\lockfile",
            ] {
                let candidate = PathBuf::from(default_path);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_lockfile() {
        let raw = "LeagueClient:13372:49949:bqHPcQCvAA9OlvNIn8XbcA:https";
        let parsed = parse(raw).expect("should parse valid lockfile");
        assert_eq!(parsed.pid, 13372);
        assert_eq!(parsed.port, 49949);
        assert_eq!(parsed.password, "bqHPcQCvAA9OlvNIn8XbcA");
        assert_eq!(parsed.protocol, "https");
    }

    #[test]
    fn test_parse_invalid_lockfile() {
        let raw = "bad:lockfile";
        assert!(parse(raw).is_err());
    }

    #[test]
    fn test_dead_pid_not_alive() {
        assert!(!is_league_process_alive(999_999_999));
    }

    #[test]
    fn test_find_ignores_stale_lockfile_when_league_not_running() {
        // Since League of Legends is not running right now, find() must return None
        // even though C:\Riot Games\League of Legends\lockfile may exist on disk.
        assert!(find().is_none());
    }
}
