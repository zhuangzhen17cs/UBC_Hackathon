/** Speak one line. Returns null when the key or voice id is missing, or the request fails. */
export async function synthesizeSpeech(text: string): Promise<Uint8Array | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_COMMENTATOR?.trim();
  if (!apiKey || !voiceId) return null;

  const model = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        accept: "audio/mpeg",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 400),
        model_id: model,
        voice_settings: { stability: 0.4, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}
