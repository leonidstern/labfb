// Lab pages: pages made for the lab get its shell, stylesheet and blocks, as an Artifact gets its skeleton, so an agent
// writes only the content. A lab page is an .html file with no <html> or doctype of its own, or a .md file. A full
// HTML document (the person's own page, the project's site) is served exactly as it is. skills/labit/blocks.md lists
// the blocks; public/_lab/lab.css draws them.

/** An .html file is a lab page when it brings nothing of its own around the content: no doctype or <html>, no <style>
 *  and no viewport. A page with its own styles (one written the Artifact way, without a doctype) is the author's own
 *  design and is served as it is. */
export const isLabPage = (html: string) =>
  !/^\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype|html)\b/i.test(html) && !/<html[\s>]|<style[\s>]|<meta[^>]+name=["']?viewport/i.test(html);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Each option in an options block gets the id `v<number>` (from its `value`) when it has none and nothing on the page
 *  has that id yet, so a reply can link to it (`#v2`). Several blocks on a page: write the ids, e.g. `layout-v2`. */
const versionIds = (html: string) => {
  const used = new Set([...html.matchAll(/\sid=["']?([^\s"'>]+)/gi)].map((m) => m[1]));
  return html.replace(/<ol\b[^>]*\bclass=["'][^"']*\blab-options\b[^"']*["'][^>]*>[\s\S]*?<\/ol>/gi, (block) =>
    block.replace(/<li\b([^>]*)>/gi, (tag, attrs) => {
      const n = /\bvalue=["']?(\d+)/i.exec(attrs)?.[1];
      if (!n || /\bid=/i.test(attrs) || used.has(`v${n}`)) return tag;
      used.add(`v${n}`);
      return `<li${attrs} id="v${n}">`;
    }),
  );
};

/** The page around a lab page's content: charset, viewport, its title, the lab's stylesheet, its body class. */
export function labShell(content: string, fallbackTitle: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content);
  const body = title ? content.replace(title[0], '') : content;
  const name = title?.[1].trim() || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1].replace(/<[^>]+>/g, '').trim() || fallbackTitle;
  // Its own <main>, if it has one; otherwise the lab's column holds the content.
  const inner = versionIds(/<main[\s>]/i.test(body) ? body : `<main>\n${body.trim()}\n</main>`);
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
    `<title>${title ? title[1].trim() : esc(name)}</title>\n<link rel="stylesheet" href="/_lab/lab.css">\n</head>\n<body class="lab lab-doc">\n${inner}\n</body>\n</html>\n`
  );
}

/** A heading's id: its words, lowercase, joined by hyphens, so it can be linked, pinned and zoomed. */
const slug = (s: string) => s.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9À-￿]+/g, '-').replace(/^-|-$/g, '') || 'section';

// Words inside a line: code, bold, italic, links and pictures. Everything else is text.
const inline = (s: string) => {
  const codes: string[] = [];
  let out = esc(s).replace(/`([^`]+)`/g, (_, c) => `\uE000${codes.push(`<code>${c}</code>`) - 1}\uE000`);
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${/^(javascript|data|vbscript):/i.test(href) ? '#' : href}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<i>$2</i>');
  return out.replace(/\uE000(\d+)\uE000/g, (_, i) => codes[+i]);
};

/** Markdown to a lab page's content: headings (with ids), paragraphs, lists, tasks, quotes, code, tables, rules and
 *  pictures. A block that starts with a tag is HTML and passes as it is, so the blocks in blocks.md work here too. */
export function renderMarkdown(md: string): { html: string; title: string } {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const ids = new Map<string, number>();
  let title = '';
  let i = 0;
  // An optional front-matter block: its title line names the page.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      title = lines.slice(1, end).find((l) => /^title:/i.test(l))?.replace(/^title:\s*/i, '').replace(/^["']|["']$/g, '') || '';
      i = end + 1;
    }
  }
  const blank = (l?: string) => l === undefined || !l.trim();
  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(`{3,}|~{3,})\s*([\w-]*)/.exec(l))) {
      const fence = m[1];
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith(fence); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code${m[2] ? ` class="language-${m[2]}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
      const n = m[1].length;
      if (n === 1 && !title) title = m[2];
      const base = slug(m[2]);
      const seen = ids.get(base) || 0;
      ids.set(base, seen + 1);
      out.push(`<h${n} id="${seen ? `${base}-${seen + 1}` : base}">${inline(m[2])}</h${n}>`);
      i++;
      continue;
    }
    if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*_-]*$/.test(l)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*</.test(l)) {
      const raw: string[] = [];
      for (; i < lines.length && !blank(lines[i]); i++) raw.push(lines[i]);
      out.push(raw.join('\n'));
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(q.join('\n')).html}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(
        `<div class="lab-scroll"><table class="lab-table"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    if ((m = /^\s*([-*+]|\d+[.)])\s+/.exec(l))) {
      const ordered = /\d/.test(m[1]);
      const items: string[] = [];
      let tasks = false;
      for (; i < lines.length; i++) {
        const it = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (it) {
          const task = /^\[( |x)\]\s+(.*)$/i.exec(it[2]);
          if (task) tasks = true;
          items.push(task ? `<li${task[1] === ' ' ? ' class="todo"' : ' class="done"'}>${inline(task[2])}</li>` : `<li>${inline(it[2])}</li>`);
        } else if (!blank(lines[i]) && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, ` ${inline(lines[i].trim())}</li>`);
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      // A checklist when every item is a task; in a mixed list a task keeps its box as text.
      const all = items.every((it) => /^<li class="(done|todo)">/.test(it));
      out.push(tasks && all ? `<ul class="lab-checklist">${items.join('')}</ul>` : `<${tag}>${items.map((it) => it.replace(/^<li class="done">/, '<li>✓ ').replace(/^<li class="todo">/, '<li>☐ ')).join('')}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && !blank(lines[i]) && !/^(#{1,6}\s|`{3}|~{3}|\s*>|\s*([-*+]|\d+[.)])\s|\s*<)/.test(lines[i]); i++) para.push(lines[i].trim());
    if (!para.length) {
      para.push(lines[i].trim());
      i++;
    }
    // A picture on its own line is a figure; the line under it, in italics, its caption.
    const pic = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(para[0]);
    if (pic && para.length <= 2) {
      const cap = para[1]?.replace(/^[*_]|[*_]$/g, '');
      out.push(`<figure class="lab-figure"><img src="${pic[2]}" alt="${esc(pic[1])}">${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}</figure>`);
      continue;
    }
    out.push(`<p>${para.map(inline).join(' ')}</p>`);
  }
  return { html: out.join('\n'), title };
}

/** A new lab page to start from: its title, a lede, and where the blocks are. */
export const starter = (name: string, md: boolean) => {
  const title = name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return md
    ? `---\ntitle: ${title}\n---\n\n# ${title}\n\nOne line on what this page is for.\n\n## First section\n\nWrite here. Blocks (options, compare, before and after…) are in labit's skills/labit/blocks.md; paste them as HTML.\n`
    : `<title>${esc(title)}</title>\n\n<header id="top">\n  <h1>${esc(title)}</h1>\n  <p class="lede">One line on what this page is for.</p>\n</header>\n\n<section id="first">\n  <h2>First section</h2>\n  <p>Write here. Blocks (options, compare, before and after…) are in labit's skills/labit/blocks.md.</p>\n</section>\n`;
};
