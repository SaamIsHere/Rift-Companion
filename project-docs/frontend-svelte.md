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
    * **[connection.ts](../src/lib/stores/connection.ts)**: LCU WebSocket connection state.
    * **[draft.ts](../src/lib/stores/draft.ts)**: Normalized draft state data.
    * **[recommendations.ts](../src/lib/stores/recommendations.ts)**: Ranked recommendation list.
    * **[champions.ts](../src/lib/stores/champions.ts)**: Static champion catalog maps containing numeric IDs to name/image key pairs. Fetches Data Dragon on mount.
    * **[ui.ts](../src/lib/stores/ui.ts)**: Tracks window collapse shade status.
    * **[rank.ts](../src/lib/stores/rank.ts)**: Active rank tier plus live refresh/progress indicators for the OP.GG crawl.
    * **[settings.ts](../src/lib/stores/settings.ts)**: Persisted user settings (Issue #15: compact density, always-on-top, comp weight) and settings-modal visibility.
  * **[components/](../src/lib/components)**:
    * **[WindowControls.svelte](../src/lib/components/WindowControls.svelte)**: Controls minimize, close, maximize, and a custom **window-shade rollup mechanism** that scales the window down to title bar height.
    * **[ConnectionStatus.svelte](../src/lib/components/ConnectionStatus.svelte)**: Top bar status orb (Searching/Connected).
    * **[DraftBoard.svelte](../src/lib/components/DraftBoard.svelte)**: Splitted draft layout containing ally and enemy columns and ban listings.
    * **[TeamColumn.svelte](../src/lib/components/TeamColumn.svelte)**: Grid showing five picks for a team.
    * **[ChampSlot.svelte](../src/lib/components/ChampSlot.svelte)**: Individual draft selection slot display. Shows champion portrait, names, and roles.
    * **[RecommendationList.svelte](../src/lib/components/RecommendationList.svelte)**: Container for pick suggestion cards.
    * **[RecommendationCard.svelte](../src/lib/components/RecommendationCard.svelte)**: Card displaying score rating, matchup reason tags, and component breakdown bars.
    * **[ScoreBar.svelte](../src/lib/components/ScoreBar.svelte)**: Mini visual score bar.
    * **[ReasonBadge.svelte](../src/lib/components/ReasonBadge.svelte)**: Visual badge tags for counter-picks or synergy indicators.
    * **[RankSelector.svelte](../src/lib/components/RankSelector.svelte)**: Header rank-tier dropdown plus live crawl progress indicator.
    * **[SettingsButton.svelte](../src/lib/components/SettingsButton.svelte)**: Header gear icon that opens the settings modal.
    * **[SettingsModal.svelte](../src/lib/components/SettingsModal.svelte)**: Appearance/Behavior/Data settings modal (Issue #15) — compact density, comp-weight slider, always-on-top toggle, manual data refresh.

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
