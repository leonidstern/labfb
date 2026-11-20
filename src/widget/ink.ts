// Drawing pins (hold D and drag): the lines of a drawing, as they are drawn and over its saved area, and the drawing as
// an area comment. What the lines read as comes from the draw part (draw.ts), loaded when D is first pressed.
import { zoneAnchor } from './anchoring.ts';

type P = { x: number; y: number; w?: number };
type Ink = { mark: string; from?: string; to?: string; pts: number[][]; w?: number[][] };
type Read = { mark: string; from?: string; to?: string; box: { l: number; t: number; r: number; b: number }; lines: P[][] };

// The drawing as an area comment: the area (at least min each way), plus the lines as 0–1000 across and down it.
export function inkAnchor({ mark, from, to, box, lines }: Read, min: number) {
  for (const [a, b] of [['l', 'r'], ['t', 'b']] as const) {
    if (box[b] - box[a] >= min) continue;
    const mid = (box[a] + box[b]) / 2;
    [box[a], box[b]] = [mid - min / 2, mid + min / 2];
  }
  const anchor = zoneAnchor({ x0: box.l, y0: box.t, x1: box.r, y1: box.b });
  const fit = (v: number, a: number, b: number) => Math.round(((v - a) / (b - a)) * 1000);
  anchor.ink = { mark, from, to, pts: lines.map((s) => s.flatMap((p) => [fit(p.x, box.l, box.r), fit(p.y, box.t, box.b)])) };
  // The pen's width at each point, in tenths of a px (pressure with a pen, speed otherwise): Leo's pick 4, 20 Nov.
  if (lines.some((s) => s.some((p) => p.w))) anchor.ink.w = lines.map((s) => s.map((p) => Math.round((p.w || 3) * 10)));
  return anchor;
}

const NS = 'http://www.w3.org/2000/svg';
const path = (d: string) => {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  return p;
};
const line = (pts: number[]) => pts.reduce((d, v, i) => d + (i % 2 ? ` ${v}` : `${i ? 'L' : 'M'}${v}`), '');

// A drawing over its area: the lines, and a wider see-through copy of them to click (the drawing is the pin).
export function inkSvg(ink: Ink, zone: { left: number; top: number; width: number; height: number }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'ink');
  Object.assign(svg.style, { left: `${zone.left}px`, top: `${zone.top}px`, width: `${zone.width}px`, height: `${zone.height}px` });
  ink.pts.forEach((pts, n) => {
    const hit = path(line(pts));
    hit.setAttribute('class', 'hit');
    svg.append(...widths(pts, ink.w?.[n]), hit);
  });
  return svg;
}
// A line as one path, or, with widths, a path a segment so each can be as wide as the pen was there.
function widths(pts: number[], w?: number[]) {
  if (!w || w.length * 2 !== pts.length) return [path(line(pts))];
  const out: SVGPathElement[] = [];
  for (let i = 1; i < w.length; i++) {
    const p = path(line(pts.slice((i - 1) * 2, i * 2 + 2)));
    p.style.strokeWidth = `${((w[i - 1] + w[i]) / 20).toFixed(1)}px`;
    out.push(p);
  }
  return out.length ? out : [path(line(pts))];
}

// The strokes as they are drawn, in page coordinates (kept that way as they come in, so a scroll mid-stroke leaves the
// part already drawn on the words it was drawn on).
export function liveInk() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ink live');
  const strokes: P[][] = [];
  const paint = () => svg.replaceChildren(...strokes.flatMap((s) => widths(s.flatMap((q) => [Math.round(q.x), Math.round(q.y)]), s.map((q) => Math.round((q.w || 3) * 10)))));
  return { svg, strokes, paint };
}
