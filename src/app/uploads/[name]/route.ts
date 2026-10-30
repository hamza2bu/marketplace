import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_UPLOAD_DIR, localUploadsEnabled } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Serves local-development uploads. Names are random and validated, so no path tricks.
export async function GET(_request: Request, ctx: RouteContext<"/uploads/[name]">) {
  const { name } = await ctx.params;
  const match = /^([a-f0-9]{32})\.(jpg|png|webp)$/.exec(name);
  if (!match || !localUploadsEnabled()) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(LOCAL_UPLOAD_DIR, name));
    return new Response(data, {
      headers: {
        "Content-Type": TYPES[match[2]],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
