import { getLatestPrice } from "@/lib/market/price";

/**
 * Live SOL/USD quote.
 * Reading the request keeps this route dynamic under Cache Components,
 * so a build never freezes one price into the response.
 */
export async function GET(request: Request) {
  void request.headers;

  const quote = await getLatestPrice();
  return Response.json(quote, {
    headers: { "Cache-Control": "no-store" },
  });
}
