// Seasonal/occasion themes. Each key must match the CHECK list in supabase/app_theme.sql.
// Colors are applied as CSS variables on <html> (see applyTheme and style.css).
// Backgrounds stay light on purpose: most text in the app is dark slate, so a dark theme would break it.
export type ThemeKey = "default" | "christmas" | "halloween" | "new_year";
export type ThemeOverlay = "none" | "snow" | "confetti";

export interface ThemeDef {
  label: string;
  badge?: string;         // emoji shown at the start of the header
  header: string;         // header bar background (any CSS background value)
  background: string;     // page background color
  accent: string;         // active tab edge, focus highlights
  overlay: ThemeOverlay;  // subtle animated decoration behind the content
  preview: string;        // one-line description shown in the Dev panel
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  default: {
    label: "Default",
    header: "#e2e8f0",
    background: "#f8fafc",
    accent: "#059669",
    overlay: "none",
    preview: "The standard look",
  },
  christmas: {
    label: "Christmas",
    badge: "🎄",
    header: "linear-gradient(90deg, #fecaca 0%, #fff7ed 50%, #bbf7d0 100%)",
    background: "#f7fbf8",
    accent: "#15803d",
    overlay: "snow",
    preview: "Red and green with falling snow",
  },
  halloween: {
    label: "Halloween",
    badge: "🎃",
    header: "linear-gradient(90deg, #fed7aa 0%, #fdba74 55%, #ddd6fe 100%)",
    background: "#fffaf3",
    accent: "#ea580c",
    overlay: "none",
    preview: "Pumpkin orange fading into dusk purple",
  },
  new_year: {
    label: "New Year",
    badge: "🎆",
    header: "linear-gradient(90deg, #e0e7ff 0%, #fef3c7 100%)",
    background: "#f8f8fc",
    accent: "#7c3aed",
    overlay: "confetti",
    preview: "Indigo and gold with confetti",
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
export const isThemeKey = (v: unknown): v is ThemeKey => typeof v === "string" && v in THEMES;

// Writes the theme's tokens into CSS variables and tags <html> so CSS can react to the theme.
export function applyTheme(key: ThemeKey) {
  const t = THEMES[key] ?? THEMES.default;
  const root = document.documentElement;
  root.style.setProperty("--theme-header", t.header);
  root.style.setProperty("--theme-bg", t.background);
  root.style.setProperty("--theme-accent", t.accent);
  root.dataset.theme = key;
}
