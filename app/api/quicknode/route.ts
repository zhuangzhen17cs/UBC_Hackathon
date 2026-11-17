import { recordQuickNodePrice } from "@/lib/market/price";
import { isQuickNodeAuthorized, parseQuickNodeBody } from "@/lib/market/quicknode";

/**
 * QuickNode Streams webhook.
 *
 * Point the stream destination at:
 *   https://<public-host>/api/quicknode
 * and send header `x-bot-royale-secret: <QUICKNODE_WEBHOOK_SECRET>`
 * (a `?secret=` query param works when the dashboard cannot set headers).
 *
 * The filter should return JSON in this shape:
 *
 *   function main(payload) {
 *     const price = payload?.solUsd;
 *     if (typeof price !== "number") return null;
 *     return {
 *       price,
 *       observedAt: new Date().toISOString(),
 *     };
 *   }
 *
 * An unrecognized body is acknowledged and ignored so QuickNode does not retry.
 */
export async function POST(request: Request) {
  if (!isQuickNodeAuthorized(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized webhook. Set QUICKNODE_WEBHOOK_SECRET before exposing this route." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const price = parseQuickNodeBody(body);
  if (!price) {
    return Response.json({
      ok: true,
      accepted: false,
      message: 'No usable price. Send { "price": 72.19 }.',
    });
  }

  recordQuickNodePrice(price);
  return Response.json({
    ok: true,
    accepted: true,
    source: "quicknode",
    priceUsd: price.priceUsd,
    observedAt: price.observedAt,
  });
}
