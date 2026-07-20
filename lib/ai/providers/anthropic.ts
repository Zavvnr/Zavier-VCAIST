import { parseJson, providerFetch, requireOutput, type AiRequest, type AiResult } from "@/lib/ai/provider";

export async function generateWithAnthropic(request: AiRequest, apiKey: string): Promise<AiResult> {
  const response = await providerFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model.apiModel,
      max_tokens: 1_200,
      system: request.instructions,
      messages: request.messages.map(({ role, text }) => ({ role, content: text })),
    }),
  });
  const body = await parseJson(response);
  const output = Array.isArray(body.content)
    ? body.content.flatMap((part) => {
        if (!part || typeof part !== "object" || !("text" in part) || typeof part.text !== "string") return [];
        return [part.text];
      }).join("\n")
    : "";

  return {
    provider: "anthropic",
    model: request.model.id,
    responseId: typeof body.id === "string" ? body.id : undefined,
    output: requireOutput(output),
  };
}
