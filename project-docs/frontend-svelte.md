# Frontend Development (Svelte)

The frontend is built using **Svelte 5** bundled with **Vite** and **Tailwind CSS**. It communicates with the Rust backend via Tauri's asynchronous IPC bridge.

---

## Directory & File Layout

All frontend files live in the `src/` directory:

* **[main.ts](../src/main.ts)**: Configures and mounts the main Svelte App instance to the DOM.
* **[App.svelte](../src/App.svelte)**: Core UI shell. Creates the frameless window header title bar, coordinates window collapse, and splits the main viewport between the live draft and recommendations lists.
* **[styles/app.css](../src/styles/app.css)**: Entry stylesheet importing Tailwind CSS layers, defining dark mode palettes, scrollbar styles, and core glassmorphism theme components.
* **[lib/](../src/lib)**:
  * **[types/index.ts](../src/lib/types/index.ts)**: TypeScript mirrors of the Rust serde-serialized DTOs (`DraftState`, `Recommendation`, `Weights`, `ConnectionStatus`).
  * **[ipc/tauri.ts](../src/lib/ipc/tauri.ts)**: Subscribes Svelte stores to Tauri event streams and executes state priming during initialization.
  * **[utils/ddragon.ts](../src/lib/utils/ddragon.ts)**: Constructs URLs pointing to League of Legends Data Dragon CDN (e.g. champion portraits and squares).
  * **[stores/](../src/lib/stores)**: Writable reactive storage models.
    * **[navigation.ts](../src/lib/stores/navigation.ts)**: Active navigation tab (`startseite`, `profil`, `champions`, `ranglisten`, `live_match`) with automatic routing on champ select start/end, and reset triggers.
    * **[connection.ts](../src/lib/stores/connection.ts)**: LCU WebSocket connection state.
    * **[draft.ts](../src/lib/stores/draft.ts)**: Normalized draft state data.
    * **[recommendations.ts](../src/lib/stores/recommendations.ts)**: Ranked recommendation list.
    * **[champions.ts](../src/lib/stores/champions.ts)**: Static champion catalog maps containing numeric IDs to name/image key pairs. Fetches Data Dragon on mount.
    * **[ui.ts](../src/lib/stores/ui.ts)**: Tracks window collapse shade status.
    * **[rank.ts](../src/lib/stores/rank.ts)**: Active rank tier (supports all 7 Plus tiers: Iron+ to Diamond+) plus live refresh/progress indicators for the OP.GG crawl.
    * **[settings.ts](../src/lib/stores/settings.ts)**: Persisted user settings (compact density, always-on-top, comp weight, remote `server_url` for NAS mode) and settings-modal visibility.
    * **[preselect.ts](../src/lib/stores/preselect.ts)**: `preselectedChampionId` (Issue #7 — click-to-pin from a recommendation card) plus the derived `referenceChampionId` (locked-in pick if set, else the preselection) that drives the draft-board hover preview.
  * **[components/](../src/lib/components)**:
    * **[TopNavBar.svelte](../src/lib/components/TopNavBar.svelte)**: Sleek frameless navigation bar with brand logo, tab switcher (Home, Profile, Champions, Rankings, Live Match), live summoner profile snippet, settings gear, and window controls.
    * **[LandingPage.svelte](../src/lib/components/LandingPage.svelte)**: Visual landing page with app overview, live patch status, quick links, and draft status.
    * **[ChampionsView.svelte](../src/lib/components/ChampionsView.svelte)**: Comprehensive sortable champion list view (sort by Win Rate, Pick Rate, Ban Rate) with role filter tabs, search, and drill-down into detailed champion analytics.
    * **[ChampionOverview.svelte](../src/lib/components/ChampionOverview.svelte)**: Deep champion build dashboard displaying runes trees, stat shards, skill leveling priority matrix, starter items, boots, core item builds, situational items, best & worst matchups, and full matchup/synergy modal table.
    * **[ProfileView.svelte](../src/lib/components/ProfileView.svelte)**: Active summoner profile card displaying summoner icon, level, active rank, and LCU connection status.
    * **[RankingsView.svelte](../src/lib/components/RankingsView.svelte)**: Rank tier selection overview with remote NAS sync status and data refresh triggers.
    * **[LiveMatchView.svelte](../src/lib/components/LiveMatchView.svelte)**: Champ select screen coordinating the draft board, recommendation list, and toggle to in-game build overview.
    * **[WindowControls.svelte](../src/lib/components/WindowControls.svelte)**: Controls minimize, close, and custom window-shade rollup mechanism.
    * **[DraftBoard.svelte](../src/lib/components/DraftBoard.svelte)**: Split draft layout containing ally and enemy columns and ban listings.
    * **[TeamColumn.svelte](../src/lib/components/TeamColumn.svelte)**: Grid showing five picks for a team.
    * **[ChampSlot.svelte](../src/lib/components/ChampSlot.svelte)**: Individual draft selection slot display. Shows champion portrait, names, and roles with 2-decimal winrate tooltip on hover.
    * **[RecommendationList.svelte](../src/lib/components/RecommendationList.svelte)**: Container for pick suggestion cards.
    * **[RecommendationCard.svelte](../src/lib/components/RecommendationCard.svelte)**: Card displaying score rating, colored badge tags, and component breakdown bars.
    * **[ScoreBar.svelte](../src/lib/components/ScoreBar.svelte)**: Mini visual score bar.
    * **[ReasonBadge.svelte](../src/lib/components/ReasonBadge.svelte)**: Colored badge tag (green/red/blue/grey) for counter-picks, synergy indicators, and comp-gap fills.
    * **[RankSelector.svelte](../src/lib/components/RankSelector.svelte)**: Header rank-tier dropdown for all 7 Plus tiers (Iron+ to Diamond+) plus live crawl progress indicator.
    * **[SettingsModal.svelte](../src/lib/components/SettingsModal.svelte)**: Appearance/Behavior/Data settings modal — compact density, comp-weight slider, always-on-top toggle, remote Rift Server URL configuration with connection test, and manual data refresh.

---

## State Initialization & Priming

When the Svelte application is mounted, [App.svelte](../src/App.svelte#L11-L14) calls [initChampions()](../src/lib/stores/champions.ts#L23) and [initIpc()](../src/lib/ipc/tauri.ts#L17).

1. **initChampions()**:
   * Fetches the latest Data Dragon API versions.
   * Downloads the complete `champion.json` catalog of that patch.
   * Maps numeric keys (e.g. `266` -> `Aatrox`) to configure local displays.
2. **initIpc()**:
   * Establishes active event listeners mapping `lcu://connection`, `champ-select://update`, and `recommendations://update` directly into local Svelte writable stores.
   * Triggers query commands to **prime** standard initial data in case the user opens the application mid-draft.

---

## Frameless Window-Shade Rollup

Since Rift Companion uses a custom header and frameless configuration (`decorations: false` in `tauri.conf.json`), standard title bars are hidden.

To optimize space during champion select, the user can toggle a "window-shade" collapse button in [WindowControls.svelte](../src/lib/components/WindowControls.svelte#L37-L55):
* **Collapse**: Caches the current size, sets `$collapsed` store to `true` (which immediately hides the `<main>` tag to avoid screen flicker), overrides Tauri configuration minimum height constraint, and sets the window size down to the header bar's bounding rectangle height (~64px).
* **Expand**: Restores the window size back to the cached size and resets configured minimum size constraints (980x640px).

---

## Tailwind Glassmorphic Theme

The app uses custom theme overrides configured in [tailwind.config.js](../tailwind.config.js):
* **Accent Colors**: Hextech cyan (`#0ac8b9`), gold (`#c8aa6e`), and blue (`#0397ab`).
* **Glass Theme Class**: `.glass` applies a semi-transparent white background layer, high backdrop blur filter, custom thin white borders, and soft outer shadows:
  ```css
  .glass {
    background-color: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.35);
  }
  ```
* **Soft Nested Surface**: `.glass-soft` applies a lighter layer (`rgba(255, 255, 255, 0.03)` with thin borders) for nested cards or layouts.
