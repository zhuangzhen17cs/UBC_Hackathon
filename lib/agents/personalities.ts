import type { ModelProvider } from "@/lib/types";

export type AgentProfile = {
  id: string;
  name: string;
  tagline: string;
  color: string;
  provider: ModelProvider;
};

/** Default callers. Player-made agents are added at runtime and are not listed here. */
export const AGENTS: readonly AgentProfile[] = [
  {
    id: "degen",
    name: "Degen",
    tagline: "Rides momentum. Almost always YES when the tape is hot.",
    color: "#fb7185",
    provider: "grok",
  },
  {
    id: "grandma",
    name: "Grandma",
    tagline: "Sits out unless the move is obvious.",
    color: "#86efac",
    provider: "gemini",
  },
  {
    id: "contrarian",
    name: "Contrarian",
    tagline: "Fades the crowd. Takes the other side of a straight-line rally.",
    color: "#60a5fa",
    provider: "openai",
  },
  {
    id: "grok",
    name: "Grok Analyst",
    tagline: "Reads the path and commits when the level is clear.",
    color: "#c4b5fd",
    provider: "grok",
  },
];

export const PROVIDER_LABEL: Record<ModelProvider, string> = {
  grok: "Grok",
  gemini: "Gemini",
  openai: "ChatGPT",
  anthropic: "Claude",
};
