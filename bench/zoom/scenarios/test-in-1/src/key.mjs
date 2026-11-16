// Pages are keyed by their file: Pricing.html is /pricing, a/index.html is /a/index. Anything the lab's page
// format doesn't allow (dots, spaces, other scripts) is spelled as _ and its hex bytes, so keys stay unique.
export const keyFor = (rel) =>
  '/' + rel.replace(/\.html?$/i, '').split('/').map((seg) =>
    [...Buffer.from(seg)].map((b, i) => (/[a-z0-9]/.test(String.fromCharCode(b)) || (b === 45 && i) ? String.fromCharCode(b) : `_${b.toString(16)}`)).join(''),
  ).join('/');
