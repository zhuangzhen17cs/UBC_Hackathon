import { timingSafeEqual } from "node:crypto";
import { extractUsdPrice } from "@/lib/market/price";

function isLocalHost(host: string): boolean {
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export type QuickNodePriceInput = {
  priceUsd: number;
  observedAt: string;
};

/**
 * Shared-secret check for the Streams webhook.
 * With no secret configured, only localhost is accepted, so a tunnel cannot
 * accept unsigned prices by accident.
 */
export function isQuickNodeAuthorized(request: Request): boolean {
  const expected = process.env.QUICKNODE_WEBHOOK_SECRET?.trim() ?? "";
  const provided =
    request.headers.get("x-bot-royale-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  if (!expected) {
    return isLocalHost(request.headers.get("host") ?? "");
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length === 0 || providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function onePrice(body: unknown): QuickNodePriceInput | null {
  const priceUsd = extractUsdPrice(body);
  if (priceUsd == null || !body || typeof body !== "object" || Array.isArray(body)) return null;

  const observedAtRaw = (body as { observedAt?: unknown }).observedAt;
  const observedAt =
    typeof observedAtRaw === "string" && !Number.isNaN(Date.parse(observedAtRaw))
      ? new Date(observedAtRaw).toISOString()
      : new Date().toISOString();

  return { priceUsd, observedAt };
}

/**
 * Accepts `{ "price": 72.19, "observedAt": "..." }` or an array of those objects.
 * `priceUsd` and `solUsd` are aliases. Returns null when nothing usable is present.
 */
export function parseQuickNodeBody(body: unknown): QuickNodePriceInput | null {
  if (Array.isArray(body)) {
    for (let index = body.length - 1; index >= 0; index -= 1) {
      const price = onePrice(body[index]);
      if (price) return price;
    }
    return null;
  }
  return onePrice(body);
}
