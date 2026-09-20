export interface PatchChangeItem {
  id: string;
  type: "buff" | "nerf" | "adjustment" | "app";
  category: "champion" | "item" | "system" | "app";
  title: string;
  target?: string;
  championId?: number;
  championKey?: string;
  role?: "top" | "jungle" | "mid" | "adc" | "support";
  summary: string;
  details: string[];
}

export interface PatchNotesData {
  patchVersion: string;
  releaseDate: string;
  highlightSummary: string;
  changes: PatchChangeItem[];
}

export const LATEST_PATCH_DATA: PatchNotesData = {
  patchVersion: "26.18",
  releaseDate: "September 9, 2026",
  highlightSummary:
    "Caps inducted into the Hall of Legends with special event cosmetics, targeted buffs for Viego, Master Yi, Ekko, and Kassadin, balance nerfs to dominant pro-play supports Nautilus and Bard, Cassiopeia adjustments, and Demacian champions in Classic mode.",
  changes: [
    // Champion Buffs
    {
      id: "buff-viego",
      type: "buff",
      category: "champion",
      title: "Viego",
      target: "Base AD & Q - Blade of the Ruined King",
      championId: 234,
      championKey: "Viego",
      role: "jungle",
      summary: "Faster early jungle clear and improved skirmish threat.",
      details: [
        "Base Attack Damage: 57 → 60",
        "Q - Passive: Bonus damage against monsters increased from 20 → 25",
      ],
    },
    {
      id: "buff-master-yi",
      type: "buff",
      category: "champion",
      title: "Master Yi",
      target: "Base AD & Q - Alpha Strike",
      championId: 11,
      championKey: "MasterYi",
      role: "jungle",
      summary: "Strengthening early duel consistency and jungle clear pacing.",
      details: [
        "Base Attack Damage: 65 → 67",
        "Q - Alpha Strike: Bonus damage against monsters increased from 75/100/125/150/175 → 85/110/135/160/185",
      ],
    },
    {
      id: "buff-ekko",
      type: "buff",
      category: "champion",
      title: "Ekko",
      target: "Passive - Z-Drive Resonance & W - Parallel Convergence",
      championId: 245,
      championKey: "Ekko",
      role: "mid",
      summary: "Rewarding skilled burst combos and aggressive positioning.",
      details: [
        "Passive - Z-Drive Resonance: AP scaling increased from 80% → 85%",
        "W - Parallel Convergence: Base shield increased from 70/90/110/130/150 → 80/100/120/140/160",
      ],
    },
    {
      id: "buff-kassadin",
      type: "buff",
      category: "champion",
      title: "Kassadin",
      target: "Q - Null Sphere & R - Riftwalk",
      championId: 38,
      championKey: "Kassadin",
      role: "mid",
      summary: "Smoother mid-game scaling curve into late-game threat.",
      details: [
        "Q - Null Sphere: Magic damage increased from 65/95/125/155/185 → 70/100/130/160/190",
        "R - Riftwalk: Base AP scaling increased from 35% → 40%",
      ],
    },
    {
      id: "buff-zaahen",
      type: "buff",
      category: "champion",
      title: "Zaahen",
      target: "Base HP Regen & E - Cooldown",
      championId: 904,
      championKey: "Zaahen",
      role: "top",
      summary: "Improving lane sustain and ability uptime in top-lane trades.",
      details: [
        "Base Health Regeneration: 7.5 → 8.5 per 5s",
        "E - Cooldown: Reduced by 1s at early ranks (14/13/12/11/10s → 13/12/11/10/9s)",
      ],
    },

    // Champion Nerfs
    {
      id: "nerf-nautilus",
      type: "nerf",
      category: "champion",
      title: "Nautilus",
      target: "Q - Dredge Line & W - Titan's Wrath",
      championId: 111,
      championKey: "Nautilus",
      role: "support",
      summary: "Curbing excessive early hook pressure and base tankiness in pro play.",
      details: [
        "Q - Dredge Line: Mana cost increased from 60 → 70/75/80/85/90",
        "W - Titan's Wrath: Base shield reduced from 50/60/70/80/90 → 40/50/60/70/80",
      ],
    },
    {
      id: "nerf-bard",
      type: "nerf",
      category: "champion",
      title: "Bard",
      target: "Passive - Traveler's Call & W - Caretaker's Shrine",
      championId: 432,
      championKey: "Bard",
      role: "support",
      summary: "Toning down chime burst damage and lane sustain.",
      details: [
        "Passive - Traveler's Call: Base chime damage reduced from 35 → 30",
        "W - Caretaker's Shrine: Maximum charge heal reduced by 15 at all ranks",
      ],
    },
    {
      id: "nerf-seraphine",
      type: "nerf",
      category: "champion",
      title: "Seraphine",
      target: "Q - High Note & Passive Notes",
      championId: 147,
      championKey: "Seraphine",
      role: "adc",
      summary: "Bringing bottom-lane carry win rate into line with support role.",
      details: [
        "Q - High Note: Base damage reduced from 60/85/110/135/160 → 55/80/105/130/155",
        "Passive - Stage Presence: Note minion damage modifier reduced from 100% → 75%",
      ],
    },
    {
      id: "nerf-zeri",
      type: "nerf",
      category: "champion",
      title: "Zeri",
      target: "Base Health & Q - Burst Fire",
      championId: 221,
      championKey: "Zeri",
      role: "adc",
      summary: "Targeted balance adjustment to address pro-play dominance.",
      details: [
        "Base Health: 600 → 585",
        "Q - Burst Fire: Total Attack Damage ratio adjusted from 110% → 105%",
      ],
    },

    // Champion Adjustments
    {
      id: "adj-cassiopeia",
      type: "adjustment",
      category: "champion",
      title: "Cassiopeia",
      target: "Base Mana & E - Twin Fang",
      championId: 69,
      championKey: "Cassiopeia",
      role: "mid",
      summary: "Shifting power to reduce pro skew while preserving overall solo-queue strength.",
      details: [
        "Base Mana: 350 → 400",
        "E - Twin Fang: Bonus poison damage base adjusted to balance early wave control vs late DPS",
      ],
    },

    // Items & System Changes
    {
      id: "adj-rageblade",
      type: "buff",
      category: "item",
      title: "Guinsoo's Rageblade",
      summary: "Slight boost to on-hit marksmen uptime during extended teamfights.",
      details: [
        "Passive - Seething Strike: Stack duration increased from 5s → 6s",
        "Stack decay now falls off one stack at a time instead of all at once",
      ],
    },
    {
      id: "sys-classic",
      type: "adjustment",
      category: "system",
      title: "Classic Mode: Demacian Reunion",
      summary: "Fiora, Galio, Poppy, Shyvana, and Xin Zhao reintroduced with tailored balance tuning.",
      details: [
        "Classic mode roster expanded with 5 core Demacian champions",
        "First Council vote results implemented with updated map pacing",
      ],
    },
    {
      id: "sys-aram",
      type: "adjustment",
      category: "system",
      title: "ARAM Mayhem: Augment Pool Refinements",
      summary: "Improved augment selection weighting to ensure options fit your champion's archetype.",
      details: [
        "Removed mismatched augments (e.g. AP-only augments on pure AD champions)",
        "Increased appearance rate of role-defining prismatic augments",
      ],
    },

    // Rift Companion Updates
    {
      id: "app-update-013",
      type: "app",
      category: "app",
      title: "Rift Companion v0.1.3 Updates",
      summary: "Release Notes Markdown rendering, background auto-update detection, and local bundled role icons.",
      details: [
        "Release notes in the update modal now render formatted Markdown (headings, bold text, bullet points, and links)",
        "Automatic background update checker with subtle, non-intrusive status pill in the top navigation bar",
        "Bundled official role icons locally in the app package for instantaneous, offline-ready rendering",
        "Refreshed real-time patch highlights for Patch 26.18 with direct links to official Riot notes",
      ],
    },
  ],
};
