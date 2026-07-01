# Development Guide & Project State

This guide explains how to set up the local development environment, simulate draft updates for testing, and outlines the current state and roadmap of the project.

---

## Prerequisites

To build and run Rift Companion, the host machine requires:

1. **Node.js** (version $\geq 18$) and `npm` package manager.
2. **Rust Toolchain**: `rustc` and `cargo` installed via [rustup.rs](https://rustup.rs).
3. **Tauri CLI**: Installed globally via cargo:
   ```sh
   cargo install tauri-cli --version "^2"
   ```
4. **Platform Dependencies**: On Windows, WebView2 is preinstalled on Windows 11. On older machines, it can be obtained via Microsoft's installer.

---

## Running the Application

1. Install Node.js frontend dependencies:
   ```sh
   npm install
   ```
2. Start the application in development mode:
   ```sh
   npm run tauri:dev
   ```
   * Starts a Vite server on port 5173.
   * Compiles the Rust backend in debug mode, connects it to the Vite webview, and opens the application window.
   * Includes Hot Module Replacement (HMR) for frontend Svelte files.

---

## Offline Testing & Draft Simulation

Since local testing requires an active League Client draft, developers can simulate LCU events headlessly:

1. **Rust Tests**: Run cargo tests to validate the scoring engine and Bayesian smoothing using the embedded mock dataset:
   ```sh
   cd src-tauri
   cargo test
   ```
2. **Scraper Scratchpad**: Use the Node-based testing scripts to test OP.GG MCP ingestion manually:
   ```sh
   node scripts/ingest-opgg.mjs
   ```
3. **Mock LCU Streamer**: You can write or run mock WebSocket scripts that emit sample JSON frames to the port matching standard draft layouts to test frontend rendering.

---

## Project State & Roadmap

The project is structured in stages, with core modules currently in the following state:

### Phase 1: Connection & Discover (Completed)
* Lockfile detection logic is fully functional.
* Authenticated secure WebSocket connection client handles draft update payloads.
* Connections recover automatically when the League Client is restarted.

### Phase 2: Engine & Scoring (Completed)
* Scoring logic incorporates Bayesian smoothing, matchup counters, and team comp balance rules.
* Ranks eligible champions in real-time and limits recommendations to a top-5 list.
* Validated using unit tests on mock datasets.

### Phase 3: Svelte User Interface (Completed)
* Displays custom frameless header layouts and window actions.
* Shows live draft slots for ally and enemy picks.
* Renders counter-pick badges and detail sub-components inside recommendation cards.

### Upcoming Milestones
1. **SQLite Database Migration**: Replace the current JSON file storage with an SQLite database file. This will allow storing historical match statistics and scaling stats queries.
2. **Weight Tuning UI**: Add a setting panel to the frontend so users can adjust algorithm weights (`matchup`, `synergy`, `counter`, `comp`) dynamically.
3. **Desktop Acrylic Styles**: Integrate the `window-vibrancy` crate to enable native translucent glass styles on Windows and macOS.
4. **Riot CA Pinning**: Replace the current self-signed HTTPS certificate bypass with pinning against Riot's published Root CA.
