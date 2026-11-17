import { completeChat, LlmError, type ChatMessage } from "@/lib/llm/chat";

const DEFAULT_MODEL = "grok-4.7";
const DEFAULT_BASE_URL = "https://api.x.ai/v1";

export async function callGrok(
  messages: ChatMessage[],
  options: { timeoutMs: number; temperature: number },
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new LlmError("No XAI_API_KEY set. Holding.");

  const baseUrl = (process.env.XAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.XAI_MODEL?.trim() || DEFAULT_MODEL;

  return completeChat({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    model,
    messages,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    label: "Grok",
  });
}
