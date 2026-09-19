# Rift Companion

A lightweight, dark-themed League of Legends **champion-select advisor**. It
attaches to the local League Client (LCU), tracks the live draft, and produces a
dynamically-weighted, searchable **ranked list of every playable champion** for
your assigned role.

- **Frontend:** Svelte 5 + Vite + TypeScript + Tailwind CSS (glassmorphism)
- **Backend / shell:** Tauri 2 (Rust) — small binary, low RAM, fast startup
- **Live data:** LCU WebSocket (`/lol-champ-select/v1/session`)
- **Static data:** Data Dragon (champion icons), separated from dynamic stats

---

## Why this stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Desktop shell | **Tauri 2** | Uses the OS webview instead of bundling Chromium → tiny footprint vs Electron. |
| UI framework | **Svelte** | Compiles away the framework; reactive **stores** map perfectly onto a streaming WebSocket draft state. (React/Vue work too — swap the `src/` folder.) |
| Scoring engine | **Rust (backend)** | The LCU events and stats dataset already live in Rust; scoring there avoids serialising the whole draft to JS every tick and keeps the webview thread idle. |
| Stats store | **Embedded JSON** (prototype) → **SQLite** (later) | The `Repository` query surface stays identical; only the constructor changes. |

---

## Architecture

```
                     ┌──────────────────────────── Tauri App ────────────────────────────┐
                     │                                                                    │
   League Client     │   ┌─────────────── Rust backend ───────────────┐    IPC events    │
   ┌───────────┐     │   │  lcu/      lockfile → wss → session deltas  │  ───────────▶    │   ┌──── Svelte webview ────┐
   │ LCU REST  │◀────┼───│  draft/    LCU session → normalised Draft   │  champ-select:// │   │  stores (draft,        │
   │ + WSS     │─────┼──▶│  engine/   weighted scoring + Bayesian      │  recommendations │   │  recommendations,      │
   │ 127.0.0.1 │     │   │  data/     Repository (stats + champions)   │  lcu://connection│   │  connection)           │
   └───────────┘     │   └─────────────────────────────────────────────┘  ───────────▶    │   │     │                  │
                     │                         ▲                                          │   │     ▼                  │
                     │                         │  invoke: get_recommendations,            │   │  DraftBoard +          │
                     │                         └──set_weights … ◀───────────────────────────────  RecommendationList   │
                     └────────────────────────────────────────────────────────────────────┘   └────────────────────────┘
                                                                                                          │
                                                                       Data Dragon (champion icons) ◀─────┘
```

**Data flow per draft tick:** LCU emits a session delta → `lcu::run_watcher`
parses the `[8, "...", {data}]` frame → `draft::from_session` normalises it →
`engine::recommend` scores every eligible champion → backend emits
`champ-select://update` + `recommendations://update` → Svelte stores update → UI
re-renders.

---

## Directory layout

```
rift-companion/
├── index.html                     # Vite entry
├── package.json / vite.config.ts / tailwind.config.js / tsconfig.json
├── src/                           # ── Frontend (Svelte) ──
│   ├── main.ts                    # mounts App
│   ├── App.svelte                 # frameless layout: header + draft + recs
│   ├── styles/app.css             # Tailwind + .glass glassmorphism layer
│   └── lib/
│       ├── types/index.ts         # TS mirror of Rust DTOs
│       ├── ipc/tauri.ts           # invoke wrappers + event → store wiring
│       ├── stores/                # draft, recommendations, connection
│       ├── utils/ddragon.ts       # champion icon URLs
│       └── components/            # DraftBoard, TeamColumn, ChampSlot,
│                                  # RecommendationList/Card, ScoreBar, ReasonBadge
└── src-tauri/                     # ── Backend (Rust) ──
    ├── Cargo.toml / tauri.conf.json / build.rs
    ├── capabilities/default.json  # ACL: allow webview event listening
    ├── data/stats.patch-14.12.json# embedded mock dataset
    └── src/
        ├── main.rs / lib.rs       # entry, Shared state, command + watcher wiring
        ├── commands.rs            # #[tauri::command] handlers
        ├── lcu/                   # lockfile, client (REST), websocket, models, watcher
        ├── draft/                 # LCU session → DraftState normalisation
        ├── engine/                # weights, bayesian, synergy, comp, scoring
        └── data/                  # models, repository
```

---

## The scoring algorithm

For each eligible champion in your role, its base role win rate is refined by
every locked ally and revealed enemy, using a 5x5 weight matrix keyed by
**(your role, their role)** — an ADC leans hard on its Support's synergy,
a Top laner leans hard on the enemy Top's matchup:

