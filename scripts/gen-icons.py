#!/usr/bin/env python3
"""
Generate all PWA icons for GeoXam (all 4 variants × 8 sizes = 32 PNG files).
Run from repo root: python3 scripts/gen-icons.py
Requires: pip install Pillow
"""
from PIL import Image, ImageDraw
import os, sys

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUT   = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

def draw_real(size):
    img = Image.new('RGBA', (size, size), '#0a0a0a')
    d = ImageDraw.Draw(img)
    c, r = size // 2, int(size * 0.32)
    lw = max(2, size // 40)
    gap = size // 10
    d.ellipse([c-r, c-r, c+r, c+r], outline='#ff3b30', width=lw)
    d.rectangle([c-r+lw, c-lw//2, c-gap, c+lw//2], fill='#ff3b30')
    d.rectangle([c+gap,  c-lw//2, c+r-lw, c+lw//2], fill='#ff3b30')
    d.rectangle([c-lw//2, c-r+lw, c+lw//2, c-gap], fill='#ff3b30')
    d.rectangle([c-lw//2, c+gap,  c+lw//2, c+r-lw], fill='#ff3b30')
    dot = max(3, size // 30)
    d.ellipse([c-dot, c-dot, c+dot, c+dot], fill='#ffffff')
    return img

def draw_calculator(size):
    img = Image.new('RGBA', (size, size), '#1c1c1e')
    d = ImageDraw.Draw(img)
    pad = size // 8
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=size//8, fill='#2c2c2e')
    dp, dh = size // 6, size // 6
    d.rounded_rectangle([dp, dp, size-dp, dp+dh], radius=size//20, fill='#3a3a3c')
    dot = size // 18
    for x in [size//3, size//2, 2*size//3]:
        d.ellipse([x-dot, dp+dh//2-dot, x+dot, dp+dh//2+dot], fill='#ffffff')
    cols, rows = 4, 3
    bpad = size // 16
    btn_top = dp + dh + bpad
    bw = (size - 2*dp - (cols-1)*bpad) // cols
    bh = (size - pad - btn_top - (rows-1)*bpad) // rows
    colors = ['#a5a5a5','#a5a5a5','#a5a5a5','#ff9f0a',
              '#333333','#333333','#333333','#ff9f0a',
              '#333333','#333333','#333333','#ff9f0a']
    for i in range(rows):
        for j in range(cols):
            x0 = dp + j*(bw+bpad)
            y0 = btn_top + i*(bh+bpad)
            d.rounded_rectangle([x0, y0, x0+bw, y0+bh], radius=bw//3, fill=colors[i*cols+j])
    return img

def draw_calendar(size):
    img = Image.new('RGBA', (size, size), '#ffffff')
    d = ImageDraw.Draw(img)
    pad, r = size // 12, size // 10
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=r, fill='#f2f2f7')
    hh = size // 5
    d.rounded_rectangle([pad, pad, size-pad, pad+hh], radius=r, fill='#ff3b30')
    dc, dot = size // 2, max(3, size // 36)
    for x in [dc - size//10, dc, dc + size//10]:
        d.ellipse([x-dot, pad+hh//2-dot, x+dot, pad+hh//2+dot], fill='rgba(255,255,255,200)')
    gt = pad + hh + size // 12
    cs = (size - 2*pad) // 4
    for row in range(3):
        for col in range(3):
            cx = pad + cs//2 + col*cs + cs//2
            cy = gt + row*cs + cs//2
            dot2 = max(2, size // 48)
            fill = '#ff3b30' if row == 0 and col == 0 else '#666666'
            d.ellipse([cx-dot2, cy-dot2, cx+dot2, cy+dot2], fill=fill)
    return img

def draw_notepad(size):
    img = Image.new('RGBA', (size, size), '#fffde7')
    d = ImageDraw.Draw(img)
    pad, lw = size // 10, max(1, size // 80)
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=size//12, fill='#fff8e1')
    dot = max(2, size // 40)
    for i in range(4):
        cy = pad + (size - 2*pad) // 5 * (i+1)
        d.ellipse([pad+dot, cy-dot, pad+dot*3, cy+dot], fill='#90a4ae')
    left = pad + dot*5
    ls = pad + (size - 2*pad) // 5
    sp = (size - 2*pad - (size-2*pad)//5) // 5
    for i in range(5):
        y = ls + i * sp
        d.rectangle([left, y, size - pad*1.5, y + lw], fill='#b0bec5')
    return img

generators = {
    'real': draw_real, 'calculator': draw_calculator,
    'calendar': draw_calendar, 'notepad': draw_notepad,
}

for variant, fn in generators.items():
    for size in SIZES:
        path = os.path.join(OUT, f'icon-{variant}-{size}.png')
        fn(size).save(path, 'PNG')
        print(f'  {path}')

print('\nAll icons generated.')
