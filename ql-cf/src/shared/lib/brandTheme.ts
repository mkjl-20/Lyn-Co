export const BRAND_THEMES = {
  monochrome: {
    label: "Black, white & gray (default)",
    ink: "#262626",
    porcelain: "#f7f7f7",
    canvas: "#f3f3f3",
    surface: "#ffffff",
    surfaceSoft: "#ededed",
    border: "#d8d8d8",
    mist: "#d8d8d8",
    muted: "#666666",
    accent: "#262626",
    accentSoft: "#ededed",
    sage: "#b8b8b8",
    sageLight: "#f0f0f0",
    clay: "#505050",
    clayLight: "#eeeeee",
    gold: "#686868",
    goldLight: "#eeeeee",
  },
  rose: {
    label: "Soft rose",
    ink: "#403a36",
    porcelain: "#faf7f2",
    canvas: "#f8f5f0",
    surface: "#fffdf9",
    surfaceSoft: "#f5f0e9",
    border: "#e8dfd4",
    mist: "#e8dfd4",
    muted: "#746a61",
    accent: "#a55070",
    accentSoft: "#f6e7ec",
    sage: "#d9a6b7",
    sageLight: "#f7edf0",
    clay: "#8f4059",
    clayLight: "#faedf0",
    gold: "#c49a72",
    goldLight: "#fbf2e9",
  },
  sage: {
    label: "Calm sage",
    ink: "#303b34",
    porcelain: "#f7faf7",
    canvas: "#f2f6f2",
    surface: "#fcfefc",
    surfaceSoft: "#eaf1eb",
    border: "#d9e4da",
    mist: "#d9e4da",
    muted: "#657267",
    accent: "#3f705b",
    accentSoft: "#eaf3ee",
    sage: "#a9c5b4",
    sageLight: "#edf5f0",
    clay: "#765446",
    clayLight: "#f3eae6",
    gold: "#a07c4d",
    goldLight: "#f6f0e5",
  },
  ocean: {
    label: "Coastal blue",
    ink: "#303b42",
    porcelain: "#f6f9fb",
    canvas: "#f0f5f8",
    surface: "#fcfeff",
    surfaceSoft: "#eaf1f5",
    border: "#d7e2e9",
    mist: "#d7e2e9",
    muted: "#63727a",
    accent: "#356783",
    accentSoft: "#eaf3f8",
    sage: "#a4c6d8",
    sageLight: "#eef6fa",
    clay: "#80574d",
    clayLight: "#f5ece9",
    gold: "#957343",
    goldLight: "#f5f0e5",
  },
  plum: {
    label: "Gentle plum",
    ink: "#3a3540",
    porcelain: "#f9f7fa",
    canvas: "#f4f1f6",
    surface: "#fefcff",
    surfaceSoft: "#f0ebf3",
    border: "#e1d9e8",
    mist: "#e1d9e8",
    muted: "#716878",
    accent: "#715387",
    accentSoft: "#f2ecf6",
    sage: "#c0add0",
    sageLight: "#f5f0f8",
    clay: "#80505c",
    clayLight: "#f5e9ec",
    gold: "#93734b",
    goldLight: "#f5f0e6",
  },
  lavender: {
    label: "Lavender",
    ink: "#37333d",
    porcelain: "#faf8fc",
    canvas: "#f5f2f8",
    surface: "#fefcff",
    surfaceSoft: "#eeeaf3",
    border: "#ddd5e7",
    mist: "#ddd5e7",
    muted: "#6d6575",
    accent: "#70558c",
    accentSoft: "#f0eaf6",
    sage: "#b9a8ce",
    sageLight: "#f2edf7",
    clay: "#805868",
    clayLight: "#f5eaef",
    gold: "#90754e",
    goldLight: "#f5f0e6",
  },
  forest: {
    label: "Forest green",
    ink: "#303b34",
    porcelain: "#f6f9f6",
    canvas: "#f0f5f0",
    surface: "#fcfefc",
    surfaceSoft: "#e6eee7",
    border: "#d2e0d5",
    mist: "#d2e0d5",
    muted: "#5f6d62",
    accent: "#315d42",
    accentSoft: "#e6f0e8",
    sage: "#9dbca4",
    sageLight: "#eaf3ec",
    clay: "#765044",
    clayLight: "#f3e9e5",
    gold: "#947746",
    goldLight: "#f5f0e4",
  },
  midnight: {
    label: "Midnight blue",
    ink: "#303744",
    porcelain: "#f7f8fb",
    canvas: "#f1f3f8",
    surface: "#fdfdff",
    surfaceSoft: "#e8ebf2",
    border: "#d6dbe6",
    mist: "#d6dbe6",
    muted: "#626a78",
    accent: "#3d527c",
    accentSoft: "#e9eef8",
    sage: "#a9b8d2",
    sageLight: "#edf1f8",
    clay: "#805b58",
    clayLight: "#f4ecea",
    gold: "#927849",
    goldLight: "#f5f1e7",
  },
} as const;

export type BrandTheme = keyof typeof BRAND_THEMES;

export function isBrandTheme(value: unknown): value is BrandTheme {
  return typeof value === "string" && Object.hasOwn(BRAND_THEMES, value);
}

export function applyBrandTheme(theme: BrandTheme) {
  const palette = BRAND_THEMES[theme];
  const root = document.documentElement;
  root.style.setProperty("--color-ink", palette.ink);
  root.style.setProperty("--color-porcelain", palette.porcelain);
  root.style.setProperty("--app-canvas", palette.canvas);
  root.style.setProperty("--app-surface", palette.surface);
  root.style.setProperty("--app-surface-soft", palette.surfaceSoft);
  root.style.setProperty("--app-border", palette.border);
  root.style.setProperty("--color-mist", palette.mist);
  root.style.setProperty("--app-ink-muted", palette.muted);
  root.style.setProperty("--app-accent", palette.accent);
  root.style.setProperty("--app-accent-soft", palette.accentSoft);
  root.style.setProperty("--color-sage", palette.sage);
  root.style.setProperty("--color-sage-light", palette.sageLight);
  root.style.setProperty("--color-sage-deep", palette.accent);
  root.style.setProperty("--color-clay", palette.clay);
  root.style.setProperty("--color-clay-light", palette.clayLight);
  root.style.setProperty("--color-gold", palette.gold);
  root.style.setProperty("--color-gold-light", palette.goldLight);
}
