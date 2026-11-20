// Part of the comment widget, built as its own file (public/_lab/draw.js, scripts/build-widget.mjs) that src/comments.js
// loads when D is first pressed: what a drawing reads as. Its lines are drawn by ink.ts.
// Drawing pins: hold D and drag to draw on the page instead of marking a box. The drawing is an area comment (the area
// is the box around the lines, with the words and elements in it, zoneAnchor) plus the lines themselves and what they
// read as: circled, a box, underlined, crossed out, an X, scribbled over, an arrow (where from, where it points), a
// caret (insert here) or a side line (this block). Anything else is sent as an unclear mark: the comment's words win.
// Strokes drawn while D is held make one drawing; one that starts where the last ended joins it into one line.
// The drawing is the pin: no marker, its line is what you click (comments.js).

type P = { x: number; y: number };

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const length = (s: P[]) => s.reduce((n, p, i) => (i ? n + dist(p, s[i - 1]) : 0), 0);
// The line cut to its corners (Ramer–Douglas–Peucker).
const cut = (s: P[], eps: number): P[] => {
  if (s.length < 3) return s;
  const a = s[0];
  const b = s[s.length - 1];
  const d = dist(a, b) || 1;
  let max = 0;
  let at = 0;
  for (let i = 1; i < s.length - 1; i++) {
    const h = Math.abs((b.y - a.y) * s[i].x - (b.x - a.x) * s[i].y + b.x * a.y - b.y * a.x) / d;
    if (h > max) [max, at] = [h, i];
  }
  return max <= eps ? [a, b] : [...cut(s.slice(0, at + 1), eps).slice(0, -1), ...cut(s.slice(at), eps)];
};
const turn = (a: P, b: P, c: P) => {
  const d = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
  return d > Math.PI ? 2 * Math.PI - d : d;
};
const turns = (s: P[], min: number) => s.slice(2).filter((p, i) => turn(s[i], s[i + 1], p) > min).length;
const straight = (s: P[]) => length(s) < dist(s[0], s[s.length - 1]) * 1.15;
const boxOf = (s: P[]) => {
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
};
const cross = (a: P, b: P, c: P, d: P) => {
  const side = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
};
// The letter under a point, when there is one: underlines and strikes are read against it.
const letterAt = (x: number, y: number) => {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let n: Node | undefined;
  let o = 0;
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) [n, o] = [p.offsetNode, p.offset];
  else {
    const r = document.caretRangeFromPoint?.(x, y);
    if (r) [n, o] = [r.startContainer, r.startOffset];
  }
  if (!(n instanceof Text) || !n.length) return null;
  const r = document.createRange();
  o = Math.min(o, n.length - 1);
  r.setStart(n, o);
  r.setEnd(n, o + 1);
  const b = r.getBoundingClientRect();
  return b.height && x >= b.left - 3 && x <= b.right + 3 && y >= b.top && y <= b.bottom ? b : null;
};

// How often a line turns back across (left to right, then right to left): a wave goes one way, a scribble back and forth.
const backs = (c: P[]) => {
  let n = 0;
  let dir = 0;
  for (let i = 1; i < c.length; i++) {
    const dx = c[i].x - c[i - 1].x;
    if (Math.abs(dx) < 2) continue;
    const d = Math.sign(dx);
    if (dir && d !== dir) n++;
    dir = d;
  }
  return n;
};

