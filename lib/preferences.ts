export const preferenceStorageKey = "vcaist-preferences";

export const modelGroups = [
  {
    label: "Frontier · capable, usually overkill",
    menuLabel: "Frontier",
    options: [
      {
        id: "gpt-5.5-pro",
        label: "GPT-5.5 Pro",
        provider: "OpenAI",
        price: "$30 / $180",
        menuPrice: "$30 / $180",
        detail: "Maximum-cost precision",
        verdict: "Not recommended for routine constant extraction.",
        recommended: false,
      },
      {
        id: "claude-fable-5",
        label: "Claude Fable 5",
        provider: "Anthropic",
        price: "$10 / $50",
        menuPrice: "$10 / $50",
        detail: "Long-horizon coding",
        verdict: "Powerful, but excessive for a short project scan.",
        recommended: false,
      },
      {
        id: "gpt-5.6-sol",
        label: "GPT-5.6 Sol",
        provider: "OpenAI",
        price: "$5 / $30",
        menuPrice: "$5 / $30",
        detail: "OpenAI frontier",
        verdict: "Use when a difficult extraction needs escalation.",
        recommended: false,
      },
      {
        id: "claude-opus-4.8",
        label: "Claude Opus 4.8",
        provider: "Anthropic",
        price: "$5 / $25",
        menuPrice: "$5 / $25",
        detail: "Escalation target",
        verdict: "A strong fallback when workhorse extraction wobbles.",
        recommended: false,
      },
      {
        id: "qwen3.7-max",
        label: "Qwen3.7 Max",
        provider: "Alibaba Cloud",
        price: "$1.65 / $4.951 global list",
        menuPrice: "$1.65 / $4.951",
        detail: "Qwen flagship reasoning",
        verdict: "A high-capability Qwen option at unusually low list pricing.",
        recommended: false,
      },
    ],
  },
  {
    label: "Workhorse · recommended for VCAIST",
    menuLabel: "Workhorse",
    options: [
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        provider: "Anthropic",
        price: "$2 / $10 intro · $3 / $15 Sep 1",
        menuPrice: "$2 / $10",
        detail: "Recommended",
        verdict: "Best fit for routine project extraction.",
        recommended: true,
      },
      {
        id: "gemini-3.1-pro",
        label: "Gemini 3.1 Pro",
        provider: "Google",
        price: "$2 / $12 · $4 / $18 >200K",
        menuPrice: "$2 / $12",
        detail: "Long-context reasoning",
        verdict: "A price-aggressive workhorse for larger contexts.",
        recommended: false,
      },
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6 Terra",
        provider: "OpenAI",
        price: "$2.50 / $15",
        menuPrice: "$2.50 / $15",
        detail: "Balanced OpenAI",
        verdict: "A strong general-purpose alternative.",
        recommended: false,
      },
      {
        id: "gpt-5.4",
        label: "GPT-5.4",
        provider: "OpenAI",
        price: "$2.50 / $15",
        menuPrice: "$2.50 / $15",
        detail: "Proven compatibility",
        verdict: "An older, stable option on the current price sheet.",
        recommended: false,
      },
      {
        id: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        provider: "Google",
        price: "$1.50 / $9 standard",
        menuPrice: "$1.50 / $9",
        detail: "Fast coding loops",
        verdict: "Fast and coding-oriented; batch pricing can be lower.",
        recommended: false,
      },
      {
        id: "kimi-k2.7-code",
        label: "Kimi K2.7 Code",
        provider: "Moonshot AI",
        price: "$0.95 / $4 · cache-miss input",
        menuPrice: "$0.95 / $4",
        detail: "Agentic coding",
        verdict: "A low-cost coding specialist with a 256K context window.",
        recommended: false,
      },
      {
        id: "qwen3.7-plus",
        label: "Qwen3.7 Plus",
        provider: "Alibaba Cloud",
        price: "$0.276 / $1.101 global list",
        menuPrice: "$0.276 / $1.101",
        detail: "Value workhorse",
        verdict: "A low-cost global workhorse for general extraction.",
        recommended: false,
      },
    ],
  },
  {
    label: "Efficient · high-volume and simple work",
    menuLabel: "Efficient",
    options: [
      {
        id: "gpt-5.6-luna",
        label: "GPT-5.6 Luna",
        provider: "OpenAI",
        price: "$1 / $6",
        menuPrice: "$1 / $6",
        detail: "Current efficient model",
        verdict: "A practical option for repeated, lower-complexity scans.",
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
  ...modelGroups[2].options,
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
  model: "claude-sonnet-5",
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
