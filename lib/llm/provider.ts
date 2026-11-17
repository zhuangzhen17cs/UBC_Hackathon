import { completeChat, LlmError, type ChatMessage } from "@/lib/llm/chat";
import { callGemini } from "@/lib/llm/gemini";
import { callGrok } from "@/lib/llm/grok";
import type { ModelProvider } from "@/lib/types";

type ModelCall = {
  messages: ChatMessage[];
  timeoutMs: number;
  temperature: number;
};

const COMPATIBLE_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

/** One provider per agent. Grok, Gemini, ChatGPT, and Claude each use their own key. */
export async function callByProvider(provider: ModelProvider, options: ModelCall): Promise<string> {
  if (provider === "grok") return callGrok(options.messages, options);
  if (provider === "gemini") return callGemini(options.messages, options);
  if (provider === "openai") return callOpenAI(options);
  return callClaude(options);
}

/**
 * Legacy switch for LLM_PROVIDER. Prefer callByProvider so each agent picks its own model.
 */
export async function callAgentModel(options: ModelCall): Promise<string> {
  const provider = (process.env.LLM_PROVIDER?.trim() || "xai").toLowerCase();
  if (provider === "xai") return callGrok(options.messages, options);
  if (provider === "anthropic") return callAnthropic(options);
  const defaults = COMPATIBLE_DEFAULTS[provider];
  if (!defaults) throw new LlmError(`Unknown LLM_PROVIDER "${provider}". Holding.`);
  return callCompatible(provider, defaults, options);
}

async function callOpenAI(options: ModelCall): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  if (!apiKey) throw new LlmError("No OPENAI_API_KEY set. Passing.");
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  return completeChat({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    model,
    messages: options.messages,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    label: "ChatGPT",
  });
}

async function callCompatible(
  provider: string,
  defaults: { baseUrl: string; model: string },
  options: ModelCall,
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) throw new LlmError(`No LLM_API_KEY set for ${provider}. Holding.`);
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || defaults.baseUrl).replace(/\/$/, "");
  const model = process.env.LLM_MODEL?.trim() || defaults.model;
  return completeChat({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    model,
    messages: options.messages,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    label: "Model",
  });
}

async function callClaude(options: ModelCall): Promise<string> {
  return callAnthropic(options);
}

async function callAnthropic(options: ModelCall): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  if (!apiKey) throw new LlmError("No ANTHROPIC_API_KEY set. Passing.");

  const system = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const user = options.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "claude-sonnet-4-5",
        max_tokens: 400,
        temperature: options.temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError("Model timed out. Holding.");
    }
    throw new LlmError("Model request failed. Holding.");
  }

  const text = await response.text();
  if (!response.ok) throw new LlmError(`Model request failed (${response.status}). Holding.`);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LlmError("Model response was not JSON. Holding.");
  }
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new LlmError("Model returned an empty decision. Holding.");
  const joined = content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      return String((part as { text: unknown }).text);
    })
    .join("");
  if (!joined.trim()) throw new LlmError("Model returned an empty decision. Holding.");
  return joined;
}
