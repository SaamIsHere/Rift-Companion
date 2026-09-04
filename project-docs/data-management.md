# Data Management & Ingestion

Rift Companion uses a runtime-replaceable JSON format to manage champion statistics. This structure separates static champion data (such as names and damage types) from dynamic patch data (win rates and matchups) so the app can update to new game patches without recompilation.

---

## The Champion Schema

The database consists of a serialized JSON array representing champion stats matching the Rust structures in [src-tauri/src/data/models.rs](../src-tauri/src/data/models.rs):

```json
[
  {
    "champion_id": 54,
    "name": "Malphite",
    "image": "Malphite",
    "damage": "magic",
    "frontline": true,
    "roles": ["top", "support"],
    "stats": {
      "top": {
        "global_winrate": 0.512,
        "games": 18450,
        "matchups": {
          "122": { "winrate": 0.542, "games": 3200 }
        },
        "synergies": {
          "64": { "winrate": 0.535, "games": 1420 }
        }
      }
    }
  }
]
```

### Schema Rules & Design Choices

1. **Damage Type enum**: Maps to string literals `"physical"`, `"magic"`, or `"mixed"`.
2. **Roles array**: The first element in the array is treated as the champion's primary position, which is used to infer the roles of opponents in drafts. The crawler guarantees this ordering by sorting `roles` by per-role game count, most-played first (Issue #19 — it previously reflected the fixed top→support crawl order, mistagging ~20% of champions).
3. **Stats maps**: Per-role stats are keyed by string representations of position names (`"top"`, `"jungle"`, `"mid"`, `"adc"`, `"support"`). Using string keys rather than enum serialization prevents ambiguity during deserialization with `serde_json`.
4. **Matchups & Synergies**: Indexed by numeric champion IDs. Win rates are expressed as floating-point ratios (e.g. `0.542` instead of `54.2%`) and games are unsigned 32-bit integers.

---

## Data Ingestion & Storage

1. **Embedded Fallback**: The app includes a default dataset embedded at compile time: [data/stats.patch-14.12.json](../src-tauri/data/stats.patch-14.12.json). If no local dataset exists on the user's machine, or if the local database file is corrupted, the application falls back to this embedded index.
2. **On-Disk Database Path**: The active database is stored in the system's AppData directory under `com.riftcompanion.app/stats.json` (defined in [src-tauri/src/data/store.rs](../src-tauri/src/data/store.rs#L18)). Two sidecars live alongside it: `stats.meta.json` (patch/rank-tier metadata) and `settings.json` (user-adjustable app settings — Issue #15: compact density, always-on-top, comp weight), both read/written by the same `data::store` module.
3. **CLI Ingest Command**: The binary can process new datasets from the command line:
   ```sh
   rift-companion ingest <path_to_normalized_json> [optional_output_path]
   ```
   * Parses the file, validates its structure, and serializes it to the active on-disk path.
   * Enables third-party pipelines (e.g. Aggregators, custom REST scrapers) to easily update the app database.
4. **Remote NAS Server Mode**: When configured in settings (`settings.server_url`, e.g. `http://192.168.1.100:8080`), the application fetches pre-computed statistics directly from the containerized Rift Server over the local network into RAM. In this mode, no large JSON datasets are dumped to the user's disk, and local background OP.GG crawls are disabled. Switching rank tiers resolves in milliseconds from the server cache.

---

## OP.GG Background Updater

On startup, and every 6 hours thereafter, a background refresher process manages patch synchronization:

```
               [Daily Timer Check]
                       │
                       ▼
             [fetch::current_version] <── Checks latest patch version on Data Dragon API
                       │
                       ▼
             Does patch version match 
             cached stats.meta.json?
             ├── Yes: (Skip Update)
             └── No:
                  │
                  ▼
            [fetch::crawl()]
            ├── 1. Read Data Dragon rosters per lane
            └── 2. Request champion analysis details via OP.GG MCP tools
                  │
                  ▼
            Update AppData/stats.json
            Write stats.meta.json
            Hot-swap shared state [Repository]
            Emit "recommendations://update" (Live draft recalculation)
```

1. **Staleness Check**: Queries Data Dragon's version registry. If the latest patch does not match the local `stats.meta.json` record, if the selected rank tier changed, or if the file is older than 24 hours (`MAX_AGE_SECS`), an update begins.
2. **Data Dragon Matching**: The scraper queries the Data Dragon CDN to retrieve the list of valid champions, matching key representations to OP.GG identifiers (e.g. converting `XinZhao` to `XIN_ZHAO` for OP.GG query endpoints).
3. **Crawl & Delay**: Downloads metadata, matchups, and synergies from OP.GG's Server-Sent Events MCP server. Synergy data is requested for all five ally lanes — OP.GG returns lists for every position except the subject's own, whose fields simply come back unmatched (Issue #20: omitting "top" from that request list silently dropped every top-lane synergy cell). The initial per-position roster fetch (5 calls) includes a configurable thread delay (default 150ms); the much larger per-champion analysis phase (hundreds of calls) runs with bounded concurrency instead (`ANALYSIS_CONCURRENCY = 6` in-flight requests at a time) since OP.GG's MCP endpoint is latency-bound, not rate-limited by a fixed delay — sequential fetching there made a full-roster crawl take 10-15 minutes.
4. **Hot-Reload**: On completion, the new stats are written to disk, and the running `Shared` pointer is updated, triggering a recalculation of active drafts in real-time.

### Rank Tier Selection (Cumulative Plus Tiers)

To ensure statistically meaningful sample sizes across all skill brackets, the rank tiers use cumulative "Plus" buckets: `iron_plus`, `bronze_plus`, `silver_plus`, `gold_plus`, `platinum_plus`, `emerald_plus`, and `diamond_plus` (Diamond/Master/Grandmaster/Challenger collapse into `diamond_plus`).

* **`iron_plus`**: Queries OP.GG's native `"all"` tier. Encompasses all ranked games from Iron up to Challenger (~865k+ games), guaranteeing comprehensive matchup and synergy sets for every valid champion role.
* **`gold_plus`, `platinum_plus`, `emerald_plus`, `diamond_plus`**: Directly supported by OP.GG's API endpoints.
* **`silver_plus` & `bronze_plus`**: OP.GG does not offer native API arguments for these lower plus brackets. The server synthesizes them via exact weighted aggregation (`combineChampionDatasets`):
  $$\text{Silver+} = \text{Silver} + \text{Gold+}$$
  $$\text{Bronze+} = \text{Bronze} + \text{Silver+}$$
  Game counts, winrates, matchups, and synergies are aggregated with proportional sample weights.

The active tier is chosen either manually via the header dropdown or auto-detected from the local player's Ranked Solo tier on LCU connect (manual picks always win and persist). Backward compatibility is maintained with aliases (`iron` -> `iron_plus`, etc.).
