# Generate the app icons (dev-only; needs Pillow). Run: python scripts/icons.py
# The design keeps everything inside the central 60% so it also works as a maskable icon.
from PIL import Image, ImageDraw, ImageFont
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for size in (192, 512):
    img = Image.new('RGB', (size, size), '#111111')
    d = ImageDraw.Draw(img)
    r = size * 0.30
    c = size / 2
    d.ellipse((c - r, c - r, c + r, c + r), fill='#e5484d')
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', int(size * 0.22))
    d.text((c, c), 'QB', fill='#ffffff', font=font, anchor='mm')
    img.save(os.path.join(root, 'icons', f'icon-{size}.png'))
print('icons written')
