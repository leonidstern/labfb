// The board's camera: cam = { x, y, z }, screen = (world + cam) * z, world = screen / z - cam (the view's top-left is at
// world (-x, -y)). Zoom about a point keeps the world point under it still. Pure functions: nothing here touches the page.
export type Cam = { x: number; y: number; z: number };
export type Box = { x: number; y: number; w: number; h: number };
const MAX_Z = 4;
const PAD = 96; // room left round everything when it is all fitted into the view

const extent = (b: Box[]) => {
  const lo = { x: Math.min(...b.map((f) => f.x)), y: Math.min(...b.map((f) => f.y)) };
  return { ...lo, w: Math.max(...b.map((f) => f.x + f.w)) - lo.x, h: Math.max(...b.map((f) => f.y + f.h)) - lo.y };
};
/** The zoom that fits all of them with room round, never above 100%. */
const fitZ = (b: Box[], v: { w: number; h: number }) => {
  if (!b.length) return 1;
  const e = extent(b);
  return Math.min(1, (v.w - PAD) / e.w, (v.h - PAD) / e.h);
};
const minZ = (b: Box[], v: { w: number; h: number }) => Math.min(fitZ(b, v), 1) * 0.999;
export const fitAll = (b: Box[], v: { w: number; h: number }): Cam => {
  if (!b.length) return { x: 0, y: 0, z: 1 };
  const e = extent(b);
  const z = fitZ(b, v);
  return { z, x: v.w / 2 / z - (e.x + e.w / 2), y: v.h / 2 / z - (e.y + e.h / 2) };
};
// Finite edges: with margin m = view / 2 / z each axis is held to -(lo + len) - m + view / z <= cam <= -lo + m; when the
// content plus margin is smaller than the view the axis centres.
const hold = (c: number, lo: number, len: number, view: number, z: number) => {
  const m = view / 2 / z;
  const [min, max] = [-(lo + len) - m + view / z, -lo + m];
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, c));
};
export const clamp = (c: Cam, b: Box[], v: { w: number; h: number }): Cam => {
  if (!b.length) return c;
  const z = Math.min(MAX_Z, Math.max(minZ(b, v), c.z));
  const e = extent(b);
  return { z, x: hold(c.x, e.x, e.w, v.w, z), y: hold(c.y, e.y, e.h, v.h, z) };
};
export const panBy = (c: Cam, dx: number, dy: number): Cam => ({ ...c, x: c.x + dx / c.z, y: c.y + dy / c.z });
/** Zoom to z2 with the world point under screen (sx, sy) staying there: cam' = s / z' - (s / z - cam). */
export const zoomAt = (c: Cam, sx: number, sy: number, z2: number, b: Box[], v: { w: number; h: number }): Cam => {
  const z = Math.min(MAX_Z, Math.max(minZ(b, v), z2));
  return { z, x: sx / z - (sx / c.z - c.x), y: sy / z - (sy / c.z - c.y) };
};
