import { parseJson, providerFetch, requireOutput, type AiRequest, type AiResult } from "@/lib/ai/provider";

export async function generateWithGoogle(request: AiRequest, apiKey: string): Promise<AiResult> {
  const model = encodeURIComponent(request.model.apiModel);
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.instructions }] },
      contents: request.messages.map(({ role, text }) => ({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text }],
      })),
      generationConfig: { maxOutputTokens: 1_200 },
    }),
  });
  const body = await parseJson(response);
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const first = candidates[0];
  const content = first && typeof first === "object" && "content" in first ? first.content : null;
  const parts: unknown[] = content && typeof content === "object" && "parts" in content && Array.isArray(content.parts) ? content.parts : [];
  const output = parts.flatMap((part: unknown) => {
    if (!part || typeof part !== "object" || !("text" in part) || typeof part.text !== "string") return [];
    return [part.text];
  }).join("\n");

  return { provider: "google", model: request.model.id, output: requireOutput(output) };
}
