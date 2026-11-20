// Drawing pins (hold D and drag): the lines of a drawing, as they are drawn and over its saved area, and the drawing as
// an area comment. What the lines read as comes from the draw part (draw.ts), loaded when D is first pressed.
import { zoneAnchor } from './anchoring.ts';

type P = { x: number; y: number };
type Ink = { mark: string; from?: string; to?: string; pts: number[][] };
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
  for (const pts of ink.pts) {
    const hit = path(line(pts));
    hit.setAttribute('class', 'hit');
    svg.append(path(line(pts)), hit);
  }
  return svg;
}

// The strokes as they are drawn, in page coordinates (kept that way as they come in, so a scroll mid-stroke leaves the
// part already drawn on the words it was drawn on).
export function liveInk() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ink live');
  const p = path('');
  svg.append(p);
  const strokes: P[][] = [];
  const paint = () => p.setAttribute('d', strokes.map((s) => line(s.flatMap((q) => [Math.round(q.x), Math.round(q.y)]))).join(' '));
  return { svg, strokes, paint };
}
