// Deterministic SVG placeholder images for seed data, so development works
// offline. Real product photos are uploaded to Cloudinary (Phase 4).
// Usage: /placeholder/<seed>.svg?w=800&h=800

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

function clamp(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 16 && n <= 2400 ? n : fallback;
}

export async function GET(request: Request, ctx: RouteContext<"/placeholder/[name]">) {
  const { name } = await ctx.params;
  const seed = name.replace(/\.svg$/, "").replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "x";
  const url = new URL(request.url);
  const w = clamp(url.searchParams.get("w"), 800);
  const h = clamp(url.searchParams.get("h"), 800);

  const n = hash(seed);
  const hue = n % 360;
  const hue2 = (hue + 40 + (n >> 9) % 60) % 360;
  const initials = seed
    .split("-")
    .filter((part) => !/^\d+$/.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  const r = Math.min(w, h);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 55% 88%)"/><stop offset="1" stop-color="hsl(${hue2} 50% 72%)"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${w * 0.78}" cy="${h * 0.22}" r="${r * 0.18}" fill="hsl(${hue2} 60% 96% / .45)"/>
<circle cx="${w * 0.18}" cy="${h * 0.85}" r="${r * 0.28}" fill="hsl(${hue} 60% 40% / .12)"/>
<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif"
 font-size="${r * 0.28}" font-weight="700" fill="hsl(${hue} 40% 25% / .75)">${initials}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
