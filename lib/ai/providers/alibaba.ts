import { bearerHeaders, parseJson, providerFetch, requireOutput, type AiRequest, type AiResult } from "@/lib/ai/provider";

const defaultDashScopeBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export async function generateWithAlibaba(request: AiRequest, apiKey: string): Promise<AiResult> {
  const baseUrl = (process.env.DASHSCOPE_BASE_URL?.trim() || defaultDashScopeBaseUrl).replace(/\/$/, "");
  const response = await providerFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: bearerHeaders(apiKey),
    body: JSON.stringify({
      model: request.model.apiModel,
      messages: [
        { role: "system", content: request.instructions },
        ...request.messages.map(({ role, text }) => ({ role, content: text })),
      ],
      max_tokens: 1_200,
    }),
  });
  const body = await parseJson(response);
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0];
  const message = first && typeof first === "object" && "message" in first ? first.message : null;
  const output = message && typeof message === "object" && "content" in message ? message.content : "";

  return {
    provider: "alibaba",
    model: request.model.id,
    responseId: typeof body.id === "string" ? body.id : undefined,
    output: requireOutput(output),
  };
}
