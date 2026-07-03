# Project Issues & Feature Backlog

This backlog structures and analyzes the open GitHub issues for the Rift Companion project. It converts the original issue descriptions into developer-ready specifications, categorizes them into epics, and documents the resolved architectural design decisions.

---

## Index of Backlog Categories

* [Epic 1: Algorithmic & Engine Improvements (Issues 2, 6, 7)](#epic-1-algorithmic--engine-improvements)
* [Epic 2: Core UX & Client Integrations (Issues 9, 13, 15)](#epic-2-core-ux--client-integrations)
* [Epic 3: New Feature Modules (Issues 4, 5, 10, 11, 12, 14)](#epic-3-new-feature-modules)
* [Epic 4: Deployment & Tooling (Issue 8)](#epic-4-deployment--tooling)

---

## Epic 1: Algorithmic & Engine Improvements

### Issue 2: Weight Distribution Matrix & Formula Refinement
* **Status**: Implemented
* **Priority**: High
* **Technical Summary**: Transition the scoring algorithm from the baseline flat scoring model (uniform weights) to a role-specific, matrix-based win rate delta model.
* **Implementation**:
  * `ALLY_WEIGHTS`/`ENEMY_WEIGHTS` 5x5 matrix tables live in [src-tauri/src/engine/weights.rs](../src-tauri/src/engine/weights.rs).
  * The combined scoring loop lives in `refined_advantage` in [src-tauri/src/engine/scoring.rs](../src-tauri/src/engine/scoring.rs), applying matrix multipliers relative to the local player's role and the position of each locked ally/revealed enemy.
  * Full formula and design rationale documented in [Scoring Engine §1–3](scoring-engine.md).
* **Resolved Design Decisions**:
  * *UI Compatibility*: **No UI matrix customizer is required.** The application uses a static predefined weight matrix hardcoded in the codebase.
  * *Weighted average, not weighted sum*: the original draft formula summed weighted deltas directly, which meant the score's magnitude drifted with how many picks were revealed (early vs. late draft) and could blow past the `DISPLAY_SCALE` calibration. The implemented formula normalizes by a **fixed row total** instead:
    $$\text{WR}_{\text{refined}}(C) = \text{clamp}\Big(\text{WR}_{\text{base}}(C) + \frac{\sum_{\text{Allies}} w_{\text{ally}} \cdot \Delta\text{WR}_{\text{with\_ally}} + \sum_{\text{Enemies}} w_{\text{enemy}} \cdot \Delta\text{WR}_{\text{vs\_enemy}}}{\text{RowTotal}(\text{role})}, \; 0.02, \; 0.98\Big)$$
    $$\text{Score} = \text{clamp}\big(\text{WR}_{\text{base}} \cdot 100.0 + \big[(\text{WR}_{\text{refined}} - \text{WR}_{\text{base}}) + w_{\text{comp}} \cdot B_{\text{comp}}\big] \cdot 300.0, \; 0.0, \; 100.0\big)$$
    where `RowTotal(role)` is the sum of the *entire* matrix row (all 4 ally weights + all 4 enemy weights), not just the weight of picks revealed so far. This was a bug caught in manual testing after the first implementation: normalizing by only the *present* weight let a single revealed relationship pass through at near-full raw magnitude (the weight cancels out of the division when it's the only term), producing overinflated scores (e.g. a jungler hitting ~75% off one strong matchup) early in a draft. The fixed denominator means an unrevealed pick still occupies its slice of the row (weight, but delta `0.0`), so score confidence grows only as the draft actually fills in — mirroring how the old fixed coefficients (`w_matchup = 0.40`, etc.) capped any single relationship's pull.
  * *`WR_base` maps to the score 1:1*: a second bug caught in the same round of manual testing — `Score = 50 + (WR_refined - 0.50) × 300` applied the `×300` amplification to the *base* win rate too, so a champion sitting at an ordinary 53% win rate with nothing else revealed (a true first pick) displayed as `59+` instead of `53`. Fixed by only amplifying the *refinement* on top of `WR_base` (see formula above); `WR_base` itself passes straight through as a percentage, so a first pick with zero information now reads as exactly the champion's real win rate.
  * *Comp bonus requires at least one locked ally*: `comp::needs` previously flagged `needs_ap`/`needs_ad`/`needs_frontline` whenever the corresponding ally count was `0` — including when *zero* allies were locked at all, in which case every category is trivially "missing" and every candidate got a free bonus. Now returns no needs at all until at least one ally is actually locked in.
  * *WR_base definition*: the champion's Bayesian-smoothed win rate aggregated across every game played in the role, not a cherry-picked best matchup.
  * *Sample-size gate*: matchup/synergy cells below `MIN_MATCHES` (100 games) are excluded entirely from the average (not down-weighted), plus Bayesian smoothing on top — so a 2-game 100%/0% record can't overinflate or ruin a candidate's score.
  * *Matrix philosophy*: enemy matchup weight dominates ally synergy weight for Top/Mid (solo lanes live/die by their matchup), Jungle leans matchup-ward but less sharply, and ADC/Support are close to balanced since bot-lane synergy is nearly as decisive as the 2v2 matchup. ADC's dependence on Support (1.8) is weighted higher than Support's dependence on ADC (1.3), since a Support can still impact the game by roaming if lane synergy is poor.

### Issue 6: Live Monitor for Lane Swaps in Champion Select
* **Status**: Verified — already working, no code change required.
* **Priority**: High
* **Technical Summary**: Verify whether the LCU session watcher dynamically detects when players swap roles/positions during champion select.
* **Verification (2026-07-02)**: Confirmed by tracing the pipeline end to end:
  * [lcu/mod.rs::run_watcher](../src-tauri/src/lcu/mod.rs) subscribes to the full `OnJsonApiEvent_lol-champ-select_v1_session` topic. The LCU broadcasts the **entire** session object (not a diff) on every state change, including a completed position trade.
  * [lcu/mod.rs::handle_session](../src-tauri/src/lcu/mod.rs) runs unconditionally on **every** websocket message — no caching/diffing that could suppress a role-only change. It always calls [draft::from_session](../src-tauri/src/draft/state.rs), which re-reads `assignedPosition` fresh off the just-received payload every time (never trusts stale state).
  * Every call to `handle_session` unconditionally recomputes recommendations (`engine::recommend`) and re-emits both `champ-select://update` and `recommendations://update`.
  * The frontend ([tauri.ts::initIpc](../src/lib/ipc/tauri.ts)) subscribes to both events and writes straight into Svelte stores, which reactively re-render the draft board and recommendation list — so a role swap flows through to the UI with no manual refresh.
  * Because the app reacts to `assignedPosition` changes (not to in-flight trade *request* actions), it correctly waits until a trade is actually accepted/finalized before re-tagging lanes — matching the resolved design decision below.
* **Resolved Design Decisions**:
  * *Trade vs Swap*: The app monitors player **role swaps** (assigned position cell modifications in draft) to adjust who is tagged in which lane, rather than trading selected champions at the end of the draft.

### Issue 7: Refined Champion Badges (Counter and Synergy Highlights)
* **Status**: Implemented
* **Priority**: Medium
* **Technical Summary**: Add visual color categorizations to recommendation badge tags, plus an on-hover matchup/synergy preview against specific drafted champions.
* **Implementation**:
  * [scoring.rs](../src-tauri/src/engine/scoring.rs) replaces `Recommendation::reasons: Vec<String>` with `badges: Vec<Badge>`, where `Badge { text, kind }` and `BadgeKind` is `Positive | Negative | Comp | Neutral`. `refined_advantage` now tracks the strongest ally signal in *both* directions (`best_synergy`/`worst_synergy`, gated by the same `adj > 0.52` / `adj < 0.48` thresholds used for the existing matchup badge) and picks whichever has the larger `|contribution|`, so a champion's synergy badge is whichever relationship actually moved its score most — not just the first positive one found. The direct lane opponent gets the same positive/negative split ("Strong lane counter to X" / "Rough matchup vs X"). Comp-gap badges stay `Comp`-colored and are always positive by construction. Badge list order is `[matchup, synergy, ...comp]`, truncated to 3.
  * [ReasonBadge.svelte](../src/lib/components/ReasonBadge.svelte) takes a `kind` prop and maps it to a Tailwind color: emerald (positive), rose (negative), hextech-cyan (comp), slate (neutral/fallback).
  * **Hover preview**: a new `get_pairwise_stat(champion_id, role, other_id, is_ally)` Tauri command ([commands.rs](../src-tauri/src/commands.rs)) looks up one ally/enemy cell directly off the repository (same `MIN_MATCHES` gate + Bayesian smoothing as the scoring engine, so the preview number always matches what actually fed the score) and returns `None` if untrusted. [ChampSlot.svelte](../src/lib/components/ChampSlot.svelte) calls it on hover and renders a small tooltip. The "reference" champion is a derived store, `referenceChampionId` in [stores/preselect.ts](../src/lib/stores/preselect.ts): the local player's locked-in `draft.local_champion_id` if set, otherwise whatever champion was last clicked ("preselected") in [RecommendationCard.svelte](../src/lib/components/RecommendationCard.svelte) — a locked-in pick always wins over a stale preselection. [DraftBoard.svelte](../src/lib/components/DraftBoard.svelte) shows a small "Previewing: [Champion]" hint when a reference is active.
* **Resolved Design Decisions**:
  * *Negative Badges & Balanced View*: the scoring engine supports negative indicator badges (red). Cards show a balanced summary: if team synergy is excellent but a lane matchup is difficult, both a positive badge ("High synergy with [Ally]" in Green) and a negative badge ("Rough matchup vs [Opponent]" in Red) can appear together, since matchup and synergy are scored/badged as independent categories.
  * *Preselection is click-to-pin, not raw hover*: the issue's "preselecting a champion" was implemented as clicking a recommendation card (toggle on/off), not a continuous hover-link — hovering a card and then moving the mouse to a draft slot would otherwise clear the hover state before the user could read the board tooltip.

---

## Epic 2: Core UX & Client Integrations

### Issue 9: Display Summoner Name & Profile Icon
* **Status**: Implemented
* **Priority**: High
* **Technical Summary**: Read the active account's profile name and level/icon and render them in the frameless title bar.
* **Implementation**:
  * [lcu/client.rs::get_current_summoner](../src-tauri/src/lcu/client.rs) fetches `/lol-summoner/v1/current-summoner` and returns a `Summoner { display_name, level, profile_icon_id }`. `display_name` prefers the modern Riot ID (`gameName#tagLine`) and falls back to the legacy `displayName` field for accounts/clients that don't populate `gameName`.
  * [lcu/mod.rs::run_watcher](../src-tauri/src/lcu/mod.rs) fetches the profile only *after* `websocket::connect` succeeds (not right after the lockfile is found), alongside the existing rank-tier auto-detection and initial session pull, and stores it on `Shared::profile`, emitting `"lcu://profile"`. `set_status` clears `Shared::profile` and re-emits `null` whenever the connection drops back to `Searching`, so a disconnect can't leave a stale name/icon on screen.
  * A new `get_profile` command ([commands.rs](../src-tauri/src/commands.rs)) primes the frontend on launch, mirroring `get_connection_status`.
  * [stores/profile.ts](../src/lib/stores/profile.ts) holds the `Summoner | null` state; [ipc/tauri.ts](../src/lib/ipc/tauri.ts) listens for `"lcu://profile"` and primes via `get_profile`. [ddragon.ts::profileIconUrl](../src/lib/utils/ddragon.ts) mirrors the existing `squareIconUrl` helper for the `/img/profileicon/<id>.png` Data Dragon path.
  * [ConnectionStatus.svelte](../src/lib/components/ConnectionStatus.svelte) renders the profile icon, Riot ID, and level once connected *and* the profile has arrived; otherwise it falls back to the original dot + "Client connected"/"Waiting for League client…" text — covering both the disconnected case and the brief window after connecting but before the profile fetch resolves.
  * **Cold-start race (found via manual testing)**: when League is launched *after* Rift Companion (rather than the reverse), the `lockfile` file can be readable, and `LeagueClientUx.exe` already listed as a running process, well before its internal HTTPS/WebSocket API is actually accepting connections — `websocket::connect` fails with a raw TCP-level "actively refused" (not a timeout) for what was observed to be up to ~30-60s during a cold client start. [lcu/mod.rs::run_watcher](../src-tauri/src/lcu/mod.rs) already retries the whole discover-and-connect cycle every 2s indefinitely, so this self-heals without user intervention — it just requires patience through that window rather than a fixed delay or extra backoff tuning. [lcu/lockfile.rs::locate_path](../src-tauri/src/lcu/lockfile.rs) was also hardened to consider every running `LeagueClientUx*`-matching process (CEF spawns several `LeagueClientUxRender.exe` helper processes alongside the main `LeagueClientUx.exe`, all sharing the same lockfile) and log the resolved PID/exe/path, rather than trusting whichever process a `HashMap` iteration happened to hit first — this turned out not to be the cause of this particular race (all candidates shared one lockfile/port), but is a real hardening against a genuinely stale/leftover process winning by iteration order, and the logging was what let this race get diagnosed conclusively.
* **Resolved Design Decisions**:
  * *Offline Fallback*: Display a greyed-out placeholder or "Searching..." user card when the LCU is disconnected.

### Issue 13: Rank Data Selection & Ingestion
* **Status**: Implemented
* **Priority**: Medium
* **Technical Summary**: Retrieve win rate statistics matching the user's active rank and allow manual rank selection.
* **Implementation**:
  * [RankTier](../src-tauri/src/data/models.rs) is a 7-value enum (Iron..DiamondPlus) shared by the crawler, `Shared` app state, and the Tauri command layer. `RankTier::as_opgg_tier` maps it to the exact OP.GG MCP `tier` argument values (confirmed live against `mcp-api.op.gg`'s `lol_get_champion_analysis` validator: `iron, bronze, silver, gold, platinum, emerald_plus, diamond_plus`, among others).
  * [opgg/fetch.rs::crawl](../src-tauri/src/opgg/fetch.rs) passes `tier` on every `lol_get_champion_analysis` call (matchups, synergies, damage type). Per champion/role, if the returned `average_stats.play` sample is below `MIN_TIER_SAMPLE_GAMES` (300) and the selected tier isn't already Emerald+, that one call is transparently re-issued at `emerald_plus` — the graceful per-champion fallback the issue asked for.
  * [opgg/refresh.rs::refresh_now](../src-tauri/src/opgg/refresh.rs) is the shared crawl-persist-hotswap-emit path, reused by the periodic ticker, the manual dropdown command, and LCU auto-detection, serialized behind `Shared::refresh_lock` so they can't hit OP.GG concurrently. `trigger_refresh` fires it in the background and emits `"rank-refresh://status"` / `"rank://update"` for the UI.
  * [commands.rs::set_rank_tier](../src-tauri/src/commands.rs) (dropdown) marks the selection `manual` and persists it immediately (survives a restart even if the following crawl fails). [lcu/mod.rs](../src-tauri/src/lcu/mod.rs) auto-detects the local player's Ranked Solo tier via a new [lcu/client.rs::get_ranked_solo_tier](../src-tauri/src/lcu/client.rs) call on every LCU (re)connect, but only while no manual selection is active — manual always wins and is sticky (no "revert to auto" control in this pass).
  * [RankSelector.svelte](../src/lib/components/RankSelector.svelte) renders the 7-option dropdown in the header next to `ConnectionStatus`. While a refresh is in flight it shows a live `done/total` progress counter (via a new `"rank-refresh://progress"` event) once the per-champion crawl phase starts, falling back to a plain pulsing dot during the brief roster-fetch phase before progress is known.
  * **Concurrency (found via manual testing)**: the per-champion `lol_get_champion_analysis` crawl was originally fully sequential — OP.GG's MCP endpoint responds slowly enough (~3s/call observed) that a full-roster crawl took 10-15 minutes with only a static dot for feedback, which read as "stuck" even though it wasn't. [opgg/fetch.rs::crawl](../src-tauri/src/opgg/fetch.rs) now fetches up to `ANALYSIS_CONCURRENCY` (6) champion/role pairs concurrently via `futures::stream::buffer_unordered`, merging results back into the champion map sequentially as each completes (safe without locking since the merge only ever happens on the consuming task). [opgg/client.rs::McpClient](../src-tauri/src/opgg/client.rs) was made shareable (`session` behind a `Mutex`, methods take `&self`) so every concurrent fetch reuses one MCP session via `Arc<McpClient>` instead of opening one per call. Measured ~3.4x wall-clock speedup on a scoped test crawl (56s → 16.4s).
* **Resolved Design Decisions**:
  * *Selectable Ranks*: Ranks dropdown is limited to Iron up to Diamond+ (Iron, Bronze, Silver, Gold, Platinum, Emerald+, Diamond+). Master, Grandmaster, and Challenger are excluded.
  * *Default Rank*: **Emerald+** is the default rank tier for data fetching and fallback.
  * *Sparsity Fallback*: If stats are empty/sparse for a chosen niche rank, it falls back to the Emerald+ default.
  * *Upstream limitation*: `lol_list_lane_meta_champions` (per-role roster, `global_winrate`, `games`) has no `tier` parameter in OP.GG's MCP schema at all — only `lol_get_champion_analysis` (matchups/synergies/damage type) supports tier filtering. So rank selection makes matchup and synergy numbers rank-specific, but each champion's baseline global win rate stays an all-tier aggregate regardless of the selected rank. This is a real constraint of OP.GG's public API surface, not an oversight.
  * *Manual vs auto precedence*: an explicit dropdown pick is sticky for the rest of that install — LCU auto-detection never overwrites a manual choice, even across restarts (persisted via the `manual` flag in `stats.meta.json`).

### Issue 15: Settings Menu
* **Status**: Implemented
* **Priority**: Medium
* **Technical Summary**: Add a settings button letting the user adjust style, behavior, and preference options, following the issue's suggested Appearance/Behavior/Data groupings.
* **Implementation**:
  * A new gear icon in the header ([SettingsButton.svelte](../src/lib/components/SettingsButton.svelte)) opens a centered glass modal ([SettingsModal.svelte](../src/lib/components/SettingsModal.svelte)) with three sections:
    * **Appearance**: a compact-density toggle that shrinks [RecommendationCard.svelte](../src/lib/components/RecommendationCard.svelte)'s padding/icon size and drops the score bar/reason badges, and tightens the list gap in [RecommendationList.svelte](../src/lib/components/RecommendationList.svelte).
    * **Behavior**: a team-comp weight slider (0–0.30) that finally gives the pre-existing `set_weights`/`setWeights` plumbing a UI (it was wired end-to-end but never called from anywhere — see Issue 2); and an always-on-top toggle useful for keeping the companion window pinned above the League client.
    * **Data**: a "Refresh data now" button that force-triggers `opgg::refresh::trigger_refresh` immediately instead of waiting on the periodic 6h/24h cycle, reusing the existing `rank-refresh://status`/`rank-refresh://progress` events (no new events needed).
  * All four settings persist to a new `Settings` struct in [data/store.rs](../src-tauri/src/data/store.rs), written to a `settings.json` sidecar next to `stats.json`/`stats.meta.json`, mirroring the existing `DatasetMeta` read/write pattern. `Shared.settings` seeds `Shared.weights`' initial `comp` value and the main window's always-on-top state on startup.
  * `commands::get_settings`/`set_settings` mirror `get_rank_tier`/`set_rank_tier`: `set_settings` clamps `comp_weight` to `[0.0, 1.0]`, persists, updates `Shared.weights.comp`, applies `window.set_always_on_top(...)` directly via the Rust-owned `WebviewWindow` handle, and re-emits `recommendations://update`.
* **Resolved Design Decisions**:
  * *Presentation*: a modal overlay (not a slide-in side panel) — simplest to dismiss and doesn't disturb the compact draft/recommendations layout.
  * *No new capability permissions*: always-on-top is toggled from inside the Rust command using the `AppHandle`'s own window handle, not via a frontend-invoked `core:window:*` call, so `capabilities/default.json` needed no changes.

---

## Epic 3: New Feature Modules

### Issue 4: Manual Opponent Role Assigner in Draft
* **Status**: Open
* **Priority**: High
* **Technical Summary**: Allow users to rearrange guessed opponent roles during draft phase.
* **Implementation Plan**:
  * Add a role selector dropdown menu to each opponent's draft card on the board.
  * Pass overrides back to [Shared::latest_draft](../src-tauri/src/lib.rs#L39) to force update recommendations immediately.
* **Resolved Design Decisions**:
  * *Control Type*: A simple click dropdown selector on the opponent card is sufficient for rearranging roles (no complex drag-and-drop system is requested).

### Issue 5: Champion Search Input
* **Status**: Implemented
* **Priority**: Medium
* **Technical Summary**: Implement a champion lookup filter to show the recommendation score and details of specific champions.
* **Implementation**:
  * A search text box lives above the recommendations list in [RecommendationList.svelte](../src/lib/components/RecommendationList.svelte), filtering the reactive `filtered` list by a case-insensitive substring match on champion name.
  * No separate backend query was needed: since [Issue 14](#issue-14-expand-playable-champions-pool-per-role-split-from-issue-5) makes the engine return every playable champion's score already (not just a Top 5), the search box only needs to filter the list client-side — every champion is already scored and present in `$recommendations`.
  * Each card keeps its rank number from the *unfiltered* list (`$recommendations.indexOf(rec) + 1`), so searching shows the champion's true standing among the full pool rather than a re-numbered position within the filtered results.
* **Resolved Design Decisions**:
  * *Search Range*: The search input evaluates and scores *any* champion marked as playable in that role, showing their score card regardless of overall rank.

### Issue 10: Switch to In-Game Matchup Dashboard
* **Status**: Open
* **Priority**: High
* **Technical Summary**: Transition the application display from draft state to live game matchup boards when transitioning into a match.
* **Implementation Plan**:
  * Add LCU watcher hooks to detect gameflow transition to `InProgress` state.
  * Fetch game session players via `/lol-gameflow/v1/session`.
  * Render a dashboard showing the 5v5 matchups, role indicators, and lane swap adjusters.
* **Resolved Design Decisions**:
  * *Dashboard Features*: Displays active match players, matchups, and lane indicators. Includes manual override controls to rearrange/swap lane configurations if system guesses incorrectly.

### Issue 11: Draft Simulator Mode
* **Status**: Open
* **Priority**: Medium
* **Technical Summary**: Implement a manual offline tool to mock draft states without a running LCU client.
* **Implementation Plan**:
  * Add a "Simulator Mode" toggle to the UI.
  * Create a mock panel where users can manually assign roles, bans, and lock champion picks for both teams to evaluate champion scores.
* **Resolved Design Decisions**:
  * *UI Layout*: Integrates as a separate toggle view when LCU is not detected.

### Issue 12: Profile & Match History tab
* **Status**: Open
* **Priority**: Low
* **Technical Summary**: Implement a match summary view using LCU local history endpoints.
* **Implementation Plan**:
  * Read historical games using the LCU match history REST endpoint.
  * Build a Svelte profile tab showing game outcomes, scores, and champions.
* **Resolved Design Decisions**:
  * Displays a simple list of the last 10 games played, including match win/loss cards.

### Issue 14: Expand Playable Champions Pool per Role (Split from Issue 5)
* **Status**: Implemented
* **Priority**: Medium
* **Technical Summary**: Expand the pool of "playable" champions in a role based on OP.GG active indicators.
* **Implementation**:
  * `Repository::playable_in` ([repository.rs](../src-tauri/src/data/repository.rs)) already tags a champion's `roles: Vec<Role>` from the actual per-position OP.GG lane-meta crawl in [opgg/fetch.rs::crawl](../src-tauri/src/opgg/fetch.rs) — every position a champion shows up in that crawl's roster gets appended, not just a single "primary role" tag — so the eligibility gate was not the bottleneck.
  * The actual bottleneck was in the ranking step: `engine::recommend` ([scoring.rs](../src-tauri/src/engine/scoring.rs)) scored every eligible champion via `playable_in` but then called `out.truncate(5)`, discarding everything past the 5th-highest score before it ever reached the frontend. That truncation is now removed — `recommend` returns the full scored, sorted pool for the role.
  * [RecommendationList.svelte](../src/lib/components/RecommendationList.svelte) renders the entire pool in a scrollable list instead of a fixed 5-card block.
* **Resolved Design Decisions**:
  * *No frontend cap*: the UI trusts the backend's full sorted list rather than re-slicing it — any future "show only top N" behavior should be a display-layer choice (e.g. collapsing/paginating), not a scoring-layer one.

---

## Epic 4: Deployment & Tooling

### Issue 8: NSIS Installer Config
* **Status**: Open
* **Priority**: Low
* **Technical Summary**: Configure Tauri packaging to output NSIS/MSI installers.
* **Implementation Plan**:
  * Configure icons and windows install presets in [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json).
  * Set up GitHub Actions release flow to bundle builds automatically.
* **Resolved Design Decisions**:
  * Build simple installers. Auto-update checks are deferred.
