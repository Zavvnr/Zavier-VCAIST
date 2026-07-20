import type { ModelRegistration, ProviderId } from "@/lib/ai/model-registry";

export type ConversationMessage = {
  role: "assistant" | "user";
  text: string;
};

export type AiRequest = {
  model: ModelRegistration;
  instructions: string;
  messages: ConversationMessage[];
};

export type AiResult = {
  provider: ProviderId;
  model: string;
  responseId?: string;
  output: string;
};

export class ModelUnavailableError extends Error {
  constructor() {
    super("The selected model could not complete the request.");
    this.name = "ModelUnavailableError";
  }
}

const providerTimeoutMs = 45_000;

export async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new ModelUnavailableError();
    return response;
  } catch (error) {
    if (error instanceof ModelUnavailableError) throw error;
    throw new ModelUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new ModelUnavailableError();
  }
}

export function requireOutput(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ModelUnavailableError();
  return value.trim();
}

export function bearerHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}
