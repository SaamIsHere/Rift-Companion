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
    id: "piltover",
    name: "Piltover",
    subtitle: "Hextech Arcana",
    region: "Piltover",
    description: "Deep royal sapphire & hextech cobalt blue with polished metal tones.",
    swatch: ["#2563eb", "#60a5fa", "#030816"],
    bgFilter: "grayscale(100%) contrast(1.22) brightness(0.85)",
    tintGradient: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #1e40af 80%, #0f172a 100%)",
    tintBlendMode: "color",
    bgBase: "#030816",
    glow: "rgba(37, 99, 235, 0.48)",
    bgGradients: {
      g1: "rgba(37, 99, 235, 0.16)",
      g2: "rgba(29, 78, 216, 0.12)",
      g3: "rgba(96, 165, 250, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-blue-900/80",
      simVia: "via-indigo-800/80",
      simTo: "to-blue-950/80",
      patchFrom: "from-blue-800/85",
      patchVia: "via-blue-700/85",
      patchTo: "to-indigo-900/85",
    },
    primaryRgb: {
      50: "239 246 255",
      100: "219 234 254",
      200: "191 219 254",
      300: "147 197 253",
      400: "96 165 250",
      500: "37 99 235",
      600: "29 78 216",
      700: "30 64 175",
      800: "30 58 138",
      900: "23 37 84",
      950: "15 23 42",
    },
    voidRgb: {
      950: "3 7 18",
      900: "5 12 28",
      850: "7 16 38",
      800: "10 22 52",
      700: "15 32 72",
      600: "20 44 98",
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
    description: "Luminous true ice cyan, arctic auroras & frosted abyssal blue.",
    swatch: ["#38bdf8", "#bae6fd", "#030a17"],
    bgFilter: "grayscale(100%) contrast(1.15) brightness(1.02)",
    tintGradient: "linear-gradient(135deg, #7dd3fc 0%, #38bdf8 45%, #0284c7 80%, #075985 100%)",
    tintBlendMode: "color",
    bgBase: "#030a17",
    glow: "rgba(56, 189, 248, 0.52)",
    bgGradients: {
      g1: "rgba(56, 189, 248, 0.18)",
      g2: "rgba(2, 132, 199, 0.14)",
      g3: "rgba(125, 211, 252, 0.10)",
    },
    buttonGradient: {
      simFrom: "from-sky-900/80",
      simVia: "via-sky-800/80",
      simTo: "to-blue-950/80",
      patchFrom: "from-sky-600/85",
      patchVia: "via-sky-500/85",
      patchTo: "to-cyan-700/85",
    },
    primaryRgb: {
      50: "240 249 255",
      100: "224 242 254",
      200: "186 230 253",
      300: "125 211 252",
      400: "94 209 255",
      500: "56 189 248",
      600: "14 165 233",
      700: "2 132 199",
      800: "3 105 161",
      900: "7 89 133",
      950: "12 74 110",
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
    subtitle: "Sun & Sand",
    region: "The Desert Empire",
    description: "Sun-drenched golden dunes, warm natural desert sand & celestial ascension.",
    swatch: ["#dfb15b", "#f3e1b7", "#0d0a04"],
    bgFilter: "grayscale(100%) contrast(1.15) brightness(0.92)",
    tintGradient: "linear-gradient(135deg, #f5e4bd 0%, #dfb15b 35%, #be8d3e 68%, #78531d 100%)",
    tintBlendMode: "color",
    bgBase: "#0d0a04",
    glow: "rgba(223, 177, 91, 0.44)",
    bgGradients: {
      g1: "rgba(223, 177, 91, 0.16)",
      g2: "rgba(190, 141, 62, 0.12)",
      g3: "rgba(243, 225, 183, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-amber-950/80",
      simVia: "via-amber-900/65",
      simTo: "to-stone-950/85",
      patchFrom: "from-amber-600/80",
      patchVia: "via-amber-500/80",
      patchTo: "to-amber-700/85",
    },
    primaryRgb: {
      50: "254 251 243",
      100: "250 243 226",
      200: "245 230 196",
      300: "236 210 156",
      400: "226 191 120",
      500: "216 170 85",
      600: "186 138 60",
      700: "152 108 42",
      800: "122 84 32",
      900: "96 64 24",
      950: "56 35 12",
    },
    voidRgb: {
      950: "13 10 5",
      900: "19 15 7",
      850: "27 21 9",
      800: "37 28 12",
      700: "50 38 16",
      600: "68 52 21",
    },
  },
  {
    id: "ionia",
    name: "Ionia",
    subtitle: "Sakura Blossom",
    region: "Ionia",
    description: "Delicate cherry blossom petal pink, gentle sakura bloom & spiritual peace.",
    swatch: ["#ffb7c5", "#ffd1dc", "#120609"],
    bgFilter: "grayscale(100%) contrast(1.12) brightness(0.92)",
    tintGradient: "linear-gradient(135deg, #fff0f3 0%, #ffd1dc 25%, #ffb7c5 55%, #e88a9e 82%, #9f4156 100%)",
    tintBlendMode: "color",
    bgBase: "#120609",
    glow: "rgba(255, 183, 197, 0.48)",
    bgGradients: {
      g1: "rgba(255, 183, 197, 0.16)",
      g2: "rgba(255, 209, 220, 0.12)",
      g3: "rgba(255, 183, 197, 0.08)",
    },
    buttonGradient: {
      simFrom: "from-rose-950/75",
      simVia: "via-rose-900/60",
      simTo: "to-pink-950/80",
      patchFrom: "from-rose-300/80",
      patchVia: "via-pink-200/80",
      patchTo: "to-rose-400/80",
    },
    primaryRgb: {
      50: "255 248 250",
      100: "255 238 242",
      200: "255 218 226",
      300: "255 198 209",
      400: "255 183 197",
      500: "244 148 166",
      600: "218 116 137",
      700: "184 86 107",
      800: "150 63 81",
      900: "115 45 60",
      950: "65 20 30",
    },
    voidRgb: {
      950: "13 6 8",
      900: "19 8 12",
      850: "26 11 16",
      800: "36 15 22",
      700: "48 20 29",
      600: "65 26 39",
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
  if (id === "hextech") id = "piltover";
  if (id === "spirit_blossom") id = "ionia";
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
    `rgba(${theme.voidRgb[850].replace(/ /g, ", ")}, 0.48)`
  );
  root.style.setProperty(
    "--theme-glass-border",
    `rgba(${theme.primaryRgb[500].replace(/ /g, ", ")}, 0.16)`
  );
  root.style.setProperty(
    "--theme-glass-soft-bg",
    `rgba(${theme.voidRgb[700].replace(/ /g, ", ")}, 0.18)`
  );
  root.style.setProperty(
    "--theme-glass-soft-border",
    `rgba(${theme.primaryRgb[400].replace(/ /g, ", ")}, 0.12)`
  );
  root.style.setProperty(
    "--theme-glass-purple-bg",
    `rgba(${theme.voidRgb[800].replace(/ /g, ", ")}, 0.55)`
  );
  root.style.setProperty(
    "--theme-glass-purple-border",
    `rgba(${theme.primaryRgb[500].replace(/ /g, ", ")}, 0.35)`
  );
}
