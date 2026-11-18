# Lab page blocks

A lab page is only its content. Write an `.html` file with a `<title>` and the blocks below, and no `<html>`,
`<head>`, `<body>` or CSS of your own: the lab adds the page around it, its stylesheet and light and dark. Or write
Markdown (`.md`): headings, lists, tables, `- [x]` checklists and pictures come out as these blocks too, and any block
below can be pasted in as HTML. Start one with `LAB new <name>` (`--md` for Markdown).

Put each block in a `<section id="…">` with a short id, so it can be pinned, linked (`#id`) and zoomed. A page with
anything of its own around the content (`<html>`, a doctype, a `<style>` or a viewport) is the author's own design and
is served exactly as it is: write one only when the person wants their own design.

```html
<title>Checkout fixes</title>
<header id="top">
  <h1>Checkout fixes</h1>
  <p class="lede">What changed and what's left.</p>
</header>
<section id="picks">
  <h2>Options</h2>
  …a block…
</section>
```

## Options to pick from

Numbered so the person can answer "1, 3": give every option its number with `value`, and keep it when you add
options later (new ones get the next numbers). `rec` marks your recommendation.

```html
<ol class="lab-options">
  <li value="1" class="rec"><b>Keep the 2 s batch</b><span>Pins in a row reach the agent together.</span></li>
  <li value="2"><b>Hand each pin over at once</b><span>Faster, more wake-ups.</span></li>
</ol>
```

## Compare

```html
<div class="lab-compare"><table class="lab-table">
  <tr><th></th><th class="rec">Lab page</th><th>Own page</th></tr>
  <tr><td>CSS to write</td><td class="rec">none</td><td>all of it</td></tr>
</table></div>
```

## Before and after

```html
<div class="lab-ba">
  <figure><img src="before.png" alt="The bar before"><figcaption>Before</figcaption></figure>
  <figure><img src="after.png" alt="The bar after"><figcaption>After</figcaption></figure>
</div>
```

## A picture with a caption

```html
<figure class="lab-figure"><img src="shot.png" alt="The chat on a phone"><figcaption>The chat on a phone, dark.</figcaption></figure>
```

## Numbers in a row

```html
<div class="lab-stats">
  <div><b>2.0 s</b><span>pin to agent</span></div>
  <div><b>0</b><span>dependencies</span></div>
</div>
```

## Checklist

```html
<ul class="lab-checklist">
  <li class="done">Tests pass</li>
  <li>Try it on a phone</li>
</ul>
```

## A question with choices

The person answers with a pin on the choice they want.

```html
<div class="lab-question">
  <p>Open a PR now?</p>
  <ul class="lab-choices"><li class="rec">Open PR</li><li>Not yet</li></ul>
</div>
```

## Timeline

```html
<ol class="lab-timeline">
  <li><time>09:40</time><span>CI failed on Node 22</span></li>
  <li><time>09:55</time><span>Port clash fixed, pushed</span></li>
</ol>
```

## Bars (a chart)

Drawn to scale: put the real numbers in, `--max` on the block and `--v` on each row, and write the value as text.
`rec` draws a bar in green. Say the scale in a line under it.

```html
<div class="lab-bars" style="--max: 100">
  <div><span>logo.html</span><i style="--v: 55"></i><b>55%</b></div>
  <div class="rec"><span>A lab page</span><i style="--v: 0"></i><b>0%</b></div>
</div>
<p class="lab-muted lab-small">Share of each page that is its own CSS, 0–100%.</p>
```

## A note

```html
<p class="lab-note">Not tried on a phone yet.</p>
<p class="lab-note go">Recommended: 1 and 3.</p>
```

## Cards

```html
<div class="lab-cards">
  <div><h3>Speed</h3><p>2.0 s, all of it batching.</p></div>
  <div><h3>Install</h3><p>npx, no dependencies.</p></div>
</div>
```

## States: what happened after an answer

When the person answers (picks options, picks a choice) and when you build, drop or park something, mark it on the
page where it was asked, with `data-state` on the item: `picked`, `building`, `built`, `dropped` or `later`. It works
on every block's items: an option, a card, a choice, a checklist or timeline row, a table cell. A pill shows it;
`built` is green with a tick, `dropped` fades and is struck through.

```html
<li value="3" data-state="built"><b>Flatten the cards</b><span>No box around each card.</span></li>
<ul class="lab-choices"><li data-state="picked">3 and 5</li><li>Only 5</li></ul>
<tr><td data-state="later">Chart block</td><td>…</td></tr>
```

## Also

- Tables: `<div class="lab-scroll"><table class="lab-table">…</table></div>`
- Pills: `<span class="lab-pill">draft</span>`, `<span class="lab-pill go">merged</span>`
- Code: `<pre><code>…</code></pre>`; keys and short code: `<kbd>m</kbd>`, `<code>wait</code>`
- A box around anything: `<div class="lab-box">…</div>`; quiet text: `class="lab-muted"`
