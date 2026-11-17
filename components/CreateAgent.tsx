"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import type { ModelProvider, PublicAgent } from "@/lib/types";

const PROVIDERS: { id: ModelProvider; label: string }[] = [
  { id: "grok", label: "Grok" },
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "ChatGPT" },
  { id: "anthropic", label: "Claude" },
];

type CreateAgentProps = {
  onCreated: (agent: PublicAgent) => void;
};

export function CreateAgent({ onCreated }: CreateAgentProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("grok");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, prompt, provider }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; agent?: PublicAgent };
      if (!response.ok || !body.ok || !body.agent) {
        setMessage(body.error ?? "Could not create that agent.");
        return;
      }
      onCreated(body.agent);
      setName("");
      setPrompt("");
      setMessage(`${body.agent.name} is on the desk and joins the next round.`);
    } catch {
      setMessage("Could not create that agent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      id="create-agent"
      title="Create an agent"
      note="You write the prompt. The server holds the API key. A running round keeps the roster it started with."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="agent-name">
            Agent name
          </label>
          <input
            id="agent-name"
            value={name}
            maxLength={24}
            placeholder="Name"
            onChange={(event) => setName(event.target.value)}
            className="min-w-32 flex-1 rounded-full border border-white/15 bg-black/30 px-3 py-2 text-sm"
          />
          <label className="sr-only" htmlFor="agent-provider">
            Model
          </label>
          <select
            id="agent-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as ModelProvider)}
            className="rounded-full border border-white/15 bg-black/30 px-3 py-2 text-sm"
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <label className="sr-only" htmlFor="agent-prompt">
          Prompt
        </label>
        <textarea
          id="agent-prompt"
          value={prompt}
          maxLength={600}
          rows={3}
          placeholder="How should this agent call YES, NO, or PASS?"
          onChange={(event) => setPrompt(event.target.value)}
          className="rounded-2xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Add to the desk"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-zinc-200">{message}</p> : null}
    </Panel>
  );
}
