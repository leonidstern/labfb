// Shared by local.mjs and bench/serve.mjs: the comments API on an in-memory store, and plain file serving.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';

/** The in-memory store: keys, each a Map of comments or a counter / string. */
type Db = Map<string, any>;
type Handler = (req: Request) => Promise<Response>;

// The comments API (lib/comments-api.mjs) keeps each page's comments in `db`, a Map of Maps (and the nonces and hourly
// counts beside them). Returns the API module.
export async function apiOn(db: Db): Promise<any> {
  // The key the lab sends with who wrote a comment (x-lab-stamp), so the API saves it in the same write.
  process.env.LAB_STAMP_KEY ||= (await import('node:crypto')).randomBytes(16).toString('hex');
  const api = await import('./comments-api.mjs');
  api.useStore(db);
  return api;
}

/** The most a request to the lab may carry. A comment is at most a few KB; the last looks have their own, larger cap. */
export const BODY_MAX = 256 * 1024;

// Runs a Node request through a Web-style handler (the API's GET / POST).
export async function callApi(fn: Handler, req: IncomingMessage, url: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) if ((size += c.length) <= BODY_MAX) chunks.push(c); // the rest is read and dropped, so the sender gets its answer
  if (size > BODY_MAX) return new Response('too big', { status: 413 });
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  // Always the socket's own address: a forwarded-for header from the client would let it pick its own rate-limit key.
  headers.set('x-forwarded-for', req.socket.remoteAddress || 'unknown');
  return fn(new Request(url, { method: req.method, headers, body: /GET|HEAD/.test(req.method || '') ? undefined : Buffer.concat(chunks) }));
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// Text goes compressed when the browser takes it (brotli, else gzip), and every file carries an ETag: the browser
// keeps a copy but asks each time ("no-cache"), so a reload gets a 304 "not changed" in place of the file, and a file
// that changed is always sent fresh. (15 Nov: a page view on this lab was ~460 kB plus every picture again.)
const SQUEEZE = /^(text\/|application\/(json|javascript)|image\/svg)/;
export const encodingFor = (req: IncomingMessage): '' | 'br' | 'gzip' => {
  const a = String(req.headers['accept-encoding'] || '');
  return /\bbr\b/.test(a) ? 'br' : /\bgzip\b/.test(a) ? 'gzip' : '';
};
const squeeze = (buf: Buffer, enc: string): Buffer =>
  enc === 'br' ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(buf, { level: 6 });
// The bytes and headers sendBody sends for this request, without sending them: for a body worth keeping (local.mjs
// keeps each page's comments list until the page changes, so it isn't compressed again for every request).
export function packBody(req: IncomingMessage, headers: OutgoingHttpHeaders, body: Buffer | string): { out: Buffer; headers: OutgoingHttpHeaders } {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const enc = buf.length > 1024 && SQUEEZE.test(String(headers['content-type'] || '')) ? encodingFor(req) : '';
  const out = enc ? squeeze(buf, enc) : buf;
  return { out, headers: { ...headers, vary: 'accept-encoding', ...(enc ? { 'content-encoding': enc } : {}), 'content-length': out.length } };
}
// A body made for this request (a page with the widget added, the comments list): compressed when worth it.
export function sendBody(req: IncomingMessage, res: ServerResponse, status: number, headers: OutgoingHttpHeaders, body: Buffer | string): void {
  const { out, headers: head } = packBody(req, headers, body);
  res.writeHead(status, head);
  res.end(req.method === 'HEAD' ? undefined : out);
}
const squeezed = new Map<string, Buffer>(); // file + etag + encoding → compressed bytes, so a file is compressed once per change
let squeezedBytes = 0;
const SQUEEZED_MAX = 10e6; // at most 10 MB kept: the oldest go first (a busy evening held ~25 MB of old versions)
const keepSqueezed = (key: string, out: Buffer) => {
  squeezed.set(key, out);
  squeezedBytes += out.length;
  for (const [k, v] of squeezed) {
    if (squeezedBytes <= SQUEEZED_MAX) break;
    squeezed.delete(k);
    squeezedBytes -= v.length;
  }
};
// One file, with byte ranges (video seeking). A bad range gets 416, never a crash.
export function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const stat = fs.statSync(file);
  const size = stat.size;
  const etag = `W/"${size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', etag };
  if (req.headers['if-none-match'] === etag) return void res.writeHead(304, { 'cache-control': 'no-cache', etag }).end();
  const enc = !req.headers.range && size > 1024 && size < 8e6 && SQUEEZE.test(type) ? encodingFor(req) : '';
  if (enc) {
    const key = `${file} ${etag} ${enc}`;
    let out = squeezed.get(key);
    if (!out) {
      out = squeeze(fs.readFileSync(file), enc);
      keepSqueezed(key, out);
    }
    res.writeHead(200, { ...head, vary: 'accept-encoding', 'content-encoding': enc, 'content-length': out.length });
    return void res.end(req.method === 'HEAD' ? undefined : out);
  }
  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    if (range[1]) [start, end] = [+range[1], range[2] ? Math.min(+range[2], size - 1) : size - 1];
    else start = Math.max(size - +range[2], 0);
    if (start > end || start >= size) return void res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
  } else res.writeHead(200, { ...head, 'content-length': size });
  if (!size) return void res.end();
  fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}
