import { AGENTS } from "@/lib/agents/personalities";
import { AGENT_VOICES } from "@/lib/agents/voices";
import type { ModelProvider, PublicAgent } from "@/lib/types";

export type StoredAgent = {
  id: string;
  name: string;
  tagline: string;
  color: string;
  provider: ModelProvider;
  prompt: string;
  temperature: number;
  custom: boolean;
};

const KEY = "__botRoyaleAgents";
const PROVIDERS = new Set<ModelProvider>(["grok", "gemini", "openai", "anthropic"]);
const COLORS = ["#f9a8d4", "#fcd34d", "#67e8f9", "#fdba74", "#a5b4fc", "#fca5a5"];
const MAX_CUSTOM = 8;

function seed(): StoredAgent[] {
  return AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    tagline: agent.tagline,
    color: agent.color,
    provider: agent.provider,
    prompt: AGENT_VOICES[agent.id]?.prompt ?? "Call YES, NO, or PASS on the market.",
    temperature: AGENT_VOICES[agent.id]?.temperature ?? 0.4,
    custom: false,
  }));
}

function roster(): StoredAgent[] {
  const host = globalThis as typeof globalThis & { [KEY]?: StoredAgent[] };
  if (!host[KEY]) host[KEY] = seed();
  return host[KEY];
}

export function listAgents(): PublicAgent[] {
  return roster().map(publish);
}

export function getAgent(id: string): StoredAgent | null {
  return roster().find((agent) => agent.id === id) ?? null;
}

export function createAgent(input: {
  name: string;
  prompt: string;
  provider: string;
}): { ok: true; agent: PublicAgent } | { ok: false; error: string } {
  const name = input.name.replace(/\s+/g, " ").trim();
  const prompt = input.prompt.replace(/\s+/g, " ").trim();
  const provider = input.provider.trim().toLowerCase();
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Name must be 2 to 24 characters." };
  if (prompt.length < 20 || prompt.length > 600) {
    return { ok: false, error: "Prompt must be 20 to 600 characters." };
  }
  if (!PROVIDERS.has(provider as ModelProvider)) {
    return { ok: false, error: "Pick Grok, Gemini, ChatGPT, or Claude." };
  }
  const agents = roster();
  if (agents.filter((agent) => agent.custom).length >= MAX_CUSTOM) {
    return { ok: false, error: "The desk is full. Eight custom agents is the limit." };
  }
  if (agents.some((agent) => agent.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "An agent already uses that name." };
  }

  const agent: StoredAgent = {
    id: uniqueId(name, agents),
    name,
    tagline: prompt.slice(0, 90),
    color: COLORS[agents.length % COLORS.length] ?? "#e4e4e7",
    provider: provider as ModelProvider,
    prompt,
    temperature: 0.4,
    custom: true,
  };
  agents.push(agent);
  return { ok: true, agent: publish(agent) };
}

function uniqueId(name: string, agents: readonly StoredAgent[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "agent";
  let id = base;
  const suffix = Math.random().toString(36).slice(2, 6);
  if (agents.some((agent) => agent.id === id)) id = `${base}-${suffix}`;
  return id.slice(0, 32);
}

function publish(agent: StoredAgent): PublicAgent {
  return {
    id: agent.id,
    name: agent.name,
    tagline: agent.tagline,
    color: agent.color,
    provider: agent.provider,
    custom: agent.custom,
  };
}
