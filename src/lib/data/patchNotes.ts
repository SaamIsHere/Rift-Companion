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
    "Caps inducted into the Hall of Legends! Official Patch 26.18 brings targeted buffs for Viego, Master Yi, Ekko, and Kassadin, balance nerfs to meta supports Nautilus and Bard, Seraphine bot-carry nerf, pro-skew adjustments for Cassiopeia, and Rageblade uptime improvements.",
  changes: [
    // Champion Buffs
    {
      id: "buff-viego",
      type: "buff",
      category: "champion",
      title: "Viego",
      target: "Base Stats & Passive - Sovereign's Domination",
      championId: 234,
      championKey: "Viego",
      role: "jungle",
      summary: "Boosting falling win rate and improving scaling viability for both standard and bruiser builds.",
      details: [
        "Base Attack Damage Growth: 3.5 ⇒ 4.0 per level",
        "Passive - Sovereign's Domination: Heal increased to 2% (+ 2.5% per 100 bonus AD) (+ 2% per 100 AP) (+ 5% per 100% bonus AS) (+ 2% per 500 bonus HP) of target's max HP",
      ],
    },
    {
      id: "buff-master-yi",
      type: "buff",
      category: "champion",
      title: "Master Yi",
      target: "Base Stats (Armor Growth) & R - Highlander",
      championId: 11,
      championKey: "MasterYi",
      role: "jungle",
      summary: "Compensating for Rageblade bugfix interaction and improving scaling as a melee carry.",
      details: [
        "Base Armor Growth: 33 + 4.5/Level ⇒ 33 + 5/Level",
        "R - Highlander: Bonus Move Speed: 35 / 45 / 55% ⇒ 40 / 50 / 60%",
      ],
    },
    {
      id: "buff-ekko",
      type: "buff",
      category: "champion",
      title: "Ekko",
      target: "Q - Timewinder",
      championId: 245,
      championKey: "Ekko",
      role: "mid",
      summary: "Strengthening mid-lane lane control and burst return damage without over-buffing Hail of Blades.",
      details: [
        "Q - Timewinder: Mana Cost: 50 / 60 / 70 / 80 / 90 ⇒ 40 / 50 / 60 / 70 / 80",
        "Q - Timewinder: Return Damage Ability Power Ratio: 60% ⇒ 70%",
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
      summary: "Making Q punchier with scaling and providing earlier agency through Riftwalk base damage.",
      details: [
        "Q - Null Sphere: Ability Power Ratio: 70% AP ⇒ 80% AP",
        "R - Riftwalk: Base Damage: 70 / 90 / 110 ⇒ 80 / 95 / 110",
      ],
    },
    {
      id: "buff-zaahen",
      type: "buff",
      category: "champion",
      title: "Zaahen",
      target: "Q - The Darkin Glaive",
      championId: 904,
      championKey: "Zaahen",
      role: "top",
      summary: "QoL fix preventing Q from being wasted on resurrection, plus doubling Q2 base damage.",
      details: [
        "Q - Cooldown Behavior: If Q is active, it is now placed on Cooldown immediately upon being put in Resurrection (Passive, GA, Zilean R)",
        "Q2 Damage: 25 / 50 / 75 / 100 / 125 (+20/25/30/35/40% bonus AD) ⇒ 30 / 60 / 90 / 120 / 150 (+20/25/30/35/40% bonus AD)",
      ],
    },

    // Champion Nerfs
    {
      id: "nerf-bard",
      type: "nerf",
      category: "champion",
      title: "Bard",
      target: "Base Stats (Armor)",
      championId: 432,
      championKey: "Bard",
      role: "support",
      summary: "Targeting excessive durability given his high map mobility and long-range ultimate utility.",
      details: [
        "Base Armor: 34 + 5/Level ⇒ 32 + 4.7/Level",
      ],
    },
    {
      id: "nerf-nautilus",
      type: "nerf",
      category: "champion",
      title: "Nautilus",
      target: "Base Stats (AD) & Q - Dredge Line",
      championId: 111,
      championKey: "Nautilus",
      role: "support",
      summary: "Toning down early hook pressure and base damage to open room for support variety.",
      details: [
        "Base Attack Damage: 61 + 3.3/Level ⇒ 58 + 3.3/Level",
        "Q - Dredge Line: Magic Damage: 85 / 130 / 175 / 220 / 265 (+90% AP) ⇒ 85 / 125 / 165 / 205 / 245 (+90% AP)",
      ],
    },
    {
      id: "nerf-seraphine",
      type: "nerf",
      category: "champion",
      title: "Seraphine",
      target: "E - Beat Drop",
      championId: 147,
      championKey: "Seraphine",
      role: "adc",
      summary: "Targeting bot carry power where E is maxed second, leaving support Seraphine (which maxes E last) untouched.",
      details: [
        "E - Beat Drop: Cooldown: 11 / 10.5 / 10 / 9.5 / 9s ⇒ 11s flat at all ranks",
      ],
    },
    {
      id: "nerf-syndra",
      type: "nerf",
      category: "champion",
      title: "Syndra",
      target: "Passive - Transcendent & W - Force of Will",
      championId: 134,
      championKey: "Syndra",
      role: "mid",
      summary: "Tapping down solo-queue burst share and increasing reliance on Lost Chapter mana investment.",
      details: [
        "Passive - Transcendent Splinter: Bonus Mana: 20 - 255 ⇒ 20 - 199",
        "W - Force of Will: Cooldown: 12 / 11 / 10 / 9 / 8s ⇒ 13 / 12 / 11 / 10 / 9s",
      ],
    },
    {
      id: "nerf-zeri",
      type: "nerf",
      category: "champion",
      title: "Zeri",
      target: "W - Ultrashock Laser",
      championId: 221,
      championKey: "Zeri",
      role: "adc",
      summary: "Pulling power out of burst and waveclear following high win rates with Runaan's and Yun Tal buffs.",
      details: [
        "W - Ultrashock Laser: Damage: 30 / 70 / 110 / 150 / 190 (+120% tAD) ⇒ 30 / 70 / 110 / 150 / 190 (+100% tAD)",
        "W - Ultrashock Laser: Wall Damage: 45 / 105 / 165 / 225 / 285 (+180% tAD) ⇒ 45 / 105 / 165 / 225 / 285 (+150% tAD)",
      ],
    },

    // Champion Adjustments
    {
      id: "adj-cassiopeia",
      type: "adjustment",
      category: "champion",
      title: "Cassiopeia",
      target: "Passive, Q, E & R",
      championId: 69,
      championKey: "Cassiopeia",
      role: "mid",
      summary: "Tapping down oppressive early laning in pro play while raising her skill floor and late-game AP scaling.",
      details: [
        "Passive - Serpentine Grace: Move Speed Bonus: 6% - 40% ⇒ 5% - 36% (based on level)",
        "Q - Noxious Blast: Base Damage: 75/110/145/180/215 ⇒ 65/100/135/170/205",
        "Q - Noxious Blast: Ability Power Ratio: 65% ⇒ 75%",
        "E - Twin Fang: Mana Cost: 40 ⇒ 45",
        "E - Twin Fang: Base AP Ratio: 10% ⇒ 20% | Enhanced AP Ratio: 55% ⇒ 45% (Total 65% unchanged)",
        "E - Twin Fang: Damage: 52 - 120 ⇒ 50 - 120",
        "R - Petrifying Gaze: Base Damage: 150 / 250 / 350 ⇒ 125 / 225 / 325",
        "R - Petrifying Gaze: Ability Power Ratio: 50% ⇒ 75%",
      ],
    },

    // Items & System Changes
    {
      id: "buff-rageblade",
      type: "buff",
      category: "item",
      title: "Guinsoo's Rageblade",
      summary: "QoL stack duration buff to help players get it stacked up and keep it stacked during fights.",
      details: [
        "Passive - Seething Strike: Stack Duration: 3s ⇒ 4s",
      ],
    },
    {
      id: "sys-classic",
      type: "adjustment",
      category: "system",
      title: "Classic Mode: Demacian Reunion",
      summary: "Fiora, Galio, Poppy, Shyvana, and Xin Zhao reintroduced to the Classic roster with tailored balance tuning.",
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
    {
      id: "sys-caps-hol",
      type: "app",
      category: "system",
      title: "Hall of Legends: Caps Induction",
      summary: "Official celebration of Rasmus 'Caps' Winther's historic European legacy in League of Legends.",
      details: [
        "Special Hall of Legends event pass with Caps-curated cosmetics and champion skins",
        "Event runs live globally throughout Patch 26.18",
      ],
    },

    // Rift Companion Updates
    {
      id: "app-update-015",
      type: "app",
      category: "app",
      title: "Rift Companion v0.1.5 Updates",
      summary: "Ranked queue champion filters (All, Solo/Duo, Flex), full season stats, and profile optimizations.",
      details: [
        "Added Queue Filter tabs (All, Solo/Duo, Flex) under Most Played Champions on summoner profiles",
        "Overall season champion performance now displays accurately for both Ranked Solo/Duo and Ranked Flex",
        "Added 'Show all' toggle to expand beyond the top 7 champions and view the entire season champion roster",
        "Improved Riot ID and tagline resolution for locally connected accounts",
        "Streamlined champion card header by removing redundant status badge",
      ],
    },
    {
      id: "app-update-014",
      type: "app",
      category: "app",
      title: "Rift Companion v0.1.4 Updates",
      summary: "Exact official Riot Patch 26.18 notes verification, Markdown release notes, and auto-update detection.",
      details: [
        "Updated all champion balance highlights with 100% official Riot Games Patch 26.18 patch note numbers",
        "Release notes in the update modal now render formatted Markdown (headings, bold text, bullet points, and links)",
        "Automatic background update checker with subtle, non-intrusive status pill in the top navigation bar",
        "Bundled official role icons locally in the app package for instantaneous, offline-ready rendering",
      ],
    },
  ],
};
