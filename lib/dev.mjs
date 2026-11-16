// Shared by local.mjs and bench/serve.mjs: the comments API without Upstash, and plain file serving.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

// api/lab-comments.mjs talks to Upstash over REST. This answers the same commands from `db`, a Map of hashes,
// and returns the API module. Call it before anything else uses fetch for that URL.
export async function apiOn(db, repo) {
  process.env.KV_REST_API_URL = 'http://lab.store';
  process.env.KV_REST_API_TOKEN = 'local';
  const hash = (k) => db.get(k) ?? (db.set(k, new Map()), db.get(k));
  const cmds = {
    HSET: (k, ...pairs) => { const h = hash(k); let added = 0; for (let i = 0; i < pairs.length; i += 2) { if (!h.has(pairs[i])) added++; h.set(pairs[i], pairs[i + 1]); } return added; },
    HGET: (k, f) => db.get(k)?.get(f) ?? null,
    HDEL: (k, ...fs) => fs.filter((f) => db.get(k)?.delete(f)).length,
    HVALS: (k) => [...(db.get(k)?.values() ?? [])],
    HLEN: (k) => db.get(k)?.size ?? 0,
    HEXISTS: (k, f) => (db.get(k)?.has(f) ? 1 : 0),
    INCR: (k) => { const v = (db.get(k) || 0) + 1; db.set(k, v); return v; },
    EXPIRE: () => 1,
    GET: (k) => (typeof db.get(k) === 'string' ? db.get(k) : null),
    SET: (k, v, ex, sec) => {
      db.set(k, String(v));
      if (/^ex$/i.test(ex || '')) setTimeout(() => db.delete(k), Number(sec) * 1000).unref();
      return 'OK';
    },
  };
  const realFetch = globalThis.fetch;
  const store = (/** @type {any} */ (apiOn).store = { calls: 0 });
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('http://lab.store')) return realFetch(url, init);
    store.calls++;
    const one = ([name, ...args]) => (cmds[name] ? { result: cmds[name](...args) } : { error: `ERR unknown ${name}` });
    // Upstash /pipeline: a list of commands, one result each.
    if (new URL(url).pathname === '/pipeline') return Response.json(JSON.parse(init.body).map(one));
    const out = one(JSON.parse(init.body));
    return Response.json(out, { status: out.error ? 400 : 200 });
  };
  return import(pathToFileURL(path.join(repo, 'api/lab-comments.mjs')).href);
}

// Runs a Node request through a Web-style handler (the API's GET / POST).
export async function callApi(fn, req, url, extraHeaders = {}) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  // Always the socket's own address: a forwarded-for header from the client would let it pick its own rate-limit key.
  headers.set('x-forwarded-for', req.socket.remoteAddress || 'unknown');
  return fn(new Request(url, { method: req.method, headers, body: /GET|HEAD/.test(req.method) ? undefined : Buffer.concat(chunks) }));
}

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// Text goes compressed when the browser takes it (brotli, else gzip), and every file carries an ETag: the browser
// keeps a copy but asks each time ("no-cache"), so a reload gets a 304 "not changed" in place of the file, and a file
// that changed is always sent fresh. (15 Nov: a page view on this lab was ~460 kB plus every picture again.)
const SQUEEZE = /^(text\/|application\/(json|javascript)|image\/svg)/;
export const encodingFor = (req) => {
  const a = String(req.headers['accept-encoding'] || '');
  return /\bbr\b/.test(a) ? 'br' : /\bgzip\b/.test(a) ? 'gzip' : '';
};
const squeeze = (buf, enc) =>
  enc === 'br' ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(buf, { level: 6 });
// The bytes and headers sendBody sends for this request, without sending them: for a body worth keeping (local.mjs
// keeps each page's comments list until the page changes, so it isn't compressed again for every request).
export function packBody(req, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const enc = buf.length > 1024 && SQUEEZE.test(headers['content-type'] || '') ? encodingFor(req) : '';
  const out = enc ? squeeze(buf, enc) : buf;
  return { out, headers: { ...headers, vary: 'accept-encoding', ...(enc ? { 'content-encoding': enc } : {}), 'content-length': out.length } };
}
// A body made for this request (a page with the widget added, the comments list): compressed when worth it.
export function sendBody(req, res, status, headers, body) {
  const { out, headers: head } = packBody(req, headers, body);
  res.writeHead(status, head);
  res.end(req.method === 'HEAD' ? undefined : out);
}
const squeezed = new Map(); // file + etag + encoding → compressed bytes, so a file is compressed once per change
let squeezedBytes = 0;
const SQUEEZED_MAX = 10e6; // at most 10 MB kept: the oldest go first (a busy evening held ~25 MB of old versions)
const keepSqueezed = (key, out) => {
  squeezed.set(key, out);
  squeezedBytes += out.length;
  for (const [k, v] of squeezed) {
    if (squeezedBytes <= SQUEEZED_MAX) break;
    squeezed.delete(k);
    squeezedBytes -= v.length;
  }
};
// One file, with byte ranges (video seeking). A bad range gets 416, never a crash.
export function sendFile(req, res, file) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const stat = fs.statSync(file);
  const size = stat.size;
  const etag = `W/"${size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', etag };
  if (req.headers['if-none-match'] === etag) return res.writeHead(304, { 'cache-control': 'no-cache', etag }).end();
  const enc = !req.headers.range && size > 1024 && size < 8e6 && SQUEEZE.test(type) ? encodingFor(req) : '';
  if (enc) {
    const key = `${file} ${etag} ${enc}`;
    let out = squeezed.get(key);
    if (!out) {
      out = squeeze(fs.readFileSync(file), enc);
      keepSqueezed(key, out);
    }
    res.writeHead(200, { ...head, vary: 'accept-encoding', 'content-encoding': enc, 'content-length': out.length });
    return res.end(req.method === 'HEAD' ? undefined : out);
  }
  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    if (range[1]) [start, end] = [+range[1], range[2] ? Math.min(+range[2], size - 1) : size - 1];
    else start = Math.max(size - +range[2], 0);
    if (start > end || start >= size) return res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
  } else res.writeHead(200, { ...head, 'content-length': size });
  if (!size) return res.end();
  fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}
