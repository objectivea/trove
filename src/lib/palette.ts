export type RGB = [number, number, number];

/**
 * Colour names are written out rather than left as hex, because a palette a
 * client can read ("burnt clay") is worth more than one they have to decode.
 */
const NAMED: { name: string; rgb: RGB }[] = [
  { name: "raw linen", rgb: [242, 236, 227] },
  { name: "bone", rgb: [222, 214, 200] },
  { name: "ochre dust", rgb: [224, 185, 128] },
  { name: "burnt clay", rgb: [163, 115, 63] },
  { name: "terracotta", rgb: [200, 104, 60] },
  { name: "oxblood", rgb: [140, 50, 48] },
  { name: "wet stone", rgb: [109, 98, 89] },
  { name: "graphite", rgb: [58, 48, 41] },
  { name: "olive shade", rgb: [47, 64, 51] },
  { name: "sage", rgb: [127, 174, 156] },
  { name: "slate", rgb: [45, 63, 82] },
  { name: "steel", rgb: [142, 163, 180] },
  { name: "ink", rgb: [17, 17, 16] },
  { name: "chalk", rgb: [250, 250, 248] },
];

export function nameFor(rgb: RGB): string {
  let best = NAMED[0], bestD = Infinity;
  for (const c of NAMED) {
    const d = (c.rgb[0] - rgb[0]) ** 2 + (c.rgb[1] - rgb[1]) ** 2 + (c.rgb[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

export const toHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance, used for the contrast checks in the palette tool. */
export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function wcagLabel(ratio: number): "AAA" | "AA" | "AA Large" | "Fails" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fails";
}

/**
 * Median-cut quantisation over a downsampled bitmap. Runs in the browser at
 * upload time, so extracting a palette costs no API credit at all.
 */
export function quantise(pixels: RGB[], count: number): { rgb: RGB; share: number }[] {
  if (!pixels.length) return [];
  let boxes: RGB[][] = [pixels];

  while (boxes.length < count) {
    boxes.sort((a, b) => spread(b) - spread(a));
    const box = boxes.shift();
    if (!box || box.length < 2) { if (box) boxes.push(box); break; }
    const ch = widestChannel(box);
    box.sort((p, q) => p[ch] - q[ch]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }

  const total = pixels.length;
  return boxes
    .filter((b) => b.length)
    .map((b) => ({
      rgb: [0, 1, 2].map((c) => b.reduce((s, p) => s + p[c], 0) / b.length) as RGB,
      share: b.length / total,
    }))
    .sort((a, b) => b.share - a.share);
}

function channelRange(box: RGB[], c: 0 | 1 | 2): number {
  let lo = 255, hi = 0;
  for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
  return hi - lo;
}

function widestChannel(box: RGB[]): 0 | 1 | 2 {
  const r = channelRange(box, 0), g = channelRange(box, 1), b = channelRange(box, 2);
  return r >= g && r >= b ? 0 : g >= b ? 1 : 2;
}

/** Split the box that spans the most colour, weighted by how many pixels it holds. */
function spread(box: RGB[]): number {
  return channelRange(box, widestChannel(box)) * Math.log2(box.length + 1);
}
