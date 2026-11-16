// The lab in front of a dev server (--proxy, or a project whose dev server it found). Loaded by local.mjs only then:
// a folder of pages is served from disk and never reads it.
// Pages pass through with the widget added; everything else (scripts, images, the dev server's own live reload
// over a websocket) goes through untouched.
import http from 'node:http';
import net from 'node:net';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import type { Duplex } from 'node:stream';

export type ProxyOptions = {
  PROXY: URL;
  origin: () => string;
  widget: (key: string, admin: boolean) => string;
  keyFor: (page: string) => string;
  isLoopback: (req: IncomingMessage) => boolean;
};

// PROXY: the dev server's URL. origin(): the lab's own address, known once it listens. widget(page, admin): the
// script tag that goes into a page. keyFor and isLoopback: the lab's own, so pages get the same keys either way.
// Returns page(req, res, url) for requests and upgrade(req, socket, head) for websockets; who may connect at all
// is checked in local.mjs before either is called.
export function proxy({ PROXY, origin: originNow, widget, keyFor, isLoopback }: ProxyOptions) {
  const pageKey = (pathname: string) => keyFor(pathname.replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '') || 'index');
  function proxyTo(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const origin = originNow();
    // Only a page load is asked for uncompressed HTML (the widget goes into it); scripts and styles stay compressed.
    const page = req.method === 'GET' && (req.headers['sec-fetch-dest'] === 'document' || /text\/html/.test(req.headers.accept || ''));
    const headers: OutgoingHttpHeaders = { ...req.headers, host: PROXY.host, ...(page ? { 'accept-encoding': 'identity' } : {}) };
    if (headers.origin) headers.origin = PROXY.origin;
    if (headers.referer) headers.referer = PROXY.origin + new URL(String(headers.referer), origin).pathname;
    const up = http.request({ hostname: PROXY.hostname, port: PROXY.port || 80, path: url.pathname + url.search, method: req.method, headers }, (r) => {
      const encoded = r.headers['content-encoding'] && r.headers['content-encoding'] !== 'identity';
      const html = /text\/html/i.test(r.headers['content-type'] || '') && req.method === 'GET' && !encoded;
      if (!html) {
        res.writeHead(r.statusCode || 502, r.headers);
        return void r.pipe(res);
      }
      const out = { ...r.headers, 'cache-control': 'no-store' };
      delete out['content-length'];
      delete out['content-encoding'];
      delete out['content-security-policy']; // it would block the widget's script
      res.writeHead(r.statusCode || 502, out);
      // Streamed through as it arrives (Next, Astro and React stream their pages), so nothing waits for the end.
      // The widget's script goes after the page; a copy of it the page already loads is taken out, even when its
      // tag comes split across two pieces: an unfinished <script tag is held back until the next piece.
      const strip = (t: string) => t.replace(/<script\b[^>]*\bsrc=["'][^"']*\/_lab\/comments\.js["'][^>]*>\s*<\/script>\s*/gi, '');
      const decoder = new TextDecoder();
      let held = '';
      r.on('data', (chunk: Buffer) => {
        const t = held + decoder.decode(chunk, { stream: true });
        const lower = t.toLowerCase();
        const script = lower.lastIndexOf('<script');
        const tag = t.lastIndexOf('<');
        // Hold back an unfinished <script>…</script>, or any tag not closed yet; send the rest now.
        const cut = script !== -1 && lower.indexOf('</script>', script) === -1 ? script : tag > t.lastIndexOf('>') ? tag : t.length;
        res.write(strip(t.slice(0, cut)));
        held = t.slice(cut);
      });
      r.on('end', () => res.end(strip(held + decoder.decode()) + widget(pageKey(url.pathname), isLoopback(req))));
      r.on('error', () => res.destroy());
    });
    up.on('error', (e: NodeJS.ErrnoException) => {
      if (res.headersSent) return void res.destroy();
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end(`[lab] no answer from the dev server at ${PROXY.origin} (${e.code}). Start it, then reload.`);
    });
    req.pipe(up);
  }
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const up = net.connect(Number(PROXY.port) || 80, PROXY.hostname, () => {
      const lines: string[] = [];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const [k, v] = [req.rawHeaders[i], req.rawHeaders[i + 1]];
        lines.push(`${k}: ${/^host$/i.test(k) ? PROXY.host : /^origin$/i.test(k) ? PROXY.origin : v}`);
      }
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  }
  return { page: proxyTo, upgrade };
}
