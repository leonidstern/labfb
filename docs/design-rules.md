# Design rules

Rules every change to the widget and the lab pages follows. Check them before a PR.

## Corners are concentric

A rounded box inside another rounded box takes the outer radius minus the gap between them, so both curves share one centre:

```css
inner { border-radius: max(0px, calc(var(--_radius) - <gap>)); }
```

- Write it from the token (`--_radius`, `--_card-r`), never a fixed number, so it stays right when `--lab-radius` or the squircle radius changes.
- No inline `border-radius` from script on a box whose children follow it: the stylesheet owns the outer corner.
- A circle (send, dots) stays a circle.

(Leo, 18 Nov: "rounded corners inside and outside different", then "make it as rule for us".)
