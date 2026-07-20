import { bearerHeaders, parseJson, providerFetch, requireOutput, type AiRequest, type AiResult } from "@/lib/ai/provider";

export async function generateWithOpenAi(request: AiRequest, apiKey: string): Promise<AiResult> {
  const response = await providerFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: bearerHeaders(apiKey),
    body: JSON.stringify({
      model: request.model.apiModel,
      instructions: request.instructions,
      input: request.messages.map(({ role, text }) => ({ role, content: text })),
      max_output_tokens: 1_200,
    }),
  });
  const body = await parseJson(response);
  const output = typeof body.output_text === "string"
    ? body.output_text
    : extractResponseText(body.output);

  return {
    provider: "openai",
    model: request.model.id,
    responseId: typeof body.id === "string" ? body.id : undefined,
    output: requireOutput(output),
  };
}

function extractResponseText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) return [];
    return (item.content as unknown[]).flatMap((part: unknown) => {
      if (!part || typeof part !== "object" || !("text" in part) || typeof part.text !== "string") return [];
      return [part.text];
    });
  }).join("\n");
}
