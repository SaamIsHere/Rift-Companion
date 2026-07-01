# Backend Development (Rust)

The Rust backend is structured as a library ([src-tauri/src/lib.rs](../src-tauri/src/lib.rs)) containing the core logic, and a thin binary entry point ([src-tauri/src/main.rs](../src-tauri/src/main.rs)) which acts as either the client app container or a data ingestion CLI tool.

---

## Crate Layout & Directory Structure

All backend code lives in the `src-tauri/src/` folder:

* **[main.rs](../src-tauri/src/main.rs)**: Standard entry point. Parses command arguments. If the first argument is `"ingest"`, it invokes data ingestion and exits; otherwise, it launches the GUI.
* **[lib.rs](../src-tauri/src/lib.rs)**: System entry point, setup hooks, static thread state container (`Shared`), and logging subscribers.
* **[commands.rs](../src-tauri/src/commands.rs)**: Handlers for front-end IPC commands.
* **[lcu/](../src-tauri/src/lcu)**: Orchestrates the League Client connection.
  * **[lockfile.rs](../src-tauri/src/lcu/lockfile.rs)**: Parses Riot client credentials (port, password, protocol).
  * **[client.rs](../src-tauri/src/lcu/client.rs)**: LCU REST client. Connects using self-signed certificate overrides.
  * **[websocket.rs](../src-tauri/src/lcu/websocket.rs)**: Manages TLS/WSS stream subscription connections.
  * **[models.rs](../src-tauri/src/lcu/models.rs)**: Native LCU JSON models.
* **[draft/](../src-tauri/src/draft)**: Normalization logic.
  * **[state.rs](../src-tauri/src/draft/state.rs)**: Transforms raw LCU data payloads into simple `DraftState` matrices.
* **[engine/](../src-tauri/src/engine)**: scoring algorithms (see [Scoring Engine](scoring-engine.md)).
* **[data/](../src-tauri/src/data)**: Holds repositories, data store mechanisms, and parser tools (see [Data Management](data-management.md)).
* **[opgg/](../src-tauri/src/opgg)**: Scraper and updater modules.
  * **[client.rs](../src-tauri/src/opgg/client.rs)**: A minimal HTTP client implementation talking to OP.GG's MCP Server endpoint.
  * **[dsl.rs](../src-tauri/src/opgg/dsl.rs)**: Custom recursive-descent parser for OP.GG's class-based response DSL.
  * **[fetch.rs](../src-tauri/src/opgg/fetch.rs)**: Drives OP.GG API crawlers and parses models into runtime entities.
  * **[refresh.rs](../src-tauri/src/opgg/refresh.rs)**: The scheduler thread check ticker.

---

## League Client Update (LCU) discovery

Riot Client launches League with a local microservices REST server. The authentication credentials are dynamically written to a text file called `lockfile` located inside the main game directory.

1. **Discovery**: [lcu::lockfile::find](../src-tauri/src/lcu/lockfile.rs#L25) looks up the system's active process tree (via parent directories or standard pathways) to parse the `lockfile` containing:
   `ProcessName:ProcessID:Port:Password:Protocol`
2. **REST Auth**: Basic authentication is used, with username `riot` and the file's `Password` as the credentials.
3. **Self-signed TLS Certificates**: Since the client runs on `localhost` with a self-signed certificate, connections bypass verification using `danger_accept_invalid_certs(true)` (configured in [lcu::client](../src-tauri/src/lcu/client.rs#L12) and [lcu::websocket](../src-tauri/src/lcu/websocket.rs#L22)).
4. **WebSocket Subscription**: Establishes a secure connection to `wss://127.0.0.1:{port}/`. Sends an event subscription vector for topic `[5, "OnJsonApiEvent_lol-champ-select_v1_session"]` to stream live draft updates.

---

## OP.GG MCP DSL Parser

The OP.GG database leverages an internal Model Context Protocol (MCP) server that serializes responses into a proprietary class-like format rather than raw standard JSON.

**Sample raw string response:**
```text
class ChampionAnalysis: strong_counters, weak_counters, damage_type
class Counter: champion_id, win_rate, play
ChampionAnalysis([Counter(122, 0.447, 342)], [], "AP")
```

The custom parser in [opgg::dsl::parse](../src-tauri/src/opgg/dsl.rs#L12) executes a recursive-descent tokenization of this string:
1. **Header Parsing**: Extracts line structures starting with `class ` to index maps of keys (`HashMap<String, Vec<String>>`).
2. **Value Evaluation**: Scans token sequences. Replaces identified class constructors (e.g. `Counter(...)`) with JSON object constructs (`{"champion_id": 122, "win_rate": 0.447, "play": 342}`) using keys matched by parameter positions from headers.
3. **Output Generation**: Normalizes the response tree structure back into standard `serde_json::Value` arrays.

---

## Tauri Commands & Event Emitters

The webview calls Rust functions using Tauri's command dispatch handler:

```rust
#[tauri::command]
pub fn get_connection_status(state: State<Shared>) -> ConnectionStatus;

#[tauri::command]
pub fn get_draft_state(state: State<Shared>) -> Option<DraftState>;

#[tauri::command]
pub fn get_recommendations(state: State<Shared>) -> Vec<Recommendation>;

#[tauri::command]
pub fn set_weights(state: State<Shared>, weights: Weights, app: AppHandle) -> Vec<Recommendation>;
```

Whenever the LCU watcher process receives draft changes, it emits events asynchronously:
* **`lcu://connection`**: Emitted when the client searches or connects (`ConnectionStatus`).
* **`champ-select://update`**: Emitted on draft state shifts (`DraftState`).
* **`recommendations://update`**: Emitted with live ranked recommendations (`Vec<Recommendation>`).
