import type { ModelId } from "@/lib/preferences";

export type ProviderId = "openai" | "anthropic" | "google" | "alibaba" | "moonshot";
export type ProviderSecretName =
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "GEMINI_API_KEY"
  | "DASHSCOPE_API_KEY"
  | "MOONSHOT_API_KEY";

export type ModelRegistration = {
  id: ModelId;
  provider: ProviderId;
  apiModel: string;
  requiredSecret: ProviderSecretName;
  enabled: boolean;
};

export const modelRegistry: Record<ModelId, ModelRegistration> = {
  "gpt-5.6-luna": openAi("gpt-5.6-luna"),
  "gpt-5.6-terra": openAi("gpt-5.6-terra"),
  "gpt-5.4-mini": openAi("gpt-5.4-mini"),
  "gpt-5.4-nano": openAi("gpt-5.4-nano"),
  "claude-sonnet-5": anthropic("claude-sonnet-5", "claude-sonnet-5"),
  "gemini-3.5-flash": google("gemini-3.5-flash", "gemini-3.5-flash"),
  "qwen3.7-max": alibaba("qwen3.7-max"),
  "qwen3.7-plus": alibaba("qwen3.7-plus"),
  "kimi-k2.5": moonshot("kimi-k2.5"),
};

function openAi(id: Extract<ModelId, `gpt-${string}`>): ModelRegistration {
  return { id, provider: "openai", apiModel: id, requiredSecret: "OPENAI_API_KEY", enabled: true };
}

function anthropic(id: ModelId, apiModel: string): ModelRegistration {
  return { id, provider: "anthropic", apiModel, requiredSecret: "ANTHROPIC_API_KEY", enabled: true };
}

function google(id: ModelId, apiModel: string): ModelRegistration {
  return { id, provider: "google", apiModel, requiredSecret: "GEMINI_API_KEY", enabled: true };
}

function alibaba(id: ModelId): ModelRegistration {
  return { id, provider: "alibaba", apiModel: id, requiredSecret: "DASHSCOPE_API_KEY", enabled: true };
}

function moonshot(id: ModelId): ModelRegistration {
  return { id, provider: "moonshot", apiModel: id, requiredSecret: "MOONSHOT_API_KEY", enabled: true };
}

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && Object.hasOwn(modelRegistry, value);
}

export function getRegisteredModel(value: unknown): ModelRegistration | null {
  return isModelId(value) ? modelRegistry[value] : null;
}

export function isModelAvailable(model: ModelRegistration): boolean {
  return model.enabled && Boolean(process.env[model.requiredSecret]?.trim());
}

export function listModelAvailability() {
  return Object.values(modelRegistry).map((model) => ({
    id: model.id,
    available: isModelAvailable(model),
  }));
}
