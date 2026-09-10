import { derived, writable } from "svelte/store";
import { draft } from "./draft";

/**
 * Champion the user clicked in the recommendations list to "preselect" for
 * the draft-board hover preview (Issue #7), before it's actually locked in.
 */
export const preselectedChampionId = writable<number | null>(null);

/**
 * The champion whose synergy/matchup data the draft board previews on
 * hover: whatever is actually locked in via the LCU always wins over a
 * stale preselection from browsing the recommendation list.
 */
export const referenceChampionId = derived(
  [draft, preselectedChampionId],
  ([$draft, $preselected]) => {
    if (!$draft || ($draft.allies.length === 0 && $draft.enemies.length === 0)) {
      return null;
    }
    return (
      $draft.local_champion_id ??
      $draft.hovered_champion_id ??
      $preselected ??
      null
    );
  },
);