// What the strokes read as, and the box the comment is on (the box around them, or what an underline or side line is about).
export function readInk(strokes: P[][], say: (e: Element | null) => string | undefined) {
  // A stroke that starts where the last one ended is one line (a caret as / then \, a circle in two halves).
  const lines: P[][] = [];
  for (const s of strokes) {
    const last = lines[lines.length - 1];
    if (last && dist(last[last.length - 1], s[0]) < 14) last.push(...s);
    else lines.push([...s]);
  }
  const all = lines.flat();
  const box = boxOf(all);
  const w = box.r - box.l;
  const h = box.b - box.t;
  const diag = Math.hypot(w, h) || 1;
  const out: { mark: string; from?: P; to?: P } = { mark: `${lines.length > 1 ? `${lines.length} strokes, ` : ''}unclear mark (go by the comment's words)` };
  const [s, t] = lines;
  if (lines.length === 1) {
    const ends = dist(s[0], s[s.length - 1]);
    const c = cut(s, Math.max(3, diag * 0.06));
    if (ends < diag * 0.3 && length(s) > diag * 1.8) out.mark = c.length >= 4 && c.length <= 7 && turns(c, 1.1) >= 3 ? 'box drawn around it' : 'circled';
    // Cut finer for a low band, or a short word's small waves are cut away and it reads as an arrow (sims, 20 Nov).
    else if (turns(cut(s, Math.min(6, Math.max(2, h / 3))), 1) >= 4 && w > 40 && h < Math.max(18, w * 0.2) && backs(cut(s, 6)) <= 1) {
      // A wavy underline: small waves along a flat band that only goes one way across (a scribble goes back and forth).
      out.mark = 'wavy underline (likely: wrong / check this)';
      for (let up = 4; up <= 18; up += 4) {
        const above = letterAt((box.l + box.r) / 2, (box.t + box.b) / 2 - up);
        if (above) {
          box.t = above.top;
          break;
        }
      }
    } else if (turns(cut(s, 6), 1) >= 4) out.mark = 'scribbled over (likely: remove this)';
    else if (straight(s) && h < 18 && w > 24) {
      const y = (box.t + box.b) / 2;
      const mid = (box.l + box.r) / 2;
      const on = letterAt(mid, y);
      if (on && y > on.top + on.height * 0.25 && y < on.bottom - on.height * 0.2) {
        out.mark = 'crossed out (likely: remove this)';
        [box.t, box.b] = [on.top, on.bottom];
      } else {
        out.mark = 'underlined';
        for (let up = 4; up <= 18; up += 4) {
          const above = letterAt(mid, y - up);
          if (above) {
            box.t = above.top;
            break;
          }
        }
      }
    } else if (straight(s) && w < 18 && h > 24) {
      out.mark = 'side line (about this block)';
      // The block beside it, on whichever side holds words.
      for (const dx of [24, -24]) {
        const e = document.elementsFromPoint(box.l + dx, (box.t + box.b) / 2).find((n) => !n.closest('[data-lab-comments]'))?.getBoundingClientRect();
        if (e && e.width < innerWidth * 0.95) {
          [box.l, box.r] = [Math.min(box.l, e.left), Math.max(box.r, e.right)];
          break;
        }
      }
    } else if (c.length === 3 && c[1].y < Math.min(c[0].y, c[2].y) - h * 0.6 && Math.abs(c[0].y - c[2].y) < h * 0.4 && w < 90) {
      out.mark = 'caret (insert here)';
      out.to = c[1];
    } else {
      // An arrow, its head drawn in the same stroke or not: the tip is the first sharp turn near the end.
      let tip = s[s.length - 1];
      let run = 0;
      const total = length(c);
      for (let i = 1; i < c.length - 1; i++) {
        run += dist(c[i], c[i - 1]);
        if (run > total * 0.55 && turn(c[i - 1], c[i], c[i + 1]) > 2) {
          tip = c[i];
          break;
        }
      }
      Object.assign(out, { mark: 'arrow', from: s[0], to: tip });
    }
  } else if (lines.length === 2) {
    const [ls, lt] = [length(s), length(t)];
    if (straight(s) && straight(t) && cross(s[0], s[s.length - 1], t[0], t[t.length - 1]) && Math.min(ls, lt) > Math.max(ls, lt) * 0.5) out.mark = 'X drawn over it (likely: remove this)';
    else if (lt < ls * 0.5 && dist(t[0], s[s.length - 1]) < Math.max(30, lt)) Object.assign(out, { mark: 'arrow', from: s[0], to: s[s.length - 1] });
  }
  // What is under a point on the page itself: labit's own bars and layers (data-lab-comments) are skipped (sims, 20 Nov:
  // an arrow's start read as the section bar).
  const at = (p?: P) => p && say(document.elementsFromPoint(p.x, p.y).find((e) => !e.closest('[data-lab-comments]')) || null);
  return { mark: out.mark, from: at(out.from), to: at(out.to), box, lines: strokes.map((q) => cut(q, 1.5).slice(0, 80)) };
}

