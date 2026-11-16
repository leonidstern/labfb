#!/usr/bin/env python3
"""Draws SVG files and says how different they look.

  python3 render.py out.json a.svg b.svg c.svg

Each file is drawn at 256 px with macOS Quick Look (qlmanage) and read with Pillow. A pixel counts as ink when it is
darker than light grey on white. out.json gets, per file, the share of the picture that is ink, and for every pair
how different they look: the ink that only one of the two has, over the ink either has (0 = the same picture).
"""
import json, os, subprocess, sys, tempfile
from PIL import Image

def mask(svg, tmp):
    subprocess.run(['qlmanage', '-t', '-s', '256', '-o', tmp, svg], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
    png = os.path.join(tmp, os.path.basename(svg) + '.png')
    if not os.path.exists(png):
        return None
    im = Image.open(png).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    grey = Image.alpha_composite(bg, im).convert('L')
    return [p < 200 for p in grey.tobytes()]

out, files = sys.argv[1], sys.argv[2:]
with tempfile.TemporaryDirectory() as tmp:
    masks = [mask(f, tmp) for f in files]
ink = [None if m is None else sum(m) / len(m) for m in masks]
def diff(a, b):
    if a is None or b is None:
        return None
    union = sum(1 for x, y in zip(a, b) if x or y)
    return 0.0 if not union else sum(1 for x, y in zip(a, b) if x != y) / union
json.dump({'ink': ink, 'diff': [[diff(a, b) for b in masks] for a in masks]}, open(out, 'w'))
