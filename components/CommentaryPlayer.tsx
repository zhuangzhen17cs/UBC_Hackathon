"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/Panel";
import type { CommentaryLine } from "@/lib/types";

type CommentaryPlayerProps = {
  line: CommentaryLine | null;
};

export function CommentaryPlayer({ line }: CommentaryPlayerProps) {
  const [queue, setQueue] = useState<CommentaryLine[]>([]);
  const [active, setActive] = useState<CommentaryLine | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const playing = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (line && !seen.includes(line.id)) {
    setSeen((current) => (current.includes(line.id) ? current : [...current, line.id]));
    setQueue((current) => (current.some((item) => item.id === line.id) ? current : [...current, line]));
  }

  useEffect(() => {
    const next = queue[0];
    if (!next || playing.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || playing.current) return;
      playing.current = true;
      void run(next);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };

    async function run(item: CommentaryLine) {
      setActive(item);
      setBlocked(false);
      if (item.hasAudio) {
        const audio = new Audio(`/api/commentary/audio?id=${encodeURIComponent(item.id)}`);
        audioRef.current = audio;
        const started = await audio.play().then(
          () => true,
          () => false,
        );
        if (!started) setBlocked(true);
        else await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2800));
      }
      playing.current = false;
      setQueue((current) => current.filter((entry) => entry.id !== item.id));
    }
  }, [queue]);

  async function replay() {
    if (!active?.hasAudio) return;
    const audio = audioRef.current ?? new Audio(`/api/commentary/audio?id=${encodeURIComponent(active.id)}`);
    audioRef.current = audio;
    const started = await audio.play().then(
      () => true,
      () => false,
    );
    setBlocked(!started);
  }

  const shown = active ?? line;

  return (
    <Panel
      id="commentary"
      title="Commentary"
      note="Grok writes the line when a key is set. ElevenLabs speaks it when a commentator voice is set."
    >
      <p className="min-h-12 text-sm text-zinc-200" aria-live="polite">
        {shown ? shown.text : "The commentator is quiet."}
      </p>
      {blocked && active?.hasAudio ? (
        <button type="button" className="mt-3 rounded-full border border-white/15 px-3 py-1 text-sm" onClick={() => void replay()}>
          Play commentary
        </button>
      ) : null}
    </Panel>
  );
}
