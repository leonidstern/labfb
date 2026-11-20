// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { pillLine } from './list.ts';

import { aroundMorph } from './trial.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindLive(w: unknown) {
  W = w;
}
export const MARK_PATHS = '<g transform="translate(-1 -.5)" fill="currentColor">' +
  '<path class="e1" d="M18.9 24.67L24.4 3h11.5L31.28 21.2A22.8 22.8 0 0 0 18.9 24.67Z"/>' +
  '<path class="e2" d="M37.07 22.02L41.9 3h11.5L47.1 27.85A22.8 22.8 0 0 0 37.07 22.02Z"/>' +
  '<path d="M31 26a18 18 0 0 1 18 18 18 18 0 0 1-18 18H15.57a2.57 2.57 0 0 1-2.57-2.57V44A18 18 0 0 1 31 26Z"/>' +
  '<circle class="eye" cx="31" cy="45" r="6.2"/></g>';
const span = (t: string, className = '') => Object.assign(document.createElement('span'), { textContent: t, className });

// Local mode (local.mjs sets data-live): one event stream for all of a lab's tabs (see startLive), so many tabs
// don't use up the browser's connections. The page reloads when its files change, keeping the scroll position, and the
// comments refresh when someone else, like an agent, changes them. A label says which Claude session listens.
export function startLive() {
  if (W.script?.dataset.live) {
    // sessionStorage is shared by every frame of a tab: a board's frames of one page each keep their own (the board names them).
    const key = 'lab-scroll:' + (window.name.startsWith('lab:') ? window.name + ':' : '') + location.pathname;
    try {
      // The scroll position and the open thread come back after a reload, so an answer shows where you left it.
      const kept = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (kept !== null) {
        sessionStorage.removeItem(key);
        if (kept.open) W.S.openId = kept.open;
        if (kept.chat) W.S.chatOpen = true;
        addEventListener('load', () => scrollTo(0, +(kept.y ?? kept)));
      }
    } catch {}
    // Hold a reload while anything is open (a thread, a new comment) or a box has focus or text: the page
    // reloads once you close it, where you were.
    // A newer version reloads the page when it's safe: not while you read a thread or the chat (it waits
    // until they're closed, so nothing moves under you), type, have words in a box, place a new comment, have a phone's
    // keyboard up or have just touched the page.
    let touchedAt = 0;
    for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, () => (touchedAt = performance.now()), { capture: true, passive: true });
    const frame = Boolean(W.S.frame); // a board's frame (frame.ts): the board holds the stream and says when it is busy
    // A board page (its key is /_board/<name>) holds its frames, which name the files it "uses": a save of a page, a .json
    // or anything else is the frames' to follow (they patch or reload themselves), never the board's. It still reloads
    // for a new widget script or comments schema, and follows the lab's comments and the board file.
    const board = Boolean(W.S.board); // exactly /_board/<name>: a variant opened by itself is a page like any other
    const busy = () =>
      frame ? W.S.busy() || performance.now() - touchedAt < 1500 : W.S.draft || W.S.grabbing || W.S.openId || W.S.chatOpen || (W.coarse && /^(textarea|input)$/.test(W.root.activeElement?.localName || '')) ||
      [...W.root.querySelectorAll('textarea')].some((t) => t.value.trim()) || performance.now() - touchedAt < 1500;
    let reloadWhenShown = false;
    let reloadTimer: any = 0;
    // A held reload is invisible otherwise: the page sits old while you read, then jumps the moment you close the
    // thread. A "!" on the labit mark says one is ready (owner, 19 Nov: "move it to rabbit status"), and a tap on the
    // mark takes it now. Where no mark shows (no agent news yet, a phone before its chat button got the mark), the ⋯
    // button carries it. The badge floats over its corner, so nothing moves when it comes or goes.
    const upd = Object.assign(document.createElement('span'), { className: 'upd', textContent: '!', hidden: true });
    upd.setAttribute('aria-hidden', 'true');
    let held = false;
    let updOn: HTMLElement | null = null;
    const UPD_LABEL = 'update waiting, tap to load';
    const shows = (n: Element | null) => Boolean(n && !(n as HTMLElement).hidden && n.getClientRects().length);
    const showUpd = (on: boolean) => {
      held = on;
      if (!on) {
        upd.hidden = true;
        if (updOn) {
          const was = updOn.dataset.updLabel;
          if (was) updOn.setAttribute('aria-label', was);
          else updOn.removeAttribute('aria-label');
          delete updOn.dataset.updLabel;
          updOn.classList.remove('has-upd');
        }
        updOn = null;
        return;
      }
      const markOn = W.coarse ? W.chatBtn : who;
      const host: HTMLElement = shows(markOn) && markOn.querySelector('.mark') ? markOn : W.root.querySelector('.more');
      if (!host) return;
      if (updOn !== host) {
        showUpd(false);
        held = true;
        updOn = host;
        host.dataset.updLabel = host.getAttribute('aria-label') || '';
        host.setAttribute('aria-label', UPD_LABEL);
        host.classList.add('has-upd');
        host.append(upd);
      }
      upd.hidden = false;
      // On the mark's top right corner (or the ⋯'s), measured, so the badge sits on the mark wherever it is.
      const m = host.querySelector('.mark') || host;
      const hr = host.getBoundingClientRect();
      const mr = m.getBoundingClientRect();
      Object.assign(upd.style, { left: `${mr.right - hr.left - 6}px`, top: `${mr.top - hr.top - 6}px` });
    };
    const take = (e: Event) => {
      if (!held || e.currentTarget !== updOn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearTimeout(reloadTimer);
      reloadTimer = 0;
      now();
    };
    const now = () => {
      try {
        sessionStorage.setItem(key, JSON.stringify({ y: scrollY, open: W.S.openId, chat: W.S.chatOpen }));
      } catch {}
      location.reload();
    };
    const reload = () => {
      // A tab in the background doesn't reload on every save: it reloads once, when you come back to it.
      if (document.hidden) return void (reloadWhenShown = true);
      if (busy()) {
        showUpd(true);
        if (!reloadTimer) reloadTimer = setTimeout(() => ((reloadTimer = 0), reload()), 500); // one waiting reload, not one per message
        return;
      }
      showUpd(false);
      now();
    };
    const who = document.createElement('a');
    who.className = 'listener';
    // The labit mark, in place of the old dot: our pin as a head, two slabs as ears (the cut for small sizes: a wider
    // gap and a bigger dot, so neither closes up at 16 px). Its parts are separate so the styles can move them: the
    // dot blinks now and then while an agent listens, the ears twitch while one works. The words sit in .lbl, so
    // changing them never rebuilds (and restarts) the mark.
    const MARK = '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">' + MARK_PATHS + '</svg>';
    who.innerHTML = MARK + '<div class="lbl"></div>';
    const lbl = who.querySelector('.lbl') as HTMLElement;
    // The pill's label, kept aside while it says "update waiting" (the "!" badge) and put back after.
    const whoLabel = (t: string) => (updOn === who ? (who.dataset.updLabel = t) : who.setAttribute('aria-label', t));
    who.hidden = true;
    W.root.querySelector('.left').prepend(who);
    // Capture, so a tap that takes the update never also opens the chat, the ⋯ menu or the session's link.
    for (const n of [who, W.chatBtn, W.root.querySelector('.more')]) n?.addEventListener('click', take, { capture: true });
    // Files a save can mean for this page: the page itself, anything it loads, and data it may fetch as it runs.
    // Everything else -- a README, another page's script, the project's own server code -- leaves it alone.
    const FETCHED = /\.(json|wasm|csv|tsv|xml|txt|map|woff2?)$/i;
    const tidy = (u) => decodeURIComponent(u).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '');
    const usedHere = (p) => {
      if (tidy(location.pathname) === tidy(p) || FETCHED.test(p)) return true;
      for (const n of document.querySelectorAll('script[src], link[href], iframe[src], object[data], embed[src]')) {
        if (W.host.contains(n)) continue;
        const v = n.getAttribute('src') || n.getAttribute('href') || n.getAttribute('data');
        if (v && samePath(v.split('#')[0], [p])) return true;
      }
      return false;
    };
    // A page with no tab icon of its own gets labit's: only in a local lab (this block), only when the page names
    // none and the project serves no /favicon.ico (a dev server may answer any path with its HTML, so the type counts).
    if (!frame && !board && !document.querySelector('link[rel~="icon"]')) {
      fetch('/favicon.ico', { method: 'HEAD' })
        .then((r) => r.ok && (r.headers.get('content-type') || '').startsWith('image/'))
        .catch(() => false)
        .then((has) => {
          if (has || document.querySelector('link[rel~="icon"]')) return;
          document.head.append(Object.assign(document.createElement('link'), { rel: 'icon', href: '/_lab/favicon.svg' }));
        });
    }
    let stream = null;
    let beat = 0;
    // The pill is the mark, and a badge when there is one to give: how many pins wait, or "!" when the agent went quiet
    // (Leo, 20 Nov: "lets try this", icon only). Its words open over the pill while the pointer is on it (the .w box, out of
    // the flow, so nothing beside it moves): "talking to Claude", the status line, "no update for 6 min · last: …". The words
    // stay in the pill's label for screen readers and the tooltip. From the lab's state (mode, agent) and the agent's work
    // on this page (list.ts pillLine).
    let pill = null;
    const show = (parts: (string | Node)[], n = '', warn = false) => {
      const sig = [...parts.map((x) => (typeof x === 'string' ? x : x.textContent)), n, warn].join('|');
      if (lbl.dataset.sig === sig) return;
      lbl.dataset.sig = sig;
      const w = span('', 'w');
      w.dataset.n = n;
      w.append(...parts);
      lbl.replaceChildren(w);
      who.classList.toggle('warn', warn);
      if (n) who.dataset.n = n;
      else delete who.dataset.n;
    };
    // What a screen reader and the tooltip get: the words, and the count the badge shows.
    const said = () => (lbl.textContent || '') + (who.dataset.n && who.dataset.n !== '!' ? ` · ${who.dataset.n} waiting` : '');
    const paintWho = () => {
      if (!pill) return;
      const { mode, agent, away } = pill;
      const { text, stale, waiting } = mode === 'working' ? pillLine() : { text: '', stale: false, waiting: 0 };
      const n = stale ? '!' : waiting ? String(waiting) : '';
      show(mode === 'listening' ? [span('talking to'), ` ${agent}`] : mode === 'quiet' ? [agent, span(" isn't answering")] : mode === 'working' ? (text ? [span(text + (stale && waiting ? ` · ${waiting} waiting` : ''))] : [agent, span(' is working')]) : [span(away)], n, stale);
      whoLabel(said());
    };
    W.paintWho = paintWho;
    // The status pill says "reconnecting" while the live connection is down; the next message puts it right.
    // A dropped connection isn't "nobody listening": the badge keeps its last state, faded, and says reconnecting
    // (Leo, 18 Nov: the black rabbit came and went at random, from these).
    const showAway = (word) => {
      pill = null; // the pill's own words are not painted over it until the next state
      lbl.dataset.sig = '';
      show([span(word)]);
      whoLabel(word);
      who.classList.add('stale');
      W.chatBtn.classList.add('stale');
      if (!who.classList.contains('working') && !last) who.classList.add('idle');
      who.hidden = false;
    };
    let commentsRev = null; // the lab's comments version this page has (not the read marks, `seen`)
    let readsAt = null;
    let sectionsAt = null;
    let hotAt = null;
    // A CSS save: load the new stylesheet next to the old one and drop the old one once it's in, so nothing flashes,
    // moves or closes. The saved file's own <link>s, or every same-site one when it's pulled in another way (@import).
    const swapCss = (files) => {
      // A clone still loading from an earlier save is skipped (its original is swapped instead) and dropped once a newer one is in.
      const links = [...(document.querySelectorAll('link[rel~="stylesheet"][href]:not([data-lab-swap])') as NodeListOf<HTMLLinkElement>)].filter((l) => new URL(l.href, location.href).origin === location.origin);
      const named = links.filter((l) => files.includes(decodeURIComponent(new URL(l.href, location.href).pathname)));
      for (const link of named.length ? named : links) {
        const url = new URL(link.href, location.href);
        url.searchParams.set('lab-v', Date.now().toString(36));
        const next = (link.cloneNode() as HTMLLinkElement);
        next.href = url.href;
        next.dataset.labSwap = '';
        const path = url.pathname;
        next.addEventListener('load', () => {
          for (const l of (document.querySelectorAll('link[rel~="stylesheet"][href]') as NodeListOf<HTMLLinkElement>)) if (l !== next && new URL(l.href, location.href).pathname === path) l.remove();
          delete next.dataset.labSwap;
        }, { once: true });
        next.addEventListener('error', () => next.remove(), { once: true });
        link.after(next);
      }
    };
    const fresh = (u) => {
      const url = new URL(u, location.href);
      url.searchParams.set('lab-v', Date.now().toString(36));
      return url.href;
    };
    const samePath = (u, paths) => {
      try {
        const url = new URL(u, location.href);
        return url.origin === location.origin && paths.includes(decodeURIComponent(url.pathname));
      } catch {
        return false;
      }
    };
    // A picture or SVG: every element that shows it gets the new file (img, srcset, poster, SVG image/use, the tab
    // icon). Nothing shows it directly: it's a CSS background, so the stylesheets are swapped.
    const swapImages = (paths) => {
      let hit = 0;
      for (const n of document.querySelectorAll('img, source, video[poster], image, use, link[rel~="icon"]')) {
        if (W.host.contains(n)) continue;
        for (const attr of ['src', 'href', 'poster', 'xlink:href']) {
          const v = n.getAttribute(attr);
          if (!v || !samePath(v.split('#')[0], paths)) continue;
          // The new file is loaded and decoded first, then shown: the picture never blinks empty.
          const next = fresh(v.split('#')[0]);
          const im = new Image();
          im.src = next;
          (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).finally(() => n.setAttribute(attr, next + (v.includes('#') ? v.slice(v.indexOf('#')) : '')));
          hit++;
        }
        const set = n.getAttribute('srcset');
        if (set && set.split(',').some((c) => samePath(c.trim().split(/\s+/)[0], paths))) {
          n.setAttribute('srcset', set.split(',').map((c) => {
            const [u, ...rest] = c.trim().split(/\s+/);
            return [samePath(u, paths) ? fresh(u) : u, ...rest].join(' ');
          }).join(', '));
          hit++;
        }
      }
      if (!hit) swapCss([]);
    };
    // A font: each @font-face that uses it is loaded again as a new face, which takes over from the old one.
    const reloadFonts = (paths) => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // another site's stylesheet
        }
        for (const r of rules || []) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          const src = r.style.getPropertyValue('src');
          const base = sheet.href || location.href;
          if (!/url\(/.test(src) || ![...src.matchAll(/url\(["']?([^"')]+)/g)].some((m) => samePath(new URL(m[1], base).href, paths))) continue;
          const again = src.replace(/url\(["']?([^"')]+)["']?\)/g, (all, u) => (samePath(new URL(u, base).href, paths) ? `url("${fresh(new URL(u, base).href)}")` : all));
          const d = (k) => r.style.getPropertyValue(k) || undefined;
          try {
            const face = new FontFace(d('font-family').replace(/^["']|["']$/g, ''), again, ({ weight: d('font-weight'), style: d('font-style'), stretch: d('font-stretch'), unicodeRange: d('unicode-range'), display: d('font-display') } as any));
            face.load().then((f) => document.fonts.add(f)).catch(() => {});
          } catch {}
        }
      }
    };
    // An HTML page: fetch it and change only what differs, in place (scroll, open things and typed text stay). A
    // changed script or stylesheet list can't be patched safely: then it's a normal reload.
    const ownStyles = () => new Set([W.fonts, W.pinCursorStyle]);
    const scriptsOf = (doc) => [...doc.querySelectorAll('script:not([data-lab])')].filter((x) => !/\/_lab\/comments\.js/.test(x.getAttribute('src') || '')).map((x) => x.getAttribute('src') || x.textContent);
    const sheetsOf = (doc) => [...doc.querySelectorAll('link[rel~="stylesheet"]')].map((l) => { try { return new URL(l.getAttribute('href'), location.href).pathname; } catch { return ''; } });
    const keepOut = (n) => n === W.host || (n.nodeType === 1 && n.localName === 'script');
    // Old and new children are paired in order, looking a few ahead, so an added or removed element doesn't shift
    // everything after it (an open <details> further down stays the same element, and stays open).
    const same = (o, n) => o.nodeType === n.nodeType && o.nodeName === n.nodeName && (o.nodeType !== 1 || (o.id || '') === (n.id || ''));
    const alike = (o, n) => same(o, n) && (o.nodeType === 1 ? Boolean(o.id) || o.getAttribute('class') === n.getAttribute('class') : o.nodeType !== 3 || o.data === n.data);
    const morphKids = (a, b) => {
      const olds = [...a.childNodes].filter((n) => !keepOut(n));
      const news = [...b.childNodes].filter((n) => !(n.nodeType === 1 && n.localName === 'script'));
      let j = 0;
      let prev = null;
      const put = (n) => {
        const c = document.importNode(n, true);
        a.insertBefore(c, prev ? prev.nextSibling : olds[j] || a.firstChild);
        return c;
      };
      news.forEach((n, i) => {
        const o = olds[j];
        if (!o) return void (prev = put(n));
        if (alike(o, n)) return void ((prev = morphNode(o, n)), j++);
        // The old one comes back a little later: this new one was added before it.
        if (news.slice(i + 1, i + 8).some((m) => alike(o, m))) return void (prev = put(n));
        // This new one is a little further on among the old ones: the ones before it were removed.
        const k = olds.slice(j + 1, j + 8).findIndex((m) => alike(m, n));
        if (k >= 0) {
          for (const gone of olds.slice(j, j + 1 + k)) gone.remove();
          j += k + 1;
          return void (prev = morphNode(olds[j], n), j++);
        }
        prev = morphNode(o, n);
        j++;
      });
      for (const o of olds.slice(j)) o.remove();
    };
    const morphNode = (o, n) => {
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || (o.nodeType === 1 && (o.id || '') !== (n.id || ''))) {
        const c = document.importNode(n, true);
        o.replaceWith(c);
        return c;
      }
      if (o.nodeType === 3 || o.nodeType === 8) {
        if (o.data !== n.data) o.data = n.data;
        return o;
      }
      if (o.nodeType !== 1) return o;
      // An opened <details> or <dialog> stays open (you opened it; the file doesn't say so).
      for (const { name } of Array.from(o.attributes as NamedNodeMap)) if (!n.hasAttribute(name) && !(name === 'open' && /^(details|dialog)$/.test(o.localName))) o.removeAttribute(name);
      for (const { name, value } of Array.from(n.attributes as NamedNodeMap)) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
      // What you're typing in, a playing video, a canvas, a web component's insides: left as they are.
      if (o === document.activeElement || o.shadowRoot || /^(iframe|canvas|video|audio|textarea|select|input)$/.test(o.localName)) return o;
      morphKids(o, n);
      return o;
    };
    // A page with scripts of its own is reloaded instead: patching it toward its file would undo what its scripts built.
    const ownScripts = () => scriptsOf(document).length > 0;
    let morphRun = 0;
    const morphPage = async () => {
      if (board) return;
      if (ownScripts()) return reload();
      const run = ++morphRun;
      try {
        const res = await fetch(location.href, { cache: 'no-store', headers: { accept: 'text/html' } });
        if (!res.ok) return reload();
        const html = await res.text();
        if (run !== morphRun) return; // a newer save is already being fetched: only the latest is applied
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (scriptsOf(doc).join('\n') !== scriptsOf(document).join('\n') || sheetsOf(doc).join('\n') !== sheetsOf(document).join('\n')) return reload();
        // What you're looking at stays put: an element a third down the window keeps its place on screen. Found before
        // the change (during a cross-fade the page can't be hit-tested).
        let mark = null;
        for (const y of [Math.min(innerHeight / 3, 240), innerHeight / 2, 80]) {
          const e = document.elementFromPoint(innerWidth / 2, y);
          if (e && e !== document.body && e !== document.documentElement && !W.host.contains(e) && e !== W.host) {
            mark = e;
            break;
          }
        }
        const markTop = mark?.getBoundingClientRect().top;
        // The browser cross-fades the old page into the new one (View Transitions, Safari 18+ and Chrome; others just swap).
        const apply = () => {
          // The page's own new title, with the "(3)" of new messages kept in front.
          if (doc.title !== W.tabTitle.base) {
            W.tabTitle.base = doc.title;
            document.title = doc.title; // drawList puts the "(3)" back in front
            W.drawList();
          }
          const mine = ownStyles();
          // The lab's own (data-lab: the section bar's room, sections.ts) are the widget's, not the page's.
          const olds = [...document.head.querySelectorAll('style:not([data-lab])')].filter((x) => !mine.has(x));
          const news = [...doc.head.querySelectorAll('style:not([data-lab])')];
          news.forEach((n, i) => (olds[i] ? olds[i].textContent !== n.textContent && (olds[i].textContent = n.textContent) : document.head.append(document.importNode(n, true))));
          for (const o of olds.slice(news.length)) o.remove();
          aroundMorph(() => morphKids(document.body, doc.body)); // a choice tried in the page: its words back first (thread.ts)
          if (mark?.isConnected) {
            const moved = mark.getBoundingClientRect().top - markTop;
            if (Math.abs(moved) > 1) scrollBy(0, moved);
          }
          W.reflow();
          W.S.checkSections?.(); // the section bar follows the new page
        };
        // An error inside the cross-fade would go unseen: any failure falls back to a reload.
        const safe = () => {
          try {
            apply();
          } catch {
            reload();
          }
        };
        if (document.startViewTransition && !W.still.matches) document.startViewTransition(safe);
        else safe();
      } catch {
        reload();
      }
    };
    const hotUpdate = (files) => {
      const of = (kind) => files.filter((f) => f.kind === kind).map((f) => f.path);
      // Only a save of this page's own file patches it (another page saved in the lab changes nothing here).
      const here = decodeURIComponent(location.pathname).replace(/\/$/, '/index').replace(/\.html?$/i, '');
      if (of('html').some((p) => !p || p.replace(/\.html?$/i, '') === here)) morphPage();
      if (of('css').length) swapCss(of('css'));
      if (of('img').length) swapImages(of('img'));
      if (of('font').length) reloadFonts(of('font'));
    };
    // One live stream per browser for this lab, shared by its tabs: the tab holding the lock "labit-live" (locks and
    // channels are per origin, so per lab) opens it and passes each message to the lab's other tabs over a
    // BroadcastChannel; they listen there. When it closes, the next tab takes the lock and opens the stream. So a tab
    // in the background stays live (its title count and pins update at once), and any number of tabs use one of the
    // browser's 6 connections to a lab. (Before, each tab held its own and let it go 30 s into the background, asking
    // for the state every 20 s instead.) Without locks or channels a tab opens its own stream.
    const tab = Math.random().toString(36).slice(2, 12); // the lab counts open tabs by their streams; bye on close
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('labit-live') : null;
    const shared = Boolean(bc && navigator.locks);
    let leading = !shared;
    let release: (() => void) | null = null;
    let last = null; // the last state, for a tab that joins
    const got = (v) => {
      beat = Date.now();
      last = v;
      dispatchEvent(new CustomEvent('lab-state', { detail: v })); // the board page follows the board file from this
      onState(v);
    };
    if (bc)
      bc.onmessage = ({ data: d }) => {
        if (d.t === 'hello' && stream && last) bc.postMessage({ t: 'state', v: last }); // a tab joined: it gets the state now
        if (stream) return; // a tab with its own stream listens to that
        if (d.t === 'state') got(d.v);
        if (d.t === 'beat') beat = Date.now();
        if (d.t === 'down') showAway('reconnecting');
      };
    const connect = () => {
      if (stream) return;
      stream = new EventSource(`${W.script.dataset.live}?tab=${tab}`);
      beat = Date.now();
      stream.addEventListener('beat', () => {
        beat = Date.now();
        if (leading) bc?.postMessage({ t: 'beat' });
      });
      stream.onerror = () => {
        showAway('reconnecting');
        if (leading) bc?.postMessage({ t: 'down' });
      };
      stream.onmessage = (e) => {
        const v = JSON.parse(e.data);
        got(v);
        if (leading) bc?.postMessage({ t: 'state', v });
      };
    };
    // Waits for the lock (another tab may hold it), then opens the stream and keeps the lock until the page goes.
    const lead = () =>
      navigator.locks.request('labit-live', () => new Promise<void>((r) => {
        release = r;
        leading = true;
        connect();
      }));
    function onState(v) {
      {
        // A new widget script: this page needs it, so it reloads (when it's safe, as always). While the reload waits
        // (a chat, a thread or a draft is open) the rest still runs: replies keep arriving and the pill stays true.
        if (v.widget && W.script.dataset.widget && v.widget !== W.script.dataset.widget) reload();
        // Comments stored in a new shape (lib/schema.mjs VERSION): this page reads them with the widget that knows it.
        if (v.schema && W.script.dataset.schema && String(v.schema) !== W.script.dataset.schema) return reload();
        // The lab restarted (its counters start again): catch up in place instead of reloading. The page is fetched
        // and patched (only if its file changed does anything move), and the comments are loaded again.
        if (v.lab && W.script.dataset.lab && v.lab !== W.script.dataset.lab) {
          W.script.dataset.lab = v.lab;
          W.script.dataset.version = String(v.files);
          W.script.dataset.hot = String(v.hot || 0);
          hotAt = v.hot;
          commentsRev = v.comments;
          morphPage();
          W.load();
        }
        if (String(v.files) !== W.script.dataset.version) {
          // The lab says which files changed (no list: a burst too big to judge, so reload as before).
          if (board || (Array.isArray(v.changed) && v.changed.length && !v.changed.some(usedHere))) W.script.dataset.version = String(v.files);
          else reload(); // held while something is open: the comments below still come in (the agent's answer, read marks)
        }
        // Missed more than one hot update while away (asleep, offline): patch the page and refresh every stylesheet
        // and picture, instead of only the last batch of files.
        if (!board && hotAt !== null && v.hot !== hotAt) {
          if (v.hot - hotAt > 1) hotUpdate([{ kind: 'html' }, { kind: 'css', path: '' }]);
          else hotUpdate(v.hotFiles || []);
        }
        hotAt = v.hot;
        // One version on and it names the pages it changed, none of them this one: nothing to fetch. (An older lab sends
        // no commentPages; more than one version on, the pages in between aren't known.)
        W.script.dataset.hot = String(v.hot || 0); // what "since you looked" counts saves by
        const elsewhere = v.comments === commentsRev + 1 && Array.isArray(v.commentPages) && !v.commentPages.includes(W.S.page);
        if (commentsRev !== null && v.comments !== commentsRev && !elsewhere) W.loadChanges(commentsRev); // keeps typed text: it adds replies in place
        commentsRev = v.comments;
        // read on another device with your name
        if (v.reads !== readsAt) {
          readsAt = v.reads;
          W.syncReads();
        }
        // a section read on another device with your name
        if (v.sections !== sectionsAt) {
          sectionsAt = v.sections;
          W.S.syncSections?.();
        }
        // Experiments switched on or off (the ⋯ menu here or in another tab): start what came on, reload for what went off.
        // An older lab sends no flags.
        if (Array.isArray(v.flags)) W.S.syncFlags?.(v.flags, reload);
        // listening: a wait is open · working: Claude got comments and is on them · away: nobody will hear a comment now.
        const s = v.session;
        // A lab with listeners can still have none for this page (a wait with --page for another one): this page says
        // so, instead of "talking to Claude" while its pins wait for nobody. An older lab doesn't send heard.
        const h = v.heard;
        const here = !h || h.pages.includes(W.S.page) || (h.all && !h.except.includes(W.S.page));
        // The session listening here was handed pins and answered none of them (local.mjs silentNow): the pill says
        // "Claude isn't answering" instead of "talking to Claude", until it answers anything.
        const quiet = (v.silent || []).find((q) => !q.pages || q.pages.includes(W.S.page));
        const mode = s && here ? (quiet ? 'quiet' : v.mode || 'listening') : 'away';
        W.S.unheard = mode === 'away';
        // "talking to Claude · Sonnet 5.5": the agent, and the model the session said it runs on. The session's name
        // isn't in the words (owner, 18 Nov); it is in the pill's tooltip.
        const agent = quiet && mode === 'quiet' ? quiet.label : s?.model ? `${s.agent || 'Claude'} · ${s.model}` : s?.agent || 'Claude';
        const name = s && s.name !== (s.agent || 'Claude') ? s.name : '';
        W.S.agent = s ? agent : '';
        pill = { mode, agent, away: s && !here ? 'no agent on this page' : 'no agent listening' };
        paintWho();
        who.classList.remove('stale');
        W.chatBtn.classList.remove('stale');
        who.classList.toggle('idle', mode === 'away' || mode === 'quiet');
        who.classList.toggle('working', mode === 'working');
        W.listBtn.dataset.agent = mode;
        W.chatBtn.dataset.agent = mode; // phones: with the list parked, the chat button carries the agent's mark
        if (W.coarse && !W.chatBtn.querySelector('.mark')) W.chatBtn.insertAdjacentHTML('afterbegin', MARK);
        if (W.coarse) W.chatBtn.title = said(); // phones: the light on the chat button says who's listening
        whoLabel(said()); // the words stay for screen readers when only the light shows
        if (s?.url && mode !== 'away') Object.assign(who, { href: s.url, target: '_blank' });
        else who.removeAttribute('href');
        // A tap doesn't copy the resume command any more (Leo, 16 Nov: it made no sense): the pill only says who listens.
        // How to get one listening again: what to say to the agent, for this page.
        // The mark's colour says the state; the tooltip names it (Leo, 18 Nov).
        const state = mode === 'away' ? 'Away: no agent is listening (grey).' : mode === 'quiet' ? 'Not answering: pins handed to it got no reply in 2 minutes; they go to the next wait (grey).' : mode === 'working' ? 'Working on a pin (green, ears twitching).' : 'Listening: waiting for your pins (green). Amber: reconnecting to the lab. Grey: away.';
        who.title = mode === 'away' ? `${state} To get an agent listening, tell it: listen for pins on ${location.origin}${W.S.page} (labit wait --page ${W.S.page})` : [state, name && `session: ${name}`, s?.resume].filter(Boolean).join('\n');
        who.hidden = false;
      }
    }
    // Back in front: a save that waited reloads now; a stream that went quiet while hidden is checked at once.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (reloadWhenShown) return reload();
      check();
    });
    addEventListener('pagehide', () => {
      stream?.close();
      stream = null;
      release?.(); // the next tab takes over the stream
      release = null;
      leading = !shared;
      if (!frame) fetch(W.script.dataset.live.replace(/live$/, 'bye'), { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab }) }).catch(() => {});
    });
    addEventListener('pageshow', (e) => e.persisted && start()); // back from the back-forward cache
    // Back from sleep, or the stream went quiet: catch up (the first message after it says what changed). A clock that
    // jumped (the laptop slept) or 40 s without a beat both count. A tab without a stream whose sharing tab went
    // quiet (frozen, asleep) opens its own.
    let tick = Date.now();
    const freshStream = () => {
      stream?.close();
      stream = null;
      showAway('reconnecting');
      connect();
    };
    const check = (slept = false) => {
      const stale = Date.now() - beat > 40000;
      if (stream && (slept || stale)) freshStream();
      else if (!stream && stale && !(frame && bc)) connect();
      else if (!stream && (slept || stale)) bc?.postMessage({ t: 'hello' });
    };
    // Hidden tabs' timers are slowed to about once a minute, which would look like sleep: only a tab in front checks.
    setInterval(() => {
      const now = Date.now();
      const slept = now - tick > 20000;
      tick = now;
      if (!document.hidden) check(slept);
    }, 5000);
    addEventListener('online', () => !document.hidden && check(true));
    const start = () => {
      if (frame && bc) return bc.postMessage({ t: 'hello' }); // a frame only listens: the board's stream is the one
      if (!shared) return connect();
      beat = Date.now(); // a joining tab waits up to 40 s for the shared stream before opening its own
      lead();
      bc.postMessage({ t: 'hello' });
    };
    start();
  }
}
