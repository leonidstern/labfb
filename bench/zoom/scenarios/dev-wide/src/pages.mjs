// The pages a wait listens on (--pages /a,/b): page keys as the lab writes them ("/router-fixes").
export function listenPages(raw) {
  if (!raw) return null;
  return String(raw).split(',').map((p) => '/' + p.trim().replace(/^\/+/, '').replace(/\.html?$/i, '')).filter((p) => p !== '/');
}
