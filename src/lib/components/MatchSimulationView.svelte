<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import type { Role, DraftState, Recommendation, SimulatedMatchAnalysis, Summoner, DetailedParticipant } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { draft as liveDraft } from "../stores/draft";
  import { scoringMode } from "../stores/scoring";
  import { profile, viewedProfile, viewedMatches, loadPlayerProfile, loadMatchDetail } from "../stores/profile";
  import { squareIconUrl, roleIconUrl, summonersRiftMapUrl } from "../utils/ddragon";
  import { simulateDraft, simulateMatchAnalysis, getPairwiseStat, getChampionsByRole } from "../ipc/tauri";
  import ChampionOverview from "./ChampionOverview.svelte";

  const ROLE_DEFS: { role: Role; label: string; order: number }[] = [
    { role: "top", label: "Top", order: 0 },
    { role: "jungle", label: "Jungle", order: 1 },
    { role: "mid", label: "Mid", order: 2 },
    { role: "adc", label: "ADC", order: 3 },
    { role: "support", label: "Support", order: 4 },
  ];



  interface MapSlotDef {
    role: Role;
    team: "ally" | "enemy";
    label: string;
    x: number; // percentage left
    y: number; // percentage top
  }

  // Exact positions on Summoner's Rift tactical layout
  const MAP_SLOTS: MapSlotDef[] = [
    // Blue Team (Allies)
    { role: "top", team: "ally", label: "Top", x: 9, y: 24 },
    { role: "jungle", team: "ally", label: "Jungle", x: 23, y: 49 },
    { role: "mid", team: "ally", label: "Mid", x: 44, y: 56 },
    { role: "adc", team: "ally", label: "ADC", x: 63, y: 94 },
    { role: "support", team: "ally", label: "Support", x: 76, y: 94 },

    // Red Team (Enemies)
    { role: "top", team: "enemy", label: "Top", x: 24, y: 7 },
    { role: "jungle", team: "enemy", label: "Jungle", x: 78.5, y: 51 },
    { role: "mid", team: "enemy", label: "Mid", x: 56, y: 44 },
    { role: "adc", team: "enemy", label: "ADC", x: 90.5, y: 63 },
    { role: "support", team: "enemy", label: "Support", x: 90.5, y: 76 },
  ];

  // Role champions cache for accurate position filtering in picker
  let roleChampionsMap: Partial<Record<Role, Set<number>>> = {};
  async function ensureRoleCache(role: Role) {
    if (roleChampionsMap[role]) return;
    try {
      const list = await getChampionsByRole(role);
      roleChampionsMap[role] = new Set(list.map((c) => c.champion_id));
      roleChampionsMap = { ...roleChampionsMap };
    } catch {}
  }

  // Simulation State
  let userRole: Role = "mid";
  let allies: Record<Role, number | null> = {
    top: null,
    jungle: null,
    mid: null,
    adc: null,
    support: null,
  };
  let enemies: Record<Role, number | null> = {
    top: null,
    jungle: null,
    mid: null,
    adc: null,
    support: null,
  };
  let bans: number[] = [];

  // Active sub-panel mode: "recommendations" or "match_analysis"
  let activeRightTab: "recommendations" | "match_analysis" = "recommendations";
  let overviewChampionId: number | null = null;
  let overviewRole: Role = "mid";

  // Search & Filtering in Recommendations List
  let recSearchQuery = "";
  let recommendations: Recommendation[] = [];
  let isRecsLoading = false;
  let matchAnalysis: SimulatedMatchAnalysis | null = null;
  let isAnalysisLoading = false;

  // Champion Picker Modal State
  let pickerOpen = false;
  let pickerTarget: { type: "ally" | "enemy"; role: Role } | { type: "ban"; index: number } | null = null;
  let pickerSearch = "";
  let pickerRoleFilter: Role | null = null;
  let pickerSearchInput: HTMLInputElement | null = null;

  // Hover Pairwise Tooltip State
  let hoveredSlot: { isAlly: boolean; champId: number; role: Role } | null = null;
  let hoveredPairwise: { winrate: number; games: number; delta: number } | null = null;

  // Build the DraftState representation for engine computation
  $: currentDraftState = {
    local_role: userRole,
    local_champion_id: allies[userRole],
    hovered_champion_id: null,
    is_locked: allies[userRole] !== null,
    bans: [...bans],
    allies: ROLE_DEFS.filter((d) => allies[d.role] !== null).map((d) => ({
      champion_id: allies[d.role]!,
      role: d.role,
      is_local: d.role === userRole,
    })),
    enemies: ROLE_DEFS.filter((d) => enemies[d.role] !== null).map((d) => ({
      champion_id: enemies[d.role]!,
      role: d.role,
      is_local: false,
    })),
  } satisfies DraftState;

  // Counts of selected champions
  $: allyCount = Object.values(allies).filter((id) => id !== null).length;
  $: enemyCount = Object.values(enemies).filter((id) => id !== null).length;
  $: userHasPicked = allies[userRole] !== null;
  $: userChampionName = allies[userRole] ? $championCatalog.get(allies[userRole]!)?.name : null;

  // Compute recommendations and analysis on state changes
  let draftUpdateDebounce: ReturnType<typeof setTimeout> | null = null;
  function triggerEngineRecompute() {
    if (draftUpdateDebounce) clearTimeout(draftUpdateDebounce);
    draftUpdateDebounce = setTimeout(async () => {
      isRecsLoading = true;
      isAnalysisLoading = true;
      try {
        const [recs, analysis] = await Promise.all([
          simulateDraft(currentDraftState),
          simulateMatchAnalysis(currentDraftState),
        ]);
        recommendations = recs;
        matchAnalysis = analysis;
      } catch (err) {
        console.error("Simulation recompute error", err);
      } finally {
        isRecsLoading = false;
        isAnalysisLoading = false;
      }
    }, 50);
  }

  $: if (currentDraftState) {
    triggerEngineRecompute();
  }

  // Filtered recommendations list
  $: filteredRecommendations = recommendations.filter((r) => {
    if (!recSearchQuery.trim()) return true;
    return r.name.toLowerCase().includes(recSearchQuery.trim().toLowerCase());
  });

  // Set of all currently selected or banned champion IDs
  $: selectedChampionIds = new Set<number>([
    ...Object.values(allies).filter((id): id is number => id !== null),
    ...Object.values(enemies).filter((id): id is number => id !== null),
    ...bans,
  ]);

  // Open Champion Picker
  async function openPicker(target: { type: "ally" | "enemy"; role: Role } | { type: "ban"; index: number }) {
    pickerTarget = target;
    pickerSearch = "";
    pickerRoleFilter = target.type === "ban" ? null : target.role;
    if (pickerRoleFilter) {
      void ensureRoleCache(pickerRoleFilter);
    }
    pickerOpen = true;
    await tick();
    pickerSearchInput?.focus();
  }

  function setPickerRoleFilter(role: Role | null) {
    pickerRoleFilter = role;
    if (role) {
      void ensureRoleCache(role);
    }
  }

  function closePicker() {
    pickerOpen = false;
    pickerTarget = null;
    pickerSearch = "";
  }

  function selectChampionForPicker(champId: number) {
    if (!pickerTarget) return;

    if (pickerTarget.type === "ally") {
      allies[pickerTarget.role] = champId;
      allies = { ...allies };
    } else if (pickerTarget.type === "enemy") {
      enemies[pickerTarget.role] = champId;
      enemies = { ...enemies };
    } else if (pickerTarget.type === "ban") {
      if (bans.length > pickerTarget.index) {
        bans[pickerTarget.index] = champId;
      } else {
        bans.push(champId);
      }
      bans = [...bans];
    }

    closePicker();
  }

  function clearSlot(type: "ally" | "enemy", role: Role) {
    if (type === "ally") {
      allies[role] = null;
      allies = { ...allies };
    } else {
      enemies[role] = null;
      enemies = { ...enemies };
    }
  }

  function removeBan(index: number) {
    bans.splice(index, 1);
    bans = [...bans];
  }

  function selectUserRole(role: Role) {
    userRole = role;
  }

  function lockInRecommendation(rec: Recommendation) {
    allies[userRole] = rec.champion_id;
    allies = { ...allies };
    activeRightTab = "match_analysis";
  }

  function unlockUserChampion() {
    allies[userRole] = null;
    allies = { ...allies };
    activeRightTab = "recommendations";
  }

  function openChampionBuild(champId: number, role: Role) {
    overviewChampionId = champId;
    overviewRole = role;
  }

  // Assign 5 participants of a team to standard roles
  function assignTeamRoles(
    participants: DetailedParticipant[],
    roleCache: Partial<Record<Role, Set<number>>>
  ): Record<Role, number | null> {
    const result: Record<Role, number | null> = {
      top: null,
      jungle: null,
      mid: null,
      adc: null,
      support: null,
    };

    const unassigned = [...participants];
    const assignedRoles = new Set<Role>();

    function normalizePosString(pos?: string): Role | null {
      if (!pos) return null;
      const p = pos.toLowerCase().trim();
      if (p.includes("top")) return "top";
      if (p.includes("jungle") || p === "jug") return "jungle";
      if (p.includes("mid") || p.includes("middle")) return "mid";
      if (p.includes("adc") || p === "bottom" || p === "bot" || p.includes("carry")) return "adc";
      if (p.includes("support") || p.includes("utility") || p === "supp" || p === "sup") return "support";
      return null;
    }

    // 1. Pass: participants with an explicit position if distinct
    for (let i = unassigned.length - 1; i >= 0; i--) {
      const p = unassigned[i];
      let pos = normalizePosString(p.position);

      // Disambiguate bot lane if lane was reported as bottom
      if (pos === "adc") {
        const hasSmite = p.spells?.includes(11);
        const hasSuppItem = p.items?.some((it) => [3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877].includes(it));
        if (hasSmite) {
          pos = "jungle";
        } else if (hasSuppItem) {
          pos = "support";
        }
      }

      if (pos && !assignedRoles.has(pos)) {
        result[pos] = p.champion_id;
        assignedRoles.add(pos);
        unassigned.splice(i, 1);
      }
    }

    // 2. Pass: identify Jungler by Smite (spell ID 11) if jungle unassigned
    if (!assignedRoles.has("jungle")) {
      const smiteIdx = unassigned.findIndex((p) => p.spells?.includes(11));
      if (smiteIdx !== -1) {
        result.jungle = unassigned[smiteIdx].champion_id;
        assignedRoles.add("jungle");
        unassigned.splice(smiteIdx, 1);
      }
    }

    // 3. Pass: identify Support by Support Quest item if support unassigned
    if (!assignedRoles.has("support")) {
      const suppItemIdx = unassigned.findIndex((p) =>
        p.items?.some((it) => [3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877].includes(it))
      );
      if (suppItemIdx !== -1) {
        result.support = unassigned[suppItemIdx].champion_id;
        assignedRoles.add("support");
        unassigned.splice(suppItemIdx, 1);
      }
    }

    // 4. Pass: match remaining participants against roleCache
    const remainingRoles: Role[] = (["top", "jungle", "mid", "adc", "support"] as Role[]).filter(
      (r) => !assignedRoles.has(r)
    );

    for (const r of remainingRoles) {
      const champSet = roleCache[r];
      if (champSet) {
        const matchIdx = unassigned.findIndex((p) => champSet.has(p.champion_id));
        if (matchIdx !== -1) {
          result[r] = unassigned[matchIdx].champion_id;
          assignedRoles.add(r);
          unassigned.splice(matchIdx, 1);
        }
      }
    }

    // 5. Pass: fill remaining empty slots in order
    const finalEmpty: Role[] = (["top", "jungle", "mid", "adc", "support"] as Role[]).filter(
      (r) => !assignedRoles.has(r)
    );
    for (let i = 0; i < finalEmpty.length && i < unassigned.length; i++) {
      result[finalEmpty[i]] = unassigned[i].champion_id;
      assignedRoles.add(finalEmpty[i]);
    }

    return result;
  }

  // Quick Action: Import Last Match (with background profile refresh)
  let isImportingLastMatch = false;
  let importFeedback: { type: "success" | "error"; text: string } | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function showImportFeedback(type: "success" | "error", text: string) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    importFeedback = { type, text };
    feedbackTimer = setTimeout(() => {
      importFeedback = null;
    }, 4500);
  }

  async function importLastMatch() {
    if (isImportingLastMatch) return;
    isImportingLastMatch = true;
    importFeedback = null;

    try {
      // 1. Identify active profile / connected summoner
      let localSummoner = get(profile);
      if (!localSummoner) {
        try {
          const fetched = await invoke<Summoner | null>("get_profile");
          if (fetched) {
            profile.set(fetched);
            localSummoner = fetched;
          }
        } catch {}
      }

      const viewed = get(viewedProfile);
      const activeSummoner = localSummoner || viewed;

      if (!activeSummoner) {
        showImportFeedback("error", "Kein Spielerprofil oder verbundener League-Client gefunden.");
        return;
      }

      const gn = activeSummoner.game_name || activeSummoner.display_name?.split("#")[0];
      const tl = activeSummoner.tag_line || activeSummoner.display_name?.split("#")[1];
      const region = viewed?.region || "EUW";

      // 2. Perform background profile refresh (forceRefresh = true)
      await loadPlayerProfile(gn, tl, region, true);

      // 3. Retrieve latest match
      const matches = get(viewedMatches);
      if (!matches || matches.length === 0) {
        showImportFeedback("error", "Kein Match im Verlauf gefunden.");
        return;
      }

      const lastMatch = matches[0];

      // 4. Ensure full 10-player participants are loaded
      let participants = lastMatch.participants;
      if (!participants || participants.length < 10) {
        const loaded = await loadMatchDetail(
          lastMatch.id,
          region,
          lastMatch.raw_created_at || lastMatch.game_creation,
          gn ? `${gn}#${tl || region}` : undefined
        );
        if (loaded && loaded.length > 0) {
          participants = loaded;
        }
      }

      if (!participants || participants.length === 0) {
        showImportFeedback("error", "Teilnehmer des letzten Matches konnten nicht geladen werden.");
        return;
      }

      // 5. Ensure all role caches are ready
      await Promise.all(ROLE_DEFS.map((r) => ensureRoleCache(r.role)));

      // 6. Find user participant
      const targetIdent = (gn || "").toLowerCase();
      const localPart =
        participants.find((p) => p.is_local) ||
        participants.find(
          (p) =>
            p.champion_id === lastMatch.champion_id ||
            p.game_name?.toLowerCase() === targetIdent ||
            p.summoner_name?.toLowerCase() === targetIdent
        ) ||
        participants[0];

      const userTeamId = localPart.team_id;
      const allyParts = participants.filter((p) => p.team_id === userTeamId);
      const enemyParts = participants.filter((p) => p.team_id !== userTeamId);

      // 7. Assign roles
      const assignedAllies = assignTeamRoles(allyParts, roleChampionsMap);
      const assignedEnemies = assignTeamRoles(enemyParts, roleChampionsMap);

      // 8. Find user's detected role
      let detectedUserRole: Role | null = null;
      for (const [r, champId] of Object.entries(assignedAllies) as [Role, number | null][]) {
        if (champId === localPart.champion_id) {
          detectedUserRole = r;
          break;
        }
      }

      if (detectedUserRole) {
        userRole = detectedUserRole;
      }

      allies = assignedAllies;
      enemies = assignedEnemies;

      // 9. Bans
      const matchBans = lastMatch.bans || [];
      bans = [...matchBans.slice(0, 10)];

      // Recompute simulation and switch to analysis tab
      activeRightTab = "match_analysis";
      triggerEngineRecompute();

      const userChamp = $championCatalog.get(localPart.champion_id)?.name || "Champion";
      showImportFeedback("success", `Letztes Match importiert (${userChamp} - ${userRole.toUpperCase()})`);
    } catch (err: any) {
      console.error("Failed to import last match:", err);
      showImportFeedback("error", err?.message || "Fehler beim Importieren des letzten Matches.");
    } finally {
      isImportingLastMatch = false;
    }
  }

  // Quick Action: Import from Live Draft
  function importFromLiveDraft() {
    if (!$liveDraft) return;

    const newAllies: Record<Role, number | null> = { top: null, jungle: null, mid: null, adc: null, support: null };
    const newEnemies: Record<Role, number | null> = { top: null, jungle: null, mid: null, adc: null, support: null };

    if ($liveDraft.local_role) {
      userRole = $liveDraft.local_role;
    }

    for (const p of $liveDraft.allies) {
      if (p.role) newAllies[p.role] = p.champion_id;
    }
    for (const p of $liveDraft.enemies) {
      if (p.role) newEnemies[p.role] = p.champion_id;
    }

    allies = newAllies;
    enemies = newEnemies;
    bans = [...($liveDraft.bans || [])];
  }

  // Quick Action: Clear Board
  function clearAll() {
    allies = { top: null, jungle: null, mid: null, adc: null, support: null };
    enemies = { top: null, jungle: null, mid: null, adc: null, support: null };
    bans = [];
    recSearchQuery = "";
  }

  // Quick Action: Fill Random Champions (except user's slot)
  async function fillRandomChampions() {
    await Promise.all(ROLE_DEFS.map((r) => ensureRoleCache(r.role)));

    const allChamps = Array.from($championCatalog.values());
    if (allChamps.length === 0) return;

    const usedIds = new Set<number>();
    // Preserve user pick if already chosen
    if (allies[userRole] !== null) {
      usedIds.add(allies[userRole]!);
    }
    // Preserve existing bans
    for (const b of bans) usedIds.add(b);

    const newAllies: Record<Role, number | null> = { ...allies };
    const newEnemies: Record<Role, number | null> = { ...enemies };

    function pickRandomForRole(role: Role): number | null {
      const roleSet = roleChampionsMap[role];
      let candidates = roleSet
        ? Array.from(roleSet).filter((id) => !usedIds.has(id))
        : [];
      if (candidates.length === 0) {
        candidates = allChamps
          .filter((c) => !usedIds.has(c.id))
          .map((c) => c.id);
      }
      if (candidates.length === 0) return null;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      usedIds.add(chosen);
      return chosen;
    }

    // Fill allies except user's role slot
    for (const def of ROLE_DEFS) {
      if (def.role !== userRole) {
        newAllies[def.role] = pickRandomForRole(def.role);
      }
    }

    // Fill all enemy slots
    for (const def of ROLE_DEFS) {
      newEnemies[def.role] = pickRandomForRole(def.role);
    }

    allies = newAllies;
    enemies = newEnemies;
  }

  // Hover pairwise stats against user's pick
  async function handleSlotHover(champId: number | null, role: Role, isAlly: boolean) {
    if (!champId || !allies[userRole] || allies[userRole] === champId) {
      hoveredSlot = null;
      hoveredPairwise = null;
      return;
    }
    hoveredSlot = { isAlly, champId, role };
    try {
      const res = await getPairwiseStat(allies[userRole]!, userRole, champId, isAlly);
      if (hoveredSlot?.champId === champId) {
        hoveredPairwise = res;
      }
    } catch {
      hoveredPairwise = null;
    }
  }

  function handleSlotLeave() {
    hoveredSlot = null;
    hoveredPairwise = null;
  }

  onMount(() => {
    triggerEngineRecompute();
    for (const def of ROLE_DEFS) {
      void ensureRoleCache(def.role);
    }
  });
