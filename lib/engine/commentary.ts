import { fallbackLine, type ArenaEvent } from "@/lib/engine/events";
import { callGrok } from "@/lib/llm/grok";
import type { CommentaryLine } from "@/lib/types";
import { synthesizeSpeech } from "@/lib/voice/elevenlabs";

type Booth = {
  line: CommentaryLine | null;
  audio: Map<string, Uint8Array>;
  busy: boolean;
  pending: ArenaEvent | null;
  notify: (() => void) | null;
};

const KEY = "__botRoyaleCommentary";

function booth(): Booth {
  const host = globalThis as typeof globalThis & { [KEY]?: Booth };
  if (!host[KEY]) {
    host[KEY] = { line: null, audio: new Map(), busy: false, pending: null, notify: null };
  }
  return host[KEY];
}

export function onCommentary(notify: () => void) {
  booth().notify = notify;
}

export function getCommentaryLine(): CommentaryLine | null {
  return booth().line;
}

export function getCommentaryAudio(id: string): Uint8Array | null {
  return booth().audio.get(id) ?? null;
}

export function resetCommentary() {
  const state = booth();
  state.line = null;
  state.pending = null;
}

/** One line at a time. A newer event replaces anything still waiting. */
export function narrate(event: ArenaEvent) {
  const state = booth();
  if (state.busy) {
    state.pending = event;
    return;
  }
  state.busy = true;
  void speak(event);
}

async function speak(event: ArenaEvent) {
  const state = booth();
  try {
    const text = await writeLine(event);
    const audio = await synthesizeSpeech(text);
    const line: CommentaryLine = {
      id: crypto.randomUUID(),
      text,
      hasAudio: audio != null && audio.byteLength > 0,
      at: new Date().toISOString(),
    };
    if (audio && audio.byteLength > 0) {
      state.audio.set(line.id, audio);
      while (state.audio.size > 6) {
        const oldest = state.audio.keys().next().value;
        if (!oldest) break;
        state.audio.delete(oldest);
      }
    }
    state.line = line;
    state.notify?.();
  } catch {
    // A failed booth must not stop the round.
  } finally {
    state.busy = false;
    const next = state.pending;
    state.pending = null;
    if (next) narrate(next);
  }
}

async function writeLine(event: ArenaEvent): Promise<string> {
  const fallback = fallbackLine(event);
  if (!process.env.XAI_API_KEY?.trim()) return fallback;
  try {
    const text = await callGrok(
      [
        {
          role: "system",
          content:
            "You are the ringside commentator for Bot Royale, a prediction-market show. Agents call YES or NO on SOL. Reply with one spoken sentence under 22 words. No hashtags, no quotes, no JSON.",
        },
        { role: "user", content: fallback },
      ],
      { timeoutMs: 8_000, temperature: 0.7 },
    );
    const cleaned = text.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
    return cleaned.slice(0, 220) || fallback;
  } catch {
    return fallback;
  }
}
