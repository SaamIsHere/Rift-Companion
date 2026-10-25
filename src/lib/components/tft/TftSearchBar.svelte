<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    tftMetaDecks,
    tftItems,
    tftSearchQuery,
    tftSelectedFilterTokens,
    addSearchFilterToken,
    removeSearchFilterToken,
    clearSearchFilterTokens,
    type TftSearchToken,
  } from "../../stores/tft";
  import {
    getTftChampionIcon,
    getTftItemIcon,
    getTftChampionCost,
  } from "../../utils/tftAssets";

  let inputEl: HTMLInputElement | null = null;
  let containerEl: HTMLDivElement | null = null;
  let inputValue = "";
  let isFocused = false;
  let activeIndex = -1;

  const CHAMP_ALIASES: Record<string, string[]> = {
    ashe: ["asia", "ash", "ashen", "asche"],
    azir: ["asia", "asir", "azi", "azur"],
    "kog'maw": ["kog", "maw", "kogmaw"],
    "kha'zix": ["kha", "zix", "khazix"],
    "rek'sai": ["rek", "sai", "reksai"],
    "master yi": ["yi", "masteryi"],
    leblanc: ["lb", "le blanc"],
    elderdragon: ["elder", "dragon", "elder dragon"],
    "elder dragon": ["elder", "dragon", "elderdragon"],
    brambleback: ["bramble", "redbuff", "red buff"],
    scuttlecrab: ["scuttle", "crab"],
  };

  const ITEM_ALIASES: Record<string, string[]> = {
    guinsoos_rageblade: ["rageblade", "guinsoo", "guinsoos"],
    "guinsoo's rageblade": ["rageblade", "guinsoo", "guinsoos"],
    rabadons_deathcap: ["deathcap", "dcap", "rabadon", "rabadons"],
    "rabadon's deathcap": ["deathcap", "dcap", "rabadon", "rabadons"],
    infinity_edge: ["ie", "infinity", "edge"],
    "infinity edge": ["ie", "infinity", "edge"],
    bloodthirster: ["bt", "bloodthirster"],
    giant_slayer: ["gs", "giant", "slayer"],
    "giant slayer": ["gs", "giant", "slayer"],
    last_whisper: ["lw", "last", "whisper"],
    "last whisper": ["lw", "last", "whisper"],
    jeweled_gauntlet: ["jg", "jeweled", "gauntlet"],
    "jeweled gauntlet": ["jg", "jeweled", "gauntlet"],
    hextech_gunblade: ["gunblade", "hextech"],
    "hextech gunblade": ["gunblade", "hextech"],
    blue_buff: ["bb", "blue", "buff", "bluebuff"],
    "blue buff": ["bb", "blue", "buff", "bluebuff"],
    red_buff: ["rb", "red", "buff", "redbuff"],
    "red buff": ["rb", "red", "buff", "redbuff"],
    dragons_claw: ["dclaw", "dragons", "claw"],
    "dragon's claw": ["dclaw", "dragons", "claw"],
    bramble_vest: ["bramble", "vest"],
    "bramble vest": ["bramble", "vest"],
    warmogs_armor: ["warmogs", "warmog"],
    "warmog's armor": ["warmogs", "warmog"],
    gargoyle_stoneplate: ["gargoyle", "stoneplate"],
    "gargoyle stoneplate": ["gargoyle", "stoneplate"],
    sunfire_cape: ["sunfire", "cape"],
    "sunfire cape": ["sunfire", "cape"],
    spear_of_shojin: ["shojin", "spear"],
    "spear of shojin": ["shojin", "spear"],
    archangels_staff: ["archangels", "seraphs", "staff"],
    "archangel's staff": ["archangels", "seraphs", "staff"],
    titans_resolve: ["titans", "resolve"],
    "titan's resolve": ["titans", "resolve"],
    steraks_gage: ["steraks", "gage"],
    "sterak's gage": ["steraks", "gage"],
    thiefs_gloves: ["tg", "thiefs", "gloves"],
    "thief's gloves": ["tg", "thiefs", "gloves"],
    hand_of_justice: ["hoj", "hand of justice"],
    "hand of justice": ["hoj", "hand of justice"],
    edge_of_night: ["eon", "edge of night"],
    "edge of night": ["eon", "edge of night"],
    quicksilver: ["qss", "quicksilver"],
    crownguard: ["crown", "crownguard"],
    ionic_spark: ["ionic", "spark"],
    "ionic spark": ["ionic", "spark"],
    protectors_vow: ["vow", "protectors"],
    "protector's vow": ["vow", "protectors"],
    nashors_tooth: ["nashors", "tooth"],
    "nashor's tooth": ["nashors", "tooth"],
    void_staff: ["void", "staff"],
    "void staff": ["void", "staff"],
    statikk_shiv: ["statikk", "shiv"],
    "statikk shiv": ["statikk", "shiv"],
    titanic_hydra: ["hydra", "titanic"],
    "titanic hydra": ["hydra", "titanic"],
    manazane: ["muramana", "manazane"],
  };

  // Champions catalog extracted from meta decks
  $: championsCatalog = (() => {
    const map = new Map<string, { id: string; name: string; cost: number; imageUrl: string }>();
    for (const deck of $tftMetaDecks) {
      for (const unit of deck.units) {
        if (!map.has(unit.name)) {
          map.set(unit.name, {
            id: unit.id || unit.name,
            name: unit.name,
            cost: getTftChampionCost(unit.name, unit.cost),
            imageUrl: unit.image_url || getTftChampionIcon(unit.name),
          });
        }
      }
    }
    return Array.from(map.values());
  })();

  // Items catalog extracted from tftItems
  $: itemsCatalog = $tftItems.map((item) => {
    let cat = "Item";
    if (item.name.toLowerCase().includes("radiant") || item.id.toLowerCase().includes("radiant")) {
      cat = "Radiant";
    } else if (item.id.toLowerCase().includes("artifact") || item.name.toLowerCase().includes("artifact")) {
      cat = "Artifact";
    } else if (item.name.toLowerCase().includes("emblem") || item.is_spatula) {
      cat = "Emblem";
    } else if (item.is_component) {
      cat = "Component";
    }
    return {
      id: item.id,
      name: item.name,
      imageUrl: item.image_url || getTftItemIcon(item.id),
      category: cat,
    };
  });

  interface SuggestionItem {
    id: string;
    name: string;
    type: "unit" | "item";
    imageUrl: string;
    badge: string;
  }

  // Generate suggestions matching inputValue
  $: suggestions = (() => {
    const q = inputValue.trim().toLowerCase();
    if (!q || $tftSelectedFilterTokens.length >= 4) return [];

    const selectedKeys = new Set(
      $tftSelectedFilterTokens.map((t) => `${t.type}:${t.name.toLowerCase()}`)
    );

    const champMatches: SuggestionItem[] = championsCatalog
      .filter((c) => {
        const lowerName = c.name.toLowerCase();
        if (lowerName.includes(q)) return true;
        const aliases = CHAMP_ALIASES[lowerName] || [];
        return aliases.some((a) => a.includes(q) || q.includes(a));
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: "unit" as const,
        imageUrl: c.imageUrl,
        badge: `${c.cost}-Cost Unit`,
      }));

    const itemMatches: SuggestionItem[] = itemsCatalog
      .filter((i) => {
        const lowerName = i.name.toLowerCase();
        const lowerId = i.id.toLowerCase();
        if (lowerName.includes(q)) return true;
        const aliases = ITEM_ALIASES[lowerName] || ITEM_ALIASES[lowerId] || [];
        return aliases.some((a) => a.includes(q) || q.includes(a));
      })
      .map((i) => ({
        id: i.id,
        name: i.name,
        type: "item" as const,
        imageUrl: i.imageUrl,
        badge: i.category,
      }));

    const combined = [...itemMatches, ...champMatches].filter(
      (s) => !selectedKeys.has(`${s.type}:${s.name.toLowerCase()}`)
    );

    // Sort: items starting with q first, then containing q
    combined.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });

    return combined.slice(0, 10);
  })();

  $: showDropdown = isFocused && suggestions.length > 0 && $tftSelectedFilterTokens.length < 4;

  function selectSuggestion(sug: SuggestionItem) {
    if ($tftSelectedFilterTokens.length >= 4) return;
    addSearchFilterToken({
      id: sug.id,
      name: sug.name,
      type: sug.type,
      imageUrl: sug.imageUrl,
    });
    // Reset query and close dropdown completely
    inputValue = "";
    $tftSearchQuery = "";
    activeIndex = -1;
    isFocused = false;
    inputEl?.blur();
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    inputValue = target.value;
    activeIndex = -1;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showDropdown) {
      if (e.key === "Enter") {
        e.preventDefault();
        $tftSearchQuery = inputValue.trim();
        isFocused = false;
        inputEl?.blur();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        selectSuggestion(suggestions[activeIndex]);
      } else if (suggestions.length > 0) {
        selectSuggestion(suggestions[0]);
      } else {
        $tftSearchQuery = inputValue.trim();
        isFocused = false;
        inputEl?.blur();
      }
    } else if (e.key === "Escape") {
      isFocused = false;
      inputEl?.blur();
    }
  }

  function handleDocumentClick(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      isFocused = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  });

  // Highlight matching substring for autocomplete dropdown
  function getHighlightedParts(text: string, query: string): { text: string; match: boolean }[] {
    if (!query) return [{ text, match: false }];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return [{ text, match: false }];

    const parts: { text: string; match: boolean }[] = [];
    if (index > 0) {
      parts.push({ text: text.substring(0, index), match: false });
    }
    parts.push({ text: text.substring(index, index + query.length), match: true });
    if (index + query.length < text.length) {
      parts.push({ text: text.substring(index + query.length), match: false });
    }
    return parts;
  }
