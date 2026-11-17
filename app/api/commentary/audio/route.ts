import { connection } from "next/server";
import { getCommentaryAudio } from "@/lib/engine/commentary";

/** MP3 for one commentary line. 204 when this line is text-only or already dropped. */
export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const audio = id ? getCommentaryAudio(id) : null;
  if (!audio) return new Response(null, { status: 204 });
  return new Response(Buffer.from(audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
