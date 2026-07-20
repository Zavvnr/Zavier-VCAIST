import { getRegisteredModel, isModelAvailable } from "@/lib/ai/model-registry";
import { ModelUnavailableError, type AiRequest, type AiResult, type ConversationMessage } from "@/lib/ai/provider";
import { generateWithAlibaba } from "@/lib/ai/providers/alibaba";
import { generateWithAnthropic } from "@/lib/ai/providers/anthropic";
import { generateWithGoogle } from "@/lib/ai/providers/google";
import { generateWithMoonshot } from "@/lib/ai/providers/moonshot";
import { generateWithOpenAi } from "@/lib/ai/providers/openai";

export async function generateModelReply({
  modelId,
  instructions,
  messages,
}: {
  modelId: unknown;
  instructions: string;
  messages: ConversationMessage[];
}): Promise<AiResult> {
  const model = getRegisteredModel(modelId);
  if (!model || !isModelAvailable(model)) throw new ModelUnavailableError();

  const apiKey = process.env[model.requiredSecret]?.trim();
  if (!apiKey) throw new ModelUnavailableError();
  const request: AiRequest = { model, instructions, messages };

  switch (model.provider) {
    case "openai": return generateWithOpenAi(request, apiKey);
    case "anthropic": return generateWithAnthropic(request, apiKey);
    case "google": return generateWithGoogle(request, apiKey);
    case "alibaba": return generateWithAlibaba(request, apiKey);
    case "moonshot": return generateWithMoonshot(request, apiKey);
  }
}
