export const preferenceStorageKey = "vcaist-preferences";

export const modelGroups = [
  {
    label: "Balanced · capable without frontier pricing",
    menuLabel: "Balanced",
    options: [
      {
        id: "gpt-5.6-luna",
        label: "GPT-5.6 Luna",
        provider: "OpenAI",
        price: "$1 / $6",
        menuPrice: "$1 / $6",
        detail: "Recommended default",
        verdict: "A strong cost-conscious default for page explanations and change planning.",
        recommended: true,
      },
      {
        id: "qwen3.7-max",
        label: "Qwen3.7 Max",
        provider: "Alibaba Cloud",
        price: "$1.65 / $4.951 global list",
        menuPrice: "$1.65 / $4.951",
        detail: "Qwen flagship reasoning",
        verdict: "Higher capability without the output pricing of frontier models.",
        recommended: false,
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        provider: "Anthropic",
        price: "$2 / $10 intro · $3 / $15 Sep 1",
        menuPrice: "$2 / $10",
        detail: "Strong conversational planning",
        verdict: "A capable option for nuanced change discussions during its introductory window.",
        recommended: false,
      },
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6 Terra",
        provider: "OpenAI",
        price: "$2.50 / $15",
        menuPrice: "$2.50 / $15",
        detail: "Balanced OpenAI",
        verdict: "Use when the efficient default needs more reasoning depth.",
        recommended: false,
      },
      {
        id: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        provider: "Google",
        price: "$1.50 / $9 standard",
        menuPrice: "$1.50 / $9",
        detail: "Fast coding loops",
        verdict: "A fast, lower-cost alternative for repeated planning conversations.",
        recommended: false,
      },
    ],
  },
  {
    label: "Efficient · lowest-cost supported choices",
    menuLabel: "Efficient",
    options: [
      {
        id: "qwen3.7-plus",
        label: "Qwen3.7 Plus",
        provider: "Alibaba Cloud",
        price: "$0.276 / $1.101 global list",
        menuPrice: "$0.276 / $1.101",
        detail: "Lowest-cost workhorse",
        verdict: "A low-cost global model for straightforward explanations and extraction.",
        recommended: false,
      },
      {
        id: "kimi-k2.5",
        label: "Kimi K2.5",
        provider: "Moonshot AI",
        price: "$0.60 / $3 cache-miss input",
        menuPrice: "$0.60 / $3",
        detail: "Affordable long context",
        verdict: "A cost-conscious Moonshot option for page-level planning.",
        recommended: false,
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 mini",
        provider: "OpenAI",
        price: "$0.75 / $4.50",
        menuPrice: "$0.75 / $4.50",
        detail: "High-volume work",
        verdict: "Useful when throughput matters more than nuance.",
        recommended: false,
      },
      {
        id: "gpt-5.4-nano",
        label: "GPT-5.4 nano",
        provider: "OpenAI",
        price: "$0.20 / $1.25",
        menuPrice: "$0.20 / $1.25",
        detail: "Simple extraction",
        verdict: "Best reserved for small, well-structured tasks.",
        recommended: false,
      },
    ],
  },
] as const;

export const modelOptions = [
  ...modelGroups[0].options,
  ...modelGroups[1].options,
] as const;
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
  model: "gpt-5.6-luna",
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
