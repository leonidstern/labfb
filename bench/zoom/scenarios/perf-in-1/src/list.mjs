import zlib from 'node:zlib';

// What a page load sends: that page's comments, oldest first, as gzipped JSON.
// store.get(page) is the page's comments (an array, in the order they came in).
// store.version(page) is a number that goes up each time that page gets a comment.
export function makeLoader(store) {
  return function load(page) {
    const list = [...store.get(page)].sort((a, b) => a.at - b.at);
    return zlib.gzipSync(JSON.stringify(list));
  };
}
