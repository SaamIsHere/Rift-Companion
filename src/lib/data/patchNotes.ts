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
  patchVersion: "14.18",
  releaseDate: "September 2024",
  highlightSummary:
    "Worlds Championship balance overhaul with key lane-swap system deterrents, targeted champion buffs to diversify meta pools, and major companion quality-of-life additions.",
  changes: [
    // Champion Buffs
    {
      id: "buff-ahri",
      type: "buff",
      category: "champion",
      title: "Ahri",
      target: "Base Armor & E - Charm",
      championId: 103,
      championKey: "Ahri",
      role: "mid",
      summary: "Increased early durability and reward for landing Charm combos.",
      details: [
        "Base Armor: 21 → 24",
        "E - Charm: AP scaling increased from 45% → 60%",
        "E - Charm: Base damage increased from 80/110/140/170/200 → 80/120/160/200/240",
      ],
    },
    {
      id: "buff-jinx",
      type: "buff",
      category: "champion",
      title: "Jinx",
      target: "Attack Speed Growth & Q - Fishbones",
      championId: 222,
      championKey: "Jinx",
      role: "adc",
      summary: "Sharpening hypercarry scaling in the late game.",
      details: [
        "Attack Speed Growth: 1.0% → 1.4% per level",
        "Q - Fishbones: Bonus physical damage scaling increased from 110% AD → 115% AD",
      ],
    },
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
      id: "buff-syndra",
      type: "buff",
      category: "champion",
      title: "Syndra",
      target: "Q - Dark Sphere",
      championId: 134,
      championKey: "Syndra",
      role: "mid",
      summary: "Reinforcing burst mage consistency during early lane phases.",
      details: [
        "Q - Dark Sphere: Base damage increased from 75/110/145/180/215 → 80/115/150/185/220",
        "Q - Dark Sphere: AP scaling increased from 65% → 70%",
      ],
    },
    {
      id: "buff-graves",
      type: "buff",
      category: "champion",
      title: "Graves",
      target: "E - Quickdraw",
      championId: 104,
      championKey: "Graves",
      role: "jungle",
      summary: "Gives Graves more survivability when fighting in grit stacks.",
      details: [
        "E - Quickdraw: Armor per True Grit stack increased from 4/7/10/13/16 → 5/8/11/14/17",
      ],
    },
    {
      id: "buff-gnar",
      type: "buff",
      category: "champion",
      title: "Gnar",
      target: "Base AD & Attack Range",
      championId: 150,
      championKey: "Gnar",
      role: "top",
      summary: "Slight power boost to Mini Gnar harass and lane presence.",
      details: [
        "Base Attack Damage: 57 → 60",
        "Passive - Rage Gene: Maximum bonus range in Mini form increased from 95 → 100",
      ],
    },

    // Champion Nerfs
    {
      id: "nerf-senna",
      type: "nerf",
      category: "champion",
      title: "Senna",
      target: "Q - Piercing Darkness & Passive Souls",
      championId: 235,
      championKey: "Senna",
      role: "support",
      summary: "Toning down excessive poke sustain and gold acceleration.",
      details: [
        "Q - Piercing Darkness: Heal AP ratio reduced from 40% → 30%",
        "Passive - Absolution: Mist Wraith spawn rate on minion kills reduced from 8.4% → 6.2%",
      ],
    },
    {
      id: "nerf-smolder",
      type: "nerf",
      category: "champion",
      title: "Smolder",
      target: "Q - Super Scorcher Breath & W",
      championId: 901,
      championKey: "Smolder",
      role: "adc",
      summary: "Mitigating excessive mid-lane waveclear and true-damage burn dominance.",
      details: [
        "Q - Super Scorcher Breath: Tier 3 burn damage true damage scaling reduced",
        "W - Achooo!: Cooldown increased from 13/12.5/12/11.5/11s → 14/13.5/13/12.5/12s",
      ],
    },
    {
      id: "nerf-nasus",
      type: "nerf",
      category: "champion",
      title: "Nasus",
      target: "E - Spirit Fire",
      championId: 75,
      championKey: "Nasus",
      role: "top",
      summary: "Weakening the E-max AP mid and top lane poke build.",
      details: [
        "E - Spirit Fire: Armor reduction reduced from 25/30/35/40/45% → 20/25/30/35/40%",
        "E - Spirit Fire: Initial base damage reduced by 15 at all ranks",
      ],
    },
    {
      id: "nerf-brand",
      type: "nerf",
      category: "champion",
      title: "Brand",
      target: "Passive - Blaze & E",
      championId: 63,
      championKey: "Brand",
      role: "jungle",
      summary: "Slowing down hyper-efficient jungle camp clears.",
      details: [
        "Passive - Blaze: Monster damage cap per tick reduced from 45 → 35",
        "E - Conflagration: Magic damage reduced from 60/85/110/135/160 → 55/80/105/130/155",
      ],
    },
    {
      id: "nerf-lillia",
      type: "nerf",
      category: "champion",
      title: "Lillia",
      target: "Passive Monster Healing & R Duration",
      championId: 876,
      championKey: "Lillia",
      role: "jungle",
      summary: "Bringing Lillia's sustained teamfight sleep lock and sustain into check.",
      details: [
        "Passive - Dream-Laden Bough: Monster healing reduced by 15%",
        "R - Lilting Lullaby: Sleep duration decreased from 2.0/2.25/2.5s → 1.5/2.0/2.5s",
      ],
    },
    {
      id: "nerf-aurora",
      type: "nerf",
      category: "champion",
      title: "Aurora",
      target: "R - Between Worlds",
      championId: 893,
      championKey: "Aurora",
      role: "mid",
      summary: "Reducing the arena trap duration and burst follow-up.",
      details: [
        "R - Between Worlds: Trap realm duration reduced from 3.5/3.75/4s → 2.5/3.0/3.5s",
        "R - Between Worlds: Base magic damage reduced from 200/325/450 → 175/275/375",
      ],
    },

    // Adjustments & Items
    {
      id: "adj-cleaver",
      type: "adjustment",
      category: "item",
      title: "Black Cleaver",
      summary: "Reinforcing bruiser item identity against high-armor frontline compositions.",
      details: [
        "Carve armor reduction per stack: 5% → 6% (max 30% armor reduction)",
        "Build path adjusted for smoother mid-game progression",
      ],
    },
    {
      id: "adj-bloodthirster",
      type: "adjustment",
      category: "item",
      title: "Bloodthirster",
      summary: "Shielding value tuned between melee fighters and ranged marksmen.",
      details: [
        "Base life steal increased from 15% → 18%",
        "Overheal shield conversion rate adjusted based on level",
      ],
    },
    {
      id: "adj-tower-fort",
      type: "adjustment",
      category: "system",
      title: "Turret Fortification & Lane Swap Deterrent",
      summary: "Major structural change preventing early bot/top lane swaps in competitive and high-Elo.",
      details: [
        "Mid & Top outer turret pre-5-minute flat damage reduction increased from 50% → 75%",
        "First Turret takedown bonus gold increased from 150g → 300g",
      ],
    },

    // Rift Companion Updates
    {
      id: "app-themes",
      type: "app",
      category: "app",
      title: "Rift Companion: 8 Runeterra Region Themes",
      summary: "Personalize your app with official Runeterra faction themes and dynamic styling.",
      details: [
        "Added Void, Hextech, Noxus, Freljord, Shurima, Bilgewater, Ionia, and Shadow Isles themes",
        "Dynamic theme color variables adapt buttons, cards, tags, and icons to your chosen faction",
        "Includes a Shuffle 🎲 option in Settings for quick randomized switching",
      ],
    },
    {
      id: "app-wallpaper",
      type: "app",
      category: "app",
      title: "Rift Companion: Custom Wallpaper Uploads",
      summary: "Upload your personal JPEG or PNG background images with offline IndexedDB storage.",
      details: [
        "Full offline persistence via IndexedDB and Tauri local storage",
        "Scope setting: apply custom wallpaper to Startseite only or across all tabs",
        "Automatic aspect ratio scaling and crisp, high-performance rendering",
      ],
    },
    {
      id: "app-glass",
      type: "app",
      category: "app",
      title: "Rift Companion: Tiered Glass Transparency UI",
      summary: "Subtle translucent container boxes allowing wallpapers to shine through cleanly.",
      details: [
        "Eliminated opaque solid blocks across all tabs (Champions, Profile, Live Match, Match Simulation)",
        "Nested backdrop-blur cleanup for crystal-clear text and statistical charts",
        "Removed lingering neon glow borders for a refined, modern desktop experience",
      ],
    },
  ],
};
