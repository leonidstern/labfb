(() => {
  // src/widget/styles.css
  var styles_default = `/* Theme: set --lab-accent, --lab-accent-fg, --lab-bg, --lab-fg, --lab-radius, --lab-font or --lab-font-features on the
   [data-lab-comments] element (or on :root). Everything else is mixed from those. */
:host { all: initial;
  --_bg: var(--lab-bg, #fff); --_fg: var(--lab-fg, #141414);
  --_accent: var(--lab-accent, #141414); --_accent-fg: var(--lab-accent-fg, #fff);
  --_radius: var(--lab-radius, 12px); --_r-s: 6px /* two corners in all: 6 px small (keys, rows, tabs, text buttons), 12 px boxes and buttons; circles only for dots */;
  /* Washes of black (white in dark mode), four steps: soft, hover, line, muted, as lab.css. */
  --_soft: var(--lab-soft, rgba(0,0,0,.05)); --_hover: var(--lab-hover, rgba(0,0,0,.10)); --_line: var(--lab-line, rgba(0,0,0,.15)); --_edge: var(--lab-edge, #c7c7cc); --_muted: var(--lab-muted, rgba(0,0,0,.50));
  --_hair: .5px solid color-mix(in srgb, var(--_fg) 16%, transparent);
  --_shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 14%, transparent), 0 1px 2px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.08);
  --_ease: cubic-bezier(.2, .8, .2, 1); }
@media (prefers-color-scheme: dark) {
  :host { --_bg: var(--lab-bg, #1c1c1e); --_fg: var(--lab-fg, #f4f4f5);
          --_accent: var(--lab-accent, #f4f4f5); --_accent-fg: var(--lab-accent-fg, #141414);
          --_soft: var(--lab-soft, rgba(255,255,255,.05)); --_hover: var(--lab-hover, rgba(255,255,255,.10)); --_line: var(--lab-line, rgba(255,255,255,.15)); --_edge: var(--lab-edge, #48484a); --_muted: var(--lab-muted, rgba(255,255,255,.50));
          --_shadow: 0 0 0 1px color-mix(in srgb, var(--_fg) 16%, transparent), 0 10px 32px rgba(0,0,0,.5); }
}
* { box-sizing: border-box; font-family: var(--lab-font, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
    font-size: 14px; line-height: 1.4; font-weight: 400; color: var(--_fg); letter-spacing: -.011em;
    font-feature-settings: var(--lab-font-features, normal); font-synthesis: none; font-optical-sizing: auto;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;
    caret-color: var(--_accent); -webkit-tap-highlight-color: transparent; }
::selection { background: color-mix(in srgb, var(--_accent) 38%, transparent); color: var(--_fg); }
button:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
.layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
.pin { position: absolute; width: 28px; height: 28px; margin: -28px 0 0 0; border-radius: 14px 14px 14px 2px;
       background: var(--_bg); border: 0; box-shadow: 0 0 0 1px var(--_edge), 0 2px 8px rgba(0,0,0,.16);
       display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--_fg); font-size: 12px; font-weight: 500;
       font-variant-numeric: tabular-nums; letter-spacing: 0; transform-origin: 0 100%;
       transition: transform .16s var(--_ease), box-shadow .16s var(--_ease), opacity .16s; }
/* A 1 px edge in the text colour (dark on light pins, light in dark mode) so a pin shows on white and black alike;
   the one you point at or have open gets a green edge. */
button.pin:hover, button.pin.open { transform: scale(1.08); box-shadow: 0 0 0 1.5px rgb(36, 160, 70), 0 4px 14px rgba(0,0,0,.2); }
button.pin:active { transform: scale(.96); }
.pin.in { animation: lab-pin .26s var(--_ease); }
/* A new comment lands with one faint halo from its pin. */
button.pin.in::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                  animation: lab-halo .9s cubic-bezier(.2, .7, .3, 1) forwards; }
.pin.resolved { color: var(--_muted); }
/* Statuses. A go pin says "go": green in a green outline when placed, the turning stroke while the agent is on it,
   white on green once done (a \u2713 is only ever a done comment). A comment pin: your initial, the stroke, then a green tick. */
button.pin.go { background: var(--_bg); color: rgb(36, 160, 70); font-size: 11px; font-weight: 600; letter-spacing: .006em;
                box-shadow: inset 0 0 0 1.5px rgb(36, 160, 70), 0 2px 8px rgba(0,0,0,.16); }
button.pin.go.done { background: rgb(36, 160, 70); color: #fff; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 22%, transparent), 0 2px 8px rgba(0,0,0,.16); }
button.pin.done:not(.go) { color: rgb(36, 160, 70); }
.pin.moved { opacity: .5; scale: .8; }
button.pin.moved:hover, button.pin.moved.open { opacity: 1; }
.pin.grab { touch-action: none; }
button.pin.dragging { cursor: grabbing; transform: scale(1.1); opacity: 1; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 8px 20px rgba(0,0,0,.22); }
.zone { position: absolute; background: none;
        border-radius: var(--_radius); pointer-events: none; }
.zone svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.zone rect { fill: none; stroke-linecap: round; stroke-dasharray: 0 4; rx: var(--lab-radius, 12px); ry: var(--lab-radius, 12px); }
/* Green dots, the same green as quoted words, with no dark ring under them. */
.zone rect.ring { display: none; }
.zone rect.dots { stroke: rgb(52, 199, 89); stroke-width: 1.5; } /* 1.5 px round dots, 4 px apart */
.zone.live { left: 0; top: 0; will-change: transform, width, height; animation: lab-fade .12s ease-out; }
/* The agent is on it: a green stroke runs round the pin's own teardrop outline. The ring (a still 2 px teardrop mask)
   holds a conic gradient that turns by transform, so the screen turns it without redrawing: 30 such pins cost ~1 ms
   a second, against ~125 ms when the gradient's angle itself was animated. */
.pin .ring { position: absolute; inset: -4px; border-radius: 18px 18px 18px 6px; padding: 2px; overflow: hidden; pointer-events: none;
             -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
             mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
.ring::before { content: ''; position: absolute; inset: -50%; will-change: transform;
                background: conic-gradient(rgb(52, 199, 89) 0 28%, rgba(52, 199, 89, .22) 28% 100%); animation: lab-turn 1.2s linear infinite; }
@keyframes lab-turn { to { transform: rotate(360deg); } }
/* The drawn pointer: your pin, following the mouse (it moves without a transition; only its look eases). */
.ptr { position: fixed; left: 0; top: 0; width: 28px; height: 28px; border-radius: 14px 14px 14px 2px; corner-shape: round;
       background: var(--_bg); box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 2px 6px rgba(0,0,0,.18);
       display: grid; place-items: center; pointer-events: none; z-index: 2147483647; opacity: 0; will-change: transform;
       transition: opacity .12s ease-out, background-color .16s ease-out; }
.ptr.show { opacity: 1; }
.ptr span { grid-area: 1 / 1; font-size: 12px; letter-spacing: 0; font-weight: 600; line-height: 1; transition: opacity .16s ease-out, transform .16s ease-out; }
.ptr .tick { opacity: 0; transform: scale(.5); color: #fff; font-size: 11px; letter-spacing: .006em; }
.ptr.go { background: rgb(36, 160, 70); }
.ptr.go .ini { opacity: 0; transform: scale(.5); }
.ptr.go .tick { opacity: 1; transform: none; }
.pin.new::after { content: ''; position: absolute; top: -4px; right: -4px; width: 9px; height: 9px; border-radius: 50%;
                  background: var(--_fg); box-shadow: 0 0 0 2px var(--_bg); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--_accent); margin: 0 6px 1px 0; }
.card { position: absolute; width: 320px; max-width: calc(100vw - 24px); background: var(--_bg); border-radius: var(--_radius);
        box-shadow: var(--_shadow); padding: 12px 14px 14px; transform-origin: 14px 0; z-index: 1;
        display: flex; flex-direction: column; max-height: min(460px, 62vh); }
/* A long thread scrolls inside the card, which keeps one size; the step buttons and the reply box stay put. */
.card > .body { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin-right: -8px; padding-right: 8px; }
.card > .foot { flex: none; }
.card.in, .float.in { animation: lab-in .18s var(--_ease); }
.card.out, .float.out { animation: lab-out .14s ease-in forwards; pointer-events: none; }
.item { display: grid; row-gap: 3px; }
.item + .item { margin-top: 14px; }
.msg.item { display: block; } .msg.item + .msg.item { margin-top: 0; }
.meta { display: flex; align-items: baseline; gap: .5em; font-size: 12px; color: var(--_muted); margin: 0;
        white-space: nowrap; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.meta b { font-weight: 500; font-size: 13px; letter-spacing: -.006em; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.meta .dot { flex: none; align-self: center; margin: 0; }
.meta .ago { white-space: nowrap; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
.row { display: flex; gap: 12px; justify-content: flex-start; align-items: center; margin-top: 8px; }
/* A thread's reopen / resolve / delete: small, on the right, out of the reading flow. */
.card .row:not(.nav) { justify-content: flex-end; gap: 10px; } .card .row:not(.nav) button.btn { font-size: 12px; letter-spacing: 0; }
button.btn { border: 0; padding: 2px 0; cursor: pointer; background: none; color: var(--_muted); font-size: 12px;
             letter-spacing: 0; border-radius: var(--_r-s); transition: color .12s; }
button.btn:hover { color: var(--_fg); }
button.btn.danger, button.btn.danger:hover { color: #e5484d; }
.row .ask { white-space: nowrap; color: var(--_fg); font-size: 12px; letter-spacing: 0; padding: 2px 0; animation: lab-fade .12s ease-out; }
.float { position: absolute; width: 320px; max-width: calc(100vw - 24px); transform-origin: 0 20px; z-index: 1; }
.card .composer { margin-top: 6px; } /* close under resolve / delete */
.card > .body > .row:not(.nav) { margin-right: 7px; } /* resolve / delete end where the send button does */
.box { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "text send"; align-items: center; column-gap: 8px;
       border-radius: var(--_radius); padding: 7px 7px 7px 14px; margin: 0; transition: box-shadow .15s;
       /* One box for the chat, threads and new comments: its look comes only from these two, which a place sets on
          its container (never by restyling the box, idle or typing), so the three can't drift apart (Leo, 15 Nov). */
       background: var(--_box-bg, var(--_soft)); box-shadow: var(--_box-edge, none); }
/* The new comment box on a computer floats over the page: the page's colour, the pins' 1 px edge in the text colour
   (it shows on white and black pages alike) and a soft shadow. */
.float { --_box-bg: var(--_bg); --_box-edge: 0 0 0 1px var(--_edge), 0 1px 2px rgba(0,0,0,.06), 0 8px 26px rgba(0,0,0,.14); }
/* Same top and right padding open or closed: the text and the arrow's column stay put while the box grows. */
.box.open { grid-template-areas: "text text" "line line" "who send"; row-gap: 8px; padding: 7px 7px 8px 14px; }
/* One line of text is exactly as tall as the send button (20 + 2 + 2 = 24), so the text and the button share one middle. */
.box textarea { grid-area: text; width: 100%; border: 0; background: none; padding: 2px 0; line-height: 20px; margin: 0; resize: none;
                min-height: 0; max-height: 200px; overflow-y: auto; outline: none; display: block; }
.box textarea::placeholder, .who input::placeholder { color: var(--_muted); opacity: 1; }
.line { grid-area: line; height: 0; border-top: var(--_hair); margin: 0 -7px 0 -14px; display: none; }
.who { grid-area: who; display: none; align-items: baseline; gap: 4px; min-width: 0; font-size: 13px; color: var(--_muted); letter-spacing: -.006em; }
.who * { font-size: 13px; letter-spacing: -.006em; }
.who span { color: var(--_muted); }
.who input { flex: 1; min-width: 0; border: 0; background: none; padding: 0; margin: 0; outline: none; color: var(--_muted); text-overflow: ellipsis; }
.who input:focus { color: var(--_fg); }
.box.open .line { display: block; animation: lab-fade .16s ease-out; }
.box.open .who { display: flex; animation: lab-fade .16s ease-out; }
/* One line once your name is known: text, a quiet "as <name>" (still editable) and the arrow, side by side.
   The text grows upward; the name and arrow stay on its last line. Only a first comment, with no name yet, opens
   the second row to ask for it. */
.box.one, .box.one.open { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "text who send"; align-items: end; row-gap: 0; padding: 7px 7px 7px 14px; }
.box.one .line { display: none !important; }
.box.one .who { align-self: end; line-height: 20px; padding-bottom: 2px; max-width: 40%; } /* the text's last line box, so they share a line */
.box.one .who input { flex: none; field-sizing: content; min-width: 2ch; max-width: 9em; }
.send { grid-area: send; width: 24px; height: 24px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
        background: var(--_hover); color: var(--_muted); display: grid; place-items: center; transition: background .15s, color .15s, transform .15s var(--_ease); }
.send.ready:hover { transform: scale(1.06); }
.send.ready:active { transform: scale(.94); }
.send.ready { background: var(--_accent); color: var(--_accent-fg); }
/* The send sign: a paper plane, one filled shape cut with clip-path (crisp at any size, no joins); it flies off on send. */
.send .arr { display: block; position: relative; left: -1px; width: 12px; height: 11px; background: currentColor; clip-path: polygon(0 42%, 100% 0, 66% 100%, 46% 60%); }
.send * { color: inherit; }
.error { color: #e5484d; font-size: 12px; padding: 6px 8px 0; letter-spacing: 0; }
.error:empty { display: none; }
.error.wait { color: var(--_muted); }
.bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
.bar button { border: 0; border-radius: var(--_radius); padding: 9px 14px; cursor: pointer; background: var(--_bg); color: var(--_fg);
              box-shadow: var(--_shadow); font-size: 13px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center;
              letter-spacing: -.006em; font-variant-numeric: tabular-nums; white-space: nowrap; transition: color .15s, transform .15s var(--_ease); }
.bar button:active { transform: scale(.97); }
/* The list and the chat: a header, a part that scrolls, and (the chat) a box at the bottom that doesn't. */
.list { position: fixed; right: 16px; bottom: 66px; width: min(340px, calc(100vw - 32px)); max-height: min(60vh, 460px); overflow: hidden;
        display: flex; flex-direction: column; background: var(--_bg); color: var(--_fg); border-radius: var(--_radius); box-shadow: var(--_shadow); font-size: 13px; letter-spacing: -.006em; }
.list .tabs { display: flex; flex-wrap: wrap; gap: 2px; flex: none; padding: 12px 8px 6px; }
.list .items, .msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.list .items { padding: 0 6px 6px; }
.list .tabs button { border: 0; border-radius: var(--_r-s); padding: 4px 8px; white-space: nowrap; background: none; color: var(--_muted); cursor: pointer; font: inherit; }
.list .tabs button.on { background: var(--_fg); color: var(--_bg); }
.list .tabs .hold { margin-left: auto; }
.list .it { display: block; width: 100%; text-align: left; border: 0; background: none; color: inherit; padding: 7px 8px; border-radius: var(--_r-s); cursor: pointer; font: inherit; }
.list .it:hover, .list .it.cur { background: var(--_hover); }
.list .it { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* one line per pin; the rest is in its thread */
.list .it span, .list .none { color: var(--_muted); }
.list .it .tag { display: inline-block; padding: 0 7px; border-radius: var(--_r-s); background: var(--_accent); color: var(--_accent-fg);
                 font-size: 12px; letter-spacing: 0; font-weight: 600; line-height: 18px; vertical-align: 1px; white-space: nowrap; }
.list .none { padding: 8px; }
/* Thin scrollbars inside the dialogs (chat, threads, the list), like macOS overlay ones, on a clear track. */
* { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--_fg) 24%, transparent) transparent; }
@supports not (scrollbar-width: thin) {
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--_fg) 24%, transparent); border-radius: 999px; }
}
.list .group { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--_muted); padding: 10px 8px 2px; }
.pin.held { border: 1.5px dashed var(--_muted); opacity: .85; }
/* Close: a round, quiet button with a drawn cross (not the \u2715 character), darker on hover. */
.list .tabs .show-done { color: var(--_muted); }
.chatwin .tabs b { display: none; } /* no "chat" title: the window speaks for itself */
.list .tabs .x { margin-left: auto; flex: none; width: 26px; height: 26px; padding: 0; border-radius: 50%; display: grid; place-items: center;
                 font-size: 0; color: var(--_muted); background: transparent; }
/* The cross is drawn with CSS: two thin bars, no picture. */
.list .tabs .x::before, .list .tabs .x::after { content: ''; grid-area: 1 / 1; width: 12px; height: 1.6px; border-radius: 1px; background: currentColor; transform: rotate(45deg); }
.list .tabs .x::after { transform: rotate(-45deg); }
.list .tabs .x:hover { color: var(--_fg); } /* hover: the cross darkens, nothing drawn behind it */
.list .tabs .x:focus-visible { outline: 2px solid var(--_accent); outline-offset: 1px; }
.chatwin .chat { flex: none; background: var(--_bg); padding: 6px 6px 8px; }
.chatwin .replying { flex: none; }
.chatwin .tabs b { padding: 4px 8px; font-weight: 600; margin-right: auto; }
.msgs { display: flex; flex-direction: column; gap: 8px; padding: 4px 10px 8px; overflow-x: hidden; }
.msgs > :first-child { margin-top: auto; } /* a short conversation sits by the box, like a chat */
/* Something just sent eases in; the arrow flies off and comes back. */
.fresh { animation: lab-rise .2s var(--_ease); }
.send.sent .arr { animation: lab-fly .32s var(--_ease); }
@keyframes lab-rise { from { opacity: 0; transform: translateY(6px); } }
@keyframes lab-fly { 45% { transform: translate(9px, -9px) scale(.6); opacity: 0; } 46% { transform: translate(-7px, 7px) scale(.6); opacity: 0; } }
.msg { max-width: 85%; padding: 7px 10px; border-radius: var(--_radius); background: var(--_soft); align-self: flex-start; }
.msg.mine { align-self: flex-end; background: color-mix(in srgb, rgb(52, 199, 89) 15%, var(--_bg)); color: var(--_fg); } /* yours: soft green, dark text */
.msg b { display: block; font-size: 12px; letter-spacing: 0; font-weight: 600; opacity: .7; margin-bottom: 1px; }
/* Each agent's messages in its own brand colour: the name in it, the bubble a soft wash of it (Leo, 15 Nov). */
.msg[data-agent=claude] { --_brand: #d97757; } .msg[data-agent=codex] { --_brand: #10a37f; } .msg[data-agent=cursor] { --_brand: #8a8a8e; }
.msg[data-agent=gemini] { --_brand: #4285f4; } .msg[data-agent=copilot] { --_brand: #8957e5; } .msg[data-agent=amp] { --_brand: #f34e3f; }
.msg[data-agent=opencode] { --_brand: #8a8a8e; }
.msg[data-agent] { background: color-mix(in srgb, var(--_brand) 11%, var(--_bg)); }
.msg[data-agent] > b { color: var(--_brand); opacity: 1; }
.msg.mine b { display: none; }
.msg { position: relative; } .mark { font-weight: 400; font-size: 11px; letter-spacing: .006em; color: var(--_muted); margin-left: 6px; white-space: nowrap; } .mark.done { color: rgb(36, 160, 70); font-weight: 600; font-size: 12px; letter-spacing: 0; } /* a small green tick, as the ticks on messages */
.msg .quote { display: block; border-left: 2px solid rgb(52, 199, 89); padding: 1px 0 1px 8px; margin: 3px 0 5px; font-size: 12px; letter-spacing: 0; line-height: 1.35;
              color: var(--_muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.msg .quote b { display: block; font-size: 12px; letter-spacing: 0; font-weight: 600; color: rgb(36, 160, 70); opacity: 1; margin: 0; } .mine .mark { color: inherit; opacity: .7; } a.link { color: inherit; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; } .msg.to { box-shadow: 0 0 0 2px var(--_accent); }
.msg .p { display: block; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; } /* no lone last word */ .msg .p.gap { margin-top: 6px; }
.msg .p.li { padding-left: 14px; text-indent: -14px; } .msg .p.li .mk { display: inline-block; width: 14px; text-indent: 0; opacity: .6; }
.msg i { display: block; font-style: normal; font-size: 12px; letter-spacing: 0; opacity: .7; margin-bottom: 1px; }
.msg b, .msg i { color: inherit; }
.msg .stamp { text-indent: 0; color: inherit; position: absolute; right: 10px; bottom: 6px; font-size: 10px; letter-spacing: .012em; line-height: 1; opacity: .55; font-variant-numeric: tabular-nums; }
.msg .stamp-room { text-indent: 0; visibility: hidden; display: inline-block; margin-left: 10px; font-size: 10px; letter-spacing: .012em; line-height: 1; height: 10px; white-space: nowrap; }
.msg .stamp-room * { font-size: inherit; }
.msg .tick { color: inherit; margin-left: 4px; letter-spacing: -.34em; font-size: 10px; } /* \u2713 drawn as tall as the time's digits */
.msg .tick.got { font-weight: 600; }
/* Your message the agent is on: the pin's turning green ring, small, by its time; answered: a green \u2713. */
.msg .stamp:is(.busy, .ans) { opacity: 1; } .msg .stamp:is(.busy, .ans) .tm { opacity: .55; }
.msg .stamp .tm { font-size: inherit; line-height: inherit; color: inherit; } /* every element gets 14 px by default: the time keeps the stamp's 10 */
.msg :is(.stamp, .stamp-room) .ring { position: relative; display: inline-block; width: 9px; height: 9px; margin-left: 5px; vertical-align: -1px; border-radius: 50%; overflow: hidden;
                    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1.5px));
                    mask: radial-gradient(farthest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1.5px)); }
.msg .stamp.ans .tick { color: rgb(36, 160, 70); letter-spacing: 0; font-weight: 600; }
/* One slot for the mark, whatever it is (\u2713, \u2713\u2713, the turning ring, the green \u2713): 12 px wide after a 4 px gap, so the
   time doesn't shift when one turns into another (Leo, 15 Nov: it flicked as \u2713 became the ring). */
.msg :is(.stamp, .stamp-room) .tick { display: inline-block; width: 12px; height: 10px; line-height: 10px; text-align: center; margin-left: 4px; vertical-align: top; }
.msg :is(.stamp, .stamp-room) .ring { margin: .5px 1.5px 0 5.5px; vertical-align: top; } /* the same 10 px tall as a \u2713, so the bubble keeps its height */
.msg .stamp { height: 10px; }
.replying { display: flex; gap: 6px; align-items: center; font-size: 12px; letter-spacing: 0; color: var(--_muted); padding: 2px 6px; }
.replying button { border: 0; background: none; color: inherit; cursor: pointer; margin-left: auto; font: inherit; }
.bar button * { color: inherit; font-weight: inherit; }
.bar .toggle:not(.secondary)::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--_accent); }
.bar button.secondary { color: var(--_muted); }
.bar button.secondary.has-new { color: var(--_fg); font-weight: 600; }
.bar button.go-btn.on { color: #fff; background: rgb(36, 160, 70); }
.bar .new-prev, .bar .new-next { padding: 9px 11px; font-size: 15px; letter-spacing: -.016em; line-height: 1; color: var(--_fg); }
.bar .list-btn, .bar .done-btn { font-variant-numeric: tabular-nums; min-width: 4.6em; justify-content: center; }
.bar button.quiet { opacity: .45; cursor: default; box-shadow: var(--_shadow); }
.bar button.go-btn.on kbd { color: #fff !important; }
.newline { display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: 0; font-weight: 500; color: var(--_muted); }
.newline::before, .newline::after { content: ''; flex: 1; height: 1px; background: currentColor; opacity: .35; }
/* The left side: who's listening, then copy link; the right side is the bar. */
.left { position: fixed; left: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
.left .copy-all { border: 0; border-radius: var(--_radius); padding: 9px 14px; cursor: pointer; background: var(--_bg); color: var(--_muted);
                  box-shadow: var(--_shadow); font: inherit; font-size: 13px; letter-spacing: -.006em; font-weight: 500; white-space: nowrap; }
.listener { display: inline-flex; gap: 6px; align-items: center; padding: 9px 14px; border-radius: var(--_radius);
       background: var(--_bg); color: var(--_fg); box-shadow: var(--_shadow); font-size: 13px; letter-spacing: -.006em; text-decoration: none; white-space: nowrap; }
.listener span { color: var(--_muted); }
/* The mark says the state: dark while an agent listens (its dot blinks now and then), green with twitching ears
   while one works, grey and still when nobody listens. Only transforms move, on three small shapes, so nothing else
   on the layer is redrawn (the old dot's ping was kept to transform and opacity for the same reason). */
.listener .lbl { display: contents; }
.mark { width: 16px; height: 16px; flex: none; overflow: visible; fill: var(--_accent); }
.mark .eye { fill: var(--_bg); }
.listener .mark { margin: -2px 0 -1px -3px; }
.listener.idle .mark { fill: var(--_muted); opacity: .5; }
.listener.working .mark { fill: rgb(36, 160, 70); }
.mark :is(.e1, .e2, .eye) { transform-box: fill-box; transform-origin: 35% 100%; }
.mark .eye { transform-origin: 50% 50%; }
.listener:not(.idle, .working) .mark .eye { animation: lab-blink 3.2s ease-in-out infinite; }
.listener.working .mark :is(.e1, .e2) { animation: lab-twitch 2.4s ease-in-out infinite; }
.listener.working .mark .e2 { animation-delay: .18s; }
@keyframes lab-blink { 0%, 88%, 100% { transform: scaleY(1); } 92%, 96% { transform: scaleY(.08); } }
@keyframes lab-twitch { 0%, 62%, 100% { transform: rotate(0); } 70% { transform: rotate(-9deg); } 80% { transform: rotate(5deg); } 90% { transform: rotate(-3deg); } }
.listener { cursor: default; } /* a plain arrow, also where a tap copies the resume command */
/* Letter spacing follows the size, as Apple's SF text does: looser below 12 px, tighter above (11 +.006em,
   13 \u2212.006, 15 \u2212.016, 17 \u2212.025). Uppercase labels and the \u2713\u2713 overlap keep their own. */
/* Keys whisper: a small grey letter, no chip; a bit clearer while the pointer is on the bar. */
kbd { font-size: 10px; letter-spacing: .012em; line-height: 17px; min-width: 0; padding: 0 1px; text-align: center; background: none;
      color: var(--_muted) !important; opacity: .45; transition: opacity .15s; }
.bar:hover kbd { opacity: .75; }
.bar button kbd { margin-left: -4px; } /* the hint sits close to its word: chat (c) */
.bar button.go-btn kbd { font-size: inherit; line-height: inherit; opacity: 1; margin-left: 0; } /* (1/2/3) reads like (c)hat and ne(w) */
/* One bar of segments, a hairline between them; the less used ones in the \u22EF menu above it (phones too: same bar, bigger to tap). */
@media all {
  .bar { gap: 0; background: var(--_bg); border-radius: var(--_radius); box-shadow: var(--_shadow); overflow: hidden; }
  .bar > button { box-shadow: inset .5px 0 0 var(--_line); border-radius: 0; background: none; padding: 8px 12px; gap: 6px; }
  .bar > button.first { box-shadow: none; }
  .bar > button:not(:disabled):hover { background: var(--_hover); }
  .bar > button:active { transform: none; background: var(--_hover); }
  .bar > button.quiet { opacity: 1; box-shadow: inset .5px 0 0 var(--_line); color: var(--_muted); }
  .bar > button.quiet.first { box-shadow: none; }
  .bar .list-btn, .bar .done-btn { min-width: 0; }
  .bar .mn { color: var(--_muted); font-weight: 400; }
  /* Words stay grey (as the bar's buttons were); the count is the one thing in the text colour: a plain number. */
  .bar > button.secondary, .bar > button.secondary.has-new { color: var(--_muted); font-weight: 500; }
  .bar .chat-btn, .bar .list-btn { align-items: baseline; } /* the number sits on the word's line */
  .bar .cnt { font-size: 12px; letter-spacing: 0; font-weight: 400; line-height: 16px; text-align: center; background: none; color: var(--_fg); font-variant-numeric: tabular-nums; }
  .bar .cnt.zero { color: var(--_muted); }
  .bar button.go-btn.on { background: none; color: var(--_fg); }
  .bar button.go-btn.on kbd { color: var(--_muted) !important; }
  .gp { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 11px 11px 11px 2px; font-size: 10px; letter-spacing: .012em; font-weight: 600;
        color: rgb(36, 160, 70); box-shadow: inset 0 0 0 1.25px rgb(36, 160, 70); transition: background-color .2s, color .2s; }
  .go-btn.on .gp { background: rgb(36, 160, 70); color: #fff; }
  /* 1, comment: your own pin, small: your initial in a white pin with the pins' edge. */
  .go-btn:not(.on):not(.cursor) .gp { color: var(--_fg); background: var(--_bg); box-shadow: inset 0 0 0 1px var(--_edge); font-size: 10px; letter-spacing: .012em; }
  /* 3, cursor: the switch is the same pin in grey, saying "off" (regular, a touch bigger than go's bold). */
  .go-btn.cursor .gp { box-shadow: inset 0 0 0 1.25px var(--_muted); color: transparent; position: relative; }
  .go-btn.cursor .gp::after { content: 'off'; position: absolute; inset: 0; display: grid; place-items: center; color: var(--_muted);
                              font-size: 10px; font-weight: 400; letter-spacing: .012em; }
  .more { font-size: 15px !important; letter-spacing: .05em; }
  .more-menu { position: fixed; right: 16px; bottom: 60px; display: grid; min-width: 180px; padding: 4px; background: var(--_bg);
               border-radius: var(--_radius); box-shadow: var(--_shadow); animation: lab-fade .12s ease-out; }
  .more-menu[hidden] { display: none; }
  .more-menu button { border: 0; background: none; text-align: left; font: inherit; font-size: 13px; letter-spacing: -.006em; color: var(--_fg); padding: 7px 10px;
                      border-radius: var(--_r-s); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; white-space: nowrap; }
  .more-menu button:hover:not(:disabled) { background: var(--_hover); }
  .more-menu button:disabled { color: var(--_muted); cursor: default; }
  .more-menu button[hidden] { display: none; }
  .more-menu kbd { margin: 0; }
}
kbd::before { content: '('; } kbd::after { content: ')'; } /* read as a hint: chat (c) */
.hint { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); background: var(--_bg); color: var(--_muted);
        box-shadow: var(--_shadow); padding: 8px 14px; border-radius: var(--_radius); font-size: 13px; pointer-events: none; white-space: nowrap;
        letter-spacing: -.006em; animation: lab-fade .2s ease-out; }
/* 16px fields keep iOS from zooming the page when one is focused. */
@media (pointer: coarse) { .box textarea, .who input { font-size: 16px; letter-spacing: -.019em; } kbd { display: none; }
  .box textarea { line-height: 22px; padding: 7px 0; } /* phones: 22 + 7 + 7 = 36, the send button's size */
  .box.one .who { line-height: 22px; padding-bottom: 7px; } }
@keyframes lab-fade { from { opacity: 0; } }
/* Movement only: a page in the background can stall an animation, and a card stalled mid-fade showed the page through it. */
@keyframes lab-in { from { transform: translateY(4px) scale(.98); } }
@keyframes lab-sheet-in { from { transform: translateY(100%); } }
@keyframes lab-sheet-out { to { transform: translateY(100%); } }
@keyframes lab-out { to { opacity: 0; transform: translateY(2px) scale(.985); } }
/* Continuous (Apple-style) corners where the browser draws them; plain rounding elsewhere. */
/* Apple's continuous corners (squircle) where the browser draws them (Safari 26, Chrome): the same three sizes, a
   smooth curve instead of a circle arc (a squircle needs about 1.8 times the radius to look the same size).
   Circles and the pin's teardrop stay as they are. */
@supports (corner-shape: squircle) {
  :host { --_radius: calc(var(--lab-radius, 12px) * 1.8); --_r-s: 11px; }
  *, *::before, *::after { corner-shape: squircle; }
  .pin, .pin .ring, .pin.new::after, .dot, .send, .list .tabs .x, .bar .toggle:not(.secondary)::before,
  .msg :is(.stamp, .stamp-room) .ring, .gp { corner-shape: round; } /* circles stay circles */
}
@keyframes lab-pin { from { transform: scale(1.1); } }
@keyframes lab-halo { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--_fg) 12%, transparent); }
                      to { box-shadow: 0 0 0 16px color-mix(in srgb, var(--_fg) 0%, transparent); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media (max-width: 480px) { kbd { display: none; } }
.handle { display: none; }
/* Phones: a thread or a new comment opens as a sheet from the bottom, full width, instead of beside the pin. */
@media (pointer: coarse) and (max-width: 560px), (pointer: coarse) and (max-height: 500px) { /* phones, upright or on their side */
  /* Sheets fit what the screen shows (--lab-vh, the visible height, and --lab-kb, the keyboard over the page's
     bottom, are kept up to date from visualViewport); their bottom part is solid down past the screen's edge,
     behind the home bar, the keyboard and Safari's toolbar, so nothing of the page shows below the box. */
  :host { --_safe: env(safe-area-inset-bottom, 0px); --_kb: var(--lab-kb, 0px);
          --_sheet-max: calc(min(72dvh, var(--lab-vh, 100dvh) - 24px) + var(--_kb)); --_pb: calc(12px + var(--_safe) + var(--_kb)); }
  :host([data-kb]) { --_safe: 0px; --_kb: 0px; --_pb: 10px; }
  /* Keyboard up: a thread, the list and the chat fill exactly what the screen shows, like a native composer, so iOS
     panning the page can't push it up and nothing of the page shows above or below it. */
  :host([data-kb]) :is(.card, .list:not([hidden])) { top: var(--lab-top, 0px) !important; bottom: auto !important;
    height: var(--lab-vh, 100dvh) !important; max-height: none !important; border-radius: 0; }
  /* A new comment stays small, just above the keyboard, with the page (dimmed) above it: you see what you comment on. */
  :host([data-kb]) .float { top: auto !important; bottom: var(--lab-kb, 0px) !important; height: auto !important; border-radius: var(--_radius) var(--_radius) 0 0; }
  .card, .float { position: fixed; left: 0 !important; right: 0; top: auto !important; bottom: 0; width: auto; max-width: none;
                  max-height: var(--_sheet-max); display: flex; flex-direction: column; border-radius: var(--_radius) var(--_radius) 0 0; padding: 8px 0 0; z-index: 3; }
  .card::after, .float::after, .list::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 100vh; background: var(--_bg); }
  /* The same 12 px sides as the chat's, so a thread's reply box sits exactly where the chat's message box does. */
  .card > .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 12px 4px; margin-right: 0; }
  /* A thread keeps one height, as the chat does (Leo, 15 Nov: it jumped while the chat stays put): the sheet's full
     height whatever its length, a short thread sitting by the reply box, so new replies and the keyboard never
     move its top. */
  .card { height: var(--_sheet-max); }
  .card > .foot, .float > .composer { flex: none; padding: 0 12px var(--_pb); }
  .card > .foot { margin-top: 0; padding-top: 6px; }
  .card .composer { margin-top: 0; }
  .card > .nav { flex: none; margin: -6px 0 0; padding: 0 12px; gap: 20px; }
  .card .nav .btn { font-size: 14px; letter-spacing: -.011em; padding: 0 2px; min-height: 44px; display: inline-flex; align-items: center; } /* 44 px tall to tap (iOS 44 pt) */
  .card .nav { gap: 16px; }
  .card .nav { flex-wrap: wrap; row-gap: 0; } /* too narrow for one row: reopen / delete drop under, on the right */
  .card .nav .acts { margin: 0 0 0 auto; gap: 20px; }
  .box.one .who span { font-size: 16px; letter-spacing: -.019em; } /* "as" the size of the name beside it */ /* reopen / delete share the prev / next row, on the right */
  .card .nav .acts button.btn { font-size: 14px; letter-spacing: -.011em; }
  .float { background: var(--_bg); box-shadow: var(--_shadow); }
  /* The grab handle: the sheet's top strip, where a drag down moves it. The header of the list and the chat does the same. */
  /* Reaching 60 px above the sheet's edge over the dimmed page (Leo, 15 Nov: "the whole top and a bit above", then
     "do more"); the bar and the layout stay as they were. The chat's and the list's header reach up the same way. */
  .handle { display: block; flex: none; height: 86px; margin-top: -68px; touch-action: none; position: relative;
          background: linear-gradient(color-mix(in srgb, var(--_fg) 18%, transparent) 0 0) center 68px / 36px 4px no-repeat; }
  .list .tabs { position: relative; }
  .list .tabs::before { content: ''; position: absolute; left: 0; right: 0; top: -60px; height: 60px; }
  .list .tabs { touch-action: pan-x; }
  .chatwin .tabs { touch-action: none; }
  .list .items, .msgs, .card > .body { touch-action: pan-y; }
  .list .tabs .x { display: none; } /* the handle, a swipe down or a tap on the dimmed page closes it */

  :host([data-sheet]) :is(.hint, .listener, .left) { visibility: hidden; }
  /* The bar steps down under the screen's edge while a sheet is open and comes back as the sheet goes: --lab-p is
     how far the sheet is on its way out (0 open, 1 gone), set while a finger drags it and while it slides away,
     so the bar rises with it, in step, instead of after it (Leo, 15 Nov). */
  .bar { transition: transform .34s cubic-bezier(.32, .72, 0, 1), opacity .2s; }
  :host([data-sheet]) .bar { transform: translateY(calc((100% + 16px + env(safe-area-inset-bottom, 0px)) * (1 - var(--lab-p, 0))));
                             opacity: var(--lab-p, 0); pointer-events: none;
                             transition: transform .24s cubic-bezier(.4, 0, 1, 1), opacity .2s .04s; }
  :host([data-sheet]) .bar button { pointer-events: none; }
  /* A sheet stands apart from the page: the page dims behind it (a tap there closes it), and scrolling inside a
     sheet never scrolls the page. */
  :host([data-sheet]) .scrim { display: block; animation: lab-fade .22s ease-out; }
  .card.in, .float.in, .list:not([hidden]) { animation: lab-sheet-in .28s cubic-bezier(.2, .8, .2, 1); }
  .card.out, .float.out { animation: lab-sheet-out .22s cubic-bezier(.4, 0, 1, 1) forwards; }
  .list { left: 0; right: 0; bottom: 0 !important; width: auto; max-height: var(--_sheet-max); overflow: visible; border-radius: var(--_radius) var(--_radius) 0 0;
          font-size: 15px; letter-spacing: -.016em; z-index: 3; }
  /* The chat keeps one height (new messages don't move its top) and opens at the newest. */
  .chatwin { height: var(--_sheet-max); transition: height .38s cubic-bezier(.32, .72, 0, 1); }
  /* Pulled up: the chat takes the whole screen, below the status bar (iOS large / Android expanded). */
  .chatwin.full, .card.full { height: calc(var(--lab-vh, 100dvh) - env(safe-area-inset-top, 0px) - 10px + var(--_kb)); max-height: none; }
  .card { transition: height .38s cubic-bezier(.32, .72, 0, 1); } /* a comment pulls up to full height as the chat does */
  /* The header is the sheet's top edge, grab handle drawn on it; the list scrolls below it, never under or above it. */
  .list .tabs { flex-wrap: nowrap; overflow-x: auto; padding: 18px 12px 8px; border-radius: var(--_radius) var(--_radius) 0 0;
                background: linear-gradient(color-mix(in srgb, var(--_fg) 18%, transparent) 0 0) center 8px / 36px 4px no-repeat, var(--_bg); }
  .list .items { padding: 0 12px calc(10px + var(--_safe)); }
  .chatwin .msgs { padding: 4px 12px 8px; }
  .chatwin .tabs { padding: 18px 12px 0; } /* just the grab strip, as tall as a thread's */
  .chatwin .chat { padding: 6px 12px var(--_pb); }
  /* Glass reply boxes (Leo, 15 Nov; iOS 26's look, Android too): the messages scroll on under the box and show
     through it, blurred. Only the box's own strip overlaps; the new / resolve / delete row stays on the sheet. */
  .chatwin .msgs { margin-bottom: calc(-56px - var(--_pb)); padding-bottom: calc(64px + var(--_pb)); }
  .card > .body { margin-bottom: calc(-56px - var(--_pb)); padding-bottom: calc(64px + var(--_pb)); }
  /* \u2026and fade out behind the box (iOS's scroll edge): from 4 px above its top to 12% at its bottom (Leo, 15 Nov:
     "behind input bottom", "a bit more", "less, it's just black", then "more, darker there"). */
  .chatwin .msgs { -webkit-mask-image: linear-gradient(#000 calc(100% - 60px - var(--_pb)), rgba(0,0,0,.12) calc(100% - var(--_pb)));
                           mask-image: linear-gradient(#000 calc(100% - 60px - var(--_pb)), rgba(0,0,0,.12) calc(100% - var(--_pb))); }
  .card > .body { -webkit-mask-image: linear-gradient(#000 calc(100% - 60px - var(--_pb)), rgba(0,0,0,.12) calc(100% - var(--_pb)));
                          mask-image: linear-gradient(#000 calc(100% - 60px - var(--_pb)), rgba(0,0,0,.12) calc(100% - var(--_pb))); }
  .chatwin .chat, .card > .foot { position: relative; z-index: 1; background: none; }
  :host { --_box-bg: color-mix(in srgb, var(--_bg) 72%, transparent);
          --_box-edge: inset 0 0 0 .5px color-mix(in srgb, var(--_fg) 16%, transparent), 0 4px 18px rgba(0, 0, 0, .08); }
  .float { --_box-bg: inherit; --_box-edge: inherit; } /* phones: the new comment sheet's box is the same glass */
  .box { -webkit-backdrop-filter: blur(18px) saturate(1.8); backdrop-filter: blur(18px) saturate(1.8); }
  .list .it { padding: 11px 8px; }
  /* Pins a size smaller (22 px), the tail still on the spot: 28 px covered words on a phone. Moved ones smaller still. */
  .pin { scale: .8; }
  /* Messages at 15 px (13 on computers): closer to the phone's own 17 px text, threads still short. */
  .msg .p { font-size: 15px; letter-spacing: -.016em; line-height: 21px; }
  .msg .quote { font-size: 14px; letter-spacing: -.011em; }
  .msg b, .msg .quote b { font-size: 12px; letter-spacing: 0; }
  .pin.moved { scale: .64; }
  /* The same one bar as on computers, each segment 44 px tall to tap (iOS 44 pt); the menu opens above it. */
  .bar > button { padding: 12px 14px; min-height: 44px; }
  .more-menu { bottom: 72px; min-width: 200px; }
  .more-menu button { padding: 11px 12px; font-size: 15px; letter-spacing: -.016em; }
}
/* Reaches past the screen's edges, under Safari's status bar and toolbar, so the page is dimmed everywhere. */
.scrim { cursor: pointer; display: none; position: fixed; inset: -50vh 0; background: rgba(0, 0, 0, .4); z-index: 2; touch-action: none; }
.sel-chip { position: fixed; transform: translateX(-50%); border: 0; border-radius: var(--_radius); padding: 8px 14px; background: var(--_fg);
            color: var(--_bg); font: 500 14px/1 var(--_font, inherit); box-shadow: var(--_shadow); z-index: 4; }
/* Phones: the listening label is the mark on the "chat" button (dark and blinking now and then: listening,
   green with twitching ears: working, grey: nobody), the bar goes back to the bottom, and the send button is big
   enough for a thumb. */
@media (pointer: coarse) and (max-width: 560px), (pointer: coarse) and (max-height: 500px) { /* phones, upright or on their side */
  .listener { display: none !important; }
  .bar { bottom: 16px !important; }
  .hint { bottom: 64px !important; }
  .chat-btn .mark { align-self: center; margin: 0 0 0 -2px; }
  .chat-btn[data-agent=away] .mark { fill: var(--_muted); opacity: .5; }
  .chat-btn[data-agent=working] .mark { fill: rgb(36, 160, 70); }
  .chat-btn[data-agent=listening] .mark .eye { animation: lab-blink 3.2s ease-in-out infinite; }
  .chat-btn[data-agent=working] .mark :is(.e1, .e2) { animation: lab-twitch 2.4s ease-in-out infinite; }
  .chat-btn[data-agent=working] .mark .e2 { animation-delay: .18s; }
  .send { width: 36px; height: 36px; }
  .send .arr { width: 17px; height: 15px; margin: auto; }
}
/* Narrow screens: the buttons sit a row above the listening label, so neither covers the other. */
@media (max-width: 560px) { .bar { bottom: 64px; } .hint { bottom: 112px; } .list { bottom: 114px; } }
[hidden] { display: none !important; }
`;

  // src/widget/anchoring.ts
  var host;
  var layer;
  var el;
  var store;
  function bindAnchoring(deps) {
    ({ host, layer, el, store } = deps);
  }
  function selectorFor(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) index++;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    return parts.length ? (parts[0].startsWith("#") ? "" : "body > ") + parts.join(" > ") : "body";
  }
  var docWidth = () => Math.max(document.documentElement.scrollWidth, 1);
  var clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  var short = (v, n) => (v || "").replace(/\s+/g, " ").trim().slice(0, n);
  function fileHint(url) {
    if (!url || url.startsWith("data:")) return "";
    try {
      const u = new URL(url, location.href);
      const inner = u.searchParams.get("href") || u.searchParams.get("url");
      if (inner && /\/_(image|vercel\/image|next\/image)/.test(u.pathname)) return fileHint(inner);
      const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      let name = parts.pop() || "";
      if (/^w?\d+(x\d+)?\.\w+$/i.test(name) && parts.length) name = parts.pop();
      return name.replace(/\.(avif|webp|jpe?g|png|gif|svg|mp4|webm|mov)$/i, "").replace(/[._-][A-Za-z0-9_-]{8}$/, "");
    } catch {
      return "";
    }
  }
  var mediaSrc = (m) => {
    const src = m.currentSrc || m.getAttribute("src") || "";
    if (src && !src.startsWith("data:")) return new URL(src, location.href).href;
    const lazy = m.dataset?.src || (m.getAttribute("srcset") || m.dataset?.srcset || "").split(/\s+/)[0];
    return lazy ? new URL(lazy, location.href).href : "";
  };
  function naturalSpot(m, rect, cx, cy, nw, nh) {
    if (!nw || !nh || !rect.width || !rect.height) return null;
    const cs = getComputedStyle(m);
    const fit = cs.objectFit || "fill";
    const pos = (cs.objectPosition || "50% 50%").split(/\s+/).map(
      (v) => v.endsWith("%") ? parseFloat(v) / 100 : { left: 0, top: 0, right: 1, bottom: 1 }[v] ?? 0.5
    );
    const sx = rect.width / nw;
    const sy = rect.height / nh;
    const scale = { cover: Math.max(sx, sy), contain: Math.min(sx, sy), none: 1, "scale-down": Math.min(1, sx, sy) }[fit];
    const dw = nw * (scale ?? sx);
    const dh = nh * (scale ?? sy);
    const ox = (rect.width - dw) * (pos[0] ?? 0.5);
    const oy = (rect.height - dh) * (pos[1] ?? pos[0] ?? 0.5);
    return { fit, nw, nh, imgX: clamp01((cx - rect.left - ox) / dw), imgY: clamp01((cy - rect.top - oy) / dh) };
  }
  function fileSize(img) {
    let nw = img.naturalWidth;
    let nh = img.naturalHeight;
    const sets = [img.srcset, ...[...img.closest("picture")?.querySelectorAll("source") || []].map((s) => s.srcset)].filter(Boolean);
    for (const set of sets) {
      for (const part of set.split(/,\s+/)) {
        const [url, d3 = "1x"] = part.trim().split(/\s+/);
        let abs = "";
        try {
          abs = new URL(url, location.href).href;
        } catch {
        }
        if (!url || abs !== img.currentSrc || !nw) continue;
        const v = parseFloat(d3);
        if (d3.endsWith("w") && v) return { nw: Math.round(v), nh: Math.round(v * nh / nw) };
        if (d3.endsWith("x") && v) return { nw: Math.round(nw * v), nh: Math.round(nh * v) };
      }
    }
    return { nw, nh };
  }
  var PLAIN_NAME = /^[A-Z][A-Za-z0-9]{2,}$/;
  var PLUMBING = /(Provider|Context|Consumer|Boundary|Slot|Portal|Fragment|Presence|Scope|Trap|Root)$/;
  var variantOf = (p) => ["variant", "size", "tone", "intent", "kind"].flatMap((k) => (typeof p?.[k] === "string" || typeof p?.[k] === "number") && /^[\w.-]{1,20}$/.test(String(p[k])) ? [`${k}=${p[k]}`] : []).join(" ");
  var repoPath = (url) => !/^[a-z-]+:\/\//i.test(url) ? url : decodeURIComponent(url.replace(/^[a-z-]+:\/\/\/?(\.\/)?/i, "/").replace(/^\/[^/]*:\d+/, "").split("?")[0]).replace(/^\/(@fs)?/, "").replace(/^\(app-pages-browser\)\/\.?\/?/, "");
  function componentAt(el2) {
    const name = (t, d3 = 0) => d3 > 3 ? "" : typeof t === "function" ? t.displayName || t.name || "" : t && typeof t === "object" ? t.displayName || name(t.render || t.type, d3 + 1) : "";
    const plain = (n) => PLAIN_NAME.test(n) && !PLUMBING.test(n);
    const srcOf = (f) => {
      const d3 = f?._debugSource;
      if (d3?.fileName) return `${repoPath(String(d3.fileName))}:${d3.lineNumber || 0}`;
      const st = f?._debugStack?.stack;
      if (typeof st !== "string") return "";
      for (const line of st.split("\n").slice(1)) {
        const m = /((?:https?|webpack-internal|file):\/\/[^\s()]+?):(\d+):\d+\)?\s*$/.exec(line);
        if (m && !/node_modules|react-dom|react-jsx|jsx-dev-runtime|react-server|scheduler/.test(m[1])) return `${repoPath(m[1])} (line ${m[2]} as served, may differ from the source)`;
      }
      return "";
    };
    const key = Object.keys(el2).find((k) => k.startsWith("__reactFiber$"));
    if (key) {
      const host2 = el2[key];
      const parts = [];
      let usedAt = "";
      for (let f = host2?.return, i = 0; f && parts.length < 2 && i < 80; f = f.return, i++) {
        if (typeof f.type === "string") continue;
        const n = name(f.type);
        if (!plain(n)) continue;
        if (!parts.length) usedAt = srcOf(f);
        const v = variantOf(f.memoizedProps);
        parts.push(v ? `${n} ${v}` : n);
      }
      if (!parts.length) return srcOf(host2) ? { source: srcOf(host2) } : {};
      return { component: parts.length > 1 ? `${parts[0]} (in ${parts[1]})` : parts[0], source: srcOf(host2) || void 0, usedAt: usedAt || void 0 };
    }
    const vue = el2.__vueParentComponent;
    if (vue?.type) {
      const n = vue.type.name || vue.type.__name || (vue.type.__file || "").replace(/^.*\//, "").replace(/\.vue$/, "");
      const parent = vue.parent?.type;
      const pn = parent && (parent.name || parent.__name);
      const v = variantOf(vue.props);
      return { component: `${n}${v ? " " + v : ""}${pn ? ` (in ${pn})` : ""}`, source: vue.type.__file ? repoPath(vue.type.__file) : void 0, usedAt: parent?.__file ? repoPath(parent.__file) : void 0 };
    }
    const loc = el2.__svelte_meta?.loc;
    if (loc?.file) return { component: loc.file.replace(/^.*\//, "").replace(/\.svelte$/, ""), source: `${repoPath(loc.file)}:${loc.line ?? 0}` };
    return {};
  }
  function looksOf(el2) {
    const cs = getComputedStyle(el2);
    const names = /* @__PURE__ */ new Map();
    const NONE = "rgb(1, 2, 3)";
    const wrap = document.createElement("i");
    wrap.style.cssText = `display:none;color:${NONE}`;
    const probe = wrap.appendChild(document.createElement("i"));
    document.body.append(wrap);
    for (const prop of [...getComputedStyle(document.documentElement)].filter((p) => p.startsWith("--")).slice(0, 400)) {
      probe.style.color = "";
      probe.style.color = `var(${prop})`;
      const v = getComputedStyle(probe).color;
      if (v && v !== NONE && !names.has(v)) names.set(v, prop);
    }
    wrap.remove();
    const say = (v) => names.has(v) ? `${names.get(v)} ${v}` : v;
    const out = [];
    if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor)) out.push(`fill ${say(cs.backgroundColor)}`);
    out.push(`text ${say(cs.color)} ${cs.fontSize}/${cs.fontWeight}`);
    if (parseFloat(cs.borderTopLeftRadius)) out.push(`radius ${cs.borderTopLeftRadius}`);
    return short(out.join(", "), 200);
  }
  function untransform(el2, cx, cy) {
    const t = getComputedStyle(el2).transform;
    if (!t || t === "none") return null;
    const m = new DOMMatrix(t);
    if (m.isIdentity) return null;
    const w = el2.offsetWidth || el2.getBoundingClientRect().width;
    const h = el2.offsetHeight || el2.getBoundingClientRect().height;
    const [ox, oy] = getComputedStyle(el2).transformOrigin.split(" ").map(parseFloat);
    const at = (x, y) => m.transformPoint(new DOMPoint(x - ox, y - oy));
    const corners = [at(0, 0), at(w, 0), at(0, h), at(w, h)];
    const r = el2.getBoundingClientRect();
    const origin = { x: r.left - Math.min(...corners.map((p) => p.x)), y: r.top - Math.min(...corners.map((p) => p.y)) };
    const q = m.inverse().transformPoint(new DOMPoint(cx - origin.x, cy - origin.y));
    return { rect: { left: 0, top: 0, width: w, height: h }, x: q.x + ox, y: q.y + oy };
  }
  function svgImageSpot(el2, anchor, cx, cy) {
    const r = el2.getBoundingClientRect();
    const keep = (el2.getAttribute("preserveAspectRatio") || "xMidYMid meet").split(/\s+/);
    const fill = (iw, ih) => {
      if (!iw || !ih || !r.width || !r.height) return;
      let [dw, dh] = [r.width, r.height];
      if (keep[0] !== "none") {
        const k = (keep[1] === "slice" ? Math.max : Math.min)(r.width / iw, r.height / ih);
        [dw, dh] = [iw * k, ih * k];
      }
      const align = (v, room) => v === "Min" ? 0 : v === "Max" ? room : room / 2;
      const ox = keep[0] === "none" ? 0 : align(keep[0].slice(1, 4), r.width - dw);
      const oy = keep[0] === "none" ? 0 : align(keep[0].slice(5, 8), r.height - dh);
      Object.assign(anchor, { nw: iw, nh: ih, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
    };
    const probe = new Image();
    probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
    probe.src = anchor.src;
    if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
  }
  function backgroundSpot(n, url, anchor, cx, cy) {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    const layers = (v) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
    const at = Math.max(0, layers(cs.backgroundImage).findIndex((l) => l.includes(url)));
    const pick = (v) => {
      const l = layers(v);
      return l[at % l.length];
    };
    const fill = (iw, ih) => {
      if (!iw || !ih || !r.width || !r.height) return;
      const size = pick(cs.backgroundSize);
      let dw = iw;
      let dh = ih;
      if (size === "cover" || size === "contain") {
        const k = (size === "cover" ? Math.max : Math.min)(r.width / iw, r.height / ih);
        dw = iw * k;
        dh = ih * k;
      } else if (size !== "auto" && size !== "auto auto") {
        const [w, h = "auto"] = size.split(/\s+/);
        const len = (v, of) => v.endsWith("%") ? parseFloat(v) / 100 * of : parseFloat(v);
        dw = w === "auto" ? NaN : len(w, r.width);
        dh = h === "auto" ? NaN : len(h, r.height);
        if (Number.isNaN(dw) && Number.isNaN(dh)) [dw, dh] = [iw, ih];
        else if (Number.isNaN(dw)) dw = dh * iw / ih;
        else if (Number.isNaN(dh)) dh = dw * ih / iw;
      }
      const [px = "50%", py = "50%"] = pick(cs.backgroundPosition).split(/\s+/);
      const off = (v, room) => v.endsWith("%") ? parseFloat(v) / 100 * room : parseFloat(v) || 0;
      const ox = off(px, r.width - dw);
      const oy = off(py, r.height - dh);
      Object.assign(anchor, { nw: iw, nh: ih, fit: `background ${size}`, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
    };
    const probe = new Image();
    probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
    probe.src = url;
    if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
  }
  function between(target, cy) {
    const kids = [...target.children].filter((k) => k !== host && k.getBoundingClientRect().height > 0);
    let above = null;
    let below = null;
    for (const k of kids) {
      const kr = k.getBoundingClientRect();
      if (kr.bottom <= cy) above = k;
      else if (kr.top >= cy && !below) below = k;
      else if (kr.top < cy && kr.bottom > cy) return null;
    }
    const say = (k) => {
      if (!k) return void 0;
      const h = k.matches("h1, h2, h3, h4, h5, h6") ? k : k.querySelector("h1, h2, h3, h4, h5, h6");
      return short(`${openingTag(k)} "${short((h || k).textContent, 60)}"`, 160);
    };
    return above || below ? { above: say(above), below: say(below) } : null;
  }
  function schemeAt(target) {
    for (let n = target; n; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m || m[4] !== void 0 && parseFloat(m[4]) < 0.5) continue;
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const hex = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      return { scheme: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light", background: hex };
    }
    return { scheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" };
  }
  function quoteAt(cx, cy, shadowRoots = []) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      const p = shadowRoots.length ? document.caretPositionFromPoint(cx, cy, { shadowRoots }) : document.caretPositionFromPoint(cx, cy);
      if (p) {
        node = p.offsetNode;
        offset = p.offset;
      }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(cx, cy);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }
    if (!node || node.nodeType !== 3 || !node.data.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const hit = [...range.getClientRects()].some((r) => cx >= r.left - 4 && cx <= r.right + 4 && cy >= r.top - 4 && cy <= r.bottom + 4);
    if (!hit) return null;
    const text = node.data;
    let a = offset;
    let b = offset;
    const seg = /[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(text) && typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(node.parentElement?.closest("[lang]")?.lang || void 0, { granularity: "word" }) : null;
    if (seg) {
      for (const w of seg.segment(text)) {
        if (offset >= w.index && offset <= w.index + w.segment.length && w.segment.trim()) {
          a = w.index;
          b = w.index + w.segment.length;
          if (offset < b) break;
        }
      }
    } else {
      while (a > 0 && /\S/.test(text[a - 1])) a--;
      while (b < text.length && /\S/.test(text[b])) b++;
    }
    const block = node.parentElement?.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, a, button, label, span, div") || node.parentElement;
    const full = block?.textContent || text;
    const before = full.slice(0, full.indexOf(text) + a);
    const after = full.slice(full.indexOf(text) + b);
    const squash = (v) => v.replace(/\s+/g, " ");
    const quote = {
      exact: short(text.slice(a, b), 80),
      prefix: squash(before.slice(-80)).replace(/^\s+/, "").slice(-40),
      suffix: squash(after.slice(0, 80)).replace(/\s+$/, "").slice(0, 40)
    };
    const pre = node.parentElement?.closest("pre, [data-file]") || (getComputedStyle(node.parentElement).whiteSpace.startsWith("pre") ? node.parentElement : null);
    const codeTable = !pre && node.parentElement?.closest('table[data-file], table[class*="code" i]');
    if (pre || codeTable) {
      const box = pre || codeTable;
      const r = document.createRange();
      r.setStart(box, 0);
      r.setEnd(node, offset);
      let upto = r.toString();
      let all = box.textContent;
      const breaks = [...box.querySelectorAll("br, tr")];
      if ((box.localName === "table" || !all.includes("\n")) && breaks.length) {
        const ends = box.querySelectorAll("br").length ? [...box.querySelectorAll("br")] : [...box.querySelectorAll("tr")].slice(0, -1);
        const before2 = ends.filter((e) => e.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !e.contains(node)).length;
        const lineRange = document.createRange();
        if (before2) lineRange.setStartAfter(ends[before2 - 1]);
        else lineRange.setStart(box, 0);
        if (ends[before2]) lineRange.setEndBefore(ends[before2]);
        else lineRange.setEnd(box, box.childNodes.length);
        const row2 = box.querySelectorAll("br").length ? null : node.parentElement?.closest("tr");
        quote.line = short((row2 ? row2.textContent : lineRange.toString()).trim(), 200);
        quote.lineNo = before2 + 1;
        quote.lines = ends.length + (box.querySelectorAll("br").length ? 0 : 1);
      } else {
        const from = upto.lastIndexOf("\n") + 1;
        const to = all.indexOf("\n", upto.length);
        quote.line = short(all.slice(from, to < 0 ? void 0 : to).trim(), 200);
        quote.lineNo = upto.split("\n").length;
        quote.lines = all.replace(/\n$/, "").split("\n").length;
      }
      const row = node.parentElement?.closest("tr, [data-line], [data-line-number]");
      if (row) {
        const cell = row.matches("[data-line], [data-line-number]") ? row : row.querySelector("[data-line], [data-line-number]");
        const n = cell?.getAttribute("data-line") || cell?.getAttribute("data-line-number") || [...row.children].map((c) => c.textContent.trim()).find((t) => /^\d+$/.test(t));
        if (n && /^\d+$/.test(n)) quote.pageLineNo = Number(n);
      }
      let label = box.closest("[data-file]")?.getAttribute("data-file") || box.getAttribute("title") || box.getAttribute("aria-label") || "";
      for (let el2 = box.parentElement, i = 0; !label.trim() && el2 && el2 !== document.body && i < 3; el2 = el2.parentElement, i++) {
        label = el2.querySelector(':scope > figcaption, :scope > [class*="title" i]')?.textContent || "";
      }
      if (label.trim()) quote.label = short(label.trim(), 120);
    }
    return quote;
  }
  function openingTag(node) {
    const attrs = [...node.attributes].filter((a) => /^(id|class|alt|role|aria-label|href|data-[\w-]+)$/.test(a.name)).map((a) => `${a.name}="${short(a.value, 60)}"`);
    return `<${node.localName}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`.slice(0, 200);
  }
  function sameKind(node, tag) {
    if (!tag) return true;
    const want = /^<([\w-]+)/.exec(tag)?.[1];
    if (node.localName !== want) return false;
    const id = / id="([^"]*)"/.exec(tag)?.[1];
    if ((id || "") !== short(node.id || "", 60)) return false;
    const classes = (/ class="([^"]*)"/.exec(tag)?.[1] || "").split(/\s+/).filter((c) => c && c !== "\u2026" && !c.endsWith("\u2026"));
    return !classes.length || classes.some((c) => node.classList.contains(c));
  }
  function anchorAt(clientX, clientY) {
    let stack = document.elementsFromPoint(clientX, clientY).filter((n) => n !== host && n !== document.documentElement);
    const shadowRoots = [];
    let shadowHost = null;
    for (let top = stack[0]; top?.shadowRoot && !host.contains(top) && shadowRoots.length < 5; top = stack[0]) {
      shadowHost ||= top;
      shadowRoots.push(top.shadowRoot);
      const inner = top.shadowRoot.elementsFromPoint(clientX, clientY).filter((n) => n !== top);
      if (!inner.length) break;
      stack = [...inner, ...stack];
    }
    const target = stack[0]?.closest("[data-comment-target]") || stack[0] || document.body;
    const rect = target.getBoundingClientRect();
    const anchor = {
      selector: selectorFor(target),
      x: rect.width ? (clientX - rect.left) / rect.width : 0,
      y: rect.height ? (clientY - rect.top) / rect.height : 0,
      docX: (clientX + scrollX) / docWidth(),
      docY: clientY + scrollY,
      width: innerWidth,
      height: innerHeight,
      dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      element: openingTag(target),
      eh: Math.round(rect.height)
      // its height then: a pin on a big container can tell if the page grew under it
    };
    const own = short(target.textContent, 200);
    if (own && target !== document.body && (target.textContent || "").length < 400) anchor.text = short(own, 80);
    const inside = target.parentElement?.closest("[id], [data-lab]");
    if (inside) anchor.inside = inside.dataset.lab ? `[data-lab="${inside.dataset.lab}"]` : `#${inside.id}`;
    let heading = null;
    for (const h of document.querySelectorAll("h1, h2, h3")) {
      if (h.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(target)) heading = h;
    }
    if (heading) anchor.section = short(heading.textContent, 100);
    if (shadowHost) anchor.shadow = openingTag(shadowHost);
    for (const [k, v] of Object.entries(componentAt(target))) if (v) anchor[k] = short(v, 200);
    if (target !== document.body) anchor.looks = looksOf(target);
    const select = target.closest?.("select");
    if (select && select.selectedIndex >= 0) {
      anchor.chosen = short(`${select.selectedIndex + 1} of ${select.options.length}: "${select.options[select.selectedIndex].text}"`, 120);
    }
    for (const el2 of [target, target.parentElement]) {
      if (!el2 || el2 === document.body) continue;
      for (const which of ["::before", "::after"]) {
        const c = getComputedStyle(el2, which).content;
        const m = c && c.match(/^"(.+)"$/);
        if (m && m[1].trim()) {
          anchor.cssText = short(`"${m[1]}" from ${which} of ${openingTag(el2)}`, 160);
          break;
        }
      }
      if (anchor.cssText) break;
    }
    const build = document.querySelector('meta[name="lab-build"]')?.content;
    if (build) anchor.build = short(build, 40);
    const media = stack.slice(0, 5).find((n) => /^(img|video|canvas|svg|image)$/.test(n.localName) && !host.contains(n));
    if (media?.localName === "image" && media.namespaceURI === "http://www.w3.org/2000/svg") {
      anchor.kind = "image";
      anchor.src = new URL(media.getAttribute("href") || media.getAttribute("xlink:href") || "", location.href).href;
      anchor.file = fileHint(anchor.src);
      svgImageSpot(media, anchor, clientX, clientY);
    } else if (media) {
      const r = media.getBoundingClientRect();
      anchor.kind = media.localName === "img" ? "image" : media.localName;
      if (media.localName === "img" || media.localName === "video") {
        const img = media, video = media;
        anchor.src = mediaSrc(media);
        anchor.file = fileHint(anchor.src);
        if (img.alt) anchor.alt = short(img.alt, 120);
        const local = untransform(media, clientX, clientY);
        const [box, px, py] = local ? [local.rect, local.x, local.y] : [r, clientX, clientY];
        const spot = media.localName === "img" ? naturalSpot(media, box, px, py, fileSize(media).nw, fileSize(media).nh) : naturalSpot(media, box, px, py, video.videoWidth, video.videoHeight);
        if (spot) Object.assign(anchor, spot);
        if (local) anchor.transform = short(getComputedStyle(media).transform, 80);
        if (media.localName === "img" && /\.(gif|webp|apng)(\?|#|$)/i.test(img.currentSrc || img.src)) {
          const entry = performance.getEntriesByName(img.currentSrc || img.src)[0];
          const since = entry ? (performance.now() - entry.responseEnd) / 1e3 : performance.now() / 1e3;
          anchor.shownFor = Math.round(since * 10) / 10;
        }
        if (media.localName === "video") {
          anchor.time = Math.round(video.currentTime * 10) / 10;
          if (Number.isFinite(video.duration)) anchor.duration = Math.round(video.duration * 10) / 10;
          if (!anchor.file && video.poster) anchor.file = fileHint(video.poster);
        }
      } else {
        anchor.time = Math.round(performance.now() / 100) / 10;
        anchor.imgX = clamp01((clientX - r.left) / (r.width || 1));
        anchor.imgY = clamp01((clientY - r.top) / (r.height || 1));
        anchor.nw = Math.round(r.width);
        anchor.nh = Math.round(r.height);
      }
    } else {
      const quote = quoteAt(clientX, clientY, shadowRoots);
      if (quote) {
        anchor.kind = "text";
        anchor.quote = quote;
      } else {
        for (let n = target, i = 0; n && n !== document.documentElement && i < 4; n = n.parentElement, i++) {
          const bg = getComputedStyle(n).backgroundImage.match(/url\(["']?(.+?)["']?\)/);
          if (bg) {
            anchor.kind = "background";
            anchor.src = new URL(bg[1], location.href).href;
            anchor.file = fileHint(anchor.src);
            backgroundSpot(n, anchor.src, anchor, clientX, clientY);
            break;
          }
        }
        anchor.kind ||= "element";
        if (anchor.kind === "element") {
          const gap = between(target, clientY);
          if (gap) Object.assign(anchor, { gapAbove: gap.above, gapBelow: gap.below });
        }
      }
    }
    Object.assign(anchor, schemeAt(target));
    return anchor;
  }
  function findTarget(anchor) {
    let node = null;
    try {
      node = anchor.selector ? document.querySelector(anchor.selector) : null;
    } catch {
    }
    const matches = (n) => {
      if (!n) return false;
      if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
        const m = n.closest?.("img, video") || n;
        return fileHint(mediaSrc(m)) === anchor.file;
      }
      if (anchor.element && !sameKind(n, anchor.element)) return false;
      if (anchor.quote?.exact) {
        const t = (n.textContent || "").replace(/\s+/g, "");
        const q = anchor.quote.exact.replace(/\s+/g, "").slice(0, 24);
        const before = (anchor.quote.prefix || "").replace(/\s+/g, "").slice(-10);
        const after = (anchor.quote.suffix || "").replace(/\s+/g, "").slice(0, 10);
        return t.includes(q) && (q.length >= 16 || !before && !after || t.includes(before + q) || t.includes(q + after));
      }
      return true;
    };
    const said = short(anchor.text, 400);
    const sectionOf = (n) => {
      let heading = null;
      for (const h of document.querySelectorAll("h1, h2, h3")) if (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(n)) heading = h;
      return heading ? short(heading.textContent, 100) : "";
    };
    const squash = (t) => String(t || "").replace(/\s+/g, "");
    const areaWords = squash(anchor.zoneText).slice(0, 30);
    const saysSame = (n) => anchor.quote?.exact ? true : said ? short(n.textContent, 400).startsWith(said.slice(0, 40)) : areaWords ? squash(n.textContent).includes(areaWords) : anchor.section ? sectionOf(n) === anchor.section : true;
    const atPath = node && node !== document.body && matches(node) ? node : null;
    if (atPath && saysSame(atPath)) return atPath;
    if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
      return [...document.querySelectorAll("img, video")].find((m) => fileHint(mediaSrc(m)) === anchor.file) || null;
    }
    const tag = /^<([\w-]+)/.exec(anchor.element || "")?.[1];
    if (!tag || tag === "body" || tag === "html") return atPath;
    const flat = (t) => short(t, 400);
    let found = null;
    let best = -1;
    let near = Infinity;
    const twins = [...document.querySelectorAll(tag)].slice(0, 400).filter((n) => !host.contains(n) && sameKind(n, anchor.element));
    for (const n of twins) {
      const t = flat(n.textContent);
      let score = 0;
      if (anchor.quote?.exact && matches(n)) score += 4;
      if (said && t === said) score += 4;
      if (areaWords && squash(n.textContent).includes(areaWords)) score += 4;
      else if (said && t.startsWith(said.slice(0, 40))) score += 2;
      if (!score && twins.length > 1) continue;
      if (score && anchor.section && sectionOf(n) === anchor.section) score += 2;
      const d3 = Math.abs(n.getBoundingClientRect().top + scrollY - (anchor.docY || 0));
      if (score > best || score === best && d3 < near) [found, best, near] = [n, score, d3];
    }
    return best > 0 || !atPath ? found : atPath;
  }
  var wordCache = null;
  function wordSpot(anchor) {
    const m = /^(?:…)?(.*?)\[([^\]]+)\](.*?)(?:…)?$/s.exec(anchor.text || "");
    if (!m) return null;
    const before = m[1].replace(/\s+/g, " ").slice(-24);
    const word = m[2];
    if (!wordCache || performance.now() - wordCache.at > 400) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => host.contains(t.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let text2 = "";
      const at2 = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const v = t.data.replace(/\s+/g, " ");
        for (let i2 = 0; i2 < v.length; i2++) at2.push([t, i2]);
        text2 += v;
      }
      wordCache = { at: performance.now(), text: text2, map: at2 };
    }
    const { text, map: at } = wordCache;
    let i = text.indexOf(before + word);
    if (i < 0) return { gone: true };
    i += before.length;
    const range = document.createRange();
    try {
      range.setStart(...at[i]);
      range.setEnd(at[i + word.length - 1][0], at[i + word.length - 1][1] + 1);
    } catch {
      return { gone: true };
    }
    const r = range.getBoundingClientRect();
    return r.width || r.height ? { left: r.left + scrollX + Math.min(6, r.width / 2), top: r.top + scrollY + r.height / 2 } : { gone: true };
  }
  var pageEnd = { at: -Infinity, y: 0 };
  var inPage = (y, h = 0) => {
    if (performance.now() - pageEnd.at > 300) {
      const bottoms = [...document.body.children].filter((c) => c !== host && !host.contains(c)).map((c) => c.getBoundingClientRect().bottom + scrollY);
      pageEnd = { at: performance.now(), y: Math.max(innerHeight, ...bottoms) };
    }
    return Math.max(0, Math.min(y, pageEnd.y - h - 40));
  };
  var pinOf = (zone, anchor) => ({ left: zone.left + (anchor.pinX ? zone.width : 0), top: zone.top + (anchor.pinY ? zone.height : 0) });
  var EDGE = 10;
  var GUTTER = 30;
  function edgeFor(anchor) {
    const beside = (rect) => Math.max(EDGE, Math.round(rect.left + scrollX - GUTTER));
    const parts = String(anchor?.selector || "").split(" > ");
    while (parts.length > 1) {
      parts.pop();
      let node = null;
      try {
        node = document.querySelector(parts.join(" > "));
      } catch {
      }
      if (!node || /^(html|body)$/.test(node.localName) || host.contains(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width) return beside(rect);
    }
    const boxes = [...document.body.children].filter((c) => c !== host && !host.contains(c)).map((c) => c.getBoundingClientRect()).filter((r) => r.width && r.height);
    return boxes.length ? beside({ left: Math.min(...boxes.map((r) => r.left)) }) : EDGE;
  }
  function position(anchor) {
    const at = spotOf(anchor);
    return at.moved ? { ...at, left: edgeFor(anchor) } : at;
  }
  function spotOf(anchor) {
    const node = findTarget(anchor);
    if (node && !anchor.zw && !anchor.docW && /^(html|body|main)$/.test(node.localName) && /\[[^\]]+\]/.test(anchor.text || "")) {
      const spot = wordSpot(anchor);
      if (spot && !spot.gone) return { left: spot.left, top: spot.top, zone: null };
      if (spot?.gone) return { left: anchor.docX * docWidth(), top: inPage(anchor.docY), zone: null, moved: true };
    }
    if (node && anchor.eh && !anchor.zw && !anchor.docW && /^(html|body|main)$/.test(node.localName) && !/\[[^\]]+\]/.test(anchor.text || "")) {
      if (Math.abs(node.getBoundingClientRect().height - anchor.eh) > 40) return { left: anchor.docX * docWidth(), top: inPage(anchor.docY), zone: null, moved: true };
    }
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.width || rect.height) {
        const left2 = rect.left + scrollX + anchor.x * rect.width;
        const tall = anchor.zw && Number.isFinite(anchor.oy) && anchor.docH && rect.height > 2 * anchor.docH;
        const top2 = rect.top + scrollY + (tall ? anchor.oy : anchor.y * rect.height);
        const zone2 = anchor.zw ? { left: left2, top: top2, width: anchor.zw * rect.width, height: tall ? anchor.docH : anchor.zh * rect.height } : null;
        return zone2 ? { ...pinOf(zone2, anchor), zone: zone2 } : { left: left2, top: top2, zone: zone2 };
      }
    }
    const left = anchor.docX * docWidth();
    const top = inPage(anchor.docY, anchor.docH || 0);
    const zone = anchor.docW ? { left, top, width: anchor.docW, height: anchor.docH } : null;
    if (zone) return { ...pinOf(zone, anchor), zone, moved: Boolean(anchor.selector) && anchor.selector !== "body" };
    return { left, top, zone, moved: Boolean(anchor.selector) && anchor.selector !== "body" };
  }
  function quoteRange(anchor) {
    const q = anchor?.quote;
    let node = q?.exact ? findTarget(anchor) : null;
    if (!node) return null;
    const want = q.exact.replace(/\s+/g, "");
    const tail = (q.prefix || "").replace(/\s+/g, "").slice(-12);
    for (let up = 0; node && up < 4; node = node.parentElement, up++) {
      let text = "";
      const at = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode())
        for (let i = 0; i < t.data.length; i++) {
          if (/\s/.test(t.data[i])) continue;
          text += t.data[i];
          at.push([t, i]);
        }
      let first = null;
      for (let i = text.indexOf(want); i !== -1; i = text.indexOf(want, i + 1)) {
        const range = document.createRange();
        range.setStart(...at[i]);
        const [end, k] = at[i + want.length - 1];
        range.setEnd(end, k + 1);
        if (!tail || text.slice(0, i).endsWith(tail)) return range;
        first ||= range;
      }
      if (first) return first;
    }
    return null;
  }
  var nameLine = (name, done) => {
    const b = el("b", {}, String(name || "").replace(/\s*·\s*session\s+\S+$/i, ""));
    if (done) b.append(el("span", { class: "mark done", role: "img", "aria-label": "done" }, "\u2713"));
    return b;
  };
  var DRAFT_MODE = false;
  var drafting = () => DRAFT_MODE && store.get("lab-hold") === "1";
  var linked = (text) => {
    const out = [];
    let at = 0;
    for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g)) {
      if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
      const a = el("a", { href: m[0], target: "_blank", rel: "noopener noreferrer", class: "link" }, m[0]);
      a.addEventListener("click", (e) => e.stopPropagation());
      out.push(a);
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push(document.createTextNode(text.slice(at)));
    return out;
  };
  var sentences = (t) => t.split(/(?<=[.!?])\s+(?=["'([]?[A-Z0-9])/);
  var readable = (text) => {
    const blocks = [];
    for (const [n, para] of String(text || "").trim().split(/\n\s*\n/).entries()) {
      const lines = para.split("\n");
      if (lines.length === 1 && para.length > 240) {
        const ss = sentences(para);
        for (let i = 0; i < ss.length; i += 2) blocks.push({ text: ss.slice(i, i + 2).join(" "), gap: n > 0 || i > 0 });
        continue;
      }
      lines.forEach((line, i) => {
        const item = /^\s*(?:[-•*]|\d+[.)])\s+/.exec(line);
        const prev = i > 0 ? blocks.at(-1) : null;
        if (item) blocks.push({ li: /\d/.test(item[0]) ? item[0].trim() : "\u2022", text: line.slice(item[0].length), gap: n > 0 && i === 0 });
        else if (prev && !prev.li) prev.text += `
${line}`;
        else blocks.push({ text: line, gap: n > 0 && i === 0 || Boolean(prev) });
      });
    }
    return blocks.map((b) => {
      const node = el("span", { class: `p${b.li ? " li" : ""}${b.gap ? " gap" : ""}` });
      if (b.li) node.append(el("span", { class: "mk" }, b.li));
      node.append(...linked(b.text));
      return node;
    });
  };
  var canMark = typeof Highlight === "function" && Boolean(CSS.highlights);
  var markQuote = (anchor) => {
    if (!canMark) return;
    const range = anchor && quoteRange(anchor);
    if (range) CSS.highlights.set("lab-quote", new Highlight(range));
    else CSS.highlights.delete("lab-quote");
  };
  var zoneEl = (cls) => {
    const z = el("div", { class: `zone ${cls}` });
    z.innerHTML = '<svg aria-hidden="true"><rect class="ring" width="100%" height="100%"/><rect class="dots" width="100%" height="100%"/></svg>';
    return z;
  };
  var drawZone = (box, cls) => {
    if (!box) return;
    const z = zoneEl(cls);
    Object.assign(z.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    layer.append(z);
    return z;
  };
  function zoneAnchor({ x0, y0, x1, y1 }) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const right = Math.max(x0, x1);
    const bottom = Math.max(y0, y1);
    const anchor = anchorAt((left + right) / 2, (top + bottom) / 2);
    let box = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2).find((n) => n !== host && !host.contains(n));
    const area = Math.max(1, (right - left) * (bottom - top));
    const contains = (r2) => Math.max(0, Math.min(r2.right, right) - Math.max(r2.left, left)) * Math.max(0, Math.min(r2.bottom, bottom) - Math.max(r2.top, top)) / area >= 0.8;
    while (box && box !== document.body && !contains(box.getBoundingClientRect())) box = box.parentElement;
    box ||= document.body;
    const r = box.getBoundingClientRect();
    Object.assign(anchor, {
      selector: box === document.body ? "body" : selectorFor(box),
      element: openingTag(box),
      x: r.width ? (left - r.left) / r.width : 0,
      y: r.height ? (top - r.top) / r.height : 0,
      zw: r.width ? (right - left) / r.width : 0,
      // may pass 1 a little: the area can reach past its element's edge
      zh: r.height ? (bottom - top) / r.height : 0,
      oy: Math.round(top - r.top),
      // px below the element's top: a share of a tall box drifts when it grows (pictures load)
      docX: (left + scrollX) / docWidth(),
      docY: top + scrollY,
      docW: Math.round(right - left),
      docH: Math.round(bottom - top),
      pinX: x1 >= x0 ? 1 : 0,
      // the drag ended on the right / at the bottom: the pin goes there
      pinY: y1 >= y0 ? 1 : 0
    });
    Object.assign(anchor, schemeAt(box));
    if (anchor.kind === "text") {
      delete anchor.quote;
      anchor.kind = "element";
    }
    const boxText = box === document.body ? "" : short(box.textContent, 200);
    if (boxText && (box.textContent || "").length < 400) anchor.text = short(boxText, 80);
    else delete anchor.text;
    if (box !== document.body) anchor.looks = looksOf(box);
    const words = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n && words.length < 80; n = walker.nextNode()) {
      if (host.contains(n)) continue;
      const pr = n.parentElement?.getBoundingClientRect();
      if (!pr || pr.bottom < top || pr.top > bottom || pr.right < left || pr.left > right) continue;
      for (const m of n.data.matchAll(/\S+/g)) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const w = range.getBoundingClientRect();
        const cx = (w.left + w.right) / 2;
        const cy = (w.top + w.bottom) / 2;
        if (w.width && cx >= left && cx <= right && cy >= top && cy <= bottom) words.push(m[0]);
      }
    }
    const text = short(words.join(" "), 300);
    if (text) anchor.zoneText = text;
    const inArea = [];
    const all = box.querySelectorAll("*");
    for (let i = 0; i < all.length && i < 3e3; i++) {
      const el2 = all[i];
      if (host.contains(el2) || inArea.some((x) => x.contains(el2))) continue;
      const er = el2.getBoundingClientRect();
      if (er.width < 8 || er.height < 8 || er.left < left - 4 || er.right > right + 4 || er.top < top - 4 || er.bottom > bottom + 4) continue;
      inArea.push(el2);
    }
    if (inArea.length) {
      anchor.zoneItems = inArea.slice(0, 5).map((el2) => {
        const c = componentAt(el2);
        const t = short(el2.textContent, 50);
        return short([openingTag(el2), t && `"${t}"`, c.component, c.source && `written at ${c.source}`, c.usedAt && `used at ${c.usedAt}`].filter(Boolean).join(" \xB7 "), 500);
      });
      if (inArea.length > 5) anchor.zoneItems.push(`and ${inArea.length - 5} more`);
    }
    if (/^(img|video)$/.test(box.localName)) {
      const nw = box.localName === "img" ? fileSize(box).nw : box.videoWidth;
      const nh = box.localName === "img" ? fileSize(box).nh : box.videoHeight;
      const a = naturalSpot(box, r, left, top, nw, nh);
      const b = naturalSpot(box, r, right, bottom, nw, nh);
      if (a && b) Object.assign(anchor, { imgX: a.imgX, imgY: a.imgY, imgX2: b.imgX, imgY2: b.imgY });
    } else if (anchor.kind === "image" || anchor.kind === "video") {
      delete anchor.imgX;
      delete anchor.imgY;
      anchor.kind = "element";
    }
    return anchor;
  }

  // src/widget/composer.ts
  var d;
  function bindComposer(deps) {
    d = deps;
  }
  var ARROW = '<i class="arr" aria-hidden="true"></i>';
  function composer({ placeholder, onSubmit, autofocus = false }) {
    const { el: el2, store: store2, root, refreshPinCursor, syncReads } = d;
    const wrap = el2("div", { class: "composer" });
    const box = el2("div", { class: "box" });
    const text = el2("textarea", { placeholder, maxlength: "2000", rows: "1", "aria-label": placeholder, enterkeyhint: "send", autocomplete: "off", autocorrect: "off", spellcheck: "false", writingsuggestions: "false" });
    const who = el2("label", { class: "who" });
    const as = el2("span", {}, "as");
    const name = el2("input", { type: "text", placeholder: "your name", maxlength: "60", enterkeyhint: "send", autocomplete: "off", autocorrect: "off", autocapitalize: "words", spellcheck: "false", writingsuggestions: "false", "data-1p-ignore": "", "data-lpignore": "true" });
    name.value = store2.get("lab-name");
    who.append(as, name);
    const sendBtn = el2("button", { class: "send", type: "button", "aria-label": "send" });
    sendBtn.addEventListener("pointerdown", (e) => e.preventDefault());
    sendBtn.addEventListener("mousedown", (e) => e.preventDefault());
    sendBtn.innerHTML = ARROW;
    const error = el2("div", { class: "error" });
    box.append(text, el2("div", { class: "line" }), who, sendBtn);
    wrap.append(box, error);
    box.addEventListener("click", (e) => {
      if (e.target !== box && !e.target.classList?.contains("line")) return;
      text.focus({ preventScroll: true });
      text.setSelectionRange(text.value.length, text.value.length);
    });
    const sync = () => {
      const open = text.value.length > 0 || root.activeElement === name || !!error.textContent;
      const glide = open !== box.classList.contains("open") && !store2.get("lab-name") && box.isConnected && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      const from = glide && { arrow: sendBtn.getBoundingClientRect(), height: box.getBoundingClientRect().height };
      const one = Boolean(store2.get("lab-name"));
      box.classList.toggle("one", one);
      box.classList.toggle("open", open);
      as.hidden = !name.value.trim();
      if (one && !CSS.supports?.("field-sizing", "content")) name.style.width = `${Math.max(2, name.value.length + 1)}ch`;
      sendBtn.classList.toggle("ready", Boolean(text.value.trim() && name.value.trim()));
      text.style.height = "auto";
      text.style.height = `${text.scrollHeight}px`;
      if (glide) {
        const to = sendBtn.getBoundingClientRect();
        const timing = { duration: 220, easing: "cubic-bezier(.2, .7, .3, 1)" };
        sendBtn.animate([{ transform: `translate(${from.arrow.left - to.left}px, ${from.arrow.top - to.top}px)` }, { transform: "none" }], timing);
        box.style.overflow = "hidden";
        box.animate([{ height: `${from.height}px` }, { height: `${box.getBoundingClientRect().height}px` }], timing).onfinish = () => box.style.overflow = "";
      }
    };
    let busy = false;
    const go = async () => {
      if (busy) return;
      if (!text.value.trim()) return text.focus();
      if (!name.value.trim()) {
        box.classList.add("open");
        return name.focus();
      }
      store2.set("lab-name", name.value.trim());
      refreshPinCursor();
      syncReads();
      sendBtn.classList.remove("sent");
      void sendBtn.offsetWidth;
      sendBtn.classList.add("sent");
      busy = true;
      error.textContent = "";
      error.classList.remove("wait");
      const slow = setTimeout(() => {
        error.textContent = "sending\u2026 it goes as soon as the lab is back";
        error.classList.add("wait");
      }, 1500);
      try {
        const result = await onSubmit(name.value.trim(), text.value.trim());
        clearTimeout(slow);
        error.textContent = "";
        error.classList.remove("wait");
        if (result?.keep) {
          text.value = "";
          sync();
        }
      } catch (e) {
        clearTimeout(slow);
        error.classList.remove("wait");
        error.textContent = e.message;
        sync();
      }
      busy = false;
    };
    const onKey = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        go();
      }
    };
    text.addEventListener("input", sync);
    name.addEventListener("input", sync);
    name.addEventListener("blur", () => setTimeout(sync, 0));
    text.addEventListener("keydown", onKey);
    name.addEventListener("keydown", onKey);
    sendBtn.addEventListener("click", go);
    sendBtn.addEventListener("mousedown", (e) => e.preventDefault());
    requestAnimationFrame(sync);
    const focus = () => text.focus({ preventScroll: true });
    if (autofocus) queueMicrotask(() => text.isConnected ? focus() : setTimeout(focus, 0));
    return wrap;
  }

  // src/widget/messages.ts
  var d2;
  function bindMessages(deps) {
    d2 = deps;
  }
  var onWhat = (c) => {
    const a = c.anchor || {};
    let w = a.quote?.exact || "";
    let n = null;
    try {
      n = !w && a.selector ? document.querySelector(a.selector) : null;
    } catch {
    }
    for (let up = 0; n && n !== document.body && up < 5; n = n.parentElement, up++) {
      const t = n.innerText?.replace(/\s+/g, " ").trim() || "";
      if (t.length >= 12) {
        w = t;
        break;
      }
    }
    w = (w || a.text || a.section || "").replace(/\s+/g, " ").trim();
    return w ? `"${w.length > 40 ? `${w.slice(0, 39)}\u2026` : w}"` : "";
  };
  var stampOf = (m, root, prefix = "") => {
    const { el: el2, mine, repliesOf, workState: workState2 } = d2;
    const at = new Date(m.createdAt);
    const time = at.toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : at.toLocaleDateString([], { day: "numeric", month: "short" });
    const stamp = el2("span", { class: "stamp" });
    stamp.append(el2("span", { class: "tm" }, prefix + time));
    if (mine(m) && !m.session) {
      const thread = root ? [root, ...repliesOf(root.id)] : [m];
      const answered = thread.some((x) => x.session && x.createdAt > m.createdAt);
      const latest = !thread.some((x) => !x.session && x.createdAt > m.createdAt);
      if (!answered && latest && root && workState2(root)[0] === "now") {
        stamp.classList.add("busy");
        stamp.append(el2("span", { class: "ring", role: "img", "aria-label": "the agent is on it" }));
      } else if (answered) {
        stamp.classList.add("ans");
        stamp.append(el2("span", { class: "tick", role: "img", "aria-label": "answered" }, "\u2713"));
      } else {
        const got = root?.handedAt && root.handedAt >= m.createdAt;
        stamp.append(el2("span", { class: `tick${got ? " got" : ""}`, role: "img", "aria-label": got ? "delivered to the agent" : "sent" }, got ? "\u2713\u2713" : "\u2713"));
      }
    }
    return stamp;
  };

  // src/widget/sheets.ts
  var W;
  function bindSheets(w) {
    W = w;
  }
  var grabArea = (t) => Boolean(t.closest?.(".handle, .tabs"));
  var scrollerIn = (e, node) => e.composedPath().find((n) => n instanceof HTMLElement && node.contains(n) && (n.localName === "textarea" || /auto|scroll/.test(getComputedStyle(n).overflowY)));
  var SPRING = "cubic-bezier(.32,.72,0,1)";
  function slideAway(node, close, ms = 0) {
    if (!W.coarse || !node || W.still.matches) return close();
    if (!W.host.hasAttribute("data-kb")) W.root.activeElement?.blur();
    node.style.pointerEvents = "none";
    node.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2, .6, .4, 1)` : "transform .22s cubic-bezier(.4, 0, 1, 1)";
    W.scrim.style.transition = `opacity ${ms || 220}ms`;
    node.style.transform = "translateY(100%)";
    W.scrim.style.opacity = "0";
    W.bar.style.transition = `transform ${ms || 220}ms cubic-bezier(.2, .6, .4, 1), opacity ${ms || 220}ms`;
    W.host.style.setProperty("--lab-p", "1");
    setTimeout(() => {
      W.root.activeElement?.blur();
      close();
      node.style.pointerEvents = "";
      node.style.transform = node.style.transition = W.scrim.style.opacity = W.scrim.style.transition = W.bar.style.transition = "";
      W.host.style.removeProperty("--lab-p");
    }, ms || 220);
  }
  function backCloses() {
    const open = matchMedia("(pointer: coarse)").matches && W.host.hasAttribute("data-sheet");
    if (!open && W.S.backWatcher) {
      const w = W.S.backWatcher;
      W.S.backWatcher = null;
      w.destroy();
    }
    if (open && !W.S.backWatcher && "CloseWatcher" in window) {
      try {
        const w = new window.CloseWatcher();
        w.onclose = () => {
          if (W.S.backWatcher === w) W.S.backWatcher = null;
          W.closeOrNudge();
          backCloses();
        };
        W.S.backWatcher = w;
      } catch {
      }
    }
  }
  function swipeDown(node, close, grows = false) {
    if (!W.coarse) return;
    let raw = 0;
    let scrolledAt = -1e9;
    let releasedAt = -1e9;
    node.addEventListener("scroll", () => scrolledAt = performance.now(), { capture: true, passive: true });
    node.addEventListener("click", (e) => {
      if (performance.now() - releasedAt < 200) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    node.addEventListener("focusin", (e) => {
      if (performance.now() - releasedAt < 200 && e.target.localName === "textarea") e.target.blur();
    });
    let x0 = 0;
    let y0 = 0;
    let dy = 0;
    let v = 0;
    let last = null;
    let mode = null;
    let box = null;
    let fromScrim = false;
    const onStart = (e) => {
      fromScrim = e.currentTarget === W.scrim;
      if (fromScrim && W.openSheet() !== node) return void (mode = "off");
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dy = v = raw = 0;
      last = { y: y0, at: e.timeStamp };
      box = fromScrim ? null : scrollerIn(e, node);
      mode = e.touches.length > 1 || box?.localName === "textarea" ? "off" : null;
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    W.scrim.addEventListener("touchstart", onStart, { passive: true });
    const onMove = (e) => {
      if (fromScrim !== (e.currentTarget === W.scrim)) return;
      const t = e.touches[0];
      if (mode === "off" && box && box.localName !== "textarea" && e.touches.length === 1 && e.cancelable && box.scrollTop <= 0 && t.clientY > last.y + 1) {
        mode = "drag";
        y0 = t.clientY;
        v = 0;
        last = { y: t.clientY, at: e.timeStamp };
      }
      if (mode === "off") return void (last = { y: t.clientY, at: e.timeStamp });
      if (mode === "hold") return e.preventDefault();
      if (!mode) {
        const down = t.clientY - y0;
        const across = t.clientX - x0;
        if (!down && !across) return;
        const sideways = Math.abs(across) > Math.abs(down);
        const nearTop = !sideways && down > 0 && y0 - node.getBoundingClientRect().top < node.offsetHeight * 0.25;
        if (fromScrim) mode = sideways ? "hold" : "drag";
        else if (grabArea(e.target)) mode = sideways && e.target.closest(".tabs") ? "off" : "drag";
        else if (nearTop && box?.localName !== "textarea") mode = "drag";
        else if (box) mode = !sideways && down > 0 && box.scrollTop <= 0 && performance.now() - scrolledAt > 100 ? "drag" : "off";
        else mode = sideways ? "hold" : "drag";
        W.S.dbg?.(`touch ${String(e.target.className || e.target.localName).slice(0, 20)} at ${Math.round(y0 - node.getBoundingClientRect().top)}/${node.offsetHeight} down${Math.round(down)} \u2192 ${mode}${e.cancelable ? "" : " (not cancelable)"}${box ? ` box${Math.round(box.scrollTop)}` : ""}`);
        if (mode === "off") return;
        if (mode === "hold") return e.preventDefault();
      }
      e.preventDefault();
      raw = t.clientY - y0;
      const size = node.offsetHeight || 400;
      dy = raw >= 0 ? raw : -(1 - 1 / (-raw * 0.55 / size + 1)) * size;
      if (e.timeStamp > last.at) v = 0.8 * ((t.clientY - last.y) / (e.timeStamp - last.at)) + 0.2 * v;
      last = { y: t.clientY, at: e.timeStamp };
      node.style.transition = W.scrim.style.transition = "none";
      node.style.transform = `translateY(${dy}px)`;
      W.scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - dy / 320)));
      W.bar.style.transition = "none";
      W.host.style.setProperty("--lab-p", String(Math.min(1, Math.max(0, dy / (node.offsetHeight || 400)))));
    };
    node.addEventListener("touchmove", onMove, { passive: false });
    W.scrim.addEventListener("touchmove", onMove, { passive: false });
    const end = (e) => {
      if (fromScrim !== (e.currentTarget === W.scrim)) return;
      const was = mode;
      mode = null;
      if (was === "drag") W.S.sheetDraggedAt = performance.now();
      if (was !== "drag") return;
      releasedAt = performance.now();
      if (e.timeStamp - last.at > 80) v = 0;
      const h = node.offsetHeight || innerHeight;
      const settle = () => {
        node.style.transition = `transform 380ms ${SPRING}, height 380ms ${SPRING}`;
        W.scrim.style.transition = "opacity 300ms";
        node.style.transform = W.scrim.style.opacity = "";
        W.bar.style.transition = "";
        W.host.style.removeProperty("--lab-p");
        setTimeout(() => node.style.transition = W.scrim.style.transition = "", 400);
      };
      if (grows && !node.classList.contains("full") && (raw < -40 || v < -0.4)) return node.classList.add("full"), node.classList.contains("card") && (W.S.cardFull = true), settle();
      if (grows && node.classList.contains("full") && v < 1.2 && (raw > 60 || v > 0.4)) return node.classList.remove("full"), node.classList.contains("card") && (W.S.cardFull = false), settle();
      const rest = dy + Math.max(0, v) * 499;
      W.S.dbg?.(`let go: moved ${Math.round(dy)} speed ${v.toFixed(2)} rest ${Math.round(rest)} of half ${Math.round(h / 2)} \u2192 ${v > -0.1 && rest > h / 2 ? "close" : "stay"}`);
      if (v > -0.1 && rest > h / 2) return slideAway(node, close, Math.min(320, Math.max(140, (h - dy) / Math.max(v, 1.2))));
      node.style.transition = `transform 380ms ${SPRING}`;
      W.scrim.style.transition = "opacity 300ms";
      node.style.transform = W.scrim.style.opacity = "";
      W.bar.style.transition = "";
      W.host.style.removeProperty("--lab-p");
      setTimeout(() => node.style.transition = W.scrim.style.transition = "", 400);
    };
    node.addEventListener("touchend", end);
    W.scrim.addEventListener("touchend", end);
    W.scrim.addEventListener("touchcancel", end);
    node.addEventListener("touchcancel", end);
  }
  function startSheets() {
    if (W.coarse && W.vv) {
      const probe = W.el("i", { style: "position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none" });
      const strip = W.el("i", { style: "position:absolute;left:0;width:100vw;display:none;background:var(--_bg);z-index:3;pointer-events:none" });
      W.root.append(probe, strip);
      let fitted = "";
      const fit = () => {
        const zoomed = Math.abs(W.vv.scale - 1) > 0.01;
        const r = probe.getBoundingClientRect();
        const field = W.root.activeElement || document.activeElement;
        const typing = /^(textarea|input|select)$/.test(field?.localName || "") || Boolean(field?.isContentEditable);
        const top = zoomed || !typing ? 0 : W.vv.offsetTop;
        const seen = top + W.vv.height;
        const kb = zoomed ? 0 : Math.max(0, Math.round(r.bottom - seen));
        const gap = zoomed ? 0 : Math.max(0, Math.round(seen - r.bottom));
        const vh = zoomed ? 0 : Math.round(W.vv.height);
        const sheet = W.host.hasAttribute("data-sheet");
        const key = `${kb} ${vh} ${gap} ${sheet} ${scrollY} ${Math.round(top)}`;
        if (key === fitted) {
          const open2 = sheet ? W.openSheet() : null;
          if (open2?.offsetHeight && !open2.style.transform) Object.assign(fit, { sheet: open2, top: open2.getBoundingClientRect().top });
          return;
        }
        fitted = key;
        W.host.style.setProperty("--lab-kb", `${kb}px`);
        W.host.style.setProperty("--lab-top", `${Math.round(top)}px`);
        if (vh) W.host.style.setProperty("--lab-vh", `${vh}px`);
        else W.host.style.removeProperty("--lab-vh");
        W.host.toggleAttribute("data-kb", kb > 60);
        strip.style.display = sheet && gap ? "block" : "none";
        strip.style.top = `${Math.round(scrollY + r.bottom)}px`;
        strip.style.height = `${gap}px`;
        const open = sheet ? W.openSheet() : null;
        const slid = (n) => {
          try {
            return new DOMMatrixReadOnly(getComputedStyle(n).transform).m42 || 0;
          } catch {
            return 0;
          }
        };
        const keyboardMoved = Math.abs((fit.vh || vh) - vh) > 60 || fit.kbUp !== kb > 60;
        const sliding = open && open === fit.sheet && keyboardMoved && !open.style.transform && !W.still.matches;
        if (sliding) {
          open.style.transition = "none";
          void open.offsetHeight;
        }
        const at = open ? open.getBoundingClientRect().top - slid(open) : null;
        if (sliding && Math.abs(fit.top - at) <= 8) open.style.transition = "";
        if (sliding && Math.abs(fit.top - at) > 8) {
          open.style.transform = `translateY(${fit.top - at}px)`;
          void open.offsetHeight;
          open.style.transition = `transform 340ms ${SPRING}`;
          open.style.transform = "";
          clearTimeout(fit.done);
          fit.done = setTimeout(() => !open.style.transform && (open.style.transition = ""), 360);
        }
        Object.assign(fit, { vh, kbUp: kb > 60 }, open?.offsetHeight ? { sheet: open, top: at } : { sheet: null });
      };
      W.S.refit = fit;
      W.root.addEventListener("focusin", () => setTimeout(fit, 50));
      W.root.addEventListener("focusout", () => setTimeout(fit, 50));
      W.vv.addEventListener("resize", fit);
      W.vv.addEventListener("scroll", fit);
      fit();
      if (globalThis.__LAB_DEBUG__ !== false && /[?&]kbdebug\b/.test(location.search)) {
        let lines = [];
        let t0 = performance.now();
        let sendTimer = 0;
        const row = (what) => {
          const open = W.openSheet();
          const r = open?.getBoundingClientRect();
          lines.push(`${Math.round(performance.now() - t0)} ${what} h${Math.round(W.vv.height)} top${Math.round(W.vv.offsetTop)} in${innerHeight} kb${W.host.hasAttribute("data-kb") ? 1 : 0}` + (r ? ` sheet${Math.round(r.top)}/${Math.round(r.height)}${open.getAnimations().length ? " anim" : ""}` : "") + // What is moving anywhere (the page, the pins, the dimming): for a flicker that isn't the keyboard.
          ` [${[...document.getAnimations(), ...W.root.getAnimations()].map((a) => a.animationName || a.transitionProperty || "js").slice(0, 6).join(",")}] scrim${getComputedStyle(W.scrim).opacity.slice(0, 4)} scroll${Math.round(scrollY)}`);
        };
        const watch = (what) => {
          row(what);
          const end = performance.now() + 1500;
          let prev = "";
          const f = () => {
            const before = lines.length;
            row("f");
            const last = lines[lines.length - 1].replace(/^\d+ f /, "");
            if (last === prev) lines.length = before;
            prev = last;
            if (performance.now() < end) requestAnimationFrame(f);
          };
          requestAnimationFrame(f);
        };
        W.root.addEventListener("focusin", () => (t0 = performance.now(), watch("focus")));
        const sendSoon = () => {
          clearTimeout(sendTimer);
          sendTimer = setTimeout(async () => {
            const text = lines.join("\n");
            lines = [];
            for (let i = 0; i < text.length; i += 1900) {
              await W.send({ name: "kb-log", text: text.slice(i, i + 1900), anchor: { kind: "page", selector: "body", x: 0, y: 0, docX: 0, docY: 0, width: innerWidth } }).catch(() => {
              });
            }
          }, 2e3);
        };
        W.root.addEventListener("focusout", () => {
          lines.push("--- let go");
          t0 = performance.now();
          watch("blur");
          sendSoon();
        });
        W.S.dbg = (line) => {
          lines.push(`${Math.round(performance.now() - t0)} ${line}`);
          sendSoon();
        };
        W.vv.addEventListener("resize", () => {
          watch("resize");
          if (lines.length > 1) sendSoon();
        });
      }
    }
  }

  // src/widget/list.ts
  var W2;
  function bindList(w) {
    W2 = w;
  }
  var goTo = (c, keys = false) => {
    W2.S.stepping = Boolean(W2.S.openId);
    W2.S.keepKeys = W2.S.stepping && (keys || W2.root.activeElement?.localName === "textarea");
    W2.S.openId = c.id;
    W2.S.draft = null;
    if (W2.coarse) W2.S.listOpen = false;
    W2.render();
    const pinTop = W2.position(c.anchor || {}).top;
    let top = pinTop - Math.max(40, W2.coarse && W2.S.openCard?.isConnected ? (innerHeight - W2.S.openCard.offsetHeight) / 2 : innerHeight / 3);
    if (!W2.coarse && W2.S.openCard?.isConnected) {
      const bottom = W2.S.openCard.getBoundingClientRect().bottom + scrollY;
      const tall = bottom - pinTop + 28;
      top = tall <= innerHeight - 80 ? pinTop - 28 - (innerHeight - tall) / 2 : pinTop - 40;
    }
    if (W2.coarse) {
      const de = document.documentElement;
      const had = parseFloat(de.style.getPropertyValue("--lab-room")) || 0;
      const room = Math.max(0, Math.ceil(top + innerHeight - (de.scrollHeight - had)));
      de.style.setProperty("--lab-room", `${room}px`);
      de.classList.toggle("lab-room", room > 0);
    }
    scrollTo({ top: Math.max(0, top), behavior: W2.still.matches ? "auto" : "smooth" });
  };
  function drawList() {
    const all = W2.threads();
    W2.listBtn.hidden = !W2.S.on || !W2.coarse && !all.length && !W2.held().length;
    W2.goBtn.hidden = !W2.S.on;
    if (!W2.goBtn.firstElementChild) W2.goBtn.replaceChildren(W2.el("span", { class: "gp" }, "go"), W2.el("kbd", { "aria-hidden": "true" }, "1/2/3"));
    W2.goFace();
    W2.goBtn.classList.toggle("on", W2.S.goMode && !W2.S.cursorMode);
    W2.goBtn.classList.toggle("cursor", W2.S.cursorMode);
    W2.goBtn.setAttribute("aria-pressed", String(W2.S.goMode && !W2.S.cursorMode));
    const freshAll = all.filter((c) => !W2.isPage(c)).reduce((n, c) => n + W2.unread(c).length, 0);
    W2.listBtn.replaceChildren(document.createTextNode(freshAll ? `list \xB7 ${freshAll} new` : "list"), W2.el("kbd", { "aria-hidden": "true" }, "l"));
    W2.newPrev.hidden = W2.newNext.hidden = !W2.S.on || !all.some((c) => !W2.isPage(c) && W2.unread(c).length);
    if (!W2.LIST_WINDOW) {
      W2.newPrev.hidden = W2.newNext.hidden = true;
      W2.listBtn.hidden = !W2.S.on;
      {
        W2.listBtn.replaceChildren(W2.coarse ? "new" : W2.keyWord("ne", "w", ""), W2.el("b", { class: `cnt${freshAll ? "" : " zero"}` }, String(freshAll)));
        W2.listBtn.setAttribute("aria-label", `next new comment, ${freshAll} new`);
        W2.listBtn.setAttribute("aria-keyshortcuts", "w");
      }
      W2.listBtn.title = "next new comment: W, or Control-D while typing (Shift for the one before)";
      W2.listBtn.disabled = !freshAll;
      W2.listBtn.classList.toggle("quiet", !freshAll);
      const doneCount2 = all.filter((c) => !W2.isPage(c) && (c.resolved || workState(c)[0] === "done") && !W2.unread(c).length).length;
      W2.doneBtn.hidden = !W2.S.on;
      W2.doneBtn.disabled = !doneCount2 && !W2.S.showDone;
      W2.doneBtn.classList.toggle("quiet", W2.doneBtn.disabled);
      W2.doneBtn.replaceChildren(W2.S.showDone ? `hide done \xB7 ${doneCount2}` : `show done \xB7 ${doneCount2}`, W2.el("kbd", { "aria-hidden": "true" }, "d"));
      W2.doneBtn.setAttribute("aria-keyshortcuts", "d");
    }
    W2.placeBar();
    const tabNew = all.reduce((n, c) => n + W2.unread(c).length, 0);
    if (!W2.tabTitle.base || !document.title.startsWith("(")) W2.tabTitle.base = document.title.replace(/^\(\d+\) /, "");
    const want = tabNew ? `(${tabNew}) ${W2.tabTitle.base}` : W2.tabTitle.base;
    if (document.title !== want) document.title = want;
    W2.listBtn.classList.toggle("has-new", freshAll > 0);
    const h = W2.held().length;
    W2.sendBtn.hidden = !h;
    W2.sendBtn.textContent = `send ${h} draft${h === 1 ? "" : "s"}`;
    W2.listEl.hidden = !W2.S.on || !W2.S.listOpen;
    if (W2.listEl.hidden) return;
    for (const b of W2.listEl.querySelectorAll("[data-f]")) b.classList.toggle("on", b.dataset.f === W2.S.filter);
    const fresh = all.filter((c) => !W2.isPage(c) && W2.unread(c).length).length;
    W2.listEl.querySelector('[data-f="new"]').textContent = fresh ? `new \xB7 ${fresh}` : "new";
    for (const f of ["work", "resolved", "mine"]) W2.$(`[data-f="${f}"]`, W2.listEl).hidden = true;
    W2.holdBtn.hidden = !W2.DRAFT_MODE;
    const doneCount = all.filter((c) => !W2.isPage(c) && (c.resolved || workState(c)[0] === "done") && !W2.unread(c).length).length;
    W2.showDoneBtn.hidden = !doneCount;
    W2.showDoneBtn.textContent = W2.S.showDone ? `hide done \xB7 ${doneCount}` : `show done \xB7 ${doneCount}`;
    W2.holdBtn.classList.toggle("on", W2.drafting());
    if (W2.S.filter === "work") return W2.listEl.querySelector(".items").replaceChildren(...workItems());
    const items = W2.listed().map((c) => {
      const b = W2.el("button", { class: `it${W2.S.openId === c.id ? " cur" : ""}`, type: "button" });
      b.append(document.createTextNode(`${c.resolved ? "\u2713" : W2.numberOf(c)}  ${c.text.replace(/\s+/g, " ").slice(0, 70)} `), ...W2.onWhat(c) ? [W2.el("span", {}, `on ${W2.onWhat(c)} `)] : [], W2.el("span", {}, `\xB7 ${c.name}${!c.resolved && W2.isDone(c) ? " \xB7 \u2705 done" : ""}`), ...W2.unread(c).length ? [" ", W2.el("span", { class: "tag" }, `${W2.unread(c).length} new`)] : []);
      b.addEventListener("click", () => goTo(c));
      return b;
    });
    W2.listEl.querySelector(".items").replaceChildren(...items.length ? items : [W2.el("div", { class: "none" }, "nothing here")]);
  }
  var workState = (c) => {
    const thread = [c, ...W2.repliesOf(c.id)];
    const lastPerson = thread.filter((m) => !m.session).map((m) => m.createdAt).sort().at(-1) || "";
    const answer = thread.filter((m) => m.session).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const answered = answer && answer.createdAt > lastPerson;
    if (c.resolved || answered && /^done\b/i.test(answer.text)) return ["done", answered ? answer.createdAt : c.createdAt];
    if (answered && /^on it\b/i.test(answer.text)) return ["now", answer.createdAt];
    if (!answered && c.handedAt && c.handedAt >= lastPerson) return ["now", c.handedAt];
    return answered ? [null, ""] : ["next", lastPerson];
  };
  function workItems() {
    const today = (/* @__PURE__ */ new Date()).toDateString();
    const now = [];
    const next = [];
    const done = [];
    for (const c of W2.S.comments.filter((x) => !x.parent)) {
      const [state, at] = workState(c);
      if (state === "now") now.push([c, at]);
      else if (state === "next") next.push([c, at]);
      else if (state === "done" && new Date(at).toDateString() === today) done.push([c, at]);
    }
    const row = ([c, at], when) => {
      const b = W2.el("button", { class: `it${W2.S.openId === c.id ? " cur" : ""}`, type: "button" });
      b.append(document.createTextNode(`${W2.isPage(c) ? "chat" : c.resolved ? "\u2713" : W2.numberOf(c)}  ${c.text.replace(/\s+/g, " ").slice(0, 70)} `), W2.el("span", {}, `\xB7 ${when(at)}`));
      b.addEventListener("click", () => W2.isPage(c) ? (W2.S.chatOpen = true, W2.S.listOpen = false, W2.render()) : goTo(c));
      return b;
    };
    const part = (title, list, when, newest = false) => list.length ? [W2.el("div", { class: "group" }, `${title} \xB7 ${list.length}`), ...list.sort((a, b) => (newest ? -1 : 1) * a[1].localeCompare(b[1])).map((x) => row(x, when))] : [];
    const out = [
      ...part("Now", now, (at) => `on it ${W2.ago(at)}`.replace("on it just now", "just started")),
      ...part("Next", next, (at) => `sent ${W2.ago(at)} ago`.replace("just now ago", "just now")),
      ...part("Done today", done, (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), true)
    ];
    return out.length ? out : [W2.el("div", { class: "none" }, "nothing in progress on this page")];
  }
  var stepNew = (dir) => {
    const fresh = W2.threads().filter((c) => !W2.isPage(c) && W2.unread(c).length);
    if (!fresh.length) return;
    const top = (c) => W2.position(c.anchor || {}).top;
    fresh.sort((a, b) => top(a) - top(b));
    const open = W2.S.openId && W2.threads().find((c) => c.id === W2.S.openId);
    const here = open ? top(open) : null;
    const after = here == null ? -1 : fresh.findIndex((c) => top(c) > here);
    const at = fresh.findIndex((c) => c.id === W2.S.openId);
    const next = at >= 0 ? (at + dir + fresh.length) % fresh.length : here == null ? dir > 0 ? 0 : fresh.length - 1 : dir > 0 ? after < 0 ? 0 : after : ((after < 0 ? fresh.length : after) - 1 + fresh.length) % fresh.length;
    W2.S.chatOpen = false;
    goTo(fresh[next], !W2.coarse);
  };

  // src/widget/chat.ts
  var W3;
  function bindChat(w) {
    W3 = w;
  }
  var stamped = (bubble, stamp) => {
    const room = stamp.cloneNode(true);
    room.className = "stamp-room";
    room.setAttribute("aria-hidden", "true");
    for (const n of room.querySelectorAll("[role]")) n.removeAttribute("role");
    const last = [...bubble.children].reverse().find((n) => n.classList?.contains("p"));
    (last || bubble).append(room);
    bubble.append(stamp);
  };
  function drawChat() {
    const byId = new Map(W3.S.comments.map((c) => [c.id, c]));
    const msgs = W3.S.comments.filter((c) => W3.isPage(c) || c.parent && W3.isPage(byId.get(c.parent) || {})).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-150);
    if (W3.S.on && W3.S.chatOpen && W3.chatEl.hidden) W3.S.newFrom = msgs.find(W3.isNew)?.id || null;
    if (!W3.S.chatOpen) W3.S.newFrom = null;
    if (W3.S.on && W3.S.chatOpen) W3.markSeen(msgs.filter(W3.isNew));
    const fresh = msgs.filter(W3.isNew).length;
    W3.chatBtn.hidden = !W3.S.on;
    {
      const mark = W3.chatBtn.querySelector(".mark");
      while (W3.chatBtn.lastChild && W3.chatBtn.lastChild !== mark) W3.chatBtn.lastChild.remove();
      W3.chatBtn.append(W3.coarse ? "chat" : W3.keyWord("", "c", "hat"), W3.el("b", { class: `cnt${fresh ? "" : " zero"}` }, String(fresh)));
      W3.chatBtn.setAttribute("aria-label", `chat, ${fresh} new`);
      W3.chatBtn.setAttribute("aria-keyshortcuts", "c");
    }
    W3.chatBtn.classList.toggle("has-new", fresh > 0);
    W3.placeBar();
    const opening = W3.chatEl.hidden;
    W3.chatEl.hidden = !W3.S.on || !W3.S.chatOpen;
    if (W3.chatEl.hidden) W3.chatEl.classList.remove("full");
    if (W3.chatEl.hidden && W3.chatEl.contains(W3.root.activeElement)) W3.root.activeElement.blur();
    if (W3.chatEl.hidden) return;
    const box = W3.$(".msgs", W3.chatEl);
    const atEnd = opening || box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    const before = new Set(opening ? [] : [...box.children].map((n) => n.dataset.id));
    const kept = new Map([...box.children].filter((n) => n.dataset.id).map((n) => [n.dataset.id, n]));
    const same = (n) => {
      const old = kept.get(n.dataset?.id);
      return old && old.outerHTML.replace(" fresh", "") === n.outerHTML ? old : n;
    };
    W3.patchKids(box, msgs.flatMap((m) => {
      const root = m.parent ? byId.get(m.parent) : m;
      const b = W3.el("div", { class: `msg${W3.mine(m) && !m.session ? " mine" : ""}${root && W3.S.replyTo === root.id ? " to" : ""}${before.size && !before.has(m.id) ? " fresh" : ""}`, "data-id": m.id, ...W3.agentOf(m) ? { "data-agent": W3.agentOf(m) } : {} });
      b.append(W3.nameLine(m.name, false));
      if (m.parent && root) {
        const q = W3.el("div", { class: "quote" });
        q.append(W3.el("b", {}, String(root.name || "").replace(/\s*·\s*session\s+\S+$/i, "")), document.createTextNode(root.text.replace(/\s+/g, " ").slice(0, 90)));
        q.addEventListener("click", (e) => {
          e.stopPropagation();
          const box2 = W3.$(".msgs", W3.chatEl);
          const to = W3.$(`[data-id="${root.id}"]`, box2);
          if (!to) return;
          box2.scrollTo({ top: to.offsetTop - box2.offsetTop - 12, behavior: W3.still.matches ? "auto" : "smooth" });
          to.animate?.([{ boxShadow: "0 0 0 2px rgb(52,199,89)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 900 });
        });
        b.append(q);
      }
      b.append(...W3.readable(m.text));
      stamped(b, W3.stampOf(m, root));
      return m.id === W3.S.newFrom && m !== msgs[0] ? [W3.el("div", { class: "newline" }, "new"), b] : [b];
    }).map(same));
    const strip = W3.$(".replying", W3.chatEl);
    const target = W3.S.replyTo && byId.get(W3.S.replyTo);
    strip.hidden = !target;
    if (target) {
      const x = W3.el("button", { type: "button", title: "about the page instead" }, "\u2715");
      x.addEventListener("click", () => (W3.S.replyTo = null, drawChat()));
      strip.replaceChildren(document.createTextNode(`\u21A9 ${target.name}: ${target.text.replace(/\s+/g, " ").slice(0, 40)}`), x);
    }
    if (!box.firstChild) box.append(W3.el("div", { class: "none" }, "say something about the page as a whole"));
    const chat = W3.chatEl.querySelector(".chat");
    if (!chat.firstChild)
      chat.append(
        W3.composer({
          placeholder: "message",
          onSubmit: async (name, text) => {
            const { comment } = await W3.send(
              W3.S.replyTo ? { name, text, parent: W3.S.replyTo } : { name, text, anchor: { kind: "page", width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 } }
            );
            const answered = W3.S.replyTo && W3.S.comments.find((x) => x.id === W3.S.replyTo);
            if (answered?.resolved) answered.resolved = false;
            W3.S.replyTo = null;
            W3.S.comments.push(comment);
            W3.markSeen([comment]);
            box.scrollTop = box.scrollHeight;
            W3.render();
            return { keep: true };
          }
        })
      );
    chat.querySelector("textarea").placeholder = target ? "reply" : "message";
    if (atEnd) box.scrollTop = box.scrollHeight;
  }

  // src/widget/thread.ts
  var W4;
  function bindThread(w) {
    W4 = w;
  }
  function placeCard(card, left, top) {
    W4.layer.append(card);
    const width = card.offsetWidth;
    const maxLeft = scrollX + document.documentElement.clientWidth - width - 12;
    card.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, maxLeft))}px`;
    const h = card.offsetHeight;
    const below = top + 10 + h > W4.contentEnd();
    card.style.top = `${below ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`;
    card.style.transformOrigin = below ? "14px 100%" : "";
  }
  function placeBeside(node, left, top) {
    W4.layer.append(node);
    const width = node.offsetWidth;
    const right = scrollX + document.documentElement.clientWidth - 12;
    const h = node.offsetHeight;
    const end = W4.contentEnd();
    if (left + 36 + width <= right) {
      node.style.left = `${left + 36}px`;
      node.style.top = `${Math.min(top - 37, end - h - 8)}px`;
    } else {
      node.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, right - width))}px`;
      node.style.top = `${top + 10 + h > end ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`;
    }
  }
  function grab(pin, c) {
    pin.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = pin.getBoundingClientRect();
      const tip = { dx: e.clientX - r.left, dy: e.clientY - r.bottom };
      const start = { x: e.clientX, y: e.clientY, sx: scrollX, sy: scrollY, left: parseFloat(pin.style.left), top: parseFloat(pin.style.top) };
      let moving = false;
      let last = e;
      W4.S.grabbing = true;
      pin.setPointerCapture(e.pointerId);
      const place = () => {
        pin.style.left = `${start.left + last.clientX - start.x + scrollX - start.sx}px`;
        pin.style.top = `${start.top + last.clientY - start.y + scrollY - start.sy}px`;
      };
      const move = (ev) => {
        last = ev;
        if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        moving = true;
        pin.classList.add("dragging");
        place();
      };
      const scrolled = () => moving && place();
      addEventListener("scroll", scrolled, true);
      W4.S.dropDrag = () => {
        removeEventListener("scroll", scrolled, true);
        W4.S.dropDrag = null;
      };
      const up = async (ev) => {
        pin.removeEventListener("pointermove", move);
        pin.removeEventListener("pointerup", up);
        pin.removeEventListener("pointercancel", up);
        pin.removeEventListener("lostpointercapture", up);
        W4.S.dropDrag?.();
        if (!W4.S.grabbing) return;
        W4.S.grabbing = false;
        if (!moving) return;
        pin.dataset.dragged = "1";
        setTimeout(() => delete pin.dataset.dragged, 0);
        const x = ev.clientX - tip.dx;
        const y = ev.clientY - tip.dy;
        const under = document.elementsFromPoint(x, y).find((n) => n !== W4.host);
        if (ev.type === "pointercancel" || x < 0 || y < 0 || x > innerWidth || y > innerHeight || under?.closest(W4.OFF)) return W4.render();
        const before = c.anchor;
        c.anchor = W4.anchorAt(x, y);
        W4.render();
        try {
          const { comment } = await W4.send({ action: "move", id: c.id, anchor: c.anchor, edit: W4.store.get(`lab-edit:${c.id}`) || void 0 });
          Object.assign(c, comment);
        } catch {
          c.anchor = before;
          W4.render();
        }
      };
      pin.addEventListener("pointermove", move);
      pin.addEventListener("pointerup", up);
      pin.addEventListener("pointercancel", up);
      pin.addEventListener("lostpointercapture", up);
    });
  }
  function threadCard(c, fresh = /* @__PURE__ */ new Set(), focus = false) {
    const card = W4.el("div", { class: "card" });
    const body = W4.el("div", { class: "body" });
    const foot = W4.el("div", { class: "foot" });
    card.append(W4.el("div", { class: "handle" }), body, foot);
    card.addEventListener("click", (e) => e.stopPropagation());
    body.classList.add("msgs");
    const itemEl = (item) => {
      const box = W4.el("div", { class: `item msg${W4.mine(item) && !item.session ? " mine" : ""}`, "data-id": item.id, ...W4.agentOf(item) ? { "data-agent": W4.agentOf(item) } : {} });
      box.append(W4.nameLine(item.name, false), ...W4.readable(item.text));
      W4.stamped(box, W4.stampOf(item, c, item === c && !c.resolved ? `#${W4.numberOf(c)} \xB7 ` : ""));
      return box;
    };
    const shown = /* @__PURE__ */ new Set();
    const all = [c, ...W4.repliesOf(c.id)];
    const firstNew = all.find((x) => fresh.has(x.id));
    for (const item of all) {
      if (item === firstNew && item !== c) body.append(W4.el("div", { class: "newline" }, "new"));
      body.append(itemEl(item));
      shown.add(item.id);
    }
    card.sync = () => {
      for (const r of W4.repliesOf(c.id)) {
        if (shown.has(r.id)) continue;
        const items = card.querySelectorAll(".item");
        const added = itemEl(r);
        added.classList.add("fresh");
        items[items.length - 1].after(added);
        shown.add(r.id);
        W4.markSeen([r]);
      }
    };
    const ownKey = W4.store.get(`lab-edit:${c.id}`);
    let actions = null;
    if (W4.S.isAdmin || ownKey) {
      actions = W4.el("div", { class: "row acts" });
      const resolve = W4.el("button", { class: "btn", type: "button" }, c.resolved ? "reopen" : "resolve");
      const failed = (btn) => btn.textContent = "failed, try again";
      resolve.addEventListener("click", async () => {
        try {
          const closing = !c.resolved;
          const { comment } = await W4.send({ action: c.resolved ? "reopen" : "resolve", id: c.id, ...ownKey ? { edit: ownKey } : {} });
          Object.assign(c, comment);
          if (closing && W4.S.openId === c.id) return W4.S.closeFast = true, W4.S.openId = null, W4.render();
          W4.render();
        } catch {
          failed(resolve);
        }
      });
      const del = W4.el("button", { class: "btn", type: "button" }, "delete");
      const yes = W4.el("button", { class: "btn danger", type: "button" }, "delete");
      const no = W4.el("button", { class: "btn", type: "button" }, "cancel");
      const back = () => {
        actions.replaceChildren(resolve, del);
        del.focus();
      };
      del.addEventListener("click", () => {
        actions.replaceChildren(W4.el("span", { class: "ask" }, W4.repliesOf(c.id).length ? "delete thread?" : "delete comment?"), yes, no);
        no.focus();
      });
      no.addEventListener("click", back);
      actions.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && yes.isConnected) {
          e.stopPropagation();
          back();
        }
      });
      yes.addEventListener("click", async () => {
        try {
          await W4.send({ action: "delete", id: c.id });
        } catch {
          return failed(yes);
        }
        W4.S.comments = W4.S.comments.filter((x) => x.id !== c.id && x.parent !== c.id);
        W4.S.openId = null;
        W4.render();
      });
      actions.append(...W4.S.isAdmin ? [resolve, del] : [resolve]);
      body.append(actions);
    }
    if (W4.coarse) {
      const topOf = (x) => W4.position(x.anchor || {}).top;
      const here = topOf(c);
      const fresh2 = W4.threads().filter((x) => !W4.isPage(x) && x.id !== c.id && W4.unread(x).length).map((x) => [x, topOf(x)]);
      fresh2.sort((p, q) => (p[1] > here ? 0 : 1) - (q[1] > here ? 0 : 1) || p[1] - q[1]);
      const nav = W4.el("div", { class: "row nav" });
      if (fresh2.length) {
        const b = W4.el("button", { class: "btn", type: "button" }, `new \xB7 ${fresh2.length} \u203A`);
        b.addEventListener("pointerdown", (e) => e.preventDefault());
        b.addEventListener("click", () => W4.goTo(fresh2[0][0]));
        nav.append(b);
      }
      if (actions) nav.append(actions);
      if (nav.firstChild) card.insertBefore(nav, body);
    }
    foot.append(
      W4.composer({
        placeholder: "reply",
        autofocus: focus,
        onSubmit: async (name, text) => {
          const { comment } = await W4.send({ name, text, parent: c.id });
          W4.S.comments.push(comment);
          W4.markSeen([comment]);
          if (c.resolved) {
            c.resolved = false;
            W4.render();
            const again = W4.S.openCard?.querySelector(".body");
            if (again) again.scrollTop = again.scrollHeight;
            W4.S.openCard?.querySelector("textarea")?.focus({ preventScroll: true });
            return { keep: true };
          }
          shown.add(comment.id);
          const items = card.querySelectorAll(".item");
          const added = itemEl(comment);
          added.classList.add("fresh");
          items[items.length - 1].after(added);
          body.scrollTop = body.scrollHeight;
          return { keep: true };
        }
      })
    );
    return card;
  }

  // src/widget/live.ts
  var W5;
  function bindLive(w) {
    W5 = w;
  }
  function startLive() {
    if (W5.script?.dataset.live) {
      let onState = function(v) {
        {
          if (v.widget && W5.script.dataset.widget && v.widget !== W5.script.dataset.widget) return reload();
          if (v.lab && W5.script.dataset.lab && v.lab !== W5.script.dataset.lab) {
            W5.script.dataset.lab = v.lab;
            W5.script.dataset.version = String(v.files);
            hotAt = v.hot;
            commentsRev = v.comments;
            morphPage();
            W5.load();
          }
          if (String(v.files) !== W5.script.dataset.version) return reload();
          if (hotAt !== null && v.hot !== hotAt) {
            if (v.hot - hotAt > 1) hotUpdate([{ kind: "html" }, { kind: "css", path: "" }]);
            else hotUpdate(v.hotFiles || []);
          }
          hotAt = v.hot;
          if (commentsRev !== null && v.comments !== commentsRev) W5.loadChanges(commentsRev);
          commentsRev = v.comments;
          if (v.reads !== readsAt) {
            readsAt = v.reads;
            W5.syncReads();
          }
          const s = v.session;
          const mode = s ? v.mode || "listening" : "away";
          const span = (t) => Object.assign(document.createElement("span"), { textContent: t });
          const agent = s?.agent || "Claude";
          const tag = s && s.name !== agent ? [span(`(${s.name})`)] : [];
          if (mode === "listening") lbl.replaceChildren(span("talking to"), agent, ...tag);
          else if (mode === "working") lbl.replaceChildren(agent, span("is working"), ...tag);
          else lbl.replaceChildren(span("no agent listening"));
          who.classList.toggle("idle", mode === "away");
          who.classList.toggle("working", mode === "working");
          W5.listBtn.dataset.agent = mode;
          W5.chatBtn.dataset.agent = mode;
          if (W5.coarse && !W5.chatBtn.querySelector(".mark")) W5.chatBtn.insertAdjacentHTML("afterbegin", MARK);
          if (W5.coarse) W5.chatBtn.title = who.textContent;
          who.setAttribute("aria-label", who.textContent);
          if (s?.url && mode !== "away") Object.assign(who, { href: s.url, target: "_blank" });
          else who.removeAttribute("href");
          who.dataset.copy = !s?.url && s?.resume && mode !== "away" ? s.resume : "";
          who.title = mode === "away" ? "Ask your agent to run: npx @leonidstern/labit wait" : s?.resume ? `${s.resume}${who.dataset.copy ? " (tap to copy)" : ""}` : "";
          who.hidden = false;
        }
      };
      const key = "lab-scroll:" + location.pathname;
      try {
        const kept = JSON.parse(sessionStorage.getItem(key) || "null");
        if (kept !== null) {
          sessionStorage.removeItem(key);
          if (kept.open) W5.S.openId = kept.open;
          if (kept.list) {
            W5.S.listOpen = true;
            W5.S.filter = ["new", "open", "resolved", "mine"].includes(kept.filter) ? kept.filter : W5.S.filter;
          }
          if (kept.chat) W5.S.chatOpen = true;
          addEventListener("load", () => scrollTo(0, +(kept.y ?? kept)));
        }
      } catch {
      }
      let touchedAt = 0;
      for (const t of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(t, () => touchedAt = performance.now(), { capture: true, passive: true });
      const busy = () => W5.S.draft || W5.S.grabbing || W5.S.openId || W5.S.chatOpen || W5.S.listOpen || W5.coarse && /^(textarea|input)$/.test(W5.root.activeElement?.localName || "") || [...W5.root.querySelectorAll("textarea")].some((t) => t.value.trim()) || performance.now() - touchedAt < 1500;
      let reloadWhenShown = false;
      let reloadTimer = 0;
      const reload = () => {
        if (document.hidden) return void (reloadWhenShown = true);
        if (busy()) {
          if (!reloadTimer) reloadTimer = setTimeout(() => (reloadTimer = 0, reload()), 500);
          return;
        }
        try {
          sessionStorage.setItem(key, JSON.stringify({ y: scrollY, open: W5.S.openId, list: W5.S.listOpen, filter: W5.S.filter, chat: W5.S.chatOpen }));
        } catch {
        }
        location.reload();
      };
      const who = document.createElement("a");
      who.className = "listener";
      who.addEventListener("click", async () => {
        const text = who.dataset.copy;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const was = [...lbl.childNodes];
          lbl.replaceChildren("copied");
          setTimeout(() => lbl.textContent === "copied" && lbl.replaceChildren(...was), 1200);
        } catch {
        }
      });
      const MARK = '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(-1 -.5)"><path class="e1" d="M18.9 24.67L24.4 3h11.5L31.28 21.2A22.8 22.8 0 0 0 18.9 24.67Z"/><path class="e2" d="M37.07 22.02L41.9 3h11.5L47.1 27.85A22.8 22.8 0 0 0 37.07 22.02Z"/><path d="M31 26a18 18 0 0 1 18 18 18 18 0 0 1-18 18H15.57a2.57 2.57 0 0 1-2.57-2.57V44A18 18 0 0 1 31 26Z"/><circle class="eye" cx="31" cy="45" r="6.2"/></g></svg>';
      who.innerHTML = MARK + '<div class="lbl"></div>';
      const lbl = who.querySelector(".lbl");
      who.hidden = true;
      W5.root.querySelector(".left").prepend(who);
      if (!document.querySelector('link[rel~="icon"]')) {
        fetch("/favicon.ico", { method: "HEAD" }).then((r) => r.ok && /^image\//.test(r.headers.get("content-type") || "")).catch(() => false).then((has) => {
          if (has || document.querySelector('link[rel~="icon"]')) return;
          document.head.append(Object.assign(document.createElement("link"), { rel: "icon", href: "/_lab/favicon.svg" }));
        });
      }
      let stream = null;
      let beat = 0;
      const showAway = (word) => {
        lbl.replaceChildren(Object.assign(document.createElement("span"), { textContent: word }));
        who.setAttribute("aria-label", word);
        who.classList.add("idle");
        who.classList.remove("working");
        who.hidden = false;
      };
      let commentsRev = null;
      let readsAt = null;
      let hotAt = null;
      const swapCss = (files) => {
        const links = [...document.querySelectorAll('link[rel~="stylesheet"][href]:not([data-lab-swap])')].filter((l) => new URL(l.href, location.href).origin === location.origin);
        const named = links.filter((l) => files.includes(decodeURIComponent(new URL(l.href, location.href).pathname)));
        for (const link of named.length ? named : links) {
          const url = new URL(link.href, location.href);
          url.searchParams.set("lab-v", Date.now().toString(36));
          const next = link.cloneNode();
          next.href = url.href;
          next.dataset.labSwap = "";
          const path = url.pathname;
          next.addEventListener("load", () => {
            for (const l of document.querySelectorAll('link[rel~="stylesheet"][href]')) if (l !== next && new URL(l.href, location.href).pathname === path) l.remove();
            delete next.dataset.labSwap;
          }, { once: true });
          next.addEventListener("error", () => next.remove(), { once: true });
          link.after(next);
        }
      };
      const fresh = (u) => {
        const url = new URL(u, location.href);
        url.searchParams.set("lab-v", Date.now().toString(36));
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
      const swapImages = (paths) => {
        let hit = 0;
        for (const n of document.querySelectorAll('img, source, video[poster], image, use, link[rel~="icon"]')) {
          if (W5.host.contains(n)) continue;
          for (const attr of ["src", "href", "poster", "xlink:href"]) {
            const v = n.getAttribute(attr);
            if (!v || !samePath(v.split("#")[0], paths)) continue;
            const next = fresh(v.split("#")[0]);
            const im = new Image();
            im.src = next;
            (im.decode ? im.decode() : Promise.resolve()).catch(() => {
            }).finally(() => n.setAttribute(attr, next + (v.includes("#") ? v.slice(v.indexOf("#")) : "")));
            hit++;
          }
          const set = n.getAttribute("srcset");
          if (set && set.split(",").some((c) => samePath(c.trim().split(/\s+/)[0], paths))) {
            n.setAttribute("srcset", set.split(",").map((c) => {
              const [u, ...rest] = c.trim().split(/\s+/);
              return [samePath(u, paths) ? fresh(u) : u, ...rest].join(" ");
            }).join(", "));
            hit++;
          }
        }
        if (!hit) swapCss([]);
      };
      const reloadFonts = (paths) => {
        for (const sheet of document.styleSheets) {
          let rules;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const r of rules || []) {
            if (!(r instanceof CSSFontFaceRule)) continue;
            const src = r.style.getPropertyValue("src");
            const base = sheet.href || location.href;
            if (!/url\(/.test(src) || ![...src.matchAll(/url\(["']?([^"')]+)/g)].some((m) => samePath(new URL(m[1], base).href, paths))) continue;
            const again = src.replace(/url\(["']?([^"')]+)["']?\)/g, (all, u) => samePath(new URL(u, base).href, paths) ? `url("${fresh(new URL(u, base).href)}")` : all);
            const d3 = (k) => r.style.getPropertyValue(k) || void 0;
            try {
              const face = new FontFace(d3("font-family").replace(/^["']|["']$/g, ""), again, { weight: d3("font-weight"), style: d3("font-style"), stretch: d3("font-stretch"), unicodeRange: d3("unicode-range"), display: d3("font-display") });
              face.load().then((f) => document.fonts.add(f)).catch(() => {
              });
            } catch {
            }
          }
        }
      };
      const ownStyles = () => /* @__PURE__ */ new Set([W5.fonts, W5.pinCursorStyle]);
      const scriptsOf = (doc) => [...doc.querySelectorAll("script")].filter((x) => !/\/_lab\/comments\.js/.test(x.getAttribute("src") || "")).map((x) => x.getAttribute("src") || x.textContent);
      const sheetsOf = (doc) => [...doc.querySelectorAll('link[rel~="stylesheet"]')].map((l) => {
        try {
          return new URL(l.getAttribute("href"), location.href).pathname;
        } catch {
          return "";
        }
      });
      const keepOut = (n) => n === W5.host || n.nodeType === 1 && n.localName === "script";
      const same = (o, n) => o.nodeType === n.nodeType && o.nodeName === n.nodeName && (o.nodeType !== 1 || (o.id || "") === (n.id || ""));
      const alike = (o, n) => same(o, n) && (o.nodeType === 1 ? Boolean(o.id) || o.getAttribute("class") === n.getAttribute("class") : o.nodeType !== 3 || o.data === n.data);
      const morphKids = (a, b) => {
        const olds = [...a.childNodes].filter((n) => !keepOut(n));
        const news = [...b.childNodes].filter((n) => !(n.nodeType === 1 && n.localName === "script"));
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
          if (alike(o, n)) return void (prev = morphNode(o, n), j++);
          if (news.slice(i + 1, i + 8).some((m) => alike(o, m))) return void (prev = put(n));
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
        if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || o.nodeType === 1 && (o.id || "") !== (n.id || "")) {
          const c = document.importNode(n, true);
          o.replaceWith(c);
          return c;
        }
        if (o.nodeType === 3 || o.nodeType === 8) {
          if (o.data !== n.data) o.data = n.data;
          return o;
        }
        if (o.nodeType !== 1) return o;
        for (const { name } of Array.from(o.attributes)) if (!n.hasAttribute(name) && !(name === "open" && /^(details|dialog)$/.test(o.localName))) o.removeAttribute(name);
        for (const { name, value } of Array.from(n.attributes)) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
        if (o === document.activeElement || o.shadowRoot || /^(iframe|canvas|video|audio|textarea|select|input)$/.test(o.localName)) return o;
        morphKids(o, n);
        return o;
      };
      const ownScripts = () => scriptsOf(document).length > 0;
      let morphRun = 0;
      const morphPage = async () => {
        if (ownScripts()) return reload();
        const run = ++morphRun;
        try {
          const res = await fetch(location.href, { cache: "no-store", headers: { accept: "text/html" } });
          if (!res.ok) return reload();
          const html = await res.text();
          if (run !== morphRun) return;
          const doc = new DOMParser().parseFromString(html, "text/html");
          if (scriptsOf(doc).join("\n") !== scriptsOf(document).join("\n") || sheetsOf(doc).join("\n") !== sheetsOf(document).join("\n")) return reload();
          let mark = null;
          for (const y of [Math.min(innerHeight / 3, 240), innerHeight / 2, 80]) {
            const e = document.elementFromPoint(innerWidth / 2, y);
            if (e && e !== document.body && e !== document.documentElement && !W5.host.contains(e) && e !== W5.host) {
              mark = e;
              break;
            }
          }
          const markTop = mark?.getBoundingClientRect().top;
          const apply = () => {
            if (doc.title !== W5.tabTitle.base) {
              W5.tabTitle.base = doc.title;
              document.title = doc.title;
              W5.drawList();
            }
            const mine = ownStyles();
            const olds = [...document.head.querySelectorAll("style")].filter((x) => !mine.has(x));
            const news = [...doc.head.querySelectorAll("style")];
            news.forEach((n, i) => olds[i] ? olds[i].textContent !== n.textContent && (olds[i].textContent = n.textContent) : document.head.append(document.importNode(n, true)));
            for (const o of olds.slice(news.length)) o.remove();
            morphKids(document.body, doc.body);
            if (mark?.isConnected) {
              const moved = mark.getBoundingClientRect().top - markTop;
              if (Math.abs(moved) > 1) scrollBy(0, moved);
            }
            W5.reflow();
          };
          const safe = () => {
            try {
              apply();
            } catch {
              reload();
            }
          };
          if (document.startViewTransition && !W5.still.matches) document.startViewTransition(safe);
          else safe();
        } catch {
          reload();
        }
      };
      const hotUpdate = (files) => {
        const of = (kind) => files.filter((f) => f.kind === kind).map((f) => f.path);
        const here = decodeURIComponent(location.pathname).replace(/\/$/, "/index").replace(/\.html?$/i, "");
        if (of("html").some((p) => !p || p.replace(/\.html?$/i, "") === here)) morphPage();
        if (of("css").length) swapCss(of("css"));
        if (of("img").length) swapImages(of("img"));
        if (of("font").length) reloadFonts(of("font"));
      };
      const tab = Math.random().toString(36).slice(2, 12);
      let pollTimer = 0;
      let dropTimer = 0;
      const poll = async () => {
        try {
          onState(await (await fetch(`${W5.script.dataset.live.replace(/live$/, "state")}?tab=${tab}`, { cache: "no-store" })).json());
        } catch {
        }
      };
      const toBackground = () => {
        clearTimeout(dropTimer);
        dropTimer = setTimeout(() => {
          stream?.close();
          stream = null;
          clearInterval(pollTimer);
          pollTimer = setInterval(poll, 2e4);
        }, 3e4);
      };
      const toFront = () => {
        clearTimeout(dropTimer);
        clearInterval(pollTimer);
        pollTimer = 0;
        connect();
      };
      const connect = () => {
        if (stream) return;
        stream = new EventSource(`${W5.script.dataset.live}?tab=${tab}`);
        beat = Date.now();
        stream.addEventListener("beat", () => beat = Date.now());
        stream.onerror = () => showAway("reconnecting");
        stream.onmessage = (e) => {
          beat = Date.now();
          onState(JSON.parse(e.data));
        };
      };
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return toBackground();
        if (reloadWhenShown) return reload();
        toFront();
      });
      addEventListener("pagehide", () => {
        stream?.close();
        stream = null;
        fetch(W5.script.dataset.live.replace(/live$/, "bye"), { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ tab }) }).catch(() => {
        });
      });
      addEventListener("pageshow", (e) => e.persisted && connect());
      let tick = Date.now();
      const freshStream = () => {
        stream?.close();
        stream = null;
        showAway("reconnecting");
        connect();
      };
      setInterval(() => {
        const now = Date.now();
        const slept = now - tick > 2e4;
        tick = now;
        if (document.hidden) return;
        if (slept || stream && now - beat > 4e4) freshStream();
      }, 5e3);
      addEventListener("online", () => !document.hidden && freshStream());
      connect();
      if (document.hidden) toBackground();
    }
  }

  // src/comments.js
  /*!
   * lab comments: anyone with the link clicks anywhere on a lab page to pin a comment. No login, just a name.
   * https://github.com/leonidstern/labit · MIT
   * Comments are off by default; the bar button or c turns them on (remembered per browser). When on, click anywhere that isn't a link or control to pin one (alt/option-click pins on those too). c (or the bar button) hides
   * and shows them; esc or a click outside closes an open comment. Dragging (mouse/pen) marks an area instead of a point.
   * Include on a page served through your lab domain:
   *   <script src="https://lab.example.com/_lab/comments.js" defer><\/script>
   * The layer only turns on when the page is opened on the host the script is loaded from (or data-host),
   * so the deployment's own address and local dev stay clean. data-enable="always" turns it on everywhere.
   * Admin (resolve / delete / copy agent link): open any page once with ?lab-admin=<LAB_COMMENTS_ADMIN_TOKEN>; it is kept in this browser.
   */
  (() => {
    const S = { dbg: null };
    const W6 = {
      get $() {
        return $;
      },
      get DRAFT_MODE() {
        return DRAFT_MODE;
      },
      get LIST_WINDOW() {
        return LIST_WINDOW;
      },
      get OFF() {
        return OFF;
      },
      get S() {
        return S;
      },
      get agentOf() {
        return agentOf;
      },
      get ago() {
        return ago;
      },
      get anchorAt() {
        return anchorAt;
      },
      get bar() {
        return bar;
      },
      get chatBtn() {
        return chatBtn;
      },
      get chatEl() {
        return chatEl;
      },
      get closeOrNudge() {
        return closeOrNudge;
      },
      get coarse() {
        return coarse;
      },
      get composer() {
        return composer;
      },
      get contentEnd() {
        return contentEnd;
      },
      get doneBtn() {
        return doneBtn;
      },
      get drafting() {
        return drafting;
      },
      get drawList() {
        return drawList;
      },
      get el() {
        return el2;
      },
      get fonts() {
        return fonts;
      },
      get goBtn() {
        return goBtn;
      },
      get goFace() {
        return goFace;
      },
      get goTo() {
        return goTo;
      },
      get held() {
        return held;
      },
      get holdBtn() {
        return holdBtn;
      },
      get host() {
        return host2;
      },
      get isDone() {
        return isDone;
      },
      get isNew() {
        return isNew;
      },
      get isPage() {
        return isPage;
      },
      get keyWord() {
        return keyWord;
      },
      get layer() {
        return layer2;
      },
      get listBtn() {
        return listBtn;
      },
      get listEl() {
        return listEl;
      },
      get listed() {
        return listed;
      },
      get load() {
        return load;
      },
      get loadChanges() {
        return loadChanges;
      },
      get markSeen() {
        return markSeen;
      },
      get mine() {
        return mine;
      },
      get nameLine() {
        return nameLine;
      },
      get newNext() {
        return newNext;
      },
      get newPrev() {
        return newPrev;
      },
      get numberOf() {
        return numberOf;
      },
      get onWhat() {
        return onWhat;
      },
      get openSheet() {
        return openSheet;
      },
      get patchKids() {
        return patchKids;
      },
      get pinCursorStyle() {
        return pinCursorStyle;
      },
      get placeBar() {
        return placeBar;
      },
      get position() {
        return position;
      },
      get readable() {
        return readable;
      },
      get reflow() {
        return reflow;
      },
      get render() {
        return render;
      },
      get repliesOf() {
        return repliesOf;
      },
      get root() {
        return root;
      },
      get scrim() {
        return scrim;
      },
      get script() {
        return script;
      },
      get send() {
        return send;
      },
      get sendBtn() {
        return sendBtn;
      },
      get showDoneBtn() {
        return showDoneBtn;
      },
      get stampOf() {
        return stampOf;
      },
      get stamped() {
        return stamped;
      },
      get still() {
        return still;
      },
      get store() {
        return store2;
      },
      get syncReads() {
        return syncReads;
      },
      get tabTitle() {
        return tabTitle;
      },
      get threads() {
        return threads;
      },
      get unread() {
        return unread;
      },
      get vv() {
        return vv;
      }
    };
    bindLive(W6);
    bindList(W6);
    bindChat(W6);
    bindThread(W6);
    bindSheets(W6);
    const script = (
      /** @type {HTMLScriptElement | null} */
      document.currentScript
    );
    const labHost = script?.dataset.host || (script?.src ? new URL(script.src, location.href).hostname : location.hostname);
    const enabled = location.hostname === labHost || script?.dataset.enable === "always";
    if (!enabled || /** @type {any} */
    window.__labComments) return;
    window.__labComments = true;
    const API = script?.dataset.api || "/_lab/api/comments";
    const pageNow = () => script?.dataset.page || location.pathname.replace(/\/+$/, "") || "/";
    S.page = pageNow();
    const store2 = {
      get: (k) => {
        try {
          return localStorage.getItem(k) || "";
        } catch {
          return "";
        }
      },
      set: (k, v) => {
        try {
          localStorage.setItem(k, v);
        } catch {
        }
      }
    };
    const scopeOf = (key) => key.split(".").length === 3 ? key.split(".")[1] : "";
    const adminParam = new URLSearchParams(location.hash.slice(1)).get("lab-admin") || new URLSearchParams(location.search).get("lab-admin");
    if (adminParam) {
      const scope = scopeOf(adminParam);
      store2.set(scope ? `lab-admin:${scope}` : "lab-admin", adminParam);
      const url = new URL(location.href);
      url.searchParams.delete("lab-admin");
      if (/lab-admin=/.test(url.hash)) url.hash = "";
      history.replaceState(null, "", url);
    }
    const adminToken = script?.dataset.admin || store2.get(`lab-admin:${S.page.split("/")[1] || ""}`) || store2.get("lab-admin:*") || store2.get("lab-admin");
    S.comments = [];
    S.isAdmin = false;
    S.on = store2.get("lab-on") ? store2.get("lab-on") === "1" : script?.dataset.on === "1";
    S.openId = null;
    S.closeFast = false;
    S.cardFull = false;
    S.draft = null;
    const host2 = document.createElement("div");
    host2.setAttribute("data-lab-comments", "");
    host2.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;";
    const root = host2.attachShadow({ mode: "open" });
    root.innerHTML = `
    <style>${styles_default}</style>
    <div class="scrim"></div>
    <div class="layer"></div>
    <button class="sel-chip" type="button" hidden>Comment</button>
    <div class="hint" role="status" hidden>click to comment \xB7 drag to mark an area \xB7 shift-drag to quote words \xB7 c chat \xB7 w new \xB7 1 comment \xB7 2 go \xB7 3 cursor \xB7 m hide</div>
    <div class="list" hidden><div class="tabs"><button type="button" data-f="new">new</button><button type="button" data-f="open">open</button><button type="button" data-f="work">work</button><button type="button" data-f="resolved">resolved</button><button type="button" data-f="mine">mine</button><button type="button" class="show-done" title="show or hide done pins on the page"></button><button type="button" class="hold" title="new pins wait here as drafts; send them together">draft mode</button><button type="button" class="x" aria-label="close">\u2715</button></div><div class="items"></div></div>
    <div class="list chatwin" hidden><div class="tabs"><b>chat</b></div><div class="msgs"></div><div class="replying" hidden></div><div class="chat"></div></div>
    <div class="left"><button class="secondary copy-all" type="button" hidden>copy link</button></div>
    <div class="bar">
      <button class="secondary send-all" type="button" hidden></button>
      <button class="secondary chat-btn" type="button" hidden title="chat (C)">chat</button>
      <button class="secondary new-prev" type="button" hidden aria-label="previous new comment">\u2039</button>
      <button class="secondary list-btn" type="button" hidden>list</button>
      <button class="secondary new-next" type="button" hidden aria-label="next new comment">\u203A</button>
      <button class="secondary done-btn" type="button" hidden title="show or hide done pins on the page"></button>
      <button class="secondary go-btn" type="button" hidden title="1 comment \xB7 2 go: every click approves what it's on \xB7 3 cursor: clicks are the page's own">go</button>
      <button class="toggle" type="button"></button>
      <button class="secondary more" type="button" hidden aria-label="more options" aria-expanded="false" aria-controls="lab-more">\u22EF</button>
    </div>
    <div class="more-menu" id="lab-more" hidden></div>`;
    const $ = (sel, box = root) => (
      /** @type {HTMLElement} */
      box.querySelector(sel)
    );
    const layer2 = $(".layer");
    const hint = $(".hint");
    if (matchMedia("(pointer: coarse)").matches) hint.textContent = "hold to comment";
    const toggleBtn = $(".toggle");
    const bar = (
      /** @type {HTMLElement} */
      root.querySelector(".bar")
    );
    const moreBtn = $(".more");
    const moreMenu = $(".more-menu");
    const copyBtn = $(".copy-all");
    const listBtn = (
      /** @type {HTMLButtonElement} */
      $(".list-btn")
    );
    const goBtn = $(".go-btn");
    const newPrev = $(".new-prev");
    const showDoneBtn = $(".show-done");
    const doneBtn = (
      /** @type {HTMLButtonElement} */
      $(".done-btn")
    );
    const LIST_WINDOW = false;
    const tabTitle = { base: "" };
    S.showDone = store2.get("lab-show-done") === "1";
    const newNext = $(".new-next");
    const sendBtn = $(".send-all");
    const listEl = $(".list");
    const holdBtn = $(".hold", listEl);
    const chatEl = $(".chatwin");
    const chatBtn = (
      /** @type {HTMLElement} */
      root.querySelector(".chat-btn")
    );
    S.listOpen = false;
    S.filter = "open";
    S.refit = () => {
    };
    S.chatOpen = false;
    const el2 = (tag, attrs = {}, text) => {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      if (text != null) node.textContent = text;
      return node;
    };
    bindAnchoring({ host: host2, layer: layer2, el: el2, store: store2 });
    bindComposer({ el: el2, store: store2, root, refreshPinCursor: () => refreshPinCursor(), syncReads: () => syncReads() });
    bindMessages({ el: el2, mine: (c) => mine(c), repliesOf: (id) => repliesOf(id), workState: (c) => workState(c) });
    function patchKids(box, next) {
      const keep = new Set(next);
      for (const n of Array.from(box.childNodes)) if (!keep.has(n)) n.remove();
      let at = box.firstChild;
      for (const n of next) {
        if (n === at) at = at.nextSibling;
        else box.insertBefore(n, at);
      }
    }
    const AGENT_KINDS = ["claude", "codex", "cursor", "gemini", "antigravity", "copilot", "amp", "opencode"];
    const agentOf = (m) => {
      if (!m?.session) return "";
      const k = String(m.session.kind || m.name || "").trim().split(/\W/)[0].toLowerCase();
      return AGENT_KINDS.includes(k) ? k === "antigravity" ? "gemini" : k : "";
    };
    const headers = () => ({ "content-type": "application/json", ...adminToken ? { "x-lab-admin": adminToken } : {} });
    S.gone = false;
    S.loaded = false;
    S.retried = false;
    const typed = () => Boolean(root.activeElement) || [...root.querySelectorAll("textarea")].some((t) => t.value.trim());
    async function load() {
      try {
        const res = await fetch(`${API}?page=${encodeURIComponent(S.page)}`, { headers: headers(), cache: "no-store" });
        if (res.status === 404 && !S.loaded && script?.dataset.enable !== "always") {
          if (!S.retried) {
            S.retried = true;
            setTimeout(load, 1500);
            return;
          }
          S.gone = true;
          S.on = false;
          document.documentElement.classList.remove("lab-pinning");
          host2.remove();
          fonts.remove();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        S.comments = data.comments || [];
        S.isAdmin = Boolean(data.admin);
        S.loaded = true;
      } catch {
      }
      shownAgain();
    }
    async function loadChanges(since) {
      try {
        const url = new URL("/_lab/api/changes", new URL(API, location.href));
        url.search = String(new URLSearchParams({ page: S.page, since: String(since) }));
        const res = await fetch(url, { cache: "no-store" });
        const data = res.ok ? await res.json() : { full: true };
        if (data.full || !S.loaded) return load();
        const gone = new Set(data.del);
        const fresh = new Map(data.set.map((c) => [c.id, c]));
        S.comments = S.comments.filter((c) => !gone.has(c.id)).map((c) => fresh.get(c.id) || c);
        const had = new Set(S.comments.map((c) => c.id));
        for (const c of data.set) if (!had.has(c.id)) S.comments.push(c);
        S.comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      } catch {
        return load();
      }
      shownAgain();
    }
    function shownAgain() {
      if (!typed() && !S.grabbing) render();
      else {
        if (S.openCard?.isConnected) S.openCard.sync();
        if (S.chatOpen) drawChat();
        drawList();
      }
    }
    S.goMode = store2.get("lab-go") === "1";
    S.cursorMode = store2.get("lab-cursor") === "1";
    const setCursor = (v) => {
      S.cursorMode = v;
      store2.set("lab-cursor", v ? "1" : "");
      goBtn.classList.toggle("cursor", v);
      goBtn.classList.toggle("on", S.goMode && !v);
      goFace();
      document.documentElement.classList.toggle("lab-pinning", S.on && !v);
      document.documentElement.classList.toggle("lab-go", S.on && S.goMode && !v);
      recheck();
    };
    const setGo = (v) => {
      if (S.cursorMode) setCursor(false);
      S.goMode = v;
      queueMicrotask(goFace);
      store2.set("lab-go", v ? "1" : "");
      goBtn.classList.toggle("on", v);
      goBtn.setAttribute("aria-pressed", String(v && !S.cursorMode));
      document.documentElement.classList.toggle("lab-go", S.on && v);
      ptr.classList.toggle("go", v);
      recheck();
    };
    function begin(anchor) {
      const name = store2.get("lab-name").trim();
      if (!S.goMode || !name) {
        S.draft = { anchor };
        return render();
      }
      if (drafting()) {
        store2.set(heldKey(), JSON.stringify([...held(), { name, text: "go", anchor }]));
        return render();
      }
      send({ name, text: "go", anchor }).then(({ comment, edit }) => {
        if (edit) store2.set(`lab-edit:${comment.id}`, edit);
        S.comments.push(comment);
        markSeen([comment]);
        S.posted = comment.id;
        render();
      }).catch(() => (S.draft = { anchor }, render()));
    }
    async function send(payload) {
      let res = null;
      if (!payload.action && !payload.nonce) payload = { ...payload, nonce: Math.random().toString(36).slice(2) + Date.now().toString(36) };
      for (let tries = 0; !res; tries++) {
        try {
          res = await fetch(API, { method: "POST", headers: headers(), body: JSON.stringify({ page: S.page, ...payload }) });
        } catch {
          if (tries >= 150) throw new Error("couldn't reach the lab; your text is still here");
          await new Promise((r) => setTimeout(r, 2e3));
        }
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `could not save (${res.status})`);
      if (data.comment && !payload.parent && !payload.action && payload.anchor?.kind !== "page") placed.push(data.comment.id);
      return data;
    }
    const placed = [];
    async function undoLast() {
      const id = placed.pop();
      const c = id && S.comments.find((x) => x.id === id);
      if (!c) return;
      const ownKey = store2.get(`lab-edit:${id}`);
      try {
        if (S.isAdmin) {
          await send({ action: "delete", id });
          S.comments = S.comments.filter((x) => x.id !== id && x.parent !== id);
        } else if (ownKey) {
          const { comment } = await send({ action: "resolve", id, edit: ownKey });
          Object.assign(c, comment);
        } else return void placed.push(id);
      } catch {
        return void placed.push(id);
      }
      if (S.openId === id) S.openId = null;
      render();
      say(`took back ${/^go$/i.test(c.text.trim()) ? "a go" : "a pin"} \xB7 ${placed.length ? "again for the one before" : "nothing more to take back"}`);
    }
    const said = { was: void 0, t: void 0 };
    function say(words) {
      said.was ??= hint.textContent;
      hint.textContent = words;
      hint.hidden = false;
      clearTimeout(said.t);
      said.t = setTimeout(() => {
        hint.hidden = true;
        hint.textContent = said.was;
        said.was = void 0;
      }, 1800);
    }
    const agentLink = () => new URL("/_lab/agent" + S.page, new URL(API, location.href)).href;
    async function copy(textPromise, button) {
      const textValue = await textPromise;
      try {
        await navigator.clipboard.writeText(textValue);
      } catch {
        const area = document.createElement("textarea");
        area.value = textValue;
        area.style.cssText = "position:fixed;opacity:0;";
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      if (moreMenu.contains(button)) return say("link copied");
      const label = button.textContent;
      button.style.width = `${button.getBoundingClientRect().width}px`;
      button.style.justifyContent = "center";
      button.textContent = "copied";
      setTimeout(() => {
        button.textContent = label;
        button.style.width = button.style.justifyContent = "";
      }, 1400);
    }
    const threads = () => S.comments.filter((c) => !c.parent);
    const heldKey = () => `lab-held:${S.page}`;
    const held = () => {
      try {
        return JSON.parse(store2.get(heldKey()) || "[]");
      } catch {
        return [];
      }
    };
    const listed = () => threads().filter((c) => c.anchor?.kind !== "page").filter((c) => S.filter === "new" ? unread(c).length : S.filter === "open" ? !c.resolved : S.filter === "resolved" ? c.resolved : mine(c)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const isPage = (c) => c.anchor?.kind === "page";
    S.stepping = false;
    S.keepKeys = false;
    const isDone = (c) => c.resolved || workState(c)[0] === "done";
    const keyWord = (before, key, after) => {
      const w = el2("span", { class: "kw" });
      w.append(before, el2("span", { class: "mn", "aria-hidden": "true" }, `(${key})`), after);
      return w;
    };
    function placeBar() {
      const inMenu = S.on ? [doneBtn, copyBtn, toggleBtn] : [];
      for (const b of inMenu) if (b.parentNode !== moreMenu) moreMenu.append(b);
      if (!S.on && toggleBtn.parentNode !== bar) bar.insertBefore(toggleBtn, moreBtn);
      if (!S.on) root.querySelector(".left").append(copyBtn);
      moreBtn.hidden = !S.on;
      if (!S.on && !moreMenu.hidden) setMenu(false);
      let first = true;
      for (
        const b of
        /** @type {HTMLCollectionOf<HTMLElement>} */
        bar.children
      ) {
        b.classList.toggle("first", first && !b.hidden);
        if (!b.hidden) first = false;
      }
    }
    function goFace() {
      const gp = goBtn.querySelector(".gp");
      if (gp) gp.textContent = !S.goMode && !S.cursorMode ? initial(store2.get("lab-name")) || "+" : "go";
      goBtn.setAttribute("aria-label", `a click places: ${S.cursorMode ? "nothing (cursor)" : S.goMode ? "go" : "a comment"}`);
      goBtn.setAttribute("aria-keyshortcuts", "1 2 3");
    }
    const ago = (iso) => {
      const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
      return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
    };
    S.replyTo = null;
    S.newFrom = null;
    const numberOf = (c) => S.comments.filter((x) => !x.parent && !x.resolved).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).indexOf(c) + 1;
    const seenKey = () => `lab-seen:${S.page}`;
    const readSeen = () => new Set(store2.get(seenKey()).split(",").filter(Boolean));
    S.seen = readSeen();
    const plain = (n) => String(n || "").replace(/\s+/g, " ").trim().toLowerCase();
    const mine = (c) => plain(c.name) && plain(c.name) === plain(store2.get("lab-name")) || Boolean(store2.get(`lab-edit:${c.id}`));
    const isNew = (c) => !S.seen.has(c.id) && !mine(c);
    const unread = (c) => [c, ...repliesOf(c.id)].filter(isNew);
    const markSeen = (items) => {
      const fresh = items.filter((item) => !S.seen.has(item.id)).map((item) => item.id);
      for (const item of items) S.seen.add(item.id);
      store2.set(seenKey(), [...S.seen].join(","));
      if (fresh.length) shareReads(fresh);
    };
    const READS = script?.dataset.live ? script.dataset.live.replace(/live$/, "api/reads") : "";
    const shareReads = (ids) => {
      const who = store2.get("lab-name").trim();
      if (!READS || !who || !ids.length) return;
      fetch(READS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: who, page: S.page, ids }) }).catch(() => {
      });
    };
    async function syncReads() {
      const who = store2.get("lab-name").trim();
      if (!READS || !who) return;
      const at = S.page;
      try {
        const { ids } = await (await fetch(`${READS}?name=${encodeURIComponent(who)}&page=${encodeURIComponent(at)}`, { cache: "no-store" })).json();
        if (at !== S.page) return;
        const theirs = new Set(ids);
        const mineOnly = [...S.seen].filter((id) => !theirs.has(id));
        const added = ids.filter((id) => !S.seen.has(id));
        if (mineOnly.length) shareReads(mineOnly);
        if (!added.length) return;
        for (const id of added) S.seen.add(id);
        store2.set(seenKey(), [...S.seen].join(","));
        shownAgain();
      } catch {
      }
    }
    const repliesOf = (id) => S.comments.filter((c) => c.parent === id);
    const initial = (name) => [...String(name || "").trim()][0]?.toUpperCase() || "";
    const contentEnd = () => {
      inPage(0);
      return pageEnd.y;
    };
    S.shown = null;
    S.posted = null;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const pinsById = /* @__PURE__ */ new Map();
    S.dropDrag = null;
    function render() {
      S.grabbing = false;
      S.dropDrag?.();
      const prev = (
        /** @type {HTMLElement | null} */
        layer2.querySelector(".card:not(.out), .float:not(.out)")
      );
      const prevHeight = S.stepping && coarse && prev ? prev.offsetHeight : 0;
      const prevScroll = prev ? prev.querySelector(".body")?.scrollTop ?? null : null;
      const places = new Map(S.on ? threads().filter((c) => c.anchor?.kind !== "page").map((c) => [c.id, position(c.anchor || {})]) : []);
      layer2.replaceChildren();
      pinsById.clear();
      const now = S.on ? S.draft || S.openId : null;
      const appear = now !== S.shown;
      const anim = appear ? " in" : "";
      let quoted = null;
      const done = () => {
        if (S.closeFast && !now && prev) {
          S.closeFast = false;
          prev.inert = true;
          layer2.append(prev);
          const gone = () => prev.remove();
          if (still.matches || !prev.animate) gone();
          else prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" }).finished.then(gone, gone);
        } else if (coarse && !now && S.shown && prev && !still.matches && !prev.style.transform) {
          prev.classList.remove("in");
          prev.classList.add("out");
          prev.inert = true;
          layer2.append(prev);
          setTimeout(() => prev.remove(), coarse ? 230 : 150);
        }
        markQuote(quoted);
        S.shown = now;
        S.posted = null;
      };
      const list = threads();
      const open = list.filter((c) => !c.resolved && c.anchor?.kind !== "page").length;
      const fresh = list.filter((c) => !c.resolved && c.anchor?.kind !== "page").reduce((n, c) => n + unread(c).length, 0);
      toggleBtn.replaceChildren(
        document.createTextNode((S.on ? "hide comments" : open ? `comments \xB7 ${open}` : "comments") + (!S.on && fresh ? ` \xB7 ${fresh} new` : "")),
        el2("kbd", { "aria-hidden": "true" }, "m")
      );
      toggleBtn.classList.toggle("secondary", S.on);
      host2.toggleAttribute("data-sheet", Boolean(S.on && (S.draft || S.openId || S.listOpen || S.chatOpen)));
      document.documentElement.classList.toggle("lab-sheet", host2.hasAttribute("data-sheet"));
      backCloses();
      S.refit();
      document.documentElement.classList.toggle("lab-pinning", S.on && !S.cursorMode);
      document.documentElement.classList.toggle("lab-go", S.on && S.goMode && !S.cursorMode);
      copyBtn.hidden = !S.on || !S.isAdmin || list.every((c) => c.resolved);
      drawList();
      drawChat();
      if (!S.on) return done();
      for (const h of held()) {
        const { left, top } = position(h.anchor);
        const p = el2("div", { class: "pin held", title: `${h.name}: ${h.text} \xB7 draft, not sent yet` }, initial(h.name));
        p.style.left = `${left}px`;
        p.style.top = `${top}px`;
        layer2.append(p);
      }
      list.forEach((c) => {
        if (isPage(c)) return;
        if (!S.showDone && S.openId !== c.id && (c.resolved || workState(c)[0] === "done") && !unread(c).length) return;
        const { left, top, moved, zone } = places.get(c.id) || position(c.anchor || {});
        if (S.openId === c.id) drawZone(zone, `saved${anim}`);
        const news = unread(c);
        const movable = !zone && (S.isAdmin || store2.get(`lab-edit:${c.id}`));
        const [state] = workState(c);
        const pin = el2(
          "button",
          {
            class: `pin${/^go$/i.test(c.text.trim()) ? " go" : ""}${c.resolved ? " resolved" : ""}${state === "done" ? " done" : ""}${state === "now" ? " working" : ""}${news.length ? " new" : ""}${moved ? " moved" : ""}${S.posted === c.id ? " in" : ""}${movable ? " grab" : ""}${S.openId === c.id ? " open" : ""}`,
            type: "button",
            title: `${c.resolved ? "" : `${numberOf(c)} \xB7 `}${c.name}${moved ? " \xB7 the spot it was pinned to has changed" : ""}${movable ? " \xB7 drag to move" : ""}`,
            // Its state in words too (the ring, the tick and the new dot are only seen).
            "aria-label": `${/^go$/i.test(c.text.trim()) ? "go" : "comment"}${c.resolved ? "" : ` ${numberOf(c)}`} by ${c.name}${state === "now" ? ", agent working on it" : state === "done" || c.resolved ? ", done" : ""}${news.length ? `, ${news.length} new` : ""}${moved ? ", moved" : ""}`
          },
          /^go$/i.test(c.text.trim()) ? "go" : state === "done" || c.resolved ? "\u2713" : initial(c.name)
        );
        if (state === "now") pin.append(el2("i", { class: "ring", "aria-hidden": "true" }));
        pin.style.left = `${left}px`;
        pin.style.top = `${top}px`;
        if (movable) grab(pin, c);
        if (!coarse && zone && S.openId !== c.id) {
          let shown = null;
          pin.addEventListener("pointerenter", () => shown = drawZone(zone, "saved"));
          pin.addEventListener("pointerleave", () => (shown?.remove(), shown = null));
        } else if (!coarse && c.anchor?.quote && !zone) {
          pin.addEventListener("pointerenter", () => markQuote(c.anchor));
          pin.addEventListener("pointerleave", () => markQuote(quoted));
        }
        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          if (pin.dataset.dragged) return;
          if (coarse && S.openId !== c.id) return goTo(c);
          S.openId = S.openId === c.id ? null : c.id;
          S.draft = null;
          render();
        });
        layer2.append(pin);
        pinsById.set(c.id, pin);
        if (S.openId === c.id) {
          const card = threadCard(c, new Set(news.map((x) => x.id)), appear && (coarse ? S.keepKeys : !S.stepping || S.keepKeys));
          S.openCard = card;
          if (appear && !S.stepping) card.classList.add("in");
          if (prevHeight) card.style.minHeight = `min(${prevHeight}px, var(--_sheet-max))`;
          S.stepping = S.keepKeys = false;
          placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top);
          if (!appear && prevScroll != null) card.querySelector(".body").scrollTop = prevScroll;
          else if (appear) {
            const body = card.querySelector(".body");
            const first = coarse ? null : body.querySelector(".fresh, .newline");
            body.scrollTop = first ? first.offsetTop - body.offsetTop - 8 : body.scrollHeight;
          }
          if (coarse && S.cardFull) card.classList.add("full");
          swipeDown(card, () => (S.openId = null, S.cardFull = false, render()), true);
          markSeen(news);
          if (news.length) drawList();
          quoted = zone ? null : c.anchor;
        }
      });
      if (S.draft) {
        const { anchor } = S.draft;
        const { left, top, zone } = position(anchor);
        drawZone(zone, "draft");
        quoted = zone ? null : anchor;
        const pin = el2("div", { class: `pin draft${anim}` }, initial(store2.get("lab-name")));
        pin.style.left = `${left}px`;
        pin.style.top = `${top}px`;
        layer2.append(pin);
        const float = el2("div", { class: `float${anim}` });
        float.append(
          el2("div", { class: "handle" }),
          composer({
            placeholder: "add a comment",
            autofocus: true,
            onSubmit: async (name, text) => {
              if (drafting()) {
                store2.set(heldKey(), JSON.stringify([...held(), { name, text, anchor }]));
                S.draft = null;
                return render();
              }
              const { comment, edit } = await send({ name, text, anchor });
              if (edit) store2.set(`lab-edit:${comment.id}`, edit);
              S.comments.push(comment);
              markSeen([comment]);
              S.draft = null;
              S.openId = null;
              S.posted = comment.id;
              render();
            }
          })
        );
        swipeDown(float, () => (S.draft = null, render()));
        if (zone) placeCard(float, left + 14, zone.top + zone.height);
        else placeBeside(float, left, top);
      }
      done();
    }
    S.grabbing = false;
    S.openCard = null;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const showHint = () => {
      if (store2.get("lab-hint-seen") === "1") return;
      hint.hidden = false;
      store2.set("lab-hint-seen", "1");
      setTimeout(() => hint.hidden = true, 5e3);
    };
    const setOn = (value) => {
      S.on = value;
      if (!S.on) ptr.classList.remove("show");
      else recheck();
      store2.set("lab-on", S.on ? "1" : "0");
      if (S.on) showHint();
      S.draft = null;
      S.openId = null;
      render();
    };
    toggleBtn.addEventListener("click", () => setOn(!S.on));
    function setMenu(open, refocus = false) {
      moreMenu.hidden = !open;
      moreBtn.setAttribute("aria-expanded", String(open));
      if (open) [...moreMenu.querySelectorAll("button")].find((b) => !b.hidden && !b.disabled)?.focus({ preventScroll: true });
      else if (refocus) moreBtn.focus({ preventScroll: true });
    }
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu(moreMenu.hidden);
    });
    moreMenu.addEventListener("click", () => setTimeout(() => setMenu(false, true), 0));
    addEventListener("pointerdown", (e) => {
      if (!moreMenu.hidden && !e.composedPath().some((n) => n === moreMenu || n === moreBtn)) setMenu(false);
    }, true);
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !moreMenu.hidden) {
        setMenu(false, true);
        e.stopPropagation();
      }
    }, true);
    goBtn.addEventListener("click", () => setGo(!S.goMode));
    newPrev.addEventListener("click", () => stepNew(-1));
    doneBtn.addEventListener("click", () => showDoneBtn.click());
    showDoneBtn.addEventListener("click", () => {
      S.showDone = !S.showDone;
      store2.set("lab-show-done", S.showDone ? "1" : "");
      render();
    });
    newNext.addEventListener("click", () => stepNew(1));
    const showAgain = () => {
      if (S.on) return;
      S.on = true;
      store2.set("lab-on", "1");
    };
    copyBtn.addEventListener("click", () => copy(agentLink(), copyBtn));
    listBtn.addEventListener("click", () => LIST_WINDOW ? (S.listOpen = !S.listOpen, S.listOpen && (S.filter = "new"), S.chatOpen = false, hint.hidden = true, render()) : stepNew(1));
    listEl.querySelector(".x").addEventListener("click", () => slideAway(listEl, () => (S.listOpen = false, render())));
    chatBtn.addEventListener("click", () => {
      S.chatOpen = !S.chatOpen;
      S.listOpen = false;
      if (S.chatOpen && !coarse) {
        S.openId = null;
        if (S.draft && !/** @type {HTMLTextAreaElement | null} */
        root.querySelector(".float textarea")?.value.trim()) S.draft = null;
      }
      hint.hidden = true;
      render();
      if (S.chatOpen && !coarse) chatEl.querySelector(".chat textarea")?.focus({ preventScroll: true });
    });
    S.closingClick = false;
    document.addEventListener("pointerdown", (e) => {
      S.closingClick = false;
      if (coarse || !S.chatOpen || e.button !== 0) return;
      const path = e.composedPath();
      if (path.includes(chatEl) || path.includes(chatBtn)) return;
      S.chatOpen = false;
      if (path.includes(host2)) return void addEventListener("click", () => render(), { once: true });
      S.closingClick = true;
      render();
    }, true);
    addEventListener("click", (e) => {
      if (!S.closingClick) return;
      S.closingClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    for (
      const b of
      /** @type {NodeListOf<HTMLElement>} */
      listEl.querySelectorAll("[data-f]")
    ) b.addEventListener("click", () => (S.filter = b.dataset.f, drawList()));
    holdBtn.addEventListener("click", () => (store2.set("lab-hold", drafting() ? "" : "1"), drawList()));
    sendBtn.addEventListener("click", async () => {
      const list = held();
      for (let i = 0; i < list.length; i++) {
        try {
          const { comment, edit } = await send(list[i]);
          if (edit) store2.set(`lab-edit:${comment.id}`, edit);
          S.comments.push(comment);
          markSeen([comment]);
          store2.set(heldKey(), JSON.stringify(list.slice(i + 1)));
        } catch {
          sendBtn.textContent = "send failed, try again";
          return;
        }
      }
      render();
    });
    const typing = (e) => e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
    document.addEventListener("keydown", (e) => {
      if (S.gone) return;
      const inOtherWidget = document.activeElement?.localName.includes("-") && document.activeElement !== host2;
      if ((e.key === "m" || e.key === "M" || e.code === "KeyM") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
        e.preventDefault();
        setOn(!S.on);
        return;
      }
      if (S.on && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (/^z$/i.test(e.key || "") || !/^[a-z]$/i.test(e.key || "") && e.code === "KeyZ") && !typing(e) && !inOtherWidget && placed.length) {
        e.preventDefault();
        return void undoLast();
      }
      if (S.on && e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyD" && !(typing(e) && !e.composedPath().includes(host2))) {
        e.preventDefault();
        const typed2 = (
          /** @type {HTMLTextAreaElement | null} */
          root.querySelector(".card textarea, .float textarea")
        );
        if (typed2?.value.trim()) return typed2.closest(".card, .float")?.animate([{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }], { duration: 260 });
        return stepNew(e.shiftKey ? -1 : 1);
      }
      if (S.on && /^(Digit|Numpad)[123]$/.test(e.code || "") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
        e.preventDefault();
        if (e.code.endsWith("3")) setCursor(true);
        else setGo(e.code.endsWith("2"));
        return;
      }
      const letter = /^[a-z]$/i.test(e.key || "") ? e.key.toLowerCase() : /^Key[A-Z]$/.test(e.code || "") ? e.code.slice(3).toLowerCase() : "";
      if (S.on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && /^[cwred]$/.test(letter)) {
        const k = letter;
        e.preventDefault();
        if (k === "c") return chatBtn.click();
        if (k === "w") return stepNew(e.shiftKey ? -1 : 1);
        if (k === "d") return showDoneBtn.click();
        if (k === "r" && S.openId) root.querySelector(".card textarea")?.focus({ preventScroll: true });
        else if (k === "e" && S.openId && S.isAdmin) [.../** @type {NodeListOf<HTMLElement>} */
        root.querySelectorAll(".card .btn")].find((b) => /^(resolve|reopen)$/.test(b.textContent))?.click();
        return;
      }
      if (e.key === "Escape" && (S.draft || S.openId)) {
        S.draft = null;
        S.openId = null;
        render();
      } else if (e.key === "Escape" && (S.chatOpen || S.listOpen)) {
        if (S.chatOpen) S.chatOpen = false;
        else S.listOpen = false;
        render();
      }
    });
    const INTERACTIVE = 'a, button, input, textarea, select, label, summary, video[controls], audio, iframe, [contenteditable], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"]), [onclick]';
    const OFF = "[data-uncommentable]";
    S.drag = null;
    S.afterDrag = false;
    S.liveZone = null;
    S.zoneFrame = 0;
    const paintZone = () => {
      S.zoneFrame = 0;
      if (!S.drag?.active || !S.liveZone) return;
      const x = Math.min(S.drag.x0, S.drag.x1) + scrollX;
      const y = Math.min(S.drag.y0, S.drag.y1) + scrollY;
      S.liveZone.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      S.liveZone.style.width = `${Math.abs(S.drag.x1 - S.drag.x0)}px`;
      S.liveZone.style.height = `${Math.abs(S.drag.y1 - S.drag.y0)}px`;
    };
    const draftHasText = () => Boolean(S.draft) && [.../** @type {NodeListOf<HTMLTextAreaElement>} */
    root.querySelectorAll(".float textarea")].some((t) => t.value.trim());
    function startDrag(e) {
      if (!S.on && !e.altKey || S.cursorMode && !e.altKey || draftHasText() || e.button !== 0 || e.pointerType === "touch" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.composedPath().includes(host2)) return;
      if (!e.altKey && e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      if (e.target instanceof Element && e.target.closest(OFF)) return;
      S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
    }
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.altKey) return;
        if (!S.on && !e.altKey || S.cursorMode && !e.altKey || draftHasText() || e.button !== 0 || e.pointerType === "touch" || e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.composedPath().includes(host2)) return;
        if (!e.altKey && e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
        if (e.target instanceof Element && e.target.closest(OFF)) return;
        S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
      },
      true
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!S.drag) return;
        S.drag.x1 = e.clientX;
        S.drag.y1 = e.clientY;
        if (!S.drag.active && Math.hypot(S.drag.x1 - S.drag.x0, S.drag.y1 - S.drag.y0) > 8) {
          S.drag.active = true;
          getSelection?.()?.removeAllRanges();
          document.documentElement.classList.add("lab-dragging");
          S.liveZone = zoneEl("draft live");
          layer2.append(S.liveZone);
        }
        if (!S.drag.active) return;
        e.preventDefault();
        S.zoneFrame ||= requestAnimationFrame(paintZone);
      },
      true
    );
    const endDrag = (e) => {
      if (!S.drag) return;
      const d3 = S.drag;
      S.drag = null;
      document.documentElement.classList.remove("lab-dragging");
      cancelAnimationFrame(S.zoneFrame);
      S.zoneFrame = 0;
      S.liveZone?.remove();
      S.liveZone = null;
      if (!d3.active || e.type === "pointercancel") return;
      S.afterDrag = true;
      setTimeout(() => S.afterDrag = false, 0);
      getSelection?.()?.removeAllRanges();
      for (const [a, b] of [["x0", "x1"], ["y0", "y1"]]) {
        if (Math.abs(d3[b] - d3[a]) >= 12) continue;
        const mid = (d3[a] + d3[b]) / 2;
        d3[a] = mid - 6;
        d3[b] = mid + 6;
      }
      showAgain();
      S.openId = null;
      begin(zoneAnchor(d3));
    };
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    document.addEventListener(
      "dragstart",
      (e) => {
        const media = S.on && e.target instanceof Element && e.target.closest("img, video") && !e.composedPath().includes(host2);
        if (S.drag || media) e.preventDefault();
      },
      true
    );
    document.addEventListener(
      "click",
      (e) => {
        if (!S.afterDrag) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    const optionPress = (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.button === 0 && !e.composedPath().includes(host2) && !(e.target instanceof Element && e.target.closest(OFF));
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      addEventListener(type, (e) => {
        if (!optionPress(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (type === "pointerdown") startDrag(e);
        if (type === "pointerup") endDrag(e);
      }, true);
    }
    addEventListener("click", (e) => {
      if (!optionPress(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!S.afterDrag) onPageClick(e);
    }, true);
    document.addEventListener("click", (e) => onPageClick(e));
    S.lastTouch = 0;
    S.pinnedByHold = false;
    const selChip = (
      /** @type {HTMLElement} */
      root.querySelector(".sel-chip")
    );
    const scrim = (
      /** @type {HTMLElement} */
      root.querySelector(".scrim")
    );
    const openSheet = () => root.querySelector(".card:not(.out), .float:not(.out)") || (S.listOpen ? listEl : S.chatOpen ? chatEl : null);
    const closeAll = () => {
      S.draft = null;
      S.openId = null;
      S.listOpen = false;
      S.chatOpen = false;
      render();
    };
    const closeOrNudge = () => {
      const node = openSheet();
      if (![...root.querySelectorAll("textarea")].some((t) => t.value.trim() && !chatEl.contains(t))) return slideAway(node, closeAll);
      node?.animate?.([{ transform: "none" }, { transform: "translateY(12px)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
    };
    S.sheetDraggedAt = -1e9;
    scrim.addEventListener("click", () => performance.now() - S.sheetDraggedAt > 300 && closeOrNudge());
    scrim.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    S.backWatcher = null;
    const vv = window.visualViewport;
    startSheets();
    const msgsEl = $(".msgs", chatEl);
    S.stick = true;
    msgsEl.addEventListener("scroll", () => S.stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 48, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(() => S.stick && (msgsEl.scrollTop = msgsEl.scrollHeight)).observe(msgsEl);
    swipeDown(listEl, () => (S.listOpen = false, render()));
    swipeDown(chatEl, () => (S.chatOpen = false, render()), true);
    S.press = null;
    const stopPress = () => S.press && (clearTimeout(S.press.timer), S.press = null);
    document.addEventListener(
      "pointerdown",
      (e) => {
        stopPress();
        S.pinnedByHold = false;
        if (e.pointerType === "touch") S.lastTouch = Date.now();
        if (e.pointerType !== "touch" || S.draft || !(e.target instanceof Element) || e.composedPath().includes(host2) || e.target.closest(OFF)) return;
        const { clientX: x, clientY: y } = e;
        S.press = {
          x,
          y,
          timer: setTimeout(() => {
            S.press = null;
            S.pinnedByHold = true;
            navigator.vibrate?.(8);
            getSelection?.()?.removeAllRanges();
            S.afterDrag = true;
            setTimeout(() => S.afterDrag = false, 800);
            showAgain();
            S.openId = null;
            begin(anchorAt(x, y));
          }, 500)
        };
      },
      true
    );
    document.addEventListener("pointermove", (e) => S.press && Math.hypot(e.clientX - S.press.x, e.clientY - S.press.y) > 10 && stopPress(), true);
    document.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") S.lastTouch = Date.now();
      stopPress();
      if (S.pinnedByHold) root.querySelector(".float textarea")?.focus({ preventScroll: true });
    }, true);
    document.addEventListener("touchend", (e) => {
      if (!S.pinnedByHold) return;
      S.pinnedByHold = false;
      e.preventDefault();
      root.querySelector(".float textarea")?.focus({ preventScroll: true });
    }, { capture: true, passive: false });
    document.addEventListener("pointercancel", stopPress, true);
    addEventListener("scroll", stopPress, { passive: true, capture: true });
    document.addEventListener("contextmenu", (e) => (S.press || S.afterDrag) && e.preventDefault(), true);
    S.selRect = null;
    document.addEventListener("selectionchange", () => {
      const sel = getSelection?.();
      const range = sel?.rangeCount && sel.getRangeAt(0);
      const text = String(sel || "").trim();
      const inside = range && host2.contains(range.commonAncestorContainer);
      S.selRect = coarse && S.on && !S.draft && text && range && !inside ? range.getClientRects()[0] || range.getBoundingClientRect() : null;
      selChip.hidden = !S.selRect;
      if (!S.selRect) return;
      const below = S.selRect.bottom + 52 < innerHeight;
      selChip.style.left = `${Math.min(Math.max(S.selRect.left + S.selRect.width / 2, 60), innerWidth - 60)}px`;
      selChip.style.top = `${below ? S.selRect.bottom + 10 : Math.max(S.selRect.top - 46, 8)}px`;
    });
    const commentOnSelection = () => {
      const sel = getSelection?.();
      const range = sel?.rangeCount && sel.getRangeAt(0);
      const exact = String(sel || "").replace(/\s+/g, " ").trim();
      if (!range || !exact || host2.contains(range.commonAncestorContainer)) return false;
      const rects = range.getClientRects();
      const first = rects[0] || range.getBoundingClientRect();
      const last = rects[rects.length - 1] || first;
      const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
      const anchor = startEl && (startEl === endEl || startEl.contains(endEl)) ? anchorAt(Math.max(last.left, last.right - 2), last.top + last.height / 2) : anchorAt(first.left + 2, first.top + first.height / 2);
      const at = range.commonAncestorContainer;
      const block = (
        /** @type {Element | null} */
        (at.nodeType === 1 ? at : at.parentElement)?.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, pre, section, article, div") || document.body
      );
      const side = (a, b) => {
        const r = document.createRange();
        r.setStart(...a);
        r.setEnd(...b);
        return String(r).replace(/\s+/g, " ");
      };
      anchor.kind = "text";
      anchor.quote = {
        exact: short(exact, 300),
        prefix: side([block, 0], [range.startContainer, range.startOffset]).replace(/^\s+/, "").slice(-40),
        suffix: side([range.endContainer, range.endOffset], [block, block.childNodes.length]).replace(/\s+$/, "").slice(0, 40)
      };
      sel.removeAllRanges();
      selChip.hidden = true;
      showAgain();
      S.openId = null;
      begin(anchor);
      return true;
    };
    selChip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (S.selRect) commentOnSelection();
    });
    document.addEventListener("mouseup", (e) => {
      if (S.on && !S.cursorMode && !S.draft && e.shiftKey && e.button === 0 && !e.composedPath().includes(host2)) setTimeout(commentOnSelection, 0);
    }, true);
    function onPageClick(e) {
      if (e.composedPath().includes(host2)) return;
      if (S.draft || S.openId) {
        if ([...root.querySelectorAll("textarea")].some((t) => t.value.trim())) return;
        S.draft = null;
        S.openId = null;
        render();
        return;
      }
      if (!S.on && !e.altKey || S.cursorMode && !e.altKey || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (S.lastTouch && Date.now() - S.lastTouch < 800) return;
      if (e.altKey) e.preventDefault();
      else if (e.defaultPrevented || e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      if (e.target instanceof Element && e.target.closest(OFF)) return;
      if (String(getSelection?.() || "").trim()) return;
      showAgain();
      begin(anchorAt(e.clientX, e.clientY));
    }
    const movePins = () => {
      const list = threads().filter((c) => c.anchor?.kind !== "page");
      if (!S.on || S.openId || list.length !== pinsById.size) return render();
      const places = list.map((c) => [pinsById.get(c.id), position(c.anchor || {})]);
      if (places.some(([pin]) => !pin)) return render();
      for (const [pin, { left, top, moved }] of places) {
        pin.style.left = `${left}px`;
        pin.style.top = `${top}px`;
        pin.classList.toggle("moved", Boolean(moved));
      }
    };
    S.frame = 0;
    const reflow = () => {
      cancelAnimationFrame(S.frame);
      S.frame = requestAnimationFrame(() => {
        if (S.draft || root.activeElement || S.grabbing) return;
        movePins();
      });
    };
    addEventListener("resize", reflow);
    addEventListener("scroll", (e) => e.target !== document && !host2.contains(
      /** @type {Node} */
      e.target
    ) && reflow(), { capture: true, passive: true });
    const navigated = () => {
      if (S.gone) return;
      if (!host2.isConnected && document.body) document.body.append(host2);
      if (!fonts.isConnected) document.head.append(fonts);
      if (!pinCursorStyle.isConnected) document.head.append(pinCursorStyle);
      if (pageNow() === S.page) return;
      S.page = pageNow();
      S.seen = readSeen();
      syncReads();
      S.comments = [];
      S.draft = null;
      S.openId = null;
      render();
      load();
    };
    for (const m of ["pushState", "replaceState"]) {
      const original = history[m];
      history[m] = function(...args) {
        const out = original.apply(this, args);
        queueMicrotask(navigated);
        return out;
      };
    }
    addEventListener("popstate", navigated);
    document.addEventListener("astro:after-swap", navigated);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !S.draft && !root.activeElement) load();
    });
    if ("ResizeObserver" in window) new ResizeObserver(reflow).observe(document.body);
    const fonts = document.createElement("style");
    if (script?.dataset.fontUrl)
      fonts.textContent = `@font-face{font-family:'lab comments';font-display:swap;src:url('${new URL(script.dataset.fontUrl, script.src || location.href)}') format('woff2');}`;
    const fontName = script?.dataset.fontUrl ? "lab comments" : script?.dataset.font;
    if (fontName) host2.style.setProperty("--lab-font", `'${fontName.replace(/'/g, "")}', system-ui, sans-serif`);
    const pinCursorStyle = document.createElement("style");
    const ptr = el2("div", { class: "ptr", "aria-hidden": "true" });
    ptr.append(el2("span", { class: "ini" }, "+"), el2("span", { class: "tick" }, "go"));
    root.append(ptr);
    S.mouse = null;
    const place = (x, y, target) => {
      const show = Boolean(target) && target !== host2 && !host2.contains(target) && getComputedStyle(target).cursor === "none";
      ptr.classList.toggle("show", show);
      ptr.classList.toggle("go", S.goMode);
      ptr.style.transform = `translate(${x - 1}px, ${y - 27}px)`;
    };
    const recheck = () => S.mouse && requestAnimationFrame(() => S.mouse && place(S.mouse.x, S.mouse.y, document.elementFromPoint(S.mouse.x, S.mouse.y)));
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      document.documentElement.classList.add("lab-drawn");
      S.mouse = { x: e.clientX, y: e.clientY };
      const t = e.composedPath()[0];
      place(e.clientX, e.clientY, t instanceof Element ? t : null);
    }, { capture: true, passive: true });
    addEventListener("scroll", recheck, { capture: true, passive: true });
    addEventListener("keydown", (e) => (e.key === "Shift" || e.key === "Alt") && recheck(), true);
    addEventListener("keyup", (e) => (e.key === "Shift" || e.key === "Alt") && recheck(), true);
    document.documentElement.addEventListener("mouseleave", () => (S.mouse = null, ptr.classList.remove("show")));
    addEventListener("blur", () => (S.mouse = null, ptr.classList.remove("show")));
    S.cursorKey = "";
    function refreshPinCursor() {
      const ch = (initial(store2.get("lab-name")) || "+").replace(/[<>&'"]/g, "");
      if (ch === S.cursorKey) return;
      S.cursorKey = ch;
      ptr.querySelector(".ini").textContent = ch;
      const plain2 = `:not(${INTERACTIVE}, a *, button *, label *, [role="button"] *, [contenteditable], [contenteditable] *, ${OFF}, ${OFF} *, [data-lab-comments])`;
      const top = `dialog, dialog *, [popover], [popover] *, :fullscreen, :fullscreen *`;
      pinCursorStyle.textContent = `@layer lab-pointer { html.lab-pinning:not(.lab-shift) body, html.lab-pinning:not(.lab-shift) body *${plain2} { cursor: crosshair; } html.lab-drawn.lab-pinning:not(.lab-shift):not(.lab-dragging) body, html.lab-drawn.lab-pinning:not(.lab-shift):not(.lab-dragging) body *${plain2}:not(${top}) { cursor: none; } html.lab-pinning body :is([contenteditable], [contenteditable] *) { cursor: text; } html.lab-pinning body :is(${OFF}, ${OFF} *) { cursor: auto; } }html.lab-alt body, html.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *) { cursor: crosshair !important; }html.lab-drawn.lab-alt body, html.lab-drawn.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *, ${top}) { cursor: none !important; }html.lab-go:not(.lab-drawn) body, html.lab-go:not(.lab-drawn) body * { cursor: copy !important; }`;
    }
    fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
    S.shiftOff = 0;
    const shiftKey = (e) => {
      clearTimeout(S.shiftOff);
      if (e.shiftKey) document.documentElement.classList.add("lab-shift");
      else S.shiftOff = setTimeout(() => (document.documentElement.classList.remove("lab-shift"), recheck()), 400);
    };
    addEventListener("keydown", shiftKey, true);
    addEventListener("keyup", shiftKey, true);
    addEventListener("pointerdown", (e) => {
      if (e.shiftKey) return shiftKey(e);
      clearTimeout(S.shiftOff);
      document.documentElement.classList.remove("lab-shift");
    }, true);
    addEventListener("blur", () => document.documentElement.classList.remove("lab-shift"));
    fonts.textContent += "html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }";
    fonts.textContent += "html.lab-sheet, html.lab-sheet body { overscroll-behavior-y: none; }";
    fonts.textContent += "html.lab-room body::after { content: ''; display: block; height: var(--lab-room, 0px); }";
    addEventListener("scroll", () => {
      const de = document.documentElement;
      const had = parseFloat(de.style.getPropertyValue("--lab-room")) || 0;
      if (!had || host2.hasAttribute("data-sheet")) return;
      const room = Math.max(0, Math.ceil(scrollY + innerHeight - (de.scrollHeight - had)));
      if (room >= had) return;
      de.style.setProperty("--lab-room", `${room}px`);
      if (!room) de.classList.remove("lab-room");
    }, { passive: true });
    fonts.textContent += "@media (pointer: coarse) { html.lab-sheet, html.lab-sheet body { overflow: hidden; } }";
    fonts.textContent += `html.lab-pinning body, html.lab-pinning body * { -webkit-touch-callout: none; }`;
    fonts.textContent += `@media (pointer: coarse) { html.lab-pinning body > :not([data-lab-comments]) { -webkit-user-select: none; user-select: none; } html.lab-pinning body > :not([data-lab-comments]), html.lab-pinning body > :not([data-lab-comments]) * { -webkit-user-drag: none; } }`;
    const setAlt = (down) => document.documentElement.classList.toggle("lab-alt", Boolean(down));
    addEventListener("keydown", (e) => e.key === "Alt" && setAlt(true), true);
    addEventListener("keyup", (e) => e.key === "Alt" && setAlt(false), true);
    addEventListener("pointermove", (e) => setAlt(e.altKey), { capture: true, passive: true });
    addEventListener("blur", () => setAlt(false));
    const start = () => {
      document.head.append(fonts, pinCursorStyle);
      refreshPinCursor();
      if (S.on) showHint();
      document.body.append(host2);
      const paint = "background-color: rgba(52, 199, 89, .3); color: inherit;";
      fonts.textContent += `html.lab-pinning ::selection { ${paint} } ::highlight(lab-quote) { ${paint} }`;
      load();
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
    startLive();
  })();
})();