</script>

{#if overviewChampionId}
  <!-- Champion Build / In-Game Overview Subview -->
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <ChampionOverview
      championId={overviewChampionId}
      initialRole={overviewRole}
      onBack={() => { overviewChampionId = null; }}
    />
  </div>
{:else}
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden text-slate-100 select-none">
    <!-- Top Action Bar -->
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/15 bg-void-950/60 px-6 py-2.5 backdrop-blur-md">
      <!-- Left: Title, Role Selector & Action Controls -->
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300">
            <span class="text-sm">⚔️</span>
          </div>
          <div>
            <h1 class="text-sm font-black tracking-wide text-white">
              MATCH SIMULATION
            </h1>
            <p class="text-[10px] text-purple-300/70">
              Mock Champion Select &amp; calculate win rates, lane matchups &amp; synergies
            </p>
          </div>
        </div>

        <!-- Divider -->
        <div class="h-6 w-[1px] bg-purple-500/20"></div>

        <!-- Role Selector Toggle -->
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300/80 mr-1">My Role:</span>
          <div class="flex items-center rounded-xl border border-purple-500/25 bg-void-950/50 p-0.5">
            {#each ROLE_DEFS as r (r.role)}
              {@const isSelected = userRole === r.role}
              <button
                type="button"
                on:click={() => selectUserRole(r.role)}
                class="flex h-7 w-7 items-center justify-center rounded-lg transition {isSelected
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}"
                title="Simulate as {r.label}"
              >
                <img
                  src={roleIconUrl(r.role)}
                  alt={r.label}
                  class="h-4 w-4 object-contain brightness-125"
                  on:error={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
              </button>
            {/each}
          </div>
        </div>

        <!-- Divider -->
        <div class="h-6 w-[1px] bg-purple-500/20"></div>

        <!-- Action Buttons directly next to My Role -->
        <div class="flex items-center gap-2">
          <!-- Import Last Match -->
          <button
            type="button"
            on:click={importLastMatch}
            disabled={isImportingLastMatch}
            class="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-900/50 hover:border-purple-400/40 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title="Refresh profile &amp; import champions from your last played match"
          >
            {#if isImportingLastMatch}
              <div class="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-transparent"></div>
              <span>Importing…</span>
            {:else}
              <span class="text-xs">📜</span>
              <span>Import Last Match</span>
            {/if}
          </button>

          {#if $liveDraft}
            <button
              type="button"
              on:click={importFromLiveDraft}
              class="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/50 transition shadow-sm"
              title="Import current champion select from League client"
            >
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Import Live Draft</span>
            </button>
          {/if}

          <button
            type="button"
            on:click={fillRandomChampions}
            class="flex items-center gap-1.5 rounded-xl border border-purple-500/25 bg-purple-950/30 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-900/50 hover:border-purple-400/40 transition"
            title="Fill all slots with random champions (except your slot)"
          >
            <span>🎲 Random Fill</span>
          </button>

          <button
            type="button"
            on:click={clearAll}
            class="flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-950/20 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/40 transition"
            title="Reset all picks and bans"
          >
            <span>✕ Reset</span>
          </button>
        </div>
      </div>

      <!-- Right: Status / Feedback message -->
      {#if importFeedback}
        <div class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur transition animate-fade-in {importFeedback.type === 'error' ? 'bg-rose-950/60 border border-rose-500/30 text-rose-300' : 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300'}">
          <span>{importFeedback.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{importFeedback.text}</span>
        </div>
      {/if}
    </header>

    <!-- Main Simulator Workspace -->
    <main class="grid min-h-0 flex-1 grid-cols-[540px_1fr] gap-5 p-5 overflow-hidden">
      <!-- Left Column: 5v5 Simulation Board (Map or Classic) -->
      <section class="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <!-- Board Top Bar: Team Counts -->
        <div class="flex items-center justify-between rounded-xl border border-purple-500/20 bg-void-950/20 px-3.5 py-2 backdrop-blur-sm shadow-sm">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-cyan-400 ring-2 ring-cyan-400/30"></span>
              <span class="text-xs font-bold text-cyan-300 uppercase">Blue ({allyCount}/5)</span>
            </div>
            <span class="text-xs font-bold text-slate-600">vs</span>
            <div class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-rose-400 ring-2 ring-rose-400/30"></span>
              <span class="text-xs font-bold text-rose-300 uppercase">Red ({enemyCount}/5)</span>
            </div>
          </div>

          <span class="text-[10px] font-semibold text-purple-300/60 uppercase tracking-wider">
            Summoner's Rift Map
          </span>
        </div>

        <!-- Tactical Summoner's Rift Map Board -->
        <div class="glass relative w-full aspect-square max-h-[500px] rounded-2xl overflow-hidden border border-purple-500/25 shadow-xl mx-auto select-none group/map">
          <!-- Summoner's Rift Satellite Map Background -->
          <img
            src={summonersRiftMapUrl($ddragonVersion)}
            alt="Summoner's Rift Tactical Map"
            class="absolute inset-0 h-full w-full object-cover opacity-70 contrast-[1.12] brightness-95"
          />

          <!-- Ambient Lighting & Dark Edge Vignette -->
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-void-950/50 via-transparent to-void-950/25"></div>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-void-950/25 via-transparent to-void-950/25"></div>

          <!-- Base Landmarks -->
          <div class="pointer-events-none absolute left-2.5 bottom-2.5 flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-black/60 px-2 py-0.5 backdrop-blur-md">
            <span class="h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
            <span class="text-[8px] font-black uppercase tracking-wider text-cyan-300">Blue Base</span>
          </div>

          <div class="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-black/60 px-2 py-0.5 backdrop-blur-md">
            <span class="h-2 w-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400"></span>
            <span class="text-[8px] font-black uppercase tracking-wider text-rose-300">Red Base</span>
          </div>

            <!-- 10 Interactive Map Slots -->
            {#each MAP_SLOTS as slot (slot.team + slot.role)}
              {@const isAlly = slot.team === 'ally'}
              {@const champId = isAlly ? allies[slot.role] : enemies[slot.role]}
              {@const isUserSlot = isAlly && slot.role === userRole}
              {@const champInfo = champId ? $championCatalog.get(champId) : null}

              <div
                class="absolute z-10 flex flex-col items-center group/node"
                style="left: {slot.x}%; top: {slot.y}%; transform: translate(-50%, -50%);"
                role="group"
                on:mouseenter={() => handleSlotHover(champId, slot.role, isAlly)}
                on:mouseleave={handleSlotLeave}
              >
                <!-- Slot Circle & Clear Wrapper -->
                <div class="relative">
                  <button
                    type="button"
                    on:click={() => openPicker({ type: slot.team, role: slot.role })}
                    class="relative flex h-11 w-11 items-center justify-center rounded-full overflow-hidden transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none {isUserSlot
                      ? 'ring-2 ring-purple-400 bg-purple-950/90 shadow-md'
                      : isAlly
                      ? 'ring-2 ring-cyan-400/80 bg-[#0c1326]/90 shadow-md hover:ring-cyan-300'
                      : 'ring-2 ring-rose-500/80 bg-[#260c14]/90 shadow-md hover:ring-rose-400'}"
                    title="{slot.label}: {champInfo ? champInfo.name : 'Click to pick champion'}"
                  >
                    {#if champId && champInfo}
                      <!-- Picked Champion Portrait -->
                      <img
                        src={squareIconUrl(champInfo.key, $ddragonVersion)}
                        alt={champInfo.name}
                        class="h-full w-full object-cover scale-[1.18]"
                      />
                    {:else}
                      <!-- Empty Slot: Role Icon & Plus -->
                      <div class="flex flex-col items-center justify-center">
                        <img
                          src={roleIconUrl(slot.role)}
                          alt={slot.label}
                          class="h-4 w-4 object-contain opacity-85 group-hover/node:opacity-100 brightness-125"
                        />
                        <span class="text-[8px] font-black text-white/80 leading-none mt-0.5">+</span>
                      </div>
                    {/if}
                  </button>

                  <!-- YOU Badge for Player Role -->
                  {#if isUserSlot}
                    <span class="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-purple-600 border border-purple-300 px-1.5 py-0.2 text-[8px] font-black uppercase text-white shadow-sm ring-1 ring-black/40 z-20">
                      YOU
                    </span>
                  {/if}

                  <!-- Clear button on hover when picked -->
                  {#if champId}
                    <button
                      type="button"
                      on:click|stopPropagation={() => clearSlot(slot.team, slot.role)}
                      class="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[8px] font-bold text-white shadow-md hover:bg-rose-500 group-hover/node:flex transition z-20"
                      title="Remove {champInfo?.name}"
                    >
                      ✕
                    </button>
                  {/if}
                </div>

                <!-- Label below slot -->
                <div class="mt-0.5 flex items-center justify-center">
                  {#if champId && champInfo}
                    <span class="max-w-[70px] truncate rounded bg-black/80 px-1.5 py-0.2 text-[8px] font-bold text-slate-100 shadow border {isUserSlot
                      ? 'border-purple-400/50 text-purple-200'
                      : isAlly
                      ? 'border-cyan-500/30'
                      : 'border-rose-500/30'}">
                      {champInfo.name}
                    </span>
                  {:else}
                    <span class="rounded bg-black/60 px-1 py-0.2 text-[7px] font-semibold text-slate-300/90">
                      {slot.label}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}

            <!-- Pairwise Hover Tooltip inside map -->
            {#if hoveredSlot && hoveredPairwise && allies[userRole]}
              {@const targetChamp = $championCatalog.get(hoveredSlot.champId)}
              <div class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-xl border border-purple-500/30 bg-[#0d061c]/95 px-3 py-1.5 shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
                <span class="text-xs text-purple-300 font-bold">
                  {userChampionName} {hoveredSlot.isAlly ? "with" : "vs"} {targetChamp?.name}:
                </span>
                <span class="text-xs font-black {hoveredPairwise.delta > 0.005 ? 'text-emerald-400' : hoveredPairwise.delta < -0.005 ? 'text-rose-400' : 'text-slate-200'}">
                  {(hoveredPairwise.winrate * 100).toFixed(1)}% WR
                </span>
                <span class="text-[9px] text-slate-400">({hoveredPairwise.games} games)</span>
              </div>
            {/if}
          </div>


        <!-- Bans Section -->
        <div class="rounded-xl border border-purple-500/15 bg-void-950/20 p-2.5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Banned Champions ({bans.length}/10)
            </span>
            {#if bans.length > 0}
              <button
                type="button"
                on:click={() => { bans = []; }}
                class="text-[9px] text-rose-400 hover:underline"
              >
                Clear Bans
              </button>
            {/if}
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            {#each bans as banId, idx (banId)}
              {@const bInfo = $championCatalog.get(banId)}
              <div class="group relative flex items-center gap-1 rounded-lg border border-purple-500/20 bg-purple-950/30 px-1.5 py-0.5 text-[10px]">
                {#if bInfo}
                  <div class="relative h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-purple-400/30">
                    <img
                      src={squareIconUrl(bInfo.key, $ddragonVersion)}
                      alt={bInfo.name}
                      class="h-full w-full object-cover scale-[1.18] grayscale opacity-75"
                    />
                  </div>
                  <span class="text-slate-300">{bInfo.name}</span>
                {:else}
                  <span class="text-slate-400">ID {banId}</span>
                {/if}
                <button
                  type="button"
                  on:click={() => removeBan(idx)}
                  class="ml-0.5 text-slate-500 hover:text-rose-400"
                  title="Remove ban"
                >
                  ✕
                </button>
              </div>
            {/each}

            {#if bans.length < 10}
              <button
                type="button"
                on:click={() => openPicker({ type: "ban", index: bans.length })}
                class="flex items-center gap-1 rounded-lg border border-dashed border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-300 hover:border-purple-400 hover:bg-purple-950/30 transition"
              >
                <span>+ Ban</span>
              </button>
            {/if}
          </div>
        </div>
      </section>

      <!-- Right Column: Dual Mode Intelligence Panel -->
      <section class="glass flex min-h-0 flex-1 flex-col rounded-2xl overflow-hidden">
        <!-- Tab Bar: Recommendations vs Match Analysis -->
        <div class="flex items-center justify-between border-b border-purple-500/15 bg-purple-950/20 backdrop-blur-sm px-4 py-2">
          <div class="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-purple-950/30 p-1">
            <button
              type="button"
              on:click={() => (activeRightTab = "recommendations")}
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition {activeRightTab === 'recommendations'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'}"
            >
              <span>⭐ Pick Recommendations</span>
              <span class="rounded bg-black/30 px-1 text-[9px] font-mono">{filteredRecommendations.length}</span>
            </button>
            <button
              type="button"
              on:click={() => (activeRightTab = "match_analysis")}
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition {activeRightTab === 'match_analysis'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'}"
            >
              <span>📊 5v5 Match Analysis</span>
              {#if matchAnalysis}
                <span class="rounded bg-black/30 px-1 text-[9px] font-mono font-bold {matchAnalysis.blue_win_chance >= 50 ? 'text-emerald-400' : 'text-rose-400'}">
                  {matchAnalysis.blue_win_chance.toFixed(1)}%
                </span>
              {/if}
            </button>
          </div>

          <!-- Scoring Mode Selector when in Recommendations tab -->
          {#if activeRightTab === "recommendations"}
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode:</span>
              <select
                bind:value={$scoringMode}
                class="rounded-lg border border-purple-500/20 bg-void-950/90 px-2 py-1 text-[11px] font-semibold text-purple-200 focus:outline-none focus:border-purple-400"
              >
                <option value="default">Balanced</option>
                <option value="counterpick">Counterpick</option>
                <option value="teamplayer">Team Player</option>
              </select>
            </div>
          {/if}
        </div>

        <!-- TAB CONTENT 1: Champion Recommendations -->
        {#if activeRightTab === "recommendations"}
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <!-- Search Filter Bar -->
            <div class="mb-3 flex items-center gap-3">
              <div class="relative flex-1">
                <input
                  type="text"
                  bind:value={recSearchQuery}
                  placeholder="Search champion (e.g. Ahri, Sylas, Jinx)..."
                  class="w-full rounded-xl border border-purple-500/20 bg-void-950/40 backdrop-blur-md px-3.5 py-2 pl-9 text-xs text-slate-100 placeholder-purple-300/40 focus:border-purple-400 focus:outline-none"
                />
                <svg class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-purple-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>

              {#if userHasPicked}
                <div class="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-1.5 text-xs">
                  <span class="text-[11px] text-slate-400">Locked:</span>
                  <strong class="text-purple-200 font-bold">{userChampionName}</strong>
                  <button
                    type="button"
                    on:click={unlockUserChampion}
                    class="ml-1 text-purple-400 hover:text-white font-bold"
                    title="Unlock to explore alternatives"
                  >
                    ✕
                  </button>
                </div>
              {/if}
            </div>

            <!-- List of Scored Champion Cards -->
            <div class="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
              {#if isRecsLoading}
                <div class="flex h-40 items-center justify-center gap-2 text-xs text-purple-300">
                  <span class="animate-spin text-sm">✦</span>
                  <span>Calculating matrix win rates &amp; synergies...</span>
                </div>
              {:else if filteredRecommendations.length === 0}
                <div class="flex h-40 flex-col items-center justify-center text-center p-4">
                  <p class="text-xs font-semibold text-slate-400">No champions found for "{recSearchQuery}"</p>
                  <p class="mt-1 text-[10px] text-purple-300/60">Try searching for another champion or clear the filter.</p>
                </div>
              {:else}
                {#each filteredRecommendations as rec, idx (rec.champion_id)}
                  {@const isCurrentlyLocked = allies[userRole] === rec.champion_id}
                  {@const champCat = $championCatalog.get(rec.champion_id)}

                  <div
                    class="group relative flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all duration-150 {isCurrentlyLocked
                      ? 'border-purple-400 bg-purple-950/40 shadow-sm'
                      : 'border-purple-500/15 bg-void-950/15 hover:border-purple-400/40 hover:bg-purple-900/20'}"
                  >
                    <!-- Left: Rank + Avatar + Name & Roles (Fixed width ensures straight vertical alignment across all rows) -->
                    <div class="flex items-center gap-2.5 w-48 shrink-0 overflow-hidden">
                      <span class="w-5 text-center text-xs font-black text-slate-400 shrink-0">#{idx + 1}</span>

                      <div class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-purple-400/40 group-hover:ring-purple-300 transition">
                        <img
                          src={squareIconUrl(rec.image, $ddragonVersion)}
                          alt={rec.name}
                          class="h-full w-full object-cover scale-[1.18]"
                        />
                      </div>

                      <div class="min-w-0 flex-1 flex flex-col justify-center overflow-hidden">
                        <div class="flex items-center gap-1.5 overflow-hidden">
                          <h4 class="truncate text-xs font-bold text-white group-hover:text-purple-200 transition" title={rec.name}>
                            {rec.name}
                          </h4>
                          {#if isCurrentlyLocked}
                            <span class="rounded bg-purple-600 px-1 py-0.2 text-[7px] font-black text-white uppercase tracking-wider shrink-0">
                              My Pick
                            </span>
                          {/if}
                        </div>
                        <span class="truncate text-[10px] text-purple-300/70 font-medium" title={champCat?.tags?.join(" • ") || "Flex"}>
                          {champCat?.tags?.join(" • ") || "Flex"}
                        </span>
                      </div>
                    </div>

                    <!-- Score Column: Fixed width and border-l ensures perfect vertical alignment down the entire list -->
                    <div class="flex flex-col items-center justify-center shrink-0 w-16 text-center border-l border-purple-500/15 pl-2">
                      <span class="text-sm font-black tracking-tight {rec.score >= 53 ? 'text-emerald-400' : rec.score >= 50 ? 'text-purple-300' : 'text-amber-400'}">
                        {rec.score.toFixed(1)}%
                      </span>
                      <span class="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Score</span>
                    </div>

                    <!-- Center / Right of Score: Badges list (Strong Lane, High Synergy, etc.) -->
                    <div class="flex flex-1 items-center gap-1.5 min-w-0 px-1 overflow-hidden">
                      <div class="flex flex-wrap items-center gap-1.5 min-w-0 overflow-hidden">
                        {#each rec.badges as badge}
                          <span class="rounded-md px-2 py-0.5 text-[9px] font-bold shrink-0 {badge.kind === 'positive'
                            ? 'border border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                            : badge.kind === 'negative'
                            ? 'border border-rose-500/30 bg-rose-950/40 text-rose-300'
                            : badge.kind === 'comp'
                            ? 'border border-purple-500/30 bg-purple-950/40 text-purple-300'
                            : 'border border-slate-700 bg-slate-900/60 text-slate-400'}">
                            {badge.text}
                          </span>
                        {/each}
                      </div>
                    </div>

                    <!-- Right: Action Buttons -->
                    <div class="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        on:click={() => openChampionBuild(rec.champion_id, userRole)}
                        class="rounded-lg border border-purple-500/20 bg-purple-950/30 px-2.5 py-1 text-[11px] font-bold text-purple-300 hover:bg-purple-900/50 hover:border-purple-400 transition"
                        title="View runes, items &amp; skill build"
                      >
                        Build
                      </button>

                      {#if isCurrentlyLocked}
                        <button
                          type="button"
                          on:click={unlockUserChampion}
                          class="rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-900/50 transition"
                        >
                          Unlock
                        </button>
                      {:else}
                        <button
                          type="button"
                          on:click={() => lockInRecommendation(rec)}
                          class="rounded-lg bg-purple-600 px-3 py-1 text-[11px] font-black text-white hover:bg-purple-500 shadow-sm transition"
                        >
                          Select Pick
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

        <!-- TAB CONTENT 2: 5v5 Match Analysis -->
        {:else if activeRightTab === "match_analysis"}
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 space-y-4">
            {#if isAnalysisLoading}
              <div class="flex h-40 items-center justify-center gap-2 text-xs text-purple-300">
                <span class="animate-spin text-sm">✦</span>
                <span>Simulating 5v5 team matchups &amp; synergies...</span>
              </div>
            {:else if matchAnalysis}
              <!-- Card 1: Match Win Probability Header -->
              <div class="rounded-xl border border-purple-500/20 bg-void-950/40 backdrop-blur-md p-4 shadow-lg">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Simulated Match Win Probability</span>
                  </div>
                  <div class="text-right">
                    <span class="text-base font-black {matchAnalysis.blue_win_chance >= 50 ? 'text-emerald-400' : 'text-rose-400'}">
                      {matchAnalysis.blue_win_chance.toFixed(1)}%
                    </span>
                    <span class="text-[10px] text-purple-300/80 ml-1 font-semibold">Your Team</span>
                  </div>
                </div>

                <!-- Probability Comparison Bar -->
                <div class="relative h-3 w-full overflow-hidden rounded-full bg-rose-950/80 p-0.5">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                    style="width: {matchAnalysis.blue_win_chance}%"
                  ></div>
                </div>

                <div class="mt-2 flex items-center justify-between text-[10px] font-bold">
                  <span class="text-cyan-300">Blue Team: {matchAnalysis.blue_win_chance.toFixed(1)}%</span>
                  <span class="text-rose-300">Red Team: {(100 - matchAnalysis.blue_win_chance).toFixed(1)}%</span>
                </div>

                <!-- Tactical Insights -->
                {#if matchAnalysis.insights.length > 0}
                  <div class="mt-3 rounded-lg border border-purple-500/15 bg-purple-950/30 p-2.5">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300">Key Takeaway:</span>
                    <ul class="mt-1 space-y-1 text-xs text-slate-200">
                      {#each matchAnalysis.insights as insight}
                        <li class="flex items-start gap-1.5">
                          <span class="text-purple-400 text-[10px] mt-0.5">✦</span>
                          <span>{insight}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>

              <!-- Card 2: Lane-by-Lane Duel Breakdown -->
              <div class="rounded-xl border border-purple-500/20 bg-void-950/40 backdrop-blur-md p-4">
                <h3 class="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                  Lane-by-Lane Head-to-Head Duels
                </h3>

                <div class="space-y-2">
                  {#each matchAnalysis.lane_matchups as lm (lm.role)}
                    <div class="flex items-center justify-between rounded-xl border border-purple-500/10 bg-void-950/30 p-2.5 text-xs">
                      <!-- Left: Ally Pick -->
                      <div class="flex items-center gap-2 min-w-[140px]">
                        <img src={roleIconUrl(lm.role)} alt={lm.role_label} class="h-4 w-4 opacity-75" />
                        {#if lm.ally_champion_id}
                          {@const c = $championCatalog.get(lm.ally_champion_id)}
                          <div class="relative h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-cyan-400/50">
                            <img
                              src={squareIconUrl(c?.key || "", $ddragonVersion)}
                              alt={lm.ally_champion_name || ""}
                              class="h-full w-full object-cover scale-[1.18]"
                            />
                          </div>
                          <span class="font-bold text-white truncate">{lm.ally_champion_name}</span>
                        {:else}
                          <span class="text-slate-500 italic">No pick</span>
                        {/if}
                      </div>

                      <!-- Center: Win Rate & Advantage Badge -->
                      <div class="flex flex-col items-center px-2">
                        {#if lm.ally_winrate !== null && lm.ally_winrate !== undefined}
                          <span class="font-black text-xs {lm.delta > 1 ? 'text-emerald-400' : lm.delta < -1 ? 'text-rose-400' : 'text-slate-300'}">
                            {lm.ally_winrate.toFixed(1)}%
                          </span>
                          <span class="rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider {lm.advantage === 'ally'
                            ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                            : lm.advantage === 'enemy'
                            ? 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'}">
                            {lm.advantage === 'ally' ? 'Advantage Blue' : lm.advantage === 'enemy' ? 'Advantage Red' : 'Even Duel'}
                          </span>
                        {:else}
                          <span class="text-[10px] text-slate-500 font-medium">Uncontested</span>
                        {/if}
                      </div>

                      <!-- Right: Enemy Pick -->
                      <div class="flex items-center justify-end gap-2 min-w-[140px] text-right">
                        {#if lm.enemy_champion_id}
                          {@const c = $championCatalog.get(lm.enemy_champion_id)}
                          <span class="font-bold text-white truncate">{lm.enemy_champion_name}</span>
                          <div class="relative h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-rose-400/50">
                            <img
                              src={squareIconUrl(c?.key || "", $ddragonVersion)}
                              alt={lm.enemy_champion_name || ""}
                              class="h-full w-full object-cover scale-[1.18]"
                            />
                          </div>
                        {:else}
                          <span class="text-slate-500 italic">No enemy pick</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Card 3: Team Compositions & Damage Matrix -->
              <div class="grid grid-cols-2 gap-3">
                <!-- Blue Team Comp -->
                <div class="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3">
                  <h4 class="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2">Blue Team Balance</h4>
                  <div class="space-y-1.5 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-slate-400">Damage Split:</span>
                      <span class="font-bold text-slate-200">
                        {matchAnalysis.blue_comp.physical_pct.toFixed(0)}% AD / {matchAnalysis.blue_comp.magic_pct.toFixed(0)}% AP
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-400">Frontline / Tanks:</span>
                      <span class="font-bold text-slate-200">{matchAnalysis.blue_comp.frontline_count}</span>
                    </div>
                    {#each matchAnalysis.blue_comp.warnings as w}
                      <p class="text-[10px] text-amber-400/90 font-medium flex items-center gap-1">
                        <span>⚠️</span> {w}
                      </p>
                    {/each}
                  </div>
                </div>

                <!-- Red Team Comp -->
                <div class="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3">
                  <h4 class="text-xs font-bold text-rose-300 uppercase tracking-wider mb-2">Red Team Balance</h4>
                  <div class="space-y-1.5 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-slate-400">Damage Split:</span>
                      <span class="font-bold text-slate-200">
                        {matchAnalysis.red_comp.physical_pct.toFixed(0)}% AD / {matchAnalysis.red_comp.magic_pct.toFixed(0)}% AP
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-400">Frontline / Tanks:</span>
                      <span class="font-bold text-slate-200">{matchAnalysis.red_comp.frontline_count}</span>
                    </div>
                    {#each matchAnalysis.red_comp.warnings as w}
                      <p class="text-[10px] text-amber-400/90 font-medium flex items-center gap-1">
                        <span>⚠️</span> {w}
                      </p>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Card 4: Key Synergies & Threat Counters -->
              {#if matchAnalysis.synergies.length > 0 || matchAnalysis.counters.length > 0}
                <div class="grid grid-cols-2 gap-3">
                  <!-- Synergies -->
                  <div class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3">
                    <h4 class="text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-2">Top Team Synergies</h4>
                    {#if matchAnalysis.synergies.length === 0}
                      <p class="text-[10px] text-slate-500">Pick more allies to see synergy combos.</p>
                    {:else}
                      <div class="space-y-1.5">
                        {#each matchAnalysis.synergies.slice(0, 3) as syn}
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-slate-200 font-medium">{syn.champion_a_name} + {syn.champion_b_name}</span>
                            <span class="text-emerald-400 font-bold">+{syn.delta.toFixed(1)}% WR</span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <!-- Counters -->
                  <div class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3">
                    <h4 class="text-[11px] font-bold text-rose-300 uppercase tracking-wider mb-2">Notable Matchup Threats</h4>
                    {#if matchAnalysis.counters.length === 0}
                      <p class="text-[10px] text-slate-500">No severe counter matchups detected.</p>
                    {:else}
                      <div class="space-y-1.5">
                        {#each matchAnalysis.counters.slice(0, 3) as ctr}
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-slate-200 font-medium">
                              {ctr.winner_team === 'blue' ? '🛡️' : '⚔️'} {ctr.winner_name} vs {ctr.loser_name}
                            </span>
                            <span class="{ctr.winner_team === 'blue' ? 'text-emerald-400' : 'text-rose-400'} font-bold">
                              {ctr.winrate.toFixed(1)}% WR
                            </span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </section>
    </main>

    <!-- Champion Picker Modal -->
    {#if pickerOpen}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        on:click|self={closePicker}
        on:keydown={(e) => e.key === "Escape" && closePicker()}
      >
        <div class="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-purple-500/30 bg-[#0d061c] shadow-2xl overflow-hidden">
          <!-- Modal Header -->
          <div class="flex items-center justify-between border-b border-purple-500/20 bg-[#120826] px-5 py-3.5">
            <div>
              <h3 class="text-sm font-black tracking-wide text-white uppercase flex items-center gap-2">
                <span>Select Champion</span>
                {#if pickerTarget}
                  <span class="rounded bg-purple-600/30 border border-purple-400/40 px-2 py-0.5 text-[10px] text-purple-300 font-mono">
                    {pickerTarget.type === "ban" ? "Ban Slot" : `${pickerTarget.type === "ally" ? "Ally" : "Enemy"} ${pickerTarget.role.toUpperCase()}`}
                  </span>
                {/if}
              </h3>
              <p class="text-[10px] text-purple-300/70">Click any champion to assign to this slot</p>
            </div>

            <button
              type="button"
              on:click={closePicker}
              class="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
              title="Close"
            >
              ✕
            </button>
          </div>

          <!-- Search & Role Filter Tabs -->
          <div class="flex items-center justify-between gap-3 border-b border-purple-500/15 bg-[#090414] px-5 py-2.5">
            <div class="relative flex-1 max-w-xs">
              <input
                bind:this={pickerSearchInput}
                type="text"
                bind:value={pickerSearch}
                placeholder="Search champion..."
                class="w-full rounded-xl border border-purple-500/25 bg-[#140a2b] px-3.5 py-1.5 pl-8 text-xs text-white placeholder-purple-300/40 focus:border-purple-400 focus:outline-none"
              />
              <svg class="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-purple-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>

            <!-- Role Pills -->
            <div class="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-[#120826] p-0.5">
              <button
                type="button"
                on:click={() => setPickerRoleFilter(null)}
                class="rounded-lg px-2.5 py-1 text-[10px] font-bold transition {pickerRoleFilter === null
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white'}"
              >
                All
              </button>
              {#each ROLE_DEFS as r}
                <button
                  type="button"
                  on:click={() => setPickerRoleFilter(r.role)}
                  class="rounded-lg px-2.5 py-1 text-[10px] font-bold transition {pickerRoleFilter === r.role
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white'}"
                >
                  {r.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Champion Grid -->
          <div class="grid min-h-0 flex-1 grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 overflow-y-auto p-5">
            {#each Array.from($championCatalog.values()).sort((a, b) => a.name.localeCompare(b.name)) as champ (champ.id)}
              {@const isAlreadyTaken = selectedChampionIds.has(champ.id)}
              {@const matchesSearch = !pickerSearch.trim() || champ.name.toLowerCase().includes(pickerSearch.trim().toLowerCase())}
              {@const matchesRole = !pickerRoleFilter || (roleChampionsMap[pickerRoleFilter]?.has(champ.id) ?? true)}

              {#if matchesSearch && matchesRole}
                <button
                  type="button"
                  disabled={isAlreadyTaken}
                  on:click={() => selectChampionForPicker(champ.id)}
                  class="group flex flex-col items-center gap-1 rounded-xl border p-2 transition-all duration-150 {isAlreadyTaken
                    ? 'opacity-40 grayscale cursor-not-allowed border-transparent bg-black/20'
                    : 'border-purple-500/15 bg-[#140a2b]/60 hover:scale-105 hover:border-purple-400 hover:bg-[#1f0f42]'}"
                >
                  <div class="relative h-12 w-12 overflow-hidden rounded-full ring-1 ring-purple-400/40 group-hover:ring-purple-300">
                    <img
                      src={squareIconUrl(champ.key, $ddragonVersion)}
                      alt={champ.name}
                      class="h-full w-full object-cover scale-[1.18]"
                      loading="lazy"
                    />
                  </div>
                  <span class="truncate text-[10px] font-bold text-slate-200 group-hover:text-purple-200 text-center w-full">
                    {champ.name}
                  </span>
                  {#if isAlreadyTaken}
                    <span class="text-[8px] font-bold text-rose-400">Taken</span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
