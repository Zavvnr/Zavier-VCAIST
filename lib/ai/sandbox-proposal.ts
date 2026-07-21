export const sandboxSelectors = ["body", "main", "section", "nav", "h1", "h2", "h3", "p", "a", "button"] as const;
export const sandboxStyleProperties = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "padding",
  "margin",
  "border-radius",
  "max-width",
] as const;

export type SandboxSelector = (typeof sandboxSelectors)[number];
export type SandboxStyleProperty = (typeof sandboxStyleProperties)[number];

export type SandboxOperation =
  | { type: "remove_text"; target: string }
  | { type: "replace_text"; target: string; value: string }
  | { type: "set_style"; selector: SandboxSelector; property: SandboxStyleProperty; value: string };

export type SandboxProposal = {
  title: string;
  summary: string;
  operations: SandboxOperation[];
};

export type SandboxReply = {
  message: string;
  proposal: SandboxProposal | null;
};

const unsafeStyleValue = /(?:url\s*\(|javascript:|expression\s*\(|[{};])/i;

export function parseSandboxReply(output: string): SandboxReply {
  const candidate = extractJson(output);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        const message = boundedText(parsed.message, 4_000) ?? "I prepared a reviewable sandbox change.";
        return { message, proposal: validateSandboxProposal(parsed.proposal) };
      }
    } catch {
      // Provider formatting can occasionally be imperfect. Keep the conversation usable,
      // but never create a sandbox proposal from content that was not safely validated.
    }
  }

  return { message: cleanModelText(output), proposal: null };
}

export function validateSandboxProposal(value: unknown): SandboxProposal | null {
  if (!isRecord(value) || !Array.isArray(value.operations)) return null;
  const title = boundedText(value.title, 120);
  const summary = boundedText(value.summary, 500);
  if (!title || !summary || value.operations.length < 1 || value.operations.length > 8) return null;

  const operations = value.operations.flatMap((operation) => {
    const validated = validateOperation(operation);
    return validated ? [validated] : [];
  });
  if (operations.length !== value.operations.length) return null;
  return { title, summary, operations };
}

function validateOperation(value: unknown): SandboxOperation | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "remove_text") {
    const target = boundedText(value.target, 600);
    return target ? { type: "remove_text", target } : null;
  }

  if (value.type === "replace_text") {
    const target = boundedText(value.target, 600);
    const replacement = boundedText(value.value, 1_200, true);
    return target && replacement !== null ? { type: "replace_text", target, value: replacement } : null;
  }

  if (value.type === "set_style") {
    const selector = sandboxSelectors.find((candidate) => candidate === value.selector);
    const property = sandboxStyleProperties.find((candidate) => candidate === value.property);
    const styleValue = boundedText(value.value, 120);
    if (!selector || !property || !styleValue || unsafeStyleValue.test(styleValue)) return null;
    return { type: "set_style", selector, property, value: styleValue };
  }

  return null;
}

function extractJson(output: string) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  return start >= 0 && end > start ? output.slice(start, end + 1) : null;
}

function cleanModelText(output: string) {
  const cleaned = output
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
    .slice(0, 4_000);
  return cleaned || "I could not prepare a safe visual proposal from that response. Please describe the change more specifically.";
}

function boundedText(value: unknown, maximumLength: number, allowEmpty = false) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if ((!text && !allowEmpty) || text.length > maximumLength) return null;
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
