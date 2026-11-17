import { connection } from "next/server";
import { getCommentaryLine } from "@/lib/engine/commentary";

/** Latest commentator line. Audio, when present, is at /api/commentary/audio. */
export async function GET() {
  await connection();
  return Response.json(
    { ok: true, line: getCommentaryLine() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
