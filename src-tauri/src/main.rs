// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `rift-companion ingest <normalized.json> [db_path]` rebuilds the stats DB
    // from a normalized Champion[] JSON, then exits. No args → launch the app.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("ingest") {
        if let Err(e) = rift_companion_lib::run_ingest(
            args.get(2).map(String::as_str),
            args.get(3).map(String::as_str),
        ) {
            eprintln!("ingest failed: {e:#}");
            std::process::exit(1);
        }
        return;
    }
    rift_companion_lib::run();
}