</script>

<div bind:this={containerEl} class="relative z-40 w-full sm:w-80 md:w-96 select-none">
  <!-- Pill Container -->
  <div
    class="flex items-center gap-2 rounded-full border border-purple-500/25 bg-void-950/90 px-3.5 py-1.5 shadow-inner backdrop-blur-md transition-all {isFocused
      ? 'border-purple-400/60 ring-1 ring-purple-400/40 bg-void-950'
      : 'hover:border-purple-500/40'} {$tftSelectedFilterTokens.length >= 4 ? 'opacity-80' : ''}"
  >
    <!-- Magnifying Glass Icon -->
    <svg
      class="h-4 w-4 shrink-0 text-purple-300/60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>

    <!-- Text Input (Blocked when 4 tokens selected) -->
    <input
      bind:this={inputEl}
      type="text"
      value={inputValue}
      disabled={$tftSelectedFilterTokens.length >= 4}
      on:input={handleInputChange}
      on:focus={() => {
        if ($tftSelectedFilterTokens.length < 4) isFocused = true;
      }}
      on:keydown={handleKeydown}
      placeholder={$tftSelectedFilterTokens.length >= 4
        ? 'Max. 4 Filter aktiv'
        : $tftSelectedFilterTokens.length > 0
        ? 'Filter hinzufügen (bis 4)...'
        : 'Search champions or items…'}
      class="w-full min-w-0 bg-transparent text-xs text-white placeholder-purple-300/40 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
    />

    <!-- Selected Token Chips (inside Search Bar on Right) -->
    {#if $tftSelectedFilterTokens.length > 0}
      <div class="flex items-center gap-1.5 shrink-0">
        {#each $tftSelectedFilterTokens as token (token.type + ':' + token.id)}
          <button
            type="button"
            on:click|stopPropagation={() => removeSearchFilterToken(token.id, token.type)}
            class="relative group h-6 w-6 rounded-md overflow-hidden border border-purple-400/60 bg-void-900 shadow-sm cursor-pointer shrink-0 transition-transform active:scale-95"
            title="{token.name} (Click to remove)"
          >
            <!-- Token Icon -->
            <img
              src={token.imageUrl}
              alt={token.name}
              class="h-full w-full object-cover"
              on:error={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (token.type === 'unit') {
                  target.src = getTftChampionIcon(token.name);
                } else {
                  target.src = getTftItemIcon(token.id);
                }
              }}
            />

            <!-- Hover "X" Overlay -->
            <div
              class="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg
                class="h-3 w-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Autocomplete Suggestions Dropdown (Double-layered with outer overflow-hidden to prevent scrollbar clipping) -->
  {#if showDropdown}
    <div
      class="absolute left-0 right-0 top-full mt-1.5 z-[150] flex flex-col rounded-xl border border-purple-500/30 bg-void-950/98 shadow-2xl backdrop-blur-2xl overflow-hidden"
    >
      <!-- Fixed Non-Scrolling Header -->
      <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-300/60 flex items-center justify-between border-b border-purple-500/15 bg-void-950 shrink-0">
        <span>Suggested Results</span>
        <span class="text-[9px] lowercase font-normal text-slate-400">{$tftSelectedFilterTokens.length}/4 selected</span>
      </div>

      <!-- Scrollable Results Container with Padding and Inset Rounded Scrollbar -->
      <div class="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-dropdown-scroll">
        {#each suggestions as sug, idx (sug.type + ':' + sug.id)}
          {@const isHighlighted = idx === activeIndex}
          {@const parts = getHighlightedParts(sug.name, inputValue.trim())}
          <button
            type="button"
            on:mousedown|preventDefault={() => selectSuggestion(sug)}
            class="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition {isHighlighted
              ? 'bg-purple-600/30 border border-purple-400/40 text-white'
              : 'hover:bg-white/[0.05] border border-transparent text-slate-200'}"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Thumbnail Image -->
              <img
                src={sug.imageUrl}
                alt={sug.name}
                class="h-7 w-7 rounded-md object-cover border border-purple-400/30 shrink-0 shadow"
                on:error={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (sug.type === 'unit') {
                    target.src = getTftChampionIcon(sug.name);
                  } else {
                    target.src = getTftItemIcon(sug.id);
                  }
                }}
              />

              <!-- Name with Bold Matched Characters -->
              <div class="min-w-0 text-xs">
                {#if parts.some(p => p.match)}
                  {#each parts as p}
                    {#if p.match}
                      <span class="font-extrabold text-white text-[13px] bg-purple-500/30 px-0.5 rounded">{p.text}</span>
                    {:else}
                      <span class="font-normal text-slate-300">{p.text}</span>
                    {/if}
                  {/each}
                {:else}
                  <span class="font-bold text-white">{sug.name}</span>
                {/if}
              </div>
            </div>

            <!-- Category Badge -->
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold {sug.badge.includes('Radiant')
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                : sug.badge.includes('Artifact')
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                : sug.badge.includes('Unit')
                ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                : 'bg-white/10 text-slate-300 border border-white/10'}"
            >
              {sug.badge}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .custom-dropdown-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--theme-primary-500) / 0.28) transparent;
  }
  .custom-dropdown-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-dropdown-scroll::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }
  .custom-dropdown-scroll::-webkit-scrollbar-thumb {
    background: rgba(var(--theme-primary-500) / 0.28);
    border-radius: 9999px;
    transition: background 0.2s ease;
  }
  .custom-dropdown-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--theme-primary-400) / 0.55);
  }
  .custom-dropdown-scroll::-webkit-scrollbar-corner {
    background: transparent;
  }
</style>
