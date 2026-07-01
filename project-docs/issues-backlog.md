# Project Issues & Feature Backlog

This backlog structures and analyzes the open GitHub issues for the Rift Companion project. It converts the original issue descriptions into developer-ready specifications, categorizes them into epics, and documents the resolved architectural design decisions.

---

## Index of Backlog Categories

* [Epic 1: Algorithmic & Engine Improvements (Issues 2, 6, 7)](#epic-1-algorithmic--engine-improvements)
* [Epic 2: Core UX & Client Integrations (Issues 9, 13)](#epic-2-core-ux--client-integrations)
* [Epic 3: New Feature Modules (Issues 4, 5, 10, 11, 12, 14)](#epic-3-new-feature-modules)
* [Epic 4: Deployment & Tooling (Issue 8)](#epic-4-deployment--tooling)

---

## Epic 1: Algorithmic & Engine Improvements

### Issue 2: Weight Distribution Matrix & Formula Refinement
* **Status**: Open
* **Priority**: High
* **Technical Summary**: Transition the scoring algorithm from the baseline flat scoring model (uniform weights) to a role-specific, matrix-based win rate delta model.
* **Implementation Plan**:
  * Update [src-tauri/src/engine/weights.rs](../src-tauri/src/engine/weights.rs) to include 5x5 matrix tables for Ally and Enemy multipliers.
  * Update the scoring loops in [src-tauri/src/engine/scoring.rs](../src-tauri/src/engine/scoring.rs) to apply matrix multipliers relative to the local player's role and the position of each locked ally/revealed enemy.
* **Resolved Design Decisions**:
  * *UI Compatibility*: **No UI matrix customizer is required.** The application will use a static predefined weight matrix hardcoded in the codebase during development.
  * *Formula Refinement & Normalization*: The formula takes the base win rate of the champion for the target role $WR_{\text{base}}(C)$ and refines it using the delta multipliers:
    $$\text{WR}_{\text{refined}}(C) = \text{WR}_{\text{base}}(C) + \sum_{\text{Allies}} (w_{\text{ally}} \cdot \Delta\text{WR}_{\text{with\_ally}}) + \sum_{\text{Enemies}} (w_{\text{enemy}} \cdot \Delta\text{WR}_{\text{vs\_enemy}})$$
    To prevent the score from exceeding bounds, the deltas/final refined win rates should be constrained. The final display score is scaled relative to the 50% baseline:
    $$\text{Score} = \text{clamp}(50.0 + (\text{WR}_{\text{refined}} - 0.50) \cdot 300.0, 0.0, 100.0)$$

### Issue 6: Live Monitor for Lane Swaps in Champion Select
* **Status**: Open
* **Priority**: High
* **Technical Summary**: Verify whether the LCU session watcher dynamically detects when players swap roles/positions during champion select.
* **Implementation Plan**:
  * Inspect the WebSocket session updates (`/lol-champ-select/v1/session`) when role trades or slot swaps occur.
  * Map the trade actions to ensure [draft::from_session](../src-tauri/src/draft/state.rs) updates the `assignedPosition` dynamically and triggers recommendations recalculation.
* **Resolved Design Decisions**:
  * *Trade vs Swap*: The app monitors player **role swaps** (assigned position cell modifications in draft) to adjust who is tagged in which lane, rather than trading selected champions at the end of the draft.

### Issue 7: Refined Champion Badges (Counter and Synergy Highlights)
* **Status**: Open
* **Priority**: Medium
* **Technical Summary**: Add visual color categorizations to recommendation badge tags.
* **Implementation Plan**:
  * Update [ReasonBadge.svelte](../src/lib/components/ReasonBadge.svelte) to take a color theme prop (e.g. `green` for positive counters/synergies, `red` for negative indicators, `blue` for comp gaps).
* **Resolved Design Decisions**:
  * *Negative Badges & Balanced View*: The scoring engine will be expanded to support negative indicator badges (red). Cards should show a balanced summary: for example, if team synergy is excellent but a lane matchup is difficult, display both a positive badge ("High synergy with [Ally]" in Green) and a negative badge ("Rough matchup vs [Opponent]" in Red) so the user can prepare.

---

## Epic 2: Core UX & Client Integrations

### Issue 9: Display Summoner Name & Profile Icon
* **Status**: Open
* **Priority**: High
* **Technical Summary**: Read the active account's profile name and level/icon and render them in the frameless title bar.
* **Implementation Plan**:
  * Add a Tauri command fetching `/lol-summoner/v1/current-summoner` on client detection.
  * Wire the response payload to a Svelte profile store and display the icon (rendered via Data Dragon) next to the Connection Orb.
* **Resolved Design Decisions**:
  * *Offline Fallback*: Display a greyed-out placeholder or "Searching..." user card when the LCU is disconnected.

### Issue 13: Rank Data Selection & Ingestion
* **Status**: Open
* **Priority**: Medium
* **Technical Summary**: Retrieve win rate statistics matching the user's active rank and allow manual rank selection.
* **Implementation Plan**:
  * Extract the player's current rank tier from the LCU profile.
  * Add a drop-down menu in the Svelte UI header.
  * Update the OP.GG MCP fetch parameters in [src-tauri/src/opgg/fetch.rs](../src-tauri/src/opgg/fetch.rs) to pass the selected rank filter when downloading stats.
* **Resolved Design Decisions**:
  * *Selectable Ranks*: Ranks dropdown is limited to Iron up to Diamond+ (Iron, Bronze, Silver, Gold, Platinum, Emerald+, Diamond+). Master, Grandmaster, and Challenger are excluded.
  * *Default Rank*: **Emerald+** is the default rank tier for data fetching and fallback.
  * *Sparsity Fallback*: If stats are empty/sparse for a chosen niche rank, it falls back to the Emerald+ default.

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
* **Status**: Open
* **Priority**: Medium
* **Technical Summary**: Implement a champion lookup filter to show the recommendation score and details of specific champions.
* **Implementation Plan**:
  * Add a search text box above the recommendations list in [RecommendationList.svelte](../src/lib/components/RecommendationList.svelte).
  * If a search string is active, query the Rust engine to score the specific searched champion and render its card at the top of the list.
* **Resolved Design Decisions**:
  * *Search Range*: The search input evaluates and scores *any* champion marked as playable in that role, displaying their score card at the top even if they are not in the top 5.

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
* **Status**: Open
* **Priority**: Medium
* **Technical Summary**: Expand the pool of "playable" champions in a role based on OP.GG active indicators.
* **Implementation Plan**:
  * Map champions as playable in a position if OP.GG stats report play rates there (instead of relying solely on primary role tags).
  * Integrate into `Repository::playable_in` to allow off-meta searches.

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
