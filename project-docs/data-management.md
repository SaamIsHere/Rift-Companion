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
2. **Roles array**: The first element in the array is treated as the champion's primary position, which is used to infer the roles of opponents in drafts.
3. **Stats maps**: Per-role stats are keyed by string representations of position names (`"top"`, `"jungle"`, `"mid"`, `"adc"`, `"support"`). Using string keys rather than enum serialization prevents ambiguity during deserialization with `serde_json`.
4. **Matchups & Synergies**: Indexed by numeric champion IDs. Win rates are expressed as floating-point ratios (e.g. `0.542` instead of `54.2%`) and games are unsigned 32-bit integers.

---

## Data Ingestion & Storage

1. **Embedded Fallback**: The app includes a default dataset embedded at compile time: [data/stats.patch-14.12.json](../src-tauri/data/stats.patch-14.12.json). If no local dataset exists on the user's machine, or if the local database file is corrupted, the application falls back to this embedded index.
2. **On-Disk Database Path**: The active database is stored in the system's AppData directory under `com.riftcompanion.app/stats.json` (defined in [src-tauri/src/data/store.rs](../src-tauri/src/data/store.rs#L18)).
3. **CLI Ingest Command**: The binary can process new datasets from the command line:
   ```sh
   rift-companion ingest <path_to_normalized_json> [optional_output_path]
   ```
   * Parses the file, validates its structure, and serializes it to the active on-disk path.
   * Enables third-party pipelines (e.g. Aggregators, custom REST scrapers) to easily update the app database.

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

1. **Staleness Check**: Queries Data Dragon's version registry. If the latest patch does not match the local `stats.meta.json` record, or if the file is older than 24 hours (`MAX_AGE_SECS`), an update begins.
2. **Data Dragon Matching**: The scraper queries the Data Dragon CDN to retrieve the list of valid champions, matching key representations to OP.GG identifiers (e.g. converting `XinZhao` to `XIN_ZHAO` for OP.GG query endpoints).
3. **Crawl & Delay**: Downloads metadata, matchups, and synergies from OP.GG's Server-Sent Events MCP server. To respect endpoint rate limits, calls include a configurable thread delay (default 150ms).
4. **Hot-Reload**: On completion, the new stats are written to disk, and the running `Shared` pointer is updated, triggering a recalculation of active drafts in real-time.
