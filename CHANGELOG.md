# Changelog

All notable changes to **Rift Companion** are documented in this file.

---

## [0.3.2] - 2026-11-27

### Highlights
* **Item & Summoner Spell Game Counts + 4th/5th/6th Item Pick Rates Fixed:**
  * Updated the OP.GG build crawler to match lowercase `"games"` labels in OP.GG's updated webpage payload, restoring absolute game counts across Summoner Spells, Starter Items, Boots, Core Items, Skill Order, and 4th/5th/6th Item slots.
  * Derived pick rates for 4th, 5th, and 6th item slots from game counts when omitted by OP.GG tables, and fixed percentage normalization in the In-Game Dashboard for sub-1% pick rates.
* **Accurate Personal Ban History & Suggestions:**
  * Fixed LCU champ-select event handling so sub-endpoint events (e.g. timer or notification updates) no longer reset the session ban guard mid-draft and record duplicate bans.
  * Hardened `localPlayerCellId` / `actorCellId` parsing (defaulting missing IDs to `-1` instead of `0`) and verified team membership before recording a completed ban, preventing unrelated champions from entering ban history.
  * Scoped recorded ban history per Riot account (`puuid`) so switching accounts on the same PC keeps each account's ban suggestions cleanly isolated.
* **Full TFT Set 18 Meta Comps Restoration:**
  * Updated the TFT meta crawler for OP.GG's `v4` data schema (`source: "v4"`), restoring all 46+ meta compositions across S, A, B, C, and D tiers instead of the 10-comp MCP fallback.
  * Added live `tft://updated` backend-to-UI synchronization when server data refreshes in the background.
* **TFT Custom Wallpaper & Hover Popover Polish:**
  * Fixed the TFT view showing a solid dark background when switching directly from the Home landing page by applying the custom wallpaper background whenever TFT mode is active.
  * Portaled the TFT comp hover preview popover to `document.body` with dynamic viewport-aware positioning so it always opens cleanly without clipping under the TFT navigation bar or top title bar.
* **Reliable LCU Re-Detection After League Client Restarts:**
  * Added a 3-second process/lockfile liveness check inside the LCU WebSocket watcher alongside HTTP/WebSocket timeouts and automatic summoner profile re-confirmation, ensuring League client restarts are reliably detected while Rift Companion remains open.

---

## [0.3.1] - 2026-11-03

### Highlights
* **Automatic Game Mode & ARAM Mayhem Detection:**
  * Replaced manual mode switching in the Live Match view with seamless automatic detection for Summoner's Rift, ARAM (Queue 450), and ARAM Mayhem (Queue 2400 / KIWI / MAYHEM).
  * Direct synchronization with LCU gameflow session, live client polling, and WebSocket events.
* **ARAM Mayhem Rune Suppression:**
  * When ARAM Mayhem is detected, the Runes column in Champion Importer is completely hidden (since Mayhem replaces runes with augments).
  * Summoner Spells and Item Sets automatically stretch across the full view width with a clean `ARAM Mayhem (No Runes)` header badge.
* **Item Set Accumulation Bugfix & Automatic Replacement:**
  * Resolved an issue where every imported champion item set was permanently retained in the League client (`&& has_champ` filter bug), causing client item set spam.
  * Importing an item set (auto or manual) now automatically replaces previous Rift Companion item sets, keeping only the active champion's set while preserving all user-created custom sets.
* **Dedicated Item Sets Cleanup Tool:**
  * Added a new **"Clean Up Item Sets"** button in Settings under the **Item Sets Cleanup** section to immediately purge all accumulated Rift Companion item sets from the League client via LCU API.
* **Settings UI Redesign:**
  * Auto-Import settings now feature clean overarching tabs for *Summoner's Rift* and *ARAM*, each containing three compact, unified toggle buttons for *Runes*, *Summoners*, and *Item Sets*.
  * Removed the obsolete manual ARAM Mayhem toggle since detection is now fully automated.
* **Visual Polish & Complete English Localization:**
  * Removed tree (🌲) and snowflake (❄️) emojis across settings tabs, live match badges, and post-game screens.
  * Standardized all remaining German UI strings across settings, profile, and simulation views to clean, consistent English.

---

## [0.3.0] - 2026-10-25

### Highlights
* **Teamfight Tactics (TFT Set 18) Meta Hub & Team Builder:**
  * Dedicated TFT hub featuring real-time Set 18 tier lists, meta compositions, augments, and item pairings.
  * Interactive Team Builder with live trait breakpoint tracking and smart emblem synergy optimizer.
* **ARAM & ARAM Mayhem Live Match Mode Differentiation:**
  * Dedicated auto-import settings under Settings -> ARAM & Auto-Import for runes, spells, and items.
  * Automatic ARAM Mayhem detection with rune import suppression.
  * Tailored ARAM summoner spell recommendations: top non-Smite combo as primary and instant Flash + Mark (Snowball) as secondary.
* **Landing Page & Navigation Streamline:**
  * Cleaned up home landing page with centered official patch notes link and integrated mode navigation.

---

## [0.2.8] - 2026-10-20

### Highlights
* **Live Match Skill Order Display:**
  * Real-time skill maxing priority and level-by-level skill progression indicators in the live match screen.
* **In-Game Role Assignment Accuracy:**
  * Improved lane and role assignment accuracy based on summoner spell detection and team composition analysis.

---

## [0.2.7] - 2026-10-14

### Highlights
* **Anti-Virus Heuristic Fix & Windows Metadata:**
  * Added full Windows PE executable metadata (version, company name, product description) to avoid false-positive heuristic flags.
* **Shapeshifter Identity Stability:**
  * Robust champion ID resolution for multi-form champions (Nidalee, Elise, Jayce).
