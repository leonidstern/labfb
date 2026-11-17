// Talking to this folder's lab as its agent: the `wait` / `reply` commands and the MCP server use the same call, so
// the MCP server waits in its own process (a cancel or the client going away aborts the request; nothing outlives it).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

type Server = { port: number; token: string };
type Session = Record<string, unknown>;

/** The lab serving `from` or a folder above it, from its .lab/server.json; null when none is there. */
export function findLab(from: string): { dir: string; server: Server } | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const file = path.join(dir, '.lab/server.json');
    if (fs.existsSync(file)) return { dir, server: JSON.parse(fs.readFileSync(file, 'utf8')) };
    if (path.dirname(dir) === dir) return null;
  }
}

/** A POST to the lab with its key. node:http, not fetch: a wait can outlast fetch's 5-minute header timeout. Rejects
 *  when the lab can't be reached, or when `signal` aborts (the request is dropped, so the lab sees the wait end). */
export const labCall = (server: Server, pathname: string, body: object, session: Session, signal?: AbortSignal) =>
  new Promise<{ status: number; text: string }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port: server.port, path: pathname, method: 'POST', signal,
        headers: { host: `localhost:${server.port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data),
          'x-lab-admin': server.token, 'x-lab-agent': '1', 'x-lab-session': encodeURIComponent(JSON.stringify(session)) } },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });

/** What a wait that ended without pins says, by the lab's answer. */
export const WAIT_SAID: Record<number, string> = {
  204: 'No new comments yet. Run wait again to keep listening.',
  409: 'Another session is listening now; this one stopped.',
  410: 'The page was closed, so this stopped listening. Wait again only when the person asks or opens the page.',
};
