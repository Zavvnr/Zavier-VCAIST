export const preferenceStorageKey = "vcaist-preferences";

export const modelGroups = [
  {
    label: "GPT-5.6 · current generation",
    options: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", detail: "Frontier quality" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", detail: "Balanced" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", detail: "Fast and efficient" },
    ],
  },
  {
    label: "GPT-5.4 · compatibility",
    options: [
      { id: "gpt-5.4", label: "GPT-5.4", detail: "Previous frontier" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", detail: "High-volume work" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano", detail: "Simple extraction" },
    ],
  },
] as const;

export const modelOptions = modelGroups.flatMap((group) => group.options);
export type ModelId = (typeof modelOptions)[number]["id"];

export const themeOptions = [
  {
    id: "midnight-clay",
    label: "Midnight Clay",
    description: "Black canvas with warm clay and soft blue accents.",
  },
  {
    id: "midnight-sky",
    label: "Midnight Sky",
    description: "Black canvas led by clear, light-blue controls.",
  },
  {
    id: "forest-mint",
    label: "Forest Mint",
    description: "Deep evergreen surfaces with fresh mint highlights.",
  },
  {
    id: "warm-light",
    label: "Warm Light",
    description: "The original cream canvas with familiar green accents.",
  },
] as const;

export type ThemeId = (typeof themeOptions)[number]["id"];

export type Preferences = {
  model: ModelId;
  theme: ThemeId;
  autoScan: boolean;
  showTechnical: boolean;
  testBoundaries: boolean;
  plainLanguage: boolean;
};

export const defaultPreferences: Preferences = {
  model: "gpt-5.6-sol",
  theme: "midnight-clay",
  autoScan: true,
  showTechnical: false,
  testBoundaries: true,
  plainLanguage: true,
};

function isModelId(value: unknown): value is ModelId {
  return modelOptions.some((option) => option.id === value);
}

function isThemeId(value: unknown): value is ThemeId {
  return themeOptions.some((option) => option.id === value);
}

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return defaultPreferences;

  try {
    const stored = JSON.parse(window.localStorage.getItem(preferenceStorageKey) ?? "{}") as Partial<Preferences>;
    return {
      ...defaultPreferences,
      ...stored,
      model: isModelId(stored.model) ? stored.model : defaultPreferences.model,
      theme: isThemeId(stored.theme) ? stored.theme : defaultPreferences.theme,
    };
  } catch {
    window.localStorage.removeItem(preferenceStorageKey);
    return defaultPreferences;
  }
}

export function writePreferences(preferences: Preferences) {
  window.localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences));
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}
