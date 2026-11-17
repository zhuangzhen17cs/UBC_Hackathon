export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    side: { type: "string", enum: ["YES", "NO", "PASS"] },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["side", "confidence", "reason"],
  additionalProperties: false,
} as const;

type ChatRequest = {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  timeoutMs: number;
  /** Used in fallback reasons. "Grok" or "Model". */
  label: string;
};

function safeDetail(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\s+/g, " ").trim().slice(0, 140);
}

function readContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      return String((part as { text: unknown }).text);
    })
    .join("");
  return text || null;
}

function failureMessage(label: string, status: number, detail: string): string {
  if (status === 401) return `${label} rejected the API key. Holding.`;
  if (status === 429) {
    if (/credit|quota/i.test(detail)) return `${label} has no API credits left. Passing.`;
    return `${label} rate limited. Passing.`;
  }
  const extra = detail ? ` ${detail}` : "";
  return `${label} request failed (${status}).${extra}`.slice(0, 180);
}

async function postChat(request: ChatRequest, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError(`${request.label} timed out. Holding.`);
    }
    throw new LlmError(`${request.label} request failed. Holding.`);
  }

  const text = await response.text();
  if (!response.ok) {
    return { ok: false as const, status: response.status, detail: safeDetail(text) };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false as const, status: response.status, detail: "Response was not JSON." };
  }

  const content = readContent(payload);
  if (!content?.trim()) {
    return { ok: false as const, status: response.status, detail: "Empty model response." };
  }
  return { ok: true as const, content };
}

/**
 * OpenAI-compatible chat call. Asks for a strict decision schema, then retries
 * once with plain JSON mode if the server rejects the schema.
 */
export async function completeChat(request: ChatRequest): Promise<string> {
  const base = {
    model: request.model,
    messages: request.messages,
    max_completion_tokens: 800,
  };
  const strict = await postChat(request, {
    ...base,
    temperature: request.temperature,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "agent_decision",
        strict: true,
        schema: DECISION_SCHEMA,
      },
    },
  });
  if (strict.ok) return strict.content;
  if (strict.status !== 400) {
    throw new LlmError(failureMessage(request.label, strict.status, strict.detail));
  }

  const loose = await postChat(request, {
    ...base,
    response_format: { type: "json_object" },
  });
  if (loose.ok) return loose.content;
  throw new LlmError(failureMessage(request.label, loose.status, loose.detail));
}
