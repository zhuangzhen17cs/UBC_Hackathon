import { LlmError, type ChatMessage } from "@/lib/llm/chat";

const DEFAULT_MODEL = "gemini-flash-lite-latest";

/** Gemini generateContent. Throws a safe LlmError when the key is missing or the call fails. */
export async function callGemini(
  messages: ChatMessage[],
  options: { timeoutMs: number; temperature: number },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new LlmError("No GEMINI_API_KEY set. Passing.");

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const user = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: options.temperature, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      },
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new LlmError("Gemini timed out. Passing.");
    throw new LlmError("Gemini request failed. Passing.");
  }

  const text = await response.text();
  if (!response.ok) throw new LlmError(`Gemini request failed (${response.status}). Passing.`);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LlmError("Gemini response was not JSON. Passing.");
  }
  const parts = (
    payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  ).candidates?.[0]?.content?.parts;
  const joined = (parts ?? []).map((part) => part.text ?? "").join("").trim();
  if (!joined) throw new LlmError("Gemini returned an empty call. Passing.");
  return joined;
}
