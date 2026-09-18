import type { ThemeId } from "../types";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  subtitle: string;
  region: string;
  description: string;
  swatch: [string, string, string]; // [Primary, Glow/Accent, Deep Surface]
  bgFilter: string; // Base grayscale/contrast filter
  tintGradient: string; // Pure theme color wash
  tintBlendMode: string; // CSS blend mode for color wash (e.g. "color")
  bgBase: string;
  glow: string;
  bgGradients: {
    g1: string;
    g2: string;
    g3: string;
  };
  buttonGradient: {
    simFrom: string;
    simVia: string;
    simTo: string;
    patchFrom: string;
    patchVia: string;
    patchTo: string;
  };
  primaryRgb: Record<
    50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950,
    string
  >;
  voidRgb: Record<600 | 700 | 800 | 850 | 900 | 950, string>;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "void",
    name: "Void",
    subtitle: "Hextech Violet",
    region: "The Void",
    description: "Deep void obsidian with glowing mystical violet & purple neon.",
    swatch: ["#a855f7", "#c084fc", "#07040d"],
    bgFilter: "contrast(1.05) brightness(0.95)",
    tintGradient: "linear-gradient(135deg, rgba(147, 51, 234, 0.75), rgba(88, 28, 135, 0.85))",
    tintBlendMode: "color",
    bgBase: "#07040d",
    glow: "rgba(168, 85, 247, 0.45)",
    bgGradients: {
      g1: "rgba(147, 51, 234, 0.16)",
      g2: "rgba(126, 34, 206, 0.10)",
      g3: "rgba(168, 85, 247, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-purple-800/80",
      simVia: "via-violet-700/80",
      simTo: "to-purple-900/80",
      patchFrom: "from-purple-700/85",
      patchVia: "via-violet-600/85",
      patchTo: "to-indigo-700/85",
    },
    primaryRgb: {
      50: "250 245 255",
      100: "243 232 255",
      200: "233 213 255",
      300: "216 180 254",
      400: "192 132 252",
      500: "168 85 247",
      600: "147 51 234",
      700: "126 34 206",
      800: "107 33 168",
      900: "88 28 135",
      950: "59 7 100",
    },
    voidRgb: {
      950: "6 3 12",
      900: "10 6 20",
      850: "14 8 31",
      800: "20 12 43",
      700: "30 17 63",
      600: "45 26 88",
    },
  },
  {
    id: "hextech",
    name: "Hextech",
    subtitle: "Piltover Magic",
    region: "Piltover",
    description: "Arcane crystal cyan & cobalt blue with polished brass tones.",
    swatch: ["#0ac8b9", "#38bdf8", "#040914"],
    bgFilter: "grayscale(100%) contrast(1.22) brightness(0.85)",
    tintGradient: "linear-gradient(135deg, #0ac8b9 0%, #0284c7 45%, #0369a1 80%, #082f49 100%)",
    tintBlendMode: "color",
    bgBase: "#040914",
    glow: "rgba(10, 200, 185, 0.45)",
    bgGradients: {
      g1: "rgba(10, 200, 185, 0.16)",
      g2: "rgba(3, 151, 171, 0.12)",
      g3: "rgba(56, 189, 248, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-teal-800/80",
      simVia: "via-cyan-700/80",
      simTo: "to-blue-900/80",
      patchFrom: "from-cyan-700/85",
      patchVia: "via-teal-600/85",
      patchTo: "to-sky-700/85",
    },
    primaryRgb: {
      50: "240 253 250",
      100: "204 251 241",
      200: "153 246 238",
      300: "94 234 223",
      400: "45 220 206",
      500: "10 200 185",
      600: "3 151 171",
      700: "14 116 144",
      800: "21 94 117",
      900: "19 74 96",
      950: "8 47 62",
    },
    voidRgb: {
      950: "4 9 20",
      900: "6 15 32",
      850: "9 20 42",
      800: "13 28 58",
      700: "17 38 78",
      600: "24 53 108",
    },
  },
  {
    id: "noxus",
    name: "Noxus",
    subtitle: "Crimson Blood",
    region: "Noxian Empire",
    description: "Ruthless dark obsidian iron with crimson war flame & ruby glow.",
    swatch: ["#e11d48", "#fb7185", "#0c0406"],
    bgFilter: "grayscale(100%) contrast(1.22) brightness(0.82)",
    tintGradient: "linear-gradient(135deg, #e11d48 0%, #be123c 45%, #881337 80%, #450a18 100%)",
    tintBlendMode: "color",
    bgBase: "#0c0406",
    glow: "rgba(225, 29, 72, 0.45)",
    bgGradients: {
      g1: "rgba(225, 29, 72, 0.16)",
      g2: "rgba(190, 18, 60, 0.12)",
      g3: "rgba(244, 63, 94, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-rose-900/80",
      simVia: "via-red-800/80",
      simTo: "to-rose-950/80",
      patchFrom: "from-red-800/85",
      patchVia: "via-rose-700/85",
      patchTo: "to-red-900/85",
    },
    primaryRgb: {
      50: "255 241 242",
      100: "255 228 230",
      200: "254 205 211",
      300: "253 164 175",
      400: "251 113 133",
      500: "225 29 72",
      600: "190 18 60",
      700: "159 18 57",
      800: "136 19 55",
      900: "76 5 25",
      950: "45 3 14",
    },
    voidRgb: {
      950: "12 4 6",
      900: "18 6 9",
      850: "25 8 13",
      800: "36 11 18",
      700: "52 14 24",
      600: "72 18 32",
    },
  },
  {
    id: "freljord",
    name: "Freljord",
    subtitle: "Glacial Frost",
    region: "The Frozen North",
    description: "Chilling true ice cyan, arctic auroras & frosted abyssal blue.",
    swatch: ["#38bdf8", "#7dd3fc", "#030914"],
    bgFilter: "grayscale(100%) contrast(1.18) brightness(0.9)",
    tintGradient: "linear-gradient(135deg, #38bdf8 0%, #0284c7 45%, #0369a1 80%, #0c4a6e 100%)",
    tintBlendMode: "color",
    bgBase: "#030914",
    glow: "rgba(56, 189, 248, 0.45)",
    bgGradients: {
      g1: "rgba(56, 189, 248, 0.16)",
      g2: "rgba(2, 132, 199, 0.12)",
      g3: "rgba(125, 211, 252, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-sky-900/80",
      simVia: "via-cyan-800/80",
      simTo: "to-blue-950/80",
      patchFrom: "from-sky-700/85",
      patchVia: "via-blue-600/85",
      patchTo: "to-cyan-800/85",
    },
    primaryRgb: {
      50: "240 249 255",
      100: "224 242 254",
      200: "186 230 253",
      300: "125 211 252",
      400: "56 189 248",
      500: "14 165 233",
      600: "2 132 199",
      700: "3 105 161",
      800: "7 89 133",
      900: "12 74 110",
      950: "8 47 73",
    },
    voidRgb: {
      950: "3 9 20",
      900: "5 15 31",
      850: "7 21 42",
      800: "10 29 56",
      700: "14 40 76",
      600: "19 54 102",
    },
  },
  {
    id: "shadow_isles",
    name: "Shadow Isles",
    subtitle: "Ruination Mist",
    region: "The Black Mist",
    description: "Haunting spectral jade green, eerie souls & harrowing mist.",
    swatch: ["#10b981", "#34d399", "#030d09"],
    bgFilter: "grayscale(100%) contrast(1.22) brightness(0.82)",
    tintGradient: "linear-gradient(135deg, #10b981 0%, #059669 45%, #047857 80%, #064e3b 100%)",
    tintBlendMode: "color",
    bgBase: "#030d09",
    glow: "rgba(16, 185, 129, 0.45)",
    bgGradients: {
      g1: "rgba(16, 185, 129, 0.16)",
      g2: "rgba(5, 150, 105, 0.12)",
      g3: "rgba(52, 211, 153, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-emerald-900/80",
      simVia: "via-teal-800/80",
      simTo: "to-emerald-950/80",
      patchFrom: "from-emerald-700/85",
      patchVia: "via-teal-600/85",
      patchTo: "to-green-800/85",
    },
    primaryRgb: {
      50: "236 253 245",
      100: "209 250 229",
      200: "167 243 208",
      300: "110 231 183",
      400: "52 211 153",
      500: "16 185 129",
      600: "5 150 105",
      700: "4 120 87",
      800: "6 95 70",
      900: "6 78 59",
      950: "2 44 34",
    },
    voidRgb: {
      950: "3 13 9",
      900: "4 19 13",
      850: "6 26 18",
      800: "8 36 24",
      700: "11 48 32",
      600: "15 64 43",
    },
  },
  {
    id: "shurima",
    name: "Shurima",
    subtitle: "Ascended Gold",
    region: "The Sunken Empire",
    description: "Radiant golden sun disc, ancient dunes & warm amber ascension.",
    swatch: ["#f59e0b", "#fbbf24", "#0d0904"],
    bgFilter: "grayscale(100%) contrast(1.18) brightness(0.88)",
    tintGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 45%, #b45309 80%, #78350f 100%)",
    tintBlendMode: "color",
    bgBase: "#0d0904",
    glow: "rgba(245, 158, 11, 0.45)",
    bgGradients: {
      g1: "rgba(245, 158, 11, 0.16)",
      g2: "rgba(217, 119, 6, 0.12)",
      g3: "rgba(251, 191, 36, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-amber-900/80",
      simVia: "via-yellow-800/80",
      simTo: "to-amber-950/80",
      patchFrom: "from-amber-700/85",
      patchVia: "via-yellow-600/85",
      patchTo: "to-orange-800/85",
    },
    primaryRgb: {
      50: "255 251 235",
      100: "254 243 199",
      200: "253 230 138",
      300: "252 211 77",
      400: "251 191 36",
      500: "245 158 11",
      600: "217 119 6",
      700: "180 83 9",
      800: "146 64 14",
      900: "120 53 15",
      950: "69 26 3",
    },
    voidRgb: {
      950: "13 9 4",
      900: "19 13 6",
      850: "26 18 8",
      800: "36 24 10",
      700: "49 32 12",
      600: "66 42 15",
    },
  },
  {
    id: "spirit_blossom",
    name: "Spirit Blossom",
    subtitle: "Sakura Lotus",
    region: "Ionia",
    description: "Ethereal sakura petal pink, twilight magenta & spiritual petals.",
    swatch: ["#ec4899", "#f472b6", "#0d0510"],
    bgFilter: "grayscale(100%) contrast(1.18) brightness(0.88)",
    tintGradient: "linear-gradient(135deg, #ec4899 0%, #d946ef 45%, #a21caf 80%, #701a75 100%)",
    tintBlendMode: "color",
    bgBase: "#0d0510",
    glow: "rgba(236, 72, 153, 0.45)",
    bgGradients: {
      g1: "rgba(236, 72, 153, 0.16)",
      g2: "rgba(219, 39, 119, 0.12)",
      g3: "rgba(244, 114, 182, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-pink-900/80",
      simVia: "via-fuchsia-800/80",
      simTo: "to-pink-950/80",
      patchFrom: "from-pink-700/85",
      patchVia: "via-rose-600/85",
      patchTo: "to-fuchsia-800/85",
    },
    primaryRgb: {
      50: "253 242 248",
      100: "252 231 243",
      200: "251 207 232",
      300: "249 168 212",
      400: "244 114 182",
      500: "236 72 153",
      600: "219 39 119",
      700: "190 24 93",
      800: "157 23 77",
      900: "131 24 67",
      950: "80 7 36",
    },
    voidRgb: {
      950: "13 5 16",
      900: "19 7 23",
      850: "26 9 32",
      800: "36 12 43",
      700: "49 15 59",
      600: "66 19 79",
    },
  },
  {
    id: "chemtech",
    name: "Chemtech",
    subtitle: "Toxic Undercity",
    region: "Zaun",
    description: "Radioactive neon lime, chemtech smog & industrial sludge.",
    swatch: ["#84cc16", "#a3e635", "#060d04"],
    bgFilter: "grayscale(100%) contrast(1.25) brightness(0.85)",
    tintGradient: "linear-gradient(135deg, #84cc16 0%, #22c55e 45%, #15803d 80%, #14532d 100%)",
    tintBlendMode: "color",
    bgBase: "#060d04",
    glow: "rgba(132, 204, 22, 0.45)",
    bgGradients: {
      g1: "rgba(132, 204, 22, 0.16)",
      g2: "rgba(101, 163, 13, 0.12)",
      g3: "rgba(163, 230, 53, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-lime-900/80",
      simVia: "via-green-800/80",
      simTo: "to-lime-950/80",
      patchFrom: "from-lime-700/85",
      patchVia: "via-green-600/85",
      patchTo: "to-emerald-800/85",
    },
    primaryRgb: {
      50: "247 254 231",
      100: "236 252 203",
      200: "217 249 157",
      300: "190 242 100",
      400: "163 230 53",
      500: "132 204 22",
      600: "101 163 13",
      700: "77 124 15",
      800: "63 98 18",
      900: "54 83 20",
      950: "26 46 5",
    },
    voidRgb: {
      950: "6 13 4",
      900: "8 19 6",
      850: "12 26 8",
      800: "16 36 10",
      700: "22 49 14",
      600: "30 66 18",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "void";

export function getTheme(id: string | undefined): ThemeDefinition {
  const found = THEMES.find((t) => t.id === id);
  return found || THEMES[0];
}

/**
 * Apply a theme by setting CSS custom properties and data-theme on documentElement.
 */
export function applyTheme(theme: ThemeDefinition): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);

  // Set primary color scale CSS variables
  for (const [shade, rgb] of Object.entries(theme.primaryRgb)) {
    root.style.setProperty(`--theme-primary-${shade}`, rgb);
  }

  // Set void dark surface scale CSS variables
  for (const [shade, rgb] of Object.entries(theme.voidRgb)) {
    root.style.setProperty(`--theme-void-${shade}`, rgb);
  }

  // Base background and glows
  root.style.setProperty("--theme-bg-base", theme.bgBase);
  root.style.setProperty("--theme-glow", theme.glow);

  // Radial gradients
  root.style.setProperty("--theme-gradient-1", theme.bgGradients.g1);
  root.style.setProperty("--theme-gradient-2", theme.bgGradients.g2);
  root.style.setProperty("--theme-gradient-3", theme.bgGradients.g3);

  // Glass components
  root.style.setProperty(
    "--theme-glass-bg",
    `rgba(${theme.voidRgb[850].replace(/ /g, ", ")}, 0.78)`
  );
  root.style.setProperty(
    "--theme-glass-border",
    `rgba(${theme.primaryRgb[500].replace(/ /g, ", ")}, 0.16)`
  );
  root.style.setProperty(
    "--theme-glass-soft-bg",
    `rgba(${theme.voidRgb[700].replace(/ /g, ", ")}, 0.28)`
  );
  root.style.setProperty(
    "--theme-glass-soft-border",
    `rgba(${theme.primaryRgb[400].replace(/ /g, ", ")}, 0.12)`
  );
  root.style.setProperty(
    "--theme-glass-purple-bg",
    `rgba(${theme.voidRgb[800].replace(/ /g, ", ")}, 0.88)`
  );
  root.style.setProperty(
    "--theme-glass-purple-border",
    `rgba(${theme.primaryRgb[500].replace(/ /g, ", ")}, 0.35)`
  );
}
