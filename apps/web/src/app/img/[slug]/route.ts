import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Deterministic SVG artwork for a product slug — no external assets needed.
 * A string hash drives the composition (hue tint toward teal, shape positions)
 * so every slug renders a distinct but consistent image.
 */

const WIDTH = 1200;
const HEIGHT = 900;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random generator seeded by the slug hash. */
function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSvg(slug: string): string {
  const hash = hashString(slug);
  const random = makeRandom(hash);

  // Teal intensity derived from the hash (still inside the palette).
  const tealOpacity = 0.14 + random() * 0.18;
  const glowX = 220 + Math.floor(random() * 760);
  const glowY = 120 + Math.floor(random() * 420);
  const glowRadius = 380 + Math.floor(random() * 220);

  // Abstract "product" shapes: a circle plus rounded bars.
  const circleX = 780 + Math.floor(random() * 240);
  const circleY = 260 + Math.floor(random() * 220);
  const circleR = 110 + Math.floor(random() * 70);
  const barWidth = 320 + Math.floor(random() * 200);
  const barHeight = 26 + Math.floor(random() * 18);
  const barGap = barHeight + 26;
  const barX = 140 + Math.floor(random() * 120);
  const barY = 520 + Math.floor(random() * 80);
  const initial = escapeXml((slug.trim()[0] ?? 'V').toUpperCase());
  const rotated = -18 + Math.floor(random() * 36);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Product artwork">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#12264a"/>
      <stop offset="1" stop-color="#071226"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#14a898" stop-opacity="${tealOpacity.toFixed(3)}"/>
      <stop offset="1" stop-color="#14a898" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3cc2b1" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#3cc2b1" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="${glowX}" cy="${glowY}" r="${glowRadius}" fill="url(#glow)"/>
  <g transform="rotate(${rotated} ${circleX} ${circleY})">
    <circle cx="${circleX}" cy="${circleY}" r="${circleR}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
    <circle cx="${circleX}" cy="${circleY}" r="${circleR * 0.62}" fill="#ffffff" fill-opacity="0.06"/>
  </g>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="#ffffff" fill-opacity="0.10"/>
  <rect x="${barX}" y="${barY + barGap}" width="${Math.round(barWidth * 0.72)}" height="${barHeight}" rx="${barHeight / 2}" fill="url(#accent)"/>
  <rect x="${barX}" y="${barY + barGap * 2}" width="${Math.round(barWidth * 0.45)}" height="${barHeight}" rx="${barHeight / 2}" fill="#ffffff" fill-opacity="0.07"/>
  <text x="${WIDTH - 96}" y="${HEIGHT - 84}" text-anchor="end" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="260" font-weight="300" fill="#ffffff" fill-opacity="0.07">${initial}</text>
</svg>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const svg = generateSvg(slug);
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
