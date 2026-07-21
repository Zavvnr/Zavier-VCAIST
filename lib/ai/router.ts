import { getRegisteredModel, isModelAvailable, type ModelRegistration } from "@/lib/ai/model-registry";
import { ModelUnavailableError, type AiRequest, type AiResult, type ConversationMessage } from "@/lib/ai/provider";
import { generateWithAlibaba } from "@/lib/ai/providers/alibaba";
import { generateWithAnthropic } from "@/lib/ai/providers/anthropic";
import { generateWithGoogle } from "@/lib/ai/providers/google";
import { generateWithMoonshot } from "@/lib/ai/providers/moonshot";
import { generateWithOpenAi } from "@/lib/ai/providers/openai";
import type { ModelId } from "@/lib/preferences";

const fallbackModelIds: readonly ModelId[] = [
  "gpt-5.6-luna",
  "gemini-3.5-flash",
  "qwen3.7-plus",
  "claude-sonnet-5",
  "kimi-k2.5",
];

export async function generateModelReply({
  modelId,
  instructions,
  messages,
}: {
  modelId: unknown;
  instructions: string;
  messages: ConversationMessage[];
}): Promise<AiResult> {
  const requestedModel = getRegisteredModel(modelId);
  if (!requestedModel) throw new ModelUnavailableError();

  const candidateIds = [requestedModel.id, ...fallbackModelIds.filter((id) => id !== requestedModel.id)];
  const candidates = candidateIds
    .map((id) => getRegisteredModel(id))
    .filter((model): model is ModelRegistration => Boolean(model && isModelAvailable(model)))
    .slice(0, 3);

  for (const model of candidates) {
    const apiKey = process.env[model.requiredSecret]?.trim();
    if (!apiKey) continue;

    try {
      const result = await generateRegisteredModel({ model, instructions, messages }, apiKey);
      return model.id === requestedModel.id ? result : { ...result, fallbackFrom: requestedModel.id };
    } catch (error) {
      if (!(error instanceof ModelUnavailableError)) throw error;
    }
  }

  throw new ModelUnavailableError();
}

function generateRegisteredModel(request: AiRequest, apiKey: string) {
  const model = request.model;

  switch (model.provider) {
    case "openai": return generateWithOpenAi(request, apiKey);
    case "anthropic": return generateWithAnthropic(request, apiKey);
    case "google": return generateWithGoogle(request, apiKey);
    case "alibaba": return generateWithAlibaba(request, apiKey);
    case "moonshot": return generateWithMoonshot(request, apiKey);
  }
}