```
refined     = clamp(wrBase + (Σ allyWeight·allyDelta + Σ enemyWeight·enemyDelta)
                             / rowTotal(role), 0.02, 0.98)

refinement  = (refined - wrBase) + 0.15 · compBonus   // fills a missing AP/AD/frontline gap
score       = clamp(wrBase · 100 + refinement · 300, 0, 100)   // shown as a % match
```

Deltas are combined as a **weighted average, not a weighted sum** — but the
denominator (`rowTotal`) is the *entire* matrix row for that role (all 4 ally
weights + all 4 enemy weights), **not** just the weight of picks revealed so
far. That matters: dividing by only the present weight would let a single
revealed relationship pass through at close to its full raw magnitude (the
weight cancels out when it's the only term), so one strong matchup found
early in a draft could swing the score as hard as a full 8-relationship read.
Dividing by the fixed row total instead means an unrevealed pick still
occupies its slice of the denominator (weight, but delta `0.0`), so
confidence — and score movement — grows as the draft actually fills in.

**`wrBase` maps to the score 1:1** — only the refinement on top of it (ally/
enemy deltas + the comp bonus) gets the `× 300` amplification. With nothing
revealed yet (a true first pick), `score == wrBase · 100`: a champion with a
53% real win rate reads as `53`, not an amplified `59+`. The comp bonus is
also gated to require at least one locked ally — with zero allies picked,
"every damage type/frontline is missing" is trivially true and would
otherwise hand every candidate a free bonus.

Every win rate is **centred on 0.50** (advantage = distance from a coin-flip)
and **Bayesian-smoothed** toward a 50% prior:

```
adjusted = (winrate · games + 0.50 · C) / (games + C)        // C = 100
```

> ⚠️ The denominator is `games + C`, **not** `games × C` (as written in some
> drafts of the spec). `games × C` divides by zero at `games = 0` and is
> dimensionally wrong. With `games + C`: 0 games → prior (50%), ∞ games →
> observed rate.

**Data-integrity filtering** combines two mechanisms:

1. **Hard threshold** — a matchup/synergy cell with `< 100` games is
   *excluded entirely* from the weighted average (not down-weighted).
2. **Bayesian smoothing** — tames the remaining noise above the threshold.

Together they neutralise outliers. Example (validated): Teemo's *85% win rate
over 18 games vs Darius* is ignored; smoothing alone would still report 55.3%.

**Ally/enemy weight matrices**: Top/Mid weight the enemy matchup far above
ally synergy (a solo laner lives/dies by its matchup); Jungle leans
matchup-ward more mildly; ADC/Support are close to balanced since bot-lane
synergy is nearly as decisive as the 2v2 matchup — with ADC's dependence on
Support weighted higher than the reverse, since Support can still roam to
impact the game if lane synergy is bad. See `engine/weights.rs` and
[project-docs/scoring-engine.md](project-docs/scoring-engine.md) for the full
tables and rationale.

---

## Real-world caveats baked into the design

- **Enemy roles are usually hidden.** In solo/duo the enemy `assignedPosition`
  is an empty string. We infer enemy roles from each champion's primary role
  (`Repository::primary_role`) so the "direct laner" can still be identified.
- **Self-signed TLS.** The LCU uses a self-signed cert; the prototype accepts it
  (`danger_accept_invalid_certs`). Production should pin Riot's published root CA.
- **Static vs dynamic data are separated.** Champion icons come from Data Dragon
  (versioned, cacheable); win-rate stats are patch-specific and swappable.

---

## Prerequisites

- **Node.js** ≥ 18 (you have v24) and npm
- **Rust** toolchain — *not yet installed on this machine.* Install via
  <https://rustup.rs>, then add the Tauri CLI:
  ```sh
  cargo install tauri-cli --version "^2"
  ```
- Platform deps for Tauri (WebView2 is preinstalled on Windows 11).

## Run

```sh
npm install
npm run tauri:dev      # or: cargo tauri dev
```

> Note: `tauri build` (bundling) needs real icons in `src-tauri/icons/`. Generate
> them with `cargo tauri icon path/to/logo.png`. Dev mode does not require them.

---

## MVP roadmap

- **Phase 1 — Connection** ✅ scaffolded: lockfile discovery, authenticated WSS,
  champ-select subscription, state changes logged to console.
- **Phase 2 — Engine** ✅ scaffolded: weighted scoring over the mock dataset,
  full ranked pool for your role (validated with `scratchpad/sim.mjs`).
- **Phase 3 — UI** ✅ scaffolded: live ally/enemy board, searchable ranked
  cards with score bars and "why" badges.

---

## Legal & Riot Games Disclaimer

Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.

All League of Legends assets (champion icons, spells, items, splash art) used in this application are property of Riot Games and are served via Riot's Data Dragon CDN in compliance with the [Riot Games Legal Jibber Jabber](https://www.riotgames.com/en/legal) policy for non-commercial fan applications.

---

## License

This project is licensed under the [MIT License](LICENSE).
